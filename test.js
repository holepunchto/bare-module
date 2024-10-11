/* global Bare */
const test = require('brittle')
const { pathToFileURL } = require('bare-url')
const Module = require('.')

const isWindows = Bare.platform === 'win32'

const root = isWindows ? 'file:///c:' : 'file://'

test('resolve bare specifier', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === root + '/node_modules/foo/package.json' ||
        url.href === root + '/node_modules/foo/index.js'
      )
    },

    read (url) {
      if (url.href === root + '/node_modules/foo/package.json') {
        return '{}'
      }

      t.fail()
    }
  })

  t.is(Module.resolve('foo', new URL(root + '/'), { protocol }).href, root + '/node_modules/foo/index.js')
})

test('load resolved bare specifier', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === root + '/node_modules/foo/package.json' ||
        url.href === root + '/node_modules/foo/index.js'
      )
    },

    read (url) {
      if (url.href === root + '/node_modules/foo/package.json') {
        return '{}'
      }

      if (url.href === root + '/node_modules/foo/index.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  t.is(Module.load(Module.resolve('foo', new URL(root + '/'), { protocol }), { protocol }).exports, 42)
})

test('load resolved bare specifier with source', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === root + '/node_modules/foo/package.json' ||
        url.href === root + '/node_modules/foo/index.js'
      )
    },

    read (url) {
      if (url.href === root + '/node_modules/foo/package.json') {
        return '{}'
      }

      t.fail()
    }
  })

  t.is(Module.load(Module.resolve('foo', new URL(root + '/'), { protocol }), 'module.exports = 42').exports, 42)
})

test('load .js', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    read (url) {
      if (url.href === root + '/index.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  t.is(Module.load(new URL(root + '/index.js'), { protocol }).exports, 42)
})

test('load .js with pkg.type module', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/package.json'
    },

    read (url) {
      if (url.href === root + '/index.js') {
        return 'export default 42'
      }

      if (url.href === root + '/package.json') {
        return '{ "type": "module" }'
      }

      t.fail()
    }
  })

  Module.load(new URL(root + '/index.js'), { protocol })
})

test('load .js with default type', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/bar.js'
    },

    read (url) {
      if (url.href === root + '/foo.js') {
        return 'export { default } from \'/bar.js\''
      }

      if (url.href === root + '/bar.js') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  t.is(Module.load(new URL(root + '/foo.js'), { protocol, defaultType: Module.constants.types.MODULE }).exports.default, 42)
})

test('load .cjs', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    read (url) {
      if (url.href === root + '/index.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  t.is(Module.load(new URL(root + '/index.cjs'), { protocol }).exports, 42)
})

test('load .cjs with bare specifier require', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === root + '/node_modules/foo/package.json' ||
        url.href === root + '/node_modules/foo/index.js'
      )
    },

    read (url) {
      if (url.href === root + '/index.cjs') {
        return 'module.exports = require(\'foo\')'
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

  t.is(Module.load(new URL(root + '/index.cjs'), { protocol }).exports, 42)
})

test('load .cjs with .mjs require', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/bar.mjs'
    },

    read (url) {
      if (url.href === root + '/foo.cjs') {
        return 'const bar = require(\'/bar\')'
      }

      if (url.href === root + '/bar.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  Module.load(new URL(root + '/foo.cjs'), { protocol })
})

test('load .cjs with top-level await', async (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    read (url) {
      if (url.href === root + '/index.cjs') {
        return 'await 42'
      }

      t.fail()
    }
  })

  await t.exception.all(() => Module.load(new URL(root + '/index.cjs'), { protocol }))
})

test('load .cjs with top-level await .mjs require', async (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/bar.mjs'
    },

    read (url) {
      if (url.href === root + '/foo.cjs') {
        return 'const bar = require(\'/bar\'); bar.default'
      }

      if (url.href === root + '/bar.mjs') {
        return 'export default await 42'
      }

      t.fail()
    }
  })

  await t.exception.all(() => Module.load(new URL(root + '/foo.cjs'), { protocol }), /cannot access 'default' before initialization/i)
})

test('load .cjs with top-level await .mjs require with throw', async (t) => {
  t.plan(1)
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/bar.mjs'
    },

    read (url) {
      if (url.href === root + '/foo.cjs') {
        return 'require(\'/bar\')'
      }

      if (url.href === root + '/bar.mjs') {
        return 'await 42; throw new Error(\'bar\')'
      }

      t.fail()
    }
  })

  Bare.once('uncaughtException', (err) => t.is(err.message, 'bar'))

  Module.load(new URL(root + '/foo.cjs'), { protocol })
})

test('load .cjs with non-file: URL', async (t) => {
  t.teardown(onteardown)

  const root = 'protocol:'

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/bar.mjs'
    },

    read (url) {
      if (url.href === root + '/foo.cjs') {
        return 'module.exports = __filename'
      }

      t.fail()
    }
  })

  const mod = Module.load(new URL(root + '/foo.cjs'), { protocol })

  t.is(mod.exports, '/foo.cjs')
})

test('load .mjs', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    read (url) {
      if (url.href === root + '/index.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  Module.load(new URL(root + '/index.mjs'), { protocol })
})

test('load .mjs with import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/foo.mjs'
    },

    read (url) {
      if (url.href === root + '/index.mjs') {
        return 'import foo from \'/foo.mjs\''
      }

      if (url.href === root + '/foo.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  Module.load(new URL(root + '/index.mjs'), { protocol })
})

test('load .mjs with .cjs import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/foo.cjs'
    },

    read (url) {
      if (url.href === root + '/index.mjs') {
        return 'import foo from \'/foo.cjs\''
      }

      if (url.href === root + '/foo.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  Module.load(new URL(root + '/index.mjs'), { protocol })
})

test('load .mjs with named .cjs import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/foo.cjs'
    },

    read (url) {
      if (url.href === root + '/index.mjs') {
        return 'import { foo } from \'/foo.cjs\''
      }

      if (url.href === root + '/foo.cjs') {
        return 'exports.foo = 42'
      }

      t.fail()
    }
  })

  Module.load(new URL(root + '/index.mjs'), { protocol })
})

test('load .mjs with named default .cjs import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/foo.cjs'
    },

    read (url) {
      if (url.href === root + '/index.mjs') {
        return 'import foo from \'/foo.cjs\'; export default foo'
      }

      if (url.href === root + '/foo.cjs') {
        return 'exports.default = 42'
      }

      t.fail()
    }
  })

  t.is(Module.load(new URL(root + '/index.mjs'), { protocol }).exports.default, 42)
})

