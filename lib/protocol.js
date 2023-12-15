module.exports = class ModuleProtocol {
  constructor (opts = {}) {
    const {
      preresolve = null,
      postresolve = null,
      resolve = null,
      exists = null,
      read = null,
      load = null
    } = opts

    if (preresolve) this.preresolve = preresolve.bind(this)
    if (postresolve) this.postresolve = postresolve.bind(this)
    if (resolve) this.resolve = resolve.bind(this)
    if (exists) this.exists = exists.bind(this)
    if (read) this.read = read.bind(this)
    if (load) this.load = load.bind(this)
  }

  preresolve (specifier, dirname) {
    return specifier
  }

  postresolve (specifier, dirname) {
    return specifier
  }

  * resolve (specifier, dirname, imports) {}

  exists (filename) {
    return false
  }

  read (filename) {
    return null
  }
}
