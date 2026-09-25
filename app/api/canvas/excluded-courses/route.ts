import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCanvasSyncUserId } from "@/lib/canvasIngest";

// Lets the extension skip fetching Canvas data (assignments/discussions/
// announcements) for a course the user already deleted, instead of
// fetching it every sync just to have upsertCanvasCourses throw it away.
// Purely a speed optimization for the extension — upsertCanvasCourses
// still checks DeletedCanvasCourse itself on every ingest, so this
// endpoint failing or being skipped can't reintroduce a deleted course.
export async function GET(request: Request) {
    try {
        const userId = await getCanvasSyncUserId(request);

        if (!userId) {
            return NextResponse.json(
                { success: false, error: "You must be logged in." },
                { status: 401 }
            );
        }

        const canvasOrigin = new URL(request.url).searchParams.get(
            "canvasOrigin"
        );

        if (!canvasOrigin) {
            return NextResponse.json(
                { success: false, error: "Canvas origin is required." },
                { status: 400 }
            );
        }

        const deletedCourses = await prisma.deletedCanvasCourse.findMany({
            where: { userId, canvasOrigin },
            select: { canvasId: true },
        });

        return NextResponse.json({
            success: true,
            canvasIds: deletedCourses.map((deleted) => deleted.canvasId),
        });
    } catch (error) {
        console.error("Failed to load excluded Canvas courses:", error);

        return NextResponse.json(
            { success: false, error: "Failed to load excluded courses." },
            { status: 500 }
        );
    }
}
