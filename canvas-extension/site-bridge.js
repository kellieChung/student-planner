// Runs only on the Lodestar web app itself (see manifest.json's matches).
//
// 1. Relays the app's Night/Day theme into extension storage so the popup
//    matches the site instead of guessing from the OS color scheme.
// 2. Relays the extension token that /extension-callback hands over after the
//    user clicks Connect. background.js only accepts it for the sign-in state
//    it generated itself.
// 3. Lets the planner ask for a Canvas completion check, and tells it when a
//    check or sync completed tasks so it can reload them.
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

function requestCanvasCompletionCheck() {
    chrome.runtime.sendMessage({ type: "CHECK_CANVAS_COMPLETIONS" }).catch(() => {
        // Extension reloaded since this page loaded.
    });
}

// The planner's own mount-time request can fire before this script loads.
requestCanvasCompletionCheck();

window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    if (event.data?.type !== "LODESTAR_CHECK_CANVAS_COMPLETIONS") return;

    requestCanvasCompletionCheck();
});

chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "CANVAS_COMPLETIONS_APPLIED") return;

    window.postMessage(
        { type: "LODESTAR_CANVAS_COMPLETIONS_APPLIED", completedCount: message.completedCount },
        window.location.origin
    );
});
