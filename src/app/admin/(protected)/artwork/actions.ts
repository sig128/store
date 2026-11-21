"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { artworks, printTemplates } from "@/server/db/schema";
import { assertAdmin } from "@/server/auth/session";
import { audit, type Actor } from "@/server/audit";
import { storage } from "@/server/storage";
import type { RightsStatus } from "@/lib/types";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function act(fn: (actor: Actor) => Promise<string>) {
  const a = await assertAdmin("artwork:write");
  let msg: string;
  try {
    msg = await fn(a.actor);
  } catch (err) {
    redirect(`/admin/artwork?err=${encodeURIComponent((err as Error).message)}`);
  }
  revalidatePath("/admin/artwork");
  revalidatePath("/", "layout");
  redirect(`/admin/artwork?msg=${encodeURIComponent(msg!)}`);
}

const PRINT_TYPES: Record<string, string> = { "image/svg+xml": "svg", "application/pdf": "pdf", "image/png": "png", "image/tiff": "tif" };

export async function updateArtworkAction(f: FormData) {
  await act(async (actor) => {
    const id = s(f, "id");
    const status = s(f, "status") as "draft" | "approved" | "retired";
    const rightsStatus = s(f, "rightsStatus") as RightsStatus;
    if (status === "approved") {
      if (!["original_owned", "licensed"].includes(rightsStatus)) throw new Error("Only artwork you own or have licensed can be approved for production.");
      if (rightsStatus === "licensed" && !s(f, "licenseRef")) throw new Error("Licensed artwork needs a licence reference.");
      if (f.get("confirm") !== "on") throw new Error("Tick the confirmation that the print file has been checked for production.");
    }
    const [before] = await db().select().from(artworks).where(eq(artworks.id, id));
    if (!before) throw new Error("Artwork not found.");
    await db()
      .update(artworks)
      .set({
        status,
        rightsStatus,
        rightsNote: s(f, "rightsNote") || null,
        creditedTo: s(f, "creditedTo") || null,
        licenseRef: s(f, "licenseRef") || null,
        inkColors: s(f, "inkColors").split(",").map((x) => x.trim()).filter(Boolean),
        notes: s(f, "notes") || null,
        updatedAt: new Date(),
      })
      .where(eq(artworks.id, id));
    await audit(db(), actor, "artwork.update", "artwork", id, `${before.code} v${before.version}: ${before.status}→${status}, rights ${before.rightsStatus}→${rightsStatus}`);
    return `${before.code} v${before.version} saved.`;
  });
}

/** A new print file never overwrites an old one: it becomes the next version. Past orders keep the version they were printed with. */
export async function newArtworkVersionAction(f: FormData) {
  await act(async (actor) => {
    const id = s(f, "id");
    const file = f.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("Choose a print file.");
    const ext = PRINT_TYPES[file.type];
    if (!ext) throw new Error("Upload SVG, PDF, PNG or TIFF print files.");
    if (file.size > 50 * 1024 * 1024) throw new Error("Print files must be under 50 MB.");
    const [cur] = await db().select().from(artworks).where(eq(artworks.id, id));
    if (!cur) throw new Error("Artwork not found.");
    const [latest] = await db().select().from(artworks).where(eq(artworks.code, cur.code)).orderBy(desc(artworks.version)).limit(1);
    const version = (latest?.version ?? cur.version) + 1;
    const key = `print-files/${cur.code}/v${version}.${ext}`;
    await storage().put(key, Buffer.from(await file.arrayBuffer()), file.type);
    const [row] = await db()
      .insert(artworks)
      .values({
        code: cur.code,
        version,
        family: cur.family,
        title: cur.title,
        status: "draft",
        rightsStatus: cur.rightsStatus,
        rightsNote: cur.rightsNote,
        creditedTo: cur.creditedTo,
        licenseRef: cur.licenseRef,
        printFileKey: key,
        inkColors: cur.inkColors,
        notes: s(f, "notes") || `New version uploaded by ${actor.email}`,
      })
      .returning();
    await audit(db(), actor, "artwork.version", "artwork", row!.id, `Uploaded ${cur.code} v${version} (draft). Re-point variants to it after approval.`);
    return `${cur.code} v${version} uploaded as draft. Approve it, then select it on the product's variant prints.`;
  });
}

export async function updateTemplateAction(f: FormData) {
  await act(async (actor) => {
    const id = s(f, "id");
    const [t] = await db().select().from(printTemplates).where(eq(printTemplates.id, id));
    if (!t) throw new Error("Template not found.");
    const status = s(f, "status") as "draft" | "approved" | "retired";
    const supplierApproved = f.get("supplierApproved") === "on";
    if (supplierApproved && !s(f, "supplierRef")) throw new Error("Record the supplier's reference (quote, email or proof id) for the approval.");
    if (status === "approved" && !supplierApproved) throw new Error("A template can only be approved after the supplier confirms the print area, font and colours.");
    const w = Number(s(f, "widthMm"));
    const h = Number(s(f, "heightMm"));
    const off = Number(s(f, "offsetFromCollarMm"));
    if (![w, h, off].every((x) => Number.isFinite(x) && x >= 0) || w === 0 || h === 0) throw new Error("Print area must be positive millimetres.");
    const areaChanged = w !== t.areaMm.widthMm || h !== t.areaMm.heightMm || off !== t.areaMm.offsetFromCollarMm;
    if (areaChanged && t.status === "approved") throw new Error("This version is approved. Create a new version to change the print area, so existing orders keep the spec they were sold with.");
    await db()
      .update(printTemplates)
      .set({
        status,
        supplierApproved,
        supplierApprovedAt: supplierApproved ? (t.supplierApprovedAt ?? new Date()) : null,
        supplierRef: s(f, "supplierRef") || null,
        areaMm: { widthMm: w, heightMm: h, offsetFromCollarMm: off },
        notes: s(f, "notes") || null,
        updatedAt: new Date(),
      })
      .where(eq(printTemplates.id, id));
    await audit(db(), actor, "template.update", "print_template", id, `${t.code} v${t.version}: status ${status}, supplier approved ${supplierApproved}`);
    return `${t.code} v${t.version} saved.`;
  });
}

export async function newTemplateVersionAction(f: FormData) {
  await act(async (actor) => {
    const [t] = await db().select().from(printTemplates).where(eq(printTemplates.id, s(f, "id")));
    if (!t) throw new Error("Template not found.");
    const [latest] = await db().select().from(printTemplates).where(eq(printTemplates.code, t.code)).orderBy(desc(printTemplates.version)).limit(1);
    const [row] = await db()
      .insert(printTemplates)
      .values({ code: t.code, version: (latest?.version ?? t.version) + 1, name: t.name, placement: t.placement, status: "draft", supplierApproved: false, areaMm: t.areaMm, fields: t.fields, fonts: t.fonts, colors: t.colors, notes: `Copied from v${t.version}` })
      .returning();
    await audit(db(), actor, "template.version", "print_template", row!.id, `Created ${t.code} v${row!.version} from v${t.version}`);
    return `${t.code} v${row!.version} created as draft. Point the product at it once approved.`;
  });
}
