"use client";

import { useActionState, useState, type ReactNode } from "react";
import { signOut } from "next-auth/react";
import { changePassword, updateName, type AccountFormState } from "@/app/settings/account/actions";

type Props = {
    name: string | null;
    email: string | null;
    hasPassword: boolean;
    hasGoogle: boolean;
};

const INITIAL_STATE: AccountFormState = { error: null, success: null };

const INPUT_CLASS =
    "mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--accent)]";

const BUTTON_CLASS =
    "rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-60";

export default function AccountForms({ name, email, hasPassword, hasGoogle }: Props) {
    const [nameState, nameAction, namePending] = useActionState(updateName, INITIAL_STATE);
    const [passwordState, passwordAction, passwordPending] = useActionState(changePassword, INITIAL_STATE);

    const signInMethods = [hasGoogle && "Google", hasPassword && "Email and password"].filter(Boolean).join(" · ");

    return (
        <div className="mt-6 space-y-4">
            <Card title="Profile">
                <form action={nameAction} className="space-y-3">
                    <label className="block text-xs font-semibold text-[var(--muted)]">
                        Name
                        <input name="name" type="text" autoComplete="name" maxLength={80} defaultValue={name ?? ""} className={INPUT_CLASS} />
                    </label>
                    <FormStatus state={nameState} />
                    <button type="submit" disabled={namePending} className={BUTTON_CLASS}>
                        {namePending ? "Saving…" : "Save name"}
                    </button>
                </form>

                <div className="mt-5 text-xs text-[var(--muted)]">
                    <p className="font-semibold">Email</p>
                    <p className="mt-1 text-sm text-[var(--foreground)]">{email}</p>
                    <p className="mt-1">Changing your email isn&apos;t supported yet.</p>
                </div>

                <div className="mt-4 text-xs text-[var(--muted)]">
                    <p className="font-semibold">Sign-in methods</p>
                    <p className="mt-1 text-sm text-[var(--foreground)]">{signInMethods || "None"}</p>
                </div>
            </Card>

            <Card title={hasPassword ? "Change password" : "Set a password"}>
                {!hasPassword && (
                    <p className="mb-3 text-xs text-[var(--muted)]">
                        You sign in with Google. Set a password to also sign in with your email.
                    </p>
                )}
                <form action={passwordAction} className="space-y-3">
                    {hasPassword && (
                        <label className="block text-xs font-semibold text-[var(--muted)]">
                            Current password
                            <input name="currentPassword" type="password" autoComplete="current-password" className={INPUT_CLASS} />
                        </label>
                    )}
                    <label className="block text-xs font-semibold text-[var(--muted)]">
                        New password
                        <input name="newPassword" type="password" autoComplete="new-password" className={INPUT_CLASS} />
                    </label>
                    <label className="block text-xs font-semibold text-[var(--muted)]">
                        Confirm new password
                        <input name="confirmPassword" type="password" autoComplete="new-password" className={INPUT_CLASS} />
                    </label>
                    <p className="text-xs text-[var(--muted)]">At least 8 characters, with an uppercase letter and a special character.</p>
                    <FormStatus state={passwordState} />
                    <button type="submit" disabled={passwordPending} className={BUTTON_CLASS}>
                        {passwordPending ? "Saving…" : hasPassword ? "Change password" : "Set password"}
                    </button>
                </form>
            </Card>

            <DeleteAccountCard />
        </div>
    );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="theme-surface rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-6">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-[var(--muted)]">{title}</h2>
            {children}
        </section>
    );
}

function FormStatus({ state }: { state: AccountFormState }) {
    if (state.error) {
        return (
            <p aria-live="polite" className="rounded-lg border border-red-500/40 px-3 py-2 text-xs text-red-400">
                {state.error}
            </p>
        );
    }

    if (state.success) {
        return (
            <p aria-live="polite" className="text-xs font-semibold" style={{ color: "var(--accent)" }}>
                {state.success}
            </p>
        );
    }

    return null;
}

function DeleteAccountCard() {
    const [confirming, setConfirming] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleDelete() {
        setDeleting(true);
        setError(null);

        try {
            const response = await fetch("/api/account", { method: "DELETE" });

            if (!response.ok) {
                throw new Error(`Delete failed with status ${response.status}`);
            }

            await signOut({ redirectTo: "/" });
        } catch (deleteError) {
            console.error("Failed to delete account:", deleteError);
            setError("Couldn't delete your account. Please try again.");
            setDeleting(false);
        }
    }

    return (
        <Card title="Delete account">
            <p className="text-xs text-[var(--foreground)]">
                Permanently deletes your account and all of your data: tasks, synced Canvas courses, settings, and
                progress. This can&apos;t be undone.
            </p>

            {!confirming ? (
                <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    className="mt-3 rounded-lg border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-400 transition-colors hover:bg-[var(--status-overdue-bg)]"
                >
                    Delete account
                </button>
            ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={handleDelete}
                        disabled={deleting}
                        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
                    >
                        {deleting ? "Deleting…" : "Yes, delete everything"}
                    </button>
                    <button
                        type="button"
                        onClick={() => setConfirming(false)}
                        disabled={deleting}
                        className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
                    >
                        Cancel
                    </button>
                </div>
            )}

            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        </Card>
    );
}
