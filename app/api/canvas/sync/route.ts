import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    getCanvasSyncUserId,
    isValidCanvasOrigin,
    upsertCanvasCourses,
    RawCourseSyncPayload,
} from "@/lib/canvasIngest";

export const maxDuration = 60;

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

        let body: { canvasOrigin?: unknown; courses?: unknown; failedCourseIds?: unknown };

        try {
            body = await request.json();
        } catch {
            return NextResponse.json(
                { success: false, error: "Invalid JSON body." },
                { status: 400 }
            );
        }

        if (!Array.isArray(body.courses)) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Invalid Canvas data.",
                },
                { status: 400 }
            );
        }

        const canvasOrigin = body.canvasOrigin;

        if (!isValidCanvasOrigin(canvasOrigin)) {
            return NextResponse.json(
                {
                    success: false,
                    error: "A valid https Canvas origin is required.",
                },
                { status: 400 }
            );
        }

        // Courses the extension couldn't read this time (a restricted
        // endpoint, a flaky page). They're absent from `courses` but still
        // enrolled, so they must not be pruned below.
        const failedCourseIds = Array.isArray(body.failedCourseIds)
            ? body.failedCourseIds.filter((id): id is string => typeof id === "string")
            : [];

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
         * The extension's active-course fetch is a full snapshot per sync:
         * a cancelled sync never POSTs, and a course that failed to load is
         * listed in failedCourseIds. So anything previously synced for this
         * user+origin that's missing from both is no longer active and can be
         * removed. An empty payload is ambiguous (could be a course-less
         * term, could be something else), so skip pruning rather than risk
         * wiping everything.
         *
         * This prune is NOT the user's explicit "Delete" (which writes a
         * DeletedCanvasCourse tombstone) — a course that dropped off Canvas's
         * active list is reversible if re-added later, so no tombstone here.
         */
        let removedCourseCount = 0;

        if (syncedCourseCanvasIds.size > 0) {
            const keep = [...syncedCourseCanvasIds, ...failedCourseIds];

            const removedCourses = await prisma.canvasCourse.deleteMany({
                where: {
                    userId,
                    canvasOrigin,
                    canvasId: {
                        notIn: keep,
                    },
                },
            });

            removedCourseCount = removedCourses.count;
        }

        return NextResponse.json({
            success: true,
            message: "Canvas data synced successfully.",
            courseCount,
            assignmentCount,
            discussionCount,
            announcementCount,
            removedCourseCount,
        });
    } catch (error) {
        console.error("Canvas sync failed:", error);

        return NextResponse.json(
            {
                success: false,
                error: "Failed to process Canvas sync.",
            },
            { status: 500 }
        );
    }
}
