"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import ConstellationFigure from "@/components/starchart/ConstellationFigure";
import { getConstellation } from "@/lib/constellations";
import type { DemoTask } from "@/types/landingDemo";

type Props = {
    tasks: DemoTask[];
};

const SIGN_UP_HREF = "/login?mode=signup";
const PULSE_MS = 550;

// Star i is task i, so the week reads left to right like the constellation.
const constellation = getConstellation("cassiopeia")!;

export default function DemoPlanner({ tasks }: Props) {
    const [done, setDone] = useState<Set<number>>(new Set());
    const [lastLit, setLastLit] = useState<number | null>(null);
    const [pulsing, setPulsing] = useState<number | null>(null);
    const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => {
        if (pulseTimer.current) clearTimeout(pulseTimer.current);
    }, []);

    const starlight = tasks.reduce((sum, task, index) => sum + (done.has(index) ? task.starlight : 0), 0);
    const complete = done.size === tasks.length;

    const toggle = (index: number) => {
        const finishing = !done.has(index);

        setDone((current) => {
            const next = new Set(current);
            if (finishing) next.add(index);
            else next.delete(index);
            return next;
        });
        setLastLit(finishing ? index : null);

        if (finishing) {
            setPulsing(index);
            if (pulseTimer.current) clearTimeout(pulseTimer.current);
            pulseTimer.current = setTimeout(() => setPulsing(null), PULSE_MS);
        }
    };

    const reset = () => {
        setDone(new Set());
        setLastLit(null);
        setPulsing(null);
    };

    return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
            <div className="rounded-2xl border border-[var(--ls-line)] bg-[var(--ls-navy)] p-4 sm:p-5">
                <div className="flex items-baseline justify-between gap-4">
                    <h3 className="ls-serif text-xl text-[var(--ls-ivory)]">Ship&apos;s Log</h3>
                    <p className="text-xs text-[var(--ls-muted)]">This week</p>
                </div>

                <div aria-hidden="true" className="mt-4 hidden grid-cols-5 gap-2 text-center text-xs font-semibold uppercase tracking-wider text-[var(--ls-muted)] sm:grid">
                    {tasks.map((task) => (
                        <span key={task.id}>{task.day}</span>
                    ))}
                </div>

                <ul className="mt-2 grid gap-2 sm:grid-cols-5">
                    {tasks.map((task, index) => {
                        const finished = done.has(index);

                        return (
                            <li key={task.id} className="h-[88px] min-w-0">
                                <div
                                    onClick={() => toggle(index)}
                                    className={`relative cursor-pointer overflow-hidden rounded-lg border px-2 py-1.5 transition-all duration-200 ${
                                        finished
                                            ? "h-7 border-[var(--ls-line)] bg-green-900/40 opacity-55 hover:opacity-90"
                                            : "h-[88px] border-[rgb(184_189_214/0.3)] bg-[var(--ls-navy-raised)] hover:border-[var(--ls-gold)]"
                                    } ${pulsing === index ? "task-card--completing" : ""}`}
                                >
                                    <div className={`flex min-w-0 gap-1.5 ${finished ? "items-center" : "items-start"}`}>
                                        <button
                                            type="button"
                                            aria-pressed={finished}
                                            aria-label={`${finished ? "Mark not done" : "Mark done"}: ${task.label}`}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                toggle(index);
                                            }}
                                            className="-m-1.5 shrink-0 rounded-full p-1.5"
                                        >
                                            <span
                                                className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border ${
                                                    finished
                                                        ? "task-status-toggle--pop border-transparent bg-[#22c55e]"
                                                        : "border-[var(--ls-muted)]"
                                                }`}
                                            >
                                                {finished && (
                                                    <svg viewBox="0 0 16 16" className="h-full w-full p-0.5 text-white" fill="none" stroke="currentColor" strokeWidth={2}>
                                                        <path d="M3 8.5L6.5 12L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
                                                    </svg>
                                                )}
                                            </span>
                                        </button>

                                        {finished ? (
                                            <p className="min-w-0 truncate text-xs leading-none text-[var(--ls-muted)] line-through">
                                                {task.label}
                                            </p>
                                        ) : (
                                            <div className="min-w-0">
                                                <span className={`inline-block max-w-full truncate rounded px-1.5 py-1 align-bottom text-[10px] font-bold uppercase leading-none tracking-wider text-white ${task.courseColorClass}`}>
                                                    {task.course}
                                                </span>
                                                <p className="mt-1 line-clamp-2 text-xs font-semibold leading-tight text-[var(--ls-ivory)]" title={task.label}>
                                                    {task.label}
                                                </p>
                                                <p className="mt-0.5 truncate text-[11px] text-[var(--ls-muted)]">
                                                    {task.fromAnnouncement ? "From announcement" : task.detail}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ul>

                <p className="mt-4 text-xs text-[var(--ls-muted)]">
                    Tap a circle to finish a task. Finished cards stay put, just like in the planner.
                </p>
            </div>

            <div className="flex flex-col items-center rounded-2xl border border-[var(--ls-line)] bg-[var(--ls-navy)] p-5 text-center">
                <p className="ls-eyebrow text-[var(--ls-gold)]">Star Chart</p>
                <ConstellationFigure
                    constellation={constellation}
                    charted={done}
                    igniting={lastLit === null ? undefined : new Set([lastLit])}
                    celebrate={complete}
                    className="mt-4 w-full max-w-[220px]"
                />
                <p className="ls-serif mt-2 text-lg text-[var(--ls-ivory)]">{constellation.name}</p>

                <p aria-live="polite" className="mt-1 text-sm text-[var(--ls-muted)]">
                    {complete
                        ? "Fully charted."
                        : `${done.size} of ${tasks.length} stars charted`}
                </p>
                <p className="mt-3 flex items-center gap-1.5 text-2xl font-semibold tabular-nums text-[var(--ls-gold)]">
                    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4">
                        <path d="M8 1.5 9.4 6.6 14.5 8 9.4 9.4 8 14.5 6.6 9.4 1.5 8 6.6 6.6Z" fill="currentColor" />
                    </svg>
                    {starlight}
                    <span className="text-sm font-medium text-[var(--ls-muted)]">Starlight</span>
                </p>

                {complete ? (
                    <div className="ls-celebrate-fast mt-4 flex flex-col items-center gap-3">
                        <Link href={SIGN_UP_HREF} className="ls-button-gold ls-button-sm">
                            Chart your own sky
                        </Link>
                        <button type="button" onClick={reset} className="ls-link-quiet text-xs font-semibold">
                            Start over
                        </button>
                    </div>
                ) : (
                    <p className="mt-4 text-xs leading-relaxed text-[var(--ls-muted)]">
                        In the app, you choose when to spend Starlight on a star.
                    </p>
                )}
            </div>
        </div>
    );
}
