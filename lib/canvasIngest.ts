import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Shared by app/api/canvas/sync/route.ts (full snapshot, prunes anything
// missing) and app/api/canvas/restore-course/route.ts (single-course
// re-pull, never prunes) — both receive the same raw payload shape from
// canvas-extension/background.js.
export type RawCourseSyncPayload = {
    course?: { id?: unknown; name?: unknown };
    assignments?: unknown[];
    discussions?: unknown[];
    announcements?: unknown[];
};

export async function getCanvasSyncUserId(
    request: Request
): Promise<string | null> {
    const session = await auth();

    if (session?.user?.email) {
        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
        });

        if (user) {
            return user.id;
        }
    }

    const authorization = request.headers.get("authorization");

    if (!authorization || !authorization.startsWith("Bearer ")) {
        return null;
    }

    const token = authorization.substring("Bearer ".length);

    const extensionSession = await prisma.extensionSession.findUnique({
        where: { token },
    });

    if (!extensionSession || extensionSession.expiresAt < new Date()) {
        return null;
    }

    return extensionSession.userId;
}

export async function upsertCanvasCourses(
    userId: string,
    canvasOrigin: string,
    courses: RawCourseSyncPayload[]
) {
    let courseCount = 0;
    let assignmentCount = 0;
    let discussionCount = 0;
    let announcementCount = 0;

    const syncedCourseCanvasIds = new Set<string>();

    for (const courseData of courses) {
        const canvasCourse = courseData.course;

        if (!canvasCourse?.id) {
            continue;
        }

        syncedCourseCanvasIds.add(String(canvasCourse.id));

        const savedCourse = await prisma.canvasCourse.upsert({
            where: {
                userId_canvasOrigin_canvasId: {
                    userId,
                    canvasOrigin,
                    canvasId: String(canvasCourse.id),
                },
            },
            update: {
                name: (canvasCourse.name as string | undefined) ?? "Unnamed Course",
            },
            create: {
                userId,
                canvasOrigin,
                canvasId: String(canvasCourse.id),
                name: (canvasCourse.name as string | undefined) ?? "Unnamed Course",
            },
        });

        courseCount++;

        const assignments = Array.isArray(courseData.assignments)
            ? courseData.assignments
            : [];

        for (const assignment of assignments as Record<string, unknown>[]) {
            if (!assignment?.id) {
                continue;
            }

            await prisma.assignment.upsert({
                where: {
                    courseId_canvasId: {
                        courseId: savedCourse.id,
                        canvasId: String(assignment.id),
                    },
                },
                update: {
                    name: (assignment.name as string | undefined) ?? "Unnamed Assignment",
                    description: (assignment.description as string | undefined) ?? null,
                    dueAt: assignment.due_at
                        ? new Date(assignment.due_at as string)
                        : null,
                    htmlUrl: (assignment.html_url as string | undefined) ?? null,
                },
                create: {
                    userId,
                    courseId: savedCourse.id,
                    canvasId: String(assignment.id),
                    name: (assignment.name as string | undefined) ?? "Unnamed Assignment",
                    description: (assignment.description as string | undefined) ?? null,
                    dueAt: assignment.due_at
                        ? new Date(assignment.due_at as string)
                        : null,
                    htmlUrl: (assignment.html_url as string | undefined) ?? null,
                },
            });

            assignmentCount++;
        }

        const discussions = Array.isArray(courseData.discussions)
            ? courseData.discussions
            : [];

        for (const discussion of discussions as Record<string, unknown>[]) {
            if (!discussion?.id) {
                continue;
            }

            await prisma.discussion.upsert({
                where: {
                    courseId_canvasId: {
                        courseId: savedCourse.id,
                        canvasId: String(discussion.id),
                    },
                },
                update: {
                    title: (discussion.title as string | undefined) ?? "Untitled Discussion",
                    message: (discussion.message as string | undefined) ?? null,
                    htmlUrl: (discussion.html_url as string | undefined) ?? null,
                    postedAt: discussion.posted_at
                        ? new Date(discussion.posted_at as string)
                        : null,
                    dueAt: discussion.due_at
                        ? new Date(discussion.due_at as string)
                        : null,
                },
                create: {
                    userId,
                    courseId: savedCourse.id,
                    canvasId: String(discussion.id),
                    title: (discussion.title as string | undefined) ?? "Untitled Discussion",
                    message: (discussion.message as string | undefined) ?? null,
                    htmlUrl: (discussion.html_url as string | undefined) ?? null,
                    postedAt: discussion.posted_at
                        ? new Date(discussion.posted_at as string)
                        : null,
                    dueAt: discussion.due_at
                        ? new Date(discussion.due_at as string)
                        : null,
                },
            });

            discussionCount++;
        }

        const announcements = Array.isArray(courseData.announcements)
            ? courseData.announcements
            : [];

        for (const announcement of announcements as Record<string, unknown>[]) {
            if (!announcement?.id) {
                continue;
            }

            await prisma.announcement.upsert({
                where: {
                    courseId_canvasId: {
                        courseId: savedCourse.id,
                        canvasId: String(announcement.id),
                    },
                },
                update: {
                    title: (announcement.title as string | undefined) ?? "Untitled Announcement",
                    message: (announcement.message as string | undefined) ?? null,
                    htmlUrl: (announcement.html_url as string | undefined) ?? null,
                    postedAt: announcement.posted_at
                        ? new Date(announcement.posted_at as string)
                        : null,
                },
                create: {
                    userId,
                    courseId: savedCourse.id,
                    canvasId: String(announcement.id),
                    title: (announcement.title as string | undefined) ?? "Untitled Announcement",
                    message: (announcement.message as string | undefined) ?? null,
                    htmlUrl: (announcement.html_url as string | undefined) ?? null,
                    postedAt: announcement.posted_at
                        ? new Date(announcement.posted_at as string)
                        : null,
                },
            });

            announcementCount++;
        }
    }

    return {
        courseCount,
        assignmentCount,
        discussionCount,
        announcementCount,
        syncedCourseCanvasIds,
    };
}
