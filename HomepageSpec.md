# Lodestar homepage spec (implemented in `components/landing/`)

## Philosophy
A small escape before a sales pitch: the quiet night sky that fills with light as effort accumulates should be *felt* within seconds. Calm and confident, not loud. Avoid SaaS clichés: purple-blue gradient washes, Inter/Roboto/Arial, emoji as icons, left-border-accent cards, 3D blobs, fake screenshots that don't match the real UI.

## Identity
- Navy `#161B33` primary; gold `#E9C46A` only for the star mark, primary CTA and small highlights; cream `#F7F3EC` sections alternate with navy so the page isn't an all-dark wall.
- Spectral headlines + Manrope body. Icons are simple inline stroke SVG. Flat color blocks; motion and soft glow in small doses. The logo is **temporary** (`public/brand/lodestar-*-temp.png`).

## Sections
1. **Hero:** a pinned, natively scrolling stage (no scroll-jacking) where the Big Dipper's stars light one by one and its line draws itself, finishing exactly as the headline and CTA settle in, then a short hold. Starts as a dim sky with a small tagline and scroll cue; a "Get started" pill stays in the nav. Faint parallax (a few vh) between a far starfield, a mid starfield and the constellation. No-JS and reduced-motion visitors get the finished sky at once.
2. **Try it:** a small interactive planner (five real-format task cards); finishing one earns Starlight and charts a star in Cassiopeia.
3. **The real problem** (cream): teachers bury due dates in announcements or modules; empathetic and specific, not alarmist.
4. **How it works:** four steps (Canvas syncs → AI reads the fine print → you get the final say in the Rundown → effort becomes Starlight), each with a small illustration of the real mechanic.
5. **Star map** (centerpiece): partly charted Orion, Big Dipper and Cassiopeia with hover/focus glow; more constellations appear as lifetime Starlight grows.
6. **Trust:** honest and specific ("built by a student tired of missing assignments buried in Canvas announcements"); no fake testimonials or inflated numbers.
7. **Final CTA** and a minimal **footer** (log in, sign up, terms, privacy, credits; attribution for third-party assets).

## Motion
Calm and subtle: slow twinkles, fade/rise scroll reveals, steps animating into place. Nothing bouncy, cartoonish or scroll-jacky. No heavy animation libraries (CSS transitions/keyframes; one passive scroll listener drives the hero).

## Copy
Warm, plainspoken, confident; short sentences; no jargon ("leverage", "seamless"). Speak with empathy ("you shouldn't have to catch everything yourself"), never shame.

## Technical
Real semantic elements (`<button>`, `<a href>`) for every CTA; verify text contrast on navy for the gold and body text; a real mobile layout pass (hero and star map especially); keep first-load light.
