const Bundle = require('bare-bundle')
const SyntheticModule = require('./synthetic')

module.exports = class BundleModule extends SyntheticModule {
  constructor(loader, source) {
    super(loader, source)

    this._bundle = null
    this._mainURL = null
    this._linked = false
    this._linking = null
  }

  _open() {
    if (this._bundle !== null) return this._bundle

    const bundle = Bundle.from(this._source.bytes).mount(this.url.href + '/')

    this._bundle = bundle

    if (bundle.main) {
      this._mainURL = new URL(bundle.main)

      this._loader._addBundle(bundle)
    }

    return bundle
  }

  _mount() {
    if (this._linked) return

    if (this._open().main) this._loader._linkBundleSync(this._bundle)

    this._linked = true
  }

  _mountAsync() {
    if (this._linking === null) this._linking = this._linkAsync()

    return this._linking
  }

  _ensureMounted() {
    if (this._linking === null) this._mount()
  }

  async _linkAsync() {
    if (this._open().main) await this._loader._linkBundle(this._bundle)

    this._linked = true
  }

  _main() {
    return this._mainURL === null ? null : this._loader.get(this._mainURL)
  }

  _exportNames(seen = new Set()) {
    this._ensureMounted()

    const main = this._main()

    return main === null ? new Set(['default']) : main._exportNames(seen)
  }

  _initialize() {
    this._ensureMounted()
  }

  _execute() {
    const main = this._main()

    this.exports = main === null ? null : main._evaluate()
  }
}
