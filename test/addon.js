const test = require('brittle')
const Bundle = require('bare-bundle')
const { pathToFileURL } = require('bare-url')
const Module = require('..')
const {
  asyncSources,
  host,
  path,
  prebuilds,
  root,
  sources,
  wasm,
  wasmRandom
} = require('./helpers')

// The addon this package builds, standing in for whatever a protocol resolves.
const addon = () => pathToFileURL(require.addon.resolve('..'))

test('load .cjs with .bare import', async (t) => {
  const protocol = sources(
    {
      [root + '/index.cjs']: "require('./native.bare')",
      [root + '/native.bare']: null
    },
    {
      resolve: () => addon()
    }
  )

  await t.execution(Module.load(new URL(root + '/index.cjs'), { protocol }))
})

test('load .cjs with dynamic .bare import', async (t) => {
  const protocol = sources(
    {
      [root + '/index.cjs']: "import('./native.bare')",
      [root + '/native.bare']: null
    },
    {
      resolve: () => addon()
    }
  )

  await t.execution(Module.load(new URL(root + '/index.cjs'), { protocol }))
})

test('load .mjs with .bare import', async (t) => {
  const protocol = sources(
    {
      [root + '/index.mjs']: "import './native.bare'",
      [root + '/native.bare']: null
    },
    {
      resolve: () => addon()
    }
  )

  await t.execution(Module.load(new URL(root + '/index.mjs'), { protocol }))
})

test('load .mjs with dynamic .bare import', async (t) => {
  const protocol = sources(
    {
      [root + '/index.mjs']: "await import('./native.bare')",
      [root + '/native.bare']: null
    },
    {
      resolve: () => addon()
    }
  )

  await t.execution(Module.load(new URL(root + '/index.mjs'), { protocol }))
})

test('require.addon', async (t) => {
  const protocol = sources(
    {
      [root + '/foo.js']: "module.exports = require.addon('.')",
      [root + '/package.json']: '{ "name": "foo", "version": "1.2.3" }',
      [prebuilds + '/foo.bare']: null
    },
    {
      resolve: () => addon()
    }
  )

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.alike(Object.keys(exports), Object.keys(require.addon('..')))
})

test('require.addon with parentURL', async (t) => {
  const protocol = sources(
    {
      [root + '/foo.js']: `module.exports = require.addon('.', new URL('${root}/dir/'))`,
      [root + '/dir/package.json']: '{ "name": "bar", "version": "1.2.3" }',
      [root + '/dir/prebuilds/' + host + '/bar.bare']: null
    },
    {
      resolve: () => addon()
    }
  )

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.alike(Object.keys(exports), Object.keys(require.addon('..')))
})

test('require.addon is cached', async (t) => {
  const protocol = sources(
    {
      [root + '/foo.js']: "module.exports = require.addon('.') === require.addon('.')",
      [root + '/package.json']: '{ "name": "foo", "version": "1.2.3" }',
      [prebuilds + '/foo.bare']: null
    },
    {
      resolve: () => addon()
    }
  )

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, true)
})

