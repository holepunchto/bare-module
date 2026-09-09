const Semaphore = require('promaphore')
const traverse = require('bare-module-traverse')
const { startsWithWindowsDriveLetter } = require('bare-module-resolve')
const lex = require('bare-module-lexer')
const { isURL, pathToFileURL } = require('bare-url')
const { urlToPath } = require('./url')
const ModuleProtocol = require('./protocol')
const ModuleSource = require('./source')
const SourceTextModule = require('./module/source-text')
const ScriptModule = require('./module/script')
const JSONModule = require('./module/json')
const TextModule = require('./module/text')
const BinaryModule = require('./module/binary')
const AddonModule = require('./module/addon')
const BundleModule = require('./module/bundle')
const BuiltinModule = require('./module/builtin')
const errors = require('./errors')

const protocolKind = Symbol.for('bare.module.protocol.kind')

const type = traverse.constants
const engines = Bare.versions

const defaultProtocol = new ModuleProtocol()

const cacheOwners = new WeakMap()

function assertProtocol(protocol) {
  if (ModuleProtocol.isProtocol(protocol)) return protocol

  const version =
    typeof protocol === 'object' && protocol !== null ? protocol[protocolKind] : undefined

  if (version === undefined) {
    throw errors.PROTOCOL_INCOMPATIBLE('Protocol is not a module protocol')
  }

  throw errors.PROTOCOL_INCOMPATIBLE(
    `Protocol is of version ${version}, but this module system reads version ${ModuleProtocol[protocolKind]}`
  )
}

function cacheFor(cache) {
  if (cache === undefined) return Object.create(null)

  if (typeof cache === 'object' && cache !== null) return cache

  throw new TypeError(`Cache must be an object. Received type ${typeof cache} (${cache})`)
}

function resolutionsFor(resolutions) {
  if (resolutions === undefined) return Object.create(null)

  if (typeof resolutions === 'object' && resolutions !== null) return resolutions

  throw new TypeError(
    `Resolutions must be an object. Received type ${typeof resolutions} (${resolutions})`
  )
}

// Must name every option the constructor takes, as it decides both what a fork
// inherits and what it may narrow.
const loaderOptions = [
  'builtins',
  'cache',
  'concurrency',
  'defaultType',
  'imports',
  'protocol',
  'resolutions'
]

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

const attributeByType = Object.fromEntries(
  Object.entries(typeByAttribute).map(([attribute, type]) => [type, attribute])
)

