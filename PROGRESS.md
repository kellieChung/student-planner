# Progress log

Read this before starting work in this repo; update it before ending a
session. Keep entries short — this is a scratchpad for continuity, not
documentation (that's what `CLAUDE.md` and code comments are for).

## Architecture decisions

**Onboarding explains the extension (2026-09-24)**
- New tour step `extension` (right after the welcome card, centred, no
  `data-tour` anchor) says why the Chrome extension is needed and how to
  install it. `EXTENSION_STORE_URL` in `lib/extensionInstall.ts` is `null` for
  the alpha, so the step shows load-unpacked instructions (unzip, open
  `chrome://extensions`, Developer mode, Load unpacked). **When the extension
  is published, set that constant to the Web Store URL** and the step shows a
  "Get the extension" button instead. Previewed on a throwaway page (deleted);
  not seen inside the real signed-in tour or via `/dev/onboarding`.

**Extension popup redesign (2026-09-24)**
- **The backend URL is `APP_ORIGIN` in `canvas-extension/config.js`, and
  nothing in the UI exposes it.** `background.js` loads it with
  `importScripts("config.js")`, ignores any stored `appOrigin`, and removes that
  key on startup (an old localhost value must not silently redirect a real
  user). **Local dev = edit `config.js` to `http://localhost:3000`, reload the
  extension, and change it back before committing.** (No build step exists, so
  a build-time env var wasn't an option; a hidden debug override was declined.)
- Popup is re-themed to Night/Day (tokens copied from `app/globals.css`), with
  Manrope/Spectral bundled in `canvas-extension/fonts/` (SIL OFL; latin subset
  only) rather than fetched per popup open. Theme mirroring from the web app is
  unchanged. All emoji removed from UI and console logs; icons are an inline SVG
  `<symbol>` sprite in `popup.html`.
- `popup.js` renders everything from one `state` object via `render()`. While a
  sync runs the Sync button is replaced by progress + Cancel (Cancel is never
  shown otherwise). Status chips (`.chip`) are deliberately flat, non-focusable
  pills; buttons are `.btn`. Rare recovery (restore a deleted course) lives in a
  closed Troubleshooting `<details>`. Header constellation lights one star per
  step: signed in, Canvas connected, synced.
- **Canvas URL:** auto-detected from open tabs (hostname heuristic, then a
  yes/no `IS_CANVAS_PAGE` reply from `content.js` checking Canvas DOM markers),
  else a `[name].instructure.com` field that also accepts a full pasted host.
  Connecting still verifies `/api/v1/users/self`. No searchable school list (no
  official list exists; user chose this). No new permissions.
- Verified only via a mock-`chrome` harness (screenshots of the real popup at
  340px: signed out, detected, connected, running, synced, error, Day,
  Troubleshooting open; height 337-431px, no scroll). **Not verified in real
  Chrome:** Google sign-in, tab detection and the `ic-app` DOM marker against a
  real Canvas page (incl. a custom-domain school), a real sync + cancel,
  restore course, reaching the app via `config.js`.
- The popup header and the toolbar/manifest icons use the real (temporary)
  brand mark: `canvas-extension/icons/icon-{16,32,48,128}.png`, resized from
  `public/brand/lodestar-mark-temp.png`. **Regenerate them when the final logo
  replaces the temp one** (added to the temp-logo TODO).

**Login screen polish (2026-09-24)**
- Sign in / Create account is a segmented control (equal weight, soft gold tint
  + gold underline when active); solid gold is reserved for the Google and
  submit buttons. **Confirm password is gone** — replaced by a show/hide eye
  toggle on the single Password field, and `signUp` in `app/login/actions.ts` no
  longer reads/compares `confirmPassword` (`/settings/account` still has its
  own confirm field). Under Password a live checklist (`aria-describedby`)
  shows the rules.
- **Password policy (user decision, 2026-09-24): 8–128 chars + an uppercase
  letter + a special character** (`lib/passwordRules.ts`, Node-free so the
  form runs the same checks the server enforces). Sign-up's submit is disabled
  until all three pass; `signUp` and `changePassword` re-check server-side.
  Sign-in is deliberately unchecked (existing passwords predate the rule).
  This supersedes the earlier "no composition rules (NIST)" note under Auth.
- Every field uses an explicit `<label htmlFor>` (`useId`). Checkboxes
  (`ConsentCheckboxes`, shared with `/accept-terms`) are custom: navy box, gold
  fill + a sibling SVG check (a CSS var can't go in a background-image URI).
- **New token `--field-border`** (Night `#7d86ab`, Day `#857d66`): the old
  `--border` was 1.66:1 / 1.55:1 against the panel, under WCAG 1.4.11's 3:1 for
  form controls. Inputs, checkboxes and the toggle use it; text contrast
  already passed (muted 8.35:1/7.73:1, gold links 9.29:1/5.27:1). Focus ring:
  `.auth-page :is(a, button, input):focus-visible` (2px gold) — put
  `auth-page` on any new auth screen's `<main>`.
- Static stars on `/login` via `StarField` (`twinkle={false}`, `sizeScale={1.5}`,
  90 stars) inside a `sky relative overflow-hidden` main, plus faint fully
  charted Orion / Big Dipper behind the card (md+ only); all `.auth-stars`,
  hidden in Day. A small Cassiopeia in the card header (`AuthProgress.tsx`,
  context shared with `CredentialsForm`) lights stars as required steps are
  done (sign-up: email, password, 13+, terms; sign-in: email, password) and
  redraws its lines when the form is complete. `.auth-constellation` recolours
  it with the accent in Day.
- Verified in-browser: layout, checkbox, eye toggle, focus ring, label
  association, Day theme, short-password server error. Not verified: a real
  sign-up/sign-in (shared prod DB), `/accept-terms` rendering (needs a signed-in
  user), keyboard ring on every stop, narrow phone width. Known, pre-existing:
  React resets the form after a failed action, so consent checkboxes and the
  password clear on an error.

**Landing hero: scroll-linked constellation, parallax, demo (2026-09-24)**
- `ScrollHero.tsx` (client) is a thin shell: one passive scroll listener + rAF
  writes `--p` (0–1 through the hero) on the `<header>`; nothing re-renders per
  frame. All motion is CSS `calc()`/`clamp()` off `--p` (`.ls-hero*` in
  `globals.css`). The stage is `position: sticky` inside a `2.6 × 100svh`
  header (`svh`, so the mobile URL bar can't resize it mid-scroll). **Never put
  `overflow: hidden/auto` on an ancestor of the stage** — it silently breaks
  sticky; clipping lives on the stage itself.
- Timeline constants live in `components/landing/heroTimeline.ts`: sky draws
  over p 0.12–0.85, headline settles over 0.60–0.85 (finishes with the last
  edge), 0.85–1.0 is a hold. `HeroConstellation.tsx` (server) derives each
  star/edge start from them; edges use real `Math.hypot` lengths for
  `stroke-dasharray/offset` (no `pathLength`, flaky on `<line>` in WebKit).
- Parallax = three layers at -4vh / -10vh / -22vh × p (far dim starfield, mid
  starfield, constellation). No-JS and `prefers-reduced-motion` pin `--p: 1`
  (finished sky, plain one-screen hero). `data-settled` (set at p ≥ 0.85)
  gates the headline CTA's pointer-events; `:focus-within` reveals it for
  keyboard users. The nav (with a small "Get started" pill) lives in the
  pinned stage so the CTA is reachable before the headline appears.
- `DemoPlanner.tsx` ("Try it" section under the hero): 5 cards labelled via the
  real `formatTaskLabel`, built server-side in `demoTasks.ts` and passed as
  props — importing `lib/taskLabel` in a client component would drag the
  Anthropic SDK into the bundle. Star i ↔ task i of Cassiopeia (reuses
  `ConstellationFigure`); Starlight values are illustrative. Styled with
  `--ls-*` tokens, deliberately not inside `.theme-surface` (Day theme would
  turn it cream).
- Verified: `tsc`, eslint on changed files, in-browser at desktop and 390×667 /
  390×844 (via iframes — this window couldn't be resized), scroll draw, demo
  clicks incl. full celebration. **Not verified:** `npm run build` (a dev server
  owned `.next`), Safari/Firefox, real-phone scroll feel, reduced-motion/no-JS
  rendering (by CSS reading only), landscape phone.

**Per-check announcement cap (2026-09-24)**
- `MAX_ANNOUNCEMENTS_PER_CHECK = 10` (`lib/analysisLimits.ts`, shared by route
  and UI) bounds Anthropic spend per check. The route slices the eligible
  (unanalyzed, or all for regenerate) announcements to the newest 10; an
  explicit selection over 10 is a 400 before any charge. The Rundown controls
  default-select the newest 10, block ticking an 11th, and say so in the quota
  banner, the range warning and the button labels ("Check the newest 10 of 23").
  Leftovers just stay unanalyzed for the next check.
- A run's charged ids are stored on its `detection_pass_triggered` event
  (`announcementIds`); a **resume** is restricted to those
  (`findRunAnnouncementIds`), so pause/resume can't analyze past the cap.
- Not live-verified in a signed-in browser (cap UI, 400 path, resume scoping
  were checked by tsc/lint and a ledger script only).

**Rundown candidate card: compact by default (2026-09-24)**
- `RundownCandidateCard` is collapsed by default: name (+ pencil edit icon),
  confidence pill, `Subject · TYPE`, compact `Due Fri, Sep 25` (click → inline
  date input), a one-line `May duplicate: <name> (due 9/28)` when flagged, and
  Maybe (ghost) / No (outline) / Yes (solid). "Show evidence" opens the
  highlighted excerpt (±160 chars, "Show full announcement" for the whole text),
  the AI's reading and the full Canvas comparison. Emoji replaced by stroke
  icons (`components/brand/Icons.tsx`).
- **Highlight root cause:** the model quotes the text from
  `extractActionableHtml` (spaces where tags were) but the card searched
  `stripHtmlForDisplay` output (tags deleted, no space) — 14 of 31 stored
  quotes missed. `findEvidenceRange` now falls back to a whitespace/emoji-
  selector/quote-insensitive match mapped back to real offsets (31/31 on
  stored data). Gotcha: index maps must be per UTF-16 unit — per code point
  drifted after emoji.
- Gotcha: `app/globals.css` remaps any class *containing* `bg-red-50` /
  `border-red-` under `.theme-surface`, so `hover:bg-red-500/10` is always on.
  Use the `--status-overdue-text` token instead.

**Announcement analyzer: quota, credits, pause/resume, regenerate, dev dashboard (2026-09-24)**
- **Duplicate review diagnosis:** the Haiku duplicate checker works (live probe
  returned real `checked` verdicts). The "unavailable" verdicts the user saw
  were 30 stored snapshots from the Ollama era (written ~2h before the Haiku
  commit), and nothing could re-run them: `aiAnalyzedHash` was null on all 34
  announcements and every in-window one had review rows, so step 7a treated
  them as "legacy reviewed" and skipped them forever. Fixes: **regenerate**
  (`regenerate: true` skips the hash/backfill filter for the range, costs 1
  check) and `handleNewCandidates` now *replaces* a same-key pending candidate
  (it used to keep the stale snapshot).
- **Quota** (`lib/aiRateLimit.ts`, `types/aiQuota.ts`): 2 weekly checks + bonus
  credits, spent weekly-first. All derived from `AiTaskEvent` (no migration):
  `detection_pass_triggered` (tagged `paidWithCredit` + `runId`),
  `detection_credit_granted {amount, grantedBy}`, `detection_pass_paused`. A
  credit-paid run is excluded from the weekly count. Quota rides in the
  dry-run JSON, stream frames (`start`/`done`/`paused`) and the 429 body.
- **The dev-account rate-limit bypass is gone.** `DEV_ACCOUNT_EMAILS` now only
  unlocks `/dev` + `/api/dev/*`; dev accounts use credits like anyone.
- **Pause/resume:** cooperative, one connection. `POST
  /api/ai/analyze-announcements/pause {runId}` logs an event; the stream checks
  it before starting each batch (`mapWithConcurrency`'s new `shouldStop`),
  finishes in-flight batches, sends a `paused` frame. Resume = same body +
  `resumeRunId`; free if the runId's original charge exists within 24h.
  Client disconnect (`cancel()`) also stops new batches. After every run/pause
  the planner refetches `/api/rundown-candidates` (paused in-flight results
  persist server-side; stale pending rows are deleted on re-extraction).
- **Regenerate caveat:** decided candidates stay decided, but a model
  re-wording changes the `suggestionKey` and can resurface a declined item.
- **Dev dashboard `/dev`** (`components/dev/DevDashboard.tsx`): Accounts &
  credits, Analyzer tools (own-account reset: nulls `aiAnalyzedHash`, deletes
  all suggestion reviews, optionally this week's used checks), onboarding
  preview + map editor launchers, embedded gamification panel. All `/dev/*`
  pages now go through `app/dev/requireDevUser.ts` (404 for non-dev) — they
  were open to any logged-in user before. Settings popover shows a "Dev
  dashboard" link for dev accounts.
- Verified: `tsc`, `next build`, ledger script on test2@example.com (11 checks,
  cleaned up), 401s on the new routes. **Not live-verified** (no signed-in
  browser): the Rundown quota banner, pause/resume/regenerate UI, `/dev`.

**Full-screen app, Rundown window, The Watch / Comms (2026-09-24)**
- The app is full-bleed: `PlannerHome`'s `<main>` is `h-dvh w-full` (dvh
  tracks the visible viewport; 100vh/`w-screen` left a strip and a
  scrollbar-width overflow), and LaptopFrame has no border, rounding or
  padding. `WindowManagerContext` clamps every window to the viewport on
  open and on browser resize (`clampToViewport`).
- The Rundown is a normal floating window (`WindowAppId` `"rundown"`,
  `components/rundown/RundownWindow.tsx`, renamed from RundownOverlay).
  Its state still lives in WeeklyPlannerView (`showRundown` + `onClose`
  marks it viewed), so it **portals** into LaptopFrame's floating layer
  (`useFloatingLayer()`); rendered in place it would scroll with the
  planner. Its `isOpen` is never restored from localStorage, so it only
  auto-opens when there's something new. The taskbar button calls
  `openWindow("rundown")` too, which restores it if minimised.
- Bottom gap: the taskbar is `sticky bottom-0` inside the scroller, so with
  short content it hugged the content, not the screen. PlannerHome's wrapper
  is `flex min-h-full flex-col` and the planner shell `flex-1`, pushing the
  bar to the bottom edge. The Watch (`PomodoroTimer`) uses theme tokens
  directly (it isn't inside `.theme-surface`, so raw slate/indigo classes
  never got remapped).
- Naming: the focus/Pomodoro timer is **The Watch**, the music player is
  **Comms** (gamificationSystem.md naming table). Internal ids
  (`pomodoro`, `music`) are unchanged.

**Onboarding is a spotlight tour (2026-09-24)**
- `components/starchart/TourSpotlight.tsx` is a generic engine: steps target
  real elements via **`data-tour="…"` anchors** (planner: `week-grid`,
  `task-label` on the first card via `AssignmentCard`'s `tourAnchor`,
  `polaris`, `ships-log`; taskbar: `true-north`, `taskbar-add`,
  `taskbar-courses`, `taskbar-rundown`, `taskbar-tools`,
  `taskbar-progress`, `taskbar-settings`; frame: `star-chart-button`; Star
  Chart: `chart-balance`, `chart-grid`). **Add an anchor alongside any new
  tour step.** A missing or hidden target (checked with `checkVisibility`,
  since the inactive view is visibility:hidden) falls back to a centred card.
- A rAF loop keeps the spotlight glued to its target through inner-div
  scrolling and view transitions. The spotlight's box-shadow keeps the
  same 3-layer shape in both states (only alphas change); switching layer
  counts made the dimming layer animate through gold.
- Steps (`components/starchart/Onboarding.tsx`) are `useMemo`-stable. The
  engine's effect is keyed on the step object, so an unstable step list
  would re-run `before()` (view switches) on every render. View checks go
  through the stable `useLodestarFrame().getView()` (reads a ref) for this
  reason. The label step decodes the user's real first card label
  (`lib/taskLabel.ts` format), falling back to `MA - HW - F - Problem set 4`.
- `/dev/onboarding` renders the real planner (`components/PlannerHome.tsx`,
  shared with `/`) with `tourMode="preview"`. The tour opens immediately,
  finishing never writes `onboardedAt`, and a dev pill offers "Restart
  tour" and "Reset first-run flag". Restart/replay bump a `tourRun` key so
  the tour always remounts at step 1. The Rundown never auto-opens while
  the tour will show.

**Star Chart replaces the medieval town (2026-09-24)**
- Reward loop per `gamificationSystem.md`: completing a task earns
  **Starlight** = the existing task-xp award (XP still awarded as before);
  Starlight is spent to chart stars in **real IAU constellations** (not tied
  to classes), catalog in `lib/constellations.ts` (15 of 88 so far). A
  constellation appears once **lifetime Starlight** reaches its `unlockAt`
  (0,0,0 for Orion/Ursa Major/Cassiopeia, then 150 … 5100); price per star
  = 25 + 5 × catalog index.
- Data: `StarChart` (starlight, lifetimeStarlight, onboardedAt) +
  `ChartedStar` (unique userId+constellationId+starIndex). Migration
  `add_star_chart` copied every `TownState.currency` into starlight AND
  lifetimeStarlight (town coins were never spendable). Applied to the shared
  DB 2026-09-24; verified 0 mismatched balances.
- **Starlight is only ever changed server-side by increment/decrement**
  (`app/api/star-chart`, actions `earn` / `chart`) — unlike the town's
  "client PATCHes the new total" pattern, so a stale client copy can't
  undo a purchase. `chart` is one transaction: unlock check → already-
  charted check → conditional `updateMany(starlight >= price)` decrement →
  create row; P2002 (double-click race) maps to 409. `earn` clamps 0–200.
- Client state is one `StarChartProvider` (components/starchart/) under
  `LaptopFrame`, shared by the Taskbar balance, `awardXpForTask`
  (`starChart.earn(award.xp)`) and `StarChartView`.
- **Retired but kept** (header comment "RETIRED (2026-09-24)"): WorldView/
  town components, `lib/townGrowth.ts`, `lib/townState.ts`,
  `lib/mascotDialogue.ts`, `/api/town-state`, `/dev/*`. `LaptopFrame` no
  longer renders World/Nano/CRT scanlines; `useMascot().say` is a no-op
  stub so call sites compile. TownState rows are no longer written.
- Onboarding: `components/starchart/Onboarding.tsx` (6 steps: True North,
  Ship's Log, Polaris, Rundown, Starlight, Star Chart) shows while
  `StarChart.onboardedAt` is null — a new field, so existing users see it
  once too. Replay via settings popover "Replay intro"
  (`useLodestarFrame().replayOnboarding`).
- View switch uses the spec's pull-back / push-in zoom
  (`view-pull-back--*` / `view-push-in--*` in globals.css), applied only
  while animating (a lingering transform would re-anchor fixed modals).
- Theme: `data-theme` keys unchanged (`dark` = **Night** navy/gold, `light`
  = **Day** cream/ink/deep gold `#8a6418` for contrast). New token
  `--accent-contrast` = text on accent; a global rule forces it on
  `bg-[var(--accent)] text-white` buttons. The existing slate→token remap
  under `.theme-surface`/`.planner-shell` carries the palette into the
  planner without editing each component. Fonts: Manrope body + Spectral
  headings, loaded once in `app/layout.tsx` (Geist removed). Star/sky CSS
  (`--ls-*`, `.ls-*`) is shared by `.landing` and the always-night `.sky`.
- Naming (spec table): taskbar "True North", planner heading "Ship's Log",
  frog card "Polaris", "Star Chart" view, currency "Starlight". Taskbar/
  window emoji replaced by `components/brand/Icons.tsx` stroke icons.

**Lodestar rebrand, landing page, account settings (2026-09-24)**
- Product renamed **Lodestar** in all user-facing strings (tab title,
  login/accept-terms/extension pages, Terms/Privacy, Taskbar "Lodestar
  OS", extension popup + manifest name). Code comments/console logs still
  say "Student Planner" — deliberately left. No `TERMS_VERSION` bump (a
  rename isn't a material policy change).
- **Temporary logo:** `public/brand/lodestar-logo-temp.png`; favicon is
  `app/icon.png` (192px) + `app/apple-icon.png` (180px) resized from it.
  `app/favicon.ico` was deleted — a hand-packed .ico failed Next's image
  pipeline (embedded PNGs must be RGBA), so `icon.png` is the favicon.
  The source PNG has wide navy padding (mark is ~60% of the canvas), so
  2026-09-24 the favicons and a new `public/brand/lodestar-mark-temp.png`
  (256px, used by `Wordmark`) are cropped from it: 760px square at
  (247, 220) of the 1254px original. `lodestar-logo-temp.png` itself is
  untouched; the `scale-[1.6]` hack in `Wordmark` is gone.
- `/` renders `components/landing/LandingPage.tsx` for logged-out visitors
  (and for a JWT whose user row was deleted) instead of redirecting to
  `/login`. Its palette is scoped under `.landing` in `globals.css`
  (`--ls-*` tokens) so Forest/Tavern themes don't leak in; fonts are
  Spectral + Manrope via `next/font/google`. Scroll reveal is
  `Reveal.tsx` (IntersectionObserver) — hidden only under
  `@media (scripting: enabled)`, disabled under reduced motion. Note for
  browser automation: background tabs report `visibilityState: hidden`
  and IntersectionObserver won't fire, so sections look blank until the
  tab is shown — not a bug.
- The homepage advertises a **star map** (constellation per class) that
  doesn't exist yet — the user plans to replace the town with it.
- `/login?mode=signup` opens the Create account tab (`CredentialsForm`
  `initialMode`).
- `/settings/account` (linked from `UserMenu` → "Account Settings"): edit
  name, change password (current password required) or set one (Google-
  only users). Delete Account moved here from `UserMenu`. **Email is
  read-only** — without verification a changed email can't be trusted.
  `app/page.tsx` now passes `user.name`/`user.email` from the DB row, not
  the JWT, so an edited name shows immediately.

**Auth: email/password + consent gate (2026-09-22)**
- Sessions are **JWT** (`auth.ts`), not database — Auth.js's Credentials
  provider can't use DB sessions. Switching logged everyone out once; the
  `Session` table is now unused. `ExtensionSession` bearer tokens are
  separate and unaffected. Because a JWT outlives a deleted user row,
  `app/login/page.tsx` checks the row exists before redirecting to `/`
  (otherwise `/` ↔ `/login` loops).
- Sign-up is a server action (`app/login/actions.ts`), not the Credentials
  provider (which only authenticates). Emails are trimmed+lowercased on
  both paths (`normalizeEmail`) since Postgres `@unique` is case-sensitive.
  Passwords: `lib/password.ts`, Node `crypto.scrypt` + per-user salt,
  `scrypt$salt$hash` format, 8–128 chars, no composition rules (NIST).
- **Sign-up never attaches a password to an existing email** (e.g. a
  Google user) and `allowDangerousEmailAccountLinking` is deliberately off
  — with no email verification either would allow account takeover. Known
  consequence: someone can register another person's email first, which
  blocks that person's later Google sign-in (`OAuthAccountNotLinked`,
  surfaced on `/login`). Fix is email verification (TODO).
- Consent: `User.termsAcceptedAt/termsVersion/ageConfirmedAt`. Sign-up
  records them directly; Google users and pre-existing users are sent to
  `/accept-terms` by `hasAcceptedCurrentTerms` checks in `app/page.tsx`
  and `app/extension-callback/page.tsx`. **Bump `TERMS_VERSION` in
  `lib/legal.ts`** to re-prompt everyone after a material policy change.
  13+ age gate (COPPA) with an explanatory message; declining on
  `/accept-terms` offers account deletion.
- `/terms` and `/privacy` are templates (operator: Kellie Chung) with `[CONTACT
  EMAIL]` placeholder (governing law: Nevada); the privacy page lists real data
  flows (Anthropic for announcements, Ollama, YouTube, Vercel, DB host) —
  keep it in sync when adding a new third party.
- Account deletion: `DELETE /api/account` (every User relation cascades),
  triggered from `UserMenu`'s inline two-step confirm.

**Recurring tasks**
- `RecurringTask` (frequency/interval/weekdays/startDate/endDate/dueTime/
  typeOverride, all plain strings, no enums — matches `TaskCustomization`)
  is the template; occurrences are **materialized as real `CustomTask`
  rows** (`CustomTask.recurrenceId` FK, `onDelete: SetNull`), not expanded
  virtually — the planner loads all tasks once on mount and never
  refetches per week, so a virtual-occurrence design would force every
  `id.startsWith("custom-")` call site to special-case "is this a real
  row." Deterministic occurrence ids (`custom-r<recurringTaskId>-<due>`)
  make repeated materialization passes (mount, a second tab, a resumed
  series) safe no-ops (`app/api/recurring-tasks/[id]/occurrences/route.ts`).
- Materialization runs **client-side**, not server — `WeeklyPlannerView
  .tsx`'s `materializeRecurringTasks()` (mount effect, gated on
  `customTasksLoaded`) computes occurrence dates via `lib/recurrence.ts`'s
  pure `expandOccurrences`, resolves each via `lib/utils.ts`'s
  `resolveDueTime` (explicitly browser-timezone-dependent), then POSTs —
  the server route only re-validates/persists. Rolling 8-week horizon
  (`RECURRENCE_HORIZON_WEEKS`), re-extended on every mount — no background
  job, so navigating further ahead in one sitting shows empty weeks until
  the next reload.
- Deleting a single occurrence is a `TaskCustomization` **tombstone, not a
  hard delete**, even though its id starts with `"custom-"` — a hard
  delete would get silently resurrected by the next materialization pass
  (its only idempotency check is "does a row already exist for this id").
  `handleDelete` branches on `task.recurrenceId` before the `custom-`
  prefix check for this reason.
- "This occurrence" vs "this and following" (`EditTaskModal.tsx`): a scope
  prompt only appears when name/course/type changed and the due *date*
  didn't (a date shift is always "this occurrence only"). "This and
  following" hits `PATCH /api/recurring-tasks/:id` with `applyFromDate`,
  updating the template and bulk-updating future occurrences except
  completed/individually-overridden ones (`recurrenceOverridden`, set on a
  single-occurrence edit). Deleting "this and following" reuses the same
  endpoint's `deleteFrom` (shrinks `endDate`, bulk-tombstones forward).
- Real bug fixed: deleting a whole series correctly nulls a completed
  occurrence's `CustomTask.recurrenceId` server-side, but nothing
  refetched `/api/custom-tasks` client-side, so a stale local
  `recurrenceId` could still show a repeat-scope prompt for a series that
  no longer existed. Fixed via `refreshCustomTasks()` (re-syncs local
  tasks against the server, additive-only), called after every
  pause/resume/edit-pattern/delete.
- Live-verified end-to-end (weekly Tue/Thu series). Not verified live:
  monthly-frequency materialization (unit-tested only,
  `lib/recurrence.test.ts`), the AI-estimate-cloning simplification
  (never wired — see Active TODOs), a paused series producing zero new
  occurrences (toggle-state verified only).

**AI pipeline (Claude Haiku primary, Ollama fallback)**
- **2026-09-22: every AI call site now runs on Claude Haiku when
  `ANTHROPIC_API_KEY` is set** — on Vercel, local Ollama is unreachable,
  so the duplicate check was showing grey "unavailable" and assignment
  scoring was silently on its keyword fallback. Shared client/logging/
  error mapping in `lib/ai/anthropicClient.ts` (`logAnthropicUsage(label,
  …)` prints a `💰` per-call cost). XP (`task-xp`) no longer calls any
  model — purely time-based (`estimatedMinutes`, else
  `estimateMinutesByType(classifyAssignmentType(...))`).
- **Cost design (target ≤ ~$0.05/user/week; estimate ≈ $0.014)**:
  - `Announcement.aiAnalyzedHash` (sha256 of title+message,
    `computeAnnouncementContentHash`) — the detection pass skips any
    announcement whose hash matches, so unchanged text is never paid for
    twice (overlapping windows used to re-extract everything every run).
    Set only when extraction returned a real entry (`ok: true` from
    `analyzeAnnouncements`) AND no dup check for it was `degraded`;
    failures stay unmarked and retry. Legacy announcements (null hash but
    already have `AnnouncementSuggestionReview` rows) are backfilled
    without a model call — re-extracting them could re-word a task, change
    its `suggestionKey`, and resurface a prior "No". A run with nothing
    new skips the rate limit/event log entirely. Dry run returns
    `alreadyAnalyzedCount`.
  - Extraction batches 10 announcements per Haiku call (Ollama stays 5 —
    `getAnnouncementBatchSize()`); evidence is now a ≤20-word verbatim
    quote and description one sentence (output tokens cost 5× input).
  - Dup check is ONE call per extraction batch
    (`findDuplicateTasksForBatch`): each course's assignments listed once
    and numbered globally; a task may only match within its own course
    (cross-course number → `uncertainDuplicateResult`). Zero-token
    pre-pass: exact normalized name → high, containment (≥8 chars) →
    **medium at most** (high would let auto-accept silently suppress it).
    Never throws; a total failure degrades just the model-bound tasks.
  - Assignment scoring: 20 per Haiku call, compressed rubric, no `reason`
    output (stored as a fixed string — never displayed). Descriptions are
    now stripped/truncated (previously raw HTML into the prompt).
    `/api/task-planning` reuses any stored estimate whose signature still
    matches instead of re-billing it.
  - Prompt caching / Batches API deliberately not used: prompts are under
    Haiku 4.5's 4,096-token cache minimum, and Batches is async.
  - Known, accepted: a pending candidate's duplicate verdict isn't
    refreshed if a matching Canvas assignment appears after analysis.
- Shared config `lib/ollamaConfig.ts` (`OLLAMA_CHAT_URL`/`MODEL`/
  `NUM_CTX=8192` — added after a real outage where unbounded Canvas HTML
  blew the context window). The Ollama call sites share it, set `format: "json"`, wrap in `try/catch` → deterministic
  fallback with `AbortSignal.timeout`, batch via `lib/concurrency.ts`. Any
  HTML field from Canvas MUST go through `lib/htmlText.ts`'s
  `stripHtml`/`truncateText` before entering a prompt — this is the exact
  root cause of the outage above.
- Announcement extraction runs on Claude Haiku (`lib/ai/analyzeAnnouncement
  .ts` + `lib/anthropicConfig.ts`) when `ANTHROPIC_API_KEY` is set, via
  forced tool use; falls back to the Ollama implementation with zero code
  change when the key is unset (cost-cautious). A batch-level Anthropic
  failure retries via split-in-half bisection, not a flat N-way retry. The
  `RULES` block must be sent exactly once (system message only) — it was
  once accidentally duplicated into the user prompt too.
- The duplicate checker (`lib/ai/findDuplicateTask.ts`) is deliberately biased toward false positives **in
  code**: an unresolved/unknown match must stay flagged
  (`uncertainDuplicateResult`) rather than cleared. `checkStatus`
  distinguishes `"checked"` (a genuine verdict, including uncertain) from
  `"degraded"` (timeout/malformed/no assignments to compare) — only
  `"degraded"` maps to the grey "unavailable" UI state. Matches are
  resolved by a 1-based position number, not a retyped id (the 3B model
  mangles long ids).
- `OLLAMA_CONCURRENCY` caps **all** concurrent local calls system-wide,
  including duplicate-checks nested inside batch workers.
- Every date-window computation derives from `lib/utils.ts`'s shared
  `getStartOfWeek()` (Sunday-start) — a past bug had the announcement
  route's own Monday-start math silently disagree with the planner's
  "current week," pulling a whole week's wrong data.
  `ANNOUNCEMENT_BUFFER_DAYS = 4`.
- Accept/reject decisions persist via `AnnouncementSuggestionReview`,
  keyed by a content-derived `suggestionKey` (`lib/suggestionKey.ts`: sha256
  of announcement id + normalized name) — depends on `temperature: 0`
  determinism.
- `Announcement.course` is resolved via `displayName ?? name` (not the raw
  Canvas name) — a renamed course otherwise produces two different
  strings for the same course, breaking every downstream string-match.
- Canvas API pagination follows the `Link` header (`getNextPageUrl` in the
  extension) — a past bug silently lost everything past page 1 for a
  course with 100+ items.

**Auto Task Creation / Rundown screen** (`AutoTaskCreation.md`, implemented 2026-09-22)
- The old manual, one-at-a-time `AIReviewPanel`/`AIReviewCard` carousel is
  gone — replaced by a Rundown screen (`components/rundown/*`) shown
  automatically on app open (non-blocking, `OnboardingOverlay`'s "tour"
  pattern) whenever there's a pending AI candidate or a new Canvas
  assignment since `PlannerSettings.lastRundownViewedAt`. **The AI
  detection pass itself (extraction + duplicate-check) stays manually
  triggered** — opening the Rundown never fires an Anthropic/Ollama call;
  only `components/rundown/DetectionTriggerControls.tsx`'s "Check for new
  announcements" button does (ported near-verbatim from the old panel,
  including its custom-date-range picker and dry-run preview).
- `AnnouncementSuggestionReview.status` is now 4-way
  (`pending`/`accepted`/`rejected`/`maybe`, still a plain `String`, no DB
  enum) instead of just accepted/rejected — a row is now written for
  *every* detected candidate (`taskSnapshot` Json snapshot of the full
  `ProposedTask`), not just decided ones, so a "pending" candidate
  survives between sessions and a "maybe" one parks in the separate
  Still-Deciding surface (`components/rundown/StillDecidingPanel.tsx`,
  opened from a Taskbar badge, never auto-shown, not gated by
  `lastRundownViewedAt`). `app/api/ai/analyze-announcements/route.ts`'s
  `finalizeCandidates` is the single place that writes this — it also
  applies the new auto-accept setting (see below) before anything reaches
  the client.
- `ProposedTask["canvasMatch"]` gained `checkConfidence` (the duplicate
  check's own confidence, carried through on every branch including
  "none" — auto-accept gates on this, never on the extraction
  `confidence` field) and a `"unresolved"` status value for the
  out-of-range-match-number case (`isDuplicate: true` with a null
  `matchingAssignmentId`, produced only by `findDuplicateTask.ts`'s
  existing `uncertainDuplicateResult` — that function's hallucinated-id
  guard already existed, only the route's status mapping was missing this
  as a distinct bucket).
- New per-user singleton `PlannerSettings` (mirrors `TownState`'s
  pattern, deliberately not folded into it): `autoAcceptAiTasks` (default
  off, Taskbar settings popover toggle) and `lastRundownViewedAt`. When
  on, `lib/rundownAutoAccept.ts`'s `classifyAutoAction` auto-inserts a
  real `CustomTask` for a high-confidence non-duplicate and auto-suppresses
  a high-confidence duplicate, both server-side inside `finalizeCandidates`
  — neither ever reaches the stream/client. Anything else (medium/low
  confidence, or unresolved) always surfaces regardless of the setting.
- New `AiTaskEvent` durable log (free-form `data` Json per `type`) backs
  both the spec's accuracy-tracking logging requirement and the manual
  detection-pass rate limit (`lib/aiRateLimit.ts`: 2 real (non-dry-run)
  runs per rolling 7 days per user, bypassed for emails in the new
  `DEV_ACCOUNT_EMAILS` env var — not set anywhere yet, add it to `.env`
  and Vercel for any account that needs to bypass it).
- `CustomTask.aiTagDismissedAt` + `AssignmentCard`'s new 🤖 badge is the
  "AI-detected until dismissed" tag from the spec — dismissing it logs an
  implicit-confirmation event; deleting the task without dismissing first
  logs the opposite signal (both from the same `ai_task_deleted`/
  `ai_tag_dismissed` events, read off `existing.aiTagDismissedAt` at
  delete time).
- Known, accepted edge case (documented, not solved): a Canvas course
  restored via `restore-course` cascade-recreates its `Assignment` rows
  with fresh `createdAt`, which would show them as "new" again in "Added
  from Canvas" — mitigated only by a `take: 200` cap in
  `/api/rundown-candidates`, same category as the existing hidden-course
  tombstone gap above.
- Real bug caught by a pre-completion review and fixed before landing: the
  duplicate-check `alreadyDecidedKeys` skip was gated on `!isCustomSelection`
  (inherited from the old panel's "custom mode lets you re-review" intent,
  predating auto-accept). With auto-accept ON, re-selecting an
  already-decided announcement in custom mode let `finalizeCandidates`
  silently re-decide it — flipping a user's explicit "No" into an
  auto-inserted task with zero visibility, and with it OFF, an already-
  "maybe"'d item could render in both "AI found these" and Still-Deciding
  at once. Fixed by checking `alreadyDecidedKeys` unconditionally in both
  modes — an already-decided candidate now never re-enters the pipeline,
  in exchange for dropping the old "custom mode re-review" affordance
  (not something `AutoTaskCreation.md` asks for, and directly at odds with
  its "decisions are sticky" intent).
- **Not live-verified this session** — only `tsc`/lint/`next build` clean.
  Needs a real click-through with actual Canvas announcements + local
  Ollama/Anthropic before trusting: the auto-accept insert/suppress
  branches, the rate limit's 429 path and reset-date display, the Rundown
  auto-show/no-auto-show-on-dismiss behavior, the Maybe → Still-Deciding
  round trip surviving a reload, and the AI-tag dismiss/delete event
  logging. The Prisma migration itself did apply cleanly against the
  shared prod/dev DB (backfilled 127 existing `AnnouncementSuggestionReview`
  rows' new `updatedAt` via `now()`).

**Priority / scheduling**
- Priority scoring (`prioritizationModule.md`'s "Scoring formula"):
  urgency is deliberately dominant — importance/difficulty/consequence/the
  "frog" bonus exist only to break ties among tasks of similar urgency,
  never to overcome a real urgency-tier difference. Don't rebalance
  `lib/prioritization.ts`'s weights without reading that spec first.
- Procrastination index per task type (`lib/procrastinationHistory.ts`)
  shifts a chronically-late type's effective due date earlier (capped).
  No history for a type = behaves as before.
- `assignmentType`/`estimatedMinutes` are not AI-guessed for the estimate
  itself — `assignmentType` is Ollama-provided (grouping key only);
  `estimatedMinutes` is a deterministic type→minutes lookup
  (`estimateMinutesByType`).
- `Assignment.due` is always plain `"YYYY-MM-DD"`; `dueAt`/`dueFraction`
  resolve client-side from the browser's own timezone — no server-side
  timezone guessing anywhere. `calculateGridSpan`'s due-time inset is
  capped (`MAX_END_INSET_PERCENT = 40`).
- "Up Next"/Pomodoro focus derive from `computeTaskPriority`, independent
  of the grid's chronological sort. A task with a future custom start
  date (`TaskCustomization.startAt > today`) can never auto-select as Up
  Next — implemented as a **gate on the final score** (forced to `0`),
  not a new weighted term (`prioritizationModule.md`'s "Start-date gate").
  An overdue due date always wins over a stale future `startAt`.
  `upNext`'s loop hard-excludes gated candidates; `activeFocusTask`
  (explicit user focus toggle) is deliberately left ungated.

**Weekly grid layout**
- Stacking is chronological (due date → time-of-day → course), not
  priority-bucketed; "no due date" keeps its own priority sort.
  `grid-flow-row` (not dense) — dense packing fights chronological order
  for multi-day bars.
- Layout uses absolute positioning + `packColumnOffsets` (a true skyline
  packer over pixel Y-offsets), not CSS Grid rows — Grid rows are shared
  across all 7 day columns, which caused real bugs (a wide bar stranding
  narrower items in the wrong "row"; a short completed card sharing a row
  with a tall card getting stuck at that height). Column `left`/`width`
  use `calc()` expressions matching the divider grid's exact math.
- Bar ordering: due-date ascending within each status group; completed
  and active bars each keep strict due-date order among themselves,
  gap-filling between the two groups is unconstrained. Single-day tasks
  pack before bars in a shared column. Known, not a bug: the packer is
  greedy first-fit, not maximum-density.
- A card sharing a stretched grid row needs `self-start` — Grid's default
  `align-items: stretch` re-inflates a shorter card otherwise.
- Completing a task never moves its position (explicit user request) — a
  short CSS pulse plays, nothing more. Completed cards render shrunk
  (`min-h-[24px]`) and dimmed (`opacity-55`).
- **Real bug fixed 2026-09-22**: every task appeared one day late on the
  grid (confirmed live: date number on the card was correct, but it sat
  under the wrong weekday column). Root cause: `app/page.tsx` (a Server
  Component, runs on Vercel's UTC clock) computed `getStartOfWeek()` and
  passed the resulting `Date` to `WeeklyPlannerView` as a `weekStartDate`
  prop; the component seeded `activeWeekStart`/`activeMonthStart` from it
  via `setHours(0,0,0,0)`. A `Date` is just an instant and survives the
  server→client hop fine, but `setHours`/`getDate`-style local getters
  re-derive the calendar day **in whatever timezone calls them** — so a
  midnight-UTC instant built server-side got re-read as the previous
  evening once the Pacific-timezone browser touched it, anchoring the
  week start one day early. Column placement itself
  (`calculateGridSpan`'s `daysBetween(due, activeWeekStart)`) stayed
  self-consistent with that wrong anchor, but `dayNames` (`["Sun", "Mon",
  ...]`) is a fixed positional array, not derived from the anchor's real
  weekday — so every real day's weekday **label** was one column off from
  its true date. This surfaced once the Canvas extension started pointing
  at Vercel (`3fb7e11`) instead of `localhost` (previously the dev server
  ran on the same Pacific machine as the browser, so no cross-timezone
  reinterpretation ever happened). Fixed by never crossing a
  server-constructed day-anchor `Date` to the client at all:
  `WeeklyPlannerView` now seeds `activeWeekStart`/`activeMonthStart` with
  an SSR-safe default and corrects them via a mount effect calling
  `getStartOfWeek()` client-side (same call the "Today" button already
  used) — `weekStartDate` was removed from `WeeklyPlannerProps` and
  `app/page.tsx` entirely. **Sharper corollary to the existing "no
  server-side timezone guessing" rule: never pass a `Date` across the
  server/client boundary as a day-anchor** — the instant is fine, but any
  local-getter re-derivation on the far side silently reinterprets it.
  **Known, related, NOT fixed in this pass** (same violation, different
  code path, no reported symptom, ruled out because the reported bug hits
  even untouched Canvas assignments): `getStartOfWeek()` called
  server-side in `app/api/ai/analyze-announcements/route.ts`;
  `getTodayString()` called server-side in
  `app/api/recurring-tasks/[id]/route.ts`; `.toISOString().slice(0, 10)`
  (UTC-based) used to serialize `startAt`/`completedAt` back to date keys
  in both `task-customizations` routes; `StartDateField.tsx`'s "today"
  quick-set button using `toISOString().slice(0,10)` instead of the
  shared `getTodayString()`.

**Task customization / persistence**
- A custom start date (`TaskCustomization.startAt`) auto-reverts to
  "auto" once it's in the past — applied at **read time only**
  (`hasCustomStartDatePassed` in `lib/utils.ts`, used by
  `WeeklyPlannerView.tsx`'s `resolveStartAt`), never persisted/cleared via
  a periodic PATCH. An earlier draft did use a `setInterval` PATCH and was
  caught by review as the same "stale full-row PATCH from an in-memory
  snapshot" bug class fixed elsewhere — an idle second tab's timer would
  silently clobber whatever a different tab just changed. A `todayKey`
  state + 60s interval just forces a re-render on day rollover, no
  network call.
- All planner state is DB-backed per `(userId, taskId)` via
  `TaskCustomization`/`CustomTask`/`TaskPlanningEstimate`/
  `ProcrastinationRecord` — not one per-user JSON blob — so two
  browsers/tabs editing different tasks concurrently can't clobber each
  other. `persistCustomization`'s PATCH is a **full-row replace, not a
  server merge** — every caller must spread the current known
  customization before overriding its own field(s), or an unrelated save
  silently un-completes/un-deletes/un-overrides a task.
- Any task field is user-overridable via nullable `TaskCustomization`
  columns (`nameOverride`/`typeOverride`/`dueAtOverride`, plus the older
  `course` override) — only for Canvas-synced tasks; custom tasks store
  most fields directly **except type**: `typeOverride` is the only
  storage for a custom task's type too, unlike name/course/due. A past bug
  unconditionally zeroed `typeOverride` for any custom/AI-accepted task,
  silently discarding a type chosen in `EditTaskModal` — don't gate
  `typeOverride` on `isCustomTask`.
- `dueAtOverride` is a single nullable `DateTime` instant — no way to
  represent "override just the date, defer time-of-day" separately from
  "override to this exact instant." A past bug: `resolveDueTime` returns
  `dueAt: null` in "End of day"/auto mode, and the save handler used to
  diff only the raw `dueAt` instant, so a date change made in auto mode
  silently collapsed to "unset" and was dropped (masked by an optimistic
  local update, only reappearing as "the edit reverted" on reload). Fixed
  by diffing the *effective date* when the incoming `dueAt` is null, and
  synthesizing a concrete end-of-day instant (`endOfDayInstant()` in
  `lib/utils.ts`) so the date persists. Known cosmetic side effect:
  reopening a date-only-overridden task shows "Custom time 11:59 PM"
  instead of "End of day."
- `completedAt` must always be serialized as plain `"YYYY-MM-DD"`
  (matching `startAt`) — a full ISO instant here breaks
  `calculateGridSpan`'s `parseLocalDate` (a past bug produced `NaN` grid
  columns).
- Task status is 3-way (not_started/in_progress/completed), **derived**,
  not a persisted enum, via `lib/taskStatus.ts`'s `getTaskStatus` —
  avoids rewriting every existing boolean `completed` comparator.
- `pomodoro_state`/`pomodoro_active_task_id`/`planner_theme`/
  `music-player-volume`/`os_window_manager` stay localStorage-only on
  purpose — genuinely per-device, not account data.

**Card labels / courses**
- Card titles: `COURSE - TYPE - DAY - NAME` via `lib/taskLabel.ts`'s
  `formatTaskLabel`; `courseAbbreviation`/`typeCode`/`dayCode` are pure
  functions, never persisted. Course segment always shows the
  abbreviation unconditionally — a width-adaptive version was tried and
  reverted (read as an inconsistency bug, not a feature). Type code is a
  fixed 4-value set (`HW`/`R`/`EXAM`/`TODO`) via `classifyLabelType`,
  deliberately separate from the 14-value `AssignmentType` that still
  drives scoring/estimates/the procrastination index. `TODO` is reserved
  for a task under a user-added custom course (`Course.isCustom`;
  `CUSTOM_COURSE_ORIGIN` in `lib/canvas.ts`).
- Course abbreviation/color are user-editable `CanvasCourse` columns
  (sync never touches them), edited in `CoursesPanel.tsx`; unset falls
  back to deterministic name-hash defaults (`courseAbbreviationDefault`,
  `courseColorDefault` in `lib/courseColor.ts`).
- An AI-generated `shortTitle` label segment existed and was fully
  removed 2026-09-09 — nothing of it remains.
- Known, unfixed: a **hidden** Canvas course is as vulnerable as a
  deleted one to disappearing — sync pruning deletes any `CanvasCourse`
  missing from the latest payload regardless of its `hidden` flag.

**Canvas / extension**
- Canvas integration goes through `canvas-extension/` (reads session
  cookies in-browser, posts to `app/api/canvas/sync` via a `Bearer` token
  backed by `prisma.extensionSession`) — not server-to-server, since
  Canvas doesn't give students a way to mint their own token. The
  extension mirrors whichever theme is active on the web app itself.
- **Deletion exclusion**: `DELETE /api/courses/[courseId]` hard-deletes
  the `CanvasCourse` row (cascades to its Assignments/Discussions/
  Announcements) and upserts a `DeletedCanvasCourse` tombstone
  (`[userId, canvasOrigin, canvasId]`) — skipped for custom (non-Canvas)
  courses, which have no real `canvasId` to ever resync. `lib/canvasIngest
  .ts`'s `upsertCanvasCourses` (shared by `/api/canvas/sync` and
  `/api/canvas/restore-course`) checks this tombstone set before ever
  creating/updating a course. The course-delete + tombstone-upsert run
  inside one `prisma.$transaction` (hardening added 2026-09-21, not a
  proven fix for anything — see below). Only `/api/canvas/restore-course`
  (the extension's "Find Canvas Courses" → "Restore Course" flow, one
  course per call) ever removes a tombstone.
- Separately, `/api/canvas/sync`'s prune step deletes any `CanvasCourse`
  missing from that sync's payload — **no tombstone written**, by design,
  since a course dropping off Canvas's active list (unenrolled/concluded)
  is meant to be reversible, unlike an explicit user delete. This means a
  **hidden** course is equally vulnerable to disappearing tombstone-free
  if it drops off Canvas's list (`hidden` isn't checked here) — known,
  unaddressed.
- **2026-09-21 investigation**: user reported deleted courses reappearing
  after "Sync Canvas." Both the delete route and the sync-skip logic read
  as correct on direct inspection; root cause was never definitively
  isolated between two candidates (the tombstone-free prune path above,
  vs. `restore-course` being used on the same courses) — DB timestamp
  clustering favored the prune-path explanation but this wasn't proven. A
  live re-test (delete a fresh course → real "Sync Canvas" → confirmed it
  stayed gone) passed, so this is **resolved in practice**, not
  root-cause-confirmed — don't claim more certainty than that later.
- **Sync now skips already-excluded courses client-side, not just
  server-side** (2026-09-21): `GET /api/canvas/excluded-courses
  ?canvasOrigin=...` (same `getCanvasSyncUserId` auth as other
  extension-facing routes) returns the user's tombstoned `canvasId`s for
  an origin. `SYNC_CANVAS` in `background.js` calls this right after
  listing Canvas's active courses and before the per-course fetch loop
  (assignments/discussions/announcements), filtering them out — avoids
  spending a Canvas API round trip on data that would just get discarded
  server-side anyway. Fails open (syncs everything) on any lookup failure
  except a 401 (treated like any other stale-token case —
  `clearExtensionAuth()` + throw, since the sync POST would fail
  regardless). Skips the final POST entirely if every course ends up
  excluded, rather than sending an empty payload.
- **Deployment**: app is on Vercel (`https://student-planner-beta.vercel.app/`
  as of 2026-09-21, may change — check Vercel's dashboard), connected to
  `kellieChung/student-planner` on GitHub, auto-deploying on push to
  `main`. Env vars live in Vercel's dashboard, independent of the local,
  gitignored `.env` — a `git push` is required for any code change to go
  live, but not for env var changes. **Production and local dev currently
  share the same Postgres database** — no environment split, so local
  testing touches the exact rows the deployed app reads/writes. The
  extension's backend target is `APP_ORIGIN` in
  `canvas-extension/config.js` (see the popup redesign entry above) — it is no
  longer a popup setting.

**Gamification / World layer** (`gamificationSystem.md`)
- OS loads by default, not World — per `projectReview.md`'s warning
  against burying the daily task list. `TownState` is a separate Prisma
  model from `GamificationState` (protects existing XP data from a shared
  blob-replace bug). `lib/townGrowth.ts` is framework-free. Currency
  earned always equals the same deterministic XP `/api/task-xp` computes
  — one reward economy. Mascot is Nano.
- **Streak mechanic removed entirely** (`currentStreak`/`longestStreak`/
  `graceTokens`/`lastGoodDay` and their update logic) per explicit user
  instruction — "goes against the principles of the game." Not replaced
  with a softer version; re-litigate with the user before adding one back.
  `TownState.kingdomStage` (village/town/city/kingdom) replaced those
  columns. Watchtower now grows from a flat `applyWatchtowerBonus` (+5) on
  any on-time completion, no consecutive-day tracking.
- Real sprite art (Toen's Medieval Strategy Sprite Pack, CC-BY 4.0) is
  wired into every building stage via `WorldLayoutData.buildingStageSprites`
  (`lib/spriteMap.ts`/`lib/spriteSheets.ts`, `components/world/TileSprite
  .tsx`) — `PixelBlock` (colored div + emoji) is gone from building
  rendering, still used for a couple of decorations with no sprite
  equivalent. `Building.tsx` takes a `stageSprites` prop rather than
  importing a static constant. Attribution lives on `/credits` (linked
  from the Taskbar's ⚙️ popover) — required by the CC-BY license; add any
  new sprite-pack asset there too. Multiple packs are supported via a code
  registry (`lib/spriteSheets.ts`'s `SPRITE_SHEETS`) — a new pack needs
  one registry entry, no other code changes.
- **Kingdom-wide stage is milestone-gated, not live** — per-building
  growth updates immediately on every matching completion, but the
  persisted `TownState.kingdomStage` only advances at a checkpoint
  (`maybeAdvanceKingdomStage`, every 5th completed task via
  `GamificationState.awardedTaskIds.length`), jumping straight to whatever
  stage is currently eligible — never step-advances, never regresses.
- Every field on `PATCH /api/town-state`/`/api/gamification` is genuinely
  optional (present-key validated, absent-key left alone) — hardened
  after three real bugs where a stale full-row PATCH built from an
  outdated snapshot silently overwrote `onboardingCompletedAt` or
  just-awarded currency/growth. Never reintroduce a "send the whole row"
  helper.
- **Gotcha for `awardXpForTask`-style code**: a `useState` functional
  updater passed to `setGamification`/`setTownState` is **not invoked
  synchronously at the call site** in this app (confirmed via direct
  instrumentation) — code that gates subsequent synchronous logic on a
  variable the updater was supposed to set is broken, since the updater
  hasn't run yet by then. `awardXpForTask` computes the dedup check and
  next state against `latestGamificationRef`/`latestTownStateRef` (kept
  synchronously up to date) fully outside any `setState` updater, then
  calls `setState` with a plain value purely to trigger a re-render.
- `LaptopFrame` keeps OS content always mounted; the inactive view is
  hidden via `invisible`, never unmounted — a "View Kingdom" toggle must
  not kill Pomodoro/Music playback or re-run mount-effect fetches.
  `PomodoroTimer`/`MusicPlayer` each publish live state via
  `PomodoroRemoteContext`/`MusicRemoteContext`, consumed by both the real
  OS window and the World's Hourglass/Bard panels (`MusicRemoteContext`
  deliberately excludes playlist create/import/add-track — not cleanly
  remote-controllable without a deeper rewrite).
- **The World map is user-designed data, not hardcoded arrays** — a
  `WorldLayout` Prisma model (`userId @unique`, one JSON `data` column,
  `types/worldLayout.ts`'s `WorldLayoutData`) holds ground theme, a
  freeform `decorations` list (forest/mountain/water/farmland/paths —
  hand-placed, since this sprite pack's road art is junction-shaped and
  any *computed* path looks wrong no matter how it's placed),
  `buildingStageSprites`, `scatterHouses` (growth-gated reveal), an
  optional `wall` (kingdomStage-gated), and freeform `extraBuildings`
  (user-placeable, additive to the 5 fixed growth buildings, which stay
  singleton). Edited via `/dev/map-editor`
  (`components/dev/MapEditor.tsx`) — a real, non-interactive `TownMap`
  preview with an interactive overlay on top (`pointer-events-none` on the
  preview so editor clicks never fire in-game buttons).
  `DEFAULT_WORLD_LAYOUT` (`lib/worldLayout.ts`) is what the old hardcoded
  constants used to be, ported 1:1 — a user who's never opened the editor
  sees zero visual change. A `TileRef` is either a catalog name or a raw
  sheet coordinate (`{kind:"named"}`/`{kind:"raw"}`), since the editor's
  picker allows any sheet cell, not just named ones.
- Placements are stored as **integer grid row/col**, not a percent of the
  container (`lib/mapGrid.ts`) — an earlier percent-based design only
  stayed grid-aligned at the exact container width it was computed
  against, so the editor and the real view (different widths) silently
  drifted off-grid from each other. Rendering is just
  `row * GROUND_TILE_PX`/`col * GROUND_TILE_PX`, identical everywhere by
  construction.
- **The map is a fixed-size logical frame, scaled-and-panned to fit any
  screen** — `lib/mapGrid.ts`'s `FRAME_COLS x FRAME_ROWS` (62x34: a
  `CONTENT_COLS x CONTENT_ROWS` 26x14 area `DEFAULT_WORLD_LAYOUT` was
  tuned against, plus a `MARGIN_COLS`/`MARGIN_ROWS` grass buffer) is the
  *entire* map; both the editor and the live "View Kingdom" screen render
  identical content through a shared `components/world/MapViewport.tsx`,
  which scales-to-fit rather than requiring matching container pixel
  dimensions. `MapViewport` also owns real pan/zoom (wheel-zoom-to-cursor,
  drag-to-pan, two-pointer pinch) — zoom-out is capped so the frame always
  *covers* the container (never "contain," which would letterbox with
  visible background), and pan is hard-clamped to the frame's true edge
  (no slack).
- Ground tuft scatter uses a real integer hash (`hashCell()`, Thomas
  Wang's 32-bit hash), not a small-modulus formula — an earlier
  `(row*7+col*13)%11` produced a visible diagonal stripe (small
  coefficients mod a small number don't mix enough). No `Math.random()`
  anywhere in map rendering — would reintroduce an SSR hydration mismatch.
- **Gotchas for anyone touching `MapViewport`/the editor again**:
  - Every interactive element rendered inside `MapViewport`'s transformed
    frame must call `stopPropagation()` on its own `pointerdown` (not just
    `onClick`) — `pointerdown`/`pointerup` and `click` are independent
    events from the same physical click. `MapViewport` starts a candidate
    pan gesture on any unopposed `pointerdown` and only commits once
    movement crosses `DRAG_THRESHOLD_PX`; a real mouse click almost always
    has a few incidental px of movement, which without this guard gets
    misread as a drag and swallows the element's own click.
  - Measuring the viewport's own size on mount must use
    `clientWidth`/`clientHeight` (layout-box), never
    `getBoundingClientRect()` (rendered-box) — `MapViewport` can first
    mount mid-`rotateX` during `LaptopFrame`'s lid-opening animation, and a
    `getBoundingClientRect()` read at that instant returns a wildly
    distorted size that then poisons the fit calculation for the entire
    mount's lifetime (a CSS transform never triggers `ResizeObserver`).
  - A conditionally-rendered UI panel (e.g. "Selected placement" edit
    controls) must never share document flow with a click target — its
    own appearance/disappearance reflows the canvas underneath it and
    turns the next click into a misclick. Solved with a
    `position: absolute` floating drawer instead of an in-flow sidebar.
  - A gesture-state bug that depends on the exact interleaving of two
    simultaneous pointers lifting (e.g. a pinch ending) won't show up in
    single-pointer testing — needs its own dedicated repro.
  - `Building.tsx`'s multi-tile sprites (`colSpan`/`rowSpan`) need the map
    editor's drag-handle sizing to match the sprite's real footprint, not
    a fixed guess — `buildingHandleSize()` computes this from
    `getSpriteRect()` across all 3 stages.

**OS window system** (`components/os/Window.tsx`, `WindowManagerContext.tsx`)
- Generic, app-agnostic window chrome for Pomodoro/Music/Courses —
  position/size/isOpen/isMinimized/zIndex live in `WindowManagerContext`,
  persisted to `os_window_manager`. Drag/resize gesture code builds fresh,
  non-memoized closures per-gesture rather than stable `useCallback`s (a
  `useCallback` referencing itself before its own declaration was a real
  recurring bug here).
- The resize grip's clickable area must NOT be clipped by the outer
  window's rounded corner — `overflow-hidden` lives on an inner wrapper
  (title bar + content), not the outer container, since a
  border-radius-minus-border-width clip removes most of a flush grip's
  hit area right where a user aims.
- Music window must stay mounted whenever `isOpen` regardless of
  minimized state, so audio keeps playing. Pomodoro's `onBeforeClose`
  force-writes a paused snapshot directly to localStorage (bypassing
  React) since `closeWindow`'s unmount lands in the same commit as a
  setState-based pause, and React drops pending updates for a component
  unmounted in that commit.
- `MusicPlayer`'s now-playing/tracks sub-grid needs its own `@container`
  scope, independent of the outer playlist-sidebar grid — otherwise both
  nested breakpoints trip off the same width and squeeze together on
  resize instead of laying out independently.

**Misc**
- Theming: dark ("Enchanted Forest")/light ("Cozy Tavern") via CSS
  variables + a Tailwind-class remap layer in `app/globals.css`, scoped
  to `.theme-surface`/`.planner-shell`; `ThemeScript.tsx` sets
  `data-theme` pre-paint from localStorage.
- `daysBetween()` (`lib/utils.ts`) is the shared DST-safe day-diff helper
  — a past bug used raw millisecond subtraction and got the wrong answer
  across a DST boundary; don't reintroduce manual date math for day
  differences.
- No test framework installed — `lib/prioritization.test.ts` is a manual
  `npx tsx` script, not part of any suite.

## Active TODOs

- **Landing hero (2026-09-24)** — uncommitted. Run `npm run build`, then check
  Safari/Firefox and a real phone (scroll-linked `calc()` stroke-dashoffset,
  sticky pinning), landscape phone, and `prefers-reduced-motion`/JS-off (should
  show the finished sky + headline at once). Tune scroll length (`HERO_SCREENS`)
  if it feels long.

- **Analyzer live pass (2026-09-24):** signed in as the dev account, open
  `/dev` → Analyzer tools → reset (deletes your suggestion decisions), grant
  credits, then run a check and confirm cards show real possible/definite/none
  duplicate states, the quota banner counts down, pause → Resume is free,
  "Re-check all" charges 1, and 0 left disables both buttons. Set
  `DEV_ACCOUNT_EMAILS=kelliecpiano@gmail.com` in Vercel (added to local `.env`
  only) and confirm `ANTHROPIC_API_KEY` is set there.

- Full-screen/Rundown window (2026-09-24) needs a signed-in check: no gap
  under the app at any browser size, Rundown drags/resizes/minimises and
  stays put while the planner scrolls, closing still marks it viewed.
- Onboarding tour (2026-09-24) not verified against the real planner:
  run `/dev/onboarding` signed in and check each stop lands on the right
  element, the Star Chart step switches views, and "Reset first-run flag"
  makes `/` show the tour again. Verified so far only on a throwaway page
  with mock anchors: glide, above/below placement, centred fallback, 390px
  bottom sheet, arrow keys/Esc.
- **Temporary logo** — replace `public/brand/lodestar-logo-temp.png`,
  `public/brand/lodestar-mark-temp.png`, `app/icon.png`, `app/apple-icon.png`,
  and the `canvas-extension/icons/` PNGs with the final Lodestar artwork (crop tight to the mark).
- Star Chart (2026-09-24) not verified logged-in: earn on completion
  (balance persists after reload), chart a star, insufficient-Starlight
  error, completion moment (lines draw in), locked tile threshold,
  onboarding once + replay, Ship's Log ↔ Star Chart transition with modals
  still positioned correctly, Night/Day across planner/modals/windows.
  Verified: build, catalog sanity script, and a throwaway preview page
  (onboarding steps, chart grid, detail panel, 401 error path).
- Add the remaining 73 constellations to `lib/constellations.ts`; Nebula
  cosmetics (spec) not started. Delete the retired town code once sure.
- Inline emoji still appear inside some planner content (e.g. 🧠
  estimating line, task badges) — only chrome/taskbar/windows were swapped.
- Landing page / settings (2026-09-24) not verified logged-in: name edit,
  password change/set, delete from `/settings/account`. Landing verified
  logged-out at desktop + 390px width (no horizontal scroll).
- Email change on `/settings/account` once email verification exists.
  Changing a password doesn't sign out other devices (JWT sessions).
- Stale pre-JWT session cookies log `JWTSessionError` on every request
  until the browser drops them — harmless (treated as logged out).
- Footer has no contact/feedback link yet (waiting on the contact email).
- **Legal pages are missing a contact email** — `/terms` and `/privacy`
  still show the literal `[CONTACT EMAIL]` placeholder in production
  (pushed 2026-09-22 without it). Replace once the custom-domain email
  exists; nothing else is left to fill in.
- AI cost pass (2026-09-22) — **blocked on applying the migration**:
  `prisma/migrations/20260923000000_add_announcement_ai_analyzed_hash`
  (one nullable column) was written but not applied; `npx prisma migrate
  deploy` + `npx prisma generate` were blocked from the agent session
  (shared prod DB). Until then `tsc` fails on `aiAnalyzedHash` and the
  code must not be pushed. Then live-verify: a dry run shows new vs.
  already-checked counts; a real run logs `💰` for extraction/dup
  check/scoring with amber/clean (not grey) dup states; an immediate
  second run makes zero Anthropic calls with pending candidates still
  visible; evidence highlight scrolls inside the announcement box only;
  XP awards with no model call. Compare real `💰` numbers to the
  ~$0.014/user/week estimate (unverified — token counts were estimated,
  not measured). Existing assignments keep their keyword-fallback scores
  (the spend guard reuses matching signatures); only new/changed ones get
  Haiku scores. A one-time re-score backfill (a few cents/user) is an
  option if wanted. A Haiku scoring failure still persists a fallback
  estimate that's never retried (same as before).

- Auth (2026-09-22): not live-verified in a browser — sign up (age/terms
  unchecked, short/mismatched password, duplicate email in other case),
  password sign-in/wrong password, Google → `/accept-terms`, extension
  login with a password, Delete Account. Only lint/build + page status
  codes + a hashing script were checked. Shared prod DB: use a test email
  and delete it after. Follow-ups: fill the legal-page placeholders and
  get them reviewed; email verification; password reset; rate-limit
  login/sign-up attempts. The consent gate covers pages only — existing
  extension Bearer tokens keep syncing via `/api/canvas/sync` until the
  user next opens `/`.

- Auto Task Creation / Rundown: not live-verified — see the dedicated
  architecture entry above for the exact list (auto-accept branches, rate
  limit 429/reset display, auto-show/dismiss gating, Maybe round trip,
  AI-tag dismiss/delete logging).
- Canvas: of the 4 courses that reappeared before the 2026-09-21 fix, 3
  have been re-deleted (English Student Aide Workshop, STEM Mentors
  26-27, World Language Center); Calculus III wasn't — confirm with the
  user whether that's intentional.
- Canvas: the `restore-course` flow ("Find Canvas Courses" → "Restore
  Course" in the extension) is still only tsc/lint/build-verified, not
  exercised live end-to-end (the 2026-09-21 live test covered delete+sync,
  not restore specifically).
- Canvas: sync reconciliation only prunes whole courses, not individual
  assignments/announcements within an active course. A task manually
  overridden to a non-Canvas course name goes stale again if that course
  is later renamed (override stores a name, not a course id).
- Recurring tasks: the "AI estimate cloning" simplification was never
  wired up — the real per-task `TaskPlanningEstimate`-trigger call site
  wasn't identified (likely `WeeklyPlannerView.tsx`'s estimate-loading
  effect or `app/api/task-planning/route.ts`). As written, a
  many-occurrence series fires one Ollama call per occurrence instead of
  cloning the first.
- Recurring tasks: monthly-frequency materialization and a paused series
  producing zero new occurrences are only unit/toggle-verified, not
  clicked through live. `EditTaskModal`'s "this and following" scope
  doesn't propagate a `dueTime` change (deliberate v1 cut).
- World map: the saved layout still sits left-of-center after the margin
  was widened — the bulk-recenter tool ("🎯 Center Content" in
  `/dev/map-editor`) fixes this in one click, but nobody has opened the
  editor and clicked Save since. The path tiles also still don't look
  great — the tool to redesign them by hand exists, nobody's done it yet.
- Sprite pipeline: no distinct "ruins" sprite located in the inspected
  rows of the sheet — may exist in unexamined rows, nothing currently
  needs it.
- Not a bug, don't "fix" again: the skyline packer's small unfilled gaps
  in a real week are expected (greedy first-fit, not maximum-density).
- Gamification: currency spend/shop UI and cosmetics are deliberately
  deferred. `announcementFound` mascot trigger has never fired against a
  real batch. Light-theme rendering of `WorldView`/`TownMap`/
  `OnboardingOverlay` and layout at very small widths are unchecked.
- Several features are verified only via `tsc`/lint/build, not click-tested
  live: `nameOverride` task-field override; loading indicators (XP award,
  course create/save, `MusicPlayer`'s `busyItemId`); most of the
  announcement-analysis polish list, now living in
  `components/rundown/RundownCandidateCard.tsx` (evidence highlighting/
  inline editing were live-verified pre-Rundown; auto-scroll to the
  highlight is back, scoped to the announcement box's own scrollTop —
  not scrollIntoView, which dragged the whole overlay — not yet
  live-verified;
  HTML-safe rendering, due-date resolution, persisted accept/reject, and
  "check unavailable" status were not live-verified even before the
  rewrite); AI-suggested-task course-matching; the announcement pipeline's
  reliability changes (RULES dedup, concurrency cap, bisection retry,
  degradation, number-based matching) haven't been re-exercised together
  against a live run since landing; the announcement time-range preset UI;
  the expired-start-date auto-revert's completed-task fallback and live
  day-rollover path; browser-local-state migration edge cases (second-
  browser sync, a custom task's PATCH round-trip, Canvas re-sync not
  resurrecting a deleted task); Taskbar's `Log Out` (would end the real
  session) and ~400px-width layout; music loop/shuffle end-of-track
  behavior (YouTube iframe never got past buffering in
  browser-automation).
- Untested, low-stakes: `opacity-55` completed-card dimming on light
  theme; a stray `ProcrastinationRecord` from old live testing was never
  cleaned up (no delete endpoint); Music window's track list has a fixed
  `max-h-[280px]`, doesn't grow with window resize.

---

Detailed session-by-session history (pre-2026-09-21) was compressed out
of this file on 2026-09-21 — the Architecture Decisions above retain the
current design and its load-bearing rationale. Use `git log` for exact
change history if needed.
