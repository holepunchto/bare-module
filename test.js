const test = require('brittle')
const path = require('path')
const Module = require('.')

test('resolve', (t) => {
  Module.configure({
    exists (filename) {
      return (
        filename === p('node_modules/foo') ||
        filename === p('node_modules/foo/index.js')
      )
    }
  })

  t.is(
    Module.resolve('foo'),
    path.join(process.cwd(), 'node_modules/foo/index.js')
  )
})

test('load', (t) => {
  Module.configure({
    exists (filename) {
      return (
        filename === p('node_modules/foo') ||
        filename === p('node_modules/foo/index.js')
      )
    },

    read (filename) {
      t.is(filename, p('node_modules/foo/index.js'))

      return 'module.exports = 42'
    }
  })

  t.is(Module.load(Module.resolve('foo')), 42)
})

test('load with source', (t) => {
  Module.configure({
    exists (filename) {
      return (
        filename === p('node_modules/foo') ||
        filename === p('node_modules/foo/index.js')
      )
    },

    read () {
      t.fail()
    }
  })

  t.is(Module.load(Module.resolve('foo'), 'module.exports = 42'), 42)
})

function p (f) {
  return path.join(process.cwd(), f)
}
