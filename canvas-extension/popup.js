const canvasUrlInput = document.getElementById("canvasUrl");
const connectButton = document.getElementById("connectButton");
const syncButton = document.getElementById("syncButton");
const status = document.getElementById("status");
const loginButton = document.getElementById("loginButton");
const loadCoursesButton = document.getElementById("loadCoursesButton");
const restoreCourseSelect = document.getElementById("restoreCourseSelect");
const restoreCourseButton = document.getElementById("restoreCourseButton");
const syncProgress = document.getElementById("syncProgress");
const syncProgressFill = document.getElementById("syncProgressFill");
const syncProgressText = document.getElementById("syncProgressText");
const cancelSyncButton = document.getElementById("cancelSyncButton");

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

// A sync begun in one popup instance keeps running in the background
// service worker even after that popup closes — this is the single render
// function both the live SYNC_PROGRESS listener and the on-open storage
// read call, so "resume showing progress" and "live update" never diverge.
function renderSyncProgress(progress) {

    if (!progress || progress.status !== "running") {
        syncProgress.hidden = true;
        cancelSyncButton.hidden = true;
        syncButton.disabled = false;

        return;
    }

    syncProgress.hidden = false;
    cancelSyncButton.hidden = false;
    syncButton.disabled = true;

    const pct =
        progress.totalCourses > 0
            ? Math.round((progress.completedCourses / progress.totalCourses) * 100)
            : 0;

    syncProgressFill.style.width = `${pct}%`;

    syncProgressText.textContent =
        progress.currentCourseName
            ? `Syncing ${progress.completedCourses}/${progress.totalCourses}: ${progress.currentCourseName}`
            : `Syncing ${progress.completedCourses}/${progress.totalCourses} courses...`;
}

// Longest a "running" sync can go without a fresh progress write before
// the popup treats it as abandoned (service worker killed/reloaded
// mid-sync) rather than genuinely still in progress — without this, a
// stale record would show a permanently disabled sync button forever.
const STALE_SYNC_MS = 90_000;

async function restoreSyncProgress() {

    const result =
        await chrome.storage.local.get(
            "canvasSyncProgress"
        );

    const progress = result.canvasSyncProgress;

    if (!progress) {
        return;
    }

    if (
        progress.status === "running" &&
        Date.now() - progress.updatedAt > STALE_SYNC_MS
    ) {
        renderSyncProgress(null);
        setStatus("⚠️ Sync was interrupted. Try again.", "error");

        return;
    }

    if (progress.status === "running") {
        renderSyncProgress(progress);

        return;
    }

    renderSyncProgress(null);

    if (progress.status === "success") {
        setStatus(`✅ Synced ${progress.courseCount} courses!`, "success");
    } else if (progress.status === "cancelled") {
        setStatus("Cancelled — no changes were saved.");
    } else if (progress.status === "error") {
        setStatus(describeError("❌ Sync failed", progress.errorMessage), "error");
    }
}

chrome.runtime.onMessage.addListener((message) => {

    if (message.type === "SYNC_PROGRESS") {
        renderSyncProgress({
            status: "running",
            completedCourses: message.completedCourses,
            totalCourses: message.totalCourses,
            currentCourseName: message.currentCourseName,
        });
    }
});

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
    setStatus("🔄 Starting Canvas sync...");

    chrome.runtime.sendMessage(
        {
            type: "SYNC_CANVAS",
            canvasOrigin:
                result.canvasOrigin,
        },
        (response) => {

            // Most UI state (bar/cancel button/button-disabled) is owned
            // by renderSyncProgress/restoreSyncProgress now, since a
            // reopened popup instance never runs this callback — only the
            // popup that started the sync does. This callback just resets
            // to the idle state and shows the terminal message.
            renderSyncProgress(null);

            if (!response) {

                setStatus("❌ No response from extension.", "error");

                return;
            }

            if (response.cancelled) {

                setStatus("Cancelled — no changes were saved.");

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

function cancelSync() {

    cancelSyncButton.disabled = true;

    chrome.runtime.sendMessage(
        { type: "CANCEL_SYNC" },
        () => {

            if (chrome.runtime.lastError) {
                console.error(
                    "❌ Runtime error cancelling sync:",
                    chrome.runtime.lastError
                );
            }

            cancelSyncButton.disabled = false;
        }
    );
}


// ============================================================
// RESTORE A COURSE
// ============================================================

// Populated by loadCourseOptions() below, and read back by index (not by
// Canvas's numeric id, which isn't a safe/stable <option value>) when the
// user picks one to restore.
let restorableCourses = [];

async function loadCourseOptions() {

    const result =
        await chrome.storage.local.get(
            "canvasOrigin"
        );

    if (!result.canvasOrigin) {

        setStatus("❌ Connect Canvas first.", "error");

        return;
    }

    loadCoursesButton.disabled = true;
    setStatus("🔎 Looking up your Canvas courses...");

    chrome.runtime.sendMessage(
        {
            type: "LIST_CANVAS_COURSES",
            canvasOrigin:
                result.canvasOrigin,
        },
        (response) => {

            loadCoursesButton.disabled = false;

            if (!response) {

                setStatus("❌ No response from extension.", "error");

                return;
            }

            if (!response.success) {

                setStatus(describeError("❌ Couldn't load courses", response.error), "error");

                return;
            }

            restorableCourses = response.courses ?? [];

            restoreCourseSelect.innerHTML = "";

            restorableCourses.forEach((course, index) => {
                const option = document.createElement("option");
                option.value = String(index);
                option.textContent = course.name ?? `Course ${course.id}`;
                restoreCourseSelect.appendChild(option);
            });

            restoreCourseSelect.hidden = restorableCourses.length === 0;
            restoreCourseButton.hidden = restorableCourses.length === 0;

            setStatus(
                restorableCourses.length > 0
                    ? `Found ${restorableCourses.length} Canvas course(s). Pick one to restore.`
                    : "No Canvas courses found.",
                restorableCourses.length > 0 ? "success" : "neutral"
            );
        }
    );
}

async function restoreSelectedCourse() {

    const result =
        await chrome.storage.local.get(
            "canvasOrigin"
        );

    if (!result.canvasOrigin) {

        setStatus("❌ Connect Canvas first.", "error");

        return;
    }

    const course = restorableCourses[Number(restoreCourseSelect.value)];

    if (!course) {

        setStatus("❌ Pick a course first.", "error");

        return;
    }

    restoreCourseButton.disabled = true;
    setStatus(`🔁 Restoring ${course.name}...`);

    chrome.runtime.sendMessage(
        {
            type: "RESTORE_COURSE",
            canvasOrigin:
                result.canvasOrigin,
            course,
        },
        (response) => {

            restoreCourseButton.disabled = false;

            if (!response) {

                setStatus("❌ No response from extension.", "error");

                return;
            }

            if (!response.success) {

                setStatus(describeError("❌ Restore failed", response.error), "error");

                return;
            }

            setStatus(`✅ Restored ${response.courseName}!`, "success");
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

cancelSyncButton.addEventListener(
    "click",
    cancelSync
);

loadCoursesButton.addEventListener(
    "click",
    loadCourseOptions
);

restoreCourseButton.addEventListener(
    "click",
    restoreSelectedCourse
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
restoreSyncProgress();