"use client";

import React from "react";
import {calculateGridSpan} from "@/lib/utils";
import {Assignment} from "@/types/assignment";
import AssignmentCard from "./AssignmentCard";

type WeeklyPlannerProps = {
    assignments: Assignment[];
    weekStartDate: Date;
}

export default function WeeklyPlannerView({ assignments, weekStartDate}: WeeklyPlannerProps) {
    const dayNames = ["Mon", "tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    const days = Array.from({length: 7}).map((_,index) => {
        const date = new Date(weekStartDate);
        date.setDate(weekStartDate.getDate() + index);

        return {
            name: dayNames[index],
            dateNumber: date.getDate()
        };
    });

    const sortedAssignments = [...assignments].sort((a,b) => {
        return new Date(a.due).getTime() - new Date(b.due).getTime();
    });

    return (
        <div className = "w-full bg-slate-950 text-white p-6 rounded-2xl border border-slate-800">
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
                    {sortedAssignments.map((task) => {
                        const gridSpan = calculateGridSpan(
                            {dueDate: task.due, isCompleted: task.completed ?? false},
                            weekStartDate
                        );

                        return (
                            <AssignmentCard
                            key = {task.id}
                            id = {task.id}
                            name = {task.name}
                            due = {task.due}
                            course = {task.course}
                            daysRemaining = {task.daysRemaining}
                            gridSpan = {gridSpan}
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
