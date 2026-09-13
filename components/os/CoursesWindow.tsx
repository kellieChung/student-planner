"use client";

import CoursesPanel from "@/components/CoursesPanel";
import { useCoursesRemote } from "@/components/os/CoursesRemoteContext";
import Window from "./Window";

// Wraps the course-management panel in the same draggable/resizable/
// minimizable/closable chrome as Pomodoro and Music. No World-panel
// equivalent exists for Courses (unlike Pomodoro's Hourglass or Music's
// Bard), so this needs no publish/subscribe engine state — just the
// version-bump bridge back to WeeklyPlannerView for refetching courses
// after an edit (see CoursesRemoteContext.tsx).
export default function CoursesWindow() {
    const { bumpCoursesVersion } = useCoursesRemote();

    return (
        <Window app="courses" title="Course Ledger" icon="📚">
            <CoursesPanel onChanged={bumpCoursesVersion} />
        </Window>
    );
}
