/**
 * Garment silhouettes and construction details, drawn on a 1200×1500 canvas
 * (centre line x = 600). Each view lists: the body silhouette, layers behind it
 * (hoods), panels/ribs inside it, stitch lines, fold shading, hardware and named
 * print areas. Placement boxes are also what the print templates reference.
 */
import type { ProductCategory } from "../../src/lib/types";
import { mirrorPath, mirrorSegs, openPath, rect, type Pt, type Seg } from "./lib/svg";

export const CANVAS = { w: 1200, h: 1500 } as const;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Panel {
  d: string;
  /** -1 (black) … 0 (base) … +1 (white) */
  shade: number;
  /** "trim" uses the variant trim colour instead of the base */
  trim?: boolean;
}
export interface Rib {
  /** centre line of the band */
  d: string;
  width: number;
  shade: number;
  trim?: boolean;
}
export interface Fold {
  d: string;
  w: number;
  blur: number;
  kind: "shadow" | "highlight";
  o: number;
}
export interface GarmentView {
  silhouette: string;
  behind: Panel[];
  panels: Panel[];
  ribs: Rib[];
  stitches: string[];
  folds: Fold[];
  hardware: (c: { base: string; trim: string; dark: string; light: string }) => string;
  areas: Record<string, Box>;
}
export interface GarmentDef {
  category: ProductCategory;
  fabric: "jersey" | "fleece" | "woven" | "mesh";
  front: GarmentView;
  back: GarmentView;
}

const P = (s: Pt, segs: Seg[]) => openPath(s, segs);
const mirrorOpen = (s: Pt, segs: Seg[]) => {
  const m = mirrorSegs(s, segs);
  return openPath(m.start, m.segs);
};
const both = (s: Pt, segs: Seg[]) => P(s, segs) + mirrorOpen(s, segs);
const fold = (d: string, w: number, blur: number, kind: Fold["kind"], o: number): Fold => ({ d, w, blur, kind, o });
const none = () => "";

/* ───────────────────────────── TEE (oversized pump cover) ───────────────────────────── */

function teeHalf(neckY: number): { start: Pt; segs: Seg[] } {
  return {
    start: [600, neckY],
    segs: [
      { t: "C", c1: [668, neckY], c2: [712, neckY - 26], to: [722, 236] },
      { t: "C", c1: [790, 246], c2: [860, 260], to: [918, 282] },
      { t: "C", c1: [985, 318], c2: [1055, 372], to: [1112, 428] },
      { t: "L", to: [1046, 602] },
      { t: "C", c1: [985, 586], c2: [925, 572], to: [884, 562] },
      { t: "C", c1: [889, 760], c2: [892, 1000], to: [888, 1240] },
      { t: "C", c1: [800, 1252], c2: [700, 1256], to: [600, 1256] },
    ],
  };
}

