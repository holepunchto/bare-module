const test = require('brittle')
const Module = require('.')

test('resolve bare specifier', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (filename) {
      return (
        filename === '/node_modules/foo/package.json' ||
        filename === '/node_modules/foo/index.js'
      )
    },

    read (filename) {
      if (filename === '/node_modules/foo/package.json') {
        return '{}'
      }

      t.fail()
    }
  })

  t.is(Module.resolve('foo', '/', { protocol }), '/node_modules/foo/index.js')
})

test('load resolved bare specifier', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (filename) {
      return (
        filename === '/node_modules/foo/package.json' ||
        filename === '/node_modules/foo/index.js'
      )
    },

    read (filename) {
      if (filename === '/node_modules/foo/package.json') {
        return '{}'
      }

      if (filename === '/node_modules/foo/index.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  t.is(Module.load(Module.resolve('foo', '/', { protocol }), { protocol }).exports, 42)
})

test('load resolved bare specifier with source', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (filename) {
      return (
        filename === '/node_modules/foo/package.json' ||
        filename === '/node_modules/foo/index.js'
      )
    },

    read (filename) {
      if (filename === '/node_modules/foo/package.json') {
        return '{}'
      }

      t.fail()
    }
  })

  t.is(Module.load(Module.resolve('foo', '/', { protocol }), 'module.exports = 42').exports, 42)
})

test('load .js', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists () {
      return false
    },

    read (filename) {
      if (filename === '/index.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  t.is(Module.load('/index.js', { protocol }).exports, 42)
})

test('load .js with pkg.type module', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (filename) {
      return filename === '/package.json'
    },

    read (filename) {
      if (filename === '/index.js') {
        return 'export default 42'
      }

      if (filename === '/package.json') {
        return '{ "type": "module" }'
      }

      t.fail()
    }
  })

  Module.load('/index.js', { protocol })
})

test('load .js with default type', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (filename) {
      return filename === '/bar.js'
    },

    read (filename) {
      if (filename === '/foo.js') {
        return 'export { default } from \'/bar.js\''
      }

      if (filename === '/bar.js') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  t.is(Module.load('/foo.js', { protocol, defaultType: Module.constants.types.MODULE }).exports.default, 42)
})

test('load .cjs', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists () {
      return false
    },

    read (filename) {
      if (filename === '/index.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  t.is(Module.load('/index.cjs', { protocol }).exports, 42)
})

test('load .cjs with bare specifier require', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (filename) {
      return (
        filename === '/node_modules/foo/package.json' ||
        filename === '/node_modules/foo/index.js'
      )
    },

    read (filename) {
      if (filename === '/index.cjs') {
        return 'module.exports = require(\'foo\')'
      }

      if (filename === '/node_modules/foo/package.json') {
        return '{}'
      }

      if (filename === '/node_modules/foo/index.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  t.is(Module.load('/index.cjs', { protocol }).exports, 42)
})

test('load .cjs with .mjs require', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (filename) {
      return filename === '/bar.mjs'
    },

    read (filename) {
      if (filename === '/foo.cjs') {
        return 'const bar = require(\'/bar\')'
      }

      if (filename === '/bar.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  Module.load('/foo.cjs', { protocol })
})

test('load .cjs with top-level await', async (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists () {
      return false
    },

    read (filename) {
      if (filename === '/index.cjs') {
        return 'await 42'
      }

      t.fail()
    }
  })

  await t.exception.all(() => Module.load('/index.cjs', { protocol }))
})

test('load .cjs with top-level await .mjs require', async (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (filename) {
      return filename === '/bar.mjs'
    },

    read (filename) {
      if (filename === '/foo.cjs') {
        return 'const bar = require(\'/bar\'); bar.default'
      }

      if (filename === '/bar.mjs') {
        return 'export default await 42'
      }

      t.fail()
    }
  })

  await t.exception.all(() => Module.load('/foo.cjs', { protocol }), /cannot access 'default' before initialization/i)
})

