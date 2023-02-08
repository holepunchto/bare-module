const events = require('@pearjs/events')
const path = require('@pearjs/path')
const timers = require('@pearjs/timers')
const binding = require('./binding')

module.exports = class Module {
  constructor (filename, dirname = path.dirname(filename)) {
    this.filename = filename
    this.dirname = dirname
    this.exports = {}
  }

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

  _exists (filename) {
    return Module._exists(filename)
  }

  _read (filename) {
    return Module._read(filename)
  }

  _loadJSON (source = this._read(this.filename)) {
    this.exports = JSON.parse(source)
    return this.exports
  }

  _loadJS (source = this._read(this.filename)) {
    const dirname = this.dirname

    require.cache = Module.cache
    require.resolve = resolve

    Module.runScript(this, source, require)

    return this.exports

    function resolve (req) {
      return Module.resolve(req, dirname)
    }

    function require (req) {
      if (req === 'module') return Module
      if (req === 'events') return events
      if (req === 'path') return path
      if (req === 'timers') return timers
      if (req.endsWith('.node') || req.endsWith('.pear')) return process.addon(req)
      return Module.load(resolve(req))
    }
  }

  static cache = Object.create(null)

  static bootstrap (filename, source) {
    const mod = Module.cache[filename] = new Module(filename)

    filename.endsWith('.json')
      ? mod._loadJSON(source)
      : mod._loadJS(source)
  }

  static load (filename) {
    if (Module.cache[filename]) return Module.cache[filename].exports

    const mod = Module.cache[filename] = new Module(filename)

    return filename.endsWith('.json')
      ? mod._loadJSON()
      : mod._loadJS()
  }

  static runScript (module, source, require) {
    binding.runScript(module.filename, `(__dirname, __filename, module, exports, require) => {\n${source}\n}`, -1)(
      module.dirname,
      module.filename,
      module,
      module.exports,
      require
    )
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

      if (/\.(js|mjs|cjs|json)$/i.test(req) && this._exists(p)) {
        return p
      }

      if (this._exists(p + '.js')) {
        return p + '.js'
      }

      if (this._exists(p + '.cjs')) {
        return p + '.cjs'
      }

      if (this._exists(p + '.mjs')) {
        return p + '.mjs'
      }

      if (this._exists(p + '.json')) {
        return p + '.json'
      }

      const pkg = path.join(p, 'package.json')

      if (this._exists(pkg)) {
        const json = Module.load(pkg)

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
