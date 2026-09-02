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

#include "state/shared_memory.h"
#include "head/default_cfg.h"

#include "cloude/health_check.h"
#include "cloude/plugin_loader.h"
#include "cloude/logger.h"
#include "cloude/cloude_updater.h"
#include "cloude/cloude.h"
#include "mep/mep_hooks.h"

std::unique_ptr<cloude> g_cloude;

cloude::cloude() : m_mep_server(m_mep_router)
{
    m_plugin_manager = std::make_shared<plugin_manager>();
    m_cloude_updater = std::make_shared<cloude_updater>();
    m_plugin_loader = std::make_shared<plugin_loader>(m_plugin_manager, m_cloude_updater);

    mep::register_mep_handlers(m_mep_router, m_plugin_loader);

    logger.warn("Cloude Steam Loader: network updates and remote installers are disabled.");
}

std::shared_ptr<plugin_loader> cloude::get_plugin_loader()
{
    return this->m_plugin_loader;
}

void cloude::check_for_updates()
{
    logger.warn("Network disabled: Cloude update check blocked.");
}

/**
 * Cloude main entry point.
 * This entry point is called on posix and windows.
 */
void cloude::entry()
{
    platform::shared_memory::init();
    platform::health::check_health();

    m_mep_server.start();

    m_plugin_loader->start_plugin_backends();
    m_plugin_loader->start_plugin_frontends();

    /** shutdown Cloude */
    m_plugin_loader->shutdown();
    m_mep_server.stop();
}
