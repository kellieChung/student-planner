import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { analyzeAnnouncements, getAnnouncementBatchSize } from "@/lib/ai/analyzeAnnouncement";
import {
    CanvasAssignment,
    DuplicateCheckResult,
    findDuplicateTasksForBatch,
} from "@/lib/ai/findDuplicateTask";
import { computeAnnouncementContentHash } from "@/lib/suggestionKey";
import { Announcement } from "@/types/announcement";
import { ProposedTask } from "@/types/proposedTask";
import { chunk, mapWithConcurrency } from "@/lib/concurrency";
import { getStartOfWeek, parseLocalDate } from "@/lib/utils";
import {
    consumeDetectionCheck,
    findRunAnnouncementIds,
    getDetectionQuota,
    isRunPaused,
} from "@/lib/aiRateLimit";
import { MAX_ANNOUNCEMENTS_PER_CHECK } from "@/lib/analysisLimits";
import { logAiTaskEvent } from "@/lib/aiTaskEvents";
import { classifyAutoAction } from "@/lib/rundownAutoAccept";

// Days before the (Sunday) start of the current week that the window
// reaches back to — 4 days before a Sunday lands on the Wednesday of the
// prior week, matching how far in advance courses typically post an
// announcement about the coming week's work.
const ANNOUNCEMENT_BUFFER_DAYS = 4;

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

