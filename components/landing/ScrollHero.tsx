"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { DRAW_END, FINAL_START, HERO_SCREENS, INTRO_END } from "@/components/landing/heroTimeline";

type Props = {
    children: ReactNode;
};

const TIMELINE_VARS = {
    "--hero-screens": HERO_SCREENS,
    "--intro-end": INTRO_END,
    "--final-start": FINAL_START,
    "--final-end": DRAW_END,
} as CSSProperties;

// Thin client shell: turns native scroll position into one CSS variable (--p,
// 0–1 through the hero). Nothing re-renders per frame; the landing CSS derives
// every star, line, headline and parallax offset from --p. The sticky stage
// keeps the page scrolling normally — no scroll hijacking.
export default function ScrollHero({ children }: Props) {
    const heroRef = useRef<HTMLElement>(null);
    const stageRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const hero = heroRef.current;
        const stage = stageRef.current;
        if (!hero || !stage) return;

        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        let frame = 0;
        let lastProgress = -1;

        const update = () => {
            frame = 0;
            if (reducedMotion.matches) return;

            const distance = hero.offsetHeight - stage.offsetHeight;
            const progress = distance > 0 ? Math.min(1, Math.max(0, -hero.getBoundingClientRect().top / distance)) : 1;
            if (progress === lastProgress) return;
            lastProgress = progress;

            hero.style.setProperty("--p", progress.toFixed(4));
            if (progress >= DRAW_END) hero.setAttribute("data-settled", "");
            else hero.removeAttribute("data-settled");
        };

        const schedule = () => {
            if (!frame) frame = requestAnimationFrame(update);
        };

        update();
        window.addEventListener("scroll", schedule, { passive: true });
        window.addEventListener("resize", schedule);
        return () => {
            window.removeEventListener("scroll", schedule);
            window.removeEventListener("resize", schedule);
            if (frame) cancelAnimationFrame(frame);
        };
    }, []);

    return (
        <header ref={heroRef} className="ls-hero relative bg-[var(--ls-navy)]" style={TIMELINE_VARS}>
            <div ref={stageRef} className="ls-hero-stage">
                {children}
            </div>
        </header>
    );
}
