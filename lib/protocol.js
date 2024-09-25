module.exports = class ModuleProtocol {
  constructor (opts = {}, parent) {
    const {
      preresolve = null,
      postresolve = null,
      resolve = null,
      exists = null,
      read = null,
      load = null
    } = opts

    if (preresolve) this.preresolve = bind(this, preresolve, parent)
    if (postresolve) this.postresolve = bind(this, postresolve, parent)
    if (resolve) this.resolve = bind(this, resolve, parent)
    if (exists) this.exists = bind(this, exists, parent)
    if (read) this.read = bind(this, read, parent)
    if (load) this.load = bind(this, load, parent)
  }

  preresolve (specifier, parentURL) {
    return specifier
  }

  postresolve (specifier, parentURL) {
    return specifier
  }

  * resolve (specifier, parentURL, imports) {}

  exists (url) {
    return false
  }

  read (url) {
    return null
  }

  extend (opts = {}) {
    return new ModuleProtocol({ ...this, ...opts }, this)
  }
}

function bind (protocol, method, parent) {
  return function (...args) {
    return method.call(protocol, ...args, parent)
  }
}
