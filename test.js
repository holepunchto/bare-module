const test = require('brittle')
const Bundle = require('bare-bundle')
const { pathToFileURL } = require('bare-url')
const Module = require('.')
const binding = require('./binding')

const isWindows = Bare.platform === 'win32'

const host = Bare.Addon.host
const root = isWindows ? 'file:///c:' : 'file://'
const prebuilds = root + '/prebuilds/' + host

test('resolve bare specifier', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/node_modules/foo/package.json' ||
        url.href === root + '/node_modules/foo/index.js'
      )
    },

    read(url) {
      if (url.href === root + '/node_modules/foo/package.json') {
        return '{}'
      }

      t.fail()
    }
  })

  const { href } = await Module.resolve('foo', new URL(root + '/'), { protocol })

  t.is(href, root + '/node_modules/foo/index.js')
})

test('load resolved bare specifier', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/node_modules/foo/package.json' ||
        url.href === root + '/node_modules/foo/index.js'
      )
    },

    read(url) {
      if (url.href === root + '/node_modules/foo/package.json') {
        return '{}'
      }

      if (url.href === root + '/node_modules/foo/index.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  const url = await Module.resolve('foo', new URL(root + '/'), { protocol })
  const { exports } = await Module.load(url, { protocol })

  t.is(exports, 42)
})

test('load resolved bare specifier with source', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/node_modules/foo/package.json' ||
        url.href === root + '/node_modules/foo/index.js'
      )
    },

    read(url) {
      if (url.href === root + '/node_modules/foo/package.json') {
        return '{}'
      }

      t.fail()
    }
  })

  const url = await Module.resolve('foo', new URL(root + '/'), { protocol })
  const { exports } = await Module.load(url, 'module.exports = 42', {})

  t.is(exports, 42)
})

test('load .js', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/index.js'
    },

    read(url) {
      if (url.href === root + '/index.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/index.js'), { protocol })

  t.is(exports, 42)
})

test('load .js with pkg.type module', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/package.json' || url.href === root + '/index.js'
    },

    read(url) {
      if (url.href === root + '/index.js') {
        return 'export default 42'
      }

      if (url.href === root + '/package.json') {
        return '{ "type": "module" }'
      }

      t.fail()
    }
  })

  await t.execution(Module.load(new URL(root + '/index.js'), { protocol }))
})

test('load .js with default type', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.js' || url.href === root + '/bar.js'
    },

    read(url) {
      if (url.href === root + '/foo.js') {
        return "export { default } from '/bar.js'"
      }

      if (url.href === root + '/bar.js') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), {
    protocol,
    defaultType: Module.constants.MODULE
  })

  t.is(exports.default, 42)
})

test('load .cjs', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/index.cjs'
    },

    read(url) {
      if (url.href === root + '/index.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/index.cjs'), { protocol })

  t.is(exports, 42)
})

test('load .cjs with bare specifier require', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/node_modules/foo/package.json' ||
        url.href === root + '/node_modules/foo/index.js' ||
        url.href === root + '/index.cjs'
      )
    },

    read(url) {
      if (url.href === root + '/index.cjs') {
        return "module.exports = require('foo')"
      }

      if (url.href === root + '/node_modules/foo/package.json') {
        return '{}'
      }

      if (url.href === root + '/node_modules/foo/index.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/index.cjs'), { protocol })

  t.is(exports, 42)
})

test('load .cjs with .mjs require', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.mjs' || url.href === root + '/foo.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return "const bar = require('/bar')"
      }

      if (url.href === root + '/bar.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  await t.execution(Module.load(new URL(root + '/foo.cjs'), { protocol }))
})

test('load .cjs with top-level await', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/index.cjs'
    },

    read(url) {
      if (url.href === root + '/index.cjs') {
        return 'await 42'
      }

      t.fail()
    }
  })

  await t.exception.all(Module.load(new URL(root + '/index.cjs'), { protocol }), /SyntaxError/)
})

test('load .cjs with top-level await .mjs require', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.mjs' || url.href === root + '/foo.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return "const bar = require('/bar'); bar.default"
      }

      if (url.href === root + '/bar.mjs') {
        return 'export default await 42'
      }

      t.fail()
    }
  })

  await t.exception.all(Module.load(new URL(root + '/foo.cjs'), { protocol }), /ReferenceError/)
})

test('load .cjs with top-level await .mjs require with throw', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.mjs' || url.href === root + '/foo.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return "require('/bar')"
      }

      if (url.href === root + '/bar.mjs') {
        return "await 42; throw new Error('bar')"
      }

      t.fail()
    }
  })

  await t.exception.all(Module.load(new URL(root + '/foo.cjs'), { protocol }), /Error: bar/)
})

test('load .cjs with non-file: URL', async (t) => {
  const root = 'protocol:'

  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.mjs' || url.href === root + '/foo.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return 'module.exports = __filename'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.cjs'), { protocol })

  t.is(exports, '/foo.cjs')
})

test('load .cjs with opaque non-file: URL exposes href as __dirname', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === 'protocol:foo.cjs'
    },

    read(url) {
      if (url.href === 'protocol:foo.cjs') {
        return 'module.exports = __dirname'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL('protocol:foo.cjs'), { protocol })

  t.is(exports, 'protocol:foo.cjs')
})

test('load .mjs', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/index.mjs'
    },

    read(url) {
      if (url.href === root + '/index.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  await t.execution(Module.load(new URL(root + '/index.mjs'), { protocol }))
})

test('load .mjs with import', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.mjs' || url.href === root + '/index.mjs'
    },

    read(url) {
      if (url.href === root + '/index.mjs') {
        return "import foo from '/foo.mjs'"
      }

      if (url.href === root + '/foo.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  await t.execution(Module.load(new URL(root + '/index.mjs'), { protocol }))
})

test('load .mjs with .cjs import', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs' || url.href === root + '/index.mjs'
    },

    read(url) {
      if (url.href === root + '/index.mjs') {
        return "import foo from '/foo.cjs'"
      }

      if (url.href === root + '/foo.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  await t.execution(Module.load(new URL(root + '/index.mjs'), { protocol }))
})

test('load .mjs with named .cjs import', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs' || url.href === root + '/index.mjs'
    },

    read(url) {
      if (url.href === root + '/index.mjs') {
        return "import { foo } from '/foo.cjs'"
      }

      if (url.href === root + '/foo.cjs') {
        return 'exports.foo = 42'
      }

      t.fail()
    }
  })

  await t.execution(Module.load(new URL(root + '/index.mjs'), { protocol }))
})

test('load .mjs with named default .cjs import', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs' || url.href === root + '/index.mjs'
    },

    read(url) {
      if (url.href === root + '/index.mjs') {
        return "import foo from '/foo.cjs'; export default foo"
      }

      if (url.href === root + '/foo.cjs') {
        return 'exports.default = 42'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/index.mjs'), { protocol })

  t.is(exports.default, 42)
})

test('load .mjs with .cjs import with reexports from .cjs import', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/foo.cjs' ||
        url.href === root + '/bar.cjs' ||
        url.href === root + '/index.mjs'
      )
    },

    read(url) {
      if (url.href === root + '/index.mjs') {
        return "import { bar } from '/foo.cjs'"
      }

      if (url.href === root + '/foo.cjs') {
        return "module.exports = require('/bar.cjs')"
      }

      if (url.href === root + '/bar.cjs') {
        return 'exports.bar = 42'
      }

      t.fail()
    }
  })

  await t.execution(Module.load(new URL(root + '/index.mjs'), { protocol }))
})

test('load .mjs with .cjs import with cyclic reexports from .cjs import', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/foo.cjs' ||
        url.href === root + '/bar.cjs' ||
        url.href === root + '/index.mjs'
      )
    },

    read(url) {
      if (url.href === root + '/index.mjs') {
        return "import '/foo.cjs'"
      }

      if (url.href === root + '/foo.cjs') {
        return "module.exports = require('/bar.cjs')"
      }

      if (url.href === root + '/bar.cjs') {
        return "module.exports = require('/foo.cjs')"
      }

      t.fail()
    }
  })

  await t.execution(Module.load(new URL(root + '/index.mjs'), { protocol }))
})

test('load .mjs with .cjs import with reexports from .mjs import', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/foo.cjs' ||
        url.href === root + '/bar.mjs' ||
        url.href === root + '/index.mjs'
      )
    },

    read(url) {
      if (url.href === root + '/index.mjs') {
        return "import { bar } from '/foo.cjs'"
      }

      if (url.href === root + '/foo.cjs') {
        return "module.exports = require('/bar.mjs')"
      }

      if (url.href === root + '/bar.mjs') {
        return 'export const bar = 42'
      }

      t.fail()
    }
  })

  await t.execution(Module.load(new URL(root + '/index.mjs'), { protocol }))
})

test('load .mjs with .cjs import with reexports from .json import', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/foo.cjs' ||
        url.href === root + '/bar.json' ||
        url.href === root + '/index.mjs'
      )
    },

    read(url) {
      if (url.href === root + '/index.mjs') {
        return "import { bar } from '/foo.cjs'"
      }

      if (url.href === root + '/foo.cjs') {
        return "module.exports = require('/bar.json')"
      }

      if (url.href === root + '/bar.json') {
        return '{ "bar": 42 }'
      }

      t.fail()
    }
  })

  await t.execution(Module.load(new URL(root + '/index.mjs'), { protocol }))
})

test('load .mjs with .js import', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.js' || url.href === root + '/index.mjs'
    },

    read(url) {
      if (url.href === root + '/index.mjs') {
        return "import foo from '/foo.js'"
      }

      if (url.href === root + '/foo.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  await t.execution(Module.load(new URL(root + '/index.mjs'), { protocol }))
})

test('load .mjs with missing import', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/index.mjs'
    },

    read(url) {
      if (url.href === root + '/index.mjs') {
        return "import foo from './foo'"
      }

      t.fail()
    }
  })

  await t.exception(Module.load(new URL(root + '/index.mjs'), { protocol }), /MODULE_NOT_FOUND/)
})

test('load .mjs with nested import', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/foo.mjs' ||
        url.href === root + '/bar.mjs' ||
        url.href === root + '/baz.mjs'
      )
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return "import bar from '/bar'; export default 1"
      }

      if (url.href === root + '/bar.mjs') {
        return "import baz from '/baz'; export default 2"
      }

      if (url.href === root + '/baz.mjs') {
        return 'export default 3'
      }

      t.fail()
    }
  })

  await t.execution(Module.load(new URL(root + '/foo.mjs'), { protocol }))
})

test('load .mjs with cyclic import', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.mjs' || url.href === root + '/bar.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return "import bar from '/bar'; export default 1"
      }

      if (url.href === root + '/bar.mjs') {
        return "import foo from '/foo'; export default 2"
      }

      t.fail()
    }
  })

  await t.execution(Module.load(new URL(root + '/foo.mjs'), { protocol }))
})

test('load .mjs with top-level await', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/index.mjs'
    },

    read(url) {
      if (url.href === root + '/index.mjs') {
        return 'await 42'
      }

      t.fail()
    }
  })

  await t.execution(Module.load(new URL(root + '/index.mjs'), { protocol }))
})

test('load .mjs with top-level await .mjs import', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.mjs' || url.href === root + '/foo.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return "import bar from '/bar'"
      }

      if (url.href === root + '/bar.mjs') {
        return 'export default await 42'
      }

      t.fail()
    }
  })

  await t.execution(Module.load(new URL(root + '/foo.mjs'), { protocol }))
})

test('load .mjs with top-level await .mjs import with throw', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.mjs' || url.href === root + '/foo.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return "import '/bar'"
      }

      if (url.href === root + '/bar.mjs') {
        return "await 42; throw new Error('bar')"
      }

      t.fail()
    }
  })

  await t.exception.all(Module.load(new URL(root + '/foo.mjs'), { protocol }), /Error: bar/)
})

test('load .cjs and .mjs from .mjs', async (t) => {
  const order = (global.order = [])

  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/b.mjs' ||
        url.href === root + '/c.cjs' ||
        url.href === root + '/d.mjs' ||
        url.href === root + '/e.cjs' ||
        url.href === root + '/a.mjs'
      )
    },

    read(url) {
      if (url.href === root + '/a.mjs') {
        return "order.push('a.mjs'); import '/b.mjs'; import '/c.cjs'; import '/d.mjs'; import '/e.cjs'"
      }

      if (url.href === root + '/b.mjs') {
        return "order.push('b.mjs')"
      }

      if (url.href === root + '/c.cjs') {
        return "order.push('c.cjs')"
      }

      if (url.href === root + '/d.mjs') {
        return "order.push('d.mjs')"
      }

      if (url.href === root + '/e.cjs') {
        return "order.push('e.cjs')"
      }

      t.fail()
    }
  })

  await Module.load(new URL(root + '/a.mjs'), { protocol })

  delete global.order

  t.alike(order, ['b.mjs', 'c.cjs', 'd.mjs', 'e.cjs', 'a.mjs'])
})

test('load .bundle from .mjs', async (t) => {
  const order = (global.order = [])

  const bundle = new Bundle().write('/main.mjs', "order.push('bundle')", { main: true }).toBuffer()

  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/b.mjs' ||
        url.href === root + '/app.bundle' ||
        url.href === root + '/a.mjs'
      )
    },

    read(url) {
      if (url.href === root + '/a.mjs') {
        return "order.push('a.mjs'); import '/b.mjs'; import '/app.bundle'"
      }

      if (url.href === root + '/b.mjs') {
        return "order.push('b.mjs')"
      }

      if (url.href === root + '/app.bundle') {
        return bundle
      }

      t.fail()
    }
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

  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/b.mjs' ||
        url.href === root + '/app.bundle' ||
        url.href === root + '/a.mjs'
      )
    },

    read(url) {
      if (url.href === root + '/a.mjs') {
        return "import '/b.mjs'; import { foo } from '/app.bundle'; order.push('a.mjs')"
      }

      if (url.href === root + '/b.mjs') {
        return "order.push('b.mjs')"
      }

      if (url.href === root + '/app.bundle') {
        return bundle
      }

      t.fail()
    }
  })

  await Module.load(new URL(root + '/a.mjs'), { protocol })

  delete global.order

  t.alike(order, ['b.mjs', 'lib', 'a.mjs'])
})

test('load .ts', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/index.ts'
    },

    read(url) {
      if (url.href === root + '/index.ts') {
        return 'const a: number = 42; module.exports = a'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/index.ts'), { protocol })

  t.is(exports, 42)
})

test('load .ts, non-erasable', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/index.ts'
    },

    read(url) {
      if (url.href === root + '/index.ts') {
        return 'enum foo {}'
      }

      t.fail()
    }
  })

  await t.exception.all(Module.load(new URL(root + '/index.ts'), { protocol }), /SyntaxError/)
})

test('load .cts', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/index.cts'
    },

    read(url) {
      if (url.href === root + '/index.cts') {
        return 'const a: number = 42; module.exports = a'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/index.cts'), { protocol })

  t.is(exports, 42)
})

test('load .mts', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/index.mts'
    },

    read(url) {
      if (url.href === root + '/index.mts') {
        return 'const a: number = 42; export default a'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/index.mts'), { protocol })

  t.is(exports.default, 42)
})

test('load .json', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/index.json'
    },

    read(url) {
      if (url.href === root + '/index.json') {
        return '42'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/index.json'), { protocol })

  t.is(exports, 42)
})

test('load .cjs with .bare import', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/index.cjs' || url.href === root + '/native.bare'
    },

    read(url) {
      if (url.href === root + '/index.cjs') {
        return "require('./native.bare')"
      }

      t.fail()
    },

    resolve(url) {
      if (url.href === root + '/native.bare') {
        return pathToFileURL(require.addon.resolve('.'))
      }

      t.fail()
    }
  })

  await t.execution(Module.load(new URL(root + '/index.cjs'), { protocol }))
})

test('load .cjs with dynamic .bare import', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/index.cjs' || url.href === root + '/native.bare'
    },

    read(url) {
      if (url.href === root + '/index.cjs') {
        return "import('./native.bare')"
      }

      t.fail()
    },

    resolve(url) {
      if (url.href === root + '/native.bare') {
        return pathToFileURL(require.addon.resolve('.'))
      }

      t.fail()
    }
  })

  await t.execution(Module.load(new URL(root + '/index.cjs'), { protocol }))
})

test('load .mjs with .bare import', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/index.mjs' || url.href === root + '/native.bare'
    },

    read(url) {
      if (url.href === root + '/index.mjs') {
        return "import './native.bare'"
      }

      t.fail()
    },

    resolve(url) {
      if (url.href === root + '/native.bare') {
        return pathToFileURL(require.addon.resolve('.'))
      }

      t.fail()
    }
  })

  await t.execution(Module.load(new URL(root + '/index.mjs'), { protocol }))
})

test('load .mjs with dynamic .bare import', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/index.mjs' || url.href === root + '/native.bare'
    },

    read(url) {
      if (url.href === root + '/index.mjs') {
        return "await import('./native.bare')"
      }

      t.fail()
    },

    resolve(url) {
      if (url.href === root + '/native.bare') {
        return pathToFileURL(require.addon.resolve('.'))
      }

      t.fail()
    }
  })

  await t.execution(Module.load(new URL(root + '/index.mjs'), { protocol }))
})

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

  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/app.bundle'
    },

    read(url) {
      return url.href === root + '/app.bundle' ? bundle : null
    },

    list(url) {
      return url.href === root + '/dir' ? [new URL(root + '/dir/a.txt')] : []
    }
  })

  const { exports } = await Module.load(new URL(root + '/app.bundle'), { protocol })

  const listing = [...exports.listSync(new URL(root + '/dir'))]

  t.alike(
    listing.map((url) => url.href),
    [root + '/dir/a.txt']
  )
})

