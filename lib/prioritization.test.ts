import { analyzeAssignments, estimateMinutesByType } from "./analyzeAssignment";
import { calculatePriority } from "./prioritization";

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