function teeView(back: boolean): GarmentView {
  const neckY = back ? 262 : 318;
  const h = teeHalf(neckY);
  const silhouette = mirrorPath(h.start, h.segs);
  const frontNeck = both([600, neckY], [{ t: "C", c1: [668, neckY], c2: [712, neckY - 26], to: [722, 236] }]);
  const interior = back
    ? []
    : [
        {
          d: mirrorPath([600, 256], [
            { t: "C", c1: [660, 256], c2: [706, 246], to: [722, 236] },
            { t: "C", c1: [712, 292], c2: [668, 318], to: [600, 318] },
          ]),
          shade: -0.5,
        },
      ];
  const armSeam = both([918, 282], [{ t: "C", c1: [934, 380], c2: [906, 482], to: [884, 562] }]);
  return {
    silhouette,
    behind: [],
    panels: interior,
    ribs: [
      { d: frontNeck, width: 26, shade: -0.08 },
      ...(back ? [] : [{ d: both([600, 256], [{ t: "C", c1: [660, 256], c2: [706, 246], to: [722, 236] }]), width: 16, shade: -0.28 }]),
    ],
    stitches: [
      armSeam,
      // sleeve hems (twin needle)
      both([1094, 452], [{ t: "L", to: [1034, 584] }]),
      both([1084, 448], [{ t: "L", to: [1026, 580] }]),
      // body hem (twin needle)
      both([600, 1228], [{ t: "C", c1: [700, 1228], c2: [800, 1224], to: [886, 1214] }]),
      both([600, 1238], [{ t: "C", c1: [700, 1238], c2: [800, 1234], to: [887, 1224] }]),
      // collar seam
      both([600, neckY + 14], [{ t: "C", c1: [664, neckY + 14], c2: [706, neckY - 12], to: [712, 246] }]),
    ],
    folds: [
      fold(both([884, 575], [{ t: "C", c1: [840, 610], c2: [790, 650], to: [730, 700] }]), 34, 18, "shadow", 0.42),
      fold(both([930, 320], [{ t: "C", c1: [980, 380], c2: [1030, 440], to: [1070, 520] }]), 26, 16, "highlight", 0.1),
      fold(both([960, 560], [{ t: "C", c1: [990, 540], c2: [1020, 520], to: [1050, 500] }]), 20, 12, "shadow", 0.3),
      fold(P([420, 1170], [{ t: "C", c1: [520, 1150], c2: [640, 1185], to: [760, 1160] }]), 30, 16, "shadow", 0.28),
      fold(P([600, 380], [{ t: "C", c1: [605, 600], c2: [595, 900], to: [604, 1180] }]), 120, 60, "highlight", 0.06),
      fold(both([760, 330], [{ t: "C", c1: [790, 520], c2: [820, 820], to: [800, 1120] }]), 40, 30, "shadow", 0.16),
    ],
    hardware: none,
    areas: back
      ? { rear_full: { x: 368, y: 360, w: 464, h: 610 }, rear_upper: { x: 400, y: 330, w: 400, h: 160 } }
      : { chest_left: { x: 690, y: 400, w: 128, h: 80 }, chest_center: { x: 470, y: 410, w: 260, h: 200 } },
  };
}

/* ───────────────────────────── STRINGER (deep cut) ───────────────────────────── */

function stringerView(back: boolean): GarmentView {
  const side: Seg[] = [
    { t: "C", c1: [858, 1000], c2: [862, 1150], to: [860, 1290] },
    { t: "C", c1: [780, 1302], c2: [690, 1306], to: [600, 1306] },
  ];
  const segs: Seg[] = back
    ? [
        { t: "C", c1: [640, 456], c2: [686, 330], to: [690, 232] },
        { t: "L", to: [744, 228] },
        { t: "C", c1: [742, 330], c2: [702, 420], to: [664, 524] },
        { t: "C", c1: [690, 690], c2: [764, 800], to: [850, 838] },
        ...side,
      ]
    : [
        { t: "C", c1: [655, 545], c2: [688, 420], to: [690, 232] },
        { t: "L", to: [744, 228] },
        { t: "C", c1: [750, 420], c2: [800, 740], to: [850, 838] },
        ...side,
      ];
  const start: Pt = back ? [600, 470] : [600, 545];
  const silhouette = mirrorPath(start, segs);
  const neck: Seg[] = back ? [segs[0]!] : [segs[0]!];
  const arm: Seg[] = back ? [segs[2]!, segs[3]!] : [segs[2]!];
  const binding = both(start, neck) + both([744, 228], arm);
  return {
    silhouette,
    behind: [],
    panels: [],
    ribs: [{ d: binding, width: 16, shade: -0.1, trim: true }],
    stitches: [
      both(back ? [600, 486] : [600, 561], [{ t: "C", c1: back ? [646, 470] : [662, 561], c2: back ? [698, 330] : [702, 420], to: [704, 244] }]),
      both([600, 1280], [{ t: "C", c1: [700, 1280], c2: [790, 1276], to: [858, 1266] }]),
      both([600, 1290], [{ t: "C", c1: [700, 1290], c2: [790, 1286], to: [859, 1276] }]),
    ],
    folds: [
      fold(both([850, 860], [{ t: "C", c1: [820, 900], c2: [790, 960], to: [770, 1040] }]), 30, 16, "shadow", 0.32),
      fold(P([600, back ? 560 : 640], [{ t: "C", c1: [604, 800], c2: [596, 1000], to: [602, 1220] }]), 110, 55, "highlight", 0.07),
      fold(P([440, 1200], [{ t: "C", c1: [520, 1180], c2: [650, 1215], to: [760, 1190] }]), 26, 14, "shadow", 0.26),
      fold(both([716, 300], [{ t: "C", c1: [724, 500], c2: [760, 700], to: [820, 820] }]), 18, 10, "highlight", 0.12),
    ],
    hardware: none,
    areas: back
      ? { rear_lower: { x: 380, y: 830, w: 440, h: 420 } }
      : { chest_center: { x: 500, y: 640, w: 200, h: 140 } },
  };
}

