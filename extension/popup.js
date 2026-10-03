const DEFAULT_SITES = [
  "mail.google.com"
];

let enabledSites = [];
let currentDomain = "";



const currentSite =
  document.getElementById("currentSite");

const currentStatus =
  document.getElementById("currentStatus");

const toggleCurrentSite =
  document.getElementById("toggleCurrentSite");

const siteList =
  document.getElementById("siteList");

const settingsButton =
  document.getElementById("settingsButton");

const speechRecorderButton =
  document.getElementById("speechRecorderButton");


// NORMALIZE DOMAIN
function normalizeDomain(domain) {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
}


// CHECK IF SITE IS ENABLED
function isSiteEnabled(domain) {
  const normalized =
    normalizeDomain(domain);

  return enabledSites.some(site => {
    return (
      normalized === site ||
      normalized.endsWith("." + site)
    );
  });
}


// LOAD SETTINGS
async function loadSettings() {
  const data =
    await browser.storage.local.get({
      enabledSites: DEFAULT_SITES
    });

  enabledSites =
    Array.isArray(data.enabledSites)
      ? data.enabledSites
      : [...DEFAULT_SITES];

  await loadCurrentTab();

  renderSites();
}


// CURRENT TAB
async function loadCurrentTab() {
  const tabs =
    await browser.tabs.query({
      active: true,
      currentWindow: true
    });

  if (!tabs.length) {
    currentSite.textContent = "Unknown";
    return;
  }

  const tab = tabs[0];

  try {
    const url =
      new URL(tab.url);

    /*
      Nie pokazujemy np.:
      about:
      moz-extension:
      file:
    */

    if (
      !["http:", "https:"].includes(
        url.protocol
      )
    ) {
      currentDomain = "";

      currentSite.textContent =
        "This page cannot be configured";

      currentStatus.textContent =
        "";

      toggleCurrentSite.style.display =
        "none";

      return;
    }

    currentDomain =
      normalizeDomain(url.hostname);

    currentSite.textContent =
      currentDomain;

    updateCurrentSiteUI();

  } catch {
    currentDomain = "";

    currentSite.textContent =
      "Unknown";
  }
}


// CURRENT SITE UI
function updateCurrentSiteUI() {
  if (!currentDomain) {
    return;
  }

  const enabled =
    isSiteEnabled(currentDomain);

  if (enabled) {
    currentStatus.textContent =
      "✓ Directly is enabled here";

    currentStatus.className =
      "current-status enabled";

    toggleCurrentSite.textContent =
      "Remove from Directly";

    toggleCurrentSite.className =
      "secondary-button";

  } else {
    currentStatus.textContent =
      "Directly is not enabled here";

    currentStatus.className =
      "current-status disabled";

    toggleCurrentSite.textContent =
      "Add this website";

    toggleCurrentSite.className =
      "primary-button";
  }
}


//  TOGGLE CURRENT SITE
toggleCurrentSite.addEventListener(
  "click",
  async () => {

    if (!currentDomain) {
      return;
    }

    const normalized =
      normalizeDomain(currentDomain);

    const enabled =
      isSiteEnabled(normalized);

    if (enabled) {

      /*
        Usuwamy dokładną domenę.
      */

      enabledSites =
        enabledSites.filter(
          site => site !== normalized
        );

    } else {

      /*
        Dodajemy domenę.
      */

      if (!enabledSites.includes(normalized)) {
        enabledSites.push(normalized);
      }
    }

    enabledSites.sort();

    await saveSettings();

    updateCurrentSiteUI();

    renderSites();
  }
);


// SAVE SETTINGS
async function saveSettings() {
  await browser.storage.local.set({
    enabledSites
  });
}


// RENDER SITES
function renderSites() {
  siteList.innerHTML = "";

  if (!enabledSites.length) {
    siteList.innerHTML = `
      <div class="empty">
        No websites enabled.
      </div>
    `;

    return;
  }

  enabledSites.forEach(site => {

    const row =
      document.createElement("div");

    row.className =
      "site-row";

    row.innerHTML = `
      <div class="site-name">
        🌐 ${escapeHtml(site)}
      </div>

      <button
        class="remove-button"
        type="button"
      >
        Remove
      </button>
    `;

    row
      .querySelector(".remove-button")
      .addEventListener(
        "click",
        async () => {

          enabledSites =
            enabledSites.filter(
              current => current !== site
            );

          await saveSettings();

          renderSites();

          updateCurrentSiteUI();
        }
      );

    siteList.appendChild(row);
  });
}


// OPEN SETTINGS PAGE
settingsButton.addEventListener(
  "click",
  () => {
    browser.runtime.openOptionsPage();
  }
);

speechRecorderButton.addEventListener(
  "click",
  async () => {
    await browser.tabs.create({
      url: browser.runtime.getURL("recorder.html")
    });
    window.close();
  }
);


//  ESCAPE HTML
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

//  INIT
loadSettings();