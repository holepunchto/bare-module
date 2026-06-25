const Module = require('./lib/module')
const ModuleProtocol = require('./lib/protocol')
const constants = require('./lib/constants')

module.exports = exports = Module

exports.Protocol = ModuleProtocol

exports.constants = constants

// For Node.js compatibility
exports.builtinModules = []

// For Node.js compatibility
exports.isBuiltin = function isBuiltin() {
  return false
}
