const GAFAM_SITES = {
  google: {
    label: 'Google',
    domains: ['google.com', 'youtube.com', 'google.de', 'gmail.com', 'google.at', 'google.ch']
  },
  apple: {
    label: 'Apple',
    domains: ['apple.com', 'icloud.com']
  },
  facebook: {
    label: 'Meta',
    domains: ['facebook.com', 'instagram.com', 'whatsapp.com', 'messenger.com']
  },
  amazon: {
    label: 'Amazon',
    domains: ['amazon.com', 'amazon.de', 'amazon.at', 'amazon.co.uk', 'aws.amazon.com']
  },
  microsoft: {
    label: 'Microsoft',
    domains: ['microsoft.com', 'linkedin.com', 'bing.com', 'office.com', 'outlook.com']
  }
};

const STORAGE_KEY = 'trackingData';
const SETTINGS_KEY = 'settings';
const BLOCKED_PAGE_PATH = 'pages/blocked.html';
const MAX_VISITS = 1000;
const OTHER_COMPANY_KEY = 'other';
const DEFAULT_SETTINGS = {
  liveOverlayEnabled: false,
  blockGafamEnabled: false
};

let currentSession = null;
let browserIsFocused = true;

function createEmptyTrackingData() {
  return {
    totalTime: 0,
    gafamTime: 0,
    providerTotals: {
      google: 0,
      apple: 0,
      facebook: 0,
      amazon: 0,
      microsoft: 0,
      other: 0
    },
    companyTotals: {
      google: 0,
      apple: 0,
      facebook: 0,
      amazon: 0,
      microsoft: 0,
      other: 0
    },
    pageTotals: {},
    visitLog: []
  };
}

function normalizeSettings(settings) {
  return Object.assign({}, DEFAULT_SETTINGS, settings || {});
}

async function loadSettings() {
  const data = await browser.storage.local.get(SETTINGS_KEY);
  return normalizeSettings(data[SETTINGS_KEY]);
}

