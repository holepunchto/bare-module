const errors = require('../errors')

module.exports = function instantiate() {
  throw errors.ADDON_HOST_INCOMPATIBLE('WebAssembly addons are not supported on this platform')
}
