import "../guard";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { dirname, normalize, resolve } from "node:path";
import { env } from "../env";

/**
 * Object storage for media (product photos, concept renders, print files).
 *  - local: files under STORAGE_LOCAL_DIR, served by /media/[...key] (development)
 *  - s3:    any S3-compatible bucket (AWS S3, Cloudflare R2, MinIO) behind a public/CDN URL
 */
export interface StorageDriver {
  readonly name: "local" | "s3";
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: Buffer; contentType: string } | null>;
  publicUrl(key: string): string;
}

const MIME: Record<string, string> = {
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  avif: "image/avif",
  svg: "image/svg+xml",
  pdf: "application/pdf",
};
export const mimeFor = (key: string) => MIME[key.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";

export function safeKey(key: string): string {
  const k = normalize(key).replace(/^(\.\.(\/|\\|$))+/, "").replace(/^\/+/, "");
  if (k.includes("..") || !/^[a-zA-Z0-9/_.\-]+$/.test(k)) throw new Error(`Unsafe storage key: ${key}`);
  return k;
}

class LocalDriver implements StorageDriver {
  readonly name = "local" as const;
  constructor(private root: string) {}
  private path(key: string) {
    const p = resolve(this.root, safeKey(key));
    if (!p.startsWith(resolve(this.root))) throw new Error("Path escapes storage root");
    return p;
  }
  async put(key: string, body: Buffer) {
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, body);
  }
  async get(key: string) {
    try {
      const p = this.path(key);
      await stat(p);
      return { body: await readFile(p), contentType: mimeFor(key) };
    } catch {
      return null;
    }
  }
  publicUrl(key: string) {
    return `/media/${safeKey(key)}`;
  }
}

class S3Driver implements StorageDriver {
  readonly name = "s3" as const;
  private clientPromise: Promise<import("@aws-sdk/client-s3").S3Client>;
  constructor(
    private bucket: string,
    private publicBase: string,
    opts: { region?: string; endpoint?: string; accessKeyId?: string; secretAccessKey?: string },
  ) {
    this.clientPromise = import("@aws-sdk/client-s3").then(
      ({ S3Client }) =>
        new S3Client({
          region: opts.region ?? "auto",
          endpoint: opts.endpoint,
          forcePathStyle: Boolean(opts.endpoint),
          credentials:
            opts.accessKeyId && opts.secretAccessKey
              ? { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey }
              : undefined,
        }),
    );
  }
  async put(key: string, body: Buffer, contentType: string) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.clientPromise;
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: safeKey(key),
        Body: body,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  }
  async get(key: string) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await this.clientPromise;
    try {
      const r = await client.send(new GetObjectCommand({ Bucket: this.bucket, Key: safeKey(key) }));
      const bytes = await r.Body?.transformToByteArray();
      return bytes ? { body: Buffer.from(bytes), contentType: r.ContentType ?? mimeFor(key) } : null;
    } catch {
      return null;
    }
  }
  publicUrl(key: string) {
    return `${this.publicBase.replace(/\/$/, "")}/${safeKey(key)}`;
  }
}

let driver: StorageDriver | undefined;

export function storage(): StorageDriver {
  if (driver) return driver;
  const e = env();
  if (e.STORAGE_DRIVER === "s3") {
    if (!e.S3_BUCKET || !e.S3_PUBLIC_BASE_URL) throw new Error("S3 storage requires S3_BUCKET and S3_PUBLIC_BASE_URL");
    driver = new S3Driver(e.S3_BUCKET, e.S3_PUBLIC_BASE_URL, {
      region: e.S3_REGION,
      endpoint: e.S3_ENDPOINT,
      accessKeyId: e.S3_ACCESS_KEY_ID,
      secretAccessKey: e.S3_SECRET_ACCESS_KEY,
    });
  } else {
    // Relative paths resolve against the working directory at runtime (kept out of build tracing).
    driver = new LocalDriver(e.STORAGE_LOCAL_DIR);
  }
  return driver;
}

export const mediaUrl = (key: string) => storage().publicUrl(key);