module.exports = class ModuleLoader {
  constructor(opts = {}) {
    const {
      protocol = null,
      builtins = null,
      defaultType = 0,
      imports = null,
      resolutions,
      cache,
      concurrency = 0
    } = opts

    this._protocol = protocol === null ? defaultProtocol : assertProtocol(protocol)
    this._defaultType = defaultType
    this._builtins = builtins
    this._imports = imports
    this._concurrency = concurrency
    this._main = null
    this._cache = cacheFor(cache)
    this._resolutions = resolutionsFor(resolutions)
    this._manifests = Object.create(null)
    this._bundles = []
    this._visited = new Set()
    this._packages = new Map()
    this._prefixes = new Map()
    this._answers = { listed: new Map(), resolved: new Map() }
    this._uninstantiated = []
    this._pending = null

    // A cache holds the modules of a single graph, and every record in it is a
    // handle to the loader that read it. Reusing one across loaders that don't
    // reach as far as each other would hand the modules of one graph to the
    // other, protocol and builtins and all. The cache is therefore claimed
    // before anything is read into it, and what it already holds is checked
    // against the claim.
    claimCache(this)

    for (const href in this._cache) {
      const record = this._cache[href]

      if (record === null || record === undefined) continue

      assertCompatible(this, href, record)
    }
  }

  get protocol() {
    return this._protocol
  }

  get cache() {
    return this._cache
  }

  get main() {
    return this._main
  }

  get(url) {
    return this._cached(url.href) || null
  }

  async link(entry, source = null, opts = {}) {
    if (entry.protocol === 'builtin:') this._lookup(entry)
    else await this._link(this._root(entry, source, opts), this._protocolFor(entry))

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

      main: this.main
    }
  }

  _fork(opts) {
    if (loaderOptions.every((name) => opts[name] === undefined)) return this

    const options = {}

    for (const name of loaderOptions) {
      options[name] = opts[name] !== undefined ? opts[name] : this['_' + name]
    }

    // Narrowing what a module may reach starts a graph of its own. What this
    // loader read belongs to what it could reach, so a fork that reaches
    // elsewhere gets neither the cache it read into nor the resolutions it
    // resolved through.
    const reaches = options.protocol === this._protocol && options.builtins === this._builtins

    if (!reaches) options.cache = opts.cache

    const shares = reaches && cacheFor(options.cache) === this._cache

    if (!shares) options.resolutions = opts.resolutions

    const forked = new ModuleLoader(options)

    // Which module the program was launched from doesn't change with the
    // options another one is loaded with, so long as the two still share a
    // graph. Handing it over otherwise would hand over a record of this graph.
    if (shares) forked._main = this._main

    return forked
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

  _answersFor(protocol) {
    return protocol === this._protocol ? this._answers : null
  }

  _protocolFor(url) {
    const bundle = this._bundleFor(url)

    if (bundle === null) return this._protocol

    return this._protocol.extend({
      resolve(context, url) {
        return bundle.exists(url.href) ? url : context.resolve(url)
      },

      resolveSync(context, url) {
        return bundle.exists(url.href) ? url : context.resolveSync(url)
      },

      exists(context, url) {
        return bundle.exists(url.href) || context.exists(url)
      },

      existsSync(context, url) {
        return bundle.exists(url.href) || context.existsSync(url)
      },

      read(context, url) {
        return bundle.read(url.href) || context.read(url)
      },

      readSync(context, url) {
        return bundle.read(url.href) || context.readSync(url)
      },

      list(context, url) {
        return [] // TODO
      },

      listSync(context, url) {
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

  _cached(href) {
    const record = this._cache[href]

    if (record === null || record === undefined) return record

    if (record._loader !== this) assertCompatible(this, href, record)

    return record
  }

  _lookup(url) {
    if (url === null) return null

    const record = this._cached(url.href)

    if (record !== undefined) return record

    if (url.protocol === 'builtin:') return this._builtinRecord(url)

    return null
  }

  _builtinRecord(url) {
    const name = url.pathname

    if (this._builtins === null || Object.hasOwn(this._builtins, name) === false) return null

    const source = new ModuleSource({
      url,
      type: 0,
      source: null,
      imports: {},
      lexer: { imports: [], exports: [] }
    })

    const record = new BuiltinModule(this, source, this._builtins[name])

    this._cache[url.href] = record

    this._uninstantiated.push(record)

    return record
  }

  _addonRecord(url) {
    const source = new ModuleSource({
      url,
      type: type.ADDON,
      source: null,
      imports: {},
      lexer: { imports: [], exports: [] }
    })

    const record = new AddonModule(this, source)

    this._cache[url.href] = record

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
      deferUnresolved: true,
      packages: this._packages,
      prefixes: this._prefixes,
      resolve: traverse.resolve.bare
    }

    if (this._builtins !== null) opts.builtins = Object.keys(this._builtins)

    const attributes = opts.attributes || {}

    return traverse.module(entry, source, attributes, null, this._visited, opts)
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
        next = generator.next(yield { prefix: value.prefix, expand: value.expand })
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
    const answers = this._answersFor(protocol)

    const queue = [root]
    const deferred = []

    const onChild = (children, isDeferred) => {
      if (isDeferred) deferred.push(children)
      else queue.push(children)
    }

    const driveLink = (link) => driveSync(this._drive(link, onChild), protocol, driveLink, answers)

    while (queue.length > 0 || deferred.length > 0) {
      const generator = queue.length > 0 ? queue.pop() : deferred.shift()

      driveSync(this._drive(generator, onChild), protocol, driveLink, answers)
    }
  }

  async _link(root, protocol) {
    const answers = this._answersFor(protocol)

    const semaphore = this._concurrency > 0 ? new Semaphore(this._concurrency) : null

    const deferred = []

    const collect = async (generator) => {
      const queue = []

      const onChild = (children, isDeferred) => {
        if (isDeferred) deferred.push(children)
        else queue.push(children)
      }

      const driveLink = (link) =>
        drive(this._drive(link, onChild), protocol, driveLink, semaphore, answers)

      await drive(this._drive(generator, onChild), protocol, driveLink, semaphore, answers)

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

      existsSync(context, url) {
        if (bundle.exists(url.href)) return true

        const exists = context.existsSync(url)

        return isThenable(exists) ? false : exists
      },

      read(context, url) {
        const source = bundle.read(url.href)

        if (source) return source

        const fallback = context.read(url)

        return isThenable(fallback) ? null : fallback
      },

      readSync(context, url) {
        const source = bundle.read(url.href)

        if (source) return source

        const fallback = context.readSync(url)

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
    const existing = this._cached(dependency.url.href)

    if (existing) return existing

    if (dependency.source === null && dependency.type !== type.ADDON) return null

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
    const { type: actual, naturalType } = record._source

    if (!attributes || typeof attributes.type !== 'string') {
      // An import attribute somewhere else may have changed the type. An import
      // that asks for no type in particular should get the module as it is, or
      // an error, but never the type someone else asked for.
      if (naturalType !== 0 && naturalType !== actual) {
        throw errors.TYPE_INCOMPATIBLE(
          `Module '${record.url.href}' is only of type '${attributeByType[actual]}' in this graph`
        )
      }

      return
    }

    const expected = typeByAttribute[attributes.type]

    if (expected !== undefined && expected !== actual) {
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
        record = loader._requireSync(specifier, referrer.url, attributes)
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
      return loader._addon(referrer, specifier, toURL(parentURL, referrer.url))
    }

    require.addon.resolve = function (specifier = '.', parentURL = referrer.url) {
      return urlToPath(
        loader._resolveArtifact(referrer, specifier, 'addon', toURL(parentURL, referrer.url))
      )
    }

    require.addon.host = Bare.Addon.host

    return require
  }

  _importSync(specifier, parentURL) {
    const url = this._resolveSync(specifier, parentURL, 'import')

    let record = this._lookup(url)

    if (record === null) {
      this.linkSync(url, null, { importType: lex.constants.IMPORT })

      record = this.get(url)
    }

    return record
  }

  _requireSync(specifier, parentURL, attributes = null) {
    const url = this._resolveSync(specifier, parentURL, 'require')

    let record = this._lookup(url)

    if (record === null) {
      this.linkSync(url, null, { attributes, importType: lex.constants.REQUIRE })

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

        if (existsSync(protocol, url, condition)) {
          const resolution = protocol.resolveSync(url)

          this._cacheResolution(parentURL, specifier, condition, resolution)

          return resolution
        }

        next = resolver.next(false)
      }
    }

    throw notFound(condition, specifier, parentURL)
  }

  async _resolve(specifier, parentURL, condition) {
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
            source = read(protocol, value.package)

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

        if (await exists(protocol, url, condition)) {
          let resolution = protocol.resolve(url)

          if (isThenable(resolution)) resolution = await resolution

          this._cacheResolution(parentURL, specifier, condition, resolution)

          return resolution
        }

        next = resolver.next(false)
      }
    }

    throw notFound(condition, specifier, parentURL)
  }

  _resolveArtifact(referrer, specifier, condition, parentURL = referrer.url) {
    const url = parentURL === referrer.url ? referrer._resolve(specifier, condition) : null

    return url === null ? this._resolveSync(specifier, parentURL, condition) : url
  }

  _addon(referrer, specifier, parentURL = referrer.url) {
    const url = this._resolveArtifact(referrer, specifier, 'addon', parentURL)

    const record = this._lookup(url) || this._addonRecord(url)

    return record._evaluate()
  }
}

function driveSync(generator, protocol, driveLink, answers = null) {
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
      value = resolveSync(protocol, command.resolution, answers)
    } else {
      value = listSync(protocol, command.prefix, command.expand, answers)
    }

    next = generator.next(value)
  }

  return next.value
}

