const path = require('@pearjs/path')
const Bundle = require('@pearjs/bundle')
const b4a = require('b4a')
const Protocol = require('./lib/protocol')
const constants = require('./lib/constants')
const binding = require('./binding')

const Module = module.exports = class Module {
  constructor (filename, dirname = path.dirname(filename)) {
    this.filename = filename
    this.dirname = dirname

    this.type = null
    this.info = null
    this.exports = null

    this._state = 0
    this._handle = null
    this._protocol = null
  }

  static _context = binding.init(this._onimport.bind(this), this._onevaluate.bind(this))

  static _extensions = Object.create(null)
  static _protocols = Object.create(null)
  static _builtins = Object.create(null)
  static _cache = Object.create(null)

  static _onimport (specifier, assertions, referrerFilename, dynamic) {
    const referrer = this._cache[referrerFilename]

    let protocol

    if (referrer) {
      protocol = referrer._protocol

      specifier = this.resolve(specifier, referrer.dirname, { protocol })
    }

    const module = this.load(specifier, { protocol, referrer })

    if (dynamic && (module._state & constants.STATE_EVALUATED) === 0) {
      binding.runModule(module._handle, this._context)

      module.exports = binding.getModuleNamespace(module._handle)

      module._state |= constants.STATE_EVALUATED
    }

    return module._handle
  }

  static _onevaluate (specifier) {
    const module = this._cache[specifier]

    binding.setExport(module._handle, 'default', module.exports)

    for (const [key, value] of Object.entries(module.exports)) {
      binding.setExport(module._handle, key, value)
    }
  }

  static Protocol = Protocol
  static Bundle = Bundle

  static isBuiltin (name) {
    return name in this._builtins
  }

  static load (specifier, source = null, opts = {}) {
    if (!ArrayBuffer.isView(source) && typeof source !== 'string' && source !== null) {
      opts = source
      source = null
    }

    let {
      referrer = null,
      protocol = null
    } = opts

    if (this._cache[specifier]) return this._synthesize(this._cache[specifier], referrer)

    let proto = specifier.slice(0, specifier.indexOf(':') + 1)

    if (protocol === null && !proto) proto = 'file:'

    if (proto in this._protocols) protocol = this._protocols[proto]

    const module = this._cache[specifier] = new this(specifier)

    let dirname = module.dirname

    while (true) {
      const pkg = path.join(dirname, 'package.json')

      if (protocol.exists(pkg)) {
        try { module.info = Module.load(pkg).exports } catch {}
        break
      }

      if (dirname === '/' || dirname === '.') break

      dirname = path.dirname(dirname)
    }

    if (specifier in this._builtins) {
      module.exports = this._builtins[specifier]
    } else {
      let extension = path.extname(specifier)

      if (extension in this._extensions === false) extension = '.js'

      this._extensions[extension].call(this, module, source, referrer, protocol)
    }

    return this._synthesize(module, referrer)
  }

  static resolve (specifier, dirname = process.cwd(), opts = {}) {
    if (typeof dirname !== 'string') {
      opts = dirname
      dirname = process.cwd()
    }

    let {
      protocol = null
    } = opts

    let proto = specifier.slice(0, specifier.indexOf(':') + 1)
    if (protocol === null && !proto) proto = 'file:'
    if (proto in this._protocols) protocol = this._protocols[proto]

    const [resolved = null] = this._resolve(protocol.map(specifier, dirname), dirname, protocol)

    if (resolved === null) {
      throw new Error('Could not resolve ' + specifier + ' from ' + dirname)
    }

    return resolved
  }

  static * _resolve (specifier, dirname, protocol) {
    if (this.isBuiltin(specifier)) {
      yield specifier
      return
    }

    if (/^(\/|\.{1,2}\/?)/.test(specifier)) {
      if (specifier[0] === '.') specifier = path.join(dirname, specifier)

      yield * this._resolveFile(specifier, protocol)
      yield * this._resolveDirectory(specifier, protocol)
      return
    }

    yield * this._resolveNodeModules(specifier, dirname, protocol)
  }

  static * _resolveFile (filename, protocol) {
    const f = filename

    if (protocol.exists(f)) yield f
    if (protocol.exists(f + '.js')) yield f + '.js'
    if (protocol.exists(f + '.cjs')) yield f + '.cjs'
    if (protocol.exists(f + '.mjs')) yield f + '.mjs'
    if (protocol.exists(f + '.json')) yield f + '.json'
    if (protocol.exists(f + '.node')) yield f + '.node'
    if (protocol.exists(f + '.pear')) yield f + '.pear'
  }

  static * _resolveIndex (dirname, protocol) {
    yield * this._resolveFile(path.join(dirname, 'index'), protocol)
  }

  static * _resolveDirectory (dirname, protocol) {
    const pkg = path.join(dirname, 'package.json')

    if (protocol.exists(pkg)) {
      const info = this.load(pkg, { protocol }).exports

      if (info.main) {
        const main = path.join(dirname, info.main)

        yield * this._resolveFile(main, protocol)
        yield * this._resolveIndex(main, protocol)
        return
      }
    }

    yield * this._resolveIndex(dirname, protocol)
  }

  static * _resolveNodeModules (specifier, dirname, protocol) {
    for (const nodeModules of this._resolvePaths(dirname)) {
      const filename = path.join(nodeModules, specifier)

      yield * this._resolveFile(filename, protocol)
      yield * this._resolveDirectory(filename, protocol)
    }
  }

  static * _resolvePaths (start) {
    if (start === path.sep) return yield path.join(start, 'node_modules')

    const parts = start.split('/')

    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i] !== 'node_modules') {
        yield path.join(parts.slice(0, i + 1).join(path.sep), 'node_modules')
      }
    }
  }

  static _synthesize (module, referrer = null) {
    if (referrer === null) return module

    if (referrer.type === 'esm' && module.type !== 'esm' && module._handle === null) {
      const names = new Set(['default', ...Object.keys(module.exports)])

      module._handle = binding.createSyntheticModule(module.filename, Array.from(names), this._context)
    }

    if (referrer.type === 'cjs' && module.type === 'esm' && module.exports === null) {
      module.exports = binding.getModuleNamespace(module._handle)
    }

    return module
  }
}

