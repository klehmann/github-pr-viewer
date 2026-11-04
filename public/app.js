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
'use strict';
/* global Diff, hljs */

// ---------- Helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('prv:' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('prv:' + k, JSON.stringify(v)); } catch { /* ignore */ } },
};
const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 86400 * 30) { const n = Math.floor(diff / 86400); return n === 1 ? 'yesterday' : `${n} days ago`; }
  return d.toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
const fullDate = (iso) => iso ? new Date(iso).toLocaleString('en-US') : '';

class ApiError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

async function api(path, { accept, text } = {}) {
  let url = '/api/gh' + path;
  if (accept) url += (url.includes('?') ? '&' : '?') + '_accept=' + encodeURIComponent(accept);
  const res = await fetch(url, { headers: { 'X-PR-Viewer': '1' } });
  const body = await res.text();
  if (!res.ok) {
    let msg = body; try { msg = JSON.parse(body).message || body; } catch { /* plain text */ }
    throw new ApiError(res.status, `GitHub ${res.status}: ${msg}`);
  }
  const link = res.headers.get('X-Link') || '';
  const next = (link.match(/<https:\/\/api\.github\.com([^>]+)>;\s*rel="next"/) || [])[1] || null;
  return { data: text ? body : JSON.parse(body), next };
}
async function apiAll(path, opts = {}, maxPages = 30) {
  let out = []; let p = path; let n = 0;
  while (p && n++ < maxPages) { const r = await api(p, opts); out = out.concat(r.data); p = r.next; }
  return out;
}

let toastTimer;
function toast(msg, isError) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast' + (isError ? ' error' : ''); t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, isError ? 6000 : 3000);
}

const ICON = {
  open: '<svg class="st-open" viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"/></svg>',
  draft: '<svg class="st-draft" viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M3.25 1A2.25 2.25 0 0 1 4 5.372v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.251 2.251 0 0 1 3.25 1Zm9.5 14a2.25 2.25 0 1 1 0-4.5 2.25 2.25 0 0 1 0 4.5ZM2.5 3.25a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0ZM3.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm9.5 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM14 7.5a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm0-4.25a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Z"/></svg>',
  merged: '<svg class="st-merged" viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218ZM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM5 3.25a.75.75 0 1 0 0 .005V3.25Z"/></svg>',
  closed: '<svg class="st-closed" viewBox="0 0 16 16" width="16" height="16"><path fill="currentColor" d="M3.25 1A2.25 2.25 0 0 1 4 5.372v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.251 2.251 0 0 1 3.25 1Zm9.5 5.5a.75.75 0 0 1 .75.75v3.378a2.251 2.251 0 1 1-1.5 0V7.25a.75.75 0 0 1 .75-.75Zm-2.03-5.273a.75.75 0 0 1 1.06 0l.97.97.97-.97a.748.748 0 0 1 1.265.332.75.75 0 0 1-.205.729l-.97.97.97.97a.751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018l-.97-.97-.97.97a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734l.97-.97-.97-.97a.75.75 0 0 1 0-1.06ZM2.5 3.25a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0ZM3.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm9.5 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"/></svg>',
};
const prStatus = (pr) => pr.merged_at ? 'merged' : pr.state === 'closed' ? 'closed' : pr.draft ? 'draft' : 'open';
const STATUS_LABEL = { open: 'Open', closed: 'Closed', merged: 'Merged', draft: 'Draft' };

// ---------- State ----------
const S = {
  user: null,
  repos: [],
  repo: null,          // "owner/name"
  repoInfo: null,
  state: store.get('state', 'open'),
  prs: [], prNext: null,
  pr: null,            // details
  tab: 'conversation',
  files: null,
  file: null,          // file name
  view: store.get('view', 'unified'),
  full: store.get('full', false),
  reviewComments: [],
  mergeBase: null,
  fullCache: new Map(),
  collapsedDirs: new Set(),
  loadToken: 0,
  prListToken: 0,
};

// ---------- Routing ----------
function parseHash() {
  const parts = decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('/');
  const r = { repo: null, pr: null, tab: 'conversation', file: null };
  if (parts.length >= 2 && parts[0] && parts[1]) r.repo = `${parts[0]}/${parts[1]}`;
  if (parts[2] === 'pull' && parts[3]) r.pr = Number(parts[3]);
  if (parts[4] === 'files') { r.tab = 'files'; r.file = parts.slice(5).join('/') || null; }
  return r;
}
function setHash(repo, pr, tab, file) {
  let h = '#/' + (repo || '');
  if (repo && pr) h += `/pull/${pr}`;
  if (pr && tab === 'files') h += '/files' + (file ? '/' + file : '');
  if (location.hash !== h) history.replaceState(null, '', h);
}

// ---------- Repos ----------
async function loadUser() {
  try {
    const { data } = await api('/user');
    S.user = data;
    $('#userBox').innerHTML = `<img src="${esc(data.avatar_url)}" alt=""><span>${esc(data.login)}</span>`;
  } catch (e) {
    $('#userBox').innerHTML = `<span class="st-closed">${esc(e.message)}</span>`;
  }
}

async function loadRepos() {
  $('#repoList').innerHTML = '<li class="list-note"><span class="spinner"></span> Loading repositories …</li>';
  try {
    const repos = await apiAll('/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member', {}, 10);
    S.repos = repos.filter((r) => !r.archived || r.full_name === S.repo);
    renderRepoList();
  } catch (e) {
    $('#repoList').innerHTML = `<li class="list-note st-closed">${esc(e.message)}</li>`;
  }
}

function renderRepoList() {
  const q = $('#repoFilter').value.trim().toLowerCase();
  const list = S.repos.filter((r) => !q || r.full_name.toLowerCase().includes(q)).slice(0, 200);
  $('#repoList').innerHTML = list.length ? list.map((r, i) => `
    <li role="option" data-repo="${esc(r.full_name)}" class="${r.full_name === S.repo ? 'current' : ''} ${i === 0 && q ? 'hl' : ''}">
      <span><span class="owner">${esc(r.owner.login)} /</span> ${esc(r.name)}</span>
      <span class="vis">${r.private ? 'private' : 'public'}</span>
    </li>`).join('') : '<li class="list-note">No matches</li>';
}

function openRepoMenu(open) {
  $('#repoMenu').hidden = !open;
  $('#repoButton').setAttribute('aria-expanded', String(open));
  if (open) { $('#repoFilter').value = ''; renderRepoList(); setTimeout(() => $('#repoFilter').focus(), 0); }
}

async function selectRepo(fullName, { keepPr } = {}) {
  openRepoMenu(false);
  if (!fullName) return;
  const changed = S.repo !== fullName;
  S.repo = fullName;
  store.set('repo', fullName);
  $('#repoLabel').textContent = fullName;
  if (changed) { S.repoInfo = null; api(`/repos/${fullName}`).then((r) => { S.repoInfo = r.data; }).catch(() => {}); }
  if (!keepPr) { S.pr = null; renderEmpty(); setHash(fullName); }
  await loadPrs();
}

