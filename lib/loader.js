const Semaphore = require('promaphore')
const traverse = require('bare-module-traverse')
const { startsWithWindowsDriveLetter } = require('bare-module-resolve')
const lex = require('bare-module-lexer')
const { isURL, pathToFileURL } = require('bare-url')
const { urlToPath } = require('./url')
const ModuleProtocol = require('./protocol')
const ModuleSource = require('./source')
const ModuleContext = require('./context')
const SourceTextModule = require('./module/source-text')
const ScriptModule = require('./module/script')
const JSONModule = require('./module/json')
const TextModule = require('./module/text')
const BinaryModule = require('./module/binary')
const AddonModule = require('./module/addon')
const BundleModule = require('./module/bundle')
const BuiltinModule = require('./module/builtin')
const errors = require('./errors')

const type = traverse.constants
const engines = Bare.versions

const defaultConditions = ['bare', 'node', ...Bare.Addon.host.split('-')]
const defaultCache = Object.create(null)
const defaultResolutions = Object.create(null)
const defaultProtocol = new ModuleProtocol()

function cacheFor(cache) {
  if (cache === true) return defaultCache

  if (typeof cache === 'object' && cache !== null) return cache

  return Object.create(null)
}

function resolutionsFor(cache, resolutions) {
  if (typeof resolutions === 'object' && resolutions !== null) return resolutions

  return cache === true ? defaultResolutions : Object.create(null)
}

const recordClasses = {
  [type.MODULE]: SourceTextModule,
  [type.SCRIPT]: ScriptModule,
  [type.JSON]: JSONModule,
  [type.TEXT]: TextModule,
  [type.BINARY]: BinaryModule,
  [type.ADDON]: AddonModule,
  [type.BUNDLE]: BundleModule
}

const typeByAttribute = {
  module: type.MODULE,
  script: type.SCRIPT,
  json: type.JSON,
  text: type.TEXT,
  binary: type.BINARY,
  addon: type.ADDON,
  bundle: type.BUNDLE
}

