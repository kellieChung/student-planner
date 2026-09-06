import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

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

    const { hidden, name } = body as { hidden?: unknown; name?: unknown };

    if (hidden === undefined && name === undefined) {
        return NextResponse.json(
            { error: "Provide 'hidden' and/or 'name' to update." },
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

    const data: { hidden?: boolean; displayName?: string } = {};
    if (hidden !== undefined) data.hidden = hidden as boolean;
    // Rename only ever touches displayName — the canonical `name` column
    // is owned by Canvas sync and would revert this on the next sync.
    if (name !== undefined) data.displayName = (name as string).trim();

    const course = await prisma.canvasCourse.update({
        where: { id: courseId },
        data,
        select: {
            id: true,
            name: true,
            displayName: true,
            hidden: true,
            canvasOrigin: true,
        },
    });

    return NextResponse.json({
        course: {
            id: course.id,
            name: course.displayName ?? course.name,
            hidden: course.hidden,
            isCustom: course.canvasOrigin === "custom",
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

    // Cascades to the course's assignments/discussions/announcements
    // (onDelete: Cascade in prisma/schema.prisma). If Canvas still reports
    // this course as active, the next sync will re-create it — use the
    // "hidden" toggle instead for a course that should stay gone.
    await prisma.canvasCourse.delete({
        where: { id: courseId },
    });

    return NextResponse.json({ success: true });
}
