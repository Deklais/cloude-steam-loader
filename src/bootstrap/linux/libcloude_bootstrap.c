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

#ifdef __linux__
#include "shared.h"
#include <stdlib.h>

static void* h_cloude = NULL;
static int b_has_loaded_cloude = 0;

typedef int (*start_cloude_t)(void);
typedef int (*stop_cloude_t)(void);

#ifdef CLOUDE_RUNTIME_PATH
static const char* k_cloude_path = CLOUDE_RUNTIME_PATH;
#else
static const char* get_cloude_library_path(void)
{
    static char path_buffer[PATH_MAX];
    static int initialized = 0;

    if (!initialized) {
        const char* envPath = getenv("CLOUDE_RUNTIME_PATH");
        if (envPath) {
            strncpy(path_buffer, envPath, PATH_MAX - 1);
            path_buffer[PATH_MAX - 1] = '\0';
        } else {
            strncpy(path_buffer, "/usr/lib/cloude/libcloude_x86.so", PATH_MAX - 1);
            path_buffer[PATH_MAX - 1] = '\0';
        }
        initialized = 1;
    }
    return path_buffer;
}
#define k_cloude_path (get_cloude_library_path())
#endif

static int load_and_start_cloude(void)
{
    h_cloude = dlopen_or_log(k_cloude_path, RTLD_LAZY | RTLD_GLOBAL);
    if (!h_cloude) return 0;

    start_cloude_t fn_start = (start_cloude_t)dlsym_or_log(h_cloude, "StartCloude");
    if (!fn_start) {
        dlclose(h_cloude);
        h_cloude = NULL;
        return 0;
    }

    int result = fn_start();
    if (result < 0) {
        LOG_ERROR("Failed to start Cloude: %d", result);
        dlclose(h_cloude);
        h_cloude = NULL;
        return 0;
    }

    return 1;
}

static void stop_and_unload_cloude(void)
{
    if (!h_cloude) {
        LOG_ERROR("Cloude library is not loaded.");
        return;
    }

    stop_cloude_t fn_stop = (stop_cloude_t)dlsym_or_log(h_cloude, "StopCloude");
    if (fn_stop) {
        int result = fn_stop();
        if (result < 0) LOG_ERROR("Failed to stop Cloude: %d", result);
    }

    dlclose(h_cloude);
    h_cloude = NULL;
    b_has_loaded_cloude = 0;
}

static void setup_hooks(void)
{
    const char* p = get_process_path_parent();
    if (!p) {
        LOG_ERROR("Failed to retrieve current directory.");
        return;
    }

    char lbxtst_path[PATH_MAX];
    get_steam_lib_path(lbxtst_path, p, "i386-linux-gnu", "libXtst.so.6");

    if (access(lbxtst_path, F_OK) == -1) {
        LOG_ERROR("Pinned libXtst does not exist at: %s", lbxtst_path);
        return;
    }

    h_xtst = dlopen_or_log(lbxtst_path, RTLD_LAZY | RTLD_GLOBAL);
}

static int is_steam_process(void)
{
    char* p = get_process_path();
    if (!p) return 0;

    char rp[PATH_MAX];
    if (!realpath(p, rp)) return 0;

    const char* home = getenv("HOME");
    if (!home) return 0;

    char steam_path[PATH_MAX];
    snprintf(steam_path, PATH_MAX, "%s/.steam/steam/ubuntu12_32/steam", home);

    char rsteam_path[PATH_MAX];
    if (!realpath(steam_path, rsteam_path)) return 0;

    return strcmp(rp, rsteam_path) == 0;
}

static void libcloude_bootstrap_init(void) __attribute__((constructor));
static void libcloude_bootstrap_cleanup(void) __attribute__((destructor));

static void proxy_at_exit_handler(void)
{
    LOG_INFO("at_exit: invoking stop_and_unload_cloude()");
    if (b_has_loaded_cloude) {
        stop_and_unload_cloude();
    }
}

static void libcloude_bootstrap_init(void)
{
    if (!is_steam_process()) {
        LOG_INFO("Skipping Cloude setup for non-Steam process. Process path: %s", get_process_path());
        return;
    }

    LOG_INFO("Setting up proxy hooks...");
    setup_hooks();

    b_has_loaded_cloude = 1;

    LOG_INFO("Bootstrap library loaded successfully. Using Cloude library at: %s", k_cloude_path);
    if (!load_and_start_cloude()) {
        LOG_ERROR("Failed to load Cloude...");
        return;
    }

    LOG_INFO("Started Cloude...");

    if (atexit(proxy_at_exit_handler) != 0) {
        LOG_ERROR("Failed to register atexit handler for Cloude cleanup");
    }
}

static void libcloude_bootstrap_cleanup(void)
{
    LOG_INFO("Unloading Cloude library...");

    if (h_xtst) dlclose(h_xtst);
    if (!b_has_loaded_cloude) return;

    stop_and_unload_cloude();
}
#endif