test('load .mjs with .cjs import with reexports from .cjs import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === root + '/foo.cjs' ||
        url.href === root + '/bar.cjs'
      )
    },

    read (url) {
      if (url.href === root + '/index.mjs') {
        return 'import { bar } from \'/foo.cjs\''
      }

      if (url.href === root + '/foo.cjs') {
        return 'module.exports = require(\'/bar.cjs\')'
      }

      if (url.href === root + '/bar.cjs') {
        return 'exports.bar = 42'
      }

      t.fail()
    }
  })

  Module.load(new URL(root + '/index.mjs'), { protocol })
})

test('load .mjs with .cjs import with cyclic reexports from .cjs import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === root + '/foo.cjs' ||
        url.href === root + '/bar.cjs'
      )
    },

    read (url) {
      if (url.href === root + '/index.mjs') {
        return 'import \'/foo.cjs\''
      }

      if (url.href === root + '/foo.cjs') {
        return 'module.exports = require(\'/bar.cjs\')'
      }

      if (url.href === root + '/bar.cjs') {
        return 'module.exports = require(\'/foo.cjs\')'
      }

      t.fail()
    }
  })

  Module.load(new URL(root + '/index.mjs'), { protocol })
})

test('load .mjs with .cjs import with reexports from .mjs import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === root + '/foo.cjs' ||
        url.href === root + '/bar.mjs'
      )
    },

    read (url) {
      if (url.href === root + '/index.mjs') {
        return 'import { bar } from \'/foo.cjs\''
      }

      if (url.href === root + '/foo.cjs') {
        return 'module.exports = require(\'/bar.mjs\')'
      }

      if (url.href === root + '/bar.mjs') {
        return 'export const bar = 42'
      }

      t.fail()
    }
  })

  Module.load(new URL(root + '/index.mjs'), { protocol })
})

test('load .mjs with .cjs import with reexports from .json import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === root + '/foo.cjs' ||
        url.href === root + '/bar.json'
      )
    },

    read (url) {
      if (url.href === root + '/index.mjs') {
        return 'import { bar } from \'/foo.cjs\''
      }

      if (url.href === root + '/foo.cjs') {
        return 'module.exports = require(\'/bar.json\')'
      }

      if (url.href === root + '/bar.json') {
        return '{ "bar": 42 }'
      }

      t.fail()
    }
  })

  Module.load(new URL(root + '/index.mjs'), { protocol })
})

test('load .mjs with .js import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/foo.js'
    },

    read (url) {
      if (url.href === root + '/index.mjs') {
        return 'import foo from \'/foo.js\''
      }

      if (url.href === root + '/foo.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  Module.load(new URL(root + '/index.mjs'), { protocol })
})

test('load .mjs with missing import', async (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    read (url) {
      if (url.href === root + '/index.mjs') {
        return 'import foo from \'./foo\''
      }

      t.fail()
    }
  })

  await t.exception(() => Module.load(new URL(root + '/index.mjs'), { protocol }), /cannot find module '\.\/foo'/i)
})

test('load .mjs with nested import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === root + '/foo.mjs' ||
        url.href === root + '/bar.mjs' ||
        url.href === root + '/baz.mjs'
      )
    },

    read (url) {
      if (url.href === root + '/foo.mjs') {
        return 'import bar from \'/bar\'; export default 1'
      }

      if (url.href === root + '/bar.mjs') {
        return 'import baz from \'/baz\'; export default 2'
      }

      if (url.href === root + '/baz.mjs') {
        return 'export default 3'
      }

      t.fail()
    }
  })

  Module.load(new URL(root + '/foo.mjs'), { protocol })
})

test('load .mjs with cyclic import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/foo.mjs' || url.href === root + '/bar.mjs'
    },

    read (url) {
      if (url.href === root + '/foo.mjs') {
        return 'import bar from \'/bar\'; export default 1'
      }

      if (url.href === root + '/bar.mjs') {
        return 'import foo from \'/foo\'; export default 2'
      }

      t.fail()
    }
  })

  Module.load(new URL(root + '/foo.mjs'), { protocol })
})

test('load .mjs with top-level await', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    read (url) {
      if (url.href === root + '/index.mjs') {
        return 'await 42'
      }

      t.fail()
    }
  })

  Module.load(new URL(root + '/index.mjs'), { protocol })
})

test('load .mjs with top-level await .mjs import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/bar.mjs'
    },

    read (url) {
      if (url.href === root + '/foo.mjs') {
        return 'import bar from \'/bar\''
      }

      if (url.href === root + '/bar.mjs') {
        return 'export default await 42'
      }

      t.fail()
    }
  })

  Module.load(new URL(root + '/foo.mjs'), { protocol })
})

test('load .mjs with top-level await .mjs import with throw', (t) => {
  t.plan(1)
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/bar.mjs'
    },

    read (url) {
      if (url.href === root + '/foo.mjs') {
        return 'import \'/bar\''
      }

      if (url.href === root + '/bar.mjs') {
        return 'await 42; throw new Error(\'bar\')'
      }

      t.fail()
    }
  })

  Bare.once('uncaughtException', (err) => t.is(err.message, 'bar'))

  Module.load(new URL(root + '/foo.mjs'), { protocol })
})

test('load .cjs and .mjs from .mjs', (t) => {
  t.teardown(onteardown)

  const order = global.order = []

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === root + '/b.mjs' ||
        url.href === root + '/c.cjs' ||
        url.href === root + '/d.mjs' ||
        url.href === root + '/e.cjs'
      )
    },

    read (url) {
      if (url.href === root + '/a.mjs') {
        return 'order.push(\'a.mjs\'); import \'/b.mjs\'; import \'/c.cjs\'; import \'/d.mjs\'; import \'/e.cjs\''
      }

      if (url.href === root + '/b.mjs') {
        return 'order.push(\'b.mjs\')'
      }

      if (url.href === root + '/c.cjs') {
        return 'order.push(\'c.cjs\')'
      }

      if (url.href === root + '/d.mjs') {
        return 'order.push(\'d.mjs\')'
      }

      if (url.href === root + '/e.cjs') {
        return 'order.push(\'e.cjs\')'
      }

      t.fail()
    }
  })

  Module.load(new URL(root + '/a.mjs'), { protocol })

  delete global.order

  t.alike(order, [
    'b.mjs',
    'c.cjs',
    'd.mjs',
    'e.cjs',
    'a.mjs'
  ])
})

test('load .json', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/native.bare'
    },

    read (url) {
      if (url.href === root + '/index.json') {
        return '42'
      }

      t.fail()
    }
  })

  t.is(Module.load(new URL(root + '/index.json'), { protocol }).exports, 42)
})

