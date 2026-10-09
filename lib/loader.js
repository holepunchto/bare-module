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

const cacheOwners = new WeakMap()

const defaultProtocol = new ModuleProtocol()

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

function builtinsFor(builtins) {
  if (builtins === undefined || builtins === null) return null

  if (typeof builtins === 'object') return builtins

  throw new TypeError(`Builtins must be an object. Received type ${typeof builtins} (${builtins})`)
}

function wasiFor(wasi) {
  if (wasi === undefined || wasi === null) return null

  if (typeof wasi === 'function') return wasi

  throw new TypeError(`WASI must be a function. Received type ${typeof wasi} (${wasi})`)
}

function importsFor(imports) {
  if (imports === undefined || imports === null) return null

  if (typeof imports === 'object') return imports

  throw new TypeError(`Imports must be an object. Received type ${typeof imports} (${imports})`)
}

function defaultTypeFor(defaultType) {
  if (defaultType === undefined || defaultType === 0) return 0

  if (recordClasses[defaultType] !== undefined) return defaultType

  throw new TypeError(
    `Default type must be a module type. Received type ${typeof defaultType} (${defaultType})`
  )
}

function concurrencyFor(concurrency) {
  if (concurrency === undefined) return 0

  if (Number.isInteger(concurrency) && concurrency >= 0) return concurrency

  throw new TypeError(
    `Concurrency must be a non-negative integer. Received type ${typeof concurrency} (${concurrency})`
  )
}

function assertURL(url, name) {
  if (isURL(url)) return url

  throw new TypeError(`${name} must be a URL. Received type ${typeof url} (${url})`)
}

function* eachURL(urls) {
  if (isURL(urls) || typeof urls === 'string') urls = [urls]

  for (const url of urls) {
    yield assertURL(typeof url === 'string' ? new URL(url) : url, 'URL')
  }
}

function withContext(attributes, context) {
  const { host, wasi } = context

  if (host === null && wasi === null) return attributes

  attributes = { ...attributes }

  if (host !== null) attributes.host = host
  if (wasi !== null) attributes.wasi = wasi

  return attributes
}

function contextKey(context) {
  return JSON.stringify([context.host, context.wasi])
}

function typeAttributeFor(attributes) {
  if (attributes === undefined || attributes === null) return undefined

  if (typeof attributes !== 'object') {
    throw new TypeError(
      `Attributes must be an object. Received type ${typeof attributes} (${attributes})`
    )
  }

  const type = attributes.type

  if (type === undefined || typeof type === 'string') return type

  throw new TypeError(`Module type must be a string. Received type ${typeof type} (${type})`)
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
  'resolutions',
  'wasi'
]

const recordClasses = {
  __proto__: null,

  [type.MODULE]: SourceTextModule,
  [type.SCRIPT]: ScriptModule,
  [type.JSON]: JSONModule,
  [type.TEXT]: TextModule,
  [type.BINARY]: BinaryModule,
  [type.ADDON]: AddonModule,
  [type.BUNDLE]: BundleModule
}

const typeByAttribute = {
  __proto__: null,

  module: type.MODULE,
  script: type.SCRIPT,
  json: type.JSON,
  text: type.TEXT,
  binary: type.BINARY,
  addon: type.ADDON,
  bundle: type.BUNDLE
}

const attributeByType = {
  __proto__: null,

  ...Object.fromEntries(
    Object.entries(typeByAttribute).map(([attribute, type]) => [type, attribute])
  )
}

