// Single source of truth for every Ollama call site in this repo. Previously
// duplicated inconsistently: some files hardcoded the URL (ignoring
// OLLAMA_URL entirely), and the ones that did read it disagreed on whether
// it should already include "/api/chat" — masked only because everyone
// happened to default to the same address.
export const OLLAMA_CHAT_URL = `${process.env.OLLAMA_URL ?? "http://127.0.0.1:11434"}/api/chat`;
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:3b-instruct";

// No call site set this explicitly before, so every request silently fell
// back to whatever the pulled model's Modelfile defaults to (often as low
// as 2048-4096 tokens) — a batch of a few real-world Canvas
// announcements/descriptions could exceed that without any error, just
// truncated context and corrupted output. One explicit, generous value
// here makes every call site's behavior predictable regardless of how
// Ollama happens to be configured locally.
export const OLLAMA_NUM_CTX = 8192;
