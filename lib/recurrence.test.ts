import { expandOccurrences, describeRecurrenceRule, RecurrenceRule } from "./recurrence";

function demonstrateDaily() {
    const rule: RecurrenceRule = {
        frequency: "daily",
        interval: 2,
        weekdays: [],
        startDate: "2026-09-01",
        endDate: null,
    };

    console.log("\nDAILY, every 2 days, 2026-09-01 .. 2026-09-10");
    console.log(expandOccurrences(rule, "2026-09-01", "2026-09-10"));
    console.log(describeRecurrenceRule(rule));
}

function demonstrateWeekly() {
    const rule: RecurrenceRule = {
        frequency: "weekly",
        interval: 2,
        weekdays: [1, 3, 5], // Mon/Wed/Fri
        startDate: "2026-09-01", // a Tuesday
        endDate: "2026-10-15",
    };

    console.log("\nWEEKLY, every 2 weeks on Mon/Wed/Fri, 2026-09-01 .. 2026-10-15");
    console.log(expandOccurrences(rule, "2026-09-01", "2026-10-31"));
    console.log(describeRecurrenceRule(rule));
}

function demonstrateMonthly() {
    const rule: RecurrenceRule = {
        frequency: "monthly",
        interval: 1,
        weekdays: [],
        startDate: "2026-01-31",
        endDate: null,
    };

    console.log("\nMONTHLY, every month anchored on the 31st (clamp test), Jan .. Jun 2026");
    console.log(expandOccurrences(rule, "2026-01-01", "2026-06-30"));
    console.log(describeRecurrenceRule(rule));
}

demonstrateDaily();
demonstrateWeekly();
demonstrateMonthly();
