import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { analyzeAnnouncements } from "@/lib/ai/analyzeAnnouncement";
import { findDuplicateTasks } from "@/lib/ai/findDuplicateTask";
import { Announcement } from "@/types/announcement";
import { chunk, mapWithConcurrency } from "@/lib/concurrency";
import { getStartOfWeek, parseLocalDate } from "@/lib/utils";

// Days before the (Sunday) start of the current week that the window
// reaches back to — 4 days before a Sunday lands on the Wednesday of the
// prior week, matching how far in advance courses typically post an
// announcement about the coming week's work.
const ANNOUNCEMENT_BUFFER_DAYS = 4;

// Announcements analyzed per Ollama call. Each call resends the full
// instructional rules regardless of batch size, so batching cuts that
// fixed per-call cost proportionally across the batch.
const ANNOUNCEMENT_BATCH_SIZE = 5;
const OLLAMA_CONCURRENCY = 2;

/**
 * Resolves the announcement date window. Given valid `from`/`to`
 * (YYYY-MM-DD), uses that range verbatim (whole-day inclusive). Otherwise
 * reproduces the default automatic window:
 *
 * 4 days before the (Sunday) start of the current week — i.e. the
 * Wednesday of the prior week — through the end of Saturday.
 *
 * Example:
 *
 * Current week (Sunday-start, matching WeeklyPlannerView's own
 * "This week" — see lib/utils.ts's getStartOfWeek):
 * Sunday Aug 30
 * Saturday Sep 5
 *
 * Default window:
 * Wednesday Aug 26
 * through Saturday Sep 5
 *
 * Previously anchored to a Monday-start week instead — silently
 * disagreeing with the rest of the app (the planner grid itself is
 * Sunday-start) about which week is "current." Worst case was exactly
 * "today," a Sunday: a Monday-start week containing that Sunday is the
 * week that had *just ended*, not the one the planner was showing as
 * current, so the whole window pointed at the wrong 7-12 days. Fixed by
 * sharing lib/utils.ts's getStartOfWeek() instead of re-deriving "start of
 * week" a second, disagreeing way.
 *
 * `from`/`to` are parsed with lib/utils.ts's `parseLocalDate`, not
 * `new Date(str)` — the latter is UTC-based and would shift the boundary
 * by the server's local offset, silently mis-including/excluding
 * announcements right at the edge of the range.
 */
function resolveAnnouncementWindow(
    from: string | null,
    to: string | null
): { windowStart: Date; windowEnd: Date; isDefaultRange: boolean } {
    if (from && to) {
        const windowStart = parseLocalDate(from);
        windowStart.setHours(0, 0, 0, 0);

        const windowEnd = parseLocalDate(to);
        windowEnd.setHours(23, 59, 59, 999);

        if (
            !Number.isNaN(windowStart.getTime()) &&
            !Number.isNaN(windowEnd.getTime()) &&
            windowStart.getTime() <= windowEnd.getTime()
        ) {
            return { windowStart, windowEnd, isDefaultRange: false };
        }

        // Malformed/inverted range — fall through to the default rather
        // than 400ing; the only caller is this app's own UI, so a bad
        // value here is a defensive case, not a real input boundary.
    }

    const weekStart = getStartOfWeek();

    const windowStart = new Date(weekStart);

    windowStart.setDate(
        windowStart.getDate() -
            ANNOUNCEMENT_BUFFER_DAYS
    );

    windowStart.setHours(0, 0, 0, 0);

    const windowEnd = new Date(weekStart);

    windowEnd.setDate(
        windowEnd.getDate() + 6
    );

    windowEnd.setHours(
        23,
        59,
        59,
        999
    );

    return { windowStart, windowEnd, isDefaultRange: true };
}

function isWithinRange(
    postedAt: string,
    windowStart: Date,
    windowEnd: Date
): boolean {
    const postedTime = new Date(postedAt).getTime();

    if (Number.isNaN(postedTime)) {
        return false;
    }

    return (
        postedTime >= windowStart.getTime() &&
        postedTime <= windowEnd.getTime()
    );
}

/**
 * Determines whether an assignment is reasonably
 * close to the announcement.
 *
 * This keeps duplicate checking from comparing an
 * announcement against completely unrelated assignments.
 */
