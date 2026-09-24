"use client";

import { useState, type ReactNode } from "react";
import { CONSTELLATIONS } from "@/lib/constellations";
import ConstellationFigure from "@/components/starchart/ConstellationFigure";
import { CompassIcon, ListIcon, StarIcon } from "@/components/brand/Icons";

type Props = {
    onFinish: () => void;
};

type Step = {
    eyebrow: string;
    title: string;
    body: ReactNode;
    illustration: ReactNode;
};

const ORION = CONSTELLATIONS[0];

// Vocabulary is gamificationSystem.md's "Feature naming" table — keep the
// two in sync if either changes.
const STEPS: Step[] = [
    {
        eyebrow: "Welcome aboard",
        title: "You're the navigator here.",
        body: (
            <>
                Lodestar turns your coursework into a sky you chart yourself. This screen is <strong>True North</strong>,
                your home base. Everything starts here.
            </>
        ),
        illustration: <CompassIcon size={72} className="text-[var(--ls-gold)]" />,
    },
    {
        eyebrow: "The Ship's Log",
        title: "Your week, all in one place.",
        body: (
            <>
                The <strong>Ship&apos;s Log</strong> is your weekly planner. Drag tasks between days, add your own, and
                let the Canvas extension bring in assignments, discussions, and announcements automatically.
            </>
        ),
        illustration: <LogIllustration />,
    },
    {
        eyebrow: "Polaris",
        title: "One task to steer by.",
        body: (
            <>
                <strong>Polaris</strong> is the single task most worth doing next, weighed by due date, importance, and
                how long it&apos;ll take. When you&apos;re not sure where to start, start there.
            </>
        ),
        illustration: <PolarisIllustration />,
    },
    {
        eyebrow: "The Rundown",
        title: "Nothing hidden, nothing added behind your back.",
        body: (
            <>
                Teachers sometimes bury due dates in announcements. Lodestar reads them and shows what it finds in the{" "}
                <strong>Rundown</strong>. You decide: Yes, No, or Maybe. Nothing lands in your log unless you say so,
                or turn on auto-accept.
            </>
        ),
        illustration: <RundownIllustration />,
    },
    {
        eyebrow: "Starlight",
        title: "Finished work becomes Starlight.",
        body: (
            <>
                Every task you complete earns <strong>Starlight</strong> (and XP). Bigger tasks earn more: a quick
                reading brings in a little, a long project or exam prep a lot. Late work still counts, just a bit less.
            </>
        ),
        illustration: <StarlightIllustration />,
    },
    {
        eyebrow: "The Star Chart",
        title: "Spend it on the sky.",
        body: (
            <>
                Open the <strong>Star Chart</strong> to spend Starlight charting stars in real constellations. Orion,
                the Big Dipper, and Cassiopeia are waiting. More appear as your lifetime Starlight grows, and finishing
                a whole constellation is a moment worth earning.
            </>
        ),
        illustration: (
            <ConstellationFigure constellation={ORION} charted={new Set([0, 1, 2, 3, 4])} className="h-28 w-28" />
        ),
    },
];

