// Content Edit & Blur v2.0 - Background Service Worker
const MODES = [
  { id: "idle", displayName: "", badgeColor: "#222" },
  { id: "edit", displayName: "Edit", badgeColor: "#4CAF50" },
  { id: "blur", displayName: "Blur", badgeColor: "#FF9800" },
  { id: "hide", displayName: "Hide", badgeColor: "#F44336" },
  { id: "redact", displayName: "Block", badgeColor: "#111827" },
  { id: "draw", displayName: "Draw", badgeColor: "#9C27B0" },
];

const tabStates = {};

// Initialize context menus
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "ceb-edit",
    title: "Edit this text",
    contexts: ["selection"]
  });
  chrome.contextMenus.create({
    id: "ceb-blur",
    title: "Blur this element",
    contexts: ["all"]
  });
  chrome.contextMenus.create({
    id: "ceb-hide",
    title: "Hide this element",
    contexts: ["all"]
  });
  chrome.contextMenus.create({
    id: "ceb-redact",
    title: "Redact this element (solid block)",
    contexts: ["all"]
  });
  chrome.contextMenus.create({
    id: "ceb-separator",
    type: "separator",
    contexts: ["all"]
  });
  chrome.contextMenus.create({
    id: "ceb-reset",
    title: "Reset page changes",
    contexts: ["all"]
  });
});

// Context menu handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab) return;
  await ensureInitialized(tab.id);

  // Route element actions to the frame that was actually right-clicked, otherwise
  // every frame on the page would act on its own last-right-clicked element.
  const frameId = info.frameId ?? 0;

  if (info.menuItemId === "ceb-edit") {
    await switchMode(tab.id, "edit");
  } else if (info.menuItemId === "ceb-blur") {
    sendToFrame(tab.id, frameId, { action: "blurElement" });
  } else if (info.menuItemId === "ceb-hide") {
    sendToFrame(tab.id, frameId, { action: "hideElement" });
  } else if (info.menuItemId === "ceb-redact") {
    sendToFrame(tab.id, frameId, { action: "redactElement" });
  } else if (info.menuItemId === "ceb-reset") {
    await resetPage(tab.id);
  }
});

// `initialized` is tracked per tab but injection is per frame, and allFrames only covers
// frames that existed at injection time. An iframe added later (lazy-loaded embed, SPA
// mount) has no listener, and swallowing that error made the context menu silently do
// nothing there. Inject into just that frame and retry once.
async function sendToFrame(tabId, frameId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message, { frameId });
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId, frameIds: [frameId] },
        files: ["page-code.js"],
      });
      await chrome.scripting.insertCSS({
        target: { tabId, frameIds: [frameId] },
        files: ["page-style.css"],
      });
      await chrome.tabs.sendMessage(tabId, message, { frameId });
    } catch {
      // Frame is gone or not scriptable - nothing more to do.
    }
  }
}

// Keyboard commands
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  
  await ensureInitialized(tab.id);
  
  switch (command) {
    case "toggle-edit-mode":
      await switchMode(tab.id, tabStates[tab.id]?.mode === "edit" ? "idle" : "edit");
      break;
    case "toggle-blur-mode":
      await switchMode(tab.id, tabStates[tab.id]?.mode === "blur" ? "idle" : "blur");
      break;
    case "toggle-hide-mode":
      await switchMode(tab.id, tabStates[tab.id]?.mode === "hide" ? "idle" : "hide");
      break;
    case "toggle-redact-mode":
      await switchMode(tab.id, tabStates[tab.id]?.mode === "redact" ? "idle" : "redact");
      break;
  }
});

async function ensureInitialized(tabId) {
  if (tabStates[tabId]?.initialized) {
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId, allFrames: true },
      files: ["page-code.js"],
    });

    await chrome.scripting.insertCSS({
      target: { tabId: tabId, allFrames: true },
      files: ["page-style.css"],
    });

    tabStates[tabId] = { initialized: true, mode: await probeMode(tabId) };
  } catch (error) {
    console.error("[CEB] Error initializing tab:", error);
  }
}

// MV3 terminates this worker after ~30s idle, wiping tabStates, but the content script in
// the tab survives and is still in whatever mode it was in. Assuming "idle" here made the
// next shortcut press re-enter the current mode instead of leaving it, so the user had to
// press it twice. Ask the content script instead of guessing.
async function probeMode(tabId) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { action: "getMode" }, { frameId: 0 });
    return typeof res?.mode === "string" ? res.mode : "idle";
  } catch {
    return "idle"; // freshly injected, or no listener yet
  }
}