/* ───────────────────────────── SINGLET (athletic) ───────────────────────────── */

function singletView(back: boolean): GarmentView {
  const neckY = back ? 318 : 430;
  const segs: Seg[] = [
    back
      ? { t: "C", c1: [652, 318], c2: [694, 290], to: [700, 232] }
      : { t: "C", c1: [652, 430], c2: [694, 352], to: [700, 232] },
    { t: "L", to: [796, 232] },
    { t: "C", c1: [800, 420], c2: [826, 600], to: [884, 652] },
    { t: "C", c1: [880, 820], c2: [866, 960], to: [874, 1310] },
    { t: "C", c1: [780, 1322], c2: [690, 1326], to: [600, 1326] },
  ];
  const silhouette = mirrorPath([600, neckY], segs);
  const binding = both([600, neckY], [segs[0]!]) + both([796, 232], [segs[2]!]);
  return {
    silhouette,
    behind: [],
    panels: [],
    ribs: [{ d: binding, width: 22, shade: 0, trim: true }],
    stitches: [
      both([600, neckY + 20], [
        back
          ? { t: "C", c1: [648, neckY + 20], c2: [690, 300], to: [688, 246] }
          : { t: "C", c1: [648, neckY + 20], c2: [684, 360], to: [688, 246] },
      ]),
      both([784, 246], [{ t: "C", c1: [788, 430], c2: [812, 610], to: [866, 664] }]),
      both([600, 1300], [{ t: "C", c1: [700, 1300], c2: [790, 1296], to: [872, 1286] }]),
      both([600, 1310], [{ t: "C", c1: [700, 1310], c2: [790, 1306], to: [873, 1296] }]),
    ],
    folds: [
      fold(both([884, 680], [{ t: "C", c1: [840, 720], c2: [800, 780], to: [760, 860] }]), 30, 16, "shadow", 0.34),
      fold(P([600, 500], [{ t: "C", c1: [604, 760], c2: [596, 1000], to: [602, 1240] }]), 120, 60, "highlight", 0.07),
      fold(P([420, 1230], [{ t: "C", c1: [520, 1210], c2: [650, 1245], to: [780, 1220] }]), 28, 14, "shadow", 0.26),
      fold(both([760, 900], [{ t: "C", c1: [790, 1000], c2: [800, 1100], to: [790, 1200] }]), 40, 26, "shadow", 0.14),
    ],
    hardware: none,
    areas: back
      ? { locker_tag: { x: 440, y: 400, w: 320, h: 330 }, rear_full: { x: 420, y: 420, w: 360, h: 520 } }
      : { chest_center: { x: 468, y: 520, w: 264, h: 184 } },
  };
}

/* ───────────────────────────── HOODIE (heavyweight) ───────────────────────────── */

