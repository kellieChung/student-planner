import { courseColorDefault } from "@/lib/courseColor";
import { formatTaskLabel, type LabelType } from "@/lib/taskLabel";
import { formatEstimatedMinutes } from "@/lib/utils";
import type { DemoTask } from "@/types/landingDemo";

type Seed = {
    day: string;
    dueDateKey: string;
    course: string;
    abbreviation: string;
    typeCode: LabelType;
    name: string;
    minutes: number;
    due: string;
    // Illustrative only; the real award is time-based (lib/xp.ts).
    starlight: number;
    fromAnnouncement?: boolean;
};

// One task per weekday. The order matches Cassiopeia's stars left to right.
const SEEDS: Seed[] = [
    { day: "Mon", dueDateKey: "2026-09-28", course: "HIST 110", abbreviation: "HIST", typeCode: "R", name: "Read chapter 7", minutes: 45, due: "11:59 PM", starlight: 20 },
    { day: "Tue", dueDateKey: "2026-09-29", course: "ENG 102", abbreviation: "ENG", typeCode: "HW", name: "Essay draft", minutes: 120, due: "11:59 PM", starlight: 60 },
    { day: "Wed", dueDateKey: "2026-09-30", course: "MATH 151", abbreviation: "MA", typeCode: "HW", name: "Problem set 4", minutes: 90, due: "9:00 AM", starlight: 45 },
    { day: "Thu", dueDateKey: "2026-10-01", course: "BIO 201", abbreviation: "BIO", typeCode: "EXAM", name: "Unit 2 quiz", minutes: 60, due: "2:30 PM", starlight: 50 },
    { day: "Fri", dueDateKey: "2026-10-02", course: "BIO 201", abbreviation: "BIO", typeCode: "HW", name: "Lab write-up", minutes: 120, due: "11:59 PM", starlight: 60, fromAnnouncement: true },
];

export const DEMO_TASKS: DemoTask[] = SEEDS.map((seed) => ({
    id: seed.dueDateKey,
    day: seed.day,
    label: formatTaskLabel({
        courseAbbreviation: seed.abbreviation,
        typeCode: seed.typeCode,
        dueDateKey: seed.dueDateKey,
        name: seed.name,
    }),
    course: seed.course,
    courseColorClass: courseColorDefault(seed.course),
    detail: `${seed.due} - ${formatEstimatedMinutes(seed.minutes)}`,
    starlight: seed.starlight,
    fromAnnouncement: seed.fromAnnouncement,
}));
