// deno-lint-ignore-file no-explicit-any
import type { Context, Env } from "hono"
import { Scalar } from "@scalar/hono-api-reference"
import { createRoute, OpenAPIHono, type RouteConfig, type z } from "@hono/zod-openapi"
import type { HonoApiRouter, RouteOptions } from "./hono-api-router.ts"
import {
  AppException,
  AppExceptionBadRequest,
  AppExceptionForbidden,
  AppExceptionUnauthorized,
} from "../exceptions/app-exceptions.ts"
import { authenticate, type Authenticated, type MaybeAuthenticated } from "../auth/authenticate.ts"
import { authorize, getAuthCache } from "../auth/authorize.ts"
import type { Logger } from "../lib/logger.ts"
import { type PathwaysBuilder, SessionPathwayBuilder } from "npm:@flowcore/pathways@^0.16.2"
import { prometheus } from "@hono/prometheus"
import { Registry } from "prom-client"
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { WinstonInstrumentation } from "@opentelemetry/instrumentation-winston"
import { NodeSDK } from "@opentelemetry/sdk-node"
import { otel } from "@hono/otel"
import { FetchInstrumentation } from "@opentelemetry/instrumentation-fetch"

export interface HonoApiOptions {
  auth?: {
    jwks_url?: string
    api_key_url?: string
    iam_url?: string
  }
  openapi?: {
    docPath?: string
    jsonPath?: string
    version?: string
    name?: string
    description?: string
  }
  prometheus?: {
    enabled: boolean
    secret?: string
    path?: string
  }
  otel?: {
    enabled: boolean
    runtime: "node" | "bun" | "deno"
    serviceName: string
    endpoint: string
  }
  logger?: Logger
}

export class HonoApi {
  public readonly app: OpenAPIHono
  public readonly prometheusRegistry?: Registry
  private readonly otelServiceName?: string
  private readonly otelEndpoint?: string
  private readonly otelNodeSdk?: NodeSDK

  private logger: Logger = console

  private authOptions = {
    jwks_url: "https://auth.flowcore.io/realms/flowcore/protocol/openid-connect/certs",
    api_key_url: "https://security-key.api.flowcore.io",
    iam_url: "https://iam.api.flowcore.io",
  }

  private openapiOptions = {
    docPath: "/swagger",
    jsonPath: "/swagger/openapi.json",
    version: "0.0.0",
    name: "Hono API",
    description: "Hono API",
  }

  constructor(options: HonoApiOptions) {
    if (options.logger) {
      this.logger = options.logger
    }

    // Initialize the auth cache
    void getAuthCache(this.logger)

    if (options.auth) {
      this.authOptions = {
        ...this.authOptions,
        ...options.auth,
      }
    }
    if (options.openapi) {
      this.openapiOptions = {
        ...this.openapiOptions,
        ...options.openapi,
      }
    }

    this.app = new OpenAPIHono({
      defaultHook: (result) => {
        if (!result.success) {
          throw new AppExceptionBadRequest(result.error, result.target, "Request validation failed")
        }
      },
    })

    if (options.otel?.enabled) {
      this.otelServiceName = options.otel.serviceName
      this.otelEndpoint = options.otel.endpoint
      this.otelNodeSdk = this.getOtelNodeSdk()
      this.otelNodeSdk.start()
      this.app.use(otel())
    }

    if (options.prometheus?.enabled) {
      this.prometheusRegistry = new Registry() as any
      const { printMetrics, registerMetrics } = prometheus({
        collectDefaultMetrics: true,
        registry: this.prometheusRegistry,
      })

      this.app.use("*", registerMetrics)
      this.app.get(options.prometheus.path ?? "/metrics", (c, next) => {
        const secret = c.req.query("secret") || c.req.header("x-secret")
        if (options.prometheus?.secret && secret !== options.prometheus.secret) {
          throw new AppExceptionUnauthorized()
        }
        return next()
      }, printMetrics)
    }

    this.app.notFound(this.notFoundHandler.bind(this))
    this.app.onError(this.errorHandler.bind(this))

    this.app.doc(this.openapiOptions.jsonPath, {
      openapi: "3.1.0",
      info: {
        version: this.openapiOptions.version ?? "0.0.0",
        title: this.openapiOptions.name ?? "Hono API",
        description: this.openapiOptions.description ?? "Hono API",
      },
    })

    this.app.get(
      this.openapiOptions.docPath,
      Scalar({
        url: this.openapiOptions.jsonPath,
        theme: "solarized",
      }),
    )
  }

