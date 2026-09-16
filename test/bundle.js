const test = require('brittle')
const Bundle = require('bare-bundle')
const Module = require('..')
const { path, root, sources } = require('./helpers')

const platform = Bare.platform

test('load .bundle', async (t) => {
  const bundle = new Bundle()
    .write('/foo.js', "module.exports = require('./bar')", { main: true })
    .write('/bar.js', 'module.exports = 42')
    .toBuffer()

  await t.execution(Module.load(new URL(root + '/app.bundle'), bundle, {}))
})

test('load .bundle with .mjs', async (t) => {
  const bundle = new Bundle()
    .write('/foo.mjs', "export { default } from './bar'", { main: true })
    .write('/bar.mjs', 'export default 42')
    .toBuffer()

  await t.execution(Module.load(new URL(root + '/app.bundle'), bundle, {}))
})

test('load .bundle without a main', async (t) => {
  const bundle = new Bundle().write('/foo.js', 'module.exports = 42').toBuffer()

  const { exports } = await Module.load(new URL(root + '/app.bundle'), bundle)

  t.is(exports, null)
})

test('load .bundle through a protocol with synchronous methods', (t) => {
  const bundle = new Bundle()
    .write('/foo.js', "module.exports = require('./bar')", { main: true })
    .write('/bar.js', 'module.exports = 42')
    .toBuffer()

  const protocol = sources({ [root + '/app.bundle']: bundle })

  const { exports } = Module.loadSync(new URL(root + '/app.bundle'), { protocol })

  t.is(exports, 42)
})

test('load .bundle from .mjs', async (t) => {
  const order = (global.order = [])

  const bundle = new Bundle().write('/main.mjs', "order.push('bundle')", { main: true }).toBuffer()

  const protocol = sources({
    [root + '/a.mjs']: "order.push('a.mjs'); import '/b.mjs'; import '/app.bundle'",
    [root + '/b.mjs']: "order.push('b.mjs')",
    [root + '/app.bundle']: bundle
  })

  await Module.load(new URL(root + '/a.mjs'), { protocol })

  delete global.order

  t.alike(order, ['b.mjs', 'bundle', 'a.mjs'])
})

test('load .bundle from .mjs reexporting a module with a side effect', async (t) => {
  const order = (global.order = [])

  const bundle = new Bundle()
    .write('/main.mjs', "export * from './lib'", { main: true })
    .write('/lib.mjs', "order.push('lib'); export const foo = 42")
    .toBuffer()

  const protocol = sources({
    [root + '/a.mjs']: "import '/b.mjs'; import { foo } from '/app.bundle'; order.push('a.mjs')",
    [root + '/b.mjs']: "order.push('b.mjs')",
    [root + '/app.bundle']: bundle
  })

  await Module.load(new URL(root + '/a.mjs'), { protocol })

  delete global.order

  t.alike(order, ['b.mjs', 'lib', 'a.mjs'])
})

test('import named exports from .bundle with .mjs main', async (t) => {
  const bundle = new Bundle().write('/foo.mjs', 'export const foo = 42', { main: true }).toBuffer()

  const protocol = sources({
    [root + '/index.mjs']: "import { foo } from '/app.bundle'; export default foo",
    [root + '/app.bundle']: bundle
  })

  const { exports } = await Module.load(new URL(root + '/index.mjs'), { protocol })

  t.is(exports.default, 42)
})

test('import named exports from .bundle with .cjs main', async (t) => {
  const bundle = new Bundle().write('/foo.cjs', 'exports.foo = 42', { main: true }).toBuffer()

  const protocol = sources({
    [root + '/index.mjs']: "import { foo } from '/app.bundle'; export default foo",
    [root + '/app.bundle']: bundle
  })

  const { exports } = await Module.load(new URL(root + '/index.mjs'), { protocol })

  t.is(exports.default, 42)
})

test('import reexported names from .bundle with .mjs main', async (t) => {
  const bundle = new Bundle()
    .write('/foo.mjs', "export * from './bar'", { main: true })
    .write('/bar.mjs', 'export const foo = 42')
    .toBuffer()

  const protocol = sources({
    [root + '/index.mjs']: "import { foo } from '/app.bundle'; export default foo",
    [root + '/app.bundle']: bundle
  })

  const { exports } = await Module.load(new URL(root + '/index.mjs'), { protocol })

  t.is(exports.default, 42)
})

