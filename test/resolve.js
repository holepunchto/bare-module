const test = require('brittle')
const { pathToFileURL } = require('bare-url')
const Module = require('..')
const { host, path, prebuilds, root, sources } = require('./helpers')

// Everything `./foo` may denote, in the order the resolver tries it.
const moduleCandidates = [
  root + '/foo',
  root + '/foo.js',
  root + '/foo.cjs',
  root + '/foo.mjs',
  root + '/foo.ts',
  root + '/foo.cts',
  root + '/foo.mts',
  root + '/foo.json',
  root + '/foo.bare',
  root + '/foo.node',
  root + '/foo/index.js',
  root + '/foo/index.cjs',
  root + '/foo/index.mjs',
  root + '/foo/index.ts',
  root + '/foo/index.cts',
  root + '/foo/index.mts',
  root + '/foo/index.json',
  root + '/foo/index.bare',
  root + '/foo/index.node'
]

test('resolve bare specifier', async (t) => {
  const protocol = sources({
    [root + '/node_modules/foo/package.json']: '{}',
    [root + '/node_modules/foo/index.js']: 'module.exports = 42'
  })

  const { href } = await Module.resolve('foo', new URL(root + '/'), { protocol })

  t.is(href, root + '/node_modules/foo/index.js')
})

test('load resolved bare specifier', async (t) => {
  const protocol = sources({
    [root + '/node_modules/foo/package.json']: '{}',
    [root + '/node_modules/foo/index.js']: 'module.exports = 42'
  })

  const url = await Module.resolve('foo', new URL(root + '/'), { protocol })
  const { exports } = await Module.load(url, { protocol })

  t.is(exports, 42)
})

test('load resolved bare specifier with source', async (t) => {
  const protocol = sources({
    [root + '/node_modules/foo/package.json']: '{}',
    [root + '/node_modules/foo/index.js']: null
  })

  const url = await Module.resolve('foo', new URL(root + '/'), { protocol })
  const { exports } = await Module.load(url, 'module.exports = 42', {})

  t.is(exports, 42)
})

test('load .cjs with bare specifier require', async (t) => {
  const protocol = sources({
    [root + '/index.cjs']: "module.exports = require('foo')",
    [root + '/node_modules/foo/package.json']: '{}',
    [root + '/node_modules/foo/index.js']: 'module.exports = 42'
  })

  const { exports } = await Module.load(new URL(root + '/index.cjs'), { protocol })

  t.is(exports, 42)
})

test('resolve with string parentURL', async (t) => {
  const protocol = sources({
    [root + '/node_modules/foo/package.json']: '{}',
    [root + '/node_modules/foo/index.js']: null
  })

  const { href } = await Module.resolve('foo', root + '/', { protocol })

  t.is(href, root + '/node_modules/foo/index.js')
})

test('resolve without parentURL uses the working directory', async (t) => {
  const root = pathToFileURL('.').href

  const protocol = sources({ [root + '/foo.js']: null })

  const { href } = await Module.resolve('./foo.js', null, { protocol })

  t.is(href, root + '/foo.js')
})

test('resolve already valid URL', async (t) => {
  t.plan(1)

  const protocol = sources(
    {},
    {
      exists(url) {
        t.is(url.href, root + '/bar.js')

        return true
      }
    }
  )

  await Module.resolve(root + '/bar.js', new URL(root + '/foo.js'), { protocol })
})

test('load .mjs with missing import', async (t) => {
  const protocol = sources({
    [root + '/index.mjs']: "import foo from './foo'"
  })

  await t.exception(Module.load(new URL(root + '/index.mjs'), { protocol }), /MODULE_NOT_FOUND/)
})

test('resolve missing module lists the candidates', async (t) => {
  const protocol = sources({})

  try {
    await Module.resolve('./foo', new URL(root + '/'), { protocol })

    t.fail('resolve should throw')
  } catch (err) {
    t.is(err.code, 'MODULE_NOT_FOUND')
    t.is(err.specifier, './foo')
    t.is(err.referrer.href, root + '/')

    t.alike(
      err.candidates.map((url) => url.href),
      moduleCandidates
    )
  }
})

test('resolve missing module lists the candidates, synchronously', (t) => {
  const protocol = sources({})

  try {
    Module.resolveSync('./foo', new URL(root + '/'), { protocol })

    t.fail('resolve should throw')
  } catch (err) {
    t.is(err.code, 'MODULE_NOT_FOUND')

    t.alike(
      err.candidates.map((url) => url.href),
      moduleCandidates
    )
  }
})

