const Module = require('..')

const isWindows = Bare.platform === 'win32'

const host = Bare.Addon.host
const root = isWindows ? 'file:///c:' : 'file://'
const prebuilds = root + '/prebuilds/' + host

function sources(store, overrides = {}) {
  return new Module.Protocol({
    exists: (url) => url.href in store,
    read: (url) => store[url.href] ?? null,
    ...overrides
  })
}

function asyncSources(store, overrides = {}) {
  return new Module.Protocol({
    async exists(url) {
      return url.href in store
    },

    async read(url) {
      return store[url.href] ?? null
    },

    ...overrides
  })
}

function path(pathname) {
  return isWindows ? 'c:' + pathname.replace(/\//g, '\\') : pathname
}

module.exports = { asyncSources, host, isWindows, path, prebuilds, root, sources }
