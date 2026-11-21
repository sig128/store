/**
 * DEVELOPMENT CATALOG — Drop 01 "Last Set".
 *
 * Everything here is development data until the operator approves it in /admin:
 *  - prices are placeholders,
 *  - stock quantities are seeded and marked unverified (no physical count),
 *  - measurements are SAMPLE values for building the size table UI; they are
 *    hidden in production until replaced with supplier garment measurements,
 *  - fabric weight, composition, decoration method and production times are
 *    intentionally NOT provided — the store must not invent them.
 */
import type { FulfillmentMode, ProductCategory } from "../../src/lib/types";

export type InkSet = "on_dark" | "on_light";

export interface ArtworkDef {
  code: string;
  family: "night_garage" | "last_rep_club" | "coastal_shift";
  kind: "ng_rear" | "ng_panel" | "chest_stamp" | "lrc_back" | "lrc_side" | "cs_rear" | "cs_chest" | "monogram";
  inks: InkSet;
  ground: string;
  title: string;
}

export interface VariantDef {
  code: string;
  colorName: string;
  colorHex: string; // swatch colour shown in the UI
  render: { color: string; trim?: string; wash: number };
  optionLabel?: string;
  priceNok: number;
  prints: { artwork: string; area: string; placement: string; method: "print" | "embroidery" | null; view: "front" | "back" }[];
  stock: Record<string, number>; // size -> seeded (unverified) quantity
  personalization?: { colorIds: string[] };
}

export interface ProductDef {
  slug: string;
  name: string;
  category: ProductCategory;
  categoryLabel: string;
  summary: string;
  description: string;
  heroView: "front" | "back";
  fulfillmentMode: FulfillmentMode;
  sizes: string[];
  variants: VariantDef[];
  sizeChart: { columns: { key: string; label: string; howToMeasure: string }[]; rows: Record<string, Record<string, number>> };
  fitNote: string;
  personalization?: { templateCode: string; priceNok: number };
}

const SIZE6 = ["XS", "S", "M", "L", "XL", "XXL"];

export const ARTWORKS: ArtworkDef[] = [
  { code: "NG-REAR-L", family: "night_garage", kind: "ng_rear", inks: "on_dark", ground: "#2b2a28", title: "Night Garage rear print — light inks" },
  { code: "NG-REAR-D", family: "night_garage", kind: "ng_rear", inks: "on_light", ground: "#dcd3c1", title: "Night Garage rear print — dark inks" },
  { code: "NG-PANEL", family: "night_garage", kind: "ng_panel", inks: "on_dark", ground: "#242423", title: "Night Garage jacket back panel" },
  { code: "AH-STAMP-L", family: "night_garage", kind: "chest_stamp", inks: "on_dark", ground: "#2b2a28", title: "After Hours chest stamp — light ink" },
  { code: "AH-STAMP-D", family: "night_garage", kind: "chest_stamp", inks: "on_light", ground: "#dcd3c1", title: "After Hours chest stamp — dark ink" },
  { code: "LRC-BACK-L", family: "last_rep_club", kind: "lrc_back", inks: "on_dark", ground: "#3a3a37", title: "Last Rep Club back graphic" },
  { code: "LRC-SIDE-L", family: "last_rep_club", kind: "lrc_side", inks: "on_dark", ground: "#2b2a28", title: "Last Rep Club side mark" },
  { code: "CS-REAR-L", family: "coastal_shift", kind: "cs_rear", inks: "on_dark", ground: "#2b2a28", title: "Coastal Shift rear print" },
  { code: "CS-CHEST-L", family: "coastal_shift", kind: "cs_chest", inks: "on_dark", ground: "#4d504e", title: "Coastal Shift chest — light inks" },
  { code: "CS-CHEST-D", family: "coastal_shift", kind: "cs_chest", inks: "on_light", ground: "#dcd3c1", title: "Coastal Shift chest — dark inks" },
  { code: "AH-MONO-L", family: "night_garage", kind: "monogram", inks: "on_dark", ground: "#2b2a28", title: "After Hours monogram — light" },
];

const WASHED_BLACK = { color: "#2b2a28", wash: 0.7 };
const BONE = { color: "#dcd3c1", wash: 0.35 };
const CHARCOAL = { color: "#3a3a37", wash: 0.55 };
const TEAL = { color: "#23504c", wash: 0.3 };
const ASPHALT = { color: "#4d504e", wash: 0.3 };

