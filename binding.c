#include <assert.h>
#include <bare.h>
#include <js.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <utf.h>

typedef struct {
  js_env_t *env;
  js_ref_t *ctx;
  js_ref_t *on_import;
  js_ref_t *on_dynamic_import;
  js_ref_t *on_evaluate;
  js_ref_t *on_meta;
} bare_module_context_t;

static js_module_t *
bare_module__on_import(js_env_t *env, js_value_t *specifier, js_value_t *assertions, js_module_t *referrer, void *data) {
  bare_module_context_t *context = (bare_module_context_t *) data;

  int err;

  js_handle_scope_t *scope;
  err = js_open_handle_scope(env, &scope);
  assert(err == 0);

  js_value_t *ctx;
  err = js_get_reference_value(env, context->ctx, &ctx);
  assert(err == 0);

  js_value_t *on_import;
  err = js_get_reference_value(env, context->on_import, &on_import);
  assert(err == 0);

  js_value_t *id;
  err = js_get_module_id(env, referrer, &id);
  assert(err == 0);

  js_value_t *args[2] = {specifier, id};

  js_value_t *result;
  err = js_call_function(env, ctx, on_import, 2, args, &result);
  if (err < 0) goto err;

  js_module_t *module;
  err = js_unwrap(env, result, (void **) &module);
  if (err < 0) goto err;

  err = js_close_handle_scope(env, scope);
  assert(err == 0);

  return module;

err:
  err = js_close_handle_scope(env, scope);
  assert(err == 0);

  return NULL;
}

static js_value_t *
bare_module__on_dynamic_import(js_env_t *env, js_value_t *specifier, js_value_t *assertions, js_value_t *referrer, js_value_t *id, void *data) {
  bare_module_context_t *context = (bare_module_context_t *) data;

  int err;

  js_escapable_handle_scope_t *scope;
  err = js_open_escapable_handle_scope(env, &scope);
  assert(err == 0);

  js_value_t *ctx;
  err = js_get_reference_value(env, context->ctx, &ctx);
  assert(err == 0);

  js_value_t *on_dynamic_import;
  err = js_get_reference_value(env, context->on_dynamic_import, &on_dynamic_import);
  assert(err == 0);

  js_value_t *args[3] = {specifier, referrer, id};

  js_value_t *result;
  err = js_call_function(env, ctx, on_dynamic_import, 3, args, &result);
  if (err < 0) goto err;

  err = js_escape_handle(env, scope, result, &result);
  assert(err == 0);

  err = js_close_escapable_handle_scope(env, scope);
  assert(err == 0);

  return result;

err:
  err = js_close_escapable_handle_scope(env, scope);
  assert(err == 0);

  return NULL;
}

static void
bare_module__on_evaluate(js_env_t *env, js_module_t *module, void *data) {
  bare_module_context_t *context = (bare_module_context_t *) data;

  int err;

  js_handle_scope_t *scope;
  err = js_open_handle_scope(env, &scope);
  assert(err == 0);

  js_value_t *ctx;
  err = js_get_reference_value(env, context->ctx, &ctx);
  assert(err == 0);

  js_value_t *on_evaluate;
  err = js_get_reference_value(env, context->on_evaluate, &on_evaluate);
  assert(err == 0);

  js_value_t *id;
  err = js_get_module_id(env, module, &id);
  assert(err == 0);

  js_value_t *args[1] = {id};

  js_value_t *result;
  err = js_call_function(env, ctx, on_evaluate, 1, args, &result);
  if (err < 0) goto err;

  err = js_close_handle_scope(env, scope);
  assert(err == 0);

  return;

err:
  err = js_close_handle_scope(env, scope);
  assert(err == 0);
}

static void
bare_module__on_meta(js_env_t *env, js_module_t *module, js_value_t *meta, void *data) {
  bare_module_context_t *context = (bare_module_context_t *) data;

  int err;

  js_handle_scope_t *scope;
  err = js_open_handle_scope(env, &scope);
  assert(err == 0);

  js_value_t *ctx;
  err = js_get_reference_value(env, context->ctx, &ctx);
  assert(err == 0);

  js_value_t *on_meta;
  err = js_get_reference_value(env, context->on_meta, &on_meta);
  assert(err == 0);

  js_value_t *id;
  err = js_get_module_id(env, module, &id);
  assert(err == 0);

  js_value_t *args[2] = {id, meta};

  js_value_t *result;
  err = js_call_function(env, ctx, on_meta, 2, args, &result);
  if (err < 0) goto err;

  err = js_close_handle_scope(env, scope);
  assert(err == 0);

  return;

err:
  err = js_close_handle_scope(env, scope);
  assert(err == 0);
}

