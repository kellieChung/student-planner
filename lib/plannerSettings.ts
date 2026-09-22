export type PlannerSettings = {
    autoAcceptAiTasks: boolean;
    lastRundownViewedAt: string | null;
};

const defaultSettings: PlannerSettings = {
    autoAcceptAiTasks: false,
    lastRundownViewedAt: null,
};

function coerceSettings(data: Partial<PlannerSettings>): PlannerSettings {
    return {
        autoAcceptAiTasks: typeof data.autoAcceptAiTasks === "boolean" ? data.autoAcceptAiTasks : false,
        lastRundownViewedAt: typeof data.lastRundownViewedAt === "string" ? data.lastRundownViewedAt : null,
    };
}

export async function getPlannerSettings(): Promise<PlannerSettings> {
    try {
        const response = await fetch("/api/planner-settings");

        if (!response.ok) return defaultSettings;

        const data = (await response.json()) as Partial<PlannerSettings>;
        return coerceSettings(data);
    } catch {
        return defaultSettings;
    }
}

// The PATCH route treats an absent key as "leave this field alone" (same
// convention as lib/townState.ts) — callers send only the field(s) they
// actually own.
export async function savePlannerSettings(partial: Partial<PlannerSettings>): Promise<void> {
    try {
        await fetch("/api/planner-settings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(partial),
        });
    } catch (error) {
        console.error("Could not save planner settings", error);
    }
}
