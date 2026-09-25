// The Lodestar backend this extension talks to. The single source for both
// the popup and the background service worker; there is deliberately no
// user-facing setting for it. For local development, change it to
// "http://localhost:3000" and reload the extension (then change it back).
const APP_ORIGIN = "https://lodestarplanner.vercel.app";
