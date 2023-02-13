const path = require('@pearjs/path')
const Bundle = require('@pearjs/bundle')
const Protocol = require('./lib/protocol')
const binding = require('./binding')

const Module = module.exports = class Module {
  constructor (filename, dirname = path.dirname(filename)) {
    this.type = null
    this.info = null
    this.filename = filename
    this.dirname = dirname
    this.exports = {}
    this.definition = null
    this.protocol = null
  }

  static _context = binding.init(this._onimport.bind(this), this._onevaluate.bind(this))

  static {
    process.once('exit', () => binding.destroy(this._context))
  }

  static _extensions = Object.create(null)
  static _protocols = Object.create(null)
  static _builtins = Object.create(null)
  static _cache = Object.create(null)

  static _onimport (specifier, assertions, referrerFilename) {
    const referrer = this._cache[referrerFilename]

    const protocol = referrer.protocol

    specifier = this.resolve(specifier, referrer.dirname, { protocol })

    const module = this.load(specifier, { protocol, referrer })

    if (module.definition === null) {
      const names = new Set(Object.keys(module.exports))

      names.add('default')

      module.definition = binding.createSyntheticModule(module.filename, Array.from(names), this._context)
    }

    return module.definition
  }

  static _onevaluate (specifier) {
    const module = this._cache[specifier]

    binding.setExport(module.definition, 'default', module.exports)

    for (const [key, value] of Object.entries(module.exports)) {
      binding.setExport(module.definition, key, value)
    }
  }

  static Protocol = Protocol
  static Bundle = Bundle

  static load (specifier, source = null, opts = {}) {
    if (this._cache[specifier]) return this._cache[specifier]

    if (!ArrayBuffer.isView(source) && typeof source !== 'string' && source !== null) {
      opts = source
      source = null
    }

    let {
      referrer = null,
      protocol = null
    } = opts

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

      this._extensions[extension].call(this, module, specifier, source, referrer, protocol)
    }

    return module
  }

  // TODO: align with 99% of https://nodejs.org/dist/latest-v18.x/docs/api/modules.html#all-together

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

    specifier = protocol.map(specifier)

    if (specifier in this._builtins) return specifier

    if (specifier.length === 0) throw new Error('Could not resolve ' + specifier + ' from ' + dirname)

    let p = null
    let ticks = 16386 // tons of allowed ticks, just so loops break if a user makes one...

    if (specifier[0] !== '.' && specifier[0] !== '/') {
      const [name, rest] = splitModule(specifier)
      const target = 'node_modules/' + name

      let tmp = dirname

      while (ticks-- > 0) {
        const nm = path.join(tmp, target)

        if (!protocol.exists(nm)) {
          const parent = path.dirname(tmp)
          if (parent === tmp) ticks = -1
          else tmp = parent
          continue
        }

        dirname = nm
        specifier = rest
        break
      }
    }

    while (ticks-- > 0) {
      p = path.join(dirname, specifier)

      if (/\.(js|mjs|cjs|json|node|pear)$/i.test(specifier) && protocol.exists(p)) {
        return p
      }

      if (protocol.exists(p + '.js')) return p + '.js'
      if (protocol.exists(p + '.cjs')) return p + '.cjs'
      if (protocol.exists(p + '.mjs')) return p + '.mjs'
      if (protocol.exists(p + '.json')) return p + '.json'

      const pkg = path.join(p, 'package.json')

      if (protocol.exists(pkg)) {
        const json = this.load(pkg).exports

        dirname = p
        specifier = json.main || 'index.js'
        continue
      }

      p = path.join(p, 'index.js')
      if (protocol.exists(p)) return p

      break
    }

    throw new Error('Could not resolve ' + specifier + ' from ' + dirname)
  }

  static isBuiltin (name) {
    return name in this._builtins
  }
}

Module._extensions['.js'] = function (module, filename, source, referrer, protocol) {
  const loader = this._extensions[
    module.info && module.info.type === 'module'
      ? '.mjs'
      : '.cjs'
  ]

  return loader.call(this, module, filename, source, referrer, protocol)
}

Module._extensions['.cjs'] = function (module, filename, source, context, protocol) {
  if (source === null) source = protocol.read(filename)

  if (typeof source !== 'string') source = source.toString()

  const resolve = (specifier) => {
    return this.resolve(specifier, module.dirname, { protocol })
  }

  const require = (specifier) => {
    return this.load(resolve(specifier), { protocol, referrer: module }).exports
  }

  module.type = 'cjs'
  module.protocol = protocol

  require.cache = this._cache
  require.resolve = resolve

  binding.runScript(filename, `(function (require, module, exports, __filename, __dirname) {\n${source}\n})`, -1)(
    require,
    module,
    module.exports,
    module.filename,
    module.dirname
  )
}

Module._extensions['.mjs'] = function (module, filename, source, referrer, protocol) {
  if (source === null) source = protocol.read(filename)

  if (typeof source !== 'string') source = source.toString()

  module.type = 'esm'
  module.protocol = protocol

  module.definition = binding.createModule(filename, source, 0, this._context)

  if (referrer === null || referrer.type !== 'esm') {
    binding.runModule(module.definition)
  }
}

Module._extensions['.json'] = function (module, filename, source, referrer, protocol) {
  if (source === null) source = protocol.read(filename)

  if (typeof source !== 'string') source = source.toString()

  module.type = 'json'
  module.protocol = protocol

  module.exports = JSON.parse(source)
}

Module._extensions['.pear'] = function (module, filename, source, referrer, protocol) {
  module.type = 'addon'

  module.exports = process.addon(filename)
}

Module._extensions['.node'] = function (module, filename, source, referrer, protocol) {
  module.type = 'addon'

  module.exports = process.addon(filename)
}

Module._extensions['.bundle'] = function (module, filename, source, referrer, protocol) {
  if (source === null) source = protocol.read(filename)

  if (typeof source === 'string') source = Buffer.from(source)

  const bundle = Bundle.from(source)

  module.protocol = protocol = new Protocol({
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

  const entry = Module.load(bundle.main, bundle.read(bundle.main), { protocol })

  module.type = entry.type
  module.exports = entry.exports
}

function splitModule (m) {
  const i = m.indexOf('/')
  if (i === -1) return [m, '.']

  return [m.slice(0, i), '.' + m.slice(i)]
}
