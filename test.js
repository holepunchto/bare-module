const test = require('brittle')
const Module = require('.')

test('resolve bare specifier', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === 'file:///node_modules/foo/package.json' ||
        url.href === 'file:///node_modules/foo/index.js'
      )
    },

    read (url) {
      if (url.href === 'file:///node_modules/foo/package.json') {
        return '{}'
      }

      t.fail()
    }
  })

  t.is(Module.resolve('foo', new URL('file:///'), { protocol }).href, 'file:///node_modules/foo/index.js')
})

test('load resolved bare specifier', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === 'file:///node_modules/foo/package.json' ||
        url.href === 'file:///node_modules/foo/index.js'
      )
    },

    read (url) {
      if (url.href === 'file:///node_modules/foo/package.json') {
        return '{}'
      }

      if (url.href === 'file:///node_modules/foo/index.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  t.is(Module.load(Module.resolve('foo', new URL('file:///'), { protocol }), { protocol }).exports, 42)
})

test('load resolved bare specifier with source', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === 'file:///node_modules/foo/package.json' ||
        url.href === 'file:///node_modules/foo/index.js'
      )
    },

    read (url) {
      if (url.href === 'file:///node_modules/foo/package.json') {
        return '{}'
      }

      t.fail()
    }
  })

  t.is(Module.load(Module.resolve('foo', new URL('file:///'), { protocol }), 'module.exports = 42').exports, 42)
})

test('load .js', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists () {
      return false
    },

    read (url) {
      if (url.href === 'file:///index.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  t.is(Module.load(new URL('file:///index.js'), { protocol }).exports, 42)
})

test('load .js with pkg.type module', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === 'file:///package.json'
    },

    read (url) {
      if (url.href === 'file:///index.js') {
        return 'export default 42'
      }

      if (url.href === 'file:///package.json') {
        return '{ "type": "module" }'
      }

      t.fail()
    }
  })

  Module.load(new URL('file:///index.js'), { protocol })
})

test('load .js with default type', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === 'file:///bar.js'
    },

    read (url) {
      if (url.href === 'file:///foo.js') {
        return 'export { default } from \'/bar.js\''
      }

      if (url.href === 'file:///bar.js') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  t.is(Module.load(new URL('file:///foo.js'), { protocol, defaultType: Module.constants.types.MODULE }).exports.default, 42)
})

test('load .cjs', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists () {
      return false
    },

    read (url) {
      if (url.href === 'file:///index.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  t.is(Module.load(new URL('file:///index.cjs'), { protocol }).exports, 42)
})

test('load .cjs with bare specifier require', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === 'file:///node_modules/foo/package.json' ||
        url.href === 'file:///node_modules/foo/index.js'
      )
    },

    read (url) {
      if (url.href === 'file:///index.cjs') {
        return 'module.exports = require(\'foo\')'
      }

      if (url.href === 'file:///node_modules/foo/package.json') {
        return '{}'
      }

      if (url.href === 'file:///node_modules/foo/index.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  t.is(Module.load(new URL('file:///index.cjs'), { protocol }).exports, 42)
})

test('load .cjs with .mjs require', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === 'file:///bar.mjs'
    },

    read (url) {
      if (url.href === 'file:///foo.cjs') {
        return 'const bar = require(\'/bar\')'
      }

      if (url.href === 'file:///bar.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  Module.load(new URL('file:///foo.cjs'), { protocol })
})

test('load .cjs with top-level await', async (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists () {
      return false
    },

    read (url) {
      if (url.href === 'file:///index.cjs') {
        return 'await 42'
      }

      t.fail()
    }
  })

  await t.exception.all(() => Module.load(new URL('file:///index.cjs'), { protocol }))
})

test('load .cjs with top-level await .mjs require', async (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === 'file:///bar.mjs'
    },

    read (url) {
      if (url.href === 'file:///foo.cjs') {
        return 'const bar = require(\'/bar\'); bar.default'
      }

      if (url.href === 'file:///bar.mjs') {
        return 'export default await 42'
      }

      t.fail()
    }
  })

  await t.exception.all(() => Module.load(new URL('file:///foo.cjs'), { protocol }), /cannot access 'default' before initialization/i)
})

