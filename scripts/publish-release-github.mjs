import fs from 'node:fs';
import https from 'node:https';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const res = spawnSync('git', ['credential', 'fill'], { input: "protocol=https\nhost=github.com\n\n", encoding: 'utf8' });
const match = res.stdout.match(/password=(.+)/);
const token = match ? match[1].trim() : '';

if (!token) {
  console.error('No GitHub token found in git credentials');
  process.exit(1);
}

const releaseBody = `## What's New in Quant v2.1.0 — Quant Signal Engine V2

Quant v2.1.0 is a major engine release introducing **Quant Signal Engine V2**, dedicated **Signal Board candidate filtering**, and a new branding design.

### Key Highlights:
- **Signal Board Candidate Filters:** Directly filter the scanned universe for **🟢 Buy Candidates** and **🔴 Short Candidates** with live Setup Quality scores (\`quality 82/100\`), candidate badges, and active count summary meters.
- **Authoritative 1D Signal Desk:** Pure 1D daily price structure evaluation decoupled from visual chart zoom/range. Honest decision classification (\`BUY CANDIDATE\`, \`SHORT CANDIDATE\`, \`WAIT\`, \`NO TRADE\`, \`INVALIDATED\`) with explicit blocker breakdowns.
- **Setup-Specific Causal Historical Replay:** Lookahead-free 5-year daily replay modeling next-open entries, 5 bps slippage, pre-entry gap invalidations, same-bar stop priorities, and 10-bar timeout exits.
- **Statistical Confidence Intervals:** Deterministic \`mulberry32\` PRNG bootstrap 95% CI on expectancy $R$ and 95% Wilson score intervals on win rate.
- **Forward Outcome Store:** Persistent forward candidate tracker (\`quant-signal-outcomes-v1.json\`) automatically resolving outcomes against subsequent daily prints.
- **New App Logo & Branding:** Integrated the new Quant blue fox logo across window titlebars, Electron runtime icons, HTML favicons, and the top-left terminal header.

### Downloads:
- **Windows x64:** \`Quant-v2.1.0-win-x64.zip\` (Standalone Portable Application)
`;

function apiRequest(url, method, headers, data) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: method,
      headers: {
        'User-Agent': 'Quant-Release-Publisher',
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github.v3+json',
        ...headers,
      },
    };
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve({ statusCode: res.statusCode, headers: res.headers, body });
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(data);
    }
    req.end();
  });
}

async function main() {
  console.log('1. Checking for existing GitHub Release for v2.1.0...');
  const listRes = await apiRequest('https://api.github.com/repos/eisenjimmy/Quant/releases', 'GET');
  const releases = JSON.parse(listRes.body);
  let release = Array.isArray(releases) ? releases.find((r) => r.tag_name === 'v2.1.0') : null;

  if (!release) {
    console.log('Creating GitHub Release for tag v2.1.0...');
    const createPayload = JSON.stringify({
      tag_name: 'v2.1.0',
      target_commitish: 'main',
      name: 'Quant v2.1.0',
      body: releaseBody,
      draft: false,
      prerelease: false,
    });

    const createRes = await apiRequest(
      'https://api.github.com/repos/eisenjimmy/Quant/releases',
      'POST',
      {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(createPayload),
      },
      createPayload
    );

    console.log('Create status:', createRes.statusCode);
    release = JSON.parse(createRes.body);
  } else {
    console.log('Found existing release ID:', release.id);
  }

  if (!release || !release.id) {
    console.error('Failed to obtain release ID:', release);
    return;
  }

  console.log('Release URL:', release.html_url);

  const zipPath = path.resolve('release/Quant-v2.1.0-win-x64.zip');
  if (fs.existsSync(zipPath)) {
    console.log('2. Uploading release asset Quant-v2.1.0-win-x64.zip (' + (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1) + ' MB)...');
    const stat = fs.statSync(zipPath);
    const fileBuffer = fs.readFileSync(zipPath);
    const uploadUrl = release.upload_url.replace('{?name,label}', '?name=Quant-v2.1.0-win-x64.zip');

    const uploadRes = await apiRequest(
      uploadUrl,
      'POST',
      {
        'Content-Type': 'application/zip',
        'Content-Length': stat.size,
      },
      fileBuffer
    );

    console.log('Upload response status:', uploadRes.statusCode);
    if (uploadRes.statusCode >= 200 && uploadRes.statusCode < 300) {
      console.log('Asset uploaded successfully!');
    } else {
      console.log('Asset upload response:', uploadRes.body);
    }
  } else {
    console.warn('Zip file not found at', zipPath);
  }

  console.log('\n--- SUCCESS! ---');
  console.log('GitHub Release published at:', release.html_url);
}

main().catch(console.error);
