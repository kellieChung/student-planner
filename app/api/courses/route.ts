import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
    const session = await auth();

    if (!session?.user?.email) {
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
    });

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
            hidden: true,
        },
        orderBy: { name: "asc" },
    });

    return NextResponse.json({ courses });
}
