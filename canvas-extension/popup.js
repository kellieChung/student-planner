const canvasUrlInput = document.getElementById("canvasUrl");
const connectButton = document.getElementById("connectButton");
const syncButton = document.getElementById("syncButton");
const status = document.getElementById("status");
const loginButton = document.getElementById("loginButton");


async function loadSavedCanvasUrl() {
    const result = await chrome.storage.local.get("canvasOrigin");

    if (result.canvasOrigin) {
        canvasUrlInput.value = result.canvasOrigin;
        status.textContent = "Canvas URL saved.";
    }
}


async function connectCanvas() {
    let canvasUrl = canvasUrlInput.value.trim();

    if (!canvasUrl) {
        status.textContent = "Please enter your Canvas URL.";
        return;
    }

    if (
        !canvasUrl.startsWith("http://") &&
        !canvasUrl.startsWith("https://")
    ) {
        canvasUrl = `https://${canvasUrl}`;
    }

    try {
        const url = new URL(canvasUrl);

        if (url.protocol !== "https:") {
            status.textContent = "Please use an HTTPS Canvas URL.";
            return;
        }

        canvasUrl = url.origin;

        status.textContent = "Testing Canvas connection...";

        const response = await fetch(
            `${canvasUrl}/api/v1/users/self`
        );

        if (!response.ok) {
            throw new Error(`Canvas returned ${response.status}`);
        }

        await chrome.storage.local.set({
            canvasOrigin: canvasUrl
        });

        status.textContent = "✅ Canvas connected!";
        canvasUrlInput.value = canvasUrl;

    } catch (error) {
        console.error(error);

        status.textContent =
            "❌ Could not connect to Canvas. Check the URL.";
    }
}


async function syncCanvas() {
    const result = await chrome.storage.local.get("canvasOrigin");

    if (!result.canvasOrigin) {
        status.textContent = "❌ Connect Canvas first.";
        return;
    }

    status.textContent = "🔄 Syncing Canvas...";

    chrome.runtime.sendMessage(
        {
            type: "SYNC_CANVAS",
            canvasOrigin: result.canvasOrigin,
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


connectButton.addEventListener(
    "click",
    connectCanvas
);

syncButton.addEventListener(
    "click",
    syncCanvas
);

loginButton.addEventListener("click", async () => {
    const state = crypto.randomUUID();

    await chrome.storage.local.set({
        extensionAuthState: state,
    });

    chrome.tabs.create({
        url:
            `http://localhost:3000/extension-login?state=${encodeURIComponent(state)}`,
    });
});

loadSavedCanvasUrl();