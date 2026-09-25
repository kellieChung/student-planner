// A due time is stored as a 24-hour "HH:MM" string ("" = none). These convert
// to and from the 12-hour parts the time picker shows; nothing here touches a
// Date, so time zones can't come into it.
export type TimeParts = { hour12: number; minute: number; pm: boolean };

export const DEFAULT_TIME_PARTS: TimeParts = { hour12: 12, minute: 0, pm: false };

export function parseTimeKey(value: string): TimeParts | null {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value);

    if (!match) return null;

    const hour24 = Number(match[1]);
    const minute = Number(match[2]);

    if (hour24 > 23 || minute > 59) return null;

    return { hour12: hour24 % 12 === 0 ? 12 : hour24 % 12, minute, pm: hour24 >= 12 };
}

export function toTimeKey({ hour12, minute, pm }: TimeParts): string {
    const hour24 = (hour12 % 12) + (pm ? 12 : 0);

    return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function formatTimeParts({ hour12, minute }: Pick<TimeParts, "hour12" | "minute">): string {
    return `${hour12}:${String(minute).padStart(2, "0")}`;
}

// Reads a time someone typed: "11:59pm", "11:59 PM", "1159 p.m.", "9", "930",
// "21:30", "12am". An explicit am/pm wins; 13-23 and 0 are 24-hour and pick
// their own period; anything else (1-12 with no am/pm) takes `defaultPm`.
// Returns null when it isn't a real time.
export function parseTypedTime(text: string, defaultPm: boolean): TimeParts | null {
    const trimmed = text.trim().toLowerCase();
    const meridiem = /^(.*?)\s*([ap])\.?(?:m\.?)?$/.exec(trimmed);
    const body = (meridiem ? meridiem[1] : trimmed).trim();
    const pm = meridiem ? meridiem[2] === "p" : null;

    let hour: number;
    let minute: number;
    const separated = /^(\d{1,2})[:.\s](\d{2})$/.exec(body);
    const packed = /^(\d{3,4})$/.exec(body);
    const hourOnly = /^(\d{1,2})$/.exec(body);

    if (separated) {
        hour = Number(separated[1]);
        minute = Number(separated[2]);
    } else if (packed) {
        hour = Number(packed[1].slice(0, -2));
        minute = Number(packed[1].slice(-2));
    } else if (hourOnly) {
        hour = Number(hourOnly[1]);
        minute = 0;
    } else {
        return null;
    }

    if (minute > 59) return null;

    if (pm !== null) {
        return hour >= 1 && hour <= 12 ? { hour12: hour, minute, pm } : null;
    }

    if (hour === 0) return { hour12: 12, minute, pm: false };
    if (hour >= 13 && hour <= 23) return { hour12: hour - 12, minute, pm: true };
    if (hour >= 1 && hour <= 12) return { hour12: hour, minute, pm: defaultPm };

    return null;
}
