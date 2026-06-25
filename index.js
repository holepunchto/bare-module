const path = require('bare-path')
const resolve = require('bare-module-resolve')
const lex = require('bare-module-lexer')
const strip = require('bare-type-stripper')
const { isURL, fileURLToPath, pathToFileURL } = require('bare-url')
const Bundle = require('bare-bundle')
const Protocol = require('./lib/protocol')
const constants = require('./lib/constants')
const errors = require('./lib/errors')
const binding = require('./binding')

const kind = Symbol.for('bare.module.kind')

const isWindows = Bare.platform === 'win32'

const { startsWithWindowsDriveLetter } = resolve

module.exports = exports = class Module {
  static get [kind]() {
    return 1 // Compatibility version
  }

  constructor(url) {
    this._url = url
    this._state = 0
    this._type = 0
    this._defaultType = 0
    this._main = null
    this._exports = null
    this._imports = null
    this._resolutions = null
    this._builtins = null
    this._conditions = null
    this._protocol = null
    this._cache = null
    this._source = null
    this._function = null
    this._names = null
    this._promise = null
    this._handle = null

    Object.preventExtensions(this)
  }

  get [kind]() {
    return Module[kind]
  }

  get url() {
    return this._url
  }

  get type() {
    return this._type
  }

  get defaultType() {
    return this._defaultType
  }

  get main() {
    return this._main
  }

  get exports() {
    return this._exports
  }

  set exports(value) {
    this._exports = value
  }

  get imports() {
    return this._imports
  }

  get resolutions() {
    return this._resolutions
  }

  get builtins() {
    return this._builtins
  }

  get conditions() {
    return Array.from(this._conditions)
  }

  get protocol() {
    return this._protocol
  }

  get cache() {
    return this._cache
  }

  // For Node.js compatibility
  get filename() {
    return urlToPath(this._url)
  }

  // For Node.js compatibility
  get dirname() {
    return urlToDirname(this._url)
  }

  // For Node.js compatibility
  get id() {
    return this.filename
  }

  // For Node.js compatibility
  get path() {
    return this.dirname
  }

  _transform(isImport, isDynamicImport) {
    if (isDynamicImport) {
      this._run()
    } else if (isImport) {
      this._synthesize()
    } else {
      this._evaluate()
    }

    return this
  }

  _synthesize() {
    if ((this._state & constants.states.SYNTHESIZED) !== 0) return

    this._state |= constants.states.SYNTHESIZED

    if (this._type === constants.types.MODULE) return

    const names = new Set(['default'])
    const queue = [this]
    const seen = new Set()

    while (queue.length) {
      const module = queue.pop()

      if (seen.has(module)) continue

      seen.add(module)

      switch (module._type) {
        case constants.types.SCRIPT: {
          const result = lex(module._source)

          for (const { name } of result.exports) names.add(name)

          const referrer = module

          for (const { specifier, type } of result.imports) {
            if (
              (type & lex.constants.REEXPORT) !== 0 &&
              (type & lex.constants.ADDON) === 0 &&
              (type & lex.constants.ASSET) === 0
            ) {
              const resolved = Module.resolve(specifier, referrer._url, {
                isImport: true,
                referrer
              })

              const module = Module.load(resolved, {
                isImport: true,
                referrer
              })

              if (module._names) {
                for (const name of module._names) names.add(name)
              } else {
                queue.push(module)
              }
            }
          }

          break
        }

        case constants.types.MODULE:
          module._evaluate()

          for (const name of Object.keys(module._exports)) names.add(name)

          break

        case constants.types.JSON:
          for (const name of Object.keys(module._exports)) names.add(name)
      }
    }

    this._names = Array.from(names)

    this._handle = binding.createSyntheticModule(this._url.href, this._names, Module._handle)

    const id = binding.getModuleID(this._handle)

    Module._registry.set(id, this)
  }

  _evaluate() {
    if ((this._state & constants.states.EVALUATED) !== 0) return

    this._state |= constants.states.EVALUATED

    if (this._type === constants.types.SCRIPT) {
      const require = exports.createRequire(this._url, { module: this })

      this._exports = {}

      const fn = this._function // Bind to variable to ensure proper stack trace

      fn(require, this, this._exports, urlToPath(this._url), urlToDirname(this._url))
    } else if (this._type === constants.types.MODULE) {
      this._run()

      this._exports = binding.getModuleNamespace(this._handle)
    }
  }

  _run() {
    if ((this._state & constants.states.RUN) !== 0) return

    this._state |= constants.states.RUN

    this._synthesize()

    this._promise = binding.runModule(this._handle, Module._handle, Module._onrun)
  }

  [Symbol.for('bare.inspect')]() {
    return {
      __proto__: { constructor: Module },

      url: this.url,
      type: this.type,
      defaultType: this.defaultType,
      main: this.main,
      exports: this.exports,
      imports: this.imports,
      resolutions: this.resolutions,
      builtins: this.builtins,
      conditions: this.conditions
    }
  }

  static _extensions = Object.create(null)

  static _protocol = null

  static _registry = new WeakMap()

  static _cache =
    module[kind] === Module[kind] ? module.cache || Object.create(null) : Object.create(null)

  static _conditions = ['bare', 'node', ...Bare.Addon.host.split('-')]

  static _handle = binding.init(this, this._onimport, this._onevaluate, this._onmeta)

  static _onimport(specifier, attributes, referrerName, id, isDynamicImport) {
    const referrer = this._registry.get(id) || null

    let parentURL

    if (referrer !== null) {
      parentURL = referrer._url
    } else if (isDynamicImport) {
      parentURL = referrerName ? toURL(referrerName) : pathToFileURL('./')
    } else {
      throw errors.MODULE_NOT_FOUND(`Cannot find referrer for module '${specifier}'`, specifier)
    }

    const resolved = this.resolve(specifier, parentURL, {
      isImport: true,
      referrer,
      attributes
    })

    const module = this.load(resolved, {
      isImport: true,
      isDynamicImport,
      referrer,
      attributes
    })

    return isDynamicImport
      ? module._promise.then(() => binding.getModuleNamespace(module._handle))
      : module._handle
  }

  static _onevaluate(id) {
    const module = this._registry.get(id) || null

    if (module === null) {
      throw errors.MODULE_NOT_FOUND('Cannot find module')
    }

    module._evaluate()

    for (const name of module._names) {
      let value

      if (
        name === 'default' &&
        (typeof module._exports !== 'object' ||
          module._exports === null ||
          name in module._exports === false)
      ) {
        value = module._exports
      } else {
        value = module._exports[name]
      }

      binding.setModuleExport(module._handle, name, value)
    }
  }

  static _onmeta(id, meta) {
    const module = this._registry.get(id) || null

    if (module === null) {
      throw errors.MODULE_NOT_FOUND('Cannot find module')
    }

    const referrer = module

    meta.url = module._url.href
    meta.main = module._main === module
    meta.cache = module._cache

    meta.dirname = module.dirname // For Node.js compatibility
    meta.filename = module.filename // For Node.js compatibility

    meta.resolve = function resolve(specifier, parentURL = referrer._url) {
      return Module.resolve(specifier, toURL(parentURL, referrer._url), {
        referrer
      }).href
    }

    meta.addon = function addon(specifier = '.', parentURL = referrer._url) {
      const resolved = Bare.Addon.resolve(specifier, toURL(parentURL, referrer._url), { referrer })

      const addon = Bare.Addon.load(resolved, { referrer })

      return addon._exports
    }

    meta.addon.resolve = function resolve(specifier = '.', parentURL = referrer._url) {
      return Bare.Addon.resolve(specifier, toURL(parentURL, referrer._url), {
        referrer
      }).href
    }

    meta.addon.host = Bare.Addon.host

    meta.asset = function asset(specifier, parentURL = referrer._url) {
      return Module.asset(specifier, toURL(parentURL, referrer._url), {
        referrer
      }).href
    }
  }

  static _onrun(reason, promise, err = reason) {
    if (err) {
      promise.catch(() => {}) // Don't leak the rejection

      throw err
    } else {
      promise.catch((err) =>
        queueMicrotask(() => {
          throw err
        })
      )
    }
  }

  static get protocol() {
    return this._protocol
  }

  static get cache() {
    return this._cache
  }

  static load(url, source = null, opts = {}) {
    if (
      !ArrayBuffer.isView(source) &&
      !Bundle.isBundle(source) &&
      typeof source !== 'string' &&
      source !== null
    ) {
      opts = source
      source = null
    }

    const referrer = opts.referrer || null
    const inherited = inherit(referrer)

    const {
      isImport = false,
      isDynamicImport = false,
      attributes,
      type = typeForAttributes(attributes),
      defaultType = inherited.defaultType,
      main = inherited.main,
      protocol = inherited.protocol,
      imports = inherited.imports,
      resolutions = inherited.resolutions,
      builtins = inherited.builtins,
      conditions = inherited.conditions
    } = opts

    const cache = cacheFor(opts.cache, inherited.cache)

    let module = cache[url.href] || null

    if (module !== null) {
      if (type !== 0 && type !== module._type) {
        throw errors.TYPE_INCOMPATIBLE(
          `Module '${module.url.href}' is not of type '${nameOfType(type)}'`
        )
      }

      return module._transform(isImport, isDynamicImport)
    }

    module = cache[url.href] = new Module(url)

    try {
      switch (url.protocol) {
        case 'builtin:':
          module._exports = builtins[url.pathname]
          break

        default: {
          module._defaultType = defaultType
          module._cache = cache
          module._main = main || module
          module._protocol = protocol
          module._imports = imports
          module._resolutions = resolutions
          module._builtins = builtins
          module._conditions = conditions

          if (
            typeof attributes === 'object' &&
            attributes !== null &&
            typeof attributes.imports === 'string'
          ) {
            const resolved = Module.resolve(attributes.imports, referrer._url, {
              referrer: module
            })

            const imports = Module.load(resolved, {
              referrer: module,
              type: constants.types.JSON
            })

            module._imports = mixinImports(module._imports, imports._exports, resolved)
          }

          let extension = canonicalExtensionForType(type) || path.extname(url.pathname)

          if (extension in Module._extensions === false) {
            if (defaultType) {
              extension = canonicalExtensionForType(defaultType) || '.js'
            } else {
              extension = '.js'
            }
          }

          Module._extensions[extension](module, source, referrer)
        }
      }

      return module._transform(isImport, isDynamicImport)
    } catch (err) {
      delete cache[url.href]

      throw err
    }
  }

  static resolve(specifier, parentURL, opts = {}) {
    if (typeof specifier !== 'string') {
      throw new TypeError(
        `Specifier must be a string. Received type ${typeof specifier} (${specifier})`
      )
    }

    const referrer = opts.referrer || null
    const inherited = inherit(referrer)

    const {
      isImport = false,
      attributes,
      type = typeForAttributes(attributes),
      extensions = extensionsForType(type),
      protocol = inherited.protocol,
      imports = inherited.imports,
      resolutions = inherited.resolutions,
      builtins = inherited.builtins,
      conditions = inherited.conditions
    } = opts

    const cache = cacheFor(opts.cache, referrer ? referrer._cache : undefined)

    const resolved = protocol.preresolve(specifier, parentURL)

    const [resolution] = protocol.resolve(resolved, parentURL, imports)

    if (resolution) return protocol.postresolve(resolution)

    const candidates = []

    for (const resolution of resolve(
      resolved,
      parentURL,
      {
        conditions: isImport ? ['import', ...conditions] : ['require', ...conditions],
        imports,
        resolutions,
        extensions,
        builtins: builtins ? Object.keys(builtins) : [],
        engines: Bare.versions
      },
      readPackageFor(protocol, cache)
    )) {
      candidates.push(resolution)

      const condition = isImport ? 'import' : 'require'

      switch (resolution.protocol) {
        case 'builtin:':
          cacheResolution(resolutions, parentURL, resolved, condition, resolution)

          return resolution
        default:
          if (protocol.exists(resolution, type)) {
            const postresolved = protocol.postresolve(resolution)

            cacheResolution(resolutions, parentURL, resolved, condition, postresolved)

            return postresolved
          }
      }
    }

    throw errors.MODULE_NOT_FOUND(
      notFound('module', specifier, parentURL, candidates),
      specifier,
      parentURL,
      candidates
    )
  }

  static asset(specifier, parentURL, opts = {}) {
    if (typeof specifier !== 'string') {
      throw new TypeError(
        `Specifier must be a string. Received type ${typeof specifier} (${specifier})`
      )
    }

    const referrer = opts.referrer || null
    const inherited = inherit(referrer)

    const {
      protocol = inherited.protocol,
      imports = inherited.imports,
      resolutions = inherited.resolutions,
      conditions = inherited.conditions
    } = opts

    const cache = cacheFor(opts.cache, referrer ? referrer._cache : undefined)

    const resolved = protocol.preresolve(specifier, parentURL)

    const [resolution] = protocol.resolve(resolved, parentURL, imports)

    if (resolution) return protocol.postresolve(resolution)

    const candidates = []

    for (const resolution of resolve(
      resolved,
      parentURL,
      {
        conditions: ['asset', ...conditions],
        imports,
        resolutions,
        engines: Bare.versions
      },
      readPackageFor(protocol, cache)
    )) {
      candidates.push(resolution)

      if (protocol.exists(resolution, constants.types.ASSET)) {
        const postresolved = protocol.postresolve(
          protocol.asset ? protocol.asset(resolution) : resolution
        )

        cacheResolution(resolutions, parentURL, resolved, 'asset', postresolved)

        return postresolved
      }
    }

    throw errors.ASSET_NOT_FOUND(
      notFound('asset', specifier, parentURL, candidates),
      specifier,
      parentURL,
      candidates
    )
  }
}

