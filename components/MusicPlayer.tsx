"use client";

import {
    FormEvent,
    useEffect,
    useRef,
    useState,
} from "react";
import Spinner from "@/components/Spinner";

type MusicTrack = {
    id: string;
    title: string;
    sourceUrl: string;
    thumbnail: string | null;
    position: number;
};

type MusicPlaylist = {
    id: string;
    name: string;
    sourceUrl: string | null;
    createdAt: string;
    updatedAt: string;
    tracks: MusicTrack[];
};

declare global {
    interface Window {
        YT: {
            Player: new (
                element: string | HTMLElement,
                options: {
                    videoId?: string;
                    playerVars?: {
                        autoplay?: number;
                        controls?: number;
                        rel?: number;
                    };
                    events?: {
                        onReady?: (event: {
                            target: YTPlayer;
                        }) => void;
                        onStateChange?: (event: {
                            data: number;
                            target: YTPlayer;
                        }) => void;
                    };
                }
            ) => YTPlayer;

            PlayerState: {
                PLAYING: number;
                PAUSED: number;
                ENDED: number;
            };
        };
    }
}

type YTPlayer = {
    playVideo: () => void;
    pauseVideo: () => void;
    stopVideo: () => void;
    destroy: () => void;
    getCurrentTime: () => number;
    getDuration: () => number;
    setVolume: (volume: number) => void;
};

function getYouTubeVideoId(url: string): string | null {
    try {
        const parsed = new URL(url);

        if (
            parsed.hostname === "youtu.be" ||
            parsed.hostname === "www.youtu.be"
        ) {
            return parsed.pathname.slice(1) || null;
        }

        if (
            parsed.hostname.includes("youtube.com")
        ) {
            const videoId =
                parsed.searchParams.get("v");

            if (videoId) {
                return videoId;
            }

            const shortsMatch =
                parsed.pathname.match(
                    /^\/shorts\/([^/]+)/
                );

            if (shortsMatch) {
                return shortsMatch[1];
            }

            const embedMatch =
                parsed.pathname.match(
                    /^\/embed\/([^/]+)/
                );

            if (embedMatch) {
                return embedMatch[1];
            }
        }

        return null;
    } catch {
        return null;
    }
}

type LoopMode = "off" | "all" | "one";

/*
 * Fisher-Yates shuffle of [0..length-1]. If keepFirst is given,
 * that index is moved to the front so toggling shuffle on
 * mid-track doesn't jump to a different track.
 */
function buildShuffleOrder(
    length: number,
    keepFirst?: number
): number[] {
    const order = Array.from(
        { length },
        (_, index) => index
    );

    for (
        let i = order.length - 1;
        i > 0;
        i--
    ) {
        const j = Math.floor(
            Math.random() * (i + 1)
        );

        [order[i], order[j]] = [
            order[j],
            order[i],
        ];
    }

    if (
        keepFirst !== undefined &&
        keepFirst >= 0
    ) {
        const currentPosition =
            order.indexOf(keepFirst);

        if (currentPosition > 0) {
            order.splice(
                currentPosition,
                1
            );

            order.unshift(keepFirst);
        }
    }

    return order;
}

function PreviousIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-4 w-4"
            aria-hidden="true"
        >
            <path d="M6 5a1 1 0 0 1 1 1v5.1l9.4-6.27A1 1 0 0 1 18 5.68v12.64a1 1 0 0 1-1.6.83L7 12.9V18a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1Z" />
        </svg>
    );
}

function NextIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-4 w-4"
            aria-hidden="true"
        >
            <path d="M18 5a1 1 0 0 0-1 1v5.1L7.6 4.83A1 1 0 0 0 6 5.68v12.64a1 1 0 0 0 1.6.83L17 12.9V18a1 1 0 1 0 2 0V6a1 1 0 0 0-1-1Z" />
        </svg>
    );
}

function PlayIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-5 w-5"
            aria-hidden="true"
        >
            <path d="M7.5 5.14a1 1 0 0 1 1.5-.87l10.5 6.86a1 1 0 0 1 0 1.74L9 19.73a1 1 0 0 1-1.5-.87Z" />
        </svg>
    );
}

function PauseIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-5 w-5"
            aria-hidden="true"
        >
            <path d="M7 5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1Zm7 0a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1Z" />
        </svg>
    );
}

function ShuffleIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden="true"
        >
            <path d="M4 6h3.2c1.6 0 2.9.8 3.7 2.1M4 18h3.2c1.6 0 2.9-.8 3.7-2.1M14 6h2.5M14 18h2.5" />
            <path d="M20 6h-3.5m3.5 0-2.5-2.3M20 6l-2.5 2.3M20 18h-3.5m3.5 0-2.5-2.3M20 18l-2.5 2.3" />
        </svg>
    );
}

function RepeatIcon({
    mode,
}: {
    mode: LoopMode;
}) {
    return (
        <span className="relative inline-flex">
            <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
                aria-hidden="true"
            >
                <path d="M6 4v3a1 1 0 0 0 1 1h11" />
                <path d="M18 6.5 15.5 4 18 1.5" />
                <path d="M18 20v-3a1 1 0 0 0-1-1H6" />
                <path d="M6 17.5 8.5 20 6 22.5" />
            </svg>

            {mode === "one" && (
                <span className="absolute -bottom-1.5 -right-1.5 rounded-full bg-[var(--accent)] px-[3px] text-[8px] font-bold leading-[10px] text-white">
                    1
                </span>
            )}
        </span>
    );
}

