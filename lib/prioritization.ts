import { parseLocalDate } from "@/lib/utils";

export type PriorityInput = {
    name: string;
    due: string | null;

    // Time-of-day of `due` as a 0-1 fraction (see Assignment.dueFraction).
    // Omitted → end of day.
    dueFraction?: number;

    // Resolved "YYYY-MM-DD" custom start date (caller resolves
    // TaskCustomization/the expired-start-date auto-revert first — this
    // module stays ignorant of that shape). Omit/null when there's no
    // custom start date.
    startAt?: string | null;

    // Caller-supplied "today" as "YYYY-MM-DD", used only to evaluate the
    // startAt gate below. Passed in rather than read via `new Date()` here,
    // same convention as lib/utils.ts's hasCustomStartDatePassed — every
    // call site in the same render should agree on "now." Omitted → the
    // startAt gate never fires (existing callers unaffected).
    today?: string;

    importance: number;
    difficulty: number;
    consequence: number;
    estimatedMinutes: number;

    // Average hours-before-deadline this student has historically finished
    // this task's type (see lib/procrastinationHistory.ts). Omit/null when
    // there's no history yet for the type.
    procrastinationIndexHours?: number | null;

    // Task status, for the reason text only (never the score).
    inProgress?: boolean;
};

// "finish": do the whole thing now (small, or too close to split).
// "start": a big task with room left, so today's ask is a chunk of it.
export type PriorityMode = "finish" | "start";

export type PriorityResult = {
    score: number;
    urgencyScore: number;
    frogScore: number;
    reason: string;
    historyAdjusted: boolean;
    notYetStartable: boolean;
    mode: PriorityMode;
    // What to put in today: the whole estimate for "finish", a paced chunk
    // for "start".
    todayMinutes: number;
};

// A "healthy" lead time to treat as not needing any personalized nudge.
const BASELINE_LEAD_HOURS = 48;

// Cap how much history can pull the effective due date forward, so a single
// badly-missed task can't make everything else look artificially urgent.
const MAX_URGENCY_SHIFT_HOURS = 120;

// importance/difficulty are on the same 1-10 scale the frog bonus's own
// threshold uses (see calculatePriority's `frogScore`) — kept in sync with
// the "high-value, difficult task" reason text below so both describe the
// same condition.
const FROG_THRESHOLD = 7;

// Slack is clamped to a finite range: overdue tasks stay on top without
// growing more urgent forever, and undated/far-off tasks share the bottom.
// Never Infinity — scores are stored and JSON-serialized, and Infinity
// becomes null, which WeeklyPlannerView's estimate validation rejects.
const OVERDUE_FLOOR_HOURS = -24;
const MAX_SLACK_HOURS = 90 * 24;

// The most importance/difficulty/consequence/frog can move a task, in
// hours of slack. Small on purpose: they only decide between tasks that
// need starting at about the same time, never against a day's difference
// in deadline — see prioritizationModule.md's "Scoring rules".
const MAX_TIE_BREAK_HOURS = 6;

// Matches the Watch's focus length (components/PomodoroTimer.tsx), so a
// "start" chunk is a whole number of Pomodoros.
export const POMODORO_MINUTES = 25;

// A task this short is done in one sitting, so it's never split.
const MIN_SPLIT_MINUTES = 60;

// "start" needs at least this many whole days left (after the
// procrastination shift): today plus at least one more to spread it over.
const MIN_SPLIT_DAYS = 2;

function calculateUrgencyShiftHours(procrastinationIndexHours: number): number {
    return Math.min(
        MAX_URGENCY_SHIFT_HOURS,
        Math.max(0, BASELINE_LEAD_HOURS - procrastinationIndexHours)
    );
}

// Hours until the due moment, honoring time of day (absent dueFraction =
// end of day, same as the grid).
function hoursUntilDue(due: string, dueFraction: number | undefined, now: Date): number {
    const dueDay = parseLocalDate(due);
    const fraction = typeof dueFraction === "number" && Number.isFinite(dueFraction)
        ? Math.min(1, Math.max(0, dueFraction))
        : 1;
    const dueAt = dueDay.getTime() + fraction * 24 * 60 * 60 * 1000 - 1000;

    return (dueAt - now.getTime()) / (1000 * 60 * 60);
}

/*
 * Slack = how many hours are left before you'd have to start: time until
 * due, minus the estimated work time, minus the student's procrastination
 * shift for this type. The task with the least slack is the most urgent.
 */
function calculateSlackHours(
    task: PriorityInput,
    useHistory: boolean,
    now: Date
): number {
    if (!task.due) {
        return MAX_SLACK_HOURS;
    }

    let hours = hoursUntilDue(task.due, task.dueFraction, now) - task.estimatedMinutes / 60;

    if (
        useHistory &&
        typeof task.procrastinationIndexHours === "number" &&
        Number.isFinite(task.procrastinationIndexHours)
    ) {
        hours -= calculateUrgencyShiftHours(task.procrastinationIndexHours);
    }

    return Math.min(MAX_SLACK_HOURS, Math.max(OVERDUE_FLOOR_HOURS, hours));
}

// Coarse 0-100 view of slack, kept for the stored urgencyScore and the
// reason text; ranking uses the continuous score.
function urgencyBucket(slackHours: number): number {
    if (slackHours <= 0) return 100;
    if (slackHours <= 24) return 95;
    if (slackHours <= 48) return 85;
    if (slackHours <= 72) return 75;
    if (slackHours <= 7 * 24) return 60;
    if (slackHours <= 14 * 24) return 40;
    if (slackHours < MAX_SLACK_HOURS) return 20;
    return 0;
}