const Module = exports

function inherit(referrer) {
  return {
    defaultType: referrer ? referrer._defaultType : 0,
    cache: referrer ? referrer._cache : Module._cache,
    main: referrer ? referrer._main : null,
    protocol: referrer ? referrer._protocol : Module._protocol,
    imports: referrer ? referrer._imports : null,
    resolutions: referrer ? referrer._resolutions : Object.create(null),
    builtins: referrer ? referrer._builtins : null,
    conditions: referrer ? referrer._conditions : Module._conditions
  }
}

function cacheFor(cache, fallback = Object.create(null)) {
  if (cache === false) return Object.create(null)

  return cache === undefined ? fallback : cache
}

function readPackageFor(protocol, cache) {
  return function readPackage(packageURL) {
    if (protocol.exists(packageURL, constants.types.JSON)) {
      return Module.load(packageURL, { protocol, cache })._exports
    }

    return null
  }
}

function notFound(kind, specifier, parentURL, candidates) {
  let message = `Cannot find ${kind} '${specifier}' imported from '${parentURL.href}'`

  if (candidates.length > 0) {
    message += '\nCandidates:'
    message += '\n' + candidates.map((url) => '- ' + url.href).join('\n')
  }

  return message
}

const typeInfo = {
  [constants.types.SCRIPT]: {
    name: 'script',
    attribute: 'script',
    canonicalExtension: '.cjs',
    extensions: ['.js', '.cjs', '.ts', '.cts']
  },
  [constants.types.MODULE]: {
    name: 'module',
    attribute: 'module',
    canonicalExtension: '.mjs',
    extensions: ['.js', '.mjs', '.ts', '.mts']
  },
  [constants.types.JSON]: {
    name: 'json',
    attribute: 'json',
    canonicalExtension: '.json',
    extensions: ['.json']
  },
  [constants.types.BUNDLE]: {
    name: 'bundle',
    attribute: 'bundle',
    canonicalExtension: '.bundle',
    extensions: ['.bundle']
  },
  [constants.types.ADDON]: {
    name: 'bare',
    attribute: 'addon',
    canonicalExtension: '.bare',
    extensions: ['.bare', '.node']
  },
  [constants.types.BINARY]: {
    name: 'binary',
    attribute: 'binary',
    canonicalExtension: '.bin',
    extensions: ['.bin']
  },
  [constants.types.TEXT]: {
    name: 'text',
    attribute: 'text',
    canonicalExtension: '.txt',
    extensions: ['.txt']
  }
}

