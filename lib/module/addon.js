const constants = require('../constants')
const SyntheticModule = require('./synthetic')

// A native addon module, whose exports are provided by the addon subsystem.
module.exports = class AddonModule extends SyntheticModule {
  constructor(url) {
    super(url)

    Object.preventExtensions(this)
  }

  get type() {
    return constants.types.ADDON
  }

  _initialize(source, referrer) {
    this._exports = Bare.Addon.load(this._url, { referrer: this }).exports
  }
}