test('load .cjs with .bare import', async (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href.endsWith('.bare')
    },

    read (url) {
      if (url.href === root + '/index.cjs') {
        return 'require(\'/native.bare\')'
      }

      t.fail()
    }
  })

  const resolutions = {
    [root + '/index.cjs']: {
      '/native.bare': 'file:///' + __dirname + '/prebuilds/' + Bare.Addon.host + '/bare-module.bare'
    }
  }

  Module.load(new URL(root + '/index.cjs'), { protocol, resolutions })
})

test('load .cjs with dynamic .bare import', async (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href.endsWith('.bare')
    },

    read (url) {
      if (url.href === root + '/index.cjs') {
        return 'import(\'/native.bare\')'
      }

      t.fail()
    }
  })

  const resolutions = {
    [root + '/index.cjs']: {
      '/native.bare': 'file:///' + __dirname + '/prebuilds/' + Bare.Addon.host + '/bare-module.bare'
    }
  }

  Module.load(new URL(root + '/index.cjs'), { protocol, resolutions })
})

test('load .mjs with .bare import', async (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href.endsWith('.bare')
    },

    read (url) {
      if (url.href === root + '/index.mjs') {
        return 'import \'/native.bare\''
      }

      t.fail()
    }
  })

  const resolutions = {
    [root + '/index.mjs']: {
      '/native.bare': 'file:///' + __dirname + '/prebuilds/' + Bare.Addon.host + '/bare-module.bare'
    }
  }

  Module.load(new URL(root + '/index.mjs'), { protocol, resolutions })
})

test('load .mjs with dynamic .bare import', async (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href.endsWith('.bare')
    },

    read (url) {
      if (url.href === root + '/index.mjs') {
        return 'await import(\'/native.bare\')'
      }

      t.fail()
    }
  })

  const resolutions = {
    [root + '/index.mjs']: {
      '/native.bare': 'file:///' + __dirname + '/prebuilds/' + Bare.Addon.host + '/bare-module.bare'
    }
  }

  Module.load(new URL(root + '/index.mjs'), { protocol, resolutions })
})

test('load .bundle', (t) => {
  t.teardown(onteardown)

  const bundle = new Module.Bundle()
    .write('/foo.js', 'module.exports = require(\'./bar\')', { main: true })
    .write('/bar.js', 'module.exports = 42')
    .toBuffer()

  Module.load(new URL(root + '/app.bundle'), bundle)
})

test('load .bundle with .mjs', (t) => {
  t.teardown(onteardown)

  const bundle = new Module.Bundle()
    .write('/foo.mjs', 'export { default } from \'./bar\'', { main: true })
    .write('/bar.mjs', 'export default 42')
    .toBuffer()

  Module.load(new URL(root + '/app.bundle'), bundle)
})

test('load .bundle with bare specifier', (t) => {
  t.teardown(onteardown)

  const bundle = new Module.Bundle()
    .write('/foo.js', 'module.exports = require(\'bar\')', { main: true })
    .write('/node_modules/bar/package.json', '{}')
    .write('/node_modules/bar/index.js', 'module.exports = 42')
    .toBuffer()

  Module.load(new URL(root + '/app.bundle'), bundle)
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

  Module.load(new URL(root + '/app.bundle'), bundle)
})

test('load .bundle with bare specifier and import map', (t) => {
  t.teardown(onteardown)

  const bundle = new Module.Bundle()
    .write('/foo.js', 'module.exports = require(\'baz\')', { main: true })
    .write('/bar.js', 'module.exports = 42', { alias: 'baz' })
    .toBuffer()

  t.is(Module.load(new URL(root + '/app.bundle'), bundle).exports, 42)
})

test.skip('load specific module within .bundle', (t) => {
  t.teardown(onteardown)

  const bundle = new Module.Bundle()
    .write('/foo.js', 'module.exports = require(\'./bar\')')
    .write('/bar.js', 'module.exports = 42')
    .toBuffer()

  const protocol = new Module.Protocol({
    read (url) {
      if (url.href === root + '/app.bundle') {
        return bundle
      }

      t.fail()
    }
  })

  t.is(Module.load(new URL(root + '/app.bundle/foo.js'), { protocol }).exports, 42)
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
    read (url) {
      if (url.href === root + '/foo.bundle') {
        return bundleB
      }

      t.fail()
    }
  })

  t.is(Module.load(new URL(root + '/foo.bundle/bar.bundle/bar.js'), { protocol }).exports, 42)
})

test.skip('load .bundle with type option and no .bundle extension', async (t) => {
  t.teardown(onteardown)

  const bundle = new Module.Bundle()
    .write('/foo.js', 'module.exports = 42', { main: true })
    .toBuffer()

  await t.exception(
    () => Module.load(new URL(root + '/app'), bundle, { type: Module.constants.types.BUNDLE }),
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

  Module.load(new URL(root + '/app.bundle'), bundle, { builtins })
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

  Module.load(new URL(root + '/app.bundle'), bundle.toBuffer())
})

test('load .bundle with resolutions map, missing entry', async (t) => {
  t.teardown(onteardown)

  const bundle = new Module.Bundle()
    .write('/dir/foo.js', 'module.exports = require(\'./bar\')', { main: true })
    .write('/dir/bar/index.js', 'module.exports = 42')

  bundle.resolutions = {
    '/dir/foo.js': {}
  }

  Module.load(new URL(root + '/app.bundle'), bundle.toBuffer())
})

test.skip('resolve specific module within .bundle', (t) => {
  t.teardown(onteardown)

  const bundle = new Module.Bundle()
    .write('/foo.js', 'module.exports = require(\'./bar\')')
    .write('/bar.js', 'module.exports = 42')
    .toBuffer()

  const protocol = new Module.Protocol({
    read (url) {
      if (url.href === root + '/app.bundle') {
        return bundle
      }

      t.fail()
    }
  })

  t.is(Module.resolve('/app.bundle/foo', new URL(root + '/'), { protocol }).href, root + '/app.bundle/foo.js')
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
    read (url) {
      if (url.href === root + '/foo.bundle') {
        return bundleB
      }

      t.fail()
    }
  })

  t.is(Module.resolve('/foo.bundle/bar.bundle/bar', new URL(root + '/'), { protocol }).href, root + '/foo.bundle/bar.bundle/bar.js')
})

test('load unknown extension', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    read (url) {
      if (url.href === root + '/index.foo') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  t.is(Module.load(new URL(root + '/index.foo'), { protocol }).exports, 42)
})

