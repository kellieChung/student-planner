import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const session = await auth();

        if (!session?.user?.email) {
            return NextResponse.json(
                { success: false, error: "You must be logged in." },
                { status: 401 }
            );
        }

        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
        });

        if (!user) {
            return NextResponse.json(
                { success: false, error: "User not found." },
                { status: 404 }
            );
        }

        const customizations = await prisma.taskCustomization.findMany({
            where: { userId: user.id },
            select: { taskId: true, startAt: true, course: true, notes: true },
        });

        return NextResponse.json({
            success: true,
            customizations: customizations.map((customization) => ({
                taskId: customization.taskId,
                startAt: customization.startAt
                    ? customization.startAt.toISOString().slice(0, 10)
                    : null,
                course: customization.course,
                notes: customization.notes,
            })),
        });
    } catch (error) {
        console.error("❌ Failed to load task customizations:", error);
        return NextResponse.json(
            { success: false, error: "Something went wrong." },
            { status: 500 }
        );
    }
}
