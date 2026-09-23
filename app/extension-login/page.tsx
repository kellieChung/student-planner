import { signIn } from "@/auth";
import CredentialsForm from "@/components/auth/CredentialsForm";
import LegalLinks from "@/components/auth/LegalLinks";

export default async function ExtensionLoginPage({
    searchParams,
}: {
    searchParams: Promise<{
        state?: string;
    }>;
}) {
    const params = await searchParams;
    const state = params.state;
    const redirectTo = `/extension-callback?state=${encodeURIComponent(state ?? "")}`;

    return (
        <main className="min-h-screen flex items-center justify-center p-4">
            <div className="theme-surface w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-8 text-center">
                <h1 className="text-2xl font-bold text-[var(--heading)]">Student Planner</h1>
                <p className="mt-1 text-sm text-[var(--muted)]">Sign in to connect the Canvas extension.</p>

                <form
                    action={async () => {
                        "use server";

                        await signIn("google", { redirectTo });
                    }}
                    className="mt-6"
                >
                    <button
                        type="submit"
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

                <CredentialsForm redirectTo={redirectTo} />
            </div>
        </main>
    );
}