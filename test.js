const test = require('brittle')
const path = require('path')
const Module = require('.')

test('resolve', (t) => {
  t.is(
    Module.resolve('brittle'),
    path.join(process.cwd(), 'node_modules/brittle/index.js')
  )
})