async function saveSettings(partialSettings) {
  const current = await loadSettings();
  const next = normalizeSettings(Object.assign({}, current, partialSettings || {}));
  await browser.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

async function injectLiveOverlayIntoTab(tabId) {
  try {
    await browser.tabs.executeScript(tabId, {
      file: 'overlay/live_status_overlay.js'
    });
  } catch (error) {
    // Some tabs cannot be scripted (for example browser internal pages).
  }
}

async function refreshLiveOverlayOnOpenTabs() {
  const settings = await loadSettings();
  if (!settings.liveOverlayEnabled) {
    return;
  }

  const tabs = await browser.tabs.query({});
  for (const tab of tabs) {
    if (tab && tab.id && isTrackableUrl(tab.url)) {
      await injectLiveOverlayIntoTab(tab.id);
    }
  }
}

async function notifyLiveOverlayStateOnOpenTabs(enabled) {
  const tabs = await browser.tabs.query({});
  for (const tab of tabs) {
    if (!tab || !tab.id || !isTrackableUrl(tab.url)) {
      continue;
    }

    try {
      await browser.tabs.sendMessage(tab.id, {
        type: 'overlaySettingChanged',
        liveOverlayEnabled: Boolean(enabled)
      });
    } catch (error) {
      // Tab has no content script or cannot receive messages.
    }
  }
}

function normalizeTrackingData(data) {
  const base = createEmptyTrackingData();
  const merged = Object.assign(base, data || {});
  merged.providerTotals = Object.assign(createEmptyTrackingData().providerTotals, merged.providerTotals || {});
  merged.companyTotals = Object.assign(createEmptyTrackingData().companyTotals, merged.companyTotals || {});
  merged.pageTotals = merged.pageTotals || {};
  merged.visitLog = Array.isArray(merged.visitLog) ? merged.visitLog : [];
  return merged;
}

async function loadTrackingData() {
  const data = await browser.storage.local.get(STORAGE_KEY);
  if (data[STORAGE_KEY]) {
    return normalizeTrackingData(data[STORAGE_KEY]);
  }

  const legacy = await browser.storage.local.get(['totalTime', 'gafamTime']);
  const migrated = createEmptyTrackingData();
  migrated.totalTime = legacy.totalTime || 0;
  migrated.gafamTime = legacy.gafamTime || 0;
  return migrated;
}

async function saveTrackingData(trackingData) {
  await browser.storage.local.set({ [STORAGE_KEY]: trackingData });
}

function isTrackableUrl(url) {
  return typeof url === 'string' && url.trim().length > 0;
}

function normalizeUrl(url) {
  try {
    const parsedUrl = new URL(url);
    parsedUrl.hash = '';
    return parsedUrl.toString();
  } catch (error) {
    return url;
  }
}

function getCompanyKey(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return Object.entries(GAFAM_SITES).find(([, company]) => company.domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`)))?.[0] || null;
  } catch (error) {
    return null;
  }
}

function getCompanyLabel(companyKey) {
  if (companyKey === OTHER_COMPANY_KEY) {
    return 'Nicht-GAFAM';
  }

  return GAFAM_SITES[companyKey]?.label || companyKey || 'Unbekannt';
}

function getProviderKey(url) {
  return getCompanyKey(url) || OTHER_COMPANY_KEY;
}

function isExtensionUrl(url) {
  return typeof url === 'string' && url.startsWith(browser.runtime.getURL(''));
}

function buildBlockedPageUrl(url, companyKey) {
  const blockedPageUrl = new URL(browser.runtime.getURL(BLOCKED_PAGE_PATH));
  blockedPageUrl.searchParams.set('url', url);
  blockedPageUrl.searchParams.set('company', companyKey || '');
  return blockedPageUrl.toString();
}

function isBlockedPageUrl(url) {
  return typeof url === 'string' && url.startsWith(browser.runtime.getURL(BLOCKED_PAGE_PATH));
}

function getOriginalUrlFromBlockedPage(url) {
  try {
    const blockedUrl = new URL(url);
    const originalUrl = blockedUrl.searchParams.get('url');
    return originalUrl && originalUrl.trim() ? originalUrl : null;
  } catch (error) {
    return null;
  }
}

function getSessionLabel(companyKey) {
  return getCompanyLabel(companyKey || OTHER_COMPANY_KEY);
}

function getPageTitle(tab) {
  if (tab && typeof tab.title === 'string' && tab.title.trim()) {
    return tab.title.trim();
  }
  return 'Unbenannte Seite';
}

function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch (error) {
    return '';
  }
}

function createSession(tab) {
  if (!isTrackableUrl(tab.url)) {
    return null;
  }

  const companyKey = getCompanyKey(tab.url);
  return {
    tabId: tab.id,
    windowId: tab.windowId,
    url: normalizeUrl(tab.url),
    title: getPageTitle(tab),
    companyKey: companyKey,
    providerKey: getProviderKey(tab.url),
    startedAt: Date.now()
  };
}

async function closeCurrentSession(endTime = Date.now()) {
  if (!currentSession) {
    return;
  }

  const session = currentSession;
  currentSession = null;

  const durationSeconds = Math.max(0, (endTime - session.startedAt) / 1000);
  if (durationSeconds <= 0) {
    return;
  }

  const trackingData = await loadTrackingData();
  trackingData.totalTime += durationSeconds;
  if (session.companyKey) {
    trackingData.gafamTime += durationSeconds;
    trackingData.companyTotals[session.companyKey] = (trackingData.companyTotals[session.companyKey] || 0) + durationSeconds;
  }

  trackingData.providerTotals[session.providerKey] = (trackingData.providerTotals[session.providerKey] || 0) + durationSeconds;

  const pageRecord = trackingData.pageTotals[session.url] || {
    url: session.url,
    title: session.title,
    companyKey: session.companyKey,
    providerKey: session.providerKey,
    companyLabel: getSessionLabel(session.companyKey),
    durationSeconds: 0
  };

  pageRecord.title = session.title;
  pageRecord.companyKey = session.companyKey;
  pageRecord.providerKey = session.providerKey;
  pageRecord.companyLabel = getSessionLabel(session.companyKey);
  pageRecord.durationSeconds += durationSeconds;
  trackingData.pageTotals[session.url] = pageRecord;

  trackingData.visitLog.unshift({
    url: session.url,
    title: session.title,
    companyKey: session.companyKey,
    providerKey: session.providerKey,
    companyLabel: getSessionLabel(session.companyKey),
    durationSeconds,
    startedAt: new Date(session.startedAt).toISOString(),
    endedAt: new Date(endTime).toISOString()
  });

  if (trackingData.visitLog.length > MAX_VISITS) {
    trackingData.visitLog = trackingData.visitLog.slice(0, MAX_VISITS);
  }

  await saveTrackingData(trackingData);
}

async function startSessionForTab(tab) {
  if (!browserIsFocused) {
    await closeCurrentSession();
    return;
  }

  if (!tab || !isTrackableUrl(tab.url)) {
    await closeCurrentSession();
    return;
  }

  const nextSession = createSession(tab);
  if (!nextSession) {
    await closeCurrentSession();
    return;
  }

  if (
    currentSession &&
    currentSession.tabId === nextSession.tabId &&
    currentSession.url === nextSession.url
  ) {
    currentSession.title = nextSession.title;
    return;
  }

  await closeCurrentSession();
  currentSession = nextSession;
}

async function handleActivatedTab(tabId) {
  try {
    const tab = await browser.tabs.get(tabId);
    await startSessionForTab(tab);
  } catch (error) {
    console.error('Unable to resolve activated tab', error);
  }
}

async function handleFocusedWindow(windowId) {
  if (windowId === browser.windows.WINDOW_ID_NONE) {
    browserIsFocused = false;
    await closeCurrentSession();
    return;
  }

  try {
    const focusedWindow = await browser.windows.get(windowId);
    if (!focusedWindow || focusedWindow.type !== 'normal') {
      return;
    }

    browserIsFocused = true;
    const tabs = await browser.tabs.query({ active: true, windowId });
    await startSessionForTab(tabs[0]);
  } catch (error) {
    console.error('Unable to resolve focused window', error);
  }
}

async function handleUpdatedTab(tabId, changeInfo, tab) {
  const updatedUrl = changeInfo.url || tab?.url;

  if (changeInfo.url) {
    const wasBlocked = await maybeBlockGafamTab(tabId, changeInfo.url);
    if (wasBlocked) {
      if (currentSession && currentSession.tabId === tabId) {
        await closeCurrentSession();
      }
      return;
    }
  }

  if (changeInfo.status === 'complete' && updatedUrl) {
    const wasBlocked = await maybeBlockGafamTab(tabId, updatedUrl);
    if (wasBlocked) {
      if (currentSession && currentSession.tabId === tabId) {
        await closeCurrentSession();
      }
      return;
    }
  }

  if (changeInfo.url && currentSession && currentSession.tabId === tabId) {
    try {
      const liveTab = await browser.tabs.get(tabId);
      await startSessionForTab(liveTab);
    } catch (error) {
      await startSessionForTab(tab);
    }
    return;
  }

  if (changeInfo.status === 'complete' && currentSession && currentSession.tabId === tabId) {
    await startSessionForTab(tab);
  }
}

function cloneTrackingData(trackingData) {
  return {
    totalTime: trackingData.totalTime,
    gafamTime: trackingData.gafamTime,
    providerTotals: { ...trackingData.providerTotals },
    companyTotals: { ...trackingData.companyTotals },
    pageTotals: Object.fromEntries(
      Object.entries(trackingData.pageTotals).map(([url, value]) => [url, { ...value }])
    ),
    visitLog: [...trackingData.visitLog]
  };
}

function applySessionDuration(trackingData, session, durationSeconds) {
  if (durationSeconds <= 0) {
    return;
  }

  trackingData.totalTime += durationSeconds;
  if (session.companyKey) {
    trackingData.gafamTime += durationSeconds;
    trackingData.companyTotals[session.companyKey] = (trackingData.companyTotals[session.companyKey] || 0) + durationSeconds;
  }

  trackingData.providerTotals[session.providerKey] = (trackingData.providerTotals[session.providerKey] || 0) + durationSeconds;

  const pageRecord = trackingData.pageTotals[session.url] || {
    url: session.url,
    title: session.title,
    companyKey: session.companyKey,
    providerKey: session.providerKey,
    companyLabel: getSessionLabel(session.companyKey),
    durationSeconds: 0
  };

  pageRecord.title = session.title;
  pageRecord.companyKey = session.companyKey;
  pageRecord.providerKey = session.providerKey;
  pageRecord.companyLabel = getSessionLabel(session.companyKey);
  pageRecord.durationSeconds += durationSeconds;
  trackingData.pageTotals[session.url] = pageRecord;
}

async function getLiveTrackingSnapshot() {
  const storedTrackingData = await loadTrackingData();
  if (!currentSession) {
    return storedTrackingData;
  }

  const snapshot = cloneTrackingData(storedTrackingData);
  const elapsedSeconds = Math.max(0, (Date.now() - currentSession.startedAt) / 1000);
  applySessionDuration(snapshot, currentSession, elapsedSeconds);
  return snapshot;
}

async function getActivePageInfo() {
  try {
    const tab = await getActiveTabFromNormalWindow();

    if (!tab || !tab.url) {
      return {
        title: 'Keine aktive Seite',
        url: '',
        hostname: '',
        isGafam: false,
        isTrackable: false
      };
    }

    const trackable = isTrackableUrl(tab.url);
    const companyKey = trackable ? getCompanyKey(tab.url) : null;

    return {
      title: getPageTitle(tab),
      url: tab.url,
      hostname: getHostname(tab.url),
      isGafam: Boolean(companyKey),
      isTrackable: trackable,
      companyKey,
      companyLabel: companyKey ? getCompanyLabel(companyKey) : 'Nicht-GAFAM'
    };
  } catch (error) {
    return {
      title: 'Aktive Seite unbekannt',
      url: '',
      hostname: '',
      isGafam: false,
      isTrackable: false
    };
  }
}

async function getActiveTabFromNormalWindow() {
  const activeInLastFocused = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  const candidate = activeInLastFocused[0];
  if (candidate) {
    try {
      const windowInfo = await browser.windows.get(candidate.windowId);
      if (windowInfo && windowInfo.type === 'normal') {
        return candidate;
      }
    } catch (error) {
      // Fall through to global normal-window lookup.
    }
  }

  const activeTabs = await browser.tabs.query({ active: true });
  for (const tab of activeTabs) {
    try {
      const windowInfo = await browser.windows.get(tab.windowId);
      if (windowInfo && windowInfo.type === 'normal') {
        return tab;
      }
    } catch (error) {
      // Ignore tabs whose window details can't be resolved.
    }
  }

  return null;
}

async function maybeBlockGafamTab(tabId, url) {
  if (!url || !isTrackableUrl(url) || isExtensionUrl(url)) {
    return false;
  }

  const settings = arguments.length > 2 ? arguments[2] : await loadSettings();
  if (!settings.blockGafamEnabled) {
    return false;
  }

  const companyKey = getCompanyKey(url);
  if (!companyKey) {
    return false;
  }

  const blockedPageUrl = buildBlockedPageUrl(url, companyKey);
  await browser.tabs.update(tabId, { url: blockedPageUrl });
  return true;
}

async function enforceBlockingOnActiveTab() {
  const tab = await getActiveTabFromNormalWindow();
  if (!tab || !tab.id || !tab.url) {
    return;
  }

  await maybeBlockGafamTab(tab.id, tab.url);
}

async function enforceBlockingOnAllTabs() {
  const settings = await loadSettings();
  if (!settings.blockGafamEnabled) {
    return;
  }

  const tabs = await browser.tabs.query({});
  for (const tab of tabs) {
    if (!tab || !tab.id || !tab.url) {
      continue;
    }

    if (isExtensionUrl(tab.url) || isBlockedPageUrl(tab.url)) {
      continue;
    }

    await maybeBlockGafamTab(tab.id, tab.url, settings);
  }
}

async function releaseBlockedTabs() {
  const tabs = await browser.tabs.query({});
  for (const tab of tabs) {
    if (!tab || !tab.id || !isBlockedPageUrl(tab.url)) {
      continue;
    }

    const originalUrl = getOriginalUrlFromBlockedPage(tab.url);
    if (!originalUrl) {
      continue;
    }

    try {
      await browser.tabs.update(tab.id, { url: originalUrl });
    } catch (error) {
      // Ignore tabs that cannot be updated.
    }
  }
}

browser.runtime.onMessage.addListener((message) => {
  if (message && message.type === 'getLiveTrackingData') {
    return Promise.all([getLiveTrackingSnapshot(), getActivePageInfo()]).then(([trackingData, activePage]) => ({
      trackingData,
      activePage
    }));
  }

  if (message && message.type === 'getSettings') {
    return loadSettings().then((settings) => ({ settings }));
  }

  if (message && message.type === 'setSettings') {
    return saveSettings(message.settings).then(async (settings) => {
      if (Object.prototype.hasOwnProperty.call(message.settings || {}, 'blockGafamEnabled')) {
        if (settings.blockGafamEnabled) {
          await enforceBlockingOnAllTabs();
        } else {
          await releaseBlockedTabs();
        }
      }

      if (Object.prototype.hasOwnProperty.call(message.settings || {}, 'liveOverlayEnabled')) {
        await refreshLiveOverlayOnOpenTabs();
        await notifyLiveOverlayStateOnOpenTabs(settings.liveOverlayEnabled);
      }

      return { settings };
    });
  }

  return false;
});

browser.tabs.onActivated.addListener((activeInfo) => {
  void handleActivatedTab(activeInfo.tabId);
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  void handleUpdatedTab(tabId, changeInfo, tab);
});

browser.tabs.onRemoved.addListener((tabId) => {
  if (currentSession && currentSession.tabId === tabId) {
    void closeCurrentSession();
  }
});

browser.windows.onFocusChanged.addListener((windowId) => {
  void handleFocusedWindow(windowId);
});

if (browser.runtime.onSuspend) {
  browser.runtime.onSuspend.addListener(() => {
    void closeCurrentSession();
  });
}

async function initializeTracking() {
  try {
    const tab = await getActiveTabFromNormalWindow();
    await startSessionForTab(tab);
  } catch (error) {
    console.error('Unable to initialize tracker', error);
  }
}

void initializeTracking();
void refreshLiveOverlayOnOpenTabs();