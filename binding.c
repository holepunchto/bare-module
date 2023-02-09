#include <js.h>
#include <pear.h>
#include <stdint.h>

typedef struct {
  js_ref_t *on_import;
} pear_module_context_t;

static js_module_t *
on_import (js_env_t *env, js_value_t *specifier, js_value_t *assertions, js_module_t *referrer, void *data) {
  pear_module_context_t *context = (pear_module_context_t *) data;

  js_value_t *on_import;
  js_get_reference_value(env, context->on_import, &on_import);

  js_value_t *global;
  js_get_global(env, &global);

  const char *name;
  js_get_module_name(env, referrer, &name);

  js_value_t *args[3] = {specifier, assertions};

  js_create_string_utf8(env, name, -1, &args[2]);

  js_value_t *result;
  js_call_function(env, global, on_import, 3, args, &result);

  js_module_t *module;
  js_get_value_external(env, result, (void **) &module);

  return module;
}

static js_value_t *
pear_module_init (js_env_t *env, js_callback_info_t *info) {
  size_t argc = 1;
  js_value_t *argv[1];

  js_get_callback_info(env, info, &argc, argv, NULL, NULL);

  pear_module_context_t *context;

  js_value_t *result;
  js_create_unsafe_arraybuffer(env, sizeof(pear_module_context_t), (void **) &context, &result);

  js_create_reference(env, argv[0], 1, &context->on_import);

  return result;
}

static js_value_t *
pear_module_destroy (js_env_t *env, js_callback_info_t *info) {
  size_t argc = 1;
  js_value_t *argv[1];

  js_get_callback_info(env, info, &argc, argv, NULL, NULL);

  pear_module_context_t *context;
  js_get_arraybuffer_info(env, argv[0], (void **) &context, NULL);

  js_delete_reference(env, context->on_import);

  return NULL;
}

static js_value_t *
pear_module_run_script (js_env_t *env, js_callback_info_t *info) {
  size_t argc = 3;
  js_value_t *argv[3];

  js_get_callback_info(env, info, &argc, argv, NULL, NULL);

  size_t file_len;
  char file[1024];
  js_get_value_string_utf8(env, argv[0], file, 1024, &file_len);

  js_value_t *source = argv[1];

  int32_t offset;
  js_get_value_int32(env, argv[2], &offset);

  js_value_t *result = NULL;
  js_run_script(env, file, file_len, offset, source, &result);

  return result;
}

static js_value_t *
pear_module_create_module (js_env_t *env, js_callback_info_t *info) {
  size_t argc = 4;
  js_value_t *argv[4];

  js_get_callback_info(env, info, &argc, argv, NULL, NULL);

  size_t file_len;
  char file[1024];
  js_get_value_string_utf8(env, argv[0], file, 1024, &file_len);

  js_value_t *source = argv[1];

  int32_t offset;
  js_get_value_int32(env, argv[2], &offset);

  pear_module_context_t *context;
  js_get_arraybuffer_info(env, argv[3], (void **) &context, NULL);

  js_module_t *module;
  js_create_module(env, file, file_len, offset, source, on_import, (void *) context, &module);

  js_value_t *result;
  js_create_external(env, (void *) module, NULL, NULL, &result);

  return result;
}

static js_value_t *
pear_module_run_module (js_env_t *env, js_callback_info_t *info) {
  size_t argc = 1;
  js_value_t *argv[1];

  js_get_callback_info(env, info, &argc, argv, NULL, NULL);

  js_module_t *module;
  js_get_value_external(env, argv[0], (void **) &module);

  js_value_t *result;
  js_run_module(env, module, &result);

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
    js_create_function(env, "runScript", -1, pear_module_run_script, NULL, &fn);
    js_set_named_property(env, exports, "runScript", fn);
  }

  {
    js_value_t *fn;
    js_create_function(env, "createModule", -1, pear_module_create_module, NULL, &fn);
    js_set_named_property(env, exports, "createModule", fn);
  }

  {
    js_value_t *fn;
    js_create_function(env, "runModule", -1, pear_module_run_module, NULL, &fn);
    js_set_named_property(env, exports, "runModule", fn);
  }

  return exports;
}

PEAR_MODULE(init)
