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

#include "head/library_updater.h"
#include "head/theme_mgr.h"
#include "head/scan.h"

#include "cloude/logger.h"
#include "cloude/filesystem.h"
#include "cloude/http.h"
#include "cloude/encoding.h"
#include "cloude/zip.h"

#include <fstream>

head::theme_installer::theme_installer(std::shared_ptr<::plugin_manager> plugin_manager, std::shared_ptr<library_updater> updater)
    : m_plugin_manager(std::move(plugin_manager)), m_updater(std::move(updater))
{
    migrate_legacy_themes();
}

std::filesystem::path head::theme_installer::get_themes_folder()
{
    return platform::get_cloude_path() / "themes";
}

nlohmann::json head::theme_installer::create_error_response(const std::string& message)
{
    return nlohmann::json({
        { "success", false   },
        { "message", message }
    });
}

nlohmann::json head::theme_installer::create_successful_response()
{
    return nlohmann::json({
        { "success", true }
    });
}

std::optional<nlohmann::json> head::theme_installer::get_theme_from_github(const std::string& repo, const std::string& owner, [[maybe_unused]] bool asString)
{
    nlohmann::json themes = head::Themes::FindAllThemes();
    for (auto& theme : themes) {
        auto github = theme.value("data", nlohmann::json::object()).value("github", nlohmann::json::object());
        if (github.value("owner", "") == owner && github.value("repo_name", "") == repo) return theme;
    }
    return std::nullopt;
}

bool head::theme_installer::is_theme_installed(const std::string& repo, const std::string& owner)
{
    auto theme = get_theme_from_github(repo, owner);
    if (!theme.has_value()) {
        logger.log("is_theme_installed: {}/{} -> false (not found)", owner, repo);
        return false;
    }

    std::filesystem::path path = get_themes_folder() / theme->value("native", std::string());
    bool installed = std::filesystem::exists(path);
    logger.log("is_theme_installed: {}/{} -> {} (path: {})", owner, repo, installed, path.string());
    return installed;
}

nlohmann::json head::theme_installer::uninstall_theme(std::shared_ptr<theme_config_store> themeConfig, const std::string& repo, const std::string& owner)
{
    logger.log("uninstall_theme: {}/{}", owner, repo);

    auto themeOpt = get_theme_from_github(repo, owner);
    if (!themeOpt) return create_error_response("Couldn't locate theme on disk!");

    if (!themeOpt->contains("native")) return create_error_response("Theme does not have a native path!");

    std::filesystem::path path = get_themes_folder() / themeOpt->value("native", std::string());
    if (!std::filesystem::exists(path)) return create_error_response("Theme path does not exist!");

    if (!platform::remove_directory(path)) return create_error_response("Failed to delete theme folder");

    /** trigger config update to regenerate config */
    themeConfig->on_config_change_hdlr();
    return create_successful_response();
}

bool head::theme_installer::write_metadata(const std::filesystem::path& themePath, const std::string& owner, const std::string& repo, const std::string& commit)
{
    nlohmann::json metadata = {
        { "owner",  owner  },
        { "repo",   repo   },
        { "commit", commit }
    };

    std::ofstream out(themePath / "metadata.json");
    if (!out) {
        LOG_ERROR("Failed to open metadata.json for writing in '{}'", themePath.string());
        return false;
    }

    out << metadata.dump(4);
    out.flush();

    if (!out.good()) {
        LOG_ERROR("Failed to write metadata.json in '{}'", themePath.string());
        return false;
    }

    return true;
}

std::optional<nlohmann::json> head::theme_installer::read_metadata(const std::filesystem::path& themePath)
{
    std::filesystem::path metadataPath = themePath / "metadata.json";
    if (!std::filesystem::exists(metadataPath)) return std::nullopt;

    try {
        std::ifstream in(metadataPath);
        nlohmann::json metadata;
        in >> metadata;

        if (metadata.contains("owner") && metadata.contains("repo") && metadata.contains("commit")) {
            return metadata;
        }
    } catch (const std::exception& e) {
        LOG_ERROR("Failed to read metadata.json for theme {}: {}", themePath.filename().string(), e.what());
    }
    return std::nullopt;
}