function isWithinOneMonth(
    assignmentDate: string | null,
    announcementDate: string
): boolean {
    if (!assignmentDate) {
        return true;
    }

    const assignmentTime =
        new Date(assignmentDate).getTime();

    const announcementTime =
        new Date(announcementDate).getTime();

    if (
        Number.isNaN(assignmentTime) ||
        Number.isNaN(announcementTime)
    ) {
        return false;
    }

    const ONE_MONTH =
        31 * 24 * 60 * 60 * 1000;

    return (
        assignmentTime >=
            announcementTime - ONE_MONTH &&
        assignmentTime <=
            announcementTime + ONE_MONTH
    );
}

export async function POST(
    request: Request
) {
    try {
        // --------------------------------------------------
        // 1. Authenticate
        // --------------------------------------------------

        const session = await auth();

        if (!session?.user?.email) {
            return NextResponse.json(
                {
                    success: false,
                    error: "You must be logged in.",
                },
                { status: 401 }
            );
        }

        // --------------------------------------------------
        // 2. Find current user
        // --------------------------------------------------

        const user =
            await prisma.user.findUnique({
                where: {
                    email: session.user.email,
                },
            });

        if (!user) {
            return NextResponse.json(
                {
                    success: false,
                    error: "User not found.",
                },
                { status: 404 }
            );
        }

        // --------------------------------------------------
        // 3. Read optional custom selection / range / dry-run flag
        // --------------------------------------------------

        let selectedAnnouncementIds:
            | string[]
            | null = null;

        let dryRun = false;
        let rangeFrom: string | null = null;
        let rangeTo: string | null = null;

        try {
            const body =
                await request.json();

            if (
                Array.isArray(
                    body?.selectedAnnouncementIds
                )
            ) {
                selectedAnnouncementIds =
                    body.selectedAnnouncementIds.filter(
                        (
                            id: unknown
                        ): id is string =>
                            typeof id ===
                            "string"
                    );
            }

            if (body?.dryRun === true) {
                dryRun = true;
            }

            if (
                typeof body?.from === "string" &&
                typeof body?.to === "string"
            ) {
                rangeFrom = body.from;
                rangeTo = body.to;
            }
        } catch {
            // No body = automatic mode, default range.
        }

        const isCustomSelection =
            selectedAnnouncementIds !== null;

        // --------------------------------------------------
        // 4. Get Canvas data
        // --------------------------------------------------

        const courses =
            await prisma.canvasCourse.findMany({
                where: {
                    userId: user.id,
                    hidden: false,
                },
                include: {
                    announcements: true,
                    assignments: true,
                },
            });

        // --------------------------------------------------
        // 5. Convert announcements
        // --------------------------------------------------

        const allAnnouncements: Announcement[] =
            courses.flatMap((course) =>
                course.announcements.map(
                    (announcement) => ({
                        id: announcement.id,
                        title:
                            announcement.title,
                        message:
                            announcement.message ??
                            "",
                        course:
                            course.displayName ??
                            course.name,
                        postedAt:
                            announcement.postedAt
                                ?.toISOString() ??
                            "",
                    })
                )
            );

        // --------------------------------------------------
        // 6. Select announcements
        // --------------------------------------------------

        let announcements: Announcement[];

        // Populated in the automatic-mode branch below; stays null for
        // custom selection (no date window applies there). Carried through
        // to the dry-run short-circuit and the final response's `filtering`
        // field.
        let resolvedWindow:
            | { windowStart: Date; windowEnd: Date; isDefaultRange: boolean }
            | null = null;

        if (isCustomSelection) {
            // ----------------------------------------------
            // CUSTOM MODE
            //
            // Explicit user selection always wins.
            // ----------------------------------------------

            announcements =
                allAnnouncements.filter(
                    (announcement) =>
                        selectedAnnouncementIds!.includes(
                            announcement.id
                        )
                );

            console.log(
                `🎯 Custom announcement selection: ${announcements.length} selected`
            );
        } else {
            // ----------------------------------------------
            // AUTOMATIC MODE
            //
            // Defaults to the current week + 5-day early buffer; a
            // caller-supplied from/to range (see step 3) overrides it.
            // ----------------------------------------------

            resolvedWindow = resolveAnnouncementWindow(rangeFrom, rangeTo);

            announcements =
                allAnnouncements.filter(
                    (announcement) =>
                        isWithinRange(
                            announcement.postedAt,
                            resolvedWindow!.windowStart,
                            resolvedWindow!.windowEnd
                        )
                );

            console.log(
                `🤖 Automatic announcement filter: ${announcements.length}/${allAnnouncements.length} selected`
            );

            console.log(
                `📅 Window (${resolvedWindow.isDefaultRange ? "default" : "custom"}): ${resolvedWindow.windowStart.toLocaleDateString()} → ${resolvedWindow.windowEnd.toLocaleDateString()}`
            );
        }

        // --------------------------------------------------
        // 7. Sort newest first
        // --------------------------------------------------

        announcements.sort((a, b) => {
            const aTime =
                new Date(
                    a.postedAt
                ).getTime();

            const bTime =
                new Date(
                    b.postedAt
                ).getTime();

            return bTime - aTime;
        });

        // --------------------------------------------------
        // 7b. Dry run — preview the count/list with zero AI cost
        // --------------------------------------------------

        if (dryRun) {
            return NextResponse.json({
                success: true,
                dryRun: true,

                announcementCount: announcements.length,
                totalAnnouncementCount: allAnnouncements.length,

                filtering: {
                    mode: isCustomSelection ? "custom" : "automatic",
                    bufferDays: ANNOUNCEMENT_BUFFER_DAYS,
                    rangeStart: resolvedWindow?.windowStart.toISOString() ?? null,
                    rangeEnd: resolvedWindow?.windowEnd.toISOString() ?? null,
                    isDefaultRange: resolvedWindow?.isDefaultRange ?? null,
                },

                results: [],

                // Slim on purpose — no `message` — a count/list preview
                // doesn't need full announcement bodies, and shipping them
                // on every preset change works against the point of a dry
                // run (minimizing load, not just AI cost).
                preview: announcements.map((announcement) => ({
                    id: announcement.id,
                    title: announcement.title,
                    course: announcement.course,
                    postedAt: announcement.postedAt,
                })),
            });
        }

        // --------------------------------------------------
        // 8. Analyze announcements
        // --------------------------------------------------

        function toAnnouncementSummary(announcement: Announcement) {
            return {
                id: announcement.id,
                title: announcement.title,
                course: announcement.course,
                postedAt: announcement.postedAt,
                message: announcement.message,
            };
        }

        function nearbyAssignmentsFor(announcement: Announcement) {
            // announcement.course is the resolved display name (step 5
            // above), not the raw Canvas name — join on the same
            // resolution so this still finds the right course once a
            // displayName override is set.
            const course = courses.find(
                (course) => (course.displayName ?? course.name) === announcement.course
            );

            const courseAssignments = course?.assignments ?? [];

            return courseAssignments
                .filter((assignment) =>
                    isWithinOneMonth(
                        assignment.dueAt?.toISOString() ?? null,
                        announcement.postedAt
                    )
                )
                .map((assignment) => ({
                    id: assignment.id,
                    name: assignment.name,
                    description: assignment.description,
                    dueDate:
                        assignment.dueAt
                            ?.toISOString()
                            .slice(0, 10) ?? null,
                }));
        }

        const announcementBatches = chunk(
            announcements,
            ANNOUNCEMENT_BATCH_SIZE
        );

        const resultsByBatch = await mapWithConcurrency(
            announcementBatches,
            OLLAMA_CONCURRENCY,
            async (batch) => {
                let proposedTasksByAnnouncement;

                try {
                    console.log(
                        `🤖 Analyzing ${batch.length} announcement(s): ${batch.map((a) => `"${a.title}"`).join(", ")}`
                    );

                    proposedTasksByAnnouncement =
                        await analyzeAnnouncements(batch);
                } catch (error) {
                    console.error(
                        "❌ Failed to analyze announcement batch:",
                        error
                    );

                    return batch.map((announcement) => ({
                        announcement: toAnnouncementSummary(announcement),
                        tasks: [],
                        error: "Failed to analyze announcement.",
                    }));
                }

                // Suggestions already accepted/rejected shouldn't
                // resurface on a later automatic-mode run. Custom mode
                // (an explicit re-selection of these announcements)
                // still shows them — the user asked to re-review.
                // Skipped for the duplicate check too, saving that
                // second Ollama call's cost.
                let alreadyDecidedKeys = new Set<string>();

                if (!isCustomSelection) {
                    const reviews =
                        await prisma.announcementSuggestionReview.findMany({
                            where: {
                                userId: user.id,
                                sourceAnnouncementId: {
                                    in: batch.map((a) => a.id),
                                },
                            },
                            select: {
                                sourceAnnouncementId: true,
                                suggestionKey: true,
                            },
                        });

                    alreadyDecidedKeys = new Set(
                        reviews.map(
                            (r) => `${r.sourceAnnouncementId}::${r.suggestionKey}`
                        )
                    );
                }

                // Bounded to 1: each batch worker's duplicate checks run
                // strictly one-at-a-time, so combined with the outer
                // mapWithConcurrency's OLLAMA_CONCURRENCY cap on concurrent
                // batches, total concurrent local Ollama duplicate-check
                // calls across the whole request stay at OLLAMA_CONCURRENCY
                // — previously unbounded here (up to
                // ANNOUNCEMENT_BATCH_SIZE per batch on top of
                // OLLAMA_CONCURRENCY concurrent batches), which is what was
                // overloading the local Ollama server and causing the
                // duplicate-check timeouts.
                return mapWithConcurrency(
                    batch.map((announcement, i) => ({ announcement, i })),
                    1,
                    async ({ announcement, i }) => {
                        const proposedTasks = proposedTasksByAnnouncement[
                            i
                        ].filter(
                            (task) =>
                                !alreadyDecidedKeys.has(
                                    `${task.sourceAnnouncementId}::${task.suggestionKey}`
                                )
                        );

                        const nearbyAssignments =
                            nearbyAssignmentsFor(announcement);

                        console.log(
                            `🔎 ${nearbyAssignments.length} nearby assignments for "${announcement.title}"`
                        );

                        let tasksWithDuplicates;

                        try {
                            const duplicateChecks =
                                await findDuplicateTasks(
                                    proposedTasks.map((task) => task.name),
                                    nearbyAssignments
                                );

                            tasksWithDuplicates = proposedTasks.map(
                                (task, taskIndex) => {
                                    const duplicateCheck =
                                        duplicateChecks[taskIndex];

                                    const matchedAssignment =
                                        duplicateCheck.matchingAssignmentId
                                            ? nearbyAssignments.find(
                                                  (assignment) =>
                                                      assignment.id ===
                                                      duplicateCheck.matchingAssignmentId
                                              ) ?? null
                                            : null;

                                    console.log(
                                        `🔍 "${task.name}" →`,
                                        duplicateCheck
                                    );

                                    const status =
                                        duplicateCheck.checkStatus === "degraded"
                                            ? "unavailable"
                                            : duplicateCheck.isDuplicate
                                            ? duplicateCheck.confidence === "high"
                                                ? "definite"
                                                : "possible"
                                            : "none";

                                    return {
                                        ...task,
                                        canvasMatch: {
                                            status,
                                            assignmentId:
                                                duplicateCheck.matchingAssignmentId,
                                            reason: duplicateCheck.reason,
                                            assignment: matchedAssignment,
                                        },
                                    };
                                }
                            );
                        } catch (error) {
                            console.error(
                                `❌ Duplicate check failed for announcement "${announcement.title}":`,
                                error
                            );

                            // Do NOT let a malformed Ollama response
                            // destroy the entire announcement.
                            tasksWithDuplicates = proposedTasks.map((task) => ({
                                ...task,
                                canvasMatch: {
                                    status: "unavailable",
                                    assignmentId: null,
                                    reason: "Duplicate checking failed.",
                                    assignment: null,
                                },
                            }));
                        }

                        return {
                            announcement: toAnnouncementSummary(announcement),
                            tasks: tasksWithDuplicates,
                        };
                    }
                );
            }
        );

        const results = resultsByBatch.flat();

        // --------------------------------------------------
        // 9. Return results
        // --------------------------------------------------

        return NextResponse.json({
            success: true,

            announcementCount:
                announcements.length,

            totalAnnouncementCount:
                allAnnouncements.length,

            filtering: {
                mode: isCustomSelection
                    ? "custom"
                    : "automatic",

                bufferDays:
                    ANNOUNCEMENT_BUFFER_DAYS,

                rangeStart: resolvedWindow?.windowStart.toISOString() ?? null,
                rangeEnd: resolvedWindow?.windowEnd.toISOString() ?? null,
                isDefaultRange: resolvedWindow?.isDefaultRange ?? null,
            },

            results,
        });
    } catch (error) {
        console.error(
            "❌ Announcement analysis failed:",
            error
        );

        return NextResponse.json(
            {
                success: false,
                error:
                    "Failed to analyze announcements.",
            },
            { status: 500 }
        );
    }
}