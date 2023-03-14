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

  static NOT_FOUND (msg) {
    return new ModuleError(msg, 'NOT_FOUND', ModuleError.NOT_FOUND)
  }

  static UNKNOWN_PROTOCOL (msg) {
    return new ModuleError(msg, 'UNKNOWN_PROTOCOL', ModuleError.UNKNOWN_PROTOCOL)
  }
}
