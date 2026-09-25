"use client";

import * as RadixSelect from "@radix-ui/react-select";
import { CheckIcon, ChevronDownIcon } from "@/components/brand/Icons";

export type SelectOption = { value: string; label: string; disabled?: boolean };

type Props = {
    value: string;
    onChange: (value: string) => void;
    options: SelectOption[];
    ariaLabel?: string;
    id?: string;
    placeholder?: string;
    disabled?: boolean;
    // Applied to the trigger, so a call site keeps its own sizing and colours.
    className?: string;
};

// Radix reserves "" to mean "no selection", but this app uses "" for real
// options such as "Auto" — so the empty string is swapped for a sentinel on
// the way in and back out, and call sites keep their existing values.
const EMPTY = "__empty__";
const toRadix = (value: string) => (value === "" ? EMPTY : value);
const fromRadix = (value: string) => (value === EMPTY ? "" : value);

export default function Select({ value, onChange, options, ariaLabel, id, placeholder, disabled, className = "" }: Props) {
    const hasSelection = options.some((option) => option.value === value);

    return (
        <RadixSelect.Root
            // Radix's own "" means "nothing selected, show the placeholder" and
            // keeps the select controlled (undefined would flip it).
            value={hasSelection ? toRadix(value) : ""}
            onValueChange={(next) => onChange(fromRadix(next))}
            disabled={disabled}
        >
            <RadixSelect.Trigger
                id={id}
                aria-label={ariaLabel}
                className={`lodestar-select-trigger flex items-center justify-between gap-2 text-left ${className}`}
            >
                <span className="min-w-0 flex-1 truncate">
                    <RadixSelect.Value placeholder={placeholder ?? "Select…"} />
                </span>
                <RadixSelect.Icon className="shrink-0 text-[var(--accent)]">
                    <ChevronDownIcon size={14} />
                </RadixSelect.Icon>
            </RadixSelect.Trigger>

            <RadixSelect.Portal>
                <RadixSelect.Content position="popper" sideOffset={4} collisionPadding={12} className="lodestar-select-content">
                    <RadixSelect.Viewport className="lodestar-select-viewport">
                        {options.map((option) => (
                            <RadixSelect.Item
                                key={option.value}
                                value={toRadix(option.value)}
                                disabled={option.disabled}
                                className="lodestar-select-item"
                            >
                                <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                                <RadixSelect.ItemIndicator className="lodestar-select-check">
                                    <CheckIcon size={14} />
                                </RadixSelect.ItemIndicator>
                            </RadixSelect.Item>
                        ))}
                    </RadixSelect.Viewport>
                </RadixSelect.Content>
            </RadixSelect.Portal>
        </RadixSelect.Root>
    );
}
