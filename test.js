const test = require('brittle')
const Bundle = require('bare-bundle')
const { pathToFileURL } = require('bare-url')
const Module = require('.')

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
        return `module.exports = require('data:,${encodeURIComponent('module.exports = 42')}')`
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
        return `export { default } from 'data:,${encodeURIComponent('export default 42')}'`
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
        return `module.exports = require('data:,' + '${encodeURIComponent('module.exports = 42')}')`
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
        return `export default await import('data:,' + '${encodeURIComponent('export default 42')}')`
      }

      t.fail()
    }
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.is(exports.default.default, 42)
})

test('load .cjs with absolute require from data: protocol module', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.cjs' || url.href === root + '/bar.cjs'
    },

    read(url) {
      if (url.href === root + '/foo.cjs') {
        return `module.exports = require("data:,${encodeURIComponent(`module.exports = require('${root}/bar.cjs')`)}")`
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
        return `module.exports = require("data:,${encodeURIComponent(`module.exports = require("data:,${encodeURIComponent('module.exports = 42')}")`)}")`
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
        return `module.exports = require("data:,${encodeURIComponent("module.exports = require('./bar.cjs')")}")`
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
        return `module.exports = require("data:,${encodeURIComponent("module.exports = require('bar')")}")`
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
        return `module.exports = require("data:,${encodeURIComponent("module.exports = require('bar')")}")`
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
    new URL('data:,' + encodeURIComponent('module.exports = 42'))
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
        return `module.exports = require("data:,${encodeURIComponent(`module.exports = require.resolve('${root}/bar.cjs')`)}")`
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
        return `module.exports = require("data:,${encodeURIComponent("module.exports = require.resolve('./bar.cjs')")}")`
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
        return `module.exports = require("data:,${encodeURIComponent(`module.exports = require.asset('${root}/bar.txt')`)}")`
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
        return `module.exports = require("data:,${encodeURIComponent("module.exports = require.asset('./bar.txt')")}")`
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
        return `module.exports = require("data:,${encodeURIComponent("module.exports = require.addon.resolve('.')")}")`
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

test('loader assets', async (t) => {
  const protocol = new Module.Protocol({
    exists(url) {
      return url.href === root + '/foo.txt' || url.href === root + '/index.js'
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

  await loader.link(new URL(root + '/index.js'))

  t.is(loader.assets.length, 1)
  t.is(loader.assets[0].href, root + '/foo.txt')
  t.alike(loader.addons, [])
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

  const loader = new Module.Loader({ protocol })

  await loader.link(new URL(root + '/foo.js'))

  t.is(loader.addons.length, 1)
  t.is(loader.addons[0].href, pathToFileURL(require.addon.resolve('.')).href)
  t.alike(loader.assets, [])
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

  const { href } = await Module.asset('./foo.txt', new URL(root + '/'), { protocol })

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

  await t.exception(Module.asset('./foo.txt', new URL(root + '/'), { protocol }), /ASSET_NOT_FOUND/)
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

  t.is(exports, require.addon('.'))
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

  t.is(exports.default, require.addon('.'))
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

  const { href } = await Module.asset('./foo.txt', new URL(root + '/'), { protocol, resolutions })

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

  const { href } = await Module.asset('./foo.txt', new URL(root + '/'), { protocol, resolutions })

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

  const foo = await Module.load(new URL(root + '/foo.cjs'), { protocol })
  const bar = await Module.load(new URL(root + '/bar.cjs'), { referrer: foo })

  t.is(foo.exports, 1)
  t.is(bar.exports, 2)
  t.is(bar.cache, foo.cache)
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

  const a = await Module.load(new URL(root + '/index.cjs'), { protocol, cache: false })
  const b = await Module.load(new URL(root + '/index.cjs'), { protocol, cache: false })

  t.is(a.exports, 42)
  t.is(b.exports, 42)
  t.not(a, b)
})

test('load with the shared cache', async (t) => {
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

  const a = await Module.load(new URL(root + '/shared.cjs'), { protocol, cache: true })
  const b = await Module.load(new URL(root + '/shared.cjs'), { protocol, cache: true })

  t.is(a.exports, 42)
  t.is(b.exports, 42)
  t.is(a, b)
})

test('load without a cache does not use the shared cache', async (t) => {
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
