const test = require('brittle')
const { pathToFileURL } = require('bare-url')
const Module = require('..')
const { host, path, prebuilds, root, sources } = require('./helpers')

// The addon this package builds, standing in for whatever a protocol resolves.
const addon = () => pathToFileURL(require.addon.resolve('..'))

test('load .cjs with .bare import', async (t) => {
  const protocol = sources(
    {
      [root + '/index.cjs']: "require('./native.bare')",
      [root + '/native.bare']: null
    },
    {
      resolve: () => addon()
    }
  )

  await t.execution(Module.load(new URL(root + '/index.cjs'), { protocol }))
})

test('load .cjs with dynamic .bare import', async (t) => {
  const protocol = sources(
    {
      [root + '/index.cjs']: "import('./native.bare')",
      [root + '/native.bare']: null
    },
    {
      resolve: () => addon()
    }
  )

  await t.execution(Module.load(new URL(root + '/index.cjs'), { protocol }))
})

test('load .mjs with .bare import', async (t) => {
  const protocol = sources(
    {
      [root + '/index.mjs']: "import './native.bare'",
      [root + '/native.bare']: null
    },
    {
      resolve: () => addon()
    }
  )

  await t.execution(Module.load(new URL(root + '/index.mjs'), { protocol }))
})

test('load .mjs with dynamic .bare import', async (t) => {
  const protocol = sources(
    {
      [root + '/index.mjs']: "await import('./native.bare')",
      [root + '/native.bare']: null
    },
    {
      resolve: () => addon()
    }
  )

  await t.execution(Module.load(new URL(root + '/index.mjs'), { protocol }))
})

test('require.addon', async (t) => {
  const protocol = sources(
    {
      [root + '/foo.js']: "module.exports = require.addon('.')",
      [root + '/package.json']: '{ "name": "foo", "version": "1.2.3" }',
      [prebuilds + '/foo.bare']: null
    },
    {
      resolve: () => addon()
    }
  )

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.alike(Object.keys(exports), Object.keys(require.addon('..')))
})

test('require.addon with parentURL', async (t) => {
  const protocol = sources(
    {
      [root + '/foo.js']: `module.exports = require.addon('.', new URL('${root}/dir/'))`,
      [root + '/dir/package.json']: '{ "name": "bar", "version": "1.2.3" }',
      [root + '/dir/prebuilds/' + host + '/bar.bare']: null
    },
    {
      resolve: () => addon()
    }
  )

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.alike(Object.keys(exports), Object.keys(require.addon('..')))
})

test('require.addon is cached', async (t) => {
  const protocol = sources(
    {
      [root + '/foo.js']: "module.exports = require.addon('.') === require.addon('.')",
      [root + '/package.json']: '{ "name": "foo", "version": "1.2.3" }',
      [prebuilds + '/foo.bare']: null
    },
    {
      resolve: () => addon()
    }
  )

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, true)
})

test('require.addon.host', async (t) => {
  const protocol = sources({
    [root + '/foo.js']: 'module.exports = require.addon.host'
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, host)
})

test('require.addon.resolve', async (t) => {
  const protocol = sources({
    [root + '/foo.js']: "module.exports = require.addon.resolve('.')",
    [root + '/package.json']: '{ "name": "foo", "version": "1.2.3" }',
    [prebuilds + '/foo.bare']: null
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, path('/prebuilds/' + host + '/foo.bare'))
})

test('require.addon.resolve with parentURL', async (t) => {
  const protocol = sources({
    [root + '/foo.js']: `module.exports = require.addon.resolve('.', new URL('${root}/dir/'))`,
    [root + '/dir/package.json']: '{ "name": "bar", "version": "1.2.3" }',
    [root + '/dir/prebuilds/' + host + '/bar.bare']: null
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, path('/dir/prebuilds/' + host + '/bar.bare'))
})

test('import.meta.addon', async (t) => {
  const protocol = sources(
    {
      [root + '/foo.mjs']: "export default import.meta.addon('.')",
      [root + '/package.json']: '{ "name": "foo", "version": "1.2.3" }',
      [prebuilds + '/foo.bare']: null
    },
    {
      resolve: () => addon()
    }
  )

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.alike(Object.keys(exports.default), Object.keys(require.addon('..')))
})

test('import.meta.addon is cached', async (t) => {
  const protocol = sources(
    {
      [root + '/foo.mjs']: "export default import.meta.addon('.') === import.meta.addon('.')",
      [root + '/package.json']: '{ "name": "foo", "version": "1.2.3" }',
      [prebuilds + '/foo.bare']: null
    },
    {
      resolve: () => addon()
    }
  )

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.is(exports.default, true)
})

test('import.meta.addon.host', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']: 'export default import.meta.addon.host'
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.is(exports.default, host)
})

test('import.meta.addon.resolve', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']: "export default import.meta.addon.resolve('.')",
    [root + '/package.json']: '{ "name": "foo", "version": "1.2.3" }',
    [prebuilds + '/foo.bare']: null
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.is(exports.default, root + '/prebuilds/' + host + '/foo.bare')
})

test('loader addons', async (t) => {
  const protocol = sources(
    {
      [root + '/foo.js']: "module.exports = require.addon('.')",
      [root + '/package.json']: '{ "name": "foo", "version": "1.2.3" }',
      [prebuilds + '/foo.bare']: null
    },
    {
      resolve: () => addon()
    }
  )

  const resolutions = Object.create(null)

  const loader = new Module.Loader({ protocol, resolutions })

  await loader.link(new URL(root + '/foo.js'))

  t.is(resolutions[root + '/foo.js']['.'], addon().href)
})

test('loader addons resolved during evaluation', async (t) => {
  const protocol = sources(
    {
      [root + '/foo.js']: `module.exports = require.addon('.', new URL('${root}/dir/'))`,
      [root + '/dir/package.json']: '{ "name": "bar", "version": "1.2.3" }',
      [root + '/dir/prebuilds/' + host + '/bar.bare']: null
    },
    {
      resolve: () => addon()
    }
  )

  const loader = new Module.Loader({ protocol })

  await loader.link(new URL(root + '/foo.js'))

  t.is(loader.get(addon()), null, 'the addon is not linked until it is asked for')

  await loader.import(new URL(root + '/foo.js'))

  t.not(loader.get(addon()), null)
})
