import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { hasAcceptedCurrentTerms } from "@/lib/legal";
import ConnectExtension from "@/app/extension-callback/ConnectExtension";

export const metadata = {
    title: "Connect the extension",
};

// The extension generates 32 random bytes, hex-encoded.
const STATE_PATTERN = /^[0-9a-f]{64}$/;

export default async function ExtensionCallbackPage({
    searchParams,
}: {
    searchParams: Promise<{
        state?: string;
    }>;
}) {
    const { state } = await searchParams;

    if (!state || !STATE_PATTERN.test(state)) {
        return <ExtensionCallbackMessage text="This sign-in link is invalid. Open the Lodestar extension and click Sign in again." />;
    }

    const session = await auth();

    if (!session?.user?.email) {
        redirect(`/extension-login?state=${state}`);
    }

    const user = await prisma.user.findUnique({
        where: {
            email: session.user.email,
        },
    });

    if (!user) {
        return <ExtensionCallbackMessage text="Could not find your Lodestar account." />;
    }

    if (!hasAcceptedCurrentTerms(user)) {
        redirect(`/accept-terms?next=${encodeURIComponent(`/extension-callback?state=${state}`)}`);
    }

    return (
        <main className="auth-page min-h-screen flex items-center justify-center p-4">
            <div className="theme-surface w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-8 text-center">
                <h1 className="text-2xl font-bold text-[var(--heading)]">Lodestar</h1>
                <ConnectExtension state={state} email={user.email ?? session.user.email} />
            </div>
        </main>
    );
}

function ExtensionCallbackMessage({ text }: { text: string }) {
    return (
        <main className="auth-page min-h-screen flex items-center justify-center p-4">
            <div className="theme-surface w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-8 text-center">
                <h1 className="text-2xl font-bold text-[var(--heading)]">Lodestar</h1>
                <p className="mt-4 text-sm font-semibold text-[var(--status-overdue-text)]">{text}</p>
            </div>
        </main>
    );
}
