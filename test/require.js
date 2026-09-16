const test = require('brittle')
const Module = require('..')
const { isWindows, path, root, sources } = require('./helpers')

test('require.main', async (t) => {
  const cache = Object.create(null)

  const protocol = sources({
    [root + '/foo.js']: "module.exports = require.main; require('/bar')",
    [root + '/bar.js']: 'module.exports = require.main'
  })

  const foo = await Module.load(new URL(root + '/foo.js'), { protocol, cache })
  const bar = await Module.load(new URL(root + '/bar.js'), { protocol, cache })

  t.is(foo.exports, foo)
  t.is(bar.exports, foo)
})

test('require.cache', async (t) => {
  const cache = Object.create(null)

  const protocol = sources({
    [root + '/foo.js']: 'module.exports = require.cache'
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol, cache })

  t.is(exports, cache)
})

test('require.resolve', async (t) => {
  const protocol = sources({
    [root + '/foo.js']: "module.exports = require.resolve('./bar')",
    [root + '/bar.js']: 'module.exports = 42'
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, path('/bar.js'))
})

test('require.resolve with parentURL', async (t) => {
  const protocol = sources({
    [root + '/foo.js']: `module.exports = require.resolve('./bar.js', '${root}/dir/')`,
    [root + '/dir/bar.js']: null
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, path('/dir/bar.js'))
})

test('require.resolve with filesystem path parentURL', async (t) => {
  const dir = path('/dir/')

  const protocol = sources({
    [root + '/foo.js']: `module.exports = require.resolve('./bar.js', ${JSON.stringify(dir)})`,
    [root + '/dir/bar.js']: null
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, path('/dir/bar.js'))
})

test('require.asset with parentURL', async (t) => {
  const protocol = sources({
    [root + '/foo.js']: `module.exports = require.asset('./bar.txt', new URL('${root}/dir/'))`,
    [root + '/dir/bar.txt']: 'hello'
  })

  const { exports } = await Module.load(new URL(root + '/foo.js'), { protocol })

  t.is(exports, path('/dir/bar.txt'))
})

test('createRequire', (t) => {
  const protocol = sources({
    [root + '/dir/bar.js']: 'module.exports = 42'
  })

  const require = Module.createRequire(root + '/dir/foo.js', { protocol })

  t.is(require('./bar'), 42)
})

test('createRequire with default type', (t) => {
  const protocol = sources({
    [root + '/dir/bar.js']: 'export default 42'
  })

  const require = Module.createRequire(root + '/dir/foo.js', {
    protocol,
    defaultType: Module.constants.MODULE
  })

  t.is(require('./bar').default, 42)
})

test('createRequire with a filesystem path', (t) => {
  const require = Module.createRequire(isWindows ? 'c:\\dir\\foo.js' : '/dir/foo.js')

  t.is(typeof require, 'function')
})

test('createRequire with referrer', async (t) => {
  const protocol = sources({
    [root + '/dir/foo.cjs']: 'module.exports = 1',
    [root + '/dir/bar.js']: 'module.exports = 42'
  })

  const foo = await Module.load(new URL(root + '/dir/foo.cjs'), { protocol })

  const require = Module.createRequire(null, { referrer: foo })

  t.is(require('./bar'), 42)
})
