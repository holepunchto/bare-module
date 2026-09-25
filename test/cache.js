const test = require('brittle')
const { pathToFileURL } = require('bare-url')
const Module = require('..')
const { asyncSources, prebuilds, root, sources } = require('./helpers')

const addon = () => pathToFileURL(require.addon.resolve('..'))

test('load with cache', async (t) => {
  const cache = Object.create(null)

  const protocol = sources({
    [root + '/index.cjs']: 'module.exports = 42'
  })

  const a = await Module.load(new URL(root + '/index.cjs'), { protocol, cache })
  const b = await Module.load(new URL(root + '/index.cjs'), { protocol, cache })

  t.is(a.exports, 42)
  t.is(b.exports, 42)
  t.is(a, b, 'a shared cache shares the record')
})

test('load without cache', async (t) => {
  const protocol = sources({
    [root + '/index.cjs']: 'module.exports = 42'
  })

  const a = await Module.load(new URL(root + '/index.cjs'), { protocol })
  const b = await Module.load(new URL(root + '/index.cjs'), { protocol })

  t.is(a.exports, 42)
  t.is(b.exports, 42)
  t.not(a, b, 'without a cache nothing is shared')
})

test('load addon with cache', async (t) => {
  const cache = Object.create(null)

  const protocol = sources(
    {
      [root + '/index.cjs']: "module.exports = require.addon('.')",
      [root + '/package.json']: '{ "name": "foo", "version": "1.2.3" }',
      [prebuilds + '/foo.bare']: null
    },
    {
      resolve: () => addon()
    }
  )

  const a = await Module.load(new URL(root + '/index.cjs'), { protocol, cache })
  const b = await Module.load(new URL(root + '/index.cjs'), { protocol, cache })

  t.is(a.exports, b.exports)
})

test('load addon without cache', async (t) => {
  const protocol = sources(
    {
      [root + '/index.cjs']: "module.exports = require.addon('.')",
      [root + '/package.json']: '{ "name": "foo", "version": "1.2.3" }',
      [prebuilds + '/foo.bare']: null
    },
    {
      resolve: () => addon()
    }
  )

  const a = await Module.load(new URL(root + '/index.cjs'), { protocol })
  const b = await Module.load(new URL(root + '/index.cjs'), { protocol })

  t.not(a.exports, b.exports)
  t.alike(Object.keys(a.exports), Object.keys(b.exports))
})

test('load with referrer shares the loader', async (t) => {
  const protocol = sources({
    [root + '/foo.cjs']: 'module.exports = 1',
    [root + '/bar.cjs']: 'module.exports = 2'
  })

  const cache = Object.create(null)

  const foo = await Module.load(new URL(root + '/foo.cjs'), { protocol, cache })
  const bar = await Module.load(new URL(root + '/bar.cjs'), { referrer: foo })

  t.is(foo.exports, 1)
  t.is(bar.exports, 2)
  t.is(cache[root + '/bar.cjs'], bar, 'the referrer cache is read into')
})

test('load with referrer keeps the referrer main', async (t) => {
  const protocol = sources({
    [root + '/foo.cjs']: 'module.exports = 1',
    [root + '/bar.cjs']: 'module.exports = require.main.url.href'
  })

  const foo = await Module.load(new URL(root + '/foo.cjs'), { protocol })
  const bar = await Module.load(new URL(root + '/bar.cjs'), { referrer: foo })

  t.is(bar.exports, root + '/foo.cjs', 'a shared graph keeps the main it was launched from')
})

test('a fork is given a fresh cache by naming one', (t) => {
  const protocol = sources({
    [root + '/index.cjs']: 'module.exports = 42'
  })

  const referrer = Module.loadSync(new URL(root + '/index.cjs'), { protocol })

  const shared = Module.loadSync(new URL(root + '/index.cjs'), { referrer, concurrency: 1 })

  t.is(shared, referrer, 'a fork that reaches as far shares the graph')

  const fresh = Module.loadSync(new URL(root + '/index.cjs'), {
    referrer,
    cache: Object.create(null)
  })

  t.not(fresh, referrer, 'naming a cache of its own starts a graph of its own')
})

test('load with referrer shares the referrer resolutions', async (t) => {
  const protocol = sources({
    [root + '/foo.cjs']: 'module.exports = 1',
    [root + '/bar.cjs']: 'module.exports = 2'
  })

  const foo = await Module.load(new URL(root + '/foo.cjs'), { protocol })
  const bar = await Module.load(new URL(root + '/bar.cjs'), { referrer: foo })

  t.is(bar.resolutions, foo.resolutions)
})

