// Relays the Student Planner web app's selected theme (dark "Enchanted
// Forest" / light "Cozy Tavern") into the extension's own storage, so the
// popup (popup.js/popup.css) can mirror whatever the user picked on the
// website instead of guessing from the OS color scheme. Runs only on the
// planner web app itself — see manifest.json's matches for this file.
function currentPlannerTheme() {
    return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function syncPlannerTheme() {
    const theme = currentPlannerTheme();

    console.log("🎨 theme-sync.js: observed planner theme:", theme);

    chrome.storage.local.set({
        plannerTheme: theme,
    });
}

console.log("🎨 theme-sync.js: content script injected on", window.location.href);

syncPlannerTheme();

new MutationObserver(syncPlannerTheme).observe(
    document.documentElement,
    {
        attributes: true,
        attributeFilter: ["data-theme"],
    }
);
