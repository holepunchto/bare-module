const SyntheticModule = require('./synthetic')

module.exports = class AddonModule extends SyntheticModule {
  _execute() {
    this.exports = new Bare.Addon(this.url).exports
  }
}