async function switchMode(tabId, modeId) {
  const mode = MODES.find((m) => m.id === modeId) || MODES[0];
  
  tabStates[tabId] = tabStates[tabId] || {};
  tabStates[tabId].mode = mode.id;

  try {
    await chrome.tabs.sendMessage(tabId, { action: "setMode", mode: mode.id });
  } catch (error) {
    console.error("[CEB] Error sending mode message:", error);
  }

  chrome.action.setBadgeText({ text: mode.displayName, tabId: tabId });
  chrome.action.setBadgeBackgroundColor({ color: mode.badgeColor, tabId: tabId });

  chrome.action
    .setIcon({
      path: {
        19: `images/icons/19x19/icon-${mode.id}.png`,
        38: `images/icons/38x38/icon-${mode.id}.png`,
      },
      tabId: tabId,
    })
    .catch((error) => {
      console.warn("[CEB] Could not set icon for mode:", mode.id, error.message);
    });

  // Notify popup
  chrome.runtime.sendMessage({ action: "modeChanged", tabId: tabId, mode: mode.id }).catch(() => {});
}

async function resetPage(tabId) {
  const tab = await chrome.tabs.get(tabId);
  const url = normalizeUrl(tab.url);

  // Only the page key. Site rules are deliberately kept — "reset page" should not
  // silently wipe rules the user set for the whole domain. The rules panel is where
  // site rules get removed.
  await chrome.storage.local.remove([`changes_${url}`]);

  chrome.tabs.reload(tabId);
  tabStates[tabId] = { initialized: false, mode: "idle" };
  // The reload drops the content script back to idle, so clear the badge and icon too —
  // they are per-tab browser state and would otherwise keep showing the old mode.
  chrome.action.setBadgeText({ text: "", tabId });
  chrome.action.setIcon({
    path: { 19: "images/icons/19x19/icon-idle.png", 38: "images/icons/38x38/icon-idle.png" },
    tabId,
  }).catch(() => {});
}

async function loadSavedChanges(tabId, url) {
  const { persistEnabled } = await chrome.storage.local.get(['persistEnabled']);
  if (persistEnabled === false) return;

  const pageKey = `changes_${normalizeUrl(url)}`;
  const sKey = siteKey(url);
  const result = await chrome.storage.local.get([pageKey, sKey]);

  if (result[pageKey] || result[sKey]) {
    chrome.tabs.sendMessage(tabId, {
      action: "applySavedChanges",
      changes: result[pageKey],
      siteChanges: result[sKey]
    });
  }
}

// Opaque origins (about:blank, about:srcdoc, data:) all report origin "null", so every
// such frame on every website would share one global bucket: site_null and
// changes_nullblank. That leaks rules between unrelated sites and lets one site's clear
// destroy another's. These frames are transient anyway, so simply never persist them.
function isPersistableUrl(url) {
  try {
    const u = new URL(url);
    return u.origin !== "null" && (u.protocol === "http:" || u.protocol === "https:");
  } catch {
    return false;
  }
}

// The content script supplies the page key because it tracks SPA route changes, while
// sender.url can be stale on a pushState app. Only honour a key belonging to the sender's
// own origin so a frame can never write into another origin's bucket.
function safePageKey(claimed, senderUrl) {
  const fallback = `changes_${normalizeUrl(senderUrl)}`;
  if (typeof claimed !== "string" || !claimed.startsWith("changes_")) return fallback;
  try {
    const claimedUrl = new URL(claimed.slice("changes_".length));
    if (claimedUrl.origin !== new URL(senderUrl).origin) return fallback;
    return `changes_${claimedUrl.origin}${claimedUrl.pathname}`;
  } catch {
    return fallback;
  }
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}

function siteKey(url) {
  try {
    return `site_${new URL(url).origin}`;
  } catch {
    return `site_${url}`;
  }
}

// Index of subframe storage keys belonging to a top-level page.
function frameIndexKey(topUrl) {
  return `frames_${normalizeUrl(topUrl)}`;
}

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabStates[tabId];
});

// Reset state when page reloads, and re-inject so saved changes get restored.
// The content script restores its own changes from storage on init, so there is no
// injection/message race to time here.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url) return;

  if (tabStates[tabId]?.initialized) {
    tabStates[tabId].initialized = false;
    tabStates[tabId].mode = "idle";
  }

  const { persistEnabled } = await chrome.storage.local.get(['persistEnabled']);
  if (persistEnabled === false) return;

  // Site-scoped rules apply to every path on the origin, so check both keys. Rules made
  // inside an iframe are stored under that frame's own (often cross-origin) key, which is
  // invisible from here — frameIndexKey tracks those so they still restore on reload.
  const pageKey = `changes_${normalizeUrl(tab.url)}`;
  const sKey = siteKey(tab.url);
  const idxKey = frameIndexKey(tab.url);
  const result = await chrome.storage.local.get([pageKey, sKey, idxKey]);
  const framedKeys = Array.isArray(result[idxKey]) ? result[idxKey] : [];
  if (!hasChanges(result[pageKey]) && !hasChanges(result[sKey])) {
    if (!framedKeys.length) return;
    // The index can go stale after rules are deleted; confirm before injecting.
    const framed = await chrome.storage.local.get(framedKeys);
    const live = framedKeys.filter((k) => hasChanges(framed[k]));
    if (!live.length) {
      await chrome.storage.local.remove([idxKey]);
      return;
    }
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId, allFrames: true },
      files: ["page-code.js"],
    });

    await chrome.scripting.insertCSS({
      target: { tabId: tabId, allFrames: true },
      files: ["page-style.css"],
    });

    tabStates[tabId] = { initialized: true, mode: "idle" };
  } catch (error) {
    console.log("[CEB] Could not auto-inject (restricted page?):", error.message);
  }
});

