import Buffer from 'bare-buffer'
import URL from 'bare-url'
import { constants } from 'bare-module-traverse'
import Protocol from './lib/protocol'
import Loader from './lib/loader'

/** A map of module URL `href`s to loaded modules. */
interface Cache {
  [href: string]: Module
}

/** The import condition a specifier is resolved for. */
type Condition = 'require' | 'import' | 'asset' | 'addon'

/**
 * Import attributes instructing how a module should be loaded. A `type` that is not one of the
 * known strings is turned down rather than passed over.
 */
interface Attributes {
  /**
   * How the module should be loaded: one of `'script'`, `'module'`, `'json'`, `'bundle'`,
   * `'addon'`, `'binary'`, or `'text'`.
   */
  type: Lowercase<keyof typeof constants>
}

interface Module {
  /** The directory portion of `module.url`. */
  readonly dirname: string
  /** The exports from the module. */
  exports: unknown
  /** The file portion of `module.url`. */
  readonly filename: string
  readonly id: string
  readonly path: string
  /**
   * The `ModuleProtocol` class for resolving, reading and loading modules. See
   * [Protocols](https://github.com/holepunchto/bare-module#protocols) for usage.
   */
  readonly protocol: Protocol
  /** The WHATWG `URL` identifier of the module. */
  readonly url: URL
}

declare class Module {
  constructor(url: URL)
}

declare namespace Module {
  export { type Attributes, type Cache, type Condition, Loader, Protocol, constants }

  export interface LoadOptions extends Loader.Options, Loader.LinkOptions {
    /** The referring module. */
    referrer?: Module
  }

  export interface ResolveOptions extends Loader.Options {
    referrer?: Module
  }

  export interface CreateRequireOptions extends Loader.Options {
    referrer?: Module
  }

  /** Options for `require()`; `with` holds the import attributes. */
  export interface RequireOptions {
    with?: Attributes
  }

  /** The `require.addon` function: imports addon modules, with `host` and `resolve` attached. */
  export interface RequireAddon {
    (specifier?: string, parentURL?: URL): string
    /**
     * The platform and architecture used when resolving addons, following the pattern
     * `<platform>-<arch>[-<environment>]`.
     */
    host: string
    /**
     * @returns The WHATWG `URL` that `specifier` resolves to.
     * @throws {MODULE_NOT_FOUND} no module matching `specifier` could be found relative to
     * `parentURL`.
     * @throws {TypeError} `specifier` is not a string.
     */
    resolve: (specifier: string, parentURL?: URL) => unknown
  }

  /**
   * The function returned by `Module.createRequire()`: resolves and loads modules relative to its
   * parent URL, with `main`, `cache`, `resolve`, `addon`, and `asset` attached.
   */
  export interface Require {
    (parentURL: string | URL, opts?: RequireOptions): unknown
    main: Module
    cache: Cache
    resolve: (specifier: string, parentURL?: URL) => string
    /**
     * Resolve `specifier` relative to `parentURL` and evaluate the matching addon.
     * @param specifier - The addon specifier to resolve. Defaults to `'.'`.
     * @param parentURL - The WHATWG `URL` to resolve `specifier` relative to. Defaults to the URL
     * of the module that `require()` was created for.
     * @returns The exports of the addon.
     * @throws {MODULE_NOT_FOUND} no addon matching `specifier` could be found relative to
     * `parentURL`.
     */
    addon: RequireAddon
    /**
     * @returns The WHATWG `URL` of the resolved asset.
     * @throws {ASSET_NOT_FOUND} no asset matching `specifier` could be found relative to
     * `parentURL`.
     * @throws {TypeError} `specifier` is not a string.
     */
    asset: (specifier: string, parentURL?: URL) => string
  }

  /**
   * Load a module with the provided `url`. `url` is a WHATWG `URL`. If provided, the `source` will
   * be passed to the matching `extension` for the `url`.
   * @param url - The WHATWG `URL` of the module to load.
   * @param opts - Load options; may carry a `source` to load directly instead of reading it through
   * the protocol.
   * @returns The loaded `Module`, reusing the cached instance if `url` was already loaded.
   * @throws {TYPE_INCOMPATIBLE} a module is already cached for `url` with a type incompatible with
   * the requested `type`.
   */
  export function load(url: URL, opts: LoadOptions): Promise<Module>
  export function load(
    url: URL,
    source?: Buffer | string | null,
    opts?: LoadOptions
  ): Promise<Module>

