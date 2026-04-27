(() => {
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
    overlayHost.style.top = '12px';
    overlayHost.style.right = '12px';
    overlayHost.style.zIndex = '2147483647';
    overlayHost.style.pointerEvents = 'none';

    const shadow = overlayHost.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        .overlay {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          border-radius: 12px;
          background: rgba(15, 23, 42, 0.86);
          color: #f8fafc;
          border: 1px solid rgba(148, 163, 184, 0.35);
          box-shadow: 0 10px 20px rgba(15, 23, 42, 0.3);
          min-width: 170px;
          max-width: min(420px, 70vw);
          font-family: "Segoe UI", Arial, sans-serif;
        }

        .dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          flex-shrink: 0;
          margin-top: 2px;
        }

        .dot.gafam {
          background: #dc2626;
        }

        .dot.non-gafam {
          background: #16a34a;
        }

        .text {
          display: grid;
          gap: 1px;
          min-width: 0;
        }

        .title {
          font-size: 12px;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .host {
          font-size: 11px;
          opacity: 0.85;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      </style>
      <div class="overlay">
        <span class="dot non-gafam" id="status-dot"></span>
        <div class="text">
          <div class="title" id="status-title"></div>
          <div class="host" id="status-host"></div>
        </div>
      </div>
    `;

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
