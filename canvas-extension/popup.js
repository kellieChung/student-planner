const canvasUrlInput = document.getElementById("canvasUrl");
const connectButton = document.getElementById("connectButton");
const syncButton = document.getElementById("syncButton");
const status = document.getElementById("status");
const loginButton = document.getElementById("loginButton");

// Longest error string shown directly to the user — anything past this is
// logged in full to the console instead, so a verbose backend/stack-trace
// style error can't overflow the small popup.
const MAX_STATUS_ERROR_LENGTH = 80;

function setStatus(text, kind = "neutral") {
    status.textContent = text;
    status.classList.remove("status-success", "status-error");

    if (kind === "success") {
        status.classList.add("status-success");
    } else if (kind === "error") {
        status.classList.add("status-error");
    }
}

function describeError(prefix, error) {
    const message = typeof error === "string" ? error : String(error ?? "Unknown error");

    if (message.length > MAX_STATUS_ERROR_LENGTH) {
        console.error(`${prefix}:`, message);
        return `${prefix}: ${message.slice(0, MAX_STATUS_ERROR_LENGTH)}...`;
    }

    return `${prefix}: ${message}`;
}


// ============================================================
// THEME
// ============================================================

// Prefer asking the background worker to read the theme live from an open
// Student Planner tab (works even if the extension was just installed or
// reloaded, since it doesn't depend on theme-sync.js having already run in
// that tab). Falls back to the last theme theme-sync.js relayed into
// storage, then to the OS color-scheme preference, if no tab is open.
async function applyPlannerTheme() {
    const liveTheme = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
            { type: "GET_PLANNER_THEME" },
            (response) => {
                if (chrome.runtime.lastError) {
                    console.error(
                        "❌ Runtime error fetching planner theme:",
                        chrome.runtime.lastError
                    );
                    resolve(null);
                    return;
                }

                resolve(response?.success ? response.theme : null);
            }
        );
    });

    if (liveTheme === "light" || liveTheme === "dark") {
        document.documentElement.dataset.theme = liveTheme;
        chrome.storage.local.set({ plannerTheme: liveTheme });
        return;
    }

    const result = await chrome.storage.local.get("plannerTheme");

    const theme =
        result.plannerTheme === "light" || result.plannerTheme === "dark"
            ? result.plannerTheme
            : window.matchMedia("(prefers-color-scheme: light)").matches
                ? "light"
                : "dark";

    document.documentElement.dataset.theme = theme;
}

chrome.storage.onChanged.addListener(
    (changes, areaName) => {
        if (areaName === "local" && changes.plannerTheme) {
            document.documentElement.dataset.theme = changes.plannerTheme.newValue;
        }
    }
);


// ============================================================
// AUTH UI
// ============================================================

async function updateAuthUI() {
    const result = await chrome.storage.local.get(
        "extensionToken"
    );

    console.log(
        "🔐 Checking extension auth:",
        result.extensionToken ? "SIGNED IN" : "NOT SIGNED IN"
    );

    if (result.extensionToken) {
        loginButton.textContent = "✅ Signed in";
        loginButton.disabled = true;

        setStatus("✅ You're signed in!", "success");
    } else {
        loginButton.textContent = "Sign in with Google";
        loginButton.disabled = false;
    }
}


// Watch for the background service worker storing the token.
chrome.storage.onChanged.addListener(
    (changes, areaName) => {

        if (
            areaName === "local" &&
            changes.extensionToken
        ) {
            console.log(
                "🔐 Extension authentication state changed!"
            );

            updateAuthUI();
        }
    }
);


// ============================================================
// CANVAS URL
// ============================================================

async function loadSavedCanvasUrl() {
    const result =
        await chrome.storage.local.get(
            "canvasOrigin"
        );

    if (result.canvasOrigin) {
        canvasUrlInput.value =
            result.canvasOrigin;

        setStatus("Canvas URL saved.");
    } else {
        setStatus("Enter your Canvas URL to get started.");
    }
}


