"use client";

import { useActionState, useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { signInWithPassword, signUp, type CredentialsFormState } from "@/app/login/actions";
import { AUTH_STAR_COUNT, useAuthProgress } from "@/components/auth/AuthProgress";
import { MAX_PASSWORD_LENGTH, PASSWORD_RULES, passwordMeetsRules } from "@/lib/passwordRules";

export type Mode = "signIn" | "signUp";

type Props = {
    redirectTo?: string;
    initialMode?: Mode;
};

const INITIAL_STATE: CredentialsFormState = { error: null };
const NO_RULES_MET = PASSWORD_RULES.map(() => false);

const INPUT_CLASS =
    "w-full rounded-lg border border-[var(--field-border)] bg-transparent px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:border-[var(--accent)]";

// How many of the form's required steps are done, as a share of the stars.
function litStars(form: HTMLFormElement, isSignUp: boolean): number {
    const data = new FormData(form);
    const filled = (key: string) => String(data.get(key) ?? "").trim() !== "";
    const steps = [
        String(data.get("email") ?? "").includes("@"),
        isSignUp ? passwordMeetsRules(String(data.get("password") ?? "")) : filled("password"),
        ...(isSignUp ? [data.get("ageConfirmed") === "on", data.get("termsAccepted") === "on"] : []),
    ];

    return Math.round((steps.filter(Boolean).length / steps.length) * AUTH_STAR_COUNT);
}

const LABEL_CLASS = "block text-xs font-semibold text-[var(--muted)]";

export default function CredentialsForm({ redirectTo = "/", initialMode = "signIn" }: Props) {
    const [mode, setMode] = useState<Mode>(initialMode);
    const [showPassword, setShowPassword] = useState(false);
    const [signInState, signInAction, signInPending] = useActionState(signInWithPassword, INITIAL_STATE);
    const [signUpState, signUpAction, signUpPending] = useActionState(signUp, INITIAL_STATE);
    const fieldId = useId();
    const setLit = useAuthProgress()?.setLit;
    const [rulesMet, setRulesMet] = useState(NO_RULES_MET);

    const isSignUp = mode === "signUp";
    const state = isSignUp ? signUpState : signInState;
    const pending = isSignUp ? signUpPending : signInPending;
    const passwordAcceptable = rulesMet.every(Boolean);
    const nameId = `${fieldId}-name`;
    const emailId = `${fieldId}-email`;
    const passwordId = `${fieldId}-password`;
    const passwordHintId = `${fieldId}-password-hint`;

    return (
        <div className="text-left">
            <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg border border-[var(--field-border)] bg-[var(--panel-raised)] p-1 text-sm font-semibold">
                {(["signIn", "signUp"] as const).map((tab) => (
                    <button
                        key={tab}
                        type="button"
                        aria-pressed={mode === tab}
                        onClick={() => {
                            setMode(tab);
                            setLit?.(0);
                            setRulesMet(NO_RULES_MET);
                        }}
                        className={`rounded-md px-3 py-1.5 transition-colors ${
                            mode === tab
                                ? "bg-[var(--accent-soft)] text-[var(--heading)] shadow-[inset_0_-2px_0_var(--accent)]"
                                : "text-[var(--muted)] hover:text-[var(--foreground)]"
                        }`}
                    >
                        {tab === "signIn" ? "Sign in" : "Create account"}
                    </button>
                ))}
            </div>

            <form
                key={mode}
                action={isSignUp ? signUpAction : signInAction}
                onChange={(event) => {
                    const password = String(new FormData(event.currentTarget).get("password") ?? "");
                    setRulesMet(PASSWORD_RULES.map((rule) => rule.test(password)));
                    setLit?.(litStars(event.currentTarget, isSignUp));
                }}
                onReset={() => {
                    setRulesMet(NO_RULES_MET);
                    setLit?.(0);
                }}
                className="space-y-3"
                noValidate
            >
                <input type="hidden" name="redirectTo" value={redirectTo} />

                {isSignUp && (
                    <div>
                        <label htmlFor={nameId} className={LABEL_CLASS}>
                            Name (optional)
                        </label>
                        <input id={nameId} name="name" type="text" autoComplete="name" defaultValue={state.name} className={`mt-1 ${INPUT_CLASS}`} />
                    </div>
                )}

                <div>
                    <label htmlFor={emailId} className={LABEL_CLASS}>
                        Email
                    </label>
                    <input
                        id={emailId}
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        defaultValue={state.email}
                        className={`mt-1 ${INPUT_CLASS}`}
                    />
                </div>

                <div>
                    <label htmlFor={passwordId} className={LABEL_CLASS}>
                        Password
                    </label>
                    <div className="relative mt-1">
                        <input
                            id={passwordId}
                            name="password"
                            type={showPassword ? "text" : "password"}
                            autoComplete={isSignUp ? "new-password" : "current-password"}
                            required
                            maxLength={MAX_PASSWORD_LENGTH}
                            aria-describedby={isSignUp ? passwordHintId : undefined}
                            className={`${INPUT_CLASS} pr-10`}
                        />
                        <button
                            type="button"
                            aria-label={showPassword ? "Hide password" : "Show password"}
                            aria-pressed={showPassword}
                            onClick={() => setShowPassword((current) => !current)}
                            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
                        >
                            <EyeIcon crossedOut={showPassword} />
                        </button>
                    </div>
                    {isSignUp && (
                        <ul id={passwordHintId} className="mt-2 space-y-1 text-xs text-[var(--muted)]">
                            {PASSWORD_RULES.map((rule, index) => (
                                <li key={rule.id} className={`flex items-center gap-1.5 ${rulesMet[index] ? "text-[var(--foreground)]" : ""}`}>
                                    <RuleMark met={rulesMet[index]} />
                                    <span className="sr-only">{rulesMet[index] ? "Met: " : "Not met: "}</span>
                                    {rule.label}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {isSignUp && <ConsentCheckboxes />}

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
                    disabled={pending || (isSignUp && !passwordAcceptable)}
                    className="w-full rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-60"
                >
                    {pending ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
                </button>
            </form>
        </div>
    );
}

function RuleMark({ met }: { met: boolean }) {
    return (
        <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
            {met ? (
                <path d="M3.5 8.5 6.5 11.5 12.5 4.5" style={{ color: "var(--accent)" }} />
            ) : (
                <circle cx="8" cy="8" r="4.5" />
            )}
        </svg>
    );
}

function EyeIcon({ crossedOut }: { crossedOut: boolean }) {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
            {crossedOut && <path d="M4 4l16 16" />}
        </svg>
    );
}

export function ConsentCheckboxes() {
    return (
        <div className="space-y-2 text-xs text-[var(--foreground)]">
            <Checkbox name="ageConfirmed">I am 13 years of age or older.</Checkbox>
            <Checkbox name="termsAccepted">
                I agree to the{" "}
                <Link href="/terms" target="_blank" className="underline" style={{ color: "var(--accent)" }}>
                    Terms of Service
                </Link>{" "}
                and{" "}
                <Link href="/privacy" target="_blank" className="underline" style={{ color: "var(--accent)" }}>
                    Privacy Policy
                </Link>
                .
            </Checkbox>
        </div>
    );
}

// The check is a sibling SVG rather than a background image so it can use the
// theme's --accent-contrast token (a CSS variable doesn't work in a data URI).
function Checkbox({ name, children }: { name: string; children: ReactNode }) {
    const id = useId();

    return (
        <div className="flex items-start gap-2">
            <span className="relative mt-0.5 flex h-4 w-4 shrink-0">
                <input
                    id={id}
                    name={name}
                    type="checkbox"
                    className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-[var(--field-border)] bg-[var(--app-background)] transition-colors checked:border-[var(--accent)] checked:bg-[var(--accent)]"
                />
                <svg
                    viewBox="0 0 16 16"
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 h-full w-full p-0.5 text-[var(--accent-contrast)] opacity-0 peer-checked:opacity-100"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
                </svg>
            </span>
            <label htmlFor={id} className="cursor-pointer">
                {children}
            </label>
        </div>
    );
}
