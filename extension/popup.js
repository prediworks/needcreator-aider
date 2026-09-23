const $ = (id) => document.getElementById(id);
function render(s) {
  $('state').textContent = !s.running ? 'Stopped' : s.paused ? 'Paused' : s.busy ? `Working · ${s.lastTask ? s.lastTask.type : ''}` : 'Waiting for tasks';
  $('pending').textContent = s.queue ? s.queue.pending : '–';
  $('session').textContent = s.session ?? 0;
  $('day').textContent = s.day ?? 0;
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
