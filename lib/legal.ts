// Bump this whenever /terms or /privacy change materially — every user whose
// stored termsVersion differs is sent back through /accept-terms.
export const TERMS_VERSION = "2026-09-22";

export const MINIMUM_AGE = 13;

export const UNDERAGE_MESSAGE =
    "You must be 13 or older to create an account. US law (the Children's Online Privacy Protection Act, " +
    "or COPPA) restricts collecting personal information from children under 13, so we can't create an " +
    "account for you.";

export function hasAcceptedCurrentTerms(user: { termsAcceptedAt: Date | null; termsVersion: string | null }): boolean {
    return user.termsAcceptedAt !== null && user.termsVersion === TERMS_VERSION;
}

// Only same-site relative paths — never let a form field redirect off-site.
export function safeRedirectPath(value: FormDataEntryValue | string | null | undefined): string {
    if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
        return "/";
    }

    return value;
}
