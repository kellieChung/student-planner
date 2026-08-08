"use client";

import React, {useEffect, useState} from "react";
import {calculateGridSpan, getTodayString} from "@/lib/utils";
import {Assignment} from "@/types/assignment";
import AssignmentCard from "./AssignmentCard";
import AddTaskModal from "./AddTaskModal";
import {getTaskStates, saveTaskState} from "@/lib/taskState";
import {TaskState} from "@/types/taskState";

type WeeklyPlannerProps = {
    assignments: Assignment[];
    weekStartDate: Date;
}

export default function WeeklyPlannerView({ assignments, weekStartDate}: WeeklyPlannerProps) {
    const [tasks, setTasks] = useState<Assignment[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [taskStates, setTaskStates] = useState<Record<string, TaskState>>({});

    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    const days = Array.from({length: 7}).map((_,index) => {
        const date = new Date(weekStartDate);
        date.setDate(weekStartDate.getDate() + index);

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

        return new Date(a.due ?? "").getTime()
            - new Date(b.due ?? "").getTime();
    });

    useEffect(() => {
        const storedTasks = localStorage.getItem("custom_tasks");
        const savedStates = getTaskStates();

        setTaskStates(savedStates);

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

    const handleToggleComplete = (id: string) => {
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

        setTaskStates({
            ...taskStates,
            [id]: newState
        });

        saveTaskState(id, newState);

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

    return (
        <div className = "w-full bg-slate-950 text-white p-6 rounded-2xl border border-slate-800">
            <button
                onClick = {() => setIsModalOpen(true)}
                className = "bg-blue-600 px-4 py-2 rounded"
            >
                + Add Task
            </button>

            <AddTaskModal
                isOpen = {isModalOpen}
                onClose = {() => setIsModalOpen(false)}
                onAddTask = {handleAddTask}
            />
            <div className = "grid grid-cols-7 gap-2 border-b border-slate-800 pb-4 mb-4 text-center">
                {days.map((day, idx) => (
                    <div key={idx} className = "flex flex-col items-center">
                        <span className = "text-xs font-bold text-slate-400 uppercase tracking-wider">
                            {day.name}
                        </span>
                        <span className = "text-base font-semibold text-slate-200 mt-1">
                            {day.dateNumber}
                        </span>
                    </div>
                ))}
            </div>

            <div className = "relative min-h-[400px]">
                <div className = "absolute inset-0 grid grid-cols-7 gap-2 pointer-events-none">
                    {Array.from({length: 7}).map((_, idx) => (
                        <div key = {idx} className = "border-r border-slate-800/80 h-full rounded-lg bg-slate-900/30"
                        />
                    ))}
                </div>

                <div className = "grid grid-cols-7 gap-y-3 gap-x-2 relative z-10 py-2">
                    {sortedTasks.map((task) => {
                        const taskState = taskStates[task.id];
                        const gridSpan = calculateGridSpan(
                            {
                                dueDate: task.due,
                                startDate: taskState?.completedAt ?? undefined
                            },
                            weekStartDate
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
                                onToggleComplete = {handleToggleComplete}
                                onDelete = {handleDelete}
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
