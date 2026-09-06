import {Announcement} from "@/types/announcement";
import {prisma} from "@/lib/prisma";

const CANVAS_URL = "https://davidsononline.instructure.com";

const headers = {
    Authorization: `Bearer ${process.env.CANVAS_TOKEN}`,
};

export async function getCourses() {
    const response = await fetch(
        `${CANVAS_URL}/api/v1/courses?enrollment_state=active`,
        {
            headers,
        }
    );

    const data = await response.json();

    return data;
}

export async function getAssignments(courseId: number) {
        const response = await fetch(
            `${CANVAS_URL}/api/v1/courses/${courseId}/assignments`,
            {
                headers,
            }
        );

        return response.json();
}

export async function getAllAssignments(userId: string) {
    const courses = await prisma.canvasCourse.findMany({
        where: {
            userId,
            hidden: false,
        },
        include: {
            assignments: true,
        },
    });

    // `due` is resolved client-side (WeeklyPlannerView.tsx) from `dueAt`,
    // using the viewer's own browser timezone — there's no single
    // "institution timezone" that's correct for every viewer, and this
    // avoids guessing one server-side. `due` is left as an unused
    // placeholder here only to satisfy the Assignment shape before that
    // resolution happens.
    const allAssignments = courses.flatMap((course) =>
        course.assignments.map((assignment) => ({
            id: assignment.id,
            name: assignment.name,
            due: "",
            dueAt: assignment.dueAt ? assignment.dueAt.toISOString() : null,
            course: course.displayName ?? course.name,
            createdAt: assignment.createdAt.toISOString(),
        }))
    );

    return allAssignments.sort((a, b) => {
        const timeA = a.dueAt
            ? new Date(a.dueAt).getTime()
            : Infinity;

        const timeB = b.dueAt
            ? new Date(b.dueAt).getTime()
            : Infinity;

        return timeA - timeB;
    });
}

export function transformAnnouncement(
    announcement: any,
    courseName: string
): Announcement {
    return {
        id: String(announcement.id),
        title: announcement.title,
        message: announcement.message,
        course: courseName,
        postedAt: announcement.posted_at,
    };
}

export async function getAllAnnouncements(userId: string) {
    const courses = await prisma.canvasCourse.findMany({
        where: {
            userId,
            hidden: false,
        },
        include: {
            announcements: true,
        },
    });

    const allAnnouncements: Announcement[] = courses.flatMap(
        (course) =>
            course.announcements.map((announcement) => ({
                id: announcement.id,
                title: announcement.title,
                message: announcement.message ?? "",
                course: course.name,
                postedAt:
                    announcement.postedAt?.toISOString() ?? "",
            }))
    );

    return allAnnouncements;
}