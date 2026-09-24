import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";

export type AiTaskEventType =
    | "detection_pass_triggered"
    | "detection_pass_paused"
    | "detection_credit_granted"
    | "candidate_decided"
    | "maybe_resolved"
    | "ai_tag_dismissed"
    | "ai_task_deleted";

type AiTaskEventFields = {
    sourceAnnouncementId?: string;
    suggestionKey?: string;
    taskId?: string;
    data?: Prisma.InputJsonValue;
};

// Durable audit log for AutoTaskCreation.md's "Logging" section (accept/
// reject/maybe rates, duplicate-verdict overrides, time-parked-as-maybe,
// AI-tag-dismissed-vs-deleted) and the manual detection-pass rate limit
// (lib/aiRateLimit.ts). Every call site wraps its own call in try/catch —
// a logging failure must never block the real action it's describing.
export async function logAiTaskEvent(
    userId: string,
    type: AiTaskEventType,
    fields: AiTaskEventFields = {}
): Promise<void> {
    await prisma.aiTaskEvent.create({
        data: {
            userId,
            type,
            sourceAnnouncementId: fields.sourceAnnouncementId,
            suggestionKey: fields.suggestionKey,
            taskId: fields.taskId,
            data: fields.data,
        },
    });
}