function hoodieView(back: boolean): GarmentView {
  const neckY = back ? 300 : 372;
  const segs: Seg[] = [
    back
      ? { t: "C", c1: [650, 300], c2: [700, 296], to: [726, 292] }
      : { t: "C", c1: [650, 362], c2: [700, 330], to: [726, 292] },
    { t: "C", c1: [800, 300], c2: [870, 318], to: [910, 340] },
    { t: "C", c1: [975, 470], c2: [1050, 760], to: [1090, 1052] },
    { t: "L", to: [1098, 1150] },
    { t: "C", c1: [1060, 1160], c2: [1030, 1162], to: [1004, 1158] },
    { t: "L", to: [996, 1062] },
    { t: "C", c1: [968, 860], c2: [918, 700], to: [884, 620] },
    { t: "C", c1: [889, 850], c2: [890, 1050], to: [886, 1180] },
    { t: "L", to: [884, 1262] },
    { t: "C", c1: [800, 1270], c2: [700, 1272], to: [600, 1272] },
  ];
  const silhouette = mirrorPath([600, neckY], segs);
  const hood = back
    ? mirrorPath([600, 118], [
        { t: "C", c1: [702, 116], c2: [768, 186], to: [772, 298] },
        { t: "L", to: [600, 306] },
      ])
    : mirrorPath([600, 138], [
        { t: "C", c1: [690, 136], c2: [758, 196], to: [762, 296] },
        { t: "C", c1: [764, 330], c2: [740, 360], to: [700, 372] },
        { t: "L", to: [600, 380] },
      ]);
  const hoodInner = mirrorPath([600, 190], [
    { t: "C", c1: [668, 190], c2: [712, 236], to: [716, 300] },
    { t: "C", c1: [718, 340], c2: [680, 368], to: [600, 372] },
  ]);
  const pocket = `M432 884L768 884C790 962 830 1042 842 1150L358 1150C370 1042 410 962 432 884Z`;
  const pocketOpenings = both([768, 884], [{ t: "C", c1: [790, 962], c2: [830, 1042], to: [842, 1150] }]);
  const armSeam = both([910, 340], [{ t: "C", c1: [930, 450], c2: [905, 560], to: [884, 620] }]);
  const cuffRib = both([1000, 1108], [{ t: "L", to: [1094, 1100] }]);
  return {
    silhouette,
    behind: back ? [{ d: hood, shade: -0.06 }] : [{ d: hood, shade: -0.04 }, { d: hoodInner, shade: -0.55 }],
    panels: back ? [] : [{ d: pocket, shade: 0.02 }],
    ribs: [
      { d: P([300, 1221], [{ t: "L", to: [900, 1221] }]), width: 82, shade: -0.06 },
      { d: cuffRib, width: 92, shade: -0.06 },
    ],
    stitches: [
      armSeam,
      ...(back ? [P([600, 120], [{ t: "L", to: [600, 300] }])] : []),
      ...(back ? [] : [`M440 896L760 896`, `M372 1138L828 1138`, pocketOpenings]),
      both([600, back ? 312 : 384], [
        back ? { t: "C", c1: [650, 312], c2: [700, 306], to: [726, 304] } : { t: "C", c1: [650, 374], c2: [700, 342], to: [724, 306] },
      ]),
      P([316, 1180], [{ t: "L", to: [884, 1180] }]),
    ],
    folds: [
      fold(both([884, 640], [{ t: "C", c1: [840, 690], c2: [790, 740], to: [730, 800] }]), 40, 20, "shadow", 0.36),
      fold(both([940, 420], [{ t: "C", c1: [985, 600], c2: [1030, 800], to: [1060, 1000] }]), 34, 20, "highlight", 0.09),
      fold(both([960, 780], [{ t: "C", c1: [990, 770], c2: [1020, 760], to: [1050, 740] }]), 22, 12, "shadow", 0.3),
      fold(both([975, 900], [{ t: "C", c1: [1005, 890], c2: [1035, 880], to: [1062, 870] }]), 22, 12, "shadow", 0.26),
      fold(P([600, 420], [{ t: "C", c1: [605, 650], c2: [595, 900], to: [604, 1150] }]), 140, 70, "highlight", 0.06),
      fold(P([420, 1160], [{ t: "C", c1: [520, 1140], c2: [660, 1175], to: [780, 1150] }]), 30, 16, "shadow", 0.24),
    ],
    hardware: back
      ? none
      : (c) =>
          `<path d="M566 352C560 450 556 540 548 612M634 352C640 450 644 540 652 612" stroke="${c.light}" stroke-width="10" stroke-linecap="round" fill="none"/>` +
          `<path d="${rect(541, 606, 14, 30)}${rect(645, 606, 14, 30)}" fill="${c.dark}"/>` +
          `<circle cx="566" cy="352" r="9" fill="${c.dark}"/><circle cx="634" cy="352" r="9" fill="${c.dark}"/>`,
    areas: back
      ? { rear_full: { x: 360, y: 400, w: 480, h: 640 } }
      : { chest_left: { x: 690, y: 470, w: 150, h: 120 } },
  };
}

