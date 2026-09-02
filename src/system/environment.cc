/**
 * ==================================================
 *   _____ _ _ _             _
 *  |     |_| | |___ ___ ___|_|_ _ _____
 *  | | | | | | | -_|   |   | | | |     |
 *  |_|_|_|_|_|_|___|_|_|_|_|_|___|_|_|_|
 *
 * ==================================================
 *
 * Copyright (c) 2026 Project Cloude
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/**
 * @file env.cc
 *
 * @brief This file is responsible for setting up environment variables that are used throughout the application.
 */

#include "cloude/environment.h"
#include "cloude/filesystem.h"
#include "cloude/auth.h"

#include <format>
#include <print>
#include <stdlib.h>
#include <string>
#if defined(__linux__) || defined(__APPLE__)
#include <unistd.h>
#endif

std::map<std::string, std::string> envVariables;

#if defined(__linux__) || defined(__APPLE__)
extern char** environ;

bool platform::environment::set_unix(const std::string& name, const std::string& value)
{
    std::string strEnv = name + "=" + value;

    auto stored_string = std::make_unique<char[]>(strEnv.length() + 1);
    std::strcpy(stored_string.get(), strEnv.c_str());

    for (int i = 0; environ[i] != nullptr; ++i) {
        std::string current(environ[i]);
        if (current.substr(0, name.length() + 1) == name + "=") {
            environ[i] = stored_string.get();
            allocated_strings.push_back(std::move(stored_string));
            return true;
        }
    }

    return add(std::move(stored_string));
}

bool platform::environment::add(std::unique_ptr<char[]> strEnv)
{
    int count = 0;
    while (environ[count] != nullptr)
        count++;

    char** new_environ = new char*[count + 2];

    for (int i = 0; i < count; ++i) {
        new_environ[i] = environ[i];
    }

    new_environ[count] = strEnv.get();
    new_environ[count + 1] = nullptr;

    environ = new_environ;
    allocated_strings.push_back(std::move(strEnv));

    return true;
}

std::vector<std::unique_ptr<char[]>> platform::environment::allocated_strings;
#endif

void platform::environment::set(const std::string& key, const std::string& value)
{
#ifdef _WIN32
    _putenv_s(key.c_str(), value.c_str()); // Windows
#else
    if (!get(key).empty()) {
        /** allow the user to set the environment variables themselves */
        return;
    }

    environment::set_unix(key, value);
#endif
}

std::string platform::environment::get(std::string key)
{
#ifdef _WIN32
    static bool hasSetup = false;

    if (!hasSetup) {
        hasSetup = true;
        setup();
    }
#endif

    char* szVariable = getenv(key.c_str());

    if (szVariable == nullptr) {
        return {};
    }

    std::string strVariable(szVariable);
    return strVariable;
}

std::string platform::environment::get(std::string key, std::string fallback)
{
    std::string var = get(key);
    return var.empty() ? fallback : var;
}

/**
 * @brief Set up environment variables used throughout the application.
 */
