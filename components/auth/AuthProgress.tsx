"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import ConstellationFigure from "@/components/starchart/ConstellationFigure";
import { getConstellation } from "@/lib/constellations";

type AuthProgress = {
    lit: number;
    setLit: (lit: number) => void;
};

const AuthProgressContext = createContext<AuthProgress | null>(null);

const constellation = getConstellation("cassiopeia")!;
export const AUTH_STAR_COUNT = constellation.stars.length;

// Lets the form (which owns the field state) light stars in a constellation
// rendered elsewhere in the card, without turning the whole page client-side.
export function AuthProgressProvider({ children }: { children: ReactNode }) {
    const [lit, setLit] = useState(0);
    const value = useMemo(() => ({ lit, setLit }), [lit]);

    return <AuthProgressContext.Provider value={value}>{children}</AuthProgressContext.Provider>;
}

export function useAuthProgress() {
    return useContext(AuthProgressContext);
}

export default function AuthConstellation() {
    const lit = useAuthProgress()?.lit ?? 0;
    const charted = new Set(Array.from({ length: lit }, (_, index) => index));

    return (
        <ConstellationFigure
            constellation={constellation}
            charted={charted}
            igniting={lit > 0 ? new Set([lit - 1]) : undefined}
            celebrate={lit === AUTH_STAR_COUNT}
            className="auth-constellation mx-auto mb-3 w-36"
        />
    );
}
