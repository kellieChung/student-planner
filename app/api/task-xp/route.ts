import { NextResponse } from "next/server";
import { Assignment } from "@/types/assignment";
import { XpAward } from "@/types/gamification";
import { daysBetween } from "@/lib/utils";
import { classifyAssignmentType, estimateMinutesByType } from "@/lib/analyzeAssignment";

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

    const dueDate = new Date(`${due}T00:00:00`);
    const completedDate = new Date(`${completedAt}T00:00:00`);

    if (!Number.isFinite(dueDate.getTime()) || !Number.isFinite(completedDate.getTime())) return 0;

    return Math.max(0, daysBetween(completedDate, dueDate));
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

    // Purely time-based (no model call): a task without a planning estimate
    // gets the same deterministic type→minutes estimate task-planning uses.
    const baseXp =
        xpFromEstimatedMinutes(task.estimatedMinutes) ??
        xpFromEstimatedMinutes(estimateMinutesByType(classifyAssignmentType(task))) ??
        20;

    return NextResponse.json({
        xp: applyLatePenalty(baseXp, daysLate),
        source: "fallback",
    } satisfies XpAward);
}
