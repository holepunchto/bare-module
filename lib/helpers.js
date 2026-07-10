const path = require('bare-path')
const { fileURLToPath } = require('bare-url')
const strip = require('bare-type-stripper')
const errors = require('./errors')

const isWindows = Bare.platform === 'win32'

const typeScriptExtensions = new Set(['.ts', '.cts', '.mts'])

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
