module.exports = class Protocol {
  constructor (opts = {}) {
    const {
      map = null,
      exists = null,
      read = null,
      imports = null
    } = opts

    this.imports = Object.create(null)

    if (map) this.map = map.bind(this)
    if (exists) this.exists = exists.bind(this)
    if (read) this.read = read.bind(this)
    if (imports) this.imports = imports
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
