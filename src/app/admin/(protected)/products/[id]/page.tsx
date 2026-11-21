import Image from "next/image";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  artworks,
  collections,
  inventoryLevels,
  mediaAssets,
  printTemplates,
  productCollections,
  productSpecs,
  productVariants,
  products,
  sizeCharts,
  skus,
  variantPrints,
} from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/session";
import { mediaUrl } from "@/server/storage";
import { formatMoney } from "@/lib/money";
import { Badge, Card, Flash, Page, Status, dt } from "@/components/admin/ui";
import { Submit } from "@/components/admin/submit";
import * as A from "../actions";

export const dynamic = "force-dynamic";

export default async function ProductEditor({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin("products:write");
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [p] = await db().select().from(products).where(eq(products.id, id));
  if (!p) notFound();
  const [vars, media, specs, charts, colls, inColls, arts, templates] = await Promise.all([
    db().select().from(productVariants).where(eq(productVariants.productId, id)).orderBy(asc(productVariants.sort)),
    db().select().from(mediaAssets).where(eq(mediaAssets.productId, id)).orderBy(asc(mediaAssets.sort)),
    db().select().from(productSpecs).where(eq(productSpecs.productId, id)).orderBy(asc(productSpecs.sort)),
    db().select().from(sizeCharts).where(eq(sizeCharts.productId, id)),
    db().select().from(collections),
    db().select().from(productCollections).where(eq(productCollections.productId, id)),
    db().select().from(artworks).orderBy(asc(artworks.code), asc(artworks.version)),
    db().select().from(printTemplates).orderBy(asc(printTemplates.code), asc(printTemplates.version)),
  ]);
  const vids = vars.map((v) => v.id);
  const skuRows = vids.length
    ? await db()
        .select({
          sku: skus,
          onHand: inventoryLevels.onHand,
          verifiedAt: inventoryLevels.verifiedAt,
          reserved: sql<number>`coalesce((select sum(r.qty) from stock_reservations r where r.sku_id = ${skus.id} and r.status = 'active' and r.expires_at > now()), 0)`,
        })
        .from(skus)
        .leftJoin(inventoryLevels, eq(inventoryLevels.skuId, skus.id))
        .where(inArray(skus.variantId, vids))
        .orderBy(asc(skus.sizeSort))
    : [];
  const prints = vids.length ? await db().select({ vp: variantPrints, a: artworks }).from(variantPrints).innerJoin(artworks, eq(artworks.id, variantPrints.artworkId)).where(inArray(variantPrints.variantId, vids)) : [];
  const chart = charts[0];
  const chartCsv = chart
    ? [["size", ...chart.columns.map((c) => c.key)].join(","), ...chart.rows.map((r) => [r.size, ...chart.columns.map((c) => ((r.values[c.key] ?? 0) / 10).toString())].join(","))].join("\n")
    : "size,chest,length\nS,58,71";
  const chartLabels = chart ? chart.columns.map((c) => `${c.key}: ${c.label} | ${c.howToMeasure}`).join("\n") : "chest: Chest width | Laid flat, 2.5 cm below the armpits.\nlength: Body length | From the highest shoulder point to the hem.";

  return (
    <Page
      title={p.name}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <Status value={p.status} /> {p.saleApproved ? <Badge tone="green">approved for sale {p.saleApprovedBy ? `by ${p.saleApprovedBy}` : ""}</Badge> : <Badge tone="amber">not approved for sale</Badge>}
          <a className="underline" href={`/products/${p.slug}`} target="_blank" rel="noreferrer">
            View in store
          </a>
        </span>
      }
    >
      <Flash sp={sp} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Details">
          <form action={A.updateProductAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="id" value={p.id} />
            <label>
              <span className="a-label">Name</span>
              <input name="name" className="a-input" defaultValue={p.name} />
            </label>
            <label>
              <span className="a-label">Slug</span>
              <input name="slug" className="a-input" defaultValue={p.slug} />
            </label>
            <label>
              <span className="a-label">Category</span>
              <select name="category" className="a-input" defaultValue={p.category}>
                {["tee", "stringer", "singlet", "hoodie", "shorts", "jacket"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="a-label">Category label</span>
              <input name="categoryLabel" className="a-input" defaultValue={p.categoryLabel} />
            </label>
            <label className="sm:col-span-2">
              <span className="a-label">Summary</span>
              <input name="summary" className="a-input" defaultValue={p.summary ?? ""} />
            </label>
            <label className="sm:col-span-2">
              <span className="a-label">Description (no unverified fabric/performance claims)</span>
              <textarea name="description" className="a-input min-h-24" defaultValue={p.description ?? ""} />
            </label>
            <label>
              <span className="a-label">Status</span>
              <select name="status" className="a-input" defaultValue={p.status}>
                <option value="draft">draft (hidden)</option>
                <option value="active">active (visible)</option>
                <option value="archived">archived</option>
              </select>
            </label>
            <label>
              <span className="a-label">Hero view</span>
              <select name="heroView" className="a-input" defaultValue={p.heroView}>
                <option value="back">back</option>
                <option value="front">front</option>
              </select>
            </label>
            <label>
              <span className="a-label">Fulfilment mode</span>
              <select name="fulfillmentMode" className="a-input" defaultValue={p.fulfillmentMode}>
                <option value="stocked">stocked (reserve shelf stock)</option>
                <option value="made_to_order">made to order (lead time)</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label>
                <span className="a-label">Lead time min (days)</span>
                <input name="leadTimeMinDays" type="number" className="a-input" defaultValue={p.leadTimeMinDays ?? ""} />
              </label>
              <label>
                <span className="a-label">max</span>
                <input name="leadTimeMaxDays" type="number" className="a-input" defaultValue={p.leadTimeMaxDays ?? ""} />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="leadTimeApproved" defaultChecked={p.leadTimeApproved} /> Lead time confirmed by the manufacturer (shown to customers)
            </label>
            <label>
              <span className="a-label">Sort</span>
              <input name="sort" type="number" className="a-input" defaultValue={p.sort} />
            </label>
            <label>
              <span className="a-label">Weight (g, for shipping)</span>
              <input name="weightGrams" type="number" className="a-input" defaultValue={p.weightGrams ?? ""} />
            </label>
            <label>
              <span className="a-label">SEO title</span>
              <input name="seoTitle" className="a-input" defaultValue={p.seoTitle ?? ""} />
            </label>
            <label>
              <span className="a-label">SEO description</span>
              <input name="seoDescription" className="a-input" defaultValue={p.seoDescription ?? ""} />
            </label>
            <fieldset className="sm:col-span-2">
              <legend className="a-label">Collections</legend>
              {colls.map((c) => (
                <label key={c.id} className="mr-4 inline-flex items-center gap-1 text-sm">
                  <input type="checkbox" name="collection" value={c.id} defaultChecked={inColls.some((x) => x.collectionId === c.id)} /> {c.title}
                </label>
              ))}
            </fieldset>
            <div className="sm:col-span-2">
              <Submit>Save details</Submit>
            </div>
          </form>
        </Card>

        <div className="space-y-6">
          <Card title="Approval for real sale">
            <p className="mb-3 text-sm text-neutral-600">In production, customers can only buy approved products. Approve only when variant data, images, manufacturing, stock counts (or made-to-order lead time) and shipping are confirmed.</p>
            <form action={A.approveSaleAction} className="space-y-2">
              <input type="hidden" name="id" value={p.id} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="approve" defaultChecked={p.saleApproved} /> Approved for sale
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="confirm" className="mt-1" /> I confirm the sale data above has been checked with the manufacturer.
              </label>
              <Submit>Save approval</Submit>
            </form>
          </Card>

          <Card title="Locker Tag personalisation">
            <form action={A.personalizationAction} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="productId" value={p.id} />
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" name="enabled" defaultChecked={p.personalizationEnabled} /> Offer Locker Tag on this product (only one supplier-approved garment)
              </label>
              <label>
                <span className="a-label">Print template</span>
                <select name="templateId" className="a-input" defaultValue={p.personalizationTemplateId ?? ""}>
                  <option value="">—</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} v{t.version} ({t.status}
                      {t.supplierApproved ? ", supplier approved" : ""})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="a-label">Upgrade price</span>
                <input name="price" className="a-input" defaultValue={p.personalizationPriceMinor != null ? (p.personalizationPriceMinor / 100).toString() : ""} />
              </label>
              <label>
                <span className="a-label">Production time (working days)</span>
                <input name="productionDays" type="number" className="a-input" defaultValue={p.personalizationProductionDays ?? ""} placeholder="from the printer" />
              </label>
              <label className="flex items-start gap-2 text-sm sm:col-span-2">
                <input type="checkbox" name="noWithdrawal" className="mt-1" defaultChecked={p.personalizationNoWithdrawal} /> Personalised lines are exempt from change-of-mind returns (legal decision — applies only to personalised lines, never to plain printed items).
              </label>
              <p className="text-xs text-neutral-500 sm:col-span-2">Hidden in production unless the template is approved, supplier-approved and a production time is set.</p>
              <div className="sm:col-span-2">
                <Submit>Save personalisation</Submit>
              </div>
            </form>
          </Card>
        </div>
      </div>

      <div className="mt-6 space-y-6">
        {vars.map((v) => (
          <Card key={v.id} title={`Variant ${v.code} — ${v.colorName}${v.optionLabel ? ` / ${v.optionLabel}` : ""}`} actions={<Status value={v.status} />}>
            <form action={A.upsertVariantAction} className="mb-4 grid gap-2 sm:grid-cols-6">
              <input type="hidden" name="productId" value={p.id} />
              <input type="hidden" name="variantId" value={v.id} />
              <input name="code" className="a-input font-mono" defaultValue={v.code} aria-label="Code" />
              <input name="colorName" className="a-input" defaultValue={v.colorName} aria-label="Colour name" />
              <input name="colorHex" className="a-input font-mono" defaultValue={v.colorHex} aria-label="Swatch hex" />
              <input name="optionLabel" className="a-input" defaultValue={v.optionLabel ?? ""} placeholder="Option (e.g. Clean back)" aria-label="Option label" />
              <select name="status" className="a-input" defaultValue={v.status} aria-label="Status">
                <option value="active">active</option>
                <option value="archived">archived</option>
              </select>
              <Submit className="a-btn">Save variant</Submit>
            </form>
            <table className="a-table">
              <thead>
                <tr>
                  <th>Size / SKU</th>
                  <th>Price</th>
                  <th>On hand</th>
                  <th>Held</th>
                  <th>Counted</th>
                  <th>Stock</th>
                </tr>
              </thead>
              <tbody>
                {skuRows
                  .filter((r) => r.sku.variantId === v.id)
                  .map(({ sku, onHand, verifiedAt, reserved }) => (
                    <tr key={sku.id}>
                      <td>
                        <strong>{sku.size}</strong> <span className="font-mono text-xs text-neutral-500">{sku.code}</span> {sku.status !== "active" ? <Status value={sku.status} /> : null}
                      </td>
                      <td>
                        <form action={A.upsertSkuAction} className="flex gap-1">
                          <input type="hidden" name="productId" value={p.id} />
                          <input type="hidden" name="skuId" value={sku.id} />
                          <input type="hidden" name="code" value={sku.code} />
                          <input name="price" className="a-input w-24" defaultValue={(sku.priceMinor / 100).toString()} aria-label={`Price for ${sku.code}`} />
                          <select name="status" className="a-input w-24" defaultValue={sku.status} aria-label="Status">
                            <option value="active">active</option>
                            <option value="archived">archived</option>
                          </select>
                          <Submit className="a-btn">Save</Submit>
                        </form>
                        <p className="text-xs text-neutral-500">{formatMoney(sku.priceMinor, sku.currency)}</p>
                      </td>
                      <td className="tabular-nums">{p.fulfillmentMode === "stocked" ? (onHand ?? 0) : "MTO"}</td>
                      <td className="tabular-nums">{Number(reserved)}</td>
                      <td>{verifiedAt ? <span className="text-xs">{dt(verifiedAt)}</span> : <Badge tone="amber">never</Badge>}</td>
                      <td>
                        {p.fulfillmentMode === "stocked" ? (
                          <form action={A.stockAction} className="flex flex-wrap gap-1">
                            <input type="hidden" name="productId" value={p.id} />
                            <input type="hidden" name="skuId" value={sku.id} />
                            <select name="mode" className="a-input w-28" aria-label="Stock action">
                              <option value="count">count =</option>
                              <option value="adjust">adjust ±</option>
                            </select>
                            <select name="reason" className="a-input w-28" aria-label="Reason">
                              <option value="receive">received</option>
                              <option value="adjustment">correction</option>
                              <option value="damage">damaged</option>
                            </select>
                            <input name="qty" type="number" className="a-input w-20" aria-label="Quantity" />
                            <Submit className="a-btn">Apply</Submit>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <form action={A.upsertSkuAction} className="mt-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="productId" value={p.id} />
              <input type="hidden" name="variantId" value={v.id} />
              <input name="size" className="a-input w-24" placeholder="Size" aria-label="New size" />
              <input name="price" className="a-input w-28" placeholder="Price" aria-label="Price" />
              <input name="currency" className="a-input w-20" defaultValue="NOK" aria-label="Currency" />
              <Submit className="a-btn">Add size</Submit>
            </form>
            <div className="mt-5 border-t border-neutral-200 pt-4">
              <p className="a-label">Prints on this variant</p>
              {prints
                .filter((x) => x.vp.variantId === v.id)
                .map(({ vp, a }) => (
                  <form key={vp.id} action={A.upsertPrintAction} className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                    <input type="hidden" name="productId" value={p.id} />
                    <input type="hidden" name="printId" value={vp.id} />
                    <select name="artworkId" className="a-input max-w-[260px]" defaultValue={a.id} aria-label="Artwork">
                      {arts.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.code} v{x.version} ({x.status}, {x.rightsStatus})
                        </option>
                      ))}
                    </select>
                    <input name="placement" className="a-input max-w-[180px]" defaultValue={vp.placement} aria-label="Placement" />
                    <input name="method" className="a-input max-w-[180px]" defaultValue={vp.method ?? ""} placeholder="method (e.g. screen print)" aria-label="Method" />
                    <label className="flex items-center gap-1 text-xs">
                      <input type="checkbox" name="methodApproved" defaultChecked={vp.methodApproved} /> method confirmed by supplier
                    </label>
                    <Submit className="a-btn">Save</Submit>
                  </form>
                ))}
            </div>
          </Card>
        ))}
        <Card title="Add variant">
          <form action={A.upsertVariantAction} className="grid gap-2 sm:grid-cols-5">
            <input type="hidden" name="productId" value={p.id} />
            <input name="code" className="a-input font-mono" placeholder="CODE" aria-label="Code" />
            <input name="colorName" className="a-input" placeholder="Colour name" aria-label="Colour name" />
            <input name="colorHex" className="a-input font-mono" placeholder="#2b2a28" aria-label="Swatch hex" />
            <input name="optionLabel" className="a-input" placeholder="Option label" aria-label="Option label" />
            <Submit className="a-btn">Add</Submit>
          </form>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card title="Images">
            <ul className="mb-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
              {media.map((m) => (
                <li key={m.id} className={`text-xs ${m.archivedAt ? "opacity-40" : ""}`}>
                  <div className="relative aspect-[4/5] border border-neutral-200 bg-neutral-800">
                    <Image src={mediaUrl(m.storageKey)} alt={m.alt} fill sizes="160px" className="object-contain" />
                  </div>
                  <p className="mt-1">
                    {m.kind} · {m.source === "concept_render" ? <Badge tone="amber">concept</Badge> : m.source === "product_photo" ? <Badge tone="green">photo</Badge> : <Badge>{m.source}</Badge>}
                  </p>
                  <p className="text-neutral-500">{vars.find((v) => v.id === m.variantId)?.code ?? "all variants"}</p>
                  {!m.archivedAt ? (
                    <form action={A.archiveMediaAction}>
                      <input type="hidden" name="productId" value={p.id} />
                      <input type="hidden" name="mediaId" value={m.id} />
                      <button className="underline" type="submit">
                        hide
                      </button>
                    </form>
                  ) : (
                    <p>hidden</p>
                  )}
                </li>
              ))}
            </ul>
            <form action={A.uploadMediaAction} className="grid gap-2 sm:grid-cols-2">
              <input type="hidden" name="productId" value={p.id} />
              <input type="file" name="file" accept="image/webp,image/png,image/jpeg,image/avif" className="a-input sm:col-span-2" />
              <select name="kind" className="a-input" aria-label="Kind">
                {["front", "back", "on_body", "print_detail", "fabric", "styled"].map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
              <select name="source" className="a-input" aria-label="Source">
                <option value="product_photo">product photo (real garment)</option>
                <option value="concept_render">concept render</option>
                <option value="supplier_mockup">supplier mockup</option>
                <option value="licensed_art">licensed art</option>
              </select>
              <select name="variantId" className="a-input" aria-label="Variant">
                <option value="">all variants</option>
                {vars.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.code}
                  </option>
                ))}
              </select>
              <input name="sort" type="number" className="a-input" placeholder="sort" aria-label="Sort" />
              <input name="alt" className="a-input sm:col-span-2" placeholder="Alt text: what the image shows" aria-label="Alt text" />
              <input name="rightsNote" className="a-input sm:col-span-2" placeholder="Rights / photographer credit" aria-label="Rights note" />
              <div className="sm:col-span-2">
                <Submit>Upload</Submit>
              </div>
            </form>
          </Card>

          <Card title="Specs (shown only when approved)">
            <table className="a-table mb-3">
              <tbody>
                {specs.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <form action={A.specAction} className="flex flex-wrap gap-1">
                        <input type="hidden" name="productId" value={p.id} />
                        <input type="hidden" name="specId" value={x.id} />
                        <input name="key" className="a-input w-20" defaultValue={x.key} aria-label="Key" />
                        <input name="label" className="a-input w-28" defaultValue={x.label} aria-label="Label" />
                        <input name="value" className="a-input flex-1" defaultValue={x.value} aria-label="Value" />
                        <select name="status" className="a-input w-28" defaultValue={x.status} aria-label="Status">
                          <option value="draft">draft</option>
                          <option value="approved">approved</option>
                        </select>
                        <input name="source" className="a-input w-40" defaultValue={x.source ?? ""} placeholder="source" aria-label="Source" />
                        <Submit className="a-btn">Save</Submit>
                      </form>
                      <form action={A.specAction} className="mt-1">
                        <input type="hidden" name="productId" value={p.id} />
                        <input type="hidden" name="specId" value={x.id} />
                        <input type="hidden" name="delete" value="1" />
                        <button className="text-xs underline" type="submit">
                          remove
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <form action={A.specAction} className="flex flex-wrap gap-1">
              <input type="hidden" name="productId" value={p.id} />
              <input name="key" className="a-input w-24" placeholder="key" aria-label="Key" />
              <input name="label" className="a-input w-32" placeholder="Label (e.g. Fabric)" aria-label="Label" />
              <input name="value" className="a-input flex-1" placeholder="Value from the supplier spec" aria-label="Value" />
              <input name="source" className="a-input w-40" placeholder="source" aria-label="Source" />
              <Submit className="a-btn">Add spec</Submit>
            </form>
          </Card>
        </div>

        <Card title="Size table (garment measurements)">
          <form action={A.sizeChartAction} className="grid gap-3 lg:grid-cols-2">
            <input type="hidden" name="productId" value={p.id} />
            <input type="hidden" name="chartId" value={chart?.id ?? ""} />
            <label>
              <span className="a-label">Measurements in cm (CSV: size,column,column…)</span>
              <textarea name="table" className="a-input min-h-48 font-mono" defaultValue={chartCsv} />
            </label>
            <label>
              <span className="a-label">Column labels — one per line: key: Label | how to measure</span>
              <textarea name="labels" className="a-input min-h-48" defaultValue={chartLabels} />
            </label>
            <label>
              <span className="a-label">Basis</span>
              <select name="basis" className="a-input" defaultValue={chart?.basis ?? "garment"}>
                <option value="garment">garment, laid flat</option>
                <option value="body">body measurements</option>
              </select>
            </label>
            <label>
              <span className="a-label">Status</span>
              <select name="status" className="a-input" defaultValue={chart?.status ?? "draft"}>
                <option value="sample">sample (development only)</option>
                <option value="draft">draft (hidden in production)</option>
                <option value="approved">approved (measured production samples)</option>
              </select>
            </label>
            <label>
              <span className="a-label">Tolerance ± cm</span>
              <input name="toleranceCm" className="a-input" defaultValue={chart?.toleranceMm != null ? chart.toleranceMm / 10 : ""} />
            </label>
            <label>
              <span className="a-label">Note</span>
              <input name="note" className="a-input" defaultValue={chart?.note ?? ""} />
            </label>
            <div className="lg:col-span-2">
              <Submit>Save size table</Submit>
            </div>
          </form>
        </Card>
        <p className="text-xs text-neutral-500">Templates and artwork rights are managed under Artwork &amp; templates. {templates.length} template(s) on file.</p>
      </div>
    </Page>
  );
}
