"use client";

import { useMusicRemote } from "@/components/os/MusicRemoteContext";
import PixelBlock from "./PixelBlock";

type Props = {
    onClose: () => void;
};

// A medieval-themed replica of the OS Music window — same live state, same
// plain-data playback actions (via MusicRemoteContext), different chrome.
// Playlist management (create/import/add track) deliberately stays
// laptop-only — see MusicRemoteContext.tsx's own note on why those aren't
// cleanly remote-controllable. No engine of its own: the real MusicPlayer
// instance (mounted in components/os/MusicWindow.tsx) keeps playing
// underneath whether the laptop is open or this panel is showing instead.
export default function BardPanel({ onClose }: Props) {
    const { engineState, engineActions } = useMusicRemote();

    return (
        <div
            className="w-72 rounded-xl border p-4 shadow-2xl"
            style={{ borderColor: "var(--border)", background: "var(--panel)" }}
        >
            <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <PixelBlock size="sm" emoji="🎻" tone="accent" />
                    <span className="text-sm font-bold" style={{ color: "var(--heading)" }}>
                        The Bard
                    </span>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded px-1.5 text-xs"
                    style={{ color: "var(--muted)" }}
                    aria-label="Close"
                >
                    ✕
                </button>
            </div>

            {!engineState || !engineActions ? (
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                    Tuning the lute...
                </p>
            ) : (
                <>
                    <div className="mb-3">
                        <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                            {engineState.playlistName ?? "No playlist selected"}
                        </p>
                        <p className="truncate text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                            {engineState.trackTitle ?? "No song chosen"}
                        </p>
                    </div>

                    <div className="flex items-center justify-center gap-3">
                        <button
                            type="button"
                            onClick={() => engineActions.toggleShuffle()}
                            className="rounded-full border px-2 py-1 text-xs"
                            style={{
                                borderColor: engineState.shuffle ? "var(--accent)" : "var(--border)",
                                color: engineState.shuffle ? "var(--accent)" : "var(--muted)",
                            }}
                            aria-label="Toggle shuffle"
                        >
                            🔀
                        </button>
                        <button
                            type="button"
                            onClick={engineActions.playPrevious}
                            className="flex h-8 w-8 items-center justify-center rounded-full border text-sm"
                            style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
                            aria-label="Previous track"
                        >
                            ⏮
                        </button>
                        <button
                            type="button"
                            onClick={engineActions.togglePlay}
                            className="flex h-10 w-10 items-center justify-center rounded-full text-base text-white"
                            style={{ background: "var(--accent)" }}
                            aria-label={engineState.isPlaying ? "Pause" : "Play"}
                        >
                            {engineState.isPlaying ? "❚❚" : "▶"}
                        </button>
                        <button
                            type="button"
                            onClick={engineActions.playNext}
                            className="flex h-8 w-8 items-center justify-center rounded-full border text-sm"
                            style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
                            aria-label="Next track"
                        >
                            ⏭
                        </button>
                        <button
                            type="button"
                            onClick={() => engineActions.cycleLoopMode()}
                            className="rounded-full border px-2 py-1 text-xs"
                            style={{
                                borderColor: engineState.loopMode !== "off" ? "var(--accent)" : "var(--border)",
                                color: engineState.loopMode !== "off" ? "var(--accent)" : "var(--muted)",
                            }}
                            aria-label="Cycle repeat mode"
                        >
                            {engineState.loopMode === "one" ? "🔂" : "🔁"}
                        </button>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                        <span className="text-xs" aria-hidden="true">🔉</span>
                        <input
                            type="range"
                            min={0}
                            max={100}
                            value={engineState.volume}
                            onChange={(event) => engineActions.setVolume(Number(event.target.value))}
                            className="w-full"
                            aria-label="Volume"
                        />
                    </div>
                </>
            )}
        </div>
    );
}
