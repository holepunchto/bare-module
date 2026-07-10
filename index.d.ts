import Buffer from 'bare-buffer'
import URL from 'bare-url'
import Bundle from 'bare-bundle'
import {
  type Builtins,
  type Conditions,
  type ImportsMap,
  type ResolutionsMap
} from 'bare-module-resolve'
import { constants } from 'bare-module-traverse'
import Protocol from './lib/protocol'

interface Cache {
  [href: string]: Module
}

interface Attributes {
  type: Lowercase<keyof typeof constants>
}

interface Options {
  attributes?: Attributes
  builtins?: Builtins
  cache?: Cache | boolean
  conditions?: Conditions
  defaultType?: number
  imports?: ImportsMap
  main?: Module
  protocol?: Protocol
  referrer?: Module
  resolutions?: ResolutionsMap
  type?: number
}

interface LoadOptions extends Options {
  isDynamicImport?: boolean
  isImport?: boolean
}

interface ResolveOptions extends Options {
  isImport?: boolean
}

interface Module {
  readonly builtins: Builtins
  readonly cache: Cache
  readonly conditions: Conditions
  readonly defaultType: number
  readonly dirname: string
  exports: unknown
  readonly filename: string
  readonly id: string
  readonly imports: ImportsMap
  readonly main: Module
  readonly path: string
  readonly protocol: Protocol
  readonly resolutions: ResolutionsMap
  readonly type: number
  readonly url: URL
}

declare class Module {
  static readonly protocol: Protocol
  static readonly cache: Cache

  static load(url: URL, opts: LoadOptions): Promise<Module>
  static load(
    url: URL,
    source?: Buffer | string | Bundle | null,
    opts?: LoadOptions
  ): Promise<Module>

  static resolve(specifier: string, parentURL: URL, opts?: ResolveOptions): Promise<URL>
  static resolve(
    specifier: string,
    parentURL: URL,
    condition: string,
    opts?: ResolveOptions
  ): Promise<URL>

  static asset(specifier: string, parentURL: URL, opts?: Options): Promise<URL>

  constructor(url: URL)
}

interface Loader {
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

  link(entry: URL, source?: Buffer | string | null, opts?: LoadOptions): Promise<Module>
  linkSync(entry: URL, source?: Buffer | string | null, opts?: LoadOptions): Module

  import(entry: URL, opts?: LoadOptions): Promise<unknown>
  importSync(entry: URL, opts?: LoadOptions): unknown
}

declare class Loader {
  constructor(opts?: Options)
}

declare namespace Module {
  export {
    type Attributes,
    type Cache,
    type Options,
    type LoadOptions,
    type ResolveOptions,
    Loader,
    Protocol,
    constants
  }

  export interface CreateRequireOptions extends Options {
    module?: Module
  }

  export interface RequireOptions {
    with?: Attributes
  }

  export interface RequireAddon {
    (specifier?: string, parentURL?: URL): string
    host: string
    resolve: (specifier: string, parentURL?: URL) => unknown
  }

  export interface Require {
    (parentURL: string | URL, opts?: RequireOptions): unknown
    main: Module
    cache: Cache
    resolve: (specifier: string, parentURL?: URL) => string
    addon: RequireAddon
    asset: (specifier: string, parentURL?: URL) => string
  }

  export function createRequire(parentURL: string | URL, opts?: CreateRequireOptions): Require
}

export = Module
