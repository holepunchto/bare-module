const Module = require('../module')
const constants = require('../constants')
const binding = require('../../binding')
const SyntheticModule = require('./synthetic')
const {
  readSource,
  stripTypeScript,
  urlToPath,
  urlToDirname,
  collectExportNames
} = require('../helpers')

// A CommonJS module, backed by a function that receives `require`, `module`,
// `exports`, `__filename`, and `__dirname` and populates its exports when run.
module.exports = class CommonJSModule extends SyntheticModule {
  constructor(url) {
    super(url)

    this._source = null
    this._function = null
  }

  get type() {
    return constants.types.SCRIPT
  }

  _initialize(source, referrer, extension) {
    source = stripTypeScript(readSource(this, source), extension)

    this._source = source

    this._function = binding.createFunction(
      this._url.href,
      ['require', 'module', 'exports', '__filename', '__dirname'],
      source.toString(),
      0
    )

    Module._registry.set(binding.getFunctionID(this._function), this)
  }

  _evaluate() {
    if ((this._state & constants.states.EVALUATED) !== 0) return

    this._state |= constants.states.EVALUATED

    const require = Module.createRequire(this._url, { module: this })

    this.exports = {}

    const fn = this._function // Bind to variable to ensure proper stack trace

    fn(require, this, this.exports, urlToPath(this._url), urlToDirname(this._url))
  }

  // A script module contributes the export names found by lexing its source,
  // along with the names of any modules it re-exports from.
  _exportNames(names, queue) {
    collectExportNames(this, this._source, names, queue)
  }
}
