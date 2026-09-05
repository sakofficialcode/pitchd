// IBM Carbon's data-viz categorical set: adjacent entries stay distinct even
// for colorblind viewers, unlike a hand-picked list of neighboring hues.
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

// Stable index-based color. Past the curated palette, hues are spaced by the
// golden angle so they keep spreading out instead of repeating.
export function getMemberColor(index: number): string {
  if (index < BASE_PALETTE.length) return BASE_PALETTE[index];
  const overflow = index - BASE_PALETTE.length;
  const hue = (overflow * GOLDEN_ANGLE) % 360;
  const lightness = overflow % 2 === 0 ? 40 : 58;
  return `hsl(${hue.toFixed(1)}, 65%, ${lightness}%)`;
}

export const MEMBER_COLORS = BASE_PALETTE;

// Understaffed hatching. Drawn as diagonal stripes rather than relying on hue
// alone, since it can land next to a member's assigned color.
export const UNDERSTAFFED_COLOR = '#d03b3b';
