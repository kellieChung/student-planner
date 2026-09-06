import { LabelType } from "@/lib/taskLabel";

type ShortTitleItem = {
    id: string;
    name: string;
    course: string;
    typeCode: LabelType;
    deterministicShortTitle: string;
};

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434/api/chat";
const MODEL = "qwen2.5:3b-instruct";
const OLLAMA_TIMEOUT_MS = 15_000;

function buildItemBlock(item: ShortTitleItem, index: number): string {
    return `
ITEM ${index + 1}
NAME: ${item.name}
COURSE: ${item.course}
TYPE: ${item.typeCode}
REFERENCE ATTEMPT (from a simple keyword-stripping script, often wrong — feel free to ignore it and work from NAME instead): ${item.deterministicShortTitle}
`;
}

function fallbackResults(items: ShortTitleItem[]): Record<string, string> {
    return Object.fromEntries(items.map((item) => [item.id, item.deterministicShortTitle]));
}

// Truncates on a word boundary, same safety net deterministicShortTitle
// applies to its own output — guards against a verbose Ollama response.
function truncate(text: string, maxLength = 20): string {
    const trimmed = text.trim();
    if (trimmed.length <= maxLength) return trimmed;

    const cut = trimmed.slice(0, maxLength);
    const lastSpace = cut.lastIndexOf(" ");
    return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim();
}

/**
 * Shortens a batch of assignment titles via the local Ollama server, one
 * call for the whole batch (same reasoning as lib/analyzeAssignment.ts's
 * analyzeAssignments). Unlike that function's all-or-nothing batch
 * fallback, a malformed/missing entry here degrades to *that item's own*
 * `deterministicShortTitle` rather than failing the whole batch — safe
 * because every item already carries a valid fallback value. Never
 * throws — degrades to the deterministic values on any failure, per this
 * repo's Ollama-call convention.
 */
export async function generateShortTitles(
    items: ShortTitleItem[]
): Promise<Record<string, string>> {
    if (items.length === 0) return {};

    try {
        return await generateShortTitlesWithOllama(items);
    } catch {
        return fallbackResults(items);
    }
}

async function generateShortTitlesWithOllama(
    items: ShortTitleItem[]
): Promise<Record<string, string>> {
    const prompt = `
You are helping shorten assignment titles for a compact planner card. Each item's course and type are shown ELSEWHERE on the card, so your shortened title must NOT repeat the course name or the type word (e.g. don't say "homework" or "reading" again). Also drop generic scheduling noise (a week number like "Week 3", a weekday name like "Tuesday") — that's shown elsewhere too and never a useful distinguishing detail.

Your job: find the single most important, distinguishing piece of information in the NAME — a number, a page range, a topic, a book/subject name, or a specific description — and output ONLY that, in as few words as possible (ideally 1-4 words, well under 20 characters). Work from NAME directly; don't just trim the REFERENCE ATTEMPT, which is often low-quality.

Examples of the transformation wanted:
"Week 3 Tuesday In-Class Assignment" -> "In-Class Assignment"
"Reading: Beowulf pages 113-207" -> "Beowulf 113-207"
"Homework 2" -> "HW 2"
"Chapter 4 Problem Set" -> "Ch 4"

Now shorten each of the following ${items.length} items the same way:

${items.map(buildItemBlock).join("\n")}

RETURN ONLY VALID JSON, with exactly one entry per item above, in this exact shape:

{
  "results": [
    { "index": 1, "shortTitle": "..." }
  ]
}

Rules:
- "index" must match the ITEM number above (1-based).
- Do not include markdown or any text outside the JSON.
`;

    const response = await fetch(OLLAMA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
        body: JSON.stringify({
            model: MODEL,
            messages: [{ role: "user", content: prompt }],
            stream: false,
            options: {
                num_predict: 60 + 40 * items.length,
            },
        }),
    });

    if (!response.ok) {
        throw new Error(`Ollama request failed with status ${response.status}`);
    }

    const data = await response.json();
    const content = data?.message?.content;

    if (typeof content !== "string") {
        throw new Error("Ollama returned an invalid response.");
    }

    let parsed: { results?: unknown };
    try {
        parsed = JSON.parse(content);
    } catch {
        throw new Error(`Ollama returned invalid JSON:\n${content}`);
    }

    if (!Array.isArray(parsed.results)) {
        throw new Error("Ollama response did not contain a results array.");
    }

    const resultsByIndex = new Map<number, Record<string, unknown>>();
    for (const entry of parsed.results) {
        if (entry && typeof entry === "object" && typeof (entry as { index?: unknown }).index === "number") {
            resultsByIndex.set((entry as { index: number }).index, entry as Record<string, unknown>);
        }
    }

    const output: Record<string, string> = {};

    items.forEach((item, i) => {
        const entry = resultsByIndex.get(i + 1);
        const shortTitle = entry && typeof entry.shortTitle === "string" ? entry.shortTitle.trim() : "";

        output[item.id] = shortTitle ? truncate(shortTitle) : item.deterministicShortTitle;
    });

    return output;
}
