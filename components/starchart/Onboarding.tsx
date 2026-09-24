"use client";

import { useEffect, useMemo, useState } from "react";
import { CONSTELLATIONS } from "@/lib/constellations";
import ConstellationFigure from "@/components/starchart/ConstellationFigure";
import TourSpotlight, { type TourStep } from "@/components/starchart/TourSpotlight";
import { useLodestarFrame } from "@/components/world/LaptopFrame";
import { CompassIcon, StarIcon } from "@/components/brand/Icons";

type Props = {
    onFinish: () => void;
};

// Time for LaptopFrame's pull-back / push-in transition (320ms out + 420ms in).
const VIEW_SWITCH_SETTLE_MS = 800;

const ORION = CONSTELLATIONS[0];

// Vocabulary is gamificationSystem.md's "Feature naming" table, and every
// `target` is a `data-tour` anchor on the real UI — add an anchor alongside
// any new step. A missing anchor just centres the card.
export default function Onboarding({ onFinish }: Props) {
    const { getView, openStarChart, openShipsLog } = useLodestarFrame();

    const steps = useMemo<TourStep[]>(() => {
        const inView = (view: "log" | "chart") => () => {
            if (getView() === view) return 0;
            if (view === "chart") openStarChart();
            else openShipsLog();
            return VIEW_SWITCH_SETTLE_MS;
        };
        const onLog = inView("log");

        return [
            {
                id: "welcome",
                before: onLog,
                eyebrow: "Welcome aboard",
                title: "You're the navigator here.",
                body: (
                    <p>
                        Lodestar turns your coursework into a sky you chart yourself. This screen is{" "}
                        <strong>True North</strong>, your home base. Here&apos;s a quick look around. Use the arrow
                        keys if you like.
                    </p>
                ),
                illustration: <CompassIcon size={64} className="text-[var(--ls-gold)]" />,
            },
            {
                id: "ships-log",
                target: "week-grid",
                before: onLog,
                eyebrow: "The Ship's Log",
                title: "Your week, all in one place.",
                body: (
                    <p>
                        Every assignment, discussion, and task lands here on the day it&apos;s due. Drag a card to a
                        different day to plan when you&apos;ll actually do it, and switch between Weekly and Monthly up
                        top.
                    </p>
                ),
            },
            {
                id: "task-label",
                target: "task-label",
                before: onLog,
                eyebrow: "Reading a task label",
                title: "Four parts, one glance.",
                body: <LabelExplainer />,
            },
            {
                id: "courses",
                target: "taskbar-courses",
                before: onLog,
                eyebrow: "Courses",
                title: "Make the labels yours.",
                body: (
                    <p>
                        Rename a course&apos;s abbreviation, change its colour, or add personal courses like
                        &ldquo;Work&rdquo; or &ldquo;Home&rdquo;. Tasks in personal courses show as <strong>TODO</strong>.
                    </p>
                ),
            },
            {
                id: "polaris",
                target: "polaris",
                before: onLog,
                eyebrow: "Polaris",
                title: "One task to steer by.",
                body: (
                    <p>
                        <strong>Polaris</strong> is the single task most worth doing next, weighed by due date,
                        importance, and how long it&apos;ll take. When you&apos;re not sure where to start, start there.
                    </p>
                ),
                illustration: <PolarisIllustration />,
            },
            {
                id: "add",
                target: "taskbar-add",
                before: onLog,
                eyebrow: "Adding tasks",
                title: "Anything Canvas doesn't know about.",
                body: (
                    <p>
                        Add a one-off task, or set up a recurring one for things you do every week, like a Friday
                        problem set or a weekly reading.
                    </p>
                ),
            },
            {
                id: "rundown",
                target: "taskbar-rundown",
                before: onLog,
                eyebrow: "The Rundown",
                title: "Nothing hidden, nothing added behind your back.",
                body: (
                    <p>
                        Teachers sometimes bury due dates in announcements. Lodestar reads them and lists what it finds
                        in the <strong>Rundown</strong>. You choose Yes, No, or Maybe. Nothing lands in your log unless
                        you say so, or turn on auto-accept in settings.
                    </p>
                ),
            },
            {
                id: "tools",
                target: "taskbar-tools",
                before: onLog,
                eyebrow: "Focus & Radio",
                title: "Tools that float alongside your work.",
                body: (
                    <p>
                        A focus timer for work-and-break sessions, and a radio that plays your own YouTube playlists.
                        Both open as windows you can drag anywhere, and keep running while you plan.
                    </p>
                ),
            },
            {
                id: "starlight",
                target: "taskbar-progress",
                before: onLog,
                eyebrow: "Starlight & XP",
                title: "Finished work becomes Starlight.",
                body: (
                    <p>
                        Completing a task earns <strong>XP</strong>, which levels you up, and the same amount of{" "}
                        <strong>Starlight</strong> to spend. Bigger tasks earn more: a quick reading brings in a little, a
                        long project a lot. Late work still counts, just a bit less.
                    </p>
                ),
                illustration: <StarlightIllustration />,
                showIllustrationWithTarget: true,
            },
            {
                id: "star-chart-button",
                target: "star-chart-button",
                before: onLog,
                eyebrow: "The Star Chart",
                title: "Where Starlight goes.",
                body: (
                    <p>
                        This opens your <strong>Star Chart</strong>. Let&apos;s step back and take a look. Night/Day
                        themes, your account, and this tour live under the gear in the taskbar.
                    </p>
                ),
            },
            {
                id: "chart",
                target: "chart-grid",
                before: inView("chart"),
                eyebrow: "Charting your sky",
                title: "Spend Starlight on real constellations.",
                body: (
                    <p>
                        Pick a constellation and chart its stars one at a time. <strong>Orion</strong>, the{" "}
                        <strong>Big Dipper</strong>, and <strong>Cassiopeia</strong> are open now. New constellations
                        appear as your lifetime Starlight grows, and finishing a whole one is a moment worth earning.
                    </p>
                ),
                illustration: (
                    <ConstellationFigure constellation={ORION} charted={new Set([0, 1, 2, 3, 4])} className="h-28 w-28" />
                ),
            },
        ];
    }, [getView, openShipsLog, openStarChart]);

    return <TourSpotlight steps={steps} finishLabel="Start charting" onFinish={() => onFinish()} />;
}

