"use client";

import {signIn} from "next-auth/react";

export default function SignInButtoN() {
    return (
        <button onClick={() => signIn("google")}>
            Sign in with Google
        </button>
    );
}