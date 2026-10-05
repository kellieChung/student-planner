import { analyzeAssignments, estimateMinutesByType, resolveAssignmentType } from "./analyzeAssignment";
import { calculatePriority, type PriorityInput } from "./prioritization";
import { toDateKey } from "./utils";
import { adjustScoresForPoints, deterministicType, typeFromSubmissionTypes } from "./assignmentType";
import { selectTasksNeedingEstimates } from "./taskPlanning";

// "YYYY-MM-DD" for today + offsetDays, in local time.
function dateKeyFromToday(offsetDays: number): string {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    return toDateKey(date);
}

function check(label: string, ok: boolean) {
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
}

// Deterministic ranking rules (no AI needed) — see prioritizationModule.md.
function checkRankingRules() {
    console.log("\nRANKING RULES");

    const base: PriorityInput = {
        name: "Task",
        due: null,
        importance: 5,
        difficulty: 5,
        consequence: 5,
        estimatedMinutes: 30,
    };
    const score = (task: Partial<PriorityInput>) => calculatePriority({ ...base, ...task }).score;

    check(
        "same effort: due in 3 days beats due in 4 days, even if the later one rates higher",
        score({ due: dateKeyFromToday(3), importance: 4, difficulty: 3, consequence: 3 }) >
            score({ due: dateKeyFromToday(4), importance: 9, difficulty: 9, consequence: 9 })
    );
    check(
        "reported case: Mon discussion (20 min) beats Tue discussion mis-typed as an essay (120 min, rated higher)",
        score({ due: dateKeyFromToday(3), estimatedMinutes: 20, importance: 4, difficulty: 3, consequence: 3 }) >
            score({ due: dateKeyFromToday(4), estimatedMinutes: 120, importance: 9, difficulty: 8, consequence: 8 })
    );
    check(
        "10-min quiz due tomorrow beats a 3h exam due in 4 days",
        score({ due: dateKeyFromToday(1), estimatedMinutes: 10 }) >
            score({ due: dateKeyFromToday(4), estimatedMinutes: 180, importance: 9, difficulty: 9 })
    );
    check(
        "same due day and effort: the frog beats a trivial task",
        score({ due: dateKeyFromToday(2), importance: 8, difficulty: 8 }) >
            score({ due: dateKeyFromToday(2), importance: 2, difficulty: 2, consequence: 2 })
    );
    check(
        "a long task has to start sooner: 3h due midday beats 30 min due that evening",
        score({ due: dateKeyFromToday(3), dueFraction: 0.5, estimatedMinutes: 180 }) >
            score({ due: dateKeyFromToday(3), estimatedMinutes: 30 })
    );
    check(
        "due at 9am tomorrow beats due at end of tomorrow",
        score({ due: dateKeyFromToday(1), dueFraction: 0.375 }) >
            score({ due: dateKeyFromToday(1) })
    );
    check(
        "overdue beats due today",
        score({ due: dateKeyFromToday(-1) }) > score({ due: dateKeyFromToday(0) })
    );
    check(
        "a future start date gates the score to 0",
        score({ due: dateKeyFromToday(1), startAt: dateKeyFromToday(3), today: dateKeyFromToday(0) }) === 0
    );
    const result = (task: Partial<PriorityInput>) => calculatePriority({ ...base, ...task });
    const bigLater = result({ due: dateKeyFromToday(6), estimatedMinutes: 360 });
    check(
        "6h task due in 6 days is 'start' with a Pomodoro-sized chunk under the estimate",
        bigLater.mode === "start" && bigLater.todayMinutes % 25 === 0 && bigLater.todayMinutes < 360
    );
    const smallLater = result({ due: dateKeyFromToday(6), estimatedMinutes: 20 });
    check(
        "20-min task due in 6 days is 'finish' (one sitting)",
        smallLater.mode === "finish" && smallLater.todayMinutes === 20
    );
    check(
        "3h task due tomorrow is 'finish' (no room to split)",
        result({ due: dateKeyFromToday(1), estimatedMinutes: 180 }).mode === "finish"
    );
    check(
        "overdue 3h task is 'finish'",
        result({ due: dateKeyFromToday(-1), estimatedMinutes: 180 }).mode === "finish"
    );
    const undatedBig = result({ due: null, estimatedMinutes: 180 });
    check(
        "undated 3h task is 'start' with one Pomodoro",
        undatedBig.mode === "start" && undatedBig.todayMinutes === 25
    );
    check(
        "3h due in 3 days: 'start' normally, 'finish' when the student usually finishes at the deadline",
        result({ due: dateKeyFromToday(3), estimatedMinutes: 180 }).mode === "start" &&
            result({ due: dateKeyFromToday(3), estimatedMinutes: 180, procrastinationIndexHours: 0 }).mode === "finish"
    );
    check(
        "mode doesn't change the score",
        // Each call reads its own clock, so allow a moment's drift.
        Math.abs(bigLater.score - calculatePriority({ ...base, due: dateKeyFromToday(6), estimatedMinutes: 360, inProgress: true }).score) < 1e-3
    );

    const undated = score({ due: null });
    check(
        "an undated task has a finite score and ranks below a task due in 60 days",
        Number.isFinite(undated) && undated > 0 && undated < score({ due: dateKeyFromToday(60) })
    );

    check(
        "AI 'essay' on 'Week 5 Discussion' resolves to discussion (30 min)",
        resolveAssignmentType("essay", { name: "Week 5 Discussion" }) === "discussion" &&
            estimateMinutesByType("discussion") === 30
    );
    check(
        "AI 'discussion' on 'Exam Review Discussion' stays discussion",
        resolveAssignmentType("discussion", { name: "Exam Review Discussion" }) === "discussion"
    );
    check(
        "AI 'other' on 'Discussion 3' resolves to discussion",
        resolveAssignmentType("other", { name: "Discussion 3" }) === "discussion"
    );
    check(
        "AI 'essay' on 'Persuasive Essay Draft' stays essay",
        resolveAssignmentType("essay", { name: "Persuasive Essay Draft" }) === "essay"
    );

    console.log("\nNO-AI GATE");
    check(
        "Canvas discussion_topic → discussion",
        typeFromSubmissionTypes(["discussion_topic"], "Week 3") === "discussion"
    );
    check(
        "Canvas online_quiz named 'Midterm Exam' → exam; 'Practice Test' stays quiz",
        typeFromSubmissionTypes(["online_quiz"], "Midterm Exam") === "exam" &&
            typeFromSubmissionTypes(["online_quiz"], "Practice Test") === "quiz"
    );
    check(
        "Canvas online_upload says nothing (null)",
        typeFromSubmissionTypes(["online_upload"], "Unit 4") === null
    );
    check(
        "Canvas type beats a stored AI 'essay'",
        resolveAssignmentType("essay", { name: "Unit 4", canvasType: "discussion" }) === "discussion"
    );
    check(
        "'DISCUSS: Metabolism, Nutrition & Scientific Evidence 1️⃣' → discussion without AI",
        deterministicType({ name: "DISCUSS: Metabolism, Nutrition & Scientific Evidence 1️⃣" }) === "discussion"
    );
    check(
        "'Essay: Discuss the causes of WWI' → essay",
        deterministicType({ name: "Essay: Discuss the causes of WWI" }) === "essay"
    );
    check(
        "names matching conflicting types go to the AI: 'Exam Review Discussion', 'DISCUSS: Exam 2 prep'",
        deterministicType({ name: "Exam Review Discussion" }) === null &&
            deterministicType({ name: "DISCUSS: Exam 2 prep" }) === null
    );
    check(
        "classifier behavior unchanged: 'Homework 2: Derivatives Practice' still classifies as homework",
        resolveAssignmentType("other", { name: "Homework 2: Derivatives Practice" }) === "homework"
    );
    check(
        "an ambiguous name ('Unit 4 Submission') goes to the AI (null)",
        deterministicType({ name: "Unit 4 Submission" }) === null
    );
    const base4 = { importance: 4, difficulty: 3, consequence: 3 };
    check(
        "points: 3x the course median → +2; ⅓ → −1; unknown → unchanged",
        adjustScoresForPoints(base4, 300, 100).importance === 6 &&
            adjustScoresForPoints(base4, 30, 100).importance === 3 &&
            adjustScoresForPoints(base4, null, 100).importance === 4
    );

    const today = dateKeyFromToday(0);
    const task = (id: string, offset: number) => ({ id, name: id, course: "C", due: dateKeyFromToday(offset) });
    const selected = selectTasksNeedingEstimates(
        [task("done", 2), task("past", -1), task("far", 11), task("soon", 2), { ...task("undated", 0), due: "" }],
        {},
        { completedIds: new Set(["done"]), today }
    ).map((t) => t.id);
    check(
        "estimate selection skips completed, past-due, undated and > 10 days",
        selected.length === 1 && selected[0] === "soon"
    );
}

