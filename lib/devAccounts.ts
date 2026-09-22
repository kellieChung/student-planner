// Accounts exempt from the manual AI-detection-pass rate limit
// (lib/aiRateLimit.ts) — a comma-separated allowlist, same
// `process.env.X ?? default` shape as lib/ollamaConfig.ts. No such flag
// existed anywhere in this codebase before; set DEV_ACCOUNT_EMAILS in
// .env locally and in Vercel's dashboard for production.
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
