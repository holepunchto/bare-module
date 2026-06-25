const constants = require('../constants')
const ValueModule = require('./value')

// A JSON module, whose exports are the parsed JSON value.
module.exports = class JSONModule extends ValueModule {
  constructor(url) {
    super(url)

    Object.preventExtensions(this)
  }

  get type() {
    return constants.types.JSON
  }

  _parse(source) {
    return JSON.parse(source.toString())
  }

  // A JSON module additionally exposes each of its top-level keys as a named
  // export.
  _exportNames(names) {
    for (const name of Object.keys(this._exports)) names.add(name)
  }
}