test('load unknown extension with default type', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    read (url) {
      if (url.href === root + '/index.foo') {
        return '42'
      }

      t.fail()
    }
  })

  t.is(Module.load(new URL(root + '/index.foo'), { protocol, defaultType: Module.constants.types.JSON }).exports, 42)
})

test('load .cjs with hashbang', (t) => {
  t.teardown(onteardown)

  t.execution(() => Module.load(new URL(root + '/index.cjs'), '#!node'))
})

test('load .mjs with hashbang', (t) => {
  t.teardown(onteardown)

  t.execution(() => Module.load(new URL(root + '/index.mjs'), '#!node'))
})

test('load .cjs with dynamic .mjs import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/bar.mjs'
    },

    read (url) {
      if (url.href === root + '/foo.cjs') {
        return 'const bar = import(\'/bar\')'
      }

      if (url.href === root + '/bar.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  Module.load(new URL(root + '/foo.cjs'), { protocol })
})

test('load .cjs with dynamic .cjs import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/bar.cjs'
    },

    read (url) {
      if (url.href === root + '/foo.cjs') {
        return 'const bar = import(\'/bar\')'
      }

      if (url.href === root + '/bar.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  Module.load(new URL(root + '/foo.cjs'), { protocol })
})

test('load .mjs with dynamic .mjs import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/bar.mjs'
    },

    read (url) {
      if (url.href === root + '/foo.mjs') {
        return 'const { default: bar } = await import(\'/bar\')'
      }

      if (url.href === root + '/bar.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  Module.load(new URL(root + '/foo.mjs'), { protocol })
})

test('load .mjs with dynamic .cjs import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/bar.cjs'
    },

    read (url) {
      if (url.href === root + '/foo.mjs') {
        return 'const { default: bar } = await import(\'/bar\')'
      }

      if (url.href === root + '/bar.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  Module.load(new URL(root + '/foo.mjs'), { protocol })
})

test('load .cjs with bare specifier require and import map', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/bar.cjs'
    },

    read (url) {
      if (url.href === root + '/foo.cjs') {
        return 'const bar = require(\'bar\')'
      }

      if (url.href === root + '/bar.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  Module.load(new URL(root + '/foo.cjs'), {
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
      return url.href === root + '/bar.mjs'
    },

    read (url) {
      if (url.href === root + '/foo.mjs') {
        return 'import bar from \'bar\''
      }

      if (url.href === root + '/bar.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  Module.load(new URL(root + '/foo.mjs'), {
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
      if (url.href === root + '/foo.cjs') {
        return `module.exports = require('data:,${encodeURIComponent('module.exports = 42')}')`
      }

      t.fail()
    }
  })

  t.is(Module.load(new URL(root + '/foo.cjs'), { protocol }).exports, 42)
})

test.skip('load .mjs with data: protocol import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    read (url) {
      if (url.href === root + '/foo.mjs') {
        return `export { default } from 'data:,${encodeURIComponent('export default 42')}'`
      }

      t.fail()
    }
  })

  t.is(Module.load(new URL(root + '/foo.mjs'), { protocol }).exports.default, 42)
})

test('import map with protocol', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/bar.mjs'
    },

    read (url) {
      if (url.href === root + '/foo.mjs') {
        return 'import bar from \'proto:bar\''
      }

      if (url.href === root + '/bar.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  Module.load(new URL(root + '/foo.mjs'), {
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
      return url.href === root + '/bar.js'
    },

    read (url) {
      if (url.href === root + '/foo.js') {
        return 'module.exports = require.main; require(\'/bar\')'
      }

      if (url.href === root + '/bar.js') {
        return 'module.exports = require.main'
      }

      t.fail()
    }
  })

  const foo = Module.load(new URL(root + '/foo.js'), { protocol })
  const bar = Module.load(new URL(root + '/bar.js'), { protocol })

  t.is(foo.exports, foo)
  t.is(bar.exports, foo)
})

test('require.addon.host', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    read (url) {
      if (url.href === root + '/foo.js') {
        return 'module.exports = require.addon.host'
      }

      t.fail()
    }
  })

  t.comment(Module.load(new URL(root + '/foo.js'), { protocol }).exports)
})

test('import.meta', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/bar.mjs'
    },

    read (url) {
      if (url.href === root + '/foo.mjs') {
        return 'export default import.meta'
      }

      t.fail()
    }
  })

  const { default: meta } = Module.load(new URL(root + '/foo.mjs'), { protocol }).exports

  t.is(meta.url, root + '/foo.mjs')
  t.is(meta.main, true)
  t.is(meta.resolve('/bar'), root + '/bar.mjs')
  t.comment(meta.addon.host)
})

test('import assertions', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/bar'
    },

    read (url) {
      if (url.href === root + '/foo.mjs') {
        return 'export { default } from \'/bar\' with { type: \'json\' }'
      }

      if (url.href === root + '/bar') {
        return '{ "hello": "world" }'
      }

      t.fail()
    }
  })

  t.alike(Module.load(new URL(root + '/foo.mjs'), { protocol }).exports.default, { hello: 'world' })
})

test('dynamic import assertions', async (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/bar'
    },

    read (url) {
      if (url.href === root + '/foo.mjs') {
        return 'export default import(\'/bar\', { with: { type: \'json\' } })'
      }

      if (url.href === root + '/bar') {
        return '{ "hello": "world" }'
      }

      t.fail()
    }
  })

  t.comment(await Module.load(new URL(root + '/foo.mjs'), { protocol }).exports.default)
})

test('require assertions', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/bar'
    },

    read (url) {
      if (url.href === root + '/foo.js') {
        return 'module.exports = require(\'/bar\', { with: { type: \'json\' } })'
      }

      if (url.href === root + '/bar') {
        return '{ "hello": "world" }'
      }

      t.fail()
    }
  })

  t.alike(Module.load(new URL(root + '/foo.js'), { protocol }).exports, { hello: 'world' })
})

test('createRequire', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/dir/bar.js'
    },

    read (url) {
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
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/dir/bar.js'
    },

    read (url) {
      if (url.href === root + '/dir/bar.js') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  const require = Module.createRequire(root + '/dir/foo.js', { protocol, defaultType: Module.constants.types.MODULE })

  t.is(require('./bar').default, 42)
})

test('main in package.json', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/package.json' || url.href === root + '/foo.js'
    },

    read (url) {
      if (url.href === root + '/package.json') {
        return '{ "main": "foo.js" }'
      }

      t.fail()
    }
  })

  t.is(Module.resolve('/', new URL(root + '/'), { protocol }).href, root + '/foo.js')
})

