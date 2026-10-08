import { computeWorkload, formatWorkload, upcomingDayKeys, workloadDayKey } from "./workload";

// Run under several zones, e.g.:
//   TZ=<zone> npx tsx lib/workload.test.ts
// Instants are built from local components, so every check holds in any zone.

function check(label: string, ok: boolean) {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
}

type Task = { id: string; due: string; dueAt?: string | null; minutes?: number };

const today = "2026-10-07";
const estimate = (task: Task) => task.minutes;

function localInstant(year: number, monthIndex: number, day: number, hours: number, minutes: number): string {
    return new Date(year, monthIndex, day, hours, minutes).toISOString();
}

function checkDayBucketing() {
    check(
        "11:59 PM local lands on that day, not the next",
        workloadDayKey({ due: "", dueAt: localInstant(2026, 9, 7, 23, 59) }) === "2026-10-07"
    );
    check(
        "12:00 AM local lands on the new day",
        workloadDayKey({ due: "", dueAt: localInstant(2026, 9, 8, 0, 0) }) === "2026-10-08"
    );
    check("date-only task keeps its due day", workloadDayKey({ due: "2026-10-09", dueAt: null }) === "2026-10-09");

    const load = computeWorkload(
        [{ id: "a", due: "", dueAt: localInstant(2026, 9, 7, 23, 59), minutes: 30 }],
        estimate,
        today
    );
    check("11:59 PM task counted on today's load", load.get("2026-10-07")?.taskCount === 1 && load.get("2026-10-08")?.taskCount === 0);
}

function checkWindow() {
    const keys = upcomingDayKeys(today);
    check("window is today..today+6", keys.length === 7 && keys[0] === today && keys[6] === "2026-10-13");

    const load = computeWorkload([{ id: "a", due: "2026-10-14", minutes: 300 }], estimate, today);
    check("today+7 excluded", !load.has("2026-10-14") && [...load.values()].every((day) => day.taskCount === 0));

    const dst = upcomingDayKeys("2026-10-29");
    const expected = ["2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"];
    check("window across Nov 1 DST change is 7 consecutive days", dst.join() === expected.join());
}

function checkThresholds() {
    const day = "2026-10-08";
    const run = (tasks: Task[]) => computeWorkload(tasks, estimate, today).get(day)!;

    check("exactly 180 min is heavy", run([{ id: "a", due: day, minutes: 180 }]).heavy);
    check(
        "179 min across 4 tasks is not heavy",
        !run([
            { id: "a", due: day, minutes: 60 },
            { id: "b", due: day, minutes: 60 },
            { id: "c", due: day, minutes: 30 },
            { id: "d", due: day, minutes: 29 },
        ]).heavy
    );

    const unestimated = run(Array.from({ length: 5 }, (_, i) => ({ id: `u${i}`, due: day })));
    check("5 unestimated tasks is heavy, 0 minutes", unestimated.heavy && unestimated.minutes === 0 && unestimated.taskCount === 5);

    const mixed = run([{ id: "a", due: day, minutes: 90 }, { id: "b", due: day }]);
    check("unestimated task adds to count only", mixed.taskCount === 2 && mixed.minutes === 90 && !mixed.heavy);
}

function checkFormat() {
    check("format with minutes", formatWorkload({ taskCount: 5, minutes: 200 }) === "5 tasks · ~3h 20m");
    check("format singular", formatWorkload({ taskCount: 1, minutes: 180 }) === "1 task · ~3h");
    check("format count only at 0 minutes", formatWorkload({ taskCount: 5, minutes: 0 }) === "5 tasks");
}

console.log(`TZ: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
checkDayBucketing();
checkWindow();
checkThresholds();
checkFormat();
