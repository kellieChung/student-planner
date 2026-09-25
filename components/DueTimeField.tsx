"use client";

import React from "react";
import TimeField from "@/components/ui/TimeField";

type DueTimeFieldProps = {
    // "" = end of day (auto), "HH:MM" = a specific due time.
    value: string;
    onChange: (value: string) => void;
    // A time only means something on a date; the field is locked until one is set.
    disabled?: boolean;
};

export default function DueTimeField({ value, onChange, disabled = false }: DueTimeFieldProps) {
    const mode: "auto" | "custom" = value && !disabled ? "custom" : "auto";

    return (
        <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">
                Due Time
            </label>
            <div className="flex rounded-xl bg-slate-800 p-1 mb-2">
                <button
                    type="button"
                    onClick={() => onChange("")}
                    className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${mode === "auto" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
                >
                    End of day
                </button>
                <button
                    type="button"
                    onClick={() => onChange(value || "12:00")}
                    disabled={disabled}
                    className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${mode === "custom" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
                >
                    Custom time
                </button>
            </div>

            {disabled && (
                <p className="text-xs text-slate-400">Set a due date to choose a time.</p>
            )}

            {mode === "custom" && (
                <TimeField
                    ariaLabel="Due time"
                    value={value}
                    onChange={onChange}
                    className="bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-sm text-white focus:border-indigo-500"
                />
            )}
        </div>
    );
}
