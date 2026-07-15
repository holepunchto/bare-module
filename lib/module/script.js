const SyntheticModule = require('./synthetic')

module.exports = class ScriptModule extends SyntheticModule {
  constructor(loader, source) {
    super(loader, source)

    this._fn = null
  }

  _initialize() {
    this._fn = this._createFunction(this._text())
  }

  _execute() {
    this.exports = {}

    const require = this._loader._createRequire(this)

    const fn = this._fn // Bind to a variable to ensure a proper stack trace.

    fn(require, this, this.exports, this.filename, this.dirname)
  }
}
