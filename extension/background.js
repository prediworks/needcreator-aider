/**
 * Prospecting Assistant · service worker.
 * Loop: ask the server for the next task → open it in a dedicated tab → wait, scroll if the task is a list →
 * extract the visible text and links → send the result back. Guardrails are enforced here and cannot be disabled
 * from the server: random 5–10 s pause between pages, per-session and per-day caps, stop on login page / captcha /
 * restriction, no engagement of any kind (the extension only reads pages).
 */
const DEFAULTS = { serverUrl: '', token: '', role: 'reader', contactLookup: 'off', listFocus: 'on', minDelay: 5, maxDelay: 10, sessionCap: 60, dayCap: 150, pollSeconds: 25 };
// role 'reader' (secondary account): reads pages, never touches conversations. role 'messenger' (main account): only opens a conversation and pastes the prepared text.
const ROLE_TYPES = { reader: '', messenger: 'prefill_message' };
const LIST_TYPES = { list_hashtag: 8, list_ad_library: 6, list_tiktok_ads: 6 }; // number of scrolls for list pages

const state = { running: false, paused: false, busy: false, idle: false, tabId: null, session: 0, day: 0, dayKey: '', last: '', lastError: '', lastTask: null, stopReason: '', queue: { pending: 0, running: 0 }, log: [] };

async function settings() { return { ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) }; }
async function loadState() {
  const s = await chrome.storage.local.get(['running', 'paused', 'session', 'day', 'dayKey', 'log']);
  Object.assign(state, s);
  const today = new Date().toISOString().slice(0, 10);
  if (state.dayKey !== today) { state.day = 0; state.dayKey = today; }
}
async function saveState() { await chrome.storage.local.set({ running: state.running, paused: state.paused, session: state.session, day: state.day, dayKey: state.dayKey, log: state.log.slice(-40) }); }
function log(msg) { state.last = msg; state.log.push(`${new Date().toLocaleTimeString()} ${msg}`); if (state.log.length > 40) state.log.shift(); saveState().catch(() => {}); } // journal enregistré à chaque ligne : la fenêtre le voit en direct
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);

