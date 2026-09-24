# Lodestar Homepage — Design Spec

## Design philosophy
The page should feel like a small escape before it feels like a sales pitch. The core emotional hook of the product — a quiet night sky that slowly fills with light as real effort accumulates — should be *felt* by a first-time visitor within the first few seconds, before any feature list. Impressive here means "calm and confident," not "loud and busy."

**Avoid generic SaaS/AI landing-page clichés specifically:**
- No purple-to-blue gradient hero washes
- No Inter, Roboto, or Arial as the primary typeface
- No emoji used as icons
- No left-border-accent feature cards (the most overused "modern SaaS" pattern)
- No stock abstract-3D-blob hero illustrations
- No fake product screenshots that don't reflect the real UI

## Visual identity
> **Note:** the current logo (`public/brand/lodestar-logo-temp.png`, also the
> favicon via `app/icon.png` / `app/apple-icon.png`) is a **temporary** logo —
> replace all three files when the final mark is ready.

Carries over directly from the favicon/icon work already done:
- **Primary background:** deep indigo/navy (`#161B33` or close)
- **Accent:** warm gold (`#E9C46A`) — used for the star mark, primary CTA button, and small highlight moments only. Not overused as a background color.
- **Secondary light sections:** warm ivory/cream (`#F7F3EC`) — alternate between dark (night-sky) and light (cream) sections down the page so it doesn't become a heavy, all-dark wall.
- **Typography:** a distinctive serif for headlines (Spectral or a similar elegant serif — same family used in the favicon exploration), paired with a clean geometric sans for body copy (Manrope or similar). Consistent with the icon work so the whole brand feels like one considered system, not separate decisions.
- **Iconography:** the compass-star mark as the actual logo; any supporting icons should be simple inline stroke SVG, not emoji, not a mismatched icon pack.
- Flat, confident color blocks. Motion and a soft accent glow are fine in small, deliberate doses (see Motion section) — but the base palette stays flat.

## Section-by-section structure

### 1. Hero
- Wordmark ("Lodestar") + compass-star mark, top left or centered
- One confident headline (not generic) — something that names the actual feeling, e.g. "Every finished task is a new star." (placeholder — refine copy to taste)
- One-line subhead doing the practical explaining, since the name itself stays clean: e.g. "The student planner that turns your workload into a night sky — never miss another hidden assignment."
- Primary CTA button ("Get started" / "Sign up") in the gold accent color, high contrast against the navy background
- Secondary, lower-emphasis link for "Log in"
- Background: the dark navy night-sky treatment, with a small number of real stars already lit (not a blank void) — this hero is the first impression of the actual reward mechanic, so it should already look a little alive, not empty

### 2. The real problem (builds trust before pitching)
- Light/cream section, breaking from the dark hero
- Plainly names the actual validated problem: teachers burying real assignments in announcements/modules instead of the Assignments tab, and how that causes genuinely missed work
- Should read as empathetic and specific, not alarmist — this section earns credibility by being accurate about the problem before claiming to solve it

### 3. How it works
- 3-4 step walkthrough (visual step markers, not just a wall of text): Canvas syncs automatically → AI catches what's hidden in announcements → you get a quick rundown to confirm, nothing added silently → your effort lights up your own sky
- Each step gets a small, real illustration of that specific mechanic (not generic stock icons) — e.g. an actual mini rendering of the rundown screen, an actual mini bar-chart schedule snippet
- Keep copy short per step — this section's job is clarity, not persuasion

### 4. The star map (visual centerpiece of the whole page)
- This is the section that should make someone want to use the product on sight
- A large, real (or realistic mock) rendering of the expanding night-sky/constellation view, with a few constellations partially lit
- Consider a light interactive moment here: hovering over a star could gently glow brighter, or a subtle ambient twinkle animation plays continuously — something that lets a visitor *feel* the core delight mechanic before signing up, not just read a description of it
- Short supporting copy: finished work earns Starlight, Starlight charts stars in real constellations (Orion, the Big Dipper, Cassiopeia first; more appear as lifetime Starlight grows). **Decision 2026-09-24:** constellations are real IAU constellations, not one per class — see gamificationSystem.md.

### 5. Trust / credibility
- Given the current stage, keep this honest and specific rather than inflating claims — e.g., "Built by a student who was tired of missing assignments buried in Canvas announcements" reads as more credible right now than a vague testimonials section with generic quotes
- If/when real usage numbers exist, this is where they'd go

### 6. Final call to action
- Repeat the primary CTA clearly, one more confident line of copy
- Keep this section short — don't re-explain everything again, just close

### 7. Footer
- Simple, minimal: links (log in, sign up, contact/feedback), and small print/legal as needed
- If any third-party assets with required attribution are used anywhere in the product's visuals, credit them here

## Motion & interaction notes
- A few real, functioning stars already twinkling in the hero background — subtle, slow, not distracting
- Smooth scroll-reveal for each section as the visitor scrolls (fade/slight rise-in), not an aggressive parallax effect
- The "how it works" step visuals can animate into place as they enter the viewport
- Keep all motion subtle and calm — matches the brand's actual emotional register. Nothing bouncy, nothing cartoonish, nothing that feels like a generic "modern startup" scroll-jacking effect

## Copy tone
- Warm, plainspoken, confident — never corporate-jargon ("leverage," "seamless," "revolutionize"), never over-explaining
- Speak to the real student experience with empathy, not shame — the pitch is "you shouldn't have to catch everything yourself," not "you're bad at keeping track of things"
- Short sentences. Let the visual design carry some of the "impressive" feeling so the copy doesn't have to oversell

## Technical / accessibility notes for implementation
- Use real semantic elements throughout even in a marketing page — actual `<button>` and `<a href>` elements for every CTA, not styled `<div>`s with click handlers
- Text contrast must hold up against the navy background — verify the gold accent and any body text meet real contrast ratios, not just "looks fine at a glance"
- Fully responsive: this needs to look considered on mobile, not just scaled down — the hero and star-map section especially need a real mobile layout pass, not just a shrink
- Keep animations lightweight — no heavy JS animation libraries if a simple CSS transition/keyframe accomplishes the same subtle effect; this is a marketing page, first-load performance matters for conversion