"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { MascotTrigger } from "@/types/townState";
import { WindowManagerProvider } from "@/components/os/WindowManagerContext";
import { PomodoroRemoteProvider } from "@/components/os/PomodoroRemoteContext";
import { MusicRemoteProvider } from "@/components/os/MusicRemoteContext";
import { CoursesRemoteProvider } from "@/components/os/CoursesRemoteContext";
import PomodoroWindow from "@/components/os/PomodoroWindow";
import MusicWindow from "@/components/os/MusicWindow";
import CoursesWindow from "@/components/os/CoursesWindow";
import { FloatingLayerContext } from "@/components/os/FloatingLayerContext";
import { StarChartProvider, useStarChart } from "@/components/starchart/StarChartContext";
import StarChartView from "@/components/starchart/StarChartView";
import Onboarding from "@/components/starchart/Onboarding";
import { StarIcon } from "@/components/brand/Icons";
import { saveOnboarded, type StarChartState } from "@/lib/starChart";

// Nano (the medieval mascot) is retired (gamificationSystem.md) — say() is a
// deliberate no-op so existing call sites keep compiling. WorldView,
// MascotBubble, OnboardingOverlay and the town libs are kept in the repo but
// no longer rendered; re-wire them here to bring the town back.
type MascotContextValue = {
    say: (trigger: MascotTrigger) => void;
};

const MascotContext = createContext<MascotContextValue>({ say: () => {} });

export function useMascot(): MascotContextValue {
    return useContext(MascotContext);
}

type ViewMode = "log" | "chart";

type FrameContextValue = {
    openStarChart: () => void;
    openShipsLog: () => void;
    // Stable accessor (reads a ref) so tour steps can check the current view
    // without re-rendering whenever it changes.
    getView: () => ViewMode;
    replayOnboarding: () => void;
};

const FrameContext = createContext<FrameContextValue>({
    openStarChart: () => {},
    openShipsLog: () => {},
    getView: () => "log",
    replayOnboarding: () => {},
});

export function useLodestarFrame(): FrameContextValue {
    return useContext(FrameContext);
}

// "preview" (the /dev/onboarding page) opens the tour immediately and never
// writes the real first-run flag.
export type TourMode = "normal" | "preview";

type Props = {
    children: ReactNode;
    starChart: StarChartState;
    tourMode?: TourMode;
};

// Ship's Log → Star Chart pulls back to the sky; the reverse pushes in toward
// the console, so the two read as one continuous space (gamificationSystem.md).
type Transition = { from: ViewMode; to: ViewMode; phase: "out" | "in" } | null;
const OUT_MS = 320;
const IN_MS = 420;

export default function LaptopFrame({ children, starChart, tourMode = "normal" }: Props) {
    return (
        <StarChartProvider initialState={starChart}>
            <FrameInner tourMode={tourMode}>{children}</FrameInner>
        </StarChartProvider>
    );
}

