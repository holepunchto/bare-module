const path = require('bare-path')
const { fileURLToPath } = require('bare-url')
const strip = require('bare-type-stripper')
const lex = require('bare-module-lexer')
const errors = require('./errors')

const isWindows = Bare.platform === 'win32'

const typeScriptExtensions = new Set(['.ts', '.cts', '.mts'])

exports.collectExportNames = function collectExportNames(module, source, names, queue) {
  // Required lazily as this module is loaded before `Module` is defined.
  const Module = require('./module')

  const result = lex(source)

  for (const { name } of result.exports) names.add(name)

  for (const { specifier, type } of result.imports) {
    if (
      (type & lex.constants.REEXPORT) !== 0 &&
      (type & lex.constants.ADDON) === 0 &&
      (type & lex.constants.ASSET) === 0
    ) {
      const resolved = Module.resolve(specifier, module._url, {
        isImport: true,
        referrer: module
      })

      const target = Module.load(resolved, {
        isImport: true,
        referrer: module
      })

      if (target._names) {
        for (const name of target._names) names.add(name)
      } else {
        queue.push(target)
      }
    }
  }
}

exports.readSource = function readSource(module, source) {
  if (source === null) source = module._context.protocol.read(module._url)

  if (typeof source === 'string') source = Buffer.from(source)

  return source
}

exports.stripTypeScript = function stripTypeScript(source, extension) {
  return typeScriptExtensions.has(extension) ? strip(source) : source
}

exports.urlToPath = function urlToPath(url) {
  if (url.protocol === 'file:') return fileURLToPath(url)

  assertValidURLPath(url)

  return decodeURIComponent(url.pathname)
}

exports.urlToDirname = function urlToDirname(url) {
  if (url.protocol === 'file:') return path.dirname(fileURLToPath(url))

  assertValidURLPath(url)

  return decodeURIComponent(new URL('.', url).pathname).replace(/\/$/, '')
}

function assertValidURLPath(url) {
  if (isWindows) {
    if (/%2f|%5c/i.test(url.pathname)) {
      throw errors.INVALID_URL_PATH('The URL path must not include encoded \\ or / characters')
    }
  } else {
    if (/%2f/i.test(url.pathname)) {
      throw errors.INVALID_URL_PATH('The URL path must not include encoded / characters')
    }
  }
}
