/** Shared artwork helpers for the art pipeline (2D renders and 3D maps). */
import { ARTWORKS, PRODUCTS, type ArtworkDef } from "../data/drop01";
import * as P from "./prints";
import type { PlacedPrint } from "./render";

export function makeArt(def: ArtworkDef): P.PrintArt {
  const ink = def.inks === "on_dark" ? P.INKS_ON_DARK(def.ground) : P.INKS_ON_LIGHT(def.ground);
  switch (def.kind) {
    case "ng_rear":
      return P.nightGarageRear(ink, def.code);
    case "ng_panel":
      return P.nightGaragePanel(ink, def.code);
    case "chest_stamp":
      return P.chestStamp(ink, def.code);
    case "lrc_back":
      return P.lastRepBack(ink, def.code);
    case "lrc_side":
      return P.lastRepSide(ink, def.code);
    case "cs_rear":
      return P.coastalRear(ink, def.code);
    case "cs_chest":
      return P.coastalChest(ink, def.code);
    case "monogram":
      return P.monogram(ink, def.code);
  }
}

const artCache = new Map<string, P.PrintArt>();
export function artFor(code: string, groundOverride?: string): P.PrintArt {
  const def = ARTWORKS.find((a) => a.code === code);
  if (!def) throw new Error(`Unknown artwork ${code}`);
  const key = `${code}:${groundOverride ?? ""}`;
  let a = artCache.get(key);
  if (!a) {
    a = makeArt(groundOverride ? { ...def, ground: groundOverride } : def);
    artCache.set(key, a);
  }
  return a;
}

export function placed(prints: (typeof PRODUCTS)[number]["variants"][number]["prints"], view: "front" | "back"): PlacedPrint[] {
  return prints
    .filter((p) => p.view === view)
    .map((p) => ({ art: artFor(p.artwork), area: p.area, method: p.method === "embroidery" ? "embroidery" : "print" }));
}

