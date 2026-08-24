const WEEKDAYS: Record<string, number> = {
    sunday: 0,
    sun: 0,
    monday: 1,
    mon: 1,
    tuesday: 2,
    tue: 2,
    tues: 2,
    wednesday: 3,
    wed: 3,
    thursday: 4,
    thu: 4,
    thurs: 4,
    friday: 5,
    fri: 5,
    saturday: 6,
    sat: 6,
};

const MONTHS: Record<string, number> = {
    january: 0,
    february: 1,
    march: 2,
    april: 3,
    may: 4,
    june: 5,
    july: 6,
    august: 7,
    september: 8,
    october: 9,
    november: 10,
    december: 11,
};

function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function startOfDay(date: Date): Date {
    return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
    );
}

function addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

export function resolveDueDate(
    dueReference: string | null,
    postedAt: Date
): string | null {
    if (!dueReference) {
        return null;
    }

    const reference = dueReference
        .trim()
        .toLowerCase()
        .replace(/\.$/, "");

    const baseDate = startOfDay(postedAt);

    // ----------------------------------------
    // Relative dates
    // ----------------------------------------

    if (reference === "today") {
        return formatDate(baseDate);
    }

    if (reference === "tomorrow") {
        return formatDate(addDays(baseDate, 1));
    }

    // ----------------------------------------
    // "next Monday", "next Friday", etc.
    // ----------------------------------------

    const nextWeekdayMatch = reference.match(
        /^next\s+(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thurs|friday|fri|saturday|sat)$/
    );

    if (nextWeekdayMatch) {
        const targetDay = WEEKDAYS[nextWeekdayMatch[1]];
        const currentDay = baseDate.getDay();

        let daysUntil = targetDay - currentDay;

        if (daysUntil <= 0) {
            daysUntil += 7;
        }

        return formatDate(addDays(baseDate, daysUntil));
    }

    // ----------------------------------------
    // Weekday with optional punctuation
    //
    // Wednesday
    // Wed
    // Wednesday,
    // ----------------------------------------

    const weekdayReference = reference.replace(/,$/, "");

    if (weekdayReference in WEEKDAYS) {
        const targetDay = WEEKDAYS[weekdayReference];
        const currentDay = baseDate.getDay();

        let daysUntil = targetDay - currentDay;

        if (daysUntil < 0) {
            daysUntil += 7;
        }

        // If the announcement says "Wednesday"
        // on Wednesday, interpret it as today.
        return formatDate(addDays(baseDate, daysUntil));
    }

    // ----------------------------------------
    // Weekday + numeric date
    //
    // Wednesday, 9/2
    // Wed, 9/2
    // Wednesday, 9/2/2026
    // ----------------------------------------

    const weekdayNumericDateMatch = reference.match(
        /^(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thurs|friday|fri|saturday|sat),?\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/
    );

    if (weekdayNumericDateMatch) {
        const month = Number(weekdayNumericDateMatch[2]) - 1;
        const day = Number(weekdayNumericDateMatch[3]);

        const year = weekdayNumericDateMatch[4]
            ? Number(weekdayNumericDateMatch[4])
            : baseDate.getFullYear();

        const result = new Date(year, month, day);

        return formatDate(result);
    }

    // ----------------------------------------
    // Weekday + month-name date
    //
    // Wednesday, September 2
    // Wed, September 2
    // Wednesday, September 2, 2026
    // ----------------------------------------

    const weekdayMonthNameMatch = reference.match(
        /^(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thurs|friday|fri|saturday|sat),?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:,\s*(\d{4}))?$/
    );

    if (weekdayMonthNameMatch) {
        const month = MONTHS[weekdayMonthNameMatch[2]];
        const day = Number(weekdayMonthNameMatch[3]);

        const year = weekdayMonthNameMatch[4]
            ? Number(weekdayMonthNameMatch[4])
            : baseDate.getFullYear();

        const result = new Date(year, month, day);

        return formatDate(result);
    }

    // ----------------------------------------
    // Full date with month name
    //
    // September 18
    // September 18, 2026
    // ----------------------------------------

    const monthNameMatch = reference.match(
        /^(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:,\s*(\d{4}))?$/
    );

    if (monthNameMatch) {
        const month = MONTHS[monthNameMatch[1]];
        const day = Number(monthNameMatch[2]);
        const year = monthNameMatch[3]
            ? Number(monthNameMatch[3])
            : baseDate.getFullYear();

        const result = new Date(year, month, day);

        return formatDate(result);
    }

    // ----------------------------------------
    // Numeric dates
    //
    // 9/18
    // 09/18
    // 9/18/2026
    // ----------------------------------------

    const numericDateMatch = reference.match(
        /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/
    );

    if (numericDateMatch) {
        const month = Number(numericDateMatch[1]) - 1;
        const day = Number(numericDateMatch[2]);
        const year = numericDateMatch[3]
            ? Number(numericDateMatch[3])
            : baseDate.getFullYear();

        const result = new Date(year, month, day);

        return formatDate(result);
    }

    // ----------------------------------------
    // Unknown date format
    // ----------------------------------------

    console.warn(
        "Could not resolve due date:",
        dueReference
    );

    return null;
}