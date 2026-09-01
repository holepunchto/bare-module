#include <assert.h>
#include <bare.h>
#include <js.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <utf.h>
#include <uv.h>

typedef struct {
  js_env_t *env;
  js_ref_t *ctx;
  js_ref_t *on_import;
  js_ref_t *on_dynamic_import;
  js_ref_t *on_evaluate;
  js_ref_t *on_meta;
} bare_module_context_t;

typedef struct {
  bool initialized;
} bare_module_state_t;

static const js_type_tag_t bare_module__context_tag = {
  .lower = 0x4d2a8f13c6b74e05,
  .upper = 0x8e17b309a5df42c1,
};

static const js_type_tag_t bare_module__module_tag = {
  .lower = 0xb6c41e7a2f083d59,
  .upper = 0x21fa9d5c8b3e6704,
};

static const js_type_tag_t bare_module__synthetic_module_tag = {
  .lower = 0x7c53e0a91d6b48f2,
  .upper = 0x0d94fc27e8a15b36,
};

static bool
bare_module__has_tag(js_env_t *env, js_value_t *value, const js_type_tag_t *tag) {
  int err;

  bool is_object;
  err = js_is_object(env, value, &is_object);
  assert(err == 0);

  if (!is_object) return false;

  bool tagged;
  err = js_check_type_tag(env, value, tag, &tagged);
  if (err < 0) return false;

  return tagged;
}

static bool
bare_module__is_module(js_env_t *env, js_value_t *value) {
  return bare_module__has_tag(env, value, &bare_module__module_tag) ||
         bare_module__has_tag(env, value, &bare_module__synthetic_module_tag);
}

static bool
bare_module__check_context(js_env_t *env, js_value_t *value) {
  int err;

  if (bare_module__has_tag(env, value, &bare_module__context_tag)) return true;

  err = js_throw_type_error(env, NULL, "Context must be a module context");
  assert(err == 0);

  return false;
}

static bool
bare_module__check_module(js_env_t *env, js_value_t *value) {
  int err;

  if (bare_module__is_module(env, value)) return true;

  err = js_throw_type_error(env, NULL, "Receiver must be a module");
  assert(err == 0);

  return false;
}

static bool
bare_module__check_synthetic_module(js_env_t *env, js_value_t *value) {
  int err;

  if (bare_module__has_tag(env, value, &bare_module__synthetic_module_tag)) return true;

  err = js_throw_type_error(env, NULL, "Receiver must be a synthetic module");
  assert(err == 0);

  return false;
}

static bool
bare_module__check_unclaimed(js_env_t *env, js_value_t *value) {
  int err;

  bool is_object;
  err = js_is_object(env, value, &is_object);
  assert(err == 0);

  if (is_object && !bare_module__is_module(env, value) && !bare_module__has_tag(env, value, &bare_module__context_tag)) {
    return true;
  }

  err = js_throw_type_error(env, NULL, "Receiver must be an unclaimed object");
  assert(err == 0);

  return false;
}

static bool
bare_module__check_function(js_env_t *env, js_value_t *value, const char *message) {
  int err;

  bool is_function;
  err = js_is_function(env, value, &is_function);
  assert(err == 0);

  if (!is_function) {
    err = js_throw_type_error(env, NULL, message);
    assert(err == 0);
  }

  return is_function;
}

static bool
bare_module__check_string(js_env_t *env, js_value_t *value, const char *message) {
  int err;

  bool is_string;
  err = js_is_string(env, value, &is_string);
  assert(err == 0);

  if (!is_string) {
    err = js_throw_type_error(env, NULL, message);
    assert(err == 0);
  }

  return is_string;
}

static bool
bare_module__get_int32(js_env_t *env, js_value_t *value, int32_t *result, const char *message) {
  int err;

  bool is_int32;
  err = js_is_int32(env, value, &is_int32);
  assert(err == 0);

  if (!is_int32) {
    err = js_throw_type_error(env, NULL, message);
    assert(err == 0);

    return false;
  }

  err = js_get_value_int32(env, value, result);
  assert(err == 0);

  return true;
}

static bool
bare_module__get_string(js_env_t *env, js_value_t *value, utf8_t *result, size_t len, size_t *result_len) {
  int err;

  if (!bare_module__check_string(env, value, "Value must be a string")) return false;

  size_t str_len;
  err = js_get_value_string_utf8(env, value, NULL, 0, &str_len);
  assert(err == 0);

  if (str_len + 1 /* NULL */ > len) {
    err = js_throw_error(env, uv_err_name(UV_ENAMETOOLONG), uv_strerror(UV_ENAMETOOLONG));
    assert(err == 0);

    return false;
  }

  err = js_get_value_string_utf8(env, value, result, len, result_len);
  assert(err == 0);

  return true;
}

static bool
bare_module__get_array_length(js_env_t *env, js_value_t *array, uint32_t *result, const char *message) {
  int err;

  bool is_array;
  err = js_is_array(env, array, &is_array);
  assert(err == 0);

  if (!is_array) {
    err = js_throw_type_error(env, NULL, message);
    assert(err == 0);

    return false;
  }

  err = js_get_array_length(env, array, result);

  return err >= 0;
}