module.exports = class ModuleLoader {
  constructor(opts = {}) {
    const {
      protocol = null,
      builtins,
      defaultType,
      imports,
      resolutions,
      cache,
      concurrency,
      wasi
    } = opts

    this._protocol = protocol === null ? defaultProtocol : assertProtocol(protocol)
    this._defaultType = defaultTypeFor(defaultType)
    this._builtins = builtinsFor(builtins)
    this._imports = importsFor(imports)
    this._wasi = wasiFor(wasi)
    this._concurrency = concurrencyFor(concurrency)
    this._main = null
    this._cache = cacheFor(cache)
    this._resolutions = resolutionsFor(resolutions)
    this._manifests = Object.create(null)
    this._bundles = []
    this._mounts = new Map()
    this._visited = new Set()
    this._contexts = new Map()
    this._addonContexts = new Map()
    this._packages = new Map()
    this._prefixes = new Map()
    this._answers = { listed: new Map(), resolved: new Map(), exists: new Map() }
    this._uninstantiated = []
    this._pending = null

    // A cache holds the modules of a single graph, and every record in it is a
    // handle to the loader that read it. Reusing one across loaders that don't
    // reach as far as each other would hand the modules of one graph to the
    // other, protocol and builtins and all. The cache is therefore claimed
    // before anything is read into it, and what it already holds is checked
    // against the claim.
    this._graph = claimCache(this)

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
    return this._cached(assertURL(url, 'URL').href) || null
  }

  patch(bundle) {
    const graph = this._graph

    if (graph.patches === null) {
      graph.patches = new Map()
      graph.reader = patching(graph.protocol, graph.patches)
    }

    const patched = []

    for (const href of bundle.keys()) {
      const url = new URL(href)

      graph.patches.set(href, bundle)

      this._forget(url)

      const imports = bundle.resolutions[href]

      if (imports) this._resolutions[href] = imports

      patched.push(url)
    }

    return patched
  }

  evict(urls) {
    const evicted = []

    for (const url of eachURL(urls)) {
      if (this._forget(url)) evicted.push(url)

      delete this._resolutions[url.href]
    }

    return evicted
  }

  async instantiate(urls, opts = {}) {
    const records = []

    for (const url of eachURL(urls)) {
      if (url.protocol === 'builtin:') this._lookup(url)
      else await this._link(this._root(url, null, opts), this._protocolFor(url))

      records.push(this._lookup(traverse.alias(url, opts)))
    }

    this._instantiate()

    return records
  }

  instantiateSync(urls, opts = {}) {
    const records = []

    for (const url of eachURL(urls)) {
      if (url.protocol === 'builtin:') this._lookup(url)
      else this._linkSync(this._root(url, null, opts), this._protocolFor(url))

      records.push(this._lookup(traverse.alias(url, opts)))
    }

    this._instantiate()

    return records
  }

  async link(entry, source = null, opts = {}) {
    assertURL(entry, 'Entry')

    if (opts.mount !== undefined) this._mounts.set(entry.href, mountFor(opts.mount))

    if (entry.protocol === 'builtin:') this._lookup(entry)
    else await this._link(this._root(entry, source, opts), this._protocolFor(entry))

    this._instantiate()

    return this._entry(entry, opts)
  }

  linkSync(entry, source = null, opts = {}) {
    assertURL(entry, 'Entry')

    if (opts.mount !== undefined) this._mounts.set(entry.href, mountFor(opts.mount))

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
    const reaches =
      options.protocol === this._protocol &&
      options.builtins === this._builtins &&
      options.wasi === this._wasi

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
    return protocol === this._graph.reader ? this._answers : null
  }

  _protocolFor(url) {
    const bundle = this._bundleFor(url)

    if (bundle === null) return this._graph.reader

    return this._graph.reader.extend({
      resolve(context, url) {
        return bundleOwns(bundle, url) ? url : context.resolve(url)
      },

      resolveSync(context, url) {
        return bundleOwns(bundle, url) ? url : context.resolveSync(url)
      },

      exists(context, url) {
        return bundleOwns(bundle, url) ? true : context.exists(url)
      },

      existsSync(context, url) {
        return bundleOwns(bundle, url) ? true : context.existsSync(url)
      },

      read(context, url) {
        return bundleOwns(bundle, url) ? bundle.read(url.href) : context.read(url)
      },

      readSync(context, url) {
        return bundleOwns(bundle, url) ? bundle.read(url.href) : context.readSync(url)
      },

      list(context, url) {
        return bundleOwns(bundle, url) ? [url] : context.list(url)
      },

      listSync(context, url) {
        return bundleOwns(bundle, url) ? [url] : context.listSync(url)
      }
    })
  }

  _mountFor(url) {
    return this._mounts.get(url.href) || url.href + '/'
  }

  _bundleFor(url) {
    for (const bundle of this._bundles) {
      if (bundleOwns(bundle, url)) return bundle
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

  _forget(url) {
    const { href } = url

    const known = href in this._cache

    delete this._cache[href]

    this._visited.delete(href)
    this._packages.delete(href)

    for (const visited of this._contexts.values()) visited.delete(href)

    this._answers.listed.delete(href)
    this._answers.resolved.delete(href)
    this._answers.exists.delete(href)

    if (this._main !== null && this._main.url.href === href) this._main = null

    return known
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

  _addonRecord(url, wasi = null) {
    const source = new ModuleSource({
      url,
      type: type.ADDON,
      source: null,
      imports: {},
      lexer: { imports: [], exports: [] },
      wasi
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
      resolutions: this._resolutions,
      packages: this._packages,
      prefixes: this._prefixes,
      contexts: this._contexts,
      addonContexts: this._addonContexts,
      resolve: traverse.resolve.bare,
      loadable: isLoadable
    }

    if (this._builtins !== null) opts.builtins = Object.keys(this._builtins)

    const attributes = opts.attributes || {}

    // Turned down here as well as at the type check, as this is where a type
    // reaches the traversal and a graph is read for it.
    typeAttributeFor(attributes)

    return traverse.module(entry, source, attributes, null, this._visited, opts)
  }

  *_drive(generator, onChild, onBundle) {
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
        const record = this._ingest(value.dependency)

        if (record instanceof BundleModule) onBundle(record)

        next = generator.next()
      }
    }
  }

  _linkSync(root, protocol) {
    const answers = this._answersFor(protocol)

    const queue = [root]
    const deferred = []
    const bundles = []

    const onChild = (children, isDeferred) => {
      if (isDeferred) deferred.push(children)
      else queue.push(children)
    }

    const onBundle = (record) => bundles.push(record)

    const driveLink = (link) =>
      driveSync(this._drive(link, onChild, onBundle), protocol, driveLink, answers)

    while (queue.length > 0 || deferred.length > 0) {
      const generator = queue.length > 0 ? queue.pop() : deferred.shift()

      driveSync(this._drive(generator, onChild, onBundle), protocol, driveLink, answers)
    }

    for (const record of bundles) record._mount()
  }

  async _link(root, protocol) {
    const answers = this._answersFor(protocol)

    const semaphore = this._concurrency > 0 ? new Semaphore(this._concurrency) : null

    const deferred = []
    const bundles = []

    const onBundle = (record) => bundles.push(record)

    const collect = async (generator) => {
      const queue = []

      const onChild = (children, isDeferred) => {
        if (isDeferred) deferred.push(children)
        else queue.push(children)
      }

      const driveLink = (link) =>
        drive(this._drive(link, onChild, onBundle), protocol, driveLink, semaphore, answers)

      await drive(
        this._drive(generator, onChild, onBundle),
        protocol,
        driveLink,
        semaphore,
        answers
      )

      if (queue.length > 0) await Promise.all(queue.map(collect))
    }

    await collect(root)

    while (deferred.length > 0) {
      await Promise.all(deferred.splice(0, deferred.length).map(collect))
    }

    for (const record of bundles) await record._mountAsync()
  }

  _addBundle(bundle) {
    this._bundles.push(bundle)

    for (const href in bundle.resolutions) {
      if (bundleCovers(bundle, href) === false) continue

      if (href in this._resolutions === false) this._resolutions[href] = bundle.resolutions[href]
    }
  }

  _linkBundleSync(bundle) {
    this._linkSync(this._bundleRoot(bundle), this._bundleProtocol(bundle))
  }

  async _linkBundle(bundle) {
    await this._link(this._bundleRoot(bundle), this._bundleProtocol(bundle))
  }

  _bundleRoot(bundle) {
    return this._root(new URL(bundle.main), null, { imports: bundle.imports })
  }

  _bundleProtocol(bundle) {
    return this._graph.reader.extend({
      exists(context, url) {
        return bundleOwns(bundle, url) ? true : context.exists(url)
      },

      existsSync(context, url) {
        return bundleOwns(bundle, url) ? true : context.existsSync(url)
      },

      read(context, url) {
        return bundleOwns(bundle, url) ? bundle.read(url.href) : context.read(url)
      },

      readSync(context, url) {
        return bundleOwns(bundle, url) ? bundle.read(url.href) : context.readSync(url)
      }
    })
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

    const requested = typeAttributeFor(attributes)

    // An import attribute somewhere else may have changed the type. An import
    // that asks for no type in particular should get the module as it is, or
    // an error, but never the type someone else asked for.
    const expected = requested === undefined ? naturalType : typeByAttribute[requested]

    if (expected === undefined) {
      throw errors.UNKNOWN_MODULE_TYPE(
        `Module type '${requested}' at '${record.url.href}' is not supported`
      )
    }

    if (expected !== 0 && expected !== actual) {
      throw errors.TYPE_INCOMPATIBLE(
        `Module '${record.url.href}' is already of type '${attributeByType[actual]}' in the graph`
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
      } else {
        loader._linkFor(url, referrer.url, attributes, lex.constants.REQUIRE)
      }

      loader._assertType(record, attributes)

      return record._evaluate()
    }

    require.main = loader.main
    require.cache = loader.cache

    require.resolve = function (specifier, parentURL, opts) {
      return urlToPath(loader._resolveModule(referrer, specifier, 'require', parentURL, opts))
    }

    require.asset = function (specifier, parentURL) {
      return urlToPath(loader._resolveArtifact(referrer, specifier, 'asset', parentURL))
    }

    require.addon = function (specifier = '.', parentURL) {
      return loader._addon(referrer, specifier, parentURL)
    }

    require.addon.resolve = function (specifier = '.', parentURL) {
      return urlToPath(loader._resolveArtifact(referrer, specifier, 'addon', parentURL))
    }

    require.addon.host = Bare.Addon.host

    return require
  }

  _importSync(specifier, parentURL) {
    const url = this._resolveSync(specifier, parentURL, 'import')

    this._linkFor(url, parentURL, null, lex.constants.IMPORT)

    return this._lookup(url)
  }

  _requireSync(specifier, parentURL, attributes = null) {
    const url = this._resolveSync(specifier, parentURL, 'require')

    this._linkFor(url, parentURL, attributes, lex.constants.REQUIRE)

    const record = this._lookup(url)

    if (record === null) {
      throw errors.MODULE_NOT_FOUND(
        `Cannot find module '${specifier}' imported from '${parentURL.href}'`,
        specifier,
        parentURL
      )
    }

    return record
  }

  _linkFor(url, parentURL, attributes, importType) {
    attributes = this._resolveAttributesSync(attributes, parentURL)

    for (const context of this._unlinkedContexts(url, parentURL, attributes)) {
      this.linkSync(url, null, { attributes: withContext(attributes, context), importType })
    }
  }

  async _linkForAsync(url, parentURL, attributes, importType) {
    attributes = await this._resolveAttributes(attributes, parentURL)

    for (const context of this._unlinkedContexts(url, parentURL, attributes)) {
      await this.link(url, null, { attributes: withContext(attributes, context), importType })
    }
  }

  _unlinkedContexts(url, parentURL, attributes) {
    const host = attributes ? attributes.host : undefined
    const wasi = attributes ? attributes.wasi : undefined

    const exists = this._lookup(url) !== null

    if (exists && host === undefined && wasi === undefined && this._contexts.size === 0) {
      return []
    }

    const contexts = new Map()

    for (const context of this._contextsOf(parentURL)) {
      const requested = {
        host: host === undefined ? context.host : host,
        wasi: wasi === undefined ? context.wasi : wasi
      }

      contexts.set(contextKey(requested), requested)
    }

    if (exists) {
      for (const context of this._contextsOf(url)) contexts.delete(contextKey(context))
    }

    return [...contexts.values()]
  }

  _contextsOf(url) {
    const contexts = []

    for (const [key, visited] of this._contexts) {
      if (visited.has(url.href)) {
        const [host, wasi] = JSON.parse(key)

        contexts.push({ host, wasi })
      }
    }

    if (contexts.length === 0 || this._visited.has(url.href)) {
      contexts.unshift({ host: null, wasi: null })
    }

    return contexts
  }

  _wasiFor(record) {
    const { wasi } = record._source

    let provider = wasi === null ? this._wasi : this._lookup(new URL(wasi))._evaluate()

    if (provider === null) return null

    if (typeof provider === 'object') provider = provider.default

    if (typeof provider !== 'function') {
      throw new TypeError(`WASI provider '${wasi}' must export a function`)
    }

    return provider(record.url)
  }

  _cacheResolution(parentURL, specifier, condition, url) {
    const imports = this._resolutions[parentURL.href]

    // An entry is taken as every import of its module when that module is
    // linked, so none is started for a module that isn't linked yet.
    if (typeof imports !== 'object' || imports === null || specifier in imports) return

    imports[specifier] = { [condition]: url.href }
  }

  _resolveOptions(host = null) {
    const opts = { resolutions: this._resolutions, engines: Bare.versions }

    if (host !== null) opts.hosts = [host]

    if (this._builtins !== null) opts.builtins = Object.keys(this._builtins)

    return opts
  }

  _resolveSync(specifier, parentURL, condition, host = null) {
    const protocol = this._protocolFor(parentURL)
    const answers = this._answersFor(protocol)

    const resolver = traverse.resolve.bare(
      resolveEntry(specifier, condition),
      parentURL,
      this._resolveOptions(host)
    )

    const candidates = []

    let next = resolver.next()

    while (next.done !== true) {
      const value = next.value

      if (value.package) {
        const href = value.package.href

        let manifest = this._manifests[href]

        if (manifest === undefined) {
          const record = this.get(value.package)

          const source = record ? record._source.bytes : readSync(protocol, value.package, answers)

          manifest = this._manifests[href] = source === null ? null : JSON.parse(source.toString())
        }

        next = resolver.next(manifest)
      } else {
        const url = value.resolution

        candidates.push(url)

        if (isTerminalResolution(url, condition) || this.get(url) !== null) {
          this._cacheResolution(parentURL, specifier, condition, url)

          return url
        }

        if (existsSync(protocol, url, condition, answers)) {
          const resolution = protocol.resolveSync(url)

          if (condition !== 'addon' || isLoadable(resolution)) {
            this._cacheResolution(parentURL, specifier, condition, resolution)

            return resolution
          }
        }

        next = resolver.next(false)
      }
    }

    throw notFound(condition, specifier, parentURL, candidates)
  }

  async _resolve(specifier, parentURL, condition) {
    const protocol = this._protocolFor(parentURL)

    const resolver = traverse.resolve.bare(
      resolveEntry(specifier, condition),
      parentURL,
      this._resolveOptions()
    )

    const candidates = []

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

        candidates.push(url)

        if (isTerminalResolution(url, condition) || this.get(url) !== null) {
          this._cacheResolution(parentURL, specifier, condition, url)

          return url
        }

        if (await exists(protocol, url, condition)) {
          let resolution = protocol.resolve(url)

          if (isThenable(resolution)) resolution = await resolution

          if (condition !== 'addon' || isLoadable(resolution)) {
            this._cacheResolution(parentURL, specifier, condition, resolution)

            return resolution
          }
        }

        next = resolver.next(false)
      }
    }

    throw notFound(condition, specifier, parentURL, candidates)
  }

  _resolveModule(referrer, specifier, condition, parentURL, opts) {
    if (isOptions(parentURL)) {
      opts = parentURL
      parentURL = undefined
    }

    parentURL = parentURLFor(referrer, parentURL)

    const url = this._resolveSync(specifier, parentURL, condition)

    const attributes = opts && opts.with

    // The graph is linked as it would be when the resolved module is loaded,
    // without being evaluated, so that its resolutions are recorded for anyone
    // preparing it from the resolved URL alone.
    if (attributes !== undefined && attributes !== null) {
      const importType =
        lex.constants.RESOLVE |
        (condition === 'require' ? lex.constants.REQUIRE : lex.constants.IMPORT)

      this._linkFor(url, parentURL, attributes, importType)
    }

    return url
  }

  _resolveAttributesSync(attributes, parentURL) {
    for (const name of resolvedAttributes) {
      if (!hasAttribute(attributes, name)) continue

      const url = this._resolveSync(attributes[name], parentURL, 'default')

      attributes = { ...attributes, [name]: url.href }
    }

    return attributes
  }

  async _resolveAttributes(attributes, parentURL) {
    for (const name of resolvedAttributes) {
      if (!hasAttribute(attributes, name)) continue

      const url = await this._resolve(attributes[name], parentURL, 'default')

      attributes = { ...attributes, [name]: url.href }
    }

    return attributes
  }

  _resolveArtifact(referrer, specifier, condition, parentURL) {
    parentURL = parentURLFor(referrer, parentURL)

    let url = parentURL === referrer.url ? referrer._resolve(specifier, condition) : null

    if (url !== null) return url

    if (condition !== 'addon' || this._contexts.size === 0) {
      return this._resolveSync(specifier, parentURL, condition)
    }

    const contexts = this._contextsOf(referrer.url)

    if (contexts.length > 1) {
      throw errors.ADDON_HOST_INCOMPATIBLE(
        `Cannot resolve addon '${specifier}' from '${referrer.url.href}', which is linked in several contexts`
      )
    }

    url = this._resolveSync(specifier, parentURL, condition, contexts[0].host)

    const imports = this._resolutions[referrer.url.href]

    traverse.assertAddonContext(
      url,
      (imports && imports['#package']) || referrer.url.href,
      contexts[0],
      this._addonContexts
    )

    return url
  }

  _addon(referrer, specifier, parentURL) {
    const url = this._resolveArtifact(referrer, specifier, 'addon', parentURL)

    const contexts = this._contextsOf(referrer.url)

    const record =
      this._lookup(url) || this._addonRecord(url, contexts.length === 1 ? contexts[0].wasi : null)

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
        value = read(protocol, command.module, answers)
      } else if ('probe' in command) {
        value = answer(answers, 'exists', command.probe, protocol.exists(command.probe))
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

function notFound(condition, specifier, parentURL, candidates = []) {
  const kind = condition === 'addon' || condition === 'asset' ? condition : 'module'

  let message = `Cannot find ${kind} '${specifier}' imported from '${parentURL.href}'`

  if (candidates.length > 0) {
    message += '\nCandidates:'
    message += '\n' + candidates.map((url) => '- ' + url.href).join('\n')
  }

  switch (condition) {
    case 'addon':
      return errors.ADDON_NOT_FOUND(message, specifier, parentURL, candidates)
    case 'asset':
      return errors.ASSET_NOT_FOUND(message, specifier, parentURL, candidates)
    default:
      return errors.MODULE_NOT_FOUND(message, specifier, parentURL, candidates)
  }
}

function claimCache(loader) {
  const owner = cacheOwners.get(loader._cache)

  if (owner === undefined) {
    const graph = {
      protocol: loader._protocol,
      builtins: loader._builtins,
      wasi: loader._wasi,
      patches: null,
      reader: loader._protocol
    }

    cacheOwners.set(loader._cache, graph)

    return graph
  }

  if (owner.protocol !== loader._protocol) {
    throw errors.CACHE_INCOMPATIBLE('Cache is read through a different protocol')
  }

  if (owner.builtins !== loader._builtins) {
    throw errors.CACHE_INCOMPATIBLE('Cache is read with different builtins')
  }

  if (owner.wasi !== loader._wasi) {
    throw errors.CACHE_INCOMPATIBLE('Cache is read with different WASI capabilities')
  }

  return owner
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

  if (other._wasi !== loader._wasi) {
    throw errors.CACHE_INCOMPATIBLE(
      `Cache holds '${href}', which was read with different WASI capabilities`
    )
  }
}

function readSync(protocol, url, answers = null) {
  if (probeSync(protocol, url, answers) === false) return null

  return protocol.readSync(url)
}

function read(protocol, url, answers = null) {
  const exists = answer(answers, 'exists', url, protocol.exists(url))

  if (isThenable(exists)) {
    return exists.then((exists) => (exists === false ? null : protocol.read(url)))
  }

  return exists === false ? null : protocol.read(url)
}

function existsSync(protocol, url, condition, answers = null) {
  if (condition !== 'asset') return probeSync(protocol, url, answers)

  try {
    return listFirstSync(protocol, url) !== null
  } catch (err) {
    const known = recall(err, answers, 'listed', url)

    return known.length > 0
  }
}

function probeSync(protocol, url, answers) {
  try {
    return protocol.existsSync(url)
  } catch (err) {
    return recall(err, answers, 'exists', url)
  }
}

function recall(err, answers, kind, url) {
  const known = err.code === 'UNEXPECTED_PROMISE' ? answeredSync(answers, kind, url) : undefined

  if (known === undefined) throw err

  return known
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

function patching(protocol, patches) {
  return protocol.extend({
    exists(context, url) {
      return patches.has(url.href) || context.exists(url)
    },

    existsSync(context, url) {
      return patches.has(url.href) || context.existsSync(url)
    },

    read(context, url) {
      const patch = patches.get(url.href)

      return patch === undefined ? context.read(url) : patch.read(url.href)
    },

    readSync(context, url) {
      const patch = patches.get(url.href)

      return patch === undefined ? context.readSync(url) : patch.read(url.href)
    }
  })
}

function toURL(value, base) {
  if (isURL(value)) return value

  if (startsWithWindowsDriveLetter(value)) return pathToFileURL(value)

  return URL.parse(value, base) || pathToFileURL(value)
}

function mountFor(mount) {
  const url = typeof mount === 'string' ? URL.parse(mount) : mount

  if (!isURL(url)) {
    throw new TypeError(`Mount must be a URL. Received type ${typeof mount} (${mount})`)
  }

  return url.href.endsWith('/') ? url.href : url.href + '/'
}

function bundleCovers(bundle, href) {
  const root = bundle.root

  return typeof root !== 'string' || href.startsWith(root)
}

function bundleOwns(bundle, url) {
  return bundleCovers(bundle, url.href) && bundle.exists(url.href)
}

function parentURLFor(referrer, parentURL) {
  return parentURL === undefined ? referrer.url : toURL(parentURL, referrer.url)
}

function isOptions(value) {
  return typeof value === 'object' && value !== null && !URL.isURL(value)
}

// The attributes that name a module, which are resolved relative to the module
// that imports with them.
const resolvedAttributes = ['imports', 'wasi']

function hasAttribute(attributes, name) {
  return (
    typeof attributes === 'object' && attributes !== null && typeof attributes[name] === 'string'
  )
}

function isTerminalResolution(url, condition) {
  const protocol = url.protocol

  if (protocol === 'builtin:' || protocol === 'data:') return true

  return protocol === 'linked:' && condition === 'addon'
}

// Once sealed, only native addons that were already loaded can be loaded.
function isLoadable(url) {
  if (url.pathname.endsWith('.wasm') || Bare.Addon.sealed !== true) return true

  return Bare.Addon.loaded(url)
}

function isThenable(value) {
  return value !== null && typeof value === 'object' && typeof value.then === 'function'
}