const defaultExtensions = ['.js', '.cjs', '.mjs', '.ts', '.cts', '.mts', '.json', '.bare', '.node']

const typeByAttribute = Object.create(null)

for (const type in typeInfo) {
  typeByAttribute[typeInfo[type].attribute] = +type
}

function extensionsForType(type) {
  return type in typeInfo ? typeInfo[type].extensions : defaultExtensions
}

function canonicalExtensionForType(type) {
  return type in typeInfo ? typeInfo[type].canonicalExtension : null
}

function nameOfType(type) {
  return type in typeInfo ? typeInfo[type].name : null
}

function typeForAttributes(attributes) {
  if (typeof attributes !== 'object' || attributes === null) return 0

  return typeByAttribute[attributes.type] || 0
}

function mixinImports(target, imports, url) {
  if (typeof imports === 'object' && imports !== null && 'imports' in imports) {
    imports = imports.imports
  }

  if (typeof imports !== 'object' || imports === null) {
    throw errors.INVALID_IMPORTS_MAP(`Imports map at '${url.href}' is not valid`)
  }

  return { ...target, ...imports }
}

function cacheResolution(resolutions, parentURL, specifier, condition, resolved) {
  if (resolutions === null) return

  let imports = resolutions[parentURL.href]

  if (typeof imports !== 'object' || imports === null) {
    imports = resolutions[parentURL.href] = Object.create(null)
  }

  // Don't overwrite any preexisting entries, such as those from a bundle, as
  // they take precedence over what we resolve ourselves.
  if (specifier in imports) return

  // Cache the resolution behind the condition that produced it as the same
  // specifier may resolve differently depending on whether it is imported,
  // required, or resolved as an asset.
  imports[specifier] = { [condition]: resolved.href }
}

