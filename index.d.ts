import Buffer from 'bare-buffer'
import URL from 'bare-url'
import { Builtins, Conditions, ImportsMap, ResolutionsMap } from 'bare-module-resolve'
import { constants } from 'bare-module-traverse'
import Protocol from './lib/protocol'
import Loader from './lib/loader'

/** A map of module URL `href`s to loaded modules. */
interface Cache {
  [href: string]: Module
}

/** Import attributes instructing how a module should be loaded. */
interface Attributes {
  /** How the module should be loaded: one of `'script'`, `'module'`, `'json'`, `'bundle'`, `'addon'`, `'binary'`, or `'text'`. */
  type: Lowercase<keyof typeof constants>
}

interface Module {
  /** A map of builtin module specifiers mapped to the loaded module. */
  readonly builtins: Builtins
  /** A cache of loaded modules for this module. Defaults to `Module.cache`. */
  readonly cache: Cache
  /** An array of conditions used to resolve dependencies while loading the module. See [Conditional exports](https://github.com/holepunchto/bare-module#conditional-exports) for possible values. */
  readonly conditions: Conditions
  /** The assumed type of a module without a `type` using an ambiguous extension, such as `.js`. See `Module.constants.types` for possible values. */
  readonly defaultType: number
  /** The directory portion of `module.url`. */
  readonly dirname: string
  /** The exports from the module. */
  exports: unknown
  /** The file portion of `module.url`. */
  readonly filename: string
  readonly id: string
  /** The import map when the module was loaded. */
  readonly imports: ImportsMap
  /** The module representing the entry script where the program was launched. */
  readonly main: Module
  readonly path: string
  /** The `ModuleProtocol` class for resolving, reading and loading modules. See [Protocols](https://github.com/holepunchto/bare-module#protocols) for usage. */
  readonly protocol: Protocol
  /** A map of preresolved imports with keys being serialized parent URLs and values being `"imports"` maps. */
  readonly resolutions: ResolutionsMap
  /** The type of the module. See `Module.constants.types` for possible values. */
  readonly type: number
  /** The WHATWG `URL` identifier of the module. */
  readonly url: URL
}

declare class Module {
  /**
   * @param url - The WHATWG `URL` identifying the module.
   */
  constructor(url: URL)
}

declare namespace Module {
  export { type Attributes, type Cache, Loader, Protocol, constants }

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
    /** The platform and architecture used when resolving addons, following the pattern `<platform>-<arch>[-<environment>]`. */
    host: string
    /**
     * @returns The WHATWG `URL` that `specifier` resolves to.
     * @throws {MODULE_NOT_FOUND} no module matching `specifier` could be found relative to `parentURL`.
     * @throws {TypeError} `specifier` is not a string.
     */
    resolve: (specifier: string, parentURL?: URL) => unknown
  }

  /** The function returned by `Module.createRequire()`: resolves and loads modules relative to its parent URL, with `main`, `cache`, `resolve`, `addon`, and `asset` attached. */
  export interface Require {
    (parentURL: string | URL, opts?: RequireOptions): unknown
    main: Module
    cache: Cache
    resolve: (specifier: string, parentURL?: URL) => string
    /**
     * @param url - The resolved addon `URL` to post-process.
     */
    addon: RequireAddon
    /**
     * @returns The WHATWG `URL` of the resolved asset.
     * @throws {ASSET_NOT_FOUND} no asset matching `specifier` could be found relative to `parentURL`.
     * @throws {TypeError} `specifier` is not a string.
     */
    asset: (specifier: string, parentURL?: URL) => string
  }

  export const protocol: Protocol
  export const cache: Cache

  /**
   * Load a module with the provided `url`. `url` is a WHATWG `URL`. If provided, the `source` will be passed to the matching `extension` for the `url`.
   * @param url - The WHATWG `URL` of the module to load.
   * @param opts - Load options; may carry a `source` to load directly instead of reading it through the protocol.
   * @returns The loaded `Module`, reusing the cached instance if `url` was already loaded.
   * @throws {TYPE_INCOMPATIBLE} a module is already cached for `url` with a type incompatible with the requested `type`.
   */
  export function load(url: URL, opts: LoadOptions): Promise<Module>
  export function load(
    url: URL,
    source?: Buffer | string | null,
    opts?: LoadOptions
  ): Promise<Module>

  /**
   * Resolve the module `specifier` relative to the `parentURL`. `specifier` is a string and `parentURL` is a WHATWG `URL`.
   * @param specifier - The module specifier to resolve.
   * @param parentURL - The WHATWG `URL` to resolve `specifier` relative to.
   * @param opts - Resolution options.
   * @returns The WHATWG `URL` that `specifier` resolves to.
   * @throws {MODULE_NOT_FOUND} no module matching `specifier` could be found relative to `parentURL`.
   * @throws {TypeError} `specifier` is not a string.
   */
  export function resolve(specifier: string, parentURL: URL, opts?: ResolveOptions): Promise<URL>
  export function resolve(
    specifier: string,
    parentURL: URL,
    condition: string,
    opts?: ResolveOptions
  ): Promise<URL>

  /**
   * Get the asset URL by resolving `specifier` relative to `parentURL`. `specifier` is a string and `parentURL` is a WHATWG `URL`.
   * @param specifier - The asset specifier to resolve.
   * @param parentURL - The WHATWG `URL` to resolve `specifier` relative to.
   * @param opts - Resolution options.
   * @returns The WHATWG `URL` of the resolved asset.
   * @throws {ASSET_NOT_FOUND} no asset matching `specifier` could be found relative to `parentURL`.
   * @throws {TypeError} `specifier` is not a string.
   */
  export function asset(specifier: string, parentURL: URL, opts?: ResolveOptions): Promise<URL>

  /**
   * Create a preconfigured `require()` bound to `parentURL`, so specifiers resolve and load relative to it.
   * @param parentURL - The parent URL that the returned `require()` resolves and loads specifiers relative to.
   * @param opts - Options for the created `require()`, such as its `protocol` and `cache`.
   * @returns A `require()` bound to `parentURL`, with `main`, `cache`, `resolve`, `addon`, and `asset` attached.
   */
  export function createRequire(parentURL: string | URL, opts?: CreateRequireOptions): Require
}

export = Module
