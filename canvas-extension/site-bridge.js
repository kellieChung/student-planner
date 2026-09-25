// Runs only on the Lodestar web app itself (see manifest.json's matches).
//
// 1. Relays the app's Night/Day theme into extension storage so the popup
//    matches the site instead of guessing from the OS color scheme.
// 2. Relays the extension token that /extension-callback hands over after the
//    user clicks Connect. background.js only accepts it for the sign-in state
//    it generated itself.
function currentPlannerTheme() {
    return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function syncPlannerTheme() {
    chrome.storage.local.set({
        plannerTheme: currentPlannerTheme(),
    });
}

syncPlannerTheme();

new MutationObserver(syncPlannerTheme).observe(
    document.documentElement,
    {
        attributes: true,
        attributeFilter: ["data-theme"],
    }
);

window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    if (event.data?.type !== "LODESTAR_EXTENSION_TOKEN") return;

    const { state, token } = event.data;

    chrome.runtime.sendMessage({ type: "SITE_EXTENSION_TOKEN", state, token }, (response) => {
        const failed = chrome.runtime.lastError || !response?.ok;

        window.postMessage(
            {
                type: "LODESTAR_EXTENSION_TOKEN_ACK",
                ok: !failed,
                error: failed ? response?.error ?? "The extension didn't respond." : null,
            },
            window.location.origin
        );
    });
});