static bool
bare_module__check_strings(js_env_t *env, js_value_t **elements, uint32_t len, const char *message) {
  for (uint32_t i = 0; i < len; i++) {
    if (!bare_module__check_string(env, elements[i], message)) return false;
  }

  return true;
}

static bool
bare_module__get_strings(js_env_t *env, js_value_t *array, js_value_t **result, uint32_t len, uint32_t *result_len, const char *message) {
  int err;

  uint32_t array_len;
  if (!bare_module__get_array_length(env, array, &array_len, message)) return false;

  if (array_len > len) {
    err = js_throw_error(env, uv_err_name(UV_E2BIG), uv_strerror(UV_E2BIG));
    assert(err == 0);

    return false;
  }

  uint32_t written;
  err = js_get_array_elements(env, array, result, array_len, 0, &written);
  if (err < 0) return false;

  if (!bare_module__check_strings(env, result, written, message)) return false;

  *result_len = written;

  return true;
}

static bool
bare_module__alloc_strings(js_env_t *env, js_value_t *array, js_value_t ***result, uint32_t *result_len, const char *message) {
  int err;

  uint32_t len;
  if (!bare_module__get_array_length(env, array, &len, message)) return false;

  js_value_t **elements = calloc(len, sizeof(js_value_t *));

  if (elements == NULL && len > 0) {
    err = js_throw_error(env, uv_err_name(UV_ENOMEM), uv_strerror(UV_ENOMEM));
    assert(err == 0);

    return false;
  }

  uint32_t written;
  err = js_get_array_elements(env, array, elements, len, 0, &written);

  if (err < 0) {
    free(elements);

    return false;
  }

  if (!bare_module__check_strings(env, elements, written, message)) {
    free(elements);

    return false;
  }

  *result = elements;
  *result_len = written;

  return true;
}

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

  js_module_t *module = NULL;

  js_value_t *result;
  err = js_call_function(env, ctx, on_import, 2, args, &result);
  if (err < 0) goto err;

  if (!bare_module__check_module(env, result)) goto err;

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
bare_module__destroy_context(js_env_t *env, bare_module_context_t *context) {
  int err;

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

static void
bare_module__on_finalize_context(js_env_t *env, void *data, void *finalize_hint) {
  bare_module__destroy_context(env, (bare_module_context_t *) data);
}

static js_value_t *
bare_module_init(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 5;
  js_value_t *argv[5];

  bare_module_state_t *state;
  err = js_get_callback_info(env, info, &argc, argv, NULL, (void **) &state);
  assert(err == 0);

  if (state->initialized) {
    err = js_throw_error(env, NULL, "Module context has already been initialized");
    assert(err == 0);

    return NULL;
  }

  if (!bare_module__check_unclaimed(env, argv[0])) return NULL;
  if (!bare_module__check_function(env, argv[1], "Import handler must be a function")) return NULL;
  if (!bare_module__check_function(env, argv[2], "Dynamic import handler must be a function")) return NULL;
  if (!bare_module__check_function(env, argv[3], "Evaluate handler must be a function")) return NULL;
  if (!bare_module__check_function(env, argv[4], "Meta handler must be a function")) return NULL;

  bare_module_context_t *context = malloc(sizeof(bare_module_context_t));

  if (context == NULL) {
    err = js_throw_error(env, uv_err_name(UV_ENOMEM), uv_strerror(UV_ENOMEM));
    assert(err == 0);

    return NULL;
  }

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

  if (err < 0) {
    bare_module__destroy_context(env, context);

    return NULL;
  }

  err = js_add_type_tag(env, argv[0], &bare_module__context_tag);
  if (err < 0) return NULL;

  err = js_on_dynamic_import(env, bare_module__on_dynamic_import, (void *) context);
  assert(err == 0);

  state->initialized = true;

  return NULL;
}

static js_value_t *
bare_module_create_function(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 4;
  js_value_t *argv[4];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  if (!bare_module__check_string(env, argv[2], "Source must be a string")) return NULL;

  int32_t offset;
  if (!bare_module__get_int32(env, argv[3], &offset, "Offset must be a 32-bit integer")) return NULL;

  size_t file_len;
  utf8_t file[4096];
  if (!bare_module__get_string(env, argv[0], file, sizeof(file), &file_len)) return NULL;

  uint32_t args_len;
  js_value_t *args[5];
  if (!bare_module__get_strings(env, argv[1], args, sizeof(args) / sizeof(args[0]), &args_len, "Argument names must be strings")) return NULL;

  js_value_t *source = argv[2];

  js_value_t *result;
  err = js_create_function_with_source(env, NULL, 0, (char *) file, file_len, args, args_len, offset, source, &result);
  if (err < 0) return NULL;

  return result;
}

static js_value_t *
bare_module_get_function_id(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 1;
  js_value_t *argv[1];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  if (!bare_module__check_function(env, argv[0], "Receiver must be a function")) return NULL;

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

  if (!bare_module__check_context(env, argv[0])) return NULL;
  if (!bare_module__check_unclaimed(env, argv[1])) return NULL;
  if (!bare_module__check_string(env, argv[3], "Source must be a string")) return NULL;

  int32_t offset;
  if (!bare_module__get_int32(env, argv[4], &offset, "Offset must be a 32-bit integer")) return NULL;

  bare_module_context_t *context;
  err = js_unwrap(env, argv[0], (void **) &context);
  if (err < 0) return NULL;

  size_t file_len;
  utf8_t file[4096];
  if (!bare_module__get_string(env, argv[2], file, sizeof(file), &file_len)) return NULL;

  js_value_t *source = argv[3];

  js_module_t *module;
  err = js_create_module(env, (char *) file, file_len, offset, source, bare_module__on_meta, (void *) context, &module);
  if (err < 0) return NULL;

  err = js_wrap(env, argv[1], (void *) module, bare_module__on_finalize, NULL, NULL);

  if (err < 0) {
    err = js_delete_module(env, module);
    assert(err == 0);

    return NULL;
  }

  err = js_add_type_tag(env, argv[1], &bare_module__module_tag);
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

  if (!bare_module__check_context(env, argv[0])) return NULL;

  bare_module_context_t *context;
  err = js_unwrap(env, argv[0], (void **) &context);
  if (err < 0) return NULL;

  size_t file_len;
  utf8_t file[4096];
  if (!bare_module__get_string(env, argv[2], file, sizeof(file), &file_len)) return NULL;

  js_value_t **export_names;
  uint32_t names_len;
  if (!bare_module__alloc_strings(env, argv[3], &export_names, &names_len, "Export names must be strings")) return NULL;

  // Reading the export names runs whatever the array puts in the way, so the
  // receiver is only known to be unclaimed once that has run its course.
  if (!bare_module__check_unclaimed(env, argv[1])) {
    free(export_names);

    return NULL;
  }

  js_module_t *module;
  err = js_create_synthetic_module(env, (char *) file, file_len, export_names, names_len, bare_module__on_evaluate, (void *) context, &module);

  free(export_names);

  if (err < 0) return NULL;

  err = js_wrap(env, argv[1], (void *) module, bare_module__on_finalize, NULL, NULL);

  if (err < 0) {
    err = js_delete_module(env, module);
    assert(err == 0);

    return NULL;
  }

  err = js_add_type_tag(env, argv[1], &bare_module__synthetic_module_tag);
  if (err < 0) return NULL;

  js_value_t *result;
  err = js_get_module_id(env, module, &result);
  if (err < 0) return NULL;

  return result;
}

static js_value_t *
bare_module_set_module_export(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 3;
  js_value_t *argv[3];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  if (!bare_module__check_synthetic_module(env, argv[0])) return NULL;
  if (!bare_module__check_string(env, argv[1], "Export name must be a string")) return NULL;

  js_module_t *module;
  err = js_unwrap(env, argv[0], (void **) &module);
  if (err < 0) return NULL;

  err = js_set_module_export(env, module, argv[1], argv[2]);
  if (err < 0) return NULL;

  return NULL;
}

static js_value_t *
bare_module_run_module(js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 3;
  js_value_t *argv[3];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  if (!bare_module__check_context(env, argv[0])) return NULL;
  if (!bare_module__check_module(env, argv[1])) return NULL;
  if (!bare_module__check_function(env, argv[2], "Run handler must be a function")) return NULL;

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

    err = js_call_function(env, ctx, argv[2], 3, args, NULL);
    if (err < 0) return NULL;
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

  if (!bare_module__check_module(env, argv[0])) return NULL;

  js_module_t *module;
  err = js_unwrap(env, argv[0], (void **) &module);
  if (err < 0) return NULL;

  js_value_t *result;
  err = js_get_module_namespace(env, module, &result);
  if (err < 0) return NULL;

  return result;
}

static void
bare_module__on_teardown(void *data) {
  free(data);
}

static js_value_t *
bare_module_exports(js_env_t *env, js_value_t *exports) {
  int err;

  bare_module_state_t *state = malloc(sizeof(bare_module_state_t));

  if (state == NULL) {
    err = js_throw_error(env, uv_err_name(UV_ENOMEM), uv_strerror(UV_ENOMEM));
    assert(err == 0);

    return NULL;
  }

  state->initialized = false;

  err = js_add_teardown_callback(env, bare_module__on_teardown, (void *) state);
  assert(err == 0);

#define V(name, fn, data) \
  { \
    js_value_t *val; \
    err = js_create_function(env, name, -1, fn, data, &val); \
    assert(err == 0); \
    err = js_set_named_property(env, exports, name, val); \
    assert(err == 0); \
  }

  V("init", bare_module_init, (void *) state)

  V("createFunction", bare_module_create_function, NULL)
  V("getFunctionID", bare_module_get_function_id, NULL)

  V("createModule", bare_module_create_module, NULL)
  V("createSyntheticModule", bare_module_create_synthetic_module, NULL)
  V("setModuleExport", bare_module_set_module_export, NULL)
  V("runModule", bare_module_run_module, NULL)
  V("getModuleNamespace", bare_module_get_module_namespace, NULL)
#undef V

  return exports;
}

BARE_MODULE(bare_module, bare_module_exports)
