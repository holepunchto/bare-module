const constants = require('../constants')
const ValueModule = require('./value')

// A binary module, whose default export is its source as a buffer.
module.exports = class BinaryModule extends ValueModule {
  constructor(url) {
    super(url)

    Object.preventExtensions(this)
  }

  get type() {
    return constants.types.BINARY
  }

  _parse(source) {
    return source
  }
}
