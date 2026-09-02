/*
 * ==================================================
 *   _____ _ _ _             _
 *  |     |_| | |___ ___ ___|_|_ _ _____
 *  | | | | | | | -_|   |   | | | |     |
 *  |_|_|_|_|_|___|_|_|_|_|_|___|_|_|_|
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

#include "head/entry_point.h"
#include "head/library_updater.h"
#include "head/plugin_mgr.h"
#include "head/scan.h"

#include "cloude/filesystem.h"
#include "cloude/cloude.h"
#include "cloude/logger.h"
#include "cloude/http.h"
#include "cloude/environment.h"
#include "cloude/encoding.h"
#include "cloude/zip.h"

head::plugin_installer::plugin_installer(std::weak_ptr<cloude_backend> cloude_backend, std::shared_ptr<::plugin_manager> plugin_mgr,
                                         std::shared_ptr<library_updater> updater)
    : m_cloude_backend(std::move(cloude_backend)), m_plugin_manager(std::move(plugin_mgr)), m_updater(std::move(updater))
{
}

std::filesystem::path head::plugin_installer::get_plugins_path()
{
    return std::filesystem::path(platform::environment::get("CLOUDE__PLUGINS_PATH"));
}

bool head::plugin_installer::is_plugin_installed(const std::string& pluginName)
{
    return head::Plugins::GetPluginFromName(pluginName, m_plugin_manager).has_value();
}

bool head::plugin_installer::uninstall_plugin(const std::string& pluginName)
{
    try {
        auto pluginOpt = head::Plugins::GetPluginFromName(pluginName, m_plugin_manager);
        if (!pluginOpt) return false;

        if (m_plugin_manager->is_enabled(pluginName)) {
            g_cloude->get_plugin_loader()->set_plugin_enable(pluginName, false);
        }

        std::filesystem::path pluginPath = pluginOpt->at("path").get<std::string>();
        logger.log("Attempting to remove plugin directory: {}", pluginPath.string());

        if (!std::filesystem::exists(pluginPath)) {
            LOG_ERROR("Plugin path does not exist: {}", pluginPath.string());
            return false;
        }

        platform::safe_remove_directory(pluginPath);

        return true;
    } catch (const std::exception& e) {
        LOG_ERROR("Failed to uninstall {}: {}", pluginName, e.what());
        return false;
    }
}

nlohmann::json head::plugin_installer::install_plugin(const std::string& downloadUrl, size_t totalSize)
{
    logger.warn("Network disabled: blocked remote plugin install from {}", downloadUrl);
    (void)totalSize;
    return {
        { "success", false },
        { "error", "Network disabled in Cloude Steam Loader" }
    };
}

std::optional<nlohmann::json> head::plugin_installer::read_plugin_metadata(const std::filesystem::path& pluginPath)
{
    std::filesystem::path metadataPath = pluginPath / "metadata.json";
    if (!std::filesystem::exists(metadataPath)) return std::nullopt;

    try {
        std::ifstream in(metadataPath);
        nlohmann::json metadata;
        in >> metadata;

        if (metadata.contains("id") && metadata.contains("commit")) {
            return nlohmann::json{
                { "id",     metadata["id"]                 },
                { "commit", metadata["commit"]             },
                { "name",   pluginPath.filename().string() }
            };
        }
    } catch (const std::exception& e) {
        LOG_ERROR("Failed to read metadata.json for plugin {}: {}", pluginPath.filename().string(), e.what());
    }
    return std::nullopt;
}

std::vector<nlohmann::json> head::plugin_installer::get_plugin_data()
{
    std::vector<nlohmann::json> pluginData;
    const auto pluginsPath = get_plugins_path();
    if (!std::filesystem::exists(pluginsPath)) {
        std::filesystem::create_directories(pluginsPath);
        return pluginData;
    }
    for (const auto& entry : std::filesystem::directory_iterator(pluginsPath)) {
        if (!entry.is_directory()) continue;

        auto metadata = read_plugin_metadata(entry.path());
        if (metadata) pluginData.push_back(*metadata);
    }
    return pluginData;
}

bool head::plugin_installer::update_plugin(const std::string& id, const std::string& name, const std::string& commit)
{
    logger.warn("Network disabled: blocked remote plugin update id='{}' name='{}' commit='{}'", id, name, commit);
    return false;
}

nlohmann::json head::plugin_installer::get_updater_request_body()
{
    auto data = get_plugin_data();
    return data.empty() ? nlohmann::json::array() : nlohmann::json(data);
}
