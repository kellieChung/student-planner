import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { analyzeAnnouncement } from "@/lib/ai/analyzeAnnouncement";
import { findDuplicateTask } from "@/lib/ai/findDuplicateTask";
import { Announcement } from "@/types/announcement";

function isWithinOneMonth(
    assignmentDate: string | null,
    announcementDate: string
): boolean {
    if (!assignmentDate) {
        return true;
    }

    const assignmentTime = new Date(assignmentDate).getTime();
    const announcementTime = new Date(announcementDate).getTime();

    if (
        Number.isNaN(assignmentTime) ||
        Number.isNaN(announcementTime)
    ) {
        return false;
    }

    const ONE_MONTH = 31 * 24 * 60 * 60 * 1000;

    return (
        assignmentTime >= announcementTime - ONE_MONTH &&
        assignmentTime <= announcementTime + ONE_MONTH
    );
}

export async function POST() {
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

        const user = await prisma.user.findUnique({
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
        // 3. Get courses, announcements, assignments
        // --------------------------------------------------

        const courses = await prisma.canvasCourse.findMany({
            where: {
                userId: user.id,
            },
            include: {
                announcements: true,
                assignments: true,
            },
        });

        // --------------------------------------------------
        // 4. Convert announcements to AI format
        // --------------------------------------------------

        const announcements: Announcement[] =
            courses.flatMap((course) =>
                course.announcements.map((announcement) => ({
                    id: announcement.id,
                    title: announcement.title,
                    message: announcement.message ?? "",
                    course: course.name,
                    postedAt:
                        announcement.postedAt?.toISOString() ?? "",
                }))
            );

        const results = [];

        // --------------------------------------------------
        // 5. Analyze each announcement
        // --------------------------------------------------

        for (const announcement of announcements) {
            try {
                console.log(
                    `🤖 Analyzing announcement: "${announcement.title}"`
                );

                // ------------------------------------------
                // Extract proposed tasks
                // ------------------------------------------

                const proposedTasks =
                    await analyzeAnnouncement(
                        announcement
                    );

                // ------------------------------------------
                // Find matching course
                // ------------------------------------------

                const course = courses.find(
                    (course) =>
                        course.name === announcement.course
                );

                // ------------------------------------------
                // Get assignments from THIS course only
                // ------------------------------------------

                const courseAssignments =
                    course?.assignments ?? [];

                // ------------------------------------------
                // Only compare against reasonably nearby
                // assignments.
                // ------------------------------------------

                const nearbyAssignments =
                    courseAssignments
                        .filter((assignment) =>
                            isWithinOneMonth(
                                assignment.dueAt
                                    ?.toISOString() ?? null,
                                announcement.postedAt
                            )
                        )
                        .map((assignment) => ({
                            id: assignment.id,
                            name: assignment.name,
                            description:
                                assignment.description,
                            dueDate:
                                assignment.dueAt
                                    ?.toISOString()
                                    .slice(0, 10) ?? null,
                        }));

                console.log(
                    `🔎 ${nearbyAssignments.length} nearby assignments for "${announcement.title}"`
                );

                // ------------------------------------------
                // Check each proposed task independently
                // ------------------------------------------

                const tasksWithDuplicates = [];

                for (const task of proposedTasks) {
                    try {
                        const duplicateCheck =
                            await findDuplicateTask(
                                task.name,
                                nearbyAssignments
                            );

                        tasksWithDuplicates.push({
                            ...task,
                            duplicate: duplicateCheck,
                        });

                        console.log(
                            `🔍 "${task.name}" →`,
                            duplicateCheck
                        );
                    } catch (error) {
                        console.error(
                            `❌ Duplicate check failed for task "${task.name}":`,
                            error
                        );

                        // Keep the proposed task even if
                        // duplicate detection fails.
                        tasksWithDuplicates.push({
                            ...task,
                            duplicate: {
                                isDuplicate: false,
                                matchingAssignmentId: null,
                                confidence: "low" as const,
                                reason:
                                    "Duplicate checking failed.",
                            },
                        });
                    }
                }

                // ------------------------------------------
                // Save result
                // ------------------------------------------

                results.push({
                    announcement: {
                        id: announcement.id,
                        title: announcement.title,
                        course: announcement.course,
                        postedAt: announcement.postedAt,
                        message: announcement.message,
                    },

                    tasks: tasksWithDuplicates,
                });
            } catch (error) {
                console.error(
                    `❌ Failed to analyze announcement ${announcement.id}:`,
                    error
                );

                results.push({
                    announcement: {
                        id: announcement.id,
                        title: announcement.title,
                        course: announcement.course,
                        postedAt: announcement.postedAt,
                        message: announcement.message,
                    },

                    tasks: [],

                    error:
                        "Failed to analyze announcement.",
                });
            }
        }

        // --------------------------------------------------
        // 6. Return everything
        // --------------------------------------------------

        return NextResponse.json({
            success: true,
            announcementCount: announcements.length,
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
                error: "Failed to analyze announcements.",
            },
            { status: 500 }
        );
    }
}