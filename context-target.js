// Content Edit & Blur - Context menu target tracker
//
// Records the element the user last right-clicked so the "Blur this element" /
// "Hide this element" context menu items know what to act on. This has to be a
// standalone always-on content script: the contextmenu event fires before the menu
// opens, so if the main script has not been injected yet there would be nothing
// listening and the first use of the menu item would silently do nothing.
//
// Content scripts belonging to the same extension share one isolated world per
// frame, so the scripts under page/ can read window.__cebLastContextTarget directly.
(function () {
  if (window.__cebContextTrackerInstalled) return;
  window.__cebContextTrackerInstalled = true;

  window.__cebLastContextTarget = null;

  document.addEventListener(
    "contextmenu",
    function (event) {
      window.__cebLastContextTarget = event.target;
    },
    true
  );
})();
