"use client";

import { useEffect, useRef, useState } from "react";

type Track = {
    id: string;
    title: string;
    videoId: string;
};

type StoredState = {
    tracks: Track[];
    currentIndex: number;
    volume: number;
};

type YouTubePlayer = {
    playVideo: () => void;
    pauseVideo: () => void;
    loadVideoById: (videoId: string) => void;
    setVolume: (volume: number) => void;
    seekTo: (seconds: number, allowSeekAhead: boolean) => void;
    getCurrentTime: () => number;
    getDuration: () => number;
    destroy: () => void;
};

type YouTubePlayerEvent = {
    target: YouTubePlayer;
    data: number;
};

type YouTubePlayerConstructor = new (
    element: HTMLElement,
    options: {
        width: string;
        height: string;
        videoId: string;
        playerVars?: Record<string, number | string>;
        events?: {
            onReady?: (event: YouTubePlayerEvent) => void;
            onStateChange?: (event: YouTubePlayerEvent) => void;
        };
    }
) => YouTubePlayer;

declare global {
    interface Window {
        YT?: {
            Player: YouTubePlayerConstructor;
            PlayerState: {
                ENDED: number;
                PLAYING: number;
                PAUSED: number;
                BUFFERING: number;
                CUED: number;
            };
        };
        onYouTubeIframeAPIReady?: () => void;
    }
}

const STORAGE_KEY = "tavern_radio";

const DEFAULT_TRACKS: Track[] = [];

const DEFAULT_VOLUME = 70;

function getYouTubeVideoId(input: string): string | null {
    try {
        const url = new URL(input);

        if (url.hostname === "youtu.be") {
            return url.pathname.slice(1) || null;
        }

        if (
            url.hostname === "youtube.com" ||
            url.hostname === "www.youtube.com" ||
            url.hostname === "m.youtube.com"
        ) {
            return url.searchParams.get("v");
        }

        return null;
    } catch {
        return null;
    }
}

