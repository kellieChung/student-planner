"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { TownState } from "@/types/townState";
import { MascotTrigger } from "@/types/townState";
import { pickLine } from "@/lib/mascotDialogue";
import { getTownState, saveTownState } from "@/lib/townState";
import WorldView from "./WorldView";
import MascotBubble from "./MascotBubble";
import OnboardingOverlay from "./OnboardingOverlay";

type MascotContextValue = {
    say: (trigger: MascotTrigger) => void;
};

// Nano's dialogue channel — WeeklyPlannerView and AIReviewPanel are
// siblings under this frame, not nested in each other, so a shared context
// (rather than prop drilling) is what lets both trigger the same bubble.
const MascotContext = createContext<MascotContextValue>({ say: () => {} });

export function useMascot(): MascotContextValue {
    return useContext(MascotContext);
}

type ViewMode = "os" | "world" | "onboarding";

type Props = {
    children: ReactNode;
    initialView: ViewMode;
    townState: TownState;
};

const DIALOGUE_DURATION_MS = 4500;
const TRANSITION_MS = 260;

export default function LaptopFrame({ children, initialView, townState: initialTownState }: Props) {
    const [view, setView] = useState<ViewMode>(initialView);
    const [showTour, setShowTour] = useState(false);
    const [transitioning, setTransitioning] = useState(false);
    const [dialogue, setDialogue] = useState<string | null>(null);
    const [worldTownState, setWorldTownState] = useState<TownState>(initialTownState);
    const dialogueTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const say = useCallback((trigger: MascotTrigger) => {
        setDialogue(pickLine(trigger));

        if (dialogueTimeoutRef.current) clearTimeout(dialogueTimeoutRef.current);
        dialogueTimeoutRef.current = setTimeout(() => setDialogue(null), DIALOGUE_DURATION_MS);
    }, []);

    useEffect(() => {
        return () => {
            if (dialogueTimeoutRef.current) clearTimeout(dialogueTimeoutRef.current);
        };
    }, []);

    const switchView = useCallback((next: ViewMode) => {
        setTransitioning(true);

        if (next === "world") {
            void getTownState().then(setWorldTownState);
        }

        setTimeout(() => {
            setView(next);
            setTransitioning(false);
        }, TRANSITION_MS);
    }, []);

    const openWorld = useCallback(() => switchView("world"), [switchView]);

    const openLaptop = useCallback(() => {
        const wasFirstRun = view === "onboarding";
        switchView("os");
        if (wasFirstRun) setShowTour(true);
    }, [switchView, view]);

    const completeOnboarding = useCallback(() => {
        setShowTour(false);
        setWorldTownState((current) => {
            const next = { ...current, onboardingCompletedAt: new Date().toISOString() };
            void saveTownState(next);
            return next;
        });
    }, []);

    return (
        <MascotContext.Provider value={{ say }}>
            <div
                className={`relative mx-auto w-full max-w-6xl overflow-hidden rounded-[28px] border-[6px] shadow-2xl ${
                    transitioning ? "laptop-frame--transitioning" : ""
                }`}
                style={{ borderColor: "var(--border)", background: "var(--app-background)" }}
            >
                {/* Cosmetic "scuffed laptop" detail — a worn corner nick, purely
                    decorative, never implies the real UI underneath is unreliable. */}
                <div
                    className="pointer-events-none absolute -right-3 -top-3 h-10 w-10 rotate-45 border-b-2"
                    style={{ borderColor: "var(--border)" }}
                    aria-hidden="true"
                />

                {view === "onboarding" && <OnboardingOverlay phase="intro" onOpenLaptop={openLaptop} />}

                {view === "world" && <WorldView townState={worldTownState} onOpenLaptop={openLaptop} dialogue={dialogue} />}

                {view === "os" && (
                    <div className="relative">
                        <button
                            type="button"
                            onClick={openWorld}
                            className="absolute right-4 top-4 z-40 rounded-lg border px-3 py-1.5 text-xs font-bold transition-transform hover:scale-105"
                            style={{ borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--heading)" }}
                        >
                            🗺️ View Kingdom
                        </button>
                        {children}
                        <MascotBubble dialogue={dialogue} />
                        {showTour && <OnboardingOverlay phase="tour" onComplete={completeOnboarding} />}
                    </div>
                )}
            </div>
        </MascotContext.Provider>
    );
}