// ============================================================
// CONNECT CANVAS
// ============================================================

async function connectCanvas() {

    let canvasUrl =
        canvasUrlInput.value.trim();

    if (!canvasUrl) {
        setStatus("Please enter your Canvas URL.", "error");

        return;
    }

    if (
        !canvasUrl.startsWith("http://") &&
        !canvasUrl.startsWith("https://")
    ) {
        canvasUrl =
            `https://${canvasUrl}`;
    }

    connectButton.disabled = true;

    try {

        const url =
            new URL(canvasUrl);

        if (url.protocol !== "https:") {

            setStatus("Please use an HTTPS Canvas URL.", "error");

            return;
        }

        canvasUrl = url.origin;

        setStatus("Testing Canvas connection...");

        const response =
            await fetch(
                `${canvasUrl}/api/v1/users/self`
            );

        if (!response.ok) {
            throw new Error(
                `Canvas returned ${response.status}`
            );
        }

        await chrome.storage.local.set({
            canvasOrigin: canvasUrl,
        });

        setStatus("✅ Canvas connected!", "success");

        canvasUrlInput.value =
            canvasUrl;

    } catch (error) {

        setStatus(describeError("❌ Could not connect to Canvas", error), "error");

    } finally {
        connectButton.disabled = false;
    }
}


// ============================================================
// CANVAS SYNC
// ============================================================

async function syncCanvas() {

    const result =
        await chrome.storage.local.get(
            "canvasOrigin"
        );

    if (!result.canvasOrigin) {

        setStatus("❌ Connect Canvas first.", "error");

        return;
    }

    syncButton.disabled = true;
    setStatus("🔄 Syncing Canvas...");

    chrome.runtime.sendMessage(
        {
            type: "SYNC_CANVAS",
            canvasOrigin:
                result.canvasOrigin,
        },
        (response) => {

            syncButton.disabled = false;

            if (!response) {

                setStatus("❌ No response from extension.", "error");

                return;
            }

            if (!response.success) {

                setStatus(describeError("❌ Sync failed", response.error), "error");

                return;
            }

            setStatus(`✅ Synced ${response.courseCount} courses!`, "success");

            console.log(
                "🎉 Canvas sync successfully sent to Student Planner!"
            );
        }
    );
}


// ============================================================
// EVENT LISTENERS
// ============================================================

connectButton.addEventListener(
    "click",
    connectCanvas
);

syncButton.addEventListener(
    "click",
    syncCanvas
);


// ============================================================
// GOOGLE LOGIN
// ============================================================

loginButton.addEventListener(
    "click",
    () => {

        console.log(
            "🔐 Starting extension authentication..."
        );

        loginButton.disabled = true;

        chrome.runtime.sendMessage(
            {
                type: "START_EXTENSION_AUTH",
            },
            (response) => {

                if (chrome.runtime.lastError) {

                    console.error(
                        "❌ Runtime error:",
                        chrome.runtime.lastError
                    );

                    setStatus("❌ Could not start login.", "error");
                    loginButton.disabled = false;

                    return;
                }

                if (!response) {

                    setStatus("❌ No response from extension.", "error");
                    loginButton.disabled = false;

                    return;
                }

                if (!response.success) {

                    setStatus(describeError("❌ Login failed", response.error), "error");
                    loginButton.disabled = false;

                    return;
                }

                console.log(
                    "🔐 Authentication started!"
                );

                // Left disabled: a sign-in tab is now open, and
                // chrome.storage.onChanged (above) re-enables/updates this
                // button automatically once auth completes.
                setStatus("🔐 Complete sign-in in the browser...");
            }
        );
    }
);


// ============================================================
// INITIALIZE POPUP
// ============================================================

applyPlannerTheme();
loadSavedCanvasUrl();
updateAuthUI();