test('import named exports from .bundle with .mjs main', async (t) => {
  const bundle = new Bundle().write('/foo.mjs', 'export const foo = 42', { main: true }).toBuffer()

  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/app.bundle' || url.href === root + '/index.mjs'
    },

    read(url) {
      if (url.href === root + '/index.mjs') {
        return "import { foo } from '/app.bundle'; export default foo"
      }

      if (url.href === root + '/app.bundle') {
        return bundle
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/index.mjs'), { protocol })

  t.is(exports.default, 42)
})

test('import named exports from .bundle with .cjs main', async (t) => {
  const bundle = new Bundle().write('/foo.cjs', 'exports.foo = 42', { main: true }).toBuffer()

  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/app.bundle' || url.href === root + '/index.mjs'
    },

    read(url) {
      if (url.href === root + '/index.mjs') {
        return "import { foo } from '/app.bundle'; export default foo"
      }

      if (url.href === root + '/app.bundle') {
        return bundle
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/index.mjs'), { protocol })

  t.is(exports.default, 42)
})

test('import reexported names from .bundle with .mjs main', async (t) => {
  const bundle = new Bundle()
    .write('/foo.mjs', "export * from './bar'", { main: true })
    .write('/bar.mjs', 'export const foo = 42')
    .toBuffer()

  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/app.bundle' || url.href === root + '/index.mjs'
    },

    read(url) {
      if (url.href === root + '/index.mjs') {
        return "import { foo } from '/app.bundle'; export default foo"
      }

      if (url.href === root + '/app.bundle') {
        return bundle
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/index.mjs'), { protocol })

  t.is(exports.default, 42)
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

test('load unknown extension', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/index.foo'
    },

    read(url) {
      if (url.href === root + '/index.foo') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/index.foo'), { protocol })

  t.is(exports, 42)
})

test('load unknown extension with default type', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/index.foo'
    },

    read(url) {
      if (url.href === root + '/index.foo') {
        return '42'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/index.foo'), {
    protocol,
    defaultType: Module.constants.JSON
  })

  t.is(exports, 42)
})

test('load .cjs with hashbang', async (t) => {
  await t.execution(Module.load(new URL(root + '/index.cjs'), '#!node', {}))
})

test('load .mjs with hashbang', async (t) => {
  await t.execution(Module.load(new URL(root + '/index.mjs'), '#!node', {}))
})

test('load .cjs with dynamic .mjs import', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.mjs' || url.href === root + '/foo.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return "const bar = import('/bar')"
      }

      if (url.href === root + '/bar.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  await t.execution(Module.load(new URL(root + '/foo.cjs'), { protocol }))
})

test('load .cjs with dynamic .cjs import', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.cjs' || url.href === root + '/foo.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return "const bar = import('/bar')"
      }

      if (url.href === root + '/bar.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  await t.execution(Module.load(new URL(root + '/foo.cjs'), { protocol }))
})

test('load .mjs with dynamic .mjs import', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.mjs' || url.href === root + '/foo.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return "const { default: bar } = await import('/bar')"
      }

      if (url.href === root + '/bar.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  await t.execution(Module.load(new URL(root + '/foo.mjs'), { protocol }))
})

test('load .mjs with dynamic .cjs import', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.cjs' || url.href === root + '/foo.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return "const { default: bar } = await import('/bar')"
      }

      if (url.href === root + '/bar.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  await t.execution(Module.load(new URL(root + '/foo.mjs'), { protocol }))
})

test('load .cjs with static and dynamic .cjs import', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.cjs' || url.href === root + '/foo.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return "require('/bar'); import('/bar')"
      }

      if (url.href === root + '/bar.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  await t.execution(Module.load(new URL(root + '/foo.cjs'), { protocol }))
})

test('load .cjs with static and dynamic .mjs import', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.mjs' || url.href === root + '/foo.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return "require('/bar'); import('/bar')"
      }

      if (url.href === root + '/bar.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  await t.execution(Module.load(new URL(root + '/foo.cjs'), { protocol }))
})

test('dynamic import with a computed specifier', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.mjs' || url.href === root + '/bar.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return "export default import('/bar' + '.mjs')"
      }

      if (url.href === root + '/bar.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  const mod = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  const bar = await mod.exports.default

  t.is(bar.default, 42)
})

test('dynamic import in .mjs uses the graph cache for referrer lookup', async (t) => {
  const cache = Object.create(null)

  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.mjs' || url.href === root + '/foo.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return "export default import('/bar')"
      }

      if (url.href === root + '/bar.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol, cache })
  const bar = await exports.default

  t.is(bar.default, 42)

  t.ok(cache[root + '/foo.mjs'], 'referrer is cached in the graph cache')
})

test('dynamic import in .cjs uses the graph cache for referrer lookup', async (t) => {
  const cache = Object.create(null)

  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.cjs' || url.href === root + '/foo.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return "module.exports = import('/bar')"
      }

      if (url.href === root + '/bar.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.cjs'), { protocol, cache })
  const bar = await exports

  t.is(bar.default, 42)

  t.ok(cache[root + '/foo.cjs'], 'referrer is cached in the graph cache')
})

test('load .cjs with bare specifier require and import map', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.cjs' || url.href === root + '/foo.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return "const bar = require('bar')"
      }

      if (url.href === root + '/bar.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  await t.execution(
    Module.load(new URL(root + '/foo.cjs'), {
      protocol,
      imports: {
        bar: '/bar.cjs'
      }
    })
  )
})

test('load .mjs with bare specifier import and import map', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.mjs' || url.href === root + '/foo.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return "import bar from 'bar'"
      }

      if (url.href === root + '/bar.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  await t.execution(
    Module.load(new URL(root + '/foo.mjs'), {
      protocol,
      imports: {
        bar: '/bar.mjs'
      }
    })
  )
})

test('load .cjs with data: protocol require', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return `module.exports = require('data:text/javascript,${encodeURIComponent('module.exports = 42')}')`
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.cjs'), { protocol })

  t.is(exports, 42)
})

test('load .mjs with data: protocol import', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return `export { default } from 'data:text/javascript,${encodeURIComponent('export default 42')}'`
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.is(exports.default, 42)
})

test('load .cjs with computed data: protocol require', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return `module.exports = require('data:text/javascript,' + '${encodeURIComponent('module.exports = 42')}')`
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.cjs'), { protocol })

  t.is(exports, 42)
})

test('load .mjs with computed data: protocol import', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return `export default await import('data:text/javascript,' + '${encodeURIComponent('export default 42')}')`
      }

      t.fail()
    }
  })

  // A dynamic import can load either a script or a module, and a computed
  // specifier has no attributes to say which one it wants.
  await t.exception.all(
    Module.load(new URL(root + '/foo.mjs'), { protocol }),
    /AMBIGUOUS_MODULE_TYPE/
  )
})

test('load .mjs with computed data: protocol import and type attribute', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return `export default await import('data:text/javascript,' + '${encodeURIComponent('export default 42')}', { with: { type: 'module' } })`
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.is(exports.default.default, 42)
})

