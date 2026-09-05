import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const session = await auth();

        if (!session?.user?.email) {
            return NextResponse.json(
                {
                    success: false,
                    error: "You must be logged in.",
                },
                { status: 401 }
            );
        }

        const user = await prisma.user.findUnique({
            where: {
                email: session.user.email,
            },
        });

        if (!user) {
            return NextResponse.json(
                {
                    success: false,
                    error: "User not found.",
                },
                { status: 404 }
            );
        }

        const courses = await prisma.canvasCourse.findMany({
            where: {
                userId: user.id,
                hidden: false,
            },
            include: {
                assignments: true,
                discussions: true,
                announcements: true,
            },
            orderBy: {
                name: "asc",
            },
        });

        return NextResponse.json({
            success: true,
            courses,
        });
    } catch (error) {
        console.error(
            "❌ Failed to load planner data:",
            error
        );

        return NextResponse.json(
            {
                success: false,
                error: "Failed to load planner data.",
            },
            { status: 500 }
        );
    }
}