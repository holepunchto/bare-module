const events = require('@pearjs/events')
const path = require('@pearjs/path')
const timers = require('@pearjs/timers')
const binding = require('./binding')

const Module = module.exports = class Module {
  constructor (filename, dirname = path.dirname(filename)) {
    this.filename = filename
    this.dirname = dirname
    this.exports = {}
  }

  static _extensions = Object.create(null)
  static _builtins = Object.create(null)
  static _cache = Object.create(null)

  static _exists = defaultExists
  static _read = defaultRead

  static configure (opts = {}) {
    const {
      exists,
      read
    } = opts

    if (exists) this._exists = exists
    if (read) this._read = read
  }

  static load (filename, source) {
    if (this._cache[filename]) return this._cache[filename].exports

    const module = this._cache[filename] = new this(filename)

    let extension = path.extname(filename)
    if (extension in this._extensions === false) extension = '.js'

    return this._extensions[extension].call(this, module, filename, source)
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
        const json = this.load(pkg)

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
Module._extensions['.cjs'] = function (module, filename, source = this._read(filename)) {
  const resolve = (req) => {
    return this.resolve(req, module.dirname)
  }

  const require = (req) => {
    return req in this._builtins ? this._builtins[req] : this.load(resolve(req))
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

  return module.exports
}

Module._extensions['.json'] = function (module, filename, source = this._read(filename)) {
  return (module.exports = JSON.parse(source))
}

Module._extensions['.pear'] =
Module._extensions['.node'] = function (module, filename) {
  return process.addon(filename)
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
