const ValueModule = require('./value')

module.exports = class BinaryModule extends ValueModule {
  _parse() {
    return this._source.bytes
  }
}