test('load .mjs', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists () {
      return false
    },

    read (filename) {
      if (filename === '/index.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  Module.load('/index.mjs', { protocol })
})

test('load .mjs with import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (filename) {
      return filename === '/foo.mjs'
    },

    read (filename) {
      if (filename === '/index.mjs') {
        return 'import foo from \'/foo.mjs\''
      }

      if (filename === '/foo.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  Module.load('/index.mjs', { protocol })
})

test('load .mjs with .cjs import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (filename) {
      return filename === '/foo.cjs'
    },

    read (filename) {
      if (filename === '/index.mjs') {
        return 'import foo from \'/foo.cjs\''
      }

      if (filename === '/foo.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  Module.load('/index.mjs', { protocol })
})

test('load .mjs with .js import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (filename) {
      return filename === '/foo.js'
    },

    read (filename) {
      if (filename === '/index.mjs') {
        return 'import foo from \'/foo.js\''
      }

      if (filename === '/foo.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  Module.load('/index.mjs', { protocol })
})

test('load .mjs with missing import', async (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists () {
      return false
    },

    read (filename) {
      if (filename === '/index.mjs') {
        return 'import foo from \'./foo\''
      }

      t.fail()
    }
  })

  await t.exception(() => Module.load('/index.mjs', { protocol }), /cannot find module '\.\/foo'/i)
})

test('load .mjs with nested import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (filename) {
      return filename === '/foo.mjs' || filename === '/bar.mjs' || filename === '/baz.mjs'
    },

    read (filename) {
      if (filename === '/foo.mjs') {
        return 'import bar from \'/bar\'; export default 1'
      }

      if (filename === '/bar.mjs') {
        return 'import baz from \'/baz\'; export default 2'
      }

      if (filename === '/baz.mjs') {
        return 'export default 3'
      }

      t.fail()
    }
  })

  Module.load('/foo.mjs', { protocol })
})

test('load .mjs with cyclic import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (filename) {
      return filename === '/foo.mjs' || filename === '/bar.mjs'
    },

    read (filename) {
      if (filename === '/foo.mjs') {
        return 'import bar from \'/bar\'; export default 1'
      }

      if (filename === '/bar.mjs') {
        return 'import foo from \'/foo\'; export default 2'
      }

      t.fail()
    }
  })

  Module.load('/foo.mjs', { protocol })
})

test('load .mjs with top-level await', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists () {
      return false
    },

    read (filename) {
      if (filename === '/index.mjs') {
        return 'await 42'
      }

      t.fail()
    }
  })

  Module.load('/index.mjs', { protocol })
})

test('load .mjs with top-level await .mjs import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (filename) {
      return filename === '/bar.mjs'
    },

    read (filename) {
      if (filename === '/foo.mjs') {
        return 'import bar from \'/bar\''
      }

      if (filename === '/bar.mjs') {
        return 'export default await 42'
      }

      t.fail()
    }
  })

  Module.load('/foo.mjs', { protocol })
})

test('load .json', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists () {
      return false
    },

    read (filename) {
      if (filename === '/index.json') {
        return '42'
      }

      t.fail()
    }
  })

  t.is(Module.load('/index.json', { protocol }).exports, 42)
})

test('load .bare', async (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (filename) {
      return (
        filename === '/index.js' ||
        filename === '/native.bare'
      )
    },

    read (filename) {
      if (filename === '/index.js') {
        return 'require(\'/native.bare\')'
      }

      t.fail()
    }
  })

  await t.exception(() => Module.load('/index.js', { protocol }))
})

test('load .node', async (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (filename) {
      return (
        filename === '/index.js' ||
        filename === '/native.node'
      )
    },

    read (filename) {
      if (filename === '/index.js') {
        return 'require(\'/native.node\')'
      }

      t.fail()
    }
  })

  await t.exception(() => Module.load('/index.js', { protocol }))
})

