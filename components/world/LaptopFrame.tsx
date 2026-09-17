"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { TownState } from "@/types/townState";
import { MascotTrigger } from "@/types/townState";
import { WorldLayoutData } from "@/types/worldLayout";
import { pickLine } from "@/lib/mascotDialogue";
import { getTownState, saveOnboardingCompletion } from "@/lib/townState";
import { getWorldLayout } from "@/lib/worldLayout";
import WorldView from "./WorldView";
import MascotBubble from "./MascotBubble";
import OnboardingOverlay from "./OnboardingOverlay";
import { WindowManagerProvider } from "@/components/os/WindowManagerContext";
import { PomodoroRemoteProvider } from "@/components/os/PomodoroRemoteContext";
import { MusicRemoteProvider } from "@/components/os/MusicRemoteContext";
import { CoursesRemoteProvider } from "@/components/os/CoursesRemoteContext";
import PomodoroWindow from "@/components/os/PomodoroWindow";
import MusicWindow from "@/components/os/MusicWindow";
import CoursesWindow from "@/components/os/CoursesWindow";

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
    layout: WorldLayoutData;
};

const DIALOGUE_DURATION_MS = 4500;

// Two-phase "lid" animation: the frame rotates shut (closing), the view
// swaps while it's visually closed, then it rotates back open (opening).
type LidPhase = "idle" | "closing" | "opening";
const LID_PHASE_MS = 280;

export default function LaptopFrame({ children, initialView, townState: initialTownState, layout: initialLayout }: Props) {
    const [view, setView] = useState<ViewMode>(initialView);
    const [showTour, setShowTour] = useState(false);
    const [lidPhase, setLidPhase] = useState<LidPhase>("idle");
    const [dialogue, setDialogue] = useState<string | null>(null);
    const [worldTownState, setWorldTownState] = useState<TownState>(initialTownState);
    const [worldLayout, setWorldLayout] = useState<WorldLayoutData>(initialLayout);
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
        setLidPhase("closing");

        if (next === "world") {
            void getTownState().then(setWorldTownState);
            void getWorldLayout().then(setWorldLayout);
        }

        setTimeout(() => {
            setView(next);
            setLidPhase("opening");

            setTimeout(() => setLidPhase("idle"), LID_PHASE_MS);
        }, LID_PHASE_MS);
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

    const lidClassName =
        lidPhase === "closing" ? "laptop-lid--closing" : lidPhase === "opening" ? "laptop-lid--opening" : "";

    return (
        <WindowManagerProvider>
            <PomodoroRemoteProvider>
                <MusicRemoteProvider>
                    <CoursesRemoteProvider>
                        <MascotContext.Provider value={{ say }}>
                            {/* perspective is only ever set while actually animating (never
                                persistently) — transform/perspective on an ancestor makes any
                                position:fixed descendant (every modal in this app) position
                                relative to that ancestor instead of the viewport, which would
                                break every modal if left on while idle. */}
                            <div
                                className="h-full w-full"
                                style={lidPhase !== "idle" ? { perspective: "1600px" } : undefined}
                            >
                                {/* The laptop "screen": fills the available page space edge to
                                    edge (its parent is sized by <main>'s h-screen in
                                    app/page.tsx) — no fixed aspect ratio or max-width, just
                                    enough chrome (rounded corners + border) to read as "a
                                    screen" without constraining the actual planning UI. Not
                                    content-driven height — each view below is an absolutely
                                    positioned, independently scrolling panel inside this fixed
                                    box, so long OS content scrolls in place instead of
                                    stretching the frame into a tall vertical strip. */}
                                <div
                                    className={`relative h-full w-full overflow-hidden rounded-[28px] border-[6px] shadow-2xl ${lidClassName}`}
                                    style={{ borderColor: "var(--border)", background: "var(--app-background)", transformOrigin: "bottom center" }}
                                >
                                    {/* Cosmetic "scuffed laptop" detail — a worn corner nick, purely
                                        decorative, never implies the real UI underneath is unreliable. */}
                                    <div
                                        className="pointer-events-none absolute -right-3 -top-3 z-30 h-10 w-10 rotate-45 border-b-2"
                                        style={{ borderColor: "var(--border)" }}
                                        aria-hidden="true"
                                    />
    
                                    {/* OS content (and the floating windows layer below) are
                                        always mounted, even while World/onboarding is the active
                                        view — unmounting on every "View Kingdom" toggle would
                                        restart playback/timers and every one of
                                        WeeklyPlannerView's mount-effect fetches, exactly the
                                        "ambient tools buried behind a UI layer" problem
                                        projectReview.md flags. When inactive this whole wrapper is
                                        hidden with `invisible` (visibility:hidden) rather than
                                        unmounted or `display:none` — unlike display:none,
                                        visibility:hidden doesn't interrupt media playback in an
                                        iframe, and it no longer dictates the frame's height while
                                        some other view is the one actually being shown. */}
                                    <div
                                        className={
                                            view === "os"
                                                ? "absolute inset-0"
                                                : "invisible absolute inset-0 overflow-hidden pointer-events-none"
                                        }
                                    >
                                        <div className="absolute inset-0 overflow-y-auto">
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
                                            {/* Ambient "this is a display" texture — a faint CRT scanline
                                                overlay, OS-only (never shown over the pixel-art World).
                                                Kept very low-opacity so it's atmosphere, not a readability
                                                hit on the daily-use screen. */}
                                            <div
                                                className="pointer-events-none absolute inset-0 z-40"
                                                style={{
                                                    backgroundImage:
                                                        "repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, transparent 1px, transparent 3px)",
                                                    mixBlendMode: "overlay",
                                                }}
                                                aria-hidden="true"
                                            />
                                        </div>
    
                                        {/* Floating windows layer: NOT part of the scrolling
                                            content above, so dragged windows stay fixed on screen
                                            regardless of scroll position — a sibling `absolute
                                            inset-0`, itself pointer-events-none so clicks pass
                                            through to the content beneath in areas with no window
                                            (each Window opts back in with pointer-events-auto).
                                            Music must keep playing while minimized or while the
                                            World is showing, so it's rendered unconditionally here
                                            and only ever unmounted by its own Close button (via
                                            WindowManagerContext's isOpen), never by this view
                                            toggle. */}
                                        <div className="pointer-events-none absolute inset-0 z-30">
                                            <PomodoroWindow />
                                            <MusicWindow />
                                            <CoursesWindow />
                                        </div>
                                    </div>
    
                                    {view === "onboarding" && (
                                        <div className="absolute inset-0 overflow-y-auto">
                                            <OnboardingOverlay phase="intro" onOpenLaptop={openLaptop} />
                                        </div>
                                    )}
                                    {view === "world" && (
                                        <div className="absolute inset-0 overflow-y-auto">
                                            <WorldView townState={worldTownState} layout={worldLayout} onOpenLaptop={openLaptop} dialogue={dialogue} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </MascotContext.Provider>
                    </CoursesRemoteProvider>
                </MusicRemoteProvider>
            </PomodoroRemoteProvider>
        </WindowManagerProvider>
    );
}
