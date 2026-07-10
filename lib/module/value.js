const SyntheticModule = require('./synthetic')

module.exports = class ValueModule extends SyntheticModule {
  constructor(loader, source) {
    super(loader, source)

    this._value = null
    this._parsed = false
  }

  _parseOnce() {
    if (this._parsed === false) {
      this._value = this._parse()
      this._parsed = true
    }

    return this._value
  }

  _parse() {
    return this._source.bytes
  }

  _execute() {
    this.exports = this._parseOnce()
  }
}
