console.log("🚀 Student Planner background service worker loaded!");

async function getCanvasData(url) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Canvas returned ${response.status}`);
    }

    return response.json();
}


// ============================================================
// EXTENSION AUTH
// ============================================================

async function startExtensionAuth() {
    console.log("🔐 Starting extension authentication...");

    // Ask the server for a temporary authentication state
    const startResponse = await fetch(
        "http://localhost:3000/api/extension/auth/start"
    );

    if (!startResponse.ok) {
        throw new Error(
            `Auth start failed: ${startResponse.status}`
        );
    }

    const startData = await startResponse.json();

    console.log(
        "🔐 Auth start response:",
        startData
    );

    if (!startData.success || !startData.state) {
        throw new Error(
            startData.error || "No auth state received"
        );
    }

    const state = startData.state;

    await chrome.storage.local.set({
        extensionAuthState: state,
    });

    console.log(
        "🔐 Got auth state:",
        state
    );

    // Open the website login page
    await chrome.tabs.create({
        url:
            `http://localhost:3000/extension-login?state=${encodeURIComponent(
                state
            )}`,
    });

    console.log("🔐 Login page opened!");

    // Wait for the website to finish authentication
    console.log(
        "🔐 Watching auth state:",
        state
    );

    for (let i = 0; i < 60; i++) {
        try {
            const response = await fetch(
                "http://localhost:3000/api/extension/auth/exchange",
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

                return {
                    success: true,
                };
            }

        } catch (error) {
            console.error(
                "❌ Auth check failed:",
                error
            );
        }

        await new Promise(resolve =>
            setTimeout(resolve, 2000)
        );
    }

    throw new Error(
        "Authentication timed out."
    );
}


// ============================================================
// GOOGLE AUTH
// ============================================================

async function signInWithGoogle() {
    const redirectUri = chrome.identity.getRedirectURL();

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
        `&scope=${encodeURIComponent(
            "openid email profile"
        )}` +
        `&prompt=${encodeURIComponent(
            "select_account consent"
        )}`;

    const responseUrl =
        await chrome.identity.launchWebAuthFlow({
            url: authUrl,
            interactive: true,
        });

    console.log(
        "🔐 Google authentication complete!"
    );

    const url = new URL(responseUrl);

    const fragment = new URLSearchParams(
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


// ============================================================
// MESSAGE HANDLER
// ============================================================

chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {

        // ----------------------------------------------------
        // START EXTENSION AUTH
        // ----------------------------------------------------

        if (
            message.type ===
            "START_EXTENSION_AUTH"
        ) {
            startExtensionAuth()
                .then((result) => {
                    sendResponse(result);
                })
                .catch((error) => {
                    console.error(
                        "❌ Extension auth failed:",
                        error
                    );

                    sendResponse({
                        success: false,
                        error: error.message,
                    });
                });

            return true;
        }


        // ----------------------------------------------------
        // GOOGLE SIGN IN
        // ----------------------------------------------------

        if (
            message.type ===
            "SIGN_IN_GOOGLE"
        ) {
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


        // ----------------------------------------------------
        // GET COURSES
        // ----------------------------------------------------

        if (
            message.type ===
            "GET_COURSES"
        ) {
            getCanvasData(
                `${message.canvasOrigin}/api/v1/courses?enrollment_type=student&enrollment_state=active&per_page=100`
            )
                .then((courses) => {

                    sendResponse({
                        success: true,
                        courses: courses,
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


        // ----------------------------------------------------
        // GET ASSIGNMENTS
        // ----------------------------------------------------

        if (
            message.type ===
            "GET_ASSIGNMENTS"
        ) {
            const courseId =
                message.courseId;

            getCanvasData(
                `${message.canvasOrigin}/api/v1/courses/${courseId}/assignments?per_page=100`
            )
                .then((assignments) => {

                    sendResponse({
                        success: true,
                        assignments:
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


        // ----------------------------------------------------
        // GET DISCUSSIONS
        // ----------------------------------------------------

        if (
            message.type ===
            "GET_DISCUSSIONS"
        ) {
            const courseId =
                message.courseId;

            getCanvasData(
                `${message.canvasOrigin}/api/v1/courses/${courseId}/discussion_topics?per_page=100`
            )
                .then((discussions) => {

                    sendResponse({
                        success: true,
                        discussions:
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


        // ----------------------------------------------------
        // GET ANNOUNCEMENTS
        // ----------------------------------------------------

        if (
            message.type ===
            "GET_ANNOUNCEMENTS"
        ) {
            const courseId =
                message.courseId;

            getCanvasData(
                `${message.canvasOrigin}/api/v1/announcements?context_codes[]=course_${courseId}&active_only=true&per_page=100`
            )
                .then((announcements) => {

                    sendResponse({
                        success: true,
                        announcements:
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


        // ----------------------------------------------------
        // SYNC CANVAS
        // ----------------------------------------------------

        if (
            message.type ===
            "SYNC_CANVAS"
        ) {

            (async () => {

                try {

                    const canvasOrigin =
                        message.canvasOrigin;

                    console.log(
                        "🔄 Starting Canvas sync..."
                    );

                    const courses =
                        await getCanvasData(
                            `${canvasOrigin}/api/v1/courses?enrollment_type=student&enrollment_state=active&per_page=100`
                        );

                    console.log(
                        `📚 Found ${courses.length} courses`
                    );

                    const courseData = [];

                    for (
                        const course
                        of courses
                    ) {

                        console.log(
                            `🔍 Syncing: ${course.name}`
                        );

                        const assignments =
                            await getCanvasData(
                                `${canvasOrigin}/api/v1/courses/${course.id}/assignments?per_page=100`
                            );

                        const discussions =
                            await getCanvasData(
                                `${canvasOrigin}/api/v1/courses/${course.id}/discussion_topics?per_page=100`
                            );

                        const announcements =
                            await getCanvasData(
                                `${canvasOrigin}/api/v1/announcements?context_codes[]=course_${course.id}&active_only=true&per_page=100`
                            );

                        courseData.push({
                            course,
                            assignments,
                            discussions,
                            announcements,
                        });
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

                    const backendResponse =
                        await fetch(
                            "http://localhost:3000/api/canvas/sync",
                            {
                                method: "POST",

                                headers: {
                                    "Content-Type":
                                        "application/json",
                                },

                                body: JSON.stringify({
                                    courses:
                                        courseData,
                                }),
                            }
                        );

                    if (
                        !backendResponse.ok
                    ) {
                        throw new Error(
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

                    sendResponse({
                        success: true,
                        courseCount:
                            courseData.length,
                    });

                } catch (error) {

                    console.error(
                        "❌ Canvas sync failed:",
                        error
                    );

                    sendResponse({
                        success: false,
                        error:
                            error.message,
                    });
                }

            })();

            return true;
        }
    }
);