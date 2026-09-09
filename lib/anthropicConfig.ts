// Single source of truth for the one Anthropic call site in this repo
// (lib/ai/analyzeAnnouncement.ts), mirroring lib/ollamaConfig.ts's pattern.
// Cheapest current-generation model on purpose — announcement extraction is
// a structured-extraction task, not one that needs frontier reasoning, and
// the user is running against a small, explicitly cost-capped API credit.
export const ANTHROPIC_MODEL = "claude-haiku-4-5";

// Per-million-token pricing, used only to log an estimated $ cost per call
// (see analyzeAnnouncement.ts) so actual spend against that cap is visible
// in the dev console without any persistent tracking.
export const ANTHROPIC_INPUT_COST_PER_MTOK = 1.0;
export const ANTHROPIC_OUTPUT_COST_PER_MTOK = 5.0;
