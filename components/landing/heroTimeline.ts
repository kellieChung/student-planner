// Scroll progress (0–1 through the pinned hero) at which each beat happens.
// ScrollHero exposes these to CSS as custom properties, and HeroConstellation
// derives every star/edge start from them, so the line finishes drawing at the
// same instant the headline finishes settling. Progress 0.85–1 is a hold: the
// finished frame stays put before the pinned stage releases.
export const HERO_SCREENS = 2.6;
export const INTRO_END = 0.12;
export const DRAW_START = 0.12;
export const DRAW_END = 0.85;
export const FINAL_START = 0.6;
