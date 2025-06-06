import type { RouteConfig, z } from "@hono/zod-openapi"
import type { Authenticated, MaybeAuthenticated } from "./../auth/authenticate.ts"
import { defaultHeaders } from "./../defaults/default-headers.ts"
import { defaultResponses } from "./../defaults/default-responses.ts"
import type { AuthType } from "./../types/types.ts"
import type { AuthorizePayload } from "./../auth/authorize.ts"
import type { Context } from "hono"

export class HonoApiRouter {
  public readonly basePath: string

  private readonly routes: {
    routeConfig: RouteConfig
    // deno-lint-ignore no-explicit-any
    inOptions: RouteOptions<any, any, any, any, any, any, any>
  }[] = []

  constructor(basePath?: string) {
    this.basePath = basePath ?? "/"
  }

  public getRoutes(): {
    routeConfig: RouteConfig
    // deno-lint-ignore no-explicit-any
    inOptions: RouteOptions<any, any, any, any, any, any, any>
  }[] {
    return this.routes.map((route) => ({
      routeConfig: {
        ...route.routeConfig,
        path: (this.basePath + route.routeConfig.path).replace(/\/\//g, "/"),
      },
      inOptions: route.inOptions,
    }))
  }

  public get<
    H extends z.ZodSchema = z.ZodUndefined,
    P extends z.ZodSchema = z.ZodUndefined,
    Q extends z.ZodSchema = z.ZodUndefined,
    B extends z.ZodSchema = z.ZodUndefined,
    R extends z.ZodSchema = z.ZodUndefined,
    A = undefined,
    Auth extends boolean = false,
  >(path: string, inOptions: RouteOptions<H, P, Q, B, R, A, Auth>): HonoApiRouter {
    return this.route("get", path, inOptions)
  }

  public post<
    H extends z.ZodSchema = z.ZodUndefined,
    P extends z.ZodSchema = z.ZodUndefined,
    Q extends z.ZodSchema = z.ZodUndefined,
    B extends z.ZodSchema = z.ZodUndefined,
    R extends z.ZodSchema = z.ZodUndefined,
    A = undefined,
    Auth extends boolean = false,
  >(path: string, inOptions: RouteOptions<H, P, Q, B, R, A, Auth>): HonoApiRouter {
    return this.route("post", path, inOptions)
  }

  public patch<
    H extends z.ZodSchema = z.ZodUndefined,
    P extends z.ZodSchema = z.ZodUndefined,
    Q extends z.ZodSchema = z.ZodUndefined,
    B extends z.ZodSchema = z.ZodUndefined,
    R extends z.ZodSchema = z.ZodUndefined,
    A = undefined,
    Auth extends boolean = false,
  >(path: string, inOptions: RouteOptions<H, P, Q, B, R, A, Auth>): HonoApiRouter {
    return this.route("patch", path, inOptions)
  }

  public put<
    H extends z.ZodSchema = z.ZodUndefined,
    P extends z.ZodSchema = z.ZodUndefined,
    Q extends z.ZodSchema = z.ZodUndefined,
    B extends z.ZodSchema = z.ZodUndefined,
    R extends z.ZodSchema = z.ZodUndefined,
    A = undefined,
    Auth extends boolean = false,
  >(path: string, inOptions: RouteOptions<H, P, Q, B, R, A, Auth>): HonoApiRouter {
    return this.route("put", path, inOptions)
  }

  public delete<
    H extends z.ZodSchema = z.ZodUndefined,
    P extends z.ZodSchema = z.ZodUndefined,
    Q extends z.ZodSchema = z.ZodUndefined,
    B extends z.ZodSchema = z.ZodUndefined,
    R extends z.ZodSchema = z.ZodUndefined,
    A = undefined,
    Auth extends boolean = false,
  >(path: string, inOptions: RouteOptions<H, P, Q, B, R, A, Auth>): HonoApiRouter {
    return this.route("delete", path, inOptions)
  }

  private route<
    H extends z.ZodSchema = z.ZodUndefined,
    P extends z.ZodSchema = z.ZodUndefined,
    Q extends z.ZodSchema = z.ZodUndefined,
    B extends z.ZodSchema = z.ZodUndefined,
    R extends z.ZodSchema = z.ZodUndefined,
    A = undefined,
    Auth extends boolean = false,
  >(
    method: "get" | "post" | "put" | "delete" | "patch",
    path: string,
    inOptions: RouteOptions<H, P, Q, B, R, A, Auth>,
  ): HonoApiRouter {
    const options = {
      method,
      path,
      ...inOptions,
      responses: {
        ...defaultResponses,
      },
    } as RouteConfig

    options.request ??= {}

    if (inOptions.output) {
      options.responses = {
        ...defaultResponses,
        200: {
          description: "OK",
          content: {
            "application/json": {
              schema: inOptions.output,
            },
          },
        },
      }
    } else {
      options.responses = {
        ...defaultResponses,
        201: {
          description: "OK",
        },
      }
    }

    if (inOptions.input) {
      options.request.headers = defaultHeaders.extend(
        (inOptions.input.headers as unknown as z.AnyZodObject)?.shape ?? {},
      )
      options.request.params = inOptions.input.params as unknown as z.AnyZodObject
      options.request.query = inOptions.input.query as unknown as z.AnyZodObject
      if (inOptions.input.body) {
        options.request.body = {
          content: {
            "application/json": {
              schema: inOptions.input.body,
            },
          },
        }
      }
    }

    this.routes.push({ routeConfig: options, inOptions })
    return this
  }
}

export interface RouteOptions<
  H extends z.ZodSchema = z.ZodUndefined,
  P extends z.ZodSchema = z.ZodUndefined,
  Q extends z.ZodSchema = z.ZodUndefined,
  B extends z.ZodSchema = z.ZodUndefined,
  R extends z.ZodSchema = z.ZodUndefined,
  A = undefined,
  Auth extends boolean | undefined = false,
> extends Omit<RouteConfig, "method" | "path" | "request" | "responses"> {
  input?: {
    headers?: H
    params?: P
    query?: Q
    body?: B
  }
  output?: R
  auth?: {
    optional?: Auth
    type?: [AuthType, ...AuthType[]]
    mode?: "tenant" | "tenantId"
    allowFlowcoreAdmin?: boolean
    resource?: (input: {
      headers: H extends z.ZodSchema ? z.infer<H> : undefined
      params: P extends z.ZodSchema ? z.infer<P> : undefined
      query: Q extends z.ZodSchema ? z.infer<Q> : undefined
      body: B extends z.ZodSchema ? z.infer<B> : undefined
      auth: Auth extends true ? MaybeAuthenticated : Authenticated
    }) => Promise<A>
    permissions?: (input: {
      headers: H extends z.ZodSchema ? z.infer<H> : undefined
      params: P extends z.ZodSchema ? z.infer<P> : undefined
      query: Q extends z.ZodSchema ? z.infer<Q> : undefined
      body: B extends z.ZodSchema ? z.infer<B> : undefined
      auth: Auth extends true ? MaybeAuthenticated : Authenticated
      resource: A
    }) => AuthorizePayload[]
  }
  handler: (input: {
    headers: H extends z.ZodSchema ? z.infer<H> : undefined
    params: P extends z.ZodSchema ? z.infer<P> : undefined
    query: Q extends z.ZodSchema ? z.infer<Q> : undefined
    body: B extends z.ZodSchema ? z.infer<B> : undefined
    auth: Auth extends true ? MaybeAuthenticated : Authenticated
    resource: A
    context: Context
  }) => R extends z.ZodUndefined ? (Promise<null> | null) : (Promise<z.infer<R>> | z.infer<R>)
}
