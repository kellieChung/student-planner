"use client";

import * as RadixSlider from "@radix-ui/react-slider";

type Props = {
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    ariaLabel: string;
    disabled?: boolean;
    className?: string;
};

export default function Slider({ value, onChange, min = 0, max = 100, step = 1, ariaLabel, disabled, className = "" }: Props) {
    return (
        <RadixSlider.Root
            value={[value]}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            onValueChange={([next]) => onChange(next)}
            className={`lodestar-slider ${className}`}
        >
            <RadixSlider.Track className="lodestar-slider-track">
                <RadixSlider.Range className="lodestar-slider-range" />
            </RadixSlider.Track>
            <RadixSlider.Thumb aria-label={ariaLabel} className="lodestar-slider-thumb" />
        </RadixSlider.Root>
    );
}
