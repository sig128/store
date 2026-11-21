/**
 * Brand configuration. Everything that names or colours the brand lives here so a
 * rename (the business name is a working name) is a one-file change.
 * Business identity (legal seller, addresses, VAT) is NOT here: it is operator
 * configuration stored in the database and edited in /admin/settings.
 */
export const brand = {
  name: "After Hours Athletics",
  shortName: "After Hours",
  monogram: "AHA",
  tagline: "Printed gymwear for the last set of the night.",
  /** Public production domain. Used for canonical URLs only when APP_URL is unset. */
  domain: "afterhoursathletics.example",
  dropName: "Drop 01 — Last Set",
  dropCode: "DROP 01",
  heroHeadline: "LAST SET. LIGHTS OUT.",
  heroTime: "1:13 AM",
  social: {
    instagram: "",
    tiktok: "",
  },
  /** Palette. Mirrored into CSS custom properties in src/app/globals.css. */
  colors: {
    night: "#0d0d0c",
    nightRaised: "#151513",
    charcoal: "#2a2a28",
    asphalt: "#5c5e5c",
    bone: "#ece5d8",
    boneDim: "#b8b1a4",
    teal: "#1f4d4a",
    tealBright: "#5fa59c",
    coral: "#ee7c5e",
    fluoro: "#f3f6ef",
    sodium: "#f0a55c",
  },
} as const;

export type Brand = typeof brand;
