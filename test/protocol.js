const test = require('brittle')
const Module = require('..')
const { asyncSources, root, sources } = require('./helpers')

const kind = Symbol.for('bare.module.protocol.kind')

test('protocol version', (t) => {
  const protocol = new Module.Protocol()

  t.is(protocol[kind], Module.Protocol[kind], 'an instance reports the version of its class')
  t.is(protocol.extend({})[kind], Module.Protocol[kind], 'so does an extended protocol')
})

test('Module.Protocol.isProtocol', (t) => {
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
  // A protocol from a module system that speaks a different interface. Its
  // methods may look right and still mean something else.
  const protocol = {
    [kind]: Module.Protocol[kind] + 1,

    exists(url) {
      t.fail('the protocol was reached')
    },

    read(url) {
      t.fail('the protocol was reached')
    }
  }

  await t.exception(Module.load(new URL(root + '/foo.cjs'), { protocol }), {
    code: 'PROTOCOL_INCOMPATIBLE'
  })
})

test('load with a protocol from another copy of this version', async (t) => {
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
  t.exception(() => new Module.Loader({ protocol: { [kind]: Module.Protocol[kind] + 1 } }), {
    code: 'PROTOCOL_INCOMPATIBLE'
  })
})

test('createRequire with a protocol of another version', (t) => {
  t.exception(() => Module.createRequire(root + '/foo.cjs', { protocol: { [kind]: -1 } }), {
    code: 'PROTOCOL_INCOMPATIBLE'
  })
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
  const context = sources({
    [root + '/public/index.js']: `module.exports = require('/private/key.js')`,
    [root + '/private/key.js']: `module.exports = 'secret'`
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

test('load with asynchronous protocol', async (t) => {
  const protocol = asyncSources(
    {
      [root + '/foo.mjs']: "import bar from '/bar.mjs'; export default bar",
      [root + '/bar.mjs']: 'export default 42'
    },
    {
      async resolve(url) {
        return url
      }
    }
  )

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.is(exports.default, 42)
})

test('loader import with asynchronous protocol', async (t) => {
  const protocol = asyncSources({
    [root + '/index.cjs']: "module.exports = require('/dep.cjs')",
    [root + '/dep.cjs']: 'module.exports = 42'
  })

  const loader = new Module.Loader({ protocol })

  t.is(await loader.import(new URL(root + '/index.cjs')), 42)
})

test('resolve with asynchronous protocol', async (t) => {
  const protocol = asyncSources(
    {
      [root + '/node_modules/foo/package.json']: '{}',
      [root + '/node_modules/foo/index.js']: null
    },
    {
      async resolve(url) {
        return url
      }
    }
  )

  const { href } = await Module.resolve('foo', new URL(root + '/'), { protocol })

  t.is(href, root + '/node_modules/foo/index.js')
})

test('asset with asynchronous protocol', async (t) => {
  const protocol = asyncSources({ [root + '/foo.txt']: null })

  const { href } = await Module.resolve('./foo.txt', new URL(root + '/'), 'asset', { protocol })

  t.is(href, root + '/foo.txt')
})

test('resolve missing module with asynchronous protocol', async (t) => {
  const protocol = asyncSources({})

  await t.exception(Module.resolve('foo', new URL(root + '/'), { protocol }), /MODULE_NOT_FOUND/)
})

test('asset missing with asynchronous protocol', async (t) => {
  const protocol = asyncSources({})

  await t.exception(
    Module.resolve('./foo.txt', new URL(root + '/'), 'asset', { protocol }),
    /ASSET_NOT_FOUND/
  )
})

test('link uses asynchronous protocol variants when both are provided', async (t) => {
  const protocol = new Module.Protocol({
    async exists(url) {
      return url.href === root + '/index.js'
    },

    existsSync(url) {
      t.fail('the synchronous variant was used')
    },

    async read(url) {
      return 'module.exports = 42'
    },

    readSync(url) {
      t.fail('the synchronous variant was used')
    }
  })

  const { exports } = await Module.load(new URL(root + '/index.js'), { protocol })

  t.is(exports, 42)
})

test('linkSync uses synchronous protocol variants when provided', (t) => {
  const store = {
    [root + '/index.js']: "module.exports = require('./dep')",
    [root + '/dep.js']: 'module.exports = 42'
  }

  const protocol = new Module.Protocol({
    async exists(url) {
      t.fail('the asynchronous variant was used')
    },

    existsSync: (url) => url.href in store,

    async read(url) {
      t.fail('the asynchronous variant was used')
    },

    readSync: (url) => store[url.href] ?? null,

    async resolve(url) {
      t.fail('the asynchronous variant was used')
    },

    resolveSync: (url) => url
  })

  const loader = new Module.Loader({ protocol })

  t.is(loader.importSync(new URL(root + '/index.js')), 42)
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

      return 'module.exports = 2'
    },

    readSync(url) {
      return 'module.exports = 40'
    }
  })

  const { exports } = await Module.load(new URL(root + '/index.js'), { protocol })

  t.is(exports, 42)
})

test('loadSync throws when protocol read is asynchronous', (t) => {
  const protocol = asyncSources({ [root + '/foo.cjs']: 'module.exports = 42' })

  t.exception(() => Module.loadSync(new URL(root + '/foo.cjs'), { protocol }), /UNEXPECTED_PROMISE/)
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
  const protocol = sources(
    { [root + '/index.js']: 'module.exports = 42' },
    {
      async read(url) {
        return 'module.exports = 42'
      }
    }
  )

  const loader = new Module.Loader({ protocol })

  t.exception(() => loader.linkSync(new URL(root + '/index.js')), /UNEXPECTED_PROMISE/)
})

test('linkSync throws when protocol resolve is asynchronous', (t) => {
  const protocol = sources(
    {
      [root + '/index.js']: "module.exports = require('./dep')",
      [root + '/dep.js']: 'module.exports = 42'
    },
    {
      async resolve(url) {
        return url
      }
    }
  )

  const loader = new Module.Loader({ protocol })

  t.exception(() => loader.linkSync(new URL(root + '/index.js')), /UNEXPECTED_PROMISE/)
})

test('linkSync throws when protocol list is asynchronous', (t) => {
  const store = {
    [root + '/index.js']: "module.exports = require.asset('./foo.txt')",
    [root + '/foo.txt']: 'hello'
  }

  const protocol = new Module.Protocol({
    existsSync: (url) => url.href in store,

    readSync: (url) => store[url.href] ?? null,

    async *list(url) {
      yield new URL(root + '/foo.txt')
    }
  })

  const loader = new Module.Loader({ protocol })

  t.exception(() => loader.importSync(new URL(root + '/index.js')), /UNEXPECTED_PROMISE/)
})
