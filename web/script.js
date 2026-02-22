(() => {
  const label = document.getElementById('server-label');
  if (!label) return;

  const host = window.location.hostname || 'bot-hosting.net';
  const port = window.location.port ? `:${window.location.port}` : '';
  label.textContent = `root@${host}${port}:~/deploy/sirius-home`;
})();
