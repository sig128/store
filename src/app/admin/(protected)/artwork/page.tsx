import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { artworks, printTemplates, productVariants, products, variantPrints } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/session";
import { Badge, Card, Flash, Page, Status, dt } from "@/components/admin/ui";
import { Submit } from "@/components/admin/submit";
import { newArtworkVersionAction, newTemplateVersionAction, updateArtworkAction, updateTemplateAction } from "./actions";

export const dynamic = "force-dynamic";

const RIGHTS = [
  ["original_owned", "Original — we own it"],
  ["licensed", "Licensed (needs licence ref)"],
  ["pending", "Pending clearance"],
  ["concept_only", "Concept only — not for sale"],
] as const;

export default async function ArtworkAdmin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin("artwork:write");
  const sp = await searchParams;
  const arts = await db().select().from(artworks).orderBy(asc(artworks.code), asc(artworks.version));
  const uses = arts.length
    ? await db()
        .select({ artworkId: variantPrints.artworkId, placement: variantPrints.placement, variant: productVariants.code, product: products.name })
        .from(variantPrints)
        .innerJoin(productVariants, eq(productVariants.id, variantPrints.variantId))
        .innerJoin(products, eq(products.id, productVariants.productId))
        .where(inArray(variantPrints.artworkId, arts.map((a) => a.id)))
    : [];
  const templates = await db().select().from(printTemplates).orderBy(asc(printTemplates.code), asc(printTemplates.version));
  const usedBy = await db().select({ id: products.id, name: products.name, templateId: products.personalizationTemplateId }).from(products);

  return (
    <Page title="Artwork & print templates" subtitle="Artwork is versioned. Orders store the exact artwork and template version they were sold with, so a new file never changes an old order.">
      <Flash sp={sp} />
      <div className="space-y-4">
        {arts.map((a) => {
          const u = uses.filter((x) => x.artworkId === a.id);
          return (
            <Card
              key={a.id}
              title={`${a.code} v${a.version} — ${a.title}`}
              actions={
                <span className="flex gap-2">
                  <Status value={a.status} />
                  <Badge tone={["original_owned", "licensed"].includes(a.rightsStatus) ? "green" : "amber"}>{a.rightsStatus.replace("_", " ")}</Badge>
                </span>
              }
            >
              <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                <form action={updateArtworkAction} className="grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="id" value={a.id} />
                  <label>
                    <span className="a-label">Status</span>
                    <select name="status" className="a-input" defaultValue={a.status}>
                      <option value="draft">draft</option>
                      <option value="approved">approved for production</option>
                      <option value="retired">retired</option>
                    </select>
                  </label>
                  <label>
                    <span className="a-label">Rights</span>
                    <select name="rightsStatus" className="a-input" defaultValue={a.rightsStatus}>
                      {RIGHTS.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="a-label">Credited to</span>
                    <input name="creditedTo" className="a-input" defaultValue={a.creditedTo ?? ""} />
                  </label>
                  <label>
                    <span className="a-label">Licence reference</span>
                    <input name="licenseRef" className="a-input" defaultValue={a.licenseRef ?? ""} />
                  </label>
                  <label className="sm:col-span-2">
                    <span className="a-label">Rights note</span>
                    <input name="rightsNote" className="a-input" defaultValue={a.rightsNote ?? ""} />
                  </label>
                  <label>
                    <span className="a-label">Ink colours (comma separated, from the printer)</span>
                    <input name="inkColors" className="a-input" defaultValue={a.inkColors.join(", ")} />
                  </label>
                  <label>
                    <span className="a-label">Notes</span>
                    <input name="notes" className="a-input" defaultValue={a.notes ?? ""} />
                  </label>
                  <label className="flex items-start gap-2 text-sm sm:col-span-2">
                    <input type="checkbox" name="confirm" className="mt-1" /> When approving: the print file has been checked (separations, size, colours) with the printer.
                  </label>
                  <div className="sm:col-span-2">
                    <Submit>Save</Submit>
                  </div>
                </form>
                <div className="space-y-3 text-sm">
                  <p>
                    <span className="a-label">Print file</span>
                    {a.printFileKey ? (
                      <a className="underline" href={`/admin/artwork/${a.id}/file`}>
                        Download {a.printFileKey.split("/").pop()}
                      </a>
                    ) : (
                      "No file on record"
                    )}
                  </p>
                  <div>
                    <span className="a-label">Used by</span>
                    {u.length ? (
                      <ul className="text-xs">
                        {u.map((x, i) => (
                          <li key={i}>
                            {x.product} · {x.variant} · {x.placement}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-neutral-500">Not on any variant</p>
                    )}
                  </div>
                  <form action={newArtworkVersionAction} className="space-y-2 border-t border-neutral-200 pt-3">
                    <input type="hidden" name="id" value={a.id} />
                    <span className="a-label">Upload a new version</span>
                    <input type="file" name="file" accept=".svg,.pdf,.png,.tif,.tiff" className="a-input" />
                    <input name="notes" className="a-input" placeholder="What changed?" aria-label="What changed" />
                    <Submit className="a-btn">Upload as v{a.version + 1}+</Submit>
                  </form>
                  <p className="text-xs text-neutral-500">Updated {dt(a.updatedAt)}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <h2 id="templates" className="mt-10 mb-3 text-2xl">
        Personalisation templates
      </h2>
      <div className="space-y-4">
        {templates.map((t) => (
          <Card
            key={t.id}
            title={`${t.code} v${t.version} — ${t.name}`}
            actions={
              <span className="flex gap-2">
                <Status value={t.status} />
                {t.supplierApproved ? <Badge tone="green">supplier approved</Badge> : <Badge tone="amber">awaiting supplier</Badge>}
              </span>
            }
          >
            <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
              <form action={updateTemplateAction} className="grid gap-3 sm:grid-cols-3">
                <input type="hidden" name="id" value={t.id} />
                <label>
                  <span className="a-label">Print width (mm)</span>
                  <input name="widthMm" type="number" className="a-input" defaultValue={t.areaMm.widthMm} />
                </label>
                <label>
                  <span className="a-label">Height (mm)</span>
                  <input name="heightMm" type="number" className="a-input" defaultValue={t.areaMm.heightMm} />
                </label>
                <label>
                  <span className="a-label">Below collar (mm)</span>
                  <input name="offsetFromCollarMm" type="number" className="a-input" defaultValue={t.areaMm.offsetFromCollarMm} />
                </label>
                <label>
                  <span className="a-label">Status</span>
                  <select name="status" className="a-input" defaultValue={t.status}>
                    <option value="draft">draft</option>
                    <option value="approved">approved</option>
                    <option value="retired">retired</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 pt-5 text-sm">
                  <input type="checkbox" name="supplierApproved" defaultChecked={t.supplierApproved} /> Supplier confirmed area, font &amp; colours
                </label>
                <label>
                  <span className="a-label">Supplier reference</span>
                  <input name="supplierRef" className="a-input" defaultValue={t.supplierRef ?? ""} placeholder="proof / quote id" />
                </label>
                <label className="sm:col-span-3">
                  <span className="a-label">Notes</span>
                  <input name="notes" className="a-input" defaultValue={t.notes ?? ""} />
                </label>
                <div className="sm:col-span-3">
                  <Submit>Save template</Submit>
                </div>
              </form>
              <div className="space-y-2 text-sm">
                <p>
                  <span className="a-label">Placement</span>
                  {t.placement}
                </p>
                <p>
                  <span className="a-label">Fields</span>
                  {t.fields.map((x) => `${x.label} (max ${x.maxLength}${x.required ? ", required" : ""})`).join(" · ")}
                </p>
                <p>
                  <span className="a-label">Font</span>
                  {t.fonts.map((x) => `${x.name} v${x.version} — ${x.license}`).join("; ")}
                </p>
                <p>
                  <span className="a-label">Colours</span>
                  {t.colors.map((c) => (
                    <span key={c.id} className="mr-2 inline-flex items-center gap-1">
                      <span className="inline-block size-3 border border-neutral-400" style={{ background: c.hex }} /> {c.name}
                    </span>
                  ))}
                </p>
                <p>
                  <span className="a-label">Used by</span>
                  {usedBy.filter((p) => p.templateId === t.id).map((p) => p.name).join(", ") || "—"}
                </p>
                <form action={newTemplateVersionAction}>
                  <input type="hidden" name="id" value={t.id} />
                  <Submit className="a-btn">Copy to a new version</Submit>
                </form>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </Page>
  );
}