test('load .mjs', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists () {
      return false
    },

    read (url) {
      if (url.href === 'file:///index.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  Module.load(new URL('file:///index.mjs'), { protocol })
})

test('load .mjs with import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === 'file:///foo.mjs'
    },

    read (url) {
      if (url.href === 'file:///index.mjs') {
        return 'import foo from \'/foo.mjs\''
      }

      if (url.href === 'file:///foo.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  Module.load(new URL('file:///index.mjs'), { protocol })
})

test('load .mjs with .cjs import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === 'file:///foo.cjs'
    },

    read (url) {
      if (url.href === 'file:///index.mjs') {
        return 'import foo from \'/foo.cjs\''
      }

      if (url.href === 'file:///foo.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  Module.load(new URL('file:///index.mjs'), { protocol })
})

test('load .mjs with .js import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === 'file:///foo.js'
    },

    read (url) {
      if (url.href === 'file:///index.mjs') {
        return 'import foo from \'/foo.js\''
      }

      if (url.href === 'file:///foo.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  Module.load(new URL('file:///index.mjs'), { protocol })
})

test('load .mjs with missing import', async (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists () {
      return false
    },

    read (url) {
      if (url.href === 'file:///index.mjs') {
        return 'import foo from \'./foo\''
      }

      t.fail()
    }
  })

  await t.exception(() => Module.load(new URL('file:///index.mjs'), { protocol }), /cannot find module '\.\/foo'/i)
})

test('load .mjs with nested import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === 'file:///foo.mjs' ||
        url.href === 'file:///bar.mjs' ||
        url.href === 'file:///baz.mjs'
      )
    },

    read (url) {
      if (url.href === 'file:///foo.mjs') {
        return 'import bar from \'/bar\'; export default 1'
      }

      if (url.href === 'file:///bar.mjs') {
        return 'import baz from \'/baz\'; export default 2'
      }

      if (url.href === 'file:///baz.mjs') {
        return 'export default 3'
      }

      t.fail()
    }
  })

  Module.load(new URL('file:///foo.mjs'), { protocol })
})

test('load .mjs with cyclic import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === 'file:///foo.mjs' || url.href === 'file:///bar.mjs'
    },

    read (url) {
      if (url.href === 'file:///foo.mjs') {
        return 'import bar from \'/bar\'; export default 1'
      }

      if (url.href === 'file:///bar.mjs') {
        return 'import foo from \'/foo\'; export default 2'
      }

      t.fail()
    }
  })

  Module.load(new URL('file:///foo.mjs'), { protocol })
})

test('load .mjs with top-level await', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists () {
      return false
    },

    read (url) {
      if (url.href === 'file:///index.mjs') {
        return 'await 42'
      }

      t.fail()
    }
  })

  Module.load(new URL('file:///index.mjs'), { protocol })
})

test('load .mjs with top-level await .mjs import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === 'file:///bar.mjs'
    },

    read (url) {
      if (url.href === 'file:///foo.mjs') {
        return 'import bar from \'/bar\''
      }

      if (url.href === 'file:///bar.mjs') {
        return 'export default await 42'
      }

      t.fail()
    }
  })

  Module.load(new URL('file:///foo.mjs'), { protocol })
})

test('load .json', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists () {
      return false
    },

    read (url) {
      if (url.href === 'file:///index.json') {
        return '42'
      }

      t.fail()
    }
  })

  t.is(Module.load(new URL('file:///index.json'), { protocol }).exports, 42)
})

test('load .bare', async (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === 'file:///index.js' ||
        url.href === 'file:///native.bare'
      )
    },

    read (url) {
      if (url.href === 'file:///index.js') {
        return 'require(\'/native.bare\')'
      }

      t.fail()
    }
  })

  await t.exception(() => Module.load(new URL('file:///index.js'), { protocol }))
})

