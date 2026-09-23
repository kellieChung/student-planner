import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE() {
    try {
        const session = await auth();

        if (!session?.user?.email) {
            return NextResponse.json({ success: false, error: "You must be logged in." }, { status: 401 });
        }

        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
        });

        if (!user) {
            return NextResponse.json({ success: false, error: "User not found." }, { status: 404 });
        }

        // Every relation on User is onDelete: Cascade, so this removes all of the user's data.
        await prisma.user.delete({ where: { id: user.id } });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Failed to delete account:", error);
        return NextResponse.json({ success: false, error: "Failed to delete account" }, { status: 500 });
    }
}
