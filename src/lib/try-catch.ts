// Types for the result object with discriminated union
type Success<T> = {
  data: T
  error: null
}

type Failure<E> = {
  data: null
  error: E
}

type Result<T, E = Error> = Success<T> | Failure<E>

// Main wrapper function
export async function tryCatch<T, E = Error>(promise: Promise<T> | (() => Promise<T> | T)): Promise<Result<T, E>> {
  try {
    const data = await (typeof promise === "function" ? promise() : promise)
    return { data, error: null }
  } catch (error) {
    return { data: null, error: error as E }
  }
}
