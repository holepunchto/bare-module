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

function p (f) {
  return path.join(process.cwd(), f)
}
