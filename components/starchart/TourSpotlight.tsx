"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export type TourStep = {
    id: string;
    // A `data-tour` value on a real element. Missing/hidden targets fall back
    // to a centred card, so every step still works (e.g. no tasks yet).
    target?: string;
    eyebrow: string;
    title: string;
    body: ReactNode;
    // Shown on the centred card (no target). Next to a real target it's
    // usually redundant, so it's hidden there unless this is set.
    illustration?: ReactNode;
    showIllustrationWithTarget?: boolean;
    // Runs when the step opens (e.g. switch to the Star Chart); returns how
    // long to wait for that to settle before measuring the target.
    before?: () => number | void;
};

type Props = {
    steps: TourStep[];
    finishLabel: string;
    onFinish: (completed: boolean) => void;
};

type Rect = { top: number; left: number; width: number; height: number };

const SPOT_PADDING = 8;
const CARD_GAP = 16;
const EDGE = 16;
const CARD_WIDTH = 380;
const NARROW_BREAKPOINT = 640;

function findTarget(target: string | undefined): HTMLElement | null {
    if (!target || typeof document === "undefined") return null;

    const element = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);

    if (!element) return null;

    // Inside a visibility:hidden view (e.g. the Ship's Log while the Star
    // Chart is showing) the element still has a box, so check explicitly.
    if (typeof element.checkVisibility === "function" && !element.checkVisibility({ visibilityProperty: true })) {
        return null;
    }

    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0 ? element : null;
}

function sameRect(a: Rect | null, b: Rect | null): boolean {
    if (!a || !b) return a === b;
    return (
        Math.abs(a.top - b.top) < 0.5 &&
        Math.abs(a.left - b.left) < 0.5 &&
        Math.abs(a.width - b.width) < 0.5 &&
        Math.abs(a.height - b.height) < 0.5
    );
}

