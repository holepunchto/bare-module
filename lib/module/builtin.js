const SyntheticModule = require('./synthetic')

module.exports = class BuiltinModule extends SyntheticModule {
  constructor(loader, source, exports) {
    super(loader, source)

    this.exports = exports
  }

  _exportNames(seen = new Set()) {
    const names = super._exportNames(seen)

    if (this.exports !== null && typeof this.exports === 'object') {
      for (const key of Object.keys(this.exports)) names.add(key)
    }

    return names
  }
}
