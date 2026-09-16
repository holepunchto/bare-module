const test = require('brittle')
const Module = require('..')
const { isWindows, path, root, sources } = require('./helpers')

test('load .js', async (t) => {
  const protocol = sources({
    [root + '/index.js']: 'module.exports = 42'
  })

  const { exports } = await Module.load(new URL(root + '/index.js'), { protocol })

  t.is(exports, 42)
})

test('load .js with pkg.type module', async (t) => {
  const protocol = sources({
    [root + '/package.json']: '{ "type": "module" }',
    [root + '/index.js']: 'export default 42'
  })

  await t.execution(Module.load(new URL(root + '/index.js'), { protocol }))
})

test('load .js with default type', async (t) => {
  const protocol = sources({
    [root + '/foo.js']: "export { default } from '/bar.js'",
    [root + '/bar.js']: 'export default 42'
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), {
    protocol,
    defaultType: Module.constants.MODULE
  })

  t.is(exports.default, 42)
})

test('load .cjs', async (t) => {
  const protocol = sources({
    [root + '/index.cjs']: 'module.exports = 42'
  })

  const { exports } = await Module.load(new URL(root + '/index.cjs'), { protocol })

  t.is(exports, 42)
})

test('load .mjs', async (t) => {
  const protocol = sources({
    [root + '/index.mjs']: 'export default 42'
  })

  await t.execution(Module.load(new URL(root + '/index.mjs'), { protocol }))
})

test('load .ts', async (t) => {
  const protocol = sources({
    [root + '/index.ts']: 'const a: number = 42; module.exports = a'
  })

  const { exports } = await Module.load(new URL(root + '/index.ts'), { protocol })

  t.is(exports, 42)
})

test('load .ts with non-erasable syntax', async (t) => {
  const protocol = sources({
    [root + '/index.ts']: 'enum foo {}'
  })

  await t.exception.all(Module.load(new URL(root + '/index.ts'), { protocol }), /SyntaxError/)
})

test('load .cts', async (t) => {
  const protocol = sources({
    [root + '/index.cts']: 'const a: number = 42; module.exports = a'
  })

  const { exports } = await Module.load(new URL(root + '/index.cts'), { protocol })

  t.is(exports, 42)
})

test('load .mts', async (t) => {
  const protocol = sources({
    [root + '/index.mts']: 'const a: number = 42; export default a'
  })

  const { exports } = await Module.load(new URL(root + '/index.mts'), { protocol })

  t.is(exports.default, 42)
})

test('load .json', async (t) => {
  const protocol = sources({
    [root + '/index.json']: '42'
  })

  const { exports } = await Module.load(new URL(root + '/index.json'), { protocol })

  t.is(exports, 42)
})

test('load .js with .bin require', async (t) => {
  const protocol = sources({
    [root + '/index.js']: "module.exports = require('./foo.bin')",
    [root + '/foo.bin']: Buffer.from('hello world')
  })

  const { exports } = await Module.load(new URL(root + '/index.js'), { protocol })

  t.alike(exports, Buffer.from('hello world'))
})

test('load .js with .txt require', async (t) => {
  const protocol = sources({
    [root + '/index.js']: "module.exports = require('./foo.txt')",
    [root + '/foo.txt']: 'hello world'
  })

  const { exports } = await Module.load(new URL(root + '/index.js'), { protocol })

  t.is(exports, 'hello world')
})

test('load unknown extension', async (t) => {
  const protocol = sources({
    [root + '/index.foo']: 'module.exports = 42'
  })

  const { exports } = await Module.load(new URL(root + '/index.foo'), { protocol })

  t.is(exports, 42)
})

test('load unknown extension with default type', async (t) => {
  const protocol = sources({
    [root + '/index.foo']: '42'
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

test('record filename, dirname, id, and path', async (t) => {
  const protocol = sources({
    [root + '/dir/foo.cjs']: 'module.exports = 42'
  })

  const foo = await Module.load(new URL(root + '/dir/foo.cjs'), { protocol })

  t.is(foo.filename, path('/dir/foo.cjs'))
  t.is(foo.dirname, path('/dir'))
  t.is(foo.id, foo.filename)
  t.is(foo.path, foo.dirname)
})

test('extend module with exports property', async (t) => {
  const protocol = sources({
    [root + '/foo.js']: "module.exports = require('./bar.js')",
    [root + '/bar.js']: "Object.defineProperty(module, 'exports', { get: () => 42 })"
  })

  await t.execution(Module.load(new URL(root + '/foo.js'), { protocol }))
})

test('load .cjs with non-file: URL', async (t) => {
  const root = 'protocol:'

  const protocol = sources({
    [root + '/foo.cjs']: 'module.exports = __filename'
  })

  const { exports } = await Module.load(new URL(root + '/foo.cjs'), { protocol })

  t.is(exports, '/foo.cjs')
})

test('load .cjs with opaque non-file: URL exposes href as __dirname', async (t) => {
  const protocol = sources({
    'protocol:foo.cjs': 'module.exports = __dirname'
  })

  const { exports } = await Module.load(new URL('protocol:foo.cjs'), { protocol })

  t.is(exports, 'protocol:foo.cjs')
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

  const protocol = sources({
    [url.href]: 'module.exports = __filename'
  })

  await t.exception(Module.load(url, { protocol }), /INVALID_URL_PATH/)
})

test('load non-file: URL with encoded slash throws', async (t) => {
  const url = new URL('protocol:/foo%2fbar.cjs')

  const protocol = sources({
    [url.href]: 'module.exports = __filename'
  })

  await t.exception(Module.load(url, { protocol }), /INVALID_URL_PATH/)
})

test('load non-file: URL with encoded backslash', async (t) => {
  const url = new URL('protocol:/foo%5cbar.cjs')

  const protocol = sources({
    [url.href]: 'module.exports = __dirname'
  })

  if (isWindows) {
    await t.exception(Module.load(url, { protocol }), /INVALID_URL_PATH/)
  } else {
    await t.execution(Module.load(url, { protocol }))
  }
})

test('over-long module url is refused', async (t) => {
  const url = root + '/' + 'a'.repeat(5000) + '.mjs'

  const protocol = sources({
    [url]: 'export default 42'
  })

  await t.exception(Module.load(new URL(url), { protocol }), { code: 'ENAMETOOLONG' })
})
