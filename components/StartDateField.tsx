"use client";

import React from "react";

type StartDateFieldProps = {
    value: string;
    onChange: (value: string) => void;
};

export default function StartDateField({ value, onChange }: StartDateFieldProps) {
    const mode: "auto" | "custom" = value ? "custom" : "auto";

    return (
        <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">
                Start Date
            </label>
            <div className="flex rounded-xl bg-slate-800 p-1 mb-2">
                <button
                    type="button"
                    onClick={() => onChange("")}
                    className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${mode === "auto" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
                >
                    Auto
                </button>
                <button
                    type="button"
                    onClick={() => onChange(value || new Date().toISOString().slice(0, 10))}
                    className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${mode === "custom" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
                >
                    Custom date
                </button>
            </div>

            {mode === "custom" && (
                <input
                    type="date"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 color-scheme-dark"
                />
            )}
        </div>
    );
}