test('read a .bundle through the protocol of a module it holds', async (t) => {
  const bundle = new Bundle()
    .write(
      '/foo.js',
      "module.exports = module.protocol.readSync(new URL('./bar.js', module.url)).toString()",
      { main: true }
    )
    .write('/bar.js', 'module.exports = 42')
    .toBuffer()

  const { exports } = await Module.load(new URL(root + '/app.bundle'), bundle)

  t.is(exports, 'module.exports = 42')
})

test('list outside a .bundle through the protocol of a module it holds', async (t) => {
  const bundle = new Bundle()
    .write('/foo.js', 'module.exports = module.protocol', { main: true })
    .toBuffer()

  const protocol = sources(
    { [root + '/app.bundle']: bundle },
    {
      *list(url) {
        if (url.href === root + '/dir') yield new URL(root + '/dir/a.txt')
      }
    }
  )

  const { exports } = await Module.load(new URL(root + '/app.bundle'), { protocol })

  const listing = [...exports.listSync(new URL(root + '/dir'))]

  t.alike(
    listing.map((url) => url.href),
    [root + '/dir/a.txt']
  )
})

test('load .bundle with bare specifier', async (t) => {
  const bundle = new Bundle()
    .write('/foo.js', "module.exports = require('bar')", { main: true })
    .write('/node_modules/bar/package.json', '{}')
    .write('/node_modules/bar/index.js', 'module.exports = 42')
    .toBuffer()

  await t.execution(Module.load(new URL(root + '/app.bundle'), bundle, {}))
})

test('load .bundle with bare specifier, nested', async (t) => {
  const bundle = new Bundle()
    .write('/foo.js', "module.exports = require('bar')", { main: true })
    .write('/node_modules/bar/package.json', '{}')
    .write('/node_modules/bar/index.js', "module.exports = require('baz')")
    .write('/node_modules/baz/package.json', '{}')
    .write('/node_modules/baz/index.js', 'module.exports = 42')
    .toBuffer()

  await t.execution(Module.load(new URL(root + '/app.bundle'), bundle, {}))
})

test('load .bundle with bare specifier and import map', async (t) => {
  const bundle = new Bundle()
    .write('/foo.js', "module.exports = require('baz')", { main: true })
    .write('/bar.js', 'module.exports = 42', { alias: 'baz' })
    .toBuffer()

  const { exports } = await Module.load(new URL(root + '/app.bundle'), bundle, {})

  t.is(exports, 42)
})

test('load .bundle with builtin require', async (t) => {
  const builtins = {
    bar: 42
  }

  const bundle = new Bundle()
    .write('/foo.js', "module.exports = require('bar')", { main: true })
    .toBuffer()

  await t.execution(Module.load(new URL(root + '/app.bundle'), bundle, { builtins }))
})

test('load .bundle with resolutions map', async (t) => {
  const bundle = new Bundle()
    .write('/dir/foo.js', "module.exports = require('./bar')", { main: true })
    .write('/dir/bar/index.js', 'module.exports = 42')

  bundle.resolutions = {
    '/dir/foo.js': {
      './bar': '/dir/bar/index.js'
    }
  }

  await t.execution(Module.load(new URL(root + '/app.bundle'), bundle.toBuffer(), {}))
})

test('load .bundle with resolutions map, missing entry', async (t) => {
  const bundle = new Bundle()
    .write('/dir/foo.js', "module.exports = require('./bar')", { main: true })
    .write('/dir/bar/index.js', 'module.exports = 42')

  bundle.resolutions = {
    '/dir/foo.js': {}
  }

  await t.execution(Module.load(new URL(root + '/app.bundle'), bundle.toBuffer(), {}))
})

test('load .bundle with resolutions map, conditional on the host', async (t) => {
  const bundle = new Bundle()
    .write('/foo.js', "module.exports = require('./bar')", { main: true })
    .write('/baz.js', 'module.exports = 42')
    .write('/qux.js', 'module.exports = 43')

  bundle.resolutions = {
    '/foo.js': {
      './bar': {
        ios: '/qux.js',
        [platform]: '/baz.js'
      }
    }
  }

  const { exports } = await Module.load(new URL(root + '/app.bundle'), bundle.toBuffer(), {})

  t.is(exports, 42)
})

test('load .bundle with resolutions map, conditional on another host', async (t) => {
  const bundle = new Bundle()
    .write('/foo.js', "module.exports = require('./bar')", { main: true })
    .write('/qux.js', 'module.exports = 43')
    .write('/quux.js', 'module.exports = 44')

  bundle.resolutions = {
    '/foo.js': {
      './bar': {
        ios: '/qux.js',
        android: '/quux.js'
      }
    }
  }

  await t.exception(
    Module.load(new URL(root + '/app.bundle'), bundle.toBuffer(), {}),
    /MODULE_NOT_FOUND/
  )
})

