"use client";

import { useEffect, useRef, useState } from "react";

type Track = {
    id: string;
    title: string;
    sourceUrl: string;
    thumbnail?: string | null;
    position: number;
};

type Playlist = {
    id: string;
    name: string;
    sourceUrl?: string | null;
    tracks: Track[];
};

type StoredState = {
    playlistId: string | null;
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

    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [selectedPlaylistId, setSelectedPlaylistId] =
        useState<string | null>(null);

    const [tracks, setTracks] = useState<Track[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);

    const [volume, setVolume] = useState(DEFAULT_VOLUME);

    const [isPlaying, setIsPlaying] = useState(false);
    const [isReady, setIsReady] = useState(false);

    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    const [showAddTrack, setShowAddTrack] = useState(false);
    const [showPlaylists, setShowPlaylists] = useState(false);
    const [showCreatePlaylist, setShowCreatePlaylist] =
        useState(false);

    const [titleInput, setTitleInput] = useState("");
    const [urlInput, setUrlInput] = useState("");

    const [playlistNameInput, setPlaylistNameInput] =
        useState("");

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const [error, setError] = useState<string | null>(null);

    const currentTrack = tracks[currentIndex];

    /*
     * ---------------------------------------------------------
     * LOAD LOCAL UI STATE
     * ---------------------------------------------------------
     */

    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);

        if (!stored) {
            return;
        }

        try {
            const parsed = JSON.parse(
                stored
            ) as StoredState;

            if (
                typeof parsed.playlistId === "string" ||
                parsed.playlistId === null
            ) {
                setSelectedPlaylistId(
                    parsed.playlistId
                );
            }

            if (
                typeof parsed.currentIndex ===
                "number"
            ) {
                setCurrentIndex(
                    Math.max(
                        parsed.currentIndex,
                        0
                    )
                );
            }

            if (
                typeof parsed.volume === "number" &&
                parsed.volume >= 0 &&
                parsed.volume <= 100
            ) {
                setVolume(parsed.volume);
            }
        } catch {
            localStorage.removeItem(STORAGE_KEY);
        }
    }, []);

    /*
     * ---------------------------------------------------------
     * SAVE LOCAL UI STATE
     * ---------------------------------------------------------
     *
     * IMPORTANT:
     * Tracks/playlists are NOT stored here anymore.
     * PostgreSQL is the source of truth for those.
     * ---------------------------------------------------------
     */

    useEffect(() => {
        const savedState: StoredState = {
            playlistId: selectedPlaylistId,
            currentIndex,
            volume,
        };

        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(savedState)
        );
    }, [
        selectedPlaylistId,
        currentIndex,
        volume,
    ]);

    /*
     * ---------------------------------------------------------
     * LOAD PLAYLISTS FROM DATABASE
     * ---------------------------------------------------------
     */

    useEffect(() => {
        async function loadPlaylists() {
            try {
                setIsLoading(true);
                setError(null);

                const response = await fetch(
                    "/api/music/playlists"
                );

                if (!response.ok) {
                    throw new Error(
                        `Failed to load playlists (${response.status})`
                    );
                }

                const data =
                    (await response.json()) as Playlist[];

                let loadedPlaylists = data;

                /*
                 * If the user has no playlists yet,
                 * create the default Tavern Radio playlist.
                 */

                if (loadedPlaylists.length === 0) {
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
                                    name: "Tavern Radio",
                                }),
                            }
                        );

                    if (!createResponse.ok) {
                        throw new Error(
                            "Failed to create Tavern Radio playlist."
                        );
                    }

                    const newPlaylist =
                        (await createResponse.json()) as Playlist;

                    loadedPlaylists = [
                        newPlaylist,
                    ];
                }

                setPlaylists(loadedPlaylists);

                /*
                 * Restore previous playlist if it still exists.
                 * Otherwise use the first playlist.
                 */

                const savedPlaylist =
                    loadedPlaylists.find(
                        (playlist) =>
                            playlist.id ===
                            selectedPlaylistId
                    );

                const playlistToUse =
                    savedPlaylist ??
                    loadedPlaylists[0];

                setSelectedPlaylistId(
                    playlistToUse.id
                );

                setTracks(
                    playlistToUse.tracks ?? []
                );

                /*
                 * Make sure the saved track index
                 * is still valid.
                 */

                setCurrentIndex((index) =>
                    Math.min(
                        index,
                        Math.max(
                            playlistToUse.tracks
                                .length - 1,
                            0
                        )
                    )
                );
            } catch (err) {
                console.error(
                    "Failed to load music playlists:",
                    err
                );

                setError(
                    err instanceof Error
                        ? err.message
                        : "Failed to load playlists."
                );
            } finally {
                setIsLoading(false);
            }
        }

        loadPlaylists();

        // We intentionally only want this to run once.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /*
     * ---------------------------------------------------------
     * SELECT PLAYLIST
     * ---------------------------------------------------------
     */

    const selectPlaylist = (
        playlist: Playlist
    ) => {
        setSelectedPlaylistId(
            playlist.id
        );

        setTracks(
            playlist.tracks ?? []
        );

        setCurrentIndex(0);
        setCurrentTime(0);
        setDuration(0);
        setIsPlaying(false);
        setIsReady(false);

        setShowPlaylists(false);
    };

    /*
     * ---------------------------------------------------------
     * CREATE PLAYLIST
     * ---------------------------------------------------------
     */

    const createPlaylist = async () => {
        const name =
            playlistNameInput.trim();

        if (!name) {
            return;
        }

        try {
            setIsSaving(true);
            setError(null);

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
                            name,
                        }),
                    }
                );

            if (!response.ok) {
                const data =
                    await response
                        .json()
                        .catch(() => null);

                throw new Error(
                    data?.error ||
                        "Failed to create playlist."
                );
            }

            const playlist =
                (await response.json()) as Playlist;

            setPlaylists((current) => [
                ...current,
                playlist,
            ]);

            selectPlaylist(playlist);

            setPlaylistNameInput("");
            setShowCreatePlaylist(false);
        } catch (err) {
            console.error(
                "Failed to create playlist:",
                err
            );

            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to create playlist."
            );
        } finally {
            setIsSaving(false);
        }
    };

    /*
     * ---------------------------------------------------------
     * DELETE PLAYLIST
     * ---------------------------------------------------------
     */

    const deletePlaylist = async (
        playlistId: string
    ) => {
        /*
         * Don't allow deleting the last playlist.
         * The app should always have somewhere to put music.
         */

        if (playlists.length <= 1) {
            return;
        }

        try {
            setIsSaving(true);
            setError(null);

            const response =
                await fetch(
                    `/api/music/${playlistId}`,
                    {
                        method: "DELETE",
                    }
                );

            if (!response.ok) {
                const data =
                    await response
                        .json()
                        .catch(() => null);

                throw new Error(
                    data?.error ||
                        "Failed to delete playlist."
                );
            }

            const remaining =
                playlists.filter(
                    (playlist) =>
                        playlist.id !==
                        playlistId
                );

            setPlaylists(remaining);

            /*
             * If we deleted the active playlist,
             * switch to another one.
             */

            if (
                selectedPlaylistId ===
                playlistId
            ) {
                const nextPlaylist =
                    remaining[0];

                setSelectedPlaylistId(
                    nextPlaylist.id
                );

                setTracks(
                    nextPlaylist.tracks ?? []
                );

                setCurrentIndex(0);
                setCurrentTime(0);
                setDuration(0);
                setIsPlaying(false);
            }
        } catch (err) {
            console.error(
                "Failed to delete playlist:",
                err
            );

            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to delete playlist."
            );
        } finally {
            setIsSaving(false);
        }
    };

    /*
     * ---------------------------------------------------------
     * LOAD YOUTUBE IFRAME API
     * ---------------------------------------------------------
     */

    useEffect(() => {
        if (window.YT?.Player) {
            return;
        }

        const existingScript =
            document.querySelector(
                'script[src="https://www.youtube.com/iframe_api"]'
            );

        const previousCallback =
            window.onYouTubeIframeAPIReady;

        window.onYouTubeIframeAPIReady =
            () => {
                previousCallback?.();
            };

        if (!existingScript) {
            const script =
                document.createElement(
                    "script"
                );

            script.src =
                "https://www.youtube.com/iframe_api";

            script.async = true;

            document.head.appendChild(
                script
            );
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
        if (isLoading) return;
        if (!currentTrack?.sourceUrl) return;
        if (!playerContainerRef.current)
            return;

        const videoId =
            getYouTubeVideoId(
                currentTrack.sourceUrl
            );

        if (!videoId) {
            return;
        }

        let cancelled = false;

        const createPlayer = () => {
            if (cancelled) return;
            if (!window.YT?.Player) return;
            if (!playerContainerRef.current)
                return;

            playerRef.current?.destroy();

            playerRef.current =
                new window.YT.Player(
                    playerContainerRef.current,
                    {
                        width: "200",
                        height: "200",
                        videoId,

                        playerVars: {
                            playsinline: 1,
                            controls: 0,
                            rel: 0,
                        },

                        events: {
                            onReady: (
                                event
                            ) => {
                                if (
                                    cancelled
                                ) {
                                    return;
                                }

                                event.target.setVolume(
                                    volume
                                );

                                setIsReady(
                                    true
                                );

                                setDuration(
                                    event.target.getDuration()
                                );
                            },

                            onStateChange: (
                                event
                            ) => {
                                if (
                                    cancelled
                                ) {
                                    return;
                                }

                                const playing =
                                    window.YT
                                        ?.PlayerState
                                        .PLAYING;

                                const paused =
                                    window.YT
                                        ?.PlayerState
                                        .PAUSED;

                                const ended =
                                    window.YT
                                        ?.PlayerState
                                        .ENDED;

                                if (
                                    event.data ===
                                    playing
                                ) {
                                    setIsPlaying(
                                        true
                                    );
                                }

                                if (
                                    event.data ===
                                    paused
                                ) {
                                    setIsPlaying(
                                        false
                                    );
                                }

                                if (
                                    event.data ===
                                    ended
                                ) {
                                    setIsPlaying(
                                        false
                                    );

                                    setCurrentIndex(
                                        (
                                            index
                                        ) =>
                                            tracks.length ===
                                            0
                                                ? 0
                                                : (
                                                      index +
                                                      1
                                                  ) %
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
        isLoading,
        currentTrack?.id,
    ]);

    /*
     * ---------------------------------------------------------
     * PLAYBACK PROGRESS
     * ---------------------------------------------------------
     */

    useEffect(() => {
        if (!isPlaying) {
            return;
        }

        const interval =
            window.setInterval(() => {
                const player =
                    playerRef.current;

                if (!player) {
                    return;
                }

                setCurrentTime(
                    player.getCurrentTime()
                );

                setDuration(
                    player.getDuration()
                );
            }, 500);

        return () =>
            window.clearInterval(
                interval
            );
    }, [isPlaying]);

    /*
     * ---------------------------------------------------------
     * VOLUME
     * ---------------------------------------------------------
     */

    useEffect(() => {
        playerRef.current?.setVolume(
            volume
        );
    }, [volume]);

    /*
     * ---------------------------------------------------------
     * PLAY / PAUSE
     * ---------------------------------------------------------
     */

    const togglePlay = () => {
        const player =
            playerRef.current;

        if (!player || !isReady) {
            return;
        }

        if (isPlaying) {
            player.pauseVideo();
        } else {
            player.playVideo();
        }
    };

    /*
     * ---------------------------------------------------------
     * PREVIOUS
     * ---------------------------------------------------------
     */

    const previousTrack = () => {
        if (tracks.length === 0) {
            return;
        }

        setCurrentIndex((index) =>
            index === 0
                ? tracks.length - 1
                : index - 1
        );

        setIsPlaying(false);
        setCurrentTime(0);
    };

    /*
     * ---------------------------------------------------------
     * NEXT
     * ---------------------------------------------------------
     */

    const nextTrack = () => {
        if (tracks.length === 0) {
            return;
        }

        setCurrentIndex(
            (index) =>
                (index + 1) % tracks.length
        );

        setIsPlaying(false);
        setCurrentTime(0);
    };

    /*
     * ---------------------------------------------------------
     * SELECT TRACK
     * ---------------------------------------------------------
     */

    const selectTrack = (
        index: number
    ) => {
        if (
            index === currentIndex
        ) {
            return;
        }

        setCurrentIndex(index);
        setCurrentTime(0);
        setIsPlaying(false);
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
            Number(
                event.target.value
            );

        setCurrentTime(seconds);

        playerRef.current?.seekTo(
            seconds,
            true
        );
    };

    /*
     * ---------------------------------------------------------
     * ADD TRACK TO DATABASE
     * ---------------------------------------------------------
     */

    const addTrack = async () => {
        if (!selectedPlaylistId) {
            return;
        }

        const videoId =
            getYouTubeVideoId(
                urlInput
            );

        if (!videoId) {
            return;
        }

        const title =
            titleInput.trim() ||
            "Untitled Tavern Track";

        try {
            setIsSaving(true);
            setError(null);

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
                            title,
                            sourceUrl:
                                urlInput.trim(),
                            thumbnail:
                                `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
                        }),
                    }
                );

            if (!response.ok) {
                const data =
                    await response
                        .json()
                        .catch(() => null);

                throw new Error(
                    data?.error ||
                        "Failed to add track."
                );
            }

            const newTrack =
                (await response.json()) as Track;

            setTracks((current) => [
                ...current,
                newTrack,
            ]);

            /*
             * Update the playlist copy in memory too.
             */

            setPlaylists((current) =>
                current.map(
                    (playlist) =>
                        playlist.id ===
                        selectedPlaylistId
                            ? {
                                  ...playlist,
                                  tracks: [
                                      ...playlist.tracks,
                                      newTrack,
                                  ],
                              }
                            : playlist
                )
            );

            /*
             * If this is the first song,
             * make it the current track.
             */

            if (tracks.length === 0) {
                setCurrentIndex(0);
            }

            setTitleInput("");
            setUrlInput("");
            setShowAddTrack(false);
        } catch (err) {
            console.error(
                "Failed to add track:",
                err
            );

            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to add track."
            );
        } finally {
            setIsSaving(false);
        }
    };

    /*
     * ---------------------------------------------------------
     * DELETE TRACK FROM DATABASE
     * ---------------------------------------------------------
     */

    const removeTrack = async (
        trackId: string,
        index: number
    ) => {
        if (!selectedPlaylistId) {
            return;
        }

        try {
            setIsSaving(true);
            setError(null);

            const response =
                await fetch(
                    `/api/music/${selectedPlaylistId}/tracks?trackId=${encodeURIComponent(
                        trackId
                    )}`,
                    {
                        method: "DELETE",
                    }
                );

            if (!response.ok) {
                const data =
                    await response
                        .json()
                        .catch(() => null);

                throw new Error(
                    data?.error ||
                        "Failed to remove track."
                );
            }

            const nextTracks =
                tracks.filter(
                    (_, i) => i !== index
                );

            setTracks(nextTracks);

            /*
             * Keep playlist state synchronized.
             */

            setPlaylists((current) =>
                current.map(
                    (playlist) =>
                        playlist.id ===
                        selectedPlaylistId
                            ? {
                                  ...playlist,
                                  tracks:
                                      nextTracks,
                              }
                            : playlist
                )
            );

            /*
             * Fix current track index.
             */

            setCurrentIndex(
                (current) => {
                    if (
                        nextTracks.length ===
                        0
                    ) {
                        return 0;
                    }

                    if (
                        index < current
                    ) {
                        return current - 1;
                    }

                    if (
                        index === current &&
                        current >=
                            nextTracks.length
                    ) {
                        return (
                            nextTracks.length -
                            1
                        );
                    }

                    return current;
                }
            );

            setIsPlaying(false);
            setCurrentTime(0);
        } catch (err) {
            console.error(
                "Failed to remove track:",
                err
            );

            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to remove track."
            );
        } finally {
            setIsSaving(false);
        }
    };

    const progress =
        duration > 0
            ? (currentTime / duration) *
              100
            : 0;

    const currentPlaylist =
        playlists.find(
            (playlist) =>
                playlist.id ===
                selectedPlaylistId
        );

    /*
     * ---------------------------------------------------------
     * LOADING STATE
     * ---------------------------------------------------------
     */

    if (isLoading) {
        return (
            <section className="w-full max-w-md overflow-hidden rounded-2xl border border-amber-900/60 bg-slate-900/90 shadow-lg">
                <div className="px-5 py-8 text-center">
                    <p className="text-sm text-slate-400">
                        🎻 The bard is tuning his
                        instruments...
                    </p>
                </div>
            </section>
        );
    }

    return (
        <section className="w-full max-w-md overflow-hidden rounded-2xl border border-amber-900/60 bg-slate-900/90 shadow-lg">

            {/* -------------------------------------------------
                HEADER
            ------------------------------------------------- */}

            <div className="border-b border-amber-900/40 bg-amber-950/20 px-5 py-4">

                <div className="flex items-center justify-between">

                    <div className="min-w-0">

                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-500">
                            Tavern Radio
                        </p>

                        <h2 className="mt-1 truncate text-lg font-bold text-slate-100">
                            🎵 Music for your quest
                        </h2>

                    </div>

                    <button
                        type="button"
                        onClick={() =>
                            setShowAddTrack(
                                (open) =>
                                    !open
                            )
                        }
                        disabled={
                            !selectedPlaylistId
                        }
                        className="shrink-0 rounded-lg border border-amber-800/60 px-3 py-2 text-xs font-semibold text-amber-300 transition hover:bg-amber-950/40 disabled:opacity-30"
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
                    ref={
                        playerContainerRef
                    }
                    className="h-[200px] w-[200px]"
                />
            </div>

            {/* -------------------------------------------------
                PLAYLIST SELECTOR
            ------------------------------------------------- */}

            <div className="border-b border-slate-800 px-5 py-3">

                <div className="flex items-center justify-between">

                    <button
                        type="button"
                        onClick={() =>
                            setShowPlaylists(
                                (open) =>
                                    !open
                            )
                        }
                        className="flex min-w-0 items-center gap-2 text-left"
                    >
                        <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                            Playlist
                        </span>

                        <span className="truncate text-sm font-semibold text-amber-300">
                            {currentPlaylist
                                ?.name ??
                                "Tavern Radio"}
                        </span>

                        <span className="text-xs text-slate-600">
                            {showPlaylists
                                ? "▲"
                                : "▼"}
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={() =>
                            setShowCreatePlaylist(
                                (open) =>
                                    !open
                            )
                        }
                        className="text-xs text-amber-500 transition hover:text-amber-300"
                    >
                        + New
                    </button>

                </div>

                {showPlaylists && (
                    <div className="mt-3 space-y-1">

                        {playlists.map(
                            (playlist) => (
                                <div
                                    key={
                                        playlist.id
                                    }
                                    className={`group flex items-center gap-2 rounded-lg px-3 py-2 ${
                                        playlist.id ===
                                        selectedPlaylistId
                                            ? "bg-amber-950/40"
                                            : "hover:bg-slate-800/50"
                                    }`}
                                >

                                    <button
                                        type="button"
                                        onClick={() =>
                                            selectPlaylist(
                                                playlist
                                            )
                                        }
                                        className="min-w-0 flex-1 text-left"
                                    >
                                        <p
                                            className={`truncate text-sm ${
                                                playlist.id ===
                                                selectedPlaylistId
                                                    ? "font-semibold text-amber-300"
                                                    : "text-slate-300"
                                            }`}
                                        >
                                            {playlist.name}
                                        </p>

                                        <p className="text-[10px] text-slate-600">
                                            {
                                                playlist
                                                    .tracks
                                                    .length
                                            }{" "}
                                            tracks
                                        </p>
                                    </button>

                                    {playlists.length >
                                        1 && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                deletePlaylist(
                                                    playlist.id
                                                )
                                            }
                                            disabled={
                                                isSaving
                                            }
                                            className="text-xs text-slate-700 opacity-0 transition hover:text-red-400 group-hover:opacity-100 disabled:opacity-30"
                                            aria-label={`Delete ${playlist.name}`}
                                        >
                                            ✕
                                        </button>
                                    )}

                                </div>
                            )
                        )}

                    </div>
                )}

                {showCreatePlaylist && (
                    <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3">

                        <input
                            value={
                                playlistNameInput
                            }
                            onChange={(
                                event
                            ) =>
                                setPlaylistNameInput(
                                    event.target
                                        .value
                                )
                            }
                            placeholder="Playlist name"
                            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-amber-600"
                            onKeyDown={(
                                event
                            ) => {
                                if (
                                    event.key ===
                                    "Enter"
                                ) {
                                    createPlaylist();
                                }
                            }}
                        />

                        <div className="mt-2 flex gap-2">

                            <button
                                type="button"
                                onClick={() => {
                                    setShowCreatePlaylist(
                                        false
                                    );
                                    setPlaylistNameInput(
                                        ""
                                    );
                                }}
                                className="flex-1 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-400 hover:bg-slate-800"
                            >
                                Cancel
                            </button>

                            <button
                                type="button"
                                onClick={
                                    createPlaylist
                                }
                                disabled={
                                    !playlistNameInput.trim() ||
                                    isSaving
                                }
                                className="flex-1 rounded-lg bg-amber-700 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-40"
                            >
                                Create
                            </button>

                        </div>

                    </div>
                )}

            </div>

            {/* -------------------------------------------------
                ERROR
            ------------------------------------------------- */}

            {error && (
                <div className="border-b border-red-900/40 bg-red-950/20 px-5 py-3">
                    <p className="text-xs text-red-400">
                        {error}
                    </p>
                </div>
            )}

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
                    onChange={
                        handleSeek
                    }
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

            {/* -------------------------------------------------
                CONTROLS
            ------------------------------------------------- */}

            <div className="px-5 py-5">

                <div className="flex items-center justify-center gap-5">

                    <button
                        type="button"
                        onClick={
                            previousTrack
                        }
                        disabled={
                            tracks.length ===
                            0
                        }
                        className="rounded-full p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white disabled:opacity-30"
                        aria-label="Previous track"
                    >
                        ⏮
                    </button>

                    <button
                        type="button"
                        onClick={
                            togglePlay
                        }
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
                        onClick={
                            nextTrack
                        }
                        disabled={
                            tracks.length ===
                            0
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
                        value={
                            titleInput
                        }
                        onChange={(
                            event
                        ) =>
                            setTitleInput(
                                event.target
                                    .value
                            )
                        }
                        placeholder="Track name"
                        className="mb-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-amber-600"
                    />

                    <input
                        value={
                            urlInput
                        }
                        onChange={(
                            event
                        ) =>
                            setUrlInput(
                                event.target
                                    .value
                            )
                        }
                        placeholder="Paste YouTube URL"
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-amber-600"
                    />

                    <div className="mt-3 flex gap-2">

                        <button
                            type="button"
                            onClick={() => {
                                setShowAddTrack(
                                    false
                                );
                                setTitleInput(
                                    ""
                                );
                                setUrlInput(
                                    ""
                                );
                            }}
                            className="flex-1 rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-400 hover:bg-slate-800"
                        >
                            Cancel
                        </button>

                        <button
                            type="button"
                            onClick={
                                addTrack
                            }
                            disabled={
                                !getYouTubeVideoId(
                                    urlInput
                                ) ||
                                isSaving
                            }
                            className="flex-1 rounded-lg bg-amber-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {isSaving
                                ? "Saving..."
                                : "Add Track"}
                        </button>

                    </div>

                    <p className="mt-3 text-[10px] leading-4 text-slate-600">
                        Paste a YouTube video URL.
                        The video must allow
                        embedding.
                    </p>

                </div>
            )}

            {/* -------------------------------------------------
                TRACK LIST
            ------------------------------------------------- */}

            <div className="border-t border-slate-800">

                <div className="flex items-center justify-between px-5 py-3">

                    <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                        {currentPlaylist
                            ?.name ??
                            "Playlist"}
                    </p>

                    <span className="text-xs text-slate-600">
                        {tracks.length}{" "}
                        {tracks.length === 1
                            ? "track"
                            : "tracks"}
                    </span>

                </div>

                <div className="max-h-48 overflow-y-auto">

                    {tracks.map(
                        (
                            track,
                            index
                        ) => (
                            <div
                                key={
                                    track.id
                                }
                                className={`group flex items-center gap-3 px-5 py-3 transition ${
                                    index ===
                                    currentIndex
                                        ? "bg-amber-950/30"
                                        : "hover:bg-slate-800/50"
                                }`}
                            >

                                <button
                                    type="button"
                                    onClick={() =>
                                        selectTrack(
                                            index
                                        )
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
                                        {
                                            track.title
                                        }
                                    </p>
                                </button>

                                <button
                                    type="button"
                                    onClick={() =>
                                        removeTrack(
                                            track.id,
                                            index
                                        )
                                    }
                                    disabled={
                                        isSaving
                                    }
                                    className="text-xs text-slate-600 opacity-0 transition hover:text-red-400 group-hover:opacity-100 disabled:opacity-30"
                                    aria-label={`Remove ${track.title}`}
                                >
                                    ✕
                                </button>

                            </div>
                        )
                    )}

                    {tracks.length ===
                        0 && (
                        <p className="px-5 pb-5 text-center text-sm text-slate-500">
                            The bard hasn't
                            arrived yet.
                            <br />
                            Add a song to
                            start the music.
                        </p>
                    )}

                </div>

            </div>

            {/* -------------------------------------------------
                FOOTER
            ------------------------------------------------- */}

            <div className="border-t border-amber-900/30 bg-amber-950/10 px-5 py-3">

                <p className="text-center text-[10px] text-slate-600">
                    🎻 The tavern bard plays
                    through YouTube
                </p>

            </div>

        </section>
    );
}