"use client";

import { createContext, useContext } from "react";

// The LaptopFrame layer that floating windows live in. Windows whose state
// lives deep inside the scrolling planner (the Rundown) portal into it so
// they float over the app instead of scrolling with the page.
export const FloatingLayerContext = createContext<HTMLElement | null>(null);

export function useFloatingLayer(): HTMLElement | null {
    return useContext(FloatingLayerContext);
}
