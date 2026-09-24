// Accounts allowed into the dev dashboard (/dev) and /api/dev/* — a
// comma-separated allowlist, same `process.env.X ?? default` shape as
// lib/ollamaConfig.ts. Set DEV_ACCOUNT_EMAILS in .env locally and in
// Vercel's dashboard for production. It deliberately grants NO exemption
// from the announcement-check limit (lib/aiRateLimit.ts); dev accounts get
// extra checks through credits like anyone else.
const DEV_ACCOUNT_EMAILS = new Set(
    (process.env.DEV_ACCOUNT_EMAILS ?? "")
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
);

export function isDevAccountEmail(email: string | null | undefined): boolean {
    if (!email) return false;
    return DEV_ACCOUNT_EMAILS.has(email.trim().toLowerCase());
}
