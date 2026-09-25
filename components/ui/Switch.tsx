"use client";

import * as RadixSwitch from "@radix-ui/react-switch";

type Props = {
    checked: boolean;
    onChange: (checked: boolean) => void;
    id?: string;
    ariaLabel?: string;
    disabled?: boolean;
};

export default function Switch({ checked, onChange, id, ariaLabel, disabled }: Props) {
    return (
        <RadixSwitch.Root
            id={id}
            checked={checked}
            disabled={disabled}
            aria-label={ariaLabel}
            onCheckedChange={onChange}
            className="lodestar-switch"
        >
            <RadixSwitch.Thumb className="lodestar-switch-thumb" />
        </RadixSwitch.Root>
    );
}
