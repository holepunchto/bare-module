const path = require('@pearjs/path')
const Bundle = require('@pearjs/bundle')
const b4a = require('b4a')
const Protocol = require('./lib/protocol')
const constants = require('./lib/constants')
const binding = require('./binding')

const Module = module.exports = class Module {
  constructor (filename) {
    this.filename = filename
    this.exports = null

    this._type = null
    this._info = null
    this._state = 0
    this._protocol = null
    this._handle = null
  }

  get dirname () {
    return path.dirname(this.filename)
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
      specifier = this.resolve(specifier, referrer.dirname, { protocol: protocol = referrer._protocol })
    } else {
      specifier = this.resolve(specifier)
    }

    return this.load(specifier, { protocol, referrer, dynamic })._handle
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

    const {
      referrer = null,
      protocol = this._protocols['file:'] || null,
      dynamic = false
    } = opts

    if (this._cache[specifier]) return this._transform(this._cache[specifier], referrer, dynamic)

    const module = this._cache[specifier] = new this(specifier)

    let dirname = module.dirname
    do {
      const pkg = path.join(dirname, 'package.json')

      if (protocol.exists(pkg)) {
        try {
          module._info = Module.load(pkg, { protocol }).exports
        } catch {}
        break
      }

      dirname = path.dirname(dirname)
    } while (dirname !== '/' && dirname !== '.')

    if (specifier in this._builtins) {
      module.exports = this._builtins[specifier]
    } else {
      let extension = path.extname(specifier)

      if (extension in this._extensions === false) extension = '.js'

      this._extensions[extension].call(this, module, source, referrer, protocol)
    }

    return this._transform(module, referrer, dynamic)
  }

  static resolve (specifier, dirname = process.cwd(), opts = {}) {
    if (typeof dirname !== 'string') {
      opts = dirname
      dirname = process.cwd()
    }

    const {
      protocol = this._protocols['file:'] || null
    } = opts

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
      try {
        const info = this.load(pkg, { protocol }).exports

        if (info.main) {
          const main = path.join(dirname, info.main)

          yield * this._resolveFile(main, protocol)
          yield * this._resolveIndex(main, protocol)
          return
        }
      } catch {}
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

  static _transform (module, referrer = null, dynamic = false) {
    if (dynamic) {
      if (module._type !== 'esm' && module._handle === null) {
        this._synthesize(module)
      }

      this._evaluate(module)
    } else if (referrer) {
      if (referrer._type === 'esm') {
        if (module._type !== 'esm' && module._handle === null) {
          this._synthesize(module)
        }
      } else if (module._type === 'esm') {
        this._evaluate(module)
      }
    } else if (module._type === 'esm') {
      this._evaluate(module)
    }

    return module
  }

  static _evaluate (module) {
    if ((module._state & constants.STATE_EVALUATED) !== 0) return

    binding.runModule(module._handle, this._context)

    if (module._type === 'esm') {
      module.exports = binding.getNamespace(module._handle)
    }

    module._state |= constants.STATE_EVALUATED
  }

  static _synthesize (module) {
    const names = ['default']

    for (const key of Object.keys(module.exports)) {
      if (key !== 'default') names.push(key)
    }

    module._handle = binding.createSyntheticModule(module.filename, names, this._context)

    module._state &= ~constants.STATE_EVALUATED
  }
}

Module._extensions['.js'] = function (module, source, referrer, protocol) {
  const loader = this._extensions[
    module._info && module._info.type === 'module'
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

  module._type = 'cjs'
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
}

Module._extensions['.mjs'] = function (module, source, referrer, protocol) {
  if (source === null) source = protocol.read(module.filename)

  if (typeof source !== 'string') source = b4a.toString(source)

  module._type = 'esm'
  module._protocol = protocol
  module._handle = binding.createModule(module.filename, source, 0)
}

Module._extensions['.json'] = function (module, source, referrer, protocol) {
  if (source === null) source = protocol.read(module.filename)

  if (typeof source !== 'string') source = b4a.toString(source)

  module._type = 'json'
  module._protocol = protocol

  module.exports = JSON.parse(source)
}

Module._extensions['.pear'] = function (module, source, referrer, protocol) {
  module._type = 'addon'
  module._protocol = protocol

  module.exports = process.addon(module.filename)
}

Module._extensions['.node'] = function (module, source, referrer, protocol) {
  module._type = 'addon'
  module._protocol = protocol

  module.exports = process.addon(module.filename)
}

Module._extensions['.bundle'] = function (module, source, referrer, protocol) {
  if (source === null) source = protocol.read(module.filename)

  if (typeof source === 'string') source = b4a.from(source)

  const bundle = Bundle.from(source).mount(module.filename)

  module._type = 'bundle'
  module._protocol = protocol

  protocol = new Protocol({
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

  module.exports = Module.load(bundle.main, bundle.read(bundle.main), { protocol, referrer }).exports
}

Module._protocols['file:'] = new Protocol({
  exists (filename) {
    return binding.exists(filename)
  },

  read (filename) {
    return b4a.from(binding.read(filename))
  }
})

process.once('exit', () => binding.destroy(Module._context))
