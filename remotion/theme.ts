import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// Inter (SIL Open Font License), served from the render's own folder so no network is needed.
export const fontFamily = "Inter";
loadFont({ family: fontFamily, url: staticFile("inter.woff2"), weight: "100 900" });

/**
 * Congress Receipts: near-black, paper-white receipt, one gold accent.
 * No party colors anywhere: both parties get the same look.
 */
export const C = {
  bg: "#0B0B0C",
  ink: "#FFFFFF",
  dim: "#B4B8BF",
  faint: "#6E737B",
  paper: "#F7F4EC",
  paperInk: "#111111",
  paperDim: "#55524B",
  gold: "#FFC531",
  line: "#2A2C30",
};