  public addRouter(path: string, router: HonoApiRouter<any>) {
    const routes = router.getRoutes().map((route) => ({
      ...route,
      routeConfig: {
        ...route.routeConfig,
        path: (path + route.routeConfig.path).replace(/\/\//g, "/").replace(/\/$/, ""),
      },
    }))
    for (const route of routes) {
      this.logger.debug("Adding route", {
        method: route.routeConfig.method,
        path: route.routeConfig.path,
        pathways: !!route.pathways,
      })
      this.addRoute(this.app, route.routeConfig, route.inOptions, route.pathways)
    }
  }

  private notFoundHandler(c: Context) {
    return c.json(
      {
        status: 404,
        code: "NOT_FOUND",
        message: "Route not found",
      },
      404,
    )
  }

  private errorHandler(error: Error, c: Context) {
    if (!(error instanceof AppException)) {
      this.logger.error(error, {
        path: c.req.path,
        method: c.req.method,
      })
      return c.json(
        {
          status: 500,
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal server error",
        },
        500,
      )
    }
    if (error instanceof AppExceptionBadRequest) {
      return c.json(
        {
          status: error.status,
          code: error.code,
          message: error.message,
          in: error.in,
          errors: error.errors,
        },
        error.status,
      )
    }
    if (error instanceof AppExceptionForbidden) {
      return c.json(
        {
          status: error.status,
          code: error.code,
          message: error.message,
          validPolicies: error.validPolicies,
          invalidRequest: error.invalidRequest,
        },
        error.status,
      )
    }
    return c.json(
      {
        status: error.status,
        code: error.code,
        message: error.message,
      },
      error.status,
    )
  }

  private addRoute<
    H extends z.ZodSchema = z.ZodNever,
    P extends z.ZodSchema = z.ZodNever,
    Q extends z.ZodSchema = z.ZodNever,
    B extends z.ZodSchema = z.ZodNever,
    R extends z.ZodSchema = z.ZodNever,
    A = never,
    Auth extends boolean = false,
  >(
    app: OpenAPIHono,
    routeConfig: RouteConfig,
    inOptions: RouteOptions<H, P, Q, B, R, A, Auth, any>,
    pathways?: PathwaysBuilder<any, any>,
  ) {
    const route = createRoute(routeConfig)
    app.openapi(
      route,
      async (
        c: Context<
          Env,
          string,
          {
            in: {
              header: unknown
              param: unknown
              query: unknown
            }
            out: {
              header: unknown
              param: unknown
              query: unknown
            }
          }
        >,
      ) => {
        const params = c.req.valid("param") as P extends z.ZodSchema ? z.infer<P> : never
        const headers = c.req.valid("header") as H extends z.ZodSchema ? z.infer<H> : never
        const query = c.req.valid("query") as Q extends z.ZodSchema ? z.infer<Q> : never
        const body = inOptions.input?.body
          ? ((await c.req.json()) as B extends z.ZodSchema ? z.infer<B> : never)
          : undefined

        if (inOptions.input?.body && !c.req.header("Content-Type")?.includes("application/json")) {
          throw new AppExceptionBadRequest(undefined, undefined, "Content-Type must be application/json")
        }

        const user = await authenticate(
          this.logger,
          this.authOptions.jwks_url,
          this.authOptions.api_key_url,
          c.req.header("Authorization"),
          inOptions.auth?.type,
        )
        let resource: A | undefined = undefined

        if (inOptions.auth) {
          resource = await inOptions.auth.resource?.({
            params,
            headers,
            query,
            body: body as B extends z.ZodSchema ? z.infer<B> : never,
            auth: user as Auth extends true ? MaybeAuthenticated : Authenticated,
          })
          const permissions = inOptions.auth.permissions?.({
            headers,
            params,
            query,
            body: body as B extends z.ZodSchema ? z.infer<B> : never,
            auth: user as Auth extends true ? MaybeAuthenticated : Authenticated,
            resource: resource as A,
          }) ?? []
          if (permissions.length > 0) {
            if (!user) {
              throw new AppExceptionUnauthorized()
            }
            await authorize(
              user,
              permissions,
              {
                iamUrl: this.authOptions.iam_url,
                allowFlowcoreAdmin: inOptions.auth?.allowFlowcoreAdmin,
                type: user.type === "apiKey" ? "keys" : "users",
                mode: inOptions.auth?.mode === "tenant" ? "tenant" : "organization",
                logger: this.logger,
              },
            )
          }
        }

        if (inOptions.auth?.optional !== true && !user) {
          throw new AppExceptionUnauthorized()
        }

        let handlerPathways = pathways ? new SessionPathwayBuilder(pathways) : undefined
        if (handlerPathways && user?.id) {
          handlerPathways = handlerPathways.withUserResolver(() =>
            Promise.resolve({
              entityId: user.id,
              entityType: user.type === "apiKey" ? "key" : "user",
            })
          )
        }

        const response = await inOptions.handler({
          headers,
          params,
          query,
          body: body as B extends z.ZodSchema ? z.infer<B> : never,
          auth: user as Auth extends true ? MaybeAuthenticated : Authenticated,
          resource: resource as A,
          context: c,
          pathways: handlerPathways as any,
        })

        if (response === null) {
          c.status(201)
          return c.text("")
        }
        return c.json(response)
      },
    )
  }

  private getOtelNodeSdk() {
    const sdk = new NodeSDK({
      serviceName: this.otelServiceName,
      traceExporter: new OTLPTraceExporter({
        url: `${this.otelEndpoint}/v1/traces`,
      }),
      instrumentations: [
        getNodeAutoInstrumentations({
          "@opentelemetry/instrumentation-fs": { enabled: false },
        }),
        new FetchInstrumentation({
          applyCustomAttributesOnSpan: (span: unknown) => {
            if (span && typeof span === "object" && "setAttribute" in span) {
              ;(span as { setAttribute: (key: string, value: string) => void }).setAttribute("runtime", "deno")
            }
          },
        }),
        new WinstonInstrumentation({
          enabled: true,
          logHook: (span, record) => {
            record.trace_id = span.spanContext().traceId
            record.span_id = span.spanContext().spanId
          },
        }),
      ],
    })
    return sdk
  }
}
