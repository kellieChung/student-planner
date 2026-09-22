console.log("🚀 Student Planner background service worker loaded!");

// The Student Planner backend this extension talks to. Configurable (popup's
// "App URL" field, chrome.storage.local key "appOrigin") rather than a
// second hardcoded literal, since local dev (npm run dev, localhost:3000)
// and the deployed Vercel app are both real targets a solo developer needs
// to switch between, and the production URL itself may change. Falls back
// to the deployed app so a fresh install works without any setup.
const DEFAULT_APP_ORIGIN = "https://student-planner-beta.vercel.app";

async function getAppOrigin() {
    const { appOrigin } = await chrome.storage.local.get("appOrigin");

    return appOrigin || DEFAULT_APP_ORIGIN;
}

// Checked between courses in SYNC_CANVAS's loop, set by the CANCEL_SYNC
// handler. One popup drives one sync at a time, so a single module-level
// flag is enough — a second popup should see/cancel the same in-flight
// sync, not race a separate one.
let syncCancelled = false;

// Single source of truth for sync progress, read by the popup both live
// (while open) and on reopen (mid-sync or after). If the service worker is
// killed/reloaded mid-sync, this is left at status:"running" forever with a
// stale `updatedAt` — that's a known, disclosed limitation handled on the
// popup side (staleness check in restoreSyncProgress), not solved here with
// keep-alive machinery.
async function setSyncProgress(progress) {
    await chrome.storage.local.set({
        canvasSyncProgress: { ...progress, updatedAt: Date.now() },
    });
}

// Fire-and-forget: no popup listening is the common case (most of a sync
// runs with the popup closed), and that's not an error — storage already
// has the same data for when the popup reopens.
function broadcastSyncProgress(progress) {
    chrome.runtime.sendMessage(
        { type: "SYNC_PROGRESS", ...progress },
        () => {
            if (chrome.runtime.lastError) {
                // No popup open to receive it — expected.
            }
        }
    );
}

// Follows Canvas's RFC 5988 `Link` header pagination (every call site here
// requests per_page=100 and expects a flat array back) — without this, a
// course with more than 100 assignments/discussions/announcements would
// silently lose everything past page 1.
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

// Looked up on demand (rather than relying solely on theme-sync.js having
// already run in an already-open tab) so the popup shows the right theme
// even right after installing/reloading the extension.
async function getPlannerTabTheme() {
    const appOrigin = await getAppOrigin();

    // Checks the configured app origin plus both localhost forms
    // (regardless of which one is currently configured) so a still-open
    // local dev tab is still picked up for theming even while the
    // extension itself is pointed at production, and vice versa.
    const tabs = await chrome.tabs.query({
        url: [
            `${appOrigin}/*`,
            "http://localhost:3000/*",
            "http://127.0.0.1:3000/*",
        ],
    });

    if (tabs.length === 0) {
        console.log("🎨 No open Student Planner tab found.");
        return null;
    }

    const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () =>
            document.documentElement.dataset.theme === "light"
                ? "light"
                : "dark",
    });

    console.log("🎨 Read live planner theme from open tab:", result);

    return result ?? null;
}

// Shared by the full SYNC_CANVAS loop and the single-course RESTORE_COURSE
// handler below — both need the identical assignments/discussions/
// announcements fetch for one course.
async function fetchCourseData(canvasOrigin, course) {
    const assignments = await getCanvasData(
        `${canvasOrigin}/api/v1/courses/${course.id}/assignments?per_page=100`
    );

    const discussions = await getCanvasData(
        `${canvasOrigin}/api/v1/courses/${course.id}/discussion_topics?per_page=100`
    );

    const announcements = await getCanvasData(
        `${canvasOrigin}/api/v1/announcements?context_codes[]=course_${course.id}&active_only=true&per_page=100`
    );

    return { course, assignments, discussions, announcements };
}

async function clearExtensionAuth() {
    console.log("🔓 Clearing stale extension authentication...");

    await chrome.storage.local.remove([
        "extensionToken",
        "extensionAuthState",
    ]);

    console.log("✅ Extension authentication cleared.");
}

console.log("🎓 Background service worker loaded!");