// ---------- PR list ----------
async function loadPrs(append) {
  const listEl = $('#prList');
  if (!S.repo) return;
  const token = ++S.prListToken;
  if (!append) { listEl.innerHTML = '<li class="list-note"><span class="spinner"></span> Loading pull requests …</li>'; S.prs = []; }
  try {
    const path = append ? S.prNext : `/repos/${S.repo}/pulls?state=${S.state}&sort=updated&direction=desc&per_page=50`;
    const { data, next } = await api(path);
    if (token !== S.prListToken) return;
    S.prs = S.prs.concat(data); S.prNext = next;
    renderPrList();
  } catch (e) {
    listEl.innerHTML = `<li class="list-note st-closed">${esc(e.message)}</li>`;
  }
}

function renderPrList() {
  const q = $('#prFilter').value.trim().toLowerCase();
  const list = S.prs.filter((p) => !q || p.title.toLowerCase().includes(q) || String(p.number).includes(q) || p.head.ref.toLowerCase().includes(q) || (p.user?.login || '').toLowerCase().includes(q));
  $('#prList').innerHTML = list.length ? list.map((p) => {
    const st = prStatus(p);
    return `<li class="pr-item ${S.pr && S.pr.number === p.number ? 'active' : ''}" data-pr="${p.number}">
      <span class="pr-icon" title="${STATUS_LABEL[st]}">${ICON[st]}</span>
      <div>
        <div class="pr-title">${esc(p.title)}</div>
        <div class="pr-meta">#${p.number} · ${esc(p.user?.login)} · ${fmtDate(p.updated_at)}<br><span class="branch">${esc(p.head.ref)} → ${esc(p.base.ref)}</span></div>
      </div>
    </li>`;
  }).join('') : `<li class="list-note">${S.prs.length ? 'No matches' : 'No pull requests'}</li>`;
  $('#morePrs').hidden = !S.prNext;
}

// ---------- PR details ----------
function renderEmpty() {
  $('#main').innerHTML = '<div class="empty-state"><div class="empty-icon">⇄</div><p>Choose a pull request on the left.</p></div>';
}

async function openPr(number, { tab = 'conversation', file = null } = {}) {
  S.tab = tab; S.file = file; S.files = null; S.reviewComments = []; S.mergeBase = null; S.fullCache.clear();
  const token = ++S.loadToken;
  $('#main').innerHTML = '<div class="loading"><span class="spinner"></span> Loading pull request …</div>';
  try {
    const { data } = await api(`/repos/${S.repo}/pulls/${number}`, { accept: 'application/vnd.github.full+json' });
    if (token !== S.loadToken) return;
    S.pr = data;
    renderPrList();
    renderPrShell();
    setHash(S.repo, number, S.tab, S.file);
    // Review comments are needed in both views.
    apiAll(`/repos/${S.repo}/pulls/${number}/comments?per_page=100`, { accept: 'application/vnd.github.full+json' })
      .then((c) => { if (S.pr?.number === number) { S.reviewComments = c; if (S.tab === 'files' && S.file) renderDiff(); } })
      .catch(() => {});
    showTab(S.tab);
  } catch (e) {
    $('#main').innerHTML = `<div class="diff-msg st-closed">${esc(e.message)}</div>`;
  }
}

