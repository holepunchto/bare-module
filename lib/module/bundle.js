const Bundle = require('bare-bundle')
const SyntheticModule = require('./synthetic')

module.exports = class BundleModule extends SyntheticModule {
  constructor(loader, source) {
    super(loader, source)

    this._bundle = null
    this._mainURL = null
  }

  _mount() {
    if (this._bundle !== null) return

    const bundle = Bundle.from(this._source.bytes).mount(this.url.href + '/')

    this._bundle = bundle

    if (bundle.main) {
      this._mainURL = new URL(bundle.main)

      this._loader._linkBundle(bundle)
    }
  }

  _main() {
    return this._mainURL === null ? null : this._loader.get(this._mainURL)
  }

  _exportNames(seen = new Set()) {
    this._mount()

    const main = this._main()

    return main === null ? new Set(['default']) : main._exportNames(seen)
  }

  _initialize() {
    this._mount()

    super._initialize()
  }

  _execute() {
    const main = this._main()

    this.exports = main === null ? null : main._evaluate()
  }
}
