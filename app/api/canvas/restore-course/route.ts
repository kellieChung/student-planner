import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
    getCanvasSyncUserId,
    isValidCanvasOrigin,
    upsertCanvasCourses,
    RawCourseSyncPayload,
} from "@/lib/canvasIngest";

// Re-pulls one (or a few) specific course(s) from Canvas without touching
// anything else — unlike /api/canvas/sync, this never prunes, so it's safe
// to call for a single course a user wants back after deleting it (see
// components/CoursesPanel.tsx's delete confirmation copy).
export const maxDuration = 60;

export async function POST(request: Request) {
    try {
        const userId = await getCanvasSyncUserId(request);

        if (!userId) {
            return NextResponse.json(
                { success: false, error: "You must be logged in." },
                { status: 401 }
            );
        }

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json(
                { success: false, error: "Invalid JSON body." },
                { status: 400 }
            );
        }

        const { canvasOrigin, courses } = body as {
            canvasOrigin?: unknown;
            courses?: unknown;
        };

        if (!isValidCanvasOrigin(canvasOrigin)) {
            return NextResponse.json(
                { success: false, error: "A valid https Canvas origin is required." },
                { status: 400 }
            );
        }

        if (!Array.isArray(courses) || courses.length === 0) {
            return NextResponse.json(
                { success: false, error: "Invalid Canvas data." },
                { status: 400 }
            );
        }

        const canvasIds = (courses as RawCourseSyncPayload[])
            .map((courseData) => courseData.course?.id)
            .filter((id): id is string | number => id !== undefined)
            .map((id) => String(id));

        // Must run BEFORE upsertCanvasCourses below: that function checks
        // DeletedCanvasCourse on every call (including this one) and skips
        // any tombstoned canvasId, so the tombstone has to be gone first or
        // this "restore" would silently no-op on the very course it's
        // meant to bring back.
        if (canvasIds.length > 0) {
            await prisma.deletedCanvasCourse.deleteMany({
                where: {
                    userId,
                    canvasOrigin,
                    canvasId: { in: canvasIds },
                },
            });
        }

        const {
            courseCount,
            assignmentCount,
            discussionCount,
            announcementCount,
        } = await upsertCanvasCourses(
            userId,
            canvasOrigin,
            courses as RawCourseSyncPayload[]
        );

        return NextResponse.json({
            success: true,
            message: "Course restored from Canvas.",
            courseCount,
            assignmentCount,
            discussionCount,
            announcementCount,
        });
    } catch (error) {
        console.error("Canvas course restore failed:", error);

        return NextResponse.json(
            { success: false, error: "Failed to restore course from Canvas." },
            { status: 500 }
        );
    }
}
