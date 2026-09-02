cmake_minimum_required(VERSION 3.16)
project(MacOSBootstrap LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)

# Resolve repo root robustly for both standalone wrapper builds (-S src/bootstrap/macos)
# and top-level builds that include this directory.
if(DEFINED CLOUDE_REPO_ROOT)
    get_filename_component(CLOUDE_RESOLVED_ROOT "${CLOUDE_REPO_ROOT}" ABSOLUTE)
else()
    get_filename_component(CLOUDE_RESOLVED_ROOT "${CMAKE_CURRENT_LIST_DIR}/../../.." ABSOLUTE)
endif()

foreach(required_var IN ITEMS CLOUDE_OUTPUT_NAME CLOUDE_BOOTLOADER_OUTPUT_NAME CLOUDE_HOOK_HELPER_OUTPUT_NAME CLOUDE_CHILD_HOOK_OUTPUT_NAME)
    if(NOT DEFINED ${required_var})
        message(FATAL_ERROR "${required_var} must be defined before configuring src/bootstrap/macos")
    endif()
endforeach()

add_library(macos-bootstrap SHARED dylib_bootstrap.cc)
target_compile_definitions(macos-bootstrap PRIVATE
    __CLOUDE_OUTPUT_NAME__="${CLOUDE_OUTPUT_NAME}"
    __CLOUDE_HOOK_HELPER_OUTPUT_NAME__="${CLOUDE_HOOK_HELPER_OUTPUT_NAME}"
    __CLOUDE_CHILD_HOOK_OUTPUT_NAME__="${CLOUDE_CHILD_HOOK_OUTPUT_NAME}"
)
set_target_properties(macos-bootstrap PROPERTIES
    PREFIX ""
    OUTPUT_NAME "${CLOUDE_BOOTLOADER_OUTPUT_NAME}"
    SUFFIX ""
)

add_library(macos-child-hook SHARED child_process_hook.cc)
target_compile_definitions(macos-child-hook PRIVATE
    __CLOUDE_HOOK_HELPER_OUTPUT_NAME__="${CLOUDE_HOOK_HELPER_OUTPUT_NAME}"
)
set_target_properties(macos-child-hook PROPERTIES
    PREFIX ""
    OUTPUT_NAME "${CLOUDE_CHILD_HOOK_OUTPUT_NAME}"
    SUFFIX ""
)

add_executable(SteamWrapper steam_launcher.cc)
target_compile_definitions(SteamWrapper PRIVATE
    __CLOUDE_BOOTLOADER_OUTPUT_NAME__="${CLOUDE_BOOTLOADER_OUTPUT_NAME}"
    __CLOUDE_OUTPUT_NAME__="${CLOUDE_OUTPUT_NAME}"
    __CLOUDE_HOOK_HELPER_OUTPUT_NAME__="${CLOUDE_HOOK_HELPER_OUTPUT_NAME}"
    __CLOUDE_CHILD_HOOK_OUTPUT_NAME__="${CLOUDE_CHILD_HOOK_OUTPUT_NAME}"
    CLOUDE_ROOT="${CLOUDE_RESOLVED_ROOT}"
)
set_target_properties(SteamWrapper PROPERTIES
    PREFIX ""
    OUTPUT_NAME "steam_osx"
    SUFFIX ""
)
