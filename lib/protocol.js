module.exports = class Protocol {
  constructor (opts = {}) {
    const {
      imports = Object.create(null),
      preresolve = null,
      postresolve = null,
      resolve = null,
      exists = null,
      read = null
    } = opts

    this.imports = imports

    if (preresolve) this.preresolve = preresolve.bind(this)
    if (postresolve) this.postresolve = postresolve.bind(this)

    if (resolve) this.resolve = resolve.bind(this)
    else this.resolve = null
    if (exists) this.exists = exists.bind(this)
    if (read) this.read = read.bind(this)
  }

  preresolve (specifier, dirname) {
    return specifier
  }

  postresolve (specifier, dirname) {
    return specifier
  }

  exists (filename) {
    return false
  }

  read (filename) {
    return null
  }
}
