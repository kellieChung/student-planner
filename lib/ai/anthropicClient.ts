import Anthropic from "@anthropic-ai/sdk";
import {
    ANTHROPIC_INPUT_COST_PER_MTOK,
    ANTHROPIC_OUTPUT_COST_PER_MTOK,
} from "@/lib/anthropicConfig";

// Constructed lazily, and only ever reached from an Anthropic path (every
// call site gates on isAnthropicEnabled first) — the SDK client throws at
// construction time if it can't resolve any credential, so building it
// unconditionally at module load would break the Ollama-only fallback for
// anyone without the key set.
let anthropicClient: Anthropic | null = null;

export function isAnthropicEnabled(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function getAnthropicClient(): Anthropic {
    if (!anthropicClient) {
        // The SDK's default of 2 retries can triple a stuck call's wall time;
        // every caller already has its own timeout and fallback.
        anthropicClient = new Anthropic({ maxRetries: 1 });
    }

    return anthropicClient;
}

export function logAnthropicUsage(label: string, response: Anthropic.Message): void {
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;

    const cost =
        (inputTokens / 1_000_000) * ANTHROPIC_INPUT_COST_PER_MTOK +
        (outputTokens / 1_000_000) * ANTHROPIC_OUTPUT_COST_PER_MTOK;

    console.log(
        `Anthropic ${label}: ${inputTokens} in / ${outputTokens} out (~$${cost.toFixed(4)})`
    );
}

// Normalizes the SDK's typed errors into plain messages carrying the call
// site's label, so every caller's catch/log reads the same way.
export function describeAnthropicError(label: string, error: unknown): Error {
    if (error instanceof Anthropic.AuthenticationError) {
        return new Error(`Anthropic ${label} authentication failed: ${error.message}`);
    }

    if (error instanceof Anthropic.RateLimitError) {
        return new Error(`Anthropic ${label} rate limited: ${error.message}`);
    }

    if (error instanceof Anthropic.APIConnectionError) {
        return new Error(`Anthropic ${label} connection failed: ${error.message}`);
    }

    if (error instanceof Anthropic.APIError) {
        return new Error(`Anthropic ${label} request failed: ${error.status} ${error.message}`);
    }

    return error instanceof Error ? error : new Error(String(error));
}

// Returns the forced tool call's parsed input, or throws if the model
// didn't produce one. A response cut off at max_tokens is treated as a
// failure rather than partially trusted — otherwise the tail entries would
// silently fall back and get persisted as if they were real answers.
export function getToolInput(response: Anthropic.Message, toolName: string): unknown {
    if (response.stop_reason === "max_tokens") {
        throw new Error(`Anthropic ${toolName} response was truncated at max_tokens.`);
    }

    const toolUse = response.content.find(
        (block): block is Anthropic.ToolUseBlock =>
            block.type === "tool_use" && block.name === toolName
    );

    if (!toolUse) {
        throw new Error(`Anthropic did not return the expected ${toolName} tool call.`);
    }

    return toolUse.input;
}
