import {Announcement} from "@/types/announcement";

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

export async function getAllAssignments() {
    const courses = await getCourses();
    const allAssignments = [];

    for (const course of courses) {
        if (!course.id || !course.name) {
            console.log("Skipping invalid course:", course);
            continue;
        }

        const assignments = await getAssignments(course.id);

        if (!Array.isArray(assignments)) {
            console.log("Skipping invalid assignments response:", assignments);
            continue;
        }

        const transformed = assignments.map((assignment:any) =>
            transformAssignment(
                assignment,
                course.name
            )
        );

        allAssignments.push(...transformed);
    }
    return allAssignments.sort((a, b) => {
        const timeA = a.due ? new Date(a.due).getTime() : Infinity;
        const timeB = b.due ? new Date(b.due).getTime() : Infinity;

        return timeA - timeB;
    });
}

export async function getAnnouncements(courseId: number) {
        const response = await fetch(
            `${CANVAS_URL}/api/v1/announcements?context_codes[]=course_${courseId}`,
            {
                headers,
            }
        );
        
        const data = await response.json();

        console.log("Announcement response:", courseId, data);

        return data;
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

export async function getAllAnnouncements() {
    const courses = await getCourses();
    const allAnnouncements: Announcement[] = [];

    for (const course of courses) {
        if (!course.id || !course.name) {
            console.log("Skipping invalid course:", course);
            continue;
        }

        const announcements = await getAnnouncements(course.id);

        if(!Array.isArray(announcements)) {
            console.log(
                "Skipping invalid announcements response:",
                announcements
            );
            continue;
        }

        const transformed = announcements.map((announcement:any) =>
            transformAnnouncement(
                announcement,
                course.name
            )
        );

        allAnnouncements.push(...transformed);
    }

    return allAnnouncements
}