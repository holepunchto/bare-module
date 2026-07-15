const ValueModule = require('./value')

module.exports = class JSONModule extends ValueModule {
  _parse() {
    return JSON.parse(this._source.bytes.toString())
  }

  _exportNames(seen = new Set()) {
    const names = super._exportNames(seen)

    const value = this._parseOnce()

    if (value !== null && typeof value === 'object') {
      for (const key of Object.keys(value)) names.add(key)
    }

    return names
  }
}
