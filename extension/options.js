const DEFAULT_SITES = [
  "mail.google.com"
];

const siteInput =
  document.getElementById("siteInput");

const addSiteButton =
  document.getElementById("addSiteButton");

const siteList =
  document.getElementById("siteList");

const errorMessage =
  document.getElementById("errorMessage");

const saveStatus =
  document.getElementById("saveStatus");


let enabledSites = [];


//  NORMALIZE
function normalizeDomain(domain) {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
}


// VALIDATE DOMAIN
function isValidDomain(domain) {
  if (!domain) {
    return false;
  }
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain);
}


//  LOAD SETTINGS
async function loadSettings() {
  const data =
    await browser.storage.local.get({
      enabledSites: DEFAULT_SITES
    });

  enabledSites =
    Array.isArray(data.enabledSites)
      ? data.enabledSites
      : DEFAULT_SITES;

  renderSites();
}

//  SAVE SETTINGS
async function saveSettings() {
  await browser.storage.local.set({
    enabledSites
  });

  saveStatus.textContent =
    "✓ Settings saved";

  setTimeout(() => {
    saveStatus.textContent = "";
  }, 1800);
}

// RENDER SITES
function renderSites() {
  siteList.innerHTML = "";

  if (enabledSites.length === 0) {
    siteList.innerHTML = `
      <div class="empty">
        No websites added yet.
      </div>
    `;

    return;
  }

  enabledSites.forEach(site => {
    const row =
      document.createElement("div");

    row.className = "site-row";

    row.innerHTML = `
      <div class="site-info">

        <div class="site-icon">
          🌐
        </div>

        <div>
          <div class="site-domain">
            ${escapeHtml(site)}
          </div>

          <div class="site-status">
            Directly enabled
          </div>
        </div>

      </div>

      <button
        class="remove-site"
        type="button"
        data-site="${escapeHtml(site)}"
      >
        Remove
      </button>
    `;

    row
      .querySelector(".remove-site")
      .addEventListener("click", async () => {
        await removeSite(site);
      });

    siteList.appendChild(row);
  });
}


//  ADD SITE
async function addSite() {
  hideError();

  const domain =
    normalizeDomain(siteInput.value);

  if (!isValidDomain(domain)) {
    showError(
      "Enter a valid domain, e.g. slack.com or mail.google.com."
    );

    return;
  }

  if (enabledSites.includes(domain)) {
    showError(
      "This website is already enabled."
    );

    return;
  }

  enabledSites.push(domain);

  enabledSites.sort();

  await saveSettings();

  siteInput.value = "";

  renderSites();
}


//  REMOVE SITE
async function removeSite(site) {
  enabledSites =
    enabledSites.filter(
      current => current !== site
    );

  await saveSettings();

  renderSites();
}


//  ERRORS
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
}

function hideError() {
  errorMessage.textContent = "";
  errorMessage.hidden = true;
}


//  ESCAPE HTML
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


// EVENTS
addSiteButton.addEventListener(
  "click",
  addSite
);

siteInput.addEventListener(
  "keydown",
  event => {
    if (event.key === "Enter") {
      addSite();
    }
  }
);


//  INIT
loadSettings();