/*
 * Mode is a label, not a weight: ranking stays slack-based (a big task
 * due later may still be Polaris), this only decides whether the ask is
 * "finish it" or "put a chunk in today". Pacing uses the shifted deadline,
 * so a type the student leaves late is paced to finish earlier.
 */
function calculateMode(
    task: PriorityInput,
    now: Date
): { mode: PriorityMode; todayMinutes: number } {
    const finish = { mode: "finish" as const, todayMinutes: task.estimatedMinutes };

    if (task.estimatedMinutes <= MIN_SPLIT_MINUTES) {
        return finish;
    }

    if (!task.due) {
        return { mode: "start", todayMinutes: POMODORO_MINUTES };
    }

    let shiftedHours = hoursUntilDue(task.due, task.dueFraction, now);
    if (
        typeof task.procrastinationIndexHours === "number" &&
        Number.isFinite(task.procrastinationIndexHours)
    ) {
        shiftedHours -= calculateUrgencyShiftHours(task.procrastinationIndexHours);
    }

    const daysLeft = Math.floor(shiftedHours / 24);
    if (daysLeft < MIN_SPLIT_DAYS) {
        return finish;
    }

    const paced = Math.ceil(task.estimatedMinutes / daysLeft / POMODORO_MINUTES) * POMODORO_MINUTES;

    return {
        mode: "start",
        todayMinutes: Math.min(task.estimatedMinutes, Math.max(POMODORO_MINUTES, paced)),
    };
}

function formatHours(minutes: number): string {
    const hours = Math.round((minutes / 60) * 2) / 2;
    return hours >= 1 ? `${hours}h` : `${Math.round(minutes)} min`;
}

export function calculatePriority(
    task: PriorityInput
): PriorityResult {
    const now = new Date();
    const rawSlackHours = calculateSlackHours(task, false, now);
    const slackHours = calculateSlackHours(task, true, now);

    const rawUrgencyScore = urgencyBucket(rawSlackHours);
    const urgencyScore = urgencyBucket(slackHours);

    const historyAdjusted = urgencyScore > rawUrgencyScore;

    const isFrog =
        task.importance >= FROG_THRESHOLD &&
        task.difficulty >= FROG_THRESHOLD;

    const frogScore = isFrog ? 100 : 0;

    // Effort isn't here: it already counts through slack (a long task has
    // to start sooner), which is where it belongs.
    const tieBreakHours =
        (task.importance / 10 * 0.4 +
            task.difficulty / 10 * 0.25 +
            task.consequence / 10 * 0.2 +
            (isFrog ? 0.15 : 0)) *
        MAX_TIE_BREAK_HOURS;

    // A future custom start date means the user literally can't start this
    // task yet, so it must never be auto-selected as Up Next/the frog, even
    // if its due-date urgency would otherwise dominate. This gates the
    // final score to 0 rather than touching the slack/tie-break weighting
    // documented in prioritizationModule.md's "Scoring rules" section.
    //
    // An already-overdue due date wins regardless: if a due date later
    // moves earlier than a previously-set startAt (e.g. via Canvas
    // re-sync), treating the task as "not yet startable" would hide
    // something now overdue — the opposite of the user's intent.
    const notYetStartable = Boolean(
        task.startAt &&
        task.today &&
        task.startAt > task.today &&
        !(task.due && task.due < task.today)
    );

    // Always > 0 for a startable task (slack ≤ MAX_SLACK_HOURS, tie-break
    // > 0), so 0 stays reserved for the start-date gate.
    const score = notYetStartable
        ? 0
        : MAX_SLACK_HOURS - slackHours + tieBreakHours;

    const isOverdue = Boolean(task.due) && hoursUntilDue(task.due as string, task.dueFraction, now) <= 0;

    const { mode, todayMinutes } = notYetStartable
        ? { mode: "finish" as const, todayMinutes: task.estimatedMinutes }
        : calculateMode(task, now);

    let reason = "";

    if (notYetStartable) {
        reason =
            "This task's start date hasn't arrived yet.";
    } else if (isOverdue) {
        reason =
            "This is overdue, so it needs attention now.";
    } else if (mode === "start") {
        const chunk = `${todayMinutes} min`;
        reason = task.inProgress
            ? `Keep going: ~${chunk} today keeps you on pace for the deadline.`
            : `It needs about ${formatHours(task.estimatedMinutes)} in total; ~${chunk} today keeps you on pace for the deadline.`;
        if (historyAdjusted) {
            reason += " You usually finish tasks like this close to the deadline, so it's paced to finish early.";
        }
    } else if (rawSlackHours <= 24) {
        reason = task.estimatedMinutes >= 60
            ? `It needs about ${formatHours(task.estimatedMinutes)} and is due soon, so finish it today.`
            : "This is due very soon, so it needs immediate attention.";
    } else if (historyAdjusted) {
        reason =
            "You've historically finished tasks like this close to the deadline, so it's prioritized earlier than the due date alone would suggest.";
    } else if (task.estimatedMinutes >= 90 && rawSlackHours <= 72) {
        reason =
            `It needs about ${formatHours(task.estimatedMinutes)} and there's no room to split it, so finish it before the deadline.`;
    } else if (isFrog) {
        reason =
            "This is a high-value, difficult task, making it a strong candidate for your Frog.";
    } else if (!task.due) {
        reason =
            "This has no due date, so it's ranked after your dated work.";
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
        notYetStartable,
        mode,
        todayMinutes,
    };
}
