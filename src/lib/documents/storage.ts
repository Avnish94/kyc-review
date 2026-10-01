import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";

export interface DocumentStorage {
  put(key: string, data: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

export function newStorageKey(caseId: string): string {
  return `cases/${caseId}/${randomUUID()}`;
}

export function sha256Hex(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Stores files on the local disk. Intended for development and demos only. */
export class LocalDiskStorage implements DocumentStorage {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error("Invalid storage key");
    return full;
  }

  async put(key: string, data: Uint8Array): Promise<void> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data, { flag: "wx" });
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}

/** Azure Blob Storage (or the Azurite emulator locally). */
export class AzureBlobStorage implements DocumentStorage {
  private ready: Promise<unknown> | null = null;
  private readonly container: ContainerClient;

  constructor(connectionString: string, containerName: string) {
    this.container = BlobServiceClient.fromConnectionString(connectionString).getContainerClient(containerName);
  }

  private ensureContainer() {
    this.ready ??= this.container.createIfNotExists();
    return this.ready;
  }

  async put(key: string, data: Uint8Array, contentType: string): Promise<void> {
    await this.ensureContainer();
    await this.container.getBlockBlobClient(key).uploadData(data, {
      blobHTTPHeaders: { blobContentType: contentType },
      conditions: { ifNoneMatch: "*" },
    });
  }

  async get(key: string): Promise<Buffer> {
    await this.ensureContainer();
    return this.container.getBlockBlobClient(key).downloadToBuffer();
  }

  async delete(key: string): Promise<void> {
    await this.ensureContainer();
    await this.container.getBlockBlobClient(key).deleteIfExists();
  }
}

let storage: DocumentStorage | null = null;

export function getStorage(): DocumentStorage {
  if (storage) return storage;
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver === "azure") {
    const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!conn) throw new Error("AZURE_STORAGE_CONNECTION_STRING is required when STORAGE_DRIVER=azure");
    storage = new AzureBlobStorage(conn, process.env.AZURE_STORAGE_CONTAINER ?? "kyc-documents");
  } else if (driver === "local") {
    storage = new LocalDiskStorage(path.resolve(process.env.LOCAL_STORAGE_DIR ?? "./storage"));
  } else {
    throw new Error(`Unknown STORAGE_DRIVER "${driver}"`);
  }
  return storage;
}
