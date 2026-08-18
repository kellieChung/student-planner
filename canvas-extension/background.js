console.log("🚀 Student Planner background service worker loaded!");

async function getCanvasData(url) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Canvas returned ${response.status}`);
    }

    return response.json();
}

async function signInWithGoogle() {
    
    const redirectUri = chrome.identity.getRedirectURL();

    console.log("🔐 Extension redirect URI:", redirectUri);

    const clientId = "knlfelipiolfnoicdagnagoecdjdijil";

    const authUrl =
        "https://accounts.google.com/o/oauth2/v2/auth" +
        `?client_id=${encodeURIComponent(clientId)}` +
        `&response_type=token` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${encodeURIComponent("openid email profile")}` + 
        `&prompt=select_account%20consent`;

    const responseUrl = await chrome.identity.launchWebAuthFlow({
        url: authUrl,
        interactive: true,
    });

    console.log("🔐 Google authentication complete!");

    const url = new URL(responseUrl);

    const fragment = new URLSearchParams(
        url.hash.substring(1)
    );

    const accessToken = fragment.get("access_token");

    if (!accessToken) {
        throw new Error("Google did not return an access token.");
    }

    return accessToken;
}


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "SIGN_IN_GOOGLE") {
        signInWithGoogle()
            .then(async (accessToken) => {
                await chrome.storage.local.set({
                    googleAccessToken: accessToken,
                });

                sendResponse({
                    success: true,
                });
            })
            .catch((error) => {
                console.error("❌ Google sign-in failed:", error);

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
                    courses: courses,
                });
            })
            .catch((error) => {
                console.error("Canvas request failed:", error);

                sendResponse({
                    success: false,
                    error: error.message,
                });
            });

        return true;
    }


    if (message.type === "GET_ASSIGNMENTS") {
        const courseId = message.courseId;

        getCanvasData(
            `${message.canvasOrigin}/api/v1/courses/${courseId}/assignments?per_page=100`
        )
            .then((assignments) => {
                sendResponse({
                    success: true,
                    assignments: assignments,
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
        const courseId = message.courseId;

        getCanvasData(
            `${message.canvasOrigin}/api/v1/courses/${courseId}/discussion_topics?per_page=100`
        )
            .then((discussions) => {
                sendResponse({
                    success: true,
                    discussions: discussions,
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
        const courseId = message.courseId;

        getCanvasData(
            `${message.canvasOrigin}/api/v1/announcements?context_codes[]=course_${courseId}&active_only=true&per_page=100`
        )
            .then((announcements) => {
                sendResponse({
                    success: true,
                    announcements: announcements,
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
                const canvasOrigin = message.canvasOrigin;

                console.log("🔄 Starting Canvas sync...");

                const courses = await getCanvasData(
                    `${canvasOrigin}/api/v1/courses?enrollment_type=student&enrollment_state=active&per_page=100`
                );

                console.log(`📚 Found ${courses.length} courses`);

                const courseData = [];

                for (const course of courses) {

                    console.log(`🔍 Syncing: ${course.name}`);

                    const assignments = await getCanvasData(
                        `${canvasOrigin}/api/v1/courses/${course.id}/assignments?per_page=100`
                    );

                    const discussions = await getCanvasData(
                        `${canvasOrigin}/api/v1/courses/${course.id}/discussion_topics?per_page=100`
                    );

                    const announcements = await getCanvasData(
                        `${canvasOrigin}/api/v1/announcements?context_codes[]=course_${course.id}&active_only=true&per_page=100`
                    );

                    courseData.push({
                        course,
                        assignments,
                        discussions,
                        announcements,
                    });
                }

                console.log("🎉 Canvas sync complete!");
                console.log(courseData);

                console.log("🚀 Sending Canvas data to Student Planner...");

                const backendResponse = await fetch(
                    "http://localhost:3000/api/canvas/sync",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            courses: courseData,
                        }),
                    }
                );

                if (!backendResponse.ok) {
                    throw new Error(
                        `Student Planner returned ${backendResponse.status}`
                    );
                }

                const backendResult = await backendResponse.json();

                console.log("✅ Student Planner received Canvas data!");
                console.log(backendResult);

                sendResponse({
                    success: true,
                    courseCount: courseData.length,
                });

            } catch (error) {

                console.error("❌ Canvas sync failed:", error);

                sendResponse({
                    success: false,
                    error: error.message,
                });
            }
        })();

        return true;
    }
});