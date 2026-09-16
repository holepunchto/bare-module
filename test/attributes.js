const test = require('brittle')
const Module = require('..')
const { root, sources } = require('./helpers')

test('import attributes', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']: "export { default } from '/bar' with { type: 'json' }",
    [root + '/bar']: '{ "hello": "world" }'
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.alike(exports.default, { hello: 'world' })
})

test('dynamic import attributes', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']: "export default await import('/bar', { with: { type: 'json' } })",
    [root + '/bar']: '{ "hello": "world" }'
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.alike(exports.default.default, { hello: 'world' })
})

test('require attributes', async (t) => {
  const protocol = sources({
    [root + '/foo.js']: "module.exports = require('/bar', { with: { type: 'json' } })",
    [root + '/bar']: '{ "hello": "world" }'
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.alike(exports, { hello: 'world' })
})

test('load .js with .bin require, asserted type', async (t) => {
  const protocol = sources({
    [root + '/index.js']: "module.exports = require('./asset', { with: { type: 'binary' } })",
    [root + '/asset']: Buffer.from('hello world')
  })

  const { exports } = await Module.load(new URL(root + '/index.js'), { protocol })

  t.alike(exports, Buffer.from('hello world'))
})

test('load .js with .txt require, asserted type', async (t) => {
  const protocol = sources({
    [root + '/index.js']: "module.exports = require('./asset', { with: { type: 'text' } })",
    [root + '/asset']: 'hello world'
  })

  const { exports } = await Module.load(new URL(root + '/index.js'), { protocol })

  t.is(exports, 'hello world')
})

test('load .js with .txt require, asserted type mismatch', async (t) => {
  const protocol = sources({
    [root + '/index.js']:
      "module.exports = [require('./asset', { with: { type: 'text' } }), require('./asset', { with: { type: 'binary' } })]",
    [root + '/asset']: 'hello world'
  })

  await t.exception(Module.load(new URL(root + '/index.js'), { protocol }), /TYPE_INCOMPATIBLE/)
})

test('load .mjs with static import and coercing type attribute', async (t) => {
  const protocol = sources({
    [root + '/index.mjs']: "import d from '/bar' with { type: 'json' }\nexport default d.foo",
    [root + '/bar']: '{ "foo": 42 }'
  })

  const { exports } = await Module.load(new URL(root + '/index.mjs'), { protocol })

  t.is(exports.default, 42)
})

test('load .js with require and conflicting binary require', async (t) => {
  const protocol = sources({
    [root + '/index.js']:
      "module.exports = [require('./bar.js'), require('./bar.js', { with: { type: 'binary' } })]",
    [root + '/bar.js']: 'module.exports = 42'
  })

  // The plain require must not get the module's source bytes just because the
  // require next to it asked for them.
  await t.exception(Module.load(new URL(root + '/index.js'), { protocol }), /TYPE_INCOMPATIBLE/)
})

test('load .js with binary require and conflicting require', async (t) => {
  const protocol = sources({
    [root + '/index.js']:
      "module.exports = [require('./bar.js', { with: { type: 'binary' } }), require('./bar.js')]",
    [root + '/bar.js']: 'module.exports = 42'
  })

  await t.exception(Module.load(new URL(root + '/index.js'), { protocol }), /TYPE_INCOMPATIBLE/)
})

test('load .mjs with computed dynamic import and conflicting type attribute', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']: `
      await import('/bar' + '.json', { with: { type: 'json' } })
      export default await import('/bar' + '.json', { with: { type: 'text' } })
    `,
    [root + '/bar.json']: '{ "foo": 42 }'
  })

  // The first import caches the module as JSON, so the second one cannot then
  // have it as text.
  await t.exception.all(Module.load(new URL(root + '/foo.mjs'), { protocol }), /TYPE_INCOMPATIBLE/)
})

test('load .js with computed require of a coerced module', async (t) => {
  const protocol = sources({
    [root + '/index.js']: `
      require('./bar.js', { with: { type: 'binary' } })
      module.exports = require('${root}/bar.js'.slice(0))
    `,
    [root + '/bar.js']: 'module.exports = 42'
  })

  // The traversal never sees a computed specifier, so only the loader can catch
  // this one.
  await t.exception(Module.load(new URL(root + '/index.js'), { protocol }), /TYPE_INCOMPATIBLE/)
})

test('load .js with computed binary require of a coerced module', async (t) => {
  const protocol = sources({
    [root + '/index.js']: `
      require('./bar.js', { with: { type: 'binary' } })
      module.exports = require('${root}/bar.js'.slice(0), { with: { type: 'binary' } }).byteLength
    `,
    [root + '/bar.js']: 'module.exports = 42'
  })

  const { exports } = await Module.load(new URL(root + '/index.js'), { protocol })

  t.is(exports, 'module.exports = 42'.length)
})

test('load .js with computed require of a redundantly asserted module', async (t) => {
  const protocol = sources({
    [root + '/index.js']: `
      require('./bar.bin', { with: { type: 'binary' } })
      module.exports = require('${root}/bar.bin'.slice(0)).byteLength
    `,
    [root + '/bar.bin']: 'hello'
  })

  // The attribute matches the type '.bin' already has, so it changed nothing and
  // the computed require should still get the module.
  const { exports } = await Module.load(new URL(root + '/index.js'), { protocol })

  t.is(exports, 'hello'.length)
})

test('load .js with imports attribute', async (t) => {
  const protocol = sources({
    [root + '/foo.js']:
      "module.exports = require('./bar.js', { with: { imports: './imports.json' } })",
    [root + '/bar.js']: "module.exports = require('baz')",
    [root + '/baz.js']: 'module.exports = 42',
    [root + '/imports.json']: '{ "baz": "./baz.js" }'
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, 42)
})

test('load .js with imports attribute, imports expansion', async (t) => {
  const protocol = sources({
    [root + '/foo.js']:
      "module.exports = require('./bar.js', { with: { imports: './imports.json' } })",
    [root + '/bar.js']: "module.exports = require('baz')",
    [root + '/baz.js']: 'module.exports = 42',
    [root + '/imports.json']: '{ "imports": { "baz": "./baz.js" } }'
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, 42)
})

test('load .js with imports attribute, required package', async (t) => {
  const protocol = sources({
    [root + '/node_modules/foo/package.json']: '{ "imports": { "qux": "baz" } }',
    [root + '/node_modules/foo/foo.js']:
      "module.exports = require('bar', { with: { imports: './package.json' } })",
    [root + '/node_modules/bar/package.json']: '{ "main": "./bar.js" }',
    [root + '/node_modules/bar/bar.js']: "module.exports = require('./lib.js')",
    [root + '/node_modules/bar/lib.js']: "module.exports = require('qux')",
    [root + '/node_modules/baz/package.json']: '{}',
    [root + '/node_modules/baz/index.js']: 'module.exports = 42'
  })

  // Unlike a map a package declares for itself, an attached map covers the
  // whole subtree of what it's attached to, 'bar' its own files included.
  const { exports } = await Module.load(new URL(root + '/node_modules/foo/foo.js'), { protocol })

  t.is(exports, 42)
})

test('load .js with imports attribute, invalid map', async (t) => {
  const protocol = sources({
    [root + '/foo.js']:
      "module.exports = require('./bar.js', { with: { imports: './imports.json' } })",
    [root + '/bar.js']: 'module.exports = 42',
    [root + '/imports.json']: '42'
  })

  await t.exception(Module.load(new URL(root + '/foo.js'), { protocol }), /INVALID_IMPORTS_MAP/)
})

test('load .mjs with imports attribute', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']: "export { default } from './bar.js' with { imports: './imports.json' }",
    [root + '/bar.js']: "module.exports = require('baz')",
    [root + '/baz.js']: 'module.exports = 42',
    [root + '/imports.json']: '{ "baz": "./baz.js" }'
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.is(exports.default, 42)
})
