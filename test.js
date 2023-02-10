const test = require('brittle')
const path = require('path')
const Module = require('.')

test('resolve', (t) => {
  Module._cache = {}

  Module._protocols['file:'] = {
    exists (filename) {
      return (
        filename === p('node_modules/foo') ||
        filename === p('node_modules/foo/index.js')
      )
    },

    read () {
      t.fail()
    }
  }

  t.is(
    Module.resolve('foo'),
    path.join(process.cwd(), 'node_modules/foo/index.js')
  )
})

test('load bare', (t) => {
  Module._cache = {}

  Module._protocols['file:'] = {
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
  }

  t.is(Module.load(Module.resolve('foo')).exports, 42)
})

test('load bare with source', (t) => {
  Module._cache = {}

  Module._protocols['file:'] = {
    exists (filename) {
      return (
        filename === p('node_modules/foo') ||
        filename === p('node_modules/foo/index.js')
      )
    },

    read () {
      t.fail()
    }
  }

  t.is(Module.load(Module.resolve('foo'), 'module.exports = 42').exports, 42)
})

test('load .js', (t) => {
  Module._cache = {}

  Module._protocols['file:'] = {
    exists () {
      t.fail()
    },

    read (filename) {
      if (filename === p('index.js')) {
        return 'module.exports = 42'
      }

      t.fail()
    }
  }

  t.is(Module.load(p('index.js')).exports, 42)
})

test('load .cjs', (t) => {
  Module._cache = {}

  Module._protocols['file:'] = {
    exists () {
      t.fail()
    },

    read (filename) {
      if (filename === p('index.cjs')) {
        return 'module.exports = 42'
      }

      t.fail()
    }
  }

  t.is(Module.load(p('index.cjs')).exports, 42)
})

test('load .mjs', (t) => {
  Module._cache = {}

  Module._protocols['file:'] = {
    exists () {
      t.fail()
    },

    read (filename) {
      if (filename === p('index.mjs')) {
        return 'export default 42'
      }

      t.fail()
    }
  }

  Module.load(p('index.mjs'))
})

test('load .mjs with import', (t) => {
  Module._cache = {}

  Module._protocols['file:'] = {
    exists (filename) {
      return filename === p('foo.mjs')
    },

    read (filename) {
      if (filename === p('index.mjs')) {
        return 'import foo from \'./foo.mjs\''
      }

      if (filename === p('foo.mjs')) {
        return 'export default 42'
      }

      t.fail()
    }
  }

  Module.load(p('index.mjs'))
})

test('load .mjs with .cjs import', (t) => {
  Module._cache = {}

  Module._protocols['file:'] = {
    exists (filename) {
      return filename === p('foo.cjs')
    },

    read (filename) {
      if (filename === p('index.mjs')) {
        return 'import foo from \'./foo.cjs\''
      }

      if (filename === p('foo.cjs')) {
        return 'module.exports = 42'
      }

      t.fail()
    }
  }

  Module.load(p('index.mjs'))
})

test('load .mjs with builtin import', (t) => {
  Module._cache = {}

  Module._protocols['file:'] = {
    exists () {
      t.fail()
    },

    read (filename) {
      if (filename === p('index.mjs')) {
        return 'import Module from \'module\''
      }

      t.fail()
    }
  }

  Module.load(p('index.mjs'))
})

test('load .json', (t) => {
  Module._cache = {}

  Module._protocols['file:'] = {
    exists () {
      t.fail()
    },

    read (filename) {
      if (filename === p('index.json')) {
        return '42'
      }

      t.fail()
    }
  }

  t.is(Module.load(p('index.json')).exports, 42)
})

test('load .pear', (t) => {
  Module._cache = {}

  Module._protocols['file:'] = {
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
  }

  t.exception(() => Module.load(Module.resolve('native')), /dlopen\(.*node_modules\/native\/native\.pear.+\)/)
})

test('load .node', (t) => {
  Module._cache = {}

  Module._protocols['file:'] = {
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
  }

  t.exception(() => Module.load(Module.resolve('native')), /dlopen\(.*node_modules\/native\/native\.node.+\)/)
})

test('load .bundle', (t) => {
  Module._cache = {}

  const bundle = JSON.stringify({
    entry: p('foo.js'),
    files: {
      [p('foo.js')]: {
        source: 'module.exports = require(\'./bar\')'
      },
      [p('bar.js')]: {
        source: 'module.exports = 42'
      }
    }
  })

  Module._protocols['file:'] = {
    exists (filename) {
      return filename === p('app.bundle')
    },

    read (filename) {
      if (filename === p('app.bundle')) {
        return bundle
      }

      t.fail()
    }
  }

  Module.load(p('app.bundle'), bundle)
})

test('load .bundle with .mjs', (t) => {
  Module._cache = {}

  const bundle = JSON.stringify({
    entry: p('foo.mjs'),
    files: {
      [p('foo.mjs')]: {
        source: 'export { default } from \'./bar\''
      },
      [p('bar.mjs')]: {
        source: 'export default 42'
      }
    }
  })

  Module._protocols['file:'] = {
    exists (filename) {
      return filename === p('app.bundle')
    },

    read (filename) {
      if (filename === p('app.bundle')) {
        return bundle
      }

      t.fail()
    }
  }

  Module.load(p('app.bundle'), bundle)
})

test('load unknown extension', (t) => {
  Module._cache = {}

  Module._protocols['file:'] = {
    exists () {
      t.fail()
    },

    read (filename) {
      if (filename === p('index.foo')) {
        return 'module.exports = 42'
      }

      t.fail()
    }
  }

  t.is(Module.load(p('index.foo')).exports, 42)
})

test('require', (t) => {
  Module._cache = {}

  Module._protocols['file:'] = {
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
  }

  t.is(Module.load(Module.resolve('foo')).exports, 42)
})

function p (f) {
  return path.join(process.cwd(), f)
}
