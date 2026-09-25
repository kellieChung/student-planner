"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Window from "@/components/os/Window";
import { useWindowManager } from "@/components/os/WindowManagerContext";
import { useFloatingLayer } from "@/components/os/FloatingLayerContext";
import { ListIcon } from "@/components/brand/Icons";
import { ProposedTask } from "@/types/proposedTask";
import { Course } from "@/types/course";
import { AddedFromCanvasItem } from "@/types/rundown";
import AddedFromCanvasSection from "@/components/rundown/AddedFromCanvasSection";
import AiFoundSection from "@/components/rundown/AiFoundSection";
import DetectionTriggerControls from "@/components/rundown/DetectionTriggerControls";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

// AutoTaskCreation.md's "rundown" screen, shown on app open whenever there's
// anything new since the last visit. A normal floating OS window (draggable,
// resizable, minimisable) rather than a blocking modal — the planner stays
// usable underneath and nothing here is a forced action. Its state lives in
// WeeklyPlannerView, deep inside the scrolling planner, so it portals into
// LaptopFrame's floating-window layer to float instead of scrolling away.
type RundownWindowProps = {
    pendingCandidates: ProposedTask[];
    addedFromCanvas: AddedFromCanvasItem[];
    courses: Course[];
    onCourseCreated: (course: Course) => void;
    onYes: (task: ProposedTask) => void;
    onNo: (task: ProposedTask) => void;
    onMaybe: (task: ProposedTask) => void;
    onRemoveCanvasItem: (item: AddedFromCanvasItem) => void;
    onNewCandidates: (tasks: ProposedTask[]) => void;
    onRunFinished?: () => void;
    onClose: () => void;
};

export default function RundownWindow({
    pendingCandidates,
    addedFromCanvas,
    courses,
    onCourseCreated,
    onYes,
    onNo,
    onMaybe,
    onRemoveCanvasItem,
    onNewCandidates,
    onRunFinished,
    onClose,
}: RundownWindowProps) {
    const { openWindow, closeWindow } = useWindowManager();
    const floatingLayer = useFloatingLayer();
    const [checkRunning, setCheckRunning] = useState(false);
    const [confirmClose, setConfirmClose] = useState(false);

    useEffect(() => {
        openWindow("rundown");
        // Open once when mounted; later re-opens come from the taskbar button.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!floatingLayer) return null;

    return createPortal(
        <Window
            app="rundown"
            title="Rundown"
            icon={<ListIcon size={14} />}
            onBeforeClose={onClose}
            interceptClose={() => {
                if (!checkRunning) return false;
                setConfirmClose(true);
                return true;
            }}
        >
            <ConfirmDialog
                open={confirmClose}
                onOpenChange={setConfirmClose}
                title="Stop the announcement check?"
                description="Closing the Rundown stops the check that's running. Suggestions already found are kept, but the rest of this check won't run and it still counts as used."
                confirmLabel="Stop and close"
                cancelLabel="Keep checking"
                onConfirm={() => {
                    setConfirmClose(false);
                    onClose();
                    closeWindow("rundown");
                }}
            />
            <div className="theme-surface flex h-full flex-col gap-6 overflow-y-auto px-5 py-4" style={{ boxShadow: "none" }}>
                <h2 className="text-xl font-bold">What&apos;s new</h2>

                <AddedFromCanvasSection items={addedFromCanvas} onRemove={onRemoveCanvasItem} />

                <AiFoundSection
                    candidates={pendingCandidates}
                    courses={courses}
                    onCourseCreated={onCourseCreated}
                    onYes={onYes}
                    onNo={onNo}
                    onMaybe={onMaybe}
                />

                {pendingCandidates.length === 0 && addedFromCanvas.length === 0 && (
                    <p className="text-sm text-[var(--muted)]">
                        Nothing new since your last visit.
                    </p>
                )}

                <div className="border-t border-[var(--border)] pt-5">
                    <DetectionTriggerControls
                        onNewCandidates={onNewCandidates}
                        onRunFinished={onRunFinished}
                        onRunningChange={setCheckRunning}
                    />
                </div>
            </div>
        </Window>,
        floatingLayer
    );
}
