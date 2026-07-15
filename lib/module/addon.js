const SyntheticModule = require('./synthetic')

module.exports = class AddonModule extends SyntheticModule {
  _execute() {
    this.exports = Bare.Addon.load(this.url).exports
  }
}
