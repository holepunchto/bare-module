const Module = require('../module')

module.exports = class SyntheticModule extends Module {
  constructor(loader, source) {
    super(loader, source)

    this._synthesized = false
  }

  _synthesize() {
    if (this._synthesized) return

    this._synthesized = true
    this._names = Array.from(this._exportNames())

    this._createSyntheticModule(this._names)
  }
}