static void
bare_module__on_finalize_context(js_env_t *env, void *data, void *finalize_hint) {
  int err;

  bare_module_context_t *context = data;

  err = js_delete_reference(env, context->on_import);
  assert(err == 0);

  err = js_delete_reference(env, context->on_dynamic_import);
  assert(err == 0);

  err = js_delete_reference(env, context->on_evaluate);
  assert(err == 0);

  err = js_delete_reference(env, context->on_meta);
  assert(err == 0);

  err = js_delete_reference(env, context->ctx);
  assert(err == 0);

  free(context);
}

static js_value_t *
bare_module_init(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 5;
  js_value_t *argv[5];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 5);

  bare_module_context_t *context = malloc(sizeof(bare_module_context_t));

  context->env = env;

  err = js_create_reference(env, argv[0], 1, &context->ctx);
  assert(err == 0);

  err = js_create_reference(env, argv[1], 1, &context->on_import);
  assert(err == 0);

  err = js_create_reference(env, argv[2], 1, &context->on_dynamic_import);
  assert(err == 0);

  err = js_create_reference(env, argv[3], 1, &context->on_evaluate);
  assert(err == 0);

  err = js_create_reference(env, argv[4], 1, &context->on_meta);
  assert(err == 0);

  err = js_wrap(env, argv[0], (void *) context, bare_module__on_finalize_context, NULL, NULL);
  assert(err == 0);

  err = js_on_dynamic_import(env, bare_module__on_dynamic_import, (void *) context);
  assert(err == 0);

  return NULL;
}

static js_value_t *
bare_module_create_function(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 4;
  js_value_t *argv[4];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 4);

  size_t file_len;
  utf8_t file[1024];
  err = js_get_value_string_utf8(env, argv[0], file, 1024, &file_len);
  if (err < 0) return NULL;

  uint32_t args_len;
  err = js_get_array_length(env, argv[1], &args_len);
  if (err < 0) return NULL;

  js_value_t **args = malloc(sizeof(js_value_t *) * args_len);

  err = js_get_array_elements(env, argv[1], args, args_len, 0, NULL);
  if (err < 0) goto err;

  js_value_t *source = argv[2];

  int32_t offset;
  err = js_get_value_int32(env, argv[3], &offset);
  if (err < 0) goto err;

  js_value_t *result;
  err = js_create_function_with_source(env, NULL, 0, (char *) file, file_len, args, args_len, 0, source, &result);
  if (err < 0) goto err;

  free(args);

  return result;

err:
  free(args);

  return NULL;
}

static js_value_t *
bare_module_get_function_id(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 1;
  js_value_t *argv[1];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  js_value_t *result;
  err = js_get_function_id(env, argv[0], &result);
  if (err < 0) return NULL;

  return result;
}

static void
bare_module__on_finalize(js_env_t *env, void *data, void *finalize_hint) {
  int err;

  js_module_t *module = data;

  err = js_delete_module(env, module);
  assert(err == 0);
}

static js_value_t *
bare_module_create_module(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 5;
  js_value_t *argv[5];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 5);

  bare_module_context_t *context;
  err = js_unwrap(env, argv[0], (void **) &context);
  if (err < 0) return NULL;

  size_t file_len;
  utf8_t file[1024];
  err = js_get_value_string_utf8(env, argv[2], file, 1024, &file_len);
  if (err < 0) return NULL;

  js_value_t *source = argv[3];

  int32_t offset;
  err = js_get_value_int32(env, argv[4], &offset);
  if (err < 0) return NULL;

  js_module_t *module;
  err = js_create_module(env, (char *) file, file_len, offset, source, bare_module__on_meta, (void *) context, &module);
  if (err < 0) return NULL;

  err = js_wrap(env, argv[1], (void *) module, bare_module__on_finalize, NULL, NULL);
  if (err < 0) return NULL;

  js_value_t *result;
  err = js_get_module_id(env, module, &result);
  if (err < 0) return NULL;

  return result;
}

