const test = require('brittle')
const path = require('path')
const Module = require('.')

test('resolve', (t) => {
  Module._cache = {}

  Module.configure({
    exists (filename) {
      return (
        filename === p('node_modules/foo') ||
        filename === p('node_modules/foo/index.js')
      )
    },

    read () {
      t.fail()
    }
  })

  t.is(
    Module.resolve('foo'),
    path.join(process.cwd(), 'node_modules/foo/index.js')
  )
})

test('load bare', (t) => {
  Module._cache = {}

  Module.configure({
    exists (filename) {
      return (
        filename === p('node_modules/foo') ||
        filename === p('node_modules/foo/index.js')
      )
    },

    read (filename) {
      if (filename === p('node_modules/foo/index.js')) {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  t.is(Module.load(Module.resolve('foo')), 42)
})

test('load bare with source', (t) => {
  Module._cache = {}

  Module.configure({
    exists (filename) {
      return (
        filename === p('node_modules/foo') ||
        filename === p('node_modules/foo/index.js')
      )
    },

    read () {
      t.fail()
    }
  })

  t.is(Module.load(Module.resolve('foo'), 'module.exports = 42'), 42)
})

test('load .js', (t) => {
  Module._cache = {}

  Module.configure({
    exists () {
      t.fail()
    },

    read (filename) {
      if (filename === p('index.js')) {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  t.is(Module.load(p('index.js')), 42)
})

test('load .cjs', (t) => {
  Module._cache = {}

  Module.configure({
    exists () {
      t.fail()
    },

    read (filename) {
      if (filename === p('index.cjs')) {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  t.is(Module.load(p('index.cjs')), 42)
})

test.skip('load .mjs', (t) => {
  Module._cache = {}

  Module.configure({
    exists () {
      t.fail()
    },

    read (filename) {
      if (filename === p('index.mjs')) {
        return 'export default 42'
      }

      t.fail()
    }
  })

  Module.load(p('index.mjs'))
})

test('load .json', (t) => {
  Module._cache = {}

  Module.configure({
    exists () {
      t.fail()
    },

    read (filename) {
      if (filename === p('index.json')) {
        return '42'
      }

      t.fail()
    }
  })

  t.is(Module.load(p('index.json')), 42)
})

test('load .pear', (t) => {
  Module._cache = {}

  Module.configure({
    exists (filename) {
      return (
        filename === p('node_modules/native') ||
        filename === p('node_modules/native/index.js') ||
        filename === p('node_modules/native/native.pear')
      )
    },

    read (filename) {
      if (filename === p('node_modules/native/index.js')) {
        return 'require(\'./native.pear\')'
      }

      t.fail()
    }
  })

  t.exception(() => Module.load(Module.resolve('native')), /dlopen\(.*node_modules\/native\/native\.pear.+\)/)
})

test('load .node', (t) => {
  Module._cache = {}

  Module.configure({
    exists (filename) {
      return (
        filename === p('node_modules/native') ||
        filename === p('node_modules/native/index.js') ||
        filename === p('node_modules/native/native.node')
      )
    },

    read (filename) {
      if (filename === p('node_modules/native/index.js')) {
        return 'require(\'./native.node\')'
      }

      t.fail()
    }
  })

  t.exception(() => Module.load(Module.resolve('native')), /dlopen\(.*node_modules\/native\/native\.node.+\)/)
})

test('load unknown extension', (t) => {
  Module._cache = {}

  Module.configure({
    exists () {
      t.fail()
    },

    read (filename) {
      if (filename === p('index.foo')) {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  t.is(Module.load(p('index.foo')), 42)
})

test('require', (t) => {
  Module._cache = {}

  Module.configure({
    exists (filename) {
      return (
        filename === p('node_modules/foo') ||
        filename === p('node_modules/foo/index.js') ||
        filename === p('node_modules/bar') ||
        filename === p('node_modules/bar/index.js')
      )
    },

    read (filename) {
      if (filename === p('node_modules/foo/index.js')) {
        return 'module.exports = require(\'bar\')'
      }

      if (filename === p('node_modules/bar/index.js')) {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  t.is(Module.load(Module.resolve('foo')), 42)
})

function p (f) {
  return path.join(process.cwd(), f)
}
