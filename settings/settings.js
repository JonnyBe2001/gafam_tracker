const SETTINGS_KEY = 'settings';
const DEFAULT_SETTINGS = {
  liveOverlayEnabled: false,
  blockGafamEnabled: false
};

document.addEventListener('DOMContentLoaded', () => {
  void initializeSettings();
});

async function initializeSettings() {
  const liveToggle = document.getElementById('toggle-live-overlay');
  const blockToggle = document.getElementById('toggle-block-gafam');

  const settings = await loadSettings();
  applySettingsToToggles(settings, liveToggle, blockToggle);

  liveToggle.addEventListener('change', async () => {
    await saveSettings({ liveOverlayEnabled: liveToggle.checked });
  });

  blockToggle.addEventListener('change', async () => {
    await saveSettings({ blockGafamEnabled: blockToggle.checked });
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[SETTINGS_KEY]) {
      return;
    }

    const nextSettings = normalizeSettings(changes[SETTINGS_KEY].newValue);
    applySettingsToToggles(nextSettings, liveToggle, blockToggle);
    renderSaveStatus('Einstellungen wurden synchronisiert.');
  });
}

function applySettingsToToggles(settings, liveToggle, blockToggle) {
  liveToggle.checked = Boolean(settings.liveOverlayEnabled);
  blockToggle.checked = Boolean(settings.blockGafamEnabled);
}

function normalizeSettings(settings) {
  return Object.assign({}, DEFAULT_SETTINGS, settings || {});
}

async function loadSettings() {
  try {
    const response = await browser.runtime.sendMessage({ type: 'getSettings' });
    if (response && response.settings) {
      return normalizeSettings(response.settings);
    }
  } catch (error) {
    // Ignore and use storage fallback.
  }

  const data = await browser.storage.local.get(SETTINGS_KEY);
  return normalizeSettings(data[SETTINGS_KEY]);
}

async function saveSettings(partialSettings) {
  try {
    const response = await browser.runtime.sendMessage({
      type: 'setSettings',
      settings: partialSettings
    });

    if (response && response.settings) {
      renderSaveStatus('Einstellung gespeichert.');
      return normalizeSettings(response.settings);
    }
  } catch (error) {
    // Fallback to direct storage update.
  }

  const current = await loadSettings();
  const next = normalizeSettings(Object.assign({}, current, partialSettings));
  await browser.storage.local.set({ [SETTINGS_KEY]: next });
  renderSaveStatus('Einstellung gespeichert.');
  return next;
}

function renderSaveStatus(text) {
  const status = document.getElementById('save-status');
  status.textContent = text;
  window.setTimeout(() => {
    if (status.textContent === text) {
      status.textContent = '';
    }
  }, 1800);
}
