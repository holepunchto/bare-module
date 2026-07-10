const ValueModule = require('./value')

module.exports = class TextModule extends ValueModule {
  _parse() {
    return this._source.bytes.toString()
  }
}
