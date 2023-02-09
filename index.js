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

  static _onevaluate (specifier) {
    const module = this._cache[specifier]

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

  static load (specifier, source = null, opts = {}) {
    if (this._cache[specifier]) return this._cache[specifier]

    if (typeof source !== 'string' && source !== null) {
      opts = source
      source = null
    }

    const {
      context = constants.CONTEXT_SCRIPT
    } = opts

    const module = this._cache[specifier] = new this(specifier)

    if (specifier in this._builtins) {
      module.exports = this._builtins[specifier]
    } else {
      let extension = path.extname(specifier)

      if (extension in this._extensions === false) extension = '.js'

      this._extensions[extension].call(this, module, specifier, source, context)
    }

    return module
  }

  // TODO: align with 99% of https://nodejs.org/dist/latest-v18.x/docs/api/modules.html#all-together

  static resolve (specifier, dirname = process.cwd()) {
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

        if (!this._exists(nm)) {
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

      if (/\.(js|mjs|cjs|json|node|pear)$/i.test(specifier) && this._exists(p)) {
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
        specifier = json.main || 'index.js'
        continue
      }

      p = path.join(p, 'index.js')
      if (this._exists(p)) return p

      break
    }

    throw new Error('Could not resolve ' + specifier + ' from ' + dirname)
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

  const resolve = (specifier) => {
    return this.resolve(specifier, module.dirname)
  }

  const require = (specifier) => {
    return this.load(resolve(specifier)).exports
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
