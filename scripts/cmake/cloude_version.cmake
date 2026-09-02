# Read the Cloude version from the version file
file(STRINGS "${CLOUDE_BASE}/scripts/version" VERSION_LINES LIMIT_COUNT 2)
list(GET VERSION_LINES 1 CLOUDE_VERSION)
string(STRIP "${CLOUDE_VERSION}" CLOUDE_VERSION)

if(NOT CLOUDE_VERSION OR CLOUDE_VERSION STREQUAL "")
    message(FATAL_ERROR "Failed to read CLOUDE_VERSION from ${CLOUDE_BASE}/scripts/version")
endif()

# Make cmake re-run if the version file changes
set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS "${CLOUDE_BASE}/scripts/version")

# Generate version.h from version.h.in
configure_file(${CLOUDE_BASE}/src/include/cloude/version.h.in ${CMAKE_BINARY_DIR}/version.h)
# Get the current git commit hash
execute_process(COMMAND git rev-parse HEAD WORKING_DIRECTORY ${CLOUDE_BASE} OUTPUT_VARIABLE GIT_COMMIT_HASH OUTPUT_STRIP_TRAILING_WHITESPACE ERROR_QUIET)
if(NOT GIT_COMMIT_HASH OR GIT_COMMIT_HASH STREQUAL "")
    set(GIT_COMMIT_HASH "NIX_GIT_COMMIT_HASH_NOT_SUPPORTED")
endif()

add_compile_definitions(
    GIT_COMMIT_HASH="${GIT_COMMIT_HASH}"
    CLOUDE_VERSION="${CLOUDE_VERSION}"
    $<$<CONFIG:Debug>:CLOUDE_ROOT="${CLOUDE_BASE}">
)
