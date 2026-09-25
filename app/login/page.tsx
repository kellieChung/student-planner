import Link from "next/link";
import {signIn, auth} from "@/auth";
import {redirect} from "next/navigation";
import {prisma} from "@/lib/prisma";
import StarField from "@/components/brand/StarField";
import AuthConstellation, {AuthProgressProvider} from "@/components/auth/AuthProgress";
import ConstellationFigure from "@/components/starchart/ConstellationFigure";
import {getConstellation} from "@/lib/constellations";
import CredentialsForm from "@/components/auth/CredentialsForm";
import LegalLinks from "@/components/auth/LegalLinks";

// Two real constellations, fully charted, faint behind the card (wide screens only).
const BACKDROP: {id: string; className: string}[] = [
    {id: "orion", className: "bottom-[8%] left-[6%] w-56 lg:w-64"},
    {id: "ursa-major", className: "right-[5%] top-[10%] w-64 lg:w-80"},
];

const AUTH_ERROR_MESSAGES: Record<string, string> = {
    OAuthAccountNotLinked:
        "This email already has a password account. Sign in with your email and password instead.",
};

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{
        error?: string;
        mode?: string;
    }>;
}) {
    const session = await auth();

    // JWT sessions outlive a deleted account, so check the row still exists
    // before bouncing to "/" (which would bounce straight back here).
    if (session?.user?.email && await prisma.user.findUnique({where: {email: session.user.email}})) {
        redirect("/");
    }

    const {error, mode} = await searchParams;
    const errorMessage = error ? AUTH_ERROR_MESSAGES[error] ?? "Sign-in failed. Please try again." : null;

    return (
        <main className = "auth-page sky relative min-h-screen flex flex-col items-center justify-center gap-4 overflow-hidden p-4">
            <StarField count={90} seed={314} twinkle={false} sizeScale={1.5} className="auth-stars" />
            {BACKDROP.map(({id, className}) => {
                const constellation = getConstellation(id)!;

                return (
                    <ConstellationFigure
                        key={id}
                        constellation={constellation}
                        charted={new Set(constellation.stars.map((_, index) => index))}
                        className={`auth-stars pointer-events-none absolute hidden opacity-60 md:block ${className}`}
                    />
                );
            })}
            <Link href="/" className="relative text-xs font-semibold underline" style={{color: "var(--muted)"}}>
                ← Back to Lodestar home
            </Link>
            <AuthProgressProvider>
                <div className="theme-surface relative w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-8 text-center">
                    <AuthConstellation />
                    <h1 className="text-2xl font-bold text-[var(--heading)]">Lodestar</h1>
                    <p className="mt-1 text-sm text-[var(--muted)]">Your Ship&apos;s Log awaits.</p>

                    {errorMessage && (
                        <p className="mt-4 rounded-lg border border-red-500/40 px-3 py-2 text-xs text-red-400">{errorMessage}</p>
                    )}

                    <form
                        action = {async () => {
                            "use server";
                            await signIn("google")
                        }}
                        className="mt-6"
                    >
                        <button
                            type = "submit"
                            className="w-full rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)]"
                        >
                            Continue with Google
                        </button>
                    </form>
                    <LegalLinks prefix="By continuing with Google, you agree to the" />

                    <div className="my-6 flex items-center gap-3 text-xs text-[var(--muted)]">
                        <span className="h-px flex-1 bg-[var(--border)]" />
                        or
                        <span className="h-px flex-1 bg-[var(--border)]" />
                    </div>

                    <CredentialsForm initialMode={mode === "signup" ? "signUp" : "signIn"} />
                </div>
            </AuthProgressProvider>
        </main>
    )
}
