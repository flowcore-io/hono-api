export enum AuthType {
  Bearer = "bearer",
  ApiKey = "apiKey",
}

export interface Logger {
  debug(message: string, metadata?: Record<string, unknown>): void
  info(message: string, metadata?: Record<string, unknown>): void
  warn(message: string, metadata?: Record<string, unknown>): void
  error(message: string | Error, metadata?: Record<string, unknown>): void
}
