export type PriorityInput = {
    name: string;
    due: string | null;

    importance: number;
    difficulty: number;
    consequence: number;
    estimatedMinutes: number;

    // Average hours-before-deadline this student has historically finished
    // this task's type (see lib/procrastinationHistory.ts). Omit/null when
    // there's no history yet for the type.
    procrastinationIndexHours?: number | null;
};

export type PriorityResult = {
    score: number;
    urgencyScore: number;
    frogScore: number;
    reason: string;
    historyAdjusted: boolean;
};

// A "healthy" lead time to treat as not needing any personalized nudge.
const BASELINE_LEAD_HOURS = 48;

// Cap how much history can pull the effective due date forward, so a single
// badly-missed task can't make everything else look artificially urgent.
const MAX_URGENCY_SHIFT_HOURS = 120;

function calculateUrgencyShiftHours(procrastinationIndexHours: number): number {
    return Math.min(
        MAX_URGENCY_SHIFT_HOURS,
        Math.max(0, BASELINE_LEAD_HOURS - procrastinationIndexHours)
    );
}

function calculateUrgency(
    due: string | null,
    procrastinationIndexHours?: number | null
): number {
    if (!due) {
        return 0;
    }

    const now = new Date();
    let dueDate = new Date(`${due}T23:59:59`);

    /*
     * Treat a task type the student historically leaves until close to (or
     * past) the deadline as more urgent sooner than the raw due date would
     * suggest, by evaluating urgency against an earlier effective due date.
     */
    if (
        typeof procrastinationIndexHours === "number" &&
        Number.isFinite(procrastinationIndexHours)
    ) {
        const shiftHours = calculateUrgencyShiftHours(procrastinationIndexHours);
        dueDate = new Date(dueDate.getTime() - shiftHours * 60 * 60 * 1000);
    }

    const hoursUntilDue =
        (dueDate.getTime() - now.getTime()) /
        (1000 * 60 * 60);

    if (hoursUntilDue <= 0) {
        return 100;
    }

    if (hoursUntilDue <= 24) {
        return 95;
    }

    if (hoursUntilDue <= 48) {
        return 85;
    }

    if (hoursUntilDue <= 72) {
        return 75;
    }

    if (hoursUntilDue <= 7 * 24) {
        return 60;
    }

    if (hoursUntilDue <= 14 * 24) {
        return 40;
    }

    return 20;
}

export function calculatePriority(
    task: PriorityInput
): PriorityResult {
    const rawUrgencyScore =
        calculateUrgency(task.due);

    const urgencyScore =
        calculateUrgency(task.due, task.procrastinationIndexHours);

    const historyAdjusted = urgencyScore > rawUrgencyScore;

    const frogScore =
        task.importance >= 7 &&
        task.difficulty >= 7
            ? 100
            : 0;

    /*
     * Urgency must be dominant, not just heavily weighted: the planner
     * should never tell a student to work on a distant-but-important essay
     * instead of a normal assignment due tonight. A weighted sum where
     * importance/difficulty/consequence are each worth up to ~15-20% can
     * still add up to more than a whole urgency-bucket gap (e.g. a 9/9/8
     * task due in 10 days used to outscore a 4/3/3 task due today) — see
     * prioritizationModule.md's "Scoring formula" section.
     *
     * So urgencyScore (the bucketed, procrastination-adjusted value, in
     * increments of at least 5) is the primary key, and the
     * importance/difficulty/consequence/frog blend is squashed into a
     * secondary term capped well under that smallest possible gap — it can
     * only break ties between tasks of similar urgency, never overcome a
     * real difference in how soon something is due.
     */

    const secondaryScore =
        task.importance * 10 * 0.40 +
        task.difficulty * 10 * 0.30 +
        task.consequence * 10 * 0.20 +
        frogScore * 0.10;

    const score =
        urgencyScore +
        secondaryScore / 100;

    let reason = "";

    if (rawUrgencyScore >= 95) {
        reason =
            "This is due very soon, so it needs immediate attention.";
    } else if (historyAdjusted) {
        reason =
            "You've historically finished tasks like this close to the deadline, so it's prioritized earlier than the due date alone would suggest.";
    } else if (
        task.importance >= 8 &&
        task.difficulty >= 8
    ) {
        reason =
            "This is a high-value, difficult task, making it a strong candidate for your Frog.";
    } else if (task.importance >= 8) {
        reason =
            "This task has high academic value, so finishing it early is worthwhile.";
    } else if (task.difficulty >= 8) {
        reason =
            "This task is difficult and may take significant focus, so starting early reduces risk.";
    } else {
        reason =
            "This task is relatively timely compared with your other upcoming work.";
    }

    return {
        score,
        urgencyScore,
        frogScore,
        reason,
        historyAdjusted,
    };
}