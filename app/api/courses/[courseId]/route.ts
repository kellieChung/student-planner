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

    const body = await request.json();

    if (typeof body.hidden !== "boolean") {
        return NextResponse.json(
            { error: "'hidden' must be a boolean." },
            { status: 400 }
        );
    }

    const course = await prisma.canvasCourse.update({
        where: { id: courseId },
        data: { hidden: body.hidden },
        select: {
            id: true,
            name: true,
            hidden: true,
        },
    });

    return NextResponse.json({ course });
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
