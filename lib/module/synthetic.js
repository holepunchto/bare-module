const Module = require('../module')

module.exports = class SyntheticModule extends Module {
  constructor(loader, source) {
    super(loader, source)

    this._synthesized = false
  }

  _synthesize() {
    if (this._synthesized) return

    const names = Array.from(this._exportNames())

    this._createSyntheticModule(names)

    this._names = names
    this._synthesized = true
  }
}