test('exports in package.json', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/package.json' || url.href === root + '/foo.js'
    },

    read (url) {
      if (url.href === root + '/package.json') {
        return '{ "exports": "./foo.js" }'
      }

      t.fail()
    }
  })

  t.is(Module.resolve('/', new URL(root + '/'), { protocol }).href, root + '/foo.js')
})

test('conditional exports in package.json', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === root + '/package.json' ||
        url.href === root + '/foo.cjs' ||
        url.href === root + '/foo.mjs'
      )
    },

    read (url) {
      if (url.href === root + '/package.json') {
        return '{ "exports": { "require": "./foo.cjs", "import": "./foo.mjs" } }'
      }

      t.fail()
    }
  })

  t.is(Module.resolve('/', new URL(root + '/'), { protocol }).href, root + '/foo.cjs')
  t.is(Module.resolve('/', new URL(root + '/'), { isImport: true, protocol }).href, root + '/foo.mjs')
})

test('conditional exports in package.json, array of conditions', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === root + '/package.json' ||
        url.href === root + '/foo.cjs' ||
        url.href === root + '/foo.mjs'
      )
    },

    read (url) {
      if (url.href === root + '/package.json') {
        return '{ "exports": [{ "import": "./foo.mjs" }, { "require": "./foo.cjs" }] }'
      }

      t.fail()
    }
  })

  t.is(Module.resolve('/', new URL(root + '/'), { protocol }).href, root + '/foo.cjs')
  t.is(Module.resolve('/', new URL(root + '/'), { isImport: true, protocol }).href, root + '/foo.mjs')
})

test('conditional exports in package.json, runtime condition', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === root + '/package.json' ||
        url.href === root + '/foo.bare.js' ||
        url.href === root + '/foo.node.js'
      )
    },

    read (url) {
      if (url.href === root + '/package.json') {
        return '{ "exports": { "bare": "./foo.bare.js", "node": "./foo.node.js" } }'
      }

      t.fail()
    }
  })

  t.is(Module.resolve('/', new URL(root + '/'), { protocol }).href, root + '/foo.bare.js')
})

test('conditional exports in package.json, platform condition', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === root + '/package.json' ||
        url.href === root + '/foo.darwin.js' ||
        url.href === root + '/foo.linux.js' ||
        url.href === root + '/foo.win32.js'
      )
    },

    read (url) {
      if (url.href === root + '/package.json') {
        return '{ "exports": { "darwin": "./foo.darwin.js", "linux": "./foo.linux.js", "win32": "./foo.win32.js" } }'
      }

      t.fail()
    }
  })

  t.is(Module.resolve('/', new URL(root + '/'), { protocol }).href, root + '/foo.' + Bare.platform + '.js')
})

test('conditional exports in package.json, architecture condition', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === root + '/package.json' ||
        url.href === root + '/foo.arm64.js' ||
        url.href === root + '/foo.x64.js'
      )
    },

    read (url) {
      if (url.href === root + '/package.json') {
        return '{ "exports": { "arm64": "./foo.arm64.js", "x64": "./foo.x64.js" } }'
      }

      t.fail()
    }
  })

  t.is(Module.resolve('/', new URL(root + '/'), { protocol }).href, root + '/foo.' + Bare.arch + '.js')
})

test('exports in node_modules', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === root + '/node_modules/foo/package.json' ||
        url.href === root + '/node_modules/foo/foo.js'
      )
    },

    read (url) {
      if (url.href === root + '/node_modules/foo/package.json') {
        return '{ "exports": "./foo.js" }'
      }

      t.fail()
    }
  })

  t.is(Module.resolve('foo', new URL(root + '/'), { protocol }).href, root + '/node_modules/foo/foo.js')
})

test('import unexported module in node_modules', async (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === root + '/node_modules/foo/package.json' ||
        url.href === root + '/node_modules/foo/foo.js' ||
        url.href === root + '/node_modules/foo/bar.js'
      )
    },

    read (url) {
      if (url.href === root + '/node_modules/foo/package.json') {
        return '{ "exports": "./foo.js" }'
      }

      t.fail()
    }
  })

  await t.exception(() => Module.resolve('foo/bar', new URL(root + '/'), { protocol }))
})

test('imports in package.json', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === root + '/package.json' ||
        url.href === root + '/baz.js'
      )
    },

    read (url) {
      if (url.href === root + '/package.json') {
        return '{ "imports": { "bar": "./baz.js" } }'
      }

      if (url.href === root + '/foo.js') {
        return 'const bar = require(\'bar\')'
      }

      if (url.href === root + '/baz.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  Module.load(new URL(root + '/foo.js'), { protocol })
})

test('imports in package.json, no match', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === root + '/package.json' ||
        url.href === root + '/baz.js'
      )
    },

    read (url) {
      if (url.href === root + '/package.json') {
        return '{ "imports": { "bar": "./baz.js" } }'
      }

      if (url.href === root + '/foo.js') {
        return 'const bar = require(\'./baz\')'
      }

      if (url.href === root + '/baz.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  Module.load(new URL(root + '/foo.js'), { protocol })
})

test('conditional imports in package.json, require', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === root + '/package.json' ||
        url.href === root + '/baz.cjs' ||
        url.href === root + '/baz.mjs'
      )
    },

    read (url) {
      if (url.href === root + '/package.json') {
        return '{ "imports": { "bar": { "require": "./baz.cjs", "import": "./baz.mjs" } } }'
      }

      if (url.href === root + '/foo.cjs') {
        return 'const bar = require(\'bar\')'
      }

      if (url.href === root + '/baz.cjs') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  Module.load(new URL(root + '/foo.cjs'), { protocol })
})

test('conditional imports in package.json, import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === root + '/package.json' ||
        url.href === root + '/baz.cjs' ||
        url.href === root + '/baz.mjs'
      )
    },

    read (url) {
      if (url.href === root + '/package.json') {
        return '{ "imports": { "bar": { "require": "./baz.cjs", "import": "./baz.mjs" } } }'
      }

      if (url.href === root + '/foo.mjs') {
        return 'import bar from \'bar\''
      }

      if (url.href === root + '/baz.mjs') {
        return 'export default 42'
      }

      t.fail()
    }
  })

  Module.load(new URL(root + '/foo.mjs'), { protocol })
})

test('conditional imports in package.json, asset', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === root + '/package.json' ||
        url.href === root + '/bar.txt'
      )
    },

    read (url) {
      if (url.href === root + '/package.json') {
        return '{ "imports": { "bar": { "asset": "./bar.txt" } } }'
      }

      if (url.href === root + '/foo.cjs') {
        return 'module.exports = require.asset(\'bar\')'
      }

      if (url.href === root + '/bar.txt') {
        return 'hello world'
      }

      t.fail()
    }
  })

  t.is(Module.load(new URL(root + '/foo.cjs'), { protocol }).exports, isWindows ? 'c:\\bar.txt' : '/bar.txt')
})

