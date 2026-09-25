"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { connectExtension } from "@/app/extension-callback/actions";

type Props = {
    state: string;
    email: string;
};

type Status =
    | { kind: "idle" }
    | { kind: "waiting" }
    | { kind: "done" }
    | { kind: "error"; message: string };

// How long to wait for site-bridge.js to confirm the extension took the token.
const ACK_TIMEOUT_MS = 4000;

export default function ConnectExtension({ state, email }: Props) {
    const [status, setStatus] = useState<Status>({ kind: "idle" });
    const [pending, startTransition] = useTransition();
    const timeoutRef = useRef<number | null>(null);

    useEffect(() => {
        function onMessage(event: MessageEvent) {
            if (event.source !== window || event.origin !== window.location.origin) return;
            if (event.data?.type !== "LODESTAR_EXTENSION_TOKEN_ACK") return;

            if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);

            setStatus(
                event.data.ok
                    ? { kind: "done" }
                    : { kind: "error", message: event.data.error ?? "The extension rejected this sign-in." }
            );
        }

        window.addEventListener("message", onMessage);

        return () => {
            window.removeEventListener("message", onMessage);
            if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
        };
    }, []);

    function connect() {
        startTransition(async () => {
            const result = await connectExtension();

            if (result.error !== null) {
                setStatus({ kind: "error", message: result.error });
                return;
            }

            setStatus({ kind: "waiting" });

            timeoutRef.current = window.setTimeout(() => {
                setStatus({
                    kind: "error",
                    message:
                        "The Lodestar extension didn't answer. Make sure it's installed and enabled, reload it, then click Sign in in the extension again.",
                });
            }, ACK_TIMEOUT_MS);

            window.postMessage({ type: "LODESTAR_EXTENSION_TOKEN", state, token: result.token }, window.location.origin);
        });
    }

    if (status.kind === "done") {
        return (
            <div className="mt-4" role="status">
                <p className="text-sm font-semibold text-[var(--foreground)]">The extension is connected.</p>
                <p className="mt-1 text-sm text-[var(--muted)]">You can close this tab and return to the extension.</p>
            </div>
        );
    }

    return (
        <div className="mt-4">
            <p className="text-sm text-[var(--muted)]">
                Connect the Lodestar Chrome extension to <strong className="text-[var(--foreground)]">{email}</strong>?
                It will be able to add your Canvas courses, assignments and announcements to your planner.
            </p>
            <p className="mt-2 text-xs text-[var(--muted)]">
                Only continue if you just clicked Sign in inside the extension.
            </p>

            {status.kind === "error" && (
                <p aria-live="polite" className="mt-3 rounded-lg border border-[var(--border)] px-3 py-2 text-xs text-[var(--status-overdue-text)]">
                    {status.message}
                </p>
            )}

            <button
                type="button"
                onClick={connect}
                disabled={pending || status.kind === "waiting"}
                className="mt-4 w-full rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-60"
            >
                {pending || status.kind === "waiting" ? "Connecting…" : "Connect extension"}
            </button>
        </div>
    );
}