test('load .node', async (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === 'file:///index.js' ||
        url.href === 'file:///native.node'
      )
    },

    read (url) {
      if (url.href === 'file:///index.js') {
        return 'require(\'/native.node\')'
      }

      t.fail()
    }
  })

  await t.exception(() => Module.load(new URL('file:///index.js'), { protocol }))
})

test('load .bundle', (t) => {
  t.teardown(onteardown)

  const bundle = new Module.Bundle()
    .write('/foo.js', 'module.exports = require(\'./bar\')', { main: true })
    .write('/bar.js', 'module.exports = 42')
    .toBuffer()

  Module.load(new URL('file:///app.bundle'), bundle)
})

test('load .bundle with .mjs', (t) => {
  t.teardown(onteardown)

  const bundle = new Module.Bundle()
    .write('/foo.mjs', 'export { default } from \'./bar\'', { main: true })
    .write('/bar.mjs', 'export default 42')
    .toBuffer()

  Module.load(new URL('file:///app.bundle'), bundle)
})

test('load .bundle with bare specifier', (t) => {
  t.teardown(onteardown)

  const bundle = new Module.Bundle()
    .write('/foo.js', 'module.exports = require(\'bar\')', { main: true })
    .write('/node_modules/bar/package.json', '{}')
    .write('/node_modules/bar/index.js', 'module.exports = 42')
    .toBuffer()

  Module.load(new URL('file:///app.bundle'), bundle)
})

test('load .bundle with bare specifier, nested', (t) => {
  t.teardown(onteardown)

  const bundle = new Module.Bundle()
    .write('/foo.js', 'module.exports = require(\'bar\')', { main: true })
    .write('/node_modules/bar/package.json', '{}')
    .write('/node_modules/bar/index.js', 'module.exports = require(\'baz\')')
    .write('/node_modules/baz/package.json', '{}')
    .write('/node_modules/baz/index.js', 'module.exports = 42')
    .toBuffer()

  Module.load(new URL('file:///app.bundle'), bundle)
})

test('load .bundle with bare specifier and import map', (t) => {
  t.teardown(onteardown)

  const bundle = new Module.Bundle()
    .write('/foo.js', 'module.exports = require(\'baz\')', { main: true })
    .write('/bar.js', 'module.exports = 42', { alias: 'baz' })
    .toBuffer()

  t.is(Module.load(new URL('file:///app.bundle'), bundle).exports, 42)
})

test.skip('load specific module within .bundle', (t) => {
  t.teardown(onteardown)

  const bundle = new Module.Bundle()
    .write('/foo.js', 'module.exports = require(\'./bar\')')
    .write('/bar.js', 'module.exports = 42')
    .toBuffer()

  const protocol = new Module.Protocol({
    exists () {
      return false
    },

    read (url) {
      if (url.href === 'file:///app.bundle') {
        return bundle
      }

      t.fail()
    }
  })

  t.is(Module.load(new URL('file:///app.bundle/foo.js'), { protocol }).exports, 42)
})

test.skip('load specific module within nested .bundle', (t) => {
  t.teardown(onteardown)

  const bundleA = new Module.Bundle()
    .write('/bar.js', 'module.exports = 42')
    .toBuffer()

  const bundleB = new Module.Bundle()
    .write('/bar.bundle', bundleA)
    .toBuffer()

  const protocol = new Module.Protocol({
    exists () {
      return false
    },

    read (url) {
      if (url.href === 'file:///foo.bundle') {
        return bundleB
      }

      t.fail()
    }
  })

  t.is(Module.load(new URL('file:///foo.bundle/bar.bundle/bar.js'), { protocol }).exports, 42)
})

test.skip('load .bundle with type option and no .bundle extension', async (t) => {
  t.teardown(onteardown)

  const bundle = new Module.Bundle()
    .write('/foo.js', 'module.exports = 42', { main: true })
    .toBuffer()

  await t.exception(
    () => Module.load(new URL('file:///app'), bundle, { type: Module.constants.types.BUNDLE }),
    /invalid extension for bundle '\/app'/i
  )
})

