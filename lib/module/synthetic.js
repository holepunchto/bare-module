const Module = require('../module')
const constants = require('../constants')
const binding = require('../../binding')

// Base class for every module that is exposed to the ES module system through a
// native synthetic module. Such a module computes its exports in JavaScript and
// pushes them into the synthetic module rather than being evaluated by the
// engine. Scripts, JSON, text, binary, addon, bundle, and builtin modules are
// all synthetic in this sense.
module.exports = class SyntheticModule extends Module {
  constructor(url) {
    super(url)

    this._names = null
  }

  _synthesize() {
    if ((this._state & constants.states.SYNTHESIZED) !== 0) return

    this._state |= constants.states.SYNTHESIZED

    // Collect the export names of this module and, transitively, of any modules
    // it re-exports from. Re-export targets that have not yet been synthesized
    // are queued so their own names are collected in turn.
    const names = new Set(['default'])
    const queue = [this]
    const seen = new Set()

    while (queue.length) {
      const module = queue.pop()

      if (seen.has(module)) continue

      seen.add(module)

      module._exportNames(names, queue)
    }

    this._names = Array.from(names)

    // Create the native synthetic module and attach it to this instance,
    // registering the instance under the module's id so it can be found again
    // from native code.
    const id = binding.createSyntheticModule(this, this._url.href, this._names, Module._handle)

    Module._registry.set(id, this)
  }
}
