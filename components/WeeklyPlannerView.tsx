"use client";

import React, {useEffect, useMemo, useState} from "react";
import {useRouter} from "next/navigation";
import {calculateGridSpan, getTodayString, parseLocalDate} from "@/lib/utils";
import {Assignment} from "@/types/assignment";
import AssignmentCard from "./AssignmentCard";
import AddTaskModal from "./AddTaskModal";
import ManageCoursesModal from "./ManageCoursesModal";
import {getTaskStates, saveTaskState} from "@/lib/taskState";
import {TaskState} from "@/types/taskState";
import EditTaskModal from "./EditTaskModal";
import {getGamificationState, saveGamificationState} from "@/lib/gamification";
import {GamificationState, XpAward} from "@/types/gamification";
import {getTaskPlanningEstimates, getTaskPriority, getTaskSignature, saveTaskPlanningEstimates} from "@/lib/taskPlanning";
import {TaskPlanningEstimate, TaskPlanningEstimates} from "@/types/taskPlanning";
import {calculatePriority, PriorityResult} from "@/lib/prioritization";
import {getProcrastinationIndexHours, recordTaskCompletion} from "@/lib/procrastinationHistory";
import PomodoroTimer from "./PomodoroTimer";
import MusicPlayer from "./MusicPlayer";

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
}