type DecodedLabel = { course: string; type: string; day: string; name: string };

const EXAMPLE_LABEL: DecodedLabel = { course: "MA", type: "HW", day: "F", name: "Problem set 4" };

const TYPE_MEANINGS: [string, string][] = [
    ["HW", "homework and other assignments"],
    ["R", "readings"],
    ["EXAM", "exams, tests, and quizzes"],
    ["TODO", "tasks in your own personal courses"],
];

// Decodes the real first card's label when there is one, so the explanation
// uses the student's own course and task. Format: lib/taskLabel.ts.
function LabelExplainer() {
    const [label, setLabel] = useState<DecodedLabel>(EXAMPLE_LABEL);
    const [isOwn, setIsOwn] = useState(false);

    useEffect(() => {
        const frame = requestAnimationFrame(() => {
            const text = document.querySelector('[data-tour="task-label"]')?.textContent ?? "";
            const [course, type, day, ...rest] = text.split(" - ");

            if (course && type && day && rest.length > 0) {
                setLabel({ course, type, day, name: rest.join(" - ") });
                setIsOwn(true);
            }
        });

        return () => cancelAnimationFrame(frame);
    }, []);

    const chips = [
        { value: label.course, caption: "Course", tone: "bg-[#3a4a8c] text-[#eef0f8]" },
        { value: label.type, caption: "Type", tone: "bg-[#e9c46a] text-[#161b33]" },
        { value: label.day, caption: "Due day", tone: "bg-[#2f6b5e] text-[#eef0f8]" },
        { value: label.name, caption: "Task", tone: "bg-[#262e52] text-[#eef0f8]" },
    ];

    return (
        <div className="space-y-3">
            <p>
                Every card is labelled <strong>course · type · due day · name</strong>
                {isOwn ? ". Here's one of yours, taken apart:" : ", for example:"}
            </p>

            <div className="flex flex-wrap items-start gap-1.5">
                {chips.map((chip) => (
                    <span key={chip.caption} className="flex min-w-0 flex-col items-center gap-1">
                        <span className={`max-w-[160px] truncate rounded-md px-2 py-1 text-xs font-bold ${chip.tone}`}>
                            {chip.value}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-[var(--ls-muted)]">{chip.caption}</span>
                    </span>
                ))}
            </div>

            <ul className="space-y-0.5 text-xs">
                {TYPE_MEANINGS.map(([code, meaning]) => (
                    <li key={code}>
                        <strong>{code}</strong> {meaning}
                    </li>
                ))}
            </ul>

            <p className="text-xs">
                Days are <strong>M T W F</strong>, with <strong>TH</strong>, <strong>SA</strong>, and{" "}
                <strong>SU</strong> spelled out so they never clash. Course abbreviations come from the course name,
                and you can change them in Courses.
            </p>
        </div>
    );
}

function PolarisIllustration() {
    return (
        <div aria-hidden="true" className="w-full max-w-[240px] rounded-xl border border-[var(--ls-gold)]/50 bg-[var(--ls-navy-raised)] p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--ls-gold)]">
                <StarIcon size={11} /> Polaris
            </p>
            <p className="mt-1 text-sm font-semibold">Lab write-up</p>
            <p className="text-[11px] text-[var(--ls-muted)]">BIO 201 · due Friday · about 90 min</p>
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
        <div aria-hidden="true" className="w-full max-w-[240px] space-y-1.5">
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
