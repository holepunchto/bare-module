module.exports = class ModuleError extends Error {
  constructor(msg, fn = ModuleError, code = fn.name) {
    super(`${code}: ${msg}`)
    this.code = code

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, fn)
    }
  }

  get name() {
    return 'ModuleError'
  }

  static MODULE_NOT_FOUND(msg, specifier, referrer = null, candidates = []) {
    const err = new ModuleError(msg, ModuleError.MODULE_NOT_FOUND)

    err.specifier = specifier
    err.referrer = referrer
    err.candidates = candidates

    return err
  }

  static ASSET_NOT_FOUND(msg, specifier, referrer = null, candidates = []) {
    const err = new ModuleError(msg, ModuleError.ASSET_NOT_FOUND)

    err.specifier = specifier
    err.referrer = referrer
    err.candidates = candidates

    return err
  }

  static UNKNOWN_PROTOCOL(msg) {
    return new ModuleError(msg, ModuleError.UNKNOWN_PROTOCOL)
  }

  static INVALID_BUNDLE_EXTENSION(msg) {
    return new ModuleError(msg, ModuleError.INVALID_BUNDLE_EXTENSION)
  }

  static INVALID_URL_PATH(msg) {
    return new ModuleError(msg, ModuleError.INVALID_URL_PATH)
  }

  static INVALID_IMPORTS_MAP(msg) {
    return new ModuleError(msg, ModuleError.INVALID_IMPORTS_MAP)
  }

  static TYPE_INCOMPATIBLE(msg) {
    return new ModuleError(msg, ModuleError.TYPE_INCOMPATIBLE)
  }
}