function renderPrShell() {
  const pr = S.pr; const st = prStatus(pr);
  $('#main').innerHTML = `
    <div class="pr-header">
      <h1>${esc(pr.title)} <span class="num">#${pr.number}</span><a class="ext" href="${esc(pr.html_url)}" target="_blank" rel="noopener">on GitHub ↗</a></h1>
      <div class="pr-sub">
        <span class="badge ${st}">${ICON[st].replace(/class="st-\w+"/, 'style="color:#fff"')} ${STATUS_LABEL[st]}</span>
        <span><b>${esc(pr.user?.login)}</b> ${pr.merged_at ? 'merged' : 'wants to merge'} ${pr.commits} commit${pr.commits === 1 ? '' : 's'} into <span class="ref">${esc(pr.base.label)}</span> from <span class="ref">${esc(pr.head.label)}</span></span>
        <div class="pr-actions" id="headerActions"></div>
      </div>
      <nav class="tabs">
        <button data-tab="conversation">Conversation <span class="counter">${pr.comments + pr.review_comments}</span></button>
        <button data-tab="files">Files changed <span class="counter">${pr.changed_files}</span>
          <span class="diffstat"><span class="a">+${pr.additions}</span> <span class="d">−${pr.deletions}</span></span></button>
      </nav>
    </div>
    <div id="tabBody" style="display:flex;flex-direction:column;flex:1;min-height:0"></div>`;
  $('.tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) showTab(b.dataset.tab); });
  renderHeaderActions();
}

function renderHeaderActions() {
  const el = $('#headerActions'); if (!el) return;
  const pr = S.pr;
  el.innerHTML = (pr.state === 'open' && !pr.merged_at) ? '<button class="btn btn-primary btn-sm" id="hdrMerge">Merge …</button>' : '';
  $('#hdrMerge')?.addEventListener('click', openMergeDialog);
}

function showTab(tab) {
  S.tab = tab;
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  setHash(S.repo, S.pr.number, tab, tab === 'files' ? S.file : null);
  if (tab === 'files') renderFilesTab(); else renderConversation();
}

// ---------- Conversation ----------
async function renderConversation() {
  const pr = S.pr; const number = pr.number;
  const body = $('#tabBody');
  body.innerHTML = `<div class="conversation"><div class="conv-inner">${commentHtml({ user: pr.user, created_at: pr.created_at, body_html: pr.body_html }, true)}<div class="loading"><span class="spinner"></span> Loading comments …</div></div></div>`;
  const full = { accept: 'application/vnd.github.full+json' };
  const [issueComments, reviews, checks, status] = await Promise.all([
    apiAll(`/repos/${S.repo}/issues/${number}/comments?per_page=100`, full).catch(() => []),
    apiAll(`/repos/${S.repo}/pulls/${number}/reviews?per_page=100`, full).catch(() => []),
    api(`/repos/${S.repo}/commits/${pr.head.sha}/check-runs?per_page=100`).then((r) => r.data.check_runs).catch(() => []),
    api(`/repos/${S.repo}/commits/${pr.head.sha}/status`).then((r) => r.data.statuses).catch(() => []),
  ]);
  const reviewComments = S.reviewComments.length ? S.reviewComments
    : await apiAll(`/repos/${S.repo}/pulls/${number}/comments?per_page=100`, full).catch(() => []);
  S.reviewComments = reviewComments;
  if (S.pr?.number !== number || S.tab !== 'conversation') return;

  // Group review comments into threads.
  const threads = new Map();
  for (const c of reviewComments) {
    const root = c.in_reply_to_id || c.id;
    if (!threads.has(root)) threads.set(root, []);
    threads.get(root).push(c);
  }
  const reviewThreads = new Map(); // review_id -> threads
  const looseThreads = [];
  for (const [, list] of threads) {
    const first = list[0];
    if (first.pull_request_review_id) {
      if (!reviewThreads.has(first.pull_request_review_id)) reviewThreads.set(first.pull_request_review_id, []);
      reviewThreads.get(first.pull_request_review_id).push(list);
    } else looseThreads.push(list);
  }

  const items = [];
  for (const c of issueComments) items.push({ t: c.created_at, html: commentHtml(c) });
  const seenReview = new Set();
  for (const r of reviews) {
    const th = reviewThreads.get(r.id) || [];
    // Thread replies belong to their own reviews without text; those are not shown separately.
    if (!r.body && !th.length && r.state === 'COMMENTED') continue;
    seenReview.add(r.id);
    items.push({ t: r.submitted_at, html: reviewHtml(r, th) });
  }
  for (const [rid, th] of reviewThreads) if (!seenReview.has(rid)) for (const t of th) items.push({ t: t[0].created_at, html: threadHtml(t) });
  for (const t of looseThreads) items.push({ t: t[0].created_at, html: threadHtml(t) });
  items.sort((a, b) => new Date(a.t) - new Date(b.t));

  body.innerHTML = `<div class="conversation"><div class="conv-inner">
    <div class="timeline">
      ${commentHtml({ user: pr.user, created_at: pr.created_at, body_html: pr.body_html, author_association: 'author' }, true)}
      ${items.map((i) => i.html).join('')}
    </div>
    ${checksHtml(checks, status)}
    ${mergePanelHtml()}
  </div></div>`;
  body.querySelectorAll('[data-goto-file]').forEach((a) => a.addEventListener('click', () => { S.file = a.dataset.gotoFile; showTab('files'); }));
  $('#panelMerge')?.addEventListener('click', openMergeDialog);
  body.querySelectorAll('.markdown-body a').forEach((a) => { a.target = '_blank'; a.rel = 'noopener'; });
  // GitHub computes mergeable asynchronously: reload if it is still unknown.
  if (pr.state === 'open' && pr.mergeable === null) refreshMergeable(number);
}

async function refreshMergeable(number, tries = 0) {
  await new Promise((r) => setTimeout(r, 1500));
  try {
    const { data } = await api(`/repos/${S.repo}/pulls/${number}`, { accept: 'application/vnd.github.full+json' });
    if (S.pr?.number !== number) return;
    S.pr = data;
    const panel = $('#mergePanel');
    if (panel) { panel.outerHTML = mergePanelHtml(); $('#panelMerge')?.addEventListener('click', openMergeDialog); }
    if (data.mergeable === null && tries < 3) refreshMergeable(number, tries + 1);
  } catch { /* ignore */ }
}

function avatar(u) { return u?.avatar_url ? `<img src="${esc(u.avatar_url)}&s=40" alt="">` : ''; }

function commentHtml(c, isDescription) {
  const html = c.body_html && c.body_html.trim();
  return `<div class="comment">
    <div class="comment-head">${avatar(c.user)}<b>${esc(c.user?.login)}</b>
      <span title="${esc(fullDate(c.created_at))}">${isDescription ? 'opened' : 'commented'} ${fmtDate(c.created_at)}</span>
      ${isDescription ? '<span class="tag">Description</span>' : ''}</div>
    <div class="comment-body markdown-body ${html ? '' : 'empty'}">${html || 'No description provided.'}</div>
  </div>`;
}

const REVIEW_STATE = { APPROVED: ['approved', 'approved'], CHANGES_REQUESTED: ['changes requested', 'changes'], COMMENTED: ['commented', ''], DISMISSED: ['dismissed', ''] };
function reviewHtml(r, threads) {
  const [label, cls] = REVIEW_STATE[r.state] || [r.state.toLowerCase(), ''];
  const html = r.body_html && r.body_html.trim();
  return `<div class="comment">
    <div class="comment-head">${avatar(r.user)}<b>${esc(r.user?.login)}</b>
      <span title="${esc(fullDate(r.submitted_at))}">Review ${fmtDate(r.submitted_at)}</span>
      <span class="tag ${cls}">${esc(label)}</span></div>
    ${html ? `<div class="comment-body markdown-body">${html}</div>` : ''}
    ${threads.map((t) => `<div style="padding:0 14px 12px">${threadHtml(t)}</div>`).join('')}
  </div>`;
}

function threadHtml(list) {
  const first = list[0];
  const line = first.line ?? first.original_line;
  const snippet = (first.diff_hunk || '').split('\n').slice(-6).map((l) => {
    const cls = l[0] === '+' ? 'add' : l[0] === '-' ? 'del' : '';
    return `<div class="${cls}">${esc(l)}</div>`;
  }).join('');
  return `<div class="comment" style="margin-top:12px">
    <div class="code-ref"><a data-goto-file="${esc(first.path)}">${esc(first.path)}</a>${line ? ` · line ${line}` : ''}${first.line == null ? ' · <i>outdated</i>' : ''}</div>
    <pre class="hunk-snippet">${snippet}</pre>
    ${list.map((c, i) => `<div class="${i ? 'reply' : ''}">
      <div class="comment-head" style="background:none;border:none">${avatar(c.user)}<b>${esc(c.user?.login)}</b><span title="${esc(fullDate(c.created_at))}">${fmtDate(c.created_at)}</span></div>
      <div class="comment-body markdown-body" style="padding-top:0">${c.body_html || esc(c.body)}</div></div>`).join('')}
  </div>`;
}

function checksHtml(checks, statuses) {
  const rows = [
    ...checks.map((c) => ({ name: c.name, state: c.status !== 'completed' ? 'wait' : c.conclusion === 'success' ? 'ok' : ['skipped', 'neutral'].includes(c.conclusion) ? 'neutral' : 'bad', label: c.status !== 'completed' ? 'running' : c.conclusion, url: c.html_url })),
    ...statuses.map((s) => ({ name: s.context, state: s.state === 'success' ? 'ok' : s.state === 'pending' ? 'wait' : 'bad', label: s.state, url: s.target_url })),
  ];
  if (!rows.length) return '';
  const bad = rows.filter((r) => r.state === 'bad').length; const wait = rows.filter((r) => r.state === 'wait').length;
  const summary = bad ? `${bad} failing` : wait ? `${wait} in progress` : 'All checks have passed';
  return `<div class="panel">
    <div class="panel-row"><span class="dot ${bad ? 'bad' : wait ? 'wait' : 'ok'}"></span><span class="panel-title">${summary}</span><span class="hint">${rows.length} check${rows.length === 1 ? '' : 's'}</span></div>
    <div class="check-list">${rows.map((r) => `<div class="check-row"><span class="dot ${r.state}"></span><span class="name">${esc(r.name)}</span><span class="concl">${esc(r.label || '')}</span>${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">Details</a>` : ''}</div>`).join('')}</div>
  </div>`;
}

const MERGE_STATE = {
  clean: 'No conflicts with the base branch.',
  unstable: 'Mergeable, but not all checks have passed.',
  has_hooks: 'Mergeable.',
  blocked: 'Blocked by branch protection rules (for example a missing review or checks).',
  behind: 'This branch is behind the base branch.',
  dirty: 'There are merge conflicts that must be resolved first.',
  draft: 'This pull request is a draft.',
  unknown: 'GitHub is still checking whether this can be merged …',
};
function mergePanelHtml() {
  const pr = S.pr;
  if (pr.merged_at) {
    return `<div class="panel merge-panel done" id="mergePanel"><div class="panel-row"><span class="merge-icon" style="background:var(--purple)">${ICON.merged.replace(/class="st-\w+"/, 'style="color:#fff"')}</span>
      <div><div class="panel-title">Merged</div><div class="merge-hint">${esc(pr.merged_by?.login || '')} merged ${fmtDate(pr.merged_at)}${pr.merge_commit_sha ? ` · <span class="ref">${pr.merge_commit_sha.slice(0, 7)}</span>` : ''}</div></div></div></div>`;
  }
  if (pr.state === 'closed') {
    return `<div class="panel" id="mergePanel"><div class="panel-row"><span class="merge-icon" style="background:var(--red)">${ICON.closed.replace(/class="st-\w+"/, 'style="color:#fff"')}</span><div><div class="panel-title">Closed without merging</div><div class="merge-hint">${fmtDate(pr.closed_at)}</div></div></div></div>`;
  }
  const ms = pr.mergeable === null ? 'unknown' : (pr.mergeable_state || 'unknown');
  const ok = pr.mergeable && ['clean', 'unstable', 'has_hooks'].includes(ms);
  return `<div class="panel merge-panel ${ok ? '' : 'blocked'}" id="mergePanel"><div class="panel-row">
    <span class="merge-icon" style="background:${ok ? 'var(--green-btn)' : 'var(--amber)'}">${ICON.merged.replace(/class="st-\w+"/, 'style="color:#fff"')}</span>
    <div style="flex:1"><div class="panel-title">${ok ? 'This branch can be merged' : 'Merging may not be possible'}</div><div class="merge-hint">${esc(MERGE_STATE[ms] || ms)}</div></div>
    <button class="btn ${ok ? 'btn-primary' : ''}" id="panelMerge">Merge …</button>
  </div></div>`;
}

// ---------- Merge ----------
function openMergeDialog() {
  const pr = S.pr; const ri = S.repoInfo || {};
  const methods = [
    ['merge', 'Create a merge commit', ri.allow_merge_commit !== false],
    ['squash', 'Squash and merge', ri.allow_squash_merge !== false],
    ['rebase', 'Rebase and merge', ri.allow_rebase_merge !== false],
  ].filter((m) => m[2]);
  const last = store.get('mergeMethod', 'merge');
  $('#mergeMethod').innerHTML = methods.map(([v, l]) => `<option value="${v}" ${v === last ? 'selected' : ''}>${l}</option>`).join('');
  $('#mergeSub').innerHTML = `<b>#${pr.number}</b> ${esc(pr.title)}<br><span class="ref">${esc(pr.head.label)}</span> → <span class="ref">${esc(pr.base.label)}</span>`;
  const fill = () => {
    const m = $('#mergeMethod').value;
    $('#mergeTitle').value = m === 'squash' ? `${pr.title} (#${pr.number})` : `Merge pull request #${pr.number} from ${pr.head.label.replace(':', '/')}`;
    $('#mergeMessage').value = m === 'squash' ? '' : pr.title;
    $('#mergeTitle').disabled = $('#mergeMessage').disabled = m === 'rebase';
  };
  $('#mergeMethod').onchange = fill; fill();
  $('#mergeError').hidden = true; $('#mergeConfirm').disabled = false; $('#mergeConfirm').textContent = 'Confirm merge';
  $('#mergeDialog').showModal();
}

async function doMerge() {
  const pr = S.pr; const method = $('#mergeMethod').value;
  store.set('mergeMethod', method);
  $('#mergeConfirm').disabled = true; $('#mergeConfirm').innerHTML = '<span class="spinner"></span> Merging …';
  try {
    const res = await fetch(`/api/merge/${S.repo}/${pr.number}`, {
      method: 'PUT',
      headers: { 'X-PR-Viewer': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ merge_method: method, sha: pr.head.sha, commit_title: method === 'rebase' ? undefined : $('#mergeTitle').value, commit_message: method === 'rebase' ? undefined : $('#mergeMessage').value }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.merged === false) throw new Error(data.message || `Error ${res.status}`);
    $('#mergeDialog').close();
    toast(`#${pr.number} was merged.`);
    await openPr(pr.number, { tab: S.tab, file: S.file });
    loadPrs();
  } catch (e) {
    $('#mergeError').textContent = e.message; $('#mergeError').hidden = false;
    $('#mergeConfirm').disabled = false; $('#mergeConfirm').textContent = 'Confirm merge';
  }
}

// ---------- Files changed ----------
async function renderFilesTab() {
  const body = $('#tabBody');
  const number = S.pr.number;
  if (!S.files) {
    body.innerHTML = '<div class="loading"><span class="spinner"></span> Loading files …</div>';
    try {
      S.files = await apiAll(`/repos/${S.repo}/pulls/${number}/files?per_page=100`, {}, 30);
    } catch (e) { body.innerHTML = `<div class="diff-msg st-closed">${esc(e.message)}</div>`; return; }
    if (S.pr?.number !== number || S.tab !== 'files') return;
  }
  if (!S.file || !S.files.some((f) => f.filename === S.file)) S.file = fileOrder()[0]?.filename || null;
  body.innerHTML = `<div class="files-view">
    <div class="file-pane">
      <div class="file-pane-head">
        <input type="search" id="fileFilter" placeholder="Filter files …" spellcheck="false">
        <div class="progress"><span id="viewedCount"></span><span class="hint" title="j/k: next/previous file · v: viewed"><kbd>j</kbd> <kbd>k</kbd> <kbd>v</kbd></span></div>
        <div class="progress-bar"><div id="viewedBar"></div></div>
      </div>
      <div class="file-tree" id="fileTree"></div>
    </div>
    <div class="diff-pane">
      <div class="diff-toolbar">
        <div class="diff-path" id="diffPath"></div>
        <span class="diffstat" id="diffStat"></span>
        <div class="seg" id="viewSeg"><button data-view="unified">Inline</button><button data-view="split">Side by side</button></div>
        <label class="toggle"><input type="checkbox" id="fullToggle"> Whole file</label>
        <label class="viewed-toggle" id="viewedToggle"><input type="checkbox" id="viewedBox"> Viewed</label>
        <span class="change-nav" id="changeNav" hidden>
          <button class="btn btn-sm" id="prevChange" title="Previous change (p)">‹</button>
          <span id="changeCount"></span>
          <button class="btn btn-sm" id="nextChange" title="Next change (n)">›</button>
        </span>
        <button class="btn btn-sm" id="prevFile" title="Previous file (k)">↑</button>
        <button class="btn btn-sm" id="nextFile" title="Next file (j)">↓</button>
      </div>
      <div class="diff-body">
        <div class="diff-scroll" id="diffScroll"></div>
        <div class="diff-ruler" id="diffRuler" hidden title="Changes in this file. Click to jump."><div class="ruler-view" id="rulerView"></div></div>
      </div>
    </div>
  </div>`;
  $('#fileFilter').addEventListener('input', renderTree);
  $('#viewSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; S.view = b.dataset.view; store.set('view', S.view); renderDiff(); });
  $('#fullToggle').checked = S.full;
  $('#fullToggle').addEventListener('change', (e) => { S.full = e.target.checked; store.set('full', S.full); renderDiff(); });
  $('#viewedBox').addEventListener('change', (e) => setViewed(currentFile(), e.target.checked));
  $('#prevChange').addEventListener('click', () => stepChange(-1));
  $('#nextChange').addEventListener('click', () => stepChange(1));
  $('#diffScroll').addEventListener('scroll', () => { updateRulerView(); updateChangeCount(); }, { passive: true });
  $('#diffRuler').addEventListener('mousedown', onRulerDown);
  new ResizeObserver(() => buildRuler()).observe($('#diffScroll'));
  $('#prevFile').addEventListener('click', () => stepFile(-1));
  $('#nextFile').addEventListener('click', () => stepFile(1));
  $('#fileTree').addEventListener('click', onTreeClick);
  renderTree();
  renderDiff();
}

const currentFile = () => S.files?.find((f) => f.filename === S.file);
const viewedKey = (f) => `viewed:${S.repo}#${S.pr.number}:${f.filename}:${f.sha}`;
const isViewed = (f) => store.get(viewedKey(f), false);
function setViewed(f, v) {
  if (!f) return;
  store.set(viewedKey(f), v);
  renderTree(); updateViewedUi();
}
function updateViewedUi() {
  const f = currentFile();
  const n = S.files.filter(isViewed).length;
  $('#viewedCount').textContent = `${n} of ${S.files.length} viewed`;
  $('#viewedBar').style.width = `${S.files.length ? (100 * n) / S.files.length : 0}%`;
  if (f) { $('#viewedBox').checked = isViewed(f); $('#viewedToggle').classList.toggle('on', isViewed(f)); }
}

function buildTree(files) {
  const root = { dirs: new Map(), files: [] };
  for (const f of files) {
    const parts = f.filename.split('/'); let node = root;
    for (const p of parts.slice(0, -1)) {
      if (!node.dirs.has(p)) node.dirs.set(p, { dirs: new Map(), files: [] });
      node = node.dirs.get(p);
    }
    node.files.push(f);
  }
  return root;
}
const fileOrder = () => { const out = []; (function walk(n) { [...n.dirs.keys()].sort().forEach((k) => walk(n.dirs.get(k))); n.files.sort((a, b) => a.filename.localeCompare(b.filename)).forEach((f) => out.push(f)); })(buildTree(S.files)); return out; };

const STATUS_CHAR = { added: 'A', removed: 'D', modified: 'M', renamed: 'R', copied: 'C', changed: 'M', unchanged: '·' };
function renderTree() {
  const q = ($('#fileFilter')?.value || '').trim().toLowerCase();
  const files = S.files.filter((f) => !q || f.filename.toLowerCase().includes(q));
  const tree = buildTree(files);
  const renderNode = (node, depth, prefix) => {
    let html = '';
    for (const name of [...node.dirs.keys()].sort()) {
      let child = node.dirs.get(name); let label = name;
      // Collapse folders that contain exactly one subfolder
      while (child.files.length === 0 && child.dirs.size === 1) { const [n2, c2] = [...child.dirs.entries()][0]; label += '/' + n2; child = c2; }
      const full = prefix + label;
      const collapsed = S.collapsedDirs.has(full) && !q;
      html += `<div class="${collapsed ? 'collapsed' : ''}"><div class="tree-dir" data-dir="${esc(full)}" style="padding-left:${10 + depth * 14}px"><span class="chev">▾</span>📁 ${esc(label)}</div>
        <div class="tree-children">${renderNode(child, depth + 1, full + '/')}</div></div>`;
    }
    for (const f of node.files.sort((a, b) => a.filename.localeCompare(b.filename))) {
      const name = f.filename.split('/').pop(); const v = isViewed(f);
      html += `<div class="tree-file ${f.filename === S.file ? 'active' : ''} ${v ? 'viewed' : ''}" data-file="${esc(f.filename)}" style="padding-left:${24 + depth * 14}px" title="${esc(f.filename)}">
        <span class="fst ${f.status}" title="${esc(f.status)}">${STATUS_CHAR[f.status] || '?'}</span>
        <span class="fname">${esc(name)}</span>
        <span class="mini"><span class="st-open">+${f.additions}</span> <span class="st-closed">−${f.deletions}</span></span>
        <span class="vcheck">${v ? '✓' : ''}</span></div>`;
    }
    return html;
  };
  $('#fileTree').innerHTML = files.length ? renderNode(tree, 0, '') : '<div class="list-note">No files</div>';
  updateViewedUi();
}

function onTreeClick(e) {
  const d = e.target.closest('.tree-dir');
  if (d) { const k = d.dataset.dir; S.collapsedDirs.has(k) ? S.collapsedDirs.delete(k) : S.collapsedDirs.add(k); renderTree(); return; }
  const f = e.target.closest('.tree-file');
  if (f) selectFile(f.dataset.file);
}

function selectFile(name) {
  S.file = name;
  setHash(S.repo, S.pr.number, 'files', name);
  document.querySelectorAll('.tree-file').forEach((el) => el.classList.toggle('active', el.dataset.file === name));
  document.querySelector('.tree-file.active')?.scrollIntoView({ block: 'nearest' });
  renderDiff();
}
function stepFile(dir) {
  const order = fileOrder(); const i = order.findIndex((f) => f.filename === S.file);
  const nxt = order[Math.max(0, Math.min(order.length - 1, i + dir))];
  if (nxt && nxt.filename !== S.file) selectFile(nxt.filename);
}

// ---------- Diff ----------
function parsePatch(patch) {
  const lines = []; let o = 0; let n = 0;
  for (const raw of patch.split('\n')) {
    if (raw.startsWith('@@')) {
      const m = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/);
      if (m) { o = +m[1]; n = +m[2]; }
      lines.push({ type: 'hunk', text: raw });
    } else if (raw.startsWith('\\')) {
      // "\ No newline at end of file": ignore
    } else if (raw[0] === '+') lines.push({ type: 'add', newNo: n++, text: raw.slice(1) });
    else if (raw[0] === '-') lines.push({ type: 'del', oldNo: o++, text: raw.slice(1) });
    else lines.push({ type: 'ctx', oldNo: o++, newNo: n++, text: raw.slice(1) });
  }
  return lines;
}

function diffFull(oldText, newText) {
  const out = []; let o = 1; let n = 1;
  for (const part of Diff.diffLines(oldText, newText)) {
    const ls = part.value.replace(/\n$/, '').split('\n');
    for (const t of ls) {
      if (part.added) out.push({ type: 'add', newNo: n++, text: t });
      else if (part.removed) out.push({ type: 'del', oldNo: o++, text: t });
      else out.push({ type: 'ctx', oldNo: o++, newNo: n++, text: t });
    }
  }
  return out;
}

async function rawContent(path, ref) {
  const key = `${ref}:${path}`;
  if (S.fullCache.has(key)) return S.fullCache.get(key);
  const p = api(`/repos/${S.repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`, { accept: 'application/vnd.github.raw+json', text: true }).then((r) => r.data);
  S.fullCache.set(key, p);
  return p;
}

async function getMergeBase() {
  if (S.mergeBase) return S.mergeBase;
  try {
    const { data } = await api(`/repos/${S.repo}/compare/${S.pr.base.sha}...${S.pr.head.sha}?per_page=1`);
    S.mergeBase = data.merge_base_commit.sha;
  } catch { S.mergeBase = S.pr.base.sha; }
  return S.mergeBase;
}

// Pick the syntax highlighting language from the file extension
const LANG_ALIAS = { vue: 'xml', svelte: 'xml', html: 'xml', htm: 'xml', svg: 'xml', mjs: 'javascript', cjs: 'javascript', mts: 'typescript', cts: 'typescript', tsx: 'typescript', jsx: 'javascript', kts: 'kotlin', yml: 'yaml', md: 'markdown', astro: 'xml', h: 'c', m: 'objectivec', mm: 'objectivec', gradle: 'groovy', lock: 'plaintext', toml: 'ini', plist: 'xml', xcconfig: 'ini', sh: 'bash', zsh: 'bash' };
function langFor(filename) {
  const base = filename.split('/').pop().toLowerCase();
  if (base === 'dockerfile') return 'dockerfile';
  if (base === 'makefile') return 'makefile';
  const ext = base.includes('.') ? base.split('.').pop() : '';
  const l = LANG_ALIAS[ext] || ext;
  return l && hljs.getLanguage(l) ? l : null;
}

// Split hljs HTML into {text, cls} segments so word highlights can be laid on top
function hlSegments(text, lang) {
  if (!lang || text.length > 2000) return [{ text, cls: '' }];
  let html;
  try { html = hljs.highlight(text, { language: lang, ignoreIllegals: true }).value; } catch { return [{ text, cls: '' }]; }
  const tpl = document.createElement('template'); tpl.innerHTML = html;
  const segs = [];
  (function walk(node, cls) {
    for (const ch of node.childNodes) {
      if (ch.nodeType === 3) segs.push({ text: ch.nodeValue, cls });
      else walk(ch, (cls + ' ' + (ch.getAttribute('class') || '')).trim());
    }
  })(tpl.content, '');
  return segs;
}

function renderCode(text, lang, ranges, tag) {
  const segs = hlSegments(text, lang);
  let pos = 0; let out = '';
  const inRange = (p) => ranges && ranges.some(([a, b]) => p >= a && p < b);
  for (const s of segs) {
    let i = 0;
    while (i < s.text.length) {
      const start = pos + i; const on = inRange(start);
      let j = i + 1;
      while (j < s.text.length && inRange(pos + j) === on) j++;
      const piece = esc(s.text.slice(i, j));
      const span = s.cls ? `<span class="${esc(s.cls)}">${piece}</span>` : piece;
      out += on ? `<${tag}>${span}</${tag}>` : span;
      i = j;
    }
    pos += s.text.length;
  }
  return out || ' ';
}

// Word-level changes between a deleted and an added line
function wordRanges(a, b) {
  if (a.length > 1000 || b.length > 1000) return [null, null];
  const parts = Diff.diffWordsWithSpace(a, b);
  const ra = []; const rb = []; let pa = 0; let pb = 0;
  let common = 0;
  for (const p of parts) {
    const len = p.value.length;
    if (p.removed) { ra.push([pa, pa + len]); pa += len; } else if (p.added) { rb.push([pb, pb + len]); pb += len; } else { pa += len; pb += len; common += len; }
  }
  // If almost everything differs, highlighting does not help
  if (common < Math.min(a.length, b.length) * 0.3) return [null, null];
  return [ra, rb];
}

// Pair up deleted and added blocks
function pairBlocks(lines) {
  const rows = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.type === 'del' || l.type === 'add') {
      const dels = []; const adds = [];
      while (i < lines.length && lines[i].type === 'del') dels.push(lines[i++]);
      while (i < lines.length && lines[i].type === 'add') adds.push(lines[i++]);
      const max = Math.max(dels.length, adds.length);
      for (let k = 0; k < max; k++) {
        const d = dels[k]; const a = adds[k];
        let ranges = [null, null];
        if (d && a) ranges = wordRanges(d.text, a.text);
        if (d) d.ranges = ranges[0];
        if (a) a.ranges = ranges[1];
        rows.push({ type: 'change', left: d || null, right: a || null });
      }
    } else { rows.push({ type: l.type, left: l, right: l }); i++; }
  }
  return rows;
}

function commentsFor(path) {
  const map = new Map();
  for (const c of S.reviewComments) {
    if (c.path !== path || c.line == null) continue;
    const key = `${c.side === 'LEFT' ? 'L' : 'R'}${c.line}`;
    const root = c.in_reply_to_id || c.id;
    if (!map.has(key)) map.set(key, new Map());
    const threads = map.get(key);
    if (!threads.has(root)) threads.set(root, []);
    threads.get(root).push(c);
  }
  // Replies without a line are filed under their root
  return map;
}
function inlineCommentsHtml(threadsMap) {
  return [...threadsMap.values()].map((list) => `<div class="comment">${list.map((c, i) => `
    <div class="${i ? 'reply' : ''}"><div class="comment-head" style="${i ? 'background:none;border:none' : ''}">${avatar(c.user)}<b>${esc(c.user?.login)}</b><span>${fmtDate(c.created_at)}</span></div>
    <div class="comment-body markdown-body">${c.body_html || esc(c.body)}</div></div>`).join('')}</div>`).join('');
}

const IMG_RE = /\.(png|jpe?g|gif|webp|avif|bmp|ico|svg)$/i;
async function rawBlobUrl(path, ref) {
  const key = `blob:${ref}:${path}`;
  if (S.fullCache.has(key)) return S.fullCache.get(key);
  const p = fetch(`/api/gh/repos/${S.repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}&_accept=${encodeURIComponent('application/vnd.github.raw+json')}`, { headers: { 'X-PR-Viewer': '1' } })
    .then(async (r) => {
      if (!r.ok) throw new Error(`GitHub ${r.status}`);
      const buf = await r.blob();
      const type = path.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : buf.type;
      return { url: URL.createObjectURL(new Blob([buf], { type })), size: buf.size };
    });
  S.fullCache.set(key, p);
  return p;
}
const fmtSize = (n) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
async function renderImageDiff(f, scroll, token) {
  scroll.innerHTML = '<div class="loading"><span class="spinner"></span> Loading image …</div>';
  try {
    const base = f.status === 'added' ? null : await getMergeBase();
    const [oldImg, newImg] = await Promise.all([
      base ? rawBlobUrl(f.previous_filename || f.filename, base) : null,
      f.status === 'removed' ? null : rawBlobUrl(f.filename, S.pr.head.sha),
    ]);
    if (token !== diffToken) return;
    const box = (img, label, cls) => `<figure class="img-box ${cls}"><figcaption>${label}${img ? ` · ${fmtSize(img.size)}` : ''}</figcaption>${img ? `<img src="${img.url}" alt="">` : '<div class="img-none">—</div>'}</figure>`;
    scroll.innerHTML = `<div class="img-diff">${f.status === 'added' ? '' : box(oldImg, 'Before', 'del')}${f.status === 'removed' ? '' : box(newImg, f.status === 'added' ? 'New' : 'After', 'add')}</div>`;
    scroll.querySelectorAll('.img-box img').forEach((im) => im.addEventListener('load', () => {
      const cap = im.previousElementSibling; cap.textContent += ` · ${im.naturalWidth}×${im.naturalHeight}`;
    }));
  } catch (e) {
    if (token === diffToken) scroll.innerHTML = `<div class="diff-msg st-closed">Could not load image: ${esc(e.message)}</div>`;
  }
}

let diffToken = 0;
async function renderDiff() {
  const f = currentFile();
  const scroll = $('#diffScroll'); if (!scroll) return;
  document.querySelectorAll('#viewSeg button').forEach((b) => b.classList.toggle('active', b.dataset.view === S.view));
  updateViewedUi();
  if (!f) { $('#diffPath').textContent = ''; scroll.innerHTML = '<div class="diff-msg">No files in this pull request.</div>'; return; }
  const dir = f.filename.includes('/') ? f.filename.slice(0, f.filename.lastIndexOf('/') + 1) : '';
  $('#diffPath').innerHTML = `${f.previous_filename ? `<span class="old">${esc(f.previous_filename)} →</span> ` : ''}<span class="dir"><bdi>${esc(dir)}</bdi></span><span class="name">${esc(f.filename.slice(dir.length))}</span>`;
  $('#diffPath').title = f.filename;
  $('#diffStat').innerHTML = `<span class="a">+${f.additions}</span> <span class="d">−${f.deletions}</span>`;
  const token = ++diffToken;

  if (IMG_RE.test(f.filename)) { renderImageDiff(f, scroll, token); return; }
  let lines;
  if (S.full) {
    scroll.innerHTML = '<div class="loading"><span class="spinner"></span> Loading whole file …</div>';
    try {
      const base = await getMergeBase();
      const [oldText, newText] = await Promise.all([
        f.status === 'added' ? '' : rawContent(f.previous_filename || f.filename, base),
        f.status === 'removed' ? '' : rawContent(f.filename, S.pr.head.sha),
      ]);
      if (token !== diffToken) return;
      if (/\u0000/.test(oldText.slice(0, 8000) + newText.slice(0, 8000))) { scroll.innerHTML = '<div class="diff-msg">Binary file, no text view.</div>'; return; }
      lines = diffFull(oldText, newText);
    } catch (e) {
      if (token !== diffToken) return;
      scroll.innerHTML = `<div class="diff-msg st-closed">Could not load file: ${esc(e.message)}</div>`; return;
    }
  } else {
    if (!f.patch) {
      scroll.innerHTML = `<div class="diff-msg">${f.status === 'renamed' && !f.changes ? 'File renamed without content changes.' : 'GitHub provides no diff for this file (binary or too large).'}<br><br><button class="btn btn-sm" id="tryFull">Load whole file</button></div>`;
      $('#tryFull').addEventListener('click', () => { $('#fullToggle').checked = true; S.full = true; store.set('full', true); renderDiff(); });
      return;
    }
    lines = parsePatch(f.patch);
  }

  const lang = lines.length > 20000 ? null : langFor(f.filename);
  const rows = pairBlocks(lines);
  const cmap = commentsFor(f.filename);
  const comments = (side, no) => (no != null && cmap.get(side + no)) || null;
  let html = '';
  if (S.view === 'split') {
    html = '<table class="diff split"><colgroup><col style="width:52px"><col style="width:18px"><col><col style="width:52px"><col style="width:18px"><col></colgroup><tbody>';
    for (const r of rows) {
      if (r.type === 'hunk') { html += `<tr class="hunk"><td colspan="6">${esc(r.left.text)}</td></tr>`; continue; }
      const L = r.left; const R = r.right;
      const lc = r.type === 'change' ? 'del' : ''; const rc = r.type === 'change' ? 'add' : '';
      html += '<tr>';
      html += L ? `<td class="num ${lc}">${L.oldNo ?? ''}</td><td class="sign ${lc}">${lc ? '−' : ''}</td><td class="code ${lc}">${renderCode(L.text, lang, L.ranges, 'del')}</td>` : '<td class="num empty"></td><td class="sign empty"></td><td class="code empty"></td>';
      html += R ? `<td class="num split-border ${rc}">${R.newNo ?? ''}</td><td class="sign ${rc}">${rc ? '+' : ''}</td><td class="code ${rc}">${renderCode(R.text, lang, R.ranges, 'ins')}</td>` : '<td class="num split-border empty"></td><td class="sign empty"></td><td class="code empty"></td>';
      html += '</tr>';
      const cl = L && comments('L', L.oldNo); const cr = R && comments('R', R.newNo);
      if (cl || cr) html += `<tr class="inline-comments"><td colspan="3">${cl ? inlineCommentsHtml(cl) : ''}</td><td colspan="3" class="split-border">${cr ? inlineCommentsHtml(cr) : ''}</td></tr>`;
    }
  } else {
    html = '<table class="diff"><colgroup><col style="width:52px"><col style="width:52px"><col style="width:18px"><col></colgroup><tbody>';
    // In the inline view show all deleted lines of a block first, then all added lines
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].type !== 'change') { out.push(rows[i].left); continue; }
      const block = []; while (i < rows.length && rows[i].type === 'change') block.push(rows[i++]); i--;
      block.forEach((r) => r.left && out.push(r.left));
      block.forEach((r) => r.right && out.push(r.right));
    }
    for (const l of out) {
      if (l.type === 'hunk') { html += `<tr class="hunk"><td colspan="4">${esc(l.text)}</td></tr>`; continue; }
      const sign = l.type === 'add' ? '+' : l.type === 'del' ? '−' : '';
      html += `<tr class="${l.type}"><td class="num">${l.oldNo ?? ''}</td><td class="num">${l.newNo ?? ''}</td><td class="sign">${sign}</td><td class="code">${renderCode(l.text, lang, l.ranges, l.type === 'del' ? 'del' : 'ins')}</td></tr>`;
      const c = l.type === 'del' ? comments('L', l.oldNo) : comments('R', l.newNo);
      if (c) html += `<tr class="inline-comments"><td colspan="4">${inlineCommentsHtml(c)}</td></tr>`;
    }
  }
  html += '</tbody></table>';
  scroll.innerHTML = html;
  scroll.scrollTop = 0;
  scroll.querySelectorAll('.markdown-body a').forEach((a) => { a.target = '_blank'; a.rel = 'noopener'; });
  // In the whole-file view, jump to the first change
  buildRuler();
  if (S.full && S.changes.length) scrollToChange(0);
}

