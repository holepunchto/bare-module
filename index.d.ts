import Buffer from 'bare-buffer'
import URL from 'bare-url'
import { Builtins, Conditions, ImportsMap, ResolutionsMap } from 'bare-module-resolve'
import { constants } from 'bare-module-traverse'
import Protocol from './lib/protocol'
import Loader from './lib/loader'

interface Cache {
  [href: string]: Module
}

interface Attributes {
  type: Lowercase<keyof typeof constants>
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
  constructor(url: URL)
}

declare namespace Module {
  export { type Attributes, type Cache, Loader, Protocol, constants }

  export interface LoadOptions extends Loader.Options, Loader.LinkOptions {
    referrer?: Module
  }

  export interface ResolveOptions extends Loader.Options {
    referrer?: Module
  }

  export interface CreateRequireOptions extends Loader.Options {
    referrer?: Module
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

  export const protocol: Protocol
  export const cache: Cache

  export function load(url: URL, opts: LoadOptions): Promise<Module>
  export function load(
    url: URL,
    source?: Buffer | string | null,
    opts?: LoadOptions
  ): Promise<Module>

  export function resolve(specifier: string, parentURL: URL, opts?: ResolveOptions): Promise<URL>
  export function resolve(
    specifier: string,
    parentURL: URL,
    condition: string,
    opts?: ResolveOptions
  ): Promise<URL>

  export function asset(specifier: string, parentURL: URL, opts?: ResolveOptions): Promise<URL>

  export function createRequire(parentURL: string | URL, opts?: CreateRequireOptions): Require
}

export = Module
