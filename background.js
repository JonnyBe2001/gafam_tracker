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
const MAX_VISITS = 1000;
const OTHER_COMPANY_KEY = 'other';

let currentSession = null;

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
  return typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'));
}

function normalizeUrl(url) {
  const parsedUrl = new URL(url);
  parsedUrl.hash = '';
  return parsedUrl.toString();
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

function getPageTitle(tab) {
  if (tab && typeof tab.title === 'string' && tab.title.trim()) {
    return tab.title.trim();
  }
  return 'Unbenannte Seite';
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
    companyLabel: getCompanyLabel(session.companyKey),
    durationSeconds: 0
  };

  pageRecord.title = session.title;
  pageRecord.companyKey = session.companyKey;
  pageRecord.providerKey = session.providerKey;
  pageRecord.companyLabel = getCompanyLabel(session.companyKey);
  pageRecord.durationSeconds += durationSeconds;
  trackingData.pageTotals[session.url] = pageRecord;

  trackingData.visitLog.unshift({
    url: session.url,
    title: session.title,
    companyKey: session.companyKey,
    providerKey: session.providerKey,
    companyLabel: getCompanyLabel(session.companyKey),
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
    await closeCurrentSession();
    return;
  }

  try {
    const tabs = await browser.tabs.query({ active: true, windowId });
    await startSessionForTab(tabs[0]);
  } catch (error) {
    console.error('Unable to resolve focused window', error);
  }
}

async function handleUpdatedTab(tabId, changeInfo, tab) {
  if (changeInfo.status !== 'complete') {
    return;
  }

  if (currentSession && currentSession.tabId === tabId) {
    await startSessionForTab(tab);
  }
}

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
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    await startSessionForTab(tabs[0]);
  } catch (error) {
    console.error('Unable to initialize tracker', error);
  }
}

void initializeTracking();