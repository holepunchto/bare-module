module.exports = class Protocol {
  constructor (opts = {}) {
    const {
      map = null,
      exists = null,
      read = null,
      imports = null
    } = opts

    this.imports = Object.create(null)

    if (map) this.map = map
    if (exists) this.exists = exists
    if (read) this.read = read

    if (imports) {
      for (const [from, to] of Object.entries(imports)) {
        this.imports[from] = to
      }
    }
  }

  map (specifier, dirname) {
    if (specifier in this.imports) specifier = this.imports[specifier]
    return specifier
  }

  exists (filename) {
    return false
  }

  read (filename) {
    return null
  }
}
