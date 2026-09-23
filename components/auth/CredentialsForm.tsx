"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { signInWithPassword, signUp, type CredentialsFormState } from "@/app/login/actions";

type Props = {
    redirectTo?: string;
};

type Mode = "signIn" | "signUp";

const INITIAL_STATE: CredentialsFormState = { error: null };

const INPUT_CLASS =
    "w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none";

export default function CredentialsForm({ redirectTo = "/" }: Props) {
    const [mode, setMode] = useState<Mode>("signIn");
    const [signInState, signInAction, signInPending] = useActionState(signInWithPassword, INITIAL_STATE);
    const [signUpState, signUpAction, signUpPending] = useActionState(signUp, INITIAL_STATE);

    const isSignUp = mode === "signUp";
    const state = isSignUp ? signUpState : signInState;
    const pending = isSignUp ? signUpPending : signInPending;

    return (
        <div className="text-left">
            <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg border border-[var(--border)] p-1 text-sm font-semibold">
                {(["signIn", "signUp"] as const).map((tab) => (
                    <button
                        key={tab}
                        type="button"
                        onClick={() => setMode(tab)}
                        className={`rounded-md px-3 py-1.5 transition-colors ${
                            mode === tab
                                ? "bg-[var(--accent)] text-white"
                                : "text-[var(--muted)] hover:text-[var(--foreground)]"
                        }`}
                    >
                        {tab === "signIn" ? "Sign in" : "Create account"}
                    </button>
                ))}
            </div>

            <form key={mode} action={isSignUp ? signUpAction : signInAction} className="space-y-3" noValidate>
                <input type="hidden" name="redirectTo" value={redirectTo} />

                {isSignUp && (
                    <label className="block text-xs font-semibold text-[var(--muted)]">
                        Name (optional)
                        <input name="name" type="text" autoComplete="name" defaultValue={state.name} className={`mt-1 ${INPUT_CLASS}`} />
                    </label>
                )}

                <label className="block text-xs font-semibold text-[var(--muted)]">
                    Email
                    <input
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        defaultValue={state.email}
                        className={`mt-1 ${INPUT_CLASS}`}
                    />
                </label>

                <label className="block text-xs font-semibold text-[var(--muted)]">
                    Password
                    <input
                        name="password"
                        type="password"
                        autoComplete={isSignUp ? "new-password" : "current-password"}
                        required
                        className={`mt-1 ${INPUT_CLASS}`}
                    />
                </label>

                {isSignUp && (
                    <>
                        <label className="block text-xs font-semibold text-[var(--muted)]">
                            Confirm password
                            <input
                                name="confirmPassword"
                                type="password"
                                autoComplete="new-password"
                                required
                                className={`mt-1 ${INPUT_CLASS}`}
                            />
                        </label>
                        <p className="text-xs text-[var(--muted)]">At least 8 characters.</p>

                        <ConsentCheckboxes />
                    </>
                )}

                {state.error && (
                    <p
                        aria-live="polite"
                        className={`rounded-lg border px-3 py-2 text-xs ${
                            state.underage
                                ? "border-[var(--border)] text-[var(--foreground)]"
                                : "border-red-500/40 text-red-400"
                        }`}
                    >
                        {state.error}
                    </p>
                )}

                <button
                    type="submit"
                    disabled={pending}
                    className="w-full rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-60"
                >
                    {pending ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
                </button>
            </form>
        </div>
    );
}

export function ConsentCheckboxes() {
    return (
        <div className="space-y-2 text-xs text-[var(--foreground)]">
            <label className="flex items-start gap-2">
                <input name="ageConfirmed" type="checkbox" className="mt-0.5" />
                <span>I am 13 years of age or older.</span>
            </label>
            <label className="flex items-start gap-2">
                <input name="termsAccepted" type="checkbox" className="mt-0.5" />
                <span>
                    I agree to the{" "}
                    <Link href="/terms" target="_blank" className="underline" style={{ color: "var(--accent)" }}>
                        Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link href="/privacy" target="_blank" className="underline" style={{ color: "var(--accent)" }}>
                        Privacy Policy
                    </Link>
                    .
                </span>
            </label>
        </div>
    );
}
