---
name: commit-message
description: Use when writing the commit message for a `git commit` in this repo — right before staging/committing, or when asked to "write a commit message" / "commit this". Not for PR descriptions.
metadata:
  type: project
---

# Commit messages

Conventional Commits:

```
<type>(<scope>): <summary, lowercase, imperative, no trailing period>

<optional body: the why, not the what>
```

- **type:** `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `style`, `perf`.
- **scope:** `planner`, `ai`, `extension` (`canvas-extension/`), `auth`, `music`, `gamification`, `pomodoro`, `db`; omit if repo-wide.
- Body only when the *why* isn't obvious (workaround, tradeoff, bug root cause). Skip it for mechanical changes.
- One logical change per commit; split unrelated areas (e.g. a `lib/utils.ts` fix apart from a new feature).
- If `prisma/schema.prisma` changed, mention the migration in the body (e.g. "requires `prisma migrate dev`").
- Never name internal tools or this assistant in the subject.
- End the body with the attribution lines the session was given (Co-Authored-By, etc.).

Example: `fix(planner): refresh the weekly grid when a proposed task is accepted` — body: "Accepted tasks weren't triggering a re-render."
