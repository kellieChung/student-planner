"use client";

import { useEffect, useRef, useState } from "react";

type Track = {
    id: string;
    title: string;
    sourceUrl: string;
    thumbnail: string | null;
};

type Playlist = {
    id: string;
    name: string;
    sourceUrl: string | null;
    tracks: Track[];
};

type YouTubePlayer = {
    playVideo: () => void;
    pauseVideo: () => void;
    nextVideo?: () => void;
    previousVideo?: () => void;
    seekTo: (
        seconds: number,
        allowSeekAhead: boolean
    ) => void;
    setVolume: (volume: number) => void;
    getCurrentTime: () => number;
    getDuration: () => number;
    destroy: () => void;
};

declare global {
    interface Window {
        YT: {
            Player: new (
                element: HTMLElement | string,
                options: {
                    videoId: string;
                    playerVars?: Record<string, number>;
                    events?: {
                        onReady?: () => void;
                        onStateChange?: (
                            event: {
                                data: number;
                            }
                        ) => void;
                    };
                }
            ) => YouTubePlayer;
            PlayerState: {
                PLAYING: number;
                PAUSED: number;
                ENDED: number;
            };
        };

        onYouTubeIframeAPIReady?: () => void;
    }
}

function getYouTubeVideoId(
    input: string
): string | null {
    try {
        const url = new URL(input.trim());

        if (url.hostname === "youtu.be") {
            return url.pathname.slice(1) || null;
        }

        if (
            url.hostname.includes("youtube.com")
        ) {
            return url.searchParams.get("v");
        }

        return null;
    } catch {
        return null;
    }
}

