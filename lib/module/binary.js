const constants = require('../constants')
const ValueModule = require('./value')

// A binary module, whose default export is its source as a buffer.
module.exports = class BinaryModule extends ValueModule {
  get type() {
    return constants.type.BINARY
  }

  _parse(source) {
    return source
  }
}
