"use client";

import React from "react";
import DatePicker from "@/components/DatePicker";
import NumberField from "@/components/ui/NumberField";
import Select from "@/components/ui/Select";
import { RecurrenceFrequency } from "@/types/recurringTask";

export type RecurrenceFieldValue = {
    enabled: boolean;
    frequency: RecurrenceFrequency;
    interval: number;
    // 0=Sun..6=Sat, only meaningful when frequency === "weekly".
    weekdays: number[];
    // "" = no end date.
    endDate: string;
};

export const DEFAULT_RECURRENCE_VALUE: RecurrenceFieldValue = {
    enabled: false,
    frequency: "weekly",
    interval: 1,
    weekdays: [],
    endDate: "",
};

type RecurrenceFieldProps = {
    value: RecurrenceFieldValue;
    onChange: (value: RecurrenceFieldValue) => void;
    // The task's own Due Date — the recurrence anchor. Repeat can't be
    // enabled without one.
    anchorDue: string;
};

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

export default function RecurrenceField({ value, onChange, anchorDue }: RecurrenceFieldProps) {
    const toggle = () => {
        if (!anchorDue) return;

        if (!value.enabled && value.weekdays.length === 0) {
            // Default the weekday picker to the due date's own weekday so
            // turning Repeat on for a Tuesday task starts as "every
            // Tuesday" instead of an empty, invalid selection.
            const anchorWeekday = new Date(`${anchorDue}T00:00:00`).getDay();
            onChange({ ...value, enabled: true, weekdays: [anchorWeekday] });
            return;
        }

        onChange({ ...value, enabled: !value.enabled });
    };

    const toggleWeekday = (day: number) => {
        const next = value.weekdays.includes(day)
            ? value.weekdays.filter((d) => d !== day)
            : [...value.weekdays, day].sort((a, b) => a - b);

        onChange({ ...value, weekdays: next });
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Repeat
                </label>

                <button
                    type="button"
                    onClick={toggle}
                    disabled={!anchorDue}
                    className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${value.enabled ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200"}`}
                >
                    {value.enabled ? "On" : "Off"}
                </button>
            </div>

            {!anchorDue && (
                <p className="text-xs text-slate-500">Set a due date to make this task repeat.</p>
            )}

            {value.enabled && anchorDue && (
                <div className="space-y-3 bg-slate-800/60 rounded-xl p-3 mt-2">
                    <div className="flex items-center gap-2">
                        <span className="text-sm">Every</span>
                        <NumberField
                            ariaLabel="Repeat interval"
                            min={1}
                            value={value.interval}
                            onChange={(interval) => onChange({ ...value, interval })}
                            className="bg-slate-800"
                        />
                        <Select
                            ariaLabel="Repeat frequency"
                            value={value.frequency}
                            onChange={(frequency) => onChange({ ...value, frequency: frequency as RecurrenceFrequency })}
                            options={[
                                { value: "daily", label: "day(s)" },
                                { value: "weekly", label: "week(s)" },
                                { value: "monthly", label: "month(s)" },
                            ]}
                            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm"
                        />
                    </div>

                    {value.frequency === "weekly" && (
                        <div className="flex gap-1">
                            {WEEKDAY_LABELS.map((label, day) => (
                                <button
                                    key={day}
                                    type="button"
                                    onClick={() => toggleWeekday(day)}
                                    className={`h-7 w-7 rounded-full text-xs font-semibold transition-colors ${value.weekdays.includes(day) ? "bg-indigo-600 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200"}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    )}

                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Ends</label>
                        <div className="flex rounded-xl bg-slate-800 p-1">
                            <button
                                type="button"
                                onClick={() => onChange({ ...value, endDate: "" })}
                                className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${!value.endDate ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
                            >
                                Never
                            </button>
                            <button
                                type="button"
                                onClick={() => onChange({ ...value, endDate: value.endDate || anchorDue })}
                                className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${value.endDate ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
                            >
                                On date
                            </button>
                        </div>

                        {value.endDate && (
                            <DatePicker
                                value={value.endDate}
                                min={anchorDue}
                                onChange={(endDate) => onChange({ ...value, endDate })}
                                ariaLabel="Repeat until"
                                className="w-full mt-2 bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-sm text-white focus:border-indigo-500 color-scheme-dark"
                            />
                        )}
                    </div>

                    {value.frequency === "weekly" && value.weekdays.length === 0 && (
                        <p className="text-xs font-medium text-rose-400">Pick at least one day of the week.</p>
                    )}
                </div>
            )}
        </div>
    );
}