// ---------- Overview ruler: marks the changed spots next to the scrollbar ----------
S.changes = [];
const rowKind = (tr) => {
  if (tr.classList.contains('add')) return 'add';
  if (tr.classList.contains('del')) return 'del';
  const a = tr.querySelector('td.code.add'); const d = tr.querySelector('td.code.del');
  return a && d ? 'mod' : a ? 'add' : d ? 'del' : null;
};
function buildRuler() {
  const scroll = $('#diffScroll'); const ruler = $('#diffRuler'); if (!scroll || !ruler) return;
  ruler.querySelectorAll('.ruler-mark').forEach((m) => m.remove());
  const table = scroll.querySelector('table.diff');
  S.changes = [];
  if (!table) { ruler.hidden = true; $('#changeNav').hidden = true; return; }
  // Group consecutive changed rows into blocks
  let cur = null;
  for (const tr of table.tBodies[0].rows) {
    if (tr.classList.contains('inline-comments')) continue;
    const k = rowKind(tr);
    if (!k) { cur = null; continue; }
    if (!cur) { cur = { top: tr.offsetTop, bottom: tr.offsetTop + tr.offsetHeight, kinds: new Set([k]), row: tr }; S.changes.push(cur); } else { cur.bottom = tr.offsetTop + tr.offsetHeight; cur.kinds.add(k); }
  }
  const total = scroll.scrollHeight || 1;
  ruler.hidden = !S.changes.length;
  $('#changeNav').hidden = !S.changes.length;
  const h = ruler.clientHeight;
  const frag = document.createDocumentFragment();
  for (const c of S.changes) {
    const m = document.createElement('div');
    const kind = c.kinds.has('mod') || (c.kinds.has('add') && c.kinds.has('del')) ? 'mod' : [...c.kinds][0];
    m.className = `ruler-mark ${kind}`;
    m.style.top = `${(c.top / total) * h}px`;
    m.style.height = `${Math.max(3, ((c.bottom - c.top) / total) * h)}px`;
    frag.appendChild(m);
  }
  ruler.appendChild(frag);
  updateRulerView(); updateChangeCount();
}
function updateRulerView() {
  const scroll = $('#diffScroll'); const v = $('#rulerView'); if (!scroll || !v) return;
  const h = $('#diffRuler').clientHeight; const total = scroll.scrollHeight || 1;
  v.style.top = `${(scroll.scrollTop / total) * h}px`;
  v.style.height = `${Math.max(8, (scroll.clientHeight / total) * h)}px`;
}
// Index of the first change at or below the top of the visible area
function currentChangeIndex() {
  const top = $('#diffScroll').scrollTop + 1;
  const i = S.changes.findIndex((c) => c.bottom > top);
  return i < 0 ? S.changes.length : i;
}
function updateChangeCount() {
  const el = $('#changeCount'); if (!el || !S.changes.length) return;
  const scroll = $('#diffScroll');
  const view = [scroll.scrollTop, scroll.scrollTop + scroll.clientHeight];
  const visible = S.changes.map((c, i) => (c.bottom > view[0] && c.top < view[1] ? i : -1)).filter((i) => i >= 0);
  const below = S.changes.filter((c) => c.top >= view[1]).length;
  el.textContent = visible.length
    ? `${visible[0] + 1}${visible.length > 1 ? '–' + (visible[visible.length - 1] + 1) : ''} of ${S.changes.length}`
    : `${S.changes.length} change${S.changes.length === 1 ? '' : 's'}`;
  el.title = below ? `${below} more change${below === 1 ? '' : 's'} below` : 'No more changes below';
}
function scrollToChange(i) {
  const c = S.changes[i]; if (!c) return;
  const scroll = $('#diffScroll');
  scroll.scrollTop = Math.max(0, c.top - Math.min(120, scroll.clientHeight / 4));
}
function stepChange(dir) {
  if (!S.changes.length) return;
  const scroll = $('#diffScroll'); const top = scroll.scrollTop + Math.min(120, scroll.clientHeight / 4);
  let i;
  if (dir > 0) i = S.changes.findIndex((c) => c.top > top + 2);
  else { i = -1; S.changes.forEach((c, k) => { if (c.top < top - 2) i = k; }); }
  if (i >= 0) scrollToChange(i);
}
function onRulerDown(e) {
  const ruler = $('#diffRuler'); const scroll = $('#diffScroll');
  const jump = (ev) => {
    const r = ruler.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height));
    scroll.scrollTop = frac * scroll.scrollHeight - scroll.clientHeight / 2;
  };
  jump(e); e.preventDefault();
  const up = () => { window.removeEventListener('mousemove', jump); window.removeEventListener('mouseup', up); };
  window.addEventListener('mousemove', jump); window.addEventListener('mouseup', up);
}

