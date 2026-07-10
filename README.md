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

#### `Module.constants`

| Constant | Description                                                                  |
| :------- | :--------------------------------------------------------------------------- |
| `SCRIPT` | The module is a CommonJS module.                                             |
| `MODULE` | The module is a ECMAScript module.                                           |
| `JSON`   | The module is a JSON file.                                                   |
| `BUNDLE` | The module is a [`bare-bundle`](https://github.com/holepunchto/bare-bundle). |
| `ADDON`  | The module is a native addon.                                                |
| `BINARY` | The module is a binary file.                                                 |
| `TEXT`   | The module is a text file.                                                   |

#### `Module.protocol`

The default `ModuleProtocol` instance. It has no capabilities of its own; in particular, it cannot read from the file system. To serve modules from a backing store, provide your own protocol. See [Protocols](#protocols) for usage.

#### `Module.cache`

The shared cache of loaded modules. Use of this cache is opt-in: pass `cache: true` to load a module into it.

#### `const url = await Module.resolve(specifier, parentURL[, condition][, options])`

Resolve the module `specifier` relative to the `parentURL`. `specifier` is a string and `parentURL` is a WHATWG `URL`. `condition` is an optional import condition, defaulting to `'require'` if not specified.

Options include:

```js
options = {
  // The referring module.
  referrer: null,
  // The type of the module. See Module.constants.type for possible values. The
  // default is the equivalent constant of the `attributes`'s `type` property.
  type,
  // A list of file extensions to look for. The default is based on the `type`
  // option.
  extensions: [],
  // The ModuleProtocol to resolve the specifier. Defaults to referrer's
  // protocol if defined, otherwise defaults to Module.protocol
  protocol,
  // A default "imports" map to apply to all specifiers. Follows the same
  // syntax and rules as the "imports" property defined in `package.json`.
  imports,
  // A map of preresolved imports with keys being serialized parent URLs and
  // values being "imports" maps.
  resolutions,
  // A map of builtin module specifiers to loaded modules. If matched by the
  // default resolver, the protocol of the resolved URL will be `builtin:`.
  builtins,
  // The supported import conditions. "default" is always recognized.
  conditions: [],
  // The import attributes, e.g. the `{ type: "json" }` in:
  // `import foo from 'foo' with { type: "json" }`
  // or in:
  // `require('foo', { with: { type: "json" } })`
  attributes
}
```

#### `const url = await Module.asset(specifier, parentURL[, options])`

Get the asset URL by resolving `specifier` relative to `parentURL`. `specifier` is a string and `parentURL` is a WHATWG `URL`.

Options include:

```js
options = {
  // The referring module.
  referrer: null,
  // The ModuleProtocol to use resolve the specifier. Defaults to referrer's
  // protocol if defined, otherwise defaults to Module.protocol
  protocol,
  // A default "imports" map to apply to all specifiers. Follows the same
  // syntax and rules as the "imports" property defined in `package.json`.
  imports,
  // A map of preresolved imports with keys being serialized parent URLs and
  // values being "imports" maps.
  resolutions,
  // The supported import conditions. "default" is always recognized.
  conditions
}
```

#### `const module = await Module.load(url[, source][, options])`

Load a module with the provided `url`. `url` is a WHATWG `URL`. If provided, the `source` will be passed to the matching `extension` for the `url`.

Options include:

```js
options = {
  // Whether the module is called via `import` or `import()`.
  isImport: false,
  // Whether the module is called via `import()`.
  isDynamicImport: false,
  // The referring module.
  referrer: null,
  // The type of the module. See Module.constants.type for possible values. The
  // default is the equivalent constant of the `attributes`'s `type` property.
  type,
  // The assumed type of a module without a type using an ambiguous extension
  // such as `.js`. See Module.constants.type. Inherited from `referrer` if it
  // is defined.
  defaultType: Module.constants.type.SCRIPT,
  // Cache to use to load the Module. When left unspecified, the cache is
  // inherited from `referrer` so a module graph shares a single cache,
  // otherwise a fresh cache scoped to this load and its graph is used. Pass
  // an explicit cache object to use it, `true` to opt in to the shared
  // `Module.cache`, or `false` to force a fresh cache.
  cache,
  // The module representing the entry script where the program was launched.
  main,
  // The ModuleProtocol to use resolve the specifier. Defaults to referrer's
  // `protocol` if defined, otherwise defaults to `Module.protocol`.
  protocol,
  // A default "imports" map to apply to all specifiers. Follows the same
  // syntax and rules as the "imports" property defined in `package.json`.
  imports,
  // A map of preresolved imports with keys being serialized parent URLs and
  // values being "imports" maps.
  resolutions,
  // A map of builtin module specifiers to loaded modules. If the `url`'s
  // protocol is `builtin:`, the module's exports will be set to the matching
  // value in the map for `url.pathname`.
  builtins,
  // The supported import conditions. "default" is always recognized.
  conditions,
  // The import attributes, e.g. the `{ type: "json" }` in:
  // `import foo from 'foo' with { type: "json" }`
  // or in:
  // `require('foo', { with: { type: "json" } })`
  attributes
}
```

#### `module.url`

The WHATWG `URL` identifier of the module.

#### `module.filename`

The file portion of `module.url`.

#### `module.dirname`

The directory portion of `module.url`.

#### `module.type`

The type of the module. See [`Module.constants.type`](#module.constants.type) for possible values.

#### `module.defaultType`

The assumed type of a module without a `type` using an ambiguous extension, such as `.js`. See [`Module.constants.type`](#module.constants.type) for possible values.

#### `module.cache`

A cache of loaded modules for this module. Defaults to `Module.cache`.

#### `module.main`

The module representing the entry script where the program was launched.

#### `module.exports`

The exports from the module.

#### `module.imports`

The import map when the module was loaded.

#### `module.resolutions`

A map of preresolved imports with keys being serialized parent URLs and values being `"imports"` maps. Resolutions performed while loading the module are cached in this map, keyed by the condition (`"import"`, `"require"`, or `"asset"`) that produced them, so that repeated resolutions of the same specifier can be served from the cache.

#### `module.builtins`

A map of builtin module specifiers mapped to the loaded module.

#### `module.conditions`

An array of conditions used to resolve dependencies while loading the module. See [Conditional Exports](#conditional-exports) for possible values.

#### `module.protocol`

The `ModuleProtocol` class used for resolving, reading, and loading modules. See [Protocols](#protocols).

### CommonJS modules

#### `require(specifier[, options])`

Used to import JavaScript or JSON modules and local files. Relative paths such as `./`, `./foo`, `./bar/baz`, and `../foo` will be resolved against the directory named by `__dirname`. POSIX style paths are resolved in an OS independent fashion, meaning that the examples above will work on Windows in the same way they would on POSIX systems.

Returns the exported module contents.

Options include:

```js
options = {
  // The import attributes which instruct how the file or module should be loaded.
  // Possible values for `type` are `script`, `module`, `json`, `bundle`,
  // `addon`, `binary` and `text`.
  with: { type: 'json' }
}
```

#### `require.main`

The module representing the entry script where the program was launched. The same value as [`module.main`](#modulemain) for the current module.

#### `require.cache`

A cache of loaded modules for this module. The same value as `module.cache` for the current module.

#### `const path = require.resolve(specifier[, parentURL])`

Use the internal machinery of `require()` to resolve the `specifier` string relative to the URL `parentURL` and return the path string.

#### `require.addon([specifier][, parentURL])`

Also used to import modules but specifically loads only addon modules. `specifier` is resolved relative to `parentURL` using the [addon resolution](https://github.com/holepunchto/bare-addon-resolve#algorithm) algorithm.

Returns the exported module contents.

A common pattern for writing an addon module is to use `require.addon()` as the JavaScript module exports:

```js
module.exports = require.addon()
```

See [`bare-addon`](https://github.com/holepunchto/bare-addon) for a template of building native addon modules.

#### `require.addon.host`

Returns the string representation of the platform and architecture used when resolving addons with the pattern `<platform>-<arch>[-<environment>]`. Returns the same value as `Bare.Addon.host`.

#### `const path = require.addon.resolve([specifier][, parentURL])`

Resolve the `specifier` string relative to the URL `parentURL` as an addon and returns the path string. The `specifier` is resolved using the [addon resolution algorithm](https://github.com/holepunchto/bare-addon-resolve#algorithm).

#### `const path = require.asset(specifier[, parentURL])`

Resolve the `specifier` relative to the `parentURL` and return the path of the asset as a string.

Can be used to load assets, for example the following loads `./foo.txt` from the local files:

```js
const fs = require('bare-fs')
const contents = fs.readFileSync(require.asset('./foo.txt'))
```

### ECMAScript modules

#### `import defaultExport, * as name, { export1, export2 as alias2, ... } from 'specifier' with { type: 'json' }`

The static `import` declaration is used to import read-only live bindings that are exported by another module. The imported bindings are called _live_ bindings because they are updated by the module that exported the binding, but cannot be re-assigned by the importing module. In brief, you can import what is exported from another module.

For more information on `import` syntax, see [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import).

#### `import.meta.url`

The string representation of the URL for the current module.

#### `import.meta.main`

A boolean representing whether the current module is the entry script where the program was launched.

#### `import.meta.cache`

A cache of loaded modules for this module. The same value as `module.cache` for the current module.

#### `import.meta.dirname`

The directory name of the current module.

#### `import.meta.filename`

The file name of the current module.

#### `const href = import.meta.resolve(specifier[, parentURL])`

A module-relative resolution function which returns the URL string for the module. The `specifier` is a string which is resolved relative to the `parentURL` which is a WHATWG URL.

#### `import.meta.addon([specifier][, parentURL])`

Also used to import modules but specifically loads only addon modules. `specifier` is resolved relative to `parentURL` using the [addon resolution](https://github.com/holepunchto/bare-addon-resolve#algorithm) algorithm.

Returns the exported module contents.

#### `import.meta.addon.host`

Returns the string representation of the platform and architecture used when resolving addons with the pattern `<platform>-<arch>[-<environment>]`. Returns the same value as `Bare.Addon.host`.

#### `const href = import.meta.addon.resolve([specifier][, parentURL])`

Resolve the `specifier` string relative to the URL `parentURL` as an addon and returns the URL string. The `specifier` is resolved using the [addon resolution algorithm](https://github.com/holepunchto/bare-addon-resolve#algorithm).

#### `const href = import.meta.asset(specifier[, parentURL])`

Resolve the `specifier` relative to the `parentURL` and return the URL of the asset as a string.

### Custom `require()`

Creating a custom require allows one to create a preconfigured `require()`. This can be useful in scenarios such as a Read-Evaluate-Print-Loop (REPL) where the parent URL is set to a directory so requiring relative paths to work correctly.

#### `const require = Module.createRequire(parentURL[, options])`

Options include:

```js
options = {
  // The module to become the `referrer` for the returned `require()`. Defaults
  // to creating a new module instance from the `parentURL` with the same
  // options.
  module: null,
  // The referring module.
  referrer: null,
  // The type of the module. See Module.constants.type for possible values.
  type: Module.constants.type.SCRIPT,
  // The assumed type of a module without a type using an ambiguous extension
  // such as `.js`. See Module.constants.type. Inherited from `referrer` if it
  // is defined, otherwise defaults to SCRIPT.
  defaultType: Module.constants.type.SCRIPT,
  // A cache of loaded modules. Inherited from `referrer` if it is defined,
  // otherwise a fresh cache is used. Pass an explicit cache object to use it,
  // `true` to opt in to the shared `Module.cache`, or `false` to force a fresh
  // cache.
  cache,
  // The module representing the entry script where the program was launched.
  main,
  // The ModuleProtocol to use resolve the specifier and/or the module. Defaults to
  // referrer's protocol if defined, otherwise defaults to Module.protocol
  protocol,
  // A default "imports" map to apply to all specifiers. Follows the same
  // syntax and rules as the "imports" property defined in `package.json`.
  imports,
  // A map of preresolved imports with keys being serialized parent URLs and
  // values being "imports" maps.
  resolutions,
  // A map of builtin module specifiers to loaded modules.
  builtins,
  // The supported import conditions. "default" is always recognized.
  conditions
}
```

### Protocols

Protocols define how to resolve, access and load modules. Custom protocols can be defined to extend or replace how module are resolved and loaded to support things like loading modules via a [`Hyperdrive`](https://github.com/holepunchto/hyperdrive).

#### `const protocol = new Module.Protocol(methods, context = null)`

Methods include:

```js
methods = {
  // function (url): URL
  // A function to post-process a resolved URL before it is used, for example to
  // canonicalize symlinks with `realpath` so a module reached through different
  // symlinks dedupes against its real location. Defaults to the identity.
  resolve,
  // function (url): boolean | Promise<boolean>
  // A function that returns whether the URL exists as a boolean. Consulted before
  // `read`, so a candidate that does not exist is never fetched. Defaults to
  // whether `read` returns a non-null source, but a backing store can override it
  // with a cheaper check, such as a `stat` or an HTTP `HEAD`. May return a promise
  // to answer asynchronously.
  exists,
  // function (url): string | Buffer | null | Promise<string | Buffer | null>
  // A function that returns the source of a URL as a string or buffer, or `null`
  // if it does not exist. May return a promise to serve the source asynchronously.
  read,
  // function* (url): Iterable<URL> | AsyncIterable<URL>
  // A generator enumerating the URLs under a prefix, used for asset globbing.
  // Defaults to a single candidate - the prefix itself, if it exists - so a
  // backing store need only provide it to support listing a directory.
  list
}
```

A protocol may return a promise from `resolve`, `exists`, or `read` to serve modules asynchronously. Such a protocol can be driven by the asynchronous `Module` statics (`Module.load`, `Module.resolve`, and `Module.asset`) and [`Loader`](#loader) methods; the synchronous entry points (`require()`, `loader.linkSync`, and `loader.importSync`) throw when a protocol read returns a promise.

#### `const extended = protocol.extend(methods)`

Return a new `ModuleProtocol` that overrides the given `methods`, falling back to this protocol for any method not provided.

### Loader

A `Loader` owns a registry of module records keyed by URL and drives resolution and linking against a [protocol](#protocols). Where the `Module` statics link and evaluate in a single call, a loader exposes linking and evaluation as separate steps, as well as synchronous variants, so modules can be served from an asynchronous protocol such as one backed by a [`Hyperdrive`](https://github.com/holepunchto/hyperdrive).

Linking is split into two phases. First a graph is _linked_: every module reachable from the entry is read, lexed, and recorded, and its native module is created without running any code. Then it is _evaluated_: the recorded modules run. All IO happens during linking, so evaluation is synchronous regardless of how the graph was fetched.

#### `const loader = new Module.Loader([options])`

Options include:

```js
options = {
  // The ModuleProtocol used to resolve and read modules. Defaults to
  // Module.protocol, which has no backing store of its own.
  protocol,
  // A map of builtin module specifiers to their exports.
  builtins,
  // The assumed type of a module without a type using an ambiguous extension
  // such as `.js`. See Module.constants.type for possible values.
  defaultType,
  // A default "imports" map to apply to all specifiers. Follows the same syntax
  // and rules as the "imports" property defined in `package.json`.
  imports,
  // The module cache. Pass an object to use it, `true` to opt in to the shared
  // Module.cache, or omit for a fresh cache scoped to this loader.
  cache,
  // A map of preresolved imports with keys being serialized parent URLs and
  // values being "imports" maps. Defaults to following the cache: a shared cache
  // shares its resolutions, a fresh cache gets fresh resolutions.
  resolutions
}
```

#### `const module = await loader.link(entry[, source][, options])`

Link the module graph rooted at `entry`, a WHATWG `URL`, awaiting each read through the protocol so an asynchronous protocol can serve the source. If `source` is given, it is used instead of reading `entry` through the protocol. Returns the entry module, instantiated but not yet evaluated.

#### `const module = loader.linkSync(entry[, source][, options])`

The synchronous equivalent of `loader.link()`. A protocol whose `read`, `exists`, or `resolve` returns a promise cannot be driven synchronously and throws.

#### `const exports = await loader.import(entry[, options])`

Link and evaluate the graph rooted at `entry`, returning its exports. Awaits the entry's evaluation, so a top-level `await` in the entry settles before the exports are returned.

#### `const exports = loader.importSync(entry[, options])`

The synchronous equivalent of `loader.import()`. It cannot await, so a top-level `await` in the entry is unsupported.

#### `const module = loader.get(url)`

Return the module record cached under `url`, a WHATWG `URL`, or `null` if none is loaded.

#### `loader.main`

The graph's main module: the first entry linked. `null` until the first link.

#### `loader.cache`

The registry of loaded modules, keyed by URL href.

#### `loader.resolutions`

The graph's resolution cache, keyed by referrer URL, aggregated as modules are linked.

#### `loader.addons`, `loader.assets`

The addon and asset URLs discovered while linking, accumulated across link calls. These are the non-module files the graph depends on, such as what a bundler would need to include.

#### `loader.protocol`, `loader.builtins`, `loader.imports`, `loader.defaultType`, `loader.conditions`

The loader configuration, mirroring the like-named getters on a [`module`](#moduleurl).

## License

Apache-2.0
