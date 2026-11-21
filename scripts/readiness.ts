/** Print the launch-readiness checklist. Exits 1 when a required item fails (use it in CI before going live). */
import "./_env";
import { closeDb } from "../src/server/db";
import { readinessChecks } from "../src/server/readiness";

async function main() {
  const checks = await readinessChecks();
  const width = Math.max(...checks.map((c) => c.label.length));
  for (const c of checks) {
    const mark = c.ok ? "PASS" : c.required ? "FAIL" : "WARN";
    console.log(`${mark}  ${c.label.padEnd(width)}  ${c.detail}${c.ok ? "" : `  → ${c.fix}`}`);
  }
  const failing = checks.filter((c) => c.required && !c.ok);
  console.log(`\n${failing.length ? `${failing.length} required item(s) failing — production checkout stays closed.` : "All required items pass."}`);
  if (failing.length) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
