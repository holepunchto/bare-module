const Module = require('../module')

module.exports = class SyntheticModule extends Module {
  _initialize() {
    this._names = Array.from(this._exportNames())

    this._createSyntheticModule(this._names)
  }
}
