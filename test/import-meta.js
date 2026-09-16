const test = require('brittle')
const Module = require('..')
const { path, root, sources } = require('./helpers')

test('import.meta', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']: 'export default import.meta'
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })
  const { default: meta } = exports

  t.is(meta.url, root + '/foo.mjs')
  t.is(meta.main, true)
  t.is(meta.dirname, path('/'))
  t.is(meta.filename, path('/foo.mjs'))
})

test('import.meta.cache', async (t) => {
  const cache = Object.create(null)

  const protocol = sources({
    [root + '/foo.mjs']: 'export default import.meta.cache'
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol, cache })

  t.is(exports.default, cache)
})

test('import.meta.cache is require.cache of the same graph', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']: `
      import bar from '/bar.cjs'
      export default import.meta.cache === bar
    `,
    [root + '/bar.cjs']: 'module.exports = require.cache'
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.is(exports.default, true)
})

test('import.meta.resolve', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']: "export default import.meta.resolve('./bar')",
    [root + '/bar.mjs']: 'export default 42'
  })

  const { exports } = await Module.load(new URL(root + '/foo.mjs'), { protocol })

  t.is(exports.default, root + '/bar.mjs')
})
