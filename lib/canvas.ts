import {prisma} from "@/lib/prisma";

// Sentinel CanvasCourse.canvasOrigin value for a user-added course (e.g.
// "Personal") rather than one synced from Canvas — shared so every call
// site checks the same literal instead of each hardcoding "custom".
export const CUSTOM_COURSE_ORIGIN = "custom";

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
