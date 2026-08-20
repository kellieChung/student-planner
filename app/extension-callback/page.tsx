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
        return (
            <p>
                ❌ Could not find your Student Planner account.
            </p>
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
        <main className="min-h-screen flex items-center justify-center">
            <div className="text-center">
                <h1>Student Planner</h1>

                <p>✅ You're signed in!</p>

                <p>
                    You can close this tab and return to the extension.
                </p>
            </div>
        </main>
    );
}