test('conditional imports in package.json, asset and default', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === root + '/package.json' ||
        url.href === root + '/bar.txt' ||
        url.href === root + '/bar.js'
      )
    },

    read (url) {
      if (url.href === root + '/package.json') {
        return '{ "imports": { "bar": { "asset": "./bar.txt", "default": "./bar.js" } } }'
      }

      if (url.href === root + '/foo.cjs') {
        return 'module.exports = [require.asset(\'bar\'), require(\'bar\')]'
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

  t.alike(Module.load(new URL(root + '/foo.cjs'), { protocol }).exports, [isWindows ? 'c:\\bar.txt' : '/bar.txt', 42])
})

test('conditional imports in package.json, asset and require without default', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === root + '/package.json' ||
        url.href === root + '/bar.txt' ||
        url.href === root + '/bar.js'
      )
    },

    read (url) {
      if (url.href === root + '/package.json') {
        return '{ "imports": { "bar": { "asset": "./bar.txt" } } }'
      }

      if (url.href === root + '/foo.cjs') {
        return 'module.exports = require(\'bar\')'
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

  try {
    Module.load(new URL(root + '/foo.cjs'), { protocol })
    t.fail()
  } catch (err) {
    t.comment(err.message)
  }
})

test('imports in node_modules', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === root + '/node_modules/foo/package.json' ||
        url.href === root + '/node_modules/foo/baz.js'
      )
    },

    read (url) {
      if (url.href === root + '/node_modules/foo/package.json') {
        return '{ "imports": { "bar": "./baz.js" } }'
      }

      if (url.href === root + '/node_modules/foo/foo.js') {
        return 'const bar = require(\'bar\')'
      }

      if (url.href === root + '/node_modules/foo/baz.js') {
        return 'module.exports = 42'
      }

      t.fail()
    }
  })

  Module.load(new URL(root + '/node_modules/foo/foo.js'), { protocol })
})

test('resolve and load builtin', (t) => {
  t.teardown(onteardown)

  const builtins = {
    foo: 42
  }

  t.is(Module.resolve('foo', new URL(root + '/'), { builtins }).href, 'builtin:foo')
  t.is(Module.load(new URL('builtin:foo'), { builtins }).exports, 42)
})

test('load builtin from .cjs', (t) => {
  t.teardown(onteardown)

  const builtins = {
    bar: 42
  }

  const protocol = new Module.Protocol({
    read (url) {
      if (url.href === root + '/foo.cjs') {
        return 'module.exports = require(\'bar\')'
      }

      t.fail()
    }
  })

  t.is(Module.load(new URL(root + '/foo.cjs'), { protocol, builtins }).exports, 42)
})

test('load builtin from .mjs', (t) => {
  t.teardown(onteardown)

  const builtins = {
    bar: 42
  }

  const protocol = new Module.Protocol({
    read (url) {
      if (url.href === root + '/foo.mjs') {
        return 'export { default } from \'bar\''
      }

      t.fail()
    }
  })

  t.is(Module.load(new URL(root + '/foo.mjs'), { protocol, builtins }).exports.default, 42)
})

test('load file that cannot be read', async (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/foo.cjs'
    },

    read () {
      throw new Error('file missing')
    }
  })

  await t.exception(() => Module.load(new URL(root + '/foo.cjs'), { protocol }), /file missing/)
})

test('resolve already valid URL', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      t.is(url.href, root + '/bar.js')

      return true
    }
  })

  Module.resolve(root + '/bar.js', new URL(root + '/foo.js'), { protocol })
})

test('pkg.engines with valid range', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === root + '/node_modules/foo/package.json' ||
        url.href === root + '/node_modules/foo/index.js'
      )
    },

    read (url) {
      if (url.href === root + '/node_modules/foo/package.json') {
        return `{ "engines": { "bare": ">=${Bare.versions.bare}" } }`
      }

      t.fail()
    }
  })

  t.is(Module.resolve('foo', new URL(root + '/'), { protocol }).href, root + '/node_modules/foo/index.js')
})

test('pkg.engines with invalid range', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return (
        url.href === root + '/node_modules/foo/package.json' ||
        url.href === root + '/node_modules/foo/index.js'
      )
    },

    read (url) {
      if (url.href === root + '/node_modules/foo/package.json') {
        return `{ "engines": { "bare": "<${Bare.versions.bare}" } }`
      }

      t.fail()
    }
  })

  try {
    Module.resolve('foo', new URL(root + '/'), { protocol })
    t.fail()
  } catch (err) {
    t.comment(err.message)
  }
})

test('throw in .cjs', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    read (url) {
      if (url.href === root + '/foo.cjs') {
        return 'throw new Error(\'foo\')'
      }

      t.fail()
    }
  })

  try {
    Module.load(new URL(root + '/foo.cjs'), { protocol })
    t.fail()
  } catch (err) {
    t.comment(err.message)
  }
})

test('throw in .cjs imported from .cjs', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/bar.cjs'
    },

    read (url) {
      if (url.href === root + '/foo.cjs') {
        return 'require(\'/bar.cjs\')'
      }

      if (url.href === root + '/bar.cjs') {
        return 'throw new Error(\'bar\')'
      }

      t.fail()
    }
  })

  try {
    Module.load(new URL(root + '/foo.cjs'), { protocol })
    t.fail()
  } catch (err) {
    t.comment(err.message)
  }
})

test('throw in .cjs, load again', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    read (url) {
      if (url.href === root + '/foo.cjs') {
        return 'throw new Error(\'foo\')'
      }

      t.fail()
    }
  })

  try {
    Module.load(new URL(root + '/foo.cjs'), { protocol })
    t.fail()
  } catch (err) {
    t.comment(err.message)
  }

  try {
    Module.load(new URL(root + '/foo.cjs'), { protocol })
    t.fail()
  } catch (err) {
    t.comment(err.message)
  }
})

test('throw in .mjs', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    read (url) {
      if (url.href === root + '/foo.mjs') {
        return 'throw new Error(\'foo\')'
      }

      t.fail()
    }
  })

  try {
    Module.load(new URL(root + '/foo.mjs'), { protocol })
    t.fail()
  } catch (err) {
    t.comment(err.message)
  }
})

