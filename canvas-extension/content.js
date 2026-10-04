// Lets the popup ask an open tab "is this Canvas?" so it can offer to connect
// without the user typing a URL. Answers with a boolean and the page's origin
// only; nothing else about the page leaves it.
const CANVAS_PAGE_SELECTOR = '.ic-app, [class*="ic-Layout"], link[href*="brandable_css"]';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "IS_CANVAS_PAGE") return;

    sendResponse({
        isCanvas: document.querySelector(CANVAS_PAGE_SELECTOR) !== null,
        origin: window.location.origin,
    });
});

// Canvas reloads the page after a submission, so any Canvas page load asks
// background.js for a completion check (it ignores hosts other than the
// connected Canvas, and throttles).
if (document.querySelector(CANVAS_PAGE_SELECTOR) !== null) {
    chrome.runtime.sendMessage({ type: "CANVAS_PAGE_VISITED" }).catch(() => {
        // Extension reloaded since this page loaded.
    });
}
