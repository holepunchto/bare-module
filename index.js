const path = require('path')
const os = require('os')
const Addon = require('addon')
const Bundle = require('bare-bundle')
const Protocol = require('./lib/protocol')
const constants = require('./lib/constants')
const errors = require('./lib/errors')
const binding = require('./binding')

module.exports = exports = class Module {
  constructor (filename) {
    this._filename = filename
    this._state = 0
    this._type = 0
    this._defaultType = this._type
    this._main = null
    this._exports = null
    this._imports = null
    this._info = null
    this._protocol = null
    this._handle = null

    Module._modules.add(this)
  }

  get type () {
    return this._type
  }

  get defaultType () {
    return this._defaultType
  }

  get filename () {
    return this._filename
  }

  get dirname () {
    return path.dirname(this._filename)
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

  // For Node.js compatibility
  get id () {
    return this.filename
  }

  // For Node.s compatibility
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

  [Symbol.for('bare.inspect')] () {
    return {
      __proto__: { constructor: Module },

      type: this.type,
      defaultType: this.defaultType,
      filename: this.filename,
      dirname: this.dirname,
      main: this.main,
      exports: this.exports
    }
  }

  static _extensions = Object.create(null)
  static _protocols = Object.create(null)
  static _builtins = Object.create(null)
  static _imports = Object.create(null)
  static _cache = Object.create(null)
  static _bundles = Object.create(null)
  static _modules = new Set()

  static _handle = binding.init(this, this._onimport, this._onevaluate, this._onmeta)

  static _onimport (specifier, assertions, referrerFilename, dynamic) {
    const referrer = this._cache[referrerFilename]

    let protocol, imports

    if (referrer) {
      protocol = this._protocolFor(specifier, referrer._protocol)

      imports = referrer._imports

      specifier = this.resolve(specifier, path.dirname(referrer._filename), {
        protocol,
        imports,
        referrer
      })
    } else {
      specifier = this.resolve(specifier)
    }

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
      imports,
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
    const module = this._cache[specifier]

    const resolve = (specifier) => {
      return this.resolve(specifier, path.dirname(module._filename), {
        protocol: this._protocolFor(specifier, module._protocol),
        imports: module._imports,
        referrer: module
      })
    }

    meta.url = module._filename
    meta.main = module._main === module
    meta.resolve = resolve
  }

  static Protocol = Protocol
  static Bundle = Bundle
  static constants = constants

  static get cache () {
    return this._cache
  }

  static get builtinModules () {
    return Object.keys(this._builtins)
  }

  static isBuiltin (name) {
    return name in this._builtins
  }

  static createRequire (filename, opts = {}) {
    const {
      imports = this._imports,
      protocol = this._protocolFor(filename, this._protocols['file:']),
      type = constants.types.SCRIPT,
      defaultType = constants.types.SCRIPT
    } = opts

    const module = new Module(filename)

    module._type = type
    module._defaultType = defaultType
    module._imports = imports
    module._protocol = protocol

    const referrer = module

    const resolve = (specifier) => {
      return this.resolve(specifier, path.dirname(module._filename), {
        protocol: this._protocolFor(specifier, protocol),
        imports,
        referrer
      })
    }

    const require = (specifier) => {
      const module = this.load(resolve(specifier), {
        protocol: this._protocolFor(specifier, protocol),
        imports,
        referrer
      })

      return module._exports
    }

    require.main = module._main
    require.cache = this._cache
    require.resolve = resolve

    return require
  }

  static load (specifier, source = null, opts = {}) {
    if (!ArrayBuffer.isView(source) && typeof source !== 'string' && source !== null) {
      opts = source
      source = null
    }

    let {
      imports = this._imports,
      protocol = this._protocolFor(specifier, this._protocols['file:']),
      referrer = null,
      dynamic = false,
      main = referrer ? referrer._main : null,
      type = 0,
      defaultType = referrer ? referrer._defaultType : 0
    } = opts

    if (this._cache[specifier]) return this._transform(this._cache[specifier], referrer, dynamic)

    const bundle = this._bundleFor(path.dirname(specifier), protocol, source)

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

    const module = this._cache[specifier] = new this(specifier)

    module._defaultType = defaultType

    let dirname = path.dirname(module._filename)
    do {
      const pkg = path.join(dirname, 'package.json')

      if (protocol.exists(pkg)) {
        try {
          module._info = Module.load(pkg, { protocol })._exports
        } catch {}
        break
      }

      dirname = path.dirname(dirname)
    } while (dirname !== '/' && dirname !== '.')

    if (specifier in this._builtins) {
      module._exports = this._builtins[specifier]
    } else {
      module._main = main || module

      let extension = this._extensionFor(type) || path.extname(specifier)

      if (extension in this._extensions === false) {
        if (defaultType) extension = this._extensionFor(defaultType) || '.js'
        else extension = '.js'
      }

      if (extension === '.bundle' && path.extname(specifier) !== extension) {
        throw errors.INVALID_BUNDLE_EXTENSION(`Invalid extension for bundle '${specifier}'`)
      }

      this._extensions[extension].call(this, module, source, referrer, protocol, imports)
    }

    return this._transform(module, referrer, dynamic)
  }

  static resolve (specifier, dirname = os.cwd(), opts = {}) {
    if (typeof dirname !== 'string') {
      opts = dirname
      dirname = os.cwd()
    }

    let {
      imports = this._imports,
      protocol = this._protocols['file:'],
      referrer = null
    } = opts

    const bundle = this._bundleFor(path.dirname(specifier), protocol)

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

    const [resolved = null] = this._resolve(specifier, dirname, protocol, imports)

    if (resolved === null) {
      let msg = `Cannot find module '${specifier}'`

      if (referrer) msg += ` imported from '${referrer._filename}'`

      throw errors.MODULE_NOT_FOUND(msg)
    }

    return protocol.postresolve(resolved, dirname)
  }

  static * _resolve (specifier, dirname, protocol, imports) {
    if (specifier in imports) specifier = imports[specifier]
    else if (specifier in protocol.imports) specifier = protocol.imports[specifier]

    protocol = this._protocolFor(specifier, protocol)

    specifier = protocol.preresolve(specifier, dirname)

    if (protocol.resolve) {
      yield * protocol.resolve(specifier, dirname, imports)
    }

    if (this.isBuiltin(specifier)) {
      yield specifier
    }

    if (/^([a-z]:)?([/\\]|\.{1,2}[/\\]?)/i.test(specifier)) {
      if (specifier[0] === '.') specifier = path.join(dirname, specifier)

      yield * this._resolveFile(specifier, protocol)
      yield * this._resolveDirectory(specifier, protocol)
    }

    yield * this._resolveNodeModules(specifier, dirname, protocol)
  }

  static * _resolveFile (filename, protocol) {
    const extensions = [
      '.js',
      '.cjs',
      '.mjs',
      '.json',
      '.bare',
      '.node'
    ]

    for (const candidate of [filename, ...extensions.map(ext => filename + ext)]) {
      if (protocol.exists(candidate)) yield candidate
    }
  }

  static * _resolveIndex (dirname, protocol) {
    yield * this._resolveFile(path.join(dirname, 'index'), protocol)
  }

  static * _resolveDirectory (dirname, protocol) {
    const pkg = path.join(dirname, 'package.json')

    if (protocol.exists(pkg)) {
      let info = null
      try {
        info = this.load(pkg, { protocol })._exports
      } catch {}

      if (info) {
        let specifier

        if (info.exports) {
          specifier = this._mapConditionalExport('.', dirname, info.exports)

          if (specifier) specifier = path.join(dirname, specifier)
          else return
        } else if (info.main) {
          specifier = path.join(dirname, info.main)
        }

        yield * this._resolveFile(specifier, protocol)
        yield * this._resolveIndex(specifier, protocol)
      }
    }

    yield * this._resolveIndex(dirname, protocol)
  }

  static * _resolveNodeModules (specifier, dirname, protocol) {
    for (const nodeModules of this._resolveNodeModulesPaths(dirname)) {
      const [, name, expansion = '.'] = /^((?:@[^/\\%]+\/)?[^./\\%][^/\\%]*)(\/.*)?$/.exec(specifier) || []

      if (name) {
        const pkg = path.join(nodeModules, name, 'package.json')

        if (protocol.exists(pkg)) {
          let info = null
          try {
            info = this.load(pkg, { protocol })._exports
          } catch {}

          if (info) {
            if (info.exports) {
              specifier = this._mapConditionalExport(expansion, dirname, info.exports)

              if (specifier) specifier = path.join(name, specifier)
              else return
            }
          }
        }
      }

      const filename = path.join(nodeModules, specifier)

      yield * this._resolveFile(filename, protocol)
      yield * this._resolveDirectory(filename, protocol)
    }
  }

  static * _resolveNodeModulesPaths (start) {
    if (start === path.sep) return yield path.join(start, 'node_modules')

    const parts = start.split(path.sep)

    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i] !== 'node_modules') {
        yield path.join(parts.slice(0, i + 1).join(path.sep), 'node_modules')
      }
    }
  }

  static _mapConditionalExport (specifier, dirname, exports) {
    if (typeof exports !== 'object') exports = { '.': exports }

    if (specifier in exports) {
      specifier = search(exports[specifier])
    } else {
      specifier = search(exports)
    }

    if (specifier) specifier = path.join(dirname, specifier)

    return specifier

    function search (specifier) {
      while (true) {
        if (typeof specifier === 'string') return specifier
        if (specifier === null || typeof specifier !== 'object') return specifier
        specifier = first(specifier)
      }
    }

    function first (exports) {
      for (const key in exports) {
        switch (key) {
          case 'require':
          case 'import':
            return exports[key]
        }
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

  static _bundleFor (specifier, protocol, source = null) {
    let name = specifier
    do {
      if (path.extname(name) === '.bundle') {
        break
      }

      name = path.dirname(name)
    } while (name !== '/' && name !== '.')

    if (path.extname(name) !== '.bundle') return null

    let bundle = this._bundles[name]

    if (bundle) return bundle

    const parent = this._bundleFor(path.dirname(name), protocol)

    if (parent) {
      protocol = new Protocol({
        imports: parent.imports,

        exists (filename) {
          return parent.exists(filename)
        },

        read (filename) {
          return parent.read(filename)
        }
      })
    }

    if (source === null || name !== specifier) source = protocol.read(name)

    bundle = this._bundles[name] = Bundle.from(source).mount(name)

    return bundle
  }

  static _transform (module, referrer = null, dynamic = false) {
    if (dynamic) {
      if (module._type !== constants.types.MODULE) this._synthesize(module)
      this._evaluate(module)
    } else if (referrer) {
      if (referrer._type === constants.types.MODULE) {
        if (module._type !== constants.types.MODULE) this._synthesize(module)
      } else if (module._type === constants.types.MODULE) {
        this._evaluate(module)
      }
    } else if (module._type === constants.types.MODULE) {
      this._evaluate(module)
    }

    return module
  }

  static _evaluate (module) {
    if ((module._state & constants.states.EVALUATED) !== 0) return

    binding.runModule(module._handle, this._handle)

    if (module._type === constants.types.MODULE) {
      module._exports = binding.getNamespace(module._handle)
    }

    module._state |= constants.states.EVALUATED
  }

  static _synthesize (module) {
    if ((module._state & constants.states.SYNTHESIZED) !== 0) return

    const names = ['default']

    for (const key of Object.keys(module._exports)) {
      if (key !== 'default') names.push(key)
    }

    module._handle = binding.createSyntheticModule(module._filename, names, this._handle)

    module._state |= constants.states.SYNTHESIZED
  }
}

exports._extensions['.js'] = function (module, source, referrer, protocol, imports) {
  const isESM = (
    // The default type is ES modules.
    (module._defaultType === constants.types.MODULE) ||

    // The package is explicitly declared as an ES module.
    (module._info && module._info.type === 'module') ||

    // The source is a data: URI and the referrer is itself an ES module.
    (protocol === this._protocols['data:'] && referrer && referrer._type === constants.types.MODULE)
  )

  const loader = this._extensions[isESM ? '.mjs' : '.cjs']

  return loader.call(this, module, source, referrer, protocol, imports)
}

exports._extensions['.cjs'] = function (module, source, referrer, protocol, imports) {
  if (source === null) source = protocol.read(module._filename)

  if (typeof source !== 'string') source = Buffer.coerce(source).toString()

  referrer = module

  const resolve = (specifier) => {
    return this.resolve(specifier, path.dirname(module._filename), {
      protocol: this._protocolFor(specifier, protocol),
      imports,
      referrer
    })
  }

  const require = (specifier) => {
    const module = this.load(resolve(specifier), {
      protocol: this._protocolFor(specifier, protocol),
      imports,
      referrer
    })

    return module._exports
  }

  module._type = constants.types.SCRIPT
  module._protocol = protocol
  module._imports = imports
  module._exports = {}

  require.main = module._main
  require.cache = this._cache
  require.resolve = resolve

  binding.createFunction(module._filename, ['require', 'module', 'exports', '__filename', '__dirname'], source, 0)(
    require,
    module,
    module._exports,
    module._filename,
    path.dirname(module._filename)
  )
}

exports._extensions['.mjs'] = function (module, source, referrer, protocol, imports) {
  if (source === null) source = protocol.read(module._filename)

  if (typeof source !== 'string') source = Buffer.coerce(source).toString()

  module._type = constants.types.MODULE
  module._protocol = protocol
  module._imports = imports
  module._handle = binding.createModule(module._filename, source, 0, this._handle)
}

exports._extensions['.json'] = function (module, source, referrer, protocol, imports) {
  if (source === null) source = protocol.read(module._filename)

  if (typeof source !== 'string') source = Buffer.coerce(source).toString()

  module._type = constants.types.JSON
  module._protocol = protocol
  module._imports = imports
  module._exports = JSON.parse(source)
}

exports._extensions['.bare'] = function (module, source, referrer, protocol, imports) {
  module._type = constants.types.ADDON
  module._protocol = protocol
  module._imports = imports
  module._exports = Addon.load(module._filename)
}

exports._extensions['.node'] = function (module, source, referrer, protocol, imports) {
  module._type = constants.types.ADDON
  module._protocol = protocol
  module._imports = imports
  module._exports = Addon.load(module._filename)
}

exports._extensions['.bundle'] = function (module, source, referrer, protocol, imports) {
  if (typeof source === 'string') source = Buffer.from(source)

  const bundle = this._bundleFor(module._filename, protocol, source)

  module._type = constants.types.BUNDLE
  module._protocol = protocol
  module._imports = imports
  module._exports = exports.load(bundle.main, bundle.read(bundle.main), { protocol, imports, referrer })._exports
}

exports._protocols['file:'] = new Protocol({
  preresolve (specifier) {
    return specifier.replace(/^file:/, '')
  },

  postresolve (specifier) {
    if (exports.isBuiltin(specifier)) return specifier
    return binding.realpath(specifier)
  },

  exists (filename) {
    return binding.exists(filename)
  },

  read (filename) {
    return Buffer.from(binding.read(filename))
  }
})

exports._protocols['node:'] = new Protocol({
  preresolve (specifier) {
    return specifier.replace(/^node:/, '')
  }
})

exports._protocols['data:'] = new Protocol({
  * resolve (specifier) {
    yield specifier
  },

  read (specifier) {
    const [, , , base64, data] = specifier.match(/data:(?:([^/]+\/[^;,]+)(;[^=]+=[^;,]+)*)?(;base64)?,(.*)/)

    return Buffer.from(decodeURIComponent(data), base64 ? 'base64' : 'ascii')
  }
})

process
  .prependListener('teardown', () => {
    for (const module of exports._modules) {
      module.destroy()
    }

    binding.destroy(exports._handle)
  })
