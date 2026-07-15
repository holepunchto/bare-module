import Buffer from 'bare-buffer'
import URL from 'bare-url'
import Bundle from 'bare-bundle'
import {
  type Builtins,
  type Conditions,
  type ImportsMap,
  type ResolutionsMap
} from 'bare-module-resolve'
import Protocol from './lib/protocol'
import constants from './lib/constants'

/** A map of module URL `href`s to loaded modules. */
interface Cache {
  [href: string]: Module
}

/** Import attributes instructing how a module should be loaded. */
interface Attributes {
  /** How the module should be loaded: one of `'script'`, `'module'`, `'json'`, `'bundle'`, `'addon'`, `'binary'`, or `'text'`. */
  type: Lowercase<keyof typeof constants.type>
}

interface Options {
  /** The import attributes, e.g. the `{ type: 'json' }` in `import foo from 'foo' with { type: 'json' }`. */
  attributes?: Attributes
  /** A map of builtin module specifiers mapped to the loaded module. */
  builtins?: Builtins
  /** The cache to load modules into; defaults to `Module.cache`. Pass `false` to use a throw-away cache scoped to the load and its module graph. */
  cache?: Cache | boolean
  /** The supported import conditions. `"default"` is always recognized. */
  conditions?: Conditions
  /** The assumed type of a module without a `type` using an ambiguous extension, such as `.js`. See `Module.constants.types` for possible values. */
  defaultType?: number
  /** A default `"imports"` map to apply to all specifiers; follows the same syntax and rules as the `"imports"` field in `package.json`. */
  imports?: ImportsMap
  /** The module representing the entry script where the program was launched. */
  main?: Module
  /** The `ModuleProtocol` for resolving the specifier; defaults to the referrer's protocol if defined, otherwise `Module.protocol`. */
  protocol?: Protocol
  /** The referring module. */
  referrer?: Module
  /** A map of preresolved imports with keys being serialized parent URLs and values being `"imports"` maps. */
  resolutions?: ResolutionsMap
  /** The type of the module. See `Module.constants.types` for possible values. */
  type?: number
}

interface LoadOptions extends Options {
  /** Whether the module is loaded via `import()`. */
  isDynamicImport?: boolean
  /** Whether the module is loaded via `import` or `import()`. */
  isImport?: boolean
}

interface ResolveOptions extends Options {
  /** Whether the module is resolved via `import` or `import()`. */
  isImport?: boolean
}

interface Module {
  readonly builtins: Builtins
  /** A cache of loaded modules for this module. Defaults to `Module.cache`. */
  readonly cache: Cache
  /** An array of conditions used to resolve dependencies while loading the module. See [Conditional exports](https://github.com/holepunchto/bare-module#conditional-exports) for possible values. */
  readonly conditions: Conditions
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
  readonly main: Module
  readonly path: string
  /** The `ModuleProtocol` class for resolving, reading and loading modules. See [Protocols](https://github.com/holepunchto/bare-module#protocols) for usage. */
  readonly protocol: Protocol
  readonly resolutions: ResolutionsMap
  readonly type: number
  /** The WHATWG `URL` identifier of the module. */
  readonly url: URL
}

declare class Module {
  static readonly protocol: Protocol
  static readonly cache: Cache

  /**
   * Load a module with the provided `url`. `url` is a WHATWG `URL`. If provided, the `source` will be passed to the matching `extension` for the `url`.
   * @param url - The WHATWG `URL` of the module to load.
   * @param opts - Load options; may carry a `source` to load directly instead of reading it through the protocol.
   * @returns The loaded `Module`, reusing the cached instance if `url` was already loaded.
   * @throws {TYPE_INCOMPATIBLE} a module is already cached for `url` with a type incompatible with the requested `type`.
   */
  static load(url: URL, opts: LoadOptions): Module
  static load(url: URL, source?: Buffer | string | Bundle | null, opts?: LoadOptions): Module

  /**
   * Resolve the module `specifier` relative to the `parentURL`. `specifier` is a string and `parentURL` is a WHATWG `URL`.
   * @param specifier - The module specifier to resolve.
   * @param parentURL - The WHATWG `URL` to resolve `specifier` relative to.
   * @param opts - Resolution options.
   * @returns The WHATWG `URL` that `specifier` resolves to.
   * @throws {MODULE_NOT_FOUND} no module matching `specifier` could be found relative to `parentURL`.
   * @throws {TypeError} `specifier` is not a string.
   */
  static resolve(specifier: string, parentURL: URL, opts?: ResolveOptions): URL

  /**
   * Get the asset URL by resolving `specifier` relative to `parentURL`. `specifier` is a string and `parentURL` is a WHATWG `URL`.
   * @param specifier - The asset specifier to resolve.
   * @param parentURL - The WHATWG `URL` to resolve `specifier` relative to.
   * @param opts - Resolution options.
   * @returns The WHATWG `URL` of the resolved asset.
   * @throws {ASSET_NOT_FOUND} no asset matching `specifier` could be found relative to `parentURL`.
   * @throws {TypeError} `specifier` is not a string.
   */
  static asset(specifier: string, parentURL: URL, opts?: Options): URL

  /**
   * @param url - The WHATWG `URL` identifying the module.
   */
  constructor(url: URL)
}

declare namespace Module {
  export {
    type Attributes,
    type Cache,
    type Options,
    type LoadOptions,
    type ResolveOptions,
    Protocol,
    constants
  }

  /** Always an empty array; provided for Node.js compatibility. */
  export const builtinModules: Module[]

  /** Always returns `false`; provided for Node.js compatibility. */
  export function isBuiltin(): boolean

  export interface CreateRequireOptions extends Options {
    /** The module to become the `referrer` for the returned `require()`; defaults to a new module instance created from `parentURL`. */
    module?: Module
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

  /**
   * Create a preconfigured `require()` bound to `parentURL`, so specifiers resolve and load relative to it.
   * @param parentURL - The parent URL that the returned `require()` resolves and loads specifiers relative to.
   * @param opts - Options for the created `require()`, such as its `protocol` and `cache`.
   * @returns A `require()` bound to `parentURL`, with `main`, `cache`, `resolve`, `addon`, and `asset` attached.
   */
  export function createRequire(parentURL: string | URL, opts?: CreateRequireOptions): Require
}

export = Module
