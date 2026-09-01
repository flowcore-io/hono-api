// deno-lint-ignore-file no-explicit-any
import { otel } from "@hono/otel"
import { prometheus } from "@hono/prometheus"
import { createRoute, OpenAPIHono, type RouteConfig, type z } from "@hono/zod-openapi"
import { Scalar } from "@scalar/hono-api-reference"
import type { Context, Env } from "hono"
import { type PathwaysBuilder, SessionPathwayBuilder } from "@flowcore/pathways"
import { Registry } from "prom-client"
import {
  authenticate,
  type Authenticated,
  DEFAULT_API_KEY_TIMEOUT_MS,
  DEFAULT_JWKS_TIMEOUT_MS,
  FLOWCORE_JWT_CONFIG,
  type JWTValidationConfig,
  type MaybeAuthenticated,
} from "../auth/authenticate.ts"
import { authorize, getAuthCache } from "../auth/authorize.ts"
import {
  AppException,
  AppExceptionBadRequest,
  AppExceptionForbidden,
  AppExceptionUnauthorized,
} from "../exceptions/app-exceptions.ts"
import type { Logger } from "../lib/logger.ts"
import type { HonoApiRouter, RouteOptions } from "./hono-api-router.ts"

export interface HonoApiOptions {
  auth?: {
    jwks_url?: string
    api_key_url?: string
    iam_url?: string
    /** Validator for fc_-format api keys (POST /api/v1/api-keys/validate). Legacy non-fc_ keys stay on api_key_url. */
    tenant_store_url?: string
    /** Milliseconds before a JWKS document fetch is aborted. Defaults to 5000. */
    jwks_timeout_ms?: number
    /** Milliseconds before an api-key validation request is aborted. Defaults to 5000. */
    api_key_timeout_ms?: number
    jwtConfig?: JWTValidationConfig
  }
  authDefaults?: {
    jwtConfig?: JWTValidationConfig
    optional?: boolean
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
    path?: string
    secret?: string
  }
  otel?: {
    enabled: boolean
  }
  logger?: Logger
}

export class HonoApi {
  public readonly app: OpenAPIHono
  public readonly prometheusRegistry?: Registry

  private logger: Logger = console

  private authOptions = {
    jwks_url: "https://auth.flowcore.io/realms/flowcore/protocol/openid-connect/certs",
    api_key_url: "https://security-key.api.flowcore.io",
    iam_url: "https://iam.api.flowcore.io",
    tenant_store_url: "https://tenant-store.api.flowcore.io",
    jwks_timeout_ms: DEFAULT_JWKS_TIMEOUT_MS,
    api_key_timeout_ms: DEFAULT_API_KEY_TIMEOUT_MS,
  }

  private openapiOptions = {
    docPath: "/swagger",
    jsonPath: "/swagger/openapi.json",
    version: "0.0.0",
    name: "Hono API",
    description: "Hono API",
  }

  private globalJwtConfig: JWTValidationConfig = FLOWCORE_JWT_CONFIG
  private authDefaults?: {
    jwtConfig?: JWTValidationConfig
    optional?: boolean
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

      // Set global JWT config from auth options
      if (options.auth.jwtConfig) {
        this.globalJwtConfig = options.auth.jwtConfig
      }
    }

    // Set auth defaults
    if (options.authDefaults) {
      this.authDefaults = options.authDefaults

      // Auth defaults JWT config takes precedence over auth.jwtConfig
      if (options.authDefaults.jwtConfig) {
        this.globalJwtConfig = options.authDefaults.jwtConfig
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
      this.app.use("*", otel())
    }

    if (options.prometheus) {
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
          this.globalJwtConfig,
          this.authOptions.tenant_store_url,
          {
            jwksTimeoutMs: this.authOptions.jwks_timeout_ms,
            apiKeyTimeoutMs: this.authOptions.api_key_timeout_ms,
          },
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
}
