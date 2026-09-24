import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAiTaskEvent } from "@/lib/aiTaskEvents";

// Asks a running analysis to stop launching new batches. The run itself
// (app/api/ai/analyze-announcements/route.ts) polls for this event between
// batches, so anything already in flight finishes and streams normally.
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

        const body = await request.json().catch(() => null);
        const runId = body?.runId;

        if (typeof runId !== "string" || runId.length === 0 || runId.length > 64) {
            return NextResponse.json(
                { success: false, error: "runId is required." },
                { status: 400 }
            );
        }

        await logAiTaskEvent(user.id, "detection_pass_paused", { data: { runId } });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("❌ Failed to pause announcement analysis:", error);

        return NextResponse.json(
            { success: false, error: "Something went wrong." },
            { status: 500 }
        );
    }
}
