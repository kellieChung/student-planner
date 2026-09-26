---
name: api-route-handler
description: Use when creating or editing a Next.js App Router route handler under app/api/**/route.ts in this repo (new endpoint, adding a method, adding auth to an existing one). Not for React components or lib/ utility functions.
metadata:
  type: project
---

# Writing `app/api/**/route.ts` handlers

Match the existing shape; don't invent a new auth or error style.

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
    try {
        const session = await auth();

        if (!session?.user?.email) {
            return NextResponse.json({ success: false, error: "You must be logged in." }, { status: 401 });
        }

        const user = await prisma.user.findUnique({ where: { email: session.user.email } });

        if (!user) {
            return NextResponse.json({ success: false, error: "User not found." }, { status: 404 });
        }

        // scope every Prisma query by user.id from here on
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Failed to <do the thing>:", error);
        return NextResponse.json({ success: false, error: "Something went wrong." }, { status: 500 });
    }
}
```

## Rules
1. **Auth:** resolve the user as above; never trust a client `userId`; scope every query by `user.id`.
2. **Extension-facing routes** (called by `canvas-extension/`, no cookie session) also accept `Authorization: Bearer <token>` checked against `prisma.extensionSession` (`token` → `userId`); 401 for a missing/malformed header or unknown token. Copy the dual-path pattern from `app/api/canvas/sync/route.ts`.
3. **Errors:** catch at the top level, `console.error` with context, return `{ success: false, error }` with 400 (bad input) / 401 / 404 / 500; never leak raw errors or stacks.
4. **AI calls:** always a timeout (`AbortSignal.timeout`) plus a deterministic fallback; normalize/clamp model output; use `lib/ai/anthropicClient.ts` (Haiku) when `ANTHROPIC_API_KEY` is set, else Ollama (`lib/ollamaConfig.ts`).
5. **Validation:** parse `await request.json()` in a `try/catch` (400 on failure); narrow `unknown` fields explicitly and cap array sizes from client input (e.g. `.slice(0, 40)`) before per-item work, especially per-item AI calls (see `app/api/task-planning/route.ts`).
6. 4-space indent, double quotes (`CLAUDE.md`).
