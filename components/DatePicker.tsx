"use client";

import { useRef, useState, useSyncExternalStore } from "react";
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

// What the closed field shows (and accepts when typed), like the browser's own
// date field. Fixed locale: the app is English-only, and a locale-dependent
// string could differ between server and client render.
const TYPED_FORMAT = new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
});

// "9/5/2026", "09/05/2026" or "9-5-2026" → "2026-09-05"; null if not a real day.
function parseTypedDate(text: string): string | null {
    const match = text.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);

    if (!match) return null;

    const key = `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;

    return toDateKey(parseLocalDate(key)) === key ? key : null;
}

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
    placeholder = "mm/dd/yyyy",
    className = "",
    defaultOpen = false,
    onClose,
}: Props) {
    const [open, setOpen] = useState(defaultOpen);
    const [draft, setDraft] = useState<string | null>(null);
    // Opened by clicking the text: keep the cursor there so typing still works.
    const [openedFromText, setOpenedFromText] = useState(false);
    const fieldRef = useRef<HTMLDivElement>(null);
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
        setDraft(null);
        changeOpen(false);
    };

    // Typed "mm/dd/yyyy" is applied on Enter or blur; anything unparseable or
    // out of range snaps back to the current value.
    const commitDraft = () => {
        if (draft === null) return;

        const typed = parseTypedDate(draft);

        if (draft.trim() === "") {
            onChange("");
        } else if (typed && !(min && typed < min) && !(max && typed > max)) {
            onChange(typed);
        }

        setDraft(null);
    };

    return (
        <Popover.Root open={open} onOpenChange={changeOpen}>
            <Popover.Anchor asChild>
                <div
                    ref={fieldRef}
                    className={`flex items-center gap-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--accent)] ${className}`}
                >
                    <input
                        id={id}
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder={placeholder}
                        aria-label={ariaLabel}
                        value={draft ?? (selected ? TYPED_FORMAT.format(selected) : "")}
                        onChange={(event) => setDraft(event.target.value)}
                        onClick={() => {
                            if (!open) {
                                setOpenedFromText(true);
                                setOpen(true);
                            }
                        }}
                        onBlur={commitDraft}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                event.preventDefault();
                                commitDraft();
                                changeOpen(false);
                            } else if (event.key === "ArrowDown" && !open) {
                                setOpenedFromText(false);
                                setOpen(true);
                            }
                        }}
                        className="min-w-0 flex-1 bg-transparent placeholder:text-[var(--muted)] [outline:none]"
                    />
                    <Popover.Trigger asChild>
                        <button
                            type="button"
                            aria-label={`Choose ${ariaLabel.toLowerCase()} from a calendar`}
                            onClick={() => setOpenedFromText(false)}
                            className="shrink-0 rounded text-[var(--accent)] hover:opacity-80"
                        >
                            <CalendarIcon size={16} />
                        </button>
                    </Popover.Trigger>
                </div>
            </Popover.Anchor>

            <Popover.Portal>
                <Popover.Content
                    align="start"
                    sideOffset={6}
                    collisionPadding={12}
                    aria-label="Choose a date"
                    className="lodestar-day-picker z-[100]"
                    onOpenAutoFocus={(event) => {
                        if (openedFromText) event.preventDefault();
                    }}
                    onInteractOutside={(event) => {
                        // Clicking back into the field shouldn't count as "outside".
                        if (fieldRef.current?.contains(event.target as Node)) event.preventDefault();
                    }}
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
                        autoFocus={!openedFromText}
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