std::string head::theme_installer::get_commit_hash(const std::filesystem::path& repoPath)
{
    auto metadata = read_metadata(repoPath);
    if (metadata) {
        return metadata->value("commit", "");
    }

    /*
     * migrate legacy git themes by parsing the .git files
     * this only runs once per theme — after migration, metadata.json is used instead.
     */
    std::filesystem::path gitDir = repoPath / ".git";
    if (!std::filesystem::exists(gitDir) || !std::filesystem::is_directory(gitDir)) return "";

    try {
        std::ifstream headFile(gitDir / "HEAD");
        std::string headContent;
        std::getline(headFile, headContent);

        /* strip trailing \r CRLF on windows */
        if (!headContent.empty() && headContent.back() == '\r') {
            headContent.pop_back();
        }

        /* HEAD is either "ref: refs/heads/main" (symbolic) or a raw 40-char hex hash (detached) */
        std::string ref;
        if (headContent.size() > 5 && headContent.substr(0, 5) == "ref: ") {
            ref = headContent.substr(5);
        } else {
            return headContent;
        }

        /* try the loose ref file first: .git/refs/heads/main */
        std::filesystem::path looseRefPath = gitDir / ref;
        if (std::filesystem::exists(looseRefPath)) {
            std::ifstream refFile(looseRefPath);
            std::string commitHash;
            std::getline(refFile, commitHash);
            if (!commitHash.empty() && commitHash.back() == '\r') {
                commitHash.pop_back();
            }
            return commitHash;
        }

        /* loose ref missing, with git gc or git pack-refs */
        std::filesystem::path packedRefsPath = gitDir / "packed-refs";
        if (std::filesystem::exists(packedRefsPath)) {
            std::ifstream packedFile(packedRefsPath);
            std::string line;
            while (std::getline(packedFile, line)) {
                if (line.empty() || line[0] == '#' || line[0] == '^') continue;
                if (!line.empty() && line.back() == '\r') line.pop_back();

                /* fmt -> <40-char hash> <ref path> */
                auto spacePos = line.find(' ');
                if (spacePos != std::string::npos && line.substr(spacePos + 1) == ref) {
                    return line.substr(0, spacePos);
                }
            }
        }
    } catch (const std::exception& e) {
        LOG_ERROR("Failed to read git HEAD for {}: {}", repoPath.filename().string(), e.what());
    }
    return "";
}

void head::theme_installer::migrate_legacy_themes()
{
    try {
        std::filesystem::path themesDir = get_themes_folder();
        if (!std::filesystem::exists(themesDir)) {
            return;
        }

        for (const auto& entry : std::filesystem::directory_iterator(themesDir)) {
            if (!entry.is_directory()) {
                continue;
            }

            std::filesystem::path themePath = entry.path();

            /* skip if already has metadata.json */
            if (std::filesystem::exists(themePath / "metadata.json")) {
                continue;
            }

            /* only migrate if it has .git (was installed via old system) */
            if (!std::filesystem::exists(themePath / ".git")) {
                continue;
            }

            /* read owner/repo from skin.json's github field */
            std::filesystem::path skinPath = themePath / "skin.json";
            if (!std::filesystem::exists(skinPath)) {
                continue;
            }

            try {
                std::ifstream skinFile(skinPath);
                nlohmann::json skinData;
                skinFile >> skinData;

                if (!skinData.contains("github")) continue;

                std::string owner = skinData["github"].value("owner", "");
                std::string repo = skinData["github"].value("repo_name", "");
                if (owner.empty() || repo.empty()) continue;

                std::string commit = get_commit_hash(themePath);
                if (commit.empty()) continue;

                if (!write_metadata(themePath, owner, repo, commit)) {
                    LOG_ERROR("Failed to write metadata during migration of '{}'", themePath.filename().string());
                    continue;
                }
                logger.log("Migrated legacy theme '{}' ({}/{}) with commit {}", themePath.filename().string(), owner, repo, commit);
            } catch (const std::exception& e) {
                LOG_ERROR("Failed to migrate legacy theme '{}': {}", themePath.filename().string(), e.what());
            }
        }
    } catch (const std::exception& e) {
        LOG_ERROR("Failed to migrate legacy themes: {}", e.what());
    }
}

nlohmann::json head::theme_installer::install_theme(std::shared_ptr<theme_config_store> themeConfig, const std::string& repo, const std::string& owner)
{
    logger.warn("Network disabled: blocked remote theme install {}/{}", owner, repo);
    (void)themeConfig;
    return create_error_response("Network disabled in Cloude Steam Loader");
}

bool head::theme_installer::update_theme(std::shared_ptr<theme_config_store> themeConfig, const std::string& native)
{
    logger.warn("Network disabled: blocked remote theme update '{}'", native);
    (void)themeConfig;
    return false;
}

