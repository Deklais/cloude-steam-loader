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

#ifdef _WIN32
#include "cloude/cloude.h"
#include "cloude/filesystem.h"
#include "cloude/cmdline_api.h"
#include "cloude/plat_msg.h"
#include "cloude/environment.h"
#include "cloude/encoding.h"
#include "cloude/steam_hooks.h"
#include "cloude/plat_msg.h"
#include "shared/crash_handler.h"

#include <thread>

namespace fs = std::filesystem;

/** forward declare function */
std::thread g_cloudeThread;

/**
 * Setup environment variables used throughout Cloude.
 * These are vital to be setup, if they aren't Cloude and its loaded plugins will likely fail to start/run
 */
CONSTRUCTOR VOID Win32_InitializeEnvironment(VOID)
{
    try {
        platform::environment::setup();
    } catch (const std::exception& e) {
        LOG_ERROR("Failed to set up environment variables: {}", e.what());
        std::exit(EXIT_FAILURE);
    }
}

#include "cloude/cloude_lifecycle.h"

BOOL AreFilesIdentical(LPCWSTR path1, LPCWSTR path2)
{
    HANDLE h1 = CreateFileW(path1, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, NULL, OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS, NULL);
    if (h1 == INVALID_HANDLE_VALUE) return FALSE;

    HANDLE h2 = CreateFileW(path2, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, NULL, OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS, NULL);
    if (h2 == INVALID_HANDLE_VALUE) {
        CloseHandle(h1);
        return FALSE;
    }

    BY_HANDLE_FILE_INFORMATION info1, info2;
    BOOL same = FALSE;

    if (GetFileInformationByHandle(h1, &info1) && GetFileInformationByHandle(h2, &info2)) {
        same = (info1.dwVolumeSerialNumber == info2.dwVolumeSerialNumber) && (info1.nFileIndexHigh == info2.nFileIndexHigh) && (info1.nFileIndexLow == info2.nFileIndexLow);
    }

    CloseHandle(h1);
    CloseHandle(h2);
    return same;
}

/**
 * Initialize Cloude webhelper hook by hardlinking it into the cef bin directories.
 */
VOID Win32_AttachWebHelperHook(VOID)
{
    const auto hookPath = platform::get_cloude_path() / "lib" / "cloude.hhx64.dll";

    if (!std::filesystem::exists(hookPath)) {
        platform::messagebox::show("Cloude Error", "Cloude webhelper hook is missing. Please reinstall Cloude.", platform::messagebox::error);
        return;
    }

    const fs::path cefDirs[] = {
        platform::get_steam_path() / "bin" / "cef" / "cef.win7x64",
        platform::get_steam_path() / "bin" / "cef" / "cef.win64",
    };

    for (const auto& cefDir : cefDirs) {
        if (!std::filesystem::exists(cefDir)) {
            continue;
        }

        const auto targetPath = cefDir / "version.dll";

        if (!AreFilesIdentical(hookPath.wstring().c_str(), targetPath.wstring().c_str())) {
            DeleteFileW(targetPath.wstring().c_str());
        }

        if (std::filesystem::exists(targetPath)) {
            continue;
        }

        BOOL result = CreateHardLinkW(targetPath.wstring().c_str(), hookPath.wstring().c_str(), NULL);
        if (!result) {
            platform::messagebox::show(
                "Cloude Error",
                std::format("Failed to create hardlink for Cloude webhelper hook.\nTarget: {}\nError Code: {}\nMake sure Steam is not running and try again.",
                            targetPath.string(), GetLastError())
                    .c_str(),
                platform::messagebox::error);
        }
    }
}

VOID Win32_MoveVersionHook(VOID)
{
    const auto versionHookPath = platform::get_steam_path() / "version.dll";
    const auto targetPath = platform::get_steam_path() / "cloude-legacy.version.dll";

    if (!std::filesystem::exists(versionHookPath)) {
        return;
    }

    if (!MoveFileExW(versionHookPath.wstring().c_str(), targetPath.wstring().c_str(), MOVEFILE_REPLACE_EXISTING)) {
        const DWORD error = GetLastError();
        platform::messagebox::show("Cloude Error", std::format("Failed to move legacy version.dll hook.\nError Code: {}", error).c_str(), platform::messagebox::error);
    }
}

