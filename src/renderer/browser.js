// The Atelier browser's toolbar.
(function () {
  const $ = (id) => document.getElementById(id);
  const api = window.atelierBrowser;
  let editing = false;
  $('back').onclick = () => api.command('back');
  $('forward').onclick = () => api.command('forward');
  $('reload').onclick = () => api.command('reload');
  $('external').onclick = () => api.command('external');
  $('url').onfocus = () => { editing = true; $('url').select(); };
  $('url').onblur = () => { editing = false; };
  $('go').onsubmit = (e) => { e.preventDefault(); editing = false; api.command('go', $('url').value); $('url').blur(); };
  $('capture').onclick = async () => {
    $('capture').disabled = true;
    $('status').textContent = 'Reading the page…';
    await api.capture({ save: false });
    $('capture').disabled = false;
  };
  let last = { url: '', text: '' };
  const show = (t) => { $('status').textContent = t || ''; $('status').title = t || ''; };
  api.onState((s) => {
    if (!editing) $('url').value = s.url || '';
    $('back').disabled = !s.canGoBack;
    $('forward').disabled = !s.canGoForward;
    $('reload').textContent = s.loading ? '×' : '↻';
    if (s.captured) last = { url: s.url, text: `✓ ${s.captured.updated ? 'Updated' : 'Added to Discover'}: ${s.captured.name}` };
    else if (s.captureError) last = { url: s.url, text: `Couldn’t capture: ${s.captureError}` };
    if (s.capturing) show('Reading the page…');
    else if (s.loading) show('Loading…');
    else if (last.url && last.url === s.url) show(last.text);
    else show(s.purpose || '');
  });
})();
