#include <assert.h>
#include <js.h>
#include <pear.h>
#include <stdint.h>
#include <stdlib.h>

typedef struct {
  js_ref_t *on_import;
  js_ref_t *on_evaluate;
} pear_module_context_t;

static js_module_t *
on_static_import (js_env_t *env, js_value_t *specifier, js_value_t *assertions, js_module_t *referrer, void *data) {
  pear_module_context_t *context = (pear_module_context_t *) data;

  int err;

  js_value_t *on_import;
  err = js_get_reference_value(env, context->on_import, &on_import);
  assert(err == 0);

  js_value_t *global;
  err = js_get_global(env, &global);
  assert(err == 0);

  const char *name;
  err = js_get_module_name(env, referrer, &name);
  assert(err == 0);

  js_value_t *args[4] = {specifier, assertions};

  err = js_create_string_utf8(env, name, -1, &args[2]);
  if (err < 0) return NULL;

  err = js_get_boolean(env, false, &args[3]);
  assert(err == 0);

  js_value_t *result;
  err = js_call_function(env, global, on_import, 4, args, &result);
  if (err < 0) return NULL;

  js_module_t *module;
  err = js_get_value_external(env, result, (void **) &module);
  if (err < 0) return NULL;

  return module;
}

static js_module_t *
on_dynamic_import (js_env_t *env, js_value_t *specifier, js_value_t *assertions, js_value_t *referrer, void *data) {
  pear_module_context_t *context = (pear_module_context_t *) data;

  int err;

  js_value_t *on_import;
  err = js_get_reference_value(env, context->on_import, &on_import);
  assert(err == 0);

  js_value_t *global;
  err = js_get_global(env, &global);
  assert(err == 0);

  js_value_t *args[4] = {specifier, assertions, referrer};

  err = js_get_boolean(env, true, &args[3]);
  assert(err == 0);

  js_value_t *result;
  err = js_call_function(env, global, on_import, 4, args, &result);
  if (err < 0) return NULL;

  js_module_t *module;
  err = js_get_value_external(env, result, (void **) &module);
  if (err < 0) return NULL;

  return module;
}

static void
on_evaluate (js_env_t *env, js_module_t *module, void *data) {
  pear_module_context_t *context = (pear_module_context_t *) data;

  int err;

  js_value_t *on_evaluate;
  err = js_get_reference_value(env, context->on_evaluate, &on_evaluate);
  assert(err == 0);

  js_value_t *global;
  err = js_get_global(env, &global);
  assert(err == 0);

  const char *name;
  err = js_get_module_name(env, module, &name);
  assert(err == 0);

  js_value_t *args[1];

  err = js_create_string_utf8(env, name, -1, &args[0]);
  if (err < 0) return;

  js_value_t *result;
  err = js_call_function(env, global, on_evaluate, 1, args, &result);
  if (err < 0) return;
}

static js_value_t *
pear_module_init (js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 2;
  js_value_t *argv[2];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 2);

  pear_module_context_t *context;

  js_value_t *result;
  err = js_create_unsafe_arraybuffer(env, sizeof(pear_module_context_t), (void **) &context, &result);
  if (err < 0) return NULL;

  err = js_create_reference(env, argv[0], 1, &context->on_import);
  assert(err == 0);

  err = js_create_reference(env, argv[1], 1, &context->on_evaluate);
  assert(err == 0);

  err = js_on_dynamic_import(env, on_dynamic_import, (void *) context);
  assert(err == 0);

  return result;
}

static js_value_t *
pear_module_destroy (js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 1;
  js_value_t *argv[1];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 1);

  pear_module_context_t *context;
  err = js_get_arraybuffer_info(env, argv[0], (void **) &context, NULL);
  if (err < 0) return NULL;

  err = js_delete_reference(env, context->on_import);
  assert(err == 0);

  err = js_delete_reference(env, context->on_evaluate);
  assert(err == 0);

  return NULL;
}

static js_value_t *
pear_module_create_function (js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 4;
  js_value_t *argv[4];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 4);

  size_t file_len;
  char file[1024];
  err = js_get_value_string_utf8(env, argv[0], file, 1024, &file_len);
  if (err < 0) return NULL;

  uint32_t args_len;
  err = js_get_array_length(env, argv[1], &args_len);
  if (err < 0) return NULL;

  js_value_t **args = malloc(sizeof(js_value_t *) * args_len);

  for (int i = 0; i < args_len; i++) {
    err = js_get_element(env, argv[1], i, &args[i]);
    if (err < 0) goto err;
  }

  js_value_t *source = argv[2];

  int32_t offset;
  err = js_get_value_int32(env, argv[3], &offset);
  if (err < 0) goto err;

  js_value_t *result;
  err = js_create_function_with_source(env, NULL, 0, file, file_len, args, args_len, 0, source, &result);
  if (err < 0) goto err;

  free(args);

  return result;

err:
  free(args);

  return NULL;
}

