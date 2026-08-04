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
    return (
        <div>
            <h3>{name}</h3>
            <p>Due: {due}</p>
            <p>Course: {course}</p>
        </div>
    );
}