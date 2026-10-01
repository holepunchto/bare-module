const test = require('brittle')
const Bundle = require('bare-bundle')
const Module = require('..')
const { root, sources } = require('./helpers')

function loader(store) {
  return new Module.Loader({ protocol: sources(store) })
}

test('evict reads a module again', (t) => {
  const store = {
    [root + '/foo.js']: 'module.exports = 1'
  }

  const l = loader(store)

  t.is(l.importSync(new URL(root + '/foo.js')), 1)

  store[root + '/foo.js'] = 'module.exports = 2'

  t.is(l.importSync(new URL(root + '/foo.js')), 1, 'until it is evicted')

  t.alike(
    l.evict(new URL(root + '/foo.js')).map((url) => url.href),
    [root + '/foo.js']
  )

  t.is(l.importSync(new URL(root + '/foo.js')), 2)
})

test('evict answers with what it knew', (t) => {
  const l = loader({ [root + '/foo.js']: 'module.exports = 1' })

  l.importSync(new URL(root + '/foo.js'))

  t.alike(l.evict(new URL(root + '/nothing.js')), [], 'a module it never held')
  t.is(l.evict(new URL(root + '/foo.js')).length, 1)
  t.alike(l.evict(new URL(root + '/foo.js')), [], 'and not twice')
})

test('evict takes a string, a URL or a list', (t) => {
  const store = {
    [root + '/foo.js']: 'module.exports = 1',
    [root + '/bar.js']: 'module.exports = 2'
  }

  const l = loader(store)

  l.importSync(new URL(root + '/foo.js'))
  l.importSync(new URL(root + '/bar.js'))

  t.is(l.evict(root + '/foo.js').length, 1)
  t.is(l.evict([new URL(root + '/bar.js')]).length, 1)
})

test('evict forgets what a module imported', (t) => {
  const store = {
    [root + '/foo.js']: "module.exports = require('./bar')",
    [root + '/bar.js']: 'module.exports = 1',
    [root + '/baz.js']: 'module.exports = 2'
  }

  const l = loader(store)

  t.is(l.importSync(new URL(root + '/foo.js')), 1)

  store[root + '/foo.js'] = "module.exports = require('./baz')"

  l.evict(new URL(root + '/foo.js'))

  t.is(l.importSync(new URL(root + '/foo.js')), 2, 'the new import is resolved')
})

test('patch replaces what the graph holds', (t) => {
  const l = loader({ [root + '/foo.js']: 'module.exports = 1' })

  t.is(l.importSync(new URL(root + '/foo.js')), 1)

  const patch = new Bundle().write(root + '/foo.js', 'module.exports = 2')

  t.alike(
    l.patch(patch).map((url) => url.href),
    [root + '/foo.js']
  )

  t.is(l.importSync(new URL(root + '/foo.js')), 2)
})

test('patch is found before what it patches', (t) => {
  const l = loader({ [root + '/foo.js']: 'module.exports = 1' })

  l.importSync(new URL(root + '/foo.js'))

  l.patch(new Bundle().write(root + '/foo.js', 'module.exports = 2'))
  l.patch(new Bundle().write(root + '/foo.js', 'module.exports = 3'))

  t.is(l.importSync(new URL(root + '/foo.js')), 3, 'the last patch wins')
})

test('patch carries the imports it was packed with', (t) => {
  const l = loader({
    [root + '/foo.js']: "module.exports = require('./bar')",
    [root + '/bar.js']: 'module.exports = 1'
  })

  t.is(l.importSync(new URL(root + '/foo.js')), 1)

  const patch = new Bundle()
    .write(root + '/foo.js', "module.exports = require('./baz')", {
      imports: { './baz': { require: root + '/baz.js' } }
    })
    .write(root + '/baz.js', 'module.exports = 2')

  l.patch(patch)

  t.is(l.importSync(new URL(root + '/foo.js')), 2, 'resolved without asking the protocol')
})

test('a module that reaches a patched one is the caller to evict', (t) => {
  const l = loader({
    [root + '/foo.js']: "module.exports = require('./bar')",
    [root + '/bar.js']: 'module.exports = 1'
  })

  t.is(l.importSync(new URL(root + '/foo.js')), 1)

  l.patch(new Bundle().write(root + '/bar.js', 'module.exports = 2'))

  t.is(l.importSync(new URL(root + '/foo.js')), 1, 'until its importer is evicted too')

  l.evict(new URL(root + '/foo.js'))

  t.is(l.importSync(new URL(root + '/foo.js')), 2)
})

test('patch leaves the protocol the cache is claimed with', (t) => {
  const protocol = sources({ [root + '/foo.js']: 'module.exports = 1' })

  const l = new Module.Loader({ protocol })

  l.patch(new Bundle().write(root + '/foo.js', 'module.exports = 2'))

  t.is(l.protocol, protocol)

  const other = new Module.Loader({ protocol, cache: l.cache })

  t.is(
    other.importSync(new URL(root + '/foo.js')),
    2,
    'a loader sharing the cache shares the patch'
  )
})

test('patch is shared with a fork that shares the cache', async (t) => {
  const protocol = sources({
    [root + '/foo.js']: 'module.exports = 1',
    [root + '/bar.js']: 'module.exports = 2'
  })

  const cache = Object.create(null)

  const foo = await Module.load(new URL(root + '/foo.js'), { protocol, cache })

  foo._loader.patch(new Bundle().write(root + '/bar.js', 'module.exports = 3'))

  const bar = await Module.load(new URL(root + '/bar.js'), { referrer: foo, imports: {} })

  t.is(bar.exports, 3)
})