std::vector<std::pair<nlohmann::json, std::filesystem::path>> head::theme_installer::query_themes_for_updates()
{
    std::vector<std::pair<nlohmann::json, std::filesystem::path>> updateQuery;
    nlohmann::json themes = head::Themes::FindAllThemes();

    for (auto& theme : themes) {
        if (!theme["data"].contains("github")) continue;

        std::filesystem::path path = get_themes_folder() / theme.value("native", "");
        if (!std::filesystem::exists(path)) continue;

        bool hasMetadata = std::filesystem::exists(path / "metadata.json");
        bool hasGit = std::filesystem::exists(path / ".git");

        if (hasMetadata || hasGit) {
            updateQuery.push_back({ theme, path });
        }
    }

    return updateQuery;
}

nlohmann::json head::theme_installer::make_post_body(const std::vector<nlohmann::json>& update_query)
{
    nlohmann::json post_body = nlohmann::json::array();

    for (const auto& theme : update_query) {
        if (!theme.contains("data") || !theme["data"].contains("github")) continue;

        const auto& github_data = theme["data"]["github"];
        std::string owner = github_data.value("owner", "");
        std::string repo_name = github_data.value("repo_name", "");

        if (!owner.empty() && !repo_name.empty()) {
            post_body.push_back({
                { "owner", owner     },
                { "repo",  repo_name }
            });
        }
    }

    return post_body;
}

nlohmann::json head::theme_installer::get_request_body(void)
{
    nlohmann::json result;

    try {
        auto update_query = query_themes_for_updates();
        auto post_body = make_post_body([&update_query]
        {
            std::vector<nlohmann::json> themes;
            for (const auto& pair : update_query) {
                themes.push_back(pair.first);
            }
            return themes;
        }());

        if (update_query.empty()) {
            logger.log("No themes to update!");
            return {
                { "update_query", nullptr },
                { "post_body",    nullptr }
            };
        }

        result["update_query"] = update_query;
        result["post_body"] = post_body;
    } catch (const std::exception& e) {
        logger.log(std::string("Exception in GetRequestBody: ") + e.what());
        result["update_query"] = nullptr;
        result["post_body"] = nullptr;
    }

    return result;
}

nlohmann::json head::theme_installer::process_update(const nlohmann::json& updateQuery, const nlohmann::json& remote)
{
    nlohmann::json updatedThemes = nlohmann::json::array();

    for (const auto& updateItem : updateQuery) {
        const std::filesystem::path path = updateItem[1];
        const nlohmann::json theme = updateItem[0];

        if (!has_github_data(theme)) {
            continue;
        }

        const std::string repoName = get_repository_name(theme);
        const auto remoteTheme = find_remote_theme(remote, repoName);

        if (remoteTheme == nullptr) {
            logger.log("[update-check] theme='{}' (repo='{}'): no matching entry in API response, skipping", path.filename().string(), repoName);
            continue;
        }

        if (has_updates(path, *remoteTheme)) {
            updatedThemes.push_back(create_update_info(theme, *remoteTheme));
        }
    }

    return updatedThemes;
}

bool head::theme_installer::has_github_data(const nlohmann::json& theme)
{
    return theme["data"].contains("github");
}

std::string head::theme_installer::get_repository_name(const nlohmann::json& theme)
{
    const nlohmann::json& githubData = theme["data"]["github"];
    return githubData.value("repo_name", "");
}

const nlohmann::json* head::theme_installer::find_remote_theme(const nlohmann::json& remote, const std::string& repoName)
{
    if (!remote.is_array()) {
        return nullptr;
    }

    auto it = std::find_if(remote.begin(), remote.end(), [&repoName](const nlohmann::json& item)
    {
        return item.value("name", "") == repoName;
    });

    return (it != remote.end()) ? &(*it) : nullptr;
}

bool head::theme_installer::has_updates(const std::filesystem::path& path, const nlohmann::json& remoteTheme)
{
    const std::string remoteCommit = remoteTheme.value("commit", "");
    const std::string localCommit = get_commit_hash(path);
    const bool differs = localCommit != remoteCommit;

    logger.log("[update-check] theme='{}' local='{}' remote='{}' has_update={}", path.filename().string(), localCommit, remoteCommit, differs);

    return differs;
}

nlohmann::json head::theme_installer::create_update_info(const nlohmann::json& theme, const nlohmann::json& remoteTheme)
{
    return nlohmann::json{
        { "message", remoteTheme.value("message", "No commit message.") },
        { "date", remoteTheme.value("date", "unknown") },
        { "commit", remoteTheme.value("url", "") },
        { "native", theme["native"] },
        { "name", theme["data"].value("name", theme["native"]) }
    };
}
