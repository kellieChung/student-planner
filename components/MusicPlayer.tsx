"use client";

import {
    FormEvent,
    useEffect,
    useRef,
    useState,
} from "react";

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

    const selectedPlaylist =
        playlists.find(
            (playlist) =>
                playlist.id === selectedPlaylistId
        ) ?? null;

    const currentTrack =
        selectedPlaylist?.tracks[currentIndex] ??
        null;

    /*
     * Load saved volume.
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
    }, []);

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
     * Next track.
     */
    function playNext() {
        if (!selectedPlaylist) {
            return;
        }

        const nextIndex =
            currentIndex + 1;

        if (
            nextIndex >=
            selectedPlaylist.tracks.length
        ) {
            setIsPlaying(false);
            return;
        }

        shouldAutoplayRef.current =
            true;

        setCurrentIndex(nextIndex);
    }

    /*
     * Previous track.
     */
    function playPrevious() {
        if (!selectedPlaylist) {
            return;
        }

        const previousIndex =
            currentIndex - 1;

        if (previousIndex < 0) {
            return;
        }

        shouldAutoplayRef.current =
            true;

        setCurrentIndex(
            previousIndex
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
            <div className="p-6">
                Loading Tavern Radio...
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6 p-6">
            {error && (
                <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold">
                        Tavern Radio
                    </h1>

                    <p className="text-sm text-gray-500">
                        Your personal study soundtrack.
                    </p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() =>
                            setShowImport(true)
                        }
                        className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
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
                        className="rounded-lg border px-4 py-2 text-sm font-medium"
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
                            className="rounded-lg border px-4 py-2 text-sm font-medium"
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
                <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
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
                                                    onClick={() =>
                                                        renamePlaylist(
                                                            playlist.id
                                                        )
                                                    }
                                                    className="text-sm"
                                                >
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
                                                    onClick={() =>
                                                        deletePlaylist(
                                                            playlist.id
                                                        )
                                                    }
                                                    className="px-2 text-xs text-red-500"
                                                >
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
                                <div className="mb-4">
                                    <h2 className="text-xl font-semibold">
                                        {
                                            selectedPlaylist.name
                                        }
                                    </h2>

                                    <p className="text-sm text-gray-500">
                                        {
                                            selectedPlaylist
                                                .tracks
                                                .length
                                        }{" "}
                                        tracks
                                    </p>
                                </div>

                                <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                                    <section className="rounded-xl border p-4">
                                        <div
                                            id="youtube-player"
                                            className="aspect-video w-full overflow-hidden rounded-lg bg-black"
                                        />

                                        <div className="mt-4">
                                            <h3 className="truncate font-semibold">
                                                {currentTrack?.title ??
                                                    "Nothing playing"}
                                            </h3>

                                            {currentTrack && (
                                                <p className="text-sm text-gray-500">
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

                                        <div className="mt-4">
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

                                        <div className="mt-4 flex items-center justify-center gap-3">
                                            <button
                                                type="button"
                                                onClick={
                                                    playPrevious
                                                }
                                                disabled={
                                                    !currentTrack ||
                                                    currentIndex ===
                                                        0
                                                }
                                                className="rounded-full border px-4 py-2 disabled:opacity-40"
                                            >
                                                Previous
                                            </button>

                                            <button
                                                type="button"
                                                onClick={
                                                    togglePlay
                                                }
                                                disabled={
                                                    !currentTrack ||
                                                    !playerReady
                                                }
                                                className="rounded-full bg-black px-6 py-2 text-white disabled:opacity-40"
                                            >
                                                {isPlaying
                                                    ? "Pause"
                                                    : "Play"}
                                            </button>

                                            <button
                                                type="button"
                                                onClick={
                                                    playNext
                                                }
                                                disabled={
                                                    !currentTrack ||
                                                    currentIndex >=
                                                        selectedPlaylist
                                                            .tracks
                                                            .length -
                                                            1
                                                }
                                                className="rounded-full border px-4 py-2 disabled:opacity-40"
                                            >
                                                Next
                                            </button>
                                        </div>

                                        <div className="mt-5 flex items-center gap-3">
                                            <span className="text-sm">
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

                                            <span className="w-10 text-right text-sm text-gray-500">
                                                {volume}
                                            </span>
                                        </div>
                                    </section>

                                    <section className="rounded-xl border">
                                        <div className="border-b p-4">
                                            <h3 className="font-semibold">
                                                Tracks
                                            </h3>
                                        </div>

                                        {selectedPlaylist
                                            .tracks
                                            .length ===
                                        0 ? (
                                            <div className="p-6 text-center text-sm text-gray-500">
                                                No tracks yet.
                                            </div>
                                        ) : (
                                            <div className="max-h-[500px] overflow-y-auto">
                                                {selectedPlaylist.tracks.map(
                                                    (
                                                        track,
                                                        index
                                                    ) => (
                                                        <div
                                                            key={
                                                                track.id
                                                            }
                                                            className={`border-b p-3 ${
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
                                                                        onClick={() =>
                                                                            renameTrack(
                                                                                selectedPlaylist.id,
                                                                                track.id
                                                                            )
                                                                        }
                                                                        className="text-sm"
                                                                    >
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
                                                                        onClick={() =>
                                                                            deleteTrack(
                                                                                selectedPlaylist.id,
                                                                                track.id
                                                                            )
                                                                        }
                                                                        className="text-xs text-red-500"
                                                                    >
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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
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
                                className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-40"
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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
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
                                className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-40"
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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
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
                                className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-40"
                            >
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