"use client";

import React, {useEffect, useMemo, useRef, useState} from "react";
import {useRouter} from "next/navigation";
import {CARD_HEIGHT_PX, calculateGridSpan, endOfDayInstant, formatTimeInputValue, getStartOfWeek, getTodayString, hasCustomStartDatePassed, packColumnOffsets, parseLocalDate, resolveDueTime} from "@/lib/utils";
import {Assignment} from "@/types/assignment";
import {Course} from "@/types/course";
import {RecurringTask} from "@/types/recurringTask";
import {expandOccurrences, shiftDateKey} from "@/lib/recurrence";
import {RecurrenceFieldValue} from "./RecurrenceField";
import AssignmentCard from "./AssignmentCard";
import AddTaskModal from "./AddTaskModal";
import EditTaskModal, {RecurrenceScope} from "./EditTaskModal";
import RecurringTasksPanel from "./RecurringTasksPanel";
import {getGamificationState, saveGamificationState} from "@/lib/gamification";
import {GamificationState, XpAward} from "@/types/gamification";
import {useStarChart} from "@/components/starchart/StarChartContext";
import {StarIcon} from "@/components/brand/Icons";
import {useMascot} from "./world/LaptopFrame";
import {getTaskPlanningEstimates, getTaskPriority, getTaskSignature, selectTasksNeedingEstimates} from "@/lib/taskPlanning";
import {TaskPlanningEstimate, TaskPlanningEstimates} from "@/types/taskPlanning";
import {calculatePriority, PriorityResult} from "@/lib/prioritization";
import {classifyLabelType, courseAbbreviationDefault, dayCode} from "@/lib/taskLabel";
import {getTaskStatus, TaskStatus} from "@/lib/taskStatus";
import {appendProcrastinationRecord, getProcrastinationHistory, getProcrastinationIndexHours, recordTaskCompletion} from "@/lib/procrastinationHistory";
import {ProcrastinationHistory} from "@/types/procrastination";
import Spinner from "./Spinner";
import TaskStatusToggle from "./TaskStatusToggle";
import Taskbar from "./os/Taskbar";
import { usePomodoroRemote } from "./os/PomodoroRemoteContext";
import { useCoursesRemote } from "./os/CoursesRemoteContext";
import { ProposedTask } from "@/types/proposedTask";
import { PersistedCandidate, AddedFromCanvasItem } from "@/types/rundown";
import { savePlannerSettings } from "@/lib/plannerSettings";
import RundownOverlay from "./rundown/RundownOverlay";
import StillDecidingPanel from "./rundown/StillDecidingPanel";

function toDateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// How far ahead of today recurring-task occurrences get materialized on
// each load. There's no background job anywhere in this app (see
// PROGRESS.md), so this is a fixed rolling window re-extended every time
// the planner mounts, not a per-week fetch — navigating further ahead than
// this in one sitting shows empty weeks for a series until the next reload
// pushes the window forward again.
const RECURRENCE_HORIZON_WEEKS = 8;

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

type InitialRundown = {
    shouldAutoShow: boolean;
    maybeCount: number;
    autoAcceptAiTasks: boolean;
};

