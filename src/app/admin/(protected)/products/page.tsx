import Link from "next/link";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { collections, inventoryLevels, outfitItems, outfits, productVariants, products, skus } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/session";
import { Badge, Card, Flash, Page, Status } from "@/components/admin/ui";
import { Submit } from "@/components/admin/submit";
import { createCollectionAction, createProductAction, outfitAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ProductsAdmin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin("products:write");
  const sp = await searchParams;
  const rows = await db().select().from(products).orderBy(asc(products.sort), asc(products.name));
  const vars = rows.length ? await db().select().from(productVariants).where(inArray(productVariants.productId, rows.map((r) => r.id))) : [];
  const stock = vars.length
    ? await db()
        .select({ variantId: skus.variantId, onHand: sql<number>`coalesce(sum(${inventoryLevels.onHand}),0)`, unverified: sql<number>`count(*) filter (where ${inventoryLevels.verifiedAt} is null)`, n: sql<number>`count(*)` })
        .from(skus)
        .leftJoin(inventoryLevels, eq(inventoryLevels.skuId, skus.id))
        .where(inArray(skus.variantId, vars.map((v) => v.id)))
        .groupBy(skus.variantId)
    : [];
  const colls = await db().select().from(collections).orderBy(asc(collections.sort));
  const fits = await db().select().from(outfits).orderBy(asc(outfits.sort));
  const fitItems = fits.length ? await db().select({ i: outfitItems, name: products.name }).from(outfitItems).innerJoin(products, eq(products.id, outfitItems.productId)).where(inArray(outfitItems.outfitId, fits.map((f) => f.id))).orderBy(asc(outfitItems.sort)) : [];
  return (
    <Page title="Products & stock" subtitle="Products stay unsellable in production until approved for sale. Archiving never changes past orders.">
      <Flash sp={sp} />
      <div className="a-card mb-6 overflow-x-auto">
        <table className="a-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Status</th>
              <th>For sale</th>
              <th>Mode</th>
              <th>Variants</th>
              <th>Sizes</th>
              <th>On hand</th>
              <th>Stock verified</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const pv = vars.filter((v) => v.productId === p.id);
              const st = stock.filter((x) => pv.some((v) => v.id === x.variantId));
              const onHand = st.reduce((a, b) => a + Number(b.onHand), 0);
              const unverified = st.reduce((a, b) => a + Number(b.unverified), 0);
              const sizes = st.reduce((a, b) => a + Number(b.n), 0);
              return (
                <tr key={p.id}>
                  <td>
                    <Link href={`/admin/products/${p.id}`} className="font-semibold underline">
                      {p.name}
                    </Link>
                    <p className="text-xs text-neutral-500">{p.categoryLabel}</p>
                  </td>
                  <td>
                    <Status value={p.status} />
                  </td>
                  <td>{p.saleApproved ? <Badge tone="green">approved</Badge> : <Badge tone="amber">not approved</Badge>}</td>
                  <td>{p.fulfillmentMode === "made_to_order" ? "made to order" : "stocked"}</td>
                  <td>{pv.length}</td>
                  <td>{sizes}</td>
                  <td className="tabular-nums">{p.fulfillmentMode === "stocked" ? onHand : "—"}</td>
                  <td>{p.fulfillmentMode === "stocked" ? unverified ? <Badge tone="amber">{unverified} not counted</Badge> : <Badge tone="green">counted</Badge> : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="New product">
          <form action={createProductAction} className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="a-label">Name</span>
              <input name="name" className="a-input" required />
            </label>
            <label>
              <span className="a-label">URL slug</span>
              <input name="slug" className="a-input" placeholder="auto from name" />
            </label>
            <label>
              <span className="a-label">Category</span>
              <select name="category" className="a-input">
                {["tee", "stringer", "singlet", "hoodie", "shorts", "jacket"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="a-label">Category label</span>
              <input name="categoryLabel" className="a-input" placeholder="e.g. Oversized pump-cover tee" />
            </label>
            <div className="sm:col-span-2">
              <Submit>Create draft</Submit>
            </div>
          </form>
        </Card>
        <Card title="Collections">
          <ul className="mb-3 text-sm">
            {colls.map((c) => (
              <li key={c.id}>
                {c.title} <span className="font-mono text-xs text-neutral-500">/{c.slug}</span> <Status value={c.status} />
              </li>
            ))}
          </ul>
          <form action={createCollectionAction} className="flex flex-wrap gap-2">
            <input name="title" className="a-input max-w-[200px]" placeholder="Title" />
            <input name="slug" className="a-input max-w-[160px]" placeholder="slug" />
            <Submit className="a-btn">Add</Submit>
          </form>
        </Card>
      </div>
      <h2 className="mt-10 mb-3 text-2xl">Outfits (Build the Fit)</h2>
      <div className="grid gap-6 xl:grid-cols-2">
        {fits.map((o) => (
          <Card key={o.id} title={o.title} actions={<Status value={o.status} />}>
            <form action={outfitAction} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="outfitId" value={o.id} />
              <label>
                <span className="a-label">Title</span>
                <input name="title" className="a-input" defaultValue={o.title} />
              </label>
              <label>
                <span className="a-label">Subtitle</span>
                <input name="subtitle" className="a-input" defaultValue={o.subtitle ?? ""} />
              </label>
              <label>
                <span className="a-label">Status</span>
                <select name="status" className="a-input" defaultValue={o.status}>
                  <option value="draft">draft</option>
                  <option value="active">active</option>
                  <option value="archived">archived</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label>
                  <span className="a-label">Bundle saving %</span>
                  <input name="bundlePct" className="a-input" defaultValue={o.bundleDiscountBps != null ? (o.bundleDiscountBps / 100).toString() : ""} placeholder="none" />
                </label>
                <label>
                  <span className="a-label">Min. pieces</span>
                  <input name="bundleMinItems" type="number" className="a-input" defaultValue={o.bundleMinItems} />
                </label>
              </div>
              <fieldset className="sm:col-span-2">
                <legend className="a-label">Hotspots (% of image width / height)</legend>
                {fitItems
                  .filter((x) => x.i.outfitId === o.id)
                  .map(({ i, name }) => (
                    <div key={i.id} className="mb-1 flex flex-wrap items-center gap-2 text-sm">
                      <span className="w-40 truncate">{name}</span>
                      <input name={`label_${i.id}`} className="a-input w-40" defaultValue={i.label} aria-label={`Label for ${name}`} />
                      <input name={`x_${i.id}`} className="a-input w-16" defaultValue={(i.hotspotX / 100).toString()} aria-label={`X for ${name}`} />
                      <input name={`y_${i.id}`} className="a-input w-16" defaultValue={(i.hotspotY / 100).toString()} aria-label={`Y for ${name}`} />
                    </div>
                  ))}
              </fieldset>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="bundleApproved" defaultChecked={o.bundleApproved} /> Bundle saving approved
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="confirm" className="mt-1" /> I confirm this saving is a real price decision.
              </label>
              <p className="text-xs text-neutral-500 sm:col-span-2">In production the saving only applies (and is only shown) once approved. It is priced on the server, one unit of each distinct piece.</p>
              <div className="sm:col-span-2">
                <Submit>Save outfit</Submit>
              </div>
            </form>
          </Card>
        ))}
      </div>
    </Page>
  );
}
