# bare-module

The module system that powers Bare. It resolves and loads CommonJS and ECMAScript modules, as well as JSON, native addons, assets, bundles, binary, and text, and implements `package.json` resolution including the [`"exports"`](#exports), [`"imports"`](#imports), and [conditional](#conditional-exports) fields. Resolution and loading are driven by pluggable [protocols](#protocols), so modules can be served from somewhere other than the file system, such as a [`Hyperdrive`](https://github.com/holepunchto/hyperdrive) or a [`bare-bundle`](https://github.com/holepunchto/bare-bundle).

```
npm i bare-module
```

## Usage

A module is loaded by its WHATWG `URL`. The source may be read through the module's [protocol](#protocols) or passed in directly:

```js
const Module = require('bare-module')

// Load a module directly from source, without it existing on disk.
const foo = await Module.load(
  new URL('file:///foo.js'),
  'module.exports = function add (a, b) { return a + b }'
)

foo.exports(2, 3)
// 5
```

To resolve and load specifiers relative to a directory, as `require()` does, create a `require()` bound to a parent URL. The default protocol has no backing store of its own and cannot read from the file system, so pass a [protocol](#protocols) that serves the source:

```js
const Module = require('bare-module')

const require = Module.createRequire('file:///directory/', { protocol })

// Resolves and loads `file:///directory/foo.js`, reading it through `protocol`.
const foo = require('./foo.js')
```

The same machinery backs the `require()` and `import` available to modules as they run; see [CommonJS modules](#commonjs-modules) and [ECMAScript modules](#ecmascript-modules) for what each exposes.

## Packages

A package is a directory with a `package.json` file.

### Fields

#### `"name"`

```json
{
  "name": "my-package"
}
```

The name of the package. This is used for [addon resolution](https://github.com/holepunchto/bare-addon-resolve#algorithm), [self-referencing](#self-referencing), and importing packages by name.

#### `"version"`

```json
{
  "version": "1.2.3"
}
```

The current version of the package. This is used for [addon resolution](https://github.com/holepunchto/bare-addon-resolve#algorithm).

#### `"type"`

```json
{
  "type": "module"
}
```

The module format used for `.js` files. If not defined, `.js` files are interpreted as CommonJS. If set to `"module"`, `.js` files are instead interpreted as ES modules.

#### `"exports"`

```json
{
  "exports": {
    ".": "./index.js"
  }
}
```

The entry points of the package. If defined, only the modules explicitly exported by the package may be imported when importing the package by name.

##### Subpath exports

A package may define more than one entry point by declaring several subpaths with the main export being `"."`:

```json
{
  "exports": {
    ".": "./index.js",
    "./submodule": "./lib/submodule.js"
  }
}
```

When importing the package by name, `require('my-package')` will resolve to `<modules>/my-package/index.js` whereas `require('my-package/submodule')` will resolve to `<modules>/my-package/lib/submodule.js`.

##### Conditional exports

Conditional exports allow packages to provide different exports for different conditions, such as the loading method the importing module uses (e.g. `require()` vs `import`):

```json
{
  "exports": {
    ".": {
      "import": "./index.mjs",
      "require": "./index.cjs"
    }
  }
}
```

When importing the package by name, `require('my-package')` will resolve to `<modules>/my-package/index.cjs` whereas `import 'my-package'` will resolve to `<modules>/my-package/index.mjs`.

Similarly, conditional exports can be used to provide different entry points for different runtimes:

```json
{
  "exports": {
    ".": {
      "bare": "./bare.js",
      "node": "./node.js"
    }
  }
}
```

To provide a fallback for when no other conditions match, the `"default"` condition can be declared:

```json
{
  "exports": {
    ".": {
      "bare": "./bare.js",
      "node": "./node.js",
      "default": "./fallback.js"
    }
  }
}
```

The following conditions are supported, listed in order from most specific to least specific as conditions should be defined:

| Condition      | Description                                                                                                                         |
| :------------- | :---------------------------------------------------------------------------------------------------------------------------------- |
| `"import"`     | Matches when the package is loaded via `import` or `import()`.                                                                      |
| `"require"`    | Matches when the package is loaded via `require()`.                                                                                 |
| `"asset"`      | Matches when the package is loaded via `require.asset()`.                                                                           |
| `"addon"`      | Matches when the package is loaded via `require.addon()`.                                                                           |
| `"bare"`       | Matches for any [Bare](https://github.com/holepunchto/bare) environment.                                                            |
| `"node"`       | Matches for any Node.js environment.                                                                                                |
| `"<platform>"` | Matches when equal to `Bare.platform`. See [`Bare.platform`](https://github.com/holepunchto/bare#bareplatform) for possible values. |
| `"<arch>"`     | Matches when equal to `Bare.arch`. See [`Bare.arch`](https://github.com/holepunchto/bare#barearch) for possible values.             |
| `"simulator"`  | Matches when Bare was compiled for a simulator.                                                                                     |
| `"default"`    | The fallback that always matches. This condition should always be last.                                                             |

Export conditions are evaluated in the order they are defined in the `"exports"` field. This means that less specific conditionals defined first will override more specific conditions define later. For example, the following will always call `./fallback.js` because `"default"` always matches and is defined first.

```json
{
  "exports": {
    ".": {
      "default": "./fallback.js",
      "bare": "./bare.js"
    }
  }
}
```

This is why the general rule is that conditions should be from most specific to least specific when defined.

##### Self-referencing

Within a package, exports defined in the `"exports"` field can be referenced by importing the package by name. For example, given the following `package.json`...

```json
{
  "name": "my-package",
  "exports": {
    ".": "./index.js",
    "./submodule": "./lib/submodule.js"
  }
}
```

...any module within `my-package` may reference these entry points using either `require('my-package')` or `require('my-package/submodule')`.

##### Exports sugar

If a package defines only a single export, `"."`, it may leave out the subpath entirely:

```json
{
  "exports": "./index.js"
}
```

#### `"imports"`

A private mapping for import specifiers within the package itself. Similar to `"exports"`, the `"imports"` field can be used to conditional import other packages within the package. But unlike `"exports"`, `"imports"` permits mapping to external packages.

The rules are otherwise analogous to the [`"exports"`](#conditional-exports) field.

##### Subpath imports

Just like exports, subpaths can be used when importing a module internally.

```json
{
  "imports": {
    ".": "./index.js",
    "./submodule": "./lib/submodule.js"
  }
}
```

##### Conditional imports

Adding conditional imports allows importing different packages based on the configured conditions. As an example:

```json
{
  "imports": {
    "bar": {
      "require": "./baz.cjs",
      "import": "./baz.mjs"
    }
  }
}
```

When importing the package `bar` as `require('bar')` will resolve to `./baz.cjs`, but when importing with `import('bar')` will resolve to `./baz.mjs`.

To provide a fallback for when no other conditions are met, the `"default"` condition can be configured like so:

```json
{
  "imports": {
    "bar": {
      "require": "./baz.cjs",
      "asset": "./baz.txt",
      "default": "./baz.mjs"
    }
  }
}
```

The following conditions are supported, listed in order from most specific to least specific as conditions should be defined:

| Condition      | Description                                                                                                                         |
| :------------- | :---------------------------------------------------------------------------------------------------------------------------------- |
| `"import"`     | Matches when the package is loaded via `import` or `import()`.                                                                      |
| `"require"`    | Matches when the package is loaded via `require()`.                                                                                 |
| `"asset"`      | Matches when the package is loaded via `require.asset()`.                                                                           |
| `"addon"`      | Matches when the package is loaded via `require.addon()`.                                                                           |
| `"bare"`       | Matches for any [Bare](https://github.com/holepunchto/bare) environment.                                                            |
| `"node"`       | Matches for any Node.js environment.                                                                                                |
| `"<platform>"` | Matches when equal to `Bare.platform`. See [`Bare.platform`](https://github.com/holepunchto/bare#bareplatform) for possible values. |
| `"<arch>"`     | Matches when equal to `Bare.arch`. See [`Bare.arch`](https://github.com/holepunchto/bare#barearch) for possible values.             |
| `"simulator"`  | Matches when Bare was compiled for a simulator.                                                                                     |
| `"default"`    | The fallback that always matches. This condition should always be last.                                                             |

The general rule is that conditions should be from most specific to least specific when defined.

##### `#` Prefix

All import maps are private to the package and allow mapping to external packages. Entries in `"imports"` may start with `#` to disambiguate from external packages, but it is not required unlike in Node.js.

#### `"engines"`

```json
{
  "engines": {
    "bare": ">=1.0.5"
  }
}
```

The `"engines"` field defines the engine requirements of the package. During module resolution, the versions declared by `Bare.versions` will be tested against the requirements declared by the package and resolution fail if they're not satisfied.

## API

See the [full API reference](https://docs.pears.com/reference/bare/modules/bare-module).

## License

Apache-2.0