async function drive(generator, protocol, driveLink, semaphore, answers = null) {
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
        value = read(protocol, command.module)
      } else if ('probe' in command) {
        value = protocol.exists(command.probe)
      } else if ('resolution' in command) {
        value = resolve(protocol, command.resolution, answers)
      } else {
        value = list(protocol, command.prefix, command.expand, answers)
      }

      if (isThenable(value)) value = await value
    } finally {
      if (semaphore !== null) semaphore.signal()
    }

    next = generator.next(value)
  }

  return next.value
}

function notFound(condition, specifier, parentURL) {
  switch (condition) {
    case 'addon':
      return errors.ADDON_NOT_FOUND(`Cannot find addon '${specifier}'`, specifier, parentURL)
    case 'asset':
      return errors.ASSET_NOT_FOUND(`Cannot find asset '${specifier}'`, specifier, parentURL)
    default:
      return errors.MODULE_NOT_FOUND(`Cannot find module '${specifier}'`, specifier, parentURL)
  }
}

function claimCache(loader) {
  const owner = cacheOwners.get(loader._cache)

  if (owner === undefined) {
    cacheOwners.set(loader._cache, {
      protocol: loader._protocol,
      builtins: loader._builtins
    })

    return
  }

  if (owner.protocol !== loader._protocol) {
    throw errors.CACHE_INCOMPATIBLE('Cache is read through a different protocol')
  }

  if (owner.builtins !== loader._builtins) {
    throw errors.CACHE_INCOMPATIBLE('Cache is read with different builtins')
  }
}