exports.Protocol = Protocol

exports.constants = constants

// For Node.js compatibility
exports.builtinModules = []

// For Node.js compatibility
exports.isBuiltin = function isBuiltin() {
  return false
}

exports.createRequire = function createRequire(parentURL, opts = {}) {
  const inherited = inherit(opts.referrer)

  const {
    type = constants.types.SCRIPT,
    defaultType = inherited.defaultType || constants.types.SCRIPT,
    main = inherited.main,
    protocol = inherited.protocol,
    imports = inherited.imports,
    resolutions = inherited.resolutions,
    builtins = inherited.builtins,
    conditions = inherited.conditions
  } = opts

  const cache = cacheFor(opts.cache, inherited.cache)

  let module = opts.module || null

  if (module === null) {
    module = new Module(toURL(parentURL))

    module._type = type
    module._defaultType = defaultType
    module._cache = cache
    module._main = main || module
    module._protocol = protocol
    module._imports = imports
    module._resolutions = resolutions
    module._builtins = builtins
    module._conditions = conditions
  }

  const referrer = module

  function require(specifier, opts = {}) {
    const attributes = opts && opts.with

    const resolved = Module.resolve(specifier, referrer._url, {
      referrer,
      attributes
    })

    const module = Module.load(resolved, { referrer, attributes })

    return module._exports
  }

  require.main = module._main
  require.cache = module._cache

  require.resolve = function resolve(specifier, parentURL = referrer._url) {
    return urlToPath(Module.resolve(specifier, toURL(parentURL, referrer._url), { referrer }))
  }

  require.addon = function addon(specifier = '.', parentURL = referrer._url) {
    const resolved = Bare.Addon.resolve(specifier, toURL(parentURL, referrer._url), { referrer })

    const addon = Bare.Addon.load(resolved, { referrer })

    return addon._exports
  }

  require.addon.host = Bare.Addon.host

  require.addon.resolve = function resolve(specifier = '.', parentURL = referrer._url) {
    return urlToPath(
      Bare.Addon.resolve(specifier, toURL(parentURL, referrer._url), {
        referrer
      })
    )
  }

  require.asset = function asset(specifier, parentURL = referrer._url) {
    return urlToPath(Module.asset(specifier, toURL(parentURL, referrer._url), { referrer }))
  }

  return require
}