function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return "0:00";
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export default function MusicPlayer() {
    const playerRef = useRef<YouTubePlayer | null>(null);
    const playerContainerRef = useRef<HTMLDivElement | null>(null);
    const apiReadyRef = useRef(false);

    const [tracks, setTracks] =
        useState<Track[]>(DEFAULT_TRACKS);

    const [currentIndex, setCurrentIndex] =
        useState(0);

    const [volume, setVolume] =
        useState(DEFAULT_VOLUME);

    const [isPlaying, setIsPlaying] =
        useState(false);

    const [isReady, setIsReady] =
        useState(false);

    const [currentTime, setCurrentTime] =
        useState(0);

    const [duration, setDuration] =
        useState(0);

    const [showAddTrack, setShowAddTrack] =
        useState(false);

    const [titleInput, setTitleInput] =
        useState("");

    const [urlInput, setUrlInput] =
        useState("");

    const [hydrated, setHydrated] =
        useState(false);

    const currentTrack = tracks[currentIndex];

    /*
     * ---------------------------------------------------------
     * LOAD SAVED TAVERN RADIO STATE
     * ---------------------------------------------------------
     */

    useEffect(() => {
        const stored =
            localStorage.getItem(STORAGE_KEY);

        if (stored) {
            try {
                const parsed =
                    JSON.parse(stored) as StoredState;

                if (Array.isArray(parsed.tracks)) {
                    setTracks(parsed.tracks);

                    if (
                        typeof parsed.currentIndex ===
                        "number"
                    ) {
                        setCurrentIndex(
                            Math.min(
                                Math.max(
                                    parsed.currentIndex,
                                    0
                                ),
                                Math.max(
                                    parsed.tracks.length - 1,
                                    0
                                )
                            )
                        );
                    }

                    if (
                        typeof parsed.volume ===
                            "number" &&
                        parsed.volume >= 0 &&
                        parsed.volume <= 100
                    ) {
                        setVolume(parsed.volume);
                    }
                }
            } catch {
                localStorage.removeItem(STORAGE_KEY);
            }
        }

        setHydrated(true);
    }, []);

    /*
     * ---------------------------------------------------------
     * SAVE STATE
     * ---------------------------------------------------------
     */

    useEffect(() => {
        if (!hydrated) return;

        const savedState: StoredState = {
            tracks,
            currentIndex,
            volume,
        };

        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(savedState)
        );
    }, [
        tracks,
        currentIndex,
        volume,
        hydrated,
    ]);

    /*
     * ---------------------------------------------------------
     * LOAD YOUTUBE IFRAME API
     * ---------------------------------------------------------
     */

    useEffect(() => {
        if (window.YT?.Player) {
            apiReadyRef.current = true;
            return;
        }

        const existingScript =
            document.querySelector(
                'script[src="https://www.youtube.com/iframe_api"]'
            );

        const previousCallback =
            window.onYouTubeIframeAPIReady;

        window.onYouTubeIframeAPIReady = () => {
            apiReadyRef.current = true;

            previousCallback?.();
        };

        if (!existingScript) {
            const script =
                document.createElement("script");

            script.src =
                "https://www.youtube.com/iframe_api";

            script.async = true;

            document.head.appendChild(script);
        }

        return () => {
            window.onYouTubeIframeAPIReady =
                previousCallback;
        };
    }, []);

    /*
     * ---------------------------------------------------------
     * CREATE YOUTUBE PLAYER
     * ---------------------------------------------------------
     */

    useEffect(() => {
        if (!hydrated) return;
        if (!currentTrack?.videoId) return;
        if (!playerContainerRef.current) return;

        let cancelled = false;

        const createPlayer = () => {
            if (cancelled) return;
            if (!window.YT?.Player) return;
            if (!playerContainerRef.current) return;

            playerRef.current?.destroy();

            playerRef.current = new window.YT.Player(
                playerContainerRef.current,
                {
                    width: "200",
                    height: "200",
                    videoId: currentTrack.videoId,
                    playerVars: {
                        playsinline: 1,
                        controls: 0,
                        rel: 0,
                    },
                    events: {
                        onReady: (event) => {
                            if (cancelled) return;

                            event.target.setVolume(volume);

                            setIsReady(true);
                            setDuration(
                                event.target.getDuration()
                            );
                        },

                        onStateChange: (event) => {
                            if (cancelled) return;

                            const playing =
                                window.YT?.PlayerState
                                    .PLAYING;

                            const paused =
                                window.YT?.PlayerState
                                    .PAUSED;

                            const ended =
                                window.YT?.PlayerState
                                    .ENDED;

                            if (
                                event.data ===
                                playing
                            ) {
                                setIsPlaying(true);
                            }

                            if (
                                event.data ===
                                paused
                            ) {
                                setIsPlaying(false);
                            }

                            if (
                                event.data ===
                                ended
                            ) {
                                setIsPlaying(false);

                                setCurrentIndex(
                                    (index) =>
                                        tracks.length === 0
                                            ? 0
                                            : (index + 1) %
                                              tracks.length
                                );
                            }
                        },
                    },
                }
            );
        };

        if (window.YT?.Player) {
            createPlayer();
        } else {
            const previousCallback =
                window.onYouTubeIframeAPIReady;

            window.onYouTubeIframeAPIReady =
                () => {
                    apiReadyRef.current = true;

                    previousCallback?.();

                    createPlayer();
                };
        }

        return () => {
            cancelled = true;
            setIsReady(false);
            setIsPlaying(false);

            playerRef.current?.destroy();
            playerRef.current = null;
        };
    }, [
        hydrated,
        currentTrack?.videoId,
    ]);

    /*
     * ---------------------------------------------------------
     * UPDATE PLAYBACK PROGRESS
     * ---------------------------------------------------------
     */

    useEffect(() => {
        if (!isPlaying) return;

        const interval =
            window.setInterval(() => {
                const player =
                    playerRef.current;

                if (!player) return;

                setCurrentTime(
                    player.getCurrentTime()
                );

                setDuration(
                    player.getDuration()
                );
            }, 500);

        return () =>
            window.clearInterval(interval);
    }, [isPlaying]);

    /*
     * ---------------------------------------------------------
     * VOLUME
     * ---------------------------------------------------------
     */

    useEffect(() => {
        if (!playerRef.current) return;

        playerRef.current.setVolume(volume);
    }, [volume]);

    /*
     * ---------------------------------------------------------
     * CONTROLS
     * ---------------------------------------------------------
     */

    const togglePlay = () => {
        const player = playerRef.current;

        if (!player || !isReady) return;

        if (isPlaying) {
            player.pauseVideo();
        } else {
            player.playVideo();
        }
    };

    const previousTrack = () => {
        if (tracks.length === 0) return;

        setCurrentIndex((index) =>
            index === 0
                ? tracks.length - 1
                : index - 1
        );

        setIsPlaying(false);
        setCurrentTime(0);
    };

    const nextTrack = () => {
        if (tracks.length === 0) return;

        setCurrentIndex(
            (index) =>
                (index + 1) % tracks.length
        );

        setIsPlaying(false);
        setCurrentTime(0);
    };

    const selectTrack = (index: number) => {
        if (index === currentIndex) {
            return;
        }

        setCurrentIndex(index);
        setIsPlaying(false);
        setCurrentTime(0);
    };

    /*
     * ---------------------------------------------------------
     * SEEK
     * ---------------------------------------------------------
     */

    const handleSeek = (
        event: React.ChangeEvent<HTMLInputElement>
    ) => {
        const seconds =
            Number(event.target.value);

        setCurrentTime(seconds);

        playerRef.current?.seekTo(
            seconds,
            true
        );
    };

    /*
     * ---------------------------------------------------------
     * ADD TRACK
     * ---------------------------------------------------------
     */

    const addTrack = () => {
        const videoId =
            getYouTubeVideoId(urlInput);

        if (!videoId) {
            return;
        }

        const newTrack: Track = {
            id: `track-${Date.now()}`,
            title:
                titleInput.trim() ||
                "Untitled Tavern Track",
            videoId,
        };

        setTracks((current) => [
            ...current,
            newTrack,
        ]);

        setCurrentIndex(tracks.length);

        setTitleInput("");
        setUrlInput("");
        setShowAddTrack(false);
        setIsPlaying(false);
    };

    /*
     * ---------------------------------------------------------
     * REMOVE TRACK
     * ---------------------------------------------------------
     */

    const removeTrack = (index: number) => {
        setTracks((current) => {
            const next = current.filter(
                (_, i) => i !== index
            );

            return next;
        });

        setCurrentIndex((current) => {
            if (tracks.length <= 1) {
                return 0;
            }

            if (index < current) {
                return current - 1;
            }

            if (
                index === current &&
                current >= tracks.length - 1
            ) {
                return tracks.length - 2;
            }

            return current;
        });

        setIsPlaying(false);
        setCurrentTime(0);
    };

    const progress =
        duration > 0
            ? (currentTime / duration) * 100
            : 0;

    return (
        <section className="w-full max-w-md overflow-hidden rounded-2xl border border-amber-900/60 bg-slate-900/90 shadow-lg">

            {/* -------------------------------------------------
                HEADER
            ------------------------------------------------- */}

            <div className="border-b border-amber-900/40 bg-amber-950/20 px-5 py-4">
                <div className="flex items-center justify-between">

                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-500">
                            Tavern Radio
                        </p>

                        <h2 className="mt-1 text-lg font-bold text-slate-100">
                            🎵 Music for your quest
                        </h2>
                    </div>

                    <button
                        type="button"
                        onClick={() =>
                            setShowAddTrack(
                                (open) => !open
                            )
                        }
                        className="rounded-lg border border-amber-800/60 px-3 py-2 text-xs font-semibold text-amber-300 transition hover:bg-amber-950/40"
                    >
                        + Add
                    </button>
                </div>
            </div>

            {/* -------------------------------------------------
                YOUTUBE PLAYER
            ------------------------------------------------- */}

            <div className="absolute -left-[9999px] h-[200px] w-[200px] overflow-hidden">
                <div
                    ref={playerContainerRef}
                    className="h-[200px] w-[200px]"
                />
            </div>

            {/* -------------------------------------------------
                CURRENT TRACK
            ------------------------------------------------- */}

            <div className="px-5 pt-5">
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">

                    <div className="flex items-center gap-3">

                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-950/60 text-2xl">
                            🍺
                        </div>

                        <div className="min-w-0 flex-1">

                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                Now Playing
                            </p>

                            <p className="mt-1 truncate font-semibold text-slate-100">
                                {currentTrack
                                    ? currentTrack.title
                                    : "The tavern is quiet..."}
                            </p>

                        </div>
                    </div>

                </div>
            </div>

            {/* -------------------------------------------------
                PROGRESS
            ------------------------------------------------- */}

            <div className="px-5 pt-5">

                <input
                    type="range"
                    min="0"
                    max={duration || 0}
                    step="1"
                    value={Math.min(
                        currentTime,
                        duration || 0
                    )}
                    onChange={handleSeek}
                    disabled={
                        !currentTrack ||
                        !isReady ||
                        duration <= 0
                    }
                    className="w-full accent-amber-600 disabled:opacity-30"
                    aria-label="Track progress"
                />

                <div className="mt-1 flex justify-between text-[10px] text-slate-600">
                    <span>
                        {formatTime(currentTime)}
                    </span>

                    <span>
                        {formatTime(duration)}
                    </span>
                </div>

            </div>

            {/* -------------------------------------------------
                CONTROLS
            ------------------------------------------------- */}

            <div className="px-5 py-5">

                <div className="flex items-center justify-center gap-5">

                    <button
                        type="button"
                        onClick={previousTrack}
                        disabled={
                            tracks.length === 0
                        }
                        className="rounded-full p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white disabled:opacity-30"
                        aria-label="Previous track"
                    >
                        ⏮
                    </button>

                    <button
                        type="button"
                        onClick={togglePlay}
                        disabled={
                            !currentTrack ||
                            !isReady
                        }
                        className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-600 text-xl text-white shadow-lg transition hover:bg-amber-500 disabled:opacity-30"
                        aria-label={
                            isPlaying
                                ? "Pause"
                                : "Play"
                        }
                    >
                        {isPlaying
                            ? "❚❚"
                            : "▶"}
                    </button>

                    <button
                        type="button"
                        onClick={nextTrack}
                        disabled={
                            tracks.length === 0
                        }
                        className="rounded-full p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white disabled:opacity-30"
                        aria-label="Next track"
                    >
                        ⏭
                    </button>

                </div>

                {/* Volume */}

                <div className="mt-5 flex items-center gap-3">

                    <span className="text-sm">
                        🔊
                    </span>

                    <input
                        type="range"
                        min="0"
                        max="100"
                        value={volume}
                        onChange={(event) =>
                            setVolume(
                                Number(
                                    event.target.value
                                )
                            )
                        }
                        className="flex-1 accent-amber-600"
                        aria-label="Volume"
                    />

                    <span className="w-8 text-right text-xs text-slate-500">
                        {volume}
                    </span>

                </div>

            </div>

            {/* -------------------------------------------------
                ADD TRACK
            ------------------------------------------------- */}

            {showAddTrack && (
                <div className="border-t border-slate-800 bg-slate-950/40 p-5">

                    <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">
                        Add Tavern Track
                    </p>

                    <input
                        value={titleInput}
                        onChange={(event) =>
                            setTitleInput(
                                event.target.value
                            )
                        }
                        placeholder="Track name"
                        className="mb-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-amber-600"
                    />

                    <input
                        value={urlInput}
                        onChange={(event) =>
                            setUrlInput(
                                event.target.value
                            )
                        }
                        placeholder="Paste YouTube URL"
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-amber-600"
                    />

                    <div className="mt-3 flex gap-2">

                        <button
                            type="button"
                            onClick={() => {
                                setShowAddTrack(false);
                                setTitleInput("");
                                setUrlInput("");
                            }}
                            className="flex-1 rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-400 hover:bg-slate-800"
                        >
                            Cancel
                        </button>

                        <button
                            type="button"
                            onClick={addTrack}
                            disabled={
                                !getYouTubeVideoId(
                                    urlInput
                                )
                            }
                            className="flex-1 rounded-lg bg-amber-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            Add Track
                        </button>

                    </div>

                    <p className="mt-3 text-[10px] leading-4 text-slate-600">
                        Paste a YouTube video URL. The
                        video must allow embedding.
                    </p>

                </div>
            )}

            {/* -------------------------------------------------
                PLAYLIST
            ------------------------------------------------- */}

            <div className="border-t border-slate-800">

                <div className="flex items-center justify-between px-5 py-3">

                    <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                        Playlist
                    </p>

                    <span className="text-xs text-slate-600">
                        {tracks.length}{" "}
                        {tracks.length === 1
                            ? "track"
                            : "tracks"}
                    </span>

                </div>

                <div className="max-h-48 overflow-y-auto">

                    {tracks.map((track, index) => (
                        <div
                            key={track.id}
                            className={`group flex items-center gap-3 px-5 py-3 transition ${
                                index === currentIndex
                                    ? "bg-amber-950/30"
                                    : "hover:bg-slate-800/50"
                            }`}
                        >

                            <button
                                type="button"
                                onClick={() =>
                                    selectTrack(index)
                                }
                                className="min-w-0 flex-1 text-left"
                            >
                                <p
                                    className={`truncate text-sm ${
                                        index ===
                                        currentIndex
                                            ? "font-semibold text-amber-300"
                                            : "text-slate-300"
                                    }`}
                                >
                                    {index ===
                                    currentIndex
                                        ? "♫ "
                                        : ""}
                                    {track.title}
                                </p>
                            </button>

                            <button
                                type="button"
                                onClick={() =>
                                    removeTrack(index)
                                }
                                className="text-xs text-slate-600 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                                aria-label={`Remove ${track.title}`}
                            >
                                ✕
                            </button>

                        </div>
                    ))}

                    {tracks.length === 0 && (
                        <p className="px-5 pb-5 text-center text-sm text-slate-500">
                            The bard hasn't arrived yet.
                            <br />
                            Add a song to start the music.
                        </p>
                    )}

                </div>

            </div>

            {/* -------------------------------------------------
                FOOTER
            ------------------------------------------------- */}

            <div className="border-t border-amber-900/30 bg-amber-950/10 px-5 py-3">

                <p className="text-center text-[10px] text-slate-600">
                    🎻 The tavern bard plays through
                    YouTube
                </p>

            </div>

        </section>
    );
}