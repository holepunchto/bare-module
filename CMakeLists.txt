cmake_minimum_required(VERSION 3.25)

project(pear_module C)

include(pear)

add_pear_module(pear_module)

target_sources(
  pear_module
  PRIVATE
    binding.c
)
