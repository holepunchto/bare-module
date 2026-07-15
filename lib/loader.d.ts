import Buffer from 'bare-buffer'
import URL from 'bare-url'
import { Builtins, Conditions, ImportsMap, ResolutionsMap } from 'bare-module-resolve'
import { Attributes, Cache, Module } from '..'
import Protocol from './protocol'

interface ModuleLoader {
  readonly addons: URL[]
  readonly assets: URL[]
  readonly builtins: Builtins
  readonly cache: Cache
  readonly conditions: Conditions
  readonly defaultType: number
  readonly imports: ImportsMap
  readonly main: Module
  readonly protocol: Protocol
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
    attributes?: Attributes
    conditions?: Conditions
  }

  export interface ImportOptions extends LinkOptions {}
}

export = ModuleLoader
