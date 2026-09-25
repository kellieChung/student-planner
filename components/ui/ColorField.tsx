"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { CheckIcon } from "@/components/brand/Icons";
import { readableTextColor } from "@/lib/courseColor";

type Props = {
    // "#rrggbb"
    value: string;
    onChange: (value: string) => void;
    ariaLabel: string;
    defaultOpen?: boolean;
};

// Seven hues in three shades (Tailwind 400 / 600 / 800), laid out light to
// deep down the grid. Badge text colour is picked from the background
// (lib/courseColor.ts), so the pale ones stay readable.
const HUES: { name: string; shades: [string, string, string] }[] = [
    { name: "Red", shades: ["#f87171", "#dc2626", "#991b1b"] },
    { name: "Orange", shades: ["#fb923c", "#ea580c", "#9a3412"] },
    { name: "Yellow", shades: ["#facc15", "#ca8a04", "#854d0e"] },
    { name: "Green", shades: ["#4ade80", "#16a34a", "#166534"] },
    { name: "Blue", shades: ["#60a5fa", "#2563eb", "#1e40af"] },
    { name: "Purple", shades: ["#c084fc", "#9333ea", "#6b21a8"] },
    { name: "Gray", shades: ["#9ca3af", "#6b7280", "#374151"] },
];
const SHADE_NAMES = ["light", "medium", "deep"] as const;

const SWATCHES = SHADE_NAMES.flatMap((shade, shadeIndex) =>
    HUES.map((hue) => ({ name: `${hue.name}, ${shade}`, hex: hue.shades[shadeIndex] }))
);

const HEX = /^#[0-9a-f]{6}$/i;

// Swatches for the common case, plus a hex box so any colour is still possible.
export default function ColorField({ value, onChange, ariaLabel, defaultOpen = false }: Props) {
    const [draft, setDraft] = useState<string | null>(null);
    const shown = draft ?? value;
    const invalid = draft !== null && !HEX.test(draft);

    return (
        <Popover.Root defaultOpen={defaultOpen} onOpenChange={(open) => !open && setDraft(null)}>
            <Popover.Trigger asChild>
                <button
                    type="button"
                    aria-label={`${ariaLabel}: ${value}`}
                    className="lodestar-color-trigger"
                    style={{ backgroundColor: value }}
                />
            </Popover.Trigger>

            <Popover.Portal>
                <Popover.Content align="start" sideOffset={6} collisionPadding={12} aria-label="Choose a colour" className="lodestar-color-content">
                    <div className="lodestar-color-grid" role="group" aria-label="Colour swatches">
                        {SWATCHES.map((swatch) => {
                            const selected = value.toLowerCase() === swatch.hex;

                            return (
                                <button
                                    key={swatch.hex}
                                    type="button"
                                    aria-label={swatch.name}
                                    aria-pressed={selected}
                                    onClick={() => {
                                        setDraft(null);
                                        onChange(swatch.hex);
                                    }}
                                    className="lodestar-color-swatch"
                                    style={{ backgroundColor: swatch.hex, color: readableTextColor(swatch.hex) }}
                                >
                                    {selected && <CheckIcon size={14} strokeWidth={2.6} />}
                                </button>
                            );
                        })}
                    </div>

                    <label className="lodestar-color-hex">
                        <span>Hex</span>
                        <input
                            type="text"
                            value={shown}
                            maxLength={7}
                            spellCheck={false}
                            aria-invalid={invalid}
                            onChange={(event) => {
                                const next = event.target.value.startsWith("#") ? event.target.value : `#${event.target.value}`;

                                setDraft(next);

                                if (HEX.test(next)) onChange(next.toLowerCase());
                            }}
                        />
                    </label>
                    {invalid && <p className="lodestar-color-error">Use six digits, like #0f766e.</p>}
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}
