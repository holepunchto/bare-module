const test = require('brittle')
const Module = require('..')
const { root, sources } = require('./helpers')

test('options are an object', async (t) => {
  const url = new URL(root + '/index.cjs')

  for (const opts of [42, true, 'options']) {
    await t.exception.all(() => Module.loadSync(url, null, opts), TypeError, `loadSync(${opts})`)
    await t.exception.all(() => Module.createRequire(url, opts), TypeError)
    await t.exception.all(() => Module.resolveSync('./foo.js', url, 'require', opts), TypeError)
  }

  // A second argument that is neither source nor options used to be taken for
  // options, dropping the protocol with it. A string is source, not options.
  for (const opts of [42, true]) {
    await t.exception.all(() => Module.loadSync(url, opts), TypeError, `loadSync(url, ${opts})`)
  }
})

test('a cache and its resolutions are an object or nothing', async (t) => {
  const protocol = new Module.Protocol()

  // Whether a graph is shared is said by naming the object, so neither the
  // boolean that used to reach a process-wide cache nor the one that used to
  // stand for a fresh one is a cache. Resolutions follow a cache, and neither
  // has a value standing for no map at all.
  for (const name of ['cache', 'resolutions']) {
    for (const value of [true, false, null, 0, 'map']) {
      await t.exception.all(
        () => new Module.Loader({ protocol, [name]: value }),
        TypeError,
        `${typeof value} ${value} is not a ${name} map`
      )

      await t.exception.all(
        () => Module.load(new URL(root + '/index.cjs'), { protocol, [name]: value }),
        TypeError
      )
    }

    t.execution(() => new Module.Loader({ protocol, [name]: Object.create(null) }))
  }

  t.execution(() => new Module.Loader({ protocol }), 'omitting them gives fresh maps')
})

test('loader options are checked', async (t) => {
  const protocol = new Module.Protocol()

  // Every one of these is read as the shape it should have been, so a wrong one
  // is not ignored but quietly answers for something. A string read as builtins
  // has a builtin at every index.
  const rejected = {
    builtins: [42, 'abc', true],
    imports: [42, 'abc', true],
    defaultType: ['module', 999, 1.5, -1],
    concurrency: ['4', -1, 1.5, NaN, Infinity, null, {}]
  }

  for (const name in rejected) {
    for (const value of rejected[name]) {
      await t.exception.all(
        () => new Module.Loader({ protocol, [name]: value }),
        TypeError,
        `${name}: ${typeof value} ${value}`
      )
    }
  }

  t.execution(() => new Module.Loader({ protocol, builtins: {}, imports: {} }))
  t.execution(() => new Module.Loader({ protocol, defaultType: Module.constants.MODULE }))
  t.execution(() => new Module.Loader({ protocol, defaultType: 0, concurrency: 0 }))
  t.execution(() => new Module.Loader({ protocol, builtins: null, imports: null }))
})

test('a builtins map is read for its own keys only', async (t) => {
  // A string is an object of sorts, but not one of these.
  await t.exception.all(() => new Module.Loader({ builtins: 'abc' }), TypeError)

  const loader = new Module.Loader({ builtins: { 1: 'own' } })

  t.is(loader.importSync(new URL('builtin:1')), 'own')
})

test('an entry is a URL', async (t) => {
  const protocol = new Module.Protocol()
  const loader = new Module.Loader({ protocol })

  for (const entry of [42, null, {}, 'file:///index.cjs']) {
    await t.exception.all(() => loader.linkSync(entry), TypeError, `linkSync(${entry})`)
    await t.exception.all(() => loader.link(entry), TypeError, `link(${entry})`)
    await t.exception.all(() => loader.get(entry), TypeError, `get(${entry})`)
  }

  t.execution(() => loader.get(new URL(root + '/index.cjs')))
})

