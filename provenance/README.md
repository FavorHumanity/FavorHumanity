# Y77FAST Content ID Record

**Website content ID:** `Y77F-WEB-779B5D10FD30`  
**Release:** `Y77F-REL-402F80E0A55E`

© 2026 Y77FAST SOFTWARE FOUNDATION. All rights reserved.

This record supports attribution, public-copy searches, and exact-file comparison for Y77FAST materials.

- [Public document-ID registry](registry.json)
- [Signed website fingerprints](website-fingerprints.json)
- [Verification script](verify.mjs)

## Check a copy

Download the website's four recorded files and save `website-fingerprints.json` beside them as `provenance.json`. Run:

```sh
node verify.mjs /absolute/path/to/downloaded-files
```

The verifier checks an Ed25519 signature and SHA-256 file fingerprints. Compare the reference record and public-key fingerprint with this repository's version history. Signing uses a per-release key; no private key is published or retained by the build script.

## Find public reuse

Search for the exact document IDs in [registry.json](registry.json). Public forks and matching text can provide leads for review. GitHub also provides aggregate views and clone counts through **Insights → Traffic**: [GitHub's traffic documentation](https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/viewing-traffic-to-a-repository).

Public checks cannot see private or offline use, identify everyone who downloads a file, or guarantee detection after markers are removed. A match is not automatically unauthorized use. These files do not add tracking beacons or phone-home behavior to the offline demos.
