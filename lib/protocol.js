module.exports = class ModuleProtocol {
  constructor(methods = {}, context = null) {
    for (const name of ['resolve', 'exists', 'read', 'list']) {
      const method = methods[name]

      if (typeof method === 'function') {
        this[name] = context ? method.bind(this, context) : method.bind(this)
      } else if (context) {
        const method = context[name]

        if (typeof method === 'function') {
          this[name] = method
        }
      }
    }
  }

  // For backwards compatiblity.
  postresolve(url) {
    return this.resolve(url)
  }

  resolve(url) {
    return url
  }

  exists(url) {
    return false
  }

  read(url) {
    return null
  }

  *list(url) {
    if (this.exists(url)) yield url
  }

  extend(methods) {
    return new ModuleProtocol(methods, this)
  }
}
