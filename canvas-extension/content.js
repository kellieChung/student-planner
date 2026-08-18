console.log("🎓 Student Planner Canvas extension loaded!");

const canvasOrigin = window.location.origin;

const historyCourseId = 1535; // CHANGE THIS

chrome.runtime.sendMessage(
    {
        type: "GET_ANNOUNCEMENTS",
        canvasOrigin: canvasOrigin,
        courseId: historyCourseId,
    },
    (response) => {
        if (!response) {
            console.error("❌ No response for announcements.");
            return;
        }

        if (!response.success) {
            console.error(
                "❌ Announcements failed:",
                response.error
            );
            return;
        }

        console.log("📢 ANNOUNCEMENTS:");
        console.log(response.announcements);
    }
);