test('load .bundle', (t) => {
  t.teardown(onteardown)

  const bundle = new Module.Bundle()
    .write('/foo.js', 'module.exports = require(\'./bar\')', { main: true })
    .write('/bar.js', 'module.exports = 42')
    .toBuffer()

  Module.load('/app.bundle', bundle)
})

test('load .bundle with .mjs', (t) => {
  t.teardown(onteardown)

  const bundle = new Module.Bundle()
    .write('/foo.mjs', 'export { default } from \'./bar\'', { main: true })
    .write('/bar.mjs', 'export default 42')
    .toBuffer()

  Module.load('/app.bundle', bundle)
})

test('load .bundle with bare specifier', (t) => {
  t.teardown(onteardown)

  const bundle = new Module.Bundle()
    .write('/foo.js', 'module.exports = require(\'bar\')', { main: true })
    .write('/node_modules/bar/package.json', '{}')
    .write('/node_modules/bar/index.js', 'module.exports = 42')
    .toBuffer()

  Module.load('/app.bundle', bundle)
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

  Module.load('/app.bundle', bundle)
})

test('load .bundle with bare specifier and import map', (t) => {
  t.teardown(onteardown)

  const bundle = new Module.Bundle()
    .write('/foo.js', 'module.exports = require(\'baz\')', { main: true })
    .write('/bar.js', 'module.exports = 42', { alias: 'baz' })
    .toBuffer()

  t.is(Module.load('/app.bundle', bundle).exports, 42)
})

test('load specific module within .bundle', (t) => {
  t.teardown(onteardown)

  const bundle = new Module.Bundle()
    .write('/foo.js', 'module.exports = require(\'./bar\')')
    .write('/bar.js', 'module.exports = 42')
    .toBuffer()

  const protocol = new Module.Protocol({
    exists () {
      return false
    },

    read (filename) {
      if (filename === '/app.bundle') {
        return bundle
      }

      t.fail()
    }
  })

  t.is(Module.load('/app.bundle/foo.js', { protocol }).exports, 42)
})

test('load specific module within nested .bundle', (t) => {
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

    read (filename) {
      if (filename === '/foo.bundle') {
        return bundleB
      }

      t.fail()
    }
  })

  t.is(Module.load('/foo.bundle/bar.bundle/bar.js', { protocol }).exports, 42)
})

test('load .bundle with type option and no .bundle extension', async (t) => {
  t.teardown(onteardown)

  const bundle = new Module.Bundle()
    .write('/foo.js', 'module.exports = 42', { main: true })
    .toBuffer()

  await t.exception(
    () => Module.load('/app', bundle, { type: Module.constants.types.BUNDLE }),
    /invalid extension for bundle '\/app'/i
  )
})

test('resolve specific module within .bundle', (t) => {
  t.teardown(onteardown)

  const bundle = new Module.Bundle()
    .write('/foo.js', 'module.exports = require(\'./bar\')')
    .write('/bar.js', 'module.exports = 42')
    .toBuffer()

  const protocol = new Module.Protocol({
    exists () {
      return false
    },

    read (filename) {
      if (filename === '/app.bundle') {
        return bundle
      }

      t.fail()
    }
  })

  t.is(Module.resolve('/app.bundle/foo', { protocol }), '/app.bundle/foo.js')
})

test('resolve specific module within nested .bundle', (t) => {
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

    read (filename) {
      if (filename === '/foo.bundle') {
        return bundleB
      }

      t.fail()
    }
  })

  t.is(Module.resolve('/foo.bundle/bar.bundle/bar', { protocol }), '/foo.bundle/bar.bundle/bar.js')
})

test('load unknown extension', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists () {
      return false
    },

    read (filename) {
      if (filename === '/index.foo') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  t.is(Module.load('/index.foo', { protocol }).exports, 42)
})

test('load unknown extension with default type', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists () {
      return false
    },

    read (filename) {
      if (filename === '/index.foo') {
        return '42'
      }

      t.fail()
    }
  })

  t.is(Module.load('/index.foo', { protocol, defaultType: Module.constants.types.JSON }).exports, 42)
})

