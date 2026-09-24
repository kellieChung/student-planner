"use client";

import MusicPlayer from "@/components/MusicPlayer";
import Window from "./Window";
import { MusicIcon } from "@/components/brand/Icons";

// Wraps the real, unmodified MusicPlayer in draggable window chrome. Its
// YouTube player is destroyed/recreated on every track change already (see
// MusicPlayer.tsx's own player-creation effect), so unmounting this window
// on Close is exactly its own existing cleanup — genuinely stops playback,
// not just hides it. Minimizing must NOT unmount this (audio needs to keep
// playing) — Window.tsx only hides it visually (`invisible`) while
// minimized, same "invisible, not display:none" treatment already used for
// the OS/World toggle elsewhere in this app.
export default function MusicWindow() {
    return (
        <Window app="music" title="Radio" icon={<MusicIcon size={14} />}>
            <MusicPlayer />
        </Window>
    );
}
