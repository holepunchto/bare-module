const path = require('bare-path')
const resolve = require('bare-module-resolve')
const { isURL, pathToFileURL } = require('bare-url')
const Bundle = require('bare-bundle')
const ModuleProtocol = require('./protocol')
const ModuleContext = require('./context')
const { urlToPath, urlToDirname } = require('./helpers')
const constants = require('./constants')
const errors = require('./errors')
const binding = require('../binding')

const { startsWithWindowsDriveLetter } = resolve

const defaultExtensions = ['.js', '.cjs', '.mjs', '.ts', '.cts', '.mts', '.json', '.bare', '.node']
const defaultConditions = ['bare', 'node', ...Bare.Addon.host.split('-')]
const defaultCache = Object.create(null)
const defaultResolutions = Object.create(null)

// The default protocol has no capabilities of its own; in particular, it
// cannot read from the file system. Embedders that wish to load modules from a
// backing store, such as the file system, must provide their own protocol.
const defaultProtocol = new ModuleProtocol()

const defaultContext = new ModuleContext({
  defaultType: 0,
  main: null,
  protocol: defaultProtocol,
  cache: defaultCache,
  imports: null,
  resolutions: defaultResolutions,
  builtins: null,
  conditions: defaultConditions
})

class Module {
  constructor(url) {
    this._url = url
    this._state = 0
    this._context = null
    this._promise = null

    this.exports = null
  }

  get url() {
    return this._url
  }

  get type() {
    return 0
  }

  get defaultType() {
    return this._context === null ? 0 : this._context.defaultType
  }

  get main() {
    return this._context === null ? null : this._context.main
  }

  get imports() {
    return this._context === null ? null : this._context.imports
  }

  get resolutions() {
    return this._context === null ? null : this._context.resolutions
  }

  get builtins() {
    return this._context === null ? null : this._context.builtins
  }

  get conditions() {
    return this._context === null ? defaultConditions : Array.from(this._context.conditions)
  }

  get protocol() {
    return this._context === null ? null : this._context.protocol
  }

