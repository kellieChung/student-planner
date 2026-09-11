"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { TownState } from "@/types/townState";
import { MascotTrigger } from "@/types/townState";
import { pickLine } from "@/lib/mascotDialogue";
import { getTownState, saveOnboardingCompletion } from "@/lib/townState";
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

        const completedAt = new Date().toISOString();

        // Deliberately does not send worldTownState's other fields — see
        // saveOnboardingCompletion's own comment. worldTownState may still be
        // the stale page-load snapshot if the user never visited World before
        // finishing the tour, and a task completed during the tour (the OS
        // underneath is real and clickable, not blocked by the callout card)
        // would already have its own currency/growth award in flight.
        void saveOnboardingCompletion(completedAt);
        setWorldTownState((current) => ({ ...current, onboardingCompletedAt: completedAt }));
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

                {/* OS content is always mounted, even while World/onboarding is the
                    active view — Pomodoro and the music player live inside
                    `children`, and unmounting them on every "View Kingdom" toggle
                    would restart playback and every one of WeeklyPlannerView's
                    mount-effect fetches, exactly the "ambient tools buried behind a
                    UI layer" problem projectReview.md flags. When inactive it's
                    taken out of flow (absolute) and hidden with `invisible`
                    (visibility:hidden) rather than unmounted or `display:none` —
                    unlike display:none, visibility:hidden doesn't interrupt media
                    playback in an iframe, and taking it out of flow means it no
                    longer dictates the frame's height while some other view is
                    the one actually being shown. */}
                <div className={view === "os" ? "relative" : "invisible absolute inset-0 pointer-events-none overflow-hidden"}>
                    <button
                        type="button"
                        onClick={openWorld}
                        className="absolute right-4 top-4 z-20 rounded-lg border px-3 py-1.5 text-xs font-bold transition-transform hover:scale-105"
                        style={{ borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--heading)" }}
                    >
                        🗺️ View Kingdom
                    </button>
                    {children}
                    {view === "os" && <MascotBubble dialogue={dialogue} />}
                    {showTour && <OnboardingOverlay phase="tour" onComplete={completeOnboarding} />}
                </div>

                {view === "onboarding" && <OnboardingOverlay phase="intro" onOpenLaptop={openLaptop} />}
                {view === "world" && (
                    <WorldView townState={worldTownState} onOpenLaptop={openLaptop} dialogue={dialogue} />
                )}
            </div>
        </MascotContext.Provider>
    );
}