test('throw in .mjs imported from .mjs', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/bar.mjs'
    },

    read (url) {
      if (url.href === root + '/foo.mjs') {
        return 'import \'/bar.mjs\''
      }

      if (url.href === root + '/bar.mjs') {
        return 'throw new Error(\'bar\')'
      }

      t.fail()
    }
  })

  try {
    Module.load(new URL(root + '/foo.mjs'), { protocol })
    t.fail()
  } catch (err) {
    t.comment(err.message)
  }
})

test('throw in .mjs, load again', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    read (url) {
      if (url.href === root + '/foo.mjs') {
        return 'throw new Error(\'foo\')'
      }

      t.fail()
    }
  })

  try {
    Module.load(new URL(root + '/foo.mjs'), { protocol })
    t.fail()
  } catch (err) {
    t.comment(err.message)
  }

  try {
    Module.load(new URL(root + '/foo.mjs'), { protocol })
    t.fail()
  } catch (err) {
    t.comment(err.message)
  }
})

test('type error in .cjs', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    read (url) {
      if (url.href === root + '/foo.cjs') {
        return 'null.foo()'
      }

      t.fail()
    }
  })

  try {
    Module.load(new URL(root + '/foo.cjs'), { protocol })
    t.fail()
  } catch (err) {
    t.comment(err.message)
  }
})

test('type error in .cjs imported from .cjs', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/bar.cjs'
    },

    read (url) {
      if (url.href === root + '/foo.cjs') {
        return 'require(\'/bar.cjs\')'
      }

      if (url.href === root + '/bar.cjs') {
        return 'null.foo()'
      }

      t.fail()
    }
  })

  try {
    Module.load(new URL(root + '/foo.cjs'), { protocol })
    t.fail()
  } catch (err) {
    t.comment(err.message)
  }
})

test('type error in .cjs imported from .mjs', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/bar.cjs'
    },

    read (url) {
      if (url.href === root + '/foo.mjs') {
        return 'import bar from \'/bar.cjs\''
      }

      if (url.href === root + '/bar.cjs') {
        return 'null.foo()'
      }

      t.fail()
    }
  })

  try {
    Module.load(new URL(root + '/foo.mjs'), { protocol })
    t.fail()
  } catch (err) {
    t.comment(err.message)
  }
})

test('type error in .cjs imported from .mjs with type error', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/bar.cjs'
    },

    read (url) {
      if (url.href === root + '/foo.mjs') {
        return 'import \'/bar.cjs\'; null.foo()'
      }

      if (url.href === root + '/bar.cjs') {
        return 'null.bar()'
      }

      t.fail()
    }
  })

  try {
    Module.load(new URL(root + '/foo.mjs'), { protocol })
    t.fail()
  } catch (err) {
    t.comment(err.message)
    t.ok(/reading 'bar'/i.test(err.message))
  }
})

test('type error in .cjs imported from .mjs with type error and top-level await', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/bar.cjs'
    },

    read (url) {
      if (url.href === root + '/foo.mjs') {
        return 'import \'/bar.cjs\'; await 42; null.foo()'
      }

      if (url.href === root + '/bar.cjs') {
        return 'null.bar()'
      }

      t.fail()
    }
  })

  try {
    Module.load(new URL(root + '/foo.mjs'), { protocol })
    t.fail()
  } catch (err) {
    t.comment(err.message)
    t.ok(/reading 'bar'/i.test(err.message))
  }
})

test('type error in .cjs, load again', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    read (url) {
      if (url.href === root + '/foo.cjs') {
        return 'null.foo()'
      }

      t.fail()
    }
  })

  try {
    Module.load(new URL(root + '/foo.cjs'), { protocol })
    t.fail()
  } catch (err) {
    t.comment(err.message)
  }

  try {
    Module.load(new URL(root + '/foo.cjs'), { protocol })
    t.fail()
  } catch (err) {
    t.comment(err.message)
  }
})

test('type error in .mjs', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    read (url) {
      if (url.href === root + '/foo.mjs') {
        return 'null.foo()'
      }

      t.fail()
    }
  })

  try {
    Module.load(new URL(root + '/foo.mjs'), { protocol })
    t.fail()
  } catch (err) {
    t.comment(err.message)
  }
})

test('type error in .mjs imported from .mjs', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/bar.mjs'
    },

    read (url) {
      if (url.href === root + '/foo.mjs') {
        return 'import \'/bar.mjs\''
      }

      if (url.href === root + '/bar.mjs') {
        return 'null.foo()'
      }

      t.fail()
    }
  })

  try {
    Module.load(new URL(root + '/foo.mjs'), { protocol })
    t.fail()
  } catch (err) {
    t.comment(err.message)
  }
})

test('type error in .mjs imported from .mjs with type error', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/bar.mjs'
    },

    read (url) {
      if (url.href === root + '/foo.mjs') {
        return 'import \'/bar.mjs\'; null.foo()'
      }

      if (url.href === root + '/bar.mjs') {
        return 'null.bar()'
      }

      t.fail()
    }
  })

  try {
    Module.load(new URL(root + '/foo.mjs'), { protocol })
    t.fail()
  } catch (err) {
    t.comment(err.message)
    t.ok(/reading 'bar'/i.test(err.message))
  }
})

test('type error in .mjs imported from .mjs with type error and top-level await', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/bar.mjs'
    },

    read (url) {
      if (url.href === root + '/foo.mjs') {
        return 'import \'/bar.mjs\'; await 42; null.foo()'
      }

      if (url.href === root + '/bar.mjs') {
        return 'null.bar()'
      }

      t.fail()
    }
  })

  try {
    Module.load(new URL(root + '/foo.mjs'), { protocol })
    t.fail()
  } catch (err) {
    t.comment(err.message)
    t.ok(/reading 'bar'/i.test(err.message))
  }
})

test('syntax error in .cjs', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    read (url) {
      if (url.href === root + '/foo.cjs') {
        return 'foo bar'
      }

      t.fail()
    }
  })

  try {
    Module.load(new URL(root + '/foo.cjs'), { protocol })
    t.fail()
  } catch (err) {
    t.comment(err.message)
  }
})

test('syntax error in .cjs, load again', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    read (url) {
      if (url.href === root + '/foo.cjs') {
        return 'foo bar'
      }

      t.fail()
    }
  })

  try {
    Module.load(new URL(root + '/foo.cjs'), { protocol })
    t.fail()
  } catch (err) {
    t.comment(err.message)
  }

  try {
    Module.load(new URL(root + '/foo.cjs'), { protocol })
    t.fail()
  } catch (err) {
    t.comment(err.message)
  }
})