function FrameInner({ children, tourMode }: { children: ReactNode; tourMode: TourMode }) {
    const { state, markOnboarded } = useStarChart();
    const [view, setView] = useState<ViewMode>("log");
    const [transition, setTransition] = useState<Transition>(null);
    const [showOnboarding, setShowOnboarding] = useState(tourMode === "preview" || state.onboardedAt === null);
    const [devNotice, setDevNotice] = useState<string | null>(null);
    // Bumped on every (re)start so the tour always remounts at step 1.
    const [tourRun, setTourRun] = useState(0);
    const [floatingLayer, setFloatingLayer] = useState<HTMLDivElement | null>(null);

    // A ref, not a setState updater, holds the current view: updaters can be
    // invoked more than once, which would schedule the timers twice.
    const viewRef = useRef<ViewMode>("log");

    const switchView = useCallback((next: ViewMode) => {
        const current = viewRef.current;

        if (current === next) return;

        viewRef.current = next;
        setTransition({ from: current, to: next, phase: "out" });

        setTimeout(() => {
            setView(next);
            setTransition({ from: current, to: next, phase: "in" });
            setTimeout(() => setTransition(null), IN_MS);
        }, OUT_MS);
    }, []);

    const openStarChart = useCallback(() => switchView("chart"), [switchView]);
    const openLog = useCallback(() => switchView("log"), [switchView]);
    const getView = useCallback(() => viewRef.current, []);
    const replayOnboarding = useCallback(() => {
        openLog();
        setTourRun((run) => run + 1);
        setShowOnboarding(true);
    }, [openLog]);

    const finishOnboarding = useCallback(() => {
        setShowOnboarding(false);

        if (tourMode !== "preview" && state.onboardedAt === null) {
            const onboardedAt = new Date().toISOString();
            markOnboarded(onboardedAt);
            void saveOnboarded(onboardedAt);
        }
    }, [markOnboarded, state.onboardedAt, tourMode]);

    const resetFirstRun = useCallback(() => {
        markOnboarded(null);
        void saveOnboarded(null).then(() => setDevNotice("First-run flag cleared. The tour will show on / next load."));
    }, [markOnboarded]);

    const animationClass = transition
        ? `${transition.to === "chart" ? "view-pull-back" : "view-push-in"}--${transition.phase}`
        : "";

    return (
        <WindowManagerProvider>
            <PomodoroRemoteProvider>
                <MusicRemoteProvider>
                    <CoursesRemoteProvider>
                        <MascotContext.Provider value={{ say: () => {} }}>
                            <FrameContext.Provider value={{ openStarChart, openShipsLog: openLog, getView, replayOnboarding }}>
                            <FloatingLayerContext.Provider value={floatingLayer}>
                                {/* Full-bleed app surface, sized by <main>'s h-dvh so it always
                                    matches the visible screen. Transforms are only applied while a
                                    transition runs — a transform left on this ancestor would make
                                    every position:fixed modal inside it position relative to the
                                    frame instead of the viewport. */}
                                <div
                                    className={`relative h-full w-full overflow-hidden ${animationClass}`}
                                    style={{ background: "var(--app-background)" }}
                                >
                                    {/* The Ship's Log (and the floating windows) stay mounted while
                                        the Star Chart is showing — unmounting would restart music,
                                        timers and every planner fetch. visibility:hidden (not
                                        display:none) keeps an embedded player running. */}
                                    <div
                                        className={
                                            view === "log"
                                                ? "absolute inset-0"
                                                : "invisible absolute inset-0 overflow-hidden pointer-events-none"
                                        }
                                    >
                                        <div className="absolute inset-0 overflow-y-auto">
                                            <button
                                                type="button"
                                                onClick={openStarChart}
                                                data-tour="star-chart-button"
                                                className="absolute right-4 top-4 z-20 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors hover:bg-[var(--accent-soft)]"
                                                style={{ borderColor: "var(--accent)", color: "var(--heading)" }}
                                            >
                                                <StarIcon size={13} className="text-[var(--accent)]" />
                                                Star Chart
                                            </button>
                                            {children}
                                        </div>

                                        {/* Floating windows: a sibling layer so dragged windows stay
                                            put regardless of scroll; pointer-events pass through
                                            except on the windows themselves. */}
                                        <div ref={setFloatingLayer} className="pointer-events-none absolute inset-0 z-30">
                                            <PomodoroWindow />
                                            <MusicWindow />
                                            <CoursesWindow />
                                        </div>
                                    </div>

                                    {view === "chart" && (
                                        <div className="absolute inset-0 overflow-y-auto">
                                            <StarChartView onBack={openLog} />
                                        </div>
                                    )}
                                </div>

                                {showOnboarding && <Onboarding key={tourRun} onFinish={finishOnboarding} />}

                                {tourMode === "preview" && (
                                    <div className="fixed bottom-3 left-3 z-[80] flex max-w-xs flex-col gap-1.5 rounded-2xl border border-[#3a4470] bg-[#10142a] p-3 text-xs text-[#f7f3ec] shadow-2xl">
                                        <p className="font-bold uppercase tracking-wider text-[#e9c46a]">Dev · onboarding preview</p>
                                        <p className="text-[#b8bdd6]">Finishing here doesn&apos;t mark you as onboarded.</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setDevNotice(null);
                                                    replayOnboarding();
                                                }}
                                                className="rounded-full bg-[#e9c46a] px-3 py-1 font-bold text-[#161b33]"
                                            >
                                                Restart tour
                                            </button>
                                            <button
                                                type="button"
                                                onClick={resetFirstRun}
                                                className="rounded-full border border-[#3a4470] px-3 py-1 font-semibold"
                                            >
                                                Reset first-run flag
                                            </button>
                                        </div>
                                        {devNotice && <p className="text-[#b8bdd6]">{devNotice}</p>}
                                    </div>
                                )}
                            </FloatingLayerContext.Provider>
                            </FrameContext.Provider>
                        </MascotContext.Provider>
                    </CoursesRemoteProvider>
                </MusicRemoteProvider>
            </PomodoroRemoteProvider>
        </WindowManagerProvider>
    );
}
