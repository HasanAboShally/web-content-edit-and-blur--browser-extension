var MODES = [
  {
    id: "idle",
    displayName: "",
    badgeColor: "#222",
  },
  {
    id: "edit",
    displayName: "Edit",
    badgeColor: "#2ECC71",
  },
  {
    id: "blur",
    displayName: "Blur",
    badgeColor: "#E67E22",
  },
];

var tabModeIndexes = {};

async function initOnTab(tabId, callback) {
  tabModeIndexes[tabId] = 0;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId, allFrames: true },
      files: ["page-code.js"],
    });

    await chrome.scripting.insertCSS({
      target: { tabId: tabId, allFrames: true },
      files: ["page-style.css"],
    });

    if (typeof callback === "function") {
      callback();
    }
  } catch (error) {
    console.error("Error initializing tab:", error);
  }
}

function switchMode(tabId, modeId) {
  var mode = MODES.find((mode) => mode.id == modeId);

  chrome.tabs.sendMessage(tabId, mode.id);

  chrome.action.setBadgeText({ text: mode.displayName, tabId: tabId });
  chrome.action.setBadgeBackgroundColor({
    color: mode.badgeColor,
    tabId: tabId,
  });

  chrome.action.setIcon({
    path: {
      19: `images/icons/19x19/icon-${mode.id}.png`,
      38: `images/icons/38x38/icon-${mode.id}.png`,
    },
    tabId: tabId,
  });
}

function getNextModeId(currentModeId) {
  return currentModeId ? (currentModeId + 1) % MODES.length : 1;
}

function switchToNextMode(tabId) {
  tabModeIndexes[tabId] = getNextModeId(tabModeIndexes[tabId]);
  switchMode(tabId, MODES[tabModeIndexes[tabId]].id);
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "complete") {
    delete tabModeIndexes[tabId];
  }
});

chrome.action.onClicked.addListener((tab) => {
  if (tabModeIndexes[tab.id] === undefined) {
    initOnTab(tab.id, () => {
      switchToNextMode(tab.id);
    });
    return;
  }

  switchToNextMode(tab.id);
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message === "idle") {
    tabModeIndexes[sender.tab.id] = 0;
    switchMode(sender.tab.id, "idle");
  }
});
