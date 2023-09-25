module.exports = class ModuleError extends Error {
  constructor (msg, code, fn = ModuleError) {
    super(`${code}: ${msg}`)
    this.code = code

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, fn)
    }
  }

  get name () {
    return 'ModuleError'
  }

  static MODULE_NOT_FOUND (msg) {
    return new ModuleError(msg, 'MODULE_NOT_FOUND', ModuleError.MODULE_NOT_FOUND)
  }

  static UNKNOWN_PROTOCOL (msg) {
    return new ModuleError(msg, 'UNKNOWN_PROTOCOL', ModuleError.UNKNOWN_PROTOCOL)
  }

  static INVALID_BUNDLE_EXTENSION (msg) {
    return new ModuleError(msg, 'INVALID_BUNDLE_EXTENSION', ModuleError.INVALID_BUNDLE_EXTENSION)
  }
}
