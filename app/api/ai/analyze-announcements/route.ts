import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { analyzeAnnouncements } from "@/lib/ai/analyzeAnnouncement";
import { findDuplicateTasks } from "@/lib/ai/findDuplicateTask";
import { Announcement } from "@/types/announcement";
import { chunk, mapWithConcurrency } from "@/lib/concurrency";

const ANNOUNCEMENT_BUFFER_DAYS = 5;

// Announcements analyzed per Ollama call. Each call resends the full
// instructional rules regardless of batch size, so batching cuts that
// fixed per-call cost proportionally across the batch.
const ANNOUNCEMENT_BATCH_SIZE = 5;
const OLLAMA_CONCURRENCY = 2;

/**
 * Returns the Monday at the beginning of the current
 * calendar week, using the user's local date.
 */
function getStartOfCurrentWeek(): Date {
    const now = new Date();

    const start = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
    );

    const day = start.getDay();

    // Sunday = 0, Monday = 1, ..., Saturday = 6
    const daysSinceMonday =
        day === 0 ? 6 : day - 1;

    start.setDate(
        start.getDate() - daysSinceMonday
    );

    start.setHours(0, 0, 0, 0);

    return start;
}

/**
 * Automatic announcement window:
 *
 * 5 days before Monday
 * through the end of Sunday.
 *
 * Example:
 *
 * Current week:
 * Monday Aug 24
 * Sunday Aug 30
 *
 * Analysis window:
 * Wednesday Aug 19
 * through Sunday Aug 30
 */
function isInAutomaticAnnouncementWindow(
    postedAt: string
): boolean {
    const postedTime = new Date(postedAt).getTime();

    if (Number.isNaN(postedTime)) {
        return false;
    }

    const weekStart = getStartOfCurrentWeek();

    const windowStart = new Date(weekStart);

    windowStart.setDate(
        windowStart.getDate() -
            ANNOUNCEMENT_BUFFER_DAYS
    );

    windowStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);

    weekEnd.setDate(
        weekEnd.getDate() + 6
    );

    weekEnd.setHours(
        23,
        59,
        59,
        999
    );

    return (
        postedTime >= windowStart.getTime() &&
        postedTime <= weekEnd.getTime()
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
        // 3. Read optional custom selection
        // --------------------------------------------------

        let selectedAnnouncementIds:
            | string[]
            | null = null;

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
        } catch {
            // No body = automatic mode.
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
            // Current week + 5-day early buffer.
            // ----------------------------------------------

            announcements =
                allAnnouncements.filter(
                    (announcement) =>
                        isInAutomaticAnnouncementWindow(
                            announcement.postedAt
                        )
                );

            console.log(
                `🤖 Automatic announcement filter: ${announcements.length}/${allAnnouncements.length} selected`
            );

            const weekStart =
                getStartOfCurrentWeek();

            const windowStart =
                new Date(weekStart);

            windowStart.setDate(
                windowStart.getDate() -
                    ANNOUNCEMENT_BUFFER_DAYS
            );

            console.log(
                `📅 Automatic window: ${windowStart.toLocaleDateString()} → ${new Date(
                    weekStart.getFullYear(),
                    weekStart.getMonth(),
                    weekStart.getDate() + 6
                ).toLocaleDateString()}`
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
            const course = courses.find(
                (course) => course.name === announcement.course
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

                return Promise.all(
                    batch.map(async (announcement, i) => {
                        const proposedTasks =
                            proposedTasksByAnnouncement[i];

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

                                    return {
                                        ...task,
                                        canvasMatch: {
                                            status: duplicateCheck.isDuplicate
                                                ? duplicateCheck.confidence === "high"
                                                    ? "definite"
                                                    : "possible"
                                                : "none",
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
                                    status: "none",
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
                    })
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