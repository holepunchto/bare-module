const SyntheticModule = require('./synthetic')

// A builtin module, whose exports are provided directly by the host through the
// builtins map. It has no type of its own and exposes only a default export.
module.exports = class BuiltinModule extends SyntheticModule {}
