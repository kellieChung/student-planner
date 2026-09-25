"use server";

import { randomBytes } from "crypto";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hasAcceptedCurrentTerms } from "@/lib/legal";
import { EXTENSION_SESSION_TTL_MS, hashExtensionToken } from "@/lib/extensionAuth";

export type ConnectExtensionResult = { token: string; error: null } | { token: null; error: string };

// Runs only on an explicit Connect click (a POST), never on page load, so a
// link alone can't mint a token. The plaintext token goes back to this page
// only; the page hands it to the extension through site-bridge.js, and the
// extension accepts it only for the sign-in state it generated.
export async function connectExtension(): Promise<ConnectExtensionResult> {
    const session = await auth();

    if (!session?.user?.email) {
        return { token: null, error: "You're not signed in. Start again from the extension." };
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });

    if (!user) {
        return { token: null, error: "Could not find your Lodestar account." };
    }

    if (!hasAcceptedCurrentTerms(user)) {
        return { token: null, error: "Please accept the terms first." };
    }

    const token = randomBytes(32).toString("hex");

    try {
        await prisma.extensionSession.create({
            data: {
                userId: user.id,
                // The state column is a legacy unique key; the real pairing
                // check happens inside the extension.
                state: randomBytes(32).toString("hex"),
                token: hashExtensionToken(token),
                expiresAt: new Date(Date.now() + EXTENSION_SESSION_TTL_MS),
            },
        });
    } catch (error) {
        console.error("Failed to create extension session:", error);
        return { token: null, error: "Couldn't connect the extension. Please try again." };
    }

    return { token, error: null };
}
