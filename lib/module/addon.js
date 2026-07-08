const constants = require('../constants')
const SyntheticModule = require('./synthetic')

// A native addon module, whose exports are provided by the addon subsystem.
module.exports = class AddonModule extends SyntheticModule {
  get type() {
    return constants.type.ADDON
  }

  _initialize(source, referrer) {
    this.exports = Bare.Addon.load(this._url, { referrer: this }).exports
  }
}
