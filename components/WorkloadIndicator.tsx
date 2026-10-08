"use client";

import { useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { formatWorkload } from "@/lib/workload";

type Props = {
    taskCount: number;
    minutes: number;
};

// A Popover rather than ui/Tooltip so a tap opens it too; mouse users get
// it on hover. Absolutely positioned by the caller so heavy and normal day
// headers stay the same size.
export default function WorkloadIndicator({ taskCount, minutes }: Props) {
    const [open, setOpen] = useState(false);
    const lastPointerTypeRef = useRef("");
    const breakdown = formatWorkload({ taskCount, minutes });

    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger asChild>
                <button
                    type="button"
                    aria-label={`Heavy day: ${breakdown}`}
                    className="flex h-5 w-5 items-center justify-center rounded-full"
                    onPointerDown={(event) => {
                        lastPointerTypeRef.current = event.pointerType;
                    }}
                    onPointerEnter={(event) => {
                        if (event.pointerType === "mouse") setOpen(true);
                    }}
                    onPointerLeave={(event) => {
                        if (event.pointerType === "mouse") setOpen(false);
                    }}
                    onClick={(event) => {
                        // Hover already opened it; a mouse click shouldn't toggle it shut.
                        if (lastPointerTypeRef.current === "mouse") event.preventDefault();
                        lastPointerTypeRef.current = "";
                    }}
                >
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} />
                </button>
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    side="top"
                    sideOffset={6}
                    collisionPadding={10}
                    className="lodestar-tooltip"
                    onOpenAutoFocus={(event) => event.preventDefault()}
                >
                    <span style={{ color: "var(--accent)" }}>Heavy day:</span> {breakdown}
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}
