cmake_minimum_required(VERSION 3.21)
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>" CACHE STRING "Static MSVC Runtime Library" FORCE)
set(CLOUDE_BASE            ${CMAKE_SOURCE_DIR})

project(CloudeSteamLoader)
add_compile_definitions(CLOUDE_$<IF:$<CONFIG:Debug>,DEBUG,RELEASE> CLOUDE_64BIT)

if(WIN32)
    # Windows build names
    set(CLOUDE_OUTPUT_NAME                     "cloude.dll"                )
    set(CLOUDE_HOOK_HELPER_OUTPUT_NAME         "cloude.hhx64.dll"          )
    set(CLOUDE_BOOTLOADER_OUTPUT_NAME          "cloude.bootstrap64.dll"    )
elseif(APPLE)
    # macOS build names
    set(CLOUDE_OUTPUT_NAME                     "libcloude.dylib"           )
    set(CLOUDE_HOOK_HELPER_OUTPUT_NAME         "libcloude_hhx64.dylib"     )
    set(CLOUDE_BOOTLOADER_OUTPUT_NAME          "libcloude_bootstrap.dylib" )
    set(CLOUDE_CHILD_HOOK_OUTPUT_NAME          "libcloude_child_hook.dylib")
else()
    # Linux build names
    set(CLOUDE_OUTPUT_NAME                     "libcloude_x86.so"          )
    set(CLOUDE_HOOK_HELPER_OUTPUT_NAME         "libcloude_hhx64.so"        )
    set(CLOUDE_BOOTLOADER_OUTPUT_NAME          "libcloude_bootstrap_x86.so")
endif()

# Cloude lua host that runs the backend in a sandbox.
if(WIN32)
    set(CLOUDE_RTB_NAME "cloude.luavm64")
    set(CLOUDE_CRASH_HANDLER_NAME "cloude.crashhandler64")
else()
    set(CLOUDE_RTB_NAME "libcloude_luavm_x86")
endif()

add_compile_definitions(__CLOUDE_OUTPUT_NAME__="${CLOUDE_OUTPUT_NAME}")
add_compile_definitions(__CLOUDE_HOOK_HELPER_OUTPUT_NAME__="${CLOUDE_HOOK_HELPER_OUTPUT_NAME}")
add_compile_definitions(__CLOUDE_BOOTLOADER_OUTPUT_NAME__="${CLOUDE_BOOTLOADER_OUTPUT_NAME}")
if(DEFINED CLOUDE_CHILD_HOOK_OUTPUT_NAME)
    add_compile_definitions(__CLOUDE_CHILD_HOOK_OUTPUT_NAME__="${CLOUDE_CHILD_HOOK_OUTPUT_NAME}")
endif()

set(CMAKE_RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}")
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}")

include(FetchContent)
set(snare_SOURCE_DIR "${CMAKE_SOURCE_DIR}/thirdparty")

option(CLOUDE_BUILD_MAIN          "Build main Cloude library and tools"            ON)
option(CLOUDE_BUILD_TESTS         "Build testing suite for Cloude"                 ON)
option(CLOUDE_RUN_TESTS_ON_BUILD  "Run native tests automatically after building them" ON)
if(CMAKE_BUILD_TYPE STREQUAL "Debug")
    set(_build_to_steam_default ON)
else()
    set(_build_to_steam_default OFF)
endif()
option(CLOUDE_BUILD_TO_STEAM_PATH "Build Cloude to Steam path" ${_build_to_steam_default})
option(CLOUDE_NIX_64BIT           "Build only the 64-bit Nix targets (hhx64 + bootstrap64 + pvs64)" OFF)

if(CLOUDE_BUILD_MAIN)
    if(NOT CLOUDE_NIX_64BIT)
        add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/src)
    endif()

    if(NOT DISTRO_NIX OR CLOUDE_NIX_64BIT)
        add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/src/instrumentation/loopback)
    endif()

    if(CLOUDE_NIX_64BIT)
        add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/src/bootstrap/linux)
    endif()
endif()

if(CLOUDE_BUILD_TESTS)
    enable_testing()
    add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/tests)
endif()
