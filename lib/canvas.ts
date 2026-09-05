import {Announcement} from "@/types/announcement";
import {prisma} from "@/lib/prisma";

const CANVAS_URL = "https://davidsononline.instructure.com";

const headers = {
    Authorization: `Bearer ${process.env.CANVAS_TOKEN}`,
};

// Canvas due dates are UTC instants; format them as the institution's local
// calendar date (Davidson College, matching CANVAS_URL above) rather than
// the server process's own timezone, which may not match.
function toInstitutionDateString(date: Date): string {
    return date.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

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

export function transformAssignment(
    assignment: any,
    courseName: string
) {
    if (!assignment.due_at) {
        return {
            id: String(assignment.id),
            name: assignment.name,
            due: null,
            course: courseName,
        };
    }

    const localDueDate = new Date(assignment.due_at);

    const year = localDueDate.getFullYear();
    const month = localDueDate.getMonth();
    const day = localDueDate.getDate();

    const formattedDue = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    const localDueDateMidnight = new Date(year, month, day).getTime();
    
    const today = new Date();
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

    const msPerDay = 1000 * 60 * 60 * 24;

    return {
        id: String(assignment.id),
        name: assignment.name,
        due: formattedDue,
        course: courseName,
    };
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

    const allAssignments = courses.flatMap((course) =>
        course.assignments.map((assignment) => {
            const due = assignment.dueAt
                ? toInstitutionDateString(assignment.dueAt)
                : "";

            return {
                id: assignment.id,
                name: assignment.name,
                due,
                course: course.name,
                createdAt: assignment.createdAt.toISOString(),
            };
        })
    );

    return allAssignments.sort((a, b) => {
        const timeA = a.due
            ? new Date(a.due).getTime()
            : Infinity;

        const timeB = b.due
            ? new Date(b.due).getTime()
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