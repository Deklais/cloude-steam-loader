set(TEST_SOURCES
  ffi_recorder_test.cc
  ${CMAKE_SOURCE_DIR}/src/mep/ffi_recorder.cc
)

add_executable(cloude_cpp_tests ${TEST_SOURCES})
target_compile_features(cloude_cpp_tests PRIVATE cxx_std_23)

target_include_directories(cloude_cpp_tests PRIVATE
  ${CMAKE_SOURCE_DIR}/src
  ${CMAKE_SOURCE_DIR}/src/include
)

target_link_libraries(cloude_cpp_tests PRIVATE Catch2::Catch2WithMain)

include(Catch)
catch_discover_tests(cloude_cpp_tests)

add_executable(sdk_health sdk_health.cc)
target_compile_features(sdk_health PRIVATE cxx_std_17)
target_link_libraries(sdk_health PRIVATE nlohmann_json::nlohmann_json)
