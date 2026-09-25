"use client";

import NumberField from "@/components/ui/NumberField";
import { useEffect, useState } from "react";
import { DetectionQuota } from "@/types/aiQuota";

type Account = {
    id: string;
    email: string | null;
    name: string | null;
    quota: DetectionQuota;
};

type Props = {
    currentEmail: string;
};

const DEFAULT_GRANT = 5;

// Grants bonus announcement checks ("credits"): added on top of the 2/week
// allowance and spent only once that's used up. Every grant is an
// AiTaskEvent row, so who granted what is on record.
export default function DevCreditsPanel({ currentEmail }: Props) {
    const [accounts, setAccounts] = useState<Account[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [amounts, setAmounts] = useState<Record<string, string>>({});
    const [busyId, setBusyId] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const response = await fetch("/api/dev/accounts");
                const data = await response.json();

                if (!response.ok || !data.success) {
                    throw new Error(data.error ?? "Failed to load accounts.");
                }

                setAccounts(data.accounts);
            } catch (loadError) {
                setError(loadError instanceof Error ? loadError.message : "Failed to load accounts.");
            }
        })();
    }, []);

    async function grant(account: Account, amount: number) {
        setBusyId(account.id);
        setError(null);

        try {
            const response = await fetch("/api/dev/accounts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: account.id, amount }),
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error ?? "Failed to grant credits.");
            }

            setAccounts((current) =>
                current?.map((a) => (a.id === account.id ? { ...a, quota: data.quota } : a)) ?? current
            );
        } catch (grantError) {
            setError(grantError instanceof Error ? grantError.message : "Failed to grant credits.");
        } finally {
            setBusyId(null);
        }
    }

    return (
        <div className="theme-surface rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5">
            <p className="text-lg font-bold">Announcement-check credits</p>

            <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
                Every account gets 2 checks per rolling week. Credits are extra checks on top of that,
                spent only after the weekly ones run out. Dev accounts get no exemption from the limit,
                so you can watch the counter and the out-of-checks state — grant yourself credits to
                keep testing.
            </p>

            {error && <p className="mt-3 text-sm text-[var(--status-overdue-text)]">{error}</p>}

            {!accounts && !error && <p className="mt-4 text-sm text-[var(--muted)]">Loading…</p>}

            {accounts && (
                <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="text-xs uppercase tracking-widest text-[var(--muted)]">
                                <th className="py-2 pr-4">Account</th>
                                <th className="py-2 pr-4">Weekly left</th>
                                <th className="py-2 pr-4">Credits</th>
                                <th className="py-2 pr-4">Frees up</th>
                                <th className="py-2">Grant</th>
                            </tr>
                        </thead>

                        <tbody>
                            {accounts.map((account) => {
                                const raw = amounts[account.id] ?? String(DEFAULT_GRANT);
                                const amount = Number(raw);
                                const validAmount = Number.isInteger(amount) && amount >= 1 && amount <= 1000;

                                return (
                                    <tr key={account.id} className="border-t border-[var(--border)]">
                                        <td className="py-3 pr-4">
                                            <p className="font-semibold">
                                                {account.email ?? "(no email)"}
                                                {account.email === currentEmail && (
                                                    <span className="ml-2 text-xs text-[var(--accent)]">you</span>
                                                )}
                                            </p>

                                            {account.name && (
                                                <p className="text-xs text-[var(--muted)]">{account.name}</p>
                                            )}
                                        </td>

                                        <td className="py-3 pr-4">
                                            {account.quota.weeklyRemaining} / {account.quota.limit}
                                        </td>

                                        <td className="py-3 pr-4">{account.quota.credits}</td>

                                        <td className="py-3 pr-4 text-[var(--muted)]">
                                            {account.quota.resetsAt
                                                ? new Date(account.quota.resetsAt).toLocaleString()
                                                : "—"}
                                        </td>

                                        <td className="py-3">
                                            <div className="flex items-center gap-2">
                                                <NumberField
                                                    ariaLabel={`Credits to grant ${account.email ?? "this account"}`}
                                                    min={1}
                                                    max={1000}
                                                    value={Number(raw) || 1}
                                                    onChange={(amount) =>
                                                        setAmounts((current) => ({
                                                            ...current,
                                                            [account.id]: String(amount),
                                                        }))
                                                    }
                                                />

                                                <button
                                                    type="button"
                                                    disabled={!validAmount || busyId === account.id}
                                                    onClick={() => void grant(account, amount)}
                                                    className="rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    {busyId === account.id ? "Granting…" : "Grant credits"}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
