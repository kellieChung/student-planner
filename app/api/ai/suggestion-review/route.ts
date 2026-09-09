import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const VALID_STATUSES = ["accepted", "rejected"] as const;

export async function POST(request: Request) {
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

        let body: unknown;

        try {
            body = await request.json();
        } catch {
            return NextResponse.json(
                { success: false, error: "Invalid request body." },
                { status: 400 }
            );
        }

        const { sourceAnnouncementId, suggestionKey, status } =
            (body ?? {}) as Record<string, unknown>;

        if (
            typeof sourceAnnouncementId !== "string" ||
            !sourceAnnouncementId ||
            typeof suggestionKey !== "string" ||
            !suggestionKey ||
            !VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])
        ) {
            return NextResponse.json(
                { success: false, error: "Missing or invalid fields." },
                { status: 400 }
            );
        }

        await prisma.announcementSuggestionReview.upsert({
            where: {
                userId_sourceAnnouncementId_suggestionKey: {
                    userId: user.id,
                    sourceAnnouncementId,
                    suggestionKey,
                },
            },
            create: {
                userId: user.id,
                sourceAnnouncementId,
                suggestionKey,
                status: status as string,
            },
            update: {
                status: status as string,
            },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("❌ Failed to save suggestion review:", error);
        return NextResponse.json(
            { success: false, error: "Failed to save suggestion review." },
            { status: 500 }
        );
    }
}