test('load .bundle with resolutions map, default before the condition', async (t) => {
  const bundle = new Bundle()
    .write('/foo.js', "module.exports = require('./bar')", { main: true })
    .write('/baz.js', 'module.exports = 42')
    .write('/qux.js', 'module.exports = 43')

  bundle.resolutions = {
    '/foo.js': {
      './bar': {
        default: '/baz.js',
        require: '/qux.js'
      }
    }
  }

  const { exports } = await Module.load(new URL(root + '/app.bundle'), bundle.toBuffer(), {})

  t.is(exports, 42)
})

test('load .bundle with linked addon', async (t) => {
  const bundle = new Bundle().write('/foo.js', "module.exports = require.addon.resolve('.')", {
    main: true
  })

  bundle.resolutions = {
    '/foo.js': {
      '.': 'linked:foo.1.2.3'
    }
  }

  const { exports } = await Module.load(new URL(root + '/app.bundle'), bundle.toBuffer(), {})

  t.is(exports, 'linked:foo.1.2.3')
})

test('load .bundle with linked addon, conditional on the host', async (t) => {
  const bundle = new Bundle().write('/foo.js', "module.exports = require.addon.resolve('.')", {
    main: true
  })

  bundle.resolutions = {
    '/foo.js': {
      '.': {
        ios: 'linked:bar.1.2.3',
        [platform]: 'linked:foo.1.2.3'
      }
    }
  }

  const { exports } = await Module.load(new URL(root + '/app.bundle'), bundle.toBuffer(), {})

  t.is(exports, 'linked:foo.1.2.3')
})

test('load .bundle with linked addon, conditional on another host', async (t) => {
  const bundle = new Bundle().write('/foo.js', "module.exports = require.addon.resolve('.')", {
    main: true
  })

  bundle.resolutions = {
    '/foo.js': {
      '.': {
        ios: 'linked:bar.1.2.3',
        android: 'linked:baz.1.2.3'
      }
    }
  }

  await t.exception(
    Module.load(new URL(root + '/app.bundle'), bundle.toBuffer(), {}),
    /ADDON_NOT_FOUND/
  )
})

// Naming a parent URL, even the module's own, asks the resolver rather than the
// resolution the module recorded.
test('load .bundle with linked addon, resolved with a parent URL', async (t) => {
  const bundle = new Bundle().write(
    '/foo.js',
    "module.exports = require.addon.resolve('.', new URL(module.url))",
    { main: true }
  )

  bundle.resolutions = {
    '/foo.js': {
      '.': {
        ios: 'linked:bar.1.2.3',
        [platform]: 'linked:foo.1.2.3'
      }
    }
  }

  const { exports } = await Module.load(new URL(root + '/app.bundle'), bundle.toBuffer(), {})

  t.is(exports, 'linked:foo.1.2.3')
})

test('load .bundle with asset import', async (t) => {
  const bundle = new Bundle()
    .write('/foo.js', "module.exports = require.asset('./bar.txt')", { main: true })
    .write('/bar.txt', 'hello world', { asset: true })
    .toBuffer()

  const { exports } = await Module.load(new URL(root + '/app.bundle'), bundle, {})

  t.is(exports, path('/app.bundle/bar.txt'))
})

test('load .bundle with asset import, resolutions map', async (t) => {
  const bundle = new Bundle()
    .write('/foo.js', "module.exports = require.asset('./bar.txt')", { main: true })
    .write('/baz.txt', 'hello world', { asset: true })

  bundle.resolutions = {
    '/foo.js': {
      './bar.txt': {
        asset: '/baz.txt'
      }
    }
  }

  const { exports } = await Module.load(new URL(root + '/app.bundle'), bundle.toBuffer(), {})

  t.is(exports, path('/app.bundle/baz.txt'))
})

test('load .bundle with asset import, resolutions map pointing outside .bundle', async (t) => {
  const protocol = sources({ [root + '/bar.txt']: null })

  const bundle = new Bundle()
    .write('/foo.js', "module.exports = require.asset('./bar.txt')", { main: true })
    .write('/baz.txt', 'hello world', { asset: true })

  bundle.resolutions = {
    '/foo.js': {
      './bar.txt': {
        asset: root + '/bar.txt'
      }
    }
  }

  const { exports } = await Module.load(new URL(root + '/app.bundle'), bundle.toBuffer(), {
    protocol
  })

  t.is(exports, path('/bar.txt'))
})
