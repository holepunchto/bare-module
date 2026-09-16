const test = require('brittle')
const Module = require('..')
const { asyncSources, path, root, sources } = require('./helpers')

test('load .js with asset import', async (t) => {
  const protocol = sources({
    [root + '/index.js']: "module.exports = require.asset('./foo.txt')",
    [root + '/foo.txt']: null
  })

  const { exports } = await Module.load(new URL(root + '/index.js'), { protocol })

  t.is(exports, path('/foo.txt'))
})

test('load .cjs with asset import', async (t) => {
  const protocol = sources({
    [root + '/index.cjs']: "module.exports = require.asset('./foo.txt')",
    [root + '/foo.txt']: null
  })

  const { exports } = await Module.load(new URL(root + '/index.cjs'), { protocol })

  t.is(exports, path('/foo.txt'))
})

test('load .mjs with asset import', async (t) => {
  const protocol = sources({
    [root + '/index.mjs']: "export default import.meta.asset('./foo.txt')",
    [root + '/foo.txt']: null
  })

  const { exports } = await Module.load(new URL(root + '/index.mjs'), { protocol })

  t.is(exports.default, root + '/foo.txt')
})

test('load .js with asset import of a .js file', async (t) => {
  const protocol = sources({
    [root + '/index.js']: "module.exports = require.asset('./foo.js')",
    [root + '/foo.js']: null
  })

  const loader = new Module.Loader({ protocol })

  t.is(await loader.import(new URL(root + '/index.js')), path('/foo.js'))
  t.is(loader.get(new URL(root + '/foo.js')), null, 'the asset is not linked as a module')
})

test('load .js with asset import using a custom protocol list', async (t) => {
  const protocol = sources(
    {
      [root + '/index.js']: "module.exports = require.asset('./assets/foo.txt')",
      [root + '/assets/foo.txt']: 'hello'
    },
    {
      *list(url) {
        if (url.href === root + '/assets/foo.txt') yield new URL(root + '/assets/foo.txt')
      }
    }
  )

  const { exports } = await Module.load(new URL(root + '/index.js'), { protocol })

  t.is(exports, path('/assets/foo.txt'))
})

test('load .js with asset import using an asynchronous protocol list', async (t) => {
  const protocol = asyncSources(
    {
      [root + '/index.js']: "module.exports = require.asset('./assets')"
    },
    {
      async resolve(url) {
        return url
      },

      async *list(url) {
        if (url.href === root + '/assets') yield new URL(root + '/assets/foo.txt')
      }
    }
  )

  const { exports } = await Module.load(new URL(root + '/index.js'), { protocol })

  t.is(exports, path('/assets'))
})

test('importSync with asset import uses the default protocol list', (t) => {
  const protocol = sources({
    [root + '/index.js']: "module.exports = require.asset('./foo.txt')",
    [root + '/foo.txt']: 'hello'
  })

  const loader = new Module.Loader({ protocol })

  t.is(loader.importSync(new URL(root + '/index.js')), path('/foo.txt'))
})

test('importSync with asset import uses the synchronous protocol variants', (t) => {
  const store = {
    [root + '/index.js']: "module.exports = require.asset('./foo.txt')",
    [root + '/foo.txt']: 'hello'
  }

  const protocol = new Module.Protocol({
    async exists(url) {
      t.fail('the asynchronous variant was used')
    },

    existsSync: (url) => url.href in store,

    async read(url) {
      t.fail('the asynchronous variant was used')
    },

    readSync: (url) => store[url.href] ?? null
  })

  const loader = new Module.Loader({ protocol })

  t.is(loader.importSync(new URL(root + '/index.js')), path('/foo.txt'))
})

test('load .js with asset import of a directory holding a .js file', async (t) => {
  const protocol = sources(
    {
      [root + '/index.js']: "module.exports = require.asset('./assets')",
      [root + '/assets/foo.txt']: null,
      [root + '/assets/bar.js']: null
    },
    {
      *list(url) {
        if (url.href === root + '/assets') {
          yield new URL(root + '/assets/foo.txt')
          yield new URL(root + '/assets/bar.js')
        }
      }
    }
  )

  const loader = new Module.Loader({ protocol })

  t.is(await loader.import(new URL(root + '/index.js')), path('/assets'))

  t.is(loader.get(new URL(root + '/assets/bar.js')), null)
  t.is(loader.get(new URL(root + '/assets/foo.txt')), null)
})

