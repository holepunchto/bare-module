const test = require('brittle')
const { pathToFileURL } = require('bare-url')
const Module = require('..')
const binding = require('../binding')
const { root, sources } = require('./helpers')

test('an environment may hold more than one module context', (t) => {
  const addon = new Bare.Addon(pathToFileURL(require.addon.resolve('..')))

  t.not(addon.exports, binding, 'a second instance of this addon')

  // Every unit carries its own hooks, so contexts don't compete for one
  // environment-wide callback and a second one is safe. There is one whenever
  // this module is bundled twice.
  const a = createContext()
  const b = createContext()

  const other = {}
  addon.exports.createContext(other, noop, noop, noop, noop)

  t.ok(binding.createModule(a, {}, root + '/a.mjs', 'export default 1', 0))
  t.ok(binding.createModule(b, {}, root + '/b.mjs', 'export default 2', 0))
  t.ok(addon.exports.createModule(other, {}, root + '/c.mjs', 'export default 3', 0))
})

test('a module context outlives the object it was created on', (t) => {
  // Every unit holds the context it was made with, so dropping the object and
  // collecting it must neither free the context out from under them nor keep
  // every context that was ever made alive.
  for (let i = 0; i < 1000; i++) {
    const context = createContext()

    binding.createModule(context, {}, root + '/' + i + '.mjs', 'export default 1', 0)
    binding.createSyntheticModule(context, {}, root + '/' + i + '.cjs', ['default'])
    binding.createFunction(context, root + '/' + i + '.js', [], 'return 1', 0)

    new Array(1024).fill(i)
  }

  t.pass()
})

test('a module cannot cross module contexts', async (t) => {
  const a = createContext()
  const b = createContext()

  const module = {}
  binding.createModule(a, module, root + '/index.mjs', 'export default 1', 0)

  await t.exception.all(() => binding.runModule(b, module, noop))
  await t.exception.all(() => binding.getModuleNamespace(b, module))
})

test('module context is required to create, run and read modules', async (t) => {
  await t.exception.all(
    () => binding.createFunction({}, root + '/index.js', [], 'return 1', 0),
    TypeError
  )

  await t.exception.all(
    () => binding.createModule({}, {}, root + '/index.mjs', 'export default 42', 0),
    TypeError
  )

  await t.exception.all(
    () => binding.createSyntheticModule({}, {}, root + '/index.mjs', ['default']),
    TypeError
  )

  await t.exception.all(() => binding.runModule({}, {}, noop), TypeError)

  await t.exception.all(() => binding.setModuleExport({}, {}, 'default', 1), TypeError)

  await t.exception.all(() => binding.getModuleNamespace({}, {}), TypeError)
})

test('dynamic import from an unregistered referrer is refused', async (t) => {
  const protocol = sources({
    [root + '/secret.mjs']: 'export default 42'
  })

  // A loader that could serve the specifier, but was never handed to whoever
  // is importing it.
  new Module.Loader({ protocol })

  const context = createContext()

  const fn = binding.createFunction(
    context,
    root + '/index.js',
    [],
    `return import('${root}/secret.mjs')`,
    0
  )

  t.is(await fn(), undefined, 'the import reaches no loader')
})

test('function source must be a string', async (t) => {
  const context = createContext()

  await t.exception.all(
    () => binding.createFunction(context, root + '/index.js', [], 42, 0),
    TypeError
  )
})

test('function file name must be a string', async (t) => {
  const context = createContext()

  await t.exception.all(() => binding.createFunction(context, 42, [], 'return 1', 0), TypeError)
})

test('over-long function file name is refused', async (t) => {
  const context = createContext()

  const file = root + '/' + 'a'.repeat(5000) + '.js'

  await t.exception.all(() => binding.createFunction(context, file, [], 'return 1', 0), {
    code: 'ENAMETOOLONG'
  })
})

test('function argument names must be strings', async (t) => {
  const context = createContext()

  await t.exception.all(
    () => binding.createFunction(context, root + '/index.js', 'x', 'return 1', 0),
    TypeError
  )

  await t.exception.all(
    () => binding.createFunction(context, root + '/index.js', ['x', 42], 'return 1', 0),
    TypeError
  )

  const names = ['x']

  Object.defineProperty(names, 0, {
    configurable: true,
    get() {
      return 42
    }
  })

  await t.exception.all(
    () => binding.createFunction(context, root + '/index.js', names, 'return 1', 0),
    TypeError
  )
})

test('over-long function argument name list is refused', async (t) => {
  const context = createContext()

  const names = ['require', 'module', 'exports', '__filename', '__dirname']

  t.ok(binding.createFunction(context, root + '/index.js', names, 'return 1', 0))

  await t.exception.all(
    () => binding.createFunction(context, root + '/index.js', [...names, 'extra'], 'return 1', 0),
    { code: 'E2BIG' }
  )

  const many = []
  many.length = 0xffffffff

  await t.exception.all(
    () => binding.createFunction(context, root + '/index.js', many, 'return 1', 0),
    { code: 'E2BIG' }
  )
})

test('function offset must be a 32-bit integer', async (t) => {
  const context = createContext()

  for (const offset of [1.5, 1e21, NaN, Infinity]) {
    await t.exception.all(
      () => binding.createFunction(context, root + '/index.js', [], 'return 1', offset),
      TypeError
    )
  }

  t.is(binding.createFunction(context, root + '/index.js', ['x'], 'return x * 2', 0)(21), 42)
})

test('function offset must not be negative', async (t) => {
  const context = createContext()

  await t.exception.all(
    () => binding.createFunction(context, root + '/index.js', [], 'return 1', -1),
    RangeError
  )
})

test('function id requires a function', async (t) => {
  await t.exception.all(() => binding.getFunctionID({}), TypeError)

  t.ok(typeof binding.getFunctionID(noop) === 'symbol')
})

function createContext() {
  const context = {}

  binding.createContext(context, noop, noop, noop, noop)

  return context
}

function noop() {}
