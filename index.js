const path = require('path')
const Bundle = require('bare-bundle')
const Protocol = require('./lib/protocol')
const constants = require('./lib/constants')
const errors = require('./lib/errors')
const binding = require('./binding')

const Module = module.exports = class Module {
  constructor (filename, main) {
    this.filename = filename
    this.main = main || this
    this.exports = null

    this._type = null
    this._info = null
    this._state = 0
    this._protocol = null
    this._imports = null
    this._handle = null
  }

  get dirname () {
    return path.dirname(this.filename)
  }

  static _context = binding.init(this, this._onimport, this._onevaluate, this._onmeta)

  static _extensions = Object.create(null)
  static _protocols = Object.create(null)
  static _builtins = Object.create(null)
  static _imports = Object.create(null)
  static _cache = Object.create(null)
  static _bundles = Object.create(null)

  static _onimport (specifier, assertions, referrerFilename, dynamic) {
    const referrer = this._cache[referrerFilename]

    let protocol, imports

    if (referrer) {
      protocol = this._protocolFor(specifier, referrer._protocol)

      imports = referrer._imports

      specifier = this.resolve(specifier, referrer.dirname, {
        protocol,
        imports,
        referrer
      })
    } else {
      specifier = this.resolve(specifier)
    }

    const module = this.load(specifier, {
      protocol: this._protocolFor(specifier, protocol),
      imports,
      referrer,
      dynamic
    })

    return module._handle
  }

  static _onevaluate (specifier) {
    const module = this._cache[specifier]

    binding.setExport(module._handle, 'default', module.exports)

    for (const [key, value] of Object.entries(module.exports)) {
      binding.setExport(module._handle, key, value)
    }
  }

  static _onmeta (specifier, meta) {
    const module = this._cache[specifier]

    const resolve = (specifier) => {
      return this.resolve(specifier, module.dirname, {
        protocol: this._protocolFor(specifier, module._protocol),
        imports: module._imports,
        referrer: module
      })
    }

    meta.url = module.filename
    meta.main = module.main === module
    meta.resolve = resolve
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
      imports = this._imports,
      protocol = this._protocolFor(specifier, this._protocols['file:']),
      referrer = null,
      dynamic = false,
      main = referrer ? referrer.main : null
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

    const module = this._cache[specifier] = new this(specifier, main)

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

      this._extensions[extension].call(this, module, source, referrer, protocol, imports)
    }

    return this._transform(module, referrer, dynamic)
  }

  static resolve (specifier, dirname = process.cwd(), opts = {}) {
    if (typeof dirname !== 'string') {
      opts = dirname
      dirname = process.cwd()
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

      if (referrer) msg += ` imported from '${referrer.filename}'`

      throw errors.MODULE_NOT_FOUND(msg)
    }

    return resolved
  }

  static * _resolve (specifier, dirname, protocol, imports) {
    if (specifier in imports) specifier = imports[specifier]
    else if (specifier in protocol.imports) specifier = protocol.imports[specifier]

    protocol = this._protocolFor(specifier, protocol)

    specifier = protocol.map(specifier, dirname)

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
    const f = filename

    if (protocol.exists(f)) yield f
    if (protocol.exists(f + '.js')) yield f + '.js'
    if (protocol.exists(f + '.cjs')) yield f + '.cjs'
    if (protocol.exists(f + '.mjs')) yield f + '.mjs'
    if (protocol.exists(f + '.json')) yield f + '.json'
    if (protocol.exists(f + '.bare')) yield f + '.bare'
    if (protocol.exists(f + '.node')) yield f + '.node'
  }

  static * _resolveIndex (dirname, protocol) {
    yield * this._resolveFile(path.join(dirname, 'index'), protocol)
  }

  static * _resolveDirectory (dirname, protocol) {
    const pkg = path.join(dirname, 'package.json')

    if (protocol.exists(pkg)) {
      let info
      try {
        info = this.load(pkg, { protocol }).exports
      } catch {
        info = null
      }

      if (info && info.main) {
        const main = path.join(dirname, info.main)

        yield * this._resolveFile(main, protocol)
        yield * this._resolveIndex(main, protocol)
      }
    }

    yield * this._resolveIndex(dirname, protocol)
  }

  static * _resolveNodeModules (specifier, dirname, protocol) {
    for (const nodeModules of this._resolveNodeModulesPaths(dirname)) {
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

Module._extensions['.js'] = function (module, source, referrer, protocol, imports) {
  const isESM = (
    // The package is explicitly declared as an ES module.
    (module._info && module._info.type === 'module') ||

    // The source is a data: URI and the referrer is itself an ES module.
    (protocol === this._protocols['data:'] && referrer && referrer._type === 'esm')
  )

  const loader = this._extensions[isESM ? '.mjs' : '.cjs']

  return loader.call(this, module, source, referrer, protocol, imports)
}

Module._extensions['.cjs'] = function (module, source, referrer, protocol, imports) {
  if (source === null) source = protocol.read(module.filename)

  if (typeof source !== 'string') source = Buffer.coerce(source).toString()

  referrer = module

  const resolve = (specifier) => {
    return this.resolve(specifier, module.dirname, {
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

    return module.exports
  }

  module._type = 'cjs'
  module._protocol = protocol
  module._imports = imports

  module.exports = {}

  require.main = module.main
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

Module._extensions['.mjs'] = function (module, source, referrer, protocol, imports) {
  if (source === null) source = protocol.read(module.filename)

  if (typeof source !== 'string') source = Buffer.coerce(source).toString()

  module._type = 'esm'
  module._protocol = protocol
  module._imports = imports

  module._handle = binding.createModule(module.filename, source, 0, this._context)
}

Module._extensions['.json'] = function (module, source, referrer, protocol, imports) {
  if (source === null) source = protocol.read(module.filename)

  if (typeof source !== 'string') source = Buffer.coerce(source).toString()

  module._type = 'json'
  module._protocol = protocol
  module._imports = imports

  module.exports = JSON.parse(source)
}

Module._extensions['.bare'] = function (module, source, referrer, protocol, imports) {
  module._type = 'addon'
  module._protocol = protocol
  module._imports = imports

  module.exports = process.addon(module.filename)
}

Module._extensions['.node'] = function (module, source, referrer, protocol, imports) {
  module._type = 'addon'
  module._protocol = protocol
  module._imports = imports

  module.exports = process.addon(module.filename)
}

Module._extensions['.bundle'] = function (module, source, referrer, protocol, imports) {
  if (typeof source === 'string') source = Buffer.from(source)

  const bundle = this._bundleFor(module.filename, protocol, source)

  module._type = 'bundle'
  module._protocol = protocol
  module._imports = imports

  module.exports = Module.load(bundle.main, bundle.read(bundle.main), { protocol, imports, referrer }).exports
}

Module._protocols['file:'] = new Protocol({
  map (specifier) {
    return specifier.replace(/^file:/, '')
  },

  exists (filename) {
    return binding.exists(filename)
  },

  read (filename) {
    return Buffer.from(binding.read(filename))
  }
})

Module._protocols['node:'] = new Protocol({
  map (specifier) {
    return specifier.replace(/^node:/, '')
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

process.on('exit', () => binding.destroy(Module._context))

if (process.thread) {
  process.thread.on('exit', () => binding.destroy(Module._context))
}
