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

#### `const url = Module.resolve(specifier, parentURL[, options])`

Options include:

```js
{
}
```

#### `const module = Module.load(url[, source][, options])`

Options include:

```js
{
}
```

#### `module.url`

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

#### `const require = Module.createRequire(url[, options])`

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
