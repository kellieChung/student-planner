// RETIRED (2026-09-24): the medieval town/mascot layer is no longer used by the
// live app — Lodestar's Star Chart replaced it (gamificationSystem.md). Kept
// deliberately so it can be restored; not deleted.
import { MascotTrigger } from "@/types/townState";

export const MASCOT_NAME = "Nano";

// A basic voice — a name plus a handful of lines per trigger, per
// gamificationSystem.md's own build sequencing (full lore comes later).
// Plays the isekai "reincarnated into a medieval world" trope straight,
// treating modern tech concepts as either lost magic or common knowledge
// nobody else here understands.
const DIALOGUE: Record<MascotTrigger, string[]> = {
    taskStart: [
        "Beginning the quest, are we? Back where I'm from we'd call this 'opening a ticket.'",
        "Onward! I'd say 'you've got this' but I don't actually know what 'got' means in this dialect yet.",
        "A new trial begins. I'll keep the hourglass running so you don't have to think about it.",
        "Say the word and I'll light the way — well, I'll dim the screen glare, same thing here.",
    ],
    taskComplete: [
        "Quest complete! Somewhere, a server that no longer exists would have logged this as a success.",
        "Nicely done. Back home this would just be a checkmark; here it's apparently a whole ceremony.",
        "Another victory for the realm. I'm still not used to applause replacing push notifications.",
        "That's one more for the kingdom. I'd throw confetti but I haven't found the API for that here.",
    ],
    announcementFound: [
        "The scrying is complete — a new decree has surfaced. Take a look before the ink fades.",
        "I've divined something from the proclamation pile. You'll want to see this one.",
        "A scout report just came in. In my world we'd call it a 'push notification,' but sure, 'scout report.'",
        "The mists parted long enough for me to catch a new task hiding in that announcement.",
    ],
};

export function pickLine(trigger: MascotTrigger): string {
    const lines = DIALOGUE[trigger];
    return lines[Math.floor(Math.random() * lines.length)];
}
