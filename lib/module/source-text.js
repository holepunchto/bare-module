const Module = require('../module')

module.exports = class SourceTextModule extends Module {
  _initialize() {
    this._createModule(this._text())
  }

  _execute() {
    this._run()

    this.exports = this._moduleNamespace()
  }
}
