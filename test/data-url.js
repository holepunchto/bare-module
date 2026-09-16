const test = require('brittle')
const Module = require('..')
const { path, root, sources } = require('./helpers')

const javascript = (source) => 'data:text/javascript,' + encodeURIComponent(source)

test('load data: protocol entry', async (t) => {
  const { exports } = await Module.load(new URL(javascript('module.exports = 42')))

  t.is(exports, 42)
})

test('load data: protocol entry with default type module', async (t) => {
  const { exports } = await Module.load(new URL(javascript('export default 42')), {
    defaultType: Module.constants.MODULE
  })

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

test('load .cjs with data: protocol require', async (t) => {
  const protocol = sources({
    [root + '/foo.cjs']: `module.exports = require('${javascript('module.exports = 42')}')`
  })

  const { exports } = await Module.load(new URL(root + '/foo.cjs'), { protocol })

  t.is(exports, 42)
})

test('load .mjs with data: protocol import', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']: `export { default } from '${javascript('export default 42')}'`
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.is(exports.default, 42)
})

test('load .cjs with data: protocol require without a media type', async (t) => {
  const protocol = sources({
    [root + '/foo.cjs']:
      `module.exports = require('data:,${encodeURIComponent('module.exports = 42')}')`
  })

  await t.exception(
    Module.load(new URL(root + '/foo.cjs'), { protocol }),
    /UNKNOWN_DATA_URL_MEDIA_TYPE/
  )
})

test('load .mjs with JSON data: protocol import', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']:
      `export { default } from "data:application/json,${encodeURIComponent('{ "foo": 42 }')}"`
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.alike(exports.default, { foo: 42 })
})

test('load .mjs with text data: protocol import and type attribute', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']:
      `import text from "data:text/plain,${encodeURIComponent('hello')}" with { type: 'text' }\nexport default text`
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.is(exports.default, 'hello')
})

test('load .mjs with dynamic data: protocol import without a type attribute', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']: `export default await import('${javascript('export default 42')}')`
  })

  await t.exception(Module.load(new URL(root + '/foo.mjs'), { protocol }), /AMBIGUOUS_MODULE_TYPE/)
})

test('load .mjs with dynamic data: protocol import with a type attribute', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']:
      `export default await import('${javascript('export default 42')}', { with: { type: 'module' } })`
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.is(exports.default.default, 42)
})

test('load .cjs with computed data: protocol require', async (t) => {
  const protocol = sources({
    [root + '/foo.cjs']:
      `module.exports = require('data:text/javascript,' + '${encodeURIComponent('module.exports = 42')}')`
  })

  const { exports } = await Module.load(new URL(root + '/foo.cjs'), { protocol })

  t.is(exports, 42)
})

test('load .mjs with computed data: protocol import', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']:
      `export default await import('data:text/javascript,' + '${encodeURIComponent('export default 42')}')`
  })

  // A dynamic import can load either a script or a module, and a computed
  // specifier has no attributes to say which one it wants.
  await t.exception.all(
    Module.load(new URL(root + '/foo.mjs'), { protocol }),
    /AMBIGUOUS_MODULE_TYPE/
  )
})

test('load .mjs with computed data: protocol import and type attribute', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']:
      `export default await import('data:text/javascript,' + '${encodeURIComponent('export default 42')}', { with: { type: 'module' } })`
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.is(exports.default.default, 42)
})

test('load .cjs with computed data: protocol import and script type attribute', async (t) => {
  const protocol = sources({
    [root + '/foo.cjs']:
      `module.exports = import('data:text/javascript,' + '${encodeURIComponent('module.exports = 42')}', { with: { type: 'script' } })`
  })

  const { exports } = await Module.load(new URL(root + '/foo.cjs'), { protocol })

  t.is((await exports).default, 42)
})

test('load .cjs with computed data: protocol require and default type', async (t) => {
  const protocol = sources({
    [root + '/foo.cjs']:
      `module.exports = require('data:text/javascript,' + '${encodeURIComponent('module.exports = 42')}')`
  })

  // A data: URL has no type of its own, so it follows the require that named it
  // rather than the default type, and stays a script.
  const { exports } = await Module.load(new URL(root + '/foo.cjs'), {
    protocol,
    defaultType: Module.constants.MODULE
  })

  t.is(exports, 42)
})

test('load .cjs with nested data: protocol require', async (t) => {
  const protocol = sources({
    [root + '/foo.cjs']:
      `module.exports = require("${javascript(`module.exports = require("${javascript('module.exports = 42')}")`)}")`
  })

  const { exports } = await Module.load(new URL(root + '/foo.cjs'), { protocol })

  t.is(exports, 42)
})

test('load .mjs with nested data: protocol import', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']:
      `export { default } from "${javascript(`export { default } from "${javascript('export default 42')}"`)}"`
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.is(exports.default, 42)
})