test('load .js requiring a file an asset directory reached', async (t) => {
  const protocol = sources(
    {
      [root + '/index.js']:
        "require.asset('./assets'); module.exports = require('./assets/' + 'foo.txt')",
      [root + '/assets/foo.txt']: 'hello'
    },
    {
      *list(url) {
        if (url.href === root + '/assets') yield new URL(root + '/assets/foo.txt')
      }
    }
  )

  const loader = new Module.Loader({ protocol })

  t.is(await loader.import(new URL(root + '/index.js')), 'hello')
})

test('asset directory is expanded once across link calls', (t) => {
  let lists = 0

  const protocol = sources(
    {
      [root + '/index.js']: "require.asset('./assets'); module.exports = require('./de' + 'p.js')",
      [root + '/dep.js']: "module.exports = require.asset('./assets')",
      [root + '/assets/foo.txt']: 'hello'
    },
    {
      *list(url) {
        lists++

        if (url.href === root + '/assets') yield new URL(root + '/assets/foo.txt')
      }
    }
  )

  const loader = new Module.Loader({ protocol })

  t.is(loader.importSync(new URL(root + '/index.js')), path('/assets'))

  t.is(lists, 1)
})

test('asset directory named twice by one module is expanded once', async (t) => {
  let lists = 0
  let probes = 0
  let resolves = 0

  const store = {
    [root + '/index.js']:
      "module.exports = [require.asset('./assets'), require.asset('./dir/../assets')]",
    [root + '/assets/foo.txt']: 'hello'
  }

  const protocol = sources(store, {
    exists(url) {
      if (url.href === root + '/assets/foo.txt') probes++

      return url.href in store
    },

    resolve(url) {
      if (url.href === root + '/assets/foo.txt') resolves++

      return url
    },

    *list(url) {
      lists++

      if (url.href === root + '/assets') yield new URL(root + '/assets/foo.txt')
    }
  })

  const { exports } = await Module.load(new URL(root + '/index.js'), { protocol })

  t.alike(exports, [path('/assets'), path('/assets')])

  t.is(lists, 1, 'listed once')
  t.is(resolves, 0, 'nothing under the directory is resolved')
  t.is(probes, 0, 'nothing under the directory is probed')
})

test('resolve asset directory through protocol list', async (t) => {
  const protocol = sources(
    {},
    {
      *list(url) {
        if (url.href === root + '/assets') yield new URL(root + '/assets/foo.txt')
      }
    }
  )

  const { href } = await Module.resolve('./assets', new URL(root + '/'), 'asset', { protocol })

  t.is(href, root + '/assets')
})

test('resolve asset directory synchronously through protocol list', (t) => {
  const protocol = sources(
    {},
    {
      *list(url) {
        if (url.href === root + '/assets') yield new URL(root + '/assets/foo.txt')
      }
    }
  )

  const { href } = Module.resolveSync('./assets', new URL(root + '/'), 'asset', { protocol })

  t.is(href, root + '/assets')
})

test('resolve asset directory through an asynchronous protocol list', async (t) => {
  const protocol = sources(
    {},
    {
      async *list(url) {
        if (url.href === root + '/assets') yield new URL(root + '/assets/foo.txt')
      }
    }
  )

  const { href } = await Module.resolve('./assets', new URL(root + '/'), 'asset', { protocol })

  t.is(href, root + '/assets')
})

test('resolve asset directory synchronously through an asynchronous protocol list', (t) => {
  const protocol = sources(
    {},
    {
      async *list(url) {
        if (url.href === root + '/assets') yield new URL(root + '/assets/foo.txt')
      }
    }
  )

  t.exception(
    () => Module.resolveSync('./assets', new URL(root + '/'), 'asset', { protocol }),
    /UNEXPECTED_PROMISE/
  )
})
