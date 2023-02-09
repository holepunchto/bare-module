const events = require('@pearjs/events')
const path = require('@pearjs/path')
const timers = require('@pearjs/timers')
const binding = require('./binding')

const constants = exports.constants = {
  CONTEXT_SCRIPT: 0,
  CONTEXT_MODULE: 1
}

const Module = module.exports = class Module {
  constructor (filename, dirname = path.dirname(filename)) {
    this.filename = filename
    this.dirname = dirname
    this.exports = {}
    this.definition = null
  }

  static _context = binding.init(this._onimport.bind(this), this._onevaluate.bind(this))

  static {
    process.once('exit', () => binding.destroy(Module._context))
  }

  static _extensions = Object.create(null)
  static _builtins = Object.create(null)
  static _cache = Object.create(null)

  static _exists = defaultExists
  static _read = defaultRead

  static _onimport (specifier, assertions, referrer) {
    const module = this.load(this.resolve(specifier, path.dirname(referrer)), {
      context: constants.CONTEXT_MODULE
    })

    if (module.definition === null) {
      const names = new Set(Object.keys(module.exports))

      names.add('default')

      module.definition = binding.createSyntheticModule(module.filename, Array.from(names), this._context)
    }

    return module.definition
  }

  static _onevaluate (filename) {
    const module = this._cache[filename]

    binding.setExport(module.definition, 'default', module.exports)

    for (const [key, value] of Object.entries(module.exports)) {
      binding.setExport(module.definition, key, value)
    }
  }

  static configure (opts = {}) {
    const {
      exists,
      read
    } = opts

    if (exists) this._exists = exists
    if (read) this._read = read
  }

  static load (filename, source = null, opts = {}) {
    if (this._cache[filename]) return this._cache[filename]

    if (typeof source !== 'string' && source !== null) {
      opts = source
      source = null
    }

    const {
      context = constants.CONTEXT_SCRIPT
    } = opts

    const module = this._cache[filename] = new this(filename)

    let extension = path.extname(filename)
    if (extension in this._extensions === false) extension = '.js'

    this._extensions[extension].call(this, module, filename, source, context)

    return module
  }

  // TODO: align with 99% of https://nodejs.org/dist/latest-v18.x/docs/api/modules.html#all-together

  static resolve (req, dirname = process.cwd()) {
    if (req.length === 0) throw new Error('Could not resolve ' + req + ' from ' + dirname)

    let p = null
    let ticks = 16386 // tons of allowed ticks, just so loops break if a user makes one...

    if (req[0] !== '.' && req[0] !== '/') {
      const [name, rest] = splitModule(req)
      const target = 'node_modules/' + name

      let tmp = dirname

      while (ticks-- > 0) {
        const nm = path.join(tmp, target)

        if (!this._exists(nm)) {
          const parent = path.dirname(tmp)
          if (parent === tmp) ticks = -1
          else tmp = parent
          continue
        }

        dirname = nm
        req = rest
        break
      }
    }

    while (ticks-- > 0) {
      p = path.join(dirname, req)

      if (/\.(js|mjs|cjs|json|node|pear)$/i.test(req) && this._exists(p)) {
        return p
      }

      if (this._exists(p + '.js')) return p + '.js'
      if (this._exists(p + '.cjs')) return p + '.cjs'
      if (this._exists(p + '.mjs')) return p + '.mjs'
      if (this._exists(p + '.json')) return p + '.json'

      const pkg = path.join(p, 'package.json')

      if (this._exists(pkg)) {
        const json = this.load(pkg).exports

        dirname = p
        req = json.main || 'index.js'
        continue
      }

      p = path.join(p, 'index.js')
      if (this._exists(p)) return p

      break
    }

    throw new Error('Could not resolve ' + req + ' from ' + dirname)
  }

  static isBuiltin (name) {
    return name in this._builtins
  }
}

Module._builtins.module = Module
Module._builtins.events = events
Module._builtins.path = path
Module._builtins.timers = timers

Module._extensions['.js'] =
Module._extensions['.cjs'] = function (module, filename, source, opts) {
  if (source === null) source = this._read(filename)

  const resolve = (req) => {
    return this.resolve(req, module.dirname)
  }

  const require = (req) => {
    return req in this._builtins ? this._builtins[req] : this.load(resolve(req)).exports
  }

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

Module._extensions['.mjs'] = function (module, filename, source, context) {
  if (source === null) source = this._read(filename)

  module.definition = binding.createModule(filename, source, 0, this._context)

  if (context !== constants.CONTEXT_MODULE) {
    binding.runModule(module.definition)
  }
}

Module._extensions['.json'] = function (module, filename, source, context) {
  if (source === null) source = this._read(filename)

  module.exports = JSON.parse(source)
}

Module._extensions['.pear'] =
Module._extensions['.node'] = function (module, filename, source, context) {
  module.exports = process.addon(filename)
}

function splitModule (m) {
  const i = m.indexOf('/')
  if (i === -1) return [m, '.']

  return [m.slice(0, i), '.' + m.slice(i)]
}

function defaultExists (filename) {
  return false
}

function defaultRead (filename) {
  return null
}