async function startExtensionAuth() {
    console.log("🔐 Starting extension authentication...");

    try {
        const appOrigin = await getAppOrigin();

        const response = await fetch(
            `${appOrigin}/api/extension/auth/start`
        );

        const data = await response.json();

        console.log(
            "🔐 Auth start response:",
            data
        );

        if (!response.ok) {
            throw new Error(
                data.error ||
                `Server returned ${response.status}`
            );
        }

        const state = data.state;

        console.log(
            "🔐 Got auth state:",
            state
        );

        await chrome.storage.local.set({
            extensionAuthState: state,
        });

        await chrome.tabs.create({
            url:
                `${appOrigin}/extension-login?state=${encodeURIComponent(state)}`,
        });

        console.log(
            "🔐 Login page opened!"
        );

        const authenticated = await watchAuthState(state);

        if (!authenticated) {
            throw new Error(
                "Sign-in timed out. Please try again."
            );
        }

    } catch (error) {
        console.error(
            "❌ Extension auth failed:",
            error
        );
    }
}

async function watchAuthState(state) {
    console.log(
        "🔐 Watching auth state:",
        state
    );

    const appOrigin = await getAppOrigin();

    for (let i = 0; i < 60; i++) {

        try {
            const response = await fetch(
                `${appOrigin}/api/extension/auth/exchange`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        state,
                    }),
                }
            );

            const data = await response.json();

            console.log(
                "🔐 Auth check:",
                data
            );

            if (data.success) {

                await chrome.storage.local.set({
                    extensionToken: data.token,
                });

                console.log(
                    "🎉 Extension successfully authenticated!"
                );

                return true;
            }

        } catch (error) {
            console.error(
                "❌ Auth check failed:",
                error
            );
        }

        await new Promise(
            resolve => setTimeout(resolve, 2000)
        );
    }

    console.log(
        "❌ Extension authentication timed out."
    );

    return false;
}