module.exports = class ModuleLoader {
  constructor(opts = {}) {
    const {
      protocol = null,
      builtins = null,
      defaultType = 0,
      imports = null,
      resolutions = null,
      cache,
      concurrency = 0
    } = opts

    this._protocol = protocol || defaultProtocol
    this._defaultType = defaultType
    this._conditions = defaultConditions
    this._builtins = builtins
    this._imports = imports
    this._concurrency = concurrency
    this._main = null
    this._cache = cacheFor(cache)
    this._resolutions = resolutionsFor(cache, resolutions)
    this._manifests = Object.create(null)
    this._artifacts = { addons: [], assets: [] }
    this._bundles = []
    this._visited = new Set()
    this._uninstantiated = []
    this._pending = null

    ModuleContext.setDefaultLoader(this)
  }

  get protocol() {
    return this._protocol
  }

  get builtins() {
    return this._builtins
  }

  get cache() {
    return this._cache
  }

  get main() {
    return this._main
  }

  get imports() {
    return this._imports
  }

  get resolutions() {
    return this._resolutions
  }

  get defaultType() {
    return this._defaultType
  }

  get conditions() {
    return this._conditions.slice()
  }

  get addons() {
    return this._artifacts.addons
  }

  get assets() {
    return this._artifacts.assets
  }

  get(url) {
    return this._cache[url.href] || null
  }

  async link(entry, source = null, opts = {}) {
    if (entry.protocol === 'builtin:') this._lookup(entry)
    else await this._linkAsync(this._root(entry, source, opts), this._protocolFor(entry))

    this._instantiate()

    return this._entry(entry, opts)
  }

  linkSync(entry, source = null, opts = {}) {
    if (entry.protocol === 'builtin:') this._lookup(entry)
    else this._linkSync(this._root(entry, source, opts), this._protocolFor(entry))

    this._instantiate()

    return this._entry(entry, opts)
  }

  async import(entry, opts = {}) {
    const record = await this.link(entry, null, opts)

    await this._evaluate(record)

    return record.exports
  }

  importSync(entry, opts = {}) {
    return this.linkSync(entry, null, opts)._evaluate()
  }

  [Symbol.for('bare.inspect')]() {
    return {
      __proto__: { constructor: ModuleLoader },

      defaultType: this.defaultType,
      main: this.main,
      addons: this.addons,
      assets: this.assets
    }
  }

  async _evaluate(record) {
    const pending = (this._pending = [])

    try {
      record._evaluate()
    } finally {
      this._pending = null
    }

    if (pending.length > 0) await Promise.all(pending)

    return record
  }

  _protocolFor(url) {
    const bundle = this._bundleFor(url)

    if (bundle === null) return this._protocol

    return this._protocol.extend({
      resolve(context, url) {
        return bundle.exists(url.href) ? url : context.resolve(url)
      },

      exists(context, url) {
        return bundle.exists(url.href) || context.exists(url)
      },

      read(context, url) {
        return bundle.read(url.href) || context.read(url)
      },

      list(context, url) {
        return [] // TODO
      }
    })
  }

  _bundleFor(url) {
    for (const bundle of this._bundles) {
      if (bundle.exists(url.href)) return bundle
    }

    return null
  }

  _lookup(url) {
    if (url === null) return null

    const record = this._cache[url.href]

    if (record !== undefined) return record

    if (url.protocol === 'builtin:') return this._builtinRecord(url)

    return null
  }

  _builtinRecord(url) {
    const name = url.pathname

    if (this._builtins === null || name in this._builtins === false) return null

    const source = new ModuleSource({
      url,
      type: 0,
      source: Buffer.alloc(0),
      imports: {},
      lexer: { imports: [], exports: [] }
    })

    const record = new BuiltinModule(this, source, this._builtins[name])

    this._cache[url.href] = record

    this._uninstantiated.push(record)

    return record
  }

  _entry(entry, opts) {
    const record = this._lookup(traverse.alias(entry, opts))

    if (this._main === null) this._main = record

    return record
  }

  _root(entry, source, opts) {
    opts = {
      defaultType: this._defaultType || type.SCRIPT,
      imports: this._imports,
      engines,
      ...opts,
      resolve: traverse.resolve.bare
    }

    if (this._builtins !== null) opts.builtins = Object.keys(this._builtins)

    const attributes = opts.attributes || {}

    return traverse.module(entry, source, attributes, this._artifacts, this._visited, opts)
  }

  *_drive(generator, onChild) {
    let next = generator.next()
    let probed = null

    while (next.done !== true) {
      const value = next.value

      if (value.module) {
        const source =
          value.artifact || value.module.href === probed ? null : yield { module: value.module }

        probed = null

        next = generator.next(source)
      } else if (value.probe) {
        const exists = yield { probe: value.probe }

        probed = exists ? value.probe.href : null

        next = generator.next(exists)
      } else if (value.resolution) {
        next = generator.next(yield { resolution: value.resolution })
      } else if (value.prefix) {
        next = generator.next(yield { prefix: value.prefix })
      } else if (value.links) {
        yield { links: value.links }

        next = generator.next()
      } else if (value.children) {
        onChild(value.children, value.deferred)

        next = generator.next()
      } else {
        this._ingest(value.dependency)

        next = generator.next()
      }
    }
  }

  _linkSync(root, protocol) {
    const queue = [root]
    const deferred = []

    const onChild = (children, isDeferred) => {
      if (isDeferred) deferred.push(children)
      else queue.push(children)
    }

    const driveLink = (link) => driveSync(this._drive(link, onChild), protocol, driveLink)

    while (queue.length > 0 || deferred.length > 0) {
      const generator = queue.length > 0 ? queue.pop() : deferred.shift()

      driveSync(this._drive(generator, onChild), protocol, driveLink)
    }
  }

  async _linkAsync(root, protocol) {
    const semaphore = this._concurrency > 0 ? new Semaphore(this._concurrency) : null

    const deferred = []

    const collect = async (generator) => {
      const queue = []

      const onChild = (children, isDeferred) => {
        if (isDeferred) deferred.push(children)
        else queue.push(children)
      }

      const driveLink = (link) =>
        driveAsync(this._drive(link, onChild), protocol, driveLink, semaphore)

      await driveAsync(this._drive(generator, onChild), protocol, driveLink, semaphore)

      if (queue.length > 0) await Promise.all(queue.map(collect))
    }

    await collect(root)

    while (deferred.length > 0) {
      await Promise.all(deferred.splice(0, deferred.length).map(collect))
    }
  }

  _linkBundle(bundle) {
    this._bundles.push(bundle)

    const protocol = this._protocol.extend({
      exists(context, url) {
        if (bundle.exists(url.href)) return true

        const exists = context.exists(url)

        return isThenable(exists) ? false : exists
      },

      read(context, url) {
        const source = bundle.read(url.href)

        if (source) return source

        const fallback = context.read(url)

        return isThenable(fallback) ? null : fallback
      }
    })

    this._linkSync(
      this._root(new URL(bundle.main), null, {
        imports: bundle.imports,
        resolutions: bundle.resolutions
      }),
      protocol
    )
  }

  _ingest(dependency) {
    const existing = this._cache[dependency.url.href]

    if (existing) return existing

    const Class = recordClasses[dependency.type]

    if (Class === undefined) {
      throw errors.UNKNOWN_MODULE_TYPE(
        `Module type '${dependency.type}' at '${dependency.url.href}' is not supported`
      )
    }

    const record = new Class(this, new ModuleSource(dependency))

    this._cache[dependency.url.href] = record

    this._uninstantiated.push(record)

    this._resolutions[dependency.url.href] = dependency.imports

    return record
  }

  _instantiate() {
    const pending = this._uninstantiated

    while (pending.length > 0) pending.pop()._instantiate()
  }

  _assertType(record, attributes) {
    if (!attributes || typeof attributes.type !== 'string') return

    const expected = typeByAttribute[attributes.type]

    if (expected !== undefined && expected !== record.type) {
      throw errors.TYPE_INCOMPATIBLE(
        `Module '${record.url.href}' is not of type '${attributes.type}'`
      )
    }
  }

  _createRequire(referrer) {
    const loader = this

    function require(specifier, opts = {}) {
      const attributes = opts && opts.with

      const url = referrer._resolve(specifier, 'require')

      let record = loader._lookup(url)

      if (record === null) {
        record = loader._requireSync(specifier, referrer.url, attributes, referrer.type)
      }

      loader._assertType(record, attributes)

      return record._evaluate()
    }

    require.main = loader.main
    require.cache = loader.cache

    require.resolve = function (specifier, parentURL = referrer.url) {
      return urlToPath(loader._resolveSync(specifier, toURL(parentURL, referrer.url), 'require'))
    }

    require.asset = function (specifier, parentURL = referrer.url) {
      return urlToPath(
        loader._resolveArtifact(referrer, specifier, 'asset', toURL(parentURL, referrer.url))
      )
    }

    require.addon = function (specifier = '.', parentURL = referrer.url) {
      return Bare.Addon.load(
        loader._resolveArtifact(referrer, specifier, 'addon', toURL(parentURL, referrer.url))
      ).exports
    }

    require.addon.resolve = function (specifier = '.', parentURL = referrer.url) {
      return urlToPath(
        loader._resolveArtifact(referrer, specifier, 'addon', toURL(parentURL, referrer.url))
      )
    }

    require.addon.host = Bare.Addon.host

    return require
  }

  _requireSync(specifier, parentURL, attributes = null, referrerType = 0) {
    const url = this._resolveSync(specifier, parentURL, 'require')

    let record = this._lookup(url)

    if (record === null) {
      this.linkSync(url, null, { attributes, referrerType })

      record = this.get(url)
    }

    if (record === null) {
      throw errors.MODULE_NOT_FOUND(`Cannot find module '${specifier}'`, specifier, parentURL)
    }

    return record
  }

  _cacheResolution(parentURL, specifier, condition, url) {
    let imports = this._resolutions[parentURL.href]

    if (typeof imports !== 'object' || imports === null) {
      imports = this._resolutions[parentURL.href] = Object.create(null)
    }

    if (specifier in imports) return

    imports[specifier] = { [condition]: url.href }
  }

  _resolveOptions() {
    const opts = { resolutions: this._resolutions, engines: Bare.versions }

    if (this._builtins !== null) opts.builtins = Object.keys(this._builtins)

    return opts
  }

  _resolveSync(specifier, parentURL, condition) {
    const protocol = this._protocolFor(parentURL)

    const resolver = traverse.resolve.bare(
      resolveEntry(specifier, condition),
      parentURL,
      this._resolveOptions()
    )

    let next = resolver.next()

    while (next.done !== true) {
      const value = next.value

      if (value.package) {
        const href = value.package.href

        let manifest = this._manifests[href]

        if (manifest === undefined) {
          const record = this.get(value.package)

          const source = record ? record._source.bytes : readSync(protocol, value.package)

          manifest = this._manifests[href] = source === null ? null : JSON.parse(source.toString())
        }

        next = resolver.next(manifest)
      } else {
        const url = value.resolution

        if (url.protocol === 'builtin:' || url.protocol === 'data:' || this.get(url) !== null) {
          this._cacheResolution(parentURL, specifier, condition, url)

          return url
        }

        if (protocol.existsSync(url)) {
          const resolution = protocol.resolveSync(url)

          this._cacheResolution(parentURL, specifier, condition, resolution)

          return resolution
        }

        next = resolver.next(false)
      }
    }

    throw condition === 'asset'
      ? errors.ASSET_NOT_FOUND(`Cannot find asset '${specifier}'`, specifier, parentURL)
      : errors.MODULE_NOT_FOUND(`Cannot find module '${specifier}'`, specifier, parentURL)
  }

  async _resolveAsync(specifier, parentURL, condition) {
    const protocol = this._protocolFor(parentURL)

    const resolver = traverse.resolve.bare(
      resolveEntry(specifier, condition),
      parentURL,
      this._resolveOptions()
    )

    let next = resolver.next()

    while (next.done !== true) {
      const value = next.value

      if (value.package) {
        const href = value.package.href

        let manifest = this._manifests[href]

        if (manifest === undefined) {
          const record = this.get(value.package)

          let source

          if (record) {
            source = record._source.bytes
          } else {
            source = readAsync(protocol, value.package)

            if (isThenable(source)) source = await source
          }

          manifest = this._manifests[href] = source === null ? null : JSON.parse(source.toString())
        }

        next = resolver.next(manifest)
      } else {
        const url = value.resolution

        if (url.protocol === 'builtin:' || url.protocol === 'data:' || this.get(url) !== null) {
          this._cacheResolution(parentURL, specifier, condition, url)

          return url
        }

        let exists = protocol.exists(url)

        if (isThenable(exists)) exists = await exists

        if (exists) {
          let resolution = protocol.resolve(url)

          if (isThenable(resolution)) resolution = await resolution

          this._cacheResolution(parentURL, specifier, condition, resolution)

          return resolution
        }

        next = resolver.next(false)
      }
    }

    throw condition === 'asset'
      ? errors.ASSET_NOT_FOUND(`Cannot find asset '${specifier}'`, specifier, parentURL)
      : errors.MODULE_NOT_FOUND(`Cannot find module '${specifier}'`, specifier, parentURL)
  }

  _resolveArtifact(referrer, specifier, condition, parentURL = referrer.url) {
    const url = parentURL === referrer.url ? referrer._resolve(specifier, condition) : null

    return url === null ? this._resolveSync(specifier, parentURL, condition) : url
  }
}

