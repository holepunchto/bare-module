const lex = require('bare-module-lexer')
const strip = require('bare-type-stripper')
const binding = require('../binding')
const { urlToPath, urlToDirname } = require('./url')
const errors = require('./errors')

const { REEXPORT, ADDON, ASSET } = lex.constants

const UNLINKED = 0
const LINKED = 1
const EVALUATING = 2
const EVALUATED = 3

// The context never leaves this module. A module graph is no wall, so anything
// that knows this module's URL reaches the `Module` it exports, and the context
// must not be among what it reaches; holding it is what lets the binding create
// and run modules, and holding its records is what would let one graph name a
// module that another graph, given another protocol, loaded.
class ModuleContext {
  constructor() {
    this.records = new WeakMap()

    binding.init(this, onimport, ondynamicimport, onevaluate, onmeta)
  }

  adopt(module, id) {
    module._id = id

    this.records.set(id, module)
  }
}

const context = new ModuleContext()

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

  [Symbol.for('bare.inspect')]() {
    return {
      __proto__: { constructor: Module },

      url: this.url,
      type: this.type,
      defaultType: this.defaultType,
      main: this.main,
      exports: this.exports
    }
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
    context.adopt(this, binding.createModule(context, this, this.url.href, source, 0))
  }

  _createSyntheticModule(names) {
    context.adopt(this, binding.createSyntheticModule(context, this, this.url.href, names))
  }

  _createFunction(source) {
    const fn = binding.createFunction(
      this.url.href,
      ['require', 'module', 'exports', '__filename', '__dirname'],
      source,
      0
    )

    context.adopt(this, binding.getFunctionID(fn))

    return fn
  }

  _runModule() {
    return binding.runModule(context, this, onrun)
  }

  _moduleNamespace() {
    return binding.getModuleNamespace(context, this)
  }
}

function onimport(specifier, id) {
  const referrer = context.records.get(id) || null

  if (referrer === null) {
    throw errors.MODULE_NOT_FOUND(`Cannot find referrer for module '${specifier}'`, specifier)
  }

  const url = referrer._resolve(specifier, 'import')

  const child = referrer._loader._lookup(url)

  if (!child) {
    throw errors.MODULE_NOT_FOUND(
      `Cannot find module '${specifier}' imported from '${referrer.url.href}'`,
      specifier,
      referrer.url
    )
  }

  child._instantiate()
  child._synthesize()

  return child
}

async function ondynamicimport(specifier, referrerName, id) {
  const referrer = context.records.get(id) || null

  if (referrer === null) {
    throw errors.MODULE_NOT_FOUND(
      `Cannot find referrer for dynamically imported module '${specifier}'`,
      specifier
    )
  }

  const loader = referrer._loader

  let url = referrer._resolve(specifier, 'import')

  let record = loader._lookup(url)

  if (record === null) {
    url = await loader._resolveAsync(specifier, referrer.url, 'import')

    record = await loader.link(url, null, { referrerType: referrer.type })
  } else {
    record._instantiate()
  }

  record._synthesize()

  await record._run()

  return record._moduleNamespace()
}

function onevaluate(id) {
  const record = context.records.get(id) || null

  if (record === null) {
    throw errors.MODULE_NOT_FOUND('Cannot find module being evaluated', null)
  }

  record._evaluate()

  for (const name of record._names) {
    let value

    if (
      name === 'default' &&
      (typeof record.exports !== 'object' ||
        record.exports === null ||
        name in record.exports === false)
    ) {
      value = record.exports
    } else {
      value = record.exports[name]
    }

    binding.setModuleExport(context, record, name, value)
  }
}

function onmeta(id, meta) {
  const record = context.records.get(id) || null

  if (record === null) {
    throw errors.MODULE_NOT_FOUND('Cannot find module being initialized', null)
  }

  meta.url = record.url.href
  meta.main = record._loader.main === record

  // For Node.js compatibility.
  meta.dirname = record.dirname
  meta.filename = record.filename

  meta.resolve = function (specifier) {
    const url = record._resolve(specifier, 'import')

    return url === null
      ? record._loader._resolveSync(specifier, record.url, 'import').href
      : url.href
  }

  meta.asset = function (specifier) {
    return record._loader._resolveArtifact(record, specifier, 'asset').href
  }

  meta.addon = function (specifier = '.') {
    return record._loader._addon(record, specifier)
  }

  meta.addon.resolve = function (specifier = '.') {
    return record._loader._resolveArtifact(record, specifier, 'addon').href
  }

  meta.addon.host = Bare.Addon.host
}

function onrun(reason, promise, err = reason) {
  if (err) {
    promise.catch(() => {}) // Don't leak the rejection before it is rethrown.

    throw err
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
