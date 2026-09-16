const test = require('brittle')
const Module = require('..')
const { root, sources } = require('./helpers')

test('load .cjs with dynamic .cjs import', async (t) => {
  const protocol = sources({
    [root + '/foo.cjs']: "const bar = import('/bar')",
    [root + '/bar.cjs']: 'module.exports = 42'
  })

  await t.execution(Module.load(new URL(root + '/foo.cjs'), { protocol }))
})

test('load .cjs with dynamic .mjs import', async (t) => {
  const protocol = sources({
    [root + '/foo.cjs']: "const bar = import('/bar')",
    [root + '/bar.mjs']: 'export default 42'
  })

  await t.execution(Module.load(new URL(root + '/foo.cjs'), { protocol }))
})

test('load .mjs with dynamic .cjs import', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']: "const { default: bar } = await import('/bar')",
    [root + '/bar.cjs']: 'module.exports = 42'
  })

  await t.execution(Module.load(new URL(root + '/foo.mjs'), { protocol }))
})

test('load .mjs with dynamic .mjs import', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']: "const { default: bar } = await import('/bar')",
    [root + '/bar.mjs']: 'export default 42'
  })

  await t.execution(Module.load(new URL(root + '/foo.mjs'), { protocol }))
})

test('load .cjs with static and dynamic .cjs import', async (t) => {
  const protocol = sources({
    [root + '/foo.cjs']: "require('/bar'); import('/bar')",
    [root + '/bar.cjs']: 'module.exports = 42'
  })

  await t.execution(Module.load(new URL(root + '/foo.cjs'), { protocol }))
})

test('load .cjs with static and dynamic .mjs import', async (t) => {
  const protocol = sources({
    [root + '/foo.cjs']: "require('/bar'); import('/bar')",
    [root + '/bar.mjs']: 'export default 42'
  })

  await t.execution(Module.load(new URL(root + '/foo.cjs'), { protocol }))
})

test('dynamic import with a computed specifier', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']: "export default import('/bar' + '.mjs')",
    [root + '/bar.mjs']: 'export default 42'
  })

  const mod = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  const bar = await mod.exports.default

  t.is(bar.default, 42)
})

test('dynamic import in .mjs uses the graph cache for referrer lookup', async (t) => {
  const cache = Object.create(null)

  const protocol = sources({
    [root + '/foo.mjs']: "export default import('/bar')",
    [root + '/bar.mjs']: 'export default 42'
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol, cache })
  const bar = await exports.default

  t.is(bar.default, 42)

  t.ok(cache[root + '/foo.mjs'], 'referrer is cached in the graph cache')
})

test('dynamic import in .cjs uses the graph cache for referrer lookup', async (t) => {
  const cache = Object.create(null)

  const protocol = sources({
    [root + '/foo.cjs']: "module.exports = import('/bar')",
    [root + '/bar.cjs']: 'module.exports = 42'
  })

  const { exports } = await Module.load(new URL(root + '/foo.cjs'), { protocol, cache })
  const bar = await exports

  t.is(bar.default, 42)

  t.ok(cache[root + '/foo.cjs'], 'referrer is cached in the graph cache')
})