export default function MusicPlayer() {
    const [playlists, setPlaylists] =
        useState<Playlist[]>([]);

    const [selectedPlaylistId, setSelectedPlaylistId] =
        useState<string | null>(null);

    const [currentIndex, setCurrentIndex] =
        useState(0);

    const [volume, setVolume] =
        useState(70);

    const [isPlaying, setIsPlaying] =
        useState(false);

    const [isReady, setIsReady] =
        useState(false);

    const [currentTime, setCurrentTime] =
        useState(0);

    const [duration, setDuration] =
        useState(0);

    const [isLoading, setIsLoading] =
        useState(true);

    const [error, setError] =
        useState<string | null>(null);

    const [showAddTrack, setShowAddTrack] =
        useState(false);

    const [showImport, setShowImport] =
        useState(false);

    const [showCreatePlaylist, setShowCreatePlaylist] =
        useState(false);

    const [newPlaylistName, setNewPlaylistName] =
        useState("");

    const [newTrackTitle, setNewTrackTitle] =
        useState("");

    const [newTrackUrl, setNewTrackUrl] =
        useState("");

    const [youtubePlaylistUrl, setYoutubePlaylistUrl] =
        useState("");

    const [isSubmitting, setIsSubmitting] =
        useState(false);

    const playerRef =
        useRef<YouTubePlayer | null>(null);

    const playerContainerRef =
        useRef<HTMLDivElement | null>(null);

    const progressIntervalRef =
        useRef<ReturnType<typeof setInterval> | null>(
            null
        );

    const selectedPlaylist =
        playlists.find(
            (playlist) =>
                playlist.id === selectedPlaylistId
        ) ?? null;

    const tracks =
        selectedPlaylist?.tracks ?? [];

    const currentTrack =
        tracks[currentIndex] ?? null;

    /*
     * Load playlists from the database.
     */
    async function loadPlaylists() {
        try {
            setIsLoading(true);
            setError(null);

            const response = await fetch(
                "/api/music/playlists"
            );

            if (!response.ok) {
                throw new Error(
                    "Failed to load playlists."
                );
            }

            const data =
                (await response.json()) as Playlist[];

            setPlaylists(data);

            setSelectedPlaylistId(
                (current) =>
                    current ??
                    data[0]?.id ??
                    null
            );
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Failed to load playlists."
            );
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        loadPlaylists();
    }, []);

    /*
     * Load the YouTube IFrame API.
     */
    useEffect(() => {
        if (window.YT) {
            setIsReady(true);
            return;
        }

        const existingScript =
            document.querySelector(
                'script[src="https://www.youtube.com/iframe_api"]'
            );

        if (existingScript) {
            window.onYouTubeIframeAPIReady =
                () => setIsReady(true);

            return;
        }

        const script =
            document.createElement("script");

        script.src =
            "https://www.youtube.com/iframe_api";

        script.async = true;

        window.onYouTubeIframeAPIReady =
            () => setIsReady(true);

        document.body.appendChild(script);

        return () => {
            window.onYouTubeIframeAPIReady =
                undefined;
        };
    }, []);

    /*
     * Create/recreate the YouTube player
     * whenever the current track changes.
     */
    useEffect(() => {
        if (
            !isReady ||
            !currentTrack ||
            !playerContainerRef.current
        ) {
            return;
        }

        const videoId =
            getYouTubeVideoId(
                currentTrack.sourceUrl
            );

        if (!videoId) {
            return;
        }

        playerRef.current?.destroy();

        playerRef.current =
            new window.YT.Player(
                playerContainerRef.current,
                {
                    videoId,

                    playerVars: {
                        autoplay: 0,
                        controls: 0,
                        modestbranding: 1,
                        rel: 0,
                    },

                    events: {
                        onReady: () => {
                            playerRef.current?.setVolume(
                                volume
                            );

                            setDuration(
                                playerRef.current?.getDuration() ??
                                    0
                            );
                        },

                        onStateChange: (event) => {
                            if (
                                event.data ===
                                window.YT.PlayerState.PLAYING
                            ) {
                                setIsPlaying(true);
                            }

                            if (
                                event.data ===
                                window.YT.PlayerState.PAUSED
                            ) {
                                setIsPlaying(false);
                            }

                            if (
                                event.data ===
                                window.YT.PlayerState.ENDED
                            ) {
                                playNext();
                            }
                        },
                    },
                }
            );

        return () => {
            playerRef.current?.destroy();
            playerRef.current = null;
        };
    }, [
        isReady,
        currentTrack?.id,
    ]);

    /*
     * Progress timer.
     */
    useEffect(() => {
        if (progressIntervalRef.current) {
            clearInterval(
                progressIntervalRef.current
            );
        }

        if (!isPlaying) {
            return;
        }

        progressIntervalRef.current =
            setInterval(() => {
                if (!playerRef.current) {
                    return;
                }

                setCurrentTime(
                    playerRef.current.getCurrentTime()
                );

                setDuration(
                    playerRef.current.getDuration()
                );
            }, 500);

        return () => {
            if (progressIntervalRef.current) {
                clearInterval(
                    progressIntervalRef.current
                );
            }
        };
    }, [isPlaying]);

    /*
     * Change playlist.
     */
    function selectPlaylist(
        playlistId: string
    ) {
        setSelectedPlaylistId(
            playlistId
        );
        setCurrentIndex(0);
        setIsPlaying(false);
        setCurrentTime(0);
    }

    /*
     * Play/pause.
     */
    function togglePlay() {
        if (!playerRef.current) {
            return;
        }

        if (isPlaying) {
            playerRef.current.pauseVideo();
        } else {
            playerRef.current.playVideo();
        }
    }

    /*
     * Previous track.
     */
    function playPrevious() {
        if (tracks.length === 0) {
            return;
        }

        setCurrentIndex((current) =>
            current <= 0
                ? tracks.length - 1
                : current - 1
        );
    }

    /*
     * Next track.
     */
    function playNext() {
        if (tracks.length === 0) {
            return;
        }

        setCurrentIndex((current) =>
            current >= tracks.length - 1
                ? 0
                : current + 1
        );
    }

    /*
     * Seek.
     */
    function seek(
        event: React.ChangeEvent<HTMLInputElement>
    ) {
        const value =
            Number(event.target.value);

        setCurrentTime(value);

        playerRef.current?.seekTo(
            value,
            true
        );
    }

    /*
     * Volume.
     */
    function changeVolume(
        event: React.ChangeEvent<HTMLInputElement>
    ) {
        const value =
            Number(event.target.value);

        setVolume(value);

        playerRef.current?.setVolume(
            value
        );

        localStorage.setItem(
            "tavern_radio_volume",
            String(value)
        );
    }

    /*
     * Create playlist.
     */
    async function createPlaylist(
        event: React.FormEvent
    ) {
        event.preventDefault();

        if (!newPlaylistName.trim()) {
            return;
        }

        try {
            setIsSubmitting(true);
            setError(null);

            const response = await fetch(
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
                data,
            ]);

            setSelectedPlaylistId(
                data.id
            );

            setNewPlaylistName("");
            setShowCreatePlaylist(false);
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Failed to create playlist."
            );
        } finally {
            setIsSubmitting(false);
        }
    }

    /*
     * Add one track.
     */
    async function addTrack(
        event: React.FormEvent
    ) {
        event.preventDefault();

        if (
            !selectedPlaylistId ||
            !newTrackTitle.trim() ||
            !newTrackUrl.trim()
        ) {
            return;
        }

        const videoId =
            getYouTubeVideoId(
                newTrackUrl
            );

        if (!videoId) {
            setError(
                "Please enter a valid YouTube video URL."
            );
            return;
        }

        try {
            setIsSubmitting(true);
            setError(null);

            const response = await fetch(
                `/api/music/${selectedPlaylistId}/tracks`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json",
                    },
                    body: JSON.stringify({
                        title:
                            newTrackTitle.trim(),
                        sourceUrl:
                            newTrackUrl.trim(),
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

            setNewTrackTitle("");
            setNewTrackUrl("");
            setShowAddTrack(false);
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Failed to add track."
            );
        } finally {
            setIsSubmitting(false);
        }
    }

    /*
     * Import a complete YouTube playlist
     * into the selected Student Planner playlist.
     */
    async function importYouTubePlaylist(
        event: React.FormEvent
    ) {
        event.preventDefault();

        if (
            !selectedPlaylistId ||
            !youtubePlaylistUrl.trim()
        ) {
            return;
        }

        try {
            setIsSubmitting(true);
            setError(null);

            const response = await fetch(
                "/api/music/import-youtube-playlist",
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json",
                    },
                    body: JSON.stringify({
                        playlistId:
                            selectedPlaylistId,

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
                        "Failed to import playlist."
                );
            }

            setPlaylists((current) =>
                current.map((playlist) =>
                    playlist.id ===
                    selectedPlaylistId
                        ? data.playlist
                        : playlist
                )
            );

            setYoutubePlaylistUrl("");
            setShowImport(false);
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Failed to import playlist."
            );
        } finally {
            setIsSubmitting(false);
        }
    }

    /*
     * Delete a track.
     */
    async function removeTrack(
        trackId: string
    ) {
        if (!selectedPlaylistId) {
            return;
        }

        try {
            const response = await fetch(
                `/api/music/${selectedPlaylistId}/tracks`,
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
                current.map((playlist) => {
                    if (
                        playlist.id !==
                        selectedPlaylistId
                    ) {
                        return playlist;
                    }

                    return {
                        ...playlist,

                        tracks:
                            playlist.tracks.filter(
                                (track) =>
                                    track.id !==
                                    trackId
                            ),
                    };
                })
            );

            setCurrentIndex(0);
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Failed to delete track."
            );
        }
    }

    /*
     * Delete playlist.
     */
    async function deletePlaylist(
        playlistId: string
    ) {
        try {
            const response = await fetch(
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

            setPlaylists((current) =>
                current.filter(
                    (playlist) =>
                        playlist.id !==
                        playlistId
                )
            );

            if (
                selectedPlaylistId ===
                playlistId
            ) {
                setSelectedPlaylistId(
                    playlists.find(
                        (playlist) =>
                            playlist.id !==
                            playlistId
                    )?.id ?? null
                );

                setCurrentIndex(0);
            }
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Failed to delete playlist."
            );
        }
    }

    /*
     * Load saved volume.
     */
    useEffect(() => {
        const savedVolume =
            localStorage.getItem(
                "tavern_radio_volume"
            );

        if (savedVolume) {
            const value =
                Number(savedVolume);

            if (
                Number.isFinite(value) &&
                value >= 0 &&
                value <= 100
            ) {
                setVolume(value);
            }
        }
    }, []);

    function formatTime(
        seconds: number
    ) {
        if (!Number.isFinite(seconds)) {
            return "0:00";
        }

        const minutes =
            Math.floor(seconds / 60);

        const remainingSeconds =
            Math.floor(seconds % 60);

        return `${minutes}:${String(
            remainingSeconds
        ).padStart(2, "0")}`;
    }

    if (isLoading) {
        return (
            <div className="rounded-xl border p-6">
                Loading Tavern Radio...
            </div>
        );
    }

    return (
        <div className="space-y-6 rounded-xl border p-6">
            {/* Hidden YouTube player */}
            <div
                ref={playerContainerRef}
                className="pointer-events-none absolute -left-[9999px] h-[200px] w-[200px]"
            />

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold">
                        Tavern Radio
                    </h2>

                    <p className="text-sm opacity-60">
                        Your study soundtrack
                    </p>
                </div>

                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() =>
                            setShowCreatePlaylist(
                                true
                            )
                        }
                        className="rounded-lg border px-3 py-2 text-sm"
                    >
                        + Playlist
                    </button>

                    <button
                        type="button"
                        onClick={() =>
                            setShowAddTrack(
                                !showAddTrack
                            )
                        }
                        disabled={
                            !selectedPlaylistId
                        }
                        className="rounded-lg border px-3 py-2 text-sm"
                    >
                        + Track
                    </button>

                    <button
                        type="button"
                        onClick={() =>
                            setShowImport(
                                !showImport
                            )
                        }
                        disabled={
                            !selectedPlaylistId
                        }
                        className="rounded-lg border px-3 py-2 text-sm"
                    >
                        Import Playlist
                    </button>
                </div>
            </div>

            {error && (
                <div className="rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-sm">
                    {error}
                </div>
            )}

            {/* Playlist selector */}
            <div className="flex gap-2 overflow-x-auto">
                {playlists.map((playlist) => (
                    <button
                        key={playlist.id}
                        type="button"
                        onClick={() =>
                            selectPlaylist(
                                playlist.id
                            )
                        }
                        className={`shrink-0 rounded-lg px-4 py-2 text-sm ${
                            selectedPlaylistId ===
                            playlist.id
                                ? "bg-foreground text-background"
                                : "border"
                        }`}
                    >
                        {playlist.name}
                    </button>
                ))}
            </div>

            {/* Create playlist */}
            {showCreatePlaylist && (
                <form
                    onSubmit={createPlaylist}
                    className="space-y-3 rounded-lg border p-4"
                >
                    <input
                        value={newPlaylistName}
                        onChange={(event) =>
                            setNewPlaylistName(
                                event.target.value
                            )
                        }
                        placeholder="Playlist name"
                        className="w-full rounded-lg border bg-transparent px-3 py-2"
                        autoFocus
                    />

                    <div className="flex gap-2">
                        <button
                            type="submit"
                            disabled={
                                isSubmitting
                            }
                            className="rounded-lg border px-4 py-2"
                        >
                            Create
                        </button>

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
                    </div>
                </form>
            )}

            {/* Import YouTube playlist */}
            {showImport && (
                <form
                    onSubmit={
                        importYouTubePlaylist
                    }
                    className="space-y-3 rounded-lg border p-4"
                >
                    <div>
                        <h3 className="font-medium">
                            Import YouTube Playlist
                        </h3>

                        <p className="text-sm opacity-60">
                            Every video will be added
                            to{" "}
                            <strong>
                                {
                                    selectedPlaylist?.name
                                }
                            </strong>
                            .
                        </p>
                    </div>

                    <input
                        type="url"
                        value={
                            youtubePlaylistUrl
                        }
                        onChange={(event) =>
                            setYoutubePlaylistUrl(
                                event.target.value
                            )
                        }
                        placeholder="https://www.youtube.com/playlist?list=..."
                        className="w-full rounded-lg border bg-transparent px-3 py-2"
                        autoFocus
                    />

                    <div className="flex gap-2">
                        <button
                            type="submit"
                            disabled={
                                isSubmitting
                            }
                            className="rounded-lg border px-4 py-2"
                        >
                            {isSubmitting
                                ? "Importing..."
                                : "Import Playlist"}
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                setShowImport(
                                    false
                                );
                                setYoutubePlaylistUrl(
                                    ""
                                );
                            }}
                            className="rounded-lg border px-4 py-2"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            )}

            {/* Add individual track */}
            {showAddTrack && (
                <form
                    onSubmit={addTrack}
                    className="space-y-3 rounded-lg border p-4"
                >
                    <input
                        value={newTrackTitle}
                        onChange={(event) =>
                            setNewTrackTitle(
                                event.target.value
                            )
                        }
                        placeholder="Track title"
                        className="w-full rounded-lg border bg-transparent px-3 py-2"
                    />

                    <input
                        type="url"
                        value={newTrackUrl}
                        onChange={(event) =>
                            setNewTrackUrl(
                                event.target.value
                            )
                        }
                        placeholder="YouTube video URL"
                        className="w-full rounded-lg border bg-transparent px-3 py-2"
                    />

                    <button
                        type="submit"
                        disabled={
                            isSubmitting
                        }
                        className="rounded-lg border px-4 py-2"
                    >
                        Add Track
                    </button>
                </form>
            )}

            {/* Now Playing */}
            <div className="rounded-xl border p-5">
                {currentTrack ? (
                    <>
                        <p className="text-xs uppercase tracking-wide opacity-50">
                            Now Playing
                        </p>

                        <h3 className="mt-1 text-lg font-medium">
                            {currentTrack.title}
                        </h3>

                        <p className="text-sm opacity-50">
                            {selectedPlaylist?.name}
                        </p>

                        <div className="mt-5 flex items-center gap-3">
                            <span className="text-xs opacity-50">
                                {formatTime(
                                    currentTime
                                )}
                            </span>

                            <input
                                type="range"
                                min="0"
                                max={
                                    duration || 0
                                }
                                step="0.1"
                                value={
                                    Math.min(
                                        currentTime,
                                        duration ||
                                            0
                                    )
                                }
                                onChange={
                                    seek
                                }
                                className="flex-1"
                            />

                            <span className="text-xs opacity-50">
                                {formatTime(
                                    duration
                                )}
                            </span>
                        </div>

                        <div className="mt-5 flex items-center justify-center gap-5">
                            <button
                                type="button"
                                onClick={
                                    playPrevious
                                }
                                className="text-lg"
                            >
                                ⏮
                            </button>

                            <button
                                type="button"
                                onClick={
                                    togglePlay
                                }
                                className="rounded-full border px-5 py-3"
                            >
                                {isPlaying
                                    ? "⏸"
                                    : "▶"}
                            </button>

                            <button
                                type="button"
                                onClick={
                                    playNext
                                }
                                className="text-lg"
                            >
                                ⏭
                            </button>
                        </div>

                        <div className="mt-5 flex items-center gap-3">
                            <span className="text-sm">
                                🔊
                            </span>

                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={
                                    volume
                                }
                                onChange={
                                    changeVolume
                                }
                                className="w-32"
                            />
                        </div>
                    </>
                ) : (
                    <div className="py-8 text-center">
                        <p className="text-lg">
                            The bard hasn't arrived yet.
                        </p>

                        <p className="mt-1 text-sm opacity-50">
                            Add a track or import a
                            YouTube playlist.
                        </p>
                    </div>
                )}
            </div>

            {/* Track list */}
            {selectedPlaylist && (
                <div>
                    <div className="mb-3 flex items-center justify-between">
                        <h3 className="font-medium">
                            {selectedPlaylist.name}
                        </h3>

                        <button
                            type="button"
                            onClick={() =>
                                deletePlaylist(
                                    selectedPlaylist.id
                                )
                            }
                            className="text-sm opacity-50 hover:opacity-100"
                        >
                            Delete playlist
                        </button>
                    </div>

                    <div className="space-y-2">
                        {tracks.map(
                            (
                                track,
                                index
                            ) => (
                                <div
                                    key={
                                        track.id
                                    }
                                    className={`flex items-center gap-3 rounded-lg border p-3 ${
                                        index ===
                                        currentIndex
                                            ? "bg-muted/40"
                                            : ""
                                    }`}
                                >
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setCurrentIndex(
                                                index
                                            );
                                            setIsPlaying(
                                                false
                                            );
                                        }}
                                        className="min-w-0 flex-1 text-left"
                                    >
                                        <p className="truncate text-sm">
                                            {
                                                track.title
                                            }
                                        </p>

                                        <p className="text-xs opacity-40">
                                            Track{" "}
                                            {index +
                                                1}
                                        </p>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() =>
                                            removeTrack(
                                                track.id
                                            )
                                        }
                                        className="text-xs opacity-40 hover:opacity-100"
                                    >
                                        Delete
                                    </button>
                                </div>
                            )
                        )}
                    </div>
                </div>
            )}

            <div className="text-center text-xs opacity-40">
                The tavern bard plays through YouTube
            </div>
        </div>
    );
}