import { colorize, Style } from "./colorize.ts"
import { createLogger as winstonCreateLogger, format, transports } from "winston"

export enum LogLevel {
  Debug = "debug",
  Info = "info",
  Warn = "warn",
  Error = "error",
  Critical = "critical",
}

interface LoggerMeta {
  [key: string]: unknown
  label?: never
  level?: never
  message?: never
  timestamp?: never
}

export type Logger = {
  [LogLevel.Debug]: (message: string, meta?: LoggerMeta) => void
  [LogLevel.Info]: (message: string, meta?: LoggerMeta) => void
  [LogLevel.Warn]: (message: string, meta?: LoggerMeta) => void
  [LogLevel.Error]: (message: string | Error, meta?: LoggerMeta) => void
}

// Pretty print

const levelColors: Record<string, Style[]> = {
  [LogLevel.Debug]: [Style.CYAN],
  [LogLevel.Info]: [Style.GREEN],
  [LogLevel.Warn]: [Style.YELLOW],
  [LogLevel.Error]: [Style.RED],
}

const customPrettyPrint = format.printf((log) => {
  const { timestamp, label, level, message, ...rest } = log
  return [
    colorize(timestamp as string, [Style.BOLD]),
    colorize(`(${label})`, [Style.PURPLE]),
    colorize(`${level.toUpperCase()}:`, levelColors[level] || []),
    message,
    colorize(`- ${JSON.stringify(rest, null, 2)}`, [Style.THIN]),
  ].join(" ")
})

interface LoggerFactoryOptions {
  prettyPrintLogs: boolean
  logLevel: LogLevel
}

export function loggerFactory(options: LoggerFactoryOptions) {
  return {
    createLogger: (label?: string): Logger => {
      const winstonFormat = options.prettyPrintLogs
        ? format.combine(format.errors({ stack: true }), format.label({ label }), format.timestamp(), customPrettyPrint)
        : format.combine(format.errors({ stack: true }), format.label({ label }), format.timestamp(), format.json())

      return winstonCreateLogger({
        level: options.logLevel,
        format: winstonFormat,
        defaultMeta: { label },
        transports: [new transports.Console()],
      })
    },
  }
}