test('syntax error in .cjs imported from .cjs', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/bar.cjs'
    },

    read (url) {
      if (url.href === root + '/foo.cjs') {
        return 'require(\'/bar.cjs\')'
      }

      if (url.href === root + '/bar.cjs') {
        return 'foo bar'
      }

      t.fail()
    }
  })

  try {
    Module.load(new URL(root + '/foo.cjs'), { protocol })
    t.fail()
  } catch (err) {
    t.comment(err.message)
  }
})

test('syntax error in .mjs', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    read (url) {
      if (url.href === root + '/foo.mjs') {
        return 'foo bar'
      }

      t.fail()
    }
  })

  try {
    Module.load(new URL(root + '/foo.mjs'), { protocol })
    t.fail()
  } catch (err) {
    t.comment(err.message)
  }
})

test('syntax error in .mjs imported from .mjs', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/bar.mjs'
    },

    read (url) {
      if (url.href === root + '/foo.mjs') {
        return 'import \'/bar.mjs\''
      }

      if (url.href === root + '/bar.mjs') {
        return 'foo bar'
      }

      t.fail()
    }
  })

  try {
    Module.load(new URL(root + '/foo.mjs'), { protocol })
    t.fail()
  } catch (err) {
    t.comment(err.message)
  }
})

test('load file: URL using the default protocol', (t) => {
  t.teardown(onteardown)

  t.is(Module.load(pathToFileURL('test/fixtures/foo.js')).exports, 42)
})

test('load non-file: URL using the default protocol', (t) => {
  t.teardown(onteardown)

  t.is(Module.load(new URL('foo:/foo.js'), 'module.exports = 42').exports, 42)
})

test('load non-file: URL with missing import using the default protocol', (t) => {
  t.teardown(onteardown)

  try {
    Module.load(new URL('foo:/foo.js'), 'module.exports = require(\'./bar.js\')')
    t.fail()
  } catch (err) {
    t.comment(err.message)
  }
})

test('extend the default protocol', (t) => {
  t.teardown(onteardown)

  const protocol = Module.protocol.extend({
    read (context, url) {
      const buffer = context.read(url)

      if (url.href.endsWith('/test/fixtures/bar.js')) {
        return Buffer.from('module.exports = \'modified\'')
      }

      return buffer
    }
  })

  t.is(Module.load(pathToFileURL('test/fixtures/foo.js'), { protocol }).exports, 'modified')
})

test('load .js with asset import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/foo.txt'
    },

    read (url) {
      if (url.href === root + '/index.js') {
        return 'module.exports = require.asset(\'./foo.txt\')'
      }

      t.fail()
    }
  })

  t.is(Module.load(new URL(root + '/index.js'), { protocol }).exports, isWindows ? 'c:\\foo.txt' : '/foo.txt')
})

test('load .cjs with asset import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/foo.txt'
    },

    read (url) {
      if (url.href === root + '/index.cjs') {
        return 'module.exports = require.asset(\'./foo.txt\')'
      }

      t.fail()
    }
  })

  t.is(Module.load(new URL(root + '/index.cjs'), { protocol }).exports, isWindows ? 'c:\\foo.txt' : '/foo.txt')
})

test('load .mjs with asset import', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/foo.txt'
    },

    read (url) {
      if (url.href === root + '/index.mjs') {
        return 'export default import.meta.asset(\'./foo.txt\')'
      }

      t.fail()
    }
  })

  t.is(Module.load(new URL(root + '/index.mjs'), { protocol }).exports.default, root + '/foo.txt')
})

test('load .js with asset import, asset method', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/foo.txt'
    },

    read (url) {
      if (url.href === root + '/index.js') {
        return 'module.exports = require.asset(\'./foo.txt\')'
      }

      t.fail()
    },

    asset (url) {
      if (url.href === root + '/foo.txt') {
        return new URL(root + '/bar.txt')
      }

      return url
    }
  })

  t.is(Module.load(new URL(root + '/index.js'), { protocol }).exports, isWindows ? 'c:\\bar.txt' : '/bar.txt')
})

test('load .bundle with asset import', (t) => {
  t.teardown(onteardown)

  const bundle = new Module.Bundle()
    .write('/foo.js', 'module.exports = require.asset(\'./bar.txt\')', { main: true })
    .write('/bar.txt', 'hello world', { asset: true })
    .toBuffer()

  t.is(Module.load(new URL(root + '/app.bundle'), bundle).exports, isWindows ? 'c:\\app.bundle\\bar.txt' : '/app.bundle/bar.txt')
})

test('load .bundle with asset import, asset method', (t) => {
  t.teardown(onteardown)

  const bundle = new Module.Bundle()
    .write('/foo.js', 'module.exports = require.asset(\'./bar.txt\')', { main: true })
    .write('/bar.txt', 'hello world', { asset: true })
    .toBuffer()

  const protocol = new Module.Protocol({
    asset (url) {
      if (url.href === root + '/app.bundle/bar.txt') {
        return new URL(root + '/bar.txt')
      }

      return url
    }
  })

  t.is(Module.load(new URL(root + '/app.bundle'), bundle, { protocol }).exports, isWindows ? 'c:\\bar.txt' : '/bar.txt')
})

test('load .bundle with asset import, resolutions map', (t) => {
  t.teardown(onteardown)

  const bundle = new Module.Bundle()
    .write('/foo.js', 'module.exports = require.asset(\'./bar.txt\')', { main: true })
    .write('/baz.txt', 'hello world', { asset: true })

  bundle.resolutions = {
    '/foo.js': {
      './bar.txt': {
        asset: '/baz.txt'
      }
    }
  }

  t.is(Module.load(new URL(root + '/app.bundle'), bundle.toBuffer()).exports, isWindows ? 'c:\\app.bundle\\baz.txt' : '/app.bundle/baz.txt')
})

test('load .bundle with asset import, resolutions map pointing outside .bundle', (t) => {
  t.teardown(onteardown)

  const protocol = new Module.Protocol({
    exists (url) {
      return url.href === root + '/bar.txt'
    }
  })

  const bundle = new Module.Bundle()
    .write('/foo.js', 'module.exports = require.asset(\'./bar.txt\')', { main: true })
    .write('/baz.txt', 'hello world', { asset: true })

  bundle.resolutions = {
    '/foo.js': {
      './bar.txt': {
        asset: root + '/bar.txt'
      }
    }
  }

  t.is(Module.load(new URL(root + '/app.bundle'), bundle.toBuffer(), { protocol }).exports, isWindows ? 'c:\\bar.txt' : '/bar.txt')
})

function onteardown () {
  // TODO Provide a public API for clearing the cache.
  Module._cache = Object.create(null)
}
