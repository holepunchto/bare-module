const test = require('brittle')
const Module = require('.')

test('resolve', (t) => {
  t.teardown(onteardown)

  Module._protocols['file:'] = new Module.Protocol({
    exists (filename) {
      return filename === '/node_modules/foo/index.js'
    },

    read () {
      t.fail()
    }
  })

  t.is(Module.resolve('foo', '/'), '/node_modules/foo/index.js')
})

test('load bare specifier', (t) => {
  t.teardown(onteardown)

  Module._protocols['file:'] = new Module.Protocol({
    exists (filename) {
      return filename === '/node_modules/foo/index.js'
    },

    read (filename) {
      if (filename === '/node_modules/foo/index.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  t.is(Module.load(Module.resolve('foo', '/')).exports, 42)
})

test('load bare specifier with source', (t) => {
  t.teardown(onteardown)

  Module._protocols['file:'] = new Module.Protocol({
    exists (filename) {
      return filename === '/node_modules/foo/index.js'
    },

    read () {
      t.fail()
    }
  })

  t.is(Module.load(Module.resolve('foo', '/'), 'module.exports = 42').exports, 42)
})

test('load .js', (t) => {
  t.teardown(onteardown)

  Module._protocols['file:'] = new Module.Protocol({
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

  t.is(Module.load('/index.js').exports, 42)
})

test('load .js with pkg.type module', (t) => {
  t.teardown(onteardown)

  Module._protocols['file:'] = new Module.Protocol({
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

  Module.load('/index.js')
})

test('load .cjs', (t) => {
  t.teardown(onteardown)

  Module._protocols['file:'] = new Module.Protocol({
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

  t.is(Module.load('/index.cjs').exports, 42)
})

test('load .cjs with bare specifier', (t) => {
  t.teardown(onteardown)

  Module._protocols['file:'] = new Module.Protocol({
    exists (filename) {
      return filename === '/node_modules/foo/index.js'
    },

    read (filename) {
      if (filename === '/index.cjs') {
        return 'module.exports = require(\'foo\')'
      }

      if (filename === '/node_modules/foo/index.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  t.is(Module.load('/index.cjs').exports, 42)
})

test('load .cjs with builtin require', (t) => {
  t.teardown(onteardown)

  Module._builtins.foo = 42

  Module._protocols['file:'] = new Module.Protocol({
    exists () {
      return false
    },

    read (filename) {
      if (filename === '/index.cjs') {
        return 'const foo = require(\'foo\')'
      }

      t.fail()
    }
  })

  Module.load('/index.cjs')
})

test('load .cjs with .mjs require', (t) => {
  t.teardown(onteardown)

  Module._protocols['file:'] = new Module.Protocol({
    exists (filename) {
      return filename === '/bar.mjs'
    },

    read (filename) {
      if (filename === '/foo.cjs') {
        return 'const bar = require(\'./bar\')'
      }

      if (filename === '/bar.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  Module.load('/foo.cjs')
})

test('load .cjs with top-level await .mjs require', (t) => {
  t.teardown(onteardown)

  Module._protocols['file:'] = new Module.Protocol({
    exists (filename) {
      return filename === '/bar.mjs'
    },

    read (filename) {
      if (filename === '/foo.cjs') {
        return 'const bar = require(\'./bar\'); bar.default'
      }

      if (filename === '/bar.mjs') {
        return 'export default await 42'
      }

      t.fail()
    }
  })

  t.exception.all(() => Module.load('/foo.cjs'), /cannot access 'default' before initialization/i)
})

test('load .mjs', (t) => {
  t.teardown(onteardown)

  Module._protocols['file:'] = new Module.Protocol({
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

  Module.load('/index.mjs')
})

test('load .mjs with import', (t) => {
  t.teardown(onteardown)

  Module._protocols['file:'] = new Module.Protocol({
    exists (filename) {
      return filename === '/foo.mjs'
    },

    read (filename) {
      if (filename === '/index.mjs') {
        return 'import foo from \'./foo.mjs\''
      }

      if (filename === '/foo.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  Module.load('/index.mjs')
})

test('load .mjs with .cjs import', (t) => {
  t.teardown(onteardown)

  Module._protocols['file:'] = new Module.Protocol({
    exists (filename) {
      return filename === '/foo.cjs'
    },

    read (filename) {
      if (filename === '/index.mjs') {
        return 'import foo from \'./foo.cjs\''
      }

      if (filename === '/foo.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  Module.load('/index.mjs')
})

test('load .mjs with .js import', (t) => {
  t.teardown(onteardown)

  Module._protocols['file:'] = new Module.Protocol({
    exists (filename) {
      return filename === '/foo.js'
    },

    read (filename) {
      if (filename === '/index.mjs') {
        return 'import foo from \'./foo.js\''
      }

      if (filename === '/foo.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  Module.load('/index.mjs')
})

test('load .mjs with builtin import', (t) => {
  t.teardown(onteardown)

  Module._builtins.foo = 42

  Module._protocols['file:'] = new Module.Protocol({
    exists () {
      return false
    },

    read (filename) {
      if (filename === '/index.mjs') {
        return 'import foo from \'foo\''
      }

      t.fail()
    }
  })

  Module.load('/index.mjs')
})

test('load .mjs with missing import', (t) => {
  t.teardown(onteardown)

  Module._protocols['file:'] = new Module.Protocol({
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

  t.exception(() => Module.load('/index.mjs'), /cannot find module '\.\/foo'/i)
})

test('load .mjs with nested import', (t) => {
  t.teardown(onteardown)

  Module._protocols['file:'] = new Module.Protocol({
    exists (filename) {
      return filename === '/foo.mjs' || filename === '/bar.mjs' || filename === '/baz.mjs'
    },

    read (filename) {
      if (filename === '/foo.mjs') {
        return 'import bar from \'./bar\'; export default 1'
      }

      if (filename === '/bar.mjs') {
        return 'import baz from \'./baz\'; export default 2'
      }

      if (filename === '/baz.mjs') {
        return 'export default 3'
      }

      t.fail()
    }
  })

  Module.load('/foo.mjs')
})

test('load .mjs with cyclic import', (t) => {
  t.teardown(onteardown)

  Module._protocols['file:'] = new Module.Protocol({
    exists (filename) {
      return filename === '/foo.mjs' || filename === '/bar.mjs'
    },

    read (filename) {
      if (filename === '/foo.mjs') {
        return 'import bar from \'./bar\'; export default 1'
      }

      if (filename === '/bar.mjs') {
        return 'import foo from \'./foo\'; export default 2'
      }

      t.fail()
    }
  })

  Module.load('/foo.mjs')
})

test('load .mjs with top-level await .mjs import', (t) => {
  t.teardown(onteardown)

  Module._protocols['file:'] = new Module.Protocol({
    exists (filename) {
      return filename === '/bar.mjs'
    },

    read (filename) {
      if (filename === '/foo.mjs') {
        return 'import bar from \'./bar\''
      }

      if (filename === '/bar.mjs') {
        return 'export default await 42'
      }

      t.fail()
    }
  })

  Module.load('/foo.mjs')
})

test('load .json', (t) => {
  t.teardown(onteardown)

  Module._protocols['file:'] = new Module.Protocol({
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

  t.is(Module.load('/index.json').exports, 42)
})

test('load .bare', (t) => {
  t.teardown(onteardown)

  Module._protocols['file:'] = new Module.Protocol({
    exists (filename) {
      return (
        filename === '/node_modules/native/index.js' ||
        filename === '/node_modules/native/native.bare'
      )
    },

    read (filename) {
      if (filename === '/node_modules/native/index.js') {
        return 'require(\'./native.bare\')'
      }

      t.fail()
    }
  })

  t.exception(() => Module.load(Module.resolve('native', '/')), /dlopen\(\/node_modules\/native\/native\.bare/i)
})

test('load .node', (t) => {
  t.teardown(onteardown)

  Module._protocols['file:'] = new Module.Protocol({
    exists (filename) {
      return (
        filename === '/node_modules/native/index.js' ||
        filename === '/node_modules/native/native.node'
      )
    },

    read (filename) {
      if (filename === '/node_modules/native/index.js') {
        return 'require(\'./native.node\')'
      }

      t.fail()
    }
  })

  t.exception(() => Module.load(Module.resolve('native', '/')), /dlopen\(\/node_modules\/native\/native\.node/i)
})

test('load .bundle', (t) => {
  t.teardown(onteardown)

  const bundle = new Module.Bundle()
    .write('/foo.js', 'module.exports = require(\'./bar\')', { main: true })
    .write('/bar.js', 'module.exports = 42')
    .toBuffer()

  Module._protocols['file:'] = new Module.Protocol({
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

  Module.load('/app.bundle', bundle)
})

test('load .bundle with .mjs', (t) => {
  t.teardown(onteardown)

  const bundle = new Module.Bundle()
    .write('/foo.mjs', 'export { default } from \'./bar\'', { main: true })
    .write('/bar.mjs', 'export default 42')
    .toBuffer()

  Module._protocols['file:'] = new Module.Protocol({
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

  Module.load('/app.bundle', bundle)
})

test('load .bundle with bare specifier', (t) => {
  t.teardown(onteardown)

  const bundle = new Module.Bundle()
    .write('/foo.js', 'module.exports = require(\'bar\')', { main: true })
    .write('/node_modules/bar/index.js', 'module.exports = 42')
    .toBuffer()

  Module._protocols['file:'] = new Module.Protocol({
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

  Module.load('/app.bundle', bundle)
})

test('load .bundle with bare specifier, nested', (t) => {
  t.teardown(onteardown)

  const bundle = new Module.Bundle()
    .write('/foo.js', 'module.exports = require(\'bar\')', { main: true })
    .write('/node_modules/bar/index.js', 'module.exports = require(\'baz\')')
    .write('/node_modules/baz/index.js', 'module.exports = 42')
    .toBuffer()

  Module._protocols['file:'] = new Module.Protocol({
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

  Module.load('/app.bundle', bundle)
})

test('load .bundle with bare specifier and import map', (t) => {
  t.teardown(onteardown)

  const bundle = new Module.Bundle()
    .write('/foo.js', 'module.exports = require(\'baz\')', { main: true })
    .write('/bar.js', 'module.exports = 42', { alias: 'baz' })
    .toBuffer()

  Module._protocols['file:'] = new Module.Protocol({
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

  t.is(Module.load('/app.bundle', bundle).exports, 42)
})

test('load specific module within .bundle', (t) => {
  t.teardown(onteardown)

  const bundle = new Module.Bundle()
    .write('/foo.js', 'module.exports = require(\'./bar\')')
    .write('/bar.js', 'module.exports = 42')
    .toBuffer()

  Module._protocols['file:'] = new Module.Protocol({
    exists (filename) {
      return false
    },

    read (filename) {
      if (filename === '/app.bundle') {
        return bundle
      }

      t.fail()
    }
  })

  t.is(Module.load('/app.bundle/foo.js').exports, 42)
})

test('load specific module within nested .bundle', (t) => {
  t.teardown(onteardown)

  const bundleA = new Module.Bundle()
    .write('/bar.js', 'module.exports = 42')
    .toBuffer()

  const bundleB = new Module.Bundle()
    .write('/bar.bundle', bundleA)
    .toBuffer()

  Module._protocols['file:'] = new Module.Protocol({
    exists (filename) {
      return false
    },

    read (filename) {
      if (filename === '/foo.bundle') {
        return bundleB
      }

      t.fail()
    }
  })

  t.is(Module.load('/foo.bundle/bar.bundle/bar.js').exports, 42)
})

test('resolve specific module within .bundle', (t) => {
  t.teardown(onteardown)

  const bundle = new Module.Bundle()
    .write('/foo.js', 'module.exports = require(\'./bar\')')
    .write('/bar.js', 'module.exports = 42')
    .toBuffer()

  Module._protocols['file:'] = new Module.Protocol({
    exists (filename) {
      return false
    },

    read (filename) {
      if (filename === '/app.bundle') {
        return bundle
      }

      t.fail()
    }
  })

  t.is(Module.resolve('/app.bundle/foo'), '/app.bundle/foo.js')
})

test('resolve specific module within nested .bundle', (t) => {
  t.teardown(onteardown)

  const bundleA = new Module.Bundle()
    .write('/bar.js', 'module.exports = 42')
    .toBuffer()

  const bundleB = new Module.Bundle()
    .write('/bar.bundle', bundleA)
    .toBuffer()

  Module._protocols['file:'] = new Module.Protocol({
    exists (filename) {
      return false
    },

    read (filename) {
      if (filename === '/foo.bundle') {
        return bundleB
      }

      t.fail()
    }
  })

  t.is(Module.resolve('/foo.bundle/bar.bundle/bar'), '/foo.bundle/bar.bundle/bar.js')
})

test('load unknown extension', (t) => {
  t.teardown(onteardown)

  Module._protocols['file:'] = new Module.Protocol({
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

  t.is(Module.load('/index.foo').exports, 42)
})

test('load .cjs with hashbang', (t) => {
  t.teardown(onteardown)

  Module._protocols['file:'] = new Module.Protocol({
    exists () {
      return false
    },

    read () {
      t.fail()
    }
  })

  t.execution(() => Module.load('/index.cjs', '#!node'))
})

test('load .mjs with hashbang', (t) => {
  t.teardown(onteardown)

  Module._protocols['file:'] = new Module.Protocol({
    exists () {
      return false
    },

    read () {
      t.fail()
    }
  })

  t.execution(() => Module.load('/index.mjs', '#!node'))
})

test('load .cjs with dynamic .mjs import', (t) => {
  t.teardown(onteardown)

  Module._protocols['file:'] = new Module.Protocol({
    exists (filename) {
      return filename === '/bar.mjs'
    },

    read (filename) {
      if (filename === '/foo.cjs') {
        return 'const bar = import(\'./bar\')'
      }

      if (filename === '/bar.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  Module.load('/foo.cjs')
})

test('load .cjs with dynamic .cjs import', (t) => {
  t.teardown(onteardown)

  Module._protocols['file:'] = new Module.Protocol({
    exists (filename) {
      return filename === '/bar.cjs'
    },

    read (filename) {
      if (filename === '/foo.cjs') {
        return 'const bar = import(\'./bar\')'
      }

      if (filename === '/bar.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  Module.load('/foo.cjs')
})

test('load .mjs with dynamic .mjs import', (t) => {
  t.teardown(onteardown)

  Module._protocols['file:'] = new Module.Protocol({
    exists (filename) {
      return filename === '/bar.mjs'
    },

    read (filename) {
      if (filename === '/foo.mjs') {
        return 'const { default: bar } = await import(\'./bar\')'
      }

      if (filename === '/bar.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  Module.load('/foo.mjs')
})

test('load .mjs with dynamic .cjs import', (t) => {
  t.teardown(onteardown)

  Module._protocols['file:'] = new Module.Protocol({
    exists (filename) {
      return filename === '/bar.cjs'
    },

    read (filename) {
      if (filename === '/foo.mjs') {
        return 'const { default: bar } = await import(\'./bar\')'
      }

      if (filename === '/bar.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  Module.load('/foo.mjs')
})

test('load .cjs with bare specifier and import map', (t) => {
  t.teardown(onteardown)

  Module._protocols['file:'] = new Module.Protocol({
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
    imports: {
      bar: '/bar.cjs'
    }
  })
})

test('load .mjs with bare specifier and import map', (t) => {
  t.teardown(onteardown)

  Module._protocols['file:'] = new Module.Protocol({
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
    imports: {
      bar: '/bar.mjs'
    }
  })
})

test('load .cjs with explicit file: protocol', (t) => {
  t.teardown(onteardown)

  Module._protocols['file:'] = new Module.Protocol({
    map (specifier) {
      return specifier.replace(/^file:/, '')
    },

    exists (filename) {
      return filename === '/bar.cjs'
    },

    read (filename) {
      if (filename === '/foo.cjs') {
        return 'const bar = require(\'file:/bar\')'
      }

      if (filename === '/bar.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  Module.load('/foo.cjs')
})

test('load .mjs with explicit file: protocol', (t) => {
  t.teardown(onteardown)

  Module._protocols['file:'] = new Module.Protocol({
    map (specifier) {
      return specifier.replace(/^file:/, '')
    },

    exists (filename) {
      return filename === '/bar.mjs'
    },

    read (filename) {
      if (filename === '/foo.mjs') {
        return 'import bar from \'file:/bar\''
      }

      if (filename === '/bar.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  Module.load('/foo.mjs')
})

test('load .cjs with node: require', (t) => {
  t.teardown(onteardown)

  Module._builtins.foo = 42

  Module._protocols['file:'] = new Module.Protocol({
    read (filename) {
      if (filename === '/foo.cjs') {
        return 'const foo = require(\'node:foo\')'
      }

      t.fail()
    }
  })

  Module.load('/foo.cjs')
})

test('load .mjs with node: import', (t) => {
  t.teardown(onteardown)

  Module._builtins.foo = 42

  Module._protocols['file:'] = new Module.Protocol({
    read (filename) {
      if (filename === '/foo.mjs') {
        return 'import foo from \'node:foo\''
      }

      t.fail()
    }
  })

  Module.load('/foo.mjs')
})

test('load .cjs with data: require', (t) => {
  t.teardown(onteardown)

  Module._protocols['file:'] = new Module.Protocol({
    read (filename) {
      if (filename === '/foo.cjs') {
        return `module.exports = require('data:,${encodeURIComponent('module.exports = 42')}')`
      }

      t.fail()
    }
  })

  t.is(Module.load('/foo.cjs').exports, 42)
})

test('load .mjs with data: require', (t) => {
  t.teardown(onteardown)

  Module._protocols['file:'] = new Module.Protocol({
    read (filename) {
      if (filename === '/foo.mjs') {
        return `export { default } from 'data:,${encodeURIComponent('export default 42')}'`
      }

      t.fail()
    }
  })

  t.is(Module.load('/foo.mjs').exports.default, 42)
})

test('import map with protocol', (t) => {
  t.teardown(onteardown)

  Module._protocols['file:'] = new Module.Protocol({
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
    imports: {
      'proto:bar': '/bar.mjs'
    }
  })
})

test('require.main', (t) => {
  t.teardown(onteardown)

  Module._protocols['file:'] = new Module.Protocol({
    exists (filename) {
      return filename === '/bar.js'
    },

    read (filename) {
      if (filename === '/foo.js') {
        return 'module.exports = require.main; require(\'./bar\')'
      }

      if (filename === '/bar.js') {
        return 'module.exports = require.main'
      }

      t.fail()
    }
  })

  t.is(Module.load('/foo.js').exports, '/foo.js')
  t.is(Module.load('/bar.js').exports, '/foo.js')
})

test('import.meta', (t) => {
  t.teardown(onteardown)

  Module._protocols['file:'] = new Module.Protocol({
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

  const { default: meta } = Module.load('/foo.mjs').exports

  t.is(meta.url, '/foo.mjs')
  t.is(meta.main, '/foo.mjs')
  t.is(meta.resolve('./bar'), '/bar.mjs')
})

function onteardown () {
  Module._cache = {}
}