function demonstrateProcrastinationAdjustment() {
    const sharedTask = {
        name: "Weekly Reading Response",
        due: "2026-09-08",
        importance: 5,
        difficulty: 4,
        consequence: 4,
        estimatedMinutes: 30,
    };

    const withoutHistory = calculatePriority(sharedTask);

    const withChronicLateHistory = calculatePriority({
        ...sharedTask,
        // This student has historically finished "reading" tasks ~10 hours
        // AFTER the deadline, per lib/procrastinationHistory.ts.
        procrastinationIndexHours: -10,
    });

    console.log("\nPRIORITY WITHOUT HISTORY");
    console.log(JSON.stringify(withoutHistory, null, 2));

    console.log("\nPRIORITY WITH A CHRONIC-LATE HISTORY FOR THIS TASK TYPE");
    console.log(JSON.stringify(withChronicLateHistory, null, 2));
}

function demonstrateStartDateGate() {
    const today = "2026-09-14";

    const gated = calculatePriority({
        name: "Term Paper (not startable yet)",
        due: "2026-09-15",
        importance: 9,
        difficulty: 9,
        consequence: 8,
        estimatedMinutes: 180,
        startAt: "2026-09-20",
        today,
    });

    const ungatedOnceStartAtArrives = calculatePriority({
        name: "Term Paper (start date reached)",
        due: "2026-09-15",
        importance: 9,
        difficulty: 9,
        consequence: 8,
        estimatedMinutes: 180,
        startAt: "2026-09-14",
        today,
    });

    const overdueBeatsStaleStartAt = calculatePriority({
        name: "Missed Assignment (stale future startAt)",
        due: "2026-09-10",
        importance: 5,
        difficulty: 4,
        consequence: 4,
        estimatedMinutes: 30,
        startAt: "2026-09-20",
        today,
    });

    console.log("\nGATED (future startAt, expect score: 0, notYetStartable: true)");
    console.log(JSON.stringify(gated, null, 2));

    console.log("\nUNGATED (startAt === today, expect normal scoring)");
    console.log(JSON.stringify(ungatedOnceStartAtArrives, null, 2));

    console.log("\nOVERDUE BEATS STALE FUTURE startAt (expect notYetStartable: false)");
    console.log(JSON.stringify(overdueBeatsStaleStartAt, null, 2));
}