export default function Onboarding({ onFinish }: Props) {
    const [index, setIndex] = useState(0);
    const step = STEPS[index];
    const isLast = index === STEPS.length - 1;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="onboarding-title"
            className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgb(10_12_28/0.72)] p-4"
        >
            <div className="sky w-full max-w-md overflow-hidden rounded-3xl border border-[var(--ls-line)] bg-[var(--ls-night)] text-[var(--ls-ivory)] shadow-2xl">
                <div key={index} className="ls-celebrate-fast flex h-40 items-center justify-center bg-[var(--ls-navy)]">
                    {step.illustration}
                </div>

                <div className="p-6">
                    <p className="ls-eyebrow text-[var(--ls-gold)]">{step.eyebrow}</p>
                    <h2 id="onboarding-title" className="mt-2 font-[family-name:var(--font-spectral)] text-2xl leading-snug">
                        {step.title}
                    </h2>
                    <p className="mt-3 text-sm leading-relaxed text-[var(--ls-muted)] [&_strong]:font-semibold [&_strong]:text-[var(--ls-ivory)]">
                        {step.body}
                    </p>

                    <div className="mt-6 flex items-center justify-between gap-3">
                        <div className="flex gap-1.5" aria-label={`Step ${index + 1} of ${STEPS.length}`}>
                            {STEPS.map((_, dotIndex) => (
                                <span
                                    key={dotIndex}
                                    className={`h-1.5 rounded-full transition-all ${
                                        dotIndex === index ? "w-5 bg-[var(--ls-gold)]" : "w-1.5 bg-[var(--ls-line)]"
                                    }`}
                                />
                            ))}
                        </div>

                        <div className="flex items-center gap-2">
                            {index > 0 ? (
                                <button
                                    type="button"
                                    onClick={() => setIndex((current) => current - 1)}
                                    className="rounded-full px-3 py-2 text-sm font-semibold text-[var(--ls-muted)] hover:text-[var(--ls-ivory)]"
                                >
                                    Back
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={onFinish}
                                    className="rounded-full px-3 py-2 text-sm font-semibold text-[var(--ls-muted)] hover:text-[var(--ls-ivory)]"
                                >
                                    Skip
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => (isLast ? onFinish() : setIndex((current) => current + 1))}
                                className="rounded-full bg-[var(--ls-gold)] px-5 py-2 text-sm font-bold text-[var(--ls-navy)] transition-colors hover:bg-[var(--ls-gold-hover)]"
                            >
                                {isLast ? "Start charting" : "Next"}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function LogIllustration() {
    return (
        <div aria-hidden="true" className="grid w-56 grid-cols-5 gap-1.5">
            {["Mon", "Tue", "Wed", "Thu", "Fri"].map((day, dayIndex) => (
                <div key={day} className="rounded-md bg-[var(--ls-navy-raised)] p-1">
                    <p className="text-center text-[9px] text-[var(--ls-muted)]">{day}</p>
                    {Array.from({ length: (dayIndex % 3) + 1 }, (_, taskIndex) => (
                        <div
                            key={taskIndex}
                            className={`mt-1 h-2 rounded-sm ${dayIndex === 1 && taskIndex === 0 ? "bg-[var(--ls-gold)]" : "bg-[var(--ls-line)]"}`}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}

function PolarisIllustration() {
    return (
        <div aria-hidden="true" className="w-56 rounded-xl border border-[var(--ls-gold)]/50 bg-[var(--ls-navy-raised)] p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--ls-gold)]">
                <StarIcon size={11} /> Polaris
            </p>
            <p className="mt-1 text-sm font-semibold">Lab write-up</p>
            <p className="text-[11px] text-[var(--ls-muted)]">BIO 201 · due Friday · about 90 min</p>
        </div>
    );
}

function RundownIllustration() {
    return (
        <div aria-hidden="true" className="w-56 rounded-xl bg-[var(--ls-navy-raised)] p-3 text-[11px]">
            <p className="flex items-center gap-1.5 font-semibold">
                <ListIcon size={12} /> Found in &ldquo;Week 6 update&rdquo;
            </p>
            <p className="mt-1 text-[var(--ls-muted)]">Lab write-up · due Friday</p>
            <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
                <span className="rounded border border-[var(--ls-line)] py-0.5 text-[var(--ls-muted)]">No</span>
                <span className="rounded border border-[var(--ls-line)] py-0.5 text-[var(--ls-muted)]">Maybe</span>
                <span className="rounded bg-[var(--ls-gold)] py-0.5 font-semibold text-[var(--ls-navy)]">Yes</span>
            </div>
        </div>
    );
}

function StarlightIllustration() {
    const rows = [
        { label: "Reading", amount: 20 },
        { label: "Problem set", amount: 50 },
        { label: "Final project", amount: 100 },
    ];

    return (
        <div aria-hidden="true" className="w-56 space-y-1.5">
            {rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between rounded-md bg-[var(--ls-navy-raised)] px-3 py-1.5 text-xs">
                    <span>{row.label}</span>
                    <span className="flex items-center gap-1 text-[var(--ls-gold)]">
                        <StarIcon size={11} /> +{row.amount}
                    </span>
                </div>
            ))}
        </div>
    );
}
