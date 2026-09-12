"use client";

import { useEffect, useRef, useState } from "react";
import Spinner from "@/components/Spinner";
import UserMenu from "@/components/UserMenu";
import { XpAward } from "@/types/gamification";
import { useWindowManager } from "./WindowManagerContext";

type Props = {
    theme: "dark" | "light";
    onSetTheme: (theme: "dark" | "light") => void;
    level: number;
    totalXp: number;
    xpTowardsNextLevel: number;
    awardingXp: boolean;
    latestXpAward: XpAward | null;
    currency: number;
    currentStreak: number;
    onAddTask: () => void;
    onOpenCourses: () => void;
    userName?: string | null;
    userEmail?: string | null;
};

function useClock(): string {
    const [now, setNow] = useState<Date | null>(null);

    useEffect(() => {
        setNow(new Date());
        const interval = setInterval(() => setNow(new Date()), 1000 * 30);
        return () => clearInterval(interval);
    }, []);

    if (!now) return "";

    return now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// A Windows-taskbar-styled bar, always visible at the bottom of the laptop
// screen (position: sticky, so it stays pinned while the OS content above
// it scrolls) — the "OS vibe" chrome absorbing what used to be a plain
// toolbar plus a standalone XP card plus the separate account menu in
// app/page.tsx, per direct user request rather than leaving all of that
// duplicated alongside new chrome.
export default function Taskbar({
    theme,
    onSetTheme,
    level,
    totalXp,
    xpTowardsNextLevel,
    awardingXp,
    latestXpAward,
    currency,
    currentStreak,
    onAddTask,
    onOpenCourses,
    userName,
    userEmail,
}: Props) {
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const settingsRootRef = useRef<HTMLDivElement>(null);
    const clock = useClock();
    const { windows, openWindow } = useWindowManager();

    useEffect(() => {
        if (!isSettingsOpen) return;

        const closeSettings = (event: MouseEvent) => {
            if (!settingsRootRef.current?.contains(event.target as Node)) {
                setIsSettingsOpen(false);
            }
        };

        document.addEventListener("mousedown", closeSettings);
        return () => document.removeEventListener("mousedown", closeSettings);
    }, [isSettingsOpen]);

    const handleSetTheme = (nextTheme: "dark" | "light") => {
        onSetTheme(nextTheme);
        setIsSettingsOpen(false);
    };

    return (
        <div
            className="sticky bottom-0 z-30 -mx-4 flex flex-wrap items-center gap-2 border-t px-3 py-2 shadow-2xl sm:gap-3"
            style={{ borderColor: "var(--border)", background: "var(--panel-raised)" }}
        >
            {/* "Start" — decorative branding, not interactive in v1 */}
            <div className="flex shrink-0 items-center gap-1.5 pr-2">
                <span className="text-lg leading-none" aria-hidden="true">🖥️</span>
                <span className="hidden text-xs font-bold sm:inline" style={{ color: "var(--heading)" }}>
                    ATLAS OS
                </span>
            </div>

            {/* Pinned quick-launch icons */}
            <div className="flex shrink-0 items-center gap-1">
                <TaskbarIconButton label="Add Task" emoji="➕" onClick={onAddTask} />
                <TaskbarIconButton label="Courses" emoji="📚" onClick={onOpenCourses} />
                <TaskbarIconButton
                    label="Focus"
                    emoji="⏳"
                    onClick={() => openWindow("pomodoro")}
                    running={windows.pomodoro.isOpen}
                />
                <TaskbarIconButton
                    label="Radio"
                    emoji="🎶"
                    onClick={() => openWindow("music")}
                    running={windows.music.isOpen}
                />
            </div>

            {/* System tray */}
            <div className="ml-auto flex flex-wrap items-center gap-1.5 sm:gap-2">
                <TrayPill>
                    <span className="font-bold" style={{ color: "var(--heading)" }}>Lv.{level}</span>
                    <span style={{ color: "var(--muted)" }}>{totalXp} XP</span>
                </TrayPill>
                {awardingXp ? (
                    <TrayPill>
                        <Spinner className="h-3 w-3" />
                        <span style={{ color: "var(--muted)" }}>Calculating XP...</span>
                    </TrayPill>
                ) : latestXpAward ? (
                    <TrayPill>
                        <span style={{ color: "var(--accent)" }}>+{latestXpAward.xp} XP</span>
                    </TrayPill>
                ) : (
                    <TrayPill>
                        <span style={{ color: "var(--muted)" }}>{100 - xpTowardsNextLevel} XP to Lv.{level + 1}</span>
                    </TrayPill>
                )}
                <TrayPill>
                    <span>🪙 {currency}</span>
                </TrayPill>
                {currentStreak > 0 && (
                    <TrayPill>
                        <span>🔥 {currentStreak}</span>
                    </TrayPill>
                )}
                <TrayPill>
                    <span className="tabular-nums" style={{ color: "var(--foreground)" }}>{clock}</span>
                </TrayPill>

                <div className="relative" ref={settingsRootRef}>
                    <button
                        type="button"
                        onClick={() => setIsSettingsOpen((open) => !open)}
                        aria-expanded={isSettingsOpen}
                        aria-label="Open settings"
                        className="rounded-lg border px-2.5 py-1.5 text-sm transition-transform hover:scale-105"
                        style={{ borderColor: "var(--border)", background: "var(--panel-muted)" }}
                    >
                        ⚙️
                    </button>
                    {isSettingsOpen && (
                        <div
                            className="absolute bottom-full right-0 z-40 mb-2 w-64 rounded-xl border p-3 shadow-xl"
                            style={{ borderColor: "var(--border)", background: "var(--panel)" }}
                        >
                            <p className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                                Display
                            </p>
                            <div className="flex rounded-lg p-1" style={{ background: "var(--panel-muted)" }}>
                                <button
                                    type="button"
                                    onClick={() => handleSetTheme("dark")}
                                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
                                        theme === "dark" ? "bg-emerald-900/80 text-emerald-100" : "text-slate-400 hover:text-slate-200"
                                    }`}
                                >
                                    🌲 Forest
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleSetTheme("light")}
                                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
                                        theme === "light" ? "bg-orange-500 text-white" : "text-slate-400 hover:text-slate-200"
                                    }`}
                                >
                                    🍺 Tavern
                                </button>
                            </div>

                            <p className="mb-2 mt-3 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                                Account
                            </p>
                            <UserMenu name={userName} email={userEmail} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function TaskbarIconButton({
    label,
    emoji,
    onClick,
    running,
}: {
    label: string;
    emoji: string;
    onClick: () => void;
    running?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={running ? `${label} (running)` : label}
            title={running ? `${label} (running)` : label}
            className="relative flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-transform hover:scale-105"
            style={{ borderColor: "var(--border)", background: "var(--panel-muted)", color: "var(--foreground)" }}
        >
            <span aria-hidden="true">{emoji}</span>
            <span className="hidden md:inline">{label}</span>
            {running && (
                <span
                    className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full"
                    style={{ background: "var(--accent)" }}
                    aria-hidden="true"
                />
            )}
        </button>
    );
}

function TrayPill({ children }: { children: React.ReactNode }) {
    return (
        <div
            className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold"
            style={{ borderColor: "var(--border)", background: "var(--panel-muted)" }}
        >
            {children}
        </div>
    );
}
