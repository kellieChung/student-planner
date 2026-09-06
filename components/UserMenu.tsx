"use client";

import {signOut} from "next-auth/react";

type UserMenuProps = {
    name?: string | null;
    email?: string | null;
};

export default function UserMenu({name, email}: UserMenuProps) {
    return(
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-2.5">
            <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--foreground)]">{name ?? "User"}</p>
                <p className="truncate text-xs text-[var(--muted)]">{email ?? ""}</p>
            </div>

            <button
                onClick = {() => signOut()}
                className="ml-auto shrink-0 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
            >
                Log Out
            </button>
        </div>
    )
}