test('load with referrer and protocol uses the given protocol', async (t) => {
  const protocol = sources({ [root + '/foo.cjs']: 'module.exports = 1' })
  const other = sources({ [root + '/bar.cjs']: 'module.exports = 2' })

  const cache = Object.create(null)

  const foo = await Module.load(new URL(root + '/foo.cjs'), { protocol, cache })
  const bar = await Module.load(new URL(root + '/bar.cjs'), {
    referrer: foo,
    protocol: other
  })

  t.is(foo.exports, 1)
  t.is(bar.exports, 2)
  t.is(bar.protocol, other, 'the given protocol wins over the referrer')
  t.is(cache[root + '/foo.cjs'], foo, 'the referrer cache holds the referrer')
  t.absent(cache[root + '/bar.cjs'], 'the cache is not shared across protocols')
})

test('load with referrer and protocol gives the fork a main of its own', async (t) => {
  const protocol = sources({ [root + '/foo.cjs']: 'module.exports = 1' })
  const other = sources({ [root + '/bar.cjs']: 'module.exports = require.main.url.href' })

  const foo = await Module.load(new URL(root + '/foo.cjs'), { protocol })
  const bar = await Module.load(new URL(root + '/bar.cjs'), {
    referrer: foo,
    protocol: other
  })

  t.is(bar.exports, root + '/bar.cjs', 'a fork that reaches elsewhere is its own main')
})

test('load with referrer and protocol does not leak the referrer protocol', async (t) => {
  const protocol = sources({ [root + '/foo.cjs']: 'module.exports = 1' })
  const other = sources({ [root + '/bar.cjs']: 'module.exports = 2' })

  const cache = Object.create(null)

  const foo = await Module.load(new URL(root + '/foo.cjs'), { protocol })

  await Module.load(new URL(root + '/bar.cjs'), {
    referrer: foo,
    protocol: other,
    cache
  })

  t.ok(cache[root + '/bar.cjs'], 'the fork reads into the given cache')
  t.absent(cache[root + '/foo.cjs'], 'the referrer is not in the fork cache')

  for (const href of Object.keys(cache)) {
    t.not(cache[href].protocol, protocol, `'${href}' cannot reach the referrer protocol`)
  }
})

test('load with referrer and protocol does not leak the referrer resolutions', async (t) => {
  const protocol = sources({ [root + '/foo.cjs']: 'module.exports = 1' })
  const other = sources({ [root + '/bar.cjs']: 'module.exports = 2' })

  const foo = await Module.load(new URL(root + '/foo.cjs'), { protocol })
  const bar = await Module.load(new URL(root + '/bar.cjs'), { referrer: foo, protocol: other })

  t.not(bar.resolutions, foo.resolutions)
  t.absent(bar.resolutions[root + '/foo.cjs'], 'the referrer is not in the fork resolutions')
})

test('load with referrer and protocol cannot read through the referrer', async (t) => {
  t.plan(2)

  const protocol = sources(
    {
      [root + '/foo.cjs']: 'module.exports = 1',
      [root + '/secret.cjs']: 'module.exports = 2'
    },
    {
      read(url) {
        if (url.href === root + '/foo.cjs') {
          return 'module.exports = 1'
        }

        t.fail('the referrer protocol was used')
      }
    }
  )

  const denied = new Module.Protocol()

  const foo = await Module.load(new URL(root + '/foo.cjs'), { protocol })

  t.is(foo.exports, 1)

  await t.exception(
    Module.load(new URL(root + '/secret.cjs'), { referrer: foo, protocol: denied }),
    /MODULE_NOT_FOUND/
  )
})

test('load with referrer and builtins uses the given builtins', async (t) => {
  const protocol = sources({
    [root + '/foo.cjs']: 'module.exports = 1',
    [root + '/bar.cjs']: "module.exports = require('baz')"
  })

  const cache = Object.create(null)

  const foo = await Module.load(new URL(root + '/foo.cjs'), { protocol, cache })
  const bar = await Module.load(new URL(root + '/bar.cjs'), {
    referrer: foo,
    builtins: { baz: 42 }
  })

  t.is(bar.exports, 42)
  t.is(bar.protocol, foo.protocol, 'the protocol is inherited from the referrer')
  t.is(cache[root + '/foo.cjs'], foo, 'the referrer cache holds the referrer')
  t.absent(cache[root + '/bar.cjs'], 'the cache is not shared across builtins')
})

