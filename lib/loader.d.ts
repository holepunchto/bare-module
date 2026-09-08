import Buffer from 'bare-buffer'
import URL from 'bare-url'
import { Builtins, ImportsMap, ResolutionsMap } from 'bare-module-resolve'
import { Attributes, Cache, Module } from '..'
import Protocol from './protocol'

interface ModuleLoader {
  /**
   * The cache of loaded modules that the loader was created with, shared with every module of its
   * graph.
   */
  readonly cache: Cache
  /** The module representing the entry script where the program was launched. */
  readonly main: Module
  /**
   * The `ModuleProtocol` modules are resolved and read through, shared with every module of the
   * loader's graph.
   */
  readonly protocol: Protocol

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
    /**
     * The import attributes, for example the `{ type: 'json' }` in `import foo from 'foo' with {
     * type: 'json' }`.
     */
    attributes?: Attributes
  }

  export interface ImportOptions extends LinkOptions {}
}

export = ModuleLoader
