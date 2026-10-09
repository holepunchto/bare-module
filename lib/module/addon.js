const instantiate = require('bare-wasm-abi')
const SyntheticModule = require('./synthetic')

module.exports = class AddonModule extends SyntheticModule {
  _execute() {
    if (this.url.pathname.endsWith('.wasm')) {
      this.exports = instantiate(this._source.bytes || this.protocol.readSync(this.url), {
        wasi: this._loader._wasiFor(this)
      })
    } else {
      this.exports = new Bare.Addon(this.url).exports
    }
  }
}
