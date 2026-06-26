const Module = require('../module')
const constants = require('../constants')
const binding = require('../../binding')
const { readSource, stripTypeScript, collectExportNames } = require('../helpers')

// An ECMAScript module, backed by a native source text module that the engine
// instantiates, links, and evaluates.
module.exports = class ESModule extends Module {
  constructor(url) {
    super(url)

    this._source = null
  }

  get type() {
    return constants.types.MODULE
  }

  _initialize(source, referrer, extension) {
    source = stripTypeScript(readSource(this, source), extension)

    this._source = source

    // Create the native module and attach it to this instance, registering the
    // instance under the module's id so it can be found again from native code.
    const id = binding.createModule(this, this._url.href, source.toString(), 0, Module._handle)

    Module._registry.set(id, this)
  }

  _evaluate() {
    if ((this._state & constants.states.EVALUATED) !== 0) return

    this._state |= constants.states.EVALUATED

    this._run()

    this.exports = binding.getModuleNamespace(this)
  }

  _exportNames(names, queue) {
    collectExportNames(Module, this, this._source, names, queue)
  }
}
