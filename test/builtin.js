const test = require('brittle')
const Module = require('..')
const { asyncSources, root, sources } = require('./helpers')

test('resolve and load builtin', async (t) => {
  const builtins = {
    foo: 42
  }

  const { href } = await Module.resolve('foo', new URL(root + '/'), { builtins })
  const { exports } = await Module.load(new URL('builtin:foo'), { builtins })

  t.is(href, 'builtin:foo')
  t.is(exports, 42)
})

test('resolve builtin with asynchronous protocol', async (t) => {
  const builtins = { foo: 42 }

  const protocol = asyncSources({})

  const { href } = await Module.resolve('foo', new URL(root + '/'), { builtins, protocol })

  t.is(href, 'builtin:foo')
})

test('load builtin from .cjs', async (t) => {
  const protocol = sources({
    [root + '/foo.cjs']: "module.exports = require('bar')"
  })

  const { exports } = await Module.load(new URL(root + '/foo.cjs'), {
    protocol,
    builtins: { bar: 42 }
  })

  t.is(exports, 42)
})

test('load builtin from .mjs', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']: "export { default } from 'bar'"
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), {
    protocol,
    builtins: { bar: 42 }
  })

  t.is(exports.default, 42)
})

test('load builtin with named exports', async (t) => {
  const protocol = sources({
    [root + '/index.mjs']: "import { foo } from 'bar'; export default foo"
  })

  const { exports } = await Module.load(new URL(root + '/index.mjs'), {
    protocol,
    builtins: { bar: { foo: 42 } }
  })

  t.is(exports.default, 42)
})

test('export names are gathered through a re-exported builtin', (t) => {
  const protocol = sources({
    [root + '/index.mjs']: `import { hello } from './re.cjs'\nexport default hello`,
    [root + '/re.cjs']: `module.exports = require('greet')`
  })

  // A builtin has no record until one is asked for, so gathering names has to
  // ask rather than look only at what the traversal left behind.
  const { exports } = Module.loadSync(new URL(root + '/index.mjs'), {
    protocol,
    builtins: { greet: { hello: 'world' } }
  })

  t.is(exports.default, 'world')
})

test('a builtin is served only for a name the builtins own', async (t) => {
  // The resolver's allowlist is the own keys of the builtins, so a name reached
  // only through the prototype chain is not among what was granted.
  const builtins = Object.create({ inherited: 'inherited' })
  builtins.own = 'own'

  const load = (name) => {
    const protocol = sources({
      [root + '/foo.cjs']: `module.exports = require(${JSON.stringify('builtin:' + name)})`
    })

    return Module.load(new URL(root + '/foo.cjs'), { protocol, builtins })
  }

  const { exports } = await load('own')

  t.is(exports, 'own')

  for (const name of ['inherited', 'constructor', '__proto__', 'hasOwnProperty']) {
    await t.exception(load(name), /MODULE_NOT_FOUND/, `'${name}' is not a builtin`)
  }
})
