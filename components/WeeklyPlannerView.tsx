"use client";

import React, {useEffect, useMemo, useRef, useState} from "react";
import {useRouter} from "next/navigation";
import {CARD_HEIGHT_PX, calculateGridSpan, getStartOfWeek, getTodayString, packColumnOffsets, parseLocalDate} from "@/lib/utils";
import {Assignment} from "@/types/assignment";
import {Course} from "@/types/course";
import AssignmentCard from "./AssignmentCard";
import AddTaskModal from "./AddTaskModal";
import ManageCoursesModal from "./ManageCoursesModal";
import EditTaskModal from "./EditTaskModal";
import {getGamificationState, saveGamificationState} from "@/lib/gamification";
import {GamificationState, XpAward} from "@/types/gamification";
import {getTownState, saveTownGrowth} from "@/lib/townState";
import {TownState} from "@/types/townState";
import {applyDailyCompletion, applyGrowthAward, computeGrowthAward, isCompletionOnTime} from "@/lib/townGrowth";
import {useMascot} from "./world/LaptopFrame";
import {getTaskPlanningEstimates, getTaskPriority, getTaskSignature, selectTasksNeedingEstimates} from "@/lib/taskPlanning";
import {TaskPlanningEstimate, TaskPlanningEstimates} from "@/types/taskPlanning";
import {calculatePriority, PriorityResult} from "@/lib/prioritization";
import {classifyLabelType, courseAbbreviationDefault, dayCode} from "@/lib/taskLabel";
import {getTaskStatus, TaskStatus} from "@/lib/taskStatus";
import {appendProcrastinationRecord, getProcrastinationHistory, getProcrastinationIndexHours, recordTaskCompletion} from "@/lib/procrastinationHistory";
import {ProcrastinationHistory} from "@/types/procrastination";
import PomodoroTimer from "./PomodoroTimer";
import MusicPlayer from "./MusicPlayer";
import Spinner from "./Spinner";
import TaskStatusToggle from "./TaskStatusToggle";
import AIReviewPanel from "./AIReviewPanel";
import Taskbar from "./os/Taskbar";

function toDateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const FOCUS_TASK_STORAGE_KEY = "pomodoro_active_task_id";

/*
 * Canvas-synced tasks carry a real createdAt. Manually/AI-added tasks don't
 * (see AddTaskModal and the "planner:add-task" handler below), but their id
 * embeds the creation timestamp ("custom-<Date.now()>"), so it can be
 * recovered without adding a new field to those flows.
 */
function deriveAddedAt(task: Assignment): string | null {
    if (task.createdAt) return task.createdAt;

    if (task.id.startsWith("custom-")) {
        const timestamp = Number(task.id.slice("custom-".length));
        if (Number.isFinite(timestamp)) {
            return new Date(timestamp).toISOString();
        }
    }

    return null;
}

type WeeklyPlannerProps = {
    assignments: Assignment[];
    weekStartDate: Date;
    userName?: string | null;
    userEmail?: string | null;
}

// One row per (userId, taskId) in TaskCustomization — course/name/type/due
// overrides plus completion + deletion state for ANY task, custom or
// Canvas-synced. "" / false are the "unset" sentinels persistCustomization
// already used for the override fields; completed/deleted follow the same
// convention for consistency even though they're real booleans.
type TaskCustomizationState = {
    startAt: string;
    course: string;
    nameOverride: string;
    typeOverride: string;
    dueAtOverride: string;
    notes: string;
    completed: boolean;
    completedAt: string;
    inProgress: boolean;
    deleted: boolean;
};

const EMPTY_CUSTOMIZATION: TaskCustomizationState = {
    startAt: "",
    course: "",
    nameOverride: "",
    typeOverride: "",
    dueAtOverride: "",
    notes: "",
    completed: false,
    completedAt: "",
    inProgress: false,
    deleted: false,
};

function toCustomizationPatchBody(updates: TaskCustomizationState) {
    return {
        startAt: updates.startAt || null,
        course: updates.course || null,
        nameOverride: updates.nameOverride || null,
        typeOverride: updates.typeOverride || null,
        dueAtOverride: updates.dueAtOverride || null,
        notes: updates.notes || null,
        completed: updates.completed,
        completedAt: updates.completedAt || null,
        inProgress: updates.inProgress,
        deleted: updates.deleted,
    };
}

