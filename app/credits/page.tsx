import Link from "next/link";

export const metadata = {
    title: "Credits",
};

const linkStyle = { color: "var(--accent)" };

export default function CreditsPage() {
    return (
        <main className="min-h-screen flex items-center justify-center p-4">
            <div className="theme-surface w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-8">
                <h1 className="text-2xl font-bold text-[var(--heading)]">Credits</h1>

                <section className="mt-6">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--muted)]">Typefaces</h2>
                    <p className="mt-2 text-sm text-[var(--foreground)]">
                        Manrope by Mikhail Sharanda and Spectral by Production Type, both licensed under the{" "}
                        <Link href="https://openfontlicense.org" className="underline" style={linkStyle}>
                            SIL Open Font License 1.1
                        </Link>
                        .
                    </p>
                </section>

                <section className="mt-6">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--muted)]">The Star Chart</h2>
                    <p className="mt-2 text-sm text-[var(--foreground)]">
                        Constellation names follow the International Astronomical Union&apos;s 88 official
                        constellations. The star figures are hand-drawn approximations, not astrometric data.
                    </p>
                </section>

                <section className="mt-6">
                    <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--muted)]">Retired town art</h2>
                    <p className="mt-2 text-sm text-[var(--foreground)]">
                        An earlier version of Lodestar used town art by André Mari Coppola (toen) — Toen&apos;s
                        Medieval Strategy Sprite Pack, from{" "}
                        <Link href="https://toen.itch.io/toens-medieval-strategy" className="underline" style={linkStyle}>
                            toen.itch.io/toens-medieval-strategy
                        </Link>
                        , licensed under{" "}
                        <Link href="https://creativecommons.org/licenses/by/4.0/" className="underline" style={linkStyle}>
                            CC BY 4.0
                        </Link>
                        . Tiles were sliced from the original sheet and scaled 2x; no pixel data was altered.
                    </p>
                </section>

                <p className="mt-8 text-xs text-[var(--muted)]">
                    <Link href="/" className="underline" style={linkStyle}>Back to Lodestar</Link>
                </p>
            </div>
        </main>
    );
}
