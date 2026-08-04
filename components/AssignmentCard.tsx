type AssignmentCardProps = {
    name: string;
    due: string;
    course: string;
};

export default function AssignmentCard({
    name,
    due,
    course,
}: AssignmentCardProps) {
    let courseColor = "bg-gray-700";

    if (course === "Physics") {
        courseColor = "bg-blue-700";
    }

    if (course === "English") {
        courseColor = "bg-yellow-700";
    }

    if (course === "Math") {
        courseColor = "bg-red-700";
    }
    return (
        <div className = "bg-slate-900 rounded-xl shadow-md p-5 mb-4">
            <p className = {`${courseColor} rounded-full px-3 py-1 inline-block text-sm text-white`}>
                {course}
            </p>
            <h3 className = "text-xl font-semibold">
                ☐ {name}
            </h3>
            <p className = "text-gray-400">
                Due: {due}
            </p>
        </div>
    );
}