const test = require('brittle')
const Module = require('.')

test('resolve', (t) => {
  Module._cache = {}

  Module._protocols['file:'] = new Module.Protocol({
    exists (filename) {
      return (
        filename === '/node_modules/foo' ||
        filename === '/node_modules/foo/index.js'
      )
    },

    read () {
      t.fail()
    }
  })

  t.is(Module.resolve('foo'), '/node_modules/foo/index.js')
})

test('load bare specifier', (t) => {
  Module._cache = {}

  Module._protocols['file:'] = new Module.Protocol({
    exists (filename) {
      return (
        filename === '/node_modules/foo' ||
        filename === '/node_modules/foo/index.js'
      )
    },

    read (filename) {
      if (filename === '/node_modules/foo/index.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  t.is(Module.load(Module.resolve('foo')).exports, 42)
})

test('load bare specifier with source', (t) => {
  Module._cache = {}

  Module._protocols['file:'] = new Module.Protocol({
    exists (filename) {
      return (
        filename === '/node_modules/foo' ||
        filename === '/node_modules/foo/index.js'
      )
    },

    read () {
      t.fail()
    }
  })

  t.is(Module.load(Module.resolve('foo'), 'module.exports = 42').exports, 42)
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
      return (
        filename === '/node_modules/foo' ||
        filename === '/node_modules/foo/index.js'
      )
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
        filename === '/node_modules/native' ||
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

  t.exception(() => Module.load(Module.resolve('native')), /dlopen\(.*node_modules\/native\/native\.pear.+\)/)
})

test('load .node', (t) => {
  Module._cache = {}

  Module._protocols['file:'] = new Module.Protocol({
    exists (filename) {
      return (
        filename === '/node_modules/native' ||
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

  t.exception(() => Module.load(Module.resolve('native')), /dlopen\(.*node_modules\/native\/native\.node.+\)/)
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

test('require', (t) => {
  Module._cache = {}

  Module._protocols['file:'] = new Module.Protocol({
    exists (filename) {
      return (
        filename === '/node_modules/foo' ||
        filename === '/node_modules/foo/index.js' ||
        filename === '/node_modules/bar' ||
        filename === '/node_modules/bar/index.js'
      )
    },

    read (filename) {
      if (filename === '/node_modules/foo/index.js') {
        return 'module.exports = require(\'bar\')'
      }

      if (filename === '/node_modules/bar/index.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  t.is(Module.load(Module.resolve('foo')).exports, 42)
})
