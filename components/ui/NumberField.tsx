"use client";

import { useState } from "react";
import { MinusIcon, PlusIcon } from "@/components/brand/Icons";

type Props = {
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    ariaLabel: string;
    id?: string;
    disabled?: boolean;
    // Applied to the wrapper, e.g. a width.
    className?: string;
};

// A whole-number field with − / + buttons instead of the browser's spinner.
// The text box keeps a draft so it can be empty mid-edit; the number handed
// to onChange is always clamped, and the box snaps back to it on blur.
export default function NumberField({ value, onChange, min = 0, max = Number.MAX_SAFE_INTEGER, step = 1, ariaLabel, id, disabled, className = "" }: Props) {
    const [draft, setDraft] = useState<string | null>(null);

    const clamp = (next: number) => Math.min(max, Math.max(min, next));
    const commit = (next: number) => {
        setDraft(null);
        onChange(clamp(next));
    };

    return (
        <div className={`lodestar-number ${className}`}>
            <button type="button" aria-label={`Decrease ${ariaLabel}`} disabled={disabled || value <= min} onClick={() => commit(value - step)}>
                <MinusIcon size={14} />
            </button>
            <input
                id={id}
                type="text"
                inputMode="numeric"
                role="spinbutton"
                aria-label={ariaLabel}
                aria-valuemin={min}
                aria-valuemax={max === Number.MAX_SAFE_INTEGER ? undefined : max}
                aria-valuenow={value}
                disabled={disabled}
                value={draft ?? String(value)}
                onChange={(event) => {
                    const digits = event.target.value.replace(/\D/g, "");

                    setDraft(digits);

                    if (digits !== "") onChange(clamp(Number(digits)));
                }}
                onBlur={() => setDraft(null)}
                onKeyDown={(event) => {
                    if (event.key === "ArrowUp") {
                        event.preventDefault();
                        commit(value + step);
                    } else if (event.key === "ArrowDown") {
                        event.preventDefault();
                        commit(value - step);
                    }
                }}
            />
            <button type="button" aria-label={`Increase ${ariaLabel}`} disabled={disabled || value >= max} onClick={() => commit(value + step)}>
                <PlusIcon size={14} />
            </button>
        </div>
    );
}
