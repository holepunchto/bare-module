const test = require('brittle')
const Module = require('..')
const { host, root, sources } = require('./helpers')

test('load .cjs with .mjs require', async (t) => {
  const protocol = sources({
    [root + '/foo.cjs']: "const bar = require('/bar')",
    [root + '/bar.mjs']: 'export default 42'
  })

  await t.execution(Module.load(new URL(root + '/foo.cjs'), { protocol }))
})

test('load .mjs with import', async (t) => {
  const protocol = sources({
    [root + '/index.mjs']: "import foo from '/foo.mjs'",
    [root + '/foo.mjs']: 'export default 42'
  })

  await t.execution(Module.load(new URL(root + '/index.mjs'), { protocol }))
})

test('load .mjs with .js import', async (t) => {
  const protocol = sources({
    [root + '/index.mjs']: "import foo from '/foo.js'",
    [root + '/foo.js']: 'module.exports = 42'
  })

  await t.execution(Module.load(new URL(root + '/index.mjs'), { protocol }))
})

test('load .mjs with .cjs import', async (t) => {
  const protocol = sources({
    [root + '/index.mjs']: "import foo from '/foo.cjs'",
    [root + '/foo.cjs']: 'module.exports = 42'
  })

  await t.execution(Module.load(new URL(root + '/index.mjs'), { protocol }))
})

test('load .mjs with named .cjs import', async (t) => {
  const protocol = sources({
    [root + '/index.mjs']: "import { foo } from '/foo.cjs'",
    [root + '/foo.cjs']: 'exports.foo = 42'
  })

  await t.execution(Module.load(new URL(root + '/index.mjs'), { protocol }))
})

test('load .mjs with named default .cjs import', async (t) => {
  const protocol = sources({
    [root + '/index.mjs']: "import foo from '/foo.cjs'; export default foo",
    [root + '/foo.cjs']: 'exports.default = 42'
  })

  const { exports } = await Module.load(new URL(root + '/index.mjs'), { protocol })

  t.is(exports.default, 42)
})

test('load .mjs with .cjs import with reexports from .cjs import', async (t) => {
  const protocol = sources({
    [root + '/index.mjs']: "import { bar } from '/foo.cjs'",
    [root + '/foo.cjs']: "module.exports = require('/bar.cjs')",
    [root + '/bar.cjs']: 'exports.bar = 42'
  })

  await t.execution(Module.load(new URL(root + '/index.mjs'), { protocol }))
})

test('load .mjs with .cjs import with cyclic reexports from .cjs import', async (t) => {
  const protocol = sources({
    [root + '/index.mjs']: "import '/foo.cjs'",
    [root + '/foo.cjs']: "module.exports = require('/bar.cjs')",
    [root + '/bar.cjs']: "module.exports = require('/foo.cjs')"
  })

  await t.execution(Module.load(new URL(root + '/index.mjs'), { protocol }))
})

test('load .mjs with .cjs import with reexports from .mjs import', async (t) => {
  const protocol = sources({
    [root + '/index.mjs']: "import { bar } from '/foo.cjs'",
    [root + '/foo.cjs']: "module.exports = require('/bar.mjs')",
    [root + '/bar.mjs']: 'export const bar = 42'
  })

  await t.execution(Module.load(new URL(root + '/index.mjs'), { protocol }))
})

test('load .mjs with .cjs import with reexports from .json import', async (t) => {
  const protocol = sources({
    [root + '/index.mjs']: "import { bar } from '/foo.cjs'",
    [root + '/foo.cjs']: "module.exports = require('/bar.json')",
    [root + '/bar.json']: '{ "bar": 42 }'
  })

  await t.execution(Module.load(new URL(root + '/index.mjs'), { protocol }))
})

test('load .mjs with nested import', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']: "import bar from '/bar'; export default 1",
    [root + '/bar.mjs']: "import baz from '/baz'; export default 2",
    [root + '/baz.mjs']: 'export default 3'
  })

  await t.execution(Module.load(new URL(root + '/foo.mjs'), { protocol }))
})

test('load .mjs with cyclic import', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']: "import bar from '/bar'; export default 1",
    [root + '/bar.mjs']: "import foo from '/foo'; export default 2"
  })

  await t.execution(Module.load(new URL(root + '/foo.mjs'), { protocol }))
})

test('load .cjs and .mjs from .mjs', async (t) => {
  const order = (global.order = [])

  const protocol = sources({
    [root + '/a.mjs']:
      "order.push('a.mjs'); import '/b.mjs'; import '/c.cjs'; import '/d.mjs'; import '/e.cjs'",
    [root + '/b.mjs']: "order.push('b.mjs')",
    [root + '/c.cjs']: "order.push('c.cjs')",
    [root + '/d.mjs']: "order.push('d.mjs')",
    [root + '/e.cjs']: "order.push('e.cjs')"
  })

  await Module.load(new URL(root + '/a.mjs'), { protocol })

  delete global.order

  t.alike(order, ['b.mjs', 'c.cjs', 'd.mjs', 'e.cjs', 'a.mjs'])
})

test('load .cjs with top-level await', async (t) => {
  const protocol = sources({
    [root + '/index.cjs']: 'await 42'
  })

  await t.exception.all(Module.load(new URL(root + '/index.cjs'), { protocol }), /SyntaxError/)
})

test('load .cjs with top-level await .mjs require', async (t) => {
  const protocol = sources({
    [root + '/foo.cjs']: "const bar = require('/bar'); bar.default",
    [root + '/bar.mjs']: 'export default await 42'
  })

  await t.exception.all(Module.load(new URL(root + '/foo.cjs'), { protocol }), /ReferenceError/)
})

test('load .cjs with top-level await .mjs require with throw', async (t) => {
  const protocol = sources({
    [root + '/foo.cjs']: "require('/bar')",
    [root + '/bar.mjs']: "await 42; throw new Error('bar')"
  })

  await t.exception.all(Module.load(new URL(root + '/foo.cjs'), { protocol }), /Error: bar/)
})

test('load .mjs with top-level await', async (t) => {
  const protocol = sources({
    [root + '/index.mjs']: 'await 42'
  })

  await t.execution(Module.load(new URL(root + '/index.mjs'), { protocol }))
})

test('load .mjs with top-level await .mjs import', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']: "import bar from '/bar'",
    [root + '/bar.mjs']: 'export default await 42'
  })

  await t.execution(Module.load(new URL(root + '/foo.mjs'), { protocol }))
})

test('load .mjs with top-level await .mjs import with throw', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']: "import '/bar'",
    [root + '/bar.mjs']: "await 42; throw new Error('bar')"
  })

  await t.exception.all(Module.load(new URL(root + '/foo.mjs'), { protocol }), /Error: bar/)
})

test('export names are gathered through a resolution the map cannot be read for', (t) => {
  const [platform] = host.split('-')
  const otherHost = platform === 'linux' ? 'darwin-arm64' : 'linux-x64'

  const protocol = sources({
    [root + '/index.mjs']: `import { fromHost } from './re.cjs'\nexport default fromHost`,
    [root + '/re.cjs']: `module.exports = require('bar')`,
    [root + '/node_modules/bar/package.json']: JSON.stringify({
      name: 'bar',
      version: '1.0.0',
      exports: { '.': { [platform]: './host.cjs', default: './other.cjs' } }
    }),
    [root + '/node_modules/bar/host.cjs']: `exports.fromHost = 'host'`,
    [root + '/node_modules/bar/other.cjs']: `exports.fromOther = 'other'`
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
