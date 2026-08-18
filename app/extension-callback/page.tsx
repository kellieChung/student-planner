import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import crypto from "crypto";

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
        return <p>❌ Missing extension state.</p>;
    }

    const session = await auth();

    if (!session?.user?.email) {
        return <p>❌ You are not signed in.</p>;
    }

    const user = await prisma.user.findUnique({
        where: {
            email: session.user.email,
        },
    });

    if (!user) {
        return <p>❌ Could not find your Student Planner account.</p>;
    }

    const token = crypto.randomUUID();

    const extensionSession = await prisma.extensionSession.create({
        data: {
            userId: user.id,
            state,
            token,
            expiresAt: new Date(
                Date.now() + 30 * 24 * 60 * 60 * 1000
            ),
        },
});

    return (
        <main className="min-h-screen flex items-center justify-center">
            <div>
                <h1>Student Planner</h1>

                <p>✅ You're signed in!</p>

                <p>
                    You can close this tab and return to the extension.
                </p>
            </div>
        </main>
    );
}