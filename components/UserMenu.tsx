"use client";

import {useState} from "react";
import {signOut} from "next-auth/react";

type UserMenuProps = {
    name?: string | null;
    email?: string | null;
};

export default function UserMenu({name, email}: UserMenuProps) {
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    async function handleDeleteAccount() {
        setDeleting(true);
        setDeleteError(null);

        try {
            const response = await fetch("/api/account", {method: "DELETE"});

            if (!response.ok) {
                throw new Error(`Delete failed with status ${response.status}`);
            }

            await signOut({redirectTo: "/login"});
        } catch (error) {
            console.error("Failed to delete account:", error);
            setDeleteError("Couldn't delete your account. Please try again.");
            setDeleting(false);
        }
    }

    return(
        <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--foreground)]">{name ?? "User"}</p>
                    <p className="truncate text-xs text-[var(--muted)]">{email ?? ""}</p>
                </div>

                <div className="ml-auto flex shrink-0 gap-2">
                    <button
                        onClick = {() => setConfirmingDelete(true)}
                        className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)] transition-colors hover:text-red-400"
                    >
                        Delete Account
                    </button>
                    <button
                        onClick = {() => signOut()}
                        className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
                    >
                        Log Out
                    </button>
                </div>
            </div>

            {confirmingDelete && (
                <div className="mt-3 rounded-lg border border-red-500/40 p-3 text-xs text-[var(--foreground)]">
                    <p>
                        This permanently deletes your account and all of your data — tasks, synced Canvas
                        courses, settings, and progress. This can&apos;t be undone.
                    </p>
                    {deleteError && <p className="mt-2 text-red-400">{deleteError}</p>}
                    <div className="mt-3 flex gap-2">
                        <button
                            onClick = {handleDeleteAccount}
                            disabled = {deleting}
                            className="rounded-lg bg-red-600 px-3 py-1.5 font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
                        >
                            {deleting ? "Deleting…" : "Yes, delete everything"}
                        </button>
                        <button
                            onClick = {() => setConfirmingDelete(false)}
                            disabled = {deleting}
                            className="rounded-lg border border-[var(--border)] px-3 py-1.5 font-semibold text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
