const $ = (id) => document.getElementById(id);

const authChip = $("authChip");
const canvasChip = $("canvasChip");
const loginButton = $("loginButton");
const connectPanel = $("connectPanel");
const detectedRow = $("detectedRow");
const detectedHost = $("detectedHost");
const useDetectedButton = $("useDetectedButton");
const canvasHostLabel = $("canvasHostLabel");
const canvasHostInput = $("canvasHost");
const connectButton = $("connectButton");
const syncPanel = $("syncPanel");
const canvasHostName = $("canvasHostName");
const changeCanvasButton = $("changeCanvasButton");
const syncButton = $("syncButton");
const syncProgress = $("syncProgress");
const syncProgressBar = $("syncProgressBar");
const syncProgressFill = $("syncProgressFill");
const syncProgressStar = $("syncProgressStar");
const syncProgressText = $("syncProgressText");
const cancelSyncButton = $("cancelSyncButton");
const syncChip = $("syncChip");
const messageBox = $("message");
const progressSky = $("progressSky");
const loadCoursesButton = $("loadCoursesButton");
const restoreCourseLabel = $("restoreCourseLabel");
const restoreCourseSelect = $("restoreCourseSelect");
const restoreCourseButton = $("restoreCourseButton");

const SVG_NS = "http://www.w3.org/2000/svg";

// Longest error string shown directly to the user — anything past this is
// logged in full to the console instead, so a verbose backend/stack-trace
// style error can't overflow the small popup.
const MAX_STATUS_ERROR_LENGTH = 80;

// Everything the popup shows is derived from this one object by render(), so
// a state change can't leave one control out of step with another.
const state = {
    signedIn: false,
    canvasOrigin: null,
    // An open tab that looks like Canvas (an origin), if one was found.
    detectedOrigin: null,
    // Reopen the connect form even though Canvas is already connected.
    changingCanvas: false,
    // The background sync's progress record while it is "running", else null.
    syncing: null,
    // Set after a sync succeeds; drives the "Synced N courses" chip.
    lastSyncCourseCount: null,
    message: null,
};

function icon(name) {
    const svg = document.createElementNS(SVG_NS, "svg");
    const use = document.createElementNS(SVG_NS, "use");

    svg.setAttribute("class", "icon");
    svg.setAttribute("aria-hidden", "true");
    use.setAttribute("href", `#i-${name}`);
    svg.append(use);

    return svg;
}

function fillChip(chip, iconName, text) {
    chip.replaceChildren(icon(iconName), document.createTextNode(text));
}

function showMessage(text, kind = "neutral") {
    state.message = text ? { text, kind } : null;
    render();
}

function describeError(prefix, error) {
    const message = typeof error === "string" ? error : String(error ?? "Unknown error");

    if (message.length > MAX_STATUS_ERROR_LENGTH) {
        console.error(`${prefix}:`, message);
        return `${prefix}: ${message.slice(0, MAX_STATUS_ERROR_LENGTH)}...`;
    }

    return `${prefix}: ${message}`;
}

function hostOf(origin) {
    return new URL(origin).hostname;
}


// ============================================================
// RENDER
// ============================================================