export default function MusicPlayer() {
    const [playlists, setPlaylists] =
        useState<MusicPlaylist[]>([]);

    const [selectedPlaylistId, setSelectedPlaylistId] =
        useState<string | null>(null);

    const [currentIndex, setCurrentIndex] =
        useState(0);

    const [isPlaying, setIsPlaying] =
        useState(false);

    const [playerReady, setPlayerReady] =
        useState(false);

    const [currentTime, setCurrentTime] =
        useState(0);

    const [duration, setDuration] =
        useState(0);

    const [volume, setVolume] =
        useState(70);

    const [loopMode, setLoopMode] =
        useState<LoopMode>("off");

    const [shuffle, setShuffle] =
        useState(false);

    const [shuffleOrder, setShuffleOrder] =
        useState<number[]>([]);

    const [loading, setLoading] =
        useState(true);

    const [error, setError] =
        useState("");

    const [showCreatePlaylist, setShowCreatePlaylist] =
        useState(false);

    const [showAddTrack, setShowAddTrack] =
        useState(false);

    const [showImport, setShowImport] =
        useState(false);

    const [newPlaylistName, setNewPlaylistName] =
        useState("");

    const [trackTitle, setTrackTitle] =
        useState("");

    const [trackUrl, setTrackUrl] =
        useState("");

    const [youtubePlaylistUrl, setYoutubePlaylistUrl] =
        useState("");

    const [importTargetId, setImportTargetId] =
        useState<string | null>(null);

    const [newImportPlaylistName, setNewImportPlaylistName] =
        useState("");

    const [isSubmitting, setIsSubmitting] =
        useState(false);

    // Tracks which single playlist/track a rename/delete is currently in
    // flight for, so only that row's button shows busy (mirrors
    // ManageCoursesModal.tsx's busyCourseId pattern).
    const [busyItemId, setBusyItemId] =
        useState<string | null>(null);

    const [editingPlaylistId, setEditingPlaylistId] =
        useState<string | null>(null);

    const [editingPlaylistName, setEditingPlaylistName] =
        useState("");

    const [editingTrackId, setEditingTrackId] =
        useState<string | null>(null);

    const [editingTrackTitle, setEditingTrackTitle] =
        useState("");

    const playerRef =
        useRef<YTPlayer | null>(null);

    const shouldAutoplayRef =
        useRef(false);

    /*
     * loopMode/shuffle/shuffleOrder are read inside the YT
     * player's onStateChange handler, which is only recreated
     * when the current track changes (see the player-creation
     * effect's [currentTrack?.id] deps below) — not when the
     * user toggles shuffle/repeat mid-track. Refs keep that
     * long-lived closure reading the latest value instead of a
     * stale one, same purpose as shouldAutoplayRef above.
     */
    const loopModeRef =
        useRef<LoopMode>("off");

    const shuffleRef =
        useRef(false);

    const shuffleOrderRef =
        useRef<number[]>([]);

    useEffect(() => {
        loopModeRef.current = loopMode;
    }, [loopMode]);

    useEffect(() => {
        shuffleRef.current = shuffle;
    }, [shuffle]);

    useEffect(() => {
        shuffleOrderRef.current = shuffleOrder;
    }, [shuffleOrder]);

    const selectedPlaylist =
        playlists.find(
            (playlist) =>
                playlist.id === selectedPlaylistId
        ) ?? null;

    const currentTrack =
        selectedPlaylist?.tracks[currentIndex] ??
        null;

    /*
     * Guards the loop/shuffle persist effects below from firing
     * with their default values before the load effect has had a
     * chance to apply the saved ones — same "hydrated" flag
     * PomodoroTimer.tsx uses for the same reason. Without this, on
     * every fresh mount both persist effects run once with
     * loopMode/shuffle still at their initial defaults (React runs
     * every effect on mount regardless of deps), clobbering
     * whatever was actually saved before the load effect's
     * setState below has committed.
     */
    const [
        preferencesLoaded,
        setPreferencesLoaded,
    ] = useState(false);

    /*
     * Load saved volume/loop/shuffle preferences.
     *
     * These are genuinely per-device UI preferences (same as
     * pomodoro_state/planner_theme), not account data, so they
     * stay localStorage-only rather than moving to the DB.
     */
    useEffect(() => {
        const savedVolume =
            localStorage.getItem(
                "music-player-volume"
            );

        if (savedVolume !== null) {
            const parsed =
                Number(savedVolume);

            if (
                Number.isFinite(parsed) &&
                parsed >= 0 &&
                parsed <= 100
            ) {
                setVolume(parsed);
            }
        }

        const savedLoopMode =
            localStorage.getItem(
                "music-player-loop"
            );

        if (
            savedLoopMode === "off" ||
            savedLoopMode === "all" ||
            savedLoopMode === "one"
        ) {
            setLoopMode(savedLoopMode);
        }

        const savedShuffle =
            localStorage.getItem(
                "music-player-shuffle"
            );

        if (savedShuffle === "true") {
            setShuffle(true);
        }

        setPreferencesLoaded(true);
    }, []);

    /*
     * Persist loop/shuffle preferences. Gated on preferencesLoaded
     * — see that flag's comment above.
     */
    useEffect(() => {
        if (!preferencesLoaded) {
            return;
        }

        localStorage.setItem(
            "music-player-loop",
            loopMode
        );
    }, [loopMode, preferencesLoaded]);

    useEffect(() => {
        if (!preferencesLoaded) {
            return;
        }

        localStorage.setItem(
            "music-player-shuffle",
            String(shuffle)
        );
    }, [shuffle, preferencesLoaded]);

    /*
     * Rebuild the shuffle order if it's missing or stale (track
     * count changed since it was built — e.g. a track was
     * added/removed, or a different playlist was selected while
     * shuffle was already on). Called from playNext/playPrevious
     * (event handlers / the YT player's callback, not a React
     * effect body), not an effect, so this can't drift out of
     * sync the way an effect keyed on track count could.
     */
    function ensureShuffleOrder(
        trackCount: number
    ): number[] {
        if (
            shuffleOrderRef.current.length ===
            trackCount
        ) {
            return shuffleOrderRef.current;
        }

        const rebuilt = buildShuffleOrder(
            trackCount,
            currentIndex
        );

        shuffleOrderRef.current = rebuilt;
        setShuffleOrder(rebuilt);

        return rebuilt;
    }

    /*
     * Load playlists.
     */
    useEffect(() => {
        async function loadPlaylists() {
            try {
                setLoading(true);
                setError("");

                const response =
                    await fetch(
                        "/api/music/playlists"
                    );

                if (!response.ok) {
                    throw new Error(
                        "Failed to load playlists."
                    );
                }

                const data =
                    await response.json();

                setPlaylists(data);

                if (data.length > 0) {
                    setSelectedPlaylistId(
                        data[0].id
                    );
                }
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : "Failed to load playlists."
                );
            } finally {
                setLoading(false);
            }
        }

        loadPlaylists();
    }, []);

    /*
     * Load the YouTube IFrame API.
     */
    useEffect(() => {
        if (
            document.getElementById(
                "youtube-iframe-api"
            )
        ) {
            return;
        }

        const script =
            document.createElement("script");

        script.id =
            "youtube-iframe-api";

        script.src =
            "https://www.youtube.com/iframe_api";

        script.async = true;

        document.body.appendChild(script);
    }, []);

    /*
     * Create / destroy YouTube player
     * whenever the current track changes.
     */
    useEffect(() => {
        if (!currentTrack) {
            playerRef.current = null;
            setPlayerReady(false);
            setIsPlaying(false);
            setCurrentTime(0);
            setDuration(0);

            return;
        }

        let cancelled = false;

        const createPlayer = () => {
            if (cancelled) {
                return;
            }

            const container =
                document.getElementById(
                    "youtube-player"
                );

            if (!container) {
                return;
            }

            const videoId =
                getYouTubeVideoId(
                    currentTrack.sourceUrl
                );

            if (!videoId) {
                setError(
                    "Invalid YouTube video URL."
                );

                return;
            }

            setPlayerReady(false);
            setIsPlaying(false);
            setCurrentTime(0);
            setDuration(0);

            if (playerRef.current) {
                try {
                    playerRef.current.destroy();
                } catch {
                    // Player may already be destroyed.
                }

                playerRef.current = null;
            }

            /*
             * Clear the container so the old
             * iframe does not remain around.
             */
            container.innerHTML = "";

            playerRef.current =
                new window.YT.Player(
                    container,
                    {
                        videoId,

                        playerVars: {
                            autoplay: 0,
                            controls: 0,
                            rel: 0,
                        },

                        events: {
                            onReady: (event) => {
                                if (cancelled) {
                                    return;
                                }

                                playerRef.current =
                                    event.target;

                                setPlayerReady(true);

                                event.target.setVolume(
                                    volume
                                );

                                if (
                                    shouldAutoplayRef.current
                                ) {
                                    event.target.playVideo();

                                    shouldAutoplayRef.current =
                                        false;
                                }
                            },

                            onStateChange: (event) => {
                                if (cancelled) {
                                    return;
                                }

                                if (
                                    event.data ===
                                    window.YT.PlayerState
                                        .PLAYING
                                ) {
                                    setIsPlaying(true);
                                }

                                if (
                                    event.data ===
                                    window.YT.PlayerState
                                        .PAUSED
                                ) {
                                    setIsPlaying(false);
                                }

                                if (
                                    event.data ===
                                    window.YT.PlayerState
                                        .ENDED
                                ) {
                                    if (
                                        loopModeRef.current ===
                                        "one"
                                    ) {
                                        const repeatPlayer =
                                            event.target as YTPlayer & {
                                                seekTo?: (
                                                    seconds: number,
                                                    allowSeekAhead: boolean
                                                ) => void;
                                            };

                                        if (
                                            typeof repeatPlayer.seekTo ===
                                            "function"
                                        ) {
                                            repeatPlayer.seekTo(
                                                0,
                                                true
                                            );
                                        }

                                        repeatPlayer.playVideo();

                                        return;
                                    }

                                    playNext();
                                }
                            },
                        },
                    }
                );
        };

        if (
            window.YT &&
            typeof window.YT.Player ===
                "function"
        ) {
            createPlayer();
        } else {
            const checkYouTube =
                window.setInterval(() => {
                    if (
                        window.YT &&
                        typeof window.YT.Player ===
                            "function"
                    ) {
                        window.clearInterval(
                            checkYouTube
                        );

                        createPlayer();
                    }
                }, 100);

            return () => {
                cancelled = true;

                window.clearInterval(
                    checkYouTube
                );
            };
        }

        return () => {
            cancelled = true;

            if (playerRef.current) {
                try {
                    playerRef.current.destroy();
                } catch {
                    // Ignore cleanup errors.
                }

                playerRef.current = null;
            }

            setPlayerReady(false);
        };
    }, [currentTrack?.id]);

    /*
     * Update playback time.
     */
    useEffect(() => {
        if (!playerReady) {
            return;
        }

        const interval =
            window.setInterval(() => {
                const player =
                    playerRef.current;

                if (
                    !player ||
                    typeof player.getCurrentTime !==
                        "function" ||
                    typeof player.getDuration !==
                        "function"
                ) {
                    return;
                }

                setCurrentTime(
                    player.getCurrentTime()
                );

                setDuration(
                    player.getDuration()
                );
            }, 500);

        return () => {
            window.clearInterval(
                interval
            );
        };
    }, [playerReady]);

    /*
     * Update YouTube volume.
     */
    useEffect(() => {
        const player =
            playerRef.current;

        if (
            !player ||
            !playerReady ||
            typeof player.setVolume !==
                "function"
        ) {
            return;
        }

        player.setVolume(volume);

        localStorage.setItem(
            "music-player-volume",
            String(volume)
        );
    }, [volume, playerReady]);

    /*
     * Create playlist.
     */
    async function createPlaylist(
        event: FormEvent
    ) {
        event.preventDefault();

        if (!newPlaylistName.trim()) {
            return;
        }

        try {
            setIsSubmitting(true);
            setError("");

            const response =
                await fetch(
                    "/api/music/playlists",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type":
                                "application/json",
                        },
                        body: JSON.stringify({
                            name:
                                newPlaylistName.trim(),
                        }),
                    }
                );

            const data =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                        "Failed to create playlist."
                );
            }

            setPlaylists((current) => [
                ...current,
                {
                    ...data,
                    tracks:
                        data.tracks ?? [],
                },
            ]);

            setSelectedPlaylistId(
                data.id
            );

            setCurrentIndex(0);
            setNewPlaylistName("");
            setShowCreatePlaylist(false);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to create playlist."
            );
        } finally {
            setIsSubmitting(false);
        }
    }

    /*
     * Add individual track.
     */
    async function addTrack(
        event: FormEvent
    ) {
        event.preventDefault();

        if (
            !selectedPlaylistId ||
            !trackTitle.trim() ||
            !trackUrl.trim()
        ) {
            return;
        }

        try {
            setIsSubmitting(true);
            setError("");

            const response =
                await fetch(
                    `/api/music/${selectedPlaylistId}/tracks`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type":
                                "application/json",
                        },
                        body: JSON.stringify({
                            title:
                                trackTitle.trim(),
                            sourceUrl:
                                trackUrl.trim(),
                        }),
                    }
                );

            const data =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                        "Failed to add track."
                );
            }

            setPlaylists((current) =>
                current.map((playlist) =>
                    playlist.id ===
                    selectedPlaylistId
                        ? {
                              ...playlist,
                              tracks: [
                                  ...playlist.tracks,
                                  data,
                              ],
                          }
                        : playlist
                )
            );

            setTrackTitle("");
            setTrackUrl("");
            setShowAddTrack(false);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to add track."
            );
        } finally {
            setIsSubmitting(false);
        }
    }

    /*
     * Import an entire YouTube playlist.
     *
     * If there is no selected destination playlist,
     * create one first.
     */
    async function importPlaylist(
        event: FormEvent
    ) {
        event.preventDefault();

        if (!youtubePlaylistUrl.trim()) {
            return;
        }

        try {
            setIsSubmitting(true);
            setError("");

            let destinationId =
                importTargetId;

            /*
             * No destination selected:
             * create a new Student Planner playlist.
             */
            if (!destinationId) {
                if (
                    !newImportPlaylistName.trim()
                ) {
                    throw new Error(
                        "Select a playlist or enter a name for a new playlist."
                    );
                }

                const createResponse =
                    await fetch(
                        "/api/music/playlists",
                        {
                            method: "POST",
                            headers: {
                                "Content-Type":
                                    "application/json",
                            },
                            body: JSON.stringify({
                                name:
                                    newImportPlaylistName.trim(),
                            }),
                        }
                    );

                const created =
                    await createResponse.json();

                if (!createResponse.ok) {
                    throw new Error(
                        created.error ||
                            "Failed to create playlist."
                    );
                }

                const newPlaylist: MusicPlaylist =
                    {
                        ...created,
                        tracks:
                            created.tracks ?? [],
                    };

                setPlaylists((current) => [
                    ...current,
                    newPlaylist,
                ]);

                destinationId =
                    newPlaylist.id;

                setSelectedPlaylistId(
                    destinationId
                );

                setCurrentIndex(0);
            }

            const response =
                await fetch(
                    "/api/music/import-youtube-playlist",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type":
                                "application/json",
                        },
                        body: JSON.stringify({
                            playlistId:
                                destinationId,
                            youtubePlaylistUrl:
                                youtubePlaylistUrl.trim(),
                        }),
                    }
                );

            const data =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                        "Failed to import YouTube playlist."
                );
            }

            if (data.playlist) {
                setPlaylists((current) =>
                    current.map((playlist) =>
                        playlist.id ===
                        destinationId
                            ? data.playlist
                            : playlist
                    )
                );
            }

            setSelectedPlaylistId(
                destinationId
            );

            setCurrentIndex(0);

            setYoutubePlaylistUrl("");
            setImportTargetId(null);
            setNewImportPlaylistName("");
            setShowImport(false);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to import YouTube playlist."
            );
        } finally {
            setIsSubmitting(false);
        }
    }

    /*
     * Rename playlist.
     */
    async function renamePlaylist(
        playlistId: string
    ) {
        if (!editingPlaylistName.trim()) {
            return;
        }

        try {
            setError("");
            setBusyItemId(playlistId);

            const response =
                await fetch(
                    `/api/music/${playlistId}`,
                    {
                        method: "PATCH",
                        headers: {
                            "Content-Type":
                                "application/json",
                        },
                        body: JSON.stringify({
                            name:
                                editingPlaylistName.trim(),
                        }),
                    }
                );

            const data =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                        "Failed to rename playlist."
                );
            }

            setPlaylists((current) =>
                current.map((playlist) =>
                    playlist.id === playlistId
                        ? data
                        : playlist
                )
            );

            setEditingPlaylistId(null);
            setEditingPlaylistName("");
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to rename playlist."
            );
        } finally {
            setBusyItemId(null);
        }
    }

    /*
     * Rename track.
     */
    async function renameTrack(
        playlistId: string,
        trackId: string
    ) {
        if (!editingTrackTitle.trim()) {
            return;
        }

        try {
            setError("");
            setBusyItemId(trackId);

            const response =
                await fetch(
                    `/api/music/${playlistId}/tracks`,
                    {
                        method: "PATCH",
                        headers: {
                            "Content-Type":
                                "application/json",
                        },
                        body: JSON.stringify({
                            trackId,
                            title:
                                editingTrackTitle.trim(),
                        }),
                    }
                );

            const data =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                        "Failed to rename track."
                );
            }

            setPlaylists((current) =>
                current.map((playlist) =>
                    playlist.id === playlistId
                        ? {
                              ...playlist,
                              tracks:
                                  playlist.tracks.map(
                                      (track) =>
                                          track.id ===
                                          trackId
                                              ? data
                                              : track
                                  ),
                          }
                        : playlist
                )
            );

            setEditingTrackId(null);
            setEditingTrackTitle("");
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to rename track."
            );
        } finally {
            setBusyItemId(null);
        }
    }

    /*
     * Delete playlist.
     */
    async function deletePlaylist(
        playlistId: string
    ) {
        const confirmed =
            window.confirm(
                "Delete this playlist?"
            );

        if (!confirmed) {
            return;
        }

        try {
            setError("");
            setBusyItemId(playlistId);

            const response =
                await fetch(
                    `/api/music/${playlistId}`,
                    {
                        method: "DELETE",
                    }
                );

            const data =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                        "Failed to delete playlist."
                );
            }

            setPlaylists((current) => {
                const remaining =
                    current.filter(
                        (playlist) =>
                            playlist.id !==
                            playlistId
                    );

                if (
                    selectedPlaylistId ===
                    playlistId
                ) {
                    setSelectedPlaylistId(
                        remaining[0]?.id ??
                            null
                    );

                    setCurrentIndex(0);
                }

                return remaining;
            });
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to delete playlist."
            );
        } finally {
            setBusyItemId(null);
        }
    }

    /*
     * Delete track.
     */
    async function deleteTrack(
        playlistId: string,
        trackId: string
    ) {
        try {
            setError("");
            setBusyItemId(trackId);

            const playlist =
                playlists.find(
                    (item) =>
                        item.id ===
                        playlistId
                );

            if (!playlist) {
                return;
            }

            const deletedIndex =
                playlist.tracks.findIndex(
                    (track) =>
                        track.id === trackId
                );

            const response =
                await fetch(
                    `/api/music/${playlistId}/tracks`,
                    {
                        method: "DELETE",
                        headers: {
                            "Content-Type":
                                "application/json",
                        },
                        body: JSON.stringify({
                            trackId,
                        }),
                    }
                );

            const data =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                        "Failed to delete track."
                );
            }

            setPlaylists((current) =>
                current.map((item) => {
                    if (
                        item.id !==
                        playlistId
                    ) {
                        return item;
                    }

                    return {
                        ...item,
                        tracks:
                            item.tracks.filter(
                                (track) =>
                                    track.id !==
                                    trackId
                            ),
                    };
                })
            );

            if (
                deletedIndex >= 0 &&
                deletedIndex < currentIndex
            ) {
                setCurrentIndex(
                    (index) =>
                        Math.max(
                            0,
                            index - 1
                        )
                );
            } else if (
                deletedIndex ===
                currentIndex
            ) {
                setCurrentIndex(
                    (index) =>
                        Math.max(
                            0,
                            Math.min(
                                index,
                                playlist.tracks
                                    .length - 2
                            )
                        )
                );

                setIsPlaying(false);
            }
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to delete track."
            );
        } finally {
            setBusyItemId(null);
        }
    }

    /*
     * Select a track.
     */
    function selectTrack(
        index: number
    ) {
        shouldAutoplayRef.current =
            true;

        setCurrentIndex(index);
    }

    /*
     * Play / pause.
     */
    function togglePlay() {
        const player =
            playerRef.current;

        if (
            !playerReady ||
            !player
        ) {
            return;
        }

        if (
            typeof player.playVideo !==
                "function" ||
            typeof player.pauseVideo !==
                "function"
        ) {
            return;
        }

        if (isPlaying) {
            player.pauseVideo();
        } else {
            player.playVideo();
        }
    }

    /*
     * Next track. Shuffle/loop-aware — reads loopModeRef/
     * shuffleRef/shuffleOrderRef (not state) since this is also
     * called from a long-lived player event handler; see those
     * refs' comment above.
     */
    function playNext() {
        if (!selectedPlaylist) {
            return;
        }

        const trackCount =
            selectedPlaylist.tracks.length;

        if (shuffleRef.current) {
            const order =
                ensureShuffleOrder(trackCount);

            const position =
                order.indexOf(currentIndex);

            const nextPosition =
                position + 1;

            if (nextPosition < order.length) {
                shouldAutoplayRef.current = true;
                setCurrentIndex(
                    order[nextPosition]
                );
                return;
            }

            if (loopModeRef.current === "all") {
                const reshuffled =
                    buildShuffleOrder(trackCount);

                setShuffleOrder(reshuffled);
                shouldAutoplayRef.current = true;
                setCurrentIndex(reshuffled[0]);
                return;
            }

            setIsPlaying(false);
            return;
        }

        const nextIndex =
            currentIndex + 1;

        if (nextIndex >= trackCount) {
            if (loopModeRef.current === "all") {
                shouldAutoplayRef.current = true;
                setCurrentIndex(0);
                return;
            }

            setIsPlaying(false);
            return;
        }

        shouldAutoplayRef.current =
            true;

        setCurrentIndex(nextIndex);
    }

    /*
     * Previous track. Shuffle/loop-aware, mirrors playNext.
     */
    function playPrevious() {
        if (!selectedPlaylist) {
            return;
        }

        const trackCount =
            selectedPlaylist.tracks.length;

        if (shuffleRef.current) {
            const order =
                ensureShuffleOrder(trackCount);

            const position =
                order.indexOf(currentIndex);

            const previousPosition =
                position - 1;

            if (previousPosition >= 0) {
                shouldAutoplayRef.current = true;
                setCurrentIndex(
                    order[previousPosition]
                );
                return;
            }

            if (
                loopModeRef.current === "all" &&
                order.length > 0
            ) {
                shouldAutoplayRef.current = true;
                setCurrentIndex(
                    order[order.length - 1]
                );
            }

            return;
        }

        const previousIndex =
            currentIndex - 1;

        if (previousIndex < 0) {
            if (
                loopModeRef.current === "all" &&
                trackCount > 0
            ) {
                shouldAutoplayRef.current = true;
                setCurrentIndex(trackCount - 1);
            }

            return;
        }

        shouldAutoplayRef.current =
            true;

        setCurrentIndex(
            previousIndex
        );
    }

    /*
     * Cycle repeat: off -> all -> one -> off.
     */
    function cycleLoopMode() {
        setLoopMode((current) => {
            if (current === "off") {
                return "all";
            }

            if (current === "all") {
                return "one";
            }

            return "off";
        });
    }

    /*
     * Toggle shuffle. Builds the initial shuffle order right
     * away (anchored on the currently-playing track) so Next/
     * Previous have an order to walk as soon as shuffle turns on.
     */
    function toggleShuffle() {
        if (!shuffle && selectedPlaylist) {
            const rebuilt = buildShuffleOrder(
                selectedPlaylist.tracks.length,
                currentIndex
            );

            shuffleOrderRef.current = rebuilt;
            setShuffleOrder(rebuilt);
        }

        setShuffle((current) => !current);
    }

    /*
     * Seek.
     */
    function seek(
        event: React.ChangeEvent<HTMLInputElement>
    ) {
        const value =
            Number(event.target.value);

        const player =
            playerRef.current;

        if (
            !player ||
            !playerReady
        ) {
            return;
        }

        if (
            typeof player.getDuration !==
                "function"
        ) {
            return;
        }

        const targetTime =
            (value / 100) *
            player.getDuration();

        /*
         * YT.Player normally has seekTo.
         * We intentionally check for it because
         * the player can still be initializing.
         */
        const seekPlayer =
            player as YTPlayer & {
                seekTo?: (
                    seconds: number,
                    allowSeekAhead: boolean
                ) => void;
            };

        if (
            typeof seekPlayer.seekTo ===
            "function"
        ) {
            seekPlayer.seekTo(
                targetTime,
                true
            );

            setCurrentTime(
                targetTime
            );
        }
    }

    const progress =
        duration > 0
            ? Math.min(
                  100,
                  (currentTime /
                      duration) *
                      100
              )
            : 0;

    function formatTime(
        seconds: number
    ) {
        if (
            !Number.isFinite(seconds) ||
            seconds < 0
        ) {
            return "0:00";
        }

        const minutes =
            Math.floor(seconds / 60);

        const remainingSeconds =
            Math.floor(seconds % 60);

        return `${minutes}:${remainingSeconds
            .toString()
            .padStart(2, "0")}`;
    }

    if (loading) {
        return (
            <div className="theme-surface flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4 text-sm text-[var(--muted)]">
                <Spinner className="h-4 w-4" />
                Loading Tavern Radio...
            </div>
        );
    }

    return (
        <div className="theme-surface @container flex flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-4">
            {error && (
                <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-xs text-red-700">
                    {error}
                </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h1 className="text-lg font-bold">
                        Tavern Radio
                    </h1>

                    <p className="text-xs text-gray-500">
                        Your personal study soundtrack.
                    </p>
                </div>

                <div className="flex flex-wrap gap-1.5">
                    <button
                        type="button"
                        onClick={() =>
                            setShowImport(true)
                        }
                        className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white"
                    >
                        Import Playlist
                    </button>

                    <button
                        type="button"
                        onClick={() =>
                            setShowCreatePlaylist(
                                true
                            )
                        }
                        className="rounded-lg border px-3 py-1.5 text-xs font-medium"
                    >
                        New Playlist
                    </button>

                    {selectedPlaylist && (
                        <button
                            type="button"
                            onClick={() =>
                                setShowAddTrack(
                                    true
                                )
                            }
                            className="rounded-lg border px-3 py-1.5 text-xs font-medium"
                        >
                            Add Track
                        </button>
                    )}
                </div>
            </div>

            {playlists.length === 0 ? (
                <div className="rounded-xl border p-8 text-center">
                    <h2 className="text-lg font-semibold">
                        No playlists yet
                    </h2>

                    <p className="mt-2 text-sm text-gray-500">
                        Import a YouTube playlist or
                        create your first playlist.
                    </p>
                </div>
            ) : (
                <div className="grid gap-4 @lg:grid-cols-[200px_minmax(0,1fr)]">
                    <aside className="rounded-xl border p-3">
                        <div className="mb-3 flex items-center justify-between">
                            <h2 className="font-semibold">
                                Playlists
                            </h2>
                        </div>

                        <div className="flex flex-col gap-1">
                            {playlists.map(
                                (playlist) => (
                                    <div
                                        key={
                                            playlist.id
                                        }
                                        className={`rounded-lg ${
                                            selectedPlaylistId ===
                                            playlist.id
                                                ? "bg-gray-100"
                                                : ""
                                        }`}
                                    >
                                        {editingPlaylistId ===
                                        playlist.id ? (
                                            <div className="flex gap-1 p-2">
                                                <input
                                                    autoFocus
                                                    value={
                                                        editingPlaylistName
                                                    }
                                                    onChange={(
                                                        event
                                                    ) =>
                                                        setEditingPlaylistName(
                                                            event
                                                                .target
                                                                .value
                                                        )
                                                    }
                                                    onKeyDown={(
                                                        event
                                                    ) => {
                                                        if (
                                                            event.key ===
                                                            "Enter"
                                                        ) {
                                                            renamePlaylist(
                                                                playlist.id
                                                            );
                                                        }

                                                        if (
                                                            event.key ===
                                                            "Escape"
                                                        ) {
                                                            setEditingPlaylistId(
                                                                null
                                                            );
                                                        }
                                                    }}
                                                    className="min-w-0 flex-1 rounded border px-2 py-1 text-sm"
                                                />

                                                <button
                                                    type="button"
                                                    disabled={busyItemId === playlist.id}
                                                    onClick={() =>
                                                        renamePlaylist(
                                                            playlist.id
                                                        )
                                                    }
                                                    className="flex items-center gap-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    {busyItemId === playlist.id && <Spinner className="h-3 w-3" />}
                                                    Save
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedPlaylistId(
                                                            playlist.id
                                                        );
                                                        setCurrentIndex(
                                                            0
                                                        );
                                                        setIsPlaying(
                                                            false
                                                        );
                                                    }}
                                                    className="min-w-0 flex-1 px-3 py-2 text-left text-sm"
                                                >
                                                    <span className="block truncate font-medium">
                                                        {
                                                            playlist.name
                                                        }
                                                    </span>

                                                    <span className="text-xs text-gray-500">
                                                        {
                                                            playlist
                                                                .tracks
                                                                .length
                                                        }{" "}
                                                        tracks
                                                    </span>
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setEditingPlaylistId(
                                                            playlist.id
                                                        );
                                                        setEditingPlaylistName(
                                                            playlist.name
                                                        );
                                                    }}
                                                    className="px-2 text-xs text-gray-500"
                                                >
                                                    Edit
                                                </button>

                                                <button
                                                    type="button"
                                                    disabled={busyItemId === playlist.id}
                                                    onClick={() =>
                                                        deletePlaylist(
                                                            playlist.id
                                                        )
                                                    }
                                                    className="flex items-center gap-1 px-2 text-xs text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    {busyItemId === playlist.id && <Spinner className="h-3 w-3" />}
                                                    Delete
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )
                            )}
                        </div>
                    </aside>

                    <main className="min-w-0">
                        {selectedPlaylist && (
                            <>
                                <div className="mb-2">
                                    <h2 className="text-base font-semibold">
                                        {
                                            selectedPlaylist.name
                                        }
                                    </h2>

                                    <p className="text-xs text-gray-500">
                                        {
                                            selectedPlaylist
                                                .tracks
                                                .length
                                        }{" "}
                                        tracks
                                    </p>
                                </div>

                                <div className="grid gap-4 @xl:grid-cols-[minmax(0,1fr)_240px]">
                                    <section className="rounded-xl border p-3">
                                        <div
                                            id="youtube-player"
                                            className="aspect-video w-full overflow-hidden rounded-lg bg-black"
                                        />

                                        <div className="mt-2">
                                            <h3 className="truncate text-sm font-semibold">
                                                {currentTrack?.title ??
                                                    "Nothing playing"}
                                            </h3>

                                            {currentTrack && (
                                                <p className="text-xs text-gray-500">
                                                    Track{" "}
                                                    {currentIndex +
                                                        1}{" "}
                                                    of{" "}
                                                    {
                                                        selectedPlaylist
                                                            .tracks
                                                            .length
                                                    }
                                                </p>
                                            )}
                                        </div>

                                        <div className="mt-2">
                                            <input
                                                type="range"
                                                min="0"
                                                max="100"
                                                value={
                                                    progress
                                                }
                                                onChange={
                                                    seek
                                                }
                                                className="w-full"
                                                disabled={
                                                    !playerReady
                                                }
                                            />

                                            <div className="flex justify-between text-xs text-gray-500">
                                                <span>
                                                    {formatTime(
                                                        currentTime
                                                    )}
                                                </span>

                                                <span>
                                                    {formatTime(
                                                        duration
                                                    )}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="mt-3 flex items-center justify-center gap-2">
                                            <button
                                                type="button"
                                                title={
                                                    shuffle
                                                        ? "Shuffle on"
                                                        : "Shuffle off"
                                                }
                                                aria-pressed={
                                                    shuffle
                                                }
                                                onClick={
                                                    toggleShuffle
                                                }
                                                disabled={
                                                    !selectedPlaylist ||
                                                    selectedPlaylist
                                                        .tracks
                                                        .length <
                                                        2
                                                }
                                                className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-30 ${
                                                    shuffle
                                                        ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                                                        : "text-[var(--muted)] hover:bg-[var(--panel-muted)]"
                                                }`}
                                            >
                                                <ShuffleIcon />
                                            </button>

                                            <button
                                                type="button"
                                                title="Previous"
                                                onClick={
                                                    playPrevious
                                                }
                                                disabled={
                                                    !currentTrack ||
                                                    (!shuffle &&
                                                        loopMode !==
                                                            "all" &&
                                                        currentIndex ===
                                                            0)
                                                }
                                                className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--panel-muted)] text-[var(--foreground)] transition-colors hover:bg-[var(--border)] disabled:opacity-30"
                                            >
                                                <PreviousIcon />
                                            </button>

                                            <button
                                                type="button"
                                                title={
                                                    isPlaying
                                                        ? "Pause"
                                                        : "Play"
                                                }
                                                onClick={
                                                    togglePlay
                                                }
                                                disabled={
                                                    !currentTrack ||
                                                    !playerReady
                                                }
                                                className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-md transition-transform hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
                                            >
                                                {isPlaying ? (
                                                    <PauseIcon />
                                                ) : (
                                                    <PlayIcon />
                                                )}
                                            </button>

                                            <button
                                                type="button"
                                                title="Next"
                                                onClick={
                                                    playNext
                                                }
                                                disabled={
                                                    !currentTrack ||
                                                    (!shuffle &&
                                                        loopMode !==
                                                            "all" &&
                                                        currentIndex >=
                                                            selectedPlaylist
                                                                .tracks
                                                                .length -
                                                                1)
                                                }
                                                className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--panel-muted)] text-[var(--foreground)] transition-colors hover:bg-[var(--border)] disabled:opacity-30"
                                            >
                                                <NextIcon />
                                            </button>

                                            <button
                                                type="button"
                                                title={`Repeat: ${loopMode}`}
                                                aria-pressed={
                                                    loopMode !==
                                                    "off"
                                                }
                                                onClick={
                                                    cycleLoopMode
                                                }
                                                className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                                                    loopMode !==
                                                    "off"
                                                        ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                                                        : "text-[var(--muted)] hover:bg-[var(--panel-muted)]"
                                                }`}
                                            >
                                                <RepeatIcon
                                                    mode={
                                                        loopMode
                                                    }
                                                />
                                            </button>
                                        </div>

                                        <div className="mt-3 flex items-center gap-2">
                                            <span className="text-xs">
                                                Volume
                                            </span>

                                            <input
                                                type="range"
                                                min="0"
                                                max="100"
                                                value={
                                                    volume
                                                }
                                                onChange={(
                                                    event
                                                ) =>
                                                    setVolume(
                                                        Number(
                                                            event
                                                                .target
                                                                .value
                                                        )
                                                    )
                                                }
                                                className="flex-1"
                                            />

                                            <span className="w-8 text-right text-xs text-gray-500">
                                                {volume}
                                            </span>
                                        </div>
                                    </section>

                                    <section className="rounded-xl border">
                                        <div className="border-b p-2">
                                            <h3 className="text-sm font-semibold">
                                                Tracks
                                            </h3>
                                        </div>

                                        {selectedPlaylist
                                            .tracks
                                            .length ===
                                        0 ? (
                                            <div className="p-4 text-center text-sm text-gray-500">
                                                No tracks yet.
                                            </div>
                                        ) : (
                                            <div className="max-h-[280px] overflow-y-auto">
                                                {selectedPlaylist.tracks.map(
                                                    (
                                                        track,
                                                        index
                                                    ) => (
                                                        <div
                                                            key={
                                                                track.id
                                                            }
                                                            className={`border-b p-2 ${
                                                                index ===
                                                                currentIndex
                                                                    ? "bg-gray-50"
                                                                    : ""
                                                            }`}
                                                        >
                                                            {editingTrackId ===
                                                            track.id ? (
                                                                <div className="flex gap-2">
                                                                    <input
                                                                        autoFocus
                                                                        value={
                                                                            editingTrackTitle
                                                                        }
                                                                        onChange={(
                                                                            event
                                                                        ) =>
                                                                            setEditingTrackTitle(
                                                                                event
                                                                                    .target
                                                                                    .value
                                                                            )
                                                                        }
                                                                        onKeyDown={(
                                                                            event
                                                                        ) => {
                                                                            if (
                                                                                event.key ===
                                                                                "Enter"
                                                                            ) {
                                                                                renameTrack(
                                                                                    selectedPlaylist.id,
                                                                                    track.id
                                                                                );
                                                                            }

                                                                            if (
                                                                                event.key ===
                                                                                "Escape"
                                                                            ) {
                                                                                setEditingTrackId(
                                                                                    null
                                                                                );
                                                                            }
                                                                        }}
                                                                        className="min-w-0 flex-1 rounded border px-2 py-1 text-sm"
                                                                    />

                                                                    <button
                                                                        type="button"
                                                                        disabled={busyItemId === track.id}
                                                                        onClick={() =>
                                                                            renameTrack(
                                                                                selectedPlaylist.id,
                                                                                track.id
                                                                            )
                                                                        }
                                                                        className="flex items-center gap-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                                                                    >
                                                                        {busyItemId === track.id && <Spinner className="h-3 w-3" />}
                                                                        Save
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-center gap-3">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            selectTrack(
                                                                                index
                                                                            )
                                                                        }
                                                                        className="min-w-0 flex-1 text-left"
                                                                    >
                                                                        <div className="truncate text-sm font-medium">
                                                                            {index +
                                                                                1}.{" "}
                                                                            {
                                                                                track.title
                                                                            }
                                                                        </div>
                                                                    </button>

                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setEditingTrackId(
                                                                                track.id
                                                                            );
                                                                            setEditingTrackTitle(
                                                                                track.title
                                                                            );
                                                                        }}
                                                                        className="text-xs text-gray-500"
                                                                    >
                                                                        Edit
                                                                    </button>

                                                                    <button
                                                                        type="button"
                                                                        disabled={busyItemId === track.id}
                                                                        onClick={() =>
                                                                            deleteTrack(
                                                                                selectedPlaylist.id,
                                                                                track.id
                                                                            )
                                                                        }
                                                                        className="flex items-center gap-1 text-xs text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                                                                    >
                                                                        {busyItemId === track.id && <Spinner className="h-3 w-3" />}
                                                                        Delete
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )
                                                )}
                                            </div>
                                        )}
                                    </section>
                                </div>
                            </>
                        )}
                    </main>
                </div>
            )}

            {/*
             * Create Playlist Modal
             */}
            {showCreatePlaylist && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] backdrop-blur-sm p-4">
                    <form
                        onSubmit={
                            createPlaylist
                        }
                        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
                    >
                        <h2 className="text-lg font-semibold">
                            Create Playlist
                        </h2>

                        <input
                            autoFocus
                            value={
                                newPlaylistName
                            }
                            onChange={(
                                event
                            ) =>
                                setNewPlaylistName(
                                    event
                                        .target
                                        .value
                                )
                            }
                            placeholder="Playlist name"
                            className="mt-4 w-full rounded-lg border px-3 py-2"
                        />

                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() =>
                                    setShowCreatePlaylist(
                                        false
                                    )
                                }
                                className="rounded-lg border px-4 py-2"
                            >
                                Cancel
                            </button>

                            <button
                                type="submit"
                                disabled={
                                    isSubmitting ||
                                    !newPlaylistName.trim()
                                }
                                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-white disabled:opacity-40"
                            >
                                Create
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/*
             * Add Track Modal
             */}
            {showAddTrack && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] backdrop-blur-sm p-4">
                    <form
                        onSubmit={addTrack}
                        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
                    >
                        <h2 className="text-lg font-semibold">
                            Add Track
                        </h2>

                        <input
                            autoFocus
                            value={trackTitle}
                            onChange={(
                                event
                            ) =>
                                setTrackTitle(
                                    event
                                        .target
                                        .value
                                )
                            }
                            placeholder="Track title"
                            className="mt-4 w-full rounded-lg border px-3 py-2"
                        />

                        <input
                            value={trackUrl}
                            onChange={(
                                event
                            ) =>
                                setTrackUrl(
                                    event
                                        .target
                                        .value
                                )
                            }
                            placeholder="YouTube video URL"
                            className="mt-3 w-full rounded-lg border px-3 py-2"
                        />

                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() =>
                                    setShowAddTrack(
                                        false
                                    )
                                }
                                className="rounded-lg border px-4 py-2"
                            >
                                Cancel
                            </button>

                            <button
                                type="submit"
                                disabled={
                                    isSubmitting ||
                                    !trackTitle.trim() ||
                                    !trackUrl.trim()
                                }
                                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-white disabled:opacity-40"
                            >
                                Add Track
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/*
             * Import YouTube Playlist Modal
             */}
            {showImport && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] backdrop-blur-sm p-4">
                    <form
                        onSubmit={
                            importPlaylist
                        }
                        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
                    >
                        <h2 className="text-lg font-semibold">
                            Import YouTube Playlist
                        </h2>

                        <p className="mt-1 text-sm text-gray-500">
                            Add every video from a
                            YouTube playlist to a
                            Tavern Radio playlist.
                        </p>

                        <label className="mt-4 block text-sm font-medium">
                            YouTube playlist URL
                        </label>

                        <input
                            autoFocus
                            value={
                                youtubePlaylistUrl
                            }
                            onChange={(
                                event
                            ) =>
                                setYoutubePlaylistUrl(
                                    event
                                        .target
                                        .value
                                )
                            }
                            placeholder="https://www.youtube.com/playlist?list=..."
                            className="mt-1 w-full rounded-lg border px-3 py-2"
                        />

                        {playlists.length >
                            0 && (
                            <>
                                <label className="mt-4 block text-sm font-medium">
                                    Add to playlist
                                </label>

                                <select
                                    value={
                                        importTargetId ??
                                        ""
                                    }
                                    onChange={(
                                        event
                                    ) =>
                                        setImportTargetId(
                                            event
                                                .target
                                                .value ||
                                                null
                                        )
                                    }
                                    className="mt-1 w-full rounded-lg border px-3 py-2"
                                >
                                    <option value="">
                                        Create a new playlist
                                    </option>

                                    {playlists.map(
                                        (
                                            playlist
                                        ) => (
                                            <option
                                                key={
                                                    playlist.id
                                                }
                                                value={
                                                    playlist.id
                                                }
                                            >
                                                {
                                                    playlist.name
                                                }
                                            </option>
                                        )
                                    )}
                                </select>
                            </>
                        )}

                        {!importTargetId && (
                            <>
                                <label className="mt-4 block text-sm font-medium">
                                    New playlist name
                                </label>

                                <input
                                    value={
                                        newImportPlaylistName
                                    }
                                    onChange={(
                                        event
                                    ) =>
                                        setNewImportPlaylistName(
                                            event
                                                .target
                                                .value
                                        )
                                    }
                                    placeholder="Study Mix"
                                    className="mt-1 w-full rounded-lg border px-3 py-2"
                                />
                            </>
                        )}

                        <div className="mt-5 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowImport(
                                        false
                                    );
                                    setYoutubePlaylistUrl(
                                        ""
                                    );
                                    setImportTargetId(
                                        null
                                    );
                                    setNewImportPlaylistName(
                                        ""
                                    );
                                }}
                                className="rounded-lg border px-4 py-2"
                            >
                                Cancel
                            </button>

                            <button
                                type="submit"
                                disabled={
                                    isSubmitting ||
                                    !youtubePlaylistUrl.trim() ||
                                    (!importTargetId &&
                                        !newImportPlaylistName.trim())
                                }
                                className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-white disabled:opacity-40"
                            >
                                {isSubmitting && <Spinner className="h-4 w-4" />}
                                {isSubmitting
                                    ? "Importing..."
                                    : "Import Playlist"}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}