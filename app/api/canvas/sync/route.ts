import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
    try {
        const session = await auth();

        let userId: string | null = null;

        if (session?.user?.email) {
            const user = await prisma.user.findUnique({
                where: {
                    email: session.user.email,
                },
            });

            if (user) {
                userId = user.id;
            }
        }

        if (!userId) {
            const authorization =
                request.headers.get("authorization");

            if (!authorization) {
                return NextResponse.json(
                    {
                        success: false,
                        error: "You must be logged in.",
                    },
                    { status: 401 }
                );
            }

            if (!authorization.startsWith("Bearer ")) {
                return NextResponse.json(
                    {
                        success: false,
                        error:
                            "Invalid authorization header.",
                    },
                    { status: 401 }
                );
            }

            const token =
                authorization.substring(
                    "Bearer ".length
                );

            const extensionSession =
                await prisma.extensionSession.findUnique({
                    where: {
                        token,
                    },
                });

            if (!extensionSession) {
                return NextResponse.json(
                    {
                        success: false,
                        error:
                            "Invalid extension token.",
                    },
                    { status: 401 }
                );
            }

            if (
                extensionSession.expiresAt <
                new Date()
            ) {
                return NextResponse.json(
                    {
                        success: false,
                        error:
                            "Extension session expired.",
                    },
                    { status: 401 }
                );
            }

            userId =
                extensionSession.userId;

            console.log(
                "🔐 Extension authenticated user:",
                userId
            );
        }

        const body =
            await request.json();

        if (
            !Array.isArray(body.courses)
        ) {
            return NextResponse.json(
                {
                    success: false,
                    error:
                        "Invalid Canvas data.",
                },
                { status: 400 }
            );
        }

        console.log(
            "🎓 Canvas sync received!"
        );

        console.log(
            "User ID:",
            userId
        );

        console.log(
            "Courses:",
            body.courses.length
        );

        const canvasOrigin =
            body.canvasOrigin;

        if (!canvasOrigin) {
            return NextResponse.json(
                {
                    success: false,
                    error:
                        "Canvas origin is required.",
                },
                { status: 400 }
            );
        }

        let courseCount = 0;
        let assignmentCount = 0;
        let discussionCount = 0;
        let announcementCount = 0;

        for (
            const courseData of body.courses
        ) {
            const canvasCourse =
                courseData.course;

            if (!canvasCourse?.id) {
                continue;
            }

            const savedCourse =
                await prisma.canvasCourse.upsert({
                    where: {
                        userId_canvasOrigin_canvasId:
                            {
                                userId,
                                canvasOrigin,
                                canvasId:
                                    String(
                                        canvasCourse.id
                                    ),
                            },
                    },
                    update: {
                        name:
                            canvasCourse.name ??
                            "Unnamed Course",
                    },
                    create: {
                        userId,
                        canvasOrigin,
                        canvasId:
                            String(
                                canvasCourse.id
                            ),
                        name:
                            canvasCourse.name ??
                            "Unnamed Course",
                    },
                });

            courseCount++;

            const assignments =
                Array.isArray(
                    courseData.assignments
                )
                    ? courseData.assignments
                    : [];

            for (
                const assignment of assignments
            ) {
                if (!assignment?.id) {
                    continue;
                }

                await prisma.assignment.upsert({
                    where: {
                        courseId_canvasId: {
                            courseId:
                                savedCourse.id,
                            canvasId:
                                String(
                                    assignment.id
                                ),
                        },
                    },
                    update: {
                        name:
                            assignment.name ??
                            "Unnamed Assignment",
                        description:
                            assignment.description ??
                            null,
                        dueAt:
                            assignment.due_at
                                ? new Date(
                                      assignment.due_at
                                  )
                                : null,
                        htmlUrl:
                            assignment.html_url ??
                            null,
                    },
                    create: {
                        userId,
                        courseId:
                            savedCourse.id,
                        canvasId:
                            String(
                                assignment.id
                            ),
                        name:
                            assignment.name ??
                            "Unnamed Assignment",
                        description:
                            assignment.description ??
                            null,
                        dueAt:
                            assignment.due_at
                                ? new Date(
                                      assignment.due_at
                                  )
                                : null,
                        htmlUrl:
                            assignment.html_url ??
                            null,
                    },
                });

                assignmentCount++;
            }

            const discussions =
                Array.isArray(
                    courseData.discussions
                )
                    ? courseData.discussions
                    : [];

            for (
                const discussion of discussions
            ) {
                if (!discussion?.id) {
                    continue;
                }

                await prisma.discussion.upsert({
                    where: {
                        courseId_canvasId: {
                            courseId:
                                savedCourse.id,
                            canvasId:
                                String(
                                    discussion.id
                                ),
                        },
                    },
                    update: {
                        title:
                            discussion.title ??
                            "Untitled Discussion",
                        message:
                            discussion.message ??
                            null,
                        htmlUrl:
                            discussion.html_url ??
                            null,
                        postedAt:
                            discussion.posted_at
                                ? new Date(
                                      discussion.posted_at
                                  )
                                : null,
                        dueAt:
                            discussion.due_at
                                ? new Date(
                                      discussion.due_at
                                  )
                                : null,
                    },
                    create: {
                        userId,
                        courseId:
                            savedCourse.id,
                        canvasId:
                            String(
                                discussion.id
                            ),
                        title:
                            discussion.title ??
                            "Untitled Discussion",
                        message:
                            discussion.message ??
                            null,
                        htmlUrl:
                            discussion.html_url ??
                            null,
                        postedAt:
                            discussion.posted_at
                                ? new Date(
                                      discussion.posted_at
                                  )
                                : null,
                        dueAt:
                            discussion.due_at
                                ? new Date(
                                      discussion.due_at
                                  )
                                : null,
                    },
                });

                discussionCount++;
            }

            const announcements =
                Array.isArray(
                    courseData.announcements
                )
                    ? courseData.announcements
                    : [];

            for (
                const announcement of announcements
            ) {
                if (!announcement?.id) {
                    continue;
                }

                await prisma.announcement.upsert({
                    where: {
                        courseId_canvasId: {
                            courseId:
                                savedCourse.id,
                            canvasId:
                                String(
                                    announcement.id
                                ),
                        },
                    },
                    update: {
                        title:
                            announcement.title ??
                            "Untitled Announcement",
                        message:
                            announcement.message ??
                            null,
                        htmlUrl:
                            announcement.html_url ??
                            null,
                        postedAt:
                            announcement.posted_at
                                ? new Date(
                                      announcement.posted_at
                                  )
                                : null,
                    },
                    create: {
                        userId,
                        courseId:
                            savedCourse.id,
                        canvasId:
                            String(
                                announcement.id
                            ),
                        title:
                            announcement.title ??
                            "Untitled Announcement",
                        message:
                            announcement.message ??
                            null,
                        htmlUrl:
                            announcement.html_url ??
                            null,
                        postedAt:
                            announcement.posted_at
                                ? new Date(
                                      announcement.posted_at
                                  )
                                : null,
                    },
                });

                announcementCount++;
            }
        }

        console.log(
            "✅ Canvas data saved!"
        );

        console.log(
            "Courses:",
            courseCount
        );

        console.log(
            "Assignments:",
            assignmentCount
        );

        console.log(
            "Discussions:",
            discussionCount
        );

        console.log(
            "Announcements:",
            announcementCount
        );

        return NextResponse.json({
            success: true,
            message:
                "Canvas data synced successfully.",
            userId,
            courseCount,
            assignmentCount,
            discussionCount,
            announcementCount,
        });

    } catch (error) {
        console.error(
            "❌ Canvas sync failed:",
            error
        );

        return NextResponse.json(
            {
                success: false,
                error:
                    "Failed to process Canvas sync.",
            },
            { status: 500 }
        );
    }
}