function render() {
    const connected = Boolean(state.canvasOrigin);
    const showConnectForm = !connected || state.changingCanvas;
    const running = state.syncing !== null;

    if (state.signedIn) {
        authChip.className = "chip chip-ok";
        fillChip(authChip, "check", "Signed in");
    } else {
        authChip.className = "chip";
        fillChip(authChip, "dot", "Not signed in");
    }

    if (connected) {
        canvasChip.className = "chip chip-ok";
        fillChip(canvasChip, "check", hostOf(state.canvasOrigin));
    } else {
        canvasChip.className = "chip";
        fillChip(canvasChip, "dot", "Canvas not connected");
    }

    loginButton.hidden = state.signedIn;

    connectPanel.hidden = !showConnectForm;
    syncPanel.hidden = showConnectForm;

    const showDetected = showConnectForm && state.detectedOrigin && state.detectedOrigin !== state.canvasOrigin;
    detectedRow.hidden = !showDetected;
    detectedHost.textContent = state.detectedOrigin ? hostOf(state.detectedOrigin) : "";
    canvasHostLabel.textContent = showDetected ? "Or enter it yourself" : "Your school's Canvas address";

    canvasHostName.textContent = connected ? hostOf(state.canvasOrigin) : "";

    // Sync and Cancel never appear together: the running sync replaces the
    // Sync button with its progress, and Cancel lives only inside that.
    syncButton.hidden = running;
    syncProgress.hidden = !running;

    if (running) {
        const { completedCourses, totalCourses, currentCourseName } = state.syncing;
        const pct = totalCourses > 0 ? Math.round((completedCourses / totalCourses) * 100) : 0;

        syncProgressFill.style.width = `${pct}%`;
        syncProgressStar.style.left = `${pct}%`;
        syncProgressBar.setAttribute("aria-valuenow", String(pct));
        syncProgressText.textContent = currentCourseName
            ? `Syncing ${completedCourses}/${totalCourses}: ${currentCourseName}`
            : `Syncing ${completedCourses}/${totalCourses} courses...`;
    }

    const synced = !running && state.lastSyncCourseCount !== null;
    syncChip.hidden = !synced;

    if (synced) {
        fillChip(syncChip, "check", `Synced ${state.lastSyncCourseCount} ${state.lastSyncCourseCount === 1 ? "course" : "courses"}`);
    }

    if (state.message) {
        const iconName = state.message.kind === "success" ? "check" : state.message.kind === "error" ? "alert" : "dot";

        messageBox.hidden = false;
        messageBox.className = `message message-${state.message.kind}`;
        messageBox.replaceChildren(icon(iconName), document.createTextNode(state.message.text));
    } else {
        messageBox.hidden = true;
        messageBox.replaceChildren();
    }

    // The header constellation lights one star per setup step.
    const lit = [state.signedIn, connected, state.lastSyncCourseCount !== null];

    lit.forEach((isLit, index) => $(`skyStar${index + 1}`).classList.toggle("is-lit", isLit));
    $("skyLine1").classList.toggle("is-lit", lit[0] && lit[1]);
    $("skyLine2").classList.toggle("is-lit", lit[1] && lit[2]);
    progressSky.setAttribute("aria-label", `Setup progress: ${lit.filter(Boolean).length} of 3 steps done`);
}


// ============================================================
// THEME
// ============================================================

// Prefer asking the background worker to read the theme live from an open
// Lodestar tab (works even if the extension was just installed or reloaded,
// since it doesn't depend on theme-sync.js having already run in that tab).
// Falls back to the last theme theme-sync.js relayed into storage, then to
// the OS color-scheme preference, if no tab is open.
async function applyPlannerTheme() {
    const liveTheme = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
            { type: "GET_PLANNER_THEME" },
            (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Runtime error fetching planner theme:", chrome.runtime.lastError);
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

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.plannerTheme) {
        document.documentElement.dataset.theme = changes.plannerTheme.newValue;
    }
});


// ============================================================
// AUTH
// ============================================================

async function updateAuthUI() {
    const result = await chrome.storage.local.get("extensionToken");

    state.signedIn = Boolean(result.extensionToken);
    loginButton.disabled = false;
    render();
}

// The background service worker stores the token once sign-in completes.
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.extensionToken) {
        updateAuthUI();
    }
});

loginButton.addEventListener("click", () => {
    loginButton.disabled = true;

    chrome.runtime.sendMessage({ type: "START_EXTENSION_AUTH" }, (response) => {
        if (chrome.runtime.lastError) {
            console.error("Runtime error:", chrome.runtime.lastError);
            showMessage("Could not start sign-in.", "error");
            loginButton.disabled = false;
            return;
        }

        if (!response) {
            showMessage("No response from the extension.", "error");
            loginButton.disabled = false;
            return;
        }

        if (!response.success) {
            showMessage(describeError("Sign-in failed", response.error), "error");
            loginButton.disabled = false;
            return;
        }

        // Left disabled: a sign-in tab is now open, and the storage listener
        // above updates the popup automatically once auth completes.
        showMessage("Finish signing in in the browser tab that just opened.");
    });
});


// ============================================================
// CANVAS URL
// ============================================================

