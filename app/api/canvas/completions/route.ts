import { NextResponse } from "next/server";
import { getCanvasSyncUserId, isValidCanvasOrigin } from "@/lib/canvasIngest";
import {
    applyCanvasCompletions,
    CanvasCompletionItem,
    readCanvasCompletionItem,
} from "@/lib/canvasCompletions";

const MAX_COURSES = 50;
const MAX_ASSIGNMENTS_PER_COURSE = 500;

// The extension's lightweight completion check (canvas-extension/
// background.js's runCompletionCheck): submission state only. Kept apart
// from /api/canvas/sync, which treats its payload as a full snapshot and
// prunes courses missing from it.
export async function POST(request: Request) {
    try {
        const userId = await getCanvasSyncUserId(request);

        if (!userId) {
            return NextResponse.json(
                { success: false, error: "You must be logged in." },
                { status: 401 }
            );
        }

        let body: { canvasOrigin?: unknown; courses?: unknown };

        try {
            body = await request.json();
        } catch {
            return NextResponse.json(
                { success: false, error: "Invalid JSON body." },
                { status: 400 }
            );
        }

        const canvasOrigin = body.canvasOrigin;

        if (!isValidCanvasOrigin(canvasOrigin)) {
            return NextResponse.json(
                { success: false, error: "A valid https Canvas origin is required." },
                { status: 400 }
            );
        }

        if (!Array.isArray(body.courses)) {
            return NextResponse.json(
                { success: false, error: "Invalid Canvas data." },
                { status: 400 }
            );
        }

        const items: CanvasCompletionItem[] = [];

        for (const course of body.courses.slice(0, MAX_COURSES) as Record<string, unknown>[]) {
            if (!course?.courseId || !Array.isArray(course.assignments)) continue;

            for (const assignment of course.assignments.slice(0, MAX_ASSIGNMENTS_PER_COURSE)) {
                const item = readCanvasCompletionItem(String(course.courseId), assignment as Record<string, unknown>);
                if (item) items.push(item);
            }
        }

        const { completedTaskIds, xpAwarded, deferredCount } = await applyCanvasCompletions(userId, canvasOrigin, items);

        return NextResponse.json({
            success: true,
            completedCount: completedTaskIds.length,
            xpAwarded,
            deferredCount,
        });
    } catch (error) {
        console.error("Canvas completion check failed:", error);
        return NextResponse.json(
            { success: false, error: "Something went wrong." },
            { status: 500 }
        );
    }
}
