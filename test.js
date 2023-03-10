const test = require('brittle')
const Module = require('.')

test('resolve', (t) => {
  Module._cache = {}

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
  Module._cache = {}

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
  Module._cache = {}

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
  Module._cache = {}

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
  Module._cache = {}

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
  Module._cache = {}

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
  Module._cache = {}

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
  Module._cache = {}

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
  Module._cache = {}

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
  Module._cache = {}

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
  Module._cache = {}

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
  Module._cache = {}

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
  Module._cache = {}

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

test('load .mjs with builtin import', (t) => {
  Module._cache = {}

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
  Module._cache = {}

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

  t.exception(() => Module.load('/index.mjs'), /could not resolve \.\/foo/i)
})

test('load .mjs with nested import', (t) => {
  Module._cache = {}

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
  Module._cache = {}

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
  Module._cache = {}

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
  Module._cache = {}

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

test('load .pear', (t) => {
  Module._cache = {}

  Module._protocols['file:'] = new Module.Protocol({
    exists (filename) {
      return (
        filename === '/node_modules/native/index.js' ||
        filename === '/node_modules/native/native.pear'
      )
    },

    read (filename) {
      if (filename === '/node_modules/native/index.js') {
        return 'require(\'./native.pear\')'
      }

      t.fail()
    }
  })

  t.exception(() => Module.load(Module.resolve('native', '/')), /dlopen\(.*node_modules\/native\/native\.pear.+\)/)
})

test('load .node', (t) => {
  Module._cache = {}

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

  t.exception(() => Module.load(Module.resolve('native', '/')), /dlopen\(.*node_modules\/native\/native\.node.+\)/)
})

test('load .bundle', (t) => {
  Module._cache = {}

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
  Module._cache = {}

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
  Module._cache = {}

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
  Module._cache = {}

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
  Module._cache = {}

  const bundle = new Module.Bundle()
    .write('/foo.js', 'module.exports = require(\'bar\')', { main: true })
    .write('/bar.js', 'module.exports = 42', { alias: 'bar' })
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

test('load unknown extension', (t) => {
  Module._cache = {}

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
  Module._cache = {}

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
  Module._cache = {}

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
  Module._cache = {}

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
  Module._cache = {}

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
  Module._cache = {}

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
  Module._cache = {}

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
  Module._cache = {}

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
  Module._cache = {}

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
  Module._cache = {}

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
  Module._cache = {}

  Module._protocols['file:'] = new Module.Protocol({
    imports: {
      bar: '/bar.mjs'
    },

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