// ---------- Events ----------
$('#repoButton').addEventListener('click', () => openRepoMenu($('#repoMenu').hidden));
$('#repoFilter').addEventListener('input', renderRepoList);
$('#repoFilter').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') openRepoMenu(false);
  if (e.key === 'Enter') { const li = $('#repoList li[data-repo]'); if (li) selectRepo(li.dataset.repo); }
});
$('#repoList').addEventListener('click', (e) => { const li = e.target.closest('li[data-repo]'); if (li) selectRepo(li.dataset.repo); });
document.addEventListener('click', (e) => { if (!e.target.closest('#repoPicker')) openRepoMenu(false); });

$('#stateTabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-state]'); if (!b) return;
  S.state = b.dataset.state; store.set('state', S.state);
  document.querySelectorAll('#stateTabs button').forEach((x) => x.classList.toggle('active', x === b));
  loadPrs();
});
$('#prFilter').addEventListener('input', renderPrList);
$('#prList').addEventListener('click', (e) => { const li = e.target.closest('[data-pr]'); if (li) openPr(Number(li.dataset.pr), { tab: S.tab === 'files' ? 'files' : 'conversation' }); });
$('#morePrs').addEventListener('click', () => loadPrs(true));
$('#refreshBtn').addEventListener('click', refresh);
const toggleSidebar = (v) => { document.body.classList.toggle('no-sidebar', v); store.set('noSidebar', v); };
toggleSidebar(store.get('noSidebar', false));
$('#sidebarBtn').addEventListener('click', () => toggleSidebar(!document.body.classList.contains('no-sidebar')));