// A bare name ("myschool") means myschool.instructure.com; anything with a
// dot is taken as the school's own full address. Returns an https origin, or
// null if it can't be one.
function normalizeCanvasInput(raw) {
    const value = raw
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .split(/[/?#]/)[0];

    if (!value) return null;

    const host = value.includes(".") ? value : `${value}.instructure.com`;

    return /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(host) ? `https://${host}` : null;
}

const CANVAS_HOSTNAME = /(^|\.)(instructure|canvaslms)\.com$|^canvas\.|\.canvas\./;
const NOT_A_SCHOOL_HOST = /^(community|www|help|guides|status)\./;

async function askTabIfCanvas(tabId) {
    try {
        const reply = await Promise.race([
            chrome.tabs.sendMessage(tabId, { type: "IS_CANVAS_PAGE" }),
            new Promise((resolve) => setTimeout(resolve, 400)),
        ]);

        return reply?.isCanvas === true;
    } catch {
        // No content script in that tab (opened before the extension loaded,
        // or a page we can't run in) — not an error, just no answer.
        return false;
    }
}

// Looks at the user's open tabs for their Canvas. Only https tab origins are
// read (the extension already has host access to them) and the only thing
// asked of a page is a yes/no from content.js.
async function detectCanvasTab() {
    const tabs = await chrome.tabs.query({});
    const byOrigin = new Map();

    for (const tab of tabs) {
        try {
            const url = new URL(tab.url ?? "");

            if (url.protocol === "https:" && !byOrigin.has(url.origin)) {
                byOrigin.set(url.origin, tab.id);
            }
        } catch {
            // chrome:// pages and tabs without a readable URL.
        }
    }

    const origins = [...byOrigin.keys()];
    const byName = origins.find((origin) => {
        const host = hostOf(origin);
        return CANVAS_HOSTNAME.test(host) && !NOT_A_SCHOOL_HOST.test(host);
    });

    if (byName) return byName;

    for (const origin of origins.slice(0, 20)) {
        if (await askTabIfCanvas(byOrigin.get(origin))) return origin;
    }

    return null;
}

async function loadCanvasState() {
    const result = await chrome.storage.local.get("canvasOrigin");

    state.canvasOrigin = result.canvasOrigin ?? null;
    render();

    if (!state.canvasOrigin) {
        state.detectedOrigin = await detectCanvasTab();
        render();
    }
}


// ============================================================
// CONNECT CANVAS
// ============================================================

async function connectCanvas(canvasOrigin) {
    if (!canvasOrigin) {
        showMessage("Enter your school's Canvas address, like myschool or canvas.myschool.edu.", "error");
        return;
    }

    connectButton.disabled = true;
    useDetectedButton.disabled = true;
    showMessage(`Checking ${hostOf(canvasOrigin)}...`);

    try {
        const response = await fetch(`${canvasOrigin}/api/v1/users/self`);

        if (!response.ok) {
            throw new Error(`Canvas returned ${response.status}`);
        }

        await chrome.storage.local.set({ canvasOrigin });

        state.canvasOrigin = canvasOrigin;
        state.changingCanvas = false;
        canvasHostInput.value = "";
        showMessage("Canvas connected.", "success");
    } catch (error) {
        showMessage(describeError("Could not reach Canvas. Make sure you're signed in to it in this browser", error), "error");
    } finally {
        connectButton.disabled = false;
        useDetectedButton.disabled = false;
    }
}

connectButton.addEventListener("click", () => connectCanvas(normalizeCanvasInput(canvasHostInput.value)));
useDetectedButton.addEventListener("click", () => connectCanvas(state.detectedOrigin));

canvasHostInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        connectCanvas(normalizeCanvasInput(canvasHostInput.value));
    }
});

changeCanvasButton.addEventListener("click", async () => {
    state.changingCanvas = true;
    render();
    canvasHostInput.focus();

    if (!state.detectedOrigin) {
        state.detectedOrigin = await detectCanvasTab();
        render();
    }
});


// ============================================================
// CANVAS SYNC
// ============================================================

// Longest a "running" sync can go without a fresh progress write before
// the popup treats it as abandoned (service worker killed/reloaded
// mid-sync) rather than genuinely still in progress — without this, a
// stale record would leave the popup stuck on "syncing" forever.
const STALE_SYNC_MS = 90_000;

// A sync begun in one popup instance keeps running in the background
// service worker even after that popup closes — this reads that record back
// on open so "resume showing progress" and live updates share one path.
async function restoreSyncProgress() {
    const result = await chrome.storage.local.get("canvasSyncProgress");
    const progress = result.canvasSyncProgress;

    if (!progress) return;

    if (progress.status === "running" && Date.now() - progress.updatedAt > STALE_SYNC_MS) {
        state.syncing = null;
        showMessage("The last sync was interrupted. Try again.", "error");
        return;
    }

    if (progress.status === "running") {
        state.syncing = progress;
        render();
        return;
    }

    state.syncing = null;

    if (progress.status === "success") {
        state.lastSyncCourseCount = progress.courseCount;
        render();
    } else if (progress.status === "cancelled") {
        showMessage("Sync cancelled. No changes were saved.");
    } else if (progress.status === "error") {
        showMessage(describeError("Sync failed", progress.errorMessage), "error");
    } else {
        render();
    }
}

chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "SYNC_PROGRESS") {
        state.syncing = {
            status: "running",
            completedCourses: message.completedCourses,
            totalCourses: message.totalCourses,
            currentCourseName: message.currentCourseName,
        };
        render();
    }
});

async function syncCanvas() {
    if (!state.signedIn) {
        showMessage("Sign in to Lodestar first.", "error");
        return;
    }

    if (!state.canvasOrigin) {
        showMessage("Connect Canvas first.", "error");
        return;
    }

    state.message = null;
    state.lastSyncCourseCount = null;
    state.syncing = { status: "running", completedCourses: 0, totalCourses: 0, currentCourseName: null };
    render();

    chrome.runtime.sendMessage(
        { type: "SYNC_CANVAS", canvasOrigin: state.canvasOrigin },
        (response) => {
            // Only the popup that started the sync runs this callback; a
            // reopened popup picks the same outcome up from
            // restoreSyncProgress instead.
            state.syncing = null;

            if (!response) {
                showMessage("No response from the extension.", "error");
                return;
            }

            if (response.cancelled) {
                showMessage("Sync cancelled. No changes were saved.");
                return;
            }

            if (!response.success) {
                showMessage(describeError("Sync failed", response.error), "error");
                return;
            }

            state.lastSyncCourseCount = response.courseCount;
            showMessage(null);
        }
    );
}

function cancelSync() {
    cancelSyncButton.disabled = true;

    chrome.runtime.sendMessage({ type: "CANCEL_SYNC" }, () => {
        if (chrome.runtime.lastError) {
            console.error("Runtime error cancelling sync:", chrome.runtime.lastError);
        }

        cancelSyncButton.disabled = false;
    });
}

syncButton.addEventListener("click", syncCanvas);
cancelSyncButton.addEventListener("click", cancelSync);


// ============================================================
// RESTORE A COURSE (Troubleshooting)
// ============================================================

// Populated by loadCourseOptions() below, and read back by index (not by
// Canvas's numeric id, which isn't a safe/stable <option value>) when the
// user picks one to restore.
let restorableCourses = [];

function loadCourseOptions() {
    if (!state.canvasOrigin) {
        showMessage("Connect Canvas first.", "error");
        return;
    }

    loadCoursesButton.disabled = true;
    showMessage("Looking up your Canvas courses...");

    chrome.runtime.sendMessage(
        { type: "LIST_CANVAS_COURSES", canvasOrigin: state.canvasOrigin },
        (response) => {
            loadCoursesButton.disabled = false;

            if (!response) {
                showMessage("No response from the extension.", "error");
                return;
            }

            if (!response.success) {
                showMessage(describeError("Couldn't load courses", response.error), "error");
                return;
            }

            restorableCourses = response.courses ?? [];
            restoreCourseSelect.replaceChildren();

            restorableCourses.forEach((course, index) => {
                const option = document.createElement("option");

                option.value = String(index);
                option.textContent = course.name ?? `Course ${course.id}`;
                restoreCourseSelect.appendChild(option);
            });

            const found = restorableCourses.length > 0;

            restoreCourseLabel.hidden = !found;
            restoreCourseSelect.hidden = !found;
            restoreCourseButton.hidden = !found;

            showMessage(
                found ? `Found ${restorableCourses.length} Canvas course(s). Pick one to restore.` : "No Canvas courses found.",
                found ? "success" : "neutral"
            );
        }
    );
}

function restoreSelectedCourse() {
    if (!state.canvasOrigin) {
        showMessage("Connect Canvas first.", "error");
        return;
    }

    const course = restorableCourses[Number(restoreCourseSelect.value)];

    if (!course) {
        showMessage("Pick a course first.", "error");
        return;
    }

    restoreCourseButton.disabled = true;
    showMessage(`Restoring ${course.name}...`);

    chrome.runtime.sendMessage(
        { type: "RESTORE_COURSE", canvasOrigin: state.canvasOrigin, course },
        (response) => {
            restoreCourseButton.disabled = false;

            if (!response) {
                showMessage("No response from the extension.", "error");
                return;
            }

            if (!response.success) {
                showMessage(describeError("Restore failed", response.error), "error");
                return;
            }

            showMessage(`Restored ${response.courseName}.`, "success");
        }
    );
}

loadCoursesButton.addEventListener("click", loadCourseOptions);
restoreCourseButton.addEventListener("click", restoreSelectedCourse);


// ============================================================
// INITIALIZE POPUP
// ============================================================

render();
applyPlannerTheme();
updateAuthUI();
loadCanvasState();
restoreSyncProgress();
