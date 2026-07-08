const Bundle = require('bare-bundle')
const Module = require('../module')
const constants = require('../constants')
const SyntheticModule = require('./synthetic')
const { readSource } = require('../helpers')

// A bundle module, whose source is an archive of other modules. The bundle
// introduces its own imports map, resolutions, and protocol for the modules it
// contains, and its exports are those of its main module.
module.exports = class BundleModule extends SyntheticModule {
  constructor(url) {
    super(url)

    this._bundle = null
  }

  get type() {
    return constants.type.BUNDLE
  }

  _initialize(source, referrer) {
    const protocol = this._context.protocol

    source = readSource(this, source)

    const bundle = Bundle.from(source).mount(this._url.href + '/')

    this._bundle = bundle

    this._context = this._context.fork({
      imports: bundle.imports,
      resolutions: bundle.resolutions,
      protocol: protocol.extend({
        postresolve(context, url) {
          return bundle.exists(url.href) ? url : context.postresolve(url)
        },

        exists(context, url, type) {
          return bundle.exists(url.href) || context.exists(url, type)
        },

        read(context, url) {
          return bundle.read(url.href) || context.read(url)
        }
      })
    })
  }

  _evaluate() {
    if ((this._state & constants.state.EVALUATED) !== 0) return

    this._state |= constants.state.EVALUATED

    const bundle = this._bundle

    if (bundle.main) {
      this.exports = Module.load(new URL(bundle.main), bundle.read(bundle.main), {
        referrer: this
      }).exports
    }
  }

  // A bundle re-exports the names of its main module.
  _exportNames(names, queue) {
    const bundle = this._bundle

    if (!bundle.main) return

    const main = Module.load(new URL(bundle.main), bundle.read(bundle.main), {
      isImport: true,
      referrer: this
    })

    if (main._names) {
      for (const name of main._names) names.add(name)
    } else {
      queue.push(main)
    }
  }
}