test('a parent URL is a URL', async (t) => {
  const protocol = new Module.Protocol()

  for (const parentURL of [42, {}, true]) {
    await t.exception.all(
      () => Module.resolveSync('./foo.js', parentURL, { protocol }),
      TypeError,
      `resolveSync(${parentURL})`
    )

    await t.exception.all(
      () => Module.createRequire(parentURL, { protocol }),
      TypeError,
      `createRequire(${parentURL})`
    )
  }

  t.execution(() => Module.createRequire(root + '/', { protocol }))
  t.execution(() => Module.createRequire(new URL(root + '/'), { protocol }))
})

test('resolve with non-string specifier', async (t) => {
  await t.exception.all(Module.resolve(42, new URL(root + '/')), /TypeError/)
})

test('a resolve condition is one this module system knows', async (t) => {
  const protocol = new Module.Protocol()
  const parentURL = new URL(root + '/')

  for (const condition of ['bogus', 42, true, '']) {
    await t.exception.all(
      () => Module.resolveSync('./foo.js', parentURL, condition, { protocol }),
      TypeError,
      `condition: ${condition}`
    )
  }

  // An unknown condition used to resolve as though nothing had been asked for.
  for (const condition of ['require', 'import', 'asset', 'addon']) {
    await t.exception.all(
      () => Module.resolveSync('./foo.js', parentURL, condition, { protocol }),
      /NOT_FOUND/,
      `condition: ${condition}`
    )
  }
})

test('an import attribute names a type this module system knows', (t) => {
  const protocol = sources({
    // The type is held in a variable so the attribute is not one the lexer can
    // read off the specifier, which is what puts the question to the loader
    // rather than to the traversal.
    [root + '/index.cjs']: `
      require('./dep.js')

      const answer = (type) => {
        try { return ['ok', require('./dep.js', { with: { type } })] }
        catch (e) { return ['threw', e.code] }
      }

      module.exports = { answer }
    `,
    [root + '/dep.js']: 'module.exports = 42'
  })

  const { answer } = Module.loadSync(new URL(root + '/index.cjs'), { protocol }).exports

  t.alike(answer('script'), ['ok', 42], 'the type it is')
  t.alike(answer('json'), ['threw', 'TYPE_INCOMPATIBLE'], 'a type it is not')

  // A type nobody defines used to be passed over, handing back whatever the
  // module happened to be rather than saying the request could not be met.
  for (const type of ['bogus', 'constructor', '__proto__', '']) {
    t.alike(answer(type), ['threw', 'UNKNOWN_MODULE_TYPE'], `type: '${type}'`)
  }
})

test('an import attribute type is a string', async (t) => {
  const protocol = sources({
    [root + '/index.cjs']: `
      require('./dep.js')

      module.exports = {
        type: (type) => require('./dep.js', { with: { type } }),
        attributes: (attributes) => require('./dep.js', { with: attributes })
      }
    `,
    [root + '/dep.js']: 'module.exports = 42'
  })

  const require = Module.loadSync(new URL(root + '/index.cjs'), { protocol }).exports

  // A value that is not a string used to be read as no type at all, so an
  // attribute the module system could not read went unanswered. An array of one
  // string is the sharp case: it reads as a type but is not one.
  for (const type of [null, 42, true, {}, ['script'], Symbol('script')]) {
    await t.exception.all(() => require.type(type), TypeError, `type: ${String(type)}`)
  }

  for (const attributes of [42, 'script', true]) {
    await t.exception.all(
      () => require.attributes(attributes),
      TypeError,
      `with: ${String(attributes)}`
    )
  }

  t.is(require.type(undefined), 42, 'no type asked')
  t.is(require.attributes(undefined), 42, 'no attributes at all')
  t.is(require.attributes(null), 42)

  // The same holds where attributes reach the traversal rather than the check.
  for (const attributes of [{ type: 42 }, { type: null }, { type: ['script'] }, 42]) {
    await t.exception.all(
      () => Module.loadSync(new URL(root + '/dep.js'), { protocol, attributes }),
      TypeError,
      `attributes: ${JSON.stringify(attributes)}`
    )
  }
})
