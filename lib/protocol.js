const errors = require('./errors')

const kind = Symbol.for('bare.module.protocol.kind')

module.exports = exports = class ModuleProtocol {
  static get [kind]() {
    return 0 // Compatibility version
  }

  static isProtocol(value) {
    if (value instanceof ModuleProtocol) return true

    if (typeof value !== 'object' || value === null) return false

    return value[kind] === ModuleProtocol[kind]
  }

  get [kind]() {
    return ModuleProtocol[kind]
  }

  constructor(methods = {}, context = null) {
    for (const pair of [
      ['resolve', 'resolveSync'],
      ['exists', 'existsSync'],
      ['read', 'readSync'],
      ['list', 'listSync']
    ]) {
      const overridden = pair.some((name) => typeof methods[name] === 'function')

      for (const name of pair) {
        const method = methods[name]

        if (typeof method === 'function') {
          this[name] = context ? method.bind(this, context) : method.bind(this)
        } else if (context && !overridden) {
          const method = context[name]

          if (typeof method === 'function') {
            this[name] = method
          }
        }
      }
    }
  }

  resolve(url) {
    return url
  }

  resolveSync(url) {
    const resolution = this.resolve(url)

    if (isThenable(resolution)) {
      throw errors.UNEXPECTED_PROMISE(
        'Protocol resolve returned a promise during synchronous linking'
      )
    }

    return resolution
  }

  exists(url) {
    return false
  }

  existsSync(url) {
    const exists = this.exists(url)

    if (isThenable(exists)) {
      throw errors.UNEXPECTED_PROMISE(
        'Protocol exists returned a promise during synchronous linking'
      )
    }

    return exists
  }

  read(url) {
    return null
  }

  readSync(url) {
    const source = this.read(url)

    if (isThenable(source)) {
      throw errors.UNEXPECTED_PROMISE('Protocol read returned a promise during synchronous linking')
    }

    return source
  }

  list(url) {
    return []
  }

  listSync(url) {
    const listing = this.list(url)

    if (typeof listing[Symbol.iterator] !== 'function') {
      throw errors.UNEXPECTED_PROMISE(
        'Protocol list returned an asynchronous iterable during synchronous linking'
      )
    }

    return listing
  }

  extend(methods) {
    return new ModuleProtocol(methods, this)
  }

  [Symbol.for('bare.inspect')]() {
    return {
      __proto__: { constructor: ModuleProtocol }
    }
  }
}

function isThenable(value) {
  return value !== null && typeof value === 'object' && typeof value.then === 'function'
}
