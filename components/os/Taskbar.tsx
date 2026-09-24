"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Spinner from "@/components/Spinner";
import UserMenu from "@/components/UserMenu";
import { XpAward } from "@/types/gamification";
import { useWindowManager } from "./WindowManagerContext";
import { useLodestarFrame } from "@/components/world/LaptopFrame";
import {
    BookIcon,
    CompassIcon,
    GearIcon,
    ListIcon,
    MoonIcon,
    MusicIcon,
    PlusIcon,
    QuestionIcon,
    RepeatIcon,
    StarIcon,
    SunIcon,
    TimerIcon,
} from "@/components/brand/Icons";

type Props = {
    theme: "dark" | "light";
    onSetTheme: (theme: "dark" | "light") => void;
    level: number;
    totalXp: number;
    xpTowardsNextLevel: number;
    awardingXp: boolean;
    latestXpAward: XpAward | null;
    starlight: number;
    onAddTask: () => void;
    onManageRecurring: () => void;
    userName?: string | null;
    userEmail?: string | null;
    onOpenRundown: () => void;
    onOpenStillDeciding: () => void;
    stillDecidingCount: number;
    autoAcceptAiTasks: boolean;
    onSetAutoAcceptAiTasks: (value: boolean) => void;
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
    starlight,
    onAddTask,
    onManageRecurring,
    userName,
    userEmail,
    onOpenRundown,
    onOpenStillDeciding,
    stillDecidingCount,
    autoAcceptAiTasks,
    onSetAutoAcceptAiTasks,
}: Props) {
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const { replayOnboarding } = useLodestarFrame();
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
            <div data-tour="true-north" className="flex shrink-0 items-center gap-1.5 pr-2">
                <CompassIcon size={18} className="text-[var(--accent)]" />
                <span className="hidden text-xs font-bold sm:inline" style={{ color: "var(--heading)" }}>
                    True North
                </span>
            </div>

            {/* Pinned quick-launch icons */}
            <div className="flex shrink-0 items-center gap-1">
                <div data-tour="taskbar-add" className="flex items-center gap-1">
                    <TaskbarIconButton label="Add Task" icon={<PlusIcon />} onClick={onAddTask} />
                    <TaskbarIconButton label="Recurring" icon={<RepeatIcon />} onClick={onManageRecurring} />
                </div>
                <TaskbarIconButton
                    tourId="taskbar-courses"
                    label="Courses"
                    icon={<BookIcon />}
                    onClick={() => openWindow("courses")}
                    running={windows.courses.isOpen}
                />
                <div data-tour="taskbar-tools" className="flex items-center gap-1">
                <TaskbarIconButton
                    label="Watch"
                    icon={<TimerIcon />}
                    onClick={() => openWindow("pomodoro")}
                    running={windows.pomodoro.isOpen}
                />
                <TaskbarIconButton
                    label="Comms"
                    icon={<MusicIcon />}
                    onClick={() => openWindow("music")}
                    running={windows.music.isOpen}
                />
                </div>
                <TaskbarIconButton
                    tourId="taskbar-rundown"
                    label="Rundown"
                    icon={<ListIcon />}
                    onClick={onOpenRundown}
                    running={windows.rundown.isOpen}
                />
                {stillDecidingCount > 0 && (
                    <TaskbarIconButton
                        label="Still deciding"
                        icon={<QuestionIcon />}
                        onClick={onOpenStillDeciding}
                        badgeCount={stillDecidingCount}
                    />
                )}
            </div>

            {/* System tray */}
            <div className="ml-auto flex flex-wrap items-center gap-1.5 sm:gap-2">
                <div data-tour="taskbar-progress" className="flex flex-wrap items-center gap-1.5 sm:gap-2">
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
                    <span className="flex items-center gap-1" title="Starlight to spend on the Star Chart">
                        <StarIcon size={12} className="text-[var(--accent)]" />
                        {starlight} Starlight
                    </span>
                </TrayPill>
                </div>
                <TrayPill>
                    <span className="tabular-nums" style={{ color: "var(--foreground)" }}>{clock}</span>
                </TrayPill>

                <div className="relative" ref={settingsRootRef}>
                    <button
                        type="button"
                        onClick={() => setIsSettingsOpen((open) => !open)}
                        aria-expanded={isSettingsOpen}
                        aria-label="Open settings"
                        data-tour="taskbar-settings"
                        className="rounded-lg border px-2.5 py-1.5 text-sm transition-transform hover:scale-105"
                        style={{ borderColor: "var(--border)", background: "var(--panel-muted)" }}
                    >
                        <GearIcon />
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
                                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
                                        theme === "dark" ? "bg-[#161b33] text-[#e9c46a]" : "text-[var(--muted)] hover:text-[var(--foreground)]"
                                    }`}
                                >
                                    <MoonIcon size={13} /> Night
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleSetTheme("light")}
                                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
                                        theme === "light" ? "bg-[#f7f3ec] text-[#1b2140]" : "text-[var(--muted)] hover:text-[var(--foreground)]"
                                    }`}
                                >
                                    <SunIcon size={13} /> Day
                                </button>
                            </div>

                            <p className="mb-2 mt-3 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                                AI Detection
                            </p>
                            <label className="flex items-center justify-between gap-2 rounded-lg px-1 py-1 text-xs" style={{ color: "var(--foreground)" }}>
                                <span>Auto-accept AI-detected tasks</span>
                                <input
                                    type="checkbox"
                                    checked={autoAcceptAiTasks}
                                    onChange={(event) => onSetAutoAcceptAiTasks(event.target.checked)}
                                />
                            </label>

                            <p className="mb-2 mt-3 text-xs font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
                                Account
                            </p>
                            <UserMenu name={userName} email={userEmail} />

                            <button
                                type="button"
                                onClick={() => {
                                    setIsSettingsOpen(false);
                                    replayOnboarding();
                                }}
                                className="mt-3 block text-xs font-semibold underline"
                                style={{ color: "var(--muted)" }}
                            >
                                Replay intro
                            </button>
                            <Link
                                href="/credits"
                                className="mt-2 block text-xs font-semibold underline"
                                style={{ color: "var(--muted)" }}
                            >
                                Credits
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function TaskbarIconButton({
    label,
    icon,
    tourId,
    onClick,
    running,
    badgeCount,
}: {
    label: string;
    icon: React.ReactNode;
    tourId?: string;
    onClick: () => void;
    running?: boolean;
    badgeCount?: number;
}) {
    const badgeLabel = badgeCount ? (running ? `${label} (running)` : `${label} (${badgeCount})`) : running ? `${label} (running)` : label;

    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={badgeLabel}
            title={badgeLabel}
            data-tour={tourId}
            className="relative flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-transform hover:scale-105"
            style={{ borderColor: "var(--border)", background: "var(--panel-muted)", color: "var(--foreground)" }}
        >
            <span aria-hidden="true">{icon}</span>
            <span className="hidden md:inline">{label}</span>
            {badgeCount ? (
                <span
                    className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-[var(--accent-contrast)]"
                    style={{ background: "var(--accent)" }}
                    aria-hidden="true"
                >
                    {badgeCount}
                </span>
            ) : (
                running && (
                    <span
                        className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full"
                        style={{ background: "var(--accent)" }}
                        aria-hidden="true"
                    />
                )
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
