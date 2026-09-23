/**
 * Prospecting Assistant · service worker.
 * Loop: ask the server for the next task → open it in a dedicated tab → wait, scroll if the task is a list →
 * extract the visible text and links → send the result back. Guardrails are enforced here and cannot be disabled
 * from the server: random 5–10 s pause between pages, per-session and per-day caps, stop on login page / captcha /
 * restriction, no engagement of any kind (the extension only reads pages).
 */
const DEFAULTS = { serverUrl: '', token: '', minDelay: 5, maxDelay: 10, sessionCap: 60, dayCap: 150, pollSeconds: 25 };
const LIST_TYPES = { list_hashtag: 4, list_ad_library: 6 }; // number of scrolls for list pages

const state = { running: false, paused: false, busy: false, tabId: null, session: 0, day: 0, dayKey: '', last: '', lastError: '', lastTask: null, queue: { pending: 0, running: 0 }, log: [] };

async function settings() { return { ...DEFAULTS, ...(await chrome.storage.local.get(Object.keys(DEFAULTS))) }; }
async function loadState() {
  const s = await chrome.storage.local.get(['running', 'paused', 'session', 'day', 'dayKey', 'log']);
  Object.assign(state, s);
  const today = new Date().toISOString().slice(0, 10);
  if (state.dayKey !== today) { state.day = 0; state.dayKey = today; }
}
async function saveState() { await chrome.storage.local.set({ running: state.running, paused: state.paused, session: state.session, day: state.day, dayKey: state.dayKey, log: state.log.slice(-40) }); }
function log(msg) { state.last = msg; state.log.push(`${new Date().toLocaleTimeString()} ${msg}`); if (state.log.length > 40) state.log.shift(); }
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

async function ensureTab(url) {
  if (state.tabId) {
    try { await chrome.tabs.get(state.tabId); await chrome.tabs.update(state.tabId, { url, active: false }); return state.tabId; } catch { state.tabId = null; }
  }
  const tab = await chrome.tabs.create({ url, active: false });
  state.tabId = tab.id;
  return tab.id;
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

async function readPage(task) {
  const s = await settings();
  const tabId = await ensureTab(task.input.url);
  await waitLoaded(tabId);
  await sleep(rand(2500, 4500)); // let the page render its content
  const scrolls = LIST_TYPES[task.type] || 0;
  for (let i = 0; i < scrolls; i++) { await run(tabId, 'scroll.js'); await sleep(rand(1500, 3000)); }
  // Pages that fill in after load (single-page apps): read again until there is text, up to ~10 s
  let page = await run(tabId, 'extract.js');
  for (let i = 0; i < 6 && page && !page.blocked && page.text.length < 300; i++) { await sleep(1500); page = await run(tabId, 'extract.js'); }
  if (!page) throw new Error('page unreadable');
  await sleep(rand(s.minDelay * 1000, s.maxDelay * 1000)); // pause between two pages
  return page;
}

async function tick() {
  if (!state.running || state.paused || state.busy) return;
  state.busy = true;
  try {
    const s = await settings();
    if (state.session >= s.sessionCap) { state.running = false; log(`Session cap reached (${s.sessionCap} pages). Stopped.`); await saveState(); return; }
    if (state.day >= s.dayCap) { state.running = false; log(`Daily cap reached (${s.dayCap} pages). Stopped.`); await saveState(); return; }
    const next = await api('/ext/next');
    state.queue = { pending: next.pending || 0, running: next.running || 0 };
    if (!next.task) { log('No task waiting. Polling again shortly.'); state.lastTask = null; return; }
    const task = next.task;
    state.lastTask = { type: task.type, url: task.input.url };
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
      log(`Done: ${res.outcome || 'result sent'}`);
    }
    await saveState();
  } catch (err) {
    state.lastError = err.message;
    log(`Error: ${err.message}`);
    if (/token|401/i.test(err.message)) { state.running = false; await saveState(); }
  } finally {
    state.busy = false;
    if (state.running && !state.paused) setTimeout(tick, 500); // chain tasks while there is work; alarm covers idle polling
  }
}

chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'poll') tick(); });
async function schedulePoll() { const s = await settings(); chrome.alarms.create('poll', { periodInMinutes: Math.max(0.5, s.pollSeconds / 60) }); }

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  (async () => {
    await loadState();
    if (msg.type === 'start') { state.running = true; state.paused = false; state.session = 0; state.lastError = ''; chrome.action.setBadgeText({ text: '' }); log('Started.'); await saveState(); await schedulePoll(); tick(); }
    else if (msg.type === 'pause') { state.paused = !state.paused; log(state.paused ? 'Paused.' : 'Resumed.'); await saveState(); if (!state.paused) tick(); }
    else if (msg.type === 'stop') { state.running = false; state.paused = false; log('Stopped.'); await saveState(); }
    else if (msg.type === 'status') {
      try { const st = await api('/ext/status'); state.queue = { pending: st.pending || 0, running: st.running || 0 }; state.lastError = ''; } catch (err) { state.lastError = err.message; }
    }
    reply({ ...state, log: state.log.slice(-12) });
  })();
  return true;
});

chrome.runtime.onInstalled.addListener(async () => { await loadState(); state.running = false; await saveState(); });
loadState();