/* move a single file to a temp directory. Uses MoveFileExW so it can handle in-use files.*/
static void move_to_temp(const fs::path& file, const fs::path& temp_dir)
{
    std::error_code ec;
    if (!fs::exists(file, ec)) return;

    fs::path dest = temp_dir / std::format("{}.{}.tmp", file.filename().string(), GenerateUUID());
    if (!MoveFileExW(file.wstring().c_str(), dest.wstring().c_str(), MOVEFILE_REPLACE_EXISTING)) {
        logger.warn("Migration: could not move {} (error: {})", file.string(), GetLastError());
    } else {
        logger.log("Migration: moved {} -> temp", file.filename().string());
    }
}

/**
 * move each entry (file, dir, or symlink) from src_dir into dst_dir individually.
 * moves symlinks/junctions as-is (no admin rights needed).
 */
static void move_directory_entries(const fs::path& src_dir, const fs::path& dst_dir)
{
    std::error_code ec;
    if (!fs::exists(src_dir, ec) || !fs::is_directory(src_dir, ec)) return;

    for (const auto& entry : fs::directory_iterator(src_dir, ec)) {
        if (ec) break;

        fs::path dest = dst_dir / entry.path().filename();
        if (fs::exists(dest, ec)) continue;

        fs::rename(entry.path(), dest, ec);
        if (ec) {
            logger.warn("Migration: failed to move {}: {}", entry.path().filename().string(), ec.message());
            ec.clear();
        }
    }
}

/**
 * migrate the old flat <steam>/ext/ layout to the new <steam>/cloude/ structure.
 * runs once, skipped if ext/ is already gone or cloude/ is already populated.
 */
static VOID Win32_MigrateLegacyLayout(VOID)
{
    try {
        const auto steam = platform::get_steam_path();
        const auto cloude = platform::get_cloude_path();

        std::error_code ec;
        const bool hasLegacyExt = fs::exists(steam / "ext", ec);
        const bool hasLegacyPlugins = fs::exists(steam / "plugins", ec);
        const bool hasLegacySkins = fs::exists(steam / "steamui" / "skins", ec);

        if (!hasLegacyExt && !hasLegacyPlugins && !hasLegacySkins) return;

        logger.log("Migration: legacy layout detected, migrating...");

        /** create directory skeleton */
        for (const auto& dir : { "ext/data/assets", "ext/data/shims", "plugins", "logs", "themes", "config", "crashes" }) {
            fs::create_directories(cloude / dir, ec);
        }

        /** move data directories */
        auto safe_rename = [&](const fs::path& src, const fs::path& dst)
        {
            if (fs::exists(src, ec) && !fs::exists(dst, ec)) {
                fs::rename(src, dst, ec);
                if (ec) {
                    logger.warn("Migration: rename {} failed: {}", src.string(), ec.message());
                    ec.clear();
                }
            }
        };

        safe_rename(steam / "ext" / "data" / "assets", cloude / "ext" / "data" / "assets");
        safe_rename(steam / "ext" / "data" / "shims", cloude / "ext" / "data" / "shims");

        /** move plugins and themes (entry-by-entry so symlinks are preserved) */
        move_directory_entries(steam / "plugins", cloude / "plugins");
        move_directory_entries(steam / "steamui" / "skins", cloude / "themes");

        /** move logs */
        move_directory_entries(steam / "ext" / "logs", cloude / "logs");

        /** move config files */
        safe_rename(steam / "ext" / "config.json", cloude / "config" / "config.json");
        safe_rename(steam / "ext" / "quickcss.css", cloude / "config" / "quick.css");

        /** move legacy DLLs to temp (they may be loaded, so move rather than delete) */
        fs::path temp_dir = steam / "cloude-migration-temp";
        fs::create_directories(temp_dir, ec);

        const fs::path legacy_files[] = {
            steam / "user32.dll",
            steam / "version.dll",
            steam / "ext" / "compat32" / "cloude_x86.dll",
            steam / "ext" / "compat32" / "python311.dll",
            steam / "ext" / "compat64" / "cloude_x64.dll",
            steam / "ext" / "compat64" / "python311.dll",
            steam / "cloude.hhx64.dll",
            steam / "cloude.dll",
            steam / "python311.dll",
            steam / "cloude-legacy.version.dll",
        };

        for (const auto& file : legacy_files) {
            move_to_temp(file, temp_dir);
        }

        /** clean up legacy directories */
        if (fs::exists(steam / "ext", ec)) {
            fs::rename(steam / "ext", temp_dir / "ext", ec);
            if (ec) {
                logger.warn("Migration: could not move ext/ to temp: {}", ec.message());
                ec.clear();
            }
        }
        fs::remove_all(steam / "plugins", ec);
        fs::remove_all(steam / "steamui" / "skins", ec);

        logger.log("Migration: completed.");
    } catch (const std::exception& e) {
        LOG_ERROR("Migration failed: {}", e.what());
    }
}

