import { NextResponse } from "next/server";
import { Assignment } from "@/types/assignment";
import { XpAward } from "@/types/gamification";

const XP_VALUES = [10, 20, 35, 50, 75, 100];

function fallbackXp(task: Pick<Assignment, "name" | "course">): XpAward {
    const taskText = `${task.name} ${task.course}`.toLowerCase();

    if (/(exam|midterm|final|research paper|presentation|project)/.test(taskText)) {
        return { xp: 75, reason: "A substantial assignment", source: "fallback" };
    }

    if (/(essay|lab|quiz|problem set|homework)/.test(taskText)) {
        return { xp: 35, reason: "A standard course assignment", source: "fallback" };
    }

    return { xp: 20, reason: "A routine task", source: "fallback" };
}

function normalizeXp(value: unknown): number {
    const proposedXp = typeof value === "number" ? value : Number(value);

    if (!Number.isFinite(proposedXp)) return 20;

    return XP_VALUES.reduce((closest, current) =>
        Math.abs(current - proposedXp) < Math.abs(closest - proposedXp) ? current : closest
    );
}

export async function POST(request: Request) {
    let task: Pick<Assignment, "name" | "course" | "due">;

    try {
        task = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid task data" }, { status: 400 });
    }

    if (!task.name || typeof task.name !== "string") {
        return NextResponse.json({ error: "A task name is required" }, { status: 400 });
    }

    const fallback = fallbackXp(task);

    try {
        const response = await fetch(`${process.env.OLLAMA_URL ?? "http://127.0.0.1:11434"}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(12_000),
            body: JSON.stringify({
                model: process.env.OLLAMA_MODEL ?? "llama3.2:latest",
                stream: false,
                format: "json",
                options: { temperature: 0.2 },
                messages: [
                    {
                        role: "system",
                        content: "You score a student's completed task for a motivating planner. Return only JSON with xp and reason. Choose exactly one XP value: 10, 20, 35, 50, 75, or 100. Use task scope and likely effort, not the task's due date. Keep reason under 10 words.",
                    },
                    {
                        role: "user",
                        content: JSON.stringify(task),
                    },
                ],
            }),
        });

        if (!response.ok) return NextResponse.json(fallback);

        const result = await response.json() as { message?: { content?: string } };
        const scoredTask = JSON.parse(result.message?.content ?? "{}") as { xp?: unknown; reason?: unknown };

        return NextResponse.json({
            xp: normalizeXp(scoredTask.xp),
            reason: typeof scoredTask.reason === "string" ? scoredTask.reason.slice(0, 120) : fallback.reason,
            source: "ollama",
        } satisfies XpAward);
    } catch {
        return NextResponse.json(fallback);
    }
}