async function api(path, { method = 'GET', body } = {}) {
  const s = await settings();
  if (!s.serverUrl || !s.token) throw new Error('Server URL and token are not set (extension options)');
  const r = await fetch(s.serverUrl.replace(/\/$/, '') + path, { method, headers: { 'X-Extension-Token': s.token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

async function ensureTab(url, visible = false) {
  if (state.tabId) {
    try { await chrome.tabs.get(state.tabId); await chrome.tabs.update(state.tabId, { url, active: visible }); return state.tabId; } catch { state.tabId = null; }
  }
  const tab = await chrome.tabs.create({ url, active: visible });
  state.tabId = tab.id;
  return tab.id;
}

/**
 * List pages (hashtags, ad libraries) load their next items only while the page is really displayed: in a background tab the
 * scroll moves but nothing new is rendered. The tab is shown and its window brought to the front for the time of the reading,
 * then the tab and the window the user was on are put back.
 */
async function rememberFront() {
  // Taken before the working tab is shown: the tab and the window the user is on
  const before = { windowId: null, tabId: null };
  try {
    const focused = await chrome.windows.getLastFocused().catch(() => null);
    const work = state.tabId ? await chrome.tabs.get(state.tabId).catch(() => null) : null;
    const workWindow = work ? work.windowId : focused?.id;
    before.windowId = focused?.id ?? null;
    if (workWindow != null) { const [active] = await chrome.tabs.query({ active: true, windowId: workWindow }); before.tabId = active && active.id !== state.tabId ? active.id : null; }
  } catch { /* nothing to put back */ }
  return before;
}
async function showTab(tabId, before) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (before.windowId === tab.windowId) before.windowId = null; // same window: only the tab is put back
    await chrome.tabs.update(tabId, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
  } catch { /* tab closed meanwhile: the reading goes on as before */ }
  return before;
}
async function restoreTab(before) {
  try { if (before?.tabId) await chrome.tabs.update(before.tabId, { active: true }); } catch { /* tab closed by the user */ }
  try { if (before?.windowId) await chrome.windows.update(before.windowId, { focused: true }); } catch { /* window closed by the user */ }
}
function waitLoaded(tabId, timeoutMs = 30000) {
  return new Promise((resolve) => {
    const done = () => { chrome.tabs.onUpdated.removeListener(listener); resolve(); };
    const listener = (id, info) => { if (id === tabId && info.status === 'complete') done(); };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(done, timeoutMs);
  });
}
async function run(tabId, file) { const [r] = await chrome.scripting.executeScript({ target: { tabId }, files: [file] }); return r?.result; }

/**
 * Injected in an Instagram profile tab: the public contact address of a professional account (the one behind the « E-mail » button
 * of the mobile app). Two readings, no click and no engagement:
 *  1. a visible contact button or link that carries a mailto address;
 *  2. the profile data the site itself loads for this page (same request, same session), where the public business email is given.
 * Returns { email, source, category, professional } ; email is null when the account publishes none. Self-contained (serialized by chrome.scripting).
 */
async function readContactInPage() {
  const out = { email: null, source: null, category: null, professional: null, note: null };
  const valid = (e) => /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(String(e || '').trim());
  try {
    const m = location.pathname.match(/^\/([A-Za-z0-9._]{2,30})\/?$/);
    if (!/(^|\.)instagram\.com$/.test(location.hostname) || !m) { out.note = 'not a profile page'; return out; }
    for (const el of document.querySelectorAll('header a[href^="mailto:"], main a[href^="mailto:"]')) {
      const e = decodeURIComponent(el.getAttribute('href').replace(/^mailto:/i, '').split('?')[0]).trim().toLowerCase();
      if (valid(e)) { out.email = e; out.source = 'button'; return out; }
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const r = await fetch(`/api/v1/users/web_profile_info/?username=${encodeURIComponent(m[1])}`, { headers: { 'X-IG-App-ID': '936619743392459', 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'include', signal: ctrl.signal });
      if (!r.ok) { out.note = `profile data refused (${r.status})`; return out; }
      const u = (await r.json())?.data?.user;
      if (!u) { out.note = 'profile data empty'; return out; }
      out.professional = !!(u.is_business_account || u.is_professional_account);
      out.category = String(u.category_name || u.business_category_name || '').slice(0, 80) || null;
      const e = String(u.business_email || u.public_email || '').trim().toLowerCase();
      if (valid(e)) { out.email = e; out.source = 'contact'; }
    } finally { clearTimeout(timer); }
  } catch (err) { out.note = String(err && err.message || err).slice(0, 120); }
  return out;
}

async function readPage(task) {
  const s = await settings();
  const scrolls = LIST_TYPES[task.type] || 0;
  const visible = scrolls > 0 && s.listFocus !== 'off';
  const front = visible ? await rememberFront() : null;
  const tabId = await ensureTab(task.input.url, visible);
  const before = visible ? await showTab(tabId, front) : null;
  await waitLoaded(tabId);
  await sleep(rand(2500, 4500)); // let the page render its content
  // Lists are virtualized: items leave the page as it scrolls, so links are collected at every step and merged
  const collected = new Map();
  const collect = (p) => { for (const l of p?.links || []) if (!collected.has(l.href)) collected.set(l.href, l); };
  const steps = []; // links seen after each scroll: tells a page that loads from one that stays on its first items
  let shown = null;
  try {
    for (let i = 0; i < scrolls; i++) { const p = await run(tabId, 'extract.js'); collect(p); steps.push(collected.size); shown = p?.visibility || shown; await run(tabId, 'scroll.js'); await sleep(rand(1500, 3000)); }
  } finally { if (before) await restoreTab(before); }
  // Pages that fill in after load (single-page apps): read again until there is text, up to ~10 s
  let page = await run(tabId, 'extract.js');
  for (let i = 0; i < 6 && page && !page.blocked && page.text.length < 300; i++) { await sleep(1500); page = await run(tabId, 'extract.js'); }
  if (!page) throw new Error('page unreadable');
  if (collected.size) { collect(page); page.links = [...collected.values()].slice(0, 800); }
  if (scrolls) page.list = { steps, links: collected.size, visibility: shown || page.visibility || null };
  // Instagram profile: public contact address of the professional account. Off by default (the site answers 429 to this reading); one refusal stops it for the session
  if (task.type === 'read_profile' && !page.blocked && s.contactLookup === 'on' && !state.contactRefused && /^https?:\/\/(www\.)?instagram\.com\//i.test(task.input.url)) {
    try { const [c] = await chrome.scripting.executeScript({ target: { tabId }, func: readContactInPage }); if (c?.result) page.contact = c.result; if (/refused \((401|403|429)\)/.test(c?.result?.note || '')) { state.contactRefused = true; log('Contact reading refused by the site: not tried again until the extension is restarted.'); } }
    catch (err) { page.contact = { email: null, note: String(err.message).slice(0, 120) }; }
  }
  await sleep(rand(s.minDelay * 1000, s.maxDelay * 1000)); // pause between two pages
  return page;
}

/**
 * Injected in the profile tab (Instagram, TikTok, LinkedIn): opens the conversation and pastes the text.
 * Never clicks Send: sending is the user's gesture. Self-contained (serialized by chrome.scripting).
 */
async function prefillInPage(text) {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const visible = (el) => !!el && el.offsetParent !== null;
  const findButton = (patterns) => {
    const els = [...document.querySelectorAll('div[role="button"], button, a[role="link"], a')];
    return els.find(el => visible(el) && patterns.some(p => p.test((el.innerText || el.getAttribute('aria-label') || '').trim())));
  };
  const findEditor = () => [...document.querySelectorAll('div[role="textbox"][contenteditable="true"], textarea, div[contenteditable="true"]')].find(visible);
  try {
    let editor = findEditor();
    if (!editor) {
      // Profile page: the "Message" button opens the conversation (Instagram: « Message » / « Envoyer un message » ; TikTok/LinkedIn similar)
      const btn = findButton([/^(message|envoyer un message|send message|contacter|nachricht senden|mensaje)$/i, /^message$/i]);
      if (!btn) return { prefilled: false, copied: false, error: 'bouton Message introuvable sur la page' };
      btn.click();
      for (let i = 0; i < 20 && !editor; i++) { await sleep(500); editor = findEditor(); }
      if (!editor) return { prefilled: false, copied: false, error: 'la conversation ne s\'est pas ouverte' };
    }
    editor.focus();
    await sleep(300);
    const has = () => (editor.innerText || editor.value || '').includes(text.slice(0, 20));
    if (has()) return { prefilled: true, copied: false }; // déjà collé (tâche redonnée)
    try { document.execCommand('insertText', false, text); } catch { /* éditeur sans execCommand */ }
    await sleep(600); // l'éditeur met à jour son contenu après coup : vérifier avant tout collage de secours
    if (!has()) {
      // Editors that ignore execCommand: paste event with the text as clipboard data
      try {
        const dt = new DataTransfer(); dt.setData('text/plain', text);
        editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
        await sleep(600);
      } catch { /* collage de secours impossible */ }
    }
    if (has()) return { prefilled: true, copied: false };
    try { await navigator.clipboard.writeText(text); return { prefilled: false, copied: true }; } catch { return { prefilled: false, copied: false, error: 'collage impossible dans cet éditeur' }; }
  } catch (err) { return { prefilled: false, copied: false, error: String(err && err.message || err) }; }
}

async function prefillMessage(task) {
  const tab = await chrome.tabs.create({ url: task.input.url, active: true }); // visible: the user sends the message
  await waitLoaded(tab.id);
  await sleep(rand(2500, 4000));
  const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: prefillInPage, args: [task.input.text] });
  return r?.result || { prefilled: false, copied: false, error: 'no result from the page' };
}

async function tick() {
  await ensureLoaded();
  if (!state.running || state.paused || state.busy) return;
  state.busy = true;
  try {
    const s = await settings();
    // Daily cap first: at the daily cap a new session would stop at once, the message must say so
    if (state.day >= s.dayCap) { state.running = false; state.stopReason = 'day'; log(`Daily cap reached (${s.dayCap} pages). Stopped until tomorrow: the remaining tasks stay in the queue.`); await saveState(); return; }
    if (state.session >= s.sessionCap) { state.running = false; state.stopReason = 'session'; log(`Session cap reached (${s.sessionCap} pages). Stopped on purpose: take a break, then press Start for a new session (${Math.max(0, s.dayCap - state.day)} pages left today).`); await saveState(); return; }
    const roleTypes = ROLE_TYPES[s.role] || '';
    const next = await api(`/ext/next${roleTypes ? `?types=${roleTypes}` : ''}`);
    state.queue = { pending: next.pending || 0, running: next.running || 0 };
    if (!next.task) { log(s.role === 'messenger' ? `No message to prepare${state.queue.pending ? ` (${state.queue.pending} reading task(s) wait for the Reader profile)` : ''}. Polling again in a moment.` : 'No reading task waiting. Polling again in a moment.'); state.lastTask = null; state.idle = true; return; }
    state.idle = false;
    const task = next.task;
    state.lastTask = { type: task.type, url: task.input.url };
    if (task.type === 'prefill_message') {
      // Messenger role: open the profile in a visible tab, open the conversation, paste the text, stop there
      log(`Preparing a message on ${task.input.url}`);
      let r;
      try { r = await prefillMessage(task); } catch (err) { r = { prefilled: false, copied: false, error: err.message }; }
      const res2 = await api(`/ext/${task.id}/result`, { method: 'POST', body: { url: task.input.url, text: '', links: [], ...r } });
      log(r.prefilled ? 'Message pasted: read it over and press Send yourself.' : r.copied ? 'Conversation not found: the message is in your clipboard, paste it by hand.' : `Could not prepare the message: ${r.error || res2.outcome}`);
      state.session += 1; state.day += 1;
      await saveState();
      return;
    }
    log(`Reading ${task.type}: ${task.input.url}`);
    let page;
    try { page = await readPage(task); }
    catch (err) { await api(`/ext/${task.id}/result`, { method: 'POST', body: { url: task.input.url, blocked: 'error', error: err.message, text: '', links: [] } }); log(`Page error: ${err.message}`); return; }
    state.session += 1; state.day += 1;
    const res = await api(`/ext/${task.id}/result`, { method: 'POST', body: page });
    if (page.blocked) {
      state.running = false;
      log(page.blocked === 'consent' ? 'Stopped: the site asks to accept cookies. Open the tab, accept once, then start again.' : `Stopped: the site showed a ${page.blocked} page. Open the tab, sort it out by hand, then start again later.`);
      chrome.action.setBadgeText({ text: '!' }); chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
    } else {
      log(`Done: ${res.outcome || 'result sent'}${page.contact ? (page.contact.email ? ' · contact address read' : page.contact.note ? ` · contact: ${page.contact.note}` : ' · no public contact address') : ''}`);
    }
    await saveState();
  } catch (err) {
    state.lastError = err.message;
    log(`Error: ${err.message}`);
    if (/token|401/i.test(err.message)) { state.running = false; await saveState(); }
  } finally {
    state.busy = false;
    if (state.running && !state.paused && !state.idle) setTimeout(tick, 500); // chain tasks while there is work; when the queue is empty the alarm polls every pollSeconds
  }
}

chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'poll') tick(); });
async function schedulePoll() { const s = await settings(); chrome.alarms.create('poll', { periodInMinutes: Math.max(0.5, s.pollSeconds / 60) }); }

