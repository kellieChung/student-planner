import { NextResponse } from "next/server";
import { Assignment } from "@/types/assignment";
import { XpAward } from "@/types/gamification";

const XP_VALUES = [10, 20, 35, 50, 75, 100];

function fallbackXp(task: Pick<Assignment, "name" | "course">): XpAward {
    const taskText = `${task.name} ${task.course}`.toLowerCase();

    if (/(exam|midterm|final|research paper|presentation|project)/.test(taskText)) {
        return { xp: 75, source: "fallback" };
    }

    if (/(essay|lab|quiz|problem set|homework)/.test(taskText)) {
        return { xp: 35, source: "fallback" };
    }

    return { xp: 20, source: "fallback" };
}

function normalizeXp(value: unknown): number {
    const proposedXp = typeof value === "number" ? value : Number(value);

    if (!Number.isFinite(proposedXp)) return 20;

    return XP_VALUES.reduce((closest, current) =>
        Math.abs(current - proposedXp) < Math.abs(closest - proposedXp) ? current : closest
    );
}

function xpFromEstimatedMinutes(estimatedMinutes: unknown): number | null {
    const minutes = typeof estimatedMinutes === "number" ? estimatedMinutes : Number(estimatedMinutes);

    if (!Number.isFinite(minutes) || minutes <= 0) return null;
    if (minutes <= 15) return 10;
    if (minutes <= 30) return 20;
    if (minutes <= 60) return 35;
    if (minutes <= 120) return 50;
    if (minutes <= 240) return 75;
    return 100;
}

function latePenalty(daysLate: number): number {
    if (daysLate <= 0) return 1;
    if (daysLate === 1) return 0.8;
    if (daysLate <= 3) return 0.6;
    if (daysLate <= 7) return 0.4;
    return 0.2;
}

function calculateDaysLate(due: string, completedAt: string): number {
    if (!due || !completedAt) return 0;

    const dueDate = new Date(`${due}T00:00:00`).getTime();
    const completedDate = new Date(`${completedAt}T00:00:00`).getTime();

    if (!Number.isFinite(dueDate) || !Number.isFinite(completedDate)) return 0;

    return Math.max(0, Math.floor((completedDate - dueDate) / (1000 * 60 * 60 * 24)));
}

function applyLatePenalty(baseXp: number, daysLate: number): number {
    return Math.max(5, Math.floor((baseXp * latePenalty(daysLate)) / 5) * 5);
}

export async function POST(request: Request) {
    let task: Pick<Assignment, "name" | "course" | "due"> & { completedAt?: string; estimatedMinutes?: number };

    try {
        task = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid task data" }, { status: 400 });
    }

    if (!task.name || typeof task.name !== "string") {
        return NextResponse.json({ error: "A task name is required" }, { status: 400 });
    }

    const daysLate = calculateDaysLate(task.due, task.completedAt ?? "");
    const timeBasedXp = xpFromEstimatedMinutes(task.estimatedMinutes);
    const fallbackBase = fallbackXp(task);
    const fallback = {
        ...fallbackBase,
        xp: applyLatePenalty(timeBasedXp ?? fallbackBase.xp, daysLate),
    };

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
                        content: "Estimate only the expected workload of this student task. Do not judge quality, effort, or how well it was completed. Return only JSON: {\"xp\": number}. Choose exactly one base XP value: 10 for a quick routine task, 20 for a small task, 35 for typical homework/quiz/lab, 50 for a substantial assignment, 75 for a major paper/project/exam, or 100 for an exceptional capstone. Do not default to 50: if the title is vague, choose 20. If estimatedMinutes is provided, keep the XP aligned with it: 15 minutes or less is 10 XP, 30 is 20 XP, 60 is 35 XP, 120 is 50 XP, 240 is 75 XP, and longer is 100 XP.",
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
        const scoredTask = JSON.parse(result.message?.content ?? "{}") as { xp?: unknown };

        return NextResponse.json({
            xp: applyLatePenalty(timeBasedXp ?? normalizeXp(scoredTask.xp), daysLate),
            source: "ollama",
        } satisfies XpAward);
    } catch {
        return NextResponse.json(fallback);
    }
}