test('load .bundle with builtin require', (t) => {
  t.teardown(onteardown)

  const builtins = {
    bar: 42
  }

  const bundle = new Module.Bundle()
    .write('/foo.js', 'module.exports = require(\'bar\')', { main: true })
    .toBuffer()

  Module.load(new URL('file:///app.bundle'), bundle, { builtins })
})

test('load .bundle with resolutions map', (t) => {
  t.teardown(onteardown)

  const bundle = new Module.Bundle()
    .write('/dir/foo.js', 'module.exports = require(\'./bar\')', { main: true })
    .write('/dir/bar/index.js', 'module.exports = 42')

  bundle.resolutions = {
    '/dir/foo.js': {
      './bar': '/dir/bar/index.js'
    }
  }

  Module.load(new URL('file:///app.bundle'), bundle.toBuffer())
})

test('load .bundle with resolutions map, missing entry', async (t) => {
  t.teardown(onteardown)

  const bundle = new Module.Bundle()
    .write('/dir/foo.js', 'module.exports = require(\'./bar\')', { main: true })
    .write('/dir/bar/index.js', 'module.exports = 42')

  bundle.resolutions = {
    '/dir/foo.js': {}
  }

  await t.exception(() => Module.load(new URL('file:///app.bundle'), bundle.toBuffer()))
})

test.skip('resolve specific module within .bundle', (t) => {
  t.teardown(onteardown)

  const bundle = new Module.Bundle()
    .write('/foo.js', 'module.exports = require(\'./bar\')')
    .write('/bar.js', 'module.exports = 42')
    .toBuffer()

  const protocol = new Module.Protocol({
    exists () {
      return false
    },

    read (url) {
      if (url.href === 'file:///app.bundle') {
        return bundle
      }

      t.fail()
    }
  })

  t.is(Module.resolve('/app.bundle/foo', new URL('file:///'), { protocol }).href, 'file:///app.bundle/foo.js')
})

test.skip('resolve specific module within nested .bundle', (t) => {
  t.teardown(onteardown)

  const bundleA = new Module.Bundle()
    .write('/bar.js', 'module.exports = 42')
    .toBuffer()

  const bundleB = new Module.Bundle()
    .write('/bar.bundle', bundleA)
    .toBuffer()

  const protocol = new Module.Protocol({
    exists () {
      return false
    },

    read (url) {
      if (url.href === 'file:///foo.bundle') {
        return bundleB
      }

      t.fail()
    }
  })

  t.is(Module.resolve('/foo.bundle/bar.bundle/bar', new URL('file:///'), { protocol }).href, 'file:///foo.bundle/bar.bundle/bar.js')
})

test('load unknown extension', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists () {
      return false
    },

    read (url) {
      if (url.href === 'file:///index.foo') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  t.is(Module.load(new URL('file:///index.foo'), { protocol }).exports, 42)
})

test('load unknown extension with default type', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists () {
      return false
    },

    read (url) {
      if (url.href === 'file:///index.foo') {
        return '42'
      }

      t.fail()
    }
  })

  t.is(Module.load(new URL('file:///index.foo'), { protocol, defaultType: Module.constants.types.JSON }).exports, 42)
})

test('load .cjs with hashbang', (t) => {
  t.teardown(onteardown)

  t.execution(() => Module.load(new URL('file:///index.cjs'), '#!node'))
})

test('load .mjs with hashbang', (t) => {
  t.teardown(onteardown)

  t.execution(() => Module.load(new URL('file:///index.mjs'), '#!node'))
})

test('load .cjs with dynamic .mjs import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === 'file:///bar.mjs'
    },

    read (url) {
      if (url.href === 'file:///foo.cjs') {
        return 'const bar = import(\'/bar\')'
      }

      if (url.href === 'file:///bar.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  Module.load(new URL('file:///foo.cjs'), { protocol })
})

test('load .cjs with dynamic .cjs import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === 'file:///bar.cjs'
    },

    read (url) {
      if (url.href === 'file:///foo.cjs') {
        return 'const bar = import(\'/bar\')'
      }

      if (url.href === 'file:///bar.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  Module.load(new URL('file:///foo.cjs'), { protocol })
})

