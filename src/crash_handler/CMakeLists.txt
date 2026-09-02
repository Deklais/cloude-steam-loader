cmake_minimum_required(VERSION 3.21)
project(cloude_crashhandler CXX)

include(${CLOUDE_BASE}/scripts/cmake/cloude_version.cmake)

set(VERSION_COMPANY      "Steam Homebrew")
set(VERSION_COPYRIGHT    "Steam Homebrew 2025")
set(VERSION_TRADEMARK1   "All Rights Reserved")
set(VERSION_DESCRIPTION  "Crash handler watchdog for Cloude")
set(VERSION_FILENAME     "${CLOUDE_CRASH_HANDLER_NAME}.exe")
set(VERSION_PRODUCT      "Cloude Crash Handler")
set(VERSION_FILETYPE     "VFT_APP")

set(VERSION_FILE "${CMAKE_BINARY_DIR}/${CLOUDE_CRASH_HANDLER_NAME}.rc")
configure_file(${CLOUDE_BASE}/scripts/version.rc.in ${VERSION_FILE} @ONLY)

set(CRASH_HANDLER_SOURCES
    main.cc
    ${CLOUDE_BASE}/src/shared/crash_report.cc
    ${VERSION_FILE}
)

add_executable(${CLOUDE_CRASH_HANDLER_NAME} ${CRASH_HANDLER_SOURCES})

target_include_directories(${CLOUDE_CRASH_HANDLER_NAME} PRIVATE
    ${CLOUDE_BASE}/src
    ${CLOUDE_BASE}/src/include
)

target_link_libraries(${CLOUDE_CRASH_HANDLER_NAME} dbghelp)

# always ship with debug info
target_compile_options(${CLOUDE_CRASH_HANDLER_NAME} PRIVATE /Z7)
target_link_options(${CLOUDE_CRASH_HANDLER_NAME} PRIVATE /DEBUG /ENTRY:mainCRTStartup
    "/MANIFESTDEPENDENCY:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'"
)

set_target_properties(${CLOUDE_CRASH_HANDLER_NAME} PROPERTIES
    OUTPUT_NAME "${CLOUDE_CRASH_HANDLER_NAME}"
    WIN32_EXECUTABLE TRUE
)

if(CLOUDE_BUILD_TO_STEAM_PATH)
    include(${CLOUDE_BASE}/scripts/cmake/find_steam_path.cmake)
    find_steam_path(${CLOUDE_CRASH_HANDLER_NAME})
endif()
