const path = require('bare-path')
const { fileURLToPath } = require('bare-url')
const errors = require('./errors')

const isWindows = Bare.platform === 'win32'

exports.urlToPath = function urlToPath(url) {
  if (url.protocol === 'file:') return fileURLToPath(url)

  if (isOpaque(url)) return url.href

  assertValidURLPath(url)

  return decodeURIComponent(url.pathname)
}

exports.urlToDirname = function urlToDirname(url) {
  if (url.protocol === 'file:') return path.dirname(fileURLToPath(url))

  if (isOpaque(url)) return url.href

  assertValidURLPath(url)

  return decodeURIComponent(new URL('.', url).pathname).replace(/\/$/, '')
}

function isOpaque(url) {
  return url.pathname[0] !== '/'
}

function assertValidURLPath(url) {
  const encoded = url.pathname

  if (encoded.includes('%') === false) return

  if (isWindows) {
    if (/%2f|%5c/i.test(encoded)) {
      throw errors.INVALID_URL_PATH('The URL path must not include encoded \\ or / characters')
    }
  } else {
    if (/%2f/i.test(encoded)) {
      throw errors.INVALID_URL_PATH('The URL path must not include encoded / characters')
    }
  }

  // A path is handed on to whoever asked for it, and a NUL ends it early for
  // anything that reads it as a C string. Truncating turns one path into
  // another, so turn it down rather than decode it.
  if (/%00/i.test(encoded)) {
    throw errors.INVALID_URL_PATH('The URL path must not include encoded NUL characters')
  }
}
