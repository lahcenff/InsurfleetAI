// File storage for dispute attachments.
// - Local disk (default, for development / single server)
// - Supabase Storage when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set (serverless deploys)
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface Storage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
}

class LocalStorage implements Storage {
  constructor(private root: string) {}
  private resolve(key: string) {
    const p = path.resolve(this.root, key);
    if (!p.startsWith(path.resolve(this.root) + path.sep)) throw new Error("Invalid key");
    return p;
  }
  async put(key: string, data: Buffer) {
    const p = this.resolve(key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, data);
  }
  async get(key: string) {
    return readFile(this.resolve(key));
  }
}

class SupabaseStorage implements Storage {
  constructor(private url: string, private key: string, private bucket: string) {}
  private endpoint(key: string) {
    return `${this.url}/storage/v1/object/${this.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }
  async put(key: string, data: Buffer, contentType: string) {
    const res = await fetch(this.endpoint(key), {
      method: "POST",
      headers: { Authorization: `Bearer ${this.key}`, "Content-Type": contentType, "x-upsert": "true" },
      body: new Uint8Array(data),
    });
    if (!res.ok) throw new Error(`Storage upload failed: ${res.status} ${await res.text()}`);
  }
  async get(key: string) {
    const res = await fetch(this.endpoint(key), { headers: { Authorization: `Bearer ${this.key}` } });
    if (!res.ok) throw new Error(`Storage download failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
}

export function getStorage(): Storage {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_BUCKET } = process.env;
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    return new SupabaseStorage(SUPABASE_URL.replace(/\/$/, ""), SUPABASE_SERVICE_ROLE_KEY, SUPABASE_BUCKET ?? "attachments");
  }
  return new LocalStorage(process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads"));
}

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ALLOWED_ATTACHMENT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"];
