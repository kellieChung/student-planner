import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { CUSTOM_COURSE_ORIGIN } from "@/lib/canvas";
import { hashExtensionToken, readBearerToken } from "@/lib/extensionAuth";
import { hasAcceptedCurrentTerms } from "@/lib/legal";

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
            return hasAcceptedCurrentTerms(user) ? user.id : null;
        }
    }

    const token = readBearerToken(request);

    if (!token) {
        return null;
    }

    const extensionSession = await prisma.extensionSession.findUnique({
        where: { token: hashExtensionToken(token) },
        include: { user: { select: { termsAcceptedAt: true, termsVersion: true } } },
    });

    if (!extensionSession || extensionSession.expiresAt < new Date()) {
        return null;
    }

    // A terms bump sends web users back through /accept-terms; an extension
    // token issued before it stops working until they accept on the site.
    if (!hasAcceptedCurrentTerms(extensionSession.user)) {
        return null;
    }

    return extensionSession.userId;
}

// Canvas is always served over https; anything else (including the "custom"
// sentinel used for personal courses) must never be written or pruned by a
// sync.
export function isValidCanvasOrigin(value: unknown): value is string {
    if (typeof value !== "string" || value === CUSTOM_COURSE_ORIGIN) {
        return false;
    }

    try {
        const url = new URL(value);
        return url.protocol === "https:" && url.origin === value;
    } catch {
        return false;
    }
}

const MAX_NAME_LENGTH = 300;
const MAX_HTML_LENGTH = 50_000;
const MAX_URL_LENGTH = 2_000;

function text(value: unknown, fallback: string): string {
    return typeof value === "string" && value.trim() ? value.slice(0, MAX_NAME_LENGTH) : fallback;
}

function html(value: unknown): string | null {
    return typeof value === "string" ? value.slice(0, MAX_HTML_LENGTH) : null;
}

function httpUrl(value: unknown): string | null {
    return typeof value === "string" && /^https:\/\//.test(value) ? value.slice(0, MAX_URL_LENGTH) : null;
}

// An unparseable timestamp becomes null instead of making Prisma throw and
// failing the whole sync.
function instant(value: unknown): Date | null {
    if (typeof value !== "string" || !value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
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

    // A course the user explicitly deleted (app/api/courses/[courseId]/
    // route.ts's DELETE handler) is tombstoned here so a routine sync
    // doesn't silently recreate it just because Canvas still reports it
    // active — only the explicit restore-course flow removes a tombstone.
    const deletedCourses = await prisma.deletedCanvasCourse.findMany({
        where: { userId, canvasOrigin },
        select: { canvasId: true },
    });

    const deletedCanvasIds = new Set(
        deletedCourses.map((deleted) => deleted.canvasId)
    );

    for (const courseData of courses) {
        const canvasCourse = courseData.course;

        if (!canvasCourse?.id) {
            continue;
        }

        if (deletedCanvasIds.has(String(canvasCourse.id))) {
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
                name: text(canvasCourse.name, "Unnamed Course"),
            },
            create: {
                userId,
                canvasOrigin,
                canvasId: String(canvasCourse.id),
                name: text(canvasCourse.name, "Unnamed Course"),
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
                    name: text(assignment.name, "Unnamed Assignment"),
                    description: html(assignment.description),
                    dueAt: instant(assignment.due_at),
                    htmlUrl: httpUrl(assignment.html_url),
                },
                create: {
                    userId,
                    courseId: savedCourse.id,
                    canvasId: String(assignment.id),
                    name: text(assignment.name, "Unnamed Assignment"),
                    description: html(assignment.description),
                    dueAt: instant(assignment.due_at),
                    htmlUrl: httpUrl(assignment.html_url),
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
                    title: text(discussion.title, "Untitled Discussion"),
                    message: html(discussion.message),
                    htmlUrl: httpUrl(discussion.html_url),
                    postedAt: instant(discussion.posted_at),
                    dueAt: instant(discussion.due_at),
                },
                create: {
                    userId,
                    courseId: savedCourse.id,
                    canvasId: String(discussion.id),
                    title: text(discussion.title, "Untitled Discussion"),
                    message: html(discussion.message),
                    htmlUrl: httpUrl(discussion.html_url),
                    postedAt: instant(discussion.posted_at),
                    dueAt: instant(discussion.due_at),
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
                    title: text(announcement.title, "Untitled Announcement"),
                    message: html(announcement.message),
                    htmlUrl: httpUrl(announcement.html_url),
                    postedAt: instant(announcement.posted_at),
                },
                create: {
                    userId,
                    courseId: savedCourse.id,
                    canvasId: String(announcement.id),
                    title: text(announcement.title, "Untitled Announcement"),
                    message: html(announcement.message),
                    htmlUrl: httpUrl(announcement.html_url),
                    postedAt: instant(announcement.posted_at),
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
