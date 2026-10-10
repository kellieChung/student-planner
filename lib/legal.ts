// Bump this whenever /terms or /privacy change materially — every user whose
// stored termsVersion differs is sent back through /accept-terms.
export const TERMS_VERSION = "2026-10-10";

// Shown on /terms, /privacy and the landing footer. Temporary personal
// address until a domain email exists.
export const CONTACT_EMAIL = "lodestarplan@gmail.com";

export const MINIMUM_AGE = 13;

export const UNDERAGE_MESSAGE =
    "You must be 13 or older to create an account on your own. US law (the Children's Online Privacy Protection " +
    "Act, or COPPA) restricts collecting personal information from children under 13 without a parent's consent. " +
    `To use Lodestar, ask a parent or guardian to email ${CONTACT_EMAIL} about our parental consent form.`;

// Set when someone enters an under-13 birth date, so they can't go back and
// pick an older one (the FTC's "neutral age screen" guidance).
export const AGE_GATE_COOKIE = "lodestar_age_gate";
export const AGE_GATE_LOCKOUT_SECONDS = 7 * 24 * 60 * 60;

const OLDEST_BIRTH_YEAR_OFFSET = 120;

export type BirthMonthYear = { year: number; month: number };

// Month and year only: the birth date is checked, never stored.
export function parseBirthMonthYear(
    month: FormDataEntryValue | null,
    year: FormDataEntryValue | null,
    todayKey: string,
): BirthMonthYear | null {
    const currentYear = Number(todayKey.slice(0, 4));
    const parsedMonth = typeof month === "string" ? Number(month) : NaN;
    const parsedYear = typeof year === "string" ? Number(year) : NaN;

    if (!Number.isInteger(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) return null;
    if (!Number.isInteger(parsedYear) || parsedYear > currentYear || parsedYear < currentYear - OLDEST_BIRTH_YEAR_OFFSET) return null;

    return { year: parsedYear, month: parsedMonth };
}

// Without the day, someone born in the current month might not have had their
// birthday yet, so that month counts as not yet a year older.
export function isAtLeastMinimumAge(birth: BirthMonthYear, todayKey: string): boolean {
    const currentYear = Number(todayKey.slice(0, 4));
    const currentMonth = Number(todayKey.slice(5, 7));
    const fullYears = currentYear - birth.year - (currentMonth > birth.month ? 0 : 1);

    return fullYears >= MINIMUM_AGE;
}

export function hasAcceptedCurrentTerms(user: { termsAcceptedAt: Date | null; termsVersion: string | null }): boolean {
    return user.termsAcceptedAt !== null && user.termsVersion === TERMS_VERSION;
}

// Only same-site relative paths — never let a form field redirect off-site.
// Backslashes and control characters are rejected outright (browsers treat
// "/\evil.com" like "//evil.com" and strip tabs/newlines); parsing against a
// dummy origin then catches anything else that resolves off-site, including
// dot segments that normalize to a protocol-relative "//host".
const DUMMY_ORIGIN = "http://lodestar.invalid";

export function safeRedirectPath(value: FormDataEntryValue | string | null | undefined): string {
    if (typeof value !== "string" || !value.startsWith("/") || /[\\\u0000-\u001f\u007f]/.test(value)) {
        return "/";
    }

    try {
        const url = new URL(value, DUMMY_ORIGIN);

        if (url.origin !== DUMMY_ORIGIN || url.pathname.startsWith("//")) {
            return "/";
        }

        return `${url.pathname}${url.search}${url.hash}`;
    } catch {
        return "/";
    }
}