  get cache() {
    return this._context === null ? null : this._context.cache
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

  // Bring the module to the state required by how it is being loaded: run it
  // for a dynamic import, synthesize it for a static import so it can be linked
  // into the importer, or evaluate it for a plain require.
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

  // Prepare the module for use by the ES module system. The base implementation
  // is a no-op suitable for modules that are themselves native modules, such as
  // ES modules; synthetic modules override this to build a native synthetic
  // module from their JavaScript exports.
  _synthesize() {
    if ((this._state & constants.state.SYNTHESIZED) !== 0) return

    this._state |= constants.state.SYNTHESIZED
  }

  // Produce the module's exports. The base implementation is a no-op suitable
  // for modules whose exports are known at load time; script and ES modules
  // override this to run their code.
  _evaluate() {
    if ((this._state & constants.state.EVALUATED) !== 0) return

    this._state |= constants.state.EVALUATED
  }

  // Instantiate and run this module's native module, synthesizing it first so a
  // native module exists to run. The resulting promise settles when the module,
  // and its dependencies, have finished evaluating.
  _run() {
    if ((this._state & constants.state.RUN) !== 0) return

    this._state |= constants.state.RUN

    this._synthesize()

    this._promise = binding.runModule(this, Module._handle, Module._onrun)
  }

  // Contribute this module's export names to a synthetic module being built by
  // a referrer. The base implementation contributes nothing beyond the default
  // export that every synthetic module starts with.
  _exportNames(names, queue) {}

  [Symbol.for('bare.inspect')]() {
    return {
      __proto__: { constructor: Module },

      url: this.url,
      type: this.type,
      defaultType: this.defaultType,
      main: this.main,
      exports: this.exports
    }
  }

  static get protocol() {
    return defaultProtocol
  }

  static get cache() {
    return defaultCache
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
    const inherited = referrer ? referrer._context : defaultContext

    const {
      isImport = false,
      isDynamicImport = false,
      attributes,
      type = typeForAttributes(attributes),
      defaultType = inherited.defaultType,
      main = inherited.main,
      protocol = inherited.protocol,
      imports = inherited.imports,
      builtins = inherited.builtins,
      conditions = inherited.conditions
    } = opts

    const cache = cacheFor(opts.cache, referrer ? inherited.cache : undefined)
    const resolutions = resolutionsFor(opts, referrer ? inherited.resolutions : undefined)

    let module = cache[url.href] || null

    if (module !== null) {
      if (type !== 0 && type !== module.type) {
        throw errors.TYPE_INCOMPATIBLE(
          `Module '${module.url.href}' is not of type '${nameOfType(type)}'`
        )
      }

      return module._transform(isImport, isDynamicImport)
    }

    try {
      if (url.protocol === 'builtin:') {
        module = cache[url.href] = new BuiltinModule(url)

        module.exports = builtins[url.pathname]
      } else {
        let context

        // Share the referrer's context unless this load overrides any of the
        // context fields, in which case a fresh context is built. The main
        // self-reference is resolved once the module instance exists.
        if (referrer !== null && !hasContextOverride(opts)) {
          context = referrer._context
        } else {
          context = new ModuleContext({
            defaultType,
            main,
            protocol,
            cache,
            imports,
            resolutions,
            builtins,
            conditions
          })
        }

        // Select the concrete module class from the requested or derived
        // extension, probing the nearest package scope for ambiguous ones.
        let extension = canonicalExtensionForType(type) || path.extname(url.pathname)

        if (extension in moduleByExtension === false) {
          extension = canonicalExtensionForType(defaultType) || '.js'
        }

        const ModuleClass = selectModule(extension, url, context)

        module = cache[url.href] = new ModuleClass(url)

        module._context = context

        // A module with no explicit main is the main of its own graph.
        if (module._context.main === null) module._context.main = module

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
            type: constants.type.JSON
          })

          module._context = module._context.fork({
            imports: mixinImports(module._context.imports, imports.exports, resolved)
          })
        }

        module._initialize(source, referrer, extension)
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
    const inherited = referrer ? referrer._context : defaultContext

    const {
      isImport = false,
      attributes,
      type = typeForAttributes(attributes),
      extensions = extensionsForType(type),
      protocol = inherited.protocol,
      imports = inherited.imports,
      builtins = inherited.builtins,
      conditions = inherited.conditions
    } = opts

    const cache = cacheFor(opts.cache, referrer ? referrer._context.cache : undefined)
    const resolutions = resolutionsFor(opts, referrer ? referrer._context.resolutions : undefined)

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
    const inherited = referrer ? referrer._context : defaultContext

    const {
      protocol = inherited.protocol,
      imports = inherited.imports,
      conditions = inherited.conditions
    } = opts

    const cache = cacheFor(opts.cache, referrer ? referrer._context.cache : undefined)
    const resolutions = resolutionsFor(opts, referrer ? referrer._context.resolutions : undefined)

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

      if (protocol.exists(resolution, constants.type.ASSET)) {
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

  static _registry = new WeakMap()

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

    return isDynamicImport ? module._promise.then(() => binding.getModuleNamespace(module)) : module
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
        (typeof module.exports !== 'object' ||
          module.exports === null ||
          name in module.exports === false)
      ) {
        value = module.exports
      } else {
        value = module.exports[name]
      }

      binding.setModuleExport(module, name, value)
    }
  }

  static _onmeta(id, meta) {
    const module = this._registry.get(id) || null

    if (module === null) {
      throw errors.MODULE_NOT_FOUND('Cannot find module')
    }

    const referrer = module

    meta.url = module._url.href
    meta.main = module._context.main === module
    meta.cache = module._context.cache

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

      return addon.exports
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
}

module.exports = exports = Module

const ESModule = require('./module/esm')
const CommonJSModule = require('./module/commonjs')
const JSONModule = require('./module/json')
const TextModule = require('./module/text')
const BinaryModule = require('./module/binary')
const AddonModule = require('./module/addon')
const BundleModule = require('./module/bundle')
const BuiltinModule = require('./module/builtin')

