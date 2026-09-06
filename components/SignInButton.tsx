"use client";

import {signIn} from "next-auth/react";

export default function SignInButtoN() {
    return (
        <button
            onClick={() => signIn("google")}
            className="mb-4 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)]"
        >
            Sign in with Google
        </button>
    );
}