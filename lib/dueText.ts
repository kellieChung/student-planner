// Deterministic parser for the narrow, controlled `dueText` vocabulary
// `lib/ai/analyzeAnnouncement.ts`'s extraction prompt asks for (explicit
// dates, weekday names, "next <weekday>", "tomorrow"/"tonight") — the
// prompt's own rules instruct the model to preserve that wording verbatim
// rather than emit arbitrary free text, so a bounded regex parser covers
// it without needing a general natural-language date library. Anything
// outside this vocabulary resolves to null rather than guessing; the
// original `dueText` is still shown to the user regardless (see
// components/rundown/RundownCandidateCard.tsx's "AI detected: ..." line),
// so nothing is lost.
//
// "next <weekday>" resolves identically to a bare weekday mention (the
// closest upcoming occurrence, inclusive of `referenceDate` itself) for
// consistency between the two forms.

const WEEKDAY_ALIASES: Record<string, number> = {
    sun: 0, sunday: 0,
    mon: 1, monday: 1,
    tue: 2, tues: 2, tuesday: 2,
    wed: 3, weds: 3, wednesday: 3,
    thu: 4, thur: 4, thurs: 4, thursday: 4,
    fri: 5, friday: 5,
    sat: 6, saturday: 6,
};

const MONTH_ALIASES: Record<string, number> = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, sept: 8, september: 8,
    oct: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, december: 11,
};

function toDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function nextWeekdayOnOrAfter(referenceDate: Date, targetWeekday: number): Date {
    const referenceDateOnly = new Date(
        referenceDate.getFullYear(),
        referenceDate.getMonth(),
        referenceDate.getDate()
    );

    const diff = (targetWeekday - referenceDateOnly.getDay() + 7) % 7;

    return addDays(referenceDateOnly, diff);
}

// Resolves a month/day pair against `referenceDate`'s year, rolling to
// next year only if that would place the date in the past relative to
// `referenceDate` — an announcement's due-date wording should always
// describe something upcoming, not something already gone.
function resolveMonthDay(referenceDate: Date, month: number, day: number): Date {
    const referenceDateOnly = new Date(
        referenceDate.getFullYear(),
        referenceDate.getMonth(),
        referenceDate.getDate()
    );

    const candidate = new Date(referenceDate.getFullYear(), month, day);

    if (candidate.getTime() < referenceDateOnly.getTime()) {
        return new Date(referenceDate.getFullYear() + 1, month, day);
    }

    return candidate;
}

export function resolveDueTextToDate(
    dueText: string | null,
    referenceDate: Date
): string | null {
    if (!dueText) {
        return null;
    }

    const text = dueText
        .trim()
        .toLowerCase()
        .replace(/^by\s+/, "")
        .replace(/[.,!]+$/, "");

    if (!text) {
        return null;
    }

    if (text === "tomorrow" || text === "tonight") {
        return toDateKey(addDays(referenceDate, 1));
    }

    const weekdayText = text.replace(/^(next|this)\s+/, "");

    if (weekdayText in WEEKDAY_ALIASES) {
        return toDateKey(
            nextWeekdayOnOrAfter(referenceDate, WEEKDAY_ALIASES[weekdayText])
        );
    }

    const monthDayMatch = text.match(/^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?$/);

    if (monthDayMatch) {
        const monthName = monthDayMatch[1];
        const day = parseInt(monthDayMatch[2], 10);

        if (monthName in MONTH_ALIASES && day >= 1 && day <= 31) {
            return toDateKey(
                resolveMonthDay(referenceDate, MONTH_ALIASES[monthName], day)
            );
        }
    }

    const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);

    if (slashMatch) {
        const month = parseInt(slashMatch[1], 10) - 1;
        const day = parseInt(slashMatch[2], 10);
        const yearPart = slashMatch[3];

        if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
            if (yearPart) {
                const year =
                    yearPart.length === 2
                        ? 2000 + parseInt(yearPart, 10)
                        : parseInt(yearPart, 10);

                return toDateKey(new Date(year, month, day));
            }

            return toDateKey(resolveMonthDay(referenceDate, month, day));
        }
    }

    return null;
}
