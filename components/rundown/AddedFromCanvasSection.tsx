"use client";

import { AddedFromCanvasItem } from "@/types/rundown";

// AutoTaskCreation.md's "Added from Canvas" — plain Canvas-native
// assignments are already added to the planner by the time this renders;
// this is purely informational (no yes/no/maybe needed, no correctness
// question to resolve). "Remove" is a lightweight, non-forced escape
// hatch for the rare case the user doesn't want one.
type AddedFromCanvasSectionProps = {
    items: AddedFromCanvasItem[];
    onRemove: (item: AddedFromCanvasItem) => void;
};

export default function AddedFromCanvasSection({ items, onRemove }: AddedFromCanvasSectionProps) {
    if (items.length === 0) {
        return null;
    }

    return (
        <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
                Added from Canvas ({items.length})
            </p>

            <div className="max-h-72 overflow-y-auto rounded-2xl border border-[var(--border)]">
                {items.map((item) => (
                    <div
                        key={item.id}
                        className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3 last:border-b-0"
                    >
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{item.name}</p>
                            <p className="text-xs text-[var(--muted)]">
                                {item.course}
                                {item.dueAt && ` · Due ${new Date(item.dueAt).toLocaleDateString()}`}
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={() => onRemove(item)}
                            className="shrink-0 rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-semibold text-[var(--muted)] transition hover:bg-red-500/10 hover:text-red-400"
                        >
                            Remove
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
