"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import { PASSWORD_REQUIREMENTS_MESSAGE, passwordMeetsRules } from "@/lib/passwordRules";

export type AccountFormState = {
    error: string | null;
    success: string | null;
};

const MAX_NAME_LENGTH = 80;

async function getCurrentUser() {
    const session = await auth();

    if (!session?.user?.email) {
        return null;
    }

    return prisma.user.findUnique({ where: { email: session.user.email } });
}

function readString(formData: FormData, key: string): string {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
}

export async function updateName(_prevState: AccountFormState, formData: FormData): Promise<AccountFormState> {
    const user = await getCurrentUser();

    if (!user) {
        return { error: "You must be logged in.", success: null };
    }

    const name = readString(formData, "name").trim();

    if (name.length > MAX_NAME_LENGTH) {
        return { error: `Name must be ${MAX_NAME_LENGTH} characters or fewer.`, success: null };
    }

    try {
        await prisma.user.update({
            where: { id: user.id },
            data: { name: name || null },
        });
    } catch (error) {
        console.error("Failed to update name:", error);
        return { error: "Couldn't save your name. Please try again.", success: null };
    }

    revalidatePath("/");
    revalidatePath("/settings/account");

    return { error: null, success: "Name saved." };
}

export async function changePassword(_prevState: AccountFormState, formData: FormData): Promise<AccountFormState> {
    const user = await getCurrentUser();

    if (!user) {
        return { error: "You must be logged in.", success: null };
    }

    const currentPassword = readString(formData, "currentPassword");
    const newPassword = readString(formData, "newPassword");
    const confirmPassword = readString(formData, "confirmPassword");

    // Google-only accounts have no password yet; they're already authenticated
    // for this email, so they may set one without a "current" password.
    if (user.passwordHash && !(await verifyPassword(currentPassword, user.passwordHash))) {
        return { error: "Your current password is incorrect.", success: null };
    }

    if (!passwordMeetsRules(newPassword)) {
        return { error: PASSWORD_REQUIREMENTS_MESSAGE, success: null };
    }

    if (newPassword !== confirmPassword) {
        return { error: "New passwords don't match.", success: null };
    }

    try {
        // A password change also disconnects every Chrome extension signed in
        // to this account (they re-pair with the new credentials).
        await prisma.$transaction([
            prisma.user.update({
                where: { id: user.id },
                data: { passwordHash: await hashPassword(newPassword) },
            }),
            prisma.extensionSession.deleteMany({ where: { userId: user.id } }),
        ]);
    } catch (error) {
        console.error("Failed to change password:", error);
        return { error: "Couldn't update your password. Please try again.", success: null };
    }

    revalidatePath("/settings/account");

    return { error: null, success: user.passwordHash ? "Password changed." : "Password set. You can now sign in with your email too." };
}
