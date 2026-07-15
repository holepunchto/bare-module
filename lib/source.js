module.exports = class ModuleSource {
  constructor(dependency) {
    this.url = dependency.url
    this.type = dependency.type
    this.bytes = toBuffer(dependency.source)
    this.imports = dependency.imports
    this.lexer = dependency.lexer
  }

  get exports() {
    return this.lexer.exports.map((entry) => entry.name)
  }
}

function toBuffer(source) {
  return typeof source === 'string' ? Buffer.from(source) : source
}