test('load .mjs with dynamic .mjs import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === 'file:///bar.mjs'
    },

    read (url) {
      if (url.href === 'file:///foo.mjs') {
        return 'const { default: bar } = await import(\'/bar\')'
      }

      if (url.href === 'file:///bar.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  Module.load(new URL('file:///foo.mjs'), { protocol })
})

test('load .mjs with dynamic .cjs import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === 'file:///bar.cjs'
    },

    read (url) {
      if (url.href === 'file:///foo.mjs') {
        return 'const { default: bar } = await import(\'/bar\')'
      }

      if (url.href === 'file:///bar.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  Module.load(new URL('file:///foo.mjs'), { protocol })
})

test('load .cjs with bare specifier require and import map', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === 'file:///bar.cjs'
    },

    read (url) {
      if (url.href === 'file:///foo.cjs') {
        return 'const bar = require(\'bar\')'
      }

      if (url.href === 'file:///bar.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  Module.load(new URL('file:///foo.cjs'), {
    protocol,
    imports: {
      bar: '/bar.cjs'
    }
  })
})

test('load .mjs with bare specifier import and import map', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === 'file:///bar.mjs'
    },

    read (url) {
      if (url.href === 'file:///foo.mjs') {
        return 'import bar from \'bar\''
      }

      if (url.href === 'file:///bar.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  Module.load(new URL('file:///foo.mjs'), {
    protocol,
    imports: {
      bar: '/bar.mjs'
    }
  })
})

test.skip('load .cjs with data: protocol require', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    read (url) {
      if (url.href === 'file:///foo.cjs') {
        return `module.exports = require('data:,${encodeURIComponent('module.exports = 42')}')`
      }

      t.fail()
    }
  })

  t.is(Module.load(new URL('file:///foo.cjs'), { protocol }).exports, 42)
})

test.skip('load .mjs with data: protocol import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    read (url) {
      if (url.href === 'file:///foo.mjs') {
        return `export { default } from 'data:,${encodeURIComponent('export default 42')}'`
      }

      t.fail()
    }
  })

  t.is(Module.load(new URL('file:///foo.mjs'), { protocol }).exports.default, 42)
})

test('import map with protocol', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === 'file:///bar.mjs'
    },

    read (url) {
      if (url.href === 'file:///foo.mjs') {
        return 'import bar from \'proto:bar\''
      }

      if (url.href === 'file:///bar.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  Module.load(new URL('file:///foo.mjs'), {
    protocol,
    imports: {
      'proto:bar': '/bar.mjs'
    }
  })
})

test('require.main', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === 'file:///bar.js'
    },

    read (url) {
      if (url.href === 'file:///foo.js') {
        return 'module.exports = require.main; require(\'/bar\')'
      }

      if (url.href === 'file:///bar.js') {
        return 'module.exports = require.main'
      }

      t.fail()
    }
  })

  const foo = Module.load(new URL('file:///foo.js'), { protocol })
  const bar = Module.load(new URL('file:///bar.js'), { protocol })

  t.is(foo.exports, foo)
  t.is(bar.exports, foo)
})

test('require.addon.host', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    read (url) {
      if (url.href === 'file:///foo.js') {
        return 'module.exports = require.addon.host'
      }

      t.fail()
    }
  })

  t.comment(Module.load(new URL('file:///foo.js'), { protocol }).exports)
})

test('import.meta', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === 'file:///bar.mjs'
    },

    read (url) {
      if (url.href === 'file:///foo.mjs') {
        return 'export default import.meta'
      }

      t.fail()
    }
  })

  const { default: meta } = Module.load(new URL('file:///foo.mjs'), { protocol }).exports

  t.is(meta.url, 'file:///foo.mjs')
  t.is(meta.main, true)
  t.is(meta.resolve('/bar'), 'file:///bar.mjs')
  t.comment(meta.addon.host)
})

