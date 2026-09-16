const test = require('brittle')
const Module = require('..')
const { asyncSources, root, sources } = require('./helpers')

test('loadSync', (t) => {
  const protocol = sources({
    [root + '/foo.cjs']: "module.exports = require('/bar.cjs')",
    [root + '/bar.cjs']: 'module.exports = 42'
  })

  const { exports } = Module.loadSync(new URL(root + '/foo.cjs'), { protocol })

  t.is(exports, 42)
})

test('loadSync .mjs', (t) => {
  const protocol = sources({
    [root + '/foo.mjs']: 'export default 42'
  })

  const { exports } = Module.loadSync(new URL(root + '/foo.mjs'), { protocol })

  t.is(exports.default, 42)
})

test('loadSync with source', (t) => {
  const protocol = sources({
    [root + '/bar.cjs']: 'module.exports = 42'
  })

  const { exports } = Module.loadSync(
    new URL(root + '/foo.cjs'),
    Buffer.from("module.exports = require('/bar.cjs')"),
    { protocol, cache: Object.create(null) }
  )

  t.is(exports, 42)
})

test('loadSync with string url', (t) => {
  const protocol = sources({
    [root + '/foo.cjs']: 'module.exports = 42'
  })

  const { exports } = Module.loadSync(root + '/foo.cjs', { protocol })

  t.is(exports, 42)
})

test('loadSync with top-level await returns before evaluation finishes', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']: `
      export let done = false
      await new Promise((resolve) => setImmediate(resolve))
      done = true
    `
  })

  // There is nothing here to await the evaluation on, so the module comes back
  // as soon as evaluation starts.
  const { exports } = Module.loadSync(new URL(root + '/foo.mjs'), { protocol })

  t.is(exports.done, false, 'evaluation has not passed the await yet')

  await new Promise((resolve) => setImmediate(resolve))

  t.is(exports.done, true, 'the live binding reflects the finished evaluation')
})

test('loader importSync', (t) => {
  const protocol = sources({
    [root + '/index.js']: 'module.exports = 42'
  })

  const loader = new Module.Loader({ protocol })

  t.is(loader.importSync(new URL(root + '/index.js')), 42)
})

test('loader import', async (t) => {
  const protocol = sources({
    [root + '/index.mjs']: 'export default 42'
  })

  const loader = new Module.Loader({ protocol })

  const exports = await loader.import(new URL(root + '/index.mjs'))

  t.is(exports.default, 42)
})

test('loader linkSync and get', (t) => {
  const protocol = sources({
    [root + '/index.cjs']: 'module.exports = 42'
  })

  const loader = new Module.Loader({ protocol })

  const record = loader.linkSync(new URL(root + '/index.cjs'))

  t.is(loader.get(new URL(root + '/index.cjs')), record)
  t.is(loader.get(new URL(root + '/missing.cjs')), null)
  t.is(loader.main, record)
})

test('loader link', async (t) => {
  const protocol = sources({
    [root + '/index.mjs']: 'export default 42'
  })

  const loader = new Module.Loader({ protocol })

  const record = await loader.link(new URL(root + '/index.mjs'))

  t.is(record.url.href, root + '/index.mjs')
  t.is(loader.get(new URL(root + '/index.mjs')), record)
})

test('loader import with concurrency', async (t) => {
  const protocol = asyncSources({
    [root + '/a.mjs']: "import '/b.mjs'; import '/c.mjs'; export default 42",
    [root + '/b.mjs']: 'export default 1',
    [root + '/c.mjs']: 'export default 2'
  })

  const loader = new Module.Loader({ protocol, concurrency: 1 })

  const exports = await loader.import(new URL(root + '/a.mjs'))

  t.is(exports.default, 42)
})

test('loader link with concurrency signals the semaphore on throw', async (t) => {
  const protocol = asyncSources(
    { [root + '/foo.mjs']: null },
    {
      async read(url) {
        throw new Error('foo')
      }
    }
  )

  const loader = new Module.Loader({ protocol, concurrency: 1 })

  await t.exception(loader.link(new URL(root + '/foo.mjs')), /Error: foo/)
})

test('a caller may not hand a loader the caches it reads into', async (t) => {
  const packages = new Map()
  const prefixes = new Map()

  const protocol = sources({
    [root + '/index.js']: "module.exports = require.asset('./foo.txt')",
    [root + '/package.json']: '{ "name": "foo" }',
    [root + '/foo.txt']: null
  })

  const loader = new Module.Loader({ protocol })

  await loader.link(new URL(root + '/index.js'), null, { packages, prefixes })

  t.is(packages.size, 0, 'what this protocol read stays with this loader')
  t.is(prefixes.size, 0)
})
