import { createHash } from "crypto";

// ExtensionSession.token stores only this hash, so a database read (local dev
// shares the production DB) never yields a usable Bearer token.
export function hashExtensionToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

export const EXTENSION_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function readBearerToken(request: Request): string | null {
    const authorization = request.headers.get("authorization");

    if (!authorization || !authorization.startsWith("Bearer ")) {
        return null;
    }

    return authorization.substring("Bearer ".length).trim() || null;
}
