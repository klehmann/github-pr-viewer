#!/usr/bin/env node
/*
 * Copyright 2026 Mindoo GmbH
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
// PR Viewer: a small local web UI for GitHub pull requests.
// Takes the token from the signed-in gh CLI and forwards GitHub API calls.
// Listens on 127.0.0.1 only; the only write call is merge.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const PORT = Number(process.env.PORT || 4777);
const HOST = '127.0.0.1';
const API = 'https://api.github.com';
const ROOT = __dirname;

let token = null;
function loadToken() {
  try {
    token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
  } catch (e) {
    token = null;
    console.error('"gh auth token" failed. Please run "gh auth login".');
  }
  return token;
}
loadToken();

const STATIC = {
  '/': ['public/index.html', 'text/html; charset=utf-8'],
  '/app.js': ['public/app.js', 'text/javascript; charset=utf-8'],
  '/app.css': ['public/app.css', 'text/css; charset=utf-8'],
  '/vendor/diff.min.js': ['node_modules/diff/dist/diff.min.js', 'text/javascript; charset=utf-8'],
  '/vendor/highlight.min.js': ['node_modules/@highlightjs/cdn-assets/highlight.min.js', 'text/javascript; charset=utf-8'],
  '/vendor/github.min.css': ['node_modules/@highlightjs/cdn-assets/styles/github.min.css', 'text/css; charset=utf-8'],
  '/vendor/github-dark.min.css': ['node_modules/@highlightjs/cdn-assets/styles/github-dark.min.css', 'text/css; charset=utf-8'],
};

async function gh(method, apiPath, { body, accept } = {}) {
  if (!token && !loadToken()) {
    return { status: 401, headers: {}, text: JSON.stringify({ message: 'No gh token. Please run "gh auth login".' }) };
  }
  const doFetch = () => fetch(API + apiPath, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: accept || 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'local-pr-viewer',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let res = await doFetch();
  if (res.status === 401 && loadToken()) res = await doFetch();
  const text = Buffer.from(await res.arrayBuffer());
  return {
    status: res.status,
    headers: { link: res.headers.get('link') || '', 'content-type': res.headers.get('content-type') || 'application/json' },
    text,
  };
}

function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    // DNS rebinding protection: only accept requests addressed to localhost.
    const host = (req.headers.host || '').replace(/:\d+$/, '');
    if (!['127.0.0.1', 'localhost'].includes(host)) return send(res, 403, 'Forbidden', 'text/plain');

    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname.startsWith('/api/')) {
      // Custom header: other sites cannot set it without a preflight (CSRF protection).
      if (req.headers['x-pr-viewer'] !== '1') return send(res, 403, '{"message":"forbidden"}');

      if (req.method === 'GET' && url.pathname.startsWith('/api/gh/')) {
        const apiPath = url.pathname.slice('/api/gh'.length);
        const params = new URLSearchParams(url.search);
        const accept = params.get('_accept') || undefined;
        params.delete('_accept');
        const qs = params.toString();
        const r = await gh('GET', apiPath + (qs ? `?${qs}` : ''), { accept });
        const extra = r.headers.link ? { 'X-Link': r.headers.link } : {};
        return send(res, r.status, r.text, r.headers['content-type'], extra);
      }

      // Merge: the only write call that is allowed.
      const m = url.pathname.match(/^\/api\/merge\/([\w.-]+)\/([\w.-]+)\/(\d+)$/);
      if (req.method === 'PUT' && m) {
        const body = await readBody(req);
        const payload = {
          merge_method: ['merge', 'squash', 'rebase'].includes(body.merge_method) ? body.merge_method : 'merge',
          sha: body.sha,
        };
        if (body.commit_title) payload.commit_title = String(body.commit_title);
        if (body.commit_message) payload.commit_message = String(body.commit_message);
        console.log(`MERGE ${m[1]}/${m[2]}#${m[3]} (${payload.merge_method})`);
        const r = await gh('PUT', `/repos/${m[1]}/${m[2]}/pulls/${m[3]}/merge`, { body: payload });
        return send(res, r.status, r.text);
      }

      return send(res, 404, '{"message":"not found"}');
    }

    const entry = STATIC[url.pathname];
    if (req.method === 'GET' && entry) {
      return send(res, 200, fs.readFileSync(path.join(ROOT, entry[0])), entry[1]);
    }
    send(res, 404, 'Not found', 'text/plain');
  } catch (e) {
    console.error(e);
    send(res, 500, JSON.stringify({ message: String(e && e.message || e) }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`PR Viewer running at http://localhost:${PORT}`);
});
