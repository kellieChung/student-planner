import {signIn, auth} from "@/auth";
import {redirect} from "next/navigation";


export default async function LoginPage() {
    const session = await auth();

    if (session?.user) {
        redirect("/");
    }
    return (
        <main className = "min-h-screen flex items-center justify-center p-4">
            <div className="theme-surface w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-8 text-center">
                <h1 className="text-2xl font-bold text-[var(--heading)]">Student Planner</h1>
                <p className="mt-1 text-sm text-[var(--muted)]">Your weekly quest log awaits.</p>

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
                        Sign in with Google
                    </button>
                </form>
            </div>
        </main>
    )
}