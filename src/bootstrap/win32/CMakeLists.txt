cmake_minimum_required(VERSION 3.10)
project(preload)

set(CMAKE_C_STANDARD 99)
set(CMAKE_C_STANDARD_REQUIRED True)

string(TIMESTAMP CURRENT_YEAR "%Y")
set(VERSION_DESCRIPTION  "A bootstrapper utility for Cloude")
set(VERSION_COMPANY      "Steam Homebrew")
set(VERSION_COPYRIGHT    "Steam Homebrew ${TIMESTAMP}")
set(VERSION_FILENAME     "${CLOUDE_BOOTLOADER_OUTPUT_NAME}")
set(VERSION_PRODUCT      "Cloude Bootstrapper")
set(VERSION_TRADEMARK1   "All Rights Reserved")
set(VERSION_FILETYPE     "VFT_DLL")

set(VERSION_FILE "${CMAKE_BINARY_DIR}/${CLOUDE_BOOTLOADER_OUTPUT_NAME}.rc")
configure_file(${CLOUDE_BASE}/scripts/version.rc.in ${VERSION_FILE} @ONLY)

set(VERSION_SOURCE_FILES
    "main.c"
    ${VERSION_FILE}
)

list(APPEND VERSION_SOURCE_FILES ${CLOUDE_BASE}/src/include/cloude/export.wsock32.def)
add_compile_definitions(CLOUDE_64BIT)

add_library(preload SHARED ${VERSION_SOURCE_FILES})
target_link_libraries(preload wsock32)

if (CLOUDE_BUILD_TO_STEAM_PATH)
    include(${CLOUDE_BASE}/scripts/cmake/find_steam_path.cmake)
    find_steam_path(preload)
endif()

set_target_properties(preload PROPERTIES
    PREFIX ""
    OUTPUT_NAME "${CLOUDE_BOOTLOADER_OUTPUT_NAME}"
    SUFFIX ""
)

if(out_steam_path)
    add_custom_command(TARGET preload POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E rm -f "${out_steam_path}/wsock32.dll"
        COMMAND ${CMAKE_COMMAND} -E create_hardlink "$<TARGET_FILE:preload>" "${out_steam_path}/wsock32.dll"
        COMMENT "Hardlinking bootstrap -> ${out_steam_path}/wsock32.dll"
    )
endif()
