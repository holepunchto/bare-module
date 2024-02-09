cmake_minimum_required(VERSION 3.25)

project(bare_module C)

include(bare)

add_bare_module(bare_module)

target_sources(
  ${bare_module}
  PRIVATE
    binding.c
)
