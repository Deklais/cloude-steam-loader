cmake_minimum_required(VERSION 3.10)
project(unix-hooks LANGUAGES CXX)
set(CMAKE_C_STANDARD 11)

if(NOT CLOUDE_NIX_64BIT)
    add_library(unix-hooks SHARED libcloude_bootstrap.c)

    if (CMAKE_BUILD_TYPE STREQUAL "Debug")
        target_compile_definitions(unix-hooks PRIVATE CLOUDE_RUNTIME_PATH="$<TARGET_FILE:Cloude>")
    endif()

    target_compile_options(unix-hooks PRIVATE -fvisibility=hidden)
    target_link_options(unix-hooks PRIVATE -Wl,--no-undefined -ldl)

    set_target_properties(unix-hooks PROPERTIES
        PREFIX ""
        OUTPUT_NAME "${CLOUDE_BOOTLOADER_OUTPUT_NAME}"
        SUFFIX ""
    )
endif()

if(CLOUDE_NIX_64BIT OR NOT DISTRO_NIX)
    cmake_minimum_required(VERSION 3.10)
    project(bootstrap64 C)
    set(CMAKE_C_STANDARD 11)

    add_library(bootstrap64 SHARED libcloude_hhx64.c)

    target_compile_options(bootstrap64 PRIVATE -fvisibility=hidden -m64)
    target_link_options(bootstrap64 PRIVATE -m64 -Wl,--no-undefined -ldl)

    if(CMAKE_BUILD_TYPE STREQUAL "Debug")
        target_compile_definitions(bootstrap64 PRIVATE CLOUDE_HHX64_PATH="$<TARGET_FILE:hhx64>")
    endif()

    target_compile_definitions(bootstrap64 PRIVATE CLOUDE_HHX64_NAME="${CLOUDE_HOOK_HELPER_OUTPUT_NAME}")

    set_target_properties(bootstrap64 PROPERTIES
        PREFIX ""
        OUTPUT_NAME "libcloude_bootstrap_hhx64.so"
        SUFFIX ""
    )

    add_executable(libcloude_pvs64 cloude_pvs64.cc)

    target_compile_options(libcloude_pvs64 PRIVATE -m64 -Wall -Wextra)
    target_link_options(libcloude_pvs64 PRIVATE -m64)

    set_target_properties(libcloude_pvs64 PROPERTIES
        OUTPUT_NAME "libcloude_pvs64"
        RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}"
    )
endif()