test('load .cjs with hashbang', (t) => {
  t.teardown(onteardown)

  t.execution(() => Module.load('/index.cjs', '#!node'))
})

test('load .mjs with hashbang', (t) => {
  t.teardown(onteardown)

  t.execution(() => Module.load('/index.mjs', '#!node'))
})

test('load .cjs with dynamic .mjs import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (filename) {
      return filename === '/bar.mjs'
    },

    read (filename) {
      if (filename === '/foo.cjs') {
        return 'const bar = import(\'/bar\')'
      }

      if (filename === '/bar.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  Module.load('/foo.cjs', { protocol })
})

test('load .cjs with dynamic .cjs import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (filename) {
      return filename === '/bar.cjs'
    },

    read (filename) {
      if (filename === '/foo.cjs') {
        return 'const bar = import(\'/bar\')'
      }

      if (filename === '/bar.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  Module.load('/foo.cjs', { protocol })
})

test('load .mjs with dynamic .mjs import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (filename) {
      return filename === '/bar.mjs'
    },

    read (filename) {
      if (filename === '/foo.mjs') {
        return 'const { default: bar } = await import(\'/bar\')'
      }

      if (filename === '/bar.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  Module.load('/foo.mjs', { protocol })
})

test('load .mjs with dynamic .cjs import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (filename) {
      return filename === '/bar.cjs'
    },

    read (filename) {
      if (filename === '/foo.mjs') {
        return 'const { default: bar } = await import(\'/bar\')'
      }

      if (filename === '/bar.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  Module.load('/foo.mjs', { protocol })
})

test('load .cjs with bare specifier require and import map', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (filename) {
      return filename === '/bar.cjs'
    },

    read (filename) {
      if (filename === '/foo.cjs') {
        return 'const bar = require(\'bar\')'
      }

      if (filename === '/bar.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  Module.load('/foo.cjs', {
    protocol,
    imports: {
      bar: '/bar.cjs'
    }
  })
})

test('load .mjs with bare specifier import and import map', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (filename) {
      return filename === '/bar.mjs'
    },

    read (filename) {
      if (filename === '/foo.mjs') {
        return 'import bar from \'bar\''
      }

      if (filename === '/bar.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  Module.load('/foo.mjs', {
    protocol,
    imports: {
      bar: '/bar.mjs'
    }
  })
})

test('load .cjs with data: protocol require', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    read (filename) {
      if (filename === '/foo.cjs') {
        return `module.exports = require('data:,${encodeURIComponent('module.exports = 42')}')`
      }

      t.fail()
    }
  })

  t.is(Module.load('/foo.cjs', { protocol }).exports, 42)
})

test('load .mjs with data: protocol import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    read (filename) {
      if (filename === '/foo.mjs') {
        return `export { default } from 'data:,${encodeURIComponent('export default 42')}'`
      }

      t.fail()
    }
  })

  t.is(Module.load('/foo.mjs', { protocol }).exports.default, 42)
})

test('import map with protocol', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (filename) {
      return filename === '/bar.mjs'
    },

    read (filename) {
      if (filename === '/foo.mjs') {
        return 'import bar from \'proto:bar\''
      }

      if (filename === '/bar.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  Module.load('/foo.mjs', {
    protocol,
    imports: {
      'proto:bar': '/bar.mjs'
    }
  })
})

test('require.main', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (filename) {
      return filename === '/bar.js'
    },

    read (filename) {
      if (filename === '/foo.js') {
        return 'module.exports = require.main; require(\'/bar\')'
      }

      if (filename === '/bar.js') {
        return 'module.exports = require.main'
      }

      t.fail()
    }
  })

  const foo = Module.load('/foo.js', { protocol })
  const bar = Module.load('/bar.js', { protocol })

  t.is(foo.exports, foo)
  t.is(bar.exports, foo)
})

