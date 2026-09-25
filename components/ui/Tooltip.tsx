"use client";

import type { ReactElement, ReactNode } from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";

type Props = {
    label: ReactNode;
    // One element that can take a ref and props (a button, span, heading…).
    children: ReactElement;
    side?: "top" | "right" | "bottom" | "left";
};

// Replaces the browser's plain `title` tooltip. Shows on hover and on
// keyboard focus; touch devices never had one to lose.
export default function Tooltip({ label, children, side = "top" }: Props) {
    return (
        <RadixTooltip.Provider delayDuration={350} skipDelayDuration={150}>
            <RadixTooltip.Root>
                <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
                <RadixTooltip.Portal>
                    <RadixTooltip.Content side={side} sideOffset={6} collisionPadding={10} className="lodestar-tooltip">
                        {label}
                    </RadixTooltip.Content>
                </RadixTooltip.Portal>
            </RadixTooltip.Root>
        </RadixTooltip.Provider>
    );
}
