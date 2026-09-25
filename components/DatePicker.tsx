"use client";

import { useState, useSyncExternalStore } from "react";
import * as Popover from "@radix-ui/react-popover";
import { DayPicker, type Matcher } from "react-day-picker";
import { CalendarIcon } from "@/components/brand/Icons";
import { getTodayString, parseLocalDate, toDateKey } from "@/lib/utils";

type Props = {
    // "YYYY-MM-DD", or "" for no date.
    value: string;
    onChange: (value: string) => void;
    min?: string;
    max?: string;
    id?: string;
    // Names the control for screen readers, e.g. "Due date". The current value is appended.
    ariaLabel: string;
    placeholder?: string;
    // Applied to the trigger button (or the native input on touch devices).
    className?: string;
    // For inline editors that mount the picker already open, and need to know when it closes.
    defaultOpen?: boolean;
    onClose?: () => void;
};

const COARSE_POINTER = "(pointer: coarse)";

function subscribeToPointerType(callback: () => void) {
    const query = window.matchMedia(COARSE_POINTER);

    query.addEventListener("change", callback);

    return () => query.removeEventListener("change", callback);
}

const isCoarsePointer = () => window.matchMedia(COARSE_POINTER).matches;

// Fixed locale: the app is English-only, and a locale-dependent string could
// differ between server and client render.
const DISPLAY_FORMAT = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
});

// Touch devices keep the OS date picker (large targets, familiar wheel/sheet
// UI). Everything else gets the branded calendar. Dates stay "YYYY-MM-DD"
// strings on both sides; conversion goes through parseLocalDate/toDateKey so
// no UTC parsing ever touches a calendar day.
export default function DatePicker({
    value,
    onChange,
    min,
    max,
    id,
    ariaLabel,
    placeholder = "Pick a date",
    className = "",
    defaultOpen = false,
    onClose,
}: Props) {
    const [open, setOpen] = useState(defaultOpen);
    const useNativePicker = useSyncExternalStore(subscribeToPointerType, isCoarsePointer, () => false);

    if (useNativePicker) {
        return (
            <input
                id={id}
                type="date"
                value={value}
                min={min}
                max={max}
                aria-label={ariaLabel}
                autoFocus={defaultOpen}
                onChange={(event) => onChange(event.target.value)}
                onBlur={() => onClose?.()}
                onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === "Escape") onClose?.();
                }}
                className={className}
            />
        );
    }

    const selected = value ? parseLocalDate(value) : undefined;
    const today = getTodayString();
    const disabled: Matcher[] = [];

    if (min) disabled.push({ before: parseLocalDate(min) });
    if (max) disabled.push({ after: parseLocalDate(max) });

    const todayOutOfRange = Boolean((min && today < min) || (max && today > max));

    const changeOpen = (next: boolean) => {
        setOpen(next);

        if (!next) onClose?.();
    };

    const choose = (dateKey: string) => {
        onChange(dateKey);
        changeOpen(false);
    };

    return (
        <Popover.Root open={open} onOpenChange={changeOpen}>
            <Popover.Trigger asChild>
                <button
                    id={id}
                    type="button"
                    aria-label={`${ariaLabel}: ${selected ? DISPLAY_FORMAT.format(selected) : "no date chosen"}`}
                    className={`flex items-center justify-between gap-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${className}`}
                >
                    <span className={selected ? undefined : "text-[var(--muted)]"}>
                        {selected ? DISPLAY_FORMAT.format(selected) : placeholder}
                    </span>
                    <CalendarIcon size={16} className="shrink-0 text-[var(--accent)]" />
                </button>
            </Popover.Trigger>

            <Popover.Portal>
                <Popover.Content
                    align="start"
                    sideOffset={6}
                    collisionPadding={12}
                    aria-label="Choose a date"
                    className="lodestar-day-picker z-[100]"
                >
                    <DayPicker
                        mode="single"
                        required
                        selected={selected}
                        defaultMonth={selected ?? new Date()}
                        onSelect={(date) => choose(toDateKey(date))}
                        disabled={disabled}
                        weekStartsOn={0}
                        showOutsideDays
                        autoFocus
                    />

                    <div className="lodestar-day-picker-footer">
                        <button type="button" disabled={todayOutOfRange} onClick={() => choose(today)}>
                            Today
                        </button>
                    </div>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}
