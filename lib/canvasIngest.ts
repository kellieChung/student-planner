import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { CUSTOM_COURSE_ORIGIN } from "@/lib/canvas";
import { hashExtensionToken, readBearerToken } from "@/lib/extensionAuth";
import { hasAcceptedCurrentTerms } from "@/lib/legal";
import { CanvasCompletionItem, readCanvasCompletionItem } from "@/lib/canvasCompletions";
import { isDateKey, toDateKey } from "@/lib/utils";

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

// Canvas type/points from extension 0.3.2+. Older builds don't send the
// keys at all, so these return {} and an existing row keeps what it has.
function canvasTypeFields(assignment: Record<string, unknown>): { submissionTypes?: string[]; pointsPossible?: number | null } {
    const fields: { submissionTypes?: string[]; pointsPossible?: number | null } = {};

    if (Array.isArray(assignment.submission_types)) {
        fields.submissionTypes = assignment.submission_types
            .filter((type): type is string => typeof type === "string")
            .slice(0, 10)
            .map((type) => type.slice(0, 40));
    }

    if ("points_possible" in assignment) {
        const points = assignment.points_possible;
        fields.pointsPossible = typeof points === "number" && Number.isFinite(points) && points >= 0 ? points : null;
    }

    return fields;
}

// An unparseable timestamp becomes null instead of making Prisma throw and
// failing the whole sync.
function instant(value: unknown): Date | null {
    if (typeof value !== "string" || !value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

// The student's local due day the extension computes; older builds don't
// send it, so fall back to the server's timezone.
function dueDay(assignment: Record<string, unknown>, dueAt: Date | null): string | null {
    if (isDateKey(assignment.due_day)) return assignment.due_day;
    return dueAt ? toDateKey(dueAt) : null;
}

// Prisma Postgres bills every query, and a full sync re-sends the whole
// term: writing only rows that are new or actually differ turns an
// unchanged re-sync from one query per item into a handful of reads.
function sameValue(a: unknown, b: unknown): boolean {
    if (a instanceof Date || b instanceof Date) {
        return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
    }

    if (Array.isArray(a) || Array.isArray(b)) {
        return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, i) => value === b[i]);
    }

    return a === b;
}

// Only the keys present in `fields` are compared, so a key an older
// extension doesn't send never counts as a change (or gets cleared).
function hasChanges(existing: Record<string, unknown>, fields: Record<string, unknown>): boolean {
    return Object.entries(fields).some(([key, value]) => !sameValue(existing[key], value));
}

function rowKey(courseId: string, canvasId: string): string {
    return `${courseId}:${canvasId}`;
}

