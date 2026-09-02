cmake_minimum_required(VERSION 3.21)

if(WIN32)
    include(${CLOUDE_BASE}/scripts/cmake/cloude_version.cmake)

    set(VERSION_COMPANY      "Steam Homebrew")
    set(VERSION_COPYRIGHT    "Steam Homebrew 2025")
    set(VERSION_TRADEMARK1   "All Rights Reserved")
    set(VERSION_DESCRIPTION  "Lua plugin runtime for Cloude")
    set(VERSION_FILENAME     "${CLOUDE_RTB_NAME}.exe")
    set(VERSION_PRODUCT      "Cloude Lua Runtime")
    set(VERSION_FILETYPE     "VFT_APP")

    set(VERSION_FILE "${CMAKE_BINARY_DIR}/${CLOUDE_RTB_NAME}.rc")
    configure_file(${CLOUDE_BASE}/scripts/version.rc.in ${VERSION_FILE} @ONLY)
endif()

set(LUA_HOST_SOURCES
    main.cc
    rpc.cc
    crash_handler.cc
    ${CLOUDE_BASE}/src/shared/crash_report.cc
    ${CLOUDE_BASE}/src/shared/crash_handler_core.cc
    api/cloude.cc
    api/config.cc
    api/logger.cc
    api/http.cc
    api/utils.cc
    api/filesystem.cc
    api/regex.cc
    api/datetime.cc
    api/json.c
)

if(WIN32)
    list(APPEND LUA_HOST_SOURCES ${VERSION_FILE})
endif()

add_executable(${CLOUDE_RTB_NAME} ${LUA_HOST_SOURCES})

target_compile_definitions(${CLOUDE_RTB_NAME} PRIVATE
    CLOUDE_RTB_NAME="${CLOUDE_RTB_NAME}"
)

target_include_directories(${CLOUDE_RTB_NAME} PRIVATE
    ${CLOUDE_BASE}/src
    ${CLOUDE_BASE}/src/include
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CMAKE_CURRENT_SOURCE_DIR}/api/cjson
)

target_link_libraries(${CLOUDE_RTB_NAME}
    luajit::lib
    nlohmann_json
)

# Suppress warnings on vendored cjson sources.
set_source_files_properties(
    api/cjson/lua_cjson.c
    api/cjson/strbuf.c
    api/cjson/fpconv.c
    TARGET_DIRECTORY ${CLOUDE_RTB_NAME}
    PROPERTIES COMPILE_OPTIONS "$<IF:$<C_COMPILER_ID:MSVC>,/w,-w>"
)

# Always ship with debug info so crash dumps are useful
if(MSVC)
    target_compile_options(${CLOUDE_RTB_NAME} PRIVATE /Z7)
    target_link_options(${CLOUDE_RTB_NAME} PRIVATE /DEBUG /ENTRY:mainCRTStartup
        "/MANIFESTDEPENDENCY:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'"
    )
    target_link_libraries(${CLOUDE_RTB_NAME} dbghelp ws2_32)
else()
    target_compile_options(${CLOUDE_RTB_NAME} PRIVATE -g)
    target_link_options(${CLOUDE_RTB_NAME} PRIVATE -rdynamic)
endif()

set_target_properties(${CLOUDE_RTB_NAME} PROPERTIES
    OUTPUT_NAME "${CLOUDE_RTB_NAME}"
)

if(WIN32)
    set_target_properties(${CLOUDE_RTB_NAME} PROPERTIES WIN32_EXECUTABLE TRUE)
endif()

if(CLOUDE_BUILD_TO_STEAM_PATH)
    include(${CLOUDE_BASE}/scripts/cmake/find_steam_path.cmake)
    find_steam_path(${CLOUDE_RTB_NAME})
endif()
