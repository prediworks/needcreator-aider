const $ = (id) => document.getElementById(id);
function render(s) {
  const why = { session: 'session cap reached, press Start for a new session', day: 'daily cap reached, back tomorrow' }[s.stopReason] || '';
  $('state').textContent = !s.running ? `Stopped${why ? ` · ${why}` : ''}` : s.paused ? 'Paused' : s.busy ? `Working · ${s.lastTask ? s.lastTask.type : ''}` : 'Waiting for tasks';
  $('role').textContent = s.role === 'messenger' ? 'Messenger · prepares messages only' : 'Reader · reads pages only';
  $('role').className = s.role === 'messenger' ? 'role messenger' : 'role';
  $('session').textContent = `${s.session ?? 0}${s.sessionCap ? ` / ${s.sessionCap}` : ''}`;
  $('day').textContent = `${s.day ?? 0}${s.dayCap ? ` / ${s.dayCap}` : ''}`;
  $('pending').textContent = s.queue ? s.queue.pending : '–';
  $('error').textContent = s.lastError || '';
  $('log').textContent = (s.log || []).slice().reverse().join('\n');
  $('start').disabled = !!s.running && !s.paused;
  $('pause').textContent = s.paused ? 'Resume' : 'Pause';
  $('pause').disabled = !s.running;
  $('stop').disabled = !s.running;
}
const send = (type) => chrome.runtime.sendMessage({ type }, (s) => s && render(s));
$('start').onclick = () => send('start');
$('pause').onclick = () => send('pause');
$('stop').onclick = () => send('stop');
send('status');
setInterval(() => send('status'), 4000);
