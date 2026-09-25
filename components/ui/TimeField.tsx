"use client";

import { useId, useState } from "react";
import { DEFAULT_TIME_PARTS, formatTimeParts, parseTimeKey, parseTypedTime, toTimeKey } from "@/lib/timeOfDay";

type Props = {
    // 24-hour "HH:MM".
    value: string;
    onChange: (value: string) => void;
    ariaLabel: string;
    // Applied to the text box.
    className?: string;
};

// Type a time ("11:59pm", "930", "21:30") and press Enter or tab away; the
// AM/PM buttons settle anything typed without one. Text that isn't a real time
// is flagged and never sent up, so a half-typed value can't overwrite the due time.
export default function TimeField({ value, onChange, ariaLabel, className = "" }: Props) {
    const [draft, setDraft] = useState<string | null>(null);
    const [invalid, setInvalid] = useState(false);
    const hintId = useId();

    const parts = parseTimeKey(value) ?? DEFAULT_TIME_PARTS;

    const apply = (text: string, pm: boolean) => {
        if (text.trim() === "") {
            setDraft(null);
            setInvalid(false);
            return;
        }

        const parsed = parseTypedTime(text, pm);

        if (!parsed) {
            setInvalid(true);
            return;
        }

        setDraft(null);
        setInvalid(false);
        onChange(toTimeKey(parsed));
    };

    const choosePeriod = (pm: boolean) => {
        if (draft !== null) apply(draft, pm);
        else onChange(toTimeKey({ ...parts, pm }));
    };

    return (
        <div>
            <div className="flex items-stretch gap-2">
                <input
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="11:59"
                    aria-label={ariaLabel}
                    aria-invalid={invalid}
                    aria-describedby={invalid ? hintId : undefined}
                    value={draft ?? formatTimeParts(parts)}
                    onChange={(event) => {
                        setDraft(event.target.value);
                        setInvalid(false);
                    }}
                    onBlur={() => {
                        if (draft !== null) apply(draft, parts.pm);
                    }}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            event.preventDefault();
                            apply(draft ?? formatTimeParts(parts), parts.pm);
                        } else if (event.key === "Escape" && draft !== null) {
                            setDraft(null);
                            setInvalid(false);
                        }
                    }}
                    className={`lodestar-time-input min-w-0 flex-1 ${className}`}
                />

                <div role="radiogroup" aria-label={`${ariaLabel}: AM or PM`} className="flex shrink-0 rounded-xl bg-slate-800 p-1">
                    {([false, true] as const).map((isPm) => (
                        <button
                            key={String(isPm)}
                            type="button"
                            role="radio"
                            aria-checked={parts.pm === isPm}
                            onClick={() => choosePeriod(isPm)}
                            className={`lodestar-time-period rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                                parts.pm === isPm ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"
                            }`}
                        >
                            {isPm ? "PM" : "AM"}
                        </button>
                    ))}
                </div>
            </div>

            {invalid && (
                <p id={hintId} role="alert" className="mt-1 text-xs font-medium text-rose-400">
                    Try a time like 11:59 pm or 9:30.
                </p>
            )}
        </div>
    );
}
