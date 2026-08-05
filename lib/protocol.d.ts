import URL from 'bare-url'
import Buffer from 'bare-buffer'

interface ModuleProtocol {
  /**
   * Resolve the `specifier` to a URL.
   * @param specifier - The module specifier to resolve.
   * @param parentURL - The `URL` to resolve `specifier` relative to.
   * @param imports - The `"imports"` map to apply during resolution.
   */
  resolve(url: URL): URL | Promise<URL>

  resolveSync(url: URL): URL

  /**
   * Return whether the URL exists.
   * @param url - The `URL` to check for existence.
   * @param type - The module type being probed (see `Module.constants.types`).
   */
  exists(url: URL): boolean | Promise<boolean>

  existsSync(url: URL): boolean

  /**
   * Return the source code of a URL, represented as a string or buffer.
   * @param url - The `URL` to read.
   * @returns The source of `url` as a `Buffer` or `string`, or `null` if it does not exist.
   */
  read(url: URL): Buffer | string | null | Promise<Buffer | string | null>

  readSync(url: URL): Buffer | string | null

  list(url: URL): Iterable<URL> | AsyncIterable<URL>

  listSync(url: URL): Iterable<URL>

  /**
   * Create a new protocol that uses this protocol as its context, overriding the given `methods`.
   * @param methods - Protocol method overrides for the new protocol.
   * @returns A new `ModuleProtocol` that uses this protocol as its context, with `methods` overriding.
   */
  extend(methods: Partial<ModuleProtocol>): ModuleProtocol
}

declare class ModuleProtocol {
  /**
   * @param methods - Protocol method overrides; any of `preresolve`, `postresolve`, `resolve`, `exists`, `read`, `addon`, or `asset`.
   * @param context - An existing protocol to fall back to for any method not provided in `methods`.
   */
  constructor(methods?: Partial<ModuleProtocol>, context?: ModuleProtocol)
}

export = ModuleProtocol