static js_value_t *
bare_module_create_synthetic_module(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 4;
  js_value_t *argv[4];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 4);

  bare_module_context_t *context;
  err = js_unwrap(env, argv[0], (void **) &context);
  if (err < 0) return NULL;

  size_t file_len;
  utf8_t file[1024];
  err = js_get_value_string_utf8(env, argv[2], file, 1024, &file_len);
  if (err < 0) return NULL;

  uint32_t names_len;
  err = js_get_array_length(env, argv[3], &names_len);
  if (err < 0) return NULL;

  js_value_t **export_names = malloc(sizeof(js_value_t *) * names_len);

  err = js_get_array_elements(env, argv[3], export_names, names_len, 0, NULL);
  if (err < 0) goto err;

  js_module_t *module;
  err = js_create_synthetic_module(env, (char *) file, file_len, export_names, names_len, bare_module__on_evaluate, (void *) context, &module);
  if (err < 0) goto err;

  err = js_wrap(env, argv[1], (void *) module, bare_module__on_finalize, NULL, NULL);
  if (err < 0) goto err;

  js_value_t *result;
  err = js_get_module_id(env, module, &result);
  if (err < 0) goto err;

  free(export_names);

  return result;

err:
  free(export_names);

  return NULL;
}

static js_value_t *
bare_module_set_module_export(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 3;
  js_value_t *argv[3];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 3);

  js_module_t *module;
  err = js_unwrap(env, argv[0], (void **) &module);
  if (err < 0) return NULL;

  js_set_module_export(env, module, argv[1], argv[2]);

  return NULL;
}

static js_value_t *
bare_module_run_module(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 3;
  js_value_t *argv[3];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 3);

  bare_module_context_t *context;
  err = js_unwrap(env, argv[0], (void **) &context);
  if (err < 0) return NULL;

  js_module_t *module;
  err = js_unwrap(env, argv[1], (void **) &module);
  if (err < 0) return NULL;

  err = js_instantiate_module(env, module, bare_module__on_import, (void *) context);
  if (err < 0) return NULL;

  js_value_t *promise;
  err = js_run_module(env, module, &promise);
  if (err < 0) return NULL;

  bool is_promise;
  err = js_is_promise(env, promise, &is_promise);
  assert(err == 0);

  if (is_promise) {
    js_promise_state_t state;
    err = js_get_promise_state(env, promise, &state);
    assert(err == 0);

    js_value_t *reason;

    if (state == js_promise_rejected) {
      err = js_get_promise_result(env, promise, &reason);
      if (err < 0) return NULL;
    } else {
      err = js_get_null(env, &reason);
      assert(err == 0);
    }

    js_value_t *exception;
    err = js_get_and_clear_last_exception(env, &exception);
    assert(err == 0);

    js_value_t *ctx;
    err = js_get_reference_value(env, context->ctx, &ctx);
    assert(err == 0);

    js_value_t *args[3] = {reason, promise, exception};

    js_call_function(env, ctx, argv[2], 3, args, NULL);
  }

  return promise;
}

static js_value_t *
bare_module_get_module_namespace(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 1;
  js_value_t *argv[1];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  js_module_t *module;
  err = js_unwrap(env, argv[0], (void **) &module);
  if (err < 0) return NULL;

  js_value_t *result;
  err = js_get_module_namespace(env, module, &result);
  if (err < 0) return NULL;

  return result;
}

static js_value_t *
bare_module_exports(js_env_t *env, js_value_t *exports) {
  int err;

#define V(name, fn) \
  { \
    js_value_t *val; \
    err = js_create_function(env, name, -1, fn, NULL, &val); \
    assert(err == 0); \
    err = js_set_named_property(env, exports, name, val); \
    assert(err == 0); \
  }

  V("init", bare_module_init)

  V("createFunction", bare_module_create_function)
  V("getFunctionID", bare_module_get_function_id)

  V("createModule", bare_module_create_module)
  V("createSyntheticModule", bare_module_create_synthetic_module)
  V("setModuleExport", bare_module_set_module_export)
  V("runModule", bare_module_run_module)
  V("getModuleNamespace", bare_module_get_module_namespace)
#undef V

  return exports;
}

BARE_MODULE(bare_module, bare_module_exports)
