import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
    const session = await auth();

    if (!session?.user?.email) {
        return NextResponse.json(
            {
                success: false,
                error: "Not authenticated",
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
                error: "User not found",
            },
            { status: 404 }
        );
    }

    const token = randomBytes(32).toString("hex");
    const state = randomBytes(32).toString("hex");

    await prisma.extensionSession.create({
        data: {
            token,
            state,
            userId: user.id,
            expiresAt: new Date(
                Date.now() + 10 * 60 * 1000
            ),
        },
    });

    return NextResponse.json({
        success: true,
        token,
        state,
    });
}