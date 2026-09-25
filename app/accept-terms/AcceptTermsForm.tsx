"use client";

import { useActionState } from "react";
import { ConsentCheckboxes } from "@/components/auth/CredentialsForm";
import { acceptTerms, declineAndDeleteAccount, declineAndSignOut, type AcceptTermsState } from "@/app/accept-terms/actions";

type Props = {
    next: string;
};

const INITIAL_STATE: AcceptTermsState = { error: null };

export default function AcceptTermsForm({ next }: Props) {
    const [state, formAction, pending] = useActionState(acceptTerms, INITIAL_STATE);

    return (
        <div className="mt-6 text-left">
            <form action={formAction} className="space-y-3">
                <input type="hidden" name="next" value={next} />
                <ConsentCheckboxes />

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
                    {pending ? "Please wait…" : "Continue"}
                </button>
            </form>

            {state.underage && (
                <form action={declineAndDeleteAccount} className="mt-3">
                    <button
                        type="submit"
                        className="w-full rounded-lg border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-400 transition-colors hover:bg-[var(--status-overdue-bg)]"
                    >
                        Delete my account and data
                    </button>
                </form>
            )}

            <form action={declineAndSignOut} className="mt-3">
                <button
                    type="submit"
                    className="w-full rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
                >
                    Sign out
                </button>
            </form>
        </div>
    );
}
