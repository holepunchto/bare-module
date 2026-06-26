const constants = require('../constants')
const ValueModule = require('./value')

// A text module, whose default export is its source decoded as a string.
module.exports = class TextModule extends ValueModule {
  get type() {
    return constants.types.TEXT
  }

  _parse(source) {
    return source.toString()
  }
}