exports.createRequire = function createRequire(parentURL, opts = {}) {
  const inherited = opts.referrer ? opts.referrer._context : defaultContext

  const {
    defaultType = inherited.defaultType || constants.type.SCRIPT,
    main = inherited.main,
    protocol = inherited.protocol,
    imports = inherited.imports,
    builtins = inherited.builtins,
    conditions = inherited.conditions
  } = opts

  const cache = cacheFor(opts.cache, opts.referrer ? inherited.cache : undefined)
  const resolutions = resolutionsFor(opts, opts.referrer ? inherited.resolutions : undefined)

  let module = opts.module || null

  if (module === null) {
    module = new Module(toURL(parentURL))

    module._context = new ModuleContext({
      defaultType,
      main,
      protocol,
      cache,
      imports,
      resolutions,
      builtins,
      conditions
    })

    if (module._context.main === null) module._context.main = module
  }

  const referrer = module

  function require(specifier, opts = {}) {
    const attributes = opts && opts.with

    const resolved = Module.resolve(specifier, referrer._url, {
      referrer,
      attributes
    })

    const module = Module.load(resolved, { referrer, attributes })

    return module.exports
  }

  require.main = module._context.main
  require.cache = module._context.cache

  require.resolve = function resolve(specifier, parentURL = referrer._url) {
    return urlToPath(Module.resolve(specifier, toURL(parentURL, referrer._url), { referrer }))
  }

  require.addon = function addon(specifier = '.', parentURL = referrer._url) {
    const resolved = Bare.Addon.resolve(specifier, toURL(parentURL, referrer._url), { referrer })

    const addon = Bare.Addon.load(resolved, { referrer })

    return addon.exports
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

function hasContextOverride(opts) {
  return (
    opts.defaultType !== undefined ||
    opts.main !== undefined ||
    opts.cache !== undefined ||
    opts.protocol !== undefined ||
    opts.imports !== undefined ||
    opts.resolutions !== undefined ||
    opts.builtins !== undefined ||
    opts.conditions !== undefined
  )
}

function cacheFor(cache, fallback = Object.create(null)) {
  // The shared default cache is opt-in; it is only used when explicitly
  // requested with `cache: true`.
  if (cache === true) return defaultCache

  // A fresh cache is used when explicitly requested with `cache: false`.
  if (cache === false) return Object.create(null)

  // When left unspecified, the cache is inherited from the referrer so a
  // module graph shares a single cache, falling back to a fresh one at the
  // root of a graph.
  if (cache === undefined) return fallback

  return cache
}

function resolutionsFor(opts, fallback = Object.create(null)) {
  if (opts.resolutions !== undefined) return opts.resolutions

  // Mirror the cache: resolutions live for as long as the cache they are paired
  // with, so a shared cache shares its resolutions and a fresh cache gets fresh
  // resolutions.
  if (opts.cache === true) return defaultResolutions

  if (opts.cache === undefined) return fallback

  return Object.create(null)
}

function readPackageFor(protocol, cache) {
  return function readPackage(packageURL) {
    if (protocol.exists(packageURL, constants.type.JSON)) {
      return Module.load(packageURL, { protocol, cache }).exports
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
  [constants.type.SCRIPT]: {
    name: 'script',
    attribute: 'script',
    canonicalExtension: '.cjs',
    extensions: ['.js', '.cjs', '.ts', '.cts']
  },
  [constants.type.MODULE]: {
    name: 'module',
    attribute: 'module',
    canonicalExtension: '.mjs',
    extensions: ['.js', '.mjs', '.ts', '.mts']
  },
  [constants.type.JSON]: {
    name: 'json',
    attribute: 'json',
    canonicalExtension: '.json',
    extensions: ['.json']
  },
  [constants.type.BUNDLE]: {
    name: 'bundle',
    attribute: 'bundle',
    canonicalExtension: '.bundle',
    extensions: ['.bundle']
  },
  [constants.type.ADDON]: {
    name: 'bare',
    attribute: 'addon',
    canonicalExtension: '.bare',
    extensions: ['.bare', '.node']
  },
  [constants.type.BINARY]: {
    name: 'binary',
    attribute: 'binary',
    canonicalExtension: '.bin',
    extensions: ['.bin']
  },
  [constants.type.TEXT]: {
    name: 'text',
    attribute: 'text',
    canonicalExtension: '.txt',
    extensions: ['.txt']
  }
}

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

const moduleByExtension = {
  '.js': null,
  '.cjs': CommonJSModule,
  '.mjs': ESModule,
  '.ts': null,
  '.cts': CommonJSModule,
  '.mts': ESModule,
  '.json': JSONModule,
  '.bare': AddonModule,
  '.node': AddonModule,
  '.bundle': BundleModule,
  '.bin': BinaryModule,
  '.txt': TextModule
}

function selectModule(extension, url, context) {
  return moduleByExtension[extension] || (isESModuleScope(url, context) ? ESModule : CommonJSModule)
}

function isESModuleScope(url, context) {
  const { cache, protocol, resolutions } = context

  let pkg

  for (const packageURL of resolve.lookupPackageScope(url, { resolutions })) {
    if (cache[packageURL.href]) {
      pkg = cache[packageURL.href]
      break
    }

    if (protocol.exists(packageURL, constants.type.JSON)) {
      pkg = Module.load(packageURL, { protocol, cache })
      break
    }
  }

  const info = (pkg && pkg.exports) || {}

  return (
    // The default type is ES modules.
    constants.type.MODULE === context.defaultType ||
    // The package is explicitly declared as an ES module.
    (info && info.type === 'module')
  )
}

function toURL(value, base) {
  if (isURL(value)) return value

  if (startsWithWindowsDriveLetter(value)) {
    return pathToFileURL(value)
  }

  return URL.parse(value, base) || pathToFileURL(value)
}
