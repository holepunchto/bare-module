import URL from 'bare-url'
import Buffer from 'bare-buffer'

declare const kind: unique symbol

interface ModuleProtocol {
  /**
   * Resolve a module `URL` to the `URL` that should be linked. The default implementation returns
   * `url` unchanged.
   * @param url - The `URL` to resolve.
   * @returns The resolved `URL`. A promise must not be returned during synchronous linking.
   */
  resolve(url: URL): URL | Promise<URL>

  resolveSync(url: URL): URL

  /**
   * Return whether the URL exists.
   * @param url - The `URL` to check for existence.
   * @returns Whether `url` exists. The default implementation returns `false`.
   */
  exists(url: URL): boolean | Promise<boolean>

  existsSync(url: URL): boolean

  /**
   * Return the source code of a URL, represented as a string or buffer.
   * @param url - The `URL` to read.
   * @returns The source of `url` as a `Buffer` or `string`, or `null` if it does not exist.
   */
  read(url: URL): Buffer | string | null | Promise<Buffer | string | null>

  readSync(url: URL): Buffer | string | null

  list(url: URL): Iterable<URL> | AsyncIterable<URL>

  listSync(url: URL): Iterable<URL>

  /**
   * Create a new protocol that uses this protocol as its context, overriding the given `methods`.
   * @param methods - Protocol method overrides for the new protocol.
   * @returns A new `ModuleProtocol` that uses this protocol as its context, with `methods`
   * overriding.
   */
  extend(methods: Partial<ModuleProtocol>): ModuleProtocol

  /** The version of the protocol interface. The same value as on the class. */
  readonly [kind]: number
}

declare class ModuleProtocol {
  /**
   * @param methods - Protocol method overrides; any of `resolve`, `resolveSync`, `exists`,
   * `existsSync`, `read`, `readSync`, `list`, or `listSync`.
   * @param context - An existing protocol to fall back to for any method not provided in `methods`.
   */
  constructor(methods?: Partial<ModuleProtocol>, context?: ModuleProtocol)

  /**
   * The version of the protocol interface, read through the well known symbol
   * `Symbol.for('bare.module.protocol.kind')`. An instance reports the same version as its class. A
   * protocol travels between module systems, which may be different copies of this one, so a
   * module system reads this to tell a protocol it can use from one it cannot.
   */
  static readonly [kind]: number

  /**
   * @param value - The value to test.
   * @returns Whether `value` is a protocol of the same version as this one, whichever copy of
   * `bare-module` created it.
   */
  static isProtocol(value: unknown): boolean
}

export = ModuleProtocol
