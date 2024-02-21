# bare-module

Module support for JavaScript.

```
npm i bare-module
```

## Usage

```js
const Module = require('bare-module')
````

## Packages

A package is directory with a `package.json` file.

### Fields

#### `"name"`

#### `"version"`

#### `"type"`

#### `"exports"`

#### `"imports"`

## API

#### `Module.constants`

#### `Module.constants.states`

Constant | Description
:-- | :--
`EVALUATED` |
`SYNTHESIZED` |
`DESTROYED` |

#### `Module.constants.types`

Constant | Description
:-- | :--
`SCRIPT` |
`MODULE` |
`JSON` |
`BUNDLE` |
`ADDON` |

#### `Module.cache`

#### `const url = Module.resolve(specifier, parentURL[, options])`

Options include:

```js
{
  referrer = null,
  protocol,
  imports,
  resolutions,
  builtins,
  conditions
}
```

#### `const module = Module.load(url[, source][, options])`

Options include:

```js
{
  referrer = null,
  type,
  defaultType = constants.types.SCRIPT,
  cache,
  main,
  protocol,
  imports,
  resolutions,
  builtins,
  conditions
}
```

#### `module.url`

#### `module.filename`

#### `module.dirname`

#### `module.type`

#### `module.defaultType`

#### `module.cache`

#### `module.main`

#### `module.exports`

#### `module.imports`

#### `module.resolutions`

#### `module.builtins`

#### `module.conditions`

#### `module.protocol`

#### `module.destroy()`

### Custom `require()`

#### `const require = Module.createRequire(parentURL[, options])`

Options include:

```js
{
  referrer = null,
  type = constants.types.SCRIPT,
  defaultType = constants.types.SCRIPT,
  cache,
  main,
  protocol,
  imports,
  resolutions,
  builtins,
  conditions
}
```

### Protocols

#### `const protocol = new Module.Protocol(options)`

Options include:

```js
{
  preresolve,
  postresolve,
  resolve,
  exists,
  read,
  load
}
```

### Bundles

#### `const bundle = new Module.Bundle()`

See <https://github.com/holepunchto/bare-bundle>.

## License

Apache-2.0
