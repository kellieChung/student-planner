"use client";

import { useState } from "react";
import Switch from "@/components/ui/Switch";
import Tooltip from "@/components/ui/Tooltip";
import { ChevronDownIcon, ChevronUpIcon, GripIcon } from "@/components/brand/Icons";
import {
    DEFAULT_TASK_LABEL_PARTS,
    formatTaskLabel,
    isDefaultTaskLabelParts,
    TASK_LABEL_PARTS,
    type TaskLabelPart,
} from "@/lib/taskLabel";

type Props = {
    parts: TaskLabelPart[];
    onChange: (parts: TaskLabelPart[]) => void;
};

const PART_NAMES: Record<TaskLabelPart, string> = {
    course: "Course",
    type: "Type",
    day: "Due day",
    name: "Name",
};

const SAMPLE_TASK = {
    courseAbbreviation: "ESAW",
    typeCode: "HW",
    // A Monday, so the preview reads "M".
    dueDateKey: "2026-10-05",
    name: "Reflection 3",
};

function move(parts: TaskLabelPart[], from: number, to: number): TaskLabelPart[] {
    const next = [...parts];
    const [part] = next.splice(from, 1);
    next.splice(to, 0, part);
    return next;
}

// `parts` is the visible parts in order; hidden ones are listed after them
// and can only be switched back on, not reordered.
export default function TaskLabelSettings({ parts, onChange }: Props) {
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const hiddenParts = TASK_LABEL_PARTS.filter((part) => !parts.includes(part));

    function show(part: TaskLabelPart) {
        // Return it to roughly where the default order has it.
        const index = Math.min(DEFAULT_TASK_LABEL_PARTS.indexOf(part), parts.length);
        onChange([...parts.slice(0, index), part, ...parts.slice(index)]);
    }

    function hide(part: TaskLabelPart) {
        onChange(parts.filter((p) => p !== part));
    }

    const arrowClass = "rounded p-0.5 text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-30 disabled:hover:text-[var(--muted)]";

    return (
        <div>
            <p
                className="mb-2 truncate rounded-md px-2 py-1.5 text-xs font-semibold"
                style={{ background: "var(--panel-muted)", color: "var(--foreground)" }}
            >
                {formatTaskLabel(SAMPLE_TASK, parts)}
            </p>

            <ul className="space-y-0.5">
                {parts.map((part, index) => (
                    <li
                        key={part}
                        draggable
                        onDragStart={(e) => {
                            setDragIndex(index);
                            e.dataTransfer.effectAllowed = "move";
                            // Firefox won't start a drag without data.
                            e.dataTransfer.setData("text/plain", part);
                        }}
                        onDragOver={(e) => {
                            if (dragIndex === null) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                        }}
                        onDrop={(e) => {
                            e.preventDefault();
                            if (dragIndex !== null && dragIndex !== index) onChange(move(parts, dragIndex, index));
                            setDragIndex(null);
                        }}
                        onDragEnd={() => setDragIndex(null)}
                        className={`flex items-center gap-1.5 rounded-lg px-1 py-1 text-xs ${dragIndex === index ? "opacity-40" : ""}`}
                        style={{ color: "var(--foreground)" }}
                    >
                        <span className="cursor-grab text-[var(--muted)] active:cursor-grabbing">
                            <GripIcon size={14} />
                        </span>
                        <span className="flex-1">{PART_NAMES[part]}</span>
                        <button
                            type="button"
                            onClick={() => onChange(move(parts, index, index - 1))}
                            disabled={index === 0}
                            aria-label={`Move ${PART_NAMES[part]} earlier`}
                            className={arrowClass}
                        >
                            <ChevronUpIcon size={14} />
                        </button>
                        <button
                            type="button"
                            onClick={() => onChange(move(parts, index, index + 1))}
                            disabled={index === parts.length - 1}
                            aria-label={`Move ${PART_NAMES[part]} later`}
                            className={arrowClass}
                        >
                            <ChevronDownIcon size={14} />
                        </button>
                        {part === "name" ? (
                            <Tooltip label="Name is always shown">
                                {/* A disabled control gets no hover events, so the wrapper carries the tooltip. */}
                                <span tabIndex={0} className="inline-flex">
                                    <Switch checked disabled onChange={() => {}} ariaLabel="Show Name (always shown)" />
                                </span>
                            </Tooltip>
                        ) : (
                            <Switch checked onChange={() => hide(part)} ariaLabel={`Show ${PART_NAMES[part]}`} />
                        )}
                    </li>
                ))}

                {hiddenParts.map((part) => (
                    <li
                        key={part}
                        className="flex items-center gap-1.5 rounded-lg px-1 py-1 text-xs"
                        style={{ color: "var(--muted)" }}
                    >
                        <span className="w-[14px]" />
                        <span className="flex-1">{PART_NAMES[part]}</span>
                        <Switch checked={false} onChange={() => show(part)} ariaLabel={`Show ${PART_NAMES[part]}`} />
                    </li>
                ))}
            </ul>

            {!isDefaultTaskLabelParts(parts) && (
                <button
                    type="button"
                    onClick={() => onChange(DEFAULT_TASK_LABEL_PARTS)}
                    className="mt-1 text-xs font-semibold underline"
                    style={{ color: "var(--muted)" }}
                >
                    Reset to default
                </button>
            )}
        </div>
    );
}
