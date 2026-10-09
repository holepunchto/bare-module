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

// A WebAssembly addon whose exports are the number 42.
const wasm = addon([], 0x41, 42)

// A WebAssembly addon whose exports are the error number of asking WASI for
// randomness, which is 0 if it was granted.
const wasmRandom = addon(['random_get'], 0x41, 16, 0x41, 4, 0x10, 1)

// Builds an addon that imports `js_create_uint32()` and the WASI functions
// named, which all take two numbers and return one, and that exports the
// number that `value` leaves on the stack.
function addon(wasi, ...value) {
  const imports = [
    [...string('env'), ...string('js_create_uint32'), 0x00, 0],
    ...wasi.map((name) => [...string('wasi_snapshot_preview1'), ...string(name), 0x00, 1])
  ]

  const n = imports.length

  return Buffer.from([
    ...[0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00],
    ...section(
      1,
      [0x60, 3, 0x7f, 0x7f, 0x7f, 1, 0x7f],
      [0x60, 2, 0x7f, 0x7f, 1, 0x7f],
      [0x60, 1, 0x7f, 1, 0x7f],
      [0x60, 1, 0x7f, 0]
    ),
    ...section(2, ...imports),
    ...section(3, [1], [2], [3]),
    ...section(4, [0x70, 0x00, 0]),
    ...section(5, [0x00, 1]),
    ...section(
      7,
      [...string('memory'), 0x02, 0],
      [...string('__indirect_function_table'), 0x01, 0],
      [...string('bare_register_module_v0'), 0x00, n],
      [...string('malloc'), 0x00, n + 1],
      [...string('free'), 0x00, n + 2]
    ),
    ...section(
      10,
      body(0x20, 0, ...value, 0x41, 8, 0x10, 0, 0x1a, 0x41, 8, 0x28, 2, 0),
      body(0x41, 0),
      body()
    )
  ])
}

function section(id, ...entries) {
  const contents = [entries.length, ...entries.flat()]

  return [id, contents.length, ...contents]
}

function string(value) {
  return [value.length, ...Buffer.from(value)]
}

function body(...code) {
  return [code.length + 2, 0x00, ...code, 0x0b]
}

function path(pathname) {
  return isWindows ? 'c:' + pathname.replace(/\//g, '\\') : pathname
}

module.exports = {
  asyncSources,
  host,
  isWindows,
  path,
  prebuilds,
  root,
  sources,
  wasm,
  wasmRandom
}
