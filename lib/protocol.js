module.exports = class Protocol {
  constructor (opts = {}) {
    const {
      imports = Object.create(null),
      map = null,
      resolve = null,
      exists = null,
      read = null
    } = opts

    this.imports = imports

    if (map) this.map = map.bind(this)
    if (resolve) this.resolve = resolve.bind(this)
    else this.resolve = null
    if (exists) this.exists = exists.bind(this)
    if (read) this.read = read.bind(this)
  }

  map (specifier, dirname) {
    return specifier
  }

  exists (filename) {
    return false
  }

  read (filename) {
    return null
  }
}
