import { BunSqliteKeyValue } from "bun-sqlite-key-value"
import * as xxHash from "@jabr/xxhash64"

interface AuthCacheOptions {
  ttlMs: number
}

export class AuthCache {
  private cache: BunSqliteKeyValue
  private hasher?: xxHash.Hasher

  constructor(public readonly options: AuthCacheOptions) {
    this.cache = new BunSqliteKeyValue(":memory:", {
      ttlMs: options.ttlMs,
    })
  }

  public async hash(value: string): Promise<string> {
    if (!this.hasher) {
      this.hasher = await xxHash.create3()
    }
    return this.hasher.hash(value, "hex").toString()
  }

  // deno-lint-ignore require-await
  public async get(key: string): Promise<boolean | undefined> {
    return this.cache.get<boolean>(key)
  }

  // deno-lint-ignore require-await
  public async set(key: string, value: boolean): Promise<void> {
    this.cache.set(key, value)
  }
}
