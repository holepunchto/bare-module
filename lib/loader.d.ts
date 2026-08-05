import Buffer from 'bare-buffer'
import URL from 'bare-url'
import { Builtins, Conditions, ImportsMap, ResolutionsMap } from 'bare-module-resolve'
import { Attributes, Cache, Module } from '..'
import Protocol from './protocol'

interface ModuleLoader {
  readonly addons: URL[]
  readonly assets: URL[]
  /** A map of builtin module specifiers mapped to the loaded module. */
  readonly builtins: Builtins
  /** A cache of loaded modules for this module. Defaults to `Module.cache`. */
  readonly cache: Cache
  /** An array of conditions used to resolve dependencies while loading the module. See [Conditional exports](https://github.com/holepunchto/bare-module#conditional-exports) for possible values. */
  readonly conditions: Conditions
  /** The assumed type of a module without a `type` using an ambiguous extension, such as `.js`. See `Module.constants.types` for possible values. */
  readonly defaultType: number
  /** The import map when the module was loaded. */
  readonly imports: ImportsMap
  /** The module representing the entry script where the program was launched. */
  readonly main: Module
  readonly protocol: Protocol
  /** A map of preresolved imports with keys being serialized parent URLs and values being `"imports"` maps. */
  readonly resolutions: ResolutionsMap

  get(url: URL): Module | null

  link(entry: URL, source?: Buffer | string | null, opts?: LinkOptions): Promise<Module>
  linkSync(entry: URL, source?: Buffer | string | null, opts?: LinkOptions): Module

  import(entry: URL, opts?: ImportOptions): Promise<unknown>
  importSync(entry: URL, opts?: ImportOptions): unknown
}

declare class ModuleLoader {
  constructor(opts?: ModuleLoader.Options)
}

declare namespace ModuleLoader {
  export interface Options {
    builtins?: Builtins
    cache?: Cache | boolean
    concurrency?: number
    defaultType?: number
    imports?: ImportsMap
    protocol?: Protocol
    resolutions?: ResolutionsMap
  }

  export interface LinkOptions {
    /** The import attributes, for example the `{ type: 'json' }` in `import foo from 'foo' with { type: 'json' }`. */
    attributes?: Attributes
    conditions?: Conditions
  }

  export interface ImportOptions extends LinkOptions {}
}

export = ModuleLoader
