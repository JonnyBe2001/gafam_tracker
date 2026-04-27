// Liste der GAFAM-Domains
const GAFAM_DOMAINS = {
  google: ["google.com", "youtube.com", "google.de", "gmail.com", "google.at", "google.ch"],
  apple: ["apple.com", "icloud.com"],
  facebook: ["facebook.com", "instagram.com", "whatsapp.com", "messenger.com"],
  amazon: ["amazon.com", "amazon.de", "amazon.at", "amazon.co.uk", "aws.amazon.com"],
  microsoft: ["microsoft.com", "linkedin.com", "bing.com", "office.com", "outlook.com"]
};

// Speicher für die Zeitmessung
let tabTimers = {};
let totalTime = 0;
let gafamTime = 0;

// Funktion zum Starten des Timers für einen Tab
function startTimer(tabId, url) {
  if (tabTimers[tabId]) {
    clearInterval(tabTimers[tabId]);
  }

  const startTime = Date.now();
  tabTimers[tabId] = setInterval(() => {
    const elapsed = (Date.now() - startTime) / 1000; // Zeit in Sekunden
    browser.storage.local.get(['totalTime', 'gafamTime'], (data) => {
      const newTotalTime = (data.totalTime || 0) + elapsed;
      const isGafam = isGafamUrl(url);
      const newGafamTime = isGafam ? (data.gafamTime || 0) + elapsed : data.gafamTime || 0;

      browser.storage.local.set({
        totalTime: newTotalTime,
        gafamTime: newGafamTime
      });
    });
  }, 1000); // Alle Sekunde aktualisieren
}

// Prüft, ob eine URL zu GAFAM gehört
function isGafamUrl(url) {
  try {
    const domain = new URL(url).hostname;
    return Object.values(GAFAM_DOMAINS).flat().some(d => domain.includes(d));
  } catch (e) {
    return false;
  }
}

// Listener für Tab-Wechsel
browser.tabs.onActivated.addListener((activeInfo) => {
  browser.tabs.get(activeInfo.tabId).then((tab) => {
    if (tab.url) {
      startTimer(activeInfo.tabId, tab.url);
    }
  });
});

// Listener für URL-Änderungen im selben Tab
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    startTimer(tabId, tab.url);
  }
});

// Initialisiere beim Start
browser.tabs.query({}).then((tabs) => {
  tabs.forEach(tab => {
    if (tab.url) startTimer(tab.id, tab.url);
  });
});