test('import.meta', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (filename) {
      return filename === '/bar.mjs'
    },

    read (filename) {
      if (filename === '/foo.mjs') {
        return 'export default import.meta'
      }

      t.fail()
    }
  })

  const { default: meta } = Module.load('/foo.mjs', { protocol }).exports

  t.is(meta.url, '/foo.mjs')
  t.is(meta.main, true)
  t.is(meta.resolve('/bar'), '/bar.mjs')
})

test('import assertions', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (filename) {
      return filename === '/bar'
    },

    read (filename) {
      if (filename === '/foo.mjs') {
        return 'export { default } from \'/bar\' assert { type: \'json\' }'
      }

      if (filename === '/bar') {
        return '{ "hello": "world" }'
      }

      t.fail()
    }
  })

  t.alike(Module.load('/foo.mjs', { protocol }).exports.default, { hello: 'world' })
})

test('createRequire', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (filename) {
      return filename === '/dir/bar.js'
    },

    read (filename) {
      if (filename === '/dir/bar.js') {
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
    exists (filename) {
      return filename === '/dir/bar.js'
    },

    read (filename) {
      if (filename === '/dir/bar.js') {
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
    exists (filename) {
      return filename === '/package.json' || filename === '/foo.js'
    },

    read (filename) {
      if (filename === '/package.json') {
        return '{ "main": "foo.js" }'
      }

      t.fail()
    }
  })

  t.is(Module.resolve('/', { protocol }), '/foo.js')
})

test('exports in package.json', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (filename) {
      return filename === '/package.json' || filename === '/foo.js'
    },

    read (filename) {
      if (filename === '/package.json') {
        return '{ "exports": "./foo.js" }'
      }

      t.fail()
    }
  })

  t.is(Module.resolve('/', { protocol }), '/foo.js')
})

test('conditional exports in package.json, .cjs before .mjs', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (filename) {
      return filename === '/package.json' || filename === '/foo.cjs' || filename === '/foo.mjs'
    },

    read (filename) {
      if (filename === '/package.json') {
        return '{ "exports": { "require": "./foo.cjs", "import": "./foo.mjs" } }'
      }

      t.fail()
    }
  })

  t.is(Module.resolve('/', { protocol }), '/foo.cjs')
})

test('conditional exports in package.json, .mjs before .cjs', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (filename) {
      return filename === '/package.json' || filename === '/foo.cjs' || filename === '/foo.mjs'
    },

    read (filename) {
      if (filename === '/package.json') {
        return '{ "exports": { "import": "./foo.mjs", "require": "./foo.cjs" } }'
      }

      t.fail()
    }
  })

  t.is(Module.resolve('/', { protocol }), '/foo.mjs')
})

test('conditional exports in package.json, array of conditions, .mjs before .cjs', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (filename) {
      return filename === '/package.json' || filename === '/foo.cjs' || filename === '/foo.mjs'
    },

    read (filename) {
      if (filename === '/package.json') {
        return '{ "exports": [{ "import": "./foo.mjs" }, { "require": "./foo.cjs" }] }'
      }

      t.fail()
    }
  })

  t.is(Module.resolve('/', { protocol }), '/foo.mjs')
})

test('exports in node_modules', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (filename) {
      return (
        filename === '/node_modules/foo/package.json' ||
        filename === '/node_modules/foo/foo.js'
      )
    },

    read (filename) {
      if (filename === '/node_modules/foo/package.json') {
        return '{ "exports": "./foo.js" }'
      }

      t.fail()
    }
  })

  t.is(Module.resolve('foo', '/', { protocol }), '/node_modules/foo/foo.js')
})

test('import unexported module in node_modules', async (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (filename) {
      return (
        filename === '/node_modules/foo/package.json' ||
        filename === '/node_modules/foo/foo.js' ||
        filename === '/node_modules/foo/bar.js'
      )
    },

    read (filename) {
      if (filename === '/node_modules/foo/package.json') {
        return '{ "exports": "./foo.js" }'
      }

      t.fail()
    }
  })

  await t.exception(() => Module.resolve('foo/bar', '/', { protocol }))
})

