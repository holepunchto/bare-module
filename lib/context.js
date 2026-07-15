const { pathToFileURL } = require('bare-url')
const binding = require('../binding')
const errors = require('./errors')

class ModuleContext {
  constructor() {
    this._records = new WeakMap()
    this._defaultLoader = null

    binding.init(this, this._onimport, this._ondynamicimport, this._onevaluate, this._onmeta)
  }

  get records() {
    return this._records
  }

  add(module) {
    this._records.set(module._id, module)
  }

  setDefaultLoader(loader) {
    this._defaultLoader = loader
  }

  [Symbol.for('bare.inspect')]() {
    return {
      __proto__: { constructor: ModuleContext },

      records: this.records
    }
  }

  _onimport(specifier, id) {
    const referrer = this._records.get(id) || null

    if (referrer === null) {
      throw errors.MODULE_NOT_FOUND(`Cannot find referrer for module '${specifier}'`, specifier)
    }

    const url = referrer._resolve(specifier, 'import')

    const child = referrer._loader._lookup(url)

    if (!child) {
      throw errors.MODULE_NOT_FOUND(
        `Cannot find module '${specifier}' imported from '${referrer.url.href}'`,
        specifier,
        referrer.url
      )
    }

    child._instantiate()
    child._synthesize()

    return child
  }

  async _ondynamicimport(specifier, referrerName, id) {
    const referrer = this._records.get(id) || null

    const loader = referrer !== null ? referrer._loader : this._defaultLoader

    if (loader === null) {
      throw errors.MODULE_NOT_FOUND(
        `Cannot find referrer for dynamically imported module '${specifier}'`,
        specifier
      )
    }

    let url = referrer !== null ? referrer._resolve(specifier, 'import') : null

    let record = loader._lookup(url)

    if (record === null) {
      const parentURL = referrer !== null ? referrer.url : referrerURL(referrerName)

      url = await loader._resolveAsync(specifier, parentURL, 'import')

      record = await loader.link(url, null, {
        referrerType: referrer !== null ? referrer.type : 0
      })
    } else {
      record._instantiate()
    }

    record._synthesize()

    await record._run()

    return record._moduleNamespace()
  }

  _onevaluate(id) {
    const record = this._records.get(id)

    record._evaluate()

    for (const name of record._names) {
      let value

      if (
        name === 'default' &&
        (typeof record.exports !== 'object' ||
          record.exports === null ||
          name in record.exports === false)
      ) {
        value = record.exports
      } else {
        value = record.exports[name]
      }

      binding.setModuleExport(record, name, value)
    }
  }

  _onmeta(id, meta) {
    const record = this._records.get(id)

    meta.url = record.url.href
    meta.main = record._loader.main === record

    // For Node.js compatibility.
    meta.dirname = record.dirname
    meta.filename = record.filename

    meta.resolve = function (specifier) {
      const url = record._resolve(specifier, 'import')

      return url === null
        ? record._loader._resolveSync(specifier, record.url, 'import').href
        : url.href
    }

    meta.asset = function (specifier) {
      return record._loader._resolveArtifact(record, specifier, 'asset').href
    }

    meta.addon = function (specifier = '.') {
      const url = record._loader._resolveArtifact(record, specifier, 'addon')

      return Bare.Addon.load(url).exports
    }

    meta.addon.resolve = function (specifier = '.') {
      return record._loader._resolveArtifact(record, specifier, 'addon').href
    }

    meta.addon.host = Bare.Addon.host
  }
}

module.exports = new ModuleContext()

function referrerURL(referrerName) {
  if (!referrerName) return pathToFileURL('./')

  return URL.parse(referrerName) || pathToFileURL(referrerName)
}
