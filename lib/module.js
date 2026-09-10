const lex = require('bare-module-lexer')
const strip = require('bare-type-stripper')
const binding = require('../binding')
const { urlToPath, urlToDirname } = require('./url')
const errors = require('./errors')

const { REEXPORT, ADDON, ASSET } = lex.constants

const DEFERRED_PROTOCOL = 'deferred:'

const UNLINKED = 0
const LINKED = 1
const EVALUATING = 2
const EVALUATED = 3

// The context never leaves this module. A module graph is no wall, so anything
// that knows this module's URL reaches the `Module` it exports, and the context
// must not be among what it reaches; holding it is what lets the binding create
// and run modules, and holding its records is what would let one graph name a
// module that another graph, given another protocol, loaded.
//
// There may be more than one of these in an environment, as there is whenever
// this module is bundled twice. Each answers only for the units it created, so
// neither can see the other's imports.
class ModuleContext {
  constructor() {
    this.records = new WeakMap()

    binding.createContext(this, onimport, ondynamicimport, onevaluate, onmeta)
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

  get protocol() {
    return this._loader.protocol
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
      exports: this.exports
    }
  }

  _resolve(specifier, condition) {
    const entry = this._source.imports[specifier]

    if (entry === undefined) return null

    const href = pickCondition(entry, condition)

    if (href === null) return null

    const url = new URL(href)

    // A specifier recorded as deferred was left for whoever names it, which is
    // whoever is asking. Answering nothing sends them to the resolver.
    return url.protocol === DEFERRED_PROTOCOL ? null : url
  }

  _exportNames(seen = new Set()) {
    const names = new Set(['default'])

    if (seen.has(this)) return names

    seen.add(this)

    for (const entry of this._source.lexer.exports) names.add(entry.name)

    for (const entry of this._source.lexer.imports) {
      if ((entry.type & REEXPORT) === 0) continue
      if ((entry.type & ADDON) !== 0 || (entry.type & ASSET) !== 0) continue

      const target = this._reexported(entry.specifier)

      if (target) {
        for (const name of target._exportNames(seen)) names.add(name)
      }
    }

    return names
  }

  _reexported(specifier) {
    let url = this._resolve(specifier, 'import')

    if (url === null) {
      try {
        url = this._loader._resolveSync(specifier, this.url, 'import')
      } catch {
        return null
      }
    }

    return this._loader._lookup(url)
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
      context,
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

function onimport(specifier, attributes, id) {
  const referrer = context.records.get(id) || null

  if (referrer === null) {
    throw errors.MODULE_NOT_FOUND(`Cannot find referrer for module '${specifier}'`, specifier)
  }

  const loader = referrer._loader

  const url = referrer._resolve(specifier, 'import')

  let child = loader._lookup(url)

  // A deferred specifier is resolved by whoever names it, and here that is the
  // engine, part way through instantiating the graph.
  if (child === null) child = loader._importSync(specifier, referrer.url)

  if (!child) {
    throw errors.MODULE_NOT_FOUND(
      `Cannot find module '${specifier}' imported from '${referrer.url.href}'`,
      specifier,
      referrer.url
    )
  }

  loader._assertType(child, attributes)

  child._instantiate()
  child._synthesize()

  return child
}

async function ondynamicimport(specifier, attributes, referrerName, id) {
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
    url = await loader._resolve(specifier, referrer.url, 'import')

    record = await loader.link(url, null, {
      attributes,
      importType: lex.constants.IMPORT | lex.constants.DYNAMIC
    })
  } else {
    record._instantiate()
  }

  loader._assertType(record, attributes)

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
  meta.cache = record._loader.cache

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

const entryConditions = ['require', 'import', 'asset', 'addon']

function pickCondition(entry, condition) {
  if (typeof entry === 'string') return entry

  if (entry === null || typeof entry !== 'object') return null

  if (Object.hasOwn(entry, condition)) return pickCondition(entry[condition], condition)

  for (const key of Object.keys(entry)) {
    if (key !== 'default' && entryConditions.includes(key) === false) return null
  }

  if (Object.hasOwn(entry, 'default')) return pickCondition(entry.default, condition)

  return null
}

const typeScriptExtension = /\.(c|m)?ts$/

function stripTypeScript(source, url) {
  return typeScriptExtension.test(url.pathname) ? strip(source) : source
}