// "unresolved": the model flagged a likely duplicate but returned an
// unresolvable match number (lib/ai/findDuplicateTask.ts's
// uncertainDuplicateResult, the only producer of isDuplicate:true with a
// null matchingAssignmentId) — routed to the rundown as its own case per
// AutoTaskCreation.md step 3, rather than collapsed into "possible".
function withCanvasMatch(
    task: ProposedTask,
    duplicateCheck: DuplicateCheckResult,
    courseAssignments: CanvasAssignment[]
): ProposedTask {
    const status =
        duplicateCheck.checkStatus === "degraded"
            ? "unavailable"
            : duplicateCheck.isDuplicate
            ? duplicateCheck.matchingAssignmentId === null
                ? "unresolved"
                : duplicateCheck.confidence === "high"
                ? "definite"
                : "possible"
            : "none";

    return {
        ...task,
        canvasMatch: {
            status,
            checkConfidence: duplicateCheck.confidence,
            assignmentId: duplicateCheck.matchingAssignmentId,
            reason: duplicateCheck.reason,
            assignment:
                courseAssignments.find(
                    (assignment) => assignment.id === duplicateCheck.matchingAssignmentId
                ) ?? null,
        },
    };
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

        // Captured once, outside any closure: TypeScript's null-narrowing
        // of `user` above doesn't carry into the `finalizeCandidates`
        // function declaration defined later in this handler (a hoisted
        // declaration, unlike an inline arrow callback), so every use
        // inside it goes through this instead of `user.id`.
        const userId = user.id;

        // --------------------------------------------------
        // 3. Read optional custom selection / range / dry-run flag
        // --------------------------------------------------

        let selectedAnnouncementIds:
            | string[]
            | null = null;

        let dryRun = false;
        let rangeFrom: string | null = null;
        let rangeTo: string | null = null;
        let regenerate = false;
        let runId: string | null = null;
        let resumeRunId: string | null = null;

        // Anything the pause route's isRunPaused() compares against — a
        // client-generated id, so bounded rather than trusted.
        const readRunId = (value: unknown): string | null =>
            typeof value === "string" && value.length > 0 && value.length <= 64 ? value : null;

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

            if (body?.regenerate === true) {
                regenerate = true;
            }

            runId = readRunId(body?.runId);
            resumeRunId = readRunId(body?.resumeRunId);

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

        // A resumed run continues exactly what the original check was
        // charged for, whatever range/selection this request carries — so
        // pausing and resuming can't be used to analyze past the per-check
        // cap.
        const resumedIds = resumeRunId
            ? await findRunAnnouncementIds(user.id, resumeRunId)
            : null;

        if (resumedIds) {
            selectedAnnouncementIds = resumedIds;
        }

        const isCustomSelection =
            selectedAnnouncementIds !== null;

        // A resume continues a paused run, so it must go through the normal
        // already-analyzed skip — regenerating again would redo everything
        // the paused run already finished.
        const forceReanalyze = regenerate && resumeRunId === null;

        // A pause aimed at an earlier request must not stop this one.
        const requestStartedAt = new Date();

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

        // Current content hash vs. the hash stored at the last successful
        // analysis — see step 7a.
        const analysisHashes = new Map<string, { current: string; stored: string | null }>(
            courses.flatMap((course) =>
                course.announcements.map((announcement) => [
                    announcement.id,
                    {
                        current: computeAnnouncementContentHash(
                            announcement.title,
                            announcement.message ?? ""
                        ),
                        stored: announcement.aiAnalyzedHash,
                    },
                ])
            )
        );

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
        // 7a. Skip already-analyzed announcements — the biggest cost
        // lever: overlapping windows across runs used to re-extract and
        // re-dup-check the same unchanged text every time, even though
        // every candidate from it already persists in
        // AnnouncementSuggestionReview. An announcement analyzed before
        // aiAnalyzedHash existed (null hash, but it already has review
        // rows) is backfilled rather than re-run: a re-run with the
        // current prompt/batching can word a task differently, giving it
        // a new suggestionKey and resurfacing something the user already
        // said No to.
        // --------------------------------------------------

        const backfillIds: string[] = [];
        const selectedCount = announcements.length;

        // Regenerate deliberately re-runs announcements that were already
        // analyzed (and skips the legacy backfill, which would mark them
        // analyzed without ever checking them).
        if (!forceReanalyze) {
            const legacyReviewed = new Set(
                (
                    await prisma.announcementSuggestionReview.findMany({
                        where: {
                            userId: user.id,
                            sourceAnnouncementId: {
                                in: announcements
                                    .filter((a) => analysisHashes.get(a.id)?.stored == null)
                                    .map((a) => a.id),
                            },
                        },
                        select: { sourceAnnouncementId: true },
                        distinct: ["sourceAnnouncementId"],
                    })
                ).map((review) => review.sourceAnnouncementId)
            );

            announcements = announcements.filter((announcement) => {
                const hashes = analysisHashes.get(announcement.id);

                if (hashes?.stored === hashes?.current) {
                    return false;
                }

                if (hashes?.stored == null && legacyReviewed.has(announcement.id)) {
                    backfillIds.push(announcement.id);
                    return false;
                }

                return true;
            });
        }

        const alreadyAnalyzedCount = selectedCount - announcements.length;

        // Per-check cap (a cost guard, see lib/analysisLimits.ts). An
        // explicit selection over the cap is a client bug/abuse → 400; an
        // automatic range just takes the newest announcements (already
        // sorted newest-first above) and leaves the rest for a later check.
        const eligibleCount = announcements.length;

        if (!dryRun && isCustomSelection && eligibleCount > MAX_ANNOUNCEMENTS_PER_CHECK) {
            return NextResponse.json(
                {
                    success: false,
                    error: `A check can analyze at most ${MAX_ANNOUNCEMENTS_PER_CHECK} announcements — select fewer.`,
                },
                { status: 400 }
            );
        }

        if (!dryRun) {
            announcements = announcements.slice(0, MAX_ANNOUNCEMENTS_PER_CHECK);
        }

        async function markAnalyzed(announcementIds: string[]) {
            await Promise.all(
                announcementIds.map((id) =>
                    prisma.announcement.updateMany({
                        where: { id, userId },
                        data: { aiAnalyzedHash: analysisHashes.get(id)?.current ?? null },
                    })
                )
            );
        }

        if (!dryRun && backfillIds.length > 0) {
            await markAnalyzed(backfillIds);
        }

        console.log(
            `⏭️ Skipping ${alreadyAnalyzedCount} already-analyzed announcement(s); ${announcements.length} new`
        );

        // --------------------------------------------------
        // 7b. Dry run — preview the count/list with zero AI cost
        // --------------------------------------------------

        if (dryRun) {
            return NextResponse.json({
                success: true,
                dryRun: true,

                announcementCount: announcements.length,
                maxPerCheck: MAX_ANNOUNCEMENTS_PER_CHECK,
                alreadyAnalyzedCount,
                // Everything in the range, analyzed or not — what a
                // regenerate would re-run.
                inRangeCount: selectedCount,
                totalAnnouncementCount: allAnnouncements.length,
                quota: await getDetectionQuota(userId),

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
        // 7c. Rate limit — a real (non-dry-run) run is a real Anthropic/
        // Ollama cost, capped at 2 checks/week per user (see
        // AutoTaskCreation.md) plus any bonus credits granted from the dev
        // dashboard. Placed after the dry-run short-circuit above so a
        // date-range preview never consumes or is blocked by the quota.
        // --------------------------------------------------

        // Nothing to analyze means no model call at all, so it shouldn't
        // spend a check either. A resumed run is free (see
        // consumeDetectionCheck). The charge is logged before the streaming
        // Response is returned below, so an attempt counts even if the
        // client disconnects mid-stream (cost control is the intent).
        const hasWork = announcements.length > 0;

        const consumed = hasWork
            ? await consumeDetectionCheck(userId, {
                  runId: runId ?? undefined,
                  resumeRunId: resumeRunId ?? undefined,
                  data: {
                      mode: isCustomSelection ? "custom" : "automatic",
                      rangeFrom,
                      rangeTo,
                      regenerate: forceReanalyze,
                      announcementIds: announcements.map((a) => a.id),
                      eligibleCount,
                  },
              })
            : null;

        const quota = consumed?.quota ?? (await getDetectionQuota(userId));

        if (consumed && !consumed.allowed) {
            return NextResponse.json(
                {
                    success: false,
                    error: "You're out of announcement checks.",
                    resetsAt: quota.resetsAt,
                    quota,
                },
                { status: 429 }
            );
        }

        const plannerSettings = await prisma.plannerSettings.findUnique({
            where: { userId: user.id },
            select: { autoAcceptAiTasks: true },
        });

        const autoAcceptEnabled = plannerSettings?.autoAcceptAiTasks ?? false;

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
            getAnnouncementBatchSize()
        );

        // --------------------------------------------------
        // Persists every detected candidate (AutoTaskCreation.md's rundown
        // model requires a "pending" candidate to survive between
        // sessions, not just accepted/rejected ones) and, when
        // autoAcceptEnabled, applies the auto-accept setting: a
        // high-confidence non-duplicate is inserted directly as a real
        // CustomTask and excluded from the stream; a high-confidence
        // duplicate is suppressed and excluded; everything else is
        // persisted as "pending" and included. Shared by both the normal
        // and duplicate-check-failed paths below so the persistence
        // behavior can't drift between them.
        // --------------------------------------------------

        async function finalizeCandidates(
            sourceAnnouncementId: string,
            tasks: ProposedTask[]
        ): Promise<ProposedTask[]> {
            const visibleTasks: ProposedTask[] = [];

            for (const task of tasks) {
                const action = autoAcceptEnabled
                    ? classifyAutoAction(task)
                    : "surface";

                if (action === "auto-suppress") {
                    await prisma.announcementSuggestionReview.upsert({
                        where: {
                            userId_sourceAnnouncementId_suggestionKey: {
                                userId,
                                sourceAnnouncementId,
                                suggestionKey: task.suggestionKey,
                            },
                        },
                        create: {
                            userId,
                            sourceAnnouncementId,
                            suggestionKey: task.suggestionKey,
                            status: "rejected",
                            resolvedAt: new Date(),
                            taskSnapshot: task,
                        },
                        update: {
                            status: "rejected",
                            resolvedAt: new Date(),
                            taskSnapshot: task,
                        },
                    });

                    try {
                        await logAiTaskEvent(userId, "candidate_decided", {
                            sourceAnnouncementId,
                            suggestionKey: task.suggestionKey,
                            data: { decision: "rejected", auto: true },
                        });
                    } catch (error) {
                        console.error("❌ Failed to log auto-suppress:", error);
                    }

                    continue;
                }

                if (action === "auto-insert") {
                    await prisma.announcementSuggestionReview.upsert({
                        where: {
                            userId_sourceAnnouncementId_suggestionKey: {
                                userId,
                                sourceAnnouncementId,
                                suggestionKey: task.suggestionKey,
                            },
                        },
                        create: {
                            userId,
                            sourceAnnouncementId,
                            suggestionKey: task.suggestionKey,
                            status: "accepted",
                            resolvedAt: new Date(),
                            taskSnapshot: task,
                        },
                        update: {
                            status: "accepted",
                            resolvedAt: new Date(),
                            taskSnapshot: task,
                        },
                    });

                    // Same "custom-ai-<timestamp>-<suffix>" id convention
                    // as a manual Yes on the Rundown screen (see
                    // components/WeeklyPlannerView.tsx's handleAIPlannerTask/
                    // handleRundownYes), so every existing
                    // id.startsWith("custom-") call site treats an
                    // auto-inserted task identically to a manually-accepted
                    // one.
                    const customTaskId = `custom-ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

                    await prisma.customTask.create({
                        data: {
                            id: customTaskId,
                            name: task.name,
                            course: task.course,
                            due: task.due,
                            sourceAnnouncementId,
                            userId,
                        },
                    });

                    if (task.typeOverride) {
                        await prisma.taskCustomization.upsert({
                            where: {
                                userId_taskId: {
                                    userId,
                                    taskId: customTaskId,
                                },
                            },
                            create: {
                                userId,
                                taskId: customTaskId,
                                typeOverride: task.typeOverride,
                            },
                            update: { typeOverride: task.typeOverride },
                        });
                    }

                    try {
                        await logAiTaskEvent(userId, "candidate_decided", {
                            sourceAnnouncementId,
                            suggestionKey: task.suggestionKey,
                            taskId: customTaskId,
                            data: { decision: "accepted", auto: true },
                        });
                    } catch (error) {
                        console.error("❌ Failed to log auto-insert:", error);
                    }

                    continue;
                }

                // "surface": persist as pending on create only — the
                // update branch never touches `status`, so a re-run can't
                // downgrade an already-decided row back to pending (also
                // unreachable here for maybe/accepted/rejected rows,
                // already filtered out of `tasks` by alreadyDecidedKeys
                // below).
                await prisma.announcementSuggestionReview.upsert({
                    where: {
                        userId_sourceAnnouncementId_suggestionKey: {
                            userId,
                            sourceAnnouncementId,
                            suggestionKey: task.suggestionKey,
                        },
                    },
                    create: {
                        userId,
                        sourceAnnouncementId,
                        suggestionKey: task.suggestionKey,
                        status: "pending",
                        taskSnapshot: task,
                    },
                    update: { taskSnapshot: task },
                });

                visibleTasks.push(task);
            }

            return visibleTasks;
        }

        // --------------------------------------------------
        // From here on, this route deliberately deviates from the
        // try{}catch{return NextResponse.json(...)} shape documented in
        // CLAUDE.md: a batch of announcements can take a while (each is an
        // Anthropic/Ollama call plus a duplicate check), and streaming each
        // batch's result to the client as it resolves — instead of only
        // after every batch finishes — is what lets the review UI show
        // suggestions as soon as they're ready and show real progress
        // otherwise. Once `new Response(stream, ...)` is returned below,
        // response headers are already committed, so the outer try/catch
        // wrapping this whole handler can no longer fall back to a JSON
        // error response for anything that happens inside the stream — the
        // stream's own start() has its own try/catch/finally for exactly
        // that reason, and reports failure as a data frame instead.
        //
        // This is intentionally still ONE request, not one client-issued
        // POST per batch: OLLAMA_CONCURRENCY (2) on this outer loop, plus
        // the deliberate concurrency-1 cap on the nested per-announcement
        // duplicate-check loop below, exists specifically to bound total
        // concurrent local Ollama calls system-wide — see the 2026-09-07
        // PROGRESS.md entry on the duplicate-check timeout cascade that cap
        // fixed. N independent client-driven requests would each get their
        // own concurrency pool server-side and silently reintroduce that
        // exact bug.
        // --------------------------------------------------

        const encoder = new TextEncoder();

        // Set when the client disconnects. In-flight batches still finish
        // and persist (the spend is already committed), but no new ones start.
        let cancelled = false;
        let paused = false;

        const controlRunId = runId ?? resumeRunId;

        // Checked before each batch starts (see mapWithConcurrency). Pause is
        // cooperative: the client POSTs to .../pause, which logs an event this
        // reads, so in-flight batches finish and stream their results instead
        // of being cut off mid-call.
        async function shouldStopLaunching(): Promise<boolean> {
            if (cancelled || paused) {
                return true;
            }

            if (controlRunId) {
                paused = await isRunPaused(userId, controlRunId, requestStartedAt);
            }

            return paused;
        }

        const stream = new ReadableStream({
            async start(controller) {
                function send(frame: Record<string, unknown>) {
                    if (cancelled) {
                        return;
                    }

                    try {
                        controller.enqueue(
                            encoder.encode(JSON.stringify(frame) + "\n")
                        );
                    } catch {
                        cancelled = true;
                    }
                }

                try {
                    send({
                        type: "start",
                        totalAnnouncements: announcements.length,
                        totalBatches: announcementBatches.length,
                        quota,
                    });

                    let completedAnnouncements = 0;

                    await mapWithConcurrency(
                        announcementBatches,
                        OLLAMA_CONCURRENCY,
                        async (batch) => {
                            let analysisByAnnouncement;

                            try {
                                console.log(
                                    `🤖 Analyzing ${batch.length} announcement(s): ${batch.map((a) => `"${a.title}"`).join(", ")}`
                                );

                                analysisByAnnouncement =
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

                            // A candidate already accepted/rejected/maybe'd
                            // must never re-enter the pipeline, in EITHER
                            // mode — "maybe" lives only in the Still-
                            // Deciding surface, not back in this stream,
                            // and an already-decided item flowing back
                            // through here would let auto-accept (when on)
                            // silently re-decide it, flipping a user's
                            // explicit "No" into an auto-inserted task with
                            // zero visibility. This used to be skipped only
                            // for automatic-mode runs, on the theory that
                            // custom mode's explicit re-selection was an
                            // implicit "let me re-review" — but that
                            // shortcut predates auto-accept and is no
                            // longer safe to take. A "pending" row (or no
                            // row at all) is exactly what should re-stream,
                            // so it isn't skipped here. Checked unconditionally
                            // now, which also saves the duplicate-check
                            // call's cost for custom-mode reruns.
                            const reviews =
                                await prisma.announcementSuggestionReview.findMany({
                                    where: {
                                        userId: user.id,
                                        sourceAnnouncementId: {
                                            in: batch.map((a) => a.id),
                                        },
                                        status: { in: ["accepted", "rejected", "maybe"] },
                                    },
                                    select: {
                                        sourceAnnouncementId: true,
                                        suggestionKey: true,
                                    },
                                });

                            const alreadyDecidedKeys = new Set(
                                reviews.map(
                                    (r) => `${r.sourceAnnouncementId}::${r.suggestionKey}`
                                )
                            );

                            const tasksByAnnouncement = batch.map((_, i) =>
                                analysisByAnnouncement[i].tasks.filter(
                                    (task) =>
                                        !alreadyDecidedKeys.has(
                                            `${task.sourceAnnouncementId}::${task.suggestionKey}`
                                        )
                                )
                            );

                            // One duplicate-check call for the whole batch
                            // (not one per announcement): each course's
                            // nearby assignments are unioned across the
                            // batch's announcements and listed once.
                            const assignmentsByCourse = new Map<string, CanvasAssignment[]>();

                            batch.forEach((announcement, i) => {
                                if (tasksByAnnouncement[i].length === 0) {
                                    return;
                                }

                                const existing = assignmentsByCourse.get(announcement.course) ?? [];
                                const seen = new Set(existing.map((assignment) => assignment.id));

                                assignmentsByCourse.set(announcement.course, [
                                    ...existing,
                                    ...nearbyAssignmentsFor(announcement).filter(
                                        (assignment) => !seen.has(assignment.id)
                                    ),
                                ]);
                            });

                            const duplicateChecks = await findDuplicateTasksForBatch(
                                batch.flatMap((announcement, i) =>
                                    tasksByAnnouncement[i].map((task) => ({
                                        taskName: task.name,
                                        courseKey: announcement.course,
                                    }))
                                ),
                                assignmentsByCourse
                            );

                            const results = [];
                            const analyzedIds: string[] = [];
                            let checkCursor = 0;

                            for (const [i, announcement] of batch.entries()) {
                                const proposedTasks = tasksByAnnouncement[i];
                                const checks = duplicateChecks.slice(
                                    checkCursor,
                                    checkCursor + proposedTasks.length
                                );
                                checkCursor += proposedTasks.length;

                                const courseAssignments =
                                    assignmentsByCourse.get(announcement.course) ?? [];

                                const tasksWithDuplicates = proposedTasks.map((task, t) =>
                                    withCanvasMatch(task, checks[t], courseAssignments)
                                );

                                // Only a genuine answer from both passes marks
                                // the announcement as analyzed — a failed
                                // extraction or a degraded duplicate check is
                                // left unmarked so the next pass retries it
                                // instead of skipping it forever.
                                const analysisOk =
                                    analysisByAnnouncement[i].ok &&
                                    checks.every((check) => check.checkStatus === "checked");

                                if (analysisOk) {
                                    analyzedIds.push(announcement.id);
                                }

                                // A re-run replaces the announcement's
                                // pending candidates: one the model no longer
                                // extracts (or now words differently, giving
                                // it a new suggestionKey) would otherwise sit
                                // in the Rundown next to its replacement.
                                // Decided rows are never touched.
                                if (analysisByAnnouncement[i].ok) {
                                    await prisma.announcementSuggestionReview.deleteMany({
                                        where: {
                                            userId,
                                            sourceAnnouncementId: announcement.id,
                                            status: "pending",
                                            suggestionKey: {
                                                notIn: analysisByAnnouncement[i].tasks.map(
                                                    (task) => task.suggestionKey
                                                ),
                                            },
                                        },
                                    });
                                }

                                const visibleTasks = await finalizeCandidates(
                                    announcement.id,
                                    tasksWithDuplicates
                                );

                                results.push({
                                    announcement: toAnnouncementSummary(announcement),
                                    tasks: visibleTasks,
                                    ...(analysisByAnnouncement[i].ok
                                        ? {}
                                        : { error: "Failed to analyze announcement." }),
                                });
                            }

                            try {
                                await markAnalyzed(analyzedIds);
                            } catch (error) {
                                console.error("❌ Failed to mark announcements as analyzed:", error);
                            }

                            return results;
                        },
                        // Fires once per resolved batch, in arrival order
                        // (not necessarily input order, since
                        // OLLAMA_CONCURRENCY batches run concurrently) — the
                        // seam that turns "wait for every batch" into
                        // "stream each batch as it finishes."
                        (batchResults) => {
                            completedAnnouncements += batchResults.length;

                            send({
                                type: "batch",
                                results: batchResults,
                                completedAnnouncements,
                                totalAnnouncements: announcements.length,
                            });
                        },
                        shouldStopLaunching
                    );

                    // A pause requested after the last batch started has
                    // nothing left to pause — that's just a finished run.
                    if (paused && completedAnnouncements < announcements.length) {
                        send({
                            type: "paused",
                            completedAnnouncements,
                            totalAnnouncements: announcements.length,
                            quota,
                        });

                        return;
                    }

                    send({
                        type: "done",
                        announcementCount: announcements.length,
                        totalAnnouncementCount: allAnnouncements.length,
                        quota,
                        filtering: {
                            mode: isCustomSelection ? "custom" : "automatic",
                            bufferDays: ANNOUNCEMENT_BUFFER_DAYS,
                            rangeStart: resolvedWindow?.windowStart.toISOString() ?? null,
                            rangeEnd: resolvedWindow?.windowEnd.toISOString() ?? null,
                            isDefaultRange: resolvedWindow?.isDefaultRange ?? null,
                        },
                    });
                } catch (error) {
                    console.error(
                        "❌ Announcement analysis stream failed:",
                        error
                    );

                    // A per-batch failure is already handled above (sent
                    // as a normal "batch" frame with each task's `error`
                    // set) — this catch is only for a genuinely unexpected
                    // exception. Sent as a data frame rather than
                    // controller.error(), which would surface client-side
                    // as a bare TypeError with no usable message.
                    send({
                        type: "error",
                        message: "Failed to analyze announcements.",
                    });
                } finally {
                    try {
                        controller.close();
                    } catch {
                        // Already closed/cancelled by the client.
                    }
                }
            },

            cancel() {
                cancelled = true;
            },
        });

        return new Response(stream, {
            headers: {
                "Content-Type": "application/x-ndjson",
            },
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