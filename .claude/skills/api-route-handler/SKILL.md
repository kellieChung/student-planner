---
name: api-route-handler
description: Use when creating or editing a Next.js App Router route handler under app/api/**/route.ts in this repo (new endpoint, adding a method, adding auth to an existing one). Not for React components or lib/ utility functions.
metadata:
  type: project
---

# Writing app/api/**/route.ts handlers in this repo

Every existing route handler follows the same shape. New/edited handlers
should match it rather than inventing a new error-handling or auth style.

## Shape

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
    try {
        const session = await auth();

        if (!session?.user?.email) {
            return NextResponse.json(
                { success: false, error: "You must be logged in." },
                { status: 401 }
            );
        }

        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
        });

        if (!user) {
            return NextResponse.json(
                { success: false, error: "User not found." },
                { status: 404 }
            );
        }

        // ...scope every Prisma query by user.id from here on...

        return NextResponse.json({ success: true, /* ... */ });
    } catch (error) {
        console.error("❌ Failed to <do the thing>:", error);
        return NextResponse.json(
            { success: false, error: "Something went wrong." },
            { status: 500 }
        );
    }
}
```

## Rules

1. **Auth**: look up the user via `auth()` → `session.user.email` →
   `prisma.user.findUnique`. Never trust a client-supplied `userId`. Scope
   every query by the resolved `user.id`.
2. **Extension-facing routes** (anything the Chrome extension in
   `canvas-extension/` calls) must also accept a `Bearer <token>` checked
   against `prisma.extensionSession`, as a fallback when there's no browser
   session — see `app/api/canvas/sync/route.ts` for the exact pattern before
   reimplementing it.
3. **Errors**: catch at the top level of the handler, `console.error` with
   context, return `{ success: false, error }` with an appropriate status
   (400 bad input, 401 unauthenticated, 404 missing resource, 500 unexpected).
   Don't leak raw error objects/stack traces in the JSON response.
4. **Calling the local Ollama server**: always pair with a deterministic
   fallback (see `fallbackAnalysis`/`fallbackXp` in
   `app/api/task-planning/route.ts` / `app/api/task-xp/route.ts`) and an
   `AbortSignal.timeout(...)` on the `fetch` — the Ollama server may not be
   running, and a hung request shouldn't hang the route.
5. **Validation**: parse `await request.json()` inside a `try/catch` and
   return 400 on failure; narrow `unknown` body fields explicitly (see the
   `PlanningTask` filter in `app/api/task-planning/route.ts`) rather than
   trusting the shape.
6. Match the surrounding 4-space indentation and double-quote style — see
   the root `CLAUDE.md` conventions section.

For the full annotated reference (including the extension Bearer-token
branch in detail), see `reference.md` in this folder.
