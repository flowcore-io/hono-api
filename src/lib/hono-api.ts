import type { Context, Env } from "hono"
import { Scalar } from "@scalar/hono-api-reference"
import { createRoute, OpenAPIHono, type RouteConfig, type z } from "@hono/zod-openapi"
import type { HonoApiRouter, RouteOptions } from "./hono-api-router.ts"
import { AppException, AppExceptionBadRequest, AppExceptionUnauthorized } from "../exceptions/app-exceptions.ts"
import { authenticate, type Authenticated, type MaybeAuthenticated } from "../auth/authenticate.ts"
import { authorize } from "../auth/authorize.ts"
import packageJson from "./../../deno.json" with { type: "json" }
import type { Logger } from "../types/types.ts"

export interface HonoApiOptions {
  auth: {
    jwks_url: string
    api_key_url: string
    iam_url: string
  }
  openapi?: {
    docPath?: string
    jsonPath?: string
  }
  logger: Logger
}

export class HonoApi {
  public readonly app: OpenAPIHono
  private readonly routers: HonoApiRouter[] = []

  constructor(private readonly options: HonoApiOptions) {
    this.app = new OpenAPIHono({
      defaultHook: (result) => {
        if (!result.success) {
          throw new AppExceptionBadRequest(result.error, result.target, "Request validation failed")
        }
      },
    })
    this.app.notFound(this.notFoundHandler)
    this.app.onError(this.errorHandler)

    const docPath = this.options.openapi?.docPath ?? "/doc"
    const docJsonPath = this.options.openapi?.jsonPath ?? "/openapi.json"

    this.app.doc(docJsonPath, {
      openapi: "3.1.0",
      info: {
        version: packageJson.version,
        title: packageJson.name,
        description: packageJson.description,
      },
    })

    this.app.get(
      docPath,
      Scalar({
        url: docJsonPath,
        theme: "solarized",
      }),
    )
  }

  public addRouter(path: string, router: HonoApiRouter) {
    const routes = router.getRoutes().map((route) => ({
      ...route,
      routeConfig: {
        ...route.routeConfig,
        path: (path + route.routeConfig.path).replace(/\/\//g, "/"),
      },
    }))
    for (const route of routes) {
      console.log("Adding route", route.routeConfig.method, route.routeConfig.path)
      this.addRoute(this.app, route.routeConfig, route.inOptions)
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
    if (error instanceof AppException) {
      return c.json(
        {
          status: error.status,
          code: error.code,
          message: error.message,
          in: (error as AppExceptionBadRequest).in,
          errors: (error as AppExceptionBadRequest).errors,
        },
        error.status,
      )
    }
    console.error(error)
    return c.json(
      {
        status: 500,
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal server error",
      },
      500,
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
  >(app: OpenAPIHono, routeConfig: RouteConfig, inOptions: RouteOptions<H, P, Q, B, R, A, Auth>) {
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
        const user = await authenticate(
          this.options.auth.jwks_url,
          this.options.auth.api_key_url,
          c.req.header("Authorization"),
          inOptions.auth?.type,
        )
        let resource: A | undefined = undefined

        if (inOptions.auth) {
          resource = await inOptions.auth.resource?.(params)
          const permissions = inOptions.auth.permissions?.(resource as unknown as A, params) ?? []
          if (permissions.length > 0) {
            if (!user) {
              throw new AppExceptionUnauthorized()
            }
            await authorize(this.options.auth.iam_url, user?.type === "apiKey" ? "keys" : "users", user.id, permissions)
          }
        }

        if (inOptions.auth?.optional !== true && !user) {
          throw new AppExceptionUnauthorized()
        }

        const body = inOptions.input?.body
          ? ((await c.req.json()) as B extends z.ZodSchema ? z.infer<B> : never)
          : undefined

        const response = await (inOptions.handler?.({
          headers: c.req.valid("header") as H extends z.ZodSchema ? z.infer<H> : never,
          params,
          query: c.req.valid("query") as Q extends z.ZodSchema ? z.infer<Q> : never,
          body: body as B extends z.ZodSchema ? z.infer<B> : never,
          auth: user as Auth extends true ? MaybeAuthenticated : Authenticated,
          resource: resource as A,
        }) ?? c.json({ message: "Not implemented" }))
        return c.json(response)
      },
    )
  }
}
