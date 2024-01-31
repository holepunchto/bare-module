/* global Bare */
const path = require('bare-path')
const url = require('bare-url')
const resolve = require('bare-module-resolve')
const Bundle = require('bare-bundle')
const Protocol = require('./lib/protocol')
const constants = require('./lib/constants')
const errors = require('./lib/errors')
const binding = require('./binding')

const Module = module.exports = exports = class Module {
  constructor (url) {
    this._url = url
    this._state = 0
    this._type = 0
    this._defaultType = this._type
    this._main = null
    this._exports = null
    this._imports = null
    this._resolutions = null
    this._builtins = null
    this._conditions = null
    this._protocol = null
    this._bundle = null
    this._handle = null

    Module._modules.add(this)
  }

  get url () {
    return this._url
  }

  get filename () {
    return url.fileURLToPath(this._url)
  }

  get dirname () {
    return path.dirname(url.fileURLToPath(this._url))
  }

  get type () {
    return this._type
  }

  get defaultType () {
    return this._defaultType
  }

  get main () {
    return this._main
  }

  get exports () {
    return this._exports
  }

  set exports (value) {
    this._exports = value
  }

  get imports () {
    return this._imports
  }

  get resolutions () {
    return this._resolutions
  }

  get builtins () {
    return this._builtins
  }

  get conditions () {
    return Array.from(this._conditions)
  }

  get protocol () {
    return this._protocol
  }

  // For Node.js compatibility
  get id () {
    return this.filename
  }

  // For Node.js compatibility
  get path () {
    return this.dirname
  }

  destroy () {
    this._state |= constants.states.DESTROYED

    if (this._handle) {
      binding.deleteModule(this._handle)
      this._handle = null
    }

    Module._modules.delete(this)
  }

  _transform (isImport, isDynamicImport) {
    if (isDynamicImport) {
      this._synthesize()
      this._evaluate()
    } else if (isImport) {
      this._synthesize()
    } else if (this._type === constants.types.MODULE) {
      this._evaluate()
    }

    return this
  }

  _evaluate () {
    if ((this._state & constants.states.EVALUATED) !== 0) return

    binding.runModule(this._handle, Module._handle)

    if (this._type === constants.types.MODULE) {
      this._exports = binding.getNamespace(this._handle)
    }

    this._state |= constants.states.EVALUATED
  }

  _synthesize () {
    if ((this._state & constants.states.SYNTHESIZED) !== 0) return

    if (this._type !== constants.types.MODULE) {
      const names = ['default']

      for (const key of Object.keys(this._exports)) {
        if (key !== 'default') names.push(key)
      }

      this._handle = binding.createSyntheticModule(this._url.href, names, Module._handle)
    }

    this._state |= constants.states.SYNTHESIZED
  }

  [Symbol.for('bare.inspect')] () {
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
  static _protocols = Object.create(null)
  static _cache = Object.create(null)
  static _modules = new Set()
  static _conditions = ['bare', 'node']

  static _handle = binding.init(this, this._onimport, this._onevaluate, this._onmeta)

  static _onimport (specifier, assertions, referrerURL, isDynamicImport) {
    const referrer = this._cache[referrerURL]

    const url = this.resolve(specifier, referrer._url, {
      isImport: true,
      referrer
    })

    let type

    switch (assertions.type) {
      case 'module':
        type = constants.types.MODULE
        break
      case 'json':
        type = constants.types.JSON
        break
    }

    const module = this.load(url, {
      isImport: true,
      isDynamicImport,
      referrer,
      type
    })

    return module._handle
  }

  static _onevaluate (specifier) {
    const module = this._cache[specifier]

    binding.setExport(module._handle, 'default', module._exports)

    for (const [key, value] of Object.entries(module._exports)) {
      binding.setExport(module._handle, key, value)
    }
  }

  static _onmeta (specifier, meta) {
    const self = Module

    const module = this._cache[specifier]

    const referrer = module

    addon.host = Bare.Addon.host

    meta.url = module._url.href
    meta.main = module._main === module
    meta.resolve = resolve
    meta.addon = addon

    function resolve (specifier) {
      const resolved = self.resolve(specifier, referrer._url, { referrer })

      switch (resolved.protocol) {
        case 'builtin:': return resolved.pathname
        default: return resolved.href
      }
    }

    function addon (specifier = '.') {
      const resolved = Bare.Addon.resolve(specifier, referrer._url, { referrer })

      const addon = Bare.Addon.load(resolved)

      return addon._exports
    }
  }

  static Protocol = Protocol
  static Bundle = Bundle
  static constants = constants

  static get cache () {
    return this._cache
  }

  static load (url, source = null, opts = {}) {
    const self = Module

    if (!ArrayBuffer.isView(source) && typeof source !== 'string' && source !== null) {
      opts = source
      source = null
    }

    const {
      isImport = false,
      isDynamicImport = false,

      referrer = null,
      type = 0,
      defaultType = referrer ? referrer._defaultType : 0,
      main = referrer ? referrer._main : null,
      protocol = referrer ? referrer._protocol : self._protocols['file:'],
      imports = referrer ? referrer._imports : null,
      resolutions = referrer ? referrer._resolutions : null,
      builtins = referrer ? referrer._builtins : null,
      conditions = referrer ? referrer._conditions : self._conditions
    } = opts

    if (self._cache[url.href]) return self._cache[url.href]._transform(isImport, isDynamicImport)

    const module = self._cache[url.href] = new Module(url)

    switch (url.protocol) {
      case 'builtin:':
        module._exports = builtins[url.pathname]
        break

      default: {
        module._main = main || module
        module._defaultType = defaultType
        module._protocol = protocol
        module._imports = imports
        module._resolutions = resolutions
        module._builtins = builtins
        module._conditions = conditions

        let extension = self._extensionFor(type) || path.extname(url.pathname)

        if (extension in self._extensions === false) {
          if (defaultType) extension = self._extensionFor(defaultType) || '.js'
          else extension = '.js'
        }

        self._extensions[extension](module, source, referrer)
      }
    }

    return module._transform(isImport, isDynamicImport)
  }

  static resolve (specifier, parentURL, opts = {}) {
    const self = Module

    if (typeof specifier !== 'string') {
      throw new TypeError(`Specifier must be a string. Received type ${typeof specifier} (${specifier})`)
    }

    const {
      isImport = false,

      referrer = null,
      protocol = referrer ? referrer._protocol : self._protocols['file:'],
      imports = referrer ? referrer._imports : null,
      resolutions = referrer ? referrer._resolutions : null,
      builtins = referrer ? referrer._builtins : null,
      conditions = referrer ? referrer._conditions : self._conditions
    } = opts

    const resolved = protocol.preresolve(specifier, parentURL)

    const [resolution] = protocol.resolve(specifier, parentURL, imports)

    if (resolution) return protocol.postresolve(resolution, parentURL)

    for (const resolution of resolve(resolved, parentURL, {
      conditions: isImport ? ['import', ...conditions] : ['require', ...conditions],
      imports,
      resolutions,
      builtins: builtins ? Object.keys(builtins) : [],
      extensions: [
        '.js',
        '.cjs',
        '.mjs',
        '.json',
        '.bare',
        '.node'
      ]
    }, readPackage)) {
      switch (resolution.protocol) {
        case 'builtin:': return resolution
        default:
          if (protocol.exists(resolution)) {
            return protocol.postresolve(resolution, parentURL)
          }
      }
    }

    let msg = `Cannot find module '${specifier}'`

    if (referrer) msg += ` imported from '${referrer._url.href}'`

    throw errors.MODULE_NOT_FOUND(msg)

    function readPackage (packageURL) {
      if (protocol.exists(packageURL)) {
        return Module.load(packageURL, { protocol })._exports
      }

      return null
    }
  }

  static _extensionFor (type) {
    switch (type) {
      case constants.types.SCRIPT:
        return '.cjs'
      case constants.types.MODULE:
        return '.esm'
      case constants.types.JSON:
        return '.json'
      case constants.types.BUNDLE:
        return '.bundle'
      case constants.types.ADDON:
        return '.bare'
      default:
        return null
    }
  }
}

// For Node.js compatibility
exports.builtinModules = []

// For Node.js compatibility
exports.isBuiltin = function isBuiltin () {
  return false
}

exports.createRequire = function createRequire (parentURL, opts = {}) {
  const self = Module

  if (typeof parentURL === 'string') parentURL = new URL(parentURL, 'file:')

  let {
    referrer = null,
    protocol = referrer ? referrer._protocol : self._protocols['file:'],
    imports = referrer ? referrer._imports : null,
    resolutions = referrer ? referrer._resolutions : null,
    builtins = referrer ? referrer._builtins : null,
    conditions = referrer ? referrer._conditions : self._conditions,
    main = referrer ? referrer._main : null,
    defaultType = referrer ? referrer._defaultType : constants.types.SCRIPT,
    type = constants.types.SCRIPT
  } = opts

  const module = new Module(parentURL)

  module._main = main || module
  module._type = type
  module._defaultType = defaultType
  module._protocol = protocol
  module._imports = imports
  module._resolutions = resolutions
  module._builtins = builtins
  module._conditions = conditions

  referrer = module

  addon.host = Bare.Addon.host

  require.main = module._main
  require.cache = self._cache
  require.resolve = resolve
  require.addon = addon

  return require

  function require (specifier) {
    const resolved = self.resolve(specifier, referrer._url, { referrer })

    const module = self.load(resolved, { referrer })

    return module._exports
  }

  function resolve (specifier) {
    const resolved = self.resolve(specifier, referrer._url, { referrer })

    switch (resolved.protocol) {
      case 'builtin:': return resolved.pathname
      default: return url.fileURLToPath(resolved)
    }
  }

  function addon (specifier = '.') {
    const resolved = Bare.Addon.resolve(specifier, referrer._url, { referrer })

    const addon = Bare.Addon.load(resolved)

    return addon._exports
  }
}

Module._extensions['.js'] = function (module, source, referrer) {
  const self = Module

  const protocol = module._protocol

  let pkg

  for (const packageURL of resolve.lookupPackageScope(module._url)) {
    if (self._cache[packageURL.href]) {
      pkg = self._cache[packageURL.href]
      break
    }

    if (protocol.exists(packageURL)) {
      pkg = self.load(packageURL, { protocol })
      break
    }
  }

  const info = (pkg && pkg._exports) || {}

  const isESM = (
    // The default type is ES modules.
    (constants.types.MODULE === module._defaultType) ||

    // The package is explicitly declared as an ES module.
    (info && info.type === 'module')
  )

  return self._extensions[isESM ? '.mjs' : '.cjs'](module, source, referrer)
}

Module._extensions['.cjs'] = function (module, source, referrer) {
  const self = Module

  const protocol = module._protocol

  module._type = constants.types.SCRIPT

  if (protocol.load) {
    module._exports = protocol.load(module._url)
  } else {
    if (source === null) source = protocol.read(module._url)

    if (typeof source !== 'string') source = Buffer.coerce(source).toString()

    referrer = module

    addon.host = Bare.Addon.host

    require.main = module._main
    require.cache = self._cache
    require.resolve = resolve
    require.addon = addon

    module._exports = {}

    const filename = url.fileURLToPath(module._url)

    binding.createFunction(module._url.href, ['require', 'module', 'exports', '__filename', '__dirname'], source, 0)(
      require,
      module,
      module._exports,
      filename,
      path.dirname(filename)
    )

    function require (specifier) {
      const resolved = self.resolve(specifier, referrer._url, { referrer })

      const module = self.load(resolved, { referrer })

      return module._exports
    }

    function resolve (specifier) {
      const resolved = self.resolve(specifier, referrer._url, { referrer })

      switch (resolved.protocol) {
        case 'builtin:': return resolved.pathname
        default: url.fileURLToPath(resolved)
      }
    }

    function addon (specifier = '.') {
      const resolved = Bare.Addon.resolve(specifier, referrer._url, { referrer })

      const addon = Bare.Addon.load(resolved)

      return addon._exports
    }
  }
}

Module._extensions['.mjs'] = function (module, source, referrer) {
  const self = Module

  const protocol = module._protocol

  module._type = constants.types.MODULE

  if (protocol.load) {
    module._exports = protocol.load(module._url)
  } else {
    if (source === null) source = protocol.read(module._url)

    if (typeof source !== 'string') source = Buffer.coerce(source).toString()

    module._handle = binding.createModule(module._url.href, source, 0, self._handle)
  }
}

Module._extensions['.json'] = function (module, source, referrer) {
  const protocol = module._protocol

  module._type = constants.types.JSON

  if (protocol.load) {
    module._exports = protocol.load(module._url)
  } else {
    if (source === null) source = protocol.read(module._url)

    if (typeof source !== 'string') source = Buffer.coerce(source).toString()

    module._exports = JSON.parse(source)
  }
}

Module._extensions['.bare'] = function (module, source, referrer) {
  module._type = constants.types.ADDON

  module._exports = Bare.Addon.load(module._url).exports
}

Module._extensions['.node'] = function (module, source, referrer) {
  module._type = constants.types.ADDON

  module._exports = Bare.Addon.load(module._url).exports
}

Module._extensions['.bundle'] = function (module, source, referrer) {
  const self = Module

  const protocol = module._protocol

  module._type = constants.types.BUNDLE

  if (source === null) source = protocol.read(module._url)

  if (typeof source === 'string') source = Buffer.from(source)

  referrer = module

  const bundle = module._bundle = Bundle.from(source).mount(module._url.href + '/')

  module._imports = bundle.imports
  module._resolutions = bundle.resolutions

  module._protocol = new Protocol({
    exists (url) {
      return bundle.exists(url.href)
    },

    read (url) {
      return bundle.read(url.href)
    }
  })

  if (bundle.main) {
    module._exports = self.load(new URL(bundle.main), bundle.read(bundle.main), { referrer })._exports
  }
}

Module._protocols['file:'] = new Protocol({
  postresolve (fileURL) {
    return url.pathToFileURL(binding.realpath(url.fileURLToPath(fileURL)))
  },

  exists (fileURL) {
    return binding.exists(url.fileURLToPath(fileURL))
  },

  read (fileURL) {
    return Buffer.from(binding.read(url.fileURLToPath(fileURL)))
  }
})

Bare
  .prependListener('teardown', () => {
    for (const module of Module._modules) {
      module.destroy()
    }

    binding.destroy(Module._handle)
  })