function assertCompatible(loader, href, record) {
  const other = record._loader

  if (other._protocol !== loader._protocol) {
    throw errors.CACHE_INCOMPATIBLE(
      `Cache holds '${href}', which was read through a different protocol`
    )
  }

  if (other._builtins !== loader._builtins) {
    throw errors.CACHE_INCOMPATIBLE(`Cache holds '${href}', which was read with different builtins`)
  }
}

function readSync(protocol, url) {
  if (protocol.existsSync(url) === false) return null

  return protocol.readSync(url)
}

function read(protocol, url) {
  const exists = protocol.exists(url)

  if (isThenable(exists)) {
    return exists.then((exists) => (exists === false ? null : protocol.read(url)))
  }

  return exists === false ? null : protocol.read(url)
}

function existsSync(protocol, url, condition) {
  if (condition === 'asset') return listFirstSync(protocol, url) !== null

  return protocol.existsSync(url)
}

async function exists(protocol, url, condition) {
  if (condition === 'asset') return (await listFirst(protocol, url)) !== null

  return protocol.exists(url)
}

function listFirstSync(protocol, url) {
  for (const found of protocol.listSync(url)) return found

  return protocol.existsSync(url) ? url : null
}

async function listFirst(protocol, url) {
  for await (const found of protocol.list(url)) return found

  return (await protocol.exists(url)) ? url : null
}

function answered(answers, kind, url) {
  return answers === null ? undefined : answers[kind].get(url.href)
}

function answeredSync(answers, kind, url) {
  const value = answered(answers, kind, url)

  return isThenable(value) ? undefined : value
}

function answer(answers, kind, url, value) {
  if (answers === null) return value

  const cache = answers[kind]

  if (isThenable(value)) {
    value = value.then((value) => {
      cache.set(url.href, value)

      return value
    })
  }

  cache.set(url.href, value)

  return value
}

function resolveSync(protocol, url, answers) {
  const known = answeredSync(answers, 'resolved', url)

  if (known !== undefined) return known

  return answer(answers, 'resolved', url, protocol.resolveSync(url))
}

function resolve(protocol, url, answers) {
  const known = answered(answers, 'resolved', url)

  if (known !== undefined) return known

  return answer(answers, 'resolved', url, protocol.resolve(url))
}

function listSync(protocol, url, expand, answers) {
  if (expand === false) {
    const known = answeredSync(answers, 'listed', url)

    if (known !== undefined) return known

    const found = listFirstSync(protocol, url)

    return answer(answers, 'listed', url, found === null ? [] : [found])
  }

  const listing = protocol.listSync(url)

  const urls = []

  for (const found of listing) urls.push(found)

  if (urls.length === 0) return protocol.existsSync(url) ? [url] : []

  return resolved(urls, listing)
}

function list(protocol, url, expand, answers) {
  if (expand === false) {
    const known = answered(answers, 'listed', url)

    if (known !== undefined) return known

    return answer(
      answers,
      'listed',
      url,
      listFirst(protocol, url).then((found) => (found === null ? [] : [found]))
    )
  }

  return collect(protocol, url)
}

async function collect(protocol, url) {
  const listing = protocol.list(url)

  const urls = []

  for await (const found of listing) urls.push(found)

  if (urls.length === 0) return (await protocol.exists(url)) ? [url] : []

  return resolved(urls, listing)
}

function resolved(urls, listing) {
  urls.resolved = listing.resolved === true

  return urls
}

function resolveEntry(specifier, condition) {
  let type = 0

  if (condition === 'require') type = lex.constants.REQUIRE
  else if (condition === 'import') type = lex.constants.IMPORT
  else if (condition === 'asset') type = lex.constants.ASSET
  else if (condition === 'addon') type = lex.constants.ADDON

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
