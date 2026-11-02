import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function scanPublicReuse(registry, request, {searchDelayMs = 0} = {}) {
  const findings = [], errors = [], skipped = [], seen = new Set();
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let searches = 0;
  const sources = registry.sources || [];
  const add = entry => { if (!seen.has(entry.url)) {seen.add(entry.url); findings.push(entry);} };
  const allowedUrl = value => { try { const u = new URL(value); return u.protocol === 'https:' && u.hostname === 'github.com'; } catch { return false; } };
  for (const source of sources) {
    try {
      for (let page = 1; page <= 3; page++) {
        const list = await request('/repos/' + source.repository + '/forks?per_page=100&page=' + page);
        if (!Array.isArray(list)) throw new Error('Unexpected forks response');
        for (const repo of list) if (repo.private === false && repo.owner?.login?.toLowerCase() !== 'favorhumanity' && allowedUrl(repo.html_url)) add({type:'public fork', source:source.repository, repository:repo.full_name, url:repo.html_url});
        if (list.length < 100) break;
        if (page === 3) errors.push({check:source.repository,error:'Fork list truncated after 300 entries'});
      }
    } catch (error) { errors.push({check:'forks: ' + source.repository,error:error.message}); }
  }
  const markers = [...new Set([registry.website_content_id, ...sources.map(s => s.ids?.[0])].filter(Boolean))];
  // At most seven marker searches with the current registry, below the code-search rate limit.
  for (const marker of markers) {
    try {
      if (searches++ && searchDelayMs) await sleep(searchDelayMs);
      const q = JSON.stringify(marker) + ' -user:FavorHumanity';
      const result = await request('/search/code?q=' + encodeURIComponent(q) + '&per_page=100');
      if (!Array.isArray(result.items)) throw new Error('Unexpected code-search response');
      if (result.incomplete_results || result.total_count > result.items.length) errors.push({check:marker,error:'Search results are incomplete or truncated'});
      for (const item of result.items) {
        if (item.repository?.private !== false || item.repository.owner?.login?.toLowerCase() === 'favorhumanity' || !allowedUrl(item.html_url)) continue;
        const u = new URL(item.url);
        if (u.protocol !== 'https:' || u.hostname !== 'api.github.com') continue;
        const file = await request(u.pathname + u.search);
        if (file.encoding !== 'base64' || typeof file.content !== 'string') continue;
        const text = Buffer.from(file.content.replace(/\s/g,''), 'base64').toString('utf8');
        if (text.includes(marker)) add({type:'matching public document ID',source:marker,repository:item.repository.full_name,url:item.html_url});
      }
    } catch (error) {
      if (error.rateLimited) skipped.push({check:'code search: ' + marker,reason:'skipped (rate limited)'});
      else errors.push({check:'code search: ' + marker,error:error.message});
    }
  }
  return {checked_at_utc:new Date().toISOString(),scope:'Public GitHub forks and indexed code retaining registered IDs',findings,coverage_errors:errors,skipped_rate_limited:skipped,limitations:'Private, offline, unindexed, and marker-stripped reuse may not be visible. A match is a review lead, not a finding of infringement.'};
}

async function main() {
  const registry = JSON.parse(readFileSync(new URL('./registry.json',import.meta.url),'utf8'));
  const headers = {Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10','User-Agent':'Y77FAST-Public-Content-Watch'};
  if (process.env.GITHUB_TOKEN) headers.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const MAX_RETRIES = 4, MAX_WAIT_MS = 60000;
  const request = async path => {
    for (let attempt = 0; ; attempt++) {
      const response = await fetch('https://api.github.com' + path, {headers,signal:AbortSignal.timeout(20000)});
      if (response.ok) return response.json();
      const limited = response.status === 429 || (response.status === 403 && (response.headers.get('retry-after') || response.headers.get('x-ratelimit-remaining') === '0'));
      if (!limited) throw new Error('GitHub API HTTP ' + response.status);
      if (attempt >= MAX_RETRIES) { const e = new Error('GitHub API HTTP ' + response.status + ' (rate limited)'); e.rateLimited = true; throw e; }
      let wait = 2000 * 2 ** attempt;
      const ra = Number(response.headers.get('retry-after'));
      const reset = Number(response.headers.get('x-ratelimit-reset'));
      if (ra > 0) wait = ra * 1000; else if (reset > 0) wait = Math.max(wait, reset * 1000 - Date.now() + 1000);
      await sleep(Math.min(wait, MAX_WAIT_MS));
    }
  };
  const report = await scanPublicReuse(registry,request,{searchDelayMs:3000});
  writeFileSync('y77fast-public-reuse-report.json',JSON.stringify(report,null,2) + '\n');
  const clean = value => String(value).replace(/[\r\n|<>`]/g,' ');
  let summary = '# Y77FAST public content check\n\n' + report.checked_at_utc + '\n\n';
  summary += '**Public reuse candidates: ' + report.findings.length + '. Coverage issues: ' + report.coverage_errors.length + '.**\n\n';
  for (const f of report.findings.slice(0,40)) summary += '- ' + clean(f.type) + ': <' + f.url.replace(/[<>\r\n]/g,'') + '> — ' + clean(f.source) + '\n';
  for (const e of report.coverage_errors) summary += '- Coverage issue: ' + clean(e.check) + ' — ' + clean(e.error) + '\n';
  for (const k of report.skipped_rate_limited) { summary += '- ' + clean(k.check) + ' — ' + k.reason + '\n'; console.log('::warning::' + clean(k.check) + ' ' + k.reason); }
  summary += '\n' + report.limitations + '\n';
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary);
  console.log(summary);
  if (report.coverage_errors.length) process.exitCode = 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
