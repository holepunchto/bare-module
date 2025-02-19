import Buffer from 'bare-buffer'
import URL from 'bare-url'
import Bundle from 'bare-bundle'
import {
  type Builtins,
  type Conditions,
  type ImportsMap,
  type ResolutionsMap
} from 'bare-module-resolve'
import ModuleProtocol from './lib/protocol'
import constants from './lib/constants'

type CacheMap = { [href: string]: Module }

type Attributes = { type: Lowercase<keyof typeof constants.types> }

interface ModuleOptions {
  attributes?: Attributes
  builtins?: Builtins
  cache?: CacheMap
  conditions?: Conditions
  defaultType?: number
  imports?: ImportsMap
  main?: Module
  protocol?: ModuleProtocol
  referrer?: Module
  resolutions?: ResolutionsMap
  type?: number
}

interface ModuleLoadOptions extends ModuleOptions {
  isDynamicImport?: boolean
  isImport?: boolean
}

interface ModuleResolveOptions extends ModuleOptions {
  isImport?: boolean
}

interface Module {
  readonly builtins: Builtins
  readonly cache: CacheMap
  readonly conditions: Conditions
  readonly defaultType: number
  readonly dirnamedirname: string
  exports: unknown
  readonly filename: string
  readonly id: string
  readonly imports: ImportsMap
  readonly main: Module
  readonly path: string
  readonly protocol: ModuleProtocol
  readonly resolutions: ResolutionsMap
  readonly type: number
  readonly url: URL

  destroy(): void
}

declare class Module {
  static readonly protocol: ModuleProtocol
  static readonly cache: CacheMap

  static load(url: URL, opts: ModuleLoadOptions): Module
  static load(
    url: URL,
    source?: Buffer | string,
    opts?: ModuleLoadOptions
  ): Module

  static resolve(
    specifier: string,
    parentURL: URL,
    opts?: ModuleResolveOptions
  ): URL

  static asset(specifier: string, parentURL: URL, opts?: ModuleOptions): URL

  constructor(url: URL)
}

declare namespace Module {
  export {
    type Attributes,
    type CacheMap,
    type ModuleOptions,
    type ModuleLoadOptions,
    type ModuleResolveOptions
  }

  export { ModuleProtocol as Protocol, Bundle, constants }

  export const builtinModules: Module[]

  export function isBuiltin(): boolean

  export interface CreateRequireOptions extends ModuleOptions {
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
    cache: CacheMap
    resolve: (specifier: string, parentURL?: URL) => string
    addon: RequireAddon
    asset: (specifier: string, parentURL?: URL) => string
  }

  export function createRequire(
    parentURL: string | URL,
    opts?: CreateRequireOptions
  ): Require
}

export = Module
