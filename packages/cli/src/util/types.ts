/**
 * Typed `Object.keys(o: T)` function, returning `(keyof T)[]`
 */

// biome-ignore lint/suspicious/noExplicitAny: We need `any` type explicitly
export function ObjectKeys<T extends {[key: string]: any}>(o: T): (keyof T)[] {
  return Object.keys(o);
}
