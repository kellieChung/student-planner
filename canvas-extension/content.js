console.log("🎓 Student Planner Canvas extension loaded!");

const canvasOrigin = window.location.origin;
const historyCourseId = 1535; // CHANGE THIS to your actual History course ID

// Get assignments
chrome.runtime.sendMessage(
    {
        type: "GET_ASSIGNMENTS",
        canvasOrigin: canvasOrigin,
        courseId: historyCourseId,
    },
    (response) => {
        if (!response) {
            console.error("❌ No response for assignments.");
            return;
        }

        if (!response.success) {
            console.error("❌ Assignments failed:", response.error);
            return;
        }

        console.log("📚 ASSIGNMENTS:");
        console.log(response.assignments);
    }
);

// Get discussions
chrome.runtime.sendMessage(
    {
        type: "GET_DISCUSSIONS",
        canvasOrigin: canvasOrigin,
        courseId: historyCourseId,
    },
    (response) => {
        if (!response) {
            console.error("❌ No response for discussions.");
            return;
        }

        if (!response.success) {
            console.error("❌ Discussions failed:", response.error);
            return;
        }

        console.log("💬 DISCUSSIONS:");
        console.log(response.discussions);
    }
);