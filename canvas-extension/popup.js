const canvasUrlInput = document.getElementById("canvasUrl");
const connectButton = document.getElementById("connectButton");
const status = document.getElementById("status");

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

    if (!canvasUrl.startsWith("http://") && !canvasUrl.startsWith("https://")) {
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

connectButton.addEventListener("click", connectCanvas);

loadSavedCanvasUrl();