test('load .mjs with computed dynamic import and conflicting type attribute', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.mjs' || url.href === root + '/bar.json'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return `
          await import('/bar' + '.json', { with: { type: 'json' } })
          export default await import('/bar' + '.json', { with: { type: 'text' } })
        `
      }

      if (url.href === root + '/bar.json') {
        return '{ "foo": 42 }'
      }

      t.fail()
    }
  })

  // The first import caches the module as JSON, so the second one cannot then
  // have it as text.
  await t.exception.all(Module.load(new URL(root + '/foo.mjs'), { protocol }), /TYPE_INCOMPATIBLE/)
})

test('load .cjs with computed data: protocol import and script type attribute', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return `module.exports = import('data:text/javascript,' + '${encodeURIComponent('module.exports = 42')}', { with: { type: 'script' } })`
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.cjs'), { protocol })

  t.is((await exports).default, 42)
})

test('load .cjs with computed data: protocol require and default type', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return `module.exports = require('data:text/javascript,' + '${encodeURIComponent('module.exports = 42')}')`
      }

      t.fail()
    }
  })

  // A data: URL has no type of its own, so it follows the require that named it
  // rather than the default type, and stays a script.
  const { exports } = await Module.load(new URL(root + '/foo.cjs'), {
    protocol,
    defaultType: Module.constants.MODULE
  })

  t.is(exports, 42)
})

test('load .cjs with absolute require from data: protocol module', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs' || url.href === root + '/bar.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return `module.exports = require("data:text/javascript,${encodeURIComponent(`module.exports = require('${root}/bar.cjs')`)}")`
      }

      if (url.href === root + '/bar.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.cjs'), { protocol })

  t.is(exports, 42)
})

test('load .mjs with absolute import from data: protocol module', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.mjs' || url.href === root + '/bar.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return `export { default } from "data:text/javascript,${encodeURIComponent(`export { default } from '${root}/bar.mjs'`)}"`
      }

      if (url.href === root + '/bar.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.is(exports.default, 42)
})

test('load .cjs with nested data: protocol require', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return `module.exports = require("data:text/javascript,${encodeURIComponent(`module.exports = require("data:text/javascript,${encodeURIComponent('module.exports = 42')}")`)}")`
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.cjs'), { protocol })

  t.is(exports, 42)
})

test('load .mjs with nested data: protocol import', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return `export { default } from "data:text/javascript,${encodeURIComponent(`export { default } from "data:text/javascript,${encodeURIComponent('export default 42')}"`)}"`
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.is(exports.default, 42)
})

test('load .cjs with relative require from data: protocol module', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs' || url.href === root + '/bar.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return `module.exports = require("data:text/javascript,${encodeURIComponent("module.exports = require('./bar.cjs')")}")`
      }

      if (url.href === root + '/bar.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  await t.exception(Module.load(new URL(root + '/foo.cjs'), { protocol }), /MODULE_NOT_FOUND/)
})

test('load .mjs with relative import from data: protocol module', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.mjs' || url.href === root + '/bar.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return `export { default } from "data:text/javascript,${encodeURIComponent("export { default } from './bar.mjs'")}"`
      }

      if (url.href === root + '/bar.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  await t.exception(Module.load(new URL(root + '/foo.mjs'), { protocol }), /MODULE_NOT_FOUND/)
})

test('load .cjs with bare require from data: protocol module', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/foo.cjs' ||
        url.href === root + '/node_modules/bar/package.json' ||
        url.href === root + '/node_modules/bar/index.js'
      )
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return `module.exports = require("data:text/javascript,${encodeURIComponent("module.exports = require('bar')")}")`
      }

      if (url.href === root + '/node_modules/bar/package.json') {
        return '{ "main": "index.js" }'
      }

      if (url.href === root + '/node_modules/bar/index.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  await t.exception(Module.load(new URL(root + '/foo.cjs'), { protocol }), /MODULE_NOT_FOUND/)
})

test('load .mjs with bare import from data: protocol module', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/foo.mjs' ||
        url.href === root + '/node_modules/bar/package.json' ||
        url.href === root + '/node_modules/bar/index.mjs'
      )
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return `export { default } from "data:text/javascript,${encodeURIComponent("export { default } from 'bar'")}"`
      }

      if (url.href === root + '/node_modules/bar/package.json') {
        return '{ "main": "index.mjs" }'
      }

      if (url.href === root + '/node_modules/bar/index.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  await t.exception(Module.load(new URL(root + '/foo.mjs'), { protocol }), /MODULE_NOT_FOUND/)
})

test('load .cjs with builtin require from data: protocol module', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return `module.exports = require("data:text/javascript,${encodeURIComponent("module.exports = require('bar')")}")`
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.cjs'), {
    protocol,
    builtins: { bar: 42 }
  })

  t.is(exports, 42)
})

test('a builtin is served only for a name the builtins own', async (t) => {
  // The resolver's allowlist is the own keys of the builtins, so a name reached
  // only through the prototype chain is not among what was granted.
  const builtins = Object.create({ inherited: 'inherited' })
  builtins.own = 'own'

  const load = (name) => {
    const protocol = new Module.Protocol({
      exists(url) {
        return url.href === root + '/foo.cjs'
      },

      read(url) {
        if (url.href === root + '/foo.cjs') {
          return `module.exports = require(${JSON.stringify('builtin:' + name)})`
        }

        t.fail()
      }
    })

    return Module.load(new URL(root + '/foo.cjs'), { protocol, builtins })
  }

  const { exports } = await load('own')

  t.is(exports, 'own')

  for (const name of ['inherited', 'constructor', '__proto__', 'hasOwnProperty']) {
    await t.exception(load(name), /MODULE_NOT_FOUND/, `'${name}' is not a builtin`)
  }
})

test('load .mjs with builtin import from data: protocol module', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return `export { default } from "data:text/javascript,${encodeURIComponent("export { default } from 'bar'")}"`
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), {
    protocol,
    builtins: { bar: 42 }
  })

  t.is(exports.default, 42)
})

test('load data: protocol entry', async (t) => {
  const { exports } = await Module.load(
    new URL('data:text/javascript,' + encodeURIComponent('module.exports = 42'))
  )

  t.is(exports, 42)
})

test('load data: protocol entry with default type module', async (t) => {
  const { exports } = await Module.load(
    new URL('data:text/javascript,' + encodeURIComponent('export default 42')),
    { defaultType: Module.constants.MODULE }
  )

  t.is(exports.default, 42)
})

test('load data: protocol entry with JSON media type', async (t) => {
  const { exports } = await Module.load(
    new URL('data:application/json,' + encodeURIComponent('{ "foo": 42 }'))
  )

  t.alike(exports, { foo: 42 })
})

test('load data: protocol entry without a media type', async (t) => {
  await t.exception(
    Module.load(new URL('data:,' + encodeURIComponent('module.exports = 42'))),
    /UNKNOWN_DATA_URL_MEDIA_TYPE/
  )
})

test('load .cjs with data: protocol require without a media type', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return `module.exports = require('data:,${encodeURIComponent('module.exports = 42')}')`
      }

      t.fail()
    }
  })

  await t.exception(
    Module.load(new URL(root + '/foo.cjs'), { protocol }),
    /UNKNOWN_DATA_URL_MEDIA_TYPE/
  )
})

test('load .mjs with dynamic data: protocol import without a type attribute', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return `export default await import('data:text/javascript,${encodeURIComponent('export default 42')}')`
      }

      t.fail()
    }
  })

  await t.exception(Module.load(new URL(root + '/foo.mjs'), { protocol }), /AMBIGUOUS_MODULE_TYPE/)
})

test('load .mjs with dynamic data: protocol import with a type attribute', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return `export default await import('data:text/javascript,${encodeURIComponent('export default 42')}', { with: { type: 'module' } })`
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.is(exports.default.default, 42)
})

test('load .mjs with JSON data: protocol import', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return `export { default } from "data:application/json,${encodeURIComponent('{ "foo": 42 }')}"`
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.alike(exports.default, { foo: 42 })
})

test('load .mjs with text data: protocol import and type attribute', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return `import text from "data:text/plain,${encodeURIComponent('hello')}" with { type: 'text' }\nexport default text`
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.is(exports.default, 'hello')
})

test('require.resolve from data: protocol module', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs' || url.href === root + '/bar.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return `module.exports = require("data:text/javascript,${encodeURIComponent(`module.exports = require.resolve('${root}/bar.cjs')`)}")`
      }

      if (url.href === root + '/bar.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.cjs'), { protocol })

  t.is(exports, isWindows ? 'c:\\bar.cjs' : '/bar.cjs')
})

test('require.resolve relative from data: protocol module', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs' || url.href === root + '/bar.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return `module.exports = require("data:text/javascript,${encodeURIComponent("module.exports = require.resolve('./bar.cjs')")}")`
      }

      if (url.href === root + '/bar.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  await t.exception(Module.load(new URL(root + '/foo.cjs'), { protocol }), /MODULE_NOT_FOUND/)
})

test('require.asset from data: protocol module', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs' || url.href === root + '/bar.txt'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return `module.exports = require("data:text/javascript,${encodeURIComponent(`module.exports = require.asset('${root}/bar.txt')`)}")`
      }

      if (url.href === root + '/bar.txt') {
        return 'hello'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.cjs'), { protocol })

  t.is(exports, isWindows ? 'c:\\bar.txt' : '/bar.txt')
})

test('require.asset relative from data: protocol module', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs' || url.href === root + '/bar.txt'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return `module.exports = require("data:text/javascript,${encodeURIComponent("module.exports = require.asset('./bar.txt')")}")`
      }

      if (url.href === root + '/bar.txt') {
        return 'hello'
      }

      t.fail()
    }
  })

  await t.exception(Module.load(new URL(root + '/foo.cjs'), { protocol }), /ASSET_NOT_FOUND/)
})

test('require.addon.resolve relative from data: protocol module', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return `module.exports = require("data:text/javascript,${encodeURIComponent("module.exports = require.addon.resolve('.')")}")`
      }

      t.fail()
    }
  })

  await t.exception(Module.load(new URL(root + '/foo.cjs'), { protocol }), /ADDON_NOT_FOUND/)
})

test('import map with protocol', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.mjs' || url.href === root + '/foo.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return "import bar from 'proto:bar'"
      }

      if (url.href === root + '/bar.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  await t.execution(
    Module.load(new URL(root + '/foo.mjs'), {
      protocol,
      imports: {
        'proto:bar': '/bar.mjs'
      }
    })
  )
})

test('loadSync', (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs' || url.href === root + '/bar.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return "module.exports = require('/bar.cjs')"
      }

      if (url.href === root + '/bar.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  const { exports } = Module.loadSync(new URL(root + '/foo.cjs'), { protocol })

  t.is(exports, 42)
})

test('loadSync with source', (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.cjs'
    },

    read(url) {
      if (url.href === root + '/bar.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  const { exports } = Module.loadSync(
    new URL(root + '/foo.cjs'),
    Buffer.from("module.exports = require('/bar.cjs')"),
    { protocol, cache: Object.create(null) }
  )

  t.is(exports, 42)
})

test('loadSync .mjs', (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  const { exports } = Module.loadSync(new URL(root + '/foo.mjs'), { protocol })

  t.is(exports.default, 42)
})

test('loadSync with string url', (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  const { exports } = Module.loadSync(root + '/foo.cjs', { protocol })

  t.is(exports, 42)
})

test('loadSync throws when protocol read is asynchronous', (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs'
    },

    async read(url) {
      return 'module.exports = 42'
    }
  })

  t.exception(() => Module.loadSync(new URL(root + '/foo.cjs'), { protocol }), {
    code: 'UNEXPECTED_PROMISE'
  })
})

test('loadSync with top-level await returns before evaluation finishes', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return `
          export let done = false
          await new Promise((resolve) => setImmediate(resolve))
          done = true
        `
      }

      t.fail()
    }
  })

  // There is nothing here to await the evaluation on, so the module comes back
  // as soon as evaluation starts.
  const { exports } = Module.loadSync(new URL(root + '/foo.mjs'), { protocol })

  t.is(exports.done, false, 'evaluation has not passed the await yet')

  await new Promise((resolve) => setImmediate(resolve))

  t.is(exports.done, true, 'the live binding reflects the finished evaluation')
})

test('loader importSync', (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/index.js'
    },

    read(url) {
      if (url.href === root + '/index.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  const loader = new Module.Loader({ protocol })

  t.is(loader.importSync(new URL(root + '/index.js')), 42)
})

test('loader linkSync and get', (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/index.cjs'
    },

    read(url) {
      if (url.href === root + '/index.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  const loader = new Module.Loader({ protocol })

  const record = loader.linkSync(new URL(root + '/index.cjs'))

  t.is(loader.get(new URL(root + '/index.cjs')), record)
  t.is(loader.get(new URL(root + '/missing.cjs')), null)
  t.is(loader.main, record)
})

test('loader import', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/index.mjs'
    },

    read(url) {
      if (url.href === root + '/index.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  const loader = new Module.Loader({ protocol })

  const exports = await loader.import(new URL(root + '/index.mjs'))

  t.is(exports.default, 42)
})

test('loader link', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/index.mjs'
    },

    read(url) {
      if (url.href === root + '/index.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  const loader = new Module.Loader({ protocol })

  const record = await loader.link(new URL(root + '/index.mjs'))

  t.is(record.url.href, root + '/index.mjs')
  t.is(loader.get(new URL(root + '/index.mjs')), record)
})

test('loader import with concurrency', async (t) => {
  const protocol = new Module.Protocol({
    async exists(url) {
      return (
        url.href === root + '/a.mjs' || url.href === root + '/b.mjs' || url.href === root + '/c.mjs'
      )
    },

    async read(url) {
      if (url.href === root + '/a.mjs') {
        return "import '/b.mjs'; import '/c.mjs'; export default 42"
      }

      if (url.href === root + '/b.mjs') {
        return 'export default 1'
      }

      if (url.href === root + '/c.mjs') {
        return 'export default 2'
      }

      t.fail()
    }
  })

  const loader = new Module.Loader({ protocol, concurrency: 1 })

  const exports = await loader.import(new URL(root + '/a.mjs'))

  t.is(exports.default, 42)
})

test('loader link with concurrency signals the semaphore on throw', async (t) => {
  const protocol = new Module.Protocol({
    async exists(url) {
      return url.href === root + '/foo.mjs'
    },

    async read(url) {
      throw new Error('foo')
    }
  })

  const loader = new Module.Loader({ protocol, concurrency: 1 })

  await t.exception(loader.link(new URL(root + '/foo.mjs')), /Error: foo/)
})

test('loader addons', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/foo.js' ||
        url.href === root + '/package.json' ||
        url.href === prebuilds + '/foo.bare'
      )
    },

    read(url) {
      if (url.href === root + '/foo.js') {
        return "module.exports = require.addon('.')"
      }

      if (url.href === root + '/package.json') {
        return '{ "name": "foo", "version": "1.2.3" }'
      }

      t.fail()
    },

    resolve(url) {
      if (url.href === prebuilds + '/foo.bare') {
        return pathToFileURL(require.addon.resolve('.'))
      }

      t.fail()
    }
  })

  const resolutions = Object.create(null)

  const loader = new Module.Loader({ protocol, resolutions })

  await loader.link(new URL(root + '/foo.js'))

  t.is(resolutions[root + '/foo.js']['.'], pathToFileURL(require.addon.resolve('.')).href)
})

test('loader addons resolved during evaluation', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/foo.js' ||
        url.href === root + '/dir/package.json' ||
        url.href === root + '/dir/prebuilds/' + host + '/bar.bare'
      )
    },

    read(url) {
      if (url.href === root + '/foo.js') {
        return `module.exports = require.addon('.', new URL('${root}/dir/'))`
      }

      if (url.href === root + '/dir/package.json') {
        return '{ "name": "bar", "version": "1.2.3" }'
      }

      t.fail()
    },

    resolve(url) {
      if (url.href === root + '/dir/prebuilds/' + host + '/bar.bare') {
        return pathToFileURL(require.addon.resolve('.'))
      }

      t.fail()
    }
  })

  const loader = new Module.Loader({ protocol })

  await loader.link(new URL(root + '/foo.js'))

  t.is(loader.get(pathToFileURL(require.addon.resolve('.'))), null)

  await loader.import(new URL(root + '/foo.js'))

  t.ok(loader.get(pathToFileURL(require.addon.resolve('.'))) !== null)
})

test('a caller may not hand a loader the caches it reads into', async (t) => {
  const packages = new Map()
  const prefixes = new Map()

  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/index.js' ||
        url.href === root + '/package.json' ||
        url.href === root + '/foo.txt'
      )
    },

    read(url) {
      if (url.href === root + '/index.js') {
        return "module.exports = require.asset('./foo.txt')"
      }

      if (url.href === root + '/package.json') {
        return '{ "name": "foo" }'
      }

      t.fail()
    }
  })

  const loader = new Module.Loader({ protocol })

  await loader.link(new URL(root + '/index.js'), null, { packages, prefixes })

  t.is(packages.size, 0, 'what this protocol read stays with this loader')
  t.is(prefixes.size, 0)
})

test('a fork that reaches elsewhere reads its own package scope', async (t) => {
  const reads = []

  const wide = new Module.Protocol({
    exists(url) {
      return url.href === root + '/index.js' || url.href === root + '/package.json'
    },

    read(url) {
      reads.push(url.href)

      if (url.href === root + '/index.js') {
        return 'module.exports = 42'
      }

      if (url.href === root + '/package.json') {
        return '{ "name": "wide" }'
      }

      t.fail()
    }
  })

  const narrow = new Module.Protocol({
    exists(url) {
      return url.href === root + '/dep.js' || url.href === root + '/package.json'
    },

    read(url) {
      reads.push(url.href)

      if (url.href === root + '/dep.js') {
        return 'module.exports = 43'
      }

      if (url.href === root + '/package.json') {
        return '{ "name": "narrow" }'
      }

      t.fail()
    }
  })

  const referrer = await Module.load(new URL(root + '/index.js'), { protocol: wide })

  await Module.load(new URL(root + '/dep.js'), { referrer, protocol: narrow })

  t.alike(
    reads.filter((href) => href === root + '/package.json'),
    [root + '/package.json', root + '/package.json'],
    'the manifest is read again through the protocol the fork was given'
  )
})

test('load with asynchronous protocol', async (t) => {
  const protocol = new Module.Protocol({
    async exists(url) {
      return url.href === root + '/bar.mjs' || url.href === root + '/foo.mjs'
    },

    async read(url) {
      if (url.href === root + '/foo.mjs') {
        return "import bar from '/bar.mjs'; export default bar"
      }

      if (url.href === root + '/bar.mjs') {
        return 'export default 42'
      }

      t.fail()
    },

    async resolve(url) {
      return url
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.is(exports.default, 42)
})

test('loader import with asynchronous protocol', async (t) => {
  const protocol = new Module.Protocol({
    async exists(url) {
      return url.href === root + '/dep.cjs' || url.href === root + '/index.cjs'
    },

    async read(url) {
      if (url.href === root + '/index.cjs') {
        return "module.exports = require('/dep.cjs')"
      }

      if (url.href === root + '/dep.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  const loader = new Module.Loader({ protocol })

  t.is(await loader.import(new URL(root + '/index.cjs')), 42)
})

test('resolve with asynchronous protocol', async (t) => {
  const protocol = new Module.Protocol({
    async exists(url) {
      return (
        url.href === root + '/node_modules/foo/package.json' ||
        url.href === root + '/node_modules/foo/index.js'
      )
    },

    async read(url) {
      if (url.href === root + '/node_modules/foo/package.json') {
        return '{}'
      }

      t.fail()
    },

    async resolve(url) {
      return url
    }
  })

  const { href } = await Module.resolve('foo', new URL(root + '/'), { protocol })

  t.is(href, root + '/node_modules/foo/index.js')
})

test('asset with asynchronous protocol', async (t) => {
  const protocol = new Module.Protocol({
    async exists(url) {
      return url.href === root + '/foo.txt'
    }
  })

  const { href } = await Module.resolve('./foo.txt', new URL(root + '/'), 'asset', { protocol })

  t.is(href, root + '/foo.txt')
})

test('resolve missing module with asynchronous protocol', async (t) => {
  const protocol = new Module.Protocol({
    async exists(url) {
      return false
    }
  })

  await t.exception(Module.resolve('foo', new URL(root + '/'), { protocol }), /MODULE_NOT_FOUND/)
})

test('asset missing with asynchronous protocol', async (t) => {
  const protocol = new Module.Protocol({
    async exists(url) {
      return false
    }
  })

  await t.exception(
    Module.resolve('./foo.txt', new URL(root + '/'), 'asset', { protocol }),
    /ASSET_NOT_FOUND/
  )
})

test('resolve asset directory through protocol list', async (t) => {
  const protocol = new Module.Protocol({
    *list(url) {
      if (url.href === root + '/assets') yield new URL(root + '/assets/foo.txt')
    }
  })

  const { href } = await Module.resolve('./assets', new URL(root + '/'), 'asset', { protocol })

  t.is(href, root + '/assets')
})

test('resolve asset directory synchronously through protocol list', (t) => {
  const protocol = new Module.Protocol({
    *list(url) {
      if (url.href === root + '/assets') yield new URL(root + '/assets/foo.txt')
    }
  })

  const { href } = Module.resolveSync('./assets', new URL(root + '/'), 'asset', { protocol })

  t.is(href, root + '/assets')
})

test('resolve asset directory through an asynchronous protocol list', async (t) => {
  const protocol = new Module.Protocol({
    async *list(url) {
      if (url.href === root + '/assets') yield new URL(root + '/assets/foo.txt')
    }
  })

  const { href } = await Module.resolve('./assets', new URL(root + '/'), 'asset', { protocol })

  t.is(href, root + '/assets')
})

test('resolve asset directory synchronously through an asynchronous protocol list', (t) => {
  const protocol = new Module.Protocol({
    async *list(url) {
      if (url.href === root + '/assets') yield new URL(root + '/assets/foo.txt')
    }
  })

  t.exception(() => Module.resolveSync('./assets', new URL(root + '/'), 'asset', { protocol }), {
    code: 'UNEXPECTED_PROMISE'
  })
})

test('resolve builtin with asynchronous protocol', async (t) => {
  const builtins = { foo: 42 }

  const protocol = new Module.Protocol({
    async exists(url) {
      return false
    }
  })

  const { href } = await Module.resolve('foo', new URL(root + '/'), { builtins, protocol })

  t.is(href, 'builtin:foo')
})

test('linkSync throws when protocol exists is asynchronous', (t) => {
  const protocol = new Module.Protocol({
    async exists(url) {
      return true
    },

    read(url) {
      return 'module.exports = 42'
    }
  })

  const loader = new Module.Loader({ protocol })

  t.exception(() => loader.linkSync(new URL(root + '/index.js')), /UNEXPECTED_PROMISE/)
})

test('linkSync throws when protocol read is asynchronous', (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/index.js'
    },

    async read(url) {
      return 'module.exports = 42'
    }
  })

  const loader = new Module.Loader({ protocol })

  t.exception(() => loader.linkSync(new URL(root + '/index.js')), /UNEXPECTED_PROMISE/)
})

test('linkSync throws when protocol resolve is asynchronous', (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/index.js' || url.href === root + '/dep.js'
    },

    read(url) {
      if (url.href === root + '/index.js') {
        return "module.exports = require('./dep')"
      }

      if (url.href === root + '/dep.js') {
        return 'module.exports = 42'
      }

      t.fail()
    },

    async resolve(url) {
      return url
    }
  })

  const loader = new Module.Loader({ protocol })

  t.exception(() => loader.linkSync(new URL(root + '/index.js')), /UNEXPECTED_PROMISE/)
})

test('linkSync throws when protocol list is asynchronous', (t) => {
  const protocol = new Module.Protocol({
    existsSync(url) {
      return url.href === root + '/index.js' || url.href === root + '/foo.txt'
    },

    readSync(url) {
      if (url.href === root + '/index.js') {
        return "module.exports = require.asset('./foo.txt')"
      }

      if (url.href === root + '/foo.txt') {
        return 'hello'
      }

      t.fail()
    },

    async *list(url) {
      yield new URL(root + '/foo.txt')
    }
  })

  const loader = new Module.Loader({ protocol })

  t.exception(() => loader.importSync(new URL(root + '/index.js')), /UNEXPECTED_PROMISE/)
})

test('linkSync uses synchronous protocol variants when provided', (t) => {
  const protocol = new Module.Protocol({
    async exists(url) {
      t.fail()
    },

    existsSync(url) {
      return url.href === root + '/index.js' || url.href === root + '/dep.js'
    },

    async read(url) {
      t.fail()
    },

    readSync(url) {
      if (url.href === root + '/index.js') {
        return "module.exports = require('./dep')"
      }

      if (url.href === root + '/dep.js') {
        return 'module.exports = 42'
      }

      t.fail()
    },

    async resolve(url) {
      t.fail()
    },

    resolveSync(url) {
      return url
    }
  })

  const loader = new Module.Loader({ protocol })

  t.is(loader.importSync(new URL(root + '/index.js')), 42)
})

test('link uses asynchronous protocol variants when both are provided', async (t) => {
  const protocol = new Module.Protocol({
    async exists(url) {
      return url.href === root + '/index.js'
    },

    existsSync(url) {
      t.fail()
    },

    async read(url) {
      return 'module.exports = 42'
    },

    readSync(url) {
      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/index.js'), { protocol })

  t.is(exports, 42)
})

test('protocol version', (t) => {
  const kind = Symbol.for('bare.module.protocol.kind')

  const protocol = new Module.Protocol()

  t.is(protocol[kind], Module.Protocol[kind], 'an instance reports the version of its class')
  t.is(protocol.extend({})[kind], Module.Protocol[kind], 'so does an extended protocol')
})

test('an extended protocol applies an override to both halves of a pair', (t) => {
  const url = new URL(root + '/index.js')

  // A context that answers both halves itself, so nothing falls back to the
  // defaults on `ModuleProtocol.prototype`.
  const context = new Module.Protocol({
    resolve: () => new URL(root + '/context'),
    resolveSync: () => new URL(root + '/context'),
    exists: () => true,
    existsSync: () => true,
    read: () => 'context',
    readSync: () => 'context',
    list: () => [new URL(root + '/context')],
    listSync: () => [new URL(root + '/context')]
  })

  const overrides = {
    resolve: () => new URL(root + '/override'),
    resolveSync: () => new URL(root + '/override'),
    exists: () => false,
    existsSync: () => false,
    read: () => 'override',
    readSync: () => 'override',
    list: () => [new URL(root + '/override')],
    listSync: () => [new URL(root + '/override')]
  }

  // What the context answers, what an override answers, and what the default on
  // `ModuleProtocol.prototype` answers once nothing is inherited.
  const answers = {
    resolve: [root + '/context', root + '/override', url.href],
    exists: [true, false, false],
    read: ['context', 'override', null],
    list: [root + '/context', root + '/override', undefined]
  }

  const read = {
    resolve: (value) => value.href,
    exists: (value) => value,
    read: (value) => value,
    list: (value) => [...value].map((url) => url.href)[0]
  }

  for (const [name, syncName] of [
    ['resolve', 'resolveSync'],
    ['exists', 'existsSync'],
    ['read', 'readSync'],
    ['list', 'listSync']
  ]) {
    const [inherited, overridden, fallback] = answers[name]

    const asyncOverride = context.extend({ [name]: overrides[name] })

    t.is(read[name](asyncOverride[name](url)), overridden)
    t.is(
      read[name](asyncOverride[syncName](url)),
      overridden,
      `overriding ${name} governs ${syncName}`
    )

    const syncOverride = context.extend({ [syncName]: overrides[syncName] })

    t.is(read[name](syncOverride[syncName](url)), overridden)
    t.is(
      read[name](syncOverride[name](url)),
      fallback,
      `overriding ${syncName} leaves ${name} at the default rather than ${inherited}`
    )
  }
})

test('an extended protocol cannot be read past on the path it did not name', (t) => {
  const sources = {
    [root + '/public/index.js']: `module.exports = require('/private/key.js')`,
    [root + '/private/key.js']: `module.exports = 'secret'`
  }

  const context = new Module.Protocol({
    exists: (url) => url.href in sources,
    existsSync: (url) => url.href in sources,
    read: (url) => sources[url.href] || null,
    readSync: (url) => sources[url.href] || null
  })

  const protocol = context.extend({
    exists(context, url) {
      return url.href.startsWith(root + '/public/') && context.exists(url)
    },

    read(context, url) {
      return url.href.startsWith(root + '/public/') ? context.read(url) : null
    }
  })

  t.exception(
    () => Module.loadSync(new URL(root + '/public/index.js'), { protocol }),
    /MODULE_NOT_FOUND/,
    'the restriction holds on the synchronous path'
  )
})

test('load .bundle through a protocol with synchronous methods', (t) => {
  const bundle = new Bundle()
    .write('/foo.js', "module.exports = require('./bar')", { main: true })
    .write('/bar.js', 'module.exports = 42')
    .toBuffer()

  const sources = { [root + '/app.bundle']: bundle }

  const protocol = new Module.Protocol({
    exists: (url) => url.href in sources,
    existsSync: (url) => url.href in sources,
    read: (url) => sources[url.href] || null,
    readSync: (url) => sources[url.href] || null
  })

  const { exports } = Module.loadSync(new URL(root + '/app.bundle'), { protocol })

  t.is(exports, 42)
})

test('Module.Protocol.isProtocol', (t) => {
  const kind = Symbol.for('bare.module.protocol.kind')

  t.ok(Module.Protocol.isProtocol(new Module.Protocol()))
  t.ok(Module.Protocol.isProtocol(new Module.Protocol().extend({})))
  t.ok(
    Module.Protocol.isProtocol({ [kind]: Module.Protocol[kind] }),
    'another copy of this version is a protocol'
  )
  t.absent(Module.Protocol.isProtocol({ [kind]: Module.Protocol[kind] + 1 }))
  t.absent(Module.Protocol.isProtocol({ exists() {}, read() {} }))
  t.absent(Module.Protocol.isProtocol(null))
})

test('load with a protocol of another version', async (t) => {
  const kind = Symbol.for('bare.module.protocol.kind')

  // A protocol from a module system that speaks a different interface. Its
  // methods may look right and still mean something else.
  const protocol = {
    [kind]: Module.Protocol[kind] + 1,

    exists(url) {
      t.fail()
    },

    read(url) {
      t.fail()
    }
  }

  await t.exception(Module.load(new URL(root + '/foo.cjs'), { protocol }), {
    code: 'PROTOCOL_INCOMPATIBLE'
  })
})

test('load with a protocol from another copy of this version', async (t) => {
  const kind = Symbol.for('bare.module.protocol.kind')

  const protocol = {
    [kind]: Module.Protocol[kind],

    exists(url) {
      return url.href === root + '/foo.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return 'module.exports = 42'
      }

      return null
    },

    existsSync(url) {
      return this.exists(url)
    },

    readSync(url) {
      return this.read(url)
    },

    resolve(url) {
      return url
    },

    resolveSync(url) {
      return url
    },

    list(url) {
      return []
    },

    listSync(url) {
      return []
    }
  }

  const { exports } = await Module.load(new URL(root + '/foo.cjs'), { protocol })

  t.is(exports, 42)
})

test('load with something that is not a protocol', async (t) => {
  await t.exception(
    Module.load(new URL(root + '/foo.cjs'), { protocol: { exists() {}, read() {} } }),
    { code: 'PROTOCOL_INCOMPATIBLE' }
  )
})

test('loader with a protocol of another version', (t) => {
  const kind = Symbol.for('bare.module.protocol.kind')

  t.exception(() => new Module.Loader({ protocol: { [kind]: Module.Protocol[kind] + 1 } }), {
    code: 'PROTOCOL_INCOMPATIBLE'
  })
})

test('createRequire with a protocol of another version', (t) => {
  const kind = Symbol.for('bare.module.protocol.kind')

  t.exception(() => Module.createRequire(root + '/foo.cjs', { protocol: { [kind]: -1 } }), {
    code: 'PROTOCOL_INCOMPATIBLE'
  })
})

test('protocol uses asynchronous variants for static imports and synchronous variants for computed specifiers', async (t) => {
  const protocol = new Module.Protocol({
    async exists(url) {
      return url.href === root + '/index.js' || url.href === root + '/dep.js'
    },

    existsSync(url) {
      return url.href === root + '/lazy.js'
    },

    async read(url) {
      if (url.href === root + '/index.js') {
        return "const dep = require('./dep'); const lazy = require('./' + 'lazy'); module.exports = dep + lazy"
      }

      if (url.href === root + '/dep.js') {
        return 'module.exports = 2'
      }

      t.fail()
    },

    readSync(url) {
      if (url.href === root + '/lazy.js') {
        return 'module.exports = 40'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/index.js'), { protocol })

  t.is(exports, 42)
})

test('require.main', async (t) => {
  const cache = Object.create(null)

  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.js' || url.href === root + '/foo.js'
    },

    read(url) {
      if (url.href === root + '/foo.js') {
        return "module.exports = require.main; require('/bar')"
      }

      if (url.href === root + '/bar.js') {
        return 'module.exports = require.main'
      }

      t.fail()
    }
  })

  const foo = await Module.load(new URL(root + '/foo.js'), { protocol, cache })
  const bar = await Module.load(new URL(root + '/bar.js'), { protocol, cache })

  t.is(foo.exports, foo)
  t.is(bar.exports, foo)
})

test('require.cache', async (t) => {
  const cache = Object.create(null)

  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.js'
    },

    read(url) {
      if (url.href === root + '/foo.js') {
        return 'module.exports = require.cache'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol, cache })

  t.is(exports, cache)
})

test('require.resolve', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.js' || url.href === root + '/foo.js'
    },

    read(url) {
      if (url.href === root + '/foo.js') {
        return "module.exports = require.resolve('./bar')"
      }

      if (url.href === root + '/bar.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, isWindows ? 'c:\\bar.js' : '/bar.js')
})

test('require.resolve with parentURL', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.js' || url.href === root + '/dir/bar.js'
    },

    read(url) {
      if (url.href === root + '/foo.js') {
        return `module.exports = require.resolve('./bar.js', '${root}/dir/')`
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, isWindows ? 'c:\\dir\\bar.js' : '/dir/bar.js')
})

test('require.resolve with filesystem path parentURL', async (t) => {
  const dir = isWindows ? 'c:\\dir\\' : '/dir/'

  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.js' || url.href === root + '/dir/bar.js'
    },

    read(url) {
      if (url.href === root + '/foo.js') {
        return `module.exports = require.resolve('./bar.js', ${JSON.stringify(dir)})`
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, isWindows ? 'c:\\dir\\bar.js' : '/dir/bar.js')
})

test('require.asset with parentURL', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.js' || url.href === root + '/dir/bar.txt'
    },

    read(url) {
      if (url.href === root + '/foo.js') {
        return `module.exports = require.asset('./bar.txt', new URL('${root}/dir/'))`
      }

      if (url.href === root + '/dir/bar.txt') {
        return 'hello'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, isWindows ? 'c:\\dir\\bar.txt' : '/dir/bar.txt')
})

test('require.addon', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/foo.js' ||
        url.href === root + '/package.json' ||
        url.href === prebuilds + '/foo.bare'
      )
    },

    read(url) {
      if (url.href === root + '/foo.js') {
        return "module.exports = require.addon('.')"
      }

      if (url.href === root + '/package.json') {
        return '{ "name": "foo", "version": "1.2.3" }'
      }

      t.fail()
    },

    resolve(url) {
      if (url.href === prebuilds + '/foo.bare') {
        return pathToFileURL(require.addon.resolve('.'))
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.alike(Object.keys(exports), Object.keys(require.addon('.')))
})

test('require.addon with parentURL', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/foo.js' ||
        url.href === root + '/dir/package.json' ||
        url.href === root + '/dir/prebuilds/' + host + '/bar.bare'
      )
    },

    read(url) {
      if (url.href === root + '/foo.js') {
        return `module.exports = require.addon('.', new URL('${root}/dir/'))`
      }

      if (url.href === root + '/dir/package.json') {
        return '{ "name": "bar", "version": "1.2.3" }'
      }

      t.fail()
    },

    resolve(url) {
      if (url.href === root + '/dir/prebuilds/' + host + '/bar.bare') {
        return pathToFileURL(require.addon.resolve('.'))
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.alike(Object.keys(exports), Object.keys(require.addon('.')))
})

test('require.addon is cached', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/foo.js' ||
        url.href === root + '/package.json' ||
        url.href === prebuilds + '/foo.bare'
      )
    },

    read(url) {
      if (url.href === root + '/foo.js') {
        return "module.exports = require.addon('.') === require.addon('.')"
      }

      if (url.href === root + '/package.json') {
        return '{ "name": "foo", "version": "1.2.3" }'
      }

      t.fail()
    },

    resolve(url) {
      if (url.href === prebuilds + '/foo.bare') {
        return pathToFileURL(require.addon.resolve('.'))
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, true)
})

test('require.addon.host', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.js'
    },

    read(url) {
      if (url.href === root + '/foo.js') {
        return 'module.exports = require.addon.host'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, host)
})

test('require.addon.resolve', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/foo.js' ||
        url.href === root + '/package.json' ||
        url.href === prebuilds + '/foo.bare'
      )
    },

    read(url) {
      if (url.href === root + '/foo.js') {
        return "module.exports = require.addon.resolve('.')"
      }

      if (url.href === root + '/package.json') {
        return '{ "name": "foo", "version": "1.2.3" }'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(
    exports,
    isWindows ? 'c:\\prebuilds\\' + host + '\\foo.bare' : '/prebuilds/' + host + '/foo.bare'
  )
})

test('require.addon.resolve with parentURL', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/foo.js' ||
        url.href === root + '/dir/package.json' ||
        url.href === root + '/dir/prebuilds/' + host + '/bar.bare'
      )
    },

    read(url) {
      if (url.href === root + '/foo.js') {
        return `module.exports = require.addon.resolve('.', new URL('${root}/dir/'))`
      }

      if (url.href === root + '/dir/package.json') {
        return '{ "name": "bar", "version": "1.2.3" }'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(
    exports,
    isWindows
      ? 'c:\\dir\\prebuilds\\' + host + '\\bar.bare'
      : '/dir/prebuilds/' + host + '/bar.bare'
  )
})

test('import.meta', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return 'export default import.meta'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })
  const { default: meta } = exports

  t.is(meta.url, root + '/foo.mjs')
  t.is(meta.main, true)
  t.is(meta.dirname, isWindows ? 'c:\\' : '/')
  t.is(meta.filename, isWindows ? 'c:\\foo.mjs' : '/foo.mjs')
})

test('import.meta.cache', async (t) => {
  const cache = Object.create(null)

  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return 'export default import.meta.cache'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol, cache })

  t.is(exports.default, cache)
})

test('import.meta.cache is require.cache of the same graph', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.mjs' || url.href === root + '/bar.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return `
          import bar from '/bar.cjs'
          export default import.meta.cache === bar
        `
      }

      if (url.href === root + '/bar.cjs') {
        return 'module.exports = require.cache'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.is(exports.default, true)
})

test('import.meta.resolve', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.mjs' || url.href === root + '/foo.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return "export default import.meta.resolve('./bar')"
      }

      if (url.href === root + '/bar.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.is(exports.default, root + '/bar.mjs')
})

test('import.meta.addon', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/foo.mjs' ||
        url.href === root + '/package.json' ||
        url.href === prebuilds + '/foo.bare'
      )
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return "export default import.meta.addon('.')"
      }

      if (url.href === root + '/package.json') {
        return '{ "name": "foo", "version": "1.2.3" }'
      }

      t.fail()
    },

    resolve(url) {
      if (url.href === prebuilds + '/foo.bare') {
        return pathToFileURL(require.addon.resolve('.'))
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.alike(Object.keys(exports.default), Object.keys(require.addon('.')))
})

test('import.meta.addon is cached', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/foo.mjs' ||
        url.href === root + '/package.json' ||
        url.href === prebuilds + '/foo.bare'
      )
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return "export default import.meta.addon('.') === import.meta.addon('.')"
      }

      if (url.href === root + '/package.json') {
        return '{ "name": "foo", "version": "1.2.3" }'
      }

      t.fail()
    },

    resolve(url) {
      if (url.href === prebuilds + '/foo.bare') {
        return pathToFileURL(require.addon.resolve('.'))
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.is(exports.default, true)
})

test('import.meta.addon.host', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return 'export default import.meta.addon.host'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.is(exports.default, host)
})

test('import.meta.addon.resolve', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/foo.mjs' ||
        url.href === root + '/package.json' ||
        url.href === prebuilds + '/foo.bare'
      )
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return "export default import.meta.addon.resolve('.')"
      }

      if (url.href === root + '/package.json') {
        return '{ "name": "foo", "version": "1.2.3" }'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.is(exports.default, root + '/prebuilds/' + host + '/foo.bare')
})

test('record filename, dirname, id, and path', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/dir/foo.cjs'
    },

    read(url) {
      if (url.href === root + '/dir/foo.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  const foo = await Module.load(new URL(root + '/dir/foo.cjs'), { protocol })

  t.is(foo.filename, isWindows ? 'c:\\dir\\foo.cjs' : '/dir/foo.cjs')
  t.is(foo.dirname, isWindows ? 'c:\\dir' : '/dir')
  t.is(foo.id, foo.filename)
  t.is(foo.path, foo.dirname)
})

test('import attributes', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar' || url.href === root + '/foo.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return "export { default } from '/bar' with { type: 'json' }"
      }

      if (url.href === root + '/bar') {
        return '{ "hello": "world" }'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.alike(exports.default, { hello: 'world' })
})

test('dynamic import attributes', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar' || url.href === root + '/foo.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return "export default await import('/bar', { with: { type: 'json' } })"
      }

      if (url.href === root + '/bar') {
        return '{ "hello": "world" }'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.alike(exports.default.default, { hello: 'world' })
})

test('dynamic import from an unregistered referrer is refused', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/secret.mjs'
    },

    read(url) {
      return 'export default 42'
    }
  })

  // A loader that could serve the specifier, but was never handed to whoever
  // is importing it.
  new Module.Loader({ protocol })

  const context = createContext()

  const fn = binding.createFunction(
    context,
    root + '/index.js',
    [],
    `return import('${root}/secret.mjs')`,
    0
  )

  t.is(await fn(), undefined, 'the import reaches no loader')
})

test('require attributes', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar' || url.href === root + '/foo.js'
    },

    read(url) {
      if (url.href === root + '/foo.js') {
        return "module.exports = require('/bar', { with: { type: 'json' } })"
      }

      if (url.href === root + '/bar') {
        return '{ "hello": "world" }'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.alike(exports, { hello: 'world' })
})

test('createRequire', (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/dir/bar.js'
    },

    read(url) {
      if (url.href === root + '/dir/bar.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  const require = Module.createRequire(root + '/dir/foo.js', { protocol })

  t.is(require('./bar'), 42)
})

test('createRequire with default type', (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/dir/bar.js'
    },

    read(url) {
      if (url.href === root + '/dir/bar.js') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  const require = Module.createRequire(root + '/dir/foo.js', {
    protocol,
    defaultType: Module.constants.MODULE
  })

  t.is(require('./bar').default, 42)
})

test('createRequire with a filesystem path', (t) => {
  const require = Module.createRequire(isWindows ? 'c:\\dir\\foo.js' : '/dir/foo.js')

  t.is(typeof require, 'function')
})

test('createRequire with referrer', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/dir/foo.cjs' || url.href === root + '/dir/bar.js'
    },

    read(url) {
      if (url.href === root + '/dir/foo.cjs') {
        return 'module.exports = 1'
      }

      if (url.href === root + '/dir/bar.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  const foo = await Module.load(new URL(root + '/dir/foo.cjs'), { protocol })

  const require = Module.createRequire(null, { referrer: foo })

  t.is(require('./bar'), 42)
})

test('main in package.json', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/package.json' || url.href === root + '/foo.js'
    },

    read(url) {
      if (url.href === root + '/package.json') {
        return '{ "main": "foo.js" }'
      }

      t.fail()
    }
  })

  const { href } = await Module.resolve('/', new URL(root + '/'), { protocol })

  t.is(href, root + '/foo.js')
})

test('exports in package.json', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/package.json' || url.href === root + '/foo.js'
    },

    read(url) {
      if (url.href === root + '/package.json') {
        return '{ "exports": "./foo.js" }'
      }

      t.fail()
    }
  })

  const { href } = await Module.resolve('/', new URL(root + '/'), { protocol })

  t.is(href, root + '/foo.js')
})

test('conditional exports in package.json', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/package.json' ||
        url.href === root + '/foo.cjs' ||
        url.href === root + '/foo.mjs'
      )
    },

    read(url) {
      if (url.href === root + '/package.json') {
        return '{ "exports": { "require": "./foo.cjs", "import": "./foo.mjs" } }'
      }

      t.fail()
    }
  })

  const { href: cjs } = await Module.resolve('/', new URL(root + '/'), { protocol })
  const { href: mjs } = await Module.resolve('/', new URL(root + '/'), 'import', { protocol })

  t.is(cjs, root + '/foo.cjs')
  t.is(mjs, root + '/foo.mjs')
})

test('conditional exports in package.json, array of conditions', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/package.json' ||
        url.href === root + '/foo.cjs' ||
        url.href === root + '/foo.mjs'
      )
    },

    read(url) {
      if (url.href === root + '/package.json') {
        return '{ "exports": [{ "import": "./foo.mjs" }, { "require": "./foo.cjs" }] }'
      }

      t.fail()
    }
  })

  const { href: cjs } = await Module.resolve('/', new URL(root + '/'), { protocol })
  const { href: mjs } = await Module.resolve('/', new URL(root + '/'), 'import', { protocol })

  t.is(cjs, root + '/foo.cjs')
  t.is(mjs, root + '/foo.mjs')
})

test('conditional exports in package.json, runtime condition', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/package.json' ||
        url.href === root + '/foo.bare.js' ||
        url.href === root + '/foo.node.js'
      )
    },

    read(url) {
      if (url.href === root + '/package.json') {
        return '{ "exports": { "bare": "./foo.bare.js", "node": "./foo.node.js" } }'
      }

      t.fail()
    }
  })

  const { href } = await Module.resolve('/', new URL(root + '/'), { protocol })

  t.is(href, root + '/foo.bare.js')
})

test('conditional exports in package.json, platform condition', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/package.json' ||
        url.href === root + '/foo.darwin.js' ||
        url.href === root + '/foo.linux.js' ||
        url.href === root + '/foo.win32.js'
      )
    },

    read(url) {
      if (url.href === root + '/package.json') {
        return '{ "exports": { "darwin": "./foo.darwin.js", "linux": "./foo.linux.js", "win32": "./foo.win32.js" } }'
      }

      t.fail()
    }
  })

  const { href } = await Module.resolve('/', new URL(root + '/'), { protocol })

  t.is(href, root + '/foo.' + Bare.platform + '.js')
})

test('conditional exports in package.json, architecture condition', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/package.json' ||
        url.href === root + '/foo.arm64.js' ||
        url.href === root + '/foo.x64.js'
      )
    },

    read(url) {
      if (url.href === root + '/package.json') {
        return '{ "exports": { "arm64": "./foo.arm64.js", "x64": "./foo.x64.js" } }'
      }

      t.fail()
    }
  })

  const { href } = await Module.resolve('/', new URL(root + '/'), { protocol })

  t.is(href, root + '/foo.' + Bare.arch + '.js')
})

test('exports in node_modules', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/node_modules/foo/package.json' ||
        url.href === root + '/node_modules/foo/foo.js'
      )
    },

    read(url) {
      if (url.href === root + '/node_modules/foo/package.json') {
        return '{ "exports": "./foo.js" }'
      }

      t.fail()
    }
  })

  const { href } = await Module.resolve('foo', new URL(root + '/'), { protocol })

  t.is(href, root + '/node_modules/foo/foo.js')
})

test('import unexported module in node_modules', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/node_modules/foo/package.json' ||
        url.href === root + '/node_modules/foo/foo.js' ||
        url.href === root + '/node_modules/foo/bar.js'
      )
    },

    read(url) {
      if (url.href === root + '/node_modules/foo/package.json') {
        return '{ "exports": "./foo.js" }'
      }

      t.fail()
    }
  })

  await t.exception(
    Module.resolve('foo/bar', new URL(root + '/'), { protocol }),
    /PACKAGE_PATH_NOT_EXPORTED/
  )
})

test('imports in package.json', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/package.json' ||
        url.href === root + '/baz.js' ||
        url.href === root + '/foo.js'
      )
    },

    read(url) {
      if (url.href === root + '/package.json') {
        return '{ "imports": { "bar": "./baz.js" } }'
      }

      if (url.href === root + '/foo.js') {
        return "const bar = require('bar')"
      }

      if (url.href === root + '/baz.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  await t.execution(Module.load(new URL(root + '/foo.js'), { protocol }))
})

test('imports in package.json, no match', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/package.json' ||
        url.href === root + '/baz.js' ||
        url.href === root + '/foo.js'
      )
    },

    read(url) {
      if (url.href === root + '/package.json') {
        return '{ "imports": { "bar": "./baz.js" } }'
      }

      if (url.href === root + '/foo.js') {
        return "const bar = require('./baz')"
      }

      if (url.href === root + '/baz.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  await t.execution(Module.load(new URL(root + '/foo.js'), { protocol }))
})

test('conditional imports in package.json, require', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/package.json' ||
        url.href === root + '/baz.cjs' ||
        url.href === root + '/baz.mjs' ||
        url.href === root + '/foo.cjs'
      )
    },

    read(url) {
      if (url.href === root + '/package.json') {
        return '{ "imports": { "bar": { "require": "./baz.cjs", "import": "./baz.mjs" } } }'
      }

      if (url.href === root + '/foo.cjs') {
        return "const bar = require('bar')"
      }

      if (url.href === root + '/baz.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  await t.execution(Module.load(new URL(root + '/foo.cjs'), { protocol }))
})

test('conditional imports in package.json, import', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/package.json' ||
        url.href === root + '/baz.cjs' ||
        url.href === root + '/baz.mjs' ||
        url.href === root + '/foo.mjs'
      )
    },

    read(url) {
      if (url.href === root + '/package.json') {
        return '{ "imports": { "bar": { "require": "./baz.cjs", "import": "./baz.mjs" } } }'
      }

      if (url.href === root + '/foo.mjs') {
        return "import bar from 'bar'"
      }

      if (url.href === root + '/baz.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  await t.execution(Module.load(new URL(root + '/foo.mjs'), { protocol }))
})

test('conditional imports in package.json, asset', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/package.json' ||
        url.href === root + '/bar.txt' ||
        url.href === root + '/foo.cjs'
      )
    },

    read(url) {
      if (url.href === root + '/package.json') {
        return '{ "imports": { "bar": { "asset": "./bar.txt" } } }'
      }

      if (url.href === root + '/foo.cjs') {
        return "module.exports = require.asset('bar')"
      }

      if (url.href === root + '/bar.txt') {
        return 'hello world'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.cjs'), { protocol })

  t.is(exports, isWindows ? 'c:\\bar.txt' : '/bar.txt')
})

test('conditional imports in package.json, asset and default', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/package.json' ||
        url.href === root + '/bar.txt' ||
        url.href === root + '/bar.js' ||
        url.href === root + '/foo.cjs'
      )
    },

    read(url) {
      if (url.href === root + '/package.json') {
        return '{ "imports": { "bar": { "asset": "./bar.txt", "default": "./bar.js" } } }'
      }

      if (url.href === root + '/foo.cjs') {
        return "module.exports = [require.asset('bar'), require('bar')]"
      }

      if (url.href === root + '/bar.txt') {
        return 'hello world'
      }

      if (url.href === root + '/bar.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.cjs'), { protocol })

  t.alike(exports, [isWindows ? 'c:\\bar.txt' : '/bar.txt', 42])
})

test('conditional imports in package.json, asset and require without default', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/package.json' ||
        url.href === root + '/bar.txt' ||
        url.href === root + '/bar.js' ||
        url.href === root + '/foo.cjs'
      )
    },

    read(url) {
      if (url.href === root + '/package.json') {
        return '{ "imports": { "bar": { "asset": "./bar.txt" } } }'
      }

      if (url.href === root + '/foo.cjs') {
        return "module.exports = require('bar')"
      }

      if (url.href === root + '/bar.txt') {
        return 'hello world'
      }

      if (url.href === root + '/bar.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  await t.exception(Module.load(new URL(root + '/foo.cjs'), { protocol }), /MODULE_NOT_FOUND/)
})

test('resolve a specifier without a matching condition or default', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/package.json' ||
        url.href === root + '/bar.js' ||
        url.href === root + '/bar.txt' ||
        url.href === root + '/foo.cjs'
      )
    },

    read(url) {
      if (url.href === root + '/package.json') {
        return '{ "imports": { "bar": { "require": "./bar.js", "asset": "./bar.txt" } } }'
      }

      if (url.href === root + '/foo.cjs') {
        return "require('bar'); require.asset('bar'); module.exports = import('ba' + 'r')"
      }

      if (url.href === root + '/bar.js') {
        return 'module.exports = 42'
      }

      if (url.href === root + '/bar.txt') {
        return 'hello'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.cjs'), { protocol })

  await t.exception(exports, /MODULE_NOT_FOUND/)
})

test('imports in node_modules', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/node_modules/foo/package.json' ||
        url.href === root + '/node_modules/foo/baz.js' ||
        url.href === root + '/node_modules/foo/foo.js'
      )
    },

    read(url) {
      if (url.href === root + '/node_modules/foo/package.json') {
        return '{ "imports": { "bar": "./baz.js" } }'
      }

      if (url.href === root + '/node_modules/foo/foo.js') {
        return "const bar = require('bar')"
      }

      if (url.href === root + '/node_modules/foo/baz.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  await t.execution(Module.load(new URL(root + '/node_modules/foo/foo.js'), { protocol }))
})

test('imports in node_modules, not applied to a required package', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/node_modules/foo/package.json' ||
        url.href === root + '/node_modules/foo/foo.js' ||
        url.href === root + '/node_modules/bar/package.json' ||
        url.href === root + '/node_modules/bar/bar.js' ||
        url.href === root + '/node_modules/baz/package.json' ||
        url.href === root + '/node_modules/baz/index.js'
      )
    },

    read(url) {
      if (url.href === root + '/node_modules/foo/package.json') {
        return '{ "imports": { "qux": "baz" } }'
      }

      if (url.href === root + '/node_modules/foo/foo.js') {
        return "module.exports = require('bar')"
      }

      if (url.href === root + '/node_modules/bar/package.json') {
        return '{ "main": "./bar.js" }'
      }

      if (url.href === root + '/node_modules/bar/bar.js') {
        return "module.exports = require('qux')"
      }

      if (url.href === root + '/node_modules/baz/package.json') {
        return '{}'
      }

      if (url.href === root + '/node_modules/baz/index.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  // The map is declared by 'foo' and so must not follow the specifier into
  // 'bar', which has no 'qux' of its own to resolve.
  await t.exception(Module.load(new URL(root + '/node_modules/foo/foo.js'), { protocol }), {
    code: 'MODULE_NOT_FOUND'
  })
})

test('require a module already visited as a package scope', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.js' || url.href === root + '/package.json'
    },

    read(url) {
      if (url.href === root + '/foo.js') {
        return "module.exports = require('./package.json')"
      }

      if (url.href === root + '/package.json') {
        return 'null'
      }

      t.fail()
    }
  })

  await t.exception(Module.load(new URL(root + '/foo.js'), { protocol }), /MODULE_NOT_FOUND/)
})

test('resolve and load builtin', async (t) => {
  const builtins = {
    foo: 42
  }

  const { href } = await Module.resolve('foo', new URL(root + '/'), { builtins })
  const { exports } = await Module.load(new URL('builtin:foo'), { builtins })

  t.is(href, 'builtin:foo')
  t.is(exports, 42)
})

test('load builtin from .cjs', async (t) => {
  const builtins = {
    bar: 42
  }

  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return "module.exports = require('bar')"
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.cjs'), {
    protocol,
    builtins
  })

  t.is(exports, 42)
})

test('load builtin from .mjs', async (t) => {
  const builtins = {
    bar: 42
  }

  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return "export { default } from 'bar'"
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), {
    protocol,
    builtins
  })

  t.is(exports.default, 42)
})

test('load builtin with named exports', async (t) => {
  const builtins = { bar: { foo: 42 } }

  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/index.mjs'
    },

    read(url) {
      if (url.href === root + '/index.mjs') {
        return "import { foo } from 'bar'; export default foo"
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/index.mjs'), { protocol, builtins })

  t.is(exports.default, 42)
})

test('load file that cannot be read', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs'
    },

    read() {
      throw new Error('foo')
    }
  })

  await t.exception(Module.load(new URL(root + '/foo.cjs'), { protocol }), /Error: foo/)
})

test('resolve already valid URL', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      t.is(url.href, root + '/bar.js')

      return true
    }
  })

  await Module.resolve(root + '/bar.js', new URL(root + '/foo.js'), { protocol })
})

test('resolve with non-string specifier', async (t) => {
  await t.exception.all(Module.resolve(42, new URL(root + '/')), /TypeError/)
})

test('resolve with string parentURL', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/node_modules/foo/package.json' ||
        url.href === root + '/node_modules/foo/index.js'
      )
    },

    read(url) {
      if (url.href === root + '/node_modules/foo/package.json') {
        return '{}'
      }

      t.fail()
    }
  })

  const { href } = await Module.resolve('foo', root + '/', { protocol })

  t.is(href, root + '/node_modules/foo/index.js')
})

test('resolve without parentURL uses the working directory', async (t) => {
  const root = pathToFileURL('.').href

  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.js'
    }
  })

  const { href } = await Module.resolve('./foo.js', null, { protocol })

  t.is(href, root + '/foo.js')
})

test('pkg.engines with valid range', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/node_modules/foo/package.json' ||
        url.href === root + '/node_modules/foo/index.js'
      )
    },

    read(url) {
      if (url.href === root + '/node_modules/foo/package.json') {
        return `{ "engines": { "bare": ">=${Bare.versions.bare}" } }`
      }

      t.fail()
    }
  })

  const { href } = await Module.resolve('foo', new URL(root + '/'), { protocol })

  t.is(href, root + '/node_modules/foo/index.js')
})

test('pkg.engines with invalid range', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/node_modules/foo/package.json' ||
        url.href === root + '/node_modules/foo/index.js'
      )
    },

    read(url) {
      if (url.href === root + '/node_modules/foo/package.json') {
        return `{ "engines": { "bare": "<${Bare.versions.bare}" } }`
      }

      t.fail()
    }
  })

  await t.exception(Module.resolve('foo', new URL(root + '/'), { protocol }), /UNSUPPORTED_ENGINE/)
})

test('throw in .cjs', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return "throw new Error('foo')"
      }

      t.fail()
    }
  })

  await t.exception(Module.load(new URL(root + '/foo.cjs'), { protocol }), /Error: foo/)
})

test('throw in .cjs imported from .cjs', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.cjs' || url.href === root + '/foo.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return "require('/bar.cjs')"
      }

      if (url.href === root + '/bar.cjs') {
        return "throw new Error('bar')"
      }

      t.fail()
    }
  })

  await t.exception(Module.load(new URL(root + '/foo.cjs'), { protocol }), /Error: bar/)
})

test('throw in .cjs, load again', async (t) => {
  const cache = Object.create(null)

  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return "throw new Error('foo')"
      }

      t.fail()
    }
  })

  await t.exception(Module.load(new URL(root + '/foo.cjs'), { protocol, cache }), /Error: foo/)

  await t.exception(Module.load(new URL(root + '/foo.cjs'), { protocol, cache }), /Error: foo/)
})

test('throw in .mjs', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return "throw new Error('foo')"
      }

      t.fail()
    }
  })

  await t.exception(Module.load(new URL(root + '/foo.mjs'), { protocol }), /Error: foo/)
})

test('throw in .mjs imported from .mjs', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.mjs' || url.href === root + '/foo.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return "import '/bar.mjs'"
      }

      if (url.href === root + '/bar.mjs') {
        return "throw new Error('bar')"
      }

      t.fail()
    }
  })

  await t.exception(Module.load(new URL(root + '/foo.mjs'), { protocol }), /Error: bar/)
})

test('throw in .mjs, load again', async (t) => {
  const cache = Object.create(null)

  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return "throw new Error('foo')"
      }

      t.fail()
    }
  })

  await t.exception(Module.load(new URL(root + '/foo.mjs'), { protocol, cache }), /Error: foo/)

  await t.exception(Module.load(new URL(root + '/foo.mjs'), { protocol, cache }), /Error: foo/)
})

test('type error in .cjs', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return 'null.foo()'
      }

      t.fail()
    }
  })

  await t.exception.all(Module.load(new URL(root + '/foo.cjs'), { protocol }), /TypeError/)
})

test('type error in .cjs imported from .cjs', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.cjs' || url.href === root + '/foo.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return "require('/bar.cjs')"
      }

      if (url.href === root + '/bar.cjs') {
        return 'null.foo()'
      }

      t.fail()
    }
  })

  await t.exception.all(Module.load(new URL(root + '/foo.cjs'), { protocol }), /TypeError/)
})

test('type error in .cjs imported from .mjs', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.cjs' || url.href === root + '/foo.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return "import bar from '/bar.cjs'"
      }

      if (url.href === root + '/bar.cjs') {
        return 'null.foo()'
      }

      t.fail()
    }
  })

  await t.exception.all(Module.load(new URL(root + '/foo.mjs'), { protocol }), /TypeError/)
})

test('type error in .cjs imported from .mjs with type error', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.cjs' || url.href === root + '/foo.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return "import '/bar.cjs'; null.foo()"
      }

      if (url.href === root + '/bar.cjs') {
        return 'null.bar()'
      }

      t.fail()
    }
  })

  await t.exception.all(Module.load(new URL(root + '/foo.mjs'), { protocol }), /TypeError/)
})

test('type error in .cjs imported from .mjs with type error and top-level await', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.cjs' || url.href === root + '/foo.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return "import '/bar.cjs'; await 42; null.foo()"
      }

      if (url.href === root + '/bar.cjs') {
        return 'null.bar()'
      }

      t.fail()
    }
  })

  await t.exception.all(Module.load(new URL(root + '/foo.mjs'), { protocol }), /TypeError/)
})

test('type error in .cjs, load again', async (t) => {
  const cache = Object.create(null)

  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return 'null.foo()'
      }

      t.fail()
    }
  })

  await t.exception.all(Module.load(new URL(root + '/foo.cjs'), { protocol, cache }), /TypeError/)

  await t.exception.all(Module.load(new URL(root + '/foo.cjs'), { protocol, cache }), /TypeError/)
})

test('type error in .mjs', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return 'null.foo()'
      }

      t.fail()
    }
  })

  await t.exception.all(Module.load(new URL(root + '/foo.mjs'), { protocol }), /TypeError/)
})

test('type error in .mjs imported from .mjs', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.mjs' || url.href === root + '/foo.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return "import '/bar.mjs'"
      }

      if (url.href === root + '/bar.mjs') {
        return 'null.foo()'
      }

      t.fail()
    }
  })

  await t.exception.all(Module.load(new URL(root + '/foo.mjs'), { protocol }), /TypeError/)
})

test('type error in .mjs imported from .mjs with type error', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.mjs' || url.href === root + '/foo.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return "import '/bar.mjs'; null.foo()"
      }

      if (url.href === root + '/bar.mjs') {
        return 'null.bar()'
      }

      t.fail()
    }
  })

  await t.exception.all(Module.load(new URL(root + '/foo.mjs'), { protocol }), /TypeError/)
})

test('type error in .mjs imported from .mjs with type error and top-level await', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.mjs' || url.href === root + '/foo.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return "import '/bar.mjs'; await 42; null.foo()"
      }

      if (url.href === root + '/bar.mjs') {
        return 'null.bar()'
      }

      t.fail()
    }
  })

  await t.exception.all(Module.load(new URL(root + '/foo.mjs'), { protocol }), /TypeError/)
})

test('syntax error in .cjs', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return '1 + ()'
      }

      t.fail()
    }
  })

  await t.exception.all(Module.load(new URL(root + '/foo.cjs'), { protocol }), /SyntaxError/)
})

test('syntax error in .cjs, load again', async (t) => {
  const cache = Object.create(null)

  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return '1 + ()'
      }

      t.fail()
    }
  })

  await t.exception.all(Module.load(new URL(root + '/foo.cjs'), { protocol, cache }), /SyntaxError/)

  await t.exception.all(Module.load(new URL(root + '/foo.cjs'), { protocol, cache }), /SyntaxError/)
})

test('syntax error in .cjs imported from .cjs', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.cjs' || url.href === root + '/foo.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return "require('/bar.cjs')"
      }

      if (url.href === root + '/bar.cjs') {
        return '1 + ()'
      }

      t.fail()
    }
  })

  await t.exception.all(Module.load(new URL(root + '/foo.cjs'), { protocol }), /SyntaxError/)
})

test('syntax error in .mjs', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return '1 + ()'
      }

      t.fail()
    }
  })

  await t.exception.all(Module.load(new URL(root + '/foo.mjs'), { protocol }), /SyntaxError/)
})

test('syntax error in .mjs imported from .mjs', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.mjs' || url.href === root + '/foo.mjs'
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return "import '/bar.mjs'"
      }

      if (url.href === root + '/bar.mjs') {
        return '1 + ()'
      }

      t.fail()
    }
  })

  await t.exception.all(Module.load(new URL(root + '/foo.mjs'), { protocol }), /SyntaxError/)
})

test('load non-file: URL using the default protocol', async (t) => {
  const { exports } = await Module.load(new URL('foo:/foo.js'), 'module.exports = 42', {})

  t.is(exports, 42)
})

test('load non-file: URL with missing import using the default protocol', async (t) => {
  await t.exception(
    Module.load(new URL('foo:/foo.js'), "module.exports = require('./bar.js')", {}),
    /MODULE_NOT_FOUND/
  )
})

test('load non-file: URL with encoded NUL throws', async (t) => {
  const url = new URL('protocol:/foo%00bar.cjs')

  const protocol = new Module.Protocol({
    exists(u) {
      return u.href === url.href
    },

    read(u) {
      if (u.href === url.href) {
        return 'module.exports = __filename'
      }

      t.fail()
    }
  })

  await t.exception(Module.load(url, { protocol }), /INVALID_URL_PATH/)
})

test('load non-file: URL with encoded slash throws', async (t) => {
  const url = new URL('protocol:/foo%2fbar.cjs')

  const protocol = new Module.Protocol({
    exists(u) {
      return u.href === url.href
    },

    read(u) {
      if (u.href === url.href) {
        return 'module.exports = __filename'
      }

      t.fail()
    }
  })

  await t.exception(Module.load(url, { protocol }), /INVALID_URL_PATH/)
})

test('load non-file: URL with encoded backslash', async (t) => {
  const url = new URL('protocol:/foo%5cbar.cjs')

  const protocol = new Module.Protocol({
    exists(u) {
      return u.href === url.href
    },

    read(u) {
      if (u.href === url.href) {
        return 'module.exports = __dirname'
      }

      t.fail()
    }
  })

  if (isWindows) {
    await t.exception(Module.load(url, { protocol }), /INVALID_URL_PATH/)
  } else {
    await t.execution(Module.load(url, { protocol }))
  }
})

test('load .js with asset import', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.txt' || url.href === root + '/index.js'
    },

    read(url) {
      if (url.href === root + '/index.js') {
        return "module.exports = require.asset('./foo.txt')"
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/index.js'), { protocol })

  t.is(exports, isWindows ? 'c:\\foo.txt' : '/foo.txt')
})

test('load .cjs with asset import', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.txt' || url.href === root + '/index.cjs'
    },

    read(url) {
      if (url.href === root + '/index.cjs') {
        return "module.exports = require.asset('./foo.txt')"
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/index.cjs'), { protocol })

  t.is(exports, isWindows ? 'c:\\foo.txt' : '/foo.txt')
})

test('load .mjs with asset import', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.txt' || url.href === root + '/index.mjs'
    },

    read(url) {
      if (url.href === root + '/index.mjs') {
        return "export default import.meta.asset('./foo.txt')"
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/index.mjs'), { protocol })

  t.is(exports.default, root + '/foo.txt')
})

test('load .bundle with asset import', async (t) => {
  const bundle = new Bundle()
    .write('/foo.js', "module.exports = require.asset('./bar.txt')", {
      main: true
    })
    .write('/bar.txt', 'hello world', { asset: true })
    .toBuffer()

  const { exports } = await Module.load(new URL(root + '/app.bundle'), bundle, {})

  t.is(exports, isWindows ? 'c:\\app.bundle\\bar.txt' : '/app.bundle/bar.txt')
})

test('load .bundle with asset import, resolutions map', async (t) => {
  const bundle = new Bundle()
    .write('/foo.js', "module.exports = require.asset('./bar.txt')", {
      main: true
    })
    .write('/baz.txt', 'hello world', { asset: true })

  bundle.resolutions = {
    '/foo.js': {
      './bar.txt': {
        asset: '/baz.txt'
      }
    }
  }

  const { exports } = await Module.load(new URL(root + '/app.bundle'), bundle.toBuffer(), {})

  t.is(exports, isWindows ? 'c:\\app.bundle\\baz.txt' : '/app.bundle/baz.txt')
})

test('load .bundle with asset import, resolutions map pointing outside .bundle', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.txt'
    }
  })

  const bundle = new Bundle()
    .write('/foo.js', "module.exports = require.asset('./bar.txt')", {
      main: true
    })
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

  t.is(exports, isWindows ? 'c:\\bar.txt' : '/bar.txt')
})

test('load .js with asset import using a custom protocol list', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/index.js' || url.href === root + '/assets/foo.txt'
    },

    read(url) {
      if (url.href === root + '/index.js') {
        return "module.exports = require.asset('./assets/foo.txt')"
      }

      if (url.href === root + '/assets/foo.txt') {
        return 'hello'
      }

      t.fail()
    },

    *list(url) {
      if (url.href === root + '/assets/foo.txt') yield new URL(root + '/assets/foo.txt')
    }
  })

  const { exports } = await Module.load(new URL(root + '/index.js'), { protocol })

  t.is(exports, isWindows ? 'c:\\assets\\foo.txt' : '/assets/foo.txt')
})

test('importSync with asset import uses the default protocol list', (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/index.js' || url.href === root + '/foo.txt'
    },

    read(url) {
      if (url.href === root + '/index.js') {
        return "module.exports = require.asset('./foo.txt')"
      }

      if (url.href === root + '/foo.txt') {
        return 'hello'
      }

      t.fail()
    }
  })

  const loader = new Module.Loader({ protocol })

  t.is(loader.importSync(new URL(root + '/index.js')), isWindows ? 'c:\\foo.txt' : '/foo.txt')
})

test('load .js with asset import of a .js file', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/index.js' || url.href === root + '/foo.js'
    },

    read(url) {
      if (url.href === root + '/index.js') {
        return "module.exports = require.asset('./foo.js')"
      }

      t.fail()
    }
  })

  const loader = new Module.Loader({ protocol })

  t.is(await loader.import(new URL(root + '/index.js')), isWindows ? 'c:\\foo.js' : '/foo.js')
  t.is(loader.get(new URL(root + '/foo.js')), null)
})

test('load .js with asset import of a directory holding a .js file', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/index.js' ||
        url.href === root + '/assets/foo.txt' ||
        url.href === root + '/assets/bar.js'
      )
    },

    read(url) {
      if (url.href === root + '/index.js') {
        return "module.exports = require.asset('./assets')"
      }

      t.fail()
    },

    *list(url) {
      if (url.href === root + '/assets') {
        yield new URL(root + '/assets/foo.txt')
        yield new URL(root + '/assets/bar.js')
      }
    }
  })

  const loader = new Module.Loader({ protocol })

  t.is(await loader.import(new URL(root + '/index.js')), isWindows ? 'c:\\assets' : '/assets')

  t.is(loader.get(new URL(root + '/assets/bar.js')), null)
  t.is(loader.get(new URL(root + '/assets/foo.txt')), null)
})

test('load .js requiring a file an asset directory reached', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/index.js' || url.href === root + '/assets/foo.txt'
    },

    read(url) {
      if (url.href === root + '/index.js') {
        return "require.asset('./assets'); module.exports = require('./assets/' + 'foo.txt')"
      }

      if (url.href === root + '/assets/foo.txt') {
        return 'hello'
      }

      t.fail()
    },

    *list(url) {
      if (url.href === root + '/assets') yield new URL(root + '/assets/foo.txt')
    }
  })

  const loader = new Module.Loader({ protocol })

  t.is(await loader.import(new URL(root + '/index.js')), 'hello')
})

test('asset directory is expanded once across link calls', (t) => {
  let lists = 0

  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/index.js' ||
        url.href === root + '/dep.js' ||
        url.href === root + '/assets/foo.txt'
      )
    },

    read(url) {
      if (url.href === root + '/index.js') {
        return "require.asset('./assets'); module.exports = require('./de' + 'p.js')"
      }

      if (url.href === root + '/dep.js') {
        return "module.exports = require.asset('./assets')"
      }

      if (url.href === root + '/assets/foo.txt') {
        return 'hello'
      }

      t.fail()
    },

    *list(url) {
      lists++

      if (url.href === root + '/assets') yield new URL(root + '/assets/foo.txt')
    }
  })

  const loader = new Module.Loader({ protocol })

  t.is(loader.importSync(new URL(root + '/index.js')), isWindows ? 'c:\\assets' : '/assets')

  t.is(lists, 1)
})

test('asset directory named twice by one module is expanded once', async (t) => {
  let lists = 0
  let probes = 0
  let resolves = 0

  const protocol = new Module.Protocol({
    exists(url) {
      if (url.href === root + '/assets/foo.txt') probes++

      return url.href === root + '/index.js' || url.href === root + '/assets/foo.txt'
    },

    read(url) {
      if (url.href === root + '/index.js') {
        return "module.exports = [require.asset('./assets'), require.asset('./dir/../assets')]"
      }

      if (url.href === root + '/assets/foo.txt') {
        return 'hello'
      }

      return null
    },

    resolve(url) {
      if (url.href === root + '/assets/foo.txt') resolves++

      return url
    },

    *list(url) {
      lists++

      if (url.href === root + '/assets') yield new URL(root + '/assets/foo.txt')
    }
  })

  const { exports } = await Module.load(new URL(root + '/index.js'), { protocol })

  const assets = isWindows ? ['c:\\assets', 'c:\\assets'] : ['/assets', '/assets']

  t.alike(exports, assets)

  t.is(lists, 1, 'listed once')
  t.is(resolves, 0, 'nothing under the directory is resolved')
  t.is(probes, 0, 'nothing under the directory is probed')
})

test('load .js with asset import using an asynchronous protocol list', async (t) => {
  const protocol = new Module.Protocol({
    async exists(url) {
      return url.href === root + '/index.js'
    },

    async read(url) {
      if (url.href === root + '/index.js') {
        return "module.exports = require.asset('./assets')"
      }

      return null
    },

    async resolve(url) {
      return url
    },

    async *list(url) {
      if (url.href === root + '/assets') yield new URL(root + '/assets/foo.txt')
    }
  })

  const { exports } = await Module.load(new URL(root + '/index.js'), { protocol })

  t.is(exports, isWindows ? 'c:\\assets' : '/assets')
})

test('importSync with asset import uses the synchronous protocol variants', (t) => {
  const protocol = new Module.Protocol({
    async exists(url) {
      t.fail()
    },

    existsSync(url) {
      return url.href === root + '/index.js' || url.href === root + '/foo.txt'
    },

    async read(url) {
      t.fail()
    },

    readSync(url) {
      if (url.href === root + '/index.js') {
        return "module.exports = require.asset('./foo.txt')"
      }

      if (url.href === root + '/foo.txt') {
        return 'hello'
      }

      t.fail()
    }
  })

  const loader = new Module.Loader({ protocol })

  t.is(loader.importSync(new URL(root + '/index.js')), isWindows ? 'c:\\foo.txt' : '/foo.txt')
})

test('load .js with .bin require', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.bin' || url.href === root + '/index.js'
    },

    read(url) {
      if (url.href === root + '/index.js') {
        return "module.exports = require('./foo.bin')"
      }

      if (url.href === root + '/foo.bin') {
        return Buffer.from('hello world')
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/index.js'), { protocol })

  t.alike(exports, Buffer.from('hello world'))
})

test('load .js with .txt require', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.txt' || url.href === root + '/index.js'
    },

    read(url) {
      if (url.href === root + '/index.js') {
        return "module.exports = require('./foo.txt')"
      }

      if (url.href === root + '/foo.txt') {
        return 'hello world'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/index.js'), { protocol })

  t.is(exports, 'hello world')
})

test('load .js with .bin require, asserted type', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/asset' || url.href === root + '/index.js'
    },

    read(url) {
      if (url.href === root + '/index.js') {
        return "module.exports = require('./asset', { with: { type: 'binary' } })"
      }

      if (url.href === root + '/asset') {
        return Buffer.from('hello world')
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/index.js'), { protocol })

  t.alike(exports, Buffer.from('hello world'))
})

test('load .js with .txt require, asserted type', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/asset' || url.href === root + '/index.js'
    },

    read(url) {
      if (url.href === root + '/index.js') {
        return "module.exports = require('./asset', { with: { type: 'text' } })"
      }

      if (url.href === root + '/asset') {
        return 'hello world'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/index.js'), { protocol })

  t.is(exports, 'hello world')
})

test('load .js with require and conflicting binary require', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.js' || url.href === root + '/index.js'
    },

    read(url) {
      if (url.href === root + '/index.js') {
        return "module.exports = [require('./bar.js'), require('./bar.js', { with: { type: 'binary' } })]"
      }

      if (url.href === root + '/bar.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  // The plain require must not get the module's source bytes just because the
  // require next to it asked for them.
  await t.exception(Module.load(new URL(root + '/index.js'), { protocol }), /TYPE_INCOMPATIBLE/)
})

test('load .js with binary require and conflicting require', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.js' || url.href === root + '/index.js'
    },

    read(url) {
      if (url.href === root + '/index.js') {
        return "module.exports = [require('./bar.js', { with: { type: 'binary' } }), require('./bar.js')]"
      }

      if (url.href === root + '/bar.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  await t.exception(Module.load(new URL(root + '/index.js'), { protocol }), /TYPE_INCOMPATIBLE/)
})

test('load .js with computed require of a coerced module', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.js' || url.href === root + '/index.js'
    },

    read(url) {
      if (url.href === root + '/index.js') {
        return `
          require('./bar.js', { with: { type: 'binary' } })
          module.exports = require('${root}/bar.js'.slice(0))
        `
      }

      if (url.href === root + '/bar.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  // The traversal never sees a computed specifier, so only the loader can catch
  // this one.
  await t.exception(Module.load(new URL(root + '/index.js'), { protocol }), /TYPE_INCOMPATIBLE/)
})

test('load .js with computed binary require of a coerced module', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.js' || url.href === root + '/index.js'
    },

    read(url) {
      if (url.href === root + '/index.js') {
        return `
          require('./bar.js', { with: { type: 'binary' } })
          module.exports = require('${root}/bar.js'.slice(0), { with: { type: 'binary' } }).byteLength
        `
      }

      if (url.href === root + '/bar.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/index.js'), { protocol })

  t.is(exports, 19)
})

test('load .js with computed require of a redundantly asserted module', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.bin' || url.href === root + '/index.js'
    },

    read(url) {
      if (url.href === root + '/index.js') {
        return `
          require('./bar.bin', { with: { type: 'binary' } })
          module.exports = require('${root}/bar.bin'.slice(0)).byteLength
        `
      }

      if (url.href === root + '/bar.bin') {
        return 'hello'
      }

      t.fail()
    }
  })

  // The attribute matches the type '.bin' already has, so it changed nothing and
  // the computed require should still get the module.
  const { exports } = await Module.load(new URL(root + '/index.js'), { protocol })

  t.is(exports, 5)
})

test('load .mjs with static import and coercing type attribute', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar' || url.href === root + '/index.mjs'
    },

    read(url) {
      if (url.href === root + '/index.mjs') {
        return "import d from '/bar' with { type: 'json' }\nexport default d.foo"
      }

      if (url.href === root + '/bar') {
        return '{ "foo": 42 }'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/index.mjs'), { protocol })

  t.is(exports.default, 42)
})

test('load .js with .txt require, asserted type mismatch', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/asset' || url.href === root + '/index.js'
    },

    read(url) {
      if (url.href === root + '/index.js') {
        return "module.exports = [require('./asset', { with: { type: 'text' } }), require('./asset', { with: { type: 'binary' } })]"
      }

      if (url.href === root + '/asset') {
        return 'hello world'
      }

      t.fail()
    }
  })

  await t.exception(Module.load(new URL(root + '/index.js'), { protocol }), /TYPE_INCOMPATIBLE/)
})

test('extend module with exports property', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.js' || url.href === root + '/foo.js'
    },

    read(url) {
      if (url.href === root + '/foo.js') {
        return "module.exports = require('./bar.js')"
      }

      if (url.href === root + '/bar.js') {
        return "Object.defineProperty(module, 'exports', { get: () => 42 })"
      }

      t.fail()
    }
  })

  await t.execution(Module.load(new URL(root + '/foo.js'), { protocol }))
})

test('load .js with imports attribute', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/bar.js' ||
        url.href === root + '/baz.js' ||
        url.href === root + '/imports.json' ||
        url.href === root + '/foo.js'
      )
    },

    read(url) {
      if (url.href === root + '/foo.js') {
        return "module.exports = require('./bar.js', { with: { imports: './imports.json' } })"
      }

      if (url.href === root + '/bar.js') {
        return "module.exports = require('baz')"
      }

      if (url.href === root + '/baz.js') {
        return 'module.exports = 42'
      }

      if (url.href === root + '/imports.json') {
        return '{ "baz": "./baz.js" }'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, 42)
})

test('load .js with imports attribute, imports expansion', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/bar.js' ||
        url.href === root + '/baz.js' ||
        url.href === root + '/imports.json' ||
        url.href === root + '/foo.js'
      )
    },

    read(url) {
      if (url.href === root + '/foo.js') {
        return "module.exports = require('./bar.js', { with: { imports: './imports.json' } })"
      }

      if (url.href === root + '/bar.js') {
        return "module.exports = require('baz')"
      }

      if (url.href === root + '/baz.js') {
        return 'module.exports = 42'
      }

      if (url.href === root + '/imports.json') {
        return '{ "imports": { "baz": "./baz.js" } }'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, 42)
})

test('load .js with imports attribute, required package', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/node_modules/foo/package.json' ||
        url.href === root + '/node_modules/foo/foo.js' ||
        url.href === root + '/node_modules/bar/package.json' ||
        url.href === root + '/node_modules/bar/bar.js' ||
        url.href === root + '/node_modules/bar/lib.js' ||
        url.href === root + '/node_modules/baz/package.json' ||
        url.href === root + '/node_modules/baz/index.js'
      )
    },

    read(url) {
      if (url.href === root + '/node_modules/foo/package.json') {
        return '{ "imports": { "qux": "baz" } }'
      }

      if (url.href === root + '/node_modules/foo/foo.js') {
        return "module.exports = require('bar', { with: { imports: './package.json' } })"
      }

      if (url.href === root + '/node_modules/bar/package.json') {
        return '{ "main": "./bar.js" }'
      }

      if (url.href === root + '/node_modules/bar/bar.js') {
        return "module.exports = require('./lib.js')"
      }

      if (url.href === root + '/node_modules/bar/lib.js') {
        return "module.exports = require('qux')"
      }

      if (url.href === root + '/node_modules/baz/package.json') {
        return '{}'
      }

      if (url.href === root + '/node_modules/baz/index.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  // Unlike a map a package declares for itself, an attached map covers the
  // whole subtree of what it's attached to, 'bar' its own files included.
  const { exports } = await Module.load(new URL(root + '/node_modules/foo/foo.js'), { protocol })

  t.is(exports, 42)
})

test('load .js with imports attribute, invalid map', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/foo.js' ||
        url.href === root + '/bar.js' ||
        url.href === root + '/imports.json'
      )
    },

    read(url) {
      if (url.href === root + '/foo.js') {
        return "module.exports = require('./bar.js', { with: { imports: './imports.json' } })"
      }

      if (url.href === root + '/bar.js') {
        return 'module.exports = 42'
      }

      if (url.href === root + '/imports.json') {
        return '42'
      }

      t.fail()
    }
  })

  await t.exception(Module.load(new URL(root + '/foo.js'), { protocol }), /INVALID_IMPORTS_MAP/)
})

test('load .mjs with imports attribute', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/bar.js' ||
        url.href === root + '/baz.js' ||
        url.href === root + '/imports.json' ||
        url.href === root + '/foo.mjs'
      )
    },

    read(url) {
      if (url.href === root + '/foo.mjs') {
        return "export { default } from './bar.js' with { imports: './imports.json' }"
      }

      if (url.href === root + '/bar.js') {
        return "module.exports = require('baz')"
      }

      if (url.href === root + '/baz.js') {
        return 'module.exports = 42'
      }

      if (url.href === root + '/imports.json') {
        return '{ "baz": "./baz.js" }'
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.is(exports.default, 42)
})

test('resolve caches the result in resolutions map', async (t) => {
  const resolutions = {}

  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/node_modules/foo/package.json' ||
        url.href === root + '/node_modules/foo/index.js'
      )
    },

    read(url) {
      if (url.href === root + '/node_modules/foo/package.json') {
        return '{}'
      }

      t.fail()
    }
  })

  const { href } = await Module.resolve('foo', new URL(root + '/'), { protocol, resolutions })

  t.is(href, root + '/node_modules/foo/index.js')

  t.is(resolutions[root + '/'].foo.require, root + '/node_modules/foo/index.js')
})

test('resolve reuses a cached resolution without touching the protocol', async (t) => {
  const resolutions = {
    [root + '/']: {
      foo: { require: root + '/node_modules/foo/index.js' }
    }
  }

  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/node_modules/foo/index.js'
    },

    read() {
      t.fail()
    }
  })

  const { href } = await Module.resolve('foo', new URL(root + '/'), { protocol, resolutions })

  t.is(href, root + '/node_modules/foo/index.js')
})

test('resolve does not reuse a require resolution for an import', async (t) => {
  const resolutions = {
    [root + '/']: {
      foo: { require: root + '/node_modules/foo/require.js' }
    }
  }

  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/node_modules/foo/package.json' ||
        url.href === root + '/node_modules/foo/import.js'
      )
    },

    read(url) {
      if (url.href === root + '/node_modules/foo/package.json') {
        return '{ "exports": { "import": "./import.js", "require": "./require.js" } }'
      }

      t.fail()
    }
  })

  const { href } = await Module.resolve('foo', new URL(root + '/'), 'import', {
    protocol,
    resolutions
  })

  t.is(href, root + '/node_modules/foo/import.js')
})

test('asset caches the result in resolutions map', async (t) => {
  const resolutions = {}

  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.txt'
    },

    read() {
      t.fail()
    }
  })

  const { href } = await Module.resolve('./foo.txt', new URL(root + '/'), 'asset', {
    protocol,
    resolutions
  })

  t.is(href, root + '/foo.txt')

  t.is(resolutions[root + '/']['./foo.txt'].asset, root + '/foo.txt')
})

test('asset reuses a cached resolution without touching the protocol', async (t) => {
  const resolutions = {
    [root + '/']: {
      './foo.txt': { asset: root + '/foo.txt' }
    }
  }

  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.txt'
    },

    read() {
      t.fail()
    }
  })

  const { href } = await Module.resolve('./foo.txt', new URL(root + '/'), 'asset', {
    protocol,
    resolutions
  })

  t.is(href, root + '/foo.txt')
})

test('load with referrer shares the loader', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs' || url.href === root + '/bar.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return 'module.exports = 1'
      }

      if (url.href === root + '/bar.cjs') {
        return 'module.exports = 2'
      }

      t.fail()
    }
  })

  const cache = Object.create(null)

  const foo = await Module.load(new URL(root + '/foo.cjs'), { protocol, cache })
  const bar = await Module.load(new URL(root + '/bar.cjs'), { referrer: foo })

  t.is(foo.exports, 1)
  t.is(bar.exports, 2)
  t.is(cache[root + '/bar.cjs'], bar, 'the referrer cache is read into')
})

test('load with referrer and protocol uses the given protocol', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return 'module.exports = 1'
      }

      t.fail()
    }
  })

  const other = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.cjs'
    },

    read(url) {
      if (url.href === root + '/bar.cjs') {
        return 'module.exports = 2'
      }

      t.fail()
    }
  })

  const cache = Object.create(null)

  const foo = await Module.load(new URL(root + '/foo.cjs'), { protocol, cache })
  const bar = await Module.load(new URL(root + '/bar.cjs'), {
    referrer: foo,
    protocol: other
  })

  t.is(foo.exports, 1)
  t.is(bar.exports, 2)
  t.is(bar.protocol, other, 'the given protocol wins over the referrer')
  t.is(cache[root + '/foo.cjs'], foo, 'the referrer cache holds the referrer')
  t.absent(cache[root + '/bar.cjs'], 'the cache is not shared across protocols')
})

test('load with referrer keeps the referrer main', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs' || url.href === root + '/bar.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return 'module.exports = 1'
      }

      if (url.href === root + '/bar.cjs') {
        return 'module.exports = require.main.url.href'
      }

      t.fail()
    }
  })

  const foo = await Module.load(new URL(root + '/foo.cjs'), { protocol })
  const bar = await Module.load(new URL(root + '/bar.cjs'), { referrer: foo })

  t.is(bar.exports, root + '/foo.cjs', 'a shared graph keeps the main it was launched from')
})

test('load with referrer and protocol gives the fork a main of its own', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return 'module.exports = 1'
      }

      t.fail()
    }
  })

  const other = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.cjs'
    },

    read(url) {
      if (url.href === root + '/bar.cjs') {
        return 'module.exports = require.main.url.href'
      }

      t.fail()
    }
  })

  const foo = await Module.load(new URL(root + '/foo.cjs'), { protocol })
  const bar = await Module.load(new URL(root + '/bar.cjs'), {
    referrer: foo,
    protocol: other
  })

  t.is(bar.exports, root + '/bar.cjs', 'a fork that reaches elsewhere is its own main')
})

test('load with referrer and protocol does not leak the referrer protocol', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return 'module.exports = 1'
      }

      t.fail()
    }
  })

  const other = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.cjs'
    },

    read(url) {
      if (url.href === root + '/bar.cjs') {
        return 'module.exports = 2'
      }

      t.fail()
    }
  })

  const cache = Object.create(null)

  const foo = await Module.load(new URL(root + '/foo.cjs'), { protocol })

  await Module.load(new URL(root + '/bar.cjs'), {
    referrer: foo,
    protocol: other,
    cache
  })

  t.ok(cache[root + '/bar.cjs'], 'the fork reads into the given cache')
  t.absent(cache[root + '/foo.cjs'], 'the referrer is not in the fork cache')

  for (const href of Object.keys(cache)) {
    t.not(cache[href].protocol, protocol, `'${href}' cannot reach the referrer protocol`)
  }
})

test('load over a cache read with different builtins throws', async (t) => {
  const cache = Object.create(null)

  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs' || url.href === root + '/bar.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return 'module.exports = 1'
      }

      if (url.href === root + '/bar.cjs') {
        return 'module.exports = 2'
      }

      t.fail()
    }
  })

  await Module.load(new URL(root + '/foo.cjs'), {
    protocol,
    builtins: { baz: 42 },
    cache
  })

  try {
    await Module.load(new URL(root + '/bar.cjs'), {
      protocol,
      builtins: { baz: 43 },
      cache
    })

    t.fail('load should throw')
  } catch (err) {
    t.is(err.code, 'CACHE_INCOMPATIBLE')
  }
})

test('load over a cache read through a different protocol throws', async (t) => {
  const cache = Object.create(null)

  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return 'module.exports = 1'
      }

      t.fail()
    }
  })

  const other = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.cjs'
    },

    read(url) {
      if (url.href === root + '/bar.cjs') {
        return 'module.exports = 2'
      }

      t.fail()
    }
  })

  await Module.load(new URL(root + '/foo.cjs'), { protocol, cache })

  try {
    await Module.load(new URL(root + '/bar.cjs'), { protocol: other, cache })

    t.fail('load should throw')
  } catch (err) {
    t.is(err.code, 'CACHE_INCOMPATIBLE')
  }
})

test('load over a cache claimed by a loader that reaches elsewhere throws', async (t) => {
  const cache = Object.create(null)

  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs'
    },

    async read(url) {
      if (url.href === root + '/foo.cjs') {
        return 'module.exports = 1'
      }

      t.fail()
    }
  })

  const other = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.cjs'
    },

    async read(url) {
      if (url.href === root + '/bar.cjs') {
        return 'module.exports = 2'
      }

      t.fail()
    }
  })

  // The cache is still empty when both loaders are constructed, so it is the
  // claim rather than what the cache holds that must catch this.
  const a = Module.load(new URL(root + '/foo.cjs'), { protocol, cache })
  const b = Module.load(new URL(root + '/bar.cjs'), { protocol: other, cache })

  await t.execution(a)

  try {
    await b

    t.fail('load should throw')
  } catch (err) {
    t.is(err.code, 'CACHE_INCOMPATIBLE')
  }
})

test('cache written with a record read through a different protocol throws', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return 'module.exports = 1'
      }

      t.fail()
    }
  })

  const other = new Module.Protocol()

  const foo = await Module.load(new URL(root + '/foo.cjs'), { protocol })

  const cache = Object.create(null)

  const loader = new Module.Loader({ protocol: other, cache })

  cache[root + '/foo.cjs'] = foo

  try {
    loader.get(new URL(root + '/foo.cjs'))

    t.fail('get should throw')
  } catch (err) {
    t.is(err.code, 'CACHE_INCOMPATIBLE')
  }
})

test('load with referrer and protocol cannot read through the referrer', async (t) => {
  t.plan(2)

  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs' || url.href === root + '/secret.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return 'module.exports = 1'
      }

      t.fail('the referrer protocol was used')
    }
  })

  const denied = new Module.Protocol()

  const foo = await Module.load(new URL(root + '/foo.cjs'), { protocol })

  t.is(foo.exports, 1)

  try {
    await Module.load(new URL(root + '/secret.cjs'), {
      referrer: foo,
      protocol: denied
    })

    t.fail('load should not resolve')
  } catch (err) {
    t.is(err.code, 'MODULE_NOT_FOUND')
  }
})

test('load with referrer and builtins uses the given builtins', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs' || url.href === root + '/bar.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return 'module.exports = 1'
      }

      if (url.href === root + '/bar.cjs') {
        return "module.exports = require('baz')"
      }

      t.fail()
    }
  })

  const cache = Object.create(null)

  const foo = await Module.load(new URL(root + '/foo.cjs'), { protocol, cache })
  const bar = await Module.load(new URL(root + '/bar.cjs'), {
    referrer: foo,
    builtins: { baz: 42 }
  })

  t.is(bar.exports, 42)
  t.is(bar.protocol, foo.protocol, 'the protocol is inherited from the referrer')
  t.is(cache[root + '/foo.cjs'], foo, 'the referrer cache holds the referrer')
  t.absent(cache[root + '/bar.cjs'], 'the cache is not shared across builtins')
})

test('resolve with referrer and protocol uses the given protocol', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return 'module.exports = 1'
      }

      t.fail()
    }
  })

  const other = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.js'
    }
  })

  const foo = await Module.load(new URL(root + '/foo.cjs'), { protocol })

  const url = await Module.resolve('./bar', new URL(root + '/'), {
    referrer: foo,
    protocol: other
  })

  t.is(url.href, root + '/bar.js')
})

test('createRequire with referrer and protocol uses the given protocol', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return 'module.exports = 1'
      }

      t.fail()
    }
  })

  const other = new Module.Protocol({
    exists(url) {
      return url.href === root + '/bar.js'
    },

    read(url) {
      if (url.href === root + '/bar.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  const foo = await Module.load(new URL(root + '/foo.cjs'), { protocol })

  const require = Module.createRequire(null, { referrer: foo, protocol: other })

  t.is(require('./bar'), 42)
})

test('createRequire with referrer and no protocol keeps the referrer protocol', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs' || url.href === root + '/bar.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return 'module.exports = 1'
      }

      if (url.href === root + '/bar.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  const foo = await Module.load(new URL(root + '/foo.cjs'), { protocol })

  const require = Module.createRequire(null, {
    referrer: foo,
    protocol: undefined,
    cache: Object.create(null)
  })

  t.is(require('./bar'), 42)
})

test('createRequire with referrer and its own cache does not share main', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return 'module.exports = 1'
      }

      t.fail()
    }
  })

  const foo = await Module.load(new URL(root + '/foo.cjs'), { protocol })

  t.is(Module.createRequire(null, { referrer: foo, imports: {} }).main, foo)

  t.is(Module.createRequire(null, { referrer: foo, cache: Object.create(null) }).main, null)
})

test('load with cache', async (t) => {
  const cache = Object.create(null)

  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/index.cjs'
    },

    read(url) {
      if (url.href === root + '/index.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  const a = await Module.load(new URL(root + '/index.cjs'), { protocol, cache })
  const b = await Module.load(new URL(root + '/index.cjs'), { protocol, cache })

  t.is(a.exports, 42)
  t.is(b.exports, 42)
  t.is(a, b)
})

test('load without cache', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/index.cjs'
    },

    read(url) {
      if (url.href === root + '/index.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  const a = await Module.load(new URL(root + '/index.cjs'), { protocol })
  const b = await Module.load(new URL(root + '/index.cjs'), { protocol })

  t.is(a.exports, 42)
  t.is(b.exports, 42)
  t.not(a, b)
})

test('load addon with cache', async (t) => {
  const cache = Object.create(null)

  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/index.cjs' ||
        url.href === root + '/package.json' ||
        url.href === prebuilds + '/foo.bare'
      )
    },

    read(url) {
      if (url.href === root + '/index.cjs') {
        return "module.exports = require.addon('.')"
      }

      if (url.href === root + '/package.json') {
        return '{ "name": "foo", "version": "1.2.3" }'
      }

      t.fail()
    },

    resolve(url) {
      if (url.href === prebuilds + '/foo.bare') {
        return pathToFileURL(require.addon.resolve('.'))
      }

      t.fail()
    }
  })

  const a = await Module.load(new URL(root + '/index.cjs'), { protocol, cache })
  const b = await Module.load(new URL(root + '/index.cjs'), { protocol, cache })

  t.is(a.exports, b.exports)
})

test('load addon without cache', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return (
        url.href === root + '/index.cjs' ||
        url.href === root + '/package.json' ||
        url.href === prebuilds + '/foo.bare'
      )
    },

    read(url) {
      if (url.href === root + '/index.cjs') {
        return "module.exports = require.addon('.')"
      }

      if (url.href === root + '/package.json') {
        return '{ "name": "foo", "version": "1.2.3" }'
      }

      t.fail()
    },

    resolve(url) {
      if (url.href === prebuilds + '/foo.bare') {
        return pathToFileURL(require.addon.resolve('.'))
      }

      t.fail()
    }
  })

  const a = await Module.load(new URL(root + '/index.cjs'), { protocol })
  const b = await Module.load(new URL(root + '/index.cjs'), { protocol })

  t.not(a.exports, b.exports)
  t.alike(Object.keys(a.exports), Object.keys(b.exports))
})

test('load with a shared cache', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/shared.cjs'
    },

    read(url) {
      if (url.href === root + '/shared.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  const cache = Object.create(null)

  const a = await Module.load(new URL(root + '/shared.cjs'), { protocol, cache })
  const b = await Module.load(new URL(root + '/shared.cjs'), { protocol, cache })

  t.is(a.exports, 42)
  t.is(b.exports, 42)
  t.is(a, b)
})

test('load without a cache shares nothing', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/index.cjs'
    },

    read(url) {
      if (url.href === root + '/index.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  const a = await Module.load(new URL(root + '/index.cjs'), { protocol })
  const b = await Module.load(new URL(root + '/index.cjs'), { protocol })

  t.is(a.exports, 42)
  t.is(b.exports, 42)
  t.not(a, b)
})

test('a cache and its resolutions are an object or nothing', async (t) => {
  const protocol = new Module.Protocol()

  // Whether a graph is shared is said by naming the object, so neither the
  // boolean that used to reach a process-wide cache nor the one that used to
  // stand for a fresh one is a cache. Resolutions follow a cache, and neither
  // has a value standing for no map at all.
  for (const name of ['cache', 'resolutions']) {
    for (const value of [true, false, null, 0, 'map']) {
      await t.exception.all(
        () => new Module.Loader({ protocol, [name]: value }),
        TypeError,
        `${typeof value} ${value} is not a ${name} map`
      )

      await t.exception.all(
        () => Module.load(new URL(root + '/index.cjs'), { protocol, [name]: value }),
        TypeError
      )
    }

    t.execution(() => new Module.Loader({ protocol, [name]: Object.create(null) }))
  }

  t.execution(() => new Module.Loader({ protocol }), 'omitting them gives fresh maps')
})

test('loader options are checked', async (t) => {
  const protocol = new Module.Protocol()

  // Every one of these is read as the shape it should have been, so a wrong one
  // is not ignored but quietly answers for something. A string read as builtins
  // has a builtin at every index.
  const rejected = {
    builtins: [42, 'abc', true],
    imports: [42, 'abc', true],
    defaultType: ['module', 999, 1.5, -1],
    concurrency: ['4', -1, 1.5, NaN, Infinity, null, {}]
  }

  for (const name in rejected) {
    for (const value of rejected[name]) {
      await t.exception.all(
        () => new Module.Loader({ protocol, [name]: value }),
        TypeError,
        `${name}: ${typeof value} ${value}`
      )
    }
  }

  t.execution(() => new Module.Loader({ protocol, builtins: {}, imports: {} }))
  t.execution(() => new Module.Loader({ protocol, defaultType: Module.constants.MODULE }))
  t.execution(() => new Module.Loader({ protocol, defaultType: 0, concurrency: 0 }))
  t.execution(() => new Module.Loader({ protocol, builtins: null, imports: null }))
})

test('a builtins map is read for its own keys only', async (t) => {
  // A string is an object of sorts, but not one of these.
  await t.exception.all(() => new Module.Loader({ builtins: 'abc' }), TypeError)

  const loader = new Module.Loader({ builtins: { 1: 'own' } })

  t.is(loader.importSync(new URL('builtin:1')), 'own')
})

test('an entry is a URL', async (t) => {
  const protocol = new Module.Protocol()
  const loader = new Module.Loader({ protocol })

  for (const entry of [42, null, {}, 'file:///index.cjs']) {
    await t.exception.all(() => loader.linkSync(entry), TypeError, `linkSync(${entry})`)
    await t.exception.all(() => loader.link(entry), TypeError, `link(${entry})`)
    await t.exception.all(() => loader.get(entry), TypeError, `get(${entry})`)
  }

  t.execution(() => loader.get(new URL(root + '/index.cjs')))
})

test('a resolve condition is one this module system knows', async (t) => {
  const protocol = new Module.Protocol()
  const parentURL = new URL(root + '/')

  for (const condition of ['bogus', 42, true, '']) {
    await t.exception.all(
      () => Module.resolveSync('./foo.js', parentURL, condition, { protocol }),
      TypeError,
      `condition: ${condition}`
    )
  }

  // An unknown condition used to resolve as though nothing had been asked for.
  for (const condition of ['require', 'import', 'asset', 'addon']) {
    await t.exception.all(
      () => Module.resolveSync('./foo.js', parentURL, condition, { protocol }),
      /NOT_FOUND/,
      `condition: ${condition}`
    )
  }
})

test('a parent URL is a URL', async (t) => {
  const protocol = new Module.Protocol()

  for (const parentURL of [42, {}, true]) {
    await t.exception.all(
      () => Module.resolveSync('./foo.js', parentURL, { protocol }),
      TypeError,
      `resolveSync(${parentURL})`
    )

    await t.exception.all(
      () => Module.createRequire(parentURL, { protocol }),
      TypeError,
      `createRequire(${parentURL})`
    )
  }

  t.execution(() => Module.createRequire(root + '/', { protocol }))
  t.execution(() => Module.createRequire(new URL(root + '/'), { protocol }))
})

test('options are an object', async (t) => {
  const url = new URL(root + '/index.cjs')

  for (const opts of [42, true, 'options']) {
    await t.exception.all(() => Module.loadSync(url, null, opts), TypeError, `loadSync(${opts})`)
    await t.exception.all(() => Module.createRequire(url, opts), TypeError)
    await t.exception.all(() => Module.resolveSync('./foo.js', url, 'require', opts), TypeError)
  }

  // A second argument that is neither source nor options used to be taken for
  // options, dropping the protocol with it. A string is source, not options.
  for (const opts of [42, true]) {
    await t.exception.all(() => Module.loadSync(url, opts), TypeError, `loadSync(url, ${opts})`)
  }
})

test('an import attribute names a type this module system knows', (t) => {
  const store = {
    // The type is held in a variable so the attribute is not one the lexer can
    // read off the specifier, which is what puts the question to the loader
    // rather than to the traversal.
    [root + '/index.cjs']: `
      require('./dep.js')

      const answer = (type) => {
        try { return ['ok', require('./dep.js', { with: { type } })] }
        catch (e) { return ['threw', e.code] }
      }

      module.exports = { answer }
    `,
    [root + '/dep.js']: 'module.exports = 42'
  }

  const protocol = new Module.Protocol({
    exists: (url) => url.href in store,
    read: (url) => store[url.href] || null
  })

  const { answer } = Module.loadSync(new URL(root + '/index.cjs'), { protocol }).exports

  t.alike(answer('script'), ['ok', 42], 'the type it is')
  t.alike(answer('json'), ['threw', 'TYPE_INCOMPATIBLE'], 'a type it is not')

  // A type nobody defines used to be passed over, handing back whatever the
  // module happened to be rather than saying the request could not be met.
  for (const type of ['bogus', 'constructor', '__proto__', '']) {
    t.alike(answer(type), ['threw', 'UNKNOWN_MODULE_TYPE'], `type: '${type}'`)
  }
})

test('an import attribute type is a string', async (t) => {
  const store = {
    [root + '/index.cjs']: `
      require('./dep.js')

      module.exports = {
        type: (type) => require('./dep.js', { with: { type } }),
        attributes: (attributes) => require('./dep.js', { with: attributes })
      }
    `,
    [root + '/dep.js']: 'module.exports = 42'
  }

  const protocol = new Module.Protocol({
    exists: (url) => url.href in store,
    read: (url) => store[url.href] || null
  })

  const require = Module.loadSync(new URL(root + '/index.cjs'), { protocol }).exports

  // A value that is not a string used to be read as no type at all, so an
  // attribute the module system could not read went unanswered. An array of one
  // string is the sharp case: it reads as a type but is not one.
  for (const type of [null, 42, true, {}, ['script'], Symbol('script')]) {
    await t.exception.all(() => require.type(type), TypeError, `type: ${String(type)}`)
  }

  for (const attributes of [42, 'script', true]) {
    await t.exception.all(
      () => require.attributes(attributes),
      TypeError,
      `with: ${String(attributes)}`
    )
  }

  t.is(require.type(undefined), 42, 'no type asked')
  t.is(require.attributes(undefined), 42, 'no attributes at all')
  t.is(require.attributes(null), 42)

  // The same holds where attributes reach the traversal rather than the check.
  for (const attributes of [{ type: 42 }, { type: null }, { type: ['script'] }, 42]) {
    await t.exception.all(
      () => Module.loadSync(new URL(root + '/dep.js'), { protocol, attributes }),
      TypeError,
      `attributes: ${JSON.stringify(attributes)}`
    )
  }
})

test('nested conditional exports resolve for the running host', async (t) => {
  const [platform] = host.split('-')

  const store = {
    [root + '/node_modules/foo/package.json']: JSON.stringify({
      name: 'foo',
      version: '1.0.0',
      exports: {
        '.': { require: { [platform]: './host.cjs', default: './other.cjs' } },
        './entry.mjs': { import: { [platform]: './host.mjs', default: './other.mjs' } },
        './asset.txt': { asset: { [platform]: './asset-host.txt', default: './asset-other.txt' } }
      }
    }),
    [root + '/node_modules/foo/host.cjs']: `module.exports = 'host'`,
    [root + '/node_modules/foo/other.cjs']: `module.exports = 'other'`,
    [root + '/node_modules/foo/host.mjs']: `export default 'host'`,
    [root + '/node_modules/foo/other.mjs']: `export default 'other'`,
    [root + '/node_modules/foo/asset-host.txt']: 'host asset',
    [root + '/node_modules/foo/asset-other.txt']: 'other asset',
    [root + '/index.cjs']: `module.exports = [require('foo'), require.asset('foo/asset.txt')]`,
    [root + '/index.mjs']: `export { default } from 'foo/entry.mjs'`
  }

  const protocol = new Module.Protocol({
    exists: (url) => url.href in store,
    read: (url) => store[url.href] || null
  })

  t.is(
    (await Module.resolve('foo', new URL(root + '/'), { protocol })).href,
    root + '/node_modules/foo/host.cjs',
    'a nested require condition'
  )

  t.is(
    (await Module.resolve('foo/asset.txt', new URL(root + '/'), 'asset', { protocol })).href,
    root + '/node_modules/foo/asset-host.txt',
    'a nested asset condition'
  )

  const [required, asset] = Module.loadSync(new URL(root + '/index.cjs'), { protocol }).exports

  t.is(required, 'host', 'require() through a nested condition')
  const assetPath = '/node_modules/foo/asset-host.txt'

  t.is(asset, isWindows ? 'c:' + assetPath.replace(/\//g, '\\') : assetPath, 'require.asset()')

  t.is(
    Module.loadSync(new URL(root + '/index.mjs'), { protocol }).exports.default,
    'host',
    'import through a nested condition'
  )
})

test('a preresolved nested condition is not passed over for its default', (t) => {
  const [platform] = host.split('-')

  const store = {
    [root + '/index.cjs']: `module.exports = require('foo')`,
    [root + '/host.cjs']: `module.exports = 'host'`,
    [root + '/other.cjs']: `module.exports = 'other'`
  }

  const protocol = new Module.Protocol({
    exists: (url) => url.href in store,
    read: (url) => store[url.href] || null
  })

  const load = (foo) =>
    Module.loadSync(new URL(root + '/index.cjs'), {
      protocol,
      resolutions: { [root + '/index.cjs']: { foo } }
    }).exports

  // A map that names more than one host cannot be flattened, as it is whenever
  // a bundle is built for several. The condition beside `default` is one only
  // the resolver matches, so `default` is not the answer left over.
  t.is(
    load({ require: { [platform]: root + '/host.cjs', default: root + '/other.cjs' } }),
    'host',
    'a host condition beside a default'
  )

  t.is(
    load({ require: { [platform]: root + '/host.cjs', unmatched: root + '/other.cjs' } }),
    'host',
    'a host condition beside another'
  )

  // The flat shapes are still answered without going back to the resolver.
  t.is(load({ require: root + '/host.cjs', default: root + '/other.cjs' }), 'host')
  t.is(load({ import: root + '/other.cjs', default: root + '/host.cjs' }), 'host')
  t.is(load(root + '/host.cjs'), 'host')
})

test('export names are gathered through a resolution the map cannot be read for', (t) => {
  const [platform] = host.split('-')
  const otherHost = platform === 'linux' ? 'darwin-arm64' : 'linux-x64'

  const store = {
    [root + '/index.mjs']: `import { fromHost } from './re.cjs'\nexport default fromHost`,
    [root + '/re.cjs']: `module.exports = require('bar')`,
    [root + '/node_modules/bar/package.json']: JSON.stringify({
      name: 'bar',
      version: '1.0.0',
      exports: { '.': { [platform]: './host.cjs', default: './other.cjs' } }
    }),
    [root + '/node_modules/bar/host.cjs']: `exports.fromHost = 'host'`,
    [root + '/node_modules/bar/other.cjs']: `exports.fromOther = 'other'`
  }

  const protocol = new Module.Protocol({
    exists: (url) => url.href in store,
    read: (url) => store[url.href] || null
  })

  // Traversed for two hosts, so the recorded resolution keeps a condition only
  // the resolver matches and the names of the re-export have to be found
  // through it rather than read off the map.
  const { exports } = Module.loadSync(new URL(root + '/index.mjs'), {
    protocol,
    hosts: [host, otherHost]
  })

  t.is(exports.default, 'host')
})

test('export names are gathered through a re-exported builtin', (t) => {
  const store = {
    [root + '/index.mjs']: `import { hello } from './re.cjs'\nexport default hello`,
    [root + '/re.cjs']: `module.exports = require('greet')`
  }

  const protocol = new Module.Protocol({
    exists: (url) => url.href in store,
    read: (url) => store[url.href] || null
  })

  // A builtin has no record until one is asked for, so gathering names has to
  // ask rather than look only at what the traversal left behind.
  const { exports } = Module.loadSync(new URL(root + '/index.mjs'), {
    protocol,
    builtins: { greet: { hello: 'world' } }
  })

  t.is(exports.default, 'world')
})

test('a fork is given a fresh cache by naming one', (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/index.cjs'
    },

    read(url) {
      if (url.href === root + '/index.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  const referrer = Module.loadSync(new URL(root + '/index.cjs'), { protocol })

  const shared = Module.loadSync(new URL(root + '/index.cjs'), { referrer, concurrency: 1 })

  t.is(shared, referrer, 'a fork that reaches as far shares the graph')

  const fresh = Module.loadSync(new URL(root + '/index.cjs'), {
    referrer,
    cache: Object.create(null)
  })

  t.not(fresh, referrer, 'naming a cache of its own starts a graph of its own')
})

test('over-long module url is refused', async (t) => {
  const url = root + '/' + 'a'.repeat(5000) + '.mjs'

  const protocol = new Module.Protocol({
    exists(candidate) {
      return candidate.href === url
    },

    read(candidate) {
      if (candidate.href === url) {
        return 'export default 42'
      }

      t.fail()
    }
  })

  await t.exception(Module.load(new URL(url), { protocol }), { code: 'ENAMETOOLONG' })
})

test('an environment may hold more than one module context', (t) => {
  const addon = new Bare.Addon(pathToFileURL(require.addon.resolve('.')))

  t.not(addon.exports, binding, 'a second instance of this addon')

  // Every unit carries its own hooks, so contexts don't compete for one
  // environment-wide callback and a second one is safe. There is one whenever
  // this module is bundled twice.
  const a = createContext()
  const b = createContext()

  const other = {}
  addon.exports.createContext(other, noop, noop, noop, noop)

  t.ok(binding.createModule(a, {}, root + '/a.mjs', 'export default 1', 0))
  t.ok(binding.createModule(b, {}, root + '/b.mjs', 'export default 2', 0))
  t.ok(addon.exports.createModule(other, {}, root + '/c.mjs', 'export default 3', 0))
})

test('a module context outlives the object it was created on', (t) => {
  // Every unit holds the context it was made with, so dropping the object and
  // collecting it must neither free the context out from under them nor keep
  // every context that was ever made alive.
  for (let i = 0; i < 1000; i++) {
    const context = createContext()

    binding.createModule(context, {}, root + '/' + i + '.mjs', 'export default 1', 0)
    binding.createSyntheticModule(context, {}, root + '/' + i + '.cjs', ['default'])
    binding.createFunction(context, root + '/' + i + '.js', [], 'return 1', 0)

    new Array(1024).fill(i)
  }

  t.pass()
})

test('a module cannot cross module contexts', async (t) => {
  const a = createContext()
  const b = createContext()

  const module = {}
  binding.createModule(a, module, root + '/index.mjs', 'export default 1', 0)

  await t.exception.all(() => binding.runModule(b, module, noop))
  await t.exception.all(() => binding.getModuleNamespace(b, module))
})

test('module context is required to create, run and read modules', async (t) => {
  await t.exception.all(
    () => binding.createFunction({}, root + '/index.js', [], 'return 1', 0),
    TypeError
  )

  await t.exception.all(
    () => binding.createModule({}, {}, root + '/index.mjs', 'export default 42', 0),
    TypeError
  )

  await t.exception.all(
    () => binding.createSyntheticModule({}, {}, root + '/index.mjs', ['default']),
    TypeError
  )

  await t.exception.all(() => binding.runModule({}, {}, noop), TypeError)

  await t.exception.all(() => binding.setModuleExport({}, {}, 'default', 1), TypeError)

  await t.exception.all(() => binding.getModuleNamespace({}, {}), TypeError)
})

test('function offset must be a 32-bit integer', async (t) => {
  const context = createContext()

  for (const offset of [1.5, 1e21, NaN, Infinity]) {
    await t.exception.all(
      () => binding.createFunction(context, root + '/index.js', [], 'return 1', offset),
      TypeError
    )
  }

  t.is(binding.createFunction(context, root + '/index.js', ['x'], 'return x * 2', 0)(21), 42)
})

test('function source must be a string', async (t) => {
  const context = createContext()

  await t.exception.all(
    () => binding.createFunction(context, root + '/index.js', [], 42, 0),
    TypeError
  )
})

test('function file name must be a string', async (t) => {
  const context = createContext()

  await t.exception.all(() => binding.createFunction(context, 42, [], 'return 1', 0), TypeError)
})

test('over-long function file name is refused', async (t) => {
  const context = createContext()

  const file = root + '/' + 'a'.repeat(5000) + '.js'

  await t.exception.all(() => binding.createFunction(context, file, [], 'return 1', 0), {
    code: 'ENAMETOOLONG'
  })
})

test('over-long function argument name list is refused', async (t) => {
  const context = createContext()

  const names = ['require', 'module', 'exports', '__filename', '__dirname']

  t.ok(binding.createFunction(context, root + '/index.js', names, 'return 1', 0))

  await t.exception.all(
    () => binding.createFunction(context, root + '/index.js', [...names, 'extra'], 'return 1', 0),
    { code: 'E2BIG' }
  )

  const many = []
  many.length = 0xffffffff

  await t.exception.all(
    () => binding.createFunction(context, root + '/index.js', many, 'return 1', 0),
    {
      code: 'E2BIG'
    }
  )
})

test('function argument names must be strings', async (t) => {
  const context = createContext()

  await t.exception.all(
    () => binding.createFunction(context, root + '/index.js', 'x', 'return 1', 0),
    TypeError
  )

  await t.exception.all(
    () => binding.createFunction(context, root + '/index.js', ['x', 42], 'return 1', 0),
    TypeError
  )

  const names = ['x']

  Object.defineProperty(names, 0, {
    configurable: true,
    get() {
      return 42
    }
  })

  await t.exception.all(
    () => binding.createFunction(context, root + '/index.js', names, 'return 1', 0),
    TypeError
  )
})

test('function id requires a function', async (t) => {
  await t.exception.all(() => binding.getFunctionID({}), TypeError)

  t.ok(typeof binding.getFunctionID(noop) === 'symbol')
})

test('offset must not be negative', async (t) => {
  const context = createContext()

  await t.exception.all(
    () => binding.createFunction(context, root + '/index.js', [], 'return 1', -1),
    RangeError
  )
})

function createContext() {
  const context = {}

  binding.createContext(context, noop, noop, noop, noop)

  return context
}

function noop() {}