Module._extensions['.js'] = function (module, source, referrer, protocol) {
  const loader = this._extensions[
    module.info && module.info.type === 'module'
      ? '.mjs'
      : '.cjs'
  ]

  return loader.call(this, module, source, referrer, protocol)
}

Module._extensions['.cjs'] = function (module, source, context, protocol) {
  if (source === null) source = protocol.read(module.filename)

  if (typeof source !== 'string') source = b4a.toString(source)

  const resolve = (specifier) => {
    return this.resolve(specifier, module.dirname, { protocol })
  }

  const require = (specifier) => {
    return this.load(resolve(specifier), { protocol, referrer: module }).exports
  }

  module.type = 'cjs'
  module._protocol = protocol
  module.exports = {}

  require.cache = this._cache
  require.resolve = resolve

  binding.createFunction(module.filename, ['require', 'module', 'exports', '__filename', '__dirname'], source, 0)(
    require,
    module,
    module.exports,
    module.filename,
    module.dirname
  )

  module._state |= constants.STATE_EVALUATED
}

Module._extensions['.mjs'] = function (module, source, referrer, protocol) {
  if (source === null) source = protocol.read(module.filename)

  if (typeof source !== 'string') source = b4a.toString(source)

  module.type = 'esm'
  module._protocol = protocol
  module.exports = null

  module._handle = binding.createModule(module.filename, source, 0)

  if (referrer === null || referrer.type !== 'esm') {
    binding.runModule(module._handle, this._context)

    module.exports = binding.getModuleNamespace(module._handle)

    module._state |= constants.STATE_EVALUATED
  }
}

Module._extensions['.json'] = function (module, source, referrer, protocol) {
  if (source === null) source = protocol.read(module.filename)

  if (typeof source !== 'string') source = b4a.toString(source)

  module.type = 'json'
  module.exports = JSON.parse(source)

  module._state |= constants.STATE_EVALUATED
  module._protocol = protocol
}

Module._extensions['.pear'] = function (module, source, referrer, protocol) {
  module.type = 'addon'
  module.exports = process.addon(module.filename)

  module._state |= constants.STATE_EVALUATED
}

Module._extensions['.node'] = function (module, source, referrer, protocol) {
  module.type = 'addon'
  module.exports = process.addon(module.filename)

  module._state |= constants.STATE_EVALUATED
}

Module._extensions['.bundle'] = function (module, source, referrer, protocol) {
  if (source === null) source = protocol.read(module.filename)

  if (typeof source === 'string') source = b4a.from(source)

  const bundle = Bundle.from(source).mount(module.filename)

  module._state |= constants.STATE_EVALUATED
  module._protocol = protocol = new Protocol({
    map (specifier) {
      if (specifier in bundle.imports) specifier = bundle.imports[specifier]
      return specifier
    },

    exists (filename) {
      return bundle.exists(filename)
    },

    read (filename) {
      return bundle.read(filename)
    }
  })

  const entry = Module.load(bundle.main, bundle.read(bundle.main), { protocol, referrer })

  module.type = entry.type
  module.exports = entry.exports
}

process.once('exit', () => binding.destroy(Module._context))