export default function WeeklyPlannerView({ assignments, weekStartDate}: WeeklyPlannerProps) {
    const router = useRouter();
    const [tasks, setTasks] = useState<Assignment[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isCourseManagerOpen, setIsCourseManagerOpen] = useState(false);
    const [taskStates, setTaskStates] = useState<Record<string, TaskState>>({});
    const [selectedTask, setSelectedTask] = useState<Assignment | null>(null);
    const [gamification, setGamification] = useState<GamificationState>({ totalXp: 0, awardedTaskIds: [] });
    const [latestXpAward, setLatestXpAward] = useState<XpAward | null>(null);
    const [taskPlanning, setTaskPlanning] = useState<TaskPlanningEstimates>({});
    const [estimatingCount, setEstimatingCount] = useState(0);
    const [activeFocusTaskId, setActiveFocusTaskId] = useState<string | null>(null);
    const [procrastinationIndexByType, setProcrastinationIndexByType] = useState<Record<string, number | null>>({});
    const [calendarView, setCalendarView] = useState<"weekly" | "monthly">("weekly");
    const [theme, setTheme] = useState<"dark" | "light">("dark");
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [activeWeekStart, setActiveWeekStart] = useState(() => {
        const start = new Date(weekStartDate);
        start.setHours(0, 0, 0, 0);
        return start;
    });
    const [activeMonthStart, setActiveMonthStart] = useState(() => {
        const start = new Date(weekStartDate);
        return new Date(start.getFullYear(), start.getMonth(), 1);
    });


    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    const days = Array.from({length: 7}).map((_,index) => {
        const date = new Date(activeWeekStart);
        date.setDate(activeWeekStart.getDate() + index);

        return {
            name: dayNames[index],
            dateNumber: date.getDate()
        };
    });

    const sortedTasks = [...tasks].sort((a,b) => {
        const aCompleted = taskStates[a.id]?.completed ?? false;
        const bCompleted = taskStates[b.id]?.completed ?? false;

        if (aCompleted !== bCompleted) {
            return aCompleted ? 1 : -1;
        }

        const aPriority = getTaskPriority(a, taskPlanning[a.id]?.importance);
        const bPriority = getTaskPriority(b, taskPlanning[b.id]?.importance);

        if (aPriority.rank !== bPriority.rank) {
            return aPriority.rank - bPriority.rank;
        }

        return parseLocalDate(a.due ?? "9999-12-31").getTime()
        - parseLocalDate(b.due ?? "9999-12-31").getTime();
    });

    const activeWeekEnd = new Date(activeWeekStart);
    activeWeekEnd.setDate(activeWeekStart.getDate() + 7);

    const tasksForActiveWeek = sortedTasks.filter((task) => {
        if (!task.due) return false;

        const dueDate = parseLocalDate(task.due);
        return dueDate >= activeWeekStart && dueDate < activeWeekEnd;
    });

    const tasksWithoutDueDate = sortedTasks.filter((task) => !task.due);

    const openTasks = useMemo(
        () => tasks.filter((task) => !(taskStates[task.id]?.completed ?? false)),
        [tasks, taskStates]
    );

    /*
     * Shared with the "focus task" lookup below, so both use the exact
     * same AI-informed scoring as the API (lib/prioritization.ts) plus
     * this student's per-task-type procrastination history — see
     * prioritizationModule.md and lib/procrastinationHistory.ts. This is
     * intentionally independent of the getTaskPriority-based sort used for
     * the grid below, which stays deadline/importance-only.
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

        const task = tasks.find((t) => t.id === activeFocusTaskId);
        if (!task || taskStates[task.id]?.completed) return null;

        return { task, priority: computeTaskPriority(task) };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeFocusTaskId, tasks, taskStates, taskPlanning, procrastinationIndexByType]);

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
    monthGridStart.setDate(1 - ((activeMonthStart.getDay() + 6) % 7));
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
        const currentWeekStart = new Date(weekStartDate);
        currentWeekStart.setHours(0, 0, 0, 0);
        setActiveWeekStart(currentWeekStart);
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

    useEffect(() => {
        const storedTasks = localStorage.getItem("custom_tasks");
        const savedStates = getTaskStates();
        const savedGamification = getGamificationState();
        const savedTaskPlanning = getTaskPlanningEstimates();
        const savedTheme = localStorage.getItem("planner_theme");
        const savedFocusTaskId = localStorage.getItem(FOCUS_TASK_STORAGE_KEY);

        setTaskStates(savedStates);
        setGamification(savedGamification);
        setTaskPlanning(savedTaskPlanning);
        setActiveFocusTaskId(savedFocusTaskId);
        if (savedTheme === "light" || savedTheme === "dark") {
            setTheme(savedTheme);
        } else {
            document.documentElement.dataset.theme = "dark";
        }

        const customTasks = storedTasks
            ? JSON.parse(storedTasks)
            : [];

        const deletedIds = JSON.parse(
            localStorage.getItem("deleted_task_ids") || "[]"
        );

        const allTasks = [
            ...assignments,
            ...customTasks
        ];

        const visibleTasks = allTasks.filter(
            task => !deletedIds.includes(task.id)
        );

        setTasks(visibleTasks);
    }, [assignments]);

    const updateTheme = (nextTheme: "dark" | "light") => {
        setTheme(nextTheme);
        localStorage.setItem("planner_theme", nextTheme);
        document.documentElement.dataset.theme = nextTheme;
        setIsSettingsOpen(false);
    };

    useEffect(() => {
        document.documentElement.dataset.theme = theme;
    }, [theme]);

    useEffect(() => {
        if (!isSettingsOpen) return;

        const closeSettings = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (!target.closest("[data-settings-root]")) {
                setIsSettingsOpen(false);
            }
        };

        document.addEventListener("mousedown", closeSettings);
        return () => document.removeEventListener("mousedown", closeSettings);
    }, [isSettingsOpen]);

    useEffect(() => {
        const tasksNeedingEstimates = tasks.filter((task) =>
            taskPlanning[task.id]?.signature !== getTaskSignature(task)
        );

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

                    saveTaskPlanningEstimates(next);
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
    }, [tasks, taskPlanning]);

    useEffect(() => {
        const types = new Set(
            Object.values(taskPlanning)
                .map((estimate) => estimate.assignmentType)
                .filter((type): type is string => Boolean(type))
        );

        setProcrastinationIndexByType((current) => {
            const next: Record<string, number | null> = {};
            for (const type of types) {
                next[type] = getProcrastinationIndexHours(type);
            }

            const changed =
                Object.keys(next).length !== Object.keys(current).length ||
                Object.entries(next).some(([type, value]) => current[type] !== value);

            return changed ? next : current;
        });
    }, [taskPlanning]);

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

                const updatedTasks = [
                    ...currentTasks,
                    newTask,
                ];

                /*
                * Keep AI-created tasks in the exact same
                * localStorage collection as manually-created tasks.
                */
                const customTasks =
                    updatedTasks.filter((task) =>
                        task.id.startsWith("custom-")
                    );

                localStorage.setItem(
                    "custom_tasks",
                    JSON.stringify(customTasks)
                );

                return updatedTasks;
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
        }

        setGamification((current) => {
            if (current.awardedTaskIds.includes(task.id)) return current;

            const nextState = {
                totalXp: current.totalXp + award.xp,
                awardedTaskIds: [...current.awardedTaskIds, task.id],
            };

            saveGamificationState(nextState);
            return nextState;
        });
        setLatestXpAward(award);
    };

    const handleToggleComplete = (task: Assignment, estimatedMinutes?: number) => {
        const { id } = task;
        const currentState = taskStates[id] ?? {
            completed: false,
            completedAt: null
        };

        const newCompleted = !currentState.completed;

        const newState: TaskState = {
            completed: newCompleted,
            completedAt: newCompleted
                ? getTodayString()
                : null
        };

        setTaskStates((prev) => ({
            ...prev,
            [id]: newState
        }));

        saveTaskState(id, newState);

        if (newCompleted) {
            const assignmentType = taskPlanning[id]?.assignmentType;
            const addedAt = deriveAddedAt(task);

            if (task.due && addedAt && assignmentType) {
                recordTaskCompletion({
                    taskType: assignmentType,
                    addedAt,
                    dueAt: `${task.due}T23:59:59`,
                    completedAt: new Date().toISOString(),
                });

                setProcrastinationIndexByType((current) => ({
                    ...current,
                    [assignmentType]: getProcrastinationIndexHours(assignmentType),
                }));
            }

            void awardXpForTask(task, newState.completedAt, estimatedMinutes);
        }

    }
    const handleAddTask = (newTask: Assignment) => {
        const updatedTasks = [
            ...tasks,
            newTask
        ];

        setTasks(updatedTasks);
        const customTasks = updatedTasks.filter(
            task => task.id.startsWith("custom-")
        );

        localStorage.setItem(
            "custom_tasks",
            JSON.stringify(customTasks)
        )
    }

    const handleDelete = (id:string) => {
        const updatedTasks = tasks.filter(
            task => task.id !== id
        );

        setTasks(updatedTasks);

        const deleted = JSON.parse(
            localStorage.getItem("deleted_task_ids") || "[]"
        );

        localStorage.setItem(
            "deleted_task_ids",
            JSON.stringify([
                ...deleted,
                id
            ])
        )
    }

    const handleSaveTask = (updatedTask: Assignment) => {
        const updatedTasks = tasks.map((task) =>
            task.id === updatedTask.id ? updatedTask : task
        );

        setTasks(updatedTasks);

        const customTasks = updatedTasks.filter((task) =>
            task.id.startsWith("custom-")
        );

        localStorage.setItem("custom_tasks", JSON.stringify(customTasks));


    }

    return (
        <div className = "theme-surface planner-shell w-full bg-slate-950 text-white p-6 rounded-2xl border border-slate-800">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <button
                        onClick = {() => setIsModalOpen(true)}
                        className = "bg-blue-600 px-4 py-2 rounded"
                    >
                        + Add Task
                    </button>
                    <button
                        type="button"
                        onClick={() => setIsCourseManagerOpen(true)}
                        className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
                    >
                        📚 Courses
                    </button>
                    <div className="relative" data-settings-root>
                        <button
                            type="button"
                            onClick={() => setIsSettingsOpen((open) => !open)}
                            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800"
                            aria-expanded={isSettingsOpen}
                            aria-label="Open settings"
                        >
                            ⚙ Settings
                        </button>
                        {isSettingsOpen && (
                            <div className="absolute left-0 top-full z-40 mt-2 w-56 rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-xl">
                                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Quest Log Theme</p>
                                <div className="flex rounded-lg bg-slate-800 p-1">
                                    <button
                                        type="button"
                                        onClick={() => updateTheme("dark")}
                                        className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${theme === "dark" ? "bg-emerald-900/80 text-emerald-100" : "text-slate-400 hover:text-slate-200"}`}
                                    >
                                        🌲 Forest
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => updateTheme("light")}
                                        className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${theme === "light" ? "bg-orange-500 text-white" : "text-slate-400 hover:text-slate-200"}`}
                                    >
                                        🍺 Tavern
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="min-w-52 rounded-xl border border-indigo-900/70 bg-indigo-950/30 px-4 py-2.5">
                    <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-bold text-indigo-200">Level {level}</span>
                        <span className="text-xs font-semibold text-indigo-300">{gamification.totalXp} XP</span>
                    </div>
                    <div className="xp-track mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                        <div className="xp-fill h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${xpTowardsNextLevel}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">
                        {latestXpAward ? `+${latestXpAward.xp} XP earned` : `${100 - xpTowardsNextLevel} XP to Level ${level + 1}`}
                    </p>
                </div>

            </div>

            {estimatingCount > 0 && (
                <p className="mb-4 flex items-center gap-2 text-xs font-medium text-slate-400">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400" />
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
                        <div className="flex shrink-0 gap-2">
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
                                onClick={() => handleToggleComplete(upNext.task, taskPlanning[upNext.task.id]?.estimatedMinutes)}
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
                onClose = {() => setIsModalOpen(false)}
                onAddTask = {handleAddTask}
            />

            <ManageCoursesModal
                isOpen={isCourseManagerOpen}
                onClose={() => setIsCourseManagerOpen(false)}
                onChanged={() => router.refresh()}
            />

            <div className="grid gap-6 lg:grid-cols-2">
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
                <MusicPlayer />
            </div>

            <EditTaskModal
                task = {selectedTask}
                isOpen = {selectedTask !== null}
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
                            <div key={idx} className = "flex flex-col items-center">
                                <span className = "text-xs font-bold text-slate-400 uppercase tracking-wider">{day.name}</span>
                                <span className = "text-base font-semibold text-slate-200 mt-1">{day.dateNumber}</span>
                            </div>
                        ))}
                    </div>

                    <div className = "relative min-h-[400px]">
                        <div className = "absolute inset-0 grid grid-cols-7 gap-2 pointer-events-none">
                            {Array.from({length: 7}).map((_, idx) => (
                                <div key = {idx} className = "border-r border-slate-800/80 h-full rounded-lg bg-slate-900/30" />
                            ))}
                        </div>

                        <div className="grid grid-cols-7 grid-flow-row-dense gap-y-3 gap-x-2 relative z-10 py-2">
                            {tasksForActiveWeek.map((task) => {
                                const taskState = taskStates[task.id];
                                const estimate = taskPlanning[task.id];
                                const priority = getTaskPriority(task, estimate?.importance);
                                const gridSpan = calculateGridSpan(
                                    { dueDate: task.due, startDate: taskState?.completedAt ?? undefined },
                                    activeWeekStart
                                );

                                return (
                                    <AssignmentCard
                                        key = {task.id}
                                        id = {task.id}
                                        name = {task.name}
                                        due = {task.due}
                                        course = {task.course}
                                        gridSpan = {gridSpan}
                                        completed = {taskStates[task.id]?.completed ?? false}
                                        completedAt = {taskStates[task.id]?.completedAt ?? null}
                                        estimatedMinutes = {estimate?.estimatedMinutes}
                                        priority = {priority}
                                        isFocused={task.id === activeFocusTaskId}
                                        onToggleComplete = {() => handleToggleComplete(task, estimate?.estimatedMinutes)}
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
                                <div key={dateKey} className={`min-h-28 rounded-lg border p-1.5 ${isCurrentMonth ? "border-slate-800 bg-slate-900/50" : "border-slate-900 bg-slate-950/40 text-slate-600"}`}>
                                    <div className={`mb-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${isToday ? "bg-indigo-600 text-white" : ""}`}>{date.getDate()}</div>
                                    <div className="space-y-1">
                                        {dayTasks.slice(0, 3).map((task) => {
                                            const completed = taskStates[task.id]?.completed ?? false;
                                            const estimate = taskPlanning[task.id];
                                            const isOverdue = task.due < getTodayString() && !completed;

                                            return (
                                                <div
                                                    key={task.id}
                                                    onClick={() => setSelectedTask(task)}
                                                    className={`group flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-[10px] leading-tight ${completed ? "bg-green-950/40 text-slate-500" : isOverdue ? "bg-rose-950/80 text-rose-100" : "bg-slate-800 text-slate-200"}`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={completed}
                                                        onClick={(event) => event.stopPropagation()}
                                                        onChange={() => handleToggleComplete(task, estimate?.estimatedMinutes)}
                                                        aria-label={`Mark ${task.name} as complete`}
                                                        className="h-3 w-3 shrink-0 cursor-pointer rounded border-slate-600 bg-slate-900 text-indigo-500 focus:ring-0"
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
                            const completed = taskStates[task.id]?.completed ?? false;
                            const estimate = taskPlanning[task.id];
                            const priority = getTaskPriority(task, estimate?.importance);

                            return (
                                <div
                                    key={task.id}
                                    onClick={() => setSelectedTask(task)}
                                    className={`group flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${completed ? "border-slate-800 bg-slate-900/50 text-slate-500" : "border-slate-700 bg-slate-900 hover:border-slate-600"}`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={completed}
                                        onClick={(event) => event.stopPropagation()}
                                        onChange={() => handleToggleComplete(task, estimate?.estimatedMinutes)}
                                        aria-label={`Mark ${task.name} as complete`}
                                        className="h-4 w-4 cursor-pointer rounded border-slate-700 bg-slate-800 text-indigo-500 focus:ring-0"
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
    );
}
