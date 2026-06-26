const SyntheticModule = require('./synthetic')
const { readSource } = require('../helpers')

// Base class for modules whose exports are a single value derived directly from
// their source at load time, such as JSON, text, and binary modules. They have
// no separate evaluation step.
module.exports = class ValueModule extends SyntheticModule {
  _initialize(source) {
    this.exports = this._parse(readSource(this, source))
  }

  _parse(source) {
    return source
  }
}
