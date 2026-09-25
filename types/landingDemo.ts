export type DemoTask = {
    id: string;
    day: string;
    // Pre-built with the real formatTaskLabel: "COURSE - TYPE - DAY - name".
    label: string;
    course: string;
    courseColorClass: string;
    detail: string;
    starlight: number;
    fromAnnouncement?: boolean;
};