/* ───────────────────────────── SHORTS (training) ───────────────────────────── */

function shortsView(back: boolean): GarmentView {
  const segs: Seg[] = [
    { t: "L", to: [902, 330] },
    { t: "L", to: [906, 418] },
    { t: "C", c1: [918, 600], c2: [934, 800], to: [940, 930] },
    { t: "C", c1: [938, 990], c2: [912, 1046], to: [858, 1062] },
    { t: "C", c1: [780, 1076], c2: [690, 1084], to: [632, 1088] },
    { t: "C", c1: [628, 1000], c2: [618, 900], to: [600, 836] },
  ];
  const silhouette = mirrorPath([600, 330], segs);
  return {
    silhouette,
    behind: [],
    panels: back ? [{ d: `M640 520L800 520L800 640L640 640Z`, shade: -0.04 }] : [],
    ribs: [{ d: P([290, 374], [{ t: "L", to: [910, 374] }]), width: 86, shade: -0.05 }],
    stitches: [
      P([296, 418], [{ t: "L", to: [904, 418] }]),
      both([906, 430], [{ t: "C", c1: [918, 600], c2: [932, 800], to: [936, 930] }]),
      both([858, 1048], [{ t: "C", c1: [780, 1062], c2: [690, 1070], to: [634, 1074] }]),
      both([856, 1040], [{ t: "C", c1: [778, 1054], c2: [688, 1062], to: [633, 1066] }]),
      P([600, 430], [{ t: "L", to: [600, 836] }]),
      ...(back ? [`M640 520L800 520M640 640L800 640M640 520L640 640M800 520L800 640`] : []),
    ],
    folds: [
      fold(both([600, 840], [{ t: "C", c1: [640, 880], c2: [700, 900], to: [760, 960] }]), 30, 16, "shadow", 0.3),
      fold(both([700, 430], [{ t: "C", c1: [720, 600], c2: [740, 800], to: [760, 1000] }]), 60, 34, "highlight", 0.07),
      fold(both([880, 600], [{ t: "C", c1: [860, 700], c2: [850, 800], to: [860, 900] }]), 30, 20, "shadow", 0.18),
      fold(both([620, 460], [{ t: "C", c1: [660, 500], c2: [700, 520], to: [760, 520] }]), 18, 10, "shadow", 0.22),
    ],
    hardware: back
      ? none
      : (c) =>
          `<circle cx="578" cy="392" r="7" fill="${c.dark}"/><circle cx="622" cy="392" r="7" fill="${c.dark}"/>` +
          `<path d="M578 392C574 450 566 500 556 560M622 392C628 450 634 500 644 560" stroke="${c.light}" stroke-width="9" stroke-linecap="round" fill="none"/>` +
          `<path d="${rect(550, 556, 12, 26)}${rect(638, 556, 12, 26)}" fill="${c.dark}"/>`,
    areas: back ? { rear_pocket: { x: 650, y: 530, w: 140, h: 100 } } : { left_leg_side: { x: 798, y: 600, w: 104, h: 330 } },
  };
}

/* ───────────────────────────── JACKET (warm-up) ───────────────────────────── */

