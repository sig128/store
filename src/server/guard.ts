// Imported by server modules that must never end up in a browser bundle.
// (The `server-only` package cannot be used because these modules are shared
// with the standalone worker process, which runs outside Next.js.)
if (typeof window !== "undefined") {
  throw new Error("A server-only module was imported into browser code.");
}
export {};