function refresh() {
  if (!S.repo) return loadRepos();
  loadPrs();
  if (S.pr) openPr(S.pr.number, { tab: S.tab, file: S.file });
}

$('#mergeForm').addEventListener('submit', (e) => {
  if (e.submitter?.value === 'confirm') { e.preventDefault(); doMerge(); }
});

document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey || $('#mergeDialog').open) return;
  if (S.tab === 'files' && S.files) {
    if (e.key === 'j') { stepFile(1); e.preventDefault(); }
    if (e.key === 'k') { stepFile(-1); e.preventDefault(); }
    if (e.key === 'n') { stepChange(1); e.preventDefault(); }
    if (e.key === 'p') { stepChange(-1); e.preventDefault(); }
    if (e.key === 'v') { const f = currentFile(); if (f) setViewed(f, !isViewed(f)); }
  }
  if (e.key === 'r') refresh();
  if (e.key === 'l') toggleSidebar(!document.body.classList.contains('no-sidebar'));
});

window.addEventListener('hashchange', () => applyRoute());

async function applyRoute() {
  const r = parseHash();
  const repo = r.repo || store.get('repo', null);
  if (!repo) return;
  if (repo !== S.repo) await selectRepo(repo, { keepPr: !!r.pr });
  if (r.pr && (!S.pr || S.pr.number !== r.pr)) await openPr(r.pr, { tab: r.tab, file: r.file });
  else if (r.pr && S.pr) {
    if (r.tab !== S.tab) { if (r.file) S.file = r.file; showTab(r.tab); } else if (r.tab === 'files' && r.file && r.file !== S.file && S.files) selectFile(r.file);
  } else if (!r.pr) setHash(repo);
}

// ---------- Start ----------
document.querySelectorAll('#stateTabs button').forEach((b) => b.classList.toggle('active', b.dataset.state === S.state));
loadUser();
loadRepos();
applyRoute();