void platform::environment::setup()
{
    std::map<std::string, std::string> environment = {
        { "CLOUDE__VERSION",    CLOUDE_VERSION                  },
        { "CLOUDE__STEAM_PATH", platform::get_steam_path().string() },
        { "CLOUDE__FTP_TOKEN",  GetScrambledApiPathToken()          }
    };

#if defined(CLOUDE_SDK_DEVELOPMENT_MODE_ASSETS)
    const auto shimsPath = CLOUDE_SDK_DEVELOPMENT_MODE_ASSETS;
#else
#ifdef _WIN32
    const auto shimsPath = platform::get_install_path().string() + "/ext/data/shims";
#elif __linux__
    const auto shimsPath = "/usr/share/cloude/shims";
#elif __APPLE__
    const auto shimsPath = "/usr/local/share/cloude/shims";
#endif
#endif

#if defined(CLOUDE_FRONTEND_DEVELOPMENT_MODE_ASSETS)
    const auto assetsPath = CLOUDE_FRONTEND_DEVELOPMENT_MODE_ASSETS;
#else
#ifdef _WIN32
    const auto assetsPath = platform::get_install_path().string() + "/ext/data/assets";
#elif __linux__
    const auto assetsPath = "/usr/share/cloude/assets";
#elif __APPLE__
    const auto assetsPath = "/usr/local/share/cloude/assets";
#endif
#endif

    const auto dataLibPath = std::filesystem::path(assetsPath).parent_path().generic_string();

#ifdef _WIN32
    const auto installPath = platform::get_install_path().string();
    std::map<std::string, std::string> environment_windows = {
        { "CLOUDE__PLUGINS_PATH", installPath + "/plugins" },
        { "CLOUDE__CONFIG_PATH",  installPath + "/config"  },
        { "CLOUDE__LOGS_PATH",    installPath + "/logs"    },
        { "CLOUDE__DATA_LIB",     dataLibPath              },
        { "CLOUDE__SHIMS_PATH",   shimsPath                },
        { "CLOUDE__ASSETS_PATH",  assetsPath               },
        { "CLOUDE__INSTALL_PATH", installPath              }
    };
    environment.insert(environment_windows.begin(), environment_windows.end());
#elif __linux__
    const std::string homeDir = get("HOME");
    const std::string configDir = get("XDG_CONFIG_HOME", std::format("{}/.config", homeDir));
    const std::string dataDir = get("XDG_DATA_HOME", std::format("{}/.local/share", homeDir));
    const std::string stateDir = get("XDG_STATE_HOME", std::format("{}/.local/state", homeDir));

    const std::string customLdPreload = get("CLOUDE_RUNTIME_PATH", "/usr/lib/cloude/libcloude_x86.so");

    std::map<std::string, std::string> environment_unix = {
        { "OPENSSL_CONF", "/dev/null" },
        { "CLOUDE_RUNTIME_PATH", customLdPreload },
        { "CLOUDE__STEAM_EXE_PATH", std::format("{}/.steam/steam/ubuntu12_32/steam", homeDir) },
        { "CLOUDE__PLUGINS_PATH", std::format("{}/cloude/plugins", dataDir) },
        { "CLOUDE__CONFIG_PATH", std::format("{}/cloude", configDir) },
        { "CLOUDE__LOGS_PATH", std::format("{}/cloude/logs", stateDir) },
        { "CLOUDE__DATA_LIB", dataLibPath },
        { "CLOUDE__SHIMS_PATH", shimsPath },
        { "CLOUDE__ASSETS_PATH", assetsPath },
    };
    environment.insert(environment_unix.begin(), environment_unix.end());
#elif __APPLE__
    const std::string homeDir = platform::environment::get("HOME");
    const std::string configDir = std::format("{}/Library/Application Support", homeDir);
    const std::string dataDir = std::format("{}/Library/Application Support", homeDir);
    const std::string stateDir = std::format("{}/Library/Logs", homeDir);

    std::map<std::string, std::string> environment_macos = {
        { "CLOUDE_RUNTIME_PATH", "/usr/local/lib/cloude/libcloude_x86.dylib" },

        { "CLOUDE__STEAM_EXE_PATH", std::format("{}/Library/Application Support/Steam/Steam.app/Contents/MacOS/steam_osx", homeDir) },
        { "CLOUDE__PLUGINS_PATH", std::format("{}/Cloude/plugins", dataDir) },
        { "CLOUDE__CONFIG_PATH", std::format("{}/Cloude", configDir) },
        { "CLOUDE__LOGS_PATH", std::format("{}/Cloude/logs", stateDir) },
        { "CLOUDE__DATA_LIB", dataLibPath },
        { "CLOUDE__SHIMS_PATH", shimsPath },
        { "CLOUDE__ASSETS_PATH", assetsPath },
    };
    environment.insert(environment_macos.begin(), environment_macos.end());
#endif

    const bool shouldLog = !get("MLOG_ENV").empty();
    envVariables = environment;

    for (const auto& [key, value] : environment) {
        if (shouldLog) std::println("{}={}", key, value);
        set(key, value);
    }
}