export async function upsertCanvasCourses(
    userId: string,
    canvasOrigin: string,
    courses: RawCourseSyncPayload[],
    today: string
) {
    let courseCount = 0;
    let assignmentCount = 0;
    let discussionCount = 0;
    let announcementCount = 0;
    // Applied by the caller once every assignment row exists, so a new
    // assignment that's already submitted completes too.
    const completionItems: CanvasCompletionItem[] = [];

    const syncedCourseCanvasIds = new Set<string>();

    // A course the user explicitly deleted (app/api/courses/[courseId]/
    // route.ts's DELETE handler) is tombstoned here so a routine sync
    // doesn't silently recreate it just because Canvas still reports it
    // active — only the explicit restore-course flow removes a tombstone.
    const [deletedCourses, existingCourses] = await Promise.all([
        prisma.deletedCanvasCourse.findMany({
            where: { userId, canvasOrigin },
            select: { canvasId: true },
        }),
        prisma.canvasCourse.findMany({
            where: { userId, canvasOrigin },
            select: { id: true, canvasId: true, name: true, syncStartDay: true },
        }),
    ]);

    const deletedCanvasIds = new Set(
        deletedCourses.map((deleted) => deleted.canvasId)
    );
    const existingCourseByCanvasId = new Map(existingCourses.map((course) => [course.canvasId, course]));

    const syncedCourses: { id: string; syncStartDay: string | null; data: RawCourseSyncPayload }[] = [];

    for (const courseData of courses) {
        const canvasCourse = courseData.course;

        if (!canvasCourse?.id) {
            continue;
        }

        const canvasId = String(canvasCourse.id);

        if (deletedCanvasIds.has(canvasId)) {
            continue;
        }

        syncedCourseCanvasIds.add(canvasId);

        const name = text(canvasCourse.name, "Unnamed Course");
        const existing = existingCourseByCanvasId.get(canvasId);
        let savedCourse: { id: string; syncStartDay: string | null };

        if (existing) {
            if (existing.name !== name) {
                await prisma.canvasCourse.update({ where: { id: existing.id }, data: { name } });
            }

            savedCourse = existing;
        } else {
            // Still an upsert: a concurrent sync may have just created it.
            savedCourse = await prisma.canvasCourse.upsert({
                where: {
                    userId_canvasOrigin_canvasId: { userId, canvasOrigin, canvasId },
                },
                update: { name },
                create: { userId, canvasOrigin, canvasId, name, syncStartDay: today },
                select: { id: true, syncStartDay: true },
            });
        }

        courseCount++;
        syncedCourses.push({ ...savedCourse, data: courseData });
    }

    const courseIds = syncedCourses.map((course) => course.id);

    const [existingAssignments, existingDiscussions, existingAnnouncements] = courseIds.length > 0
        ? await Promise.all([
            prisma.assignment.findMany({
                where: { userId, courseId: { in: courseIds } },
                select: {
                    id: true, courseId: true, canvasId: true, name: true, description: true,
                    dueAt: true, htmlUrl: true, submissionTypes: true, pointsPossible: true,
                },
            }),
            prisma.discussion.findMany({
                where: { userId, courseId: { in: courseIds } },
                select: {
                    id: true, courseId: true, canvasId: true, title: true, message: true,
                    htmlUrl: true, postedAt: true, dueAt: true,
                },
            }),
            prisma.announcement.findMany({
                where: { userId, courseId: { in: courseIds } },
                select: { id: true, courseId: true, canvasId: true, title: true, message: true, htmlUrl: true, postedAt: true },
            }),
        ])
        : [[], [], []];

    const assignmentsByKey = new Map(existingAssignments.map((row) => [rowKey(row.courseId, row.canvasId), row]));
    const discussionsByKey = new Map(existingDiscussions.map((row) => [rowKey(row.courseId, row.canvasId), row]));
    const announcementsByKey = new Map(existingAnnouncements.map((row) => [rowKey(row.courseId, row.canvasId), row]));

    // Keyed so a payload listing the same item twice behaves like the old
    // sequential upserts (last one wins) instead of colliding.
    const newAssignments = new Map<string, Prisma.AssignmentCreateManyInput>();
    const newDiscussions = new Map<string, Prisma.DiscussionCreateManyInput>();
    const newAnnouncements = new Map<string, Prisma.AnnouncementCreateManyInput>();
    const assignmentUpdates = new Map<string, Prisma.AssignmentUpdateInput>();
    const discussionUpdates = new Map<string, Prisma.DiscussionUpdateInput>();
    const announcementUpdates = new Map<string, Prisma.AnnouncementUpdateInput>();

    for (const savedCourse of syncedCourses) {
        const courseData = savedCourse.data;
        const canvasCourseId = String(courseData.course?.id);

        const assignments = Array.isArray(courseData.assignments)
            ? courseData.assignments
            : [];

        for (const assignment of assignments as Record<string, unknown>[]) {
            if (!assignment?.id) {
                continue;
            }

            const canvasId = String(assignment.id);
            const key = rowKey(savedCourse.id, canvasId);
            const fields = {
                name: text(assignment.name, "Unnamed Assignment"),
                description: html(assignment.description),
                dueAt: instant(assignment.due_at),
                htmlUrl: httpUrl(assignment.html_url),
                ...canvasTypeFields(assignment),
            };
            const day = dueDay(assignment, fields.dueAt);
            const existing = assignmentsByKey.get(key);

            if (existing) {
                if (hasChanges(existing, fields)) assignmentUpdates.set(existing.id, fields);
            } else if (savedCourse.syncStartDay && day && day < savedCourse.syncStartDay) {
                // Work already due when the course was first synced is never
                // imported: otherwise a new account starts with a term of
                // past assignments to check off for unearned XP. A row that
                // already exists (e.g. its due date moved back later) is
                // still kept current above.
                continue;
            } else {
                newAssignments.set(key, { userId, courseId: savedCourse.id, canvasId, ...fields });
            }

            assignmentCount++;

            const completionItem = readCanvasCompletionItem(canvasCourseId, assignment);
            if (completionItem) completionItems.push(completionItem);
        }

        const discussions = Array.isArray(courseData.discussions)
            ? courseData.discussions
            : [];

        for (const discussion of discussions as Record<string, unknown>[]) {
            if (!discussion?.id) {
                continue;
            }

            const canvasId = String(discussion.id);
            const key = rowKey(savedCourse.id, canvasId);
            const fields = {
                title: text(discussion.title, "Untitled Discussion"),
                message: html(discussion.message),
                htmlUrl: httpUrl(discussion.html_url),
                postedAt: instant(discussion.posted_at),
                dueAt: instant(discussion.due_at),
            };
            const existing = discussionsByKey.get(key);

            if (!existing) {
                newDiscussions.set(key, { userId, courseId: savedCourse.id, canvasId, ...fields });
            } else if (hasChanges(existing, fields)) {
                discussionUpdates.set(existing.id, fields);
            }

            discussionCount++;
        }

        const announcements = Array.isArray(courseData.announcements)
            ? courseData.announcements
            : [];

        for (const announcement of announcements as Record<string, unknown>[]) {
            if (!announcement?.id) {
                continue;
            }

            const canvasId = String(announcement.id);
            const key = rowKey(savedCourse.id, canvasId);
            const fields = {
                title: text(announcement.title, "Untitled Announcement"),
                message: html(announcement.message),
                htmlUrl: httpUrl(announcement.html_url),
                postedAt: instant(announcement.posted_at),
            };
            const existing = announcementsByKey.get(key);

            if (!existing) {
                newAnnouncements.set(key, { userId, courseId: savedCourse.id, canvasId, ...fields });
            } else if (hasChanges(existing, fields)) {
                announcementUpdates.set(existing.id, fields);
            }

            announcementCount++;
        }
    }

    // skipDuplicates: a concurrent sync may have created the same row since
    // the reads above.
    if (newAssignments.size > 0) {
        await prisma.assignment.createMany({ data: [...newAssignments.values()], skipDuplicates: true });
    }

    if (newDiscussions.size > 0) {
        await prisma.discussion.createMany({ data: [...newDiscussions.values()], skipDuplicates: true });
    }

    if (newAnnouncements.size > 0) {
        await prisma.announcement.createMany({ data: [...newAnnouncements.values()], skipDuplicates: true });
    }

    for (const [id, data] of assignmentUpdates) {
        await prisma.assignment.update({ where: { id }, data });
    }

    for (const [id, data] of discussionUpdates) {
        await prisma.discussion.update({ where: { id }, data });
    }

    for (const [id, data] of announcementUpdates) {
        await prisma.announcement.update({ where: { id }, data });
    }

    return {
        courseCount,
        assignmentCount,
        discussionCount,
        announcementCount,
        syncedCourseCanvasIds,
        completionItems,
    };
}