function hasChanges(changes) {
  if (!changes) return false;
  return Boolean(
    // v2
    changes.rules?.length ||
    changes.areas?.length ||
    // v1 (still on disk for users who have not re-saved yet)
    changes.blurs?.length ||
    changes.hidden?.length ||
    changes.drawnAreas?.length ||
    // both schemas
    changes.replacements?.length
  );
}

// Handle messages from popup and content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handleAsync = async () => {
    if (message.action === "getMode") {
      const state = tabStates[message.tabId];
      sendResponse({ mode: state?.mode || "idle" });
    } else if (message.action === "setMode") {
      await ensureInitialized(message.tabId);
      await switchMode(message.tabId, message.mode);
      sendResponse({ success: true });
    } else if (message.action === "resetPage") {
      const tabId = message.tabId || sender.tab?.id;
      if (tabId) await resetPage(tabId);
      sendResponse({ success: true });
    } else if (message.action === "undo") {
      chrome.tabs.sendMessage(message.tabId, { action: "undo" });
      sendResponse({ success: true });
    } else if (message.action === "initAndShowToolbar") {
      // Show toolbar when extension popup opens
      await ensureInitialized(message.tabId);
      chrome.tabs.sendMessage(message.tabId, { action: "showToolbar" });
      sendResponse({ success: true });
    } else if (message.action === "setPersistence") {
      sendResponse({ success: true });
    } else if (message.action === "restoreChanges") {
      // Restore saved changes - the in-page toolbar has no tab id, fall back to sender
      const tabId = message.tabId || sender.tab?.id;
      if (tabId) {
        await ensureInitialized(tabId);
        const tab = await chrome.tabs.get(tabId);
        await loadSavedChanges(tabId, tab.url);
      }
      sendResponse({ success: true });
    } else if (message.action === "takeScreenshot") {
      // Take screenshot of visible area
      try {
        const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
        // Send to content script to trigger download - use sender.tab if no tabId provided
        const tabId = message.tabId || sender.tab?.id;
        if (tabId) {
          chrome.tabs.sendMessage(tabId, { 
            action: "downloadScreenshot", 
            dataUrl: dataUrl 
          });
        }
        sendResponse({ success: true });
      } catch (error) {
        console.error("[CEB] Screenshot error:", error);
        sendResponse({ success: false, error: error.message });
      }
    } else if (message === "idle" && sender.tab) {
      // Legacy support for ESC key
      tabStates[sender.tab.id] = tabStates[sender.tab.id] || {};
      tabStates[sender.tab.id].mode = "idle";
      await switchMode(sender.tab.id, "idle");
    } else if (message.action === "requestModeChange" && sender.tab) {
      // Request from in-page toolbar
      await switchMode(sender.tab.id, message.mode);
      sendResponse({ success: true });
    } else if (message.action === "saveChanges" && sender.tab) {
      // Save changes from content script. Key off the sending frame's own URL so that
      // changes made inside an iframe are not written under the top page's key.
      const { persistEnabled } = await chrome.storage.local.get(['persistEnabled']);
      const url = sender.url || sender.tab.url;
      if (persistEnabled !== false && isPersistableUrl(url)) {
        const writes = {};
        const removals = [];

        // v2 splits by scope: page rules live under the full path, site rules under
        // the origin so they survive navigation within the domain.
        if (message.page !== undefined) {
          const key = safePageKey(message.pageKey, url);
          if (hasChanges(message.page)) {
            writes[key] = message.page;
            // A subframe's key is derived from its own URL, so the top-level reload check
            // would never find it. Record it against the top page so it can restore.
            if (sender.frameId !== 0 && isPersistableUrl(sender.tab.url)) {
              const idxKey = frameIndexKey(sender.tab.url);
              const existing = (await chrome.storage.local.get([idxKey]))[idxKey];
              const list = Array.isArray(existing) ? existing : [];
              if (!list.includes(key)) writes[idxKey] = list.concat(key);
            }
          } else {
            removals.push(key);
          }
        }
        if (message.site !== undefined) {
          const key = siteKey(url);
          if (hasChanges(message.site)) writes[key] = message.site;
          else removals.push(key);
        }

        if (Object.keys(writes).length) await chrome.storage.local.set(writes);
        if (removals.length) await chrome.storage.local.remove(removals);
      }
      sendResponse({ success: true });
    }
  };
  
  handleAsync();
  return true; // Keep message channel open for async response
});

// Handle action button click - toggle toolbar
chrome.action.onClicked.addListener(async (tab) => {
  await ensureInitialized(tab.id);
  
  // Send message to toggle toolbar
  chrome.tabs.sendMessage(tab.id, { action: 'toggleToolbar' });
});
