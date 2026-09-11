"use client";

import { useState } from "react";
import { MASCOT_NAME } from "@/lib/mascotDialogue";
import Mascot from "./Mascot";

type Props = {
    phase: "intro" | "tour";
    onOpenLaptop?: () => void;
    onComplete?: () => void;
};

const INTRO_LINES = [
    "Ugh... systems rebooting. Why is there a castle. Why am I looking at a castle right now.",
    `Oh. OH. I know this trope. I've been "reincarnated," haven't I. Fine. I'm ${MASCOT_NAME}, and apparently I live here now.`,
    "Good news: I still remember how to run a proper task list. Bad news: everyone here calls it \"ancient time magic.\" Open the laptop and I'll show you around.",
];

const TOUR_STEPS = [
    { title: "Your Quest Log", body: "This is where every assignment, reading, and exam lands — add tasks and check them off as you go." },
    { title: "Ancient Time Magic", body: "The hourglass ritual (really, a Pomodoro timer) keeps you focused in short bursts." },
    { title: "The Bard's Lute", body: "Background music, imported straight from a traveling minstrel's playlist (a YouTube playlist, really)." },
];

// First-run-only sequence: a "world"-styled Nano intro before the laptop
// opens (phase "intro"), then a few dismissible callouts layered over the
// real OS once it's open (phase "tour"). Callouts describe what they point
// at in text rather than anchoring to exact DOM coordinates — a reasonable
// first pass, not pixel-precise tooltips.
export default function OnboardingOverlay({ phase, onOpenLaptop, onComplete }: Props) {
    const [introIndex, setIntroIndex] = useState(0);
    const [tourIndex, setTourIndex] = useState(0);

    if (phase === "intro") {
        const isLast = introIndex === INTRO_LINES.length - 1;

        return (
            <div
                className="flex h-full min-h-[520px] flex-col items-center justify-center gap-6 p-6 text-center"
                style={{ background: "var(--app-background)" }}
            >
                <Mascot dialogue={INTRO_LINES[introIndex]} size="lg" />
                <div className="flex flex-col items-center gap-2">
                    <button
                        type="button"
                        onClick={() => (isLast ? onOpenLaptop?.() : setIntroIndex((i) => i + 1))}
                        className="rounded-lg border px-5 py-2 text-sm font-bold transition-transform hover:scale-105"
                        style={{ borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--heading)" }}
                    >
                        {isLast ? "💻 Open the Laptop" : "Continue"}
                    </button>
                    {!isLast && (
                        <button
                            type="button"
                            onClick={onOpenLaptop}
                            className="text-xs underline"
                            style={{ color: "var(--muted)" }}
                        >
                            Skip intro
                        </button>
                    )}
                </div>
            </div>
        );
    }

    const step = TOUR_STEPS[tourIndex];
    const isLastStep = tourIndex === TOUR_STEPS.length - 1;

    return (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center p-6 sm:items-center">
            <div
                className="pointer-events-auto w-full max-w-sm rounded-xl border p-4 shadow-2xl"
                style={{ background: "var(--panel-raised)", borderColor: "var(--accent)" }}
            >
                <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--muted)" }}>
                    {MASCOT_NAME} says ({tourIndex + 1}/{TOUR_STEPS.length})
                </p>
                <h3 className="mt-1 text-sm font-bold" style={{ color: "var(--heading)" }}>
                    {step.title}
                </h3>
                <p className="mt-1 text-xs" style={{ color: "var(--foreground)" }}>
                    {step.body}
                </p>
                <div className="mt-3 flex justify-between">
                    <button type="button" onClick={onComplete} className="text-xs underline" style={{ color: "var(--muted)" }}>
                        Skip
                    </button>
                    <button
                        type="button"
                        onClick={() => (isLastStep ? onComplete?.() : setTourIndex((i) => i + 1))}
                        className="rounded-md border px-3 py-1 text-xs font-bold"
                        style={{ borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--heading)" }}
                    >
                        {isLastStep ? "Got it" : "Next"}
                    </button>
                </div>
            </div>
        </div>
    );
}
