/** Shared by the video and the render checks, so the checks look at exactly where things are drawn. */
export const W = 1080;
export const H = 1920;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The filing card. Nothing may be drawn on top of it once it is up. */
export const CARD: Box = { x: 70, y: 470, w: 940, h: 720 };
/** The result: stock vs S&P 500. The stamp lands above the card, never here. */
export const RESULT: Box = { x: 70, y: 1215, w: 940, h: 300 };
/** Headline zone: hook text, beat labels, and the stamp. */
export const HEAD: Box = { x: 60, y: 200, w: 960, h: 250 };
/** Captions live below the result. */
export const CAPTIONS: Box = { x: 70, y: 1545, w: 940, h: 190 };
export const FOOTER_Y = 1790;

export const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
