import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const CUSTOM_COURSE_ORIGIN = "custom";

async function getAuthenticatedUser() {
    const session = await auth();

    if (!session?.user?.email) {
        return null;
    }

    return prisma.user.findUnique({
        where: { email: session.user.email },
    });
}

export async function GET() {
    const user = await getAuthenticatedUser();

    if (!user) {
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    const courses = await prisma.canvasCourse.findMany({
        where: { userId: user.id },
        select: {
            id: true,
            name: true,
            displayName: true,
            hidden: true,
            canvasOrigin: true,
        },
        orderBy: { name: "asc" },
    });

    return NextResponse.json({
        courses: courses.map((course) => ({
            id: course.id,
            name: course.displayName ?? course.name,
            hidden: course.hidden,
            isCustom: course.canvasOrigin === CUSTOM_COURSE_ORIGIN,
        })),
    });
}

export async function POST(request: Request) {
    const user = await getAuthenticatedUser();

    if (!user) {
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
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

    const name = (body as { name?: unknown } | null)?.name;

    if (typeof name !== "string" || !name.trim()) {
        return NextResponse.json(
            { error: "'name' is required." },
            { status: 400 }
        );
    }

    const course = await prisma.canvasCourse.create({
        data: {
            userId: user.id,
            canvasOrigin: CUSTOM_COURSE_ORIGIN,
            canvasId: randomUUID(),
            name: name.trim(),
        },
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
            isCustom: course.canvasOrigin === CUSTOM_COURSE_ORIGIN,
        },
    });
}
