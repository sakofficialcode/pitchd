// Shared categorical palette for mapping people to colors across the app
// (calendar shift blocks, legends, etc.). Based on IBM Carbon's data-viz
// categorical set, chosen because adjacent entries stay visually distinct
// even for colorblind viewers — unlike an arbitrary hand-picked list where
// neighboring hues (e.g. orange/red/magenta) can look nearly identical.
const BASE_PALETTE = [
  '#6929c4', // purple
  '#1192e8', // blue
  '#198038', // green
  '#b28600', // gold
  '#9f1853', // magenta
  '#009d9a', // cyan
  '#8a3800', // brown
  '#ee538b', // pink
  '#002d9c', // indigo
  '#fa4d56', // red
  '#005d5d', // teal
  '#a56eff', // violet
  '#570408', // maroon
  '#012749', // deep navy
];

const GOLDEN_ANGLE = 137.508;

// Assigns a color for the nth person (stable, index-based). Groups within
// the curated palette size get maximally-distinct hand-picked colors; any
// member beyond that gets a generated hue spaced by the golden angle so
// colors keep spreading out instead of repeating.
export function getMemberColor(index: number): string {
  if (index < BASE_PALETTE.length) return BASE_PALETTE[index];
  const overflow = index - BASE_PALETTE.length;
  const hue = (overflow * GOLDEN_ANGLE) % 360;
  const lightness = overflow % 2 === 0 ? 40 : 58;
  return `hsl(${hue.toFixed(1)}, 65%, ${lightness}%)`;
}

export const MEMBER_COLORS = BASE_PALETTE;

// Used for "understaffed" hatching, not tied to any one person — kept
// visually distinct via a diagonal-stripe pattern rather than relying on
// hue alone to avoid clashing with a member's assigned color.
export const UNDERSTAFFED_COLOR = '#d03b3b';
