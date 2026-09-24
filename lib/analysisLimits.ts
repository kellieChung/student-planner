// Most announcements one check may analyze — bounds the Anthropic spend of a
// single check so a wide date range can't be run in one go. Shared by the
// route (enforces it) and the Rundown controls (explains it), so it lives
// apart from lib/aiRateLimit.ts, which imports the DB client.
export const MAX_ANNOUNCEMENTS_PER_CHECK = 10;
