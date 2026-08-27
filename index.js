const { pathToFileURL } = require('bare-url')
const { constants } = require('bare-module-traverse')
const Module = require('./lib/module')
const ModuleProtocol = require('./lib/protocol')
const ModuleLoader = require('./lib/loader')
const ModuleSource = require('./lib/source')

const loaderOptions = [
  'builtins',
  'cache',
  'concurrency',
  'defaultType',
  'imports',
  'protocol',
  'resolutions'
]

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

  const loader = loaderFor(opts)

  const record = await loader.link(url, source, opts)

  return loader._evaluate(record)
}

exports.resolve = function resolve(specifier, parentURL, condition = 'require', opts = {}) {
  if (typeof condition === 'object' && condition !== null) {
    opts = condition
    condition = 'require'
  }

  return resolveWith(specifier, parentURL, condition, opts)
}

exports.asset = function asset(specifier, parentURL, opts = {}) {
  return resolveWith(specifier, parentURL, 'asset', opts)
}

async function resolveWith(specifier, parentURL, condition, opts) {
  if (typeof specifier !== 'string') {
    throw new TypeError(
      `Specifier must be a string. Received type ${typeof specifier} (${specifier})`
    )
  }

  const referrer = opts.referrer || null

  if (parentURL === undefined || parentURL === null) {
    parentURL = referrer ? referrer.url : pathToFileURL('./')
  } else if (typeof parentURL === 'string') {
    parentURL = new URL(parentURL)
  }

  return await loaderFor(opts)._resolveAsync(specifier, parentURL, condition)
}

exports.createRequire = function createRequire(parentURL, opts = {}) {
  let referrer = opts.referrer || null

  const loader = loaderFor(opts)

  if (referrer === null) {
    if (typeof parentURL === 'string') {
      parentURL = URL.parse(parentURL) || pathToFileURL(parentURL)
    }

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

  const loader = referrer._loader

  if (!loaderOptions.some((name) => opts[name] !== undefined)) return loader

  const options = {
    builtins: loader.builtins,
    concurrency: loader.concurrency,
    defaultType: loader.defaultType,
    imports: loader.imports,
    protocol: loader.protocol,
    ...opts
  }

  // Narrowing what a module may reach starts a graph of its own. The cache and
  // the resolutions of the referrer belong to what it could reach, and every
  // record in that cache is a handle to the loader that read it.
  const shares = options.protocol === loader.protocol && options.builtins === loader.builtins

  if (shares) {
    if (options.cache === undefined) options.cache = loader.cache
    if (options.resolutions === undefined) options.resolutions = loader.resolutions
  }

  const forked = new ModuleLoader(options)

  // Which module the program was launched from doesn't change with the options
  // another one is loaded with, so long as the two still share a graph.
  if (shares) forked._main = loader.main

  return forked
}