type WeeklyPlannerProps = {
    assignments: Assignment[];
    userName?: string | null;
    userEmail?: string | null;
    // Computed once, server-side (app/page.tsx), from PlannerSettings +
    // pending/maybe AnnouncementSuggestionReview counts — cheap enough to
    // compute on every page load without a client round trip before first
    // paint. The full candidate/item payloads are still fetched lazily by
    // this component's own mount effect (GET /api/rundown-candidates),
    // same as every other piece of planner state here.
    initialRundown?: InitialRundown;
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

export default function WeeklyPlannerView({ assignments, userName, userEmail, initialRundown }: WeeklyPlannerProps) {
    const router = useRouter();
    const [tasks, setTasks] = useState<Assignment[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [quickAddDueDate, setQuickAddDueDate] = useState<string | undefined>(undefined);
    const [selectedTask, setSelectedTask] = useState<Assignment | null>(null);
    const [gamification, setGamification] = useState<GamificationState>({ totalXp: 0, awardedTaskIds: [] });
    const [latestXpAward, setLatestXpAward] = useState<XpAward | null>(null);
    // Scratch space for awardXpForTask's persistence calls — see the comment
    // there for why the actual PATCHes must not live inside a setState
    // updater body.
    const latestGamificationRef = useRef<GamificationState | null>(null);
    const starChart = useStarChart();
    const mascot = useMascot();
    const [taskPlanning, setTaskPlanning] = useState<TaskPlanningEstimates>({});
    const [taskPlanningLoaded, setTaskPlanningLoaded] = useState(false);
    const [taskCustomizations, setTaskCustomizations] = useState<Record<string, TaskCustomizationState>>({});
    // Refreshed on a timer (not just at mount) so a custom start date that
    // passes while the tab stays open flips back to auto live, without a
    // reload — see hasCustomStartDatePassed's call sites below.
    const [todayKey, setTodayKey] = useState(getTodayString());
    // Task ids currently playing the green completion pulse (app/globals.css's
    // task-complete-pulse) — purely a visual flash, cleared ~550ms after it's
    // triggered. Completing a task never moves it (see sortedTasks below), so
    // this has no effect on sort/layout, unlike the hold-then-slide mechanism
    // it replaced.
    const [pulsingIds, setPulsingIds] = useState<Set<string>>(new Set());
    const [customTasksLoaded, setCustomTasksLoaded] = useState(false);
    const [customizationsLoaded, setCustomizationsLoaded] = useState(false);
    const [recurringTasks, setRecurringTasks] = useState<RecurringTask[]>([]);
    const [isRecurringPanelOpen, setIsRecurringPanelOpen] = useState(false);
    const [procrastinationHistory, setProcrastinationHistory] = useState<ProcrastinationHistory>({});
    const [courses, setCourses] = useState<Course[]>([]);
    const [estimatingCount, setEstimatingCount] = useState(0);
    // AutoTaskCreation.md's Rundown screen. showRundown is seeded once
    // from the server-computed initialRundown.shouldAutoShow (see
    // app/page.tsx) — a plain `useState(() => ...)` initializer, not an
    // effect, so it can't re-trigger the auto-show after the user
    // dismisses it later in the same session.
    const [pendingCandidates, setPendingCandidates] = useState<PersistedCandidate[]>([]);
    const [maybeCandidates, setMaybeCandidates] = useState<PersistedCandidate[]>([]);
    const [addedFromCanvas, setAddedFromCanvas] = useState<AddedFromCanvasItem[]>([]);
    const [autoAcceptAiTasks, setAutoAcceptAiTasks] = useState(initialRundown?.autoAcceptAiTasks ?? false);
    const [showRundown, setShowRundown] = useState(() => initialRundown?.shouldAutoShow ?? false);
    const [showStillDeciding, setShowStillDeciding] = useState(false);
    const [awardingXp, setAwardingXp] = useState(false);
    const { focusTaskId, setFocusTask, setFocusTaskSummary } = usePomodoroRemote();
    const { coursesVersion } = useCoursesRemote();
    const [procrastinationIndexByType, setProcrastinationIndexByType] = useState<Record<string, number | null>>({});
    const [calendarView, setCalendarView] = useState<"weekly" | "monthly">("weekly");
    const [theme, setTheme] = useState<"dark" | "light">(() => {
        if (typeof document === "undefined") return "dark";
        const domTheme = document.documentElement.dataset.theme;
        return domTheme === "light" ? "light" : "dark";
    });
    const [activeWeekStart, setActiveWeekStart] = useState(() => getStartOfWeek());
    const [activeMonthStart, setActiveMonthStart] = useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1);
    });

    // getStartOfWeek()'s no-arg default evaluates `new Date()` wherever it
    // runs — during SSR that's the server's (Vercel: UTC) clock, not the
    // viewer's. A Date instant survives the server/client boundary fine,
    // but re-deriving "today" from it via local getters after hydration
    // does not: it can land on a different calendar day than the same
    // getters would give the server, silently mislabeling every day
    // column (see PROGRESS.md's "Weekly grid layout" for the full story).
    // Re-run once client-side, exactly like the "Today" button does, to
    // correct the SSR-seeded guess.
    useEffect(() => {
        const start = getStartOfWeek();
        setActiveWeekStart(start);
        setActiveMonthStart(new Date(start.getFullYear(), start.getMonth(), 1));
    }, []);

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
    //
    // An expired custom start date is treated as unset here (not cleared in
    // the DB — see hasCustomStartDatePassed) so a stale override can't keep
    // stretching a bar further into the past every day it goes un-edited.
    const resolveStartAt = (startAt: string) =>
        startAt && hasCustomStartDatePassed(startAt, todayKey) ? "" : startAt;

    const weekTaskLayouts = tasksForActiveWeek.map((task) => ({
        task,
        span: calculateGridSpan(
            {
                dueDate: task.due,
                startDate: resolveStartAt(taskCustomizations[task.id]?.startAt ?? "") || taskCustomizations[task.id]?.completedAt || undefined,
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
            startAt: resolveStartAt(taskCustomizations[task.id]?.startAt ?? "") || null,
            today: todayKey,
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

            if (priority.notYetStartable) continue;

            if (!best || priority.score > best.priority.score) {
                best = { task, priority };
            }
        }

        return best;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [openTasks, taskPlanning, procrastinationIndexByType, todayKey, taskCustomizations]);

    const activeFocusTask = useMemo(() => {
        if (!focusTaskId) return null;

        const task = effectiveTasks.find((t) => t.id === focusTaskId);
        if (!task || taskCustomizations[task.id]?.completed) return null;

        return { task, priority: computeTaskPriority(task) };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focusTaskId, effectiveTasks, taskCustomizations, taskPlanning, procrastinationIndexByType]);

    // Publishes the rich focus-task summary into PomodoroRemoteContext
    // whenever it changes — the context owns *which* task id is focused
    // (setFocusTask/focusTaskId, above), but the rich {name,course,due,
    // priorityReason} shape needs effectiveTasks/taskCustomizations/
    // taskPlanning, which only exist here, so this stays a one-way publish
    // rather than moving the whole computation into the context.
    useEffect(() => {
        setFocusTaskSummary(
            activeFocusTask
                ? {
                      id: activeFocusTask.task.id,
                      name: activeFocusTask.task.name,
                      course: activeFocusTask.task.course,
                      due: activeFocusTask.task.due,
                      priorityReason: activeFocusTask.priority.reason,
                  }
                : null
        );
    }, [activeFocusTask, setFocusTaskSummary]);

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
        if (focusTaskId && !activeFocusTask) {
            setFocusTask(null);
        }
    }, [focusTaskId, activeFocusTask, setFocusTask]);

    // Cheap string comparison, not a write — deliberately never persists an
    // expired custom start date (see the plan's "derive at read time"
    // decision): a periodic PATCH from an idle tab would clobber whatever
    // an unrelated tab just changed on the same TaskCustomization row,
    // since persistCustomization replaces the whole row from a snapshot.
    useEffect(() => {
        const interval = setInterval(() => {
            setTodayKey((prev) => {
                const current = getTodayString();
                return current === prev ? prev : current;
            });
        }, 60_000);

        return () => clearInterval(interval);
    }, []);

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

    // The Courses OS window (components/os/CoursesWindow.tsx) is mounted by
    // LaptopFrame, an ancestor of this component, so it can't call back
    // into this component's own onChanged handler directly — it bumps
    // coursesVersion via CoursesRemoteContext instead, and this effect
    // reacts to that the same way the old <ManageCoursesModal onChanged>
    // prop used to.
    useEffect(() => {
        if (coursesVersion === 0) return;
        router.refresh();
        void refetchCourses();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [coursesVersion]);

    useEffect(() => {
        // Server-persisted (app/api/gamification/route.ts), unlike the
        // rest of this effect's plain localStorage reads — kept in its
        // own effect since it's async.
        let cancelled = false;

        void getGamificationState().then((savedGamification) => {
            if (!cancelled) {
                latestGamificationRef.current = savedGamification;
                setGamification(savedGamification);
            }
        });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
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

        void loadCustomTasks();
        void loadTaskCustomizations();
        void refetchCourses();
    }, [assignments]);

    // Hydrates the Rundown/Still-Deciding screens' full item payloads.
    // Deliberately does NOT trigger the AI detection pass itself — that
    // only ever runs from DetectionTriggerControls' explicit button (see
    // app/api/ai/analyze-announcements/route.ts's rate limit) — this just
    // reads whatever has already been persisted.
    useEffect(() => {
        (async () => {
            try {
                const response = await fetch("/api/rundown-candidates");
                if (!response.ok) return;

                const data = await response.json() as {
                    pending?: PersistedCandidate[];
                    maybe?: PersistedCandidate[];
                    addedFromCanvas?: AddedFromCanvasItem[];
                };

                setPendingCandidates(data.pending ?? []);
                setMaybeCandidates(data.maybe ?? []);
                setAddedFromCanvas(data.addedFromCanvas ?? []);
            } catch (error) {
                console.error("Could not load rundown candidates", error);
            }
        })();
    }, []);

    // Hoisted out of the mount effect above so a recurring-series change
    // (pause/resume/edit-pattern/delete via RecurringTasksPanel, which
    // tombstones occurrences server-side through TaskCustomization) can
    // re-pull the latest completed/deleted state on demand too, not just
    // once at mount.
    async function loadTaskCustomizations() {
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
    }

    // Fetches the user's recurring-task templates and, for each active one,
    // materializes any occurrence dates within the rolling horizon that
    // don't already have a CustomTask row — purely additive (see
    // app/api/recurring-tasks/[id]/occurrences/route.ts), so a completed,
    // deleted, or individually-edited occurrence is never touched. Must run
    // client-side (not folded into a server route) because dueAt/dueFraction
    // resolution needs the browser's own timezone, same as every other
    // due-time computation in this app (lib/utils.ts's resolveDueTime).
    async function materializeRecurringTasks() {
        try {
            const response = await fetch("/api/recurring-tasks");
            if (!response.ok) return;

            const data = await response.json() as { recurringTasks?: RecurringTask[] };
            const series = data.recurringTasks ?? [];
            setRecurringTasks(series);

            const activeSeries = series.filter((rule) => rule.active);
            if (activeSeries.length === 0) return;

            const today = getTodayString();
            const horizonEnd = shiftDateKey(today, RECURRENCE_HORIZON_WEEKS * 7);

            const perSeriesResults = await Promise.all(
                activeSeries.map(async (rule) => {
                    const dates = expandOccurrences(rule, today, horizonEnd);
                    if (dates.length === 0) return [] as Assignment[];

                    const occurrences = dates.map((due) => ({
                        due,
                        ...resolveDueTime(due, rule.dueTime ?? ""),
                    }));

                    try {
                        const res = await fetch(`/api/recurring-tasks/${rule.id}/occurrences`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ occurrences }),
                        });
                        if (!res.ok) return [];

                        const resData = await res.json() as { customTasks?: Assignment[] };
                        return resData.customTasks ?? [];
                    } catch (error) {
                        console.error("Could not materialize a recurring task's occurrences", error);
                        return [];
                    }
                })
            );

            const materialized = perSeriesResults.flat();
            if (materialized.length === 0) return;

            setTasks((current) => {
                const existingIds = new Set(current.map((task) => task.id));
                const updatesById = new Map(materialized.map((task) => [task.id, task]));

                return [
                    ...current.map((task) => updatesById.get(task.id) ?? task),
                    ...materialized.filter((task) => !existingIds.has(task.id)),
                ];
            });
        } catch (error) {
            console.error("Could not load recurring tasks", error);
        }
    }

    const hasMaterializedRecurring = useRef(false);

    useEffect(() => {
        if (hasMaterializedRecurring.current || !customTasksLoaded) return;
        hasMaterializedRecurring.current = true;

        void materializeRecurringTasks();
    }, [customTasksLoaded]);

    // Re-syncs existing tasks' own fields (not just customizations) against
    // the server — specifically `recurrenceId`/`recurrenceOverridden`,
    // which live on the CustomTask row itself. A whole-series delete nulls
    // a completed occurrence's `recurrenceId` server-side (it survives as a
    // standalone task) without adding/removing/tombstoning anything that
    // loadTaskCustomizations or materializeRecurringTasks would catch, so
    // without this the stale local copy keeps showing a "this
    // occurrence/this and following" prompt for a series that no longer
    // exists. Only updates fields on tasks already in local state — new
    // occurrences are additive via materializeRecurringTasks instead.
    async function refreshCustomTasks() {
        try {
            const response = await fetch("/api/custom-tasks");
            if (!response.ok) return;

            const data = await response.json() as { customTasks?: Assignment[] };
            const byId = new Map((data.customTasks ?? []).map((task) => [task.id, task]));

            setTasks((current) => current.map((task) => byId.get(task.id) ?? task));
        } catch (error) {
            console.error("Could not refresh custom tasks", error);
        }
    }

    // Unlike refreshCustomTasks above (which only updates tasks already in
    // local state), this is additive — needed after a detection pass with
    // auto-accept on, which can create brand-new CustomTask rows
    // server-side (lib/rundownAutoAccept.ts's "auto-insert") with no
    // client-side planner:add-task event to pick them up otherwise.
    async function mergeNewCustomTasks() {
        try {
            const response = await fetch("/api/custom-tasks");
            if (!response.ok) return;

            const data = await response.json() as { customTasks?: Assignment[] };

            setTasks((current) => {
                const existingIds = new Set(current.map((task) => task.id));
                const newOnes = (data.customTasks ?? []).filter((task) => !existingIds.has(task.id));

                return newOnes.length > 0 ? [...current, ...newOnes] : current;
            });
        } catch (error) {
            console.error("Could not merge new custom tasks", error);
        }
    }

    // Triggered by RecurringTasksPanel after a pause/resume, pattern edit,
    // or series delete — all of which change server-side state
    // (TaskCustomization tombstones for purged occurrences, a possibly-
    // unlinked completed occurrence, freshly materialized ones for a
    // resumed/widened series) that this component's own local state
    // doesn't otherwise know about.
    const handleRecurringSeriesChanged = () => {
        void loadTaskCustomizations();
        void refreshCustomTasks();
        void materializeRecurringTasks();
    };

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

            // Type has no CustomTask column of its own — persist it the
            // same way EditTaskModal does for any task, via
            // TaskCustomization (see the read-side merge in effectiveTasks
            // above). Only written when the user actually picked one in
            // the review card, so a plain-accept without one skips this.
            if (newTask.typeOverride) {
                persistCustomization(newTask.id, {
                    ...EMPTY_CUSTOMIZATION,
                    typeOverride: newTask.typeOverride,
                });
            }
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

        // Dedup and state computation happen synchronously against these
        // refs (not via a setState updater function): React does not
        // invoke a functional setState updater synchronously at the call
        // site here (confirmed live — an updater's own side effects ran
        // *after* the code following its setGamification/setTownState
        // call), so gating this function's control flow on a variable an
        // updater assigns silently made every award a no-op (the task-xp
        // POST fired, but the gamification/town-state PATCHes never did).
        // The refs are the single synchronous source of truth; plain state
        // *values* (not updater functions) are pushed to React afterward
        // purely to trigger a re-render.
        const currentGamification = latestGamificationRef.current ?? gamification;

        if (currentGamification.awardedTaskIds.includes(task.id)) return;

        const nextGamification: GamificationState = {
            totalXp: currentGamification.totalXp + award.xp,
            awardedTaskIds: [...currentGamification.awardedTaskIds, task.id],
        };

        latestGamificationRef.current = nextGamification;
        setGamification(nextGamification);

        // Starlight mirrors the XP award (difficulty-weighted, with the late
        // penalty already applied). The medieval town growth this used to feed
        // is retired — see lib/townGrowth.ts.
        saveGamificationState(nextGamification);
        void starChart.earn(award.xp);
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

    // Shared by AddTaskModal's fresh "Repeat" flow and EditTaskModal's
    // "Make this repeat" conversion — `anchorTaskId` set means "attach this
    // existing custom task as the series' first occurrence" instead of
    // creating a new row for it (see app/api/recurring-tasks/route.ts).
    const createRecurringTask = async (
        name: string,
        course: string,
        due: string,
        dueTime: string,
        recurrence: RecurrenceFieldValue,
        notes: string,
        anchorTaskId?: string
    ) => {
        try {
            const response = await fetch("/api/recurring-tasks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name,
                    course,
                    frequency: recurrence.frequency,
                    interval: recurrence.interval,
                    weekdays: recurrence.weekdays,
                    startDate: due,
                    endDate: recurrence.endDate || null,
                    dueTime: dueTime || null,
                    ...resolveDueTime(due, dueTime),
                    anchorTaskId: anchorTaskId ?? null,
                }),
            });

            if (!response.ok) {
                console.error("Could not create recurring task", await response.text());
                return;
            }

            const data = await response.json() as { customTask?: Assignment };

            if (data.customTask) {
                setTasks((current) => {
                    const withoutDuplicate = current.filter((task) => task.id !== data.customTask!.id);
                    return [...withoutDuplicate, data.customTask!];
                });
            }

            if (notes) {
                const taskId = data.customTask?.id ?? anchorTaskId;
                if (taskId) {
                    persistCustomization(taskId, {
                        ...(taskCustomizations[taskId] ?? EMPTY_CUSTOMIZATION),
                        notes,
                    });
                }
            }

            // Backfills every occurrence beyond the first for this (and
            // every other active) series, so the grid shows the whole
            // pattern without waiting for the next full reload.
            void materializeRecurringTasks();
        } catch (error) {
            console.error("Could not create recurring task", error);
        }
    };

    const handleAddRecurringTask = (
        name: string,
        course: string,
        due: string,
        dueTime: string,
        recurrence: RecurrenceFieldValue,
        notes: string
    ) => {
        void createRecurringTask(name, course, due, dueTime, recurrence, notes);
    };

    const handleConvertToRecurring = (
        task: Assignment,
        recurrence: RecurrenceFieldValue,
        startDate: string,
        notes: string,
        status: TaskStatus
    ) => {
        if (!task.due) return;

        // The occurrence's own name/course/due/type edits (if any were made
        // in the same save) still go through the normal per-task path —
        // only the "start repeating" side is special-cased here.
        handleSaveTask(task, startDate, notes, status, "this");
        void createRecurringTask(task.name, task.course, task.due, formatTimeInputValue(task.dueAt), recurrence, "", task.id);
    };

    const openAddTask = () => {
        setQuickAddDueDate(undefined);
        setIsModalOpen(true);
    };

    const openAddTaskForDate = (dateKey: string) => {
        setQuickAddDueDate(dateKey);
        setIsModalOpen(true);
    };

    const handleDelete = (id: string, recurrenceScope: RecurrenceScope = "this") => {
        const rawTask = tasks.find((task) => task.id === id);
        const deleteFollowing = Boolean(rawTask?.recurrenceId) && recurrenceScope === "following" && Boolean(rawTask?.due);

        setTasks((current) =>
            deleteFollowing
                ? current.filter((task) => !(task.recurrenceId === rawTask!.recurrenceId && task.due && task.due >= rawTask!.due!))
                : current.filter((task) => task.id !== id)
        );

        if (deleteFollowing) {
            // Shrinks the series' endDate to the day before this occurrence
            // and tombstones every occurrence from here forward — see
            // app/api/recurring-tasks/[id]/route.ts's "deleteFrom" mode.
            fetch(`/api/recurring-tasks/${rawTask!.recurrenceId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ deleteFrom: rawTask!.due }),
            }).catch((error) => {
                console.error("Could not delete future occurrences", error);
            });
            return;
        }

        if (rawTask?.recurrenceId) {
            // A single occurrence of a series is tombstoned, not hard-
            // deleted, even though its id starts with "custom-" — a hard
            // delete would just get resurrected by the next materialization
            // pass, which only checks whether a row still exists.
            persistCustomization(id, {
                ...(taskCustomizations[id] ?? EMPTY_CUSTOMIZATION),
                deleted: true,
            });
            return;
        }

        if (id.startsWith("custom-")) {
            // Real row delete — a plain custom task needs no tombstone,
            // unlike a Canvas-synced one (which would just reappear on
            // resync).
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

    // Dismissing the "AI-detected" badge (AssignmentCard's 🤖 button) is
    // the implicit-confirmation half of AutoTaskCreation.md's logging
    // requirement — the other half (implicit "it was wrong") is deleting
    // the task without ever dismissing the tag, logged server-side by
    // DELETE /api/custom-tasks/[taskId] itself.
    function handleDismissAiTag(id: string) {
        const dismissedAt = new Date().toISOString();

        setTasks((current) =>
            current.map((task) =>
                task.id === id ? { ...task, aiTagDismissedAt: dismissedAt } : task
            )
        );

        fetch(`/api/custom-tasks/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ aiTagDismissedAt: dismissedAt }),
        }).catch((error) => {
            console.error("Could not dismiss AI tag", error);
        });
    }

    // ==================================================
    // Rundown screen (AutoTaskCreation.md)
    // ==================================================

    function saveRundownDecision(task: ProposedTask, status: "accepted" | "rejected" | "maybe") {
        // Fire-and-forget, same as the retired AIReviewPanel's
        // saveSuggestionReview — a failed write shouldn't block the review
        // flow, at worst causing one stale resurfacing later.
        fetch("/api/ai/suggestion-review", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                sourceAnnouncementId: task.sourceAnnouncementId,
                suggestionKey: task.suggestionKey,
                status,
                duplicateSuspected: task.canvasMatch.status !== "none",
            }),
        }).catch((error) => {
            console.error("❌ Failed to save suggestion review:", error);
        });
    }

    function removeCandidateFromLists(suggestionKey: string) {
        setPendingCandidates((current) => current.filter((c) => c.suggestionKey !== suggestionKey));
        setMaybeCandidates((current) => current.filter((c) => c.suggestionKey !== suggestionKey));
    }

    function handleRundownYes(task: ProposedTask) {
        // Converts the AI task into the same Assignment shape used by the
        // planner, exactly like the retired AIReviewPanel's handleAccept —
        // the existing "planner:add-task" listener below is the single
        // source of truth for actually creating + persisting a CustomTask,
        // reused here rather than duplicated.
        const plannerTask: Assignment = {
            id: `custom-ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: task.name,
            course: task.course,
            due: task.due ?? "",
            completed: false,
            sourceAnnouncementId: task.sourceAnnouncementId,
            typeOverride: task.typeOverride ?? undefined,
        };

        window.dispatchEvent(
            new CustomEvent<Assignment>("planner:add-task", { detail: plannerTask })
        );

        saveRundownDecision(task, "accepted");
        removeCandidateFromLists(task.suggestionKey);
    }

    function handleRundownNo(task: ProposedTask) {
        saveRundownDecision(task, "rejected");
        removeCandidateFromLists(task.suggestionKey);
    }

    function handleRundownMaybe(task: ProposedTask) {
        saveRundownDecision(task, "maybe");

        setPendingCandidates((current) => current.filter((c) => c.suggestionKey !== task.suggestionKey));
        setMaybeCandidates((current) => [
            ...current,
            { ...task, reviewStatus: "maybe", firstSeenAt: new Date().toISOString() },
        ]);
    }

    function handleNewCandidates(newTasks: ProposedTask[]) {
        setPendingCandidates((current) => {
            const existingKeys = new Set(current.map((c) => c.suggestionKey));
            const additions = newTasks
                .filter((task) => !existingKeys.has(task.suggestionKey))
                .map((task) => ({
                    ...task,
                    reviewStatus: "pending" as const,
                    firstSeenAt: new Date().toISOString(),
                }));

            return [...current, ...additions];
        });
    }

    function handleCloseRundown() {
        setShowRundown(false);
        savePlannerSettings({ lastRundownViewedAt: new Date().toISOString() });
    }

    function handleRemoveCanvasItem(item: AddedFromCanvasItem) {
        // Reuses the exact soft-delete tombstone path a Canvas-synced
        // task's own ✕ button already goes through — see handleDelete
        // above.
        handleDelete(item.id);
        setAddedFromCanvas((current) => current.filter((i) => i.id !== item.id));
    }

    function handleSetAutoAcceptAiTasks(value: boolean) {
        setAutoAcceptAiTasks(value);
        savePlannerSettings({ autoAcceptAiTasks: value });
    }

    const handleSaveTask = (
        updatedTask: Assignment,
        startDate: string,
        notes: string,
        status: TaskStatus,
        recurrenceScope: RecurrenceScope = "this"
    ) => {
        setTasks((current) =>
            current.map((task) => (task.id === updatedTask.id ? updatedTask : task))
        );

        // Custom tasks already keep their edited course on the DB row
        // above; only Canvas-synced tasks need a course override.
        const isCustomTask = updatedTask.id.startsWith("custom-");
        const rawTaskBefore = tasks.find((task) => task.id === updatedTask.id);
        const isRecurringOccurrence = Boolean(rawTaskBefore?.recurrenceId);

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
                    // "This occurrence only" on a series member marks it as
                    // a deliberate exception, so a later "this and
                    // following" series edit skips it instead of silently
                    // overwriting what was just saved here.
                    ...(isRecurringOccurrence ? { recurrenceOverridden: recurrenceScope === "this" } : {}),
                }),
            }).catch((error) => {
                console.error("Could not save custom task", error);
            });
        }

        // "This and following": propagate name/course/type to every future,
        // non-overridden, non-completed sibling occurrence. Due date/time
        // changes never propagate (EditTaskModal only offers this choice
        // when the due date didn't change) — see the route for why.
        if (isRecurringOccurrence && recurrenceScope === "following" && rawTaskBefore?.recurrenceId && updatedTask.due) {
            fetch(`/api/recurring-tasks/${rawTaskBefore.recurrenceId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    applyFromDate: updatedTask.due,
                    name: updatedTask.name,
                    course: updatedTask.course,
                    typeOverride: updatedTask.typeOverride ?? null,
                }),
            }).then(async (response) => {
                if (!response.ok) return;

                const data = await response.json() as { updatedOccurrenceIds?: string[] };
                const ids = new Set(data.updatedOccurrenceIds ?? []);
                if (ids.size === 0) return;

                setTasks((current) =>
                    current.map((task) =>
                        ids.has(task.id)
                            ? { ...task, name: updatedTask.name, course: updatedTask.course, typeOverride: updatedTask.typeOverride }
                            : task
                    )
                );
            }).catch((error) => {
                console.error("Could not apply the series edit to future occurrences", error);
            });
        }

        const current = taskCustomizations[updatedTask.id];
        const rawTask = rawTaskBefore;

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
        const previousEffectiveDue = current?.dueAtOverride
            ? toDateKey(new Date(current.dueAtOverride))
            : rawTask?.due ?? "";

        // updatedTask.dueAt is null whenever the modal was left in "End of
        // day" mode — a raw-instant diff can't tell "date unchanged" from
        // "date changed" once both collapse to null, silently dropping a
        // date-only edit. Diff by date key in that case instead, and
        // synthesize a concrete instant so the new date actually persists.
        const dueAtOverride = isCustomTask
            ? ""
            : updatedTask.dueAt
                ? (updatedTask.dueAt !== previousEffectiveDueAt ? updatedTask.dueAt : (current?.dueAtOverride ?? ""))
                : (updatedTask.due !== previousEffectiveDue ? endOfDayInstant(updatedTask.due) : "");

        // EditTaskModal offers an explicit "Auto" option for type, so no
        // diffing heuristic is needed here — trust it directly. Unlike
        // course/name/due, a custom task has no CustomTask column of its
        // own to hold a type, so typeOverride is never forced empty here
        // even for custom tasks — TaskCustomization is its only storage
        // (effectiveTasks's read-side merge above already applies it
        // uniformly to Canvas-synced and custom tasks alike).
        const typeOverride = updatedTask.typeOverride ?? "";

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
            <h1 className="mb-4 pr-28 text-3xl">Ship&apos;s Log</h1>

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
                            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-400">
                                <StarIcon size={12} /> Polaris · your next best task
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
                                disabled={focusTaskId === upNext.task.id}
                                className="rounded-lg border border-amber-500/60 px-3 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {focusTaskId === upNext.task.id ? "🎯 Focused" : "🎯 Focus in Pomodoro"}
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
                onAddRecurringTask = {handleAddRecurringTask}
            />

            <EditTaskModal
                task = {selectedTask}
                isOpen = {selectedTask !== null}
                startDate = {resolveStartAt(taskCustomizations[selectedTask?.id ?? ""]?.startAt ?? "")}
                notes = {taskCustomizations[selectedTask?.id ?? ""]?.notes ?? ""}
                status = {getTaskStatus(
                    taskCustomizations[selectedTask?.id ?? ""]?.completed ?? false,
                    taskCustomizations[selectedTask?.id ?? ""]?.inProgress ?? false
                )}
                estimatedMinutes = {taskPlanning[selectedTask?.id ?? ""]?.estimatedMinutes}
                recurringTaskRule = {recurringTasks.find((rule) => rule.id === selectedTask?.recurrenceId) ?? null}
                courses = {courses}
                onCourseCreated = {handleCourseCreated}
                onClose = {() => setSelectedTask(null)}
                onSaveTask = {handleSaveTask}
                onDeleteTask = {handleDelete}
                onConvertToRecurring = {handleConvertToRecurring}
                onManageSeries = {() => { setSelectedTask(null); setIsRecurringPanelOpen(true); }}
            />

            <RecurringTasksPanel
                isOpen = {isRecurringPanelOpen}
                onClose = {() => setIsRecurringPanelOpen(false)}
                courses = {courses}
                onCourseCreated = {handleCourseCreated}
                onSeriesChanged = {handleRecurringSeriesChanged}
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
                                        isFocused={task.id === focusTaskId}
                                        isAiDetected={Boolean(task.sourceAnnouncementId) && !task.aiTagDismissedAt}
                                        onDismissAiTag={handleDismissAiTag}
                                        onSetStatus = {(newStatus) => handleSetStatus(task, newStatus, estimate?.estimatedMinutes)}
                                        onDelete = {handleDelete}
                                        onFocus={(id) => setFocusTask(id === focusTaskId ? null : id)}
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

        </div>

        <Taskbar
            theme={theme}
            onSetTheme={updateTheme}
            level={level}
            totalXp={gamification.totalXp}
            xpTowardsNextLevel={xpTowardsNextLevel}
            awardingXp={awardingXp}
            latestXpAward={latestXpAward}
            starlight={starChart.state.starlight}
            onAddTask={openAddTask}
            onManageRecurring={() => setIsRecurringPanelOpen(true)}
            userName={userName}
            userEmail={userEmail}
            onOpenRundown={() => setShowRundown(true)}
            onOpenStillDeciding={() => setShowStillDeciding(true)}
            stillDecidingCount={maybeCandidates.length}
            autoAcceptAiTasks={autoAcceptAiTasks}
            onSetAutoAcceptAiTasks={handleSetAutoAcceptAiTasks}
        />

        {showRundown && (
            <RundownOverlay
                pendingCandidates={pendingCandidates}
                addedFromCanvas={addedFromCanvas}
                courses={courses}
                onCourseCreated={handleCourseCreated}
                onYes={handleRundownYes}
                onNo={handleRundownNo}
                onMaybe={handleRundownMaybe}
                onRemoveCanvasItem={handleRemoveCanvasItem}
                onNewCandidates={handleNewCandidates}
                onRunFinished={mergeNewCustomTasks}
                onClose={handleCloseRundown}
            />
        )}

        {showStillDeciding && (
            <StillDecidingPanel
                candidates={maybeCandidates}
                courses={courses}
                onCourseCreated={handleCourseCreated}
                onYes={handleRundownYes}
                onNo={handleRundownNo}
                onClose={() => setShowStillDeciding(false)}
            />
        )}
        </>
    );
}
