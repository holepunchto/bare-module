/* global Bare */
const path = require('bare-path')
const os = require('bare-os')
const url = require('bare-url')
const resolve = require('bare-module-resolve')
const Bundle = require('bare-bundle')
const Protocol = require('./lib/protocol')
const constants = require('./lib/constants')
const errors = require('./lib/errors')
const binding = require('./binding')

const Module = module.exports = exports = class Module {
  constructor (filename) {
    this._filename = filename
    this._state = 0
    this._type = 0
    this._defaultType = this._type
    this._main = null
    this._exports = null
    this._imports = null
    this._builtins = null
    this._conditions = null
    this._protocol = null
    this._bundle = null
    this._handle = null

    Module._modules.add(this)
  }

  get filename () {
    return this._filename
  }

  get dirname () {
    return path.dirname(this._filename)
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

  _transform (referrer = null, dynamic = false) {
    if (dynamic) {
      this._synthesize()
      this._evaluate()

      return this
    }

    if (referrer) {
      if (referrer._type === constants.types.MODULE) {
        this._synthesize()
      } else if (this._type === constants.types.MODULE) {
        this._evaluate()
      }

      return this
    }

    if (this._type === constants.types.MODULE) {
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

      this._handle = binding.createSyntheticModule(this._filename, names, Module._handle)
    }

    this._state |= constants.states.SYNTHESIZED
  }

  [Symbol.for('bare.inspect')] () {
    return {
      __proto__: { constructor: Module },

      filename: this.filename,
      dirname: this.dirname,
      type: this.type,
      defaultType: this.defaultType,
      main: this.main,
      exports: this.exports,
      imports: this.imports,
      builtins: this.builtins,
      conditions: this.conditions
    }
  }

  static _extensions = Object.create(null)
  static _protocols = Object.create(null)
  static _cache = Object.create(null)
  static _modules = new Set()
  static _conditions = ['import', 'require', 'bare', 'node']

  static _handle = binding.init(this, this._onimport, this._onevaluate, this._onmeta)

  static _onimport (specifier, assertions, referrerFilename, dynamic) {
    const referrer = this._cache[referrerFilename]

    const protocol = this._protocolFor(specifier, referrer._protocol)

    specifier = this.resolve(specifier, path.dirname(referrer._filename), {
      protocol,
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

    const module = this.load(specifier, {
      protocol: this._protocolFor(specifier, protocol),
      referrer,
      dynamic,
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
    const dirname = path.dirname(module._filename)

    meta.url = module._filename
    meta.main = module._main === module
    meta.resolve = resolve
    meta.addon = addon

    function resolve (specifier) {
      return self.resolve(specifier, dirname, {
        protocol: self._protocolFor(specifier, module._protocol),
        referrer
      })
    }

    function addon (specifier = '.') {
      return Bare.Addon.load(Bare.Addon.resolve(specifier, dirname, {
        referrer
      }))
    }
  }

  static Protocol = Protocol
  static Bundle = Bundle
  static constants = constants

  static get cache () {
    return this._cache
  }

  // For Node.js compatibility
  static get builtinModules () {
    return []
  }

  // For Node.js compatibility
  static isBuiltin () {
    return false
  }

  static createRequire (filename, opts = {}) {
    const self = Module

    let {
      referrer = null,
      protocol = self._protocolFor(filename, referrer ? referrer._protocol : self._protocols['file:']),
      imports = referrer ? referrer._imports : null,
      builtins = referrer ? referrer._builtins : null,
      conditions = referrer ? referrer._conditions : self._conditions,
      main = referrer ? referrer._main : null,
      defaultType = referrer ? referrer._defaultType : constants.types.SCRIPT,
      type = constants.types.SCRIPT
    } = opts

    const module = new Module(filename)

    module._main = main || module
    module._type = type
    module._defaultType = defaultType
    module._protocol = protocol
    module._imports = imports
    module._builtins = builtins
    module._conditions = conditions

    referrer = module

    const dirname = path.dirname(module._filename)

    require.main = module._main
    require.cache = self._cache
    require.resolve = resolve
    require.addon = addon

    return require

    function require (specifier) {
      const module = self.load(resolve(specifier), {
        protocol: self._protocolFor(specifier, protocol),
        referrer
      })

      return module._exports
    }

    function resolve (specifier) {
      return self.resolve(specifier, dirname, {
        protocol: self._protocolFor(specifier, protocol),
        referrer
      })
    }

    function addon (specifier = '.') {
      return Bare.Addon.load(Bare.Addon.resolve(specifier, dirname, {
        referrer
      }))
    }
  }

  static load (specifier, source = null, opts = {}) {
    const self = Module

    if (!ArrayBuffer.isView(source) && typeof source !== 'string' && source !== null) {
      opts = source
      source = null
    }

    let {
      dynamic = false,
      referrer = null,
      protocol = self._protocolFor(specifier, referrer ? referrer._protocol : self._protocols['file:']),
      imports = referrer ? referrer._imports : null,
      builtins = referrer ? referrer._builtins : null,
      conditions = referrer ? referrer._conditions : self._conditions,
      main = referrer ? referrer._main : null,
      defaultType = referrer ? referrer._defaultType : 0,
      type = 0
    } = opts

    if (self._cache[specifier]) return self._cache[specifier]._transform(referrer, dynamic)

    const bundle = self._bundleFor(path.dirname(specifier), protocol)

    if (bundle) {
      protocol = new Protocol({
        imports: bundle.imports,

        exists (filename) {
          return bundle.exists(filename)
        },

        read (filename) {
          return bundle.read(filename)
        }
      })
    }

    const module = self._cache[specifier] = new Module(specifier)

    if (builtins && specifier in builtins) {
      module._exports = builtins[specifier]
    } else {
      module._main = main || module
      module._defaultType = defaultType
      module._protocol = protocol
      module._imports = imports
      module._builtins = builtins
      module._conditions = conditions

      let extension = self._extensionFor(type) || path.extname(specifier)

      if (extension in self._extensions === false) {
        if (defaultType) extension = self._extensionFor(defaultType) || '.js'
        else extension = '.js'
      }

      if (extension === '.bundle' && path.extname(specifier) !== extension) {
        throw errors.INVALID_BUNDLE_EXTENSION(`Invalid extension for bundle '${specifier}'`)
      }

      self._extensions[extension](module, source, referrer)
    }

    return module._transform(referrer, dynamic)
  }

  static resolve (specifier, dirname = os.cwd(), opts = {}) {
    const self = Module

    if (typeof dirname !== 'string') {
      opts = dirname
      dirname = os.cwd()
    }

    let {
      referrer = null,
      protocol = referrer ? referrer._protocol : self._protocols['file:'],
      imports = referrer ? referrer._imports : null,
      builtins = referrer ? referrer._builtins : null,
      conditions = referrer ? referrer._conditions : self._conditions
    } = opts

    const bundle = self._bundleFor(path.dirname(specifier), protocol)

    if (bundle) {
      protocol = new Protocol({
        imports: bundle.imports,

        exists (filename) {
          return bundle.exists(filename)
        },

        read (filename) {
          return bundle.read(filename)
        }
      })
    }

    const resolved = protocol.preresolve(specifier, dirname)

    const [resolution] = protocol.resolve(specifier, dirname, imports)

    if (resolution) return protocol.postresolve(resolution, dirname)

    if (protocol.imports) {
      imports = Object.assign(Object.create(null), protocol.imports, imports)
    }

    const parentURL = url.pathToFileURL(dirname[dirname.length - 1] === path.sep ? dirname : dirname + '/')

    for (const resolution of resolve(resolved, parentURL, {
      conditions,
      imports,
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
        case 'builtin:': return resolution.pathname

        case 'file:': {
          const path = url.fileURLToPath(resolution)

          if (protocol.exists(path)) {
            return protocol.postresolve(path, dirname)
          }
        }
      }
    }

    let msg = `Cannot find module '${specifier}'`

    if (referrer) msg += ` imported from '${referrer._filename}'`

    throw errors.MODULE_NOT_FOUND(msg)

    function readPackage (packageURL) {
      const path = url.fileURLToPath(packageURL)

      if (protocol.exists(path)) {
        return Module.load(path, { protocol })._exports
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

  static _protocolFor (specifier, fallback = null) {
    let protocol = fallback

    const i = specifier.indexOf(':')

    if (i >= 2) { // Allow drive letters in Windows paths
      const name = specifier.slice(0, i + 1)

      protocol = this._protocols[name] || fallback

      if (protocol === null) {
        throw errors.UNKNOWN_PROTOCOL(`Unknown protocol '${name}' in specifier '${specifier}'`)
      }
    }

    return protocol
  }

  static _bundleFor (specifier, protocol) {
    let name = specifier
    do {
      if (path.extname(name) === '.bundle') {
        break
      }

      name = path.dirname(name)
    } while (name !== path.sep && name !== '.')

    if (path.extname(name) !== '.bundle') return null

    return Module.load(name, { protocol })._bundle
  }
}

Module._extensions['.js'] = function (module, source, referrer) {
  const self = Module

  const protocol = module._protocol

  let pkg
  let dirname = path.dirname(module._filename)
  do {
    const specifier = path.join(dirname, 'package.json')

    if (self._cache[specifier]) {
      pkg = self._cache[specifier]
      break
    }

    if (protocol.exists(specifier)) {
      pkg = self.load(specifier, { protocol })
      break
    }

    dirname = path.dirname(dirname)
  } while (dirname !== path.sep && dirname !== '.')

  const info = (pkg && pkg._exports) || {}

  const isESM = (
    // The default type is ES modules.
    (constants.types.MODULE === module._defaultType) ||

    // The package is explicitly declared as an ES module.
    (info && info.type === 'module') ||

    // The source is a data: URI and the referrer is itself an ES module.
    (protocol === self._protocols['data:'] && referrer && referrer._type === constants.types.MODULE)
  )

  return self._extensions[isESM ? '.mjs' : '.cjs'](module, source, referrer)
}

Module._extensions['.cjs'] = function (module, source, referrer) {
  const self = Module

  const protocol = module._protocol

  module._type = constants.types.SCRIPT

  if (protocol.load) {
    module._exports = protocol.load(module._filename)
  } else {
    if (source === null) source = protocol.read(module._filename)

    if (typeof source !== 'string') source = Buffer.coerce(source).toString()

    referrer = module

    const dirname = path.dirname(module._filename)

    require.main = module._main
    require.cache = self._cache
    require.resolve = resolve
    require.addon = addon

    module._exports = {}

    binding.createFunction(module._filename, ['require', 'module', 'exports', '__filename', '__dirname'], source, 0)(
      require,
      module,
      module._exports,
      module._filename,
      path.dirname(module._filename)
    )

    function require (specifier) {
      const module = self.load(resolve(specifier), {
        protocol: self._protocolFor(specifier, protocol),
        referrer
      })

      return module._exports
    }

    function resolve (specifier) {
      return self.resolve(specifier, dirname, {
        protocol: self._protocolFor(specifier, protocol),
        referrer
      })
    }

    function addon (specifier = '.') {
      return Bare.Addon.load(Bare.Addon.resolve(specifier, dirname, {
        referrer
      }))
    }
  }
}

Module._extensions['.mjs'] = function (module, source, referrer) {
  const self = Module

  const protocol = module._protocol

  module._type = constants.types.MODULE

  if (protocol.load) {
    module._exports = protocol.load(module._filename)
  } else {
    if (source === null) source = protocol.read(module._filename)

    if (typeof source !== 'string') source = Buffer.coerce(source).toString()

    module._handle = binding.createModule(module._filename, source, 0, self._handle)
  }
}

Module._extensions['.json'] = function (module, source, referrer) {
  const protocol = module._protocol

  module._type = constants.types.JSON

  if (protocol.load) {
    module._exports = protocol.load(module._filename)
  } else {
    if (source === null) source = protocol.read(module._filename)

    if (typeof source !== 'string') source = Buffer.coerce(source).toString()

    module._exports = JSON.parse(source)
  }
}

Module._extensions['.bare'] = function (module, source, referrer) {
  module._type = constants.types.ADDON

  module._exports = Bare.Addon.load(module._filename)
}

Module._extensions['.node'] = function (module, source, referrer) {
  module._type = constants.types.ADDON

  module._exports = Bare.Addon.load(module._filename)
}

Module._extensions['.bundle'] = function (module, source, referrer) {
  const self = Module

  const protocol = module._protocol

  module._type = constants.types.BUNDLE

  if (source === null) source = protocol.read(module._filename)

  if (typeof source === 'string') source = Buffer.from(source)

  const bundle = module._bundle = Bundle.from(source).mount(module._filename)

  if (bundle.main) {
    module._exports = self.load(bundle.main, bundle.read(bundle.main), { protocol, referrer })._exports
  }
}

Module._protocols['file:'] = new Protocol({
  postresolve (specifier) {
    return binding.realpath(specifier)
  },

  exists (filename) {
    return binding.exists(filename)
  },

  read (filename) {
    return Buffer.from(binding.read(filename))
  }
})

Module._protocols['data:'] = new Protocol({
  * resolve (specifier) {
    yield specifier
  },

  read (specifier) {
    const [, , , base64, data] = specifier.match(/data:(?:([^/]+\/[^;,]+)(;[^=]+=[^;,]+)*)?(;base64)?,(.*)/)

    return Buffer.from(decodeURIComponent(data), base64 ? 'base64' : 'ascii')
  }
})

Bare
  .prependListener('teardown', () => {
    for (const module of Module._modules) {
      module.destroy()
    }

    binding.destroy(Module._handle)
  })
