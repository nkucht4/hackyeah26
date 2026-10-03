const DEFAULT_SITES = [
  "mail.google.com"
];


//  INSTALL 

browser.runtime.onInstalled.addListener(
  async () => {

    const data =
      await browser.storage.local.get(
        "enabledSites"
      );

    if (!data.enabledSites) {
      await browser.storage.local.set({
        enabledSites:
          DEFAULT_SITES
      });
    }

    createContextMenu();
  }
);


//  CONTEXT MENU

function createContextMenu() {

  browser.contextMenus
    .removeAll()
    .then(() => {

      browser.contextMenus.create({
        id: "directly-check",

        title:
          "Check with Directly",        // IKONKA

        contexts: ["selection"]
      });

    });
}


//  STARTUP

browser.runtime.onStartup.addListener(
  () => {
    createContextMenu();
  }
);


//  MENU CLICK

browser.contextMenus.onClicked.addListener(
  (info, tab) => {

    if (
      info.menuItemId !==
      "directly-check"
    ) {
      return;
    }

    if (
      !tab ||
      !tab.id
    ) {
      return;
    }


    browser.tabs
      .sendMessage(
        tab.id,
        {
          type:
            "DIRECTLY_ANALYZE_SELECTION",

          text:
            info.selectionText || ""
        }
      )
      .catch(() => {
        /*
          Niektóre specjalne strony Firefoxa
          nie pozwalają na content scripts.
        */
      });
  }
);