// A spotlight that glides between real parts of the app (`data-tour`
// anchors), dimming everything else, with a callout card beside it.
export default function TourSpotlight({ steps, finishLabel, onFinish }: Props) {
    const [index, setIndex] = useState(0);
    const [rect, setRect] = useState<Rect | null>(null);
    const [ready, setReady] = useState(false);
    const [viewport, setViewport] = useState({ width: 1280, height: 800 });
    const [cardHeight, setCardHeight] = useState(260);
    const cardRef = useRef<HTMLDivElement>(null);
    const rectRef = useRef<Rect | null>(null);

    const step = steps[index];
    const isLast = index === steps.length - 1;
    const narrow = viewport.width < NARROW_BREAKPOINT;

    // Enter a step: run its side effect, wait for it to settle, bring the
    // target into view, then start tracking it.
    useEffect(() => {
        let cancelled = false;
        let frame = 0;
        const timers: ReturnType<typeof setTimeout>[] = [];

        const settleMs = step.before?.() ?? 0;

        const track = () => {
            if (cancelled) return;

            const element = findTarget(step.target);
            let next: Rect | null = null;

            if (element) {
                const box = element.getBoundingClientRect();
                next = {
                    top: box.top - SPOT_PADDING,
                    left: box.left - SPOT_PADDING,
                    width: box.width + SPOT_PADDING * 2,
                    height: box.height + SPOT_PADDING * 2,
                };
            }

            if (!sameRect(next, rectRef.current)) {
                rectRef.current = next;
                setRect(next);
            }

            setViewport((current) =>
                current.width === window.innerWidth && current.height === window.innerHeight
                    ? current
                    : { width: window.innerWidth, height: window.innerHeight }
            );

            // A light rAF loop keeps the spotlight glued to its target through
            // scrolling, view transitions and layout shifts alike.
            frame = requestAnimationFrame(track);
        };

        timers.push(
            setTimeout(() => {
                if (cancelled) return;

                const element = findTarget(step.target);
                const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                element?.scrollIntoView({ block: "center", inline: "nearest", behavior: reduceMotion ? "auto" : "smooth" });

                setReady(true);
                track();
                cardRef.current?.focus({ preventScroll: true });
            }, settleMs)
        );

        return () => {
            cancelled = true;
            cancelAnimationFrame(frame);
            timers.forEach(clearTimeout);
        };
    }, [step]);

    useEffect(() => {
        const card = cardRef.current;
        if (!card) return;

        const observer = new ResizeObserver(([entry]) => setCardHeight(entry.contentRect.height));
        observer.observe(card);
        return () => observer.disconnect();
    }, []);

    const goTo = useCallback(
        (next: number) => {
            if (next < 0) return;
            if (next >= steps.length) {
                onFinish(true);
                return;
            }
            setIndex(next);
        },
        [onFinish, steps.length]
    );

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "ArrowRight") goTo(index + 1);
            else if (event.key === "ArrowLeft") goTo(index - 1);
            else if (event.key === "Escape") onFinish(false);
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [goTo, index, onFinish]);

    const cardWidth = Math.min(CARD_WIDTH, viewport.width - EDGE * 2);
    let cardStyle: React.CSSProperties;

    if (narrow) {
        cardStyle = { left: EDGE, right: EDGE, bottom: EDGE };
    } else if (!rect) {
        cardStyle = {
            width: cardWidth,
            left: (viewport.width - cardWidth) / 2,
            top: Math.max(EDGE, (viewport.height - cardHeight) / 2),
        };
    } else {
        const below = rect.top + rect.height + CARD_GAP;
        const above = rect.top - CARD_GAP - cardHeight;
        const top =
            below + cardHeight + EDGE <= viewport.height
                ? below
                : above >= EDGE
                  ? above
                  : // Target is too tall for either side (e.g. the week grid):
                    // dock at the bottom of the screen, over the target.
                    viewport.height - cardHeight - EDGE;
        const left = Math.min(
            Math.max(EDGE, rect.left + rect.width / 2 - cardWidth / 2),
            viewport.width - cardWidth - EDGE
        );
        cardStyle = { width: cardWidth, left, top };
    }

    const spot = rect ?? { top: viewport.height / 2, left: viewport.width / 2, width: 0, height: 0 };

    return (
        <div className="sky fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
            {/* Catches clicks so the tour stays in control of the page. */}
            <div className="absolute inset-0" aria-hidden="true" />

            <div
                aria-hidden="true"
                className="pointer-events-none fixed rounded-2xl transition-all duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                style={{
                    top: spot.top,
                    left: spot.left,
                    width: spot.width,
                    height: spot.height,
                    // Same three-layer shape in both states (only alphas change) so
                    // the transition never interpolates the dimming layer into gold.
                    boxShadow: rect
                        ? "0 0 0 2px rgb(233 196 106 / 0.9), 0 0 28px 6px rgb(233 196 106 / 0.35), 0 0 0 9999px rgb(10 12 28 / 0.72)"
                        : "0 0 0 2px rgb(233 196 106 / 0), 0 0 28px 6px rgb(233 196 106 / 0), 0 0 0 9999px rgb(10 12 28 / 0.78)",
                }}
            />

            <div
                ref={cardRef}
                tabIndex={-1}
                className={`fixed max-h-[calc(100vh-32px)] overflow-y-auto rounded-3xl border border-[var(--ls-line)] bg-[var(--ls-night)] text-[var(--ls-ivory)] shadow-2xl outline-none transition-all duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
                    ready ? "opacity-100" : "opacity-0"
                }`}
                style={cardStyle}
            >
                {step.illustration && (!rect || narrow) && (
                    <div key={`${step.id}-art`} className="ls-celebrate-fast flex h-36 items-center justify-center rounded-t-3xl bg-[var(--ls-navy)]">
                        {step.illustration}
                    </div>
                )}

                <div key={step.id} className="ls-celebrate-fast p-5">
                    <p className="ls-eyebrow text-[var(--ls-gold)]">{step.eyebrow}</p>
                    <h2 id="tour-title" className="mt-1.5 font-[family-name:var(--font-spectral)] text-xl leading-snug">
                        {step.title}
                    </h2>
                    <div className="mt-2 text-sm leading-relaxed text-[var(--ls-muted)] [&_strong]:font-semibold [&_strong]:text-[var(--ls-ivory)]">
                        {step.body}
                    </div>
                    {step.illustration && step.showIllustrationWithTarget && rect && !narrow && (
                        <div className="mt-4">{step.illustration}</div>
                    )}

                    <p className="sr-only" aria-live="polite">
                        Step {index + 1} of {steps.length}: {step.title}
                    </p>

                    <div className="mt-5 flex items-center justify-between gap-3">
                        <div className="flex gap-1.5" aria-hidden="true">
                            {steps.map((item, dotIndex) => (
                                <span
                                    key={item.id}
                                    className={`h-1.5 rounded-full transition-all ${
                                        dotIndex === index ? "w-5 bg-[var(--ls-gold)]" : "w-1.5 bg-[var(--ls-line)]"
                                    }`}
                                />
                            ))}
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                            <button
                                type="button"
                                onClick={() => (index === 0 ? onFinish(false) : goTo(index - 1))}
                                className="rounded-full px-3 py-2 text-sm font-semibold text-[var(--ls-muted)] hover:text-[var(--ls-ivory)]"
                            >
                                {index === 0 ? "Skip" : "Back"}
                            </button>
                            <button
                                type="button"
                                onClick={() => goTo(index + 1)}
                                className="rounded-full bg-[var(--ls-gold)] px-5 py-2 text-sm font-bold text-[var(--ls-navy)] transition-colors hover:bg-[var(--ls-gold-hover)]"
                            >
                                {isLast ? finishLabel : "Next"}
                            </button>
                        </div>
                    </div>
                    {index > 0 && !isLast && (
                        <button
                            type="button"
                            onClick={() => onFinish(false)}
                            className="mt-2 text-xs text-[var(--ls-muted)] underline-offset-2 hover:underline"
                        >
                            Skip the tour
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
