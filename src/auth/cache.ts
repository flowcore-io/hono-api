import type { BunSqliteKeyValue } from "bun-sqlite-key-value"
import * as xxHash from "@jabr/xxhash64"
import process from "node:process"
import type { Logger } from "../lib/logger.ts"

interface AuthCacheOptions {
  ttlMs: number
  logger?: Logger
}

export class AuthCache {
  private logger: Logger = console
  private isBun = false
  private cache?: Map<string, boolean> | BunSqliteKeyValue
  private hasher?: xxHash.Hasher

  constructor(public readonly options: AuthCacheOptions) {
    if (process.versions.bun) {
      this.logger.debug("Using BunSqliteKeyValue for auth cache")
      this.isBun = true
    } else {
      this.logger.debug("Using Map for auth cache")
    }
  }

  private async getCacheDriver(): Promise<Map<string, boolean> | BunSqliteKeyValue> {
    if (this.cache) {
      return this.cache
    }
    if (this.isBun) {
      const { BunSqliteKeyValue } = await import("bun-sqlite-key-value")
      this.cache = new BunSqliteKeyValue(":memory:", {
        ttlMs: this.options.ttlMs,
      })
    } else {
      this.cache = new Map<string, boolean>()
    }
    return this.cache
  }

  public async hash(value: string): Promise<string> {
    if (!this.hasher) {
      this.hasher = await xxHash.create3()
    }
    return this.hasher.hash(value, "hex").toString()
  }

  public async get(key: string): Promise<boolean | undefined> {
    const cache = await this.getCacheDriver()
    return cache.get(key)
  }

  public async set(key: string, value: boolean): Promise<void> {
    const cache = await this.getCacheDriver()
    cache.set(key, value)
  }
}