let loaded = false;
async function ensureLoaded() { if (!loaded) { await loadState(); loaded = true; } } // l'état enregistré n'écrase jamais une exécution en cours

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  (async () => {
    await ensureLoaded();
    if (msg.type === 'start') { state.running = true; state.paused = false; state.session = 0; state.lastError = ''; state.stopReason = ''; chrome.action.setBadgeText({ text: '' }); log('Started.'); await saveState(); await schedulePoll(); tick(); }
    else if (msg.type === 'pause') { state.paused = !state.paused; log(state.paused ? 'Paused.' : 'Resumed.'); await saveState(); if (!state.paused) tick(); }
    else if (msg.type === 'stop') { state.running = false; state.paused = false; log('Stopped.'); await saveState(); }
    else if (msg.type === 'status') {
      try { const st = await api('/ext/status'); state.queue = { pending: st.pending || 0, running: st.running || 0 }; state.lastError = ''; } catch (err) { state.lastError = err.message; }
    }
    const s = await settings();
    reply({ ...state, role: s.role, sessionCap: s.sessionCap, dayCap: s.dayCap, log: state.log.slice(-12) });
  })();
  return true;
});

chrome.runtime.onInstalled.addListener(async () => { await ensureLoaded(); state.running = false; await saveState(); });
ensureLoaded();
