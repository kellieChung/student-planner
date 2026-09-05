---
name: commit-message
description: Use when writing the commit message for a `git commit` in this repo — i.e. right before staging/committing changes, or when the user asks "write a commit message" / "commit this". Not for PR descriptions.
metadata:
  type: project
---

# Commit messages for this repo

This repo's history so far is informal, free-text subjects (see `git log`:
"got playlist importing from youtube working, ui looks ugly now"). Going
forward, use **Conventional Commits** instead — it makes the history
scannable now that the project has multiple moving areas (planner, AI
scoring, extension, music, gamification).

## Format

```
<type>(<scope>): <short summary, imperative, no trailing period>

<optional body: why, not what>
```

- `type`: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `style`, `perf`.
- `scope`: the area touched — one of `planner`, `ai` (Ollama/prioritization),
  `extension` (canvas-extension/), `auth`, `music`, `gamification`,
  `pomodoro`, `db` (Prisma schema/migrations), or omit if repo-wide.
- Summary: lowercase, imperative mood ("add", not "added"/"adds").
- Body only when the *why* isn't obvious from the diff — e.g. a workaround,
  a tradeoff, or a bug root cause. Skip it for small mechanical changes.

## Examples

See `examples.md` in this folder for full before/after examples drawn from
this repo's actual recent commits.

## Rules

- One logical change per commit; don't bundle unrelated areas.
- If the diff touches `prisma/schema.prisma`, mention the migration in the
  body (e.g. "requires `prisma migrate dev`").
- Never mention internal tool names or this assistant in the subject line.
- Always end the message body with the attribution lines this session has
  been given (Co-Authored-By / Claude-Session), per top-level instructions —
  this skill only governs the subject/body content above that.
