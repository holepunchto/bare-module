#include <js.h>
#include <pear.h>
#include <stdint.h>

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
init (js_env_t *env, js_value_t *exports) {
  {
    js_value_t *fn;
    js_create_function(env, "runScript", -1, pear_module_run_script, NULL, &fn);
    js_set_named_property(env, exports, "runScript", fn);
  }

  return exports;
}

PEAR_MODULE(init)