function readSource(module, source) {
  if (source === null) source = module._protocol.read(module._url)

  if (typeof source === 'string') source = Buffer.from(source)

  return source
}

Module._extensions['.js'] = function (module, source, referrer) {
  const cache = module._cache
  const protocol = module._protocol
  const resolutions = module._resolutions

  let pkg

  for (const packageURL of resolve.lookupPackageScope(module._url, {
    resolutions
  })) {
    if (cache[packageURL.href]) {
      pkg = cache[packageURL.href]
      break
    }

    if (protocol.exists(packageURL, constants.types.JSON)) {
      pkg = Module.load(packageURL, { protocol, cache })
      break
    }
  }

  const info = (pkg && pkg._exports) || {}

  const isESM =
    // The default type is ES modules.
    constants.types.MODULE === module._defaultType ||
    // The package is explicitly declared as an ES module.
    (info && info.type === 'module')

  return Module._extensions[isESM ? '.mjs' : '.cjs'](module, source, referrer)
}

Module._extensions['.cjs'] = function (module, source, referrer) {
  module._type = constants.types.SCRIPT

  source = readSource(module, source)

  module._source = source

  module._function = binding.createFunction(
    module._url.href,
    ['require', 'module', 'exports', '__filename', '__dirname'],
    source.toString(),
    0
  )

  const id = binding.getFunctionID(module._function)

  Module._registry.set(id, module)
}

