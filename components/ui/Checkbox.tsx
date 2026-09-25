"use client";

import * as RadixCheckbox from "@radix-ui/react-checkbox";
import { CheckIcon } from "@/components/brand/Icons";

type Props = {
    checked: boolean;
    onChange: (checked: boolean) => void;
    id?: string;
    ariaLabel?: string;
    disabled?: boolean;
    className?: string;
};

export default function Checkbox({ checked, onChange, id, ariaLabel, disabled, className = "" }: Props) {
    return (
        <RadixCheckbox.Root
            id={id}
            checked={checked}
            disabled={disabled}
            aria-label={ariaLabel}
            onCheckedChange={(next) => onChange(next === true)}
            className={`lodestar-checkbox ${className}`}
        >
            <RadixCheckbox.Indicator>
                <CheckIcon size={12} strokeWidth={2.6} />
            </RadixCheckbox.Indicator>
        </RadixCheckbox.Root>
    );
}
