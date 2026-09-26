/**
 * Prospecting Assistant · service worker.
 * Loop: ask the server for the next task → open it in a dedicated tab → wait, scroll if the task is a list →
 * extract the visible text and links → send the result back. Guardrails are enforced here and cannot be disabled
 * from the server: random 5–10 s pause between pages, per-session and per-day caps, stop on login page / captcha /
 * restriction, no engagement of any kind (the extension only reads pages).
 */
const DEFAULTS = { serverUrl: '', token: '', role: 'reader', minDelay: 5, maxDelay: 10, sessionCap: 60, dayCap: 150, pollSeconds: 25 };
// role 'reader' (secondary account): reads pages, never touches conversations. role 'messenger' (main account): only opens a conversation and pastes the prepared text.
const ROLE_TYPES = { reader: '', messenger: 'prefill_message' };
const LIST_TYPES = { list_hashtag: 4, list_ad_library: 6 }; // number of scrolls for list pages

const state = { running: false, paused: false, busy: false, idle: false, tabId: null, session: 0, day: 0, dayKey: '', last: '', lastError: '', lastTask: null, queue: { pending: 0, running: 0 }, log: [] };

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
    let ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch { ok = false; }
    if (!ok || !(editor.innerText || editor.value || '').includes(text.slice(0, 20))) {
      // Editors that ignore execCommand: paste event with the text as clipboard data
      try {
        const dt = new DataTransfer(); dt.setData('text/plain', text);
        editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
        await sleep(300);
        ok = (editor.innerText || editor.value || '').includes(text.slice(0, 20));
      } catch { ok = false; }
    }
    if (ok) return { prefilled: true, copied: false };
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
  if (!state.running || state.paused || state.busy) return;
  state.busy = true;
  try {
    const s = await settings();
    if (state.session >= s.sessionCap) { state.running = false; log(`Session cap reached (${s.sessionCap} pages). Stopped.`); await saveState(); return; }
    if (state.day >= s.dayCap) { state.running = false; log(`Daily cap reached (${s.dayCap} pages). Stopped.`); await saveState(); return; }
    const roleTypes = ROLE_TYPES[s.role] || '';
    const next = await api(`/ext/next${roleTypes ? `?types=${roleTypes}` : ''}`);
    state.queue = { pending: next.pending || 0, running: next.running || 0 };
    if (!next.task) { log('No task waiting. Polling again in a moment.'); state.lastTask = null; state.idle = true; return; }
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
      log(`Done: ${res.outcome || 'result sent'}`);
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