VOID Win32_AttachCloude(VOID)
{
    if (!platform::initialize_steam_hooks()) {
        platform::messagebox::show("Cloude Error", "Failed to initialize Steam hooks, Cloude cannot continue startup.", platform::messagebox::error);
    }

    install_cloude_crash_handler();
    Win32_MigrateLegacyLayout();
    Win32_MoveVersionHook();

    g_cloude = std::make_unique<cloude>();

    Win32_AttachWebHelperHook();
    platform::environment::setup();

    g_cloude->entry();
    logger.log("[Win32_AttachCloude] Cloude main function has returned, proceeding with shutdown...");

    uninitialize_steam_hooks();
    /** Deallocate the developer console */
    if (CommandLineArguments::has_argument("-dev")) {
        FreeConsole();
    }
}

/**
 * Cleans up resources and gracefully shuts down Cloude on Windows.
 *
 * @warning This cleanup function assumes EntryMain has returned with success, otherwise this detach function will deadlock.
 * It depends on Python being uninitialized with all threads terminated, and all frontend hooks detached.
 */
VOID Win32_DetachCloude(VOID)
{
    logger.print(" MAIN ", "Shutting Cloude down...", COL_MAGENTA);
    cloude_lifecycle::get().terminate.notify();
    logger.log("Waiting for Cloude thread to exit...");

    if (!g_cloudeThread.joinable()) {
        platform::messagebox::show("Warning", "Cloude thread is not joinable, skipping join. This is likely because Cloude failed to start properly.",
                                   platform::messagebox::warn);
        return;
    }

    g_cloudeThread.join();
    g_cloude.reset();
    logger.log("Cloude thread has exited.");
}

/**
 * @brief Entry point for Cloude on Windows.
 * @param fdwReason The reason for calling the DLL.
 * @return True if the DLL was successfully loaded, false otherwise.
 */
DLL_EXPORT INT WINAPI DllMain([[maybe_unused]] HINSTANCE hinstDLL, DWORD fdwReason, LPVOID lpvReserved)
{
    switch (fdwReason) {
        case DLL_PROCESS_ATTACH:
        {
            logger.log("Cloude-x86_64@{} attached...", CLOUDE_VERSION);
            register_dll_notifications();

            g_cloudeThread = std::thread(Win32_AttachCloude);
            break;
        }
        case DLL_PROCESS_DETACH:
        {
            if (lpvReserved != nullptr) {
                if (g_cloudeThread.joinable()) {
                    g_cloudeThread.detach();
                }
                void(g_cloude.release());
                break;
            }

            Win32_DetachCloude();
            break;
        }
    }

    return true;
}
#endif
