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

#include "head/default_cfg.h"
#include "nlohmann/json.hpp"
#include "cloude/environment.h"
#include <filesystem>

json head::get_default_config()
{
    /** Detect old file to determine welcome modal status */
    bool hasShownWelcomeModal = std::filesystem::exists(std::filesystem::path(platform::environment::get("CLOUDE__CONFIG_PATH")) / "themes.json");

    // clang-format off
    json default_config = {
        { "general", {
            { "injectJavascript", true },
            { "injectCSS", true },
            { "checkForCloudeUpdates", false },
            { "checkForPluginAndThemeUpdates", false },
            { "onCloudeUpdate", static_cast<int>(head::on_cloude_update::DO_NOTHING) },
            { "cloudeUpdateChannel", "stable" },
            { "shouldShowThemePluginUpdateNotifications", false },
            { "accentColor", "DEFAULT_ACCENT_COLOR" }
        } },
        { "misc", {
            { "hasShownWelcomeModal", hasShownWelcomeModal }
        } },
        { "network", {
            { "disabled", true },
            { "proxy", "" },
            { "proxyUsername", "" },
            { "proxyPassword", "" }
        } },
        { "themes", {
            { "activeTheme", "default" },
            { "allowedStyles", true },
            { "allowedScripts", true }
        } },
        { "notifications", {
            { "showNotifications", true },
            { "showUpdateNotifications", true },
            { "showPluginNotifications", true }
        } }
    };
    // clang-format on

    return default_config;
}
