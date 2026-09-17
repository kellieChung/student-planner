// Shared grid constants for the World map's fixed-pixel ground grid.
// Everything placed on the map (ground tiles, decorations, scatter
// houses, the wall, buildings, markers) is positioned in these same grid
// units.
export const GROUND_TILE_PX = 48;

// CONTENT_COLS/CONTENT_ROWS is the "main area" DEFAULT_WORLD_LAYOUT's
// buildings/decorations/markers were hand-tuned against
// (lib/worldLayout.ts) — kept as its own constant so that tuning stays
// meaningful even though the actual map is bigger (below).
export const CONTENT_COLS = 26;
export const CONTENT_ROWS = 14;

// A real buffer of grass on every side of the content area — not just a
// looser zoom-out. The map used to let the camera zoom below "fit" into
// empty letterbox space to give some breathing room, but that reads as
// "seeing outside the grid," which isn't wanted; instead the grid itself
// is bigger, so the breathing room is real content (grass), visible by
// default at fit, and MapViewport's zoom-out is capped at exactly fit
// (never below) so the dark background beyond the grid's true edge is
// never reachable.
// Wider than tall on purpose — most screens are, so a horizontally
// generous frame keeps more of the fit-scale headroom on the width axis
// instead of height being the constraint that leaves buildings feeling
// tight/cropped against the sides.
export const MARGIN_COLS = 18;
export const MARGIN_ROWS = 10;

// FRAME_COLS/FRAME_ROWS is the *entire* map (content + margin), not a
// viewport into something larger — this is the "minimum guaranteed
// frame" the user asked for: always fully visible (scaled to fit, never
// clipped) at the default zoom in both the live World view and the map
// editor (components/world/MapViewport.tsx), regardless of screen size.
// There is deliberately no content beyond this frame; zooming in reveals
// more *detail* of the same fixed area, not new area.
export const FRAME_COLS = CONTENT_COLS + MARGIN_COLS * 2;
export const FRAME_ROWS = CONTENT_ROWS + MARGIN_ROWS * 2;
export const FRAME_WIDTH_PX = FRAME_COLS * GROUND_TILE_PX;
export const FRAME_HEIGHT_PX = FRAME_ROWS * GROUND_TILE_PX;
