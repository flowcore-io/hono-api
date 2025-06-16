import { context, trace } from "@opentelemetry/api"
import { createLogger as winstonCreateLogger, format, transports } from "winston"
import { colorize, Style } from "./colorize.ts"

const otelInjector = format((info) => {
  const span = trace.getSpan(context.active())
  if (span) {
    const { traceId, spanId } = span.spanContext()
    info.trace_id = traceId
    info.span_id = spanId
  }
  return info
})

export enum LogLevel {
  Debug = "debug",
  Info = "info",
  Warn = "warn",
  Error = "error",
}

interface LoggerMeta {
  [key: string]: unknown
  label?: never
  level?: never
  message?: never
  timestamp?: never
  trace_id?: never
  span_id?: never
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
  const { timestamp, label, level, message, trace_id, span_id, ...rest } = log

  const traceId = trace_id as string | undefined
  const spanId = span_id as string | undefined

  const traceInfo = traceId && spanId
    ? colorize(`[trace=${traceId.slice(0, 8)}...,span=${spanId.slice(0, 8)}...]`, [Style.GRAY])
    : ""

  return [
    colorize(timestamp as string, [Style.BOLD]),
    colorize(`(${label})`, [Style.PURPLE]),
    colorize(`${level.toUpperCase()}:`, levelColors[level] || []),
    traceInfo,
    message,
    colorize(`- ${JSON.stringify(rest, null, 2)}`, [Style.THIN]),
  ].join(" ")
})

/**
 * Creates a logger factory with customizable logging options.
 *
 * @param {boolean} prettyPrintLogs - Indicates if logs should be pretty printed.
 * @param {LogLevel} logLevel - The minimum log level to output.
 * @returns An object with a method to create a logger instance.
 */
export function loggerFactory(prettyPrintLogs: boolean, logLevel: LogLevel) {
  return {
    /**
     * Creates a logger instance with the specified label.
     *
     * @param {string} [label] - The label for the logger.
     * @returns A logger instance.
     */
    createLogger: (label?: string): Logger => {
      const winstonFormat = prettyPrintLogs
        ? format.combine(
          otelInjector(),
          format.errors({ stack: true }),
          format.label({ label }),
          format.timestamp(),
          customPrettyPrint,
        )
        : format.combine(
          otelInjector(),
          format.errors({ stack: true }),
          format.label({ label }),
          format.timestamp(),
          format.json(),
        )

      return winstonCreateLogger({
        level: logLevel,
        format: winstonFormat,
        defaultMeta: { label },
        transports: [new transports.Console()],
      })
    },
  }
}
