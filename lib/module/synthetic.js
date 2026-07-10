const Module = require('../module')

module.exports = class SyntheticModule extends Module {
  _synthesize() {
    if (this._id !== null) return

    this._names = Array.from(this._exportNames())

    this._createSyntheticModule(this._names)
  }
}
