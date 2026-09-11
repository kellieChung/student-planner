"use client";

import { MASCOT_NAME } from "@/lib/mascotDialogue";

type Props = {
    dialogue: string | null;
};

// The persistent "OS voice" icon — Nano's presence inside the laptop, per
// gamificationSystem.md ("doesn't need to be a full sprite, can be a small
// stylized icon"). Fixed in a corner so it never sits between the user and
// the daily task list.
export default function MascotBubble({ dialogue }: Props) {
    return (
        <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
            <div
                className={`pointer-events-auto max-w-[240px] rounded-lg border px-3 py-2 text-xs shadow-lg transition-all duration-200 ${
                    dialogue ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1 opacity-0"
                }`}
                style={{ background: "var(--panel-raised)", borderColor: "var(--accent)", color: "var(--foreground)" }}
                role="status"
            >
                {dialogue}
            </div>
            <div
                className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border-2 text-lg shadow-md"
                style={{ background: "var(--accent-soft)", borderColor: "var(--accent)" }}
                title={MASCOT_NAME}
                aria-hidden="true"
            >
                🧙‍♂️
            </div>
        </div>
    );
}