test('a fork that reaches elsewhere reads its own package scope', async (t) => {
  const reads = []

  const record = (store) => ({
    read(url) {
      reads.push(url.href)

      return store[url.href] ?? null
    }
  })

  const wideStore = {
    [root + '/index.js']: 'module.exports = 42',
    [root + '/package.json']: '{ "name": "wide" }'
  }

  const narrowStore = {
    [root + '/dep.js']: 'module.exports = 43',
    [root + '/package.json']: '{ "name": "narrow" }'
  }

  const wide = sources(wideStore, record(wideStore))
  const narrow = sources(narrowStore, record(narrowStore))

  const referrer = await Module.load(new URL(root + '/index.js'), { protocol: wide })

  await Module.load(new URL(root + '/dep.js'), { referrer, protocol: narrow })

  t.alike(
    reads.filter((href) => href === root + '/package.json'),
    [root + '/package.json', root + '/package.json'],
    'the manifest is read again through the protocol the fork was given'
  )
})

test('resolve with referrer and protocol uses the given protocol', async (t) => {
  const protocol = sources({ [root + '/foo.cjs']: 'module.exports = 1' })
  const other = sources({ [root + '/bar.js']: null })

  const foo = await Module.load(new URL(root + '/foo.cjs'), { protocol })

  const url = await Module.resolve('./bar', new URL(root + '/'), {
    referrer: foo,
    protocol: other
  })

  t.is(url.href, root + '/bar.js')
})

test('createRequire with referrer and protocol uses the given protocol', async (t) => {
  const protocol = sources({ [root + '/foo.cjs']: 'module.exports = 1' })
  const other = sources({ [root + '/bar.js']: 'module.exports = 42' })

  const foo = await Module.load(new URL(root + '/foo.cjs'), { protocol })

  const require = Module.createRequire(null, { referrer: foo, protocol: other })

  t.is(require('./bar'), 42)
})

test('createRequire with referrer and no protocol keeps the referrer protocol', async (t) => {
  const protocol = sources({
    [root + '/foo.cjs']: 'module.exports = 1',
    [root + '/bar.cjs']: 'module.exports = 42'
  })

  const foo = await Module.load(new URL(root + '/foo.cjs'), { protocol })

  const require = Module.createRequire(null, {
    referrer: foo,
    protocol: undefined,
    cache: Object.create(null)
  })

  t.is(require('./bar'), 42)
})

test('createRequire with referrer and its own cache does not share main', async (t) => {
  const protocol = sources({ [root + '/foo.cjs']: 'module.exports = 1' })

  const foo = await Module.load(new URL(root + '/foo.cjs'), { protocol })

  t.is(Module.createRequire(null, { referrer: foo, imports: {} }).main, foo)

  t.is(Module.createRequire(null, { referrer: foo, cache: Object.create(null) }).main, null)
})

test('load over a cache read with different builtins throws', async (t) => {
  const cache = Object.create(null)

  const protocol = sources({
    [root + '/foo.cjs']: 'module.exports = 1',
    [root + '/bar.cjs']: 'module.exports = 2'
  })

  await Module.load(new URL(root + '/foo.cjs'), {
    protocol,
    builtins: { baz: 42 },
    cache
  })

  await t.exception(
    Module.load(new URL(root + '/bar.cjs'), { protocol, builtins: { baz: 43 }, cache }),
    /CACHE_INCOMPATIBLE/
  )
})

test('load over a cache read through a different protocol throws', async (t) => {
  const cache = Object.create(null)

  const protocol = sources({ [root + '/foo.cjs']: 'module.exports = 1' })
  const other = sources({ [root + '/bar.cjs']: 'module.exports = 2' })

  await Module.load(new URL(root + '/foo.cjs'), { protocol, cache })

  await t.exception(
    Module.load(new URL(root + '/bar.cjs'), { protocol: other, cache }),
    /CACHE_INCOMPATIBLE/
  )
})

test('load over a cache claimed by a loader that reaches elsewhere throws', async (t) => {
  const cache = Object.create(null)

  const protocol = asyncSources({ [root + '/foo.cjs']: 'module.exports = 1' })
  const other = asyncSources({ [root + '/bar.cjs']: 'module.exports = 2' })

  // The cache is still empty when both loaders are constructed, so it is the
  // claim rather than what the cache holds that must catch this.
  const a = Module.load(new URL(root + '/foo.cjs'), { protocol, cache })
  const b = Module.load(new URL(root + '/bar.cjs'), { protocol: other, cache })

  await t.execution(a)

  await t.exception(b, /CACHE_INCOMPATIBLE/)
})

test('cache written with a record read through a different protocol throws', async (t) => {
  const protocol = sources({ [root + '/foo.cjs']: 'module.exports = 1' })

  const foo = await Module.load(new URL(root + '/foo.cjs'), { protocol })

  const cache = Object.create(null)

  const loader = new Module.Loader({ protocol: new Module.Protocol(), cache })

  cache[root + '/foo.cjs'] = foo

  t.exception(() => loader.get(new URL(root + '/foo.cjs')), /CACHE_INCOMPATIBLE/)
})