test('import assertions', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === 'file:///bar'
    },

    read (url) {
      if (url.href === 'file:///foo.mjs') {
        return 'export { default } from \'/bar\' assert { type: \'json\' }'
      }

      if (url.href === 'file:///bar') {
        return '{ "hello": "world" }'
      }

      t.fail()
    }
  })

  t.alike(Module.load(new URL('file:///foo.mjs'), { protocol }).exports.default, { hello: 'world' })
})

test('createRequire', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === 'file:///dir/bar.js'
    },

    read (url) {
      if (url.href === 'file:///dir/bar.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  const require = Module.createRequire('/dir/foo.js', { protocol })

  t.is(require('./bar'), 42)
})

test('createRequire with default type', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === 'file:///dir/bar.js'
    },

    read (url) {
      if (url.href === 'file:///dir/bar.js') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  const require = Module.createRequire('/dir/foo.js', { protocol, defaultType: Module.constants.types.MODULE })

  t.is(require('./bar').default, 42)
})

test('main in package.json', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === 'file:///package.json' || url.href === 'file:///foo.js'
    },

    read (url) {
      if (url.href === 'file:///package.json') {
        return '{ "main": "foo.js" }'
      }

      t.fail()
    }
  })

  t.is(Module.resolve('/', new URL('file:///'), { protocol }).href, 'file:///foo.js')
})

test('exports in package.json', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === 'file:///package.json' || url.href === 'file:///foo.js'
    },

    read (url) {
      if (url.href === 'file:///package.json') {
        return '{ "exports": "./foo.js" }'
      }

      t.fail()
    }
  })

  t.is(Module.resolve('/', new URL('file:///'), { protocol }).href, 'file:///foo.js')
})

test('conditional exports in package.json', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === 'file:///package.json' ||
        url.href === 'file:///foo.cjs' ||
        url.href === 'file:///foo.mjs'
      )
    },

    read (url) {
      if (url.href === 'file:///package.json') {
        return '{ "exports": { "require": "./foo.cjs", "import": "./foo.mjs" } }'
      }

      t.fail()
    }
  })

  t.is(Module.resolve('/', new URL('file:///'), { protocol }).href, 'file:///foo.cjs')
  t.is(Module.resolve('/', new URL('file:///'), { isImport: true, protocol }).href, 'file:///foo.mjs')
})

test('conditional exports in package.json, array of conditions', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === 'file:///package.json' ||
        url.href === 'file:///foo.cjs' ||
        url.href === 'file:///foo.mjs'
      )
    },

    read (url) {
      if (url.href === 'file:///package.json') {
        return '{ "exports": [{ "import": "./foo.mjs" }, { "require": "./foo.cjs" }] }'
      }

      t.fail()
    }
  })

  t.is(Module.resolve('/', new URL('file:///'), { protocol }).href, 'file:///foo.cjs')
  t.is(Module.resolve('/', new URL('file:///'), { isImport: true, protocol }).href, 'file:///foo.mjs')
})

test('exports in node_modules', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === 'file:///node_modules/foo/package.json' ||
        url.href === 'file:///node_modules/foo/foo.js'
      )
    },

    read (url) {
      if (url.href === 'file:///node_modules/foo/package.json') {
        return '{ "exports": "./foo.js" }'
      }

      t.fail()
    }
  })

  t.is(Module.resolve('foo', new URL('file:///'), { protocol }).href, 'file:///node_modules/foo/foo.js')
})

test('import unexported module in node_modules', async (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === 'file:///node_modules/foo/package.json' ||
        url.href === 'file:///node_modules/foo/foo.js' ||
        url.href === 'file:///node_modules/foo/bar.js'
      )
    },

    read (url) {
      if (url.href === 'file:///node_modules/foo/package.json') {
        return '{ "exports": "./foo.js" }'
      }

      t.fail()
    }
  })

  await t.exception(() => Module.resolve('foo/bar', new URL('file:///'), { protocol }))
})

