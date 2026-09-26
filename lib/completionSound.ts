let audio: HTMLAudioElement | null = null;

// A plain <audio> element (not Web Audio) so the ding mixes over the Comms
// YouTube player instead of interrupting it.
function getAudio(): HTMLAudioElement {
    if (!audio) {
        audio = new Audio("/sounds/completion-ding.mp3");
        audio.preload = "auto";
        audio.volume = 0.5;
    }

    return audio;
}

export function playCompletionSound() {
    try {
        const sound = getAudio();
        // Rewind so quick back-to-back completions each get a ding.
        sound.currentTime = 0;
        void sound.play().catch(() => {
            // Autoplay policy or no audio device — completion still counts.
        });
    } catch {
        // No Audio support (e.g. during SSR) — nothing to play.
    }
}
