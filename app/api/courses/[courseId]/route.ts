import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { CUSTOM_COURSE_ORIGIN } from "@/lib/canvas";

type Params = {
    params: Promise<{
        courseId: string;
    }>;
};

async function getAuthenticatedUser() {
    const session = await auth();

    if (!session?.user?.email) {
        return null;
    }

    return prisma.user.findUnique({
        where: {
            email: session.user.email,
        },
    });
}

export async function PATCH(
    request: Request,
    { params }: Params
) {
    const user = await getAuthenticatedUser();

    if (!user) {
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    const { courseId } = await params;

    const existingCourse = await prisma.canvasCourse.findFirst({
        where: {
            id: courseId,
            userId: user.id,
        },
    });

    if (!existingCourse) {
        return NextResponse.json(
            { error: "Course not found." },
            { status: 404 }
        );
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body." },
            { status: 400 }
        );
    }

    const { hidden, name, abbreviation, color } = body as { hidden?: unknown; name?: unknown; abbreviation?: unknown; color?: unknown };

    if (hidden === undefined && name === undefined && abbreviation === undefined && color === undefined) {
        return NextResponse.json(
            { error: "Provide 'hidden', 'name', 'abbreviation', and/or 'color' to update." },
            { status: 400 }
        );
    }

    if (hidden !== undefined && typeof hidden !== "boolean") {
        return NextResponse.json(
            { error: "'hidden' must be a boolean." },
            { status: 400 }
        );
    }

    if (name !== undefined && (typeof name !== "string" || !name.trim())) {
        return NextResponse.json(
            { error: "'name' must be a non-empty string." },
            { status: 400 }
        );
    }

    if (abbreviation !== undefined && typeof abbreviation !== "string") {
        return NextResponse.json(
            { error: "'abbreviation' must be a string." },
            { status: 400 }
        );
    }

    if (color !== undefined && typeof color !== "string") {
        return NextResponse.json(
            { error: "'color' must be a string." },
            { status: 400 }
        );
    }

    if (color !== undefined && color.trim() && !/^#[0-9a-fA-F]{6}$/.test(color.trim())) {
        return NextResponse.json(
            { error: "'color' must be a hex color like '#3b82f6'." },
            { status: 400 }
        );
    }

    const data: { hidden?: boolean; displayName?: string; abbreviation?: string | null; color?: string | null } = {};
    if (hidden !== undefined) data.hidden = hidden as boolean;
    // Rename only ever touches displayName — the canonical `name` column
    // is owned by Canvas sync and would revert this on the next sync.
    if (name !== undefined) data.displayName = (name as string).trim();
    // An empty string clears the override, reverting to the auto-derived
    // default (lib/taskLabel.ts's courseAbbreviationDefault).
    if (abbreviation !== undefined) {
        const trimmed = (abbreviation as string).trim();
        data.abbreviation = trimmed ? trimmed : null;
    }
    // An empty string clears the override, reverting to the auto-derived
    // default (AssignmentCard.tsx's courseColorFor hash).
    if (color !== undefined) {
        const trimmed = color.trim();
        data.color = trimmed ? trimmed : null;
    }

    const course = await prisma.canvasCourse.update({
        where: { id: courseId },
        data,
        select: {
            id: true,
            name: true,
            displayName: true,
            hidden: true,
            canvasOrigin: true,
            abbreviation: true,
            color: true,
        },
    });

    return NextResponse.json({
        course: {
            id: course.id,
            name: course.displayName ?? course.name,
            hidden: course.hidden,
            isCustom: course.canvasOrigin === CUSTOM_COURSE_ORIGIN,
            abbreviation: course.abbreviation,
            color: course.color,
        },
    });
}

export async function DELETE(
    _request: Request,
    { params }: Params
) {
    const user = await getAuthenticatedUser();

    if (!user) {
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    const { courseId } = await params;

    const existingCourse = await prisma.canvasCourse.findFirst({
        where: {
            id: courseId,
            userId: user.id,
        },
    });

    if (!existingCourse) {
        return NextResponse.json(
            { error: "Course not found." },
            { status: 404 }
        );
    }

    // The course delete and its tombstone write must succeed or fail
    // together — if the tombstone write were left as a second, independent
    // await, a failure there after the delete already committed would
    // silently strip a real deletion of its protection, and the next sync
    // would recreate the course since Canvas still reports it active.
    // Cascades to the course's assignments/discussions/announcements
    // (onDelete: Cascade in prisma/schema.prisma). Not meaningful for a
    // custom (non-Canvas) course: it has no real canvasId to ever re-sync,
    // so its deletion is already permanent and needs no tombstone.
    // Upsert, not create, so re-deleting an already-tombstoned canvasId
    // (e.g. restore, then delete again) can't hit a unique-constraint error.
    await prisma.$transaction([
        prisma.canvasCourse.delete({
            where: { id: courseId },
        }),
        ...(existingCourse.canvasOrigin !== CUSTOM_COURSE_ORIGIN
            ? [
                  prisma.deletedCanvasCourse.upsert({
                      where: {
                          userId_canvasOrigin_canvasId: {
                              userId: user.id,
                              canvasOrigin: existingCourse.canvasOrigin,
                              canvasId: existingCourse.canvasId,
                          },
                      },
                      update: {},
                      create: {
                          userId: user.id,
                          canvasOrigin: existingCourse.canvasOrigin,
                          canvasId: existingCourse.canvasId,
                      },
                  }),
              ]
            : []),
    ]);

    return NextResponse.json({ success: true });
}
