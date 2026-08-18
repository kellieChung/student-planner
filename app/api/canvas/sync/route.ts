import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
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

        const body = await request.json();

        console.log("🎓 Canvas sync received!");
        console.log("User:", session.user.email);
        console.log("Courses:", body.courses?.length ?? 0);

        const user = await prisma.user.findUnique({
            where: {
                email: session.user.email,
            },
        });

        if (!user) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Student Planner user not found.",
                },
                { status: 404 }
            );
        }

        console.log("👤 Prisma user found:", user.id);

        return NextResponse.json({
            success: true,
            message: "Canvas data received!",
            userId: user.id,
            courseCount: body.courses?.length ?? 0,
        });

    } catch (error) {
        console.error("❌ Canvas sync failed:", error);

        return NextResponse.json(
            {
                success: false,
                error: "Failed to process Canvas sync.",
            },
            { status: 500 }
        );
    }
}