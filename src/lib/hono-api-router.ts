// deno-lint-ignore-file no-explicit-any
import type { RouteConfig, z } from "@hono/zod-openapi"
import type { Authenticated, MaybeAuthenticated } from "./../auth/authenticate.ts"
import { defaultHeaders } from "./../defaults/default-headers.ts"
import { defaultResponses } from "./../defaults/default-responses.ts"
import type { AuthType } from "./../types/types.ts"
import type { AuthorizePayload } from "./../auth/authorize.ts"
import type { Context } from "hono"
import type { PathwaysBuilder } from "jsr:@flowcore/pathways"

export class HonoApiRouter<PW extends PathwaysBuilder<any, any> = never> {
  public readonly basePath: string
  public pathways?: PathwaysBuilder<any, any>

  private readonly routes: {
    routeConfig: RouteConfig
    inOptions: RouteOptions<any, any, any, any, any, any, any, any>
    pathways: PW
  }[] = []

  constructor(basePath?: string) {
    this.basePath = basePath ?? "/"
  }

  public withPathways<U extends PathwaysBuilder<any, any>>(obj: U): HonoApiRouter<U> {
    this.pathways = obj
    return this as unknown as HonoApiRouter<U>
  }

  public getRoutes(): {
    routeConfig: RouteConfig
    inOptions: RouteOptions<any, any, any, any, any, any, any, any>
    pathways: PW
  }[] {
    return this.routes.map((route) => ({
      routeConfig: {
        ...route.routeConfig,
        path: (this.basePath + route.routeConfig.path).replace(/\/\//g, "/"),
      },
      inOptions: route.inOptions,
      pathways: route.pathways,
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
  >(path: string, inOptions: RouteOptions<H, P, Q, B, R, A, Auth, PW>): HonoApiRouter<PW> {
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
  >(path: string, inOptions: RouteOptions<H, P, Q, B, R, A, Auth, PW>): HonoApiRouter<PW> {
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
  >(path: string, inOptions: RouteOptions<H, P, Q, B, R, A, Auth, PW>): HonoApiRouter<PW> {
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
  >(path: string, inOptions: RouteOptions<H, P, Q, B, R, A, Auth, PW>): HonoApiRouter<PW> {
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
  >(path: string, inOptions: RouteOptions<H, P, Q, B, R, A, Auth, PW>): HonoApiRouter<PW> {
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
    PW extends PathwaysBuilder<any, any> = never,
  >(
    method: "get" | "post" | "put" | "delete" | "patch",
    path: string,
    inOptions: RouteOptions<H, P, Q, B, R, A, Auth, PW>,
  ): HonoApiRouter<PW> {
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

    this.routes.push({
      routeConfig: options,
      inOptions,
      pathways: this.pathways as any,
    })
    return this as unknown as HonoApiRouter<PW>
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
  PW extends PathwaysBuilder<any, any> = never,
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
    pathways: PW
  }) => R extends z.ZodUndefined ? (Promise<null> | null) : (Promise<z.infer<R>> | z.infer<R>)
}
