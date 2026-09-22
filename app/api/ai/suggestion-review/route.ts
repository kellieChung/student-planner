import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAiTaskEvent } from "@/lib/aiTaskEvents";

// "pending" is intentionally not accepted from a client — it's only ever
// written by the detection pass itself (app/api/ai/analyze-announcements/
// route.ts). This route is the Rundown/Still-Deciding screens' Yes/No/
// Maybe write path.
const VALID_STATUSES = ["accepted", "rejected", "maybe"] as const;

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

        // `duplicateSuspected`: the client already knows this from
        // `task.canvasMatch.status !== "none"` when it renders the card —
        // cheaper than a second server-side read of taskSnapshot just to
        // log whether an accept overrode a flagged duplicate.
        const { sourceAnnouncementId, suggestionKey, status, duplicateSuspected } =
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

        const decision = status as (typeof VALID_STATUSES)[number];

        const existing = await prisma.announcementSuggestionReview.findUnique({
            where: {
                userId_sourceAnnouncementId_suggestionKey: {
                    userId: user.id,
                    sourceAnnouncementId,
                    suggestionKey,
                },
            },
            select: { status: true, createdAt: true },
        });

        const isResolving = decision === "accepted" || decision === "rejected";

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
                status: decision,
                resolvedAt: isResolving ? new Date() : null,
            },
            update: {
                status: decision,
                resolvedAt: isResolving ? new Date() : null,
            },
        });

        try {
            await logAiTaskEvent(user.id, "candidate_decided", {
                sourceAnnouncementId,
                suggestionKey,
                data: {
                    decision,
                    overrodeDuplicateVerdict:
                        duplicateSuspected === true && decision === "accepted",
                },
            });

            if (existing?.status === "maybe" && isResolving) {
                await logAiTaskEvent(user.id, "maybe_resolved", {
                    sourceAnnouncementId,
                    suggestionKey,
                    data: {
                        resolvedTo: decision,
                        timeParkedMs: Date.now() - existing.createdAt.getTime(),
                    },
                });
            }
        } catch (error) {
            console.error("❌ Failed to log suggestion review decision:", error);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("❌ Failed to save suggestion review:", error);
        return NextResponse.json(
            { success: false, error: "Failed to save suggestion review." },
            { status: 500 }
        );
    }
}
