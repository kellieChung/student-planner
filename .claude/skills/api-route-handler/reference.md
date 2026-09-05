# Reference: route handler patterns in this repo

## Session-only auth (browser app)

`app/api/planner/route.tsx` — the simplest case, browser-session only:

```ts
const session = await auth();
if (!session?.user?.email) {
    return NextResponse.json({ success: false, error: "You must be logged in." }, { status: 401 });
}
const user = await prisma.user.findUnique({ where: { email: session.user.email } });
if (!user) {
    return NextResponse.json({ success: false, error: "User not found." }, { status: 404 });
}
```

## Session + Bearer token fallback (extension-facing)

`app/api/canvas/sync/route.ts` — accepts either a browser session or a
`Bearer` token issued to the Chrome extension:

```ts
const session = await auth();
let userId: string | null = null;

if (session?.user?.email) {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (user) userId = user.id;
}

if (!userId) {
    const authorization = request.headers.get("authorization");
    if (!authorization) {
        return NextResponse.json({ success: false, error: "You must be logged in." }, { status: 401 });
    }
    if (!authorization.startsWith("Bearer ")) {
        return NextResponse.json({ success: false, error: "Invalid authorization header." }, { status: 401 });
    }
    const token = authorization.substring("Bearer ".length);
    const extensionSession = await prisma.extensionSession.findUnique({ where: { token } });
    if (!extensionSession) {
        return NextResponse.json({ success: false, error: "Invalid or expired session." }, { status: 401 });
    }
    userId = extensionSession.userId;
}
```

Use this dual-path pattern for any route the extension needs to call
directly (i.e. it can't rely on a same-origin browser cookie session).

## Ollama call with timeout + fallback

`app/api/task-xp/route.ts` is the reference — note the pieces
`lib/analyzeAssignment.ts` is currently missing (don't copy that gap):

```ts
const fallback = fallbackXp(task); // deterministic, keyword-based

try {
    const response = await fetch(`${process.env.OLLAMA_URL ?? "http://127.0.0.1:11434"}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(12_000),
        body: JSON.stringify({ /* ... */ }),
    });

    if (!response.ok) return NextResponse.json(fallback);
    // parse, validate, normalize the model's JSON output before trusting it
} catch {
    return NextResponse.json(fallback);
}
```

Key points:
- Timeout via `AbortSignal.timeout(...)` so a hung local model doesn't hang
  the request.
- `OLLAMA_URL` / model name are read from `process.env` with a sane default,
  not hardcoded — `lib/analyzeAssignment.ts` hardcodes both; prefer the
  env-var style for new code.
- Never trust the model's JSON directly — normalize/clamp every numeric
  field (see `normalizeXp`, `normalizeAnalysis` in the existing routes)
  before returning it to the client.

## Input validation

`app/api/task-planning/route.ts` shows narrowing an `unknown[]` body into a
typed array without a schema library:

```ts
const body = await request.json() as { tasks?: unknown };
tasks = Array.isArray(body.tasks)
    ? body.tasks.slice(0, 40).filter(
          (task): task is PlanningTask =>
              typeof task === "object" &&
              task !== null &&
              typeof (task as PlanningTask).id === "string" &&
              typeof (task as PlanningTask).name === "string"
      )
    : [];
```

Note the `.slice(0, 40)` cap — bound array sizes from client input before
doing per-item work (especially before per-item AI calls).
