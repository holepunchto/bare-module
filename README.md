# bare-module

Module support for JavaScript.

```
npm i bare-module
```

## Usage

```js
const Module = require('bare-module')
````

## API

#### `Module.constants`

#### `Module.constants.states`

#### `Module.constants.types`

#### `Module.cache`

#### `const resolved = Module.resolve(specifier[, dirname][, options])`

Options include:

```js
{
}
```

#### `const module = Module.load(specifier[, source][, options])`

Options include:

```js
{
}
```

#### `module.filename`

#### `module.dirname`

#### `module.type`

#### `module.defaultType`

#### `module.main`

#### `module.exports`

#### `module.imports`

#### `module.builtins`

#### `module.conditions`

#### `module.protocol`

#### `module.destroy()`

### Custom `require()`

#### `const require = Module.createRequire(filename[, options])`

### Protocols

#### `const protocol = new Module.Protocol(options)`

Options include:

```js
{
}
```

### Bundles

#### `const bundle = new Module.Bundle()`

## License

Apache-2.0
