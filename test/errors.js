const test = require('brittle')
const Module = require('..')
const { root, sources } = require('./helpers')

test('load file that cannot be read', async (t) => {
  const protocol = sources(
    { [root + '/foo.cjs']: null },
    {
      read() {
        throw new Error('foo')
      }
    }
  )

  await t.exception(Module.load(new URL(root + '/foo.cjs'), { protocol }), /Error: foo/)
})

test('throw in .cjs', async (t) => {
  const protocol = sources({
    [root + '/foo.cjs']: "throw new Error('foo')"
  })

  await t.exception(Module.load(new URL(root + '/foo.cjs'), { protocol }), /Error: foo/)
})

test('throw in .cjs imported from .cjs', async (t) => {
  const protocol = sources({
    [root + '/foo.cjs']: "require('/bar.cjs')",
    [root + '/bar.cjs']: "throw new Error('bar')"
  })

  await t.exception(Module.load(new URL(root + '/foo.cjs'), { protocol }), /Error: bar/)
})

test('throw in .cjs, load again', async (t) => {
  const cache = Object.create(null)

  const protocol = sources({
    [root + '/foo.cjs']: "throw new Error('foo')"
  })

  await t.exception(Module.load(new URL(root + '/foo.cjs'), { protocol, cache }), /Error: foo/)
  await t.exception(Module.load(new URL(root + '/foo.cjs'), { protocol, cache }), /Error: foo/)
})

test('throw in .mjs', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']: "throw new Error('foo')"
  })

  await t.exception(Module.load(new URL(root + '/foo.mjs'), { protocol }), /Error: foo/)
})

test('throw in .mjs imported from .mjs', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']: "import '/bar.mjs'",
    [root + '/bar.mjs']: "throw new Error('bar')"
  })

  await t.exception(Module.load(new URL(root + '/foo.mjs'), { protocol }), /Error: bar/)
})

test('throw in .mjs, load again', async (t) => {
  const cache = Object.create(null)

  const protocol = sources({
    [root + '/foo.mjs']: "throw new Error('foo')"
  })

  await t.exception(Module.load(new URL(root + '/foo.mjs'), { protocol, cache }), /Error: foo/)
  await t.exception(Module.load(new URL(root + '/foo.mjs'), { protocol, cache }), /Error: foo/)
})

test('type error in .cjs', async (t) => {
  const protocol = sources({
    [root + '/foo.cjs']: 'null.foo()'
  })

  await t.exception.all(Module.load(new URL(root + '/foo.cjs'), { protocol }), /TypeError/)
})

test('type error in .cjs imported from .cjs', async (t) => {
  const protocol = sources({
    [root + '/foo.cjs']: "require('/bar.cjs')",
    [root + '/bar.cjs']: 'null.foo()'
  })

  await t.exception.all(Module.load(new URL(root + '/foo.cjs'), { protocol }), /TypeError/)
})

test('type error in .cjs imported from .mjs', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']: "import bar from '/bar.cjs'",
    [root + '/bar.cjs']: 'null.foo()'
  })

  await t.exception.all(Module.load(new URL(root + '/foo.mjs'), { protocol }), /TypeError/)
})

test('type error in .cjs imported from .mjs with type error', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']: "import '/bar.cjs'; null.foo()",
    [root + '/bar.cjs']: 'null.bar()'
  })

  await t.exception.all(Module.load(new URL(root + '/foo.mjs'), { protocol }), /TypeError/)
})

test('type error in .cjs imported from .mjs with type error and top-level await', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']: "import '/bar.cjs'; await 42; null.foo()",
    [root + '/bar.cjs']: 'null.bar()'
  })

  await t.exception.all(Module.load(new URL(root + '/foo.mjs'), { protocol }), /TypeError/)
})

test('type error in .cjs, load again', async (t) => {
  const cache = Object.create(null)

  const protocol = sources({
    [root + '/foo.cjs']: 'null.foo()'
  })

  await t.exception.all(Module.load(new URL(root + '/foo.cjs'), { protocol, cache }), /TypeError/)
  await t.exception.all(Module.load(new URL(root + '/foo.cjs'), { protocol, cache }), /TypeError/)
})

test('type error in .mjs', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']: 'null.foo()'
  })

  await t.exception.all(Module.load(new URL(root + '/foo.mjs'), { protocol }), /TypeError/)
})

test('type error in .mjs imported from .mjs', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']: "import '/bar.mjs'",
    [root + '/bar.mjs']: 'null.foo()'
  })

  await t.exception.all(Module.load(new URL(root + '/foo.mjs'), { protocol }), /TypeError/)
})

test('type error in .mjs imported from .mjs with type error', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']: "import '/bar.mjs'; null.foo()",
    [root + '/bar.mjs']: 'null.bar()'
  })

  await t.exception.all(Module.load(new URL(root + '/foo.mjs'), { protocol }), /TypeError/)
})

test('type error in .mjs imported from .mjs with type error and top-level await', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']: "import '/bar.mjs'; await 42; null.foo()",
    [root + '/bar.mjs']: 'null.bar()'
  })

  await t.exception.all(Module.load(new URL(root + '/foo.mjs'), { protocol }), /TypeError/)
})

test('type error in .mjs, load again', async (t) => {
  const cache = Object.create(null)

  const protocol = sources({
    [root + '/foo.mjs']: 'null.foo()'
  })

  await t.exception.all(Module.load(new URL(root + '/foo.mjs'), { protocol, cache }), /TypeError/)
  await t.exception.all(Module.load(new URL(root + '/foo.mjs'), { protocol, cache }), /TypeError/)
})

test('syntax error in .cjs', async (t) => {
  const protocol = sources({
    [root + '/foo.cjs']: '1 + ()'
  })

  await t.exception.all(Module.load(new URL(root + '/foo.cjs'), { protocol }), /SyntaxError/)
})

test('syntax error in .cjs imported from .cjs', async (t) => {
  const protocol = sources({
    [root + '/foo.cjs']: "require('/bar.cjs')",
    [root + '/bar.cjs']: '1 + ()'
  })

  await t.exception.all(Module.load(new URL(root + '/foo.cjs'), { protocol }), /SyntaxError/)
})

test('syntax error in .cjs, load again', async (t) => {
  const cache = Object.create(null)

  const protocol = sources({
    [root + '/foo.cjs']: '1 + ()'
  })

  await t.exception.all(Module.load(new URL(root + '/foo.cjs'), { protocol, cache }), /SyntaxError/)
  await t.exception.all(Module.load(new URL(root + '/foo.cjs'), { protocol, cache }), /SyntaxError/)
})

test('syntax error in .mjs', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']: '1 + ()'
  })

  await t.exception.all(Module.load(new URL(root + '/foo.mjs'), { protocol }), /SyntaxError/)
})

test('syntax error in .mjs imported from .mjs', async (t) => {
  const protocol = sources({
    [root + '/foo.mjs']: "import '/bar.mjs'",
    [root + '/bar.mjs']: '1 + ()'
  })

  await t.exception.all(Module.load(new URL(root + '/foo.mjs'), { protocol }), /SyntaxError/)
})

test('syntax error in .mjs, load again', async (t) => {
  const cache = Object.create(null)

  const protocol = sources({
    [root + '/foo.mjs']: '1 + ()'
  })

  await t.exception.all(Module.load(new URL(root + '/foo.mjs'), { protocol, cache }), /SyntaxError/)
  await t.exception.all(Module.load(new URL(root + '/foo.mjs'), { protocol, cache }), /SyntaxError/)
})
