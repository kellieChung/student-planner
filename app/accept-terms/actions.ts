"use server";

import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { safeRedirectPath, TERMS_VERSION, UNDERAGE_MESSAGE } from "@/lib/legal";

export type AcceptTermsState = {
    error: string | null;
    underage?: boolean;
};

export async function acceptTerms(_prevState: AcceptTermsState, formData: FormData): Promise<AcceptTermsState> {
    const session = await auth();

    if (!session?.user?.email) {
        redirect("/login");
    }

    if (formData.get("ageConfirmed") !== "on") {
        return { error: UNDERAGE_MESSAGE, underage: true };
    }

    if (formData.get("termsAccepted") !== "on") {
        return { error: "You need to agree to the Terms of Service and Privacy Policy to keep using Lodestar." };
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });

    if (!user) {
        redirect("/login");
    }

    const now = new Date();

    await prisma.user.update({
        where: { id: user.id },
        data: { termsAcceptedAt: now, termsVersion: TERMS_VERSION, ageConfirmedAt: now },
    });

    redirect(safeRedirectPath(formData.get("next")));
}

export async function declineAndDeleteAccount(): Promise<void> {
    const session = await auth();

    if (session?.user?.email) {
        const user = await prisma.user.findUnique({ where: { email: session.user.email } });

        if (user) {
            await prisma.user.delete({ where: { id: user.id } });
        }
    }

    await signOut({ redirectTo: "/login" });
}

export async function declineAndSignOut(): Promise<void> {
    await signOut({ redirectTo: "/login" });
}
