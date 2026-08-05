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
    return {
        id: String(assignment.id),
        name: assignment.name,
        due: assignment.due_at,
        course: courseName,
        daysRemaining: Math.ceil(
            (new Date(assignment.due_at).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
        )
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
    return allAssignments.sort(
        (a, b) => 
            new Date(a.due).getTime() -
            new Date(b.due).getTime()
    );
}