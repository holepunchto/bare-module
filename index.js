const { isURL, pathToFileURL } = require('bare-url')
const { constants } = require('bare-module-traverse')
const Module = require('./lib/module')
const ModuleProtocol = require('./lib/protocol')
const ModuleLoader = require('./lib/loader')
const ModuleSource = require('./lib/source')

module.exports = exports = Module

exports.Protocol = ModuleProtocol
exports.Loader = ModuleLoader

exports.constants = constants

exports.load = async function load(url, source = null, opts = {}) {
  if (typeof url === 'string') url = new URL(url)

  if (source !== null && typeof source !== 'string' && !ArrayBuffer.isView(source)) {
    opts = source
    source = null
  }

  opts = optionsFor(opts)

  const loader = loaderFor(opts)

  const record = await loader.link(url, source, opts)

  return loader._evaluate(record)
}

exports.loadSync = function loadSync(url, source = null, opts = {}) {
  if (typeof url === 'string') url = new URL(url)

  if (source !== null && typeof source !== 'string' && !ArrayBuffer.isView(source)) {
    opts = source
    source = null
  }

  opts = optionsFor(opts)

  const loader = loaderFor(opts)

  const record = loader.linkSync(url, source, opts)

  record._evaluate()

  return record
}

exports.resolve = async function resolve(specifier, parentURL, condition = 'require', opts = {}) {
  if (typeof condition === 'object' && condition !== null) {
    opts = condition
    condition = 'require'
  }

  const { loader, parent } = resolveWith(specifier, parentURL, condition, optionsFor(opts))

  return await loader._resolve(specifier, parent, condition)
}

exports.resolveSync = function resolveSync(specifier, parentURL, condition = 'require', opts = {}) {
  if (typeof condition === 'object' && condition !== null) {
    opts = condition
    condition = 'require'
  }

  const { loader, parent } = resolveWith(specifier, parentURL, condition, optionsFor(opts))

  return loader._resolveSync(specifier, parent, condition)
}

const conditions = ['require', 'import', 'asset', 'addon']

function resolveWith(specifier, parentURL, condition, opts) {
  if (typeof specifier !== 'string') {
    throw new TypeError(
      `Specifier must be a string. Received type ${typeof specifier} (${specifier})`
    )
  }

  if (conditions.includes(condition) === false) {
    throw new TypeError(
      `Condition must be one of ${conditions.join(', ')}. Received type ${typeof condition} (${condition})`
    )
  }

  const referrer = opts.referrer || null

  if (parentURL === undefined || parentURL === null) {
    parentURL = referrer ? referrer.url : pathToFileURL('./')
  } else if (typeof parentURL === 'string') {
    parentURL = new URL(parentURL)
  }

  return { loader: loaderFor(opts), parent: assertURL(parentURL, 'Parent URL') }
}

function assertURL(url, name) {
  if (isURL(url)) return url

  throw new TypeError(`${name} must be a URL. Received type ${typeof url} (${url})`)
}

function optionsFor(opts) {
  if (opts === undefined || opts === null) return {}

  if (typeof opts === 'object') return opts

  throw new TypeError(`Options must be an object. Received type ${typeof opts} (${opts})`)
}

exports.createRequire = function createRequire(parentURL, opts = {}) {
  opts = optionsFor(opts)

  let referrer = opts.referrer || null

  const loader = loaderFor(opts)

  if (referrer === null) {
    if (typeof parentURL === 'string') {
      parentURL = URL.parse(parentURL) || pathToFileURL(parentURL)
    }

    assertURL(parentURL, 'Parent URL')

    referrer = new Module(
      loader,
      new ModuleSource({
        url: parentURL,
        type: 0,
        source: Buffer.alloc(0),
        imports: {},
        lexer: { imports: [], exports: [] }
      })
    )

    if (loader.main === null) loader._main = referrer
  }

  return loader._createRequire(referrer)
}

function loaderFor(opts) {
  const referrer = opts.referrer || null

  if (referrer === null) return new ModuleLoader(opts)

  return referrer._loader._fork(opts)
}
