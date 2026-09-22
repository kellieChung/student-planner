import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    getCanvasSyncUserId,
    upsertCanvasCourses,
    RawCourseSyncPayload,
} from "@/lib/canvasIngest";

export async function POST(request: Request) {
    try {
        const userId = await getCanvasSyncUserId(request);

        if (!userId) {
            return NextResponse.json(
                {
                    success: false,
                    error: "You must be logged in.",
                },
                { status: 401 }
            );
        }

        const body = await request.json();

        if (!Array.isArray(body.courses)) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Invalid Canvas data.",
                },
                { status: 400 }
            );
        }

        console.log("🎓 Canvas sync received!");
        console.log("User ID:", userId);
        console.log("Courses:", body.courses.length);

        const canvasOrigin = body.canvasOrigin;

        if (!canvasOrigin) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Canvas origin is required.",
                },
                { status: 400 }
            );
        }

        const {
            courseCount,
            assignmentCount,
            discussionCount,
            announcementCount,
            syncedCourseCanvasIds,
        } = await upsertCanvasCourses(
            userId,
            canvasOrigin,
            body.courses as RawCourseSyncPayload[]
        );

        /*
         * Canvas's active-course fetch (canvas-extension/background.js) is
         * always a full snapshot per sync, never a partial update — if any
         * fetch in that handler fails, it aborts before ever calling this
         * route. So anything previously synced for this user+origin that's
         * missing from this payload is no longer active and can be safely
         * removed. Guard against an empty payload, which is ambiguous
         * (could be a real course-less term, could be something else) —
         * skip pruning rather than risk wiping everything. The extension
         * itself now skips this POST entirely when every course is
         * excluded (see SYNC_CANVAS's coursesToSync.length === 0 check in
         * background.js) rather than sending an empty courses array, so an
         * empty payload reaching this route still means what it always
         * did — something ambiguous, not "everything got deleted."
         */
        // This prune is NOT the same event as a user's explicit "Delete" in
        // ManageCoursesModal/CoursesPanel (which writes a DeletedCanvasCourse
        // tombstone — see lib/canvasIngest.ts's upsertCanvasCourses) — here a
        // course just dropped off Canvas's own active list (unenrolled,
        // concluded, etc.), which is reversible if it's re-added later, so
        // this deliberately never writes a tombstone of its own.
        let removedCourseCount = 0;

        if (syncedCourseCanvasIds.size > 0) {
            const removedCourses = await prisma.canvasCourse.deleteMany({
                where: {
                    userId,
                    canvasOrigin,
                    canvasId: {
                        notIn: Array.from(syncedCourseCanvasIds),
                    },
                },
            });

            removedCourseCount = removedCourses.count;
        }

        console.log("✅ Canvas data saved!");
        console.log("Removed inactive courses:", removedCourseCount);
        console.log("Courses:", courseCount);
        console.log("Assignments:", assignmentCount);
        console.log("Discussions:", discussionCount);
        console.log("Announcements:", announcementCount);

        return NextResponse.json({
            success: true,
            message: "Canvas data synced successfully.",
            userId,
            courseCount,
            assignmentCount,
            discussionCount,
            announcementCount,
            removedCourseCount,
        });
    } catch (error) {
        console.error("❌ Canvas sync failed:", error);

        return NextResponse.json(
            {
                success: false,
                error: "Failed to process Canvas sync.",
            },
            { status: 500 }
        );
    }
}
