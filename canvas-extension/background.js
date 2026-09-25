// The backend origin comes from config.js (the only place it's set — no
// user-facing setting). Any "appOrigin" an earlier build saved from the old
// popup field is dropped so a stale localhost value can't silently redirect a
// real user's sign-in and sync.
importScripts("config.js");

chrome.storage.local.remove("appOrigin");

async function getAppOrigin() {
    return APP_ORIGIN;
}

// How long a sign-in started from the popup stays claimable. The token only
// ever arrives from the Lodestar tab via site-bridge.js, and only for the
// state this worker generated, so an attacker's link can't pair an account.
const AUTH_STATE_TTL_MS = 30 * 60 * 1000;

// Canvas HTML bodies are kept (the Rundown highlights evidence in the
// original markup) but capped so one huge page can't blow the request-body
// limit on the sync POST.
const MAX_HTML_LENGTH = 50_000;

// Canvas's announcements endpoint defaults to the last 14 days; an early-term
// announcement about a later deadline is exactly what the Rundown looks for.
const ANNOUNCEMENT_LOOKBACK_DAYS = 120;

// Checked between courses in SYNC_CANVAS's loop, set by the CANCEL_SYNC
// handler. One sync at a time (see syncInProgress), so a single module-level
// flag is enough.
let syncCancelled = false;
let syncInProgress = false;

// Single source of truth for sync progress; the popup renders from it both
// on open and live (chrome.storage.onChanged). If the service worker is
// killed mid-sync this is left at "running"/"saving" with a stale
// `updatedAt`, which the popup treats as interrupted.
async function setSyncProgress(progress) {
    await chrome.storage.local.set({
        canvasSyncProgress: { ...progress, updatedAt: Date.now() },
    });
}

// Follows Canvas's RFC 5988 `Link` header pagination (every call site here
// requests per_page=100 and expects a flat array back).
function getNextPageUrl(linkHeader) {
    if (!linkHeader) return null;

    for (const part of linkHeader.split(",")) {
        const match = part.match(/<([^>]+)>;\s*rel="next"/);
        if (match) return match[1];
    }

    return null;
}

async function getCanvasData(url) {
    let results = [];
    let nextUrl = url;

    while (nextUrl) {
        const response = await fetch(nextUrl);

        if (!response.ok) {
            throw new Error(`Canvas returned ${response.status}`);
        }

        results = results.concat(await response.json());
        nextUrl = getNextPageUrl(response.headers.get("Link"));
    }

    return results;
}

// Looked up on demand (rather than relying solely on site-bridge.js having
// already run in an open tab) so the popup shows the right theme even right
// after installing/reloading the extension.
async function getPlannerTabTheme() {
    const appOrigin = await getAppOrigin();

    const tabs = await chrome.tabs.query({
        url: [
            `${appOrigin}/*`,
            "http://localhost:3000/*",
            "http://127.0.0.1:3000/*",
        ],
    });

    if (tabs.length === 0) {
        return null;
    }

    const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () =>
            document.documentElement.dataset.theme === "light"
                ? "light"
                : "dark",
    });

    return result ?? null;
}

function capHtml(value) {
    return typeof value === "string" ? value.slice(0, MAX_HTML_LENGTH) : null;
}

// Only the fields lib/canvasIngest.ts reads — Canvas objects carry rubrics,
// permissions, attachments etc. that would otherwise bloat the sync POST.
function pickCourse(course) {
    return { id: course.id, name: course.name };
}

function pickAssignment(assignment) {
    return {
        id: assignment.id,
        name: assignment.name,
        description: capHtml(assignment.description),
        due_at: assignment.due_at ?? null,
        html_url: assignment.html_url ?? null,
    };
}

function pickDiscussion(discussion) {
    return {
        id: discussion.id,
        title: discussion.title,
        message: capHtml(discussion.message),
        html_url: discussion.html_url ?? null,
        posted_at: discussion.posted_at ?? null,
        due_at: discussion.due_at ?? discussion.assignment?.due_at ?? null,
    };
}

function pickAnnouncement(announcement) {
    return {
        id: announcement.id,
        title: announcement.title,
        message: capHtml(announcement.message),
        html_url: announcement.html_url ?? null,
        posted_at: announcement.posted_at ?? null,
    };
}

// Shared by SYNC_CANVAS and RESTORE_COURSE — both need the identical
// assignments/discussions/announcements fetch for one course.
function dayKeyFromNow(days) {
    const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    return date.toISOString().slice(0, 10);
}

