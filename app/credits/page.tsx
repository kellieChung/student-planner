import Link from "next/link";

export const metadata = {
    title: "Credits",
};

export default function CreditsPage() {
    return (
        <main className="min-h-screen flex items-center justify-center p-4">
            <div className="theme-surface w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-8">
                <h1 className="text-2xl font-bold text-[var(--heading)]">Credits</h1>

                <section className="mt-6">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--muted)]">Town art</h2>
                    <p className="mt-2 text-sm text-[var(--foreground)]">
                        Town art by André Mari Coppola (toen) — Toen&apos;s Medieval Strategy Sprite Pack, from{" "}
                        <Link
                            href="http://toen.itch.io/toens-medieval-strategy"
                            className="underline"
                            style={{ color: "var(--accent)" }}
                        >
                            toen.itch.io/toens-medieval-strategy
                        </Link>
                        , licensed under{" "}
                        <Link
                            href="http://creativecommons.org/licenses/by/4.0/"
                            className="underline"
                            style={{ color: "var(--accent)" }}
                        >
                            CC BY 4.0
                        </Link>
                        .
                    </p>
                    <p className="mt-2 text-xs text-[var(--muted)]">
                        Changes made: individual tiles are sliced from the original sheet and rendered at an integer
                        scale (2x); no pixel data was altered.
                    </p>
                </section>
            </div>
        </main>
    );
}
