import Link from "next/link";
import type { ReactNode } from "react";
import { TERMS_VERSION } from "@/lib/legal";

type Props = {
    title: string;
    children: ReactNode;
};

export default function LegalPage({ title, children }: Props) {
    return (
        <main className="min-h-screen flex justify-center p-4">
            <article className="theme-surface my-8 w-full max-w-2xl rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-8 text-sm leading-relaxed text-[var(--foreground)]">
                <h1 className="text-2xl font-bold text-[var(--heading)]">{title}</h1>
                <p className="mt-1 text-xs text-[var(--muted)]">Effective {TERMS_VERSION}</p>

                <div className="mt-6 space-y-6 [&_a]:text-[var(--accent)] [&_a]:underline [&_h2]:text-sm [&_h2]:font-bold [&_h2]:uppercase [&_h2]:tracking-wider [&_h2]:text-[var(--muted)] [&_li]:ml-5 [&_li]:list-disc [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:space-y-1">
                    {children}
                </div>

                <p className="mt-8 text-xs text-[var(--muted)]">
                    <Link href="/terms" className="underline" style={{ color: "var(--accent)" }}>Terms of Service</Link>
                    {" · "}
                    <Link href="/privacy" className="underline" style={{ color: "var(--accent)" }}>Privacy Policy</Link>
                    {" · "}
                    <Link href="/login" className="underline" style={{ color: "var(--accent)" }}>Back to sign in</Link>
                </p>
            </article>
        </main>
    );
}
