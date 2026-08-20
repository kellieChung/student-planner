const canvasUrlInput = document.getElementById("canvasUrl");
const connectButton = document.getElementById("connectButton");
const syncButton = document.getElementById("syncButton");
const status = document.getElementById("status");
const loginButton = document.getElementById("loginButton");


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

        status.textContent = "✅ You're signed in!";
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

        status.textContent =
            "Canvas URL saved.";
    }
}


// ============================================================
// CONNECT CANVAS
// ============================================================

async function connectCanvas() {

    let canvasUrl =
        canvasUrlInput.value.trim();

    if (!canvasUrl) {
        status.textContent =
            "Please enter your Canvas URL.";

        return;
    }

    if (
        !canvasUrl.startsWith("http://") &&
        !canvasUrl.startsWith("https://")
    ) {
        canvasUrl =
            `https://${canvasUrl}`;
    }

    try {

        const url =
            new URL(canvasUrl);

        if (url.protocol !== "https:") {

            status.textContent =
                "Please use an HTTPS Canvas URL.";

            return;
        }

        canvasUrl = url.origin;

        status.textContent =
            "Testing Canvas connection...";

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

        status.textContent =
            "✅ Canvas connected!";

        canvasUrlInput.value =
            canvasUrl;

    } catch (error) {

        console.error(error);

        status.textContent =
            "❌ Could not connect to Canvas. Check the URL.";
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

        status.textContent =
            "❌ Connect Canvas first.";

        return;
    }

    status.textContent =
        "🔄 Syncing Canvas...";

    chrome.runtime.sendMessage(
        {
            type: "SYNC_CANVAS",
            canvasOrigin:
                result.canvasOrigin,
        },
        (response) => {

            if (!response) {

                status.textContent =
                    "❌ No response from extension.";

                return;
            }

            if (!response.success) {

                status.textContent =
                    `❌ Sync failed: ${response.error}`;

                return;
            }

            status.textContent =
                `✅ Synced ${response.courseCount} courses!`;

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

                    status.textContent =
                        "❌ Could not start login.";

                    return;
                }

                if (!response) {

                    status.textContent =
                        "❌ No response from extension.";

                    return;
                }

                if (!response.success) {

                    status.textContent =
                        `❌ Login failed: ${response.error}`;

                    return;
                }

                console.log(
                    "🔐 Authentication started!"
                );

                status.textContent =
                    "🔐 Complete sign-in in the browser...";
            }
        );
    }
);


// ============================================================
// INITIALIZE POPUP
// ============================================================

loadSavedCanvasUrl();
updateAuthUI();