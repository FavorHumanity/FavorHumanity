import { readFileSync } from 'node:fs';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(process.argv[2] || resolve(import.meta.dirname, '../dist'));
const manifest = JSON.parse(readFileSync(resolve(root, 'provenance.json'),'utf8'));
const expectedFiles = ['index.html','styles.css','script.js','favicon.svg'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function requireValid(condition, message) { if (!condition) throw new Error(message); }
requireValid(manifest.format === 'y77fast-content-provenance/v1', 'Unknown record format');
requireValid(manifest.signature.algorithm === 'Ed25519', 'Unexpected signature algorithm');
requireValid(manifest.payload.hash_algorithm === 'SHA-256', 'Unexpected hash algorithm');
requireValid(JSON.stringify(Object.keys(manifest.payload.files).sort()) === JSON.stringify([...expectedFiles].sort()), 'Unexpected file list');
const der = Buffer.from(manifest.signature.public_key_spki_base64, 'base64');
requireValid(hash(der) === manifest.signature.public_key_sha256, 'Public key fingerprint mismatch');
const key = createPublicKey({key:der,type:'spki',format:'der'});
requireValid(verify(null, Buffer.from(JSON.stringify(manifest.payload),'utf8'), key, Buffer.from(manifest.signature.value_base64,'base64')), 'Signature does not match');
for (const name of expectedFiles) requireValid(hash(readFileSync(resolve(root,name))) === manifest.payload.files[name], name + ' fingerprint mismatch');
const html = readFileSync(resolve(root,'index.html'),'utf8');
requireValid(html.includes('name="y77fast-document-id" content="' + manifest.payload.document_id + '"'), 'HTML content ID mismatch');
console.log(JSON.stringify({verified:true,document_id:manifest.payload.document_id,release_id:manifest.payload.release_id,files:expectedFiles.length}));