static js_value_t *
pear_module_create_module (js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 3;
  js_value_t *argv[3];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 3);

  size_t file_len;
  char file[1024];
  err = js_get_value_string_utf8(env, argv[0], file, 1024, &file_len);
  if (err < 0) return NULL;

  js_value_t *source = argv[1];

  int32_t offset;
  err = js_get_value_int32(env, argv[2], &offset);
  if (err < 0) return NULL;

  js_module_t *module;
  err = js_create_module(env, file, file_len, offset, source, &module);
  if (err < 0) return NULL;

  js_value_t *result;
  err = js_create_external(env, (void *) module, NULL, NULL, &result);
  if (err < 0) return NULL;

  return result;
}

static js_value_t *
pear_module_create_synthetic_module (js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 3;
  js_value_t *argv[3];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 3);

  size_t file_len;
  char file[1024];
  err = js_get_value_string_utf8(env, argv[0], file, 1024, &file_len);
  if (err < 0) return NULL;

  uint32_t names_len;
  err = js_get_array_length(env, argv[1], &names_len);
  if (err < 0) return NULL;

  js_value_t **export_names = malloc(sizeof(js_value_t *) * names_len);

  for (int i = 0; i < names_len; i++) {
    err = js_get_element(env, argv[1], i, &export_names[i]);
    if (err < 0) goto err;
  }

  pear_module_context_t *context;
  err = js_get_arraybuffer_info(env, argv[2], (void **) &context, NULL);
  if (err < 0) goto err;

  js_module_t *module;
  err = js_create_synthetic_module(env, file, file_len, export_names, names_len, on_evaluate, (void *) context, &module);
  if (err < 0) goto err;

  js_value_t *result;
  err = js_create_external(env, (void *) module, NULL, NULL, &result);
  if (err < 0) goto err;

  free(export_names);

  return result;

err:
  free(export_names);

  return NULL;
}

static js_value_t *
pear_module_set_export (js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 3;
  js_value_t *argv[3];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 3);

  js_module_t *module;
  err = js_get_value_external(env, argv[0], (void **) &module);
  if (err < 0) return NULL;

  js_set_module_export(env, module, argv[1], argv[2]);

  return NULL;
}

static js_value_t *
pear_module_run_module (js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 2;
  js_value_t *argv[2];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  assert(argc == 2);

  js_module_t *module;
  err = js_get_value_external(env, argv[0], (void **) &module);
  if (err < 0) return NULL;

  pear_module_context_t *context;
  err = js_get_arraybuffer_info(env, argv[1], (void **) &context, NULL);
  if (err < 0) return NULL;

  err = js_instantiate_module(env, module, on_static_import, (void *) context);
  if (err < 0) return NULL;

  js_value_t *result;
  err = js_run_module(env, module, &result);
  if (err < 0) return NULL;

  return result;
}

static js_value_t *
pear_get_module_namespace (js_env_t *env, js_callback_info_t *info) {
  int err;

  size_t argc = 1;
  js_value_t *argv[1];

  err = js_get_callback_info(env, info, &argc, argv, NULL, NULL);
  assert(err == 0);

  js_module_t *module;
  err = js_get_value_external(env, argv[0], (void **) &module);
  if (err < 0) return NULL;

  js_value_t *result;
  err = js_get_module_namespace(env, module, &result);
  if (err < 0) return NULL;

  return result;
}

static js_value_t *
init (js_env_t *env, js_value_t *exports) {
  {
    js_value_t *fn;
    js_create_function(env, "init", -1, pear_module_init, NULL, &fn);
    js_set_named_property(env, exports, "init", fn);
  }

  {
    js_value_t *fn;
    js_create_function(env, "destroy", -1, pear_module_destroy, NULL, &fn);
    js_set_named_property(env, exports, "destroy", fn);
  }

  {
    js_value_t *fn;
    js_create_function(env, "createFunction", -1, pear_module_create_function, NULL, &fn);
    js_set_named_property(env, exports, "createFunction", fn);
  }

  {
    js_value_t *fn;
    js_create_function(env, "createModule", -1, pear_module_create_module, NULL, &fn);
    js_set_named_property(env, exports, "createModule", fn);
  }

  {
    js_value_t *fn;
    js_create_function(env, "createSyntheticModule", -1, pear_module_create_synthetic_module, NULL, &fn);
    js_set_named_property(env, exports, "createSyntheticModule", fn);
  }

  {
    js_value_t *fn;
    js_create_function(env, "setExport", -1, pear_module_set_export, NULL, &fn);
    js_set_named_property(env, exports, "setExport", fn);
  }

  {
    js_value_t *fn;
    js_create_function(env, "runModule", -1, pear_module_run_module, NULL, &fn);
    js_set_named_property(env, exports, "runModule", fn);
  }

  {
    js_value_t *fn;
    js_create_function(env, "getModuleNamespace", -1, pear_get_module_namespace, NULL, &fn);
    js_set_named_property(env, exports, "getModuleNamespace", fn);
  }

  return exports;
}

PEAR_MODULE(init)
