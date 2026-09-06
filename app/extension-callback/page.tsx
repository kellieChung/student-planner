import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";
import { redirect } from "next/navigation";

export default async function ExtensionCallbackPage({
    searchParams,
}: {
    searchParams: Promise<{
        state?: string;
    }>;
}) {
    const params = await searchParams;
    const state = params.state;

    if (!state) {
        return <ExtensionCallbackMessage text="❌ Missing extension state." />;
    }

    const session = await auth();

    if (!session?.user?.email) {
        return <ExtensionCallbackMessage text="❌ You are not signed in." />;
    }

    const user = await prisma.user.findUnique({
        where: {
            email: session.user.email,
        },
    });

    if (!user) {
        return (
            <ExtensionCallbackMessage text="❌ Could not find your Student Planner account." />
        );
    }

    // Check whether this authentication attempt
    // has already created an ExtensionSession.
    const existingSession =
        await prisma.extensionSession.findUnique({
            where: {
                state,
            },
        });

    let token: string;

    if (existingSession) {
        // The callback was already processed.
        token = existingSession.token;

        console.log(
            "🔐 Extension session already exists for this state."
        );
    } else {
        // First time processing this authentication attempt.
        token = randomBytes(32).toString("hex");

        await prisma.extensionSession.create({
            data: {
                userId: user.id,
                state,
                token,
                expiresAt: new Date(
                    Date.now() + 30 * 24 * 60 * 60 * 1000
                ),
            },
        });

        console.log(
            "🎉 Extension session created successfully."
        );
    }

    return (
        <main className="min-h-screen flex items-center justify-center p-4">
            <div className="theme-surface w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-8 text-center">
                <h1 className="text-2xl font-bold text-[var(--heading)]">Student Planner</h1>

                <p className="mt-4 text-sm font-semibold text-[var(--foreground)]">✅ You&apos;re signed in!</p>

                <p className="mt-1 text-sm text-[var(--muted)]">
                    You can close this tab and return to the extension.
                </p>
            </div>
        </main>
    );
}

function ExtensionCallbackMessage({ text }: { text: string }) {
    return (
        <main className="min-h-screen flex items-center justify-center p-4">
            <div className="theme-surface w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-8 text-center">
                <h1 className="text-2xl font-bold text-[var(--heading)]">Student Planner</h1>
                <p className="mt-4 text-sm font-semibold text-[var(--status-overdue-text)]">{text}</p>
            </div>
        </main>
    );
}