test('require.addon, webassembly', async (t) => {
  const protocol = sources({
    [root + '/foo.js']: "module.exports = require.addon('.')",
    [root + '/package.json']: '{ "name": "foo", "version": "1.2.3" }',
    [root + '/prebuilds/wasi-wasm32/foo.wasm']: wasm
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, 42)
})

test('require.addon, webassembly resolved during evaluation', async (t) => {
  const protocol = sources({
    [root + '/foo.js']: `module.exports = require.addon('.', new URL('${root}/dir/'))`,
    [root + '/dir/package.json']: '{ "name": "bar", "version": "1.2.3" }',
    [root + '/dir/prebuilds/wasi-wasm32/bar.wasm']: wasm
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, 42)
})

test('require.addon, webassembly, custom protocol', async (t) => {
  const protocol = sources({
    'custom://host/foo.js': "module.exports = require.addon('.')",
    'custom://host/package.json': '{ "name": "foo", "version": "1.2.3" }',
    'custom://host/prebuilds/wasi-wasm32/foo.wasm': wasm
  })

  const { exports } = await Module.load(new URL('custom://host/foo.js'), { protocol })

  t.is(exports, 42)
})

test('require.addon, webassembly, asynchronous protocol', async (t) => {
  const protocol = asyncSources({
    [root + '/foo.js']: "module.exports = require.addon('.')",
    [root + '/package.json']: '{ "name": "foo", "version": "1.2.3" }',
    [root + '/prebuilds/wasi-wasm32/foo.wasm']: wasm
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, 42)
})

test('require.addon, webassembly, bundle', async (t) => {
  const bundle = new Bundle()
    .write('/foo.js', "module.exports = require.addon('.')", { main: true })
    .write('/package.json', '{ "name": "foo", "version": "1.2.3" }')
    .write('/prebuilds/wasi-wasm32/foo.wasm', wasm)
    .toBuffer()

  const { exports } = await Module.load(new URL(root + '/app.bundle'), bundle)

  t.is(exports, 42)
})

test('host attribute', async (t) => {
  const protocol = hosted({
    [root + '/foo.js']: "module.exports = require('bar', { with: { host: 'wasi-wasm32' } })"
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, 42)
})

test('host attribute, computed require', async (t) => {
  const protocol = hosted({
    [root + '/foo.js']:
      "const s = 'bar'; module.exports = require(s, { with: { host: 'wasi-wasm32' } })"
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, 42)
})

test('host attribute, dynamic import', async (t) => {
  const protocol = hosted({
    [root + '/foo.mjs']:
      "const { default: bar } = await import('bar', { with: { host: 'wasi-wasm32' } }); export default bar"
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.is(exports.default, 42)
})

test('host attribute, inherited by computed require', async (t) => {
  const protocol = hosted({
    [root + '/foo.js']: "module.exports = require('baz', { with: { host: 'wasi-wasm32' } })"
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, 42)
})

test('host attribute, inherited by computed require.addon', async (t) => {
  const protocol = hosted({
    [root + '/foo.js']: "module.exports = require('qux', { with: { host: 'wasi-wasm32' } })"
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, 42)
})

test('host attribute after default import', async (t) => {
  const protocol = hosted({
    [root + '/foo.js']:
      "const s = 'bar'; require.resolve(s, { with: {} }); require(s, { with: { host: 'wasi-wasm32' } })"
  })

  await t.exception(Module.load(new URL(root + '/foo.js'), { protocol }), {
    code: 'ADDON_HOST_INCOMPATIBLE'
  })
})

test('host attribute, native host', async (t) => {
  const protocol = hosted({
    [root + '/foo.js']: "require('bar', { with: { host: 'win32-x64' } })"
  })

  await t.exception(Module.load(new URL(root + '/foo.js'), { protocol }), {
    code: 'UNKNOWN_ADDON_HOST'
  })
})

// Every addon has a native prebuild that can't be loaded, so only the
// WebAssembly prebuild can satisfy an import.
function hosted(modules) {
  const packages = {
    bar: "module.exports = require.addon('.')",
    baz: "const s = 'bar'; module.exports = require(s)",
    qux: "const s = '.'; module.exports = require.addon(s)",
    pure: 'module.exports = 42'
  }

  const store = {}

  for (const [name, source] of Object.entries(packages)) {
    const dir = root + '/node_modules/' + name

    store[dir + '/package.json'] = `{ "name": "${name}" }`
    store[dir + '/index.js'] = source
    store[dir + '/prebuilds/' + host + '/' + name + '.bare'] = null
    store[dir + '/prebuilds/wasi-wasm32/' + name + '.wasm'] = wasm
  }

  return sources({ ...store, ...modules })
}

test('wasi, no capabilities by default', async (t) => {
  const protocol = capable({
    [root + '/foo.js']: "module.exports = require('rand')"
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, ENOTCAPABLE)
})

test('wasi, loader option', async (t) => {
  const protocol = capable({
    [root + '/foo.js']: "module.exports = require('rand')"
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), {
    protocol,
    wasi: () => ({ version: 'preview1', random })
  })

  t.is(exports, 0)
})

test('wasi attribute', async (t) => {
  const protocol = capable({
    [root + '/foo.js']: "module.exports = require('rand', { with: { wasi: './grant.js' } })"
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, 0)
})

test('wasi attribute overrides the loader option for its subgraph', async (t) => {
  const protocol = capable({
    [root + '/foo.js']:
      "module.exports = [require('rand', { with: { wasi: './deny.js' } }), require('other')]"
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), {
    protocol,
    wasi: () => ({ version: 'preview1', random })
  })

  t.alike(exports, [ENOTCAPABLE, 0])
})

test('wasi attribute, inherited by a transitive dependency', async (t) => {
  const protocol = capable({
    [root + '/foo.js']: "module.exports = require('via', { with: { wasi: './grant.js' } })"
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, 0)
})

test('wasi attribute, ESM provider', async (t) => {
  const protocol = capable({
    [root + '/foo.js']: "module.exports = require('rand', { with: { wasi: './grant.mjs' } })",
    [root + '/grant.mjs']:
      "export default () => ({ version: 'preview1', random: (data) => data.fill(1) })"
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, 0)
})

test('wasi attribute, provider is passed the addon URL', async (t) => {
  const protocol = capable({
    [root + '/foo.js']: "require('rand', { with: { wasi: './record.js' } })",
    [root + '/record.js']:
      "module.exports = (url) => { global.addonURL = url; return { version: 'preview1' } }"
  })

  await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(global.addonURL.href, root + '/node_modules/rand/prebuilds/wasi-wasm32/rand.wasm')

  delete global.addonURL
})

test('wasi attribute, unversioned options', async (t) => {
  const protocol = capable({
    [root + '/foo.js']: "require('rand', { with: { wasi: './unversioned.js' } })"
  })

  await t.exception(Module.load(new URL(root + '/foo.js'), { protocol }), /INVALID_VERSION/)
})

test('wasi attribute, conflicting provider', async (t) => {
  const protocol = capable({
    [root + '/foo.js']:
      "require('rand', { with: { wasi: './grant.js' } }); require('rand', { with: { wasi: './deny.js' } })"
  })

  await t.exception(Module.load(new URL(root + '/foo.js'), { protocol }), {
    code: 'ADDON_WASI_INCOMPATIBLE'
  })
})

const ENOTCAPABLE = 76

function random(data) {
  return data.fill(1)
}

// `rand` and `other` are WebAssembly addons whose exports are the error number
// of asking WASI for randomness. `via` depends on `rand`.
function capable(modules) {
  const store = {
    [root + '/grant.js']:
      "module.exports = () => ({ version: 'preview1', random: (data) => data.fill(1) })",
    [root + '/deny.js']: "module.exports = () => ({ version: 'preview1' })",
    [root + '/unversioned.js']: 'module.exports = () => ({})',
    [root + '/node_modules/via/package.json']: '{ "name": "via" }',
    [root + '/node_modules/via/index.js']: "module.exports = require('rand')"
  }

  for (const name of ['rand', 'other']) {
    const dir = root + '/node_modules/' + name

    store[dir + '/package.json'] = `{ "name": "${name}" }`
    store[dir + '/index.js'] = "module.exports = require.addon('.')"
    store[dir + '/prebuilds/wasi-wasm32/' + name + '.wasm'] = wasmRandom
  }

  return sources({ ...store, ...modules })
}

test('require.addon.host', async (t) => {
  const protocol = sources({
    [root + '/foo.js']: 'module.exports = require.addon.host'
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, host)
})

test('require.addon.resolve', async (t) => {
  const protocol = sources({
    [root + '/foo.js']: "module.exports = require.addon.resolve('.')",
    [root + '/package.json']: '{ "name": "foo", "version": "1.2.3" }',
    [prebuilds + '/foo.bare']: null
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, path('/prebuilds/' + host + '/foo.bare'))
})

test('require.addon.resolve with parentURL', async (t) => {
  const protocol = sources({
    [root + '/foo.js']: `module.exports = require.addon.resolve('.', new URL('${root}/dir/'))`,
    [root + '/dir/package.json']: '{ "name": "bar", "version": "1.2.3" }',
    [root + '/dir/prebuilds/' + host + '/bar.bare']: null
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, path('/dir/prebuilds/' + host + '/bar.bare'))
})

test('import.meta.addon', async (t) => {
  const protocol = sources(
    {
      [root + '/foo.mjs']: "export default import.meta.addon('.')",
      [root + '/package.json']: '{ "name": "foo", "version": "1.2.3" }',
      [prebuilds + '/foo.bare']: null
    },
    {
      resolve: () => addon()
    }
  )

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.alike(Object.keys(exports.default), Object.keys(require.addon('..')))
})

test('import.meta.addon with parentURL', async (t) => {
  const protocol = sources(
    {
      [root + '/foo.mjs']: `export default import.meta.addon('.', new URL('${root}/dir/'))`,
      [root + '/dir/package.json']: '{ "name": "bar", "version": "1.2.3" }',
      [root + '/dir/prebuilds/' + host + '/bar.bare']: null
    },
    {
      resolve: () => addon()
    }
  )

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.alike(Object.keys(exports.default), Object.keys(require.addon('..')))
})

test('import.meta.addon is cached', async (t) => {
  const protocol = sources(
    {
      [root + '/foo.mjs']: "export default import.meta.addon('.') === import.meta.addon('.')",
      [root + '/package.json']: '{ "name": "foo", "version": "1.2.3" }',
      [prebuilds + '/foo.bare']: null
    },
    {
      resolve: () => addon()
    }
  )

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.is(exports.default, true)
})

test('import.meta.addon.host', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']: 'export default import.meta.addon.host'
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.is(exports.default, host)
})

test('import.meta.addon.resolve', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']: "export default import.meta.addon.resolve('.')",
    [root + '/package.json']: '{ "name": "foo", "version": "1.2.3" }',
    [prebuilds + '/foo.bare']: null
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.is(exports.default, root + '/prebuilds/' + host + '/foo.bare')
})

test('import.meta.addon.resolve with parentURL', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']: `export default import.meta.addon.resolve('.', new URL('${root}/dir/'))`,
    [root + '/dir/package.json']: '{ "name": "bar", "version": "1.2.3" }',
    [root + '/dir/prebuilds/' + host + '/bar.bare']: null
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.is(exports.default, root + '/dir/prebuilds/' + host + '/bar.bare')
})

test('loader addons', async (t) => {
  const protocol = sources(
    {
      [root + '/foo.js']: "module.exports = require.addon('.')",
      [root + '/package.json']: '{ "name": "foo", "version": "1.2.3" }',
      [prebuilds + '/foo.bare']: null
    },
    {
      resolve: () => addon()
    }
  )

  const resolutions = Object.create(null)

  const loader = new Module.Loader({ protocol, resolutions })

  await loader.link(new URL(root + '/foo.js'))

  t.alike(resolutions[root + '/foo.js']['.'], { addon: addon().href })
})

test('loader addons resolved during evaluation', async (t) => {
  const protocol = sources(
    {
      [root + '/foo.js']: `module.exports = require.addon('.', new URL('${root}/dir/'))`,
      [root + '/dir/package.json']: '{ "name": "bar", "version": "1.2.3" }',
      [root + '/dir/prebuilds/' + host + '/bar.bare']: null
    },
    {
      resolve: () => addon()
    }
  )

  const loader = new Module.Loader({ protocol })

  await loader.link(new URL(root + '/foo.js'))

  t.is(loader.get(addon()), null, 'the addon is not linked until it is asked for')

  await loader.import(new URL(root + '/foo.js'))

  t.not(loader.get(addon()), null)
})