test('imports in package.json', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === 'file:///package.json' ||
        url.href === 'file:///baz.js'
      )
    },

    read (url) {
      if (url.href === 'file:///package.json') {
        return '{ "imports": { "bar": "./baz.js" } }'
      }

      if (url.href === 'file:///foo.js') {
        return 'const bar = require(\'bar\')'
      }

      if (url.href === 'file:///baz.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  Module.load(new URL('file:///foo.js'), { protocol })
})

test('imports in package.json, no match', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === 'file:///package.json' ||
        url.href === 'file:///baz.js'
      )
    },

    read (url) {
      if (url.href === 'file:///package.json') {
        return '{ "imports": { "bar": "./baz.js" } }'
      }

      if (url.href === 'file:///foo.js') {
        return 'const bar = require(\'./baz\')'
      }

      if (url.href === 'file:///baz.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  Module.load(new URL('file:///foo.js'), { protocol })
})

test('conditional imports in package.json, require', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === 'file:///package.json' ||
        url.href === 'file:///baz.cjs' ||
        url.href === 'file:///baz.mjs'
      )
    },

    read (url) {
      if (url.href === 'file:///package.json') {
        return '{ "imports": { "bar": { "require": "./baz.cjs", "import": "./baz.mjs" } } }'
      }

      if (url.href === 'file:///foo.cjs') {
        return 'const bar = require(\'bar\')'
      }

      if (url.href === 'file:///baz.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  Module.load(new URL('file:///foo.cjs'), { protocol })
})

test('conditional imports in package.json, import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === 'file:///package.json' ||
        url.href === 'file:///baz.cjs' ||
        url.href === 'file:///baz.mjs'
      )
    },

    read (url) {
      if (url.href === 'file:///package.json') {
        return '{ "imports": { "bar": { "require": "./baz.cjs", "import": "./baz.mjs" } } }'
      }

      if (url.href === 'file:///foo.mjs') {
        return 'import bar from \'bar\''
      }

      if (url.href === 'file:///baz.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  Module.load(new URL('file:///foo.mjs'), { protocol })
})

test('imports in node_modules', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === 'file:///node_modules/foo/package.json' ||
        url.href === 'file:///node_modules/foo/baz.js'
      )
    },

    read (url) {
      if (url.href === 'file:///node_modules/foo/package.json') {
        return '{ "imports": { "bar": "./baz.js" } }'
      }

      if (url.href === 'file:///node_modules/foo/foo.js') {
        return 'const bar = require(\'bar\')'
      }

      if (url.href === 'file:///node_modules/foo/baz.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  Module.load(new URL('file:///node_modules/foo/foo.js'), { protocol })
})

test('resolve and load builtin', (t) => {
  t.teardown(onteardown)

  const builtins = {
    foo: 42
  }

  t.is(Module.resolve('foo', new URL('file:///'), { builtins }).href, 'builtin:foo')
  t.is(Module.load(new URL('builtin:foo'), { builtins }).exports, 42)
})

test('load builtin from .cjs', (t) => {
  t.teardown(onteardown)

  const builtins = {
    bar: 42
  }

  const protocol = new Module.Protocol({
    read (url) {
      if (url.href === 'file:///foo.cjs') {
        return 'module.exports = require(\'bar\')'
      }

      t.fail()
    }
  })

  t.is(Module.load(new URL('file:///foo.cjs'), { protocol, builtins }).exports, 42)
})

test('load builtin from .mjs', (t) => {
  t.teardown(onteardown)

  const builtins = {
    bar: 42
  }

  const protocol = new Module.Protocol({
    read (url) {
      if (url.href === 'file:///foo.mjs') {
        return 'export { default } from \'bar\''
      }

      t.fail()
    }
  })

  t.is(Module.load(new URL('file:///foo.mjs'), { protocol, builtins }).exports.default, 42)
})

test('load file that cannot be read', async (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === 'file:///foo.cjs'
    },

    read () {
      throw new Error('file missing')
    }
  })

  await t.exception(() => Module.load(new URL('file:///foo.cjs'), { protocol }), /file missing/)
})

function onteardown () {
  // TODO Provide a public API for clearing the cache.
  Module._cache = Object.create(null)
}
