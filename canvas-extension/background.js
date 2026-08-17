chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "GET_COURSES") {
        fetch(
            `${message.canvasOrigin}/api/v1/courses?enrollment_type=student&enrollment_state=active`
        )
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Canvas returned ${response.status}`);
                }

                return response.json();
            })
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

        fetch(
            `${message.canvasOrigin}/api/v1/courses/${courseId}/assignments?per_page=100`
        )
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Canvas returned ${response.status}`);
                }

                return response.json();
            })
            .then((assignments) => {
                sendResponse({
                    success: true,
                    assignments: assignments,
                });
            })
            .catch((error) => {
                console.error("Canvas assignment request failed:", error);

                sendResponse({
                    success: false,
                    error: error.message,
                });
            });

        return true;
    }

    if (message.type === "GET_DISCUSSIONS") {
        const courseId = message.courseId;

        fetch(
            `${message.canvasOrigin}/api/v1/courses/${courseId}/discussion_topics?per_page=100`
        )
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Canvas returned ${response.status}`);
                }

                return response.json();
            })
            .then((discussions) => {
                sendResponse({
                    success: true,
                    discussions: discussions,
                });
            })
            .catch((error) => {
                console.error("Canvas discussion request failed:", error);

                sendResponse({
                    success: false,
                    error: error.message,
                });
            });

        return true;
    }
});