"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type CoursesRemoteContextValue = {
    coursesVersion: number;
    bumpCoursesVersion: () => void;
};

const CoursesRemoteContext = createContext<CoursesRemoteContextValue | null>(null);

export function useCoursesRemote(): CoursesRemoteContextValue {
    const ctx = useContext(CoursesRemoteContext);
    if (!ctx) throw new Error("useCoursesRemote must be used within CoursesRemoteProvider");
    return ctx;
}

// Bridges CoursesPanel (mounted inside the Courses OS window, itself a
// child of LaptopFrame) back up to WeeklyPlannerView (an ancestor of
// LaptopFrame's Taskbar, but a descendant of LaptopFrame itself, so it
// can't receive an onChanged prop directly) — same cross-boundary problem
// PomodoroRemoteContext/MusicRemoteContext already solve for their apps,
// just a one-way "something changed" signal instead of live engine state.
export function CoursesRemoteProvider({ children }: { children: ReactNode }) {
    const [coursesVersion, setCoursesVersion] = useState(0);

    const bumpCoursesVersion = useCallback(() => {
        setCoursesVersion((v) => v + 1);
    }, []);

    const value = useMemo<CoursesRemoteContextValue>(
        () => ({ coursesVersion, bumpCoursesVersion }),
        [coursesVersion, bumpCoursesVersion]
    );

    return <CoursesRemoteContext.Provider value={value}>{children}</CoursesRemoteContext.Provider>;
}
