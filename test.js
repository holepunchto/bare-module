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
      return false
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

test('load .js with pkg.type module', (t) => {
  Module._cache = {}

  Module._protocols['file:'] = {
    exists (filename) {
      return filename === p('package.json')
    },

    read (filename) {
      if (filename === p('index.js')) {
        return 'export default 42'
      }

      if (filename === p('package.json')) {
        return '{ "type": "module" }'
      }

      t.fail()
    }
  }

  Module.load(p('index.js'))
})

test('load .cjs', (t) => {
  Module._cache = {}

  Module._protocols['file:'] = {
    exists () {
      return false
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

test('load .cjs with builtin require', (t) => {
  Module._cache = {}

  Module._builtins.foo = 42

  Module._protocols['file:'] = {
    exists () {
      return false
    },

    read (filename) {
      if (filename === p('index.cjs')) {
        return 'const foo = require(\'foo\')'
      }

      t.fail()
    }
  }

  Module.load(p('index.cjs'))
})

test('load .mjs', (t) => {
  Module._cache = {}

  Module._protocols['file:'] = {
    exists () {
      return false
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

  Module._builtins.foo = 42

  Module._protocols['file:'] = {
    exists () {
      return false
    },

    read (filename) {
      if (filename === p('index.mjs')) {
        return 'import foo from \'foo\''
      }

      t.fail()
    }
  }

  Module.load(p('index.mjs'))
})

test('load .mjs with missing import', (t) => {
  Module._cache = {}

  Module._protocols['file:'] = {
    exists () {
      return false
    },

    read (filename) {
      if (filename === p('index.mjs')) {
        return 'import foo from \'./foo\''
      }

      t.fail()
    }
  }

  t.exception(() => Module.load(p('index.mjs')), /could not resolve \.\/foo/i)
})

test('load .json', (t) => {
  Module._cache = {}

  Module._protocols['file:'] = {
    exists () {
      return false
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

  const bundle = new Module.Bundle()
    .write(p('foo.js'), 'module.exports = require(\'./bar\')', { main: true })
    .write(p('bar.js'), 'module.exports = 42')
    .toBuffer()

  Module._protocols['file:'] = {
    exists () {
      return false
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

  const bundle = new Module.Bundle()
    .write(p('foo.mjs'), 'export { default } from \'./bar\'', { main: true })
    .write(p('bar.mjs'), 'export default 42')
    .toBuffer()

  Module._protocols['file:'] = {
    exists () {
      return false
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
      return false
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