function driveSync(generator, protocol, driveLink) {
  let next = generator.next()

  while (next.done !== true) {
    const command = next.value

    if ('links' in command) {
      for (const link of command.links) driveLink(link)

      next = generator.next()

      continue
    }

    let value

    if ('module' in command) {
      value = readSync(protocol, command.module)
    } else if ('probe' in command) {
      value = protocol.existsSync(command.probe)
    } else if ('resolution' in command) {
      value = protocol.resolveSync(command.resolution)
    } else {
      value = listSync(protocol, command.prefix)
    }

    next = generator.next(value)
  }

  return next.value
}

async function driveAsync(generator, protocol, driveLink, semaphore) {
  let next = generator.next()

  while (next.done !== true) {
    const command = next.value

    if ('links' in command) {
      await Promise.all(command.links.map(driveLink))

      next = generator.next()

      continue
    }

    if (semaphore !== null) await semaphore.wait()

    let value

    try {
      if ('module' in command) {
        value = readAsync(protocol, command.module)
      } else if ('probe' in command) {
        value = protocol.exists(command.probe)
      } else if ('resolution' in command) {
        value = protocol.resolve(command.resolution)
      } else {
        value = listAsync(protocol, command.prefix)
      }

      if (isThenable(value)) value = await value
    } finally {
      if (semaphore !== null) semaphore.signal()
    }

    next = generator.next(value)
  }

  return next.value
}

function readSync(protocol, url) {
  if (protocol.existsSync(url) === false) return null

  return protocol.readSync(url)
}

function readAsync(protocol, url) {
  const exists = protocol.exists(url)

  if (isThenable(exists)) {
    return exists.then((exists) => (exists === false ? null : protocol.read(url)))
  }

  return exists === false ? null : protocol.read(url)
}

function listSync(protocol, url) {
  const urls = []

  for (const found of protocol.listSync(url)) urls.push(found)

  return urls
}

async function listAsync(protocol, url) {
  const urls = []

  for await (const found of protocol.list(url)) urls.push(found)

  return urls
}

function resolveEntry(specifier, condition) {
  let type = 0

  if (condition === 'require') type = lex.constants.REQUIRE
  else if (condition === 'import') type = lex.constants.IMPORT
  else if (condition === 'asset') type = lex.constants.ASSET

  return { type, specifier, names: [], attributes: {}, position: [0, 0, 0] }
}

function toURL(value, base) {
  if (isURL(value)) return value

  if (startsWithWindowsDriveLetter(value)) return pathToFileURL(value)

  return URL.parse(value, base) || pathToFileURL(value)
}

function isThenable(value) {
  return value !== null && typeof value === 'object' && typeof value.then === 'function'
}
