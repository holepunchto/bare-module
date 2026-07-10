const { pathToFileURL } = require('bare-url')
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

  const loader = opts.referrer ? opts.referrer._loader : new ModuleLoader(opts)

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

  const loader = referrer ? referrer._loader : new ModuleLoader(opts)

  return await loader._resolveAsync(specifier, parentURL, condition)
}

exports.createRequire = function createRequire(parentURL, opts = {}) {
  let referrer = opts.referrer || null

  if (referrer === null) {
    if (typeof parentURL === 'string') {
      parentURL = URL.parse(parentURL) || pathToFileURL(parentURL)
    }

    const loader = new ModuleLoader(opts)

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

  return referrer._loader._createRequire(referrer)
}
