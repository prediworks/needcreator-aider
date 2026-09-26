const KEYS = ['serverUrl', 'token', 'role', 'minDelay', 'maxDelay', 'sessionCap', 'dayCap'];
const DEF = { role: 'reader', minDelay: 5, maxDelay: 10, sessionCap: 60, dayCap: 150 };
const $ = (id) => document.getElementById(id);
chrome.storage.local.get(KEYS, (s) => { for (const k of KEYS) $(k).value = s[k] ?? DEF[k] ?? ''; });
$('save').onclick = async () => {
  const v = {};
  for (const k of KEYS) v[k] = $(k).value.trim();
  v.minDelay = Math.max(5, +v.minDelay || 5); v.maxDelay = Math.max(v.minDelay, +v.maxDelay || 10);
  v.sessionCap = Math.min(100, Math.max(1, +v.sessionCap || 60)); v.dayCap = Math.min(300, Math.max(1, +v.dayCap || 150));
  v.serverUrl = v.serverUrl.replace(/\/$/, '');
  v.role = v.role === 'messenger' ? 'messenger' : 'reader';
  await chrome.storage.local.set(v);
  // Host permission for the server origin: lets the extension call any server without CORS set-up on its side
  try { const origin = new URL(v.serverUrl).origin + '/*'; await chrome.permissions.request({ origins: [origin] }); } catch { /* invalid URL or refused: the server may still allow chrome-extension origins */ }
  for (const k of KEYS) $(k).value = v[k];
  $('msg').textContent = 'Saved.';
};
$('test').onclick = async () => {
  const s = await chrome.storage.local.get(['serverUrl', 'token']);
  try {
    const r = await fetch(s.serverUrl + '/ext/status', { headers: { 'X-Extension-Token': s.token } });
    const d = await r.json().catch(() => ({}));
    $('msg').textContent = r.ok ? `Connected · ${d.pending} task(s) waiting` : `Refused: ${d.error || r.status}`;
  } catch (err) { $('msg').textContent = `Unreachable: ${err.message}`; }
};