export default function WeeklyPlannerView({ assignments, weekStartDate, userName, userEmail }: WeeklyPlannerProps) {
    const router = useRouter();
    const [tasks, setTasks] = useState<Assignment[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [quickAddDueDate, setQuickAddDueDate] = useState<string | undefined>(undefined);
    const [isCourseManagerOpen, setIsCourseManagerOpen] = useState(false);
    const [selectedTask, setSelectedTask] = useState<Assignment | null>(null);
    const [gamification, setGamification] = useState<GamificationState>({ totalXp: 0, awardedTaskIds: [] });
    const [latestXpAward, setLatestXpAward] = useState<XpAward | null>(null);
    const [townState, setTownState] = useState<TownState>({
        currency: 0,
        libraryGrowth: 0,
        workshopGrowth: 0,
        trainingGroundsGrowth: 0,
        watchtowerGrowth: 0,
        townSquareGrowth: 0,
        currentStreak: 0,
        longestStreak: 0,
        graceTokens: 2,
        lastGoodDay: null,
        onboardingCompletedAt: null,
    });
    const mascot = useMascot();
    const [taskPlanning, setTaskPlanning] = useState<TaskPlanningEstimates>({});
    const [taskPlanningLoaded, setTaskPlanningLoaded] = useState(false);
    const [taskCustomizations, setTaskCustomizations] = useState<Record<string, TaskCustomizationState>>({});
    // Task ids currently playing the green completion pulse (app/globals.css's
    // task-complete-pulse) — purely a visual flash, cleared ~550ms after it's
    // triggered. Completing a task never moves it (see sortedTasks below), so
    // this has no effect on sort/layout, unlike the hold-then-slide mechanism
    // it replaced.
    const [pulsingIds, setPulsingIds] = useState<Set<string>>(new Set());
    const [customTasksLoaded, setCustomTasksLoaded] = useState(false);
    const [customizationsLoaded, setCustomizationsLoaded] = useState(false);
    const [procrastinationHistory, setProcrastinationHistory] = useState<ProcrastinationHistory>({});
    const [courses, setCourses] = useState<Course[]>([]);
    const [estimatingCount, setEstimatingCount] = useState(0);
    const [awardingXp, setAwardingXp] = useState(false);
    const [activeFocusTaskId, setActiveFocusTaskId] = useState<string | null>(null);
    const [procrastinationIndexByType, setProcrastinationIndexByType] = useState<Record<string, number | null>>({});
    const [calendarView, setCalendarView] = useState<"weekly" | "monthly">("weekly");
    const [theme, setTheme] = useState<"dark" | "light">(() => {
        if (typeof document === "undefined") return "dark";
        const domTheme = document.documentElement.dataset.theme;
        return domTheme === "light" ? "light" : "dark";
    });
    const pomodoroSectionRef = useRef<HTMLDivElement>(null);
    const musicSectionRef = useRef<HTMLDivElement>(null);
    const [activeWeekStart, setActiveWeekStart] = useState(() => {
        const start = new Date(weekStartDate);
        start.setHours(0, 0, 0, 0);
        return start;
    });
    const [activeMonthStart, setActiveMonthStart] = useState(() => {
        const start = new Date(weekStartDate);
        return new Date(start.getFullYear(), start.getMonth(), 1);
    });


    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    const days = Array.from({length: 7}).map((_,index) => {
        const date = new Date(activeWeekStart);
        date.setDate(activeWeekStart.getDate() + index);

        return {
            name: dayNames[index],
            dateNumber: date.getDate(),
            dateKey: toDateKey(date)
        };
    });

    const effectiveTasks = useMemo(
        () => tasks
            .filter((task) => !taskCustomizations[task.id]?.deleted)
            .map((task) => {
                const customization = taskCustomizations[task.id];
                if (!customization) return task;

                let next = task;

                if (customization.course) {
                    next = { ...next, course: customization.course };
                }

                if (customization.nameOverride) {
                    next = { ...next, name: customization.nameOverride };
                }

                if (customization.typeOverride) {
                    next = { ...next, typeOverride: customization.typeOverride as Assignment["typeOverride"] };
                }

                if (customization.dueAtOverride) {
                    const local = new Date(customization.dueAtOverride);

                    next = {
                        ...next,
                        dueAt: customization.dueAtOverride,
                        due: toDateKey(local),
                        dueFraction: (local.getHours() * 60 + local.getMinutes()) / (24 * 60),
                    };
                }

                return next;
            }),
        [tasks, taskCustomizations]
    );

    const courseAbbreviationByName = useMemo(
        () => new Map(courses.map((c) => [c.name, c.abbreviation || courseAbbreviationDefault(c.name)])),
        [courses]
    );

    // Chronological: due date, then time-of-day (dueFraction, absent = end
    // of day, same convention as calculateGridSpan), then course label —
    // deliberately independent of getTaskPriority/calculatePriority (see
    // computeTaskPriority below), so a low-importance task due earlier
    // still stacks above a high-importance task due later. Deliberately does
    // NOT consider completion status — completing a task never moves it
    // (Microsoft-Planner-style: soonest-due stays at the top regardless of
    // done/not-done), it only changes the card's styling.
    const sortedTasks = [...effectiveTasks].sort((a,b) => {
        const aDue = a.due ?? "9999-12-31";
        const bDue = b.due ?? "9999-12-31";

        if (aDue !== bDue) {
            return aDue < bDue ? -1 : 1;
        }

        const aFraction = a.dueFraction ?? 1;
        const bFraction = b.dueFraction ?? 1;

        if (aFraction !== bFraction) {
            return aFraction - bFraction;
        }

        const aCourseLabel = courseAbbreviationByName.get(a.course) ?? a.course;
        const bCourseLabel = courseAbbreviationByName.get(b.course) ?? b.course;

        return aCourseLabel.localeCompare(bCourseLabel);
    });

    const activeWeekEnd = new Date(activeWeekStart);
    activeWeekEnd.setDate(activeWeekStart.getDate() + 7);

    const tasksForActiveWeek = sortedTasks.filter((task) => {
        if (!task.due) return false;

        const dueDate = parseLocalDate(task.due);
        return dueDate >= activeWeekStart && dueDate < activeWeekEnd;
    });

    // Explicit per-task placement for the weekly grid below: computed once
    // here (rather than per-card at render time) so packColumnOffsets can
    // see every task's column span before deciding vertical offsets.
    // Replaces CSS Grid's own row mechanic entirely — a grid row's height
    // is shared across all 7 day columns (set by whichever column's item
    // is tallest that row), which produced large dead space under short
    // (completed) cards sharing a row with a tall (active) bar elsewhere.
    // Packing by independent per-column pixel cursors avoids that
    // cross-column coupling — see lib/utils.ts's packColumnOffsets comment.
    const weekTaskLayouts = tasksForActiveWeek.map((task) => ({
        task,
        span: calculateGridSpan(
            {
                dueDate: task.due,
                startDate: taskCustomizations[task.id]?.startAt || taskCustomizations[task.id]?.completedAt || undefined,
                dueFraction: task.dueFraction,
            },
            activeWeekStart
        ),
    }));

    // Single-day tasks are packed first (in their existing chronological
    // order) — they need no orderGroup floor at all, since a bar's last
    // occupied column is always its own due column, so single-day-first
    // processing order alone already guarantees no bar can land above a
    // single-day task sharing its column (see packColumnOffsets's
    // comment for the proof). Bars are packed afterward, sorted by due
    // date ascending (`columnEnd` is due-date-derived and unaffected by
    // startAt in calculateGridSpan's normal branch — this does NOT hold
    // for the overdue branch, but overdue tasks are always single-day and
    // never reach this comparator).
    //
    // Bars are tagged with an `orderGroup` split by completed/active
    // status: within either group, due-date order is still strictly
    // enforced (a later-due bar can never render above an earlier-due one
    // sharing a column) — but a completed bar and an active bar are free
    // to interleave via packColumnOffsets's skyline packing regardless of
    // due date, since the two statuses convey unrelated information and
    // the user explicitly asked for gap-filling between them rather than
    // a single global ordering (which cannot both fill every reachable
    // gap and keep one global due-date order — see the plan file for why).
    const singleDayLayouts = weekTaskLayouts.filter(({ span }) => span.columnEnd - span.columnStart === 1);
    const barLayouts = weekTaskLayouts
        .filter(({ span }) => span.columnEnd - span.columnStart > 1)
        .sort((a, b) => a.span.columnEnd - b.span.columnEnd);

    const { offsets: weekTaskOffsets, totalHeight: weekTaskLayerHeight } = packColumnOffsets([
        ...singleDayLayouts.map(({ task, span }) => ({
            id: task.id,
            columnStart: span.columnStart,
            columnEnd: span.columnEnd,
            heightPx: taskCustomizations[task.id]?.completed ? CARD_HEIGHT_PX.completed : CARD_HEIGHT_PX.active,
        })),
        ...barLayouts.map(({ task, span }) => ({
            id: task.id,
            columnStart: span.columnStart,
            columnEnd: span.columnEnd,
            heightPx: taskCustomizations[task.id]?.completed ? CARD_HEIGHT_PX.completed : CARD_HEIGHT_PX.active,
            orderGroup: taskCustomizations[task.id]?.completed ? "completed-bar" : "active-bar",
        })),
    ]);

    // Not derived from sortedTasks: a "due date" order is meaningless once
    // every task shares the same due-less sentinel, so this list keeps the
    // old priority-based order (matching the getTaskPriority label it still
    // renders below) instead of silently becoming course-alphabetical.
    // Same as sortedTasks above, completion status isn't a sort key.
    const tasksWithoutDueDate = useMemo(
        () => effectiveTasks
            .filter((task) => !task.due)
            .sort((a, b) => {
                const aPriority = getTaskPriority(a, taskPlanning[a.id]?.importance);
                const bPriority = getTaskPriority(b, taskPlanning[b.id]?.importance);

                return aPriority.rank - bPriority.rank;
            }),
        [effectiveTasks, taskPlanning]
    );

    const openTasks = useMemo(
        () => effectiveTasks.filter((task) => !(taskCustomizations[task.id]?.completed ?? false)),
        [effectiveTasks, taskCustomizations]
    );

    /*
     * Shared with the "focus task" lookup below, so both use the exact
     * same AI-informed scoring as the API (lib/prioritization.ts) plus
     * this student's per-task-type procrastination history — see
     * prioritizationModule.md and lib/procrastinationHistory.ts. This is
     * intentionally independent of the chronological (due date/time, then
     * course) sort used for the grid below.
     */
    const computeTaskPriority = (task: Assignment): PriorityResult => {
        const estimate = taskPlanning[task.id];

        return calculatePriority({
            name: task.name,
            due: task.due || null,
            importance: estimate?.importance ?? 5,
            difficulty: estimate?.difficulty ?? 5,
            consequence: estimate?.consequence ?? 5,
            estimatedMinutes: estimate?.estimatedMinutes ?? 30,
            procrastinationIndexHours: estimate?.assignmentType
                ? procrastinationIndexByType[estimate.assignmentType] ?? null
                : null,
        });
    };

    // The single highest-priority open task ("the frog").
    const upNext = useMemo(() => {
        let best: { task: Assignment; priority: PriorityResult } | null = null;

        for (const task of openTasks) {
            const priority = computeTaskPriority(task);

            if (!best || priority.score > best.priority.score) {
                best = { task, priority };
            }
        }

        return best;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [openTasks, taskPlanning, procrastinationIndexByType]);

    const activeFocusTask = useMemo(() => {
        if (!activeFocusTaskId) return null;

        const task = effectiveTasks.find((t) => t.id === activeFocusTaskId);
        if (!task || taskCustomizations[task.id]?.completed) return null;

        return { task, priority: computeTaskPriority(task) };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeFocusTaskId, effectiveTasks, taskCustomizations, taskPlanning, procrastinationIndexByType]);

    // Declared before any effect (several below reference it) rather than
    // near the other task handlers — a forward reference from inside a
    // useEffect callback to a const declared later in the component body.
    const persistCustomization = (
        taskId: string,
        updates: TaskCustomizationState
    ) => {
        setTaskCustomizations((current) => ({
            ...current,
            [taskId]: updates,
        }));

        fetch(`/api/task-customizations/${taskId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(toCustomizationPatchBody(updates)),
        }).catch((error) => {
            console.error("Could not save task customization", error);
        });
    };

    // Awaited variant used only by the one-time legacy-localStorage
    // migration effects below, which need to know whether a write
    // succeeded before deciding it's safe to clear the old key.
    const patchCustomizationAwaited = async (
        taskId: string,
        updates: TaskCustomizationState
    ): Promise<boolean> => {
        try {
            const response = await fetch(`/api/task-customizations/${taskId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(toCustomizationPatchBody(updates)),
            });

            if (response.ok) {
                setTaskCustomizations((current) => ({ ...current, [taskId]: updates }));
            }

            return response.ok;
        } catch {
            return false;
        }
    };

    useEffect(() => {
        if (activeFocusTaskId && !activeFocusTask) {
            setActiveFocusTaskId(null);
            localStorage.removeItem(FOCUS_TASK_STORAGE_KEY);
        }
    }, [activeFocusTaskId, activeFocusTask]);

    const setFocusTask = (id: string | null) => {
        setActiveFocusTaskId(id);

        if (id) {
            localStorage.setItem(FOCUS_TASK_STORAGE_KEY, id);
        } else {
            localStorage.removeItem(FOCUS_TASK_STORAGE_KEY);
        }
    };

    const monthGridStart = new Date(activeMonthStart);
    monthGridStart.setDate(1 - activeMonthStart.getDay());
    const monthDays = Array.from({ length: 42 }, (_, index) => {
        const date = new Date(monthGridStart);
        date.setDate(monthGridStart.getDate() + index);
        return date;
    });
    const monthLabel = activeMonthStart.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
    });
    const level = Math.floor(gamification.totalXp / 100) + 1;
    const xpTowardsNextLevel = gamification.totalXp % 100;

    const weekLabel = `${activeWeekStart.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
    })} – ${new Date(activeWeekEnd.getTime() - 1).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
    })}`;

    const changeWeek = (numberOfWeeks: number) => {
        setActiveWeekStart((currentWeekStart) => {
            const nextWeekStart = new Date(currentWeekStart);
            nextWeekStart.setDate(nextWeekStart.getDate() + numberOfWeeks * 7);
            return nextWeekStart;
        });
    };

    const returnToCurrentWeek = () => {
        setActiveWeekStart(getStartOfWeek());
    };

    const changeMonth = (numberOfMonths: number) => {
        setActiveMonthStart((currentMonthStart) => new Date(
            currentMonthStart.getFullYear(),
            currentMonthStart.getMonth() + numberOfMonths,
            1
        ));
    };

    const returnToCurrentMonth = () => {
        const today = new Date();
        setActiveMonthStart(new Date(today.getFullYear(), today.getMonth(), 1));
    };

    const refetchCourses = async () => {
        try {
            const response = await fetch("/api/courses");
            if (!response.ok) return;

            const data = await response.json() as { courses: Course[] };
            setCourses(data.courses ?? []);
        } catch (error) {
            console.error("Could not load courses", error);
        }
    };

    const handleCourseCreated = (course: Course) => {
        setCourses((current) => [...current, course]);
    };

    useEffect(() => {
        // Server-persisted (app/api/gamification/route.ts), unlike the
        // rest of this effect's plain localStorage reads — kept in its
        // own effect since it's async.
        let cancelled = false;

        void getGamificationState().then((savedGamification) => {
            if (!cancelled) setGamification(savedGamification);
        });

        void getTownState().then((savedTownState) => {
            if (!cancelled) setTownState(savedTownState);
        });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        const savedFocusTaskId = localStorage.getItem(FOCUS_TASK_STORAGE_KEY);
        setActiveFocusTaskId(savedFocusTaskId);

        // Resolve each Canvas-synced task's real due date/time from its
        // raw UTC instant using the browser's own local timezone (plain
        // Date getters, same as toDateKey below) rather than a guessed
        // institution timezone — this is the one place that conversion
        // happens, since it can only be done correctly client-side.
        const resolvedAssignments = assignments.map((task) => {
            if (!task.dueAt) return task;

            const local = new Date(task.dueAt);

            return {
                ...task,
                due: toDateKey(local),
                dueFraction: (local.getHours() * 60 + local.getMinutes()) / (24 * 60),
            };
        });

        // Custom (manually-added/AI-accepted) tasks are DB-backed
        // (CustomTask) — was localStorage ("custom_tasks"), which never
        // carried over between browser profiles for the same account.
        const loadCustomTasks = async () => {
            try {
                const response = await fetch("/api/custom-tasks");
                if (!response.ok) return;

                const data = await response.json() as { customTasks?: Assignment[] };

                setTasks([...resolvedAssignments, ...(data.customTasks ?? [])]);
            } catch (error) {
                console.error("Could not load custom tasks", error);
            } finally {
                setCustomTasksLoaded(true);
            }
        };

        const loadCustomizations = async () => {
            try {
                const response = await fetch("/api/task-customizations");
                if (!response.ok) return;

                const data = await response.json() as {
                    customizations: Array<{
                        taskId: string;
                        startAt: string | null;
                        course: string | null;
                        nameOverride: string | null;
                        typeOverride: string | null;
                        dueAtOverride: string | null;
                        notes: string | null;
                        completed: boolean;
                        completedAt: string | null;
                        inProgress: boolean;
                        deleted: boolean;
                    }>;
                };

                const next: Record<string, TaskCustomizationState> = {};
                for (const customization of data.customizations) {
                    next[customization.taskId] = {
                        startAt: customization.startAt ?? "",
                        course: customization.course ?? "",
                        nameOverride: customization.nameOverride ?? "",
                        typeOverride: customization.typeOverride ?? "",
                        dueAtOverride: customization.dueAtOverride ?? "",
                        notes: customization.notes ?? "",
                        completed: customization.completed,
                        completedAt: customization.completedAt ?? "",
                        inProgress: customization.inProgress,
                        deleted: customization.deleted,
                    };
                }

                setTaskCustomizations(next);
            } catch (error) {
                console.error("Could not load task customizations", error);
            } finally {
                setCustomizationsLoaded(true);
            }
        };

        void loadCustomTasks();
        void loadCustomizations();
        void refetchCourses();
    }, [assignments]);

    useEffect(() => {
        void getTaskPlanningEstimates().then((estimates) => {
            setTaskPlanning(estimates);
            setTaskPlanningLoaded(true);
        });
    }, []);

    useEffect(() => {
        void getProcrastinationHistory().then(setProcrastinationHistory);
    }, []);

    // One-time replay of any pre-existing localStorage data from before
    // custom tasks/deletions moved server-side, so a browser that already
    // had them doesn't silently lose them on upgrade. Only uploads a local
    // task the DB doesn't already have (never overwrites a DB row with a
    // possibly-stale local copy — the exact risk with two browser windows
    // open on the same account) and only clears the legacy keys once every
    // upload has actually succeeded, so a partial failure retries next load.
    const hasMigratedCustomTasks = useRef(false);

    useEffect(() => {
        if (hasMigratedCustomTasks.current || !customTasksLoaded) return;
        hasMigratedCustomTasks.current = true;

        const raw = localStorage.getItem("custom_tasks");
        if (!raw) return;

        const migrate = async () => {
            let localCustomTasks: Assignment[] = [];
            try {
                localCustomTasks = JSON.parse(raw);
            } catch {
                localStorage.removeItem("custom_tasks");
                return;
            }

            const deletedIds: string[] = (() => {
                try {
                    return JSON.parse(localStorage.getItem("deleted_task_ids") || "[]");
                } catch {
                    return [];
                }
            })();
            const deletedSet = new Set(deletedIds);
            const existingIds = new Set(tasks.map((task) => task.id));

            const uploaded: Assignment[] = [];
            let allOk = true;

            for (const task of localCustomTasks) {
                if (existingIds.has(task.id) || deletedSet.has(task.id)) continue;

                try {
                    const response = await fetch("/api/custom-tasks", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            id: task.id,
                            name: task.name,
                            course: task.course,
                            due: task.due ?? null,
                            dueAt: task.dueAt ?? null,
                            dueFraction: task.dueFraction ?? null,
                            sourceAnnouncementId: task.sourceAnnouncementId ?? null,
                        }),
                    });

                    if (response.ok) {
                        uploaded.push(task);
                    } else {
                        allOk = false;
                    }
                } catch {
                    allOk = false;
                }
            }

            if (uploaded.length > 0) {
                setTasks((current) => [...current, ...uploaded]);
            }

            if (allOk) {
                localStorage.removeItem("custom_tasks");
            }
        };

        void migrate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [customTasksLoaded]);

    const hasMigratedDeletedIds = useRef(false);

    useEffect(() => {
        if (hasMigratedDeletedIds.current || !customizationsLoaded) return;
        hasMigratedDeletedIds.current = true;

        const raw = localStorage.getItem("deleted_task_ids");
        if (!raw) return;

        const migrate = async () => {
            let deletedIds: string[] = [];
            try {
                deletedIds = JSON.parse(raw);
            } catch {
                localStorage.removeItem("deleted_task_ids");
                return;
            }

            // A custom-task id needs no tombstone — it's simply never
            // (re-)uploaded by the migration above.
            const canvasIds = deletedIds.filter((id) => !id.startsWith("custom-"));
            let allOk = true;

            for (const id of canvasIds) {
                if (taskCustomizations[id]?.deleted) continue;

                const ok = await patchCustomizationAwaited(id, {
                    ...(taskCustomizations[id] ?? EMPTY_CUSTOMIZATION),
                    deleted: true,
                });

                if (!ok) allOk = false;
            }

            if (allOk) {
                localStorage.removeItem("deleted_task_ids");
            }
        };

        void migrate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [customizationsLoaded]);

    // Task completion status ("task_states") was also localStorage-only
    // before this session, same cross-device-loss reasoning as the two
    // migrations above — a real backlog of completed tasks (with their
    // original completedAt dates) would otherwise silently vanish the
    // first time this browser loads the DB-backed version.
    const hasMigratedTaskStates = useRef(false);

    useEffect(() => {
        if (hasMigratedTaskStates.current || !customizationsLoaded) return;
        hasMigratedTaskStates.current = true;

        const raw = localStorage.getItem("task_states");
        if (!raw) return;

        const migrate = async () => {
            let states: Record<string, { completed: boolean; completedAt: string | null }> = {};
            try {
                states = JSON.parse(raw);
            } catch {
                localStorage.removeItem("task_states");
                return;
            }

            let allOk = true;

            for (const [id, state] of Object.entries(states)) {
                if (!state?.completed) continue;
                if (taskCustomizations[id]?.completed) continue;

                const ok = await patchCustomizationAwaited(id, {
                    ...(taskCustomizations[id] ?? EMPTY_CUSTOMIZATION),
                    completed: true,
                    completedAt: state.completedAt ?? "",
                });

                if (!ok) allOk = false;
            }

            if (allOk) {
                localStorage.removeItem("task_states");
            }
        };

        void migrate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [customizationsLoaded]);

    // AI planning estimates ("task_planning_estimates") were also
    // localStorage-only. Unlike a missing estimate (which just self-heals
    // via a recompute), a real existing cache here can be large — sending
    // it through POST /api/task-planning would mean re-running every one
    // of those through local Ollama just to move them server-side, which
    // this repo's own comments repeatedly flag as expensive GPU load to
    // avoid. PUT /api/task-planning stores already-computed values
    // directly, no Ollama call.
    const hasMigratedTaskPlanning = useRef(false);

    useEffect(() => {
        if (hasMigratedTaskPlanning.current || !taskPlanningLoaded) return;
        hasMigratedTaskPlanning.current = true;

        const raw = localStorage.getItem("task_planning_estimates");
        if (!raw) return;

        const migrate = async () => {
            let local: TaskPlanningEstimates = {};
            try {
                local = JSON.parse(raw);
            } catch {
                localStorage.removeItem("task_planning_estimates");
                return;
            }

            // Some cached entries predate the current TaskPlanningEstimate
            // shape entirely (e.g. a string "low"/"medium"/"high"
            // importance instead of a 1-10 number, missing
            // priorityScore/urgencyScore/frogScore) — real data found in
            // this app's own localStorage during this migration's own
            // testing. Those can't be migrated (nothing to coerce them
            // into); silently drop them rather than blocking on them
            // forever, since the live app already ignores/recomputes over
            // them today regardless.
            const isCurrentShape = (e: TaskPlanningEstimate) =>
                typeof e.importance === "number" &&
                typeof e.difficulty === "number" &&
                typeof e.consequence === "number" &&
                typeof e.estimatedMinutes === "number" &&
                typeof e.reason === "string" &&
                typeof e.priorityScore === "number" &&
                typeof e.urgencyScore === "number" &&
                typeof e.frogScore === "number" &&
                typeof e.priorityReason === "string" &&
                typeof e.signature === "string";

            const missing = Object.entries(local)
                .filter(([id, estimate]) => !taskPlanning[id] && isCurrentShape(estimate))
                .map(([id, estimate]) => ({ id, ...estimate }));

            if (missing.length === 0) {
                localStorage.removeItem("task_planning_estimates");
                return;
            }

            try {
                const response = await fetch("/api/task-planning", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ estimates: missing }),
                });

                if (response.ok) {
                    setTaskPlanning((current) => {
                        const next = { ...current };
                        for (const { id, ...estimate } of missing) {
                            next[id] = estimate;
                        }
                        return next;
                    });
                    localStorage.removeItem("task_planning_estimates");
                }
            } catch (error) {
                console.error("Could not migrate cached task planning estimates", error);
            }
        };

        void migrate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [taskPlanningLoaded]);

    // Procrastination-index history ("procrastination_history") was also
    // localStorage-only — losing it doesn't error anywhere, it just
    // silently degrades the priority formula's procrastination-index
    // input back to "no history," which the user would never see as a
    // bug report despite it being one.
    const hasMigratedProcrastinationHistory = useRef(false);

    useEffect(() => {
        if (hasMigratedProcrastinationHistory.current) return;
        hasMigratedProcrastinationHistory.current = true;

        const raw = localStorage.getItem("procrastination_history");
        if (!raw) return;

        const migrate = async () => {
            let local: ProcrastinationHistory = {};
            try {
                local = JSON.parse(raw);
            } catch {
                localStorage.removeItem("procrastination_history");
                return;
            }

            let allOk = true;

            for (const records of Object.values(local)) {
                for (const record of records) {
                    try {
                        const response = await fetch("/api/procrastination-history", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(record),
                        });

                        if (!response.ok) allOk = false;
                    } catch {
                        allOk = false;
                    }
                }
            }

            if (allOk) {
                localStorage.removeItem("procrastination_history");
                void getProcrastinationHistory().then(setProcrastinationHistory);
            }
        };

        void migrate();
    }, []);

    const updateTheme = (nextTheme: "dark" | "light") => {
        setTheme(nextTheme);
        localStorage.setItem("planner_theme", nextTheme);
        document.documentElement.dataset.theme = nextTheme;
    };

    useEffect(() => {
        document.documentElement.dataset.theme = theme;
    }, [theme]);

    const scrollToPomodoro = () => pomodoroSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    const scrollToMusic = () => musicSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

    useEffect(() => {
        // Wait for the persisted estimates to load first — otherwise every
        // page load would briefly see an empty taskPlanning map and kick
        // off a wasted Ollama recompute for every task before the real
        // (already-computed) values arrive a moment later.
        if (!taskPlanningLoaded) return;

        const tasksNeedingEstimates = selectTasksNeedingEstimates(tasks, taskPlanning);

        if (tasksNeedingEstimates.length === 0) return;

        const controller = new AbortController();

        setEstimatingCount(tasksNeedingEstimates.length);

        const estimateTasks = async () => {
            try {
                const response = await fetch("/api/task-planning", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    signal: controller.signal,
                    body: JSON.stringify({
                        tasks: tasksNeedingEstimates.map(({ id, name, course }) => ({ id, name, course })),
                    }),
                });

                if (!response.ok) return;

                const data = await response.json() as {
                    estimates: Array<Omit<TaskPlanningEstimate, "signature"> & { id: string }>;
                };

                setTaskPlanning((current) => {
                    const next = { ...current };

                    for (const estimate of data.estimates) {
                        const task = tasksNeedingEstimates.find(({ id }) => id === estimate.id);
                        if (!task) continue;

                        next[estimate.id] = {
                            ...estimate,
                            signature: getTaskSignature(task),
                        };
                    }

                    // POST /api/task-planning already persists server-side
                    // (compute-and-persist in one route) — no separate save.
                    return next;
                });
            } catch (error) {
                if ((error as Error).name !== "AbortError") {
                    console.error("Could not estimate task planning details", error);
                }
            } finally {
                if (!controller.signal.aborted) {
                    setEstimatingCount(0);
                }
            }
        };

        void estimateTasks();

        return () => controller.abort();
    }, [tasks, taskPlanning, taskPlanningLoaded]);

    useEffect(() => {
        const types = new Set(
            Object.values(taskPlanning)
                .map((estimate) => estimate.assignmentType)
                .filter((type): type is string => Boolean(type))
        );

        setProcrastinationIndexByType((current) => {
            const next: Record<string, number | null> = {};
            for (const type of types) {
                next[type] = getProcrastinationIndexHours(procrastinationHistory, type);
            }

            const changed =
                Object.keys(next).length !== Object.keys(current).length ||
                Object.entries(next).some(([type, value]) => current[type] !== value);

            return changed ? next : current;
        });
    }, [taskPlanning, procrastinationHistory]);

    useEffect(() => {
        const handleAIPlannerTask = (
            event: Event
        ) => {
            const customEvent =
                event as CustomEvent<Assignment>;

            const newTask =
                customEvent.detail;

            if (!newTask) return;

            setTasks((currentTasks) => {
                /*
                * Prevent accidental duplicate insertion if the
                * event somehow fires more than once.
                */
                if (
                    currentTasks.some(
                        (task) =>
                            task.id === newTask.id
                    )
                ) {
                    return currentTasks;
                }

                return [
                    ...currentTasks,
                    newTask,
                ];
            });

            // Keep AI-created tasks in the exact same DB-backed collection
            // (CustomTask) as manually-created tasks.
            fetch("/api/custom-tasks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: newTask.id,
                    name: newTask.name,
                    course: newTask.course,
                    due: newTask.due ?? null,
                    dueAt: newTask.dueAt ?? null,
                    dueFraction: newTask.dueFraction ?? null,
                    sourceAnnouncementId: newTask.sourceAnnouncementId ?? null,
                }),
            }).catch((error) => {
                console.error("Could not save custom task", error);
            });
        };

        window.addEventListener(
            "planner:add-task",
            handleAIPlannerTask
        );

        return () => {
            window.removeEventListener(
                "planner:add-task",
                handleAIPlannerTask
            );
        };
    }, []);

    const awardXpForTask = async (task: Assignment, completedAt: string | null, estimatedMinutes?: number) => {
        if (gamification.awardedTaskIds.includes(task.id)) return;

        let award: XpAward = { xp: 20, source: "fallback" };

        setAwardingXp(true);

        try {
            const response = await fetch("/api/task-xp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: task.name, course: task.course, due: task.due, completedAt, estimatedMinutes }),
            });

            if (response.ok) {
                award = await response.json() as XpAward;
            }
        } catch {
            // The fallback award keeps completion usable if the API is unavailable.
        } finally {
            setAwardingXp(false);
        }

        setGamification((current) => {
            if (current.awardedTaskIds.includes(task.id)) return current;

            const nextState = {
                totalXp: current.totalXp + award.xp,
                awardedTaskIds: [...current.awardedTaskIds, task.id],
            };

            saveGamificationState(nextState);

            // Town growth is awarded inside this same updater, gated by the
            // identical dedup check above — awardXpForTask's own early-return
            // guard reads a stale `gamification` closure, so without this a
            // rapid re-complete before that state commits would correctly
            // no-op XP but still double-award currency/growth.
            const taskCourse = courses.find((c) => c.name === task.course);
            const typeCode = task.typeOverride || classifyLabelType({
                name: task.name,
                course: task.course,
                isCustomCourse: taskCourse?.isCustom,
            });
            const growthAward = computeGrowthAward(typeCode, award.xp);
            const onTime = completedAt !== null && isCompletionOnTime(task.due, completedAt);

            setTownState((currentTown) => {
                const withGrowth = applyGrowthAward(currentTown, growthAward);
                const nextTown = applyDailyCompletion(withGrowth, onTime, completedAt ?? getTodayString());

                void saveTownGrowth(nextTown);
                return nextTown;
            });

            return nextState;
        });
        setLatestXpAward(award);
    };

    // Plays the green completion pulse (app/globals.css's task-complete-
    // pulse, ~550ms) in place — the card never moves, so this is a pure
    // visual flash with no sort/layout interaction.
    const COMPLETION_PULSE_MS = 550;

    const triggerCompletionPulse = (id: string) => {
        setPulsingIds((current) => new Set(current).add(id));

        setTimeout(() => {
            setPulsingIds((current) => {
                if (!current.has(id)) return current;
                const next = new Set(current);
                next.delete(id);
                return next;
            });
        }, COMPLETION_PULSE_MS);
    };

    // XP award + procrastination-history recording for a fresh completion.
    // Extracted so both the card's status control and EditTaskModal's Status
    // dropdown trigger the same side effects instead of risking drift.
    const awardCompletionSideEffects = (task: Assignment, estimatedMinutes?: number) => {
        const assignmentType = taskPlanning[task.id]?.assignmentType;
        const addedAt = deriveAddedAt(task);

        if (task.due && addedAt && assignmentType) {
            const record = {
                taskType: assignmentType,
                addedAt,
                dueAt: `${task.due}T23:59:59`,
                completedAt: new Date().toISOString(),
            };

            recordTaskCompletion(record);

            setProcrastinationHistory((currentHistory) => {
                const next = appendProcrastinationRecord(currentHistory, record);

                setProcrastinationIndexByType((currentIndex) => ({
                    ...currentIndex,
                    [assignmentType]: getProcrastinationIndexHours(next, assignmentType),
                }));

                return next;
            });
        }

        void awardXpForTask(task, getTodayString(), estimatedMinutes);
        mascot.say("taskComplete");
    };

    const handleSetStatus = (task: Assignment, newStatus: TaskStatus, estimatedMinutes?: number) => {
        const { id } = task;
        const current = taskCustomizations[id] ?? EMPTY_CUSTOMIZATION;
        const wasCompleted = current.completed;
        const wasInProgress = current.inProgress;

        persistCustomization(id, {
            ...current,
            completed: newStatus === "completed",
            completedAt: newStatus === "completed" ? getTodayString() : "",
            inProgress: newStatus === "in_progress",
        });

        if (newStatus === "in_progress" && !wasInProgress) {
            mascot.say("taskStart");
        }

        if (newStatus === "completed" && !wasCompleted) {
            triggerCompletionPulse(id);
            awardCompletionSideEffects(task, estimatedMinutes);
        }
    }
    const handleAddTask = (newTask: Assignment, startDate: string, notes: string) => {
        setTasks((current) => [...current, newTask]);

        fetch("/api/custom-tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                id: newTask.id,
                name: newTask.name,
                course: newTask.course,
                due: newTask.due ?? null,
                dueAt: newTask.dueAt ?? null,
                dueFraction: newTask.dueFraction ?? null,
                sourceAnnouncementId: newTask.sourceAnnouncementId ?? null,
            }),
        }).catch((error) => {
            console.error("Could not save custom task", error);
        });

        if (startDate || notes) {
            persistCustomization(newTask.id, { ...EMPTY_CUSTOMIZATION, startAt: startDate, notes });
        }
    }

    const openAddTask = () => {
        setQuickAddDueDate(undefined);
        setIsModalOpen(true);
    };

    const openAddTaskForDate = (dateKey: string) => {
        setQuickAddDueDate(dateKey);
        setIsModalOpen(true);
    };

    const handleDelete = (id:string) => {
        setTasks((current) => current.filter((task) => task.id !== id));

        if (id.startsWith("custom-")) {
            // Real row delete — a custom task needs no tombstone, unlike
            // a Canvas-synced one (which would just reappear on resync).
            fetch(`/api/custom-tasks/${id}`, { method: "DELETE" }).catch((error) => {
                console.error("Could not delete custom task", error);
            });
            return;
        }

        persistCustomization(id, {
            ...(taskCustomizations[id] ?? EMPTY_CUSTOMIZATION),
            deleted: true,
        });
    }

    const handleSaveTask = (updatedTask: Assignment, startDate: string, notes: string, status: TaskStatus) => {
        setTasks((current) =>
            current.map((task) => (task.id === updatedTask.id ? updatedTask : task))
        );

        // Custom tasks already keep their edited course on the DB row
        // above; only Canvas-synced tasks need a course override.
        const isCustomTask = updatedTask.id.startsWith("custom-");

        if (isCustomTask) {
            fetch(`/api/custom-tasks/${updatedTask.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: updatedTask.name,
                    course: updatedTask.course,
                    due: updatedTask.due ?? null,
                    dueAt: updatedTask.dueAt ?? null,
                    dueFraction: updatedTask.dueFraction ?? null,
                }),
            }).catch((error) => {
                console.error("Could not save custom task", error);
            });
        }
        const current = taskCustomizations[updatedTask.id];
        const rawTask = tasks.find((task) => task.id === updatedTask.id);

        // Only freeze a course override when the user actually picked a
        // different course than what's currently shown — otherwise saving
        // for an unrelated reason (a note, a start date) would silently
        // pin this task's course, so it stops tracking future renames of
        // whatever course it naturally belongs to.
        const previousEffectiveCourse = current?.course || rawTask?.course || "";
        const courseOverride = isCustomTask
            ? ""
            : updatedTask.course !== previousEffectiveCourse
                ? updatedTask.course
                : (current?.course ?? "");

        // Same "only pin when this save actually changed it" reasoning as
        // courseOverride above, applied to name and due date/time — a
        // plain notes-only save shouldn't silently freeze either one.
        const previousEffectiveName = current?.nameOverride || rawTask?.name || "";
        const nameOverride = isCustomTask
            ? ""
            : updatedTask.name !== previousEffectiveName
                ? updatedTask.name
                : (current?.nameOverride ?? "");

        const previousEffectiveDueAt = current?.dueAtOverride || rawTask?.dueAt || "";
        const dueAtOverride = isCustomTask
            ? ""
            : (updatedTask.dueAt ?? "") !== previousEffectiveDueAt
                ? (updatedTask.dueAt ?? "")
                : (current?.dueAtOverride ?? "");

        // EditTaskModal offers an explicit "Auto" option for type, so no
        // diffing heuristic is needed here — trust it directly.
        const typeOverride = isCustomTask ? "" : (updatedTask.typeOverride ?? "");

        // Status dropdown offers an explicit choice, same reasoning as
        // typeOverride above — trust it directly rather than diffing.
        const currentStatus = getTaskStatus(current?.completed ?? false, current?.inProgress ?? false);
        const statusChanged = status !== currentStatus;

        const changed =
            (current?.startAt ?? "") !== startDate ||
            (current?.notes ?? "") !== notes ||
            (current?.course ?? "") !== courseOverride ||
            (current?.nameOverride ?? "") !== nameOverride ||
            (current?.dueAtOverride ?? "") !== dueAtOverride ||
            (current?.typeOverride ?? "") !== typeOverride ||
            statusChanged;

        if (changed) {
            persistCustomization(updatedTask.id, {
                startAt: startDate,
                course: courseOverride,
                nameOverride,
                typeOverride,
                dueAtOverride,
                notes,
                // Carry forward — persistCustomization replaces the whole
                // row, so omitting these would silently un-complete/
                // un-delete the task on every unrelated detail save.
                completed: status === "completed",
                completedAt: status === "completed"
                    ? (current?.completed ? (current?.completedAt ?? "") : getTodayString())
                    : "",
                inProgress: status === "in_progress",
                deleted: current?.deleted ?? false,
            });

            if (statusChanged && status === "completed") {
                triggerCompletionPulse(updatedTask.id);
                awardCompletionSideEffects(updatedTask, taskPlanning[updatedTask.id]?.estimatedMinutes);
            }
        }

    }

    return (
        <>
        <div className = "theme-surface planner-shell w-full bg-slate-950 text-white p-6 rounded-2xl border border-slate-800">

            {estimatingCount > 0 && (
                <p className="mb-4 flex items-center gap-2 text-xs font-medium text-slate-400">
                    <Spinner className="h-3.5 w-3.5" />
                    🧠 Estimating priority for {estimatingCount} task{estimatingCount === 1 ? "" : "s"} in the background...
                </p>
            )}

            {upNext && (
                <div className="mb-5 rounded-xl border border-amber-500/60 bg-amber-950/20 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-amber-400">
                                🐸 Eat this frog next
                            </p>
                            <h2 className="mt-0.5 text-lg font-semibold text-white">{upNext.task.name}</h2>
                            <p className="text-sm text-slate-400">
                                {upNext.task.course || "General"}
                                {upNext.task.due ? ` · Due ${upNext.task.due}` : ""}
                            </p>
                            <p className="mt-1 text-sm text-amber-200">{upNext.priority.reason}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            <TaskStatusToggle
                                status={getTaskStatus(
                                    taskCustomizations[upNext.task.id]?.completed ?? false,
                                    taskCustomizations[upNext.task.id]?.inProgress ?? false
                                )}
                                onChange={(next) => handleSetStatus(upNext.task, next, taskPlanning[upNext.task.id]?.estimatedMinutes)}
                            />
                            <button
                                type="button"
                                onClick={() => setFocusTask(upNext.task.id)}
                                disabled={activeFocusTaskId === upNext.task.id}
                                className="rounded-lg border border-amber-500/60 px-3 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {activeFocusTaskId === upNext.task.id ? "🎯 Focused" : "🎯 Focus in Pomodoro"}
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSetStatus(upNext.task, "completed", taskPlanning[upNext.task.id]?.estimatedMinutes)}
                                className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400"
                            >
                                Mark done
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <AddTaskModal
                isOpen = {isModalOpen}
                defaultDue = {quickAddDueDate}
                courses = {courses}
                onCourseCreated = {handleCourseCreated}
                onClose = {() => setIsModalOpen(false)}
                onAddTask = {handleAddTask}
            />

            <ManageCoursesModal
                isOpen={isCourseManagerOpen}
                onClose={() => setIsCourseManagerOpen(false)}
                onChanged={() => {
                    router.refresh();
                    void refetchCourses();
                }}
            />

            <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                <div ref={pomodoroSectionRef}>
                    <PomodoroTimer
                        focusTask={
                            activeFocusTask
                                ? {
                                      id: activeFocusTask.task.id,
                                      name: activeFocusTask.task.name,
                                      course: activeFocusTask.task.course,
                                      due: activeFocusTask.task.due,
                                      priorityReason: activeFocusTask.priority.reason,
                                  }
                                : null
                        }
                        onClearFocusTask={() => setFocusTask(null)}
                    />
                </div>
                <div ref={musicSectionRef}>
                    <MusicPlayer />
                </div>
            </div>

            <EditTaskModal
                task = {selectedTask}
                isOpen = {selectedTask !== null}
                startDate = {taskCustomizations[selectedTask?.id ?? ""]?.startAt ?? ""}
                notes = {taskCustomizations[selectedTask?.id ?? ""]?.notes ?? ""}
                status = {getTaskStatus(
                    taskCustomizations[selectedTask?.id ?? ""]?.completed ?? false,
                    taskCustomizations[selectedTask?.id ?? ""]?.inProgress ?? false
                )}
                estimatedMinutes = {taskPlanning[selectedTask?.id ?? ""]?.estimatedMinutes}
                courses = {courses}
                onCourseCreated = {handleCourseCreated}
                onClose = {() => setSelectedTask(null)}
                onSaveTask = {handleSaveTask}
                onDeleteTask = {handleDelete}
            />

            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex rounded-lg bg-slate-900 p-1" role="tablist" aria-label="Calendar view">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={calendarView === "weekly"}
                        onClick={() => setCalendarView("weekly")}
                        className={`rounded-md px-3 py-1.5 text-sm font-medium ${calendarView === "weekly" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"}`}
                    >
                        Weekly
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={calendarView === "monthly"}
                        onClick={() => {
                            setActiveMonthStart(new Date(activeWeekStart.getFullYear(), activeWeekStart.getMonth(), 1));
                            setCalendarView("monthly");
                        }}
                        className={`rounded-md px-3 py-1.5 text-sm font-medium ${calendarView === "monthly" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"}`}
                    >
                        Monthly
                    </button>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                        type="button"
                        onClick={() => calendarView === "weekly" ? changeWeek(-1) : changeMonth(-1)}
                        className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
                        aria-label={`Show previous ${calendarView === "weekly" ? "week" : "month"}`}
                    >
                        ← Previous
                    </button>
                    <div className="min-w-32 text-center text-sm font-semibold text-slate-200">
                        {calendarView === "weekly" ? weekLabel : monthLabel}
                    </div>
                    <button
                        type="button"
                        onClick={calendarView === "weekly" ? returnToCurrentWeek : returnToCurrentMonth}
                        className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
                    >
                        This {calendarView === "weekly" ? "week" : "month"}
                    </button>
                    <button
                        type="button"
                        onClick={() => calendarView === "weekly" ? changeWeek(1) : changeMonth(1)}
                        className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
                        aria-label={`Show next ${calendarView === "weekly" ? "week" : "month"}`}
                    >
                        Next →
                    </button>
                </div>
            </div>

            {calendarView === "weekly" ? (
                <>
                    <div className = "grid grid-cols-7 gap-2 border-b border-slate-800 pb-4 mb-4 text-center">
                        {days.map((day, idx) => (
                            <div key={idx} className = "flex flex-col items-center gap-1">
                                <span className = "text-xs font-bold text-slate-400 uppercase tracking-wider">{day.name}</span>
                                <span className = "text-base font-semibold text-slate-200 mt-1">{day.dateNumber}</span>
                                <button
                                    type="button"
                                    onClick={() => openAddTaskForDate(day.dateKey)}
                                    className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-700 text-xs leading-none text-slate-400 transition-colors hover:border-indigo-500 hover:bg-indigo-600/20 hover:text-white"
                                    aria-label={`Add task due ${day.dateKey}`}
                                    title="Add task due this day"
                                >
                                    +
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className = "relative min-h-[400px]">
                        <div className = "absolute inset-0 grid grid-cols-7 gap-2 pointer-events-none">
                            {Array.from({length: 7}).map((_, idx) => (
                                <div key = {idx} className = "border-r border-slate-800/80 h-full rounded-lg bg-slate-900/30" />
                            ))}
                        </div>

                        <div className="relative z-10 py-2" style={{ height: weekTaskLayerHeight }}>
                            {weekTaskLayouts.map(({ task, span }) => {
                                const taskCustomization = taskCustomizations[task.id];
                                const estimate = taskPlanning[task.id];
                                const { columnStart, columnEnd, endInsetPercent } = span;

                                const taskCourse = courses.find((c) => c.name === task.course);
                                const taskCourseAbbreviation = taskCourse?.abbreviation || courseAbbreviationDefault(task.course);
                                const taskTypeCode = task.typeOverride || classifyLabelType({
                                    name: task.name,
                                    course: task.course,
                                    isCustomCourse: taskCourse?.isCustom,
                                });
                                const taskDayCode = dayCode(task.due) ?? "—";

                                return (
                                    <AssignmentCard
                                        key = {task.id}
                                        id = {task.id}
                                        name = {task.name}
                                        courseAbbreviation = {taskCourseAbbreviation}
                                        typeCode = {taskTypeCode}
                                        dayCode = {taskDayCode}
                                        due = {task.due}
                                        dueAt = {task.dueAt}
                                        course = {task.course}
                                        courseColor = {taskCourse?.color}
                                        columnStart = {columnStart}
                                        columnEnd = {columnEnd}
                                        topPx = {weekTaskOffsets.get(task.id) ?? 0}
                                        dueEndInsetPercent = {endInsetPercent}
                                        status = {getTaskStatus(taskCustomization?.completed ?? false, taskCustomization?.inProgress ?? false)}
                                        completedAt = {taskCustomization?.completedAt || null}
                                        isCompleting = {pulsingIds.has(task.id)}
                                        estimatedMinutes = {estimate?.estimatedMinutes}
                                        isFocused={task.id === activeFocusTaskId}
                                        onSetStatus = {(newStatus) => handleSetStatus(task, newStatus, estimate?.estimatedMinutes)}
                                        onDelete = {handleDelete}
                                        onFocus={(id) => setFocusTask(id === activeFocusTaskId ? null : id)}
                                        onOpen={() => setSelectedTask(task)}
                                    />
                                );
                            })}
                        </div>
                    </div>
                </>
            ) : (
                <div>
                    <div className="grid grid-cols-7 gap-1 border-b border-slate-800 pb-2 text-center">
                        {dayNames.map((day) => (
                            <span key={day} className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{day}</span>
                        ))}
                    </div>
                    <div className="mt-2 grid grid-cols-7 gap-1">
                        {monthDays.map((date) => {
                            const dateKey = toDateKey(date);
                            const dayTasks = sortedTasks.filter((task) => task.due === dateKey);
                            const isCurrentMonth = date.getMonth() === activeMonthStart.getMonth();
                            const isToday = dateKey === getTodayString();

                            return (
                                <div key={dateKey} className={`group relative min-h-28 rounded-lg border p-1.5 ${isCurrentMonth ? "border-slate-800 bg-slate-900/50" : "border-slate-900 bg-slate-950/40 text-slate-600"}`}>
                                    <div className="mb-1 flex items-center justify-between">
                                        <div className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${isToday ? "bg-indigo-600 text-white" : ""}`}>{date.getDate()}</div>
                                        <button
                                            type="button"
                                            onClick={() => openAddTaskForDate(dateKey)}
                                            className="rounded px-1 text-xs leading-none text-slate-400 opacity-0 transition-opacity hover:text-white group-hover:opacity-100 focus:opacity-100"
                                            aria-label={`Add task due ${dateKey}`}
                                            title="Add task due this day"
                                        >
                                            +
                                        </button>
                                    </div>
                                    <div className="space-y-1">
                                        {dayTasks.slice(0, 3).map((task) => {
                                            const completed = taskCustomizations[task.id]?.completed ?? false;
                                            const status = getTaskStatus(completed, taskCustomizations[task.id]?.inProgress ?? false);
                                            const estimate = taskPlanning[task.id];
                                            const isOverdue = task.due < getTodayString() && !completed;

                                            return (
                                                <div
                                                    key={task.id}
                                                    onClick={() => setSelectedTask(task)}
                                                    className={`group flex cursor-pointer items-center gap-1 rounded px-1 text-[10px] leading-tight transition-opacity ${completed ? "py-0 opacity-55 hover:opacity-90" : "py-0.5"} ${pulsingIds.has(task.id) ? "task-card--completing" : ""} ${completed ? "bg-green-950/40 text-slate-500" : status === "in_progress" ? "bg-indigo-950/40 text-slate-200" : isOverdue ? "bg-rose-950/80 text-rose-100" : "bg-slate-800 text-slate-200"}`}
                                                >
                                                    <TaskStatusToggle
                                                        size="sm"
                                                        status={status}
                                                        onChange={(next) => handleSetStatus(task, next, estimate?.estimatedMinutes)}
                                                    />
                                                    <span className={`min-w-0 truncate ${completed ? "line-through" : ""}`}>{task.name}</span>
                                                </div>
                                            );
                                        })}
                                        {dayTasks.length > 3 && <p className="px-1 text-[10px] text-slate-400">+{dayTasks.length - 3} more</p>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <section className="mx-auto mt-8 max-w-2xl border-t border-slate-800 pt-6">
                <div className="mb-4">
                    <h2 className="text-lg font-semibold text-slate-100">
                        Tasks without a due date ({tasksWithoutDueDate.length})
                    </h2>
                    <p className="text-sm text-slate-400">Click a task to view or edit its details.</p>
                </div>

                {tasksWithoutDueDate.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-700 px-4 py-8 text-center text-sm text-slate-400">
                        Every task has a due date.
                    </p>
                ) : (
                    <div className="space-y-2">
                        {tasksWithoutDueDate.map((task) => {
                            const completed = taskCustomizations[task.id]?.completed ?? false;
                            const status = getTaskStatus(completed, taskCustomizations[task.id]?.inProgress ?? false);
                            const estimate = taskPlanning[task.id];
                            const priority = getTaskPriority(task, estimate?.importance);

                            return (
                                <div
                                    key={task.id}
                                    onClick={() => setSelectedTask(task)}
                                    className={`group flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${pulsingIds.has(task.id) ? "task-card--completing" : ""} ${completed ? "border-slate-800 bg-slate-900/50 text-slate-500" : status === "in_progress" ? "border-indigo-500/60 bg-indigo-950/20" : "border-slate-700 bg-slate-900 hover:border-slate-600"}`}
                                >
                                    <TaskStatusToggle
                                        status={status}
                                        onChange={(next) => handleSetStatus(task, next, estimate?.estimatedMinutes)}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <p className={`truncate font-medium ${completed ? "line-through" : "text-slate-100"}`}>{task.name}</p>
                                        <p className="text-xs text-slate-400">
                                            {task.course || "General"}{estimate ? ` · Est. ${estimate.estimatedMinutes} min · ${priority.label}` : ""}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            handleDelete(task.id);
                                        }}
                                        className="rounded px-2 py-1 text-xs text-slate-400 opacity-0 transition-opacity hover:bg-rose-950/40 hover:text-rose-400 group-hover:opacity-100 focus:opacity-100"
                                        aria-label={`Delete ${task.name}`}
                                    >
                                        ✕
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            <AIReviewPanel />
        </div>

        <Taskbar
            theme={theme}
            onSetTheme={updateTheme}
            level={level}
            totalXp={gamification.totalXp}
            xpTowardsNextLevel={xpTowardsNextLevel}
            awardingXp={awardingXp}
            latestXpAward={latestXpAward}
            currency={townState.currency}
            currentStreak={townState.currentStreak}
            onAddTask={openAddTask}
            onOpenCourses={() => setIsCourseManagerOpen(true)}
            onScrollToPomodoro={scrollToPomodoro}
            onScrollToMusic={scrollToMusic}
            userName={userName}
            userEmail={userEmail}
        />
        </>
    );
}