async function signInWithGoogle() {

    const redirectUri =
        chrome.identity.getRedirectURL();

    console.log(
        "🔐 Extension redirect URI:",
        redirectUri
    );

    const clientId =
        "knlfelipiolfnoicdagnagoecdjdijil";

    const authUrl =
        "https://accounts.google.com/o/oauth2/v2/auth" +
        `?client_id=${encodeURIComponent(clientId)}` +
        `&response_type=token` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${encodeURIComponent("openid email profile")}` +
        `&prompt=select_account`;

    const responseUrl =
        await chrome.identity.launchWebAuthFlow({
            url: authUrl,
            interactive: true,
        });

    console.log(
        "🔐 Google authentication complete!"
    );

    const url =
        new URL(responseUrl);

    const fragment =
        new URLSearchParams(
            url.hash.substring(1)
        );

    const accessToken =
        fragment.get("access_token");

    if (!accessToken) {
        throw new Error(
            "Google did not return an access token."
        );
    }

    return accessToken;
}

chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {

        if (message.type === "GET_PLANNER_THEME") {

            getPlannerTabTheme()
                .then((theme) => {
                    sendResponse({
                        success: true,
                        theme,
                    });
                })
                .catch((error) => {
                    console.error(
                        "❌ Could not read planner theme:",
                        error
                    );

                    sendResponse({
                        success: false,
                        error: error.message,
                    });
                });

            return true;
        }

        if (message.type === "START_EXTENSION_AUTH") {

            startExtensionAuth()
                .then(() => {
                    sendResponse({
                        success: true,
                    });
                })
                .catch((error) => {
                    sendResponse({
                        success: false,
                        error: error.message,
                    });
                });

            return true;
        }

        if (message.type === "SIGN_IN_GOOGLE") {

            signInWithGoogle()
                .then(async (accessToken) => {

                    await chrome.storage.local.set({
                        googleAccessToken:
                            accessToken,
                    });

                    sendResponse({
                        success: true,
                    });
                })
                .catch((error) => {

                    console.error(
                        "❌ Google sign-in failed:",
                        error
                    );

                    sendResponse({
                        success: false,
                        error: error.message,
                    });
                });

            return true;
        }

        if (message.type === "GET_COURSES") {

            getCanvasData(
                `${message.canvasOrigin}/api/v1/courses?enrollment_type=student&enrollment_state=active&per_page=100`
            )
                .then((courses) => {

                    sendResponse({
                        success: true,
                        courses,
                    });
                })
                .catch((error) => {

                    console.error(
                        "Canvas request failed:",
                        error
                    );

                    sendResponse({
                        success: false,
                        error: error.message,
                    });
                });

            return true;
        }

        if (message.type === "GET_ASSIGNMENTS") {

            const courseId =
                message.courseId;

            getCanvasData(
                `${message.canvasOrigin}/api/v1/courses/${courseId}/assignments?per_page=100`
            )
                .then((assignments) => {

                    sendResponse({
                        success: true,
                        assignments,
                    });
                })
                .catch((error) => {

                    console.error(
                        "Canvas assignment request failed:",
                        error
                    );

                    sendResponse({
                        success: false,
                        error: error.message,
                    });
                });

            return true;
        }

        if (message.type === "GET_DISCUSSIONS") {

            const courseId =
                message.courseId;

            getCanvasData(
                `${message.canvasOrigin}/api/v1/courses/${courseId}/discussion_topics?per_page=100`
            )
                .then((discussions) => {

                    sendResponse({
                        success: true,
                        discussions,
                    });
                })
                .catch((error) => {

                    console.error(
                        "Canvas discussion request failed:",
                        error
                    );

                    sendResponse({
                        success: false,
                        error: error.message,
                    });
                });

            return true;
        }

        if (message.type === "GET_ANNOUNCEMENTS") {

            const courseId =
                message.courseId;

            getCanvasData(
                `${message.canvasOrigin}/api/v1/announcements?context_codes[]=course_${courseId}&active_only=true&per_page=100`
            )
                .then((announcements) => {

                    sendResponse({
                        success: true,
                        announcements,
                    });
                })
                .catch((error) => {

                    console.error(
                        "Canvas announcement request failed:",
                        error
                    );

                    sendResponse({
                        success: false,
                        error: error.message,
                    });
                });

            return true;
        }

        if (message.type === "SYNC_CANVAS") {

            (async () => {

                // Reset at the start of every sync, not only on cancel —
                // otherwise a past cancellation would permanently poison
                // every sync after it.
                syncCancelled = false;

                try {

                    const canvasOrigin =
                        message.canvasOrigin;

                    console.log(
                        "🔄 Starting Canvas sync..."
                    );

                    // Fetched up front (not just before the final POST, as
                    // before) — needed now for the excluded-courses lookup
                    // below, and failing fast on missing auth before doing
                    // any Canvas API work is a real improvement on its own.
                    const authResult =
                        await chrome.storage.local.get(
                            "extensionToken"
                        );

                    if (!authResult.extensionToken) {
                        await clearExtensionAuth();

                        throw new Error(
                            "Extension is not authenticated. Please sign in again."
                        );
                    }

                    const appOrigin = await getAppOrigin();

                    const courses =
                        await getCanvasData(
                            `${canvasOrigin}/api/v1/courses?enrollment_type=student&enrollment_state=active&per_page=100`
                        );

                    console.log(
                        `📚 Found ${courses.length} courses`
                    );

                    // Skip fetching (and syncing) a course the user already
                    // deleted — upsertCanvasCourses would throw the data
                    // away anyway, so there's no reason to spend a Canvas
                    // API round trip (assignments/discussions/announcements)
                    // on it every single sync. Purely a speed optimization:
                    // any failure here falls open (syncs everything, same
                    // as before this existed) except a 401, which means the
                    // token is stale and the sync POST would fail anyway.
                    let excludedIds = new Set();

                    const excludedResponse =
                        await fetch(
                            `${appOrigin}/api/canvas/excluded-courses?canvasOrigin=${encodeURIComponent(canvasOrigin)}`,
                            {
                                headers: {
                                    "Authorization":
                                        `Bearer ${authResult.extensionToken}`,
                                },
                            }
                        ).catch((error) => {
                            console.warn(
                                "⚠️ Excluded-courses lookup failed — syncing everything.",
                                error
                            );

                            return null;
                        });

                    if (excludedResponse && excludedResponse.status === 401) {
                        await clearExtensionAuth();

                        throw new Error(
                            "Your session expired. Please sign in again."
                        );
                    } else if (excludedResponse && excludedResponse.ok) {
                        const excludedData =
                            await excludedResponse
                                .json()
                                .catch(() => null);

                        if (Array.isArray(excludedData?.canvasIds)) {
                            excludedIds = new Set(
                                excludedData.canvasIds.map(String)
                            );
                        }
                    } else if (excludedResponse) {
                        console.warn(
                            `⚠️ Excluded-courses lookup returned ${excludedResponse.status} — syncing everything.`
                        );
                    }

                    const coursesToSync =
                        courses.filter(
                            (course) => !excludedIds.has(String(course.id))
                        );

                    if (coursesToSync.length < courses.length) {
                        console.log(
                            `⏭️ Skipping ${courses.length - coursesToSync.length} deleted course(s)`
                        );
                    }

                    if (coursesToSync.length === 0) {
                        console.log(
                            "✅ Nothing to sync — every course is excluded."
                        );

                        await setSyncProgress({
                            status: "success",
                            totalCourses: 0,
                            completedCourses: 0,
                            currentCourseName: null,
                            courseCount: 0,
                            errorMessage: null,
                        });

                        try {
                            sendResponse({
                                success: true,
                                courseCount: 0,
                            });
                        } catch {
                            // Popup already gone — fine, storage has the
                            // success state for next time it opens.
                        }

                        return;
                    }

                    await setSyncProgress({
                        status: "running",
                        totalCourses: coursesToSync.length,
                        completedCourses: 0,
                        currentCourseName: null,
                        startedAt: Date.now(),
                        courseCount: null,
                        errorMessage: null,
                    });

                    const courseData = [];
                    let wasCancelled = false;

                    for (const course of coursesToSync) {

                        if (syncCancelled) {
                            wasCancelled = true;
                            break;
                        }

                        console.log(
                            `🔍 Syncing: ${course.name}`
                        );

                        courseData.push(
                            await fetchCourseData(canvasOrigin, course)
                        );

                        await setSyncProgress({
                            status: "running",
                            totalCourses: coursesToSync.length,
                            completedCourses: courseData.length,
                            currentCourseName: course.name,
                            startedAt: Date.now(),
                            courseCount: null,
                            errorMessage: null,
                        });

                        broadcastSyncProgress({
                            completedCourses: courseData.length,
                            totalCourses: coursesToSync.length,
                            currentCourseName: course.name,
                        });
                    }

                    if (wasCancelled) {

                        console.log(
                            "🛑 Canvas sync cancelled by user."
                        );

                        await setSyncProgress({
                            status: "cancelled",
                            totalCourses: coursesToSync.length,
                            completedCourses: courseData.length,
                            currentCourseName: null,
                            courseCount: null,
                            errorMessage: null,
                        });

                        try {
                            sendResponse({
                                success: false,
                                cancelled: true,
                            });
                        } catch {
                            // Popup/port already gone — fine, storage has
                            // the cancelled state for next time it opens.
                        }

                        // Deliberately return here, before ever reaching
                        // the backend POST below: /api/canvas/sync treats
                        // its payload as a full snapshot and prunes any
                        // course missing from it, so POSTing a partial
                        // courseData array would delete every not-yet-
                        // synced course. A cancelled sync must never reach
                        // that call.
                        return;
                    }

                    console.log(
                        "🎉 Canvas sync complete!"
                    );

                    console.log(
                        courseData
                    );

                    console.log(
                        "🚀 Sending Canvas data to Student Planner..."
                    );

                    // authResult/appOrigin were already fetched at the top
                    // of this handler (needed earlier for the
                    // excluded-courses lookup) — reused here, not re-fetched.

                    console.log(
                        "📤 Sending canvasOrigin:",
                        canvasOrigin
                    );

                    console.log(
                        "📤 Sending course count:",
                        courseData.length
                    );

                    const backendResponse =
                        await fetch(
                            `${appOrigin}/api/canvas/sync`,
                            {
                                method: "POST",
                                headers: {
                                    "Content-Type":
                                        "application/json",
                                    "Authorization":
                                        `Bearer ${authResult.extensionToken}`,
                                },
                                body: JSON.stringify({
                                    canvasOrigin,
                                    courses:
                                        courseData,
                                }),
                            }
                        );

                    if (!backendResponse.ok) {

                        const errorData =
                            await backendResponse
                                .json()
                                .catch(() => null);

                        if (backendResponse.status === 401) {
                            await clearExtensionAuth();

                            throw new Error(
                                "Your session expired. Please sign in again."
                            );
                        }

                        throw new Error(
                            errorData?.error ||
                            `Student Planner returned ${backendResponse.status}`
                        );
                    }

                    const backendResult =
                        await backendResponse.json();

                    console.log(
                        "✅ Student Planner received Canvas data!"
                    );

                    console.log(
                        backendResult
                    );

                    await setSyncProgress({
                        status: "success",
                        totalCourses: coursesToSync.length,
                        completedCourses: courseData.length,
                        currentCourseName: null,
                        courseCount: courseData.length,
                        errorMessage: null,
                    });

                    try {
                        sendResponse({
                            success: true,
                            courseCount:
                                courseData.length,
                        });
                    } catch {
                        // Popup already gone — fine, storage has the
                        // success state for next time it opens.
                    }

                } catch (error) {

                    console.error(
                        "❌ Canvas sync failed:",
                        error
                    );

                    await setSyncProgress({
                        status: "error",
                        errorMessage: error.message,
                    });

                    try {
                        sendResponse({
                            success: false,
                            error: error.message,
                        });
                    } catch {
                        // Popup already gone — fine, storage has the
                        // error state for next time it opens.
                    }
                }

            })();

            return true;
        }

        if (message.type === "CANCEL_SYNC") {

            syncCancelled = true;

            sendResponse({ success: true });

            return true;
        }

        if (message.type === "LIST_CANVAS_COURSES") {

            const canvasOrigin = message.canvasOrigin;

            // Includes concluded ("completed") courses, unlike GET_COURSES/
            // SYNC_CANVAS above (both intentionally active-only) — this is
            // what lets a course that's no longer active in Canvas still
            // show up to be restored.
            getCanvasData(
                `${canvasOrigin}/api/v1/courses?enrollment_type=student&enrollment_state[]=active&enrollment_state[]=completed&per_page=100`
            )
                .then((courses) => {

                    sendResponse({
                        success: true,
                        courses,
                    });
                })
                .catch((error) => {

                    console.error(
                        "Canvas course list request failed:",
                        error
                    );

                    sendResponse({
                        success: false,
                        error: error.message,
                    });
                });

            return true;
        }

        if (message.type === "RESTORE_COURSE") {

            (async () => {

                try {

                    const canvasOrigin = message.canvasOrigin;
                    const course = message.course;

                    const authResult =
                        await chrome.storage.local.get(
                            "extensionToken"
                        );

                    if (!authResult.extensionToken) {
                        await clearExtensionAuth();

                        throw new Error(
                            "Extension is not authenticated. Please sign in again."
                        );
                    }

                    console.log(
                        `🔁 Restoring course: ${course.name}`
                    );

                    const restoredCourse =
                        await fetchCourseData(canvasOrigin, course);

                    const appOrigin = await getAppOrigin();

                    const backendResponse =
                        await fetch(
                            `${appOrigin}/api/canvas/restore-course`,
                            {
                                method: "POST",
                                headers: {
                                    "Content-Type":
                                        "application/json",
                                    "Authorization":
                                        `Bearer ${authResult.extensionToken}`,
                                },
                                body: JSON.stringify({
                                    canvasOrigin,
                                    courses: [restoredCourse],
                                }),
                            }
                        );

                    if (!backendResponse.ok) {

                        const errorData =
                            await backendResponse
                                .json()
                                .catch(() => null);

                        if (backendResponse.status === 401) {
                            await clearExtensionAuth();

                            throw new Error(
                                "Your session expired. Please sign in again."
                            );
                        }

                        throw new Error(
                            errorData?.error ||
                            `Student Planner returned ${backendResponse.status}`
                        );
                    }

                    console.log(
                        `✅ Restored course: ${course.name}`
                    );

                    sendResponse({
                        success: true,
                        courseName: course.name,
                    });

                } catch (error) {

                    console.error(
                        "❌ Course restore failed:",
                        error
                    );

                    sendResponse({
                        success: false,
                        error: error.message,
                    });
                }

            })();

            return true;
        }
    }
);