Module._extensions['.mjs'] = function (module, source, referrer) {
  module._type = constants.types.MODULE

  source = readSource(module, source)

  module._source = source

  module._handle = binding.createModule(module._url.href, source.toString(), 0, Module._handle)

  const id = binding.getModuleID(module._handle)

  Module._registry.set(id, module)
}

for (const [typescript, javascript] of [
  ['.ts', '.js'],
  ['.cts', '.cjs'],
  ['.mts', '.mjs']
]) {
  Module._extensions[typescript] = function (module, source, referrer) {
    return Module._extensions[javascript](module, strip(readSource(module, source)), referrer)
  }
}

Module._extensions['.json'] = function (module, source, referrer) {
  module._type = constants.types.JSON

  source = readSource(module, source)

  module._source = source
  module._exports = JSON.parse(source.toString())
}

Module._extensions['.bare'] = Module._extensions['.node'] = function (module, source, referrer) {
  module._type = constants.types.ADDON

  referrer = module

  module._exports = Bare.Addon.load(module._url, { referrer }).exports
}

Module._extensions['.bundle'] = function (module, source, referrer) {
  const protocol = module._protocol

  module._type = constants.types.BUNDLE

  source = readSource(module, source)

  referrer = module

  const bundle = Bundle.from(source).mount(module._url.href + '/')

  module._source = source
  module._imports = bundle.imports
  module._resolutions = bundle.resolutions

  module._protocol = protocol.extend({
    postresolve(context, url) {
      return bundle.exists(url.href) ? url : context.postresolve(url)
    },

    exists(context, url, type) {
      return bundle.exists(url.href) || context.exists(url, type)
    },

    read(context, url) {
      return bundle.read(url.href) || context.read(url)
    }
  })

  if (bundle.main) {
    module._exports = Module.load(new URL(bundle.main), bundle.read(bundle.main), {
      referrer
    })._exports
  }
}

Module._extensions['.bin'] = function (module, source, referrer) {
  module._type = constants.types.BINARY

  source = readSource(module, source)

  module._source = module._exports = source
}

Module._extensions['.txt'] = function (module, source, referrer) {
  module._type = constants.types.TEXT

  source = readSource(module, source)

  module._source = source
  module._exports = source.toString()
}

Module._protocol = new Protocol({
  postresolve(url) {
    switch (url.protocol) {
      case 'file:':
        return pathToFileURL(binding.realpath(path.toNamespacedPath(fileURLToPath(url))))
      default:
        return url
    }
  },

  exists(url, type = 0) {
    switch (url.protocol) {
      case 'file:':
        return binding.exists(
          path.toNamespacedPath(fileURLToPath(url)),
          type === constants.types.ASSET ? binding.FILE | binding.DIR : binding.FILE
        )
      default:
        return false
    }
  },

  read(url) {
    switch (url.protocol) {
      case 'file:':
        return Buffer.from(binding.read(path.toNamespacedPath(fileURLToPath(url))))
      default:
        throw errors.UNKNOWN_PROTOCOL(`Cannot load module '${url.href}'`)
    }
  }
})

function toURL(value, base) {
  if (isURL(value)) return value

  if (startsWithWindowsDriveLetter(value)) {
    return pathToFileURL(value)
  }

  return URL.parse(value, base) || pathToFileURL(value)
}

function urlToPath(url) {
  if (url.protocol === 'file:') return fileURLToPath(url)

  assertValidURLPath(url)

  return decodeURIComponent(url.pathname)
}

function urlToDirname(url) {
  if (url.protocol === 'file:') return path.dirname(fileURLToPath(url))

  assertValidURLPath(url)

  return decodeURIComponent(new URL('.', url).pathname).replace(/\/$/, '')
}

function assertValidURLPath(url) {
  if (isWindows) {
    if (/%2f|%5c/i.test(url.pathname)) {
      throw errors.INVALID_URL_PATH('The URL path must not include encoded \\ or / characters')
    }
  } else {
    if (/%2f/i.test(url.pathname)) {
      throw errors.INVALID_URL_PATH('The URL path must not include encoded / characters')
    }
  }
}