export const PRODUCTS: ProductDef[] = [
  {
    slug: "last-set-pump-cover-tee",
    name: "LAST SET",
    category: "tee",
    categoryLabel: "Oversized pump-cover tee",
    summary: "The hero piece: a washed-black pump cover with the Night Garage scene across the back.",
    description:
      "Cut big to go over a stringer and come off when the pump arrives. Dropped shoulders, a boxy body and a rear print of a roll-up gym door left open after closing. A small chest stamp keeps the front quiet.",
    heroView: "back",
    fulfillmentMode: "stocked",
    sizes: SIZE6,
    fitNote: "Oversized with dropped shoulders. Take your usual size for the intended loose fit.",
    variants: [
      {
        code: "LS-WBLK",
        colorName: "Washed Black",
        colorHex: "#2b2a28",
        render: WASHED_BLACK,
        priceNok: 549,
        prints: [
          { artwork: "NG-REAR-L", area: "rear_full", placement: "Rear, full back", method: null, view: "back" },
          { artwork: "AH-STAMP-L", area: "chest_left", placement: "Left chest", method: null, view: "front" },
        ],
        stock: { XS: 6, S: 14, M: 22, L: 18, XL: 9, XXL: 0 },
      },
      {
        code: "LS-BONE",
        colorName: "Faded Bone",
        colorHex: "#dcd3c1",
        render: BONE,
        priceNok: 549,
        prints: [
          { artwork: "NG-REAR-D", area: "rear_full", placement: "Rear, full back", method: null, view: "back" },
          { artwork: "AH-STAMP-D", area: "chest_left", placement: "Left chest", method: null, view: "front" },
        ],
        stock: { XS: 3, S: 8, M: 11, L: 7, XL: 2, XXL: 1 },
      },
    ],
    sizeChart: {
      columns: [
        { key: "chest", label: "Chest width", howToMeasure: "Laid flat, straight across 2.5 cm below the armpits." },
        { key: "length", label: "Body length", howToMeasure: "Laid flat, from the highest point of the shoulder to the hem." },
        { key: "sleeve", label: "Sleeve length", howToMeasure: "From the shoulder seam to the sleeve hem." },
      ],
      rows: {
        XS: { chest: 550, length: 690, sleeve: 230 },
        S: { chest: 580, length: 710, sleeve: 240 },
        M: { chest: 610, length: 730, sleeve: 250 },
        L: { chest: 640, length: 750, sleeve: 260 },
        XL: { chest: 670, length: 770, sleeve: 270 },
        XXL: { chest: 700, length: 790, sleeve: 280 },
      },
    },
  },
  {
    slug: "night-run-stringer",
    name: "NIGHT RUN",
    category: "stringer",
    categoryLabel: "Deep-cut gym stringer",
    summary: "Clean front, sharp Last Rep Club graphic low on the back.",
    description:
      "A proper deep-cut stringer: narrow straps, low armholes and a racer back that leaves room to move. The front stays clean; the back carries the Last Rep Club crest where it shows under a pump cover's hem.",
    heroView: "back",
    fulfillmentMode: "stocked",
    sizes: ["S", "M", "L", "XL", "XXL"],
    fitNote: "Close through the body with deep armholes. Size up if you prefer more room in the body.",
    variants: [
      {
        code: "NR-CHAR",
        colorName: "Washed Charcoal",
        colorHex: "#3a3a37",
        render: CHARCOAL,
        priceNok: 399,
        prints: [{ artwork: "LRC-BACK-L", area: "rear_lower", placement: "Lower back", method: null, view: "back" }],
        stock: { S: 9, M: 16, L: 12, XL: 6, XXL: 3 },
      },
      {
        code: "NR-TEAL",
        colorName: "Dark Teal",
        colorHex: "#23504c",
        render: TEAL,
        priceNok: 399,
        prints: [{ artwork: "LRC-BACK-L", area: "rear_lower", placement: "Lower back", method: null, view: "back" }],
        stock: { S: 4, M: 7, L: 1, XL: 0, XXL: 2 },
      },
    ],
    sizeChart: {
      columns: [
        { key: "chest", label: "Chest width", howToMeasure: "Laid flat, straight across at the bottom of the armholes." },
        { key: "length", label: "Body length", howToMeasure: "Laid flat, from the top of the strap to the hem." },
      ],
      rows: {
        S: { chest: 480, length: 700 },
        M: { chest: 505, length: 720 },
        L: { chest: 530, length: 740 },
        XL: { chest: 555, length: 760 },
        XXL: { chest: 580, length: 780 },
      },
    },
  },
  {
    slug: "heat-check-training-singlet",
    name: "HEAT CHECK",
    category: "singlet",
    categoryLabel: "Athletic training singlet",
    summary: "Wider straps, a higher armhole and contrast binding. The one you can put your name on.",
    description:
      "Cut differently from the stringer: wider straps, a moderate armhole and a longer body with contrast binding, like an old track singlet. A small Coastal Shift mark sits on the chest. The upper back is reserved for an optional Locker Tag.",
    heroView: "front",
    fulfillmentMode: "stocked",
    sizes: SIZE6,
    fitNote: "Athletic fit through the body. Take your usual size.",
    personalization: { templateCode: "LT-SINGLET-UB", priceNok: 149 },
    variants: [
      {
        code: "HC-ASPH",
        colorName: "Asphalt",
        colorHex: "#4d504e",
        render: { ...ASPHALT, trim: "#e3dccd" },
        priceNok: 449,
        prints: [{ artwork: "CS-CHEST-L", area: "chest_center", placement: "Centre chest", method: null, view: "front" }],
        stock: { XS: 5, S: 10, M: 14, L: 12, XL: 5, XXL: 2 },
        personalization: { colorIds: ["bone", "coral"] },
      },
      {
        code: "HC-BONE",
        colorName: "Faded Bone",
        colorHex: "#dcd3c1",
        render: { ...BONE, trim: "#2a2a28" },
        priceNok: 449,
        prints: [{ artwork: "CS-CHEST-D", area: "chest_center", placement: "Centre chest", method: null, view: "front" }],
        stock: { XS: 2, S: 6, M: 9, L: 8, XL: 3, XXL: 0 },
        personalization: { colorIds: ["charcoal", "teal"] },
      },
    ],
    sizeChart: {
      columns: [
        { key: "chest", label: "Chest width", howToMeasure: "Laid flat, straight across at the bottom of the armholes." },
        { key: "length", label: "Body length", howToMeasure: "Laid flat, from the top of the strap to the hem." },
      ],
      rows: {
        XS: { chest: 460, length: 690 },
        S: { chest: 485, length: 710 },
        M: { chest: 510, length: 730 },
        L: { chest: 535, length: 750 },
        XL: { chest: 560, length: 770 },
        XXL: { chest: 585, length: 790 },
      },
    },
  },
  {
    slug: "after-hours-heavyweight-hoodie",
    name: "AFTER HOURS",
    category: "hoodie",
    categoryLabel: "Heavyweight hoodie",
    summary: "A small monogram on the chest. Choose a clean back or the Coastal Shift rear print.",
    description:
      "The warm layer for the walk home. A compact monogram on the chest, a kangaroo pocket and ribbed cuffs and hem. Take it plain, or with the large Coastal Shift sunset across the back.",
    heroView: "back",
    fulfillmentMode: "stocked",
    sizes: SIZE6,
    fitNote: "Relaxed fit. Take your usual size; size up for an oversized look.",
    variants: [
      {
        code: "AH-WBLK-CS",
        colorName: "Washed Black",
        optionLabel: "Coastal Shift back",
        colorHex: "#2b2a28",
        render: WASHED_BLACK,
        priceNok: 999,
        prints: [
          { artwork: "AH-MONO-L", area: "chest_left", placement: "Left chest", method: "embroidery", view: "front" },
          { artwork: "CS-REAR-L", area: "rear_full", placement: "Rear, full back", method: null, view: "back" },
        ],
        stock: { XS: 3, S: 7, M: 12, L: 10, XL: 6, XXL: 2 },
      },
      {
        code: "AH-WBLK",
        colorName: "Washed Black",
        optionLabel: "Clean back",
        colorHex: "#2b2a28",
        render: WASHED_BLACK,
        priceNok: 899,
        prints: [{ artwork: "AH-MONO-L", area: "chest_left", placement: "Left chest", method: "embroidery", view: "front" }],
        stock: { XS: 4, S: 8, M: 10, L: 9, XL: 4, XXL: 3 },
      },
      {
        code: "AH-ASPH",
        colorName: "Asphalt",
        optionLabel: "Clean back",
        colorHex: "#4d504e",
        render: ASPHALT,
        priceNok: 899,
        prints: [{ artwork: "AH-MONO-L", area: "chest_left", placement: "Left chest", method: "embroidery", view: "front" }],
        stock: { XS: 0, S: 5, M: 9, L: 8, XL: 5, XXL: 1 },
      },
    ],
    sizeChart: {
      columns: [
        { key: "chest", label: "Chest width", howToMeasure: "Laid flat, straight across 2.5 cm below the armpits." },
        { key: "length", label: "Body length", howToMeasure: "Laid flat, from the highest point of the shoulder to the bottom of the hem rib." },
        { key: "sleeve", label: "Sleeve (centre back)", howToMeasure: "From the centre back neck, over the shoulder, to the end of the cuff." },
      ],
      rows: {
        XS: { chest: 590, length: 680, sleeve: 830 },
        S: { chest: 615, length: 700, sleeve: 850 },
        M: { chest: 640, length: 720, sleeve: 870 },
        L: { chest: 665, length: 740, sleeve: 890 },
        XL: { chest: 690, length: 760, sleeve: 910 },
        XXL: { chest: 715, length: 780, sleeve: 930 },
      },
    },
  },
  {
    slug: "floor-work-training-shorts",
    name: "FLOOR WORK",
    category: "shorts",
    categoryLabel: "Training shorts",
    summary: "Split-hem training shorts with one restrained Last Rep Club mark on the leg.",
    description:
      "Short, light and out of the way for squats and floor work. Curved side splits, a covered elastic waistband with a drawcord, and a single vertical Last Rep Club mark on the left leg.",
    heroView: "front",
    fulfillmentMode: "stocked",
    sizes: SIZE6,
    fitNote: "Regular fit with a short inseam. Take your usual size.",
    variants: [
      {
        code: "FW-WBLK",
        colorName: "Washed Black",
        colorHex: "#2b2a28",
        render: { color: "#2b2a28", wash: 0.45 },
        priceNok: 499,
        prints: [{ artwork: "LRC-SIDE-L", area: "left_leg_side", placement: "Left leg, outer thigh", method: null, view: "front" }],
        stock: { XS: 4, S: 11, M: 15, L: 13, XL: 7, XXL: 2 },
      },
      {
        code: "FW-TEAL",
        colorName: "Dark Teal",
        colorHex: "#23504c",
        render: TEAL,
        priceNok: 499,
        prints: [{ artwork: "LRC-SIDE-L", area: "left_leg_side", placement: "Left leg, outer thigh", method: null, view: "front" }],
        stock: { XS: 2, S: 6, M: 8, L: 0, XL: 4, XXL: 1 },
      },
    ],
    sizeChart: {
      columns: [
        { key: "waist", label: "Waist, relaxed", howToMeasure: "Laid flat, straight across the top of the waistband, unstretched." },
        { key: "hip", label: "Hip width", howToMeasure: "Laid flat, straight across at the bottom of the fly area." },
        { key: "inseam", label: "Inseam", howToMeasure: "From the crotch seam to the hem along the inside leg." },
      ],
      rows: {
        XS: { waist: 330, hip: 510, inseam: 130 },
        S: { waist: 350, hip: 530, inseam: 130 },
        M: { waist: 370, hip: 550, inseam: 130 },
        L: { waist: 390, hip: 570, inseam: 135 },
        XL: { waist: 410, hip: 590, inseam: 135 },
        XXL: { waist: 430, hip: 610, inseam: 135 },
      },
    },
  },
  {
    slug: "closing-time-warm-up-jacket",
    name: "CLOSING TIME",
    category: "jacket",
    categoryLabel: "Statement warm-up jacket",
    summary: "The only jacket in the drop: coral-striped sleeves and an illustrated Night Garage back panel.",
    description:
      "A warm-up jacket for leaving after the lights go off. Stand collar, full zip, coral stripes down the raglan sleeves and an illustrated back panel framing the Night Garage scene. Made to order.",
    heroView: "back",
    fulfillmentMode: "made_to_order",
    sizes: SIZE6,
    fitNote: "Boxy, slightly cropped fit. Take your usual size.",
    variants: [
      {
        code: "CT-NIGHT",
        colorName: "Night / Coral",
        colorHex: "#242423",
        render: { color: "#242423", trim: "#ee7c5e", wash: 0.08 },
        priceNok: 1499,
        prints: [
          { artwork: "NG-PANEL", area: "back_panel", placement: "Back panel", method: null, view: "back" },
          { artwork: "AH-MONO-L", area: "chest_left", placement: "Left chest", method: null, view: "front" },
        ],
        stock: {},
      },
    ],
    sizeChart: {
      columns: [
        { key: "chest", label: "Chest width", howToMeasure: "Zipped, laid flat, straight across 2.5 cm below the armpits." },
        { key: "length", label: "Body length", howToMeasure: "From the centre back below the collar to the bottom of the hem rib." },
        { key: "sleeve", label: "Sleeve (centre back)", howToMeasure: "From the centre back neck, over the shoulder, to the end of the cuff." },
      ],
      rows: {
        XS: { chest: 580, length: 640, sleeve: 820 },
        S: { chest: 605, length: 655, sleeve: 840 },
        M: { chest: 630, length: 670, sleeve: 860 },
        L: { chest: 655, length: 685, sleeve: 880 },
        XL: { chest: 680, length: 700, sleeve: 900 },
        XXL: { chest: 705, length: 715, sleeve: 920 },
      },
    },
  },
];

