const lex = require('bare-module-lexer')
const strip = require('bare-type-stripper')
const binding = require('../binding')
const { urlToPath, urlToDirname } = require('./url')
const ModuleContext = require('./context')

const { REEXPORT, ADDON, ASSET } = lex.constants

const UNLINKED = 0
const LINKED = 1
const EVALUATING = 2
const EVALUATED = 3

module.exports = exports = class Module {
  constructor(loader, source) {
    this._loader = loader
    this._source = source
    this._status = UNLINKED

    this._id = null
    this._names = null
    this._promise = null
    this._error = null

    this.exports = null
  }

  get url() {
    return this._source.url
  }

  get type() {
    return this._source.type
  }

  get defaultType() {
    return this._loader.defaultType
  }

  get main() {
    return this._loader.main
  }

  get imports() {
    return this._loader.imports
  }

  get resolutions() {
    return this._loader.resolutions
  }

  get builtins() {
    return this._loader.builtins
  }

  get conditions() {
    return this._loader.conditions
  }

  get protocol() {
    return this._loader.protocol
  }

  get cache() {
    return this._loader.cache
  }

  // For Node.js compatibility
  get filename() {
    return urlToPath(this.url)
  }

  // For Node.js compatibility
  get dirname() {
    return urlToDirname(this.url)
  }

  // For Node.js compatibility
  get id() {
    return this.filename
  }

  // For Node.js compatibility
  get path() {
    return this.dirname
  }

  _resolve(specifier, condition) {
    const entry = this._source.imports[specifier]

    if (entry === undefined) return null

    const href = pickCondition(entry, condition)

    return href === null ? null : new URL(href)
  }

  _exportNames(seen = new Set()) {
    const names = new Set(['default'])

    if (seen.has(this)) return names

    seen.add(this)

    for (const entry of this._source.lexer.exports) names.add(entry.name)

    for (const entry of this._source.lexer.imports) {
      if ((entry.type & REEXPORT) === 0) continue
      if ((entry.type & ADDON) !== 0 || (entry.type & ASSET) !== 0) continue

      const url = this._resolve(entry.specifier, 'import')

      const target = url && this._loader.get(url)

      if (target) {
        for (const name of target._exportNames(seen)) names.add(name)
      }
    }

    return names
  }

  _instantiate() {
    if (this._status >= LINKED) return

    this._initialize()

    this._status = LINKED
  }

  _evaluate() {
    if (this._error !== null) throw this._error

    if (this._status >= EVALUATING) return this.exports

    this._instantiate()

    this._status = EVALUATING

    try {
      this._execute()
    } catch (err) {
      this._error = err

      throw err
    }

    this._status = EVALUATED

    return this.exports
  }

  _initialize() {}

  _synthesize() {}

  _execute() {}

  _run() {
    if (this._promise === null) {
      this._instantiate()

      this._promise = this._runModule()

      if (this._loader._pending !== null) this._loader._pending.push(this._promise)
    }

    return this._promise
  }

  _text() {
    return stripTypeScript(this._source.bytes, this.url).toString()
  }

  _createModule(source) {
    this._id = binding.createModule(ModuleContext, this, this.url.href, source, 0)

    ModuleContext.add(this)
  }

  _createSyntheticModule(names) {
    this._id = binding.createSyntheticModule(ModuleContext, this, this.url.href, names)

    ModuleContext.add(this)
  }

  _createFunction(source) {
    const fn = binding.createFunction(
      this.url.href,
      ['require', 'module', 'exports', '__filename', '__dirname'],
      source,
      0
    )

    this._id = binding.getFunctionID(fn)

    ModuleContext.add(this)

    return fn
  }

  _runModule() {
    return binding.runModule(ModuleContext, this, this._onrun)
  }

  _moduleNamespace() {
    return binding.getModuleNamespace(this)
  }

  _onrun(reason, promise, err = reason) {
    if (err) {
      promise.catch(() => {}) // Don't leak the rejection before it is rethrown.

      throw err
    }
  }
}

function pickCondition(entry, condition) {
  if (typeof entry === 'string') return entry

  if (condition in entry) return pickCondition(entry[condition], condition)

  if ('default' in entry) return pickCondition(entry.default, condition)

  return null
}

const typeScriptExtension = /\.(c|m)?ts$/

function stripTypeScript(source, url) {
  return typeScriptExtension.test(url.pathname) ? strip(source) : source
}