test('load .cjs with absolute require from data: protocol module', async (t) => {
  const protocol = sources({
    [root + '/foo.cjs']:
      `module.exports = require("${javascript(`module.exports = require('${root}/bar.cjs')`)}")`,
    [root + '/bar.cjs']: 'module.exports = 42'
  })

  const { exports } = await Module.load(new URL(root + '/foo.cjs'), { protocol })

  t.is(exports, 42)
})

test('load .mjs with absolute import from data: protocol module', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']:
      `export { default } from "${javascript(`export { default } from '${root}/bar.mjs'`)}"`,
    [root + '/bar.mjs']: 'export default 42'
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.is(exports.default, 42)
})

test('load .cjs with relative require from data: protocol module', async (t) => {
  const protocol = sources({
    [root + '/foo.cjs']:
      `module.exports = require("${javascript("module.exports = require('./bar.cjs')")}")`,
    [root + '/bar.cjs']: 'module.exports = 42'
  })

  await t.exception(Module.load(new URL(root + '/foo.cjs'), { protocol }), /MODULE_NOT_FOUND/)
})

test('load .mjs with relative import from data: protocol module', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']:
      `export { default } from "${javascript("export { default } from './bar.mjs'")}"`,
    [root + '/bar.mjs']: 'export default 42'
  })

  await t.exception(Module.load(new URL(root + '/foo.mjs'), { protocol }), /MODULE_NOT_FOUND/)
})

test('load .cjs with bare require from data: protocol module', async (t) => {
  const protocol = sources({
    [root + '/foo.cjs']:
      `module.exports = require("${javascript("module.exports = require('bar')")}")`,
    [root + '/node_modules/bar/package.json']: '{ "main": "index.js" }',
    [root + '/node_modules/bar/index.js']: 'module.exports = 42'
  })

  await t.exception(Module.load(new URL(root + '/foo.cjs'), { protocol }), /MODULE_NOT_FOUND/)
})

test('load .mjs with bare import from data: protocol module', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']: `export { default } from "${javascript("export { default } from 'bar'")}"`,
    [root + '/node_modules/bar/package.json']: '{ "main": "index.mjs" }',
    [root + '/node_modules/bar/index.mjs']: 'export default 42'
  })

  await t.exception(Module.load(new URL(root + '/foo.mjs'), { protocol }), /MODULE_NOT_FOUND/)
})

test('load .cjs with builtin require from data: protocol module', async (t) => {
  const protocol = sources({
    [root + '/foo.cjs']:
      `module.exports = require("${javascript("module.exports = require('bar')")}")`
  })

  const { exports } = await Module.load(new URL(root + '/foo.cjs'), {
    protocol,
    builtins: { bar: 42 }
  })

  t.is(exports, 42)
})

test('load .mjs with builtin import from data: protocol module', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']: `export { default } from "${javascript("export { default } from 'bar'")}"`
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), {
    protocol,
    builtins: { bar: 42 }
  })

  t.is(exports.default, 42)
})

test('require.resolve from data: protocol module', async (t) => {
  const protocol = sources({
    [root + '/foo.cjs']:
      `module.exports = require("${javascript(`module.exports = require.resolve('${root}/bar.cjs')`)}")`,
    [root + '/bar.cjs']: 'module.exports = 42'
  })

  const { exports } = await Module.load(new URL(root + '/foo.cjs'), { protocol })

  t.is(exports, path('/bar.cjs'))
})

test('require.resolve relative from data: protocol module', async (t) => {
  const protocol = sources({
    [root + '/foo.cjs']:
      `module.exports = require("${javascript("module.exports = require.resolve('./bar.cjs')")}")`,
    [root + '/bar.cjs']: 'module.exports = 42'
  })

  await t.exception(Module.load(new URL(root + '/foo.cjs'), { protocol }), /MODULE_NOT_FOUND/)
})

test('require.asset from data: protocol module', async (t) => {
  const protocol = sources({
    [root + '/foo.cjs']:
      `module.exports = require("${javascript(`module.exports = require.asset('${root}/bar.txt')`)}")`,
    [root + '/bar.txt']: 'hello'
  })

  const { exports } = await Module.load(new URL(root + '/foo.cjs'), { protocol })

  t.is(exports, path('/bar.txt'))
})

test('require.asset relative from data: protocol module', async (t) => {
  const protocol = sources({
    [root + '/foo.cjs']:
      `module.exports = require("${javascript("module.exports = require.asset('./bar.txt')")}")`,
    [root + '/bar.txt']: 'hello'
  })

  await t.exception(Module.load(new URL(root + '/foo.cjs'), { protocol }), /ASSET_NOT_FOUND/)
})

test('require.addon.resolve relative from data: protocol module', async (t) => {
  const protocol = sources({
    [root + '/foo.cjs']:
      `module.exports = require("${javascript("module.exports = require.addon.resolve('.')")}")`
  })

  await t.exception(Module.load(new URL(root + '/foo.cjs'), { protocol }), /ADDON_NOT_FOUND/)
})