async function fetchCourseData(canvasOrigin, course) {
    // Canvas defaults end_date to start_date + 28 days, so both are explicit:
    // from the lookback start through tomorrow (covers any timezone).
    const announcementStart = dayKeyFromNow(-ANNOUNCEMENT_LOOKBACK_DAYS);
    const announcementEnd = dayKeyFromNow(1);

    const assignments = await getCanvasData(
        `${canvasOrigin}/api/v1/courses/${course.id}/assignments?per_page=100`
    );

    const discussions = await getCanvasData(
        `${canvasOrigin}/api/v1/courses/${course.id}/discussion_topics?per_page=100`
    );

    const announcements = await getCanvasData(
        `${canvasOrigin}/api/v1/announcements?context_codes[]=course_${course.id}&active_only=true&start_date=${announcementStart}&end_date=${announcementEnd}&per_page=100`
    );

    return {
        course: pickCourse(course),
        assignments: assignments.map(pickAssignment),
        discussions: discussions.map(pickDiscussion),
        announcements: announcements.map(pickAnnouncement),
    };
}

async function clearExtensionAuth() {
    await chrome.storage.local.remove([
        "extensionToken",
        "extensionAuthState",
        "extensionAuthStartedAt",
    ]);
}

// Revokes the token server-side (best effort) before forgetting it locally.
async function signOut() {
    const { extensionToken } = await chrome.storage.local.get("extensionToken");

    if (extensionToken) {
        const appOrigin = await getAppOrigin();

        await fetch(`${appOrigin}/api/extension/auth/session`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${extensionToken}` },
        }).catch((error) => {
            console.warn("Could not revoke the extension session:", error);
        });
    }

    await clearExtensionAuth();
}

function randomState() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);

    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function startExtensionAuth() {
    const appOrigin = await getAppOrigin();
    const state = randomState();

    await chrome.storage.local.set({
        extensionAuthState: state,
        extensionAuthStartedAt: Date.now(),
    });

    await chrome.tabs.create({
        url: `${appOrigin}/extension-login?state=${encodeURIComponent(state)}`,
    });
}

// Called when site-bridge.js relays the token the /extension-callback page
// handed over. Accepts it only from the configured Lodestar origin and only
// for the sign-in this worker started.
async function acceptSiteToken(message, sender) {
    const appOrigin = await getAppOrigin();
    const senderOrigin = sender.origin ?? (sender.url ? new URL(sender.url).origin : null);

    if (sender.id !== chrome.runtime.id || senderOrigin !== appOrigin) {
        return { ok: false, error: "This page isn't the Lodestar app this extension uses." };
    }

    const { extensionAuthState, extensionAuthStartedAt } = await chrome.storage.local.get([
        "extensionAuthState",
        "extensionAuthStartedAt",
    ]);

    const fresh =
        typeof extensionAuthStartedAt === "number" &&
        Date.now() - extensionAuthStartedAt < AUTH_STATE_TTL_MS;

    if (!extensionAuthState || !fresh || message.state !== extensionAuthState) {
        return {
            ok: false,
            error: "This sign-in wasn't started from your extension. Open the extension and click Sign in.",
        };
    }

    if (typeof message.token !== "string" || message.token.length < 32) {
        return { ok: false, error: "Sign-in response was malformed." };
    }

    await chrome.storage.local.set({ extensionToken: message.token });
    await chrome.storage.local.remove(["extensionAuthState", "extensionAuthStartedAt"]);

    return { ok: true };
}

async function authorizedFetch(url, token, init = {}) {
    const response = await fetch(url, {
        ...init,
        headers: {
            ...(init.headers ?? {}),
            Authorization: `Bearer ${token}`,
        },
    });

    if (response.status === 401) {
        await clearExtensionAuth();
        throw new Error("Your session expired. Please sign in again.");
    }

    return response;
}

async function runCanvasSync(canvasOrigin) {
    syncCancelled = false;

    const { extensionToken } = await chrome.storage.local.get("extensionToken");

    if (!extensionToken) {
        await clearExtensionAuth();
        throw new Error("Extension is not authenticated. Please sign in again.");
    }

    const appOrigin = await getAppOrigin();

    await setSyncProgress({
        status: "running",
        totalCourses: 0,
        completedCourses: 0,
        currentCourseName: null,
    });

    const courses = await getCanvasData(
        `${canvasOrigin}/api/v1/courses?enrollment_type=student&enrollment_state=active&per_page=100`
    );

    // Skip courses the user deleted in Lodestar (the server would drop them
    // anyway). Fails open except on 401.
    let excludedIds = new Set();

    try {
        const excludedResponse = await authorizedFetch(
            `${appOrigin}/api/canvas/excluded-courses?canvasOrigin=${encodeURIComponent(canvasOrigin)}`,
            extensionToken
        );

        if (excludedResponse.ok) {
            const excludedData = await excludedResponse.json().catch(() => null);

            if (Array.isArray(excludedData?.canvasIds)) {
                excludedIds = new Set(excludedData.canvasIds.map(String));
            }
        }
    } catch (error) {
        if (error.message.startsWith("Your session expired")) throw error;
        console.warn("Excluded-courses lookup failed; syncing everything.", error);
    }

    const coursesToSync = courses.filter((course) => !excludedIds.has(String(course.id)));

    if (coursesToSync.length === 0) {
        return { status: "success", totalCourses: 0, completedCourses: 0, courseCount: 0, failedCourseNames: [] };
    }

    const courseData = [];
    const failedCourses = [];
    let completed = 0;

    for (const course of coursesToSync) {
        if (syncCancelled) {
            return { status: "cancelled", totalCourses: coursesToSync.length, completedCourses: completed };
        }

        await setSyncProgress({
            status: "running",
            totalCourses: coursesToSync.length,
            completedCourses: completed,
            currentCourseName: course.name ?? null,
        });

        // One restricted endpoint or flaky page shouldn't block every other
        // course; a failed course is reported and kept (not pruned) server-side.
        try {
            courseData.push(await fetchCourseData(canvasOrigin, course));
        } catch (error) {
            console.warn(`Could not read ${course.name ?? course.id} from Canvas:`, error);
            failedCourses.push(course);
        }

        completed++;
    }

    if (syncCancelled) {
        return { status: "cancelled", totalCourses: coursesToSync.length, completedCourses: completed };
    }

    if (courseData.length === 0) {
        throw new Error("Couldn't read any of your courses from Canvas. Try again in a minute.");
    }

    await setSyncProgress({
        status: "saving",
        totalCourses: coursesToSync.length,
        completedCourses: completed,
        currentCourseName: null,
    });

    // A cancelled sync never reaches this POST: /api/canvas/sync treats the
    // payload as a full snapshot and prunes courses missing from it.
    const backendResponse = await authorizedFetch(`${appOrigin}/api/canvas/sync`, extensionToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            canvasOrigin,
            courses: courseData,
            failedCourseIds: failedCourses.map((course) => String(course.id)),
        }),
    });

    if (!backendResponse.ok) {
        const errorData = await backendResponse.json().catch(() => null);
        throw new Error(errorData?.error || `Lodestar returned ${backendResponse.status}`);
    }

    return {
        status: "success",
        totalCourses: coursesToSync.length,
        completedCourses: completed,
        courseCount: courseData.length,
        failedCourseNames: failedCourses.map((course) => course.name ?? `Course ${course.id}`),
    };
}

async function restoreCourse(canvasOrigin, course) {
    const { extensionToken } = await chrome.storage.local.get("extensionToken");

    if (!extensionToken) {
        await clearExtensionAuth();
        throw new Error("Extension is not authenticated. Please sign in again.");
    }

    const restoredCourse = await fetchCourseData(canvasOrigin, course);
    const appOrigin = await getAppOrigin();

    const backendResponse = await authorizedFetch(`${appOrigin}/api/canvas/restore-course`, extensionToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canvasOrigin, courses: [restoredCourse] }),
    });

    if (!backendResponse.ok) {
        const errorData = await backendResponse.json().catch(() => null);
        throw new Error(errorData?.error || `Lodestar returned ${backendResponse.status}`);
    }
}

function reply(promise, sendResponse) {
    promise
        .then((result) => sendResponse({ success: true, ...(result ?? {}) }))
        .catch((error) => {
            console.error(error);
            sendResponse({ success: false, error: error.message });
        });

    return true;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message?.type) {
        case "GET_PLANNER_THEME":
            return reply(getPlannerTabTheme().then((theme) => ({ theme })), sendResponse);

        case "START_EXTENSION_AUTH":
            return reply(startExtensionAuth(), sendResponse);

        case "SIGN_OUT":
            return reply(signOut(), sendResponse);

        case "SITE_EXTENSION_TOKEN":
            acceptSiteToken(message, sender)
                .then(sendResponse)
                .catch((error) => sendResponse({ ok: false, error: error.message }));
            return true;

        case "SYNC_CANVAS": {
            if (syncInProgress) {
                sendResponse({ success: false, alreadyRunning: true, error: "A sync is already running." });
                return false;
            }

            syncInProgress = true;
            sendResponse({ success: true });

            // The popup renders from canvasSyncProgress (storage), so the
            // outcome is written there rather than sent to one popup.
            runCanvasSync(message.canvasOrigin)
                .then((result) => setSyncProgress({ currentCourseName: null, errorMessage: null, ...result }))
                .catch((error) => {
                    console.error("Canvas sync failed:", error);
                    return setSyncProgress({ status: "error", errorMessage: error.message });
                })
                .finally(() => {
                    syncInProgress = false;
                });

            return false;
        }

        case "CANCEL_SYNC":
            syncCancelled = true;
            sendResponse({ success: true });
            return false;

        case "LIST_CANVAS_COURSES":
            // Active courses only: SYNC_CANVAS is active-only too, so a
            // restored concluded course would be pruned again on the next sync.
            return reply(
                getCanvasData(
                    `${message.canvasOrigin}/api/v1/courses?enrollment_type=student&enrollment_state=active&per_page=100`
                ).then((courses) => ({ courses: courses.map(pickCourse) })),
                sendResponse
            );

        case "RESTORE_COURSE":
            return reply(
                restoreCourse(message.canvasOrigin, message.course).then(() => ({ courseName: message.course?.name })),
                sendResponse
            );

        default:
            return false;
    }
});
