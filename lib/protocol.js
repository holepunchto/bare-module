module.exports = class Protocol {
  constructor (opts = {}) {
    const {
      map = null,
      exists = null,
      read = null
    } = opts

    if (map) this.map = map
    if (exists) this.exists = exists
    if (read) this.read = read
  }

  map (specifier) {
    return specifier
  }

  exists (filename) {
    return false
  }

  read (filename) {
    return null
  }
}
