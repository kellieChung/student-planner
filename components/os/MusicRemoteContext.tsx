"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type MusicLoopMode = "off" | "all" | "one";

export type MusicEngineState = {
    trackTitle: string | null;
    playlistName: string | null;
    isPlaying: boolean;
    volume: number;
    loopMode: MusicLoopMode;
    shuffle: boolean;
};

// Deliberately only the plain-data playback controls — playlist
// create/import/add-track all read from MusicPlayer's own internal form
// state rather than taking parameters, so they aren't cleanly
// remote-controllable without a deeper rewrite; scoped out of the World's
// BardPanel on purpose (playlist management stays laptop-only).
export type MusicEngineActions = {
    togglePlay: () => void;
    playNext: () => void;
    playPrevious: () => void;
    cycleLoopMode: () => void;
    toggleShuffle: () => void;
    setVolume: (volume: number) => void;
};

type MusicRemoteContextValue = {
    // null while the Music window isn't open — nothing is publishing.
    engineState: MusicEngineState | null;
    engineActions: MusicEngineActions | null;
    publishEngine: (state: MusicEngineState, actions: MusicEngineActions) => void;
    clearEngine: () => void;
};

const MusicRemoteContext = createContext<MusicRemoteContextValue | null>(null);

export function useMusicRemote(): MusicRemoteContextValue {
    const ctx = useContext(MusicRemoteContext);
    if (!ctx) throw new Error("useMusicRemote must be used within MusicRemoteProvider");
    return ctx;
}

// A channel for the real MusicPlayer instance (wherever it's currently
// mounted — components/os/MusicWindow.tsx) to publish its live playback
// state and register remote-controllable actions, so both the OS window
// and the World's BardPanel reflect/control the exact same live player.
export function MusicRemoteProvider({ children }: { children: ReactNode }) {
    const [engineState, setEngineState] = useState<MusicEngineState | null>(null);
    const [engineActions, setEngineActions] = useState<MusicEngineActions | null>(null);

    const publishEngine = useCallback((state: MusicEngineState, actions: MusicEngineActions) => {
        setEngineState(state);
        setEngineActions(actions);
    }, []);

    const clearEngine = useCallback(() => {
        setEngineState(null);
        setEngineActions(null);
    }, []);

    const value = useMemo<MusicRemoteContextValue>(
        () => ({ engineState, engineActions, publishEngine, clearEngine }),
        [engineState, engineActions, publishEngine, clearEngine]
    );

    return <MusicRemoteContext.Provider value={value}>{children}</MusicRemoteContext.Provider>;
}