  /**
   * As `load()`, but synchronous, for a caller that cannot await one. The protocol is driven
   * through its `*Sync` methods and so must answer synchronously. A module with a top-level
   * `await` is returned as soon as its evaluation is started rather than once it has finished, as
   * there is nothing to wait on it here.
   * @param url - The WHATWG `URL` of the module to load.
   * @param opts - Load options; may carry a `source` to load directly instead of reading it through
   * the protocol.
   * @returns The loaded `Module`, reusing the cached instance if `url` was already loaded.
   * @throws {UNEXPECTED_PROMISE} the protocol answered asynchronously.
   * @throws {TYPE_INCOMPATIBLE} a module is already cached for `url` with a type incompatible with
   * the requested `type`.
   */
  export function loadSync(url: URL, opts: LoadOptions): Module
  export function loadSync(url: URL, source?: Buffer | string | null, opts?: LoadOptions): Module

  /**
   * Resolve the module `specifier` relative to the `parentURL`. `specifier` is a string and
   * `parentURL` is a WHATWG `URL`. `condition` is an optional import condition, defaulting to
   * `'require'`; pass `'asset'` to resolve an asset rather than a module.
   * @param specifier - The module specifier to resolve.
   * @param parentURL - The WHATWG `URL` to resolve `specifier` relative to.
   * @param condition - The import condition to resolve for.
   * @param opts - Resolution options.
   * @returns The WHATWG `URL` that `specifier` resolves to.
   * @throws {MODULE_NOT_FOUND} no module matching `specifier` could be found relative to
   * `parentURL`.
   * @throws {ASSET_NOT_FOUND} the `'asset'` condition was used and no matching asset could be
   * found.
   * @throws {ADDON_NOT_FOUND} the `'addon'` condition was used and no matching addon could be
   * found.
   * @throws {TypeError} `specifier` is not a string, `parentURL` is not a WHATWG `URL`, or
   * `condition` is not a known condition.
   */
  export function resolve(specifier: string, parentURL: URL, opts?: ResolveOptions): Promise<URL>
  export function resolve(
    specifier: string,
    parentURL: URL,
    condition: Condition,
    opts?: ResolveOptions
  ): Promise<URL>

  /**
   * As `resolve()`, but synchronous, for a caller that cannot await one. The protocol is driven
   * through its `*Sync` methods and so must answer synchronously.
   * @param specifier - The module specifier to resolve.
   * @param parentURL - The WHATWG `URL` to resolve `specifier` relative to.
   * @param condition - The import condition to resolve for.
   * @param opts - Resolution options.
   * @returns The WHATWG `URL` that `specifier` resolves to.
   * @throws {UNEXPECTED_PROMISE} the protocol answered asynchronously.
   * @throws {MODULE_NOT_FOUND} no module matching `specifier` could be found relative to
   * `parentURL`.
   * @throws {TypeError} `specifier` is not a string, `parentURL` is not a WHATWG `URL`, or
   * `condition` is not a known condition.
   */
  export function resolveSync(specifier: string, parentURL: URL, opts?: ResolveOptions): URL
  export function resolveSync(
    specifier: string,
    parentURL: URL,
    condition: Condition,
    opts?: ResolveOptions
  ): URL

  /**
   * Create a preconfigured `require()` bound to `parentURL`, so specifiers resolve and load
   * relative to it.
   * @param parentURL - The parent URL that the returned `require()` resolves and loads specifiers
   * relative to.
   * @param opts - Options for the created `require()`, such as its `protocol` and `cache`.
   * @returns A `require()` bound to `parentURL`, with `main`, `cache`, `resolve`, `addon`, and
   * `asset` attached.
   * @throws {TypeError} `parentURL` is neither a string nor a WHATWG `URL`, and no `referrer` was
   * given.
   */
  export function createRequire(parentURL: string | URL, opts?: CreateRequireOptions): Require
}

export = Module