test('resolve missing asset lists the candidates', async (t) => {
  const protocol = sources({})

  try {
    await Module.resolve('./foo.txt', new URL(root + '/'), 'asset', { protocol })

    t.fail('resolve should throw')
  } catch (err) {
    t.is(err.code, 'ASSET_NOT_FOUND')

    t.alike(
      err.candidates.map((url) => url.href),
      [root + '/foo.txt', root + '/foo.txt/']
    )
  }
})

test('resolve missing addon lists the candidates', async (t) => {
  const protocol = sources({
    [root + '/package.json']: '{ "name": "foo", "version": "1.0.0" }'
  })

  try {
    await Module.resolve('.', new URL(root + '/'), 'addon', { protocol })

    t.fail('resolve should throw')
  } catch (err) {
    t.is(err.code, 'ADDON_NOT_FOUND')

    t.alike(
      err.candidates.slice(0, 2).map((url) => url.href),
      [prebuilds + '/foo@1.0.0.bare', prebuilds + '/foo@1.0.0.node']
    )
  }
})

test('load .cjs with bare specifier require and import map', async (t) => {
  const protocol = sources({
    [root + '/foo.cjs']: "const bar = require('bar')",
    [root + '/bar.cjs']: 'module.exports = 42'
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
  const protocol = sources({
    [root + '/foo.mjs']: "import bar from 'bar'",
    [root + '/bar.mjs']: 'export default 42'
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

test('import map with protocol', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']: "import bar from 'proto:bar'",
    [root + '/bar.mjs']: 'export default 42'
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

test('main in package.json', async (t) => {
  const protocol = sources({
    [root + '/package.json']: '{ "main": "foo.js" }',
    [root + '/foo.js']: null
  })

  const { href } = await Module.resolve('/', new URL(root + '/'), { protocol })

  t.is(href, root + '/foo.js')
})

test('exports in package.json', async (t) => {
  const protocol = sources({
    [root + '/package.json']: '{ "exports": "./foo.js" }',
    [root + '/foo.js']: null
  })

  const { href } = await Module.resolve('/', new URL(root + '/'), { protocol })

  t.is(href, root + '/foo.js')
})

test('conditional exports in package.json', async (t) => {
  const protocol = sources({
    [root + '/package.json']: '{ "exports": { "require": "./foo.cjs", "import": "./foo.mjs" } }',
    [root + '/foo.cjs']: null,
    [root + '/foo.mjs']: null
  })

  const { href: cjs } = await Module.resolve('/', new URL(root + '/'), { protocol })
  const { href: mjs } = await Module.resolve('/', new URL(root + '/'), 'import', { protocol })

  t.is(cjs, root + '/foo.cjs')
  t.is(mjs, root + '/foo.mjs')
})

test('conditional exports in package.json, array of conditions', async (t) => {
  const protocol = sources({
    [root + '/package.json']:
      '{ "exports": [{ "import": "./foo.mjs" }, { "require": "./foo.cjs" }] }',
    [root + '/foo.cjs']: null,
    [root + '/foo.mjs']: null
  })

  const { href: cjs } = await Module.resolve('/', new URL(root + '/'), { protocol })
  const { href: mjs } = await Module.resolve('/', new URL(root + '/'), 'import', { protocol })

  t.is(cjs, root + '/foo.cjs')
  t.is(mjs, root + '/foo.mjs')
})

test('conditional exports in package.json, runtime condition', async (t) => {
  const protocol = sources({
    [root + '/package.json']: '{ "exports": { "bare": "./foo.bare.js", "node": "./foo.node.js" } }',
    [root + '/foo.bare.js']: null,
    [root + '/foo.node.js']: null
  })

  const { href } = await Module.resolve('/', new URL(root + '/'), { protocol })

  t.is(href, root + '/foo.bare.js')
})

test('conditional exports in package.json, platform condition', async (t) => {
  const protocol = sources({
    [root + '/package.json']:
      '{ "exports": { "darwin": "./foo.darwin.js", "linux": "./foo.linux.js", "win32": "./foo.win32.js" } }',
    [root + '/foo.darwin.js']: null,
    [root + '/foo.linux.js']: null,
    [root + '/foo.win32.js']: null
  })

  const { href } = await Module.resolve('/', new URL(root + '/'), { protocol })

  t.is(href, root + '/foo.' + Bare.platform + '.js')
})

test('conditional exports in package.json, architecture condition', async (t) => {
  const protocol = sources({
    [root + '/package.json']: '{ "exports": { "arm64": "./foo.arm64.js", "x64": "./foo.x64.js" } }',
    [root + '/foo.arm64.js']: null,
    [root + '/foo.x64.js']: null
  })

  const { href } = await Module.resolve('/', new URL(root + '/'), { protocol })

  t.is(href, root + '/foo.' + Bare.arch + '.js')
})

test('nested conditional exports resolve for the running host', async (t) => {
  const [platform] = host.split('-')

  const protocol = sources({
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

  t.is(asset, path('/node_modules/foo/asset-host.txt'), 'require.asset()')

  t.is(
    Module.loadSync(new URL(root + '/index.mjs'), { protocol }).exports.default,
    'host',
    'import through a nested condition'
  )
})

test('a preresolved nested condition is not passed over for its default', (t) => {
  const [platform] = host.split('-')

  const protocol = sources({
    [root + '/index.cjs']: `module.exports = require('foo')`,
    [root + '/host.cjs']: `module.exports = 'host'`,
    [root + '/other.cjs']: `module.exports = 'other'`
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

test('exports in node_modules', async (t) => {
  const protocol = sources({
    [root + '/node_modules/foo/package.json']: '{ "exports": "./foo.js" }',
    [root + '/node_modules/foo/foo.js']: null
  })

  const { href } = await Module.resolve('foo', new URL(root + '/'), { protocol })

  t.is(href, root + '/node_modules/foo/foo.js')
})

test('import unexported module in node_modules', async (t) => {
  const protocol = sources({
    [root + '/node_modules/foo/package.json']: '{ "exports": "./foo.js" }',
    [root + '/node_modules/foo/foo.js']: null,
    [root + '/node_modules/foo/bar.js']: null
  })

  await t.exception(
    Module.resolve('foo/bar', new URL(root + '/'), { protocol }),
    /PACKAGE_PATH_NOT_EXPORTED/
  )
})

test('imports in package.json', async (t) => {
  const protocol = sources({
    [root + '/package.json']: '{ "imports": { "bar": "./baz.js" } }',
    [root + '/foo.js']: "const bar = require('bar')",
    [root + '/baz.js']: 'module.exports = 42'
  })

  await t.execution(Module.load(new URL(root + '/foo.js'), { protocol }))
})

test('imports in package.json, no match', async (t) => {
  const protocol = sources({
    [root + '/package.json']: '{ "imports": { "bar": "./baz.js" } }',
    [root + '/foo.js']: "const bar = require('./baz')",
    [root + '/baz.js']: 'module.exports = 42'
  })

  await t.execution(Module.load(new URL(root + '/foo.js'), { protocol }))
})

test('conditional imports in package.json, require', async (t) => {
  const protocol = sources({
    [root + '/package.json']:
      '{ "imports": { "bar": { "require": "./baz.cjs", "import": "./baz.mjs" } } }',
    [root + '/foo.cjs']: "const bar = require('bar')",
    [root + '/baz.cjs']: 'module.exports = 42',
    [root + '/baz.mjs']: null
  })

  await t.execution(Module.load(new URL(root + '/foo.cjs'), { protocol }))
})

test('conditional imports in package.json, import', async (t) => {
  const protocol = sources({
    [root + '/package.json']:
      '{ "imports": { "bar": { "require": "./baz.cjs", "import": "./baz.mjs" } } }',
    [root + '/foo.mjs']: "import bar from 'bar'",
    [root + '/baz.cjs']: null,
    [root + '/baz.mjs']: 'export default 42'
  })

  await t.execution(Module.load(new URL(root + '/foo.mjs'), { protocol }))
})

test('conditional imports in package.json, asset', async (t) => {
  const protocol = sources({
    [root + '/package.json']: '{ "imports": { "bar": { "asset": "./bar.txt" } } }',
    [root + '/foo.cjs']: "module.exports = require.asset('bar')",
    [root + '/bar.txt']: 'hello world'
  })

  const { exports } = await Module.load(new URL(root + '/foo.cjs'), { protocol })

  t.is(exports, path('/bar.txt'))
})

test('conditional imports in package.json, asset and default', async (t) => {
  const protocol = sources({
    [root + '/package.json']:
      '{ "imports": { "bar": { "asset": "./bar.txt", "default": "./bar.js" } } }',
    [root + '/foo.cjs']: "module.exports = [require.asset('bar'), require('bar')]",
    [root + '/bar.txt']: 'hello world',
    [root + '/bar.js']: 'module.exports = 42'
  })

  const { exports } = await Module.load(new URL(root + '/foo.cjs'), { protocol })

  t.alike(exports, [path('/bar.txt'), 42])
})

test('conditional imports in package.json, asset and require without default', async (t) => {
  const protocol = sources({
    [root + '/package.json']: '{ "imports": { "bar": { "asset": "./bar.txt" } } }',
    [root + '/foo.cjs']: "module.exports = require('bar')",
    [root + '/bar.txt']: 'hello world',
    [root + '/bar.js']: 'module.exports = 42'
  })

  await t.exception(Module.load(new URL(root + '/foo.cjs'), { protocol }), /MODULE_NOT_FOUND/)
})

test('resolve a specifier without a matching condition or default', async (t) => {
  const protocol = sources({
    [root + '/package.json']:
      '{ "imports": { "bar": { "require": "./bar.js", "asset": "./bar.txt" } } }',
    [root + '/foo.cjs']:
      "require('bar'); require.asset('bar'); module.exports = import('ba' + 'r')",
    [root + '/bar.js']: 'module.exports = 42',
    [root + '/bar.txt']: 'hello'
  })

  const { exports } = await Module.load(new URL(root + '/foo.cjs'), { protocol })

  await t.exception(exports, /MODULE_NOT_FOUND/)
})

test('imports in node_modules', async (t) => {
  const protocol = sources({
    [root + '/node_modules/foo/package.json']: '{ "imports": { "bar": "./baz.js" } }',
    [root + '/node_modules/foo/foo.js']: "const bar = require('bar')",
    [root + '/node_modules/foo/baz.js']: 'module.exports = 42'
  })

  await t.execution(Module.load(new URL(root + '/node_modules/foo/foo.js'), { protocol }))
})

test('imports in node_modules, not applied to a required package', async (t) => {
  const protocol = sources({
    [root + '/node_modules/foo/package.json']: '{ "imports": { "qux": "baz" } }',
    [root + '/node_modules/foo/foo.js']: "module.exports = require('bar')",
    [root + '/node_modules/bar/package.json']: '{ "main": "./bar.js" }',
    [root + '/node_modules/bar/bar.js']: "module.exports = require('qux')",
    [root + '/node_modules/baz/package.json']: '{}',
    [root + '/node_modules/baz/index.js']: 'module.exports = 42'
  })

  // The map is declared by 'foo' and so must not follow the specifier into
  // 'bar', which has no 'qux' of its own to resolve.
  await t.exception(
    Module.load(new URL(root + '/node_modules/foo/foo.js'), { protocol }),
    /MODULE_NOT_FOUND/
  )
})

test('require a module already visited as a package scope', async (t) => {
  const protocol = sources({
    [root + '/foo.js']: "module.exports = require('./package.json')",
    [root + '/package.json']: 'null'
  })

  await t.exception(Module.load(new URL(root + '/foo.js'), { protocol }), /MODULE_NOT_FOUND/)
})

test('pkg.engines with valid range', async (t) => {
  const protocol = sources({
    [root + '/node_modules/foo/package.json']:
      `{ "engines": { "bare": ">=${Bare.versions.bare}" } }`,
    [root + '/node_modules/foo/index.js']: null
  })

  const { href } = await Module.resolve('foo', new URL(root + '/'), { protocol })

  t.is(href, root + '/node_modules/foo/index.js')
})

test('pkg.engines with invalid range', async (t) => {
  const protocol = sources({
    [root + '/node_modules/foo/package.json']:
      `{ "engines": { "bare": "<${Bare.versions.bare}" } }`,
    [root + '/node_modules/foo/index.js']: null
  })

  await t.exception(Module.resolve('foo', new URL(root + '/'), { protocol }), /UNSUPPORTED_ENGINE/)
})

test('resolve caches the result in resolutions map', async (t) => {
  const resolutions = {}

  const protocol = sources({
    [root + '/node_modules/foo/package.json']: '{}',
    [root + '/node_modules/foo/index.js']: null
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

  const protocol = sources(
    { [root + '/node_modules/foo/index.js']: null },
    {
      read() {
        t.fail('the protocol was read')
      }
    }
  )

  const { href } = await Module.resolve('foo', new URL(root + '/'), { protocol, resolutions })

  t.is(href, root + '/node_modules/foo/index.js')
})

test('resolve does not reuse a require resolution for an import', async (t) => {
  const resolutions = {
    [root + '/']: {
      foo: { require: root + '/node_modules/foo/require.js' }
    }
  }

  const protocol = sources({
    [root + '/node_modules/foo/package.json']:
      '{ "exports": { "import": "./import.js", "require": "./require.js" } }',
    [root + '/node_modules/foo/import.js']: null
  })

  const { href } = await Module.resolve('foo', new URL(root + '/'), 'import', {
    protocol,
    resolutions
  })

  t.is(href, root + '/node_modules/foo/import.js')
})

test('asset caches the result in resolutions map', async (t) => {
  const resolutions = {}

  const protocol = sources({ [root + '/foo.txt']: null })

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

  const protocol = sources(
    { [root + '/foo.txt']: null },
    {
      read() {
        t.fail('the protocol was read')
      }
    }
  )

  const { href } = await Module.resolve('./foo.txt', new URL(root + '/'), 'asset', {
    protocol,
    resolutions
  })

  t.is(href, root + '/foo.txt')
})