test('imports in package.json', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (filename) {
      return (
        filename === '/package.json' ||
        filename === '/baz.js'
      )
    },

    read (filename) {
      if (filename === '/package.json') {
        return '{ "imports": { "bar": "./baz.js" } }'
      }

      if (filename === '/foo.js') {
        return 'const bar = require(\'bar\')'
      }

      if (filename === '/baz.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  Module.load('/foo.js', { protocol })
})

test('imports in package.json, no match', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (filename) {
      return (
        filename === '/package.json' ||
        filename === '/baz.js'
      )
    },

    read (filename) {
      if (filename === '/package.json') {
        return '{ "imports": { "bar": "./baz.js" } }'
      }

      if (filename === '/foo.js') {
        return 'const bar = require(\'./baz\')'
      }

      if (filename === '/baz.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  Module.load('/foo.js', { protocol })
})

test('conditional imports in package.json, .cjs before .mjs', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (filename) {
      return (
        filename === '/package.json' ||
        filename === '/baz.cjs' ||
        filename === '/baz.mjs'
      )
    },

    read (filename) {
      if (filename === '/package.json') {
        return '{ "imports": { "bar": { "require": "./baz.cjs", "import": "./baz.mjs" } } }'
      }

      if (filename === '/foo.cjs') {
        return 'const bar = require(\'bar\')'
      }

      if (filename === '/baz.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  Module.load('/foo.cjs', { protocol })
})

test('conditional imports in package.json, .mjs before .cjs', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (filename) {
      return filename === '/package.json' || filename === '/baz.cjs' || filename === '/baz.mjs'
    },

    read (filename) {
      if (filename === '/package.json') {
        return '{ "imports": { "bar": { "import": "./baz.mjs", "require": "./baz.cjs" } } }'
      }

      if (filename === '/foo.cjs') {
        return 'const bar = require(\'bar\')'
      }

      if (filename === '/baz.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  Module.load('/foo.cjs', { protocol })
})

test('imports in node_modules', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (filename) {
      return (
        filename === '/node_modules/foo/package.json' ||
        filename === '/node_modules/foo/baz.js'
      )
    },

    read (filename) {
      if (filename === '/node_modules/foo/package.json') {
        return '{ "imports": { "bar": "./baz.js" } }'
      }

      if (filename === '/node_modules/foo/foo.js') {
        return 'const bar = require(\'bar\')'
      }

      if (filename === '/node_modules/foo/baz.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  Module.load('/node_modules/foo/foo.js', { protocol })
})

test('resolve and load builtin', (t) => {
  t.teardown(onteardown)

  const builtins = {
    foo: 42
  }

  t.is(Module.resolve('foo', { builtins }), 'foo')
  t.is(Module.load('foo', { builtins }).exports, 42)
})

test('load builtin from .cjs', (t) => {
  t.teardown(onteardown)

  const builtins = {
    bar: 42
  }

  const protocol = new Module.Protocol({
    read (filename) {
      if (filename === '/foo.cjs') {
        return 'module.exports = require(\'bar\')'
      }

      t.fail()
    }
  })

  t.is(Module.load('/foo.cjs', { protocol, builtins }).exports, 42)
})

test('load builtin from .mjs', (t) => {
  t.teardown(onteardown)

  const builtins = {
    bar: 42
  }

  const protocol = new Module.Protocol({
    read (filename) {
      if (filename === '/foo.mjs') {
        return 'export { default } from \'bar\''
      }

      t.fail()
    }
  })

  t.is(Module.load('/foo.mjs', { protocol, builtins }).exports.default, 42)
})

test('load file that cannot be read', async (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (filename) {
      return filename === '/foo.cjs'
    },

    read () {
      throw new Error('file missing')
    }
  })

  await t.exception(() => Module.load('/foo.cjs', { protocol }), /file missing/)
})

function onteardown () {
  // TODO Provide a public API for clearing the cache.
  Module._cache = Object.create(null)
  Module._bundles = Object.create(null)
}
