module.exports = class ModuleProtocol {
  constructor (opts = {}) {
    const {
      preresolve = null,
      postresolve = null,
      resolve = null,
      exists = null,
      read = null,
      load = null,
      asset = null
    } = opts

    if (preresolve) this.preresolve = preresolve.bind(this)
    if (postresolve) this.postresolve = postresolve.bind(this)
    if (resolve) this.resolve = resolve.bind(this)
    if (exists) this.exists = exists.bind(this)
    if (read) this.read = read.bind(this)
    if (load) this.load = load.bind(this)
    if (asset) this.asset = asset.bind(this)
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

  asset (url) {
    return url
  }
}
