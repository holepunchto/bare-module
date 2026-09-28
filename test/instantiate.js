const test = require('brittle')
const Bundle = require('bare-bundle')
const Module = require('..')
const { asyncSources, root, sources } = require('./helpers')

function loader(store) {
  return new Module.Loader({ protocol: sources(store) })
}

test('instantiating compiles a module without running it', (t) => {
  const l = loader({
    [root + '/foo.js']: 'globalThis.ran = true\nmodule.exports = 1'
  })

  delete globalThis.ran

  const [record] = l.instantiateSync(root + '/foo.js')

  t.absent(globalThis.ran, 'the body has not run')
  t.is(l.importSync(new URL(root + '/foo.js')), 1, 'and running it still works')
  t.ok(globalThis.ran)
  t.is(l.get(new URL(root + '/foo.js')), record, 'which is the same module either way')

  delete globalThis.ran
})

test('instantiating a module that will not parse throws', (t) => {
  const l = loader({ [root + '/foo.js']: 'const broken = (' })

  t.exception.all(() => l.instantiateSync(root + '/foo.js'), SyntaxError)
})

test('instantiating reaches what a module imports', (t) => {
  const l = loader({
    [root + '/foo.js']: "module.exports = require('./bar')",
    [root + '/bar.js']: 'const broken = ('
  })

  t.exception.all(
    () => l.instantiateSync(root + '/foo.js'),
    SyntaxError,
    'which is what makes it worth asking before running anything'
  )
})

// What is unresolved is deferred, which is what lets a module require
// something that is not there on this platform and never ask for it. So this
// answers whether a source compiles, not whether everything it names exists,
// and both module systems answer the same way.
test('a specifier that leads nowhere is left to whoever runs it', (t) => {
  const l = loader({
    [root + '/foo.js']: "module.exports = require('./missing')",
    [root + '/foo.mjs']: "import './missing.mjs'\n"
  })

  t.execution(() => l.instantiateSync(root + '/foo.js'))
  t.exception(() => l.importSync(new URL(root + '/foo.js')), 'and found by running it')

  t.execution(() => l.instantiateSync(root + '/foo.mjs'))
})

test('instantiating does not make a module the main', (t) => {
  const l = loader({ [root + '/foo.js']: 'module.exports = 1' })

  l.instantiateSync(root + '/foo.js')

  t.is(l.main, null, 'because nothing was entered through')

  l.importSync(new URL(root + '/foo.js'))

  t.is(l.main.url.href, root + '/foo.js')
})

test('instantiating leaves a module that already ran alone', (t) => {
  const store = { [root + '/foo.js']: 'module.exports = 1' }

  const l = loader(store)

  t.is(l.importSync(new URL(root + '/foo.js')), 1)

  store[root + '/foo.js'] = 'module.exports = 2'

  l.instantiateSync(root + '/foo.js')

  t.is(
    l.importSync(new URL(root + '/foo.js')),
    1,
    'so it is asked after a patch rather than before one'
  )
})

// The whole point of asking: a source that cannot be compiled is found out
// before anything is torn down to make room for it.
test('a patch that will not parse is found without running it', (t) => {
  const l = loader({ [root + '/foo.js']: 'module.exports = 1' })

  t.is(l.importSync(new URL(root + '/foo.js')), 1)

  l.patch(new Bundle().write(root + '/foo.js', 'const broken = ('))

  t.exception.all(() => l.instantiateSync(root + '/foo.js'), SyntaxError)

  l.patch(new Bundle().write(root + '/foo.js', 'module.exports = 2'))

  t.execution(() => l.instantiateSync(root + '/foo.js'))

  t.is(l.importSync(new URL(root + '/foo.js')), 2)
})

test('instantiating takes a string, a URL or a list', (t) => {
  const l = loader({
    [root + '/foo.js']: 'module.exports = 1',
    [root + '/bar.js']: 'module.exports = 2'
  })

  t.is(l.instantiateSync(root + '/foo.js').length, 1)
  t.is(l.instantiateSync(new URL(root + '/bar.js')).length, 1)
  t.is(l.instantiateSync([root + '/foo.js', new URL(root + '/bar.js')]).length, 2)
})

test('instantiating an ES module compiles it without running it', (t) => {
  const l = loader({
    [root + '/foo.mjs']: 'globalThis.ran = true\nexport default 1\n'
  })

  delete globalThis.ran

  l.instantiateSync(root + '/foo.mjs')

  t.absent(globalThis.ran, 'the body has not run')

  delete globalThis.ran
})

test('instantiating an ES module that will not parse throws', (t) => {
  const l = loader({ [root + '/foo.mjs']: 'export default (' })

  t.exception.all(() => l.instantiateSync(root + '/foo.mjs'), SyntaxError)
})

test('instantiating asynchronously reads what it needs', async (t) => {
  const l = new Module.Loader({
    protocol: asyncSources({
      [root + '/foo.js']: "module.exports = require('./bar')",
      [root + '/bar.js']: 'module.exports = 1'
    })
  })

  const [record] = await l.instantiate(root + '/foo.js')

  t.ok(record)
  t.is(await l.import(new URL(root + '/foo.js')), 1)
})

test('instantiating a builtin is what the graph already holds', (t) => {
  const l = new Module.Loader({
    protocol: sources({}),
    builtins: { foo: 42 }
  })

  const [record] = l.instantiateSync('builtin:foo')

  t.is(record.exports, 42)
})
