(() => {
  if (window.__gafamLiveOverlayInitialized) {
    return;
  }
  window.__gafamLiveOverlayInitialized = true;

  if (window.top !== window) {
    return;
  }

  const SETTINGS_KEY = 'settings';
  const GAFAM_DOMAINS = [
    'google.com', 'youtube.com', 'gmail.com', 'apple.com', 'icloud.com',
    'facebook.com', 'instagram.com', 'whatsapp.com', 'messenger.com',
    'amazon.com', 'amazon.de', 'amazon.at', 'amazon.co.uk', 'aws.amazon.com',
    'microsoft.com', 'linkedin.com', 'bing.com', 'office.com', 'outlook.com'
  ];

  let overlayHost = null;
  let overlayEnabled = false;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      void initializeOverlay();
    }, { once: true });
  } else {
    void initializeOverlay();
  }

  async function initializeOverlay() {
    const settings = await loadSettings();
    overlayEnabled = Boolean(settings.liveOverlayEnabled);
    updateOverlay();

    browser.runtime.onMessage.addListener((message) => {
      if (!message || message.type !== 'overlaySettingChanged') {
        return false;
      }

      overlayEnabled = Boolean(message.liveOverlayEnabled);
      updateOverlay();
      return false;
    });

    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[SETTINGS_KEY]) {
        return;
      }

      const next = normalizeSettings(changes[SETTINGS_KEY].newValue);
      overlayEnabled = Boolean(next.liveOverlayEnabled);
      updateOverlay();
    });

    window.setInterval(() => {
      updateOverlay();
    }, 1000);
  }

  function normalizeSettings(settings) {
    return Object.assign({ liveOverlayEnabled: false, blockGafamEnabled: false }, settings || {});
  }

  async function loadSettings() {
    const data = await browser.storage.local.get(SETTINGS_KEY);
    return normalizeSettings(data[SETTINGS_KEY]);
  }

  function isGafamHost(hostname) {
    const host = (hostname || '').toLowerCase();
    return GAFAM_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
  }

  function getPageTitle() {
    if (document.title && document.title.trim()) {
      return document.title.trim();
    }
    return window.location.hostname || 'Unbekannte Seite';
  }

  function ensureOverlay() {
    if (overlayHost) {
      return overlayHost;
    }

    overlayHost = document.createElement('div');
    overlayHost.id = 'gafam-live-overlay-host';
    overlayHost.style.position = 'fixed';
    overlayHost.style.top = '8px';
    overlayHost.style.right = '8px';
    overlayHost.style.zIndex = '2147483647';
    overlayHost.style.pointerEvents = 'none';

    const shadow = overlayHost.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      .overlay {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 6px 8px;
        border-radius: 10px;
        background: rgba(15, 23, 42, 0.72);
        color: #f8fafc;
        border: 1px solid rgba(148, 163, 184, 0.2);
        box-shadow: 0 8px 14px rgba(15, 23, 42, 0.18);
        min-width: 140px;
        max-width: min(260px, 42vw);
        font-family: "Segoe UI", Arial, sans-serif;
      }

      .dot {
        width: 9px;
        height: 9px;
        border-radius: 999px;
        flex-shrink: 0;
        margin-top: 1px;
      }

      .dot.gafam {
        background: #dc2626;
      }

      .dot.non-gafam {
        background: #16a34a;
      }

      .text {
        display: grid;
        gap: 0;
        min-width: 0;
      }

      .title {
        font-size: 11px;
        font-weight: 700;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .host {
        font-size: 10px;
        opacity: 0.75;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    `;

    const overlay = document.createElement('div');
    overlay.className = 'overlay';

    const dot = document.createElement('span');
    dot.className = 'dot non-gafam';
    dot.id = 'status-dot';

    const text = document.createElement('div');
    text.className = 'text';

    const title = document.createElement('div');
    title.className = 'title';
    title.id = 'status-title';

    const host = document.createElement('div');
    host.className = 'host';
    host.id = 'status-host';

    text.appendChild(title);
    text.appendChild(host);
    overlay.appendChild(dot);
    overlay.appendChild(text);

    shadow.appendChild(style);
    shadow.appendChild(overlay);

    document.documentElement.appendChild(overlayHost);
    return overlayHost;
  }

  function removeOverlay() {
    if (!overlayHost) {
      return;
    }

    overlayHost.remove();
    overlayHost = null;
  }

  function updateOverlay() {
    if (!overlayEnabled) {
      removeOverlay();
      return;
    }

    const host = window.location.hostname || '-';
    const gafam = isGafamHost(host);
    const title = getPageTitle();

    const liveOverlay = ensureOverlay();
    const shadow = liveOverlay.shadowRoot;
    const dot = shadow.getElementById('status-dot');
    const titleNode = shadow.getElementById('status-title');
    const hostNode = shadow.getElementById('status-host');

    dot.classList.toggle('gafam', gafam);
    dot.classList.toggle('non-gafam', !gafam);
    titleNode.textContent = title;
    hostNode.textContent = host;
  }
})();
