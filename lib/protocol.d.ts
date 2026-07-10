import URL from 'bare-url'
import Buffer from 'bare-buffer'

interface ModuleProtocol {
  resolve(url: URL): URL | Promise<URL>

  exists(url: URL): boolean | Promise<boolean>

  read(url: URL): Buffer | string | null | Promise<Buffer | string | null>

  list(url: URL): Iterable<URL> | AsyncIterable<URL>

  extend(methods: Partial<ModuleProtocol>): ModuleProtocol
}

declare class ModuleProtocol {
  constructor(methods?: Partial<ModuleProtocol>, context?: ModuleProtocol)
}

export = ModuleProtocol
