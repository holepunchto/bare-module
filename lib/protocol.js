module.exports = class Protocol {
  constructor (opts = {}) {
    const {
      map = null,
      exists = null,
      read = null
    } = opts

    if (map) this.map = map.bind(this)
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
