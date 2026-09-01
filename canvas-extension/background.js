console.log("🚀 Student Planner background service worker loaded!");

async function getCanvasData(url) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Canvas returned ${response.status}`);
    }

    return response.json();
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
        const response = await fetch(
            "http://localhost:3000/api/extension/auth/start"
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
                `http://localhost:3000/extension-login?state=${encodeURIComponent(state)}`,
        });

        console.log(
            "🔐 Login page opened!"
        );

        await watchAuthState(state);

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

                return;
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

                    for (const course of courses) {

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
                        "📤 Sending canvasOrigin:",
                        canvasOrigin
                    );

                    console.log(
                        "📤 Sending course count:",
                        courseData.length
                    );

                    const backendResponse =
                        await fetch(
                            "http://localhost:3000/api/canvas/sync",
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
                        error: error.message,
                    });
                }

            })();

            return true;
        }
    }
);