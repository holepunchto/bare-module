import URL from 'bare-url'
import Buffer from 'bare-buffer'
import { type ImportsMap } from 'bare-module-resolve'

/** Defines how modules are resolved, read and loaded; custom protocols can serve modules from outside the file system, such as a `Hyperdrive` or a `bare-bundle`. */
interface ModuleProtocol {
  /**
   * Preprocess the `specifier` and `parentURL` before the resolve algorithm is called.
   * @param specifier - The module specifier being resolved.
   * @param parentURL - The `URL` the specifier is resolved relative to.
   * @returns The (possibly rewritten) specifier to pass into the resolve algorithm.
   */
  preresolve(specifier: string, parentURL: URL): string

  /**
   * Process the resolved URL; can be used to convert file paths, etc.
   * @param url - The resolved `URL` to post-process.
   * @returns The (possibly transformed) resolved `URL`.
   */
  postresolve(url: URL): URL

  /**
   * Resolve the `specifier` to a URL.
   * @param specifier - The module specifier to resolve.
   * @param parentURL - The `URL` to resolve `specifier` relative to.
   * @param imports - The `"imports"` map to apply during resolution.
   */
  resolve(specifier: string, parentURL: URL, imports: ImportsMap): URL

  /**
   * Return whether the URL exists.
   * @param url - The `URL` to check for existence.
   * @param type - The module type being probed (see `Module.constants.types`).
   */
  exists(url: URL, type: number): boolean

  /**
   * Return the source code of a URL, represented as a string or buffer.
   * @param url - The `URL` to read.
   * @returns The source of `url` as a `Buffer` or `string`, or `null` if it does not exist.
   */
  read(url: URL): Buffer | string | null

  /**
   * Post-process URLs for addons before `postresolve()`.
   * @param url - The resolved addon `URL` to post-process.
   */
  addon(url: URL): URL

  /**
   * Post-process URLs for assets before `postresolve()`.
   * @param url - The resolved asset `URL` to post-process.
   */
  asset(url: URL): URL

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