async function main() {
    checkRankingRules();
    demonstrateProcrastinationAdjustment();
    demonstrateStartDateGate();

    // Two assignments in one batch, to demonstrate/verify analyzeAssignments'
    // batched Ollama call (one round trip instead of two).
    const assignments = [
        {
            name: "British Literature Essay",
            course: "British Literature",
            description:
                "Write a 5-page analytical essay comparing the treatment of heroism in Beowulf and another literary work. Use textual evidence and MLA formatting.",
            due: "2026-09-04",
            pointsPossible: 100,
        },
        {
            name: "Chapter 4 Reading Quiz",
            course: "Intro Psychology",
            description:
                "Short online quiz covering the reading on classical and operant conditioning.",
            due: "2026-09-10",
            pointsPossible: 10,
        },
    ];

    const analyses =
        await analyzeAssignments(assignments);

    console.log("\nBATCHED AI ANALYSIS");
    console.log(
        JSON.stringify(analyses, null, 2)
    );

    for (let i = 0; i < assignments.length; i++) {
        const priority =
            calculatePriority({
                name: assignments[i].name,
                due: assignments[i].due,
                importance: analyses[i].importance,
                difficulty: analyses[i].difficulty,
                consequence: analyses[i].consequence,
                estimatedMinutes: estimateMinutesByType(analyses[i].assignmentType),
            });

        console.log(`\nPRIORITY: ${assignments[i].name}`);
        console.log(
            JSON.stringify(priority, null, 2)
        );
    }
}

main().catch(console.error);