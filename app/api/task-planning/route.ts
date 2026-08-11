import { NextResponse } from "next/server";
import { TaskImportance } from "@/types/taskPlanning";

type PlanningTask = {
    id: string;
    name: string;
    course: string;
};

type ModelEstimate = {
    id: string;
    estimatedMinutes: number;
    importance: TaskImportance;
};

function fallbackEstimate(task: PlanningTask): Omit<ModelEstimate, "id"> {
    const text = `${task.name} ${task.course}`.toLowerCase();

    if (/(exam|midterm|final|research paper|presentation|project|capstone)/.test(text)) {
        return { estimatedMinutes: 180, importance: "high" };
    }

    if (/(essay|lab|problem set|homework)/.test(text)) {
        return { estimatedMinutes: 75, importance: "medium" };
    }

    if (/(quiz|reading|discussion|worksheet)/.test(text)) {
        return { estimatedMinutes: 30, importance: "medium" };
    }

    return { estimatedMinutes: 20, importance: "low" };
}

function normalizeMinutes(value: unknown): number {
    const minutes = typeof value === "number" ? value : Number(value);

    if (!Number.isFinite(minutes)) return 20;
    return Math.max(5, Math.min(480, Math.round(minutes / 5) * 5));
}

function normalizeImportance(value: unknown): TaskImportance {
    return value === "high" || value === "medium" || value === "low" ? value : "low";
}

export async function POST(request: Request) {
    let tasks: PlanningTask[];

    try {
        const body = await request.json() as { tasks?: unknown };
        tasks = Array.isArray(body.tasks) ? body.tasks.slice(0, 40) as PlanningTask[] : [];
    } catch {
        return NextResponse.json({ error: "Invalid task data" }, { status: 400 });
    }

    const validTasks = tasks.filter((task) => task.id && task.name && typeof task.name === "string");

    if (validTasks.length === 0) {
        return NextResponse.json({ estimates: [] });
    }

    const fallbacks = new Map(validTasks.map((task) => [task.id, fallbackEstimate(task)]));

    try {
        const response = await fetch(`${process.env.OLLAMA_URL ?? "http://127.0.0.1:11434"}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(20_000),
            body: JSON.stringify({
                model: process.env.OLLAMA_MODEL ?? "llama3.2:latest",
                stream: false,
                format: "json",
                options: { temperature: 0.2 },
                messages: [
                    {
                        role: "system",
                        content: "Estimate each student's task. Return only JSON: {\"estimates\":[{\"id\":string,\"estimatedMinutes\":number,\"importance\":\"low|medium|high\"}]}. estimatedMinutes is expected focused work time from 5 to 480 minutes. importance follows Eat That Frog: high means meaningful long-term academic impact, medium is normal coursework, low is routine or optional. Do not use due dates; urgency is calculated separately. Estimate every provided id.",
                    },
                    { role: "user", content: JSON.stringify(validTasks) },
                ],
            }),
        });

        if (!response.ok) throw new Error("Ollama request failed");

        const result = await response.json() as { message?: { content?: string } };
        const parsed = JSON.parse(result.message?.content ?? "{}") as { estimates?: unknown };
        const modelEstimates = Array.isArray(parsed.estimates) ? parsed.estimates as ModelEstimate[] : [];
        const byId = new Map(modelEstimates.map((estimate) => [estimate.id, estimate]));

        return NextResponse.json({
            estimates: validTasks.map((task) => {
                const estimate = byId.get(task.id);
                const fallback = fallbacks.get(task.id)!;

                return {
                    id: task.id,
                    estimatedMinutes: normalizeMinutes(estimate?.estimatedMinutes ?? fallback.estimatedMinutes),
                    importance: normalizeImportance(estimate?.importance ?? fallback.importance),
                };
            }),
        });
    } catch {
        return NextResponse.json({
            estimates: validTasks.map((task) => ({ id: task.id, ...fallbacks.get(task.id)! })),
        });
    }
}
