# Example commit messages

Rewriting recent real commits from this repo into the new format, to show
the mapping from "what actually happened" to a Conventional Commit:

| Old subject (actual history) | New style |
|---|---|
| `refinement of ui with embedded video window` | `feat(music): embed video window in player UI` |
| `got playlist importing from youtube working, ui looks ugly now` | `feat(music): import YouTube playlists`<br>body: `UI is unstyled; follow-up commit will restyle.` |
| `music player progress` | too vague to convert as-is — split into the actual sub-changes, e.g. `feat(music): add play/pause and track queue` |
| `added rudimentary pomodoro timer` | `feat(pomodoro): add basic timer` |
| `fixed the tasks not updating into schedule view when proposed task is accepted` | `fix(planner): refresh schedule view when a proposed task is accepted`<br>body: `Accepted tasks weren't triggering a re-render of the weekly grid.` |
| `sync button on extension officially syncs assignments to planner` | `feat(extension): sync assignments to planner on button click` |
| `worked on auth for chrome extension (kinda chopped)` | avoid landing WIP commits like this at all; if unavoidable: `wip(extension): partial OAuth flow for extension auth` |

## New-file examples for this codebase's actual pending changes

Given the current untracked/modified files (`lib/prioritization.ts`,
`lib/analyzeAssignment.ts`, `lib/prioritization.test.ts`,
`app/api/task-planning/route.ts`, `components/WeeklyPlannerView.tsx`,
`lib/utils.ts`, `types/taskPlanning.ts`), a reasonable split:

```
feat(ai): add priority scoring from AI-estimated importance/difficulty

Introduces calculatePriority() (urgency-weighted) and analyzeAssignment()
(Ollama-backed with keyword fallback), wired into the task-planning API
route and the weekly planner view.
```

If the diff is large and spans unrelated concerns, prefer several small
commits over one big one — e.g. separate the `lib/utils.ts` grid-span fix
from the new prioritization feature if they aren't actually related.
