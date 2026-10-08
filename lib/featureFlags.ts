// Server-side kill switches for beta features. Read at request time; on
// Vercel an env change still needs a redeploy to apply.

// On unless WORKLOAD_WARNINGS=off.
export function workloadWarningsEnabled(): boolean {
    return process.env.WORKLOAD_WARNINGS !== "off";
}
