document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const company = params.get('company') || 'GAFAM';
  const url = params.get('url') || '-';

  const copy = document.getElementById('blocked-copy');
  const urlNode = document.getElementById('blocked-url');

  copy.textContent = `Diese Seite wurde als ${company}-Anbieter erkannt und durch den Blocker gestoppt.`;
  urlNode.textContent = url;

  document.getElementById('go-back').addEventListener('click', () => {
    window.history.back();
  });

  document.getElementById('open-settings').addEventListener('click', () => {
    const settingsUrl = browser.runtime.getURL('settings/settings.html');
    window.location.href = settingsUrl;
  });
});