export const LOCKER_TAG_TEMPLATE = {
  code: "LT-SINGLET-UB",
  version: 1,
  name: "Locker Tag — singlet upper back",
  placement: "Upper back, centred below the collar",
  areaMm: { widthMm: 260, heightMm: 230, offsetFromCollarMm: 70 },
  fields: [
    { key: "name", label: "Name", maxLength: 12, pattern: "^[A-ZÆØÅ][A-ZÆØÅ .'-]{0,11}$", required: false, placeholder: "NORD" },
    { key: "number", label: "Number", maxLength: 2, pattern: "^[0-9]{1,2}$", required: false, placeholder: "13" },
  ],
  colors: [
    { id: "bone", name: "Faded Bone", hex: "#ebe3d2" },
    { id: "coral", name: "Sunset Coral", hex: "#ee7c5e" },
    { id: "charcoal", name: "Charcoal", hex: "#2a2a28" },
    { id: "teal", name: "Dark Teal", hex: "#1f4d4a" },
  ],
} as const;

export const OUTFITS = [
  {
    slug: "training-0113",
    title: "Training, 01:13",
    subtitle: "Pump cover over a stringer, shorts that stay out of the way.",
    items: [
      { product: "last-set-pump-cover-tee", variant: "LS-WBLK", view: "back" as const, label: "LAST SET" },
      { product: "night-run-stringer", variant: "NR-CHAR", view: "front" as const, label: "NIGHT RUN" },
      { product: "floor-work-training-shorts", variant: "FW-WBLK", view: "front" as const, label: "FLOOR WORK" },
    ],
  },
  {
    slug: "closing-warm-up",
    title: "Closing warm-up",
    subtitle: "The jacket does the talking. Everything under it stays quiet.",
    items: [
      { product: "closing-time-warm-up-jacket", variant: "CT-NIGHT", view: "back" as const, label: "CLOSING TIME" },
      { product: "after-hours-heavyweight-hoodie", variant: "AH-ASPH", view: "front" as const, label: "AFTER HOURS" },
      { product: "floor-work-training-shorts", variant: "FW-TEAL", view: "front" as const, label: "FLOOR WORK" },
      { product: "heat-check-training-singlet", variant: "HC-ASPH", view: "front" as const, label: "HEAT CHECK" },
    ],
  },
];

export const SHIPPING_DEV = {
  zone: { name: "Norway", countries: ["NO"] },
  rates: [
    { name: "Pickup point", carrier: "Posten/Bring", service: "Pakke til hentested", priceNok: 79 },
    { name: "Home delivery", carrier: "Posten/Bring", service: "Pakke levert hjem", priceNok: 149 },
  ],
};