function jacketView(back: boolean): GarmentView {
  const segs: Seg[] = [
    { t: "C", c1: [650, 244], c2: [700, 240], to: [724, 238] },
    { t: "L", to: [736, 300] },
    { t: "C", c1: [800, 310], c2: [868, 330], to: [912, 352] },
    { t: "C", c1: [980, 480], c2: [1052, 780], to: [1086, 1060] },
    { t: "L", to: [1094, 1160] },
    { t: "C", c1: [1058, 1170], c2: [1026, 1172], to: [1000, 1168] },
    { t: "L", to: [992, 1068] },
    { t: "C", c1: [966, 870], c2: [916, 712], to: [886, 630] },
    { t: "C", c1: [890, 850], c2: [892, 1020], to: [888, 1156] },
    { t: "L", to: [886, 1240] },
    { t: "C", c1: [800, 1248], c2: [700, 1250], to: [600, 1250] },
  ];
  const silhouette = mirrorPath([600, 246], segs);
  const raglan = both([724, 300], [{ t: "C", c1: [790, 420], c2: [850, 540], to: [886, 630] }]);
  const stripe = both([906, 372], [{ t: "C", c1: [972, 500], c2: [1038, 790], to: [1068, 1062] }]);
  return {
    silhouette,
    behind: [],
    panels: [{ d: mirrorPath([600, 246], [segs[0]!, segs[1]!, { t: "L", to: [600, 306] }]), shade: -0.1 }],
    ribs: [
      { d: P([300, 1199], [{ t: "L", to: [900, 1199] }]), width: 82, shade: -0.08, trim: false },
      { d: both([996, 1116], [{ t: "L", to: [1090, 1108] }]), width: 96, shade: -0.08 },
      { d: stripe, width: 14, shade: 0, trim: true },
    ],
    stitches: [
      raglan,
      P([312, 1158], [{ t: "L", to: [888, 1158] }]),
      both([600, 300], [{ t: "L", to: [734, 298] }]),
    ],
    folds: [
      fold(both([886, 650], [{ t: "C", c1: [840, 700], c2: [790, 750], to: [730, 810] }]), 36, 16, "shadow", 0.38),
      fold(both([930, 440], [{ t: "C", c1: [980, 620], c2: [1025, 820], to: [1055, 1000] }]), 30, 14, "highlight", 0.14),
      fold(both([958, 760], [{ t: "C", c1: [990, 752], c2: [1020, 742], to: [1050, 728] }]), 18, 8, "shadow", 0.34),
      fold(both([970, 900], [{ t: "C", c1: [1000, 892], c2: [1030, 884], to: [1060, 874] }]), 18, 8, "shadow", 0.3),
      fold(both([700, 360], [{ t: "C", c1: [720, 600], c2: [700, 850], to: [720, 1120] }]), 50, 26, "highlight", 0.09),
      fold(P([420, 1130], [{ t: "C", c1: [520, 1110], c2: [660, 1145], to: [780, 1120] }]), 26, 12, "shadow", 0.26),
    ],
    hardware: back
      ? none
      : (c) => {
          let teeth = "";
          for (let y = 306; y < 1236; y += 9) teeth += rect(y % 18 === 0 ? 596 : 600, y, 5, 5);
          return (
            `<path d="${rect(588, 300, 24, 942)}" fill="${c.dark}" opacity="0.85"/>` +
            `<path d="${teeth}" fill="${c.light}" opacity="0.75"/>` +
            `<path d="${rect(590, 300, 20, 36)}" fill="${c.light}"/>` +
            `<path d="M594 336L606 336L604 392L596 392Z" fill="${c.light}"/>`
          );
        },
    areas: back
      ? { back_panel: { x: 392, y: 400, w: 416, h: 600 } }
      : { chest_left: { x: 690, y: 430, w: 120, h: 96 } },
  };
}

export const GARMENTS: Record<ProductCategory, GarmentDef> = {
  tee: { category: "tee", fabric: "jersey", front: teeView(false), back: teeView(true) },
  stringer: { category: "stringer", fabric: "jersey", front: stringerView(false), back: stringerView(true) },
  singlet: { category: "singlet", fabric: "jersey", front: singletView(false), back: singletView(true) },
  hoodie: { category: "hoodie", fabric: "fleece", front: hoodieView(false), back: hoodieView(true) },
  shorts: { category: "shorts", fabric: "woven", front: shortsView(false), back: shortsView(true) },
  jacket: { category: "jacket", fabric: "woven", front: jacketView(false), back: jacketView(true) },
};
