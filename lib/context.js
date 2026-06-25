// The resolution context shared by every module in a graph. A child module
// inherits its referrer's context by reference and only forks a new one when it
// genuinely diverges, such as a bundle introducing its own protocol and imports
// map. Keeping these fields on a single shared object rather than on every
// module instance avoids duplicating them across an entire module graph.
module.exports = class ModuleContext {
  constructor(opts = {}) {
    const {
      defaultType = 0,
      main = null,
      protocol = null,
      cache = null,
      imports = null,
      resolutions = null,
      builtins = null,
      conditions = null
    } = opts

    this.defaultType = defaultType
    this.main = main
    this.protocol = protocol
    this.cache = cache
    this.imports = imports
    this.resolutions = resolutions
    this.builtins = builtins
    this.conditions = conditions
  }

  fork(overrides) {
    return new ModuleContext({ ...this, ...overrides })
  }
}
