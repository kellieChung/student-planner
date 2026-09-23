"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hashPassword, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, normalizeEmail } from "@/lib/password";
import { safeRedirectPath, TERMS_VERSION, UNDERAGE_MESSAGE } from "@/lib/legal";

export type CredentialsFormState = {
    error: string | null;
    underage?: boolean;
    email?: string;
    name?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readString(formData: FormData, key: string): string {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
}

async function signInWithCredentials(email: string, password: string, redirectTo: string): Promise<CredentialsFormState> {
    try {
        await signIn("credentials", { email, password, redirectTo });
    } catch (error) {
        // signIn throws a redirect on success — only swallow real auth failures.
        if (error instanceof AuthError) {
            return { error: "Invalid email or password.", email };
        }
        throw error;
    }

    return { error: null };
}

export async function signInWithPassword(_prevState: CredentialsFormState, formData: FormData): Promise<CredentialsFormState> {
    const email = normalizeEmail(readString(formData, "email"));
    const password = readString(formData, "password");

    if (!email || !password) {
        return { error: "Enter your email and password.", email };
    }

    return signInWithCredentials(email, password, safeRedirectPath(formData.get("redirectTo")));
}

export async function signUp(_prevState: CredentialsFormState, formData: FormData): Promise<CredentialsFormState> {
    const name = readString(formData, "name").trim();
    const email = normalizeEmail(readString(formData, "email"));
    const password = readString(formData, "password");
    const confirmPassword = readString(formData, "confirmPassword");
    const fields = { email, name };

    if (formData.get("ageConfirmed") !== "on") {
        return { error: UNDERAGE_MESSAGE, underage: true, ...fields };
    }

    if (formData.get("termsAccepted") !== "on") {
        return { error: "You need to agree to the Terms of Service and Privacy Policy to create an account.", ...fields };
    }

    if (!EMAIL_PATTERN.test(email)) {
        return { error: "Enter a valid email address.", ...fields };
    }

    if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
        return { error: `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.`, ...fields };
    }

    if (password !== confirmPassword) {
        return { error: "Passwords don't match.", ...fields };
    }

    const existing = await prisma.user.findUnique({ where: { email } });

    // Never attach a password to an existing (e.g. Google) account — without
    // email verification that would let anyone take over that account.
    if (existing) {
        return {
            error: "An account with this email already exists. Try signing in, or use Google if you signed up that way.",
            ...fields,
        };
    }

    const now = new Date();

    try {
        await prisma.user.create({
            data: {
                email,
                name: name || null,
                passwordHash: await hashPassword(password),
                termsAcceptedAt: now,
                termsVersion: TERMS_VERSION,
                ageConfirmedAt: now,
            },
        });
    } catch (error) {
        console.error("Failed to create account:", error);
        return { error: "Couldn't create your account. Please try again.", ...fields };
    }

    return signInWithCredentials(email, password, safeRedirectPath(formData.get("redirectTo")));
}
