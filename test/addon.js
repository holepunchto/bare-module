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
    [root + '/foo.js']: "module.exports = require('computed', { with: { host: 'wasi-wasm32' } })"
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, 42)
})

test('host attribute, inherited by computed require.addon', async (t) => {
  const protocol = hosted({
    [root + '/foo.js']:
      "module.exports = require('computed-addon', { with: { host: 'wasi-wasm32' } })"
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

// Every package has a native prebuild that can't be loaded, so only the
// WebAssembly prebuild can satisfy an import. `computed` requires `bar` by a
// computed specifier, and `computed-addon` requires its own addon by one.
function hosted(modules) {
  const packages = {
    bar: "module.exports = require.addon('.')",
    computed: "const s = 'bar'; module.exports = require(s)",
    'computed-addon': "const s = '.'; module.exports = require.addon(s)"
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

test('host attribute, conditional import', async (t) => {
  const protocol = split({
    [root + '/foo.js']: "module.exports = require('split', { with: { host: 'wasi-wasm32' } })"
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, 42)
})

test('host attribute, conditional import without a host attribute', async (t) => {
  const protocol = split({
    [root + '/foo.js']: "module.exports = require('split')"
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, 'native')
})

test('conditional import without a host attribute, native prebuild', async (t) => {
  const dir = root + '/node_modules/split-native'
  const prebuild = dir + '/prebuilds/' + host + '/split-native.bare'

  const protocol = split(
    {
      [root + '/foo.js']: "module.exports = require('split')",
      [dir + '/index.js']: "module.exports = require.addon('.')",
      [prebuild]: null
    },
    (store) =>
      sources(store, {
        resolve: (url) => (url.href === prebuild ? addon() : url)
      })
  )

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.alike(Object.keys(exports), Object.keys(require.addon('..')))
})

test('conditional import without a host attribute, computed require', async (t) => {
  const protocol = split({
    [root + '/foo.js']: "module.exports = require('split')",
    [root + '/node_modules/split/index.js']: "const s = '#binding'; module.exports = require(s)"
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, 'native')
})

test('conditional import without a host attribute, dynamic import', async (t) => {
  const protocol = split({
    [root + '/foo.mjs']: "const { default: split } = await import('split'); export default split",
    [root + '/node_modules/split/index.js']:
      "const s = '#binding'; module.exports = import(s).then((m) => m.default)"
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.is(await exports.default, 'native')
})

test('conditional import without a host attribute, asynchronous protocol', async (t) => {
  const protocol = split({ [root + '/foo.js']: "module.exports = require('split')" }, asyncSources)

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, 'native')
})

test('host attribute, conditional import, computed require', async (t) => {
  const protocol = split({
    [root + '/foo.js']: "module.exports = require('split', { with: { host: 'wasi-wasm32' } })",
    [root + '/node_modules/split/index.js']: "const s = '#binding'; module.exports = require(s)"
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, 42)
})

test('host attribute, conditional import, dynamic import', async (t) => {
  const protocol = split({
    [root + '/foo.mjs']:
      "const { default: split } = await import('split', { with: { host: 'wasi-wasm32' } }); export default split",
    [root + '/node_modules/split/index.js']:
      "const s = '#binding'; module.exports = import(s).then((m) => m.default)"
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.is(await exports.default, 42)
})

test('host attribute, conditional import, resolutions map', async (t) => {
  const protocol = split({
    [root + '/foo.js']: "module.exports = require('split', { with: { host: 'wasi-wasm32' } })"
  })

  const dir = root + '/node_modules/'

  const resolutions = {
    [dir + 'split/index.js']: {
      '#package': dir + 'split/package.json',
      '#binding': {
        require: {
          wasi: dir + 'split-wasi-wasm32/index.js',
          ...conditional(dir + 'split-native/index.js')
        }
      }
    }
  }

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol, resolutions })

  t.is(exports, 42)
})

test('host attribute, conditional import after default import', async (t) => {
  const protocol = split({
    [root + '/foo.js']:
      "require('split'); module.exports = require('split', { with: { host: 'wasi-wasm32' } })"
  })

  await t.exception(Module.load(new URL(root + '/foo.js'), { protocol }), {
    code: 'ADDON_HOST_INCOMPATIBLE'
  })
})

test('default import after host attribute, conditional import', async (t) => {
  const protocol = split({
    [root + '/foo.js']:
      "require('split', { with: { host: 'wasi-wasm32' } }); module.exports = require('split')"
  })

  await t.exception(Module.load(new URL(root + '/foo.js'), { protocol }), {
    code: 'ADDON_HOST_INCOMPATIBLE'
  })
})

test('default computed import after host attribute, conditional import', async (t) => {
  const protocol = split({
    [root + '/foo.js']:
      "require('split', { with: { host: 'wasi-wasm32' } }); const s = 'split'; module.exports = require(s)"
  })

  await t.exception(Module.load(new URL(root + '/foo.js'), { protocol }), {
    code: 'ADDON_HOST_INCOMPATIBLE'
  })
})

test('host attribute, shared module with native conditional imports', async (t) => {
  const protocol = split({
    [root + '/foo.js']:
      "module.exports = [require('platform'), require('split', { with: { host: 'wasi-wasm32' } })]",
    [root + '/node_modules/split/index.js']:
      "require('platform'); module.exports = require('#binding')"
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.alike(exports, ['native', 42])
})

test('webassembly conditional import without a host attribute', async (t) => {
  const protocol = wasiOnly({
    [root + '/foo.js']: "module.exports = require('only')"
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, 42)
})

test('webassembly conditional import without a host attribute, computed require', async (t) => {
  const protocol = wasiOnly({
    [root + '/foo.js']: "module.exports = require('only')",
    [root + '/node_modules/only/index.js']: "const s = '#binding'; module.exports = require(s)"
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, 42)
})

test('webassembly conditional import without a host attribute, dynamic import', async (t) => {
  const protocol = wasiOnly({
    [root + '/foo.mjs']: "const { default: only } = await import('only'); export default only",
    [root + '/node_modules/only/index.js']:
      "const s = '#binding'; module.exports = import(s).then((m) => m.default)"
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.is(await exports.default, 42)
})

test('webassembly conditional import without a host attribute, bundle', async (t) => {
  const bundle = new Bundle()
    .write('/foo.js', "module.exports = require('only')", { main: true })
    .write(
      '/node_modules/only/package.json',
      JSON.stringify({
        name: 'only',
        imports: { '#binding': { wasi: { wasm32: 'only-wasi-wasm32' } } }
      })
    )
    .write('/node_modules/only/index.js', "module.exports = require('#binding')")
    .write('/node_modules/only-wasi-wasm32/package.json', '{ "name": "only-wasi-wasm32" }')
    .write('/node_modules/only-wasi-wasm32/index.js', "module.exports = require.addon('.')")
    .write('/node_modules/only-wasi-wasm32/prebuilds/wasi-wasm32/only-wasi-wasm32.wasm', wasm)
    .toBuffer()

  const { exports } = await Module.load(new URL(root + '/app.bundle'), bundle)

  t.is(exports, 42)
})

// `only` imports its binding from `only-wasi-wasm32` by condition, and has no
// native binding at all.
function wasiOnly(modules) {
  const dir = root + '/node_modules/'

  return sources({
    [dir + 'only/package.json']: JSON.stringify({
      name: 'only',
      imports: { '#binding': { wasi: { wasm32: 'only-wasi-wasm32' } } }
    }),
    [dir + 'only/index.js']: "module.exports = require('#binding')",
    [dir + 'only-wasi-wasm32/package.json']: '{ "name": "only-wasi-wasm32" }',
    [dir + 'only-wasi-wasm32/index.js']: "module.exports = require.addon('.')",
    [dir + 'only-wasi-wasm32/prebuilds/wasi-wasm32/only-wasi-wasm32.wasm']: wasm,
    ...modules
  })
}

// The entry that matches the conditions of the native host.
function conditional(target) {
  return host
    .split('-')
    .reverse()
    .reduce((entry, condition) => ({ [condition]: entry }), target)
}

// `split` imports its binding from `split-native` or `split-wasi-wasm32` by
// condition, the way packages with a package per prebuild do, and `platform`
// imports a module by the conditions of the native host alone.
function split(modules, protocol = sources) {
  const dir = root + '/node_modules/'

  return protocol({
    [dir + 'split/package.json']: JSON.stringify({
      name: 'split',
      imports: {
        '#binding': {
          wasi: { wasm32: 'split-wasi-wasm32' },
          ...conditional('split-native')
        }
      }
    }),
    [dir + 'split/index.js']: "module.exports = require('#binding')",
    [dir + 'split-native/package.json']: '{ "name": "split-native" }',
    [dir + 'split-native/index.js']: "module.exports = 'native'",
    [dir + 'split-wasi-wasm32/package.json']: '{ "name": "split-wasi-wasm32" }',
    [dir + 'split-wasi-wasm32/index.js']: "module.exports = require.addon('.')",
    [dir + 'split-wasi-wasm32/prebuilds/wasi-wasm32/split-wasi-wasm32.wasm']: wasm,
    [dir + 'platform/package.json']: JSON.stringify({
      name: 'platform',
      imports: { '#impl': { ...conditional('./native.js'), default: './other.js' } }
    }),
    [dir + 'platform/index.js']: "module.exports = require('#impl')",
    [dir + 'platform/native.js']: "module.exports = 'native'",
    [dir + 'platform/other.js']: "module.exports = 'other'",
    ...modules
  })
}

const ENOTCAPABLE = 76

function random(data) {
  return data.fill(1)
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

test('wasi attribute, computed require', async (t) => {
  const protocol = capable({
    [root + '/foo.js']:
      "const s = 'rand'; module.exports = require(s, { with: { wasi: './grant.js' } })"
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, 0)
})

test('wasi attribute, dynamic import', async (t) => {
  const protocol = capable({
    [root + '/foo.mjs']:
      "const { default: rand } = await import('rand', { with: { wasi: './grant.js' } }); export default rand"
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.is(exports.default, 0)
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

test('wasi, provider is passed the addon URL', async (t) => {
  const protocol = capable({
    [root + '/foo.js']: "require('rand')"
  })

  let url = null

  await Module.load(new URL(root + '/foo.js'), {
    protocol,
    wasi: (addonURL) => {
      url = addonURL
      return { version: 'preview1' }
    }
  })

  t.is(url.href, root + '/node_modules/rand/prebuilds/wasi-wasm32/rand.wasm')
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
