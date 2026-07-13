const errors = require('./errors')

module.exports = class ModuleProtocol {
  constructor(methods = {}, context = null) {
    for (const name of [
      'resolve',
      'resolveSync',
      'exists',
      'existsSync',
      'read',
      'readSync',
      'list',
      'listSync'
    ]) {
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

  resolve(url) {
    return url
  }

  resolveSync(url) {
    const resolution = this.resolve(url)

    if (isThenable(resolution)) {
      throw errors.UNEXPECTED_PROMISE(
        'Protocol resolve returned a promise during synchronous linking'
      )
    }

    return resolution
  }

  exists(url) {
    return false
  }

  existsSync(url) {
    const exists = this.exists(url)

    if (isThenable(exists)) {
      throw errors.UNEXPECTED_PROMISE(
        'Protocol exists returned a promise during synchronous linking'
      )
    }

    return exists
  }

  read(url) {
    return null
  }

  readSync(url) {
    const source = this.read(url)

    if (isThenable(source)) {
      throw errors.UNEXPECTED_PROMISE('Protocol read returned a promise during synchronous linking')
    }

    return source
  }

  *list(url) {
    if (this.exists(url)) yield url
  }

  *listSync(url) {
    const list = this.list(url)

    if (typeof list[Symbol.iterator] !== 'function') {
      throw errors.UNEXPECTED_PROMISE(
        'Protocol list returned an asynchronous iterable during synchronous linking'
      )
    }

    yield* list
  }

  extend(methods) {
    return new ModuleProtocol(methods, this)
  }
}

function isThenable(value) {
  return value !== null && typeof value === 'object' && typeof value.then === 'function'
}
