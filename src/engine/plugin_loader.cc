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

#include "cloude/cloude_lifecycle.h"
#include "cloude/core_ipc.h"
#include "cloude/plugin_config.h"
#include "cloude/life_cycle.h"
#include "cloude/cloude_updater.h"
#include "cloude/filesystem.h"
#include "cloude/plugin_manager.h"
#include "cloude/steam_hooks.h"
#include "cloude/types.h"
#include "cloude/plugin_loader.h"
#include "cloude/plugin_ipc.h"
#include "cloude/url_parser.h"
#include "cloude/backend_init.h"
#include "cloude/backend_mgr.h"
#include "cloude/environment.h"
#include "cloude/http_hooks.h"
#include "cloude/logger.h"
#include "cloude/plugin_webkit_store.h"
#include "cloude/semver.h"
#include "cloude/auth.h"

#include "state/shared_memory.h"

#include "mep/console_capture.h"
#include "mep/exception_capture.h"
#include "mep/crash_event_bus.h"

#include "head/entry_point.h"

#include <curl/curl.h>
#include <algorithm>
#include <cctype>
#include <format>

namespace
{
template <typename Range> std::string join_strings(const Range& items, std::string_view sep)
{
    std::string out;
    bool first = true;
    for (const auto& item : items) {
        if (!first) out += sep;
        out += item;
        first = false;
    }
    return out;
}

bool contains_remote_url(std::string_view value)
{
    auto lower = std::string(value);
    std::transform(lower.begin(), lower.end(), lower.begin(), [](unsigned char c)
    {
        return static_cast<char>(std::tolower(c));
    });
    return lower.find("http://") != std::string::npos || lower.find("https://") != std::string::npos;
}
} // namespace

#ifdef __linux__
#include <mutex>
#include <condition_variable>
extern std::mutex g_cdp_pipe_mutex;
extern std::condition_variable g_cdp_pipe_cv;
extern int g_cdp_pipe_generation;
#endif

using namespace std::placeholders;
using namespace std::chrono;

plugin_loader::plugin_loader(std::shared_ptr<plugin_manager> plugin_manager, std::shared_ptr<cloude_updater> cloude_updater)
    : m_thread_pool(std::make_unique<thread_pool>(2)), m_plugin_manager(std::move(plugin_manager)), m_plugin_ptr(nullptr), m_enabledPluginsPtr(nullptr),
      m_cloude_updater(std::move(cloude_updater))
{
    logger.log("Initializing plugin_loader...");
    this->init();
}

plugin_loader::~plugin_loader() = default;

void plugin_loader::shutdown()
{
    if (m_crash_listener_id >= 0) {
        mep::crash_event_bus::instance().remove_listener(m_crash_listener_id);
        m_crash_listener_id = -1;
    }
    if (m_backend_manager) {
        m_backend_manager->shutdown();
    }
    logger.log("Successfully shut down plugin_loader...");
}

static std::string make_crash_js(const mep::crash_event& ev)
{
    const json detail = {
        { "plugin",       ev.plugin_name                                             },
        { "displayName",  ev.display_name.empty() ? ev.plugin_name : ev.display_name },
        { "exitCode",     (uint32_t)ev.exit_code                                     },
        { "crashDumpDir", ev.crash_dump_dir                                          }
    };
    return std::format("window.dispatchEvent(new CustomEvent('cloude-plugin-crash',{{detail:{}}}));", detail.dump());
}

void plugin_loader::devtools_connection_hdlr(std::shared_ptr<cdp_client> cdp)
{
    m_cdp = cdp;
    m_socket_con_time = std::chrono::system_clock::now();

    m_network_hook_ctl->set_cdp_client(m_cdp);
    m_network_hook_ctl->init();
    m_ipc_main = std::make_shared<ipc_main>(m_cloude_backend, m_plugin_manager, m_cdp, m_backend_manager);

    m_cloude_updater->set_ipc_main(m_ipc_main);
    m_cloude_backend->set_ipc_main(m_ipc_main);

    mep::console_capture::instance().start(m_cdp, m_plugin_manager);
    mep::exception_capture::instance().start(m_cdp, m_plugin_manager);

    m_thread_pool->enqueue([this]()
    {
        logger.log("Starting webkit world manager...");

        this->m_ffi_binder = std::make_unique<ffi_binder>(m_cdp, m_plugin_manager, m_ipc_main);
        this->world_mgr = std::make_unique<webkit_world_mgr>(m_cdp, m_plugin_manager, m_network_hook_ctl, m_plugin_webkit_store);
    });

    m_thread_pool->enqueue([this]()
    {
        logger.log("Connected to Steam devtools protocol...");
        this->init_devtools();

        if (m_crash_listener_id >= 0) {
            mep::crash_event_bus::instance().remove_listener(m_crash_listener_id);
        }

        std::weak_ptr<ipc_main> weak_ipc = m_ipc_main;
        std::weak_ptr<plugin_manager> weak_pm = m_plugin_manager;
        m_crash_listener_id = mep::crash_event_bus::instance().add_listener([weak_ipc, weak_pm](mep::crash_event ev)
        {
            if (ev.display_name.empty()) {
                if (auto pm = weak_pm.lock()) {
                    for (const auto& p : pm->get_all_plugins()) {
                        if (p.plugin_name == ev.plugin_name) {
                            ev.display_name = p.plugin_json.value("common_name", ev.plugin_name);
                            break;
                        }
                    }
                }
                if (ev.display_name.empty()) ev.display_name = ev.plugin_name;
            }

            auto ipc = weak_ipc.lock();
            if (!ipc) return;
            ipc->evaluate_javascript_expression(make_crash_js(ev));
        });
    });
}

void plugin_loader::init()
{
    m_network_hook_ctl = std::make_shared<network_hook_ctl>(m_plugin_manager);

    m_cloude_backend = std::make_shared<head::cloude_backend>(m_network_hook_ctl, m_plugin_manager, m_cloude_updater);
    m_cloude_backend->init(); /** manual ctor, shared_from_this requires a ref holder before its valid */

    m_backend_event_dispatcher = std::make_shared<backend_event_dispatcher>(m_plugin_manager);
    m_backend_manager = std::make_shared<backend_manager>(m_plugin_manager, m_backend_event_dispatcher);
    m_backend_initializer = std::make_shared<backend_initializer>(m_plugin_manager, m_backend_manager, m_backend_event_dispatcher);

    m_plugin_webkit_store = std::make_shared<plugin_webkit_store>(m_plugin_manager);
    m_plugin_ptr = std::make_shared<std::vector<plugin_manager::plugin_t>>(m_plugin_manager->get_all_plugins());
    m_enabledPluginsPtr = std::make_shared<std::vector<plugin_manager::plugin_t>>(m_plugin_manager->get_enabled_backends());

    m_plugin_manager->init();

    /** setup steam hooks once backends have loaded */
    m_backend_event_dispatcher->on_all_backends_ready(platform::wait_for_backend_load);
}
void plugin_loader::init_devtools()
{
    constexpr auto targetFrame = "SharedJSContext";
    int attempts = 0;

    while (true) {
        auto targets = m_cdp->send_host("Target.getTargets").get();

        if (targets.contains("targetInfos") && targets["targetInfos"].is_array() && !targets["targetInfos"].empty()) {
            auto it = std::find_if(targets["targetInfos"].begin(), targets["targetInfos"].end(), [&](const auto& target)
            {
                return target.value("title", "") == targetFrame;
            });

            if (it != targets["targetInfos"].end()) {
                auto targetId = it->at("targetId").get<std::string>();
                m_shared_js_target_id = targetId;

                const json attach_params = {
                    { "targetId", targetId },
                    { "flatten",  true     }
                };

                auto result = m_cdp->send_host("Target.attachToTarget", attach_params).get();
                /** set the session ID of the SharedJSContext */
                m_cdp->set_shared_js_session_id(result.at("sessionId").get<std::string>());

                break;
            }
        }

        if (attempts++ % 20 == 0) {
            logger.warn("SharedJSContext not found yet, waiting... (attempt {})", attempts);
        }

        std::this_thread::sleep_for(std::chrono::milliseconds(250));
    }

    m_thread_pool->enqueue([this]()
    {
        logger.log("Connected to SharedJSContext in {} ms", duration_cast<milliseconds>(system_clock::now() - m_socket_con_time).count());
        this->inject_frontend_shims(true /** reload SharedJSContext */);
    });
}

std::shared_ptr<std::thread> plugin_loader::connect_steam_socket(std::shared_ptr<socket_utils> socketHelpers)
{
    std::shared_ptr<socket_utils::socket_t> browserProps = std::make_shared<socket_utils::socket_t>();

    browserProps->name = "CEFBrowser";
    browserProps->on_connect = [this](std::shared_ptr<cdp_client> cdp)
    {
        this->devtools_connection_hdlr(std::move(cdp));
    };
    return std::make_shared<std::thread>(std::thread([ptrSocketHelpers = socketHelpers, browserProps]
    {
        ptrSocketHelpers->connect_socket(browserProps);
    }));
}

void plugin_loader::setup_webkit_shims()
{
    logger.log("Injecting webkit shims...");
    m_plugin_webkit_store->clear();

    const auto plugins = this->m_plugin_manager->get_all_plugins();

    for (auto& plugin : plugins) {
        const auto abs_path = std::filesystem::path(platform::environment::get("CLOUDE__PLUGINS_PATH")) / plugin.plugin_webkit_path;
        if (this->m_plugin_manager->is_enabled(plugin.plugin_name) && std::filesystem::exists(abs_path)) {
            m_plugin_webkit_store->add({ plugin.plugin_name, abs_path });
        }
    }
}

std::string plugin_loader::cdp_generate_bootstrap_module(const std::vector<std::string>& modules)
{
    const std::string preload_path = platform::get_cloude_preload_path();
    const std::string ftp_path = m_network_hook_ctl->get_ftp_url() + preload_path;
    const std::string module_list = std::format(R"("{}")", join_strings(modules, R"(", ")"));

    return std::format("import('{}').then(m => (new m.default).startClient('{}', [{}]))", ftp_path, CLOUDE_VERSION, module_list);
}

std::string plugin_loader::cdp_generate_shim_module()
{
    std::vector<std::string> script_list;
    std::vector<plugin_manager::plugin_t> plugins = m_plugin_manager->get_all_plugins();

    /** Add the builtin Cloude plugin first so it starts loading before all others */
    script_list.push_back(std::format("{}{}/cloude-frontend.js", m_network_hook_ctl->get_ftp_url(), GetScrambledApiPathToken()));

    for (auto& plugin : plugins) {
        if (!m_plugin_manager->is_enabled(plugin.plugin_name)) {
            continue;
        }

        const auto frontEndAbs = plugin.plugin_frontend_dir.generic_string();
        script_list.push_back(utils::url::get_url_from_path(m_network_hook_ctl->get_ftp_url(), frontEndAbs));
    }
    return this->cdp_generate_bootstrap_module(script_list);
}

void plugin_loader::inject_frontend_shims(bool reload_frontend)
{
    this->setup_webkit_shims();
    auto self = this->shared_from_this();

    /**
     * add the initial binding for the shared js context.
     * the rest is handled by the ffi_binder.
     */
    const auto insert_ipc = std::make_shared<std::function<void()>>([self]()
    {
        self->m_cdp->send("Runtime.enable").get();

        const json add_binding_params = {
            { "name", ffi_constants::binding_name }
        };
        self->m_cdp->send("Runtime.addBinding", add_binding_params).get();

        const json add_extension_binding_params = {
            { "name", ffi_constants::extension_binding_name }
        };
        self->m_cdp->send("Runtime.addBinding", add_extension_binding_params).get();

        const json add_cdp_proxy_params = {
            { "name", ffi_constants::cdp_proxy_binding_name }
        };
        self->m_cdp->send("Runtime.addBinding", add_cdp_proxy_params).get();

        /** create an isolated world per enabled plugin and inject the CDP context script */
        const std::string isolated_ctx_script = get_cdp_isolated_ctx_script();
        const std::string shared_js_session = self->m_cdp->get_shared_js_session_id();

        if (!isolated_ctx_script.empty()) {
            const auto plugins = self->m_plugin_manager->get_enabled_plugins();
            for (const auto& plugin : plugins) {
                try {
                    auto frame_result = self->m_cdp->send("Page.getFrameTree").get();
                    const std::string frame_id = frame_result["frameTree"]["frame"]["id"].get<std::string>();

                    const json create_world_params = {
                        { "frameId", frame_id },
                        { "worldName", std::format("cloude-{}", plugin.plugin_name) },
                        { "grantUniversalAccess", false }
                    };
                    auto world_result = self->m_cdp->send("Page.createIsolatedWorld", create_world_params).get();
                    const int ctx_id = world_result["executionContextId"].get<int>();

                    const json eval_params = {
                        { "expression", isolated_ctx_script },
                        { "contextId",  ctx_id              }
                    };
                    self->m_cdp->send("Runtime.evaluate", eval_params).get();

                    if (self->m_ffi_binder) {
                        self->m_ffi_binder->register_isolated_ctx(plugin.plugin_name, ctx_id, shared_js_session);
                    }

                    logger.log("Created isolated CDP world for plugin '{}' (ctx {})", plugin.plugin_name, ctx_id);
                } catch (const std::exception& e) {
                    LOG_ERROR("Failed to create isolated world for plugin '{}': {}", plugin.plugin_name, e.what());
                }
            }
        }

        logger.log("Frontend notifier finished!");
    });

    /**
     * reload the frontend of Steam if need be.
     * sometimes we need to queue a change instead of instantly applying it.
     */
    const auto reload = std::make_shared<std::function<void()>>([reload_frontend, self]()
    {
        json reload_params = {
            { "ignoreCache", true }
        };

        if (reload_frontend) {
            json result;
            do {
                result = self->m_cdp->send("Page.reload", reload_params).get();
            }
            /** empty means it was successful */
            while (!result.empty());
        }
    });

    /**
     * tell chromium to run Cloude's frontend every time a new document is loaded.
     */
    const auto insert_cloude = std::make_shared<std::function<void()>>([self]()
    {
        self->m_cdp->send("Page.enable").get();

        if (!self->document_script_id.empty()) {
            const json params = {
                { "identifier", self->document_script_id }
            };

            self->m_cdp->send("Page.removeScriptToEvaluateOnNewDocument", params).get();
            self->document_script_id.clear();
        }

        json params = {
            { "source", self->cdp_generate_shim_module() }
        };

        constexpr int max_retries = 3;
        for (int attempt = 0; attempt < max_retries; ++attempt) {
            try {
                auto result = self->m_cdp->send("Page.addScriptToEvaluateOnNewDocument", params).get();

                if (!result.contains("identifier") || !result["identifier"].is_string()) {
                    LOG_ERROR("Page.addScriptToEvaluateOnNewDocument returned unexpected result: {}", result.dump());
                    continue;
                }

                self->document_script_id = result["identifier"].get<std::string>();
                return;
            } catch (const std::exception& e) {
                LOG_ERROR("Page.addScriptToEvaluateOnNewDocument failed (attempt {}/{}): {}", attempt + 1, max_retries, e.what());
            }

            std::this_thread::sleep_for(std::chrono::milliseconds(250));
        }

        LOG_ERROR("Failed to register SDK script after {} attempts — frontend will not load", max_retries);
    });

    /**
     * wait for cloude to finish starting the plugin backends
     * we garunetee the backends will be loaded before the plugin, so
     * we need to enforce that here.
     */
    m_backend_event_dispatcher->on_all_backends_ready([insert_cloude, reload, insert_ipc, self]()
    {
        logger.log("Notifying frontend of backend load...");
        self->m_backend_initializer->compat_restore_shared_js_context();

        (*insert_ipc)();
        (*insert_cloude)();
        (*reload)();
    });
}

void plugin_loader::start_plugin_frontends()
{
    if (cloude_lifecycle::get().terminate.flag.load()) {
        logger.log("Terminating frontend thread pool...");
        return;
    }

#ifdef __linux__
    /** snapshot generation before connecting so we can detect a new pipe on reconnect. */
    int generation_before_connect;
    {
        std::lock_guard<std::mutex> lock(g_cdp_pipe_mutex);
        generation_before_connect = g_cdp_pipe_generation;
    }
#endif

    std::shared_ptr<socket_utils> helper = std::make_shared<socket_utils>();
    logger.log("Starting frontend socket...");
    std::shared_ptr<std::thread> socket_thread = this->connect_steam_socket(helper);

    if (socket_thread->joinable()) {
        socket_thread->join();
    }

    if (cloude_lifecycle::get().terminate.flag.load()) {
        logger.log("Steam is shutting down, terminating frontend thread pool...");
        return;
    }

    logger.warn("Unexpectedly Disconnected from Steam, attempting to reconnect...");

#ifdef _WIN32
    {
        auto start = std::chrono::steady_clock::now();
        while (std::chrono::steady_clock::now() - start < std::chrono::seconds(10)) {
            if (cloude_lifecycle::get().disconnect_frontend.load()) {
                logger.log("Steam is shutting down, terminating frontend thread pool...");
                return;
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }
    }
#elif __linux__
    {
        std::unique_lock<std::mutex> lock(g_cdp_pipe_mutex);
        g_cdp_pipe_cv.wait(lock, [&generation_before_connect]
        {
            return g_cdp_pipe_generation > generation_before_connect || cloude_lifecycle::get().terminate.flag.load();
        });
    }

    if (cloude_lifecycle::get().terminate.flag.load()) {
        logger.log("Steam is shutting down, terminating frontend thread pool...");
        return;
    }
#endif

    logger.warn("Reconnecting to Steam...");
    this->start_plugin_frontends();
}

/* debug function, just for developers */
void plugin_loader::log_enabled_plugins()
{
    std::vector<std::string> statuses;
    statuses.reserve(m_plugin_ptr->size());

    for (const auto& plugin : *m_plugin_ptr) {
        statuses.push_back(std::format("{}: {}", plugin.plugin_name, m_plugin_manager->is_enabled(plugin.plugin_name) ? "enabled" : "disabled"));
    }

    logger.log("Plugins: {{ {} }}", join_strings(statuses, ", "));
}

void plugin_loader::setup_child_request_handler()
{
    std::weak_ptr<plugin_loader> weak_self = weak_from_this();

    m_backend_manager->set_child_request_handler([weak_self](const std::string& plugin_name, const std::string& method, const nlohmann::json& params) -> nlohmann::json
    {
        auto self = weak_self.lock();
        if (!self) {
            return {
                { "error", "plugin_loader shutting down" }
            };
        }

        if (method == plugin_ipc::child_method::CALL_FRONTEND_METHOD) {
            auto ipc = self->m_ipc_main;
            if (!ipc) {
                return {
                    { "success", false                        },
                    { "error",   "frontend not connected yet" }
                };
            }

            /* child sends {methodName, params}, but process_message expects
               {pluginName, methodName, argumentList} under "data" */
            nlohmann::json data = {
                { "pluginName", plugin_name },
                { "methodName", params.value("methodName", "") },
                { "argumentList", params.contains("params") ? params["params"] : nlohmann::json::array() },
                { "caller", params.value("caller", std::string{}) }
            };

            nlohmann::json call = {
                { "id",   ipc_main::ipc_method::CALL_FRONTEND_METHOD },
                { "data", data                                       }
            };
            return ipc->process_message(call);
        }

        if (method == plugin_ipc::child_method::READY) {
            auto dispatcher = self->m_backend_event_dispatcher;
            if (dispatcher) {
                dispatcher->backend_loaded_event_hdlr({ plugin_name, backend_event_dispatcher::backend_ready_event::BACKEND_LOAD_SUCCESS });
            }
            return {
                { "success", true }
            };
        }

        if (method == plugin_ipc::child_method::ADD_BROWSER_CSS || method == plugin_ipc::child_method::ADD_BROWSER_JS) {
            auto backend = self->m_cloude_backend;
            if (!backend) {
                return {
                    { "error", "backend not available" }
                };
            }
            auto webkit_mgr = backend->get_theme_webkit_mgr().lock();
            if (!webkit_mgr) {
                return {
                    { "error", "webkit_mgr not available" }
                };
            }
            const std::string content = params.value("content", "");
            const std::string pattern = params.value("pattern", ".*");
            if (contains_remote_url(content)) {
                logger.warn("Network disabled: blocked remote URL inside browser {} injection from plugin '{}'",
                            method == plugin_ipc::child_method::ADD_BROWSER_CSS ? "CSS" : "JS", plugin_name);
                return {
                    { "error", "Network disabled: browser CSS/JS may only use local resources" }
                };
            }
            auto type = (method == plugin_ipc::child_method::ADD_BROWSER_CSS) ? network_hook_ctl::TagTypes::STYLESHEET : network_hook_ctl::TagTypes::JAVASCRIPT;
            auto id = webkit_mgr->add_browser_hook(content, pattern, type);
            return {
                { "id", id }
            };
        }

        if (method == plugin_ipc::child_method::REMOVE_BROWSER_MODULE) {
            auto backend = self->m_cloude_backend;
            if (!backend) {
                return {
                    { "error", "backend not available" }
                };
            }
            auto webkit_mgr = backend->get_theme_webkit_mgr().lock();
            if (!webkit_mgr) {
                return {
                    { "error", "webkit_mgr not available" }
                };
            }
            const auto hook_id = params.value("hook_id", 0ULL);
            const bool ok = webkit_mgr->remove_browser_hook(hook_id);
            return {
                { "success", ok }
            };
        }

        if (method == plugin_ipc::child_method::LOG) {
            const std::string level = params.is_object() ? params.value("level", "info") : "info";
            const std::string message = params.is_object() ? params.value("message", "") : "";

            if (level == "error")
                ErrorToLogger(plugin_name, message);
            else if (level == "warn")
                WarnToLogger(plugin_name, message);
            else
                InfoToLogger(plugin_name, message);

            return {
                { "success", true }
            };
        }

        if (method == plugin_ipc::child_method::VERSION) {
            return {
                { "version", CLOUDE_VERSION }
            };
        }

        if (method == plugin_ipc::child_method::STEAM_PATH) {
            try {
                return {
                    { "path", platform::get_steam_path().string() }
                };
            } catch (const std::exception& e) {
                return {
                    { "path",  ""       },
                    { "error", e.what() }
                };
            }
        }

        if (method == plugin_ipc::child_method::INSTALL_PATH) {
            try {
                return {
                    { "path", platform::get_install_path().string() }
                };
            } catch (const std::exception& e) {
                return {
                    { "path",  ""       },
                    { "error", e.what() }
                };
            }
        }

        if (method == plugin_ipc::child_method::IS_PLUGIN_ENABLED) {
            const std::string name = params.value("name", "");
            auto pm = self->m_plugin_manager;
            if (!pm) {
                return {
                    { "enabled", false }
                };
            }
            try {
                return {
                    { "enabled", pm->is_enabled(name) }
                };
            } catch (const std::exception&) {
                return {
                    { "enabled", false }
                };
            }
        }

        if (method == plugin_ipc::child_method::CMP_VERSION) {
            const std::string v1 = params.value("v1", "");
            const std::string v2 = params.value("v2", "");
            const char* s1 = v1.c_str();
            const char* s2 = v2.c_str();
            if (s1[0] == 'v' || s1[0] == 'V') s1++;
            if (s2[0] == 'v' || s2[0] == 'V') s2++;
            try {
                return {
                    { "result", semver::cmp(s1, s2) }
                };
            } catch (const std::exception&) {
                return {
                    { "result", -2 }
                };
            }
        }

        if (method == plugin_ipc::child_method::HTTP_REQUEST) {
            const std::string url = params.value("url", "");
            logger.warn("Network disabled: blocked plugin '{}' HTTP request to {}", plugin_name, url);
            return {
                { "error", "Network disabled in Cloude Steam Loader" }
            };
        }

        if (method == plugin_ipc::child_method::HTTP_DOWNLOAD) {
            const std::string url = params.value("url", "");
            const std::string dest = params.value("path", "");
            logger.warn("Network disabled: blocked plugin '{}' HTTP download from {} to {}", plugin_name, url, dest);
            return {
                { "error", "Network disabled in Cloude Steam Loader" }
            };
        }

        if (method == plugin_ipc::child_method::CONFIG_GET) {
            auto r = plugin_config::get(plugin_name, params.value("key", ""));
            return r.success ? json{{ "value", r.value }} : json{{ "error", r.value }};
        }

        if (method == plugin_ipc::child_method::CONFIG_SET) {
            auto ipc = self->m_ipc_main;
            plugin_config::notify_targets targets{ ipc ? plugin_config::eval_js_fn(
                                                             [ipc](const std::string& s)
            {
                ipc->evaluate_javascript_expression(s);
            })
                                                       : plugin_config::eval_js_fn{},
                                                   {} };
            json value = params.contains("value") ? params["value"] : json(nullptr);
            auto r = plugin_config::set(targets, plugin_config::origin::lua_child, plugin_name, params.value("key", ""), value);
            return r.success ? json{{ "success", true }} : json{{ "error", r.value }};
        }

        if (method == plugin_ipc::child_method::CONFIG_DELETE) {
            auto ipc = self->m_ipc_main;
            plugin_config::notify_targets targets{ ipc ? plugin_config::eval_js_fn(
                                                             [ipc](const std::string& s)
            {
                ipc->evaluate_javascript_expression(s);
            })
                                                       : plugin_config::eval_js_fn{},
                                                   {} };
            auto r = plugin_config::del(targets, plugin_config::origin::lua_child, plugin_name, params.value("key", ""));
            return r.success ? json{{ "success", true }} : json{{ "error", r.value }};
        }

        if (method == plugin_ipc::child_method::CONFIG_GET_ALL) {
            auto r = plugin_config::get_all(plugin_name);
            return {
                { "config", r.value }
            };
        }

        if (method == plugin_ipc::child_method::PATCHES) {
            const auto& patches = params.is_object() ? params["patches"] : params;

            if (g_lb_patch_arena && patches.is_array() && !patches.empty()) {
                auto* patch_list = hashmap_add_key(g_lb_patch_arena, plugin_name.c_str());

                for (const auto& p : patches) {
                    const std::string file = p.value("file", "");
                    const std::string find = p.value("find", "");
                    auto* patch = patchlist_add(g_lb_patch_arena, patch_list, file.c_str(), find.c_str());

                    if (p.contains("transforms") && p["transforms"].is_array()) {
                        for (const auto& t : p["transforms"]) {
                            const std::string match = t.value("match", "");
                            const std::string replace = t.value("replace", "");
                            patch_add_transform(g_lb_patch_arena, patch, match.c_str(), replace.c_str());
                        }
                    }
                }
            }

            return {
                { "success", true }
            };
        }

        return {
            { "error", "unknown method: " + method }
        };
    });
}

void plugin_loader::start_plugin_backends()
{
    /* has to be called here and not from init() — weak_from_this() returns an
       empty weak_ptr when called from the constructor, before make_shared finishes. */
    if (!m_child_handler_installed) {
        logger.log("Setting up child request handler");
        this->setup_child_request_handler();
        logger.log("Done!");
        m_child_handler_installed = true;
    }

    this->log_enabled_plugins();

    for (auto& plugin : *m_enabledPluginsPtr) {
        if (m_backend_manager->is_any_backend_running(plugin.plugin_name)) {
            continue;
        }

        m_backend_manager->spawn_plugin(plugin);
    }
}
void plugin_loader::set_plugin_enable(std::string plugin_name, bool enabled)
{
    this->set_plugins_enabled({ std::make_pair(plugin_name, enabled) });
}

void plugin_loader::set_plugins_enabled(const std::vector<std::pair<std::string, bool>>& plugins)
{
    bool should_start_backends = false;
    std::vector<std::string> plugins_to_disable;

    for (const auto& [name, enabled] : plugins) {
        m_plugin_manager->set_plugin_enabled(name.c_str(), enabled);
        logger.log("requested to {} plugin [{}]", enabled ? "enable" : "disable", name);

        if (enabled) {
            should_start_backends = true;
        } else {
            plugins_to_disable.push_back(name);
        }
    }

    /** destroy all plugins that need to be disabled */
    for (const auto& name : plugins_to_disable) {
        m_backend_manager->destroy_plugin(name);
        mep::crash_event_bus::instance().acknowledge_crash(name);
    }

    /* Refresh stale snapshots so start_plugin_backends() and log_enabled_plugins()
       see the updated enabled-plugin list rather than the init()-time snapshot. */
    *m_plugin_ptr = m_plugin_manager->get_all_plugins();
    *m_enabledPluginsPtr = m_plugin_manager->get_enabled_backends();

    /** only spawn the plugins that were just enabled — not all non-running
        enabled plugins.  start_plugin_backends() would re-spawn crashed plugins
        that the user didn't ask to restart. */
    if (should_start_backends) {
        if (!m_child_handler_installed) {
            this->setup_child_request_handler();
            m_child_handler_installed = true;
        }
        this->log_enabled_plugins();

        for (const auto& [name, enabled] : plugins) {
            if (!enabled) continue;
            if (m_backend_manager->is_any_backend_running(name)) continue;

            for (auto& plugin : *m_enabledPluginsPtr) {
                if (plugin.plugin_name == name) {
                    m_backend_manager->spawn_plugin(plugin);
                    break;
                }
            }
        }
    }

    inject_frontend_shims(true);
}

std::shared_ptr<ipc_main> plugin_loader::get_ipc_main()
{
    return m_ipc_main;
}

std::shared_ptr<backend_manager> plugin_loader::get_backend_manager()
{
    return m_backend_manager;
}

std::shared_ptr<backend_event_dispatcher> plugin_loader::get_backend_event_dispatcher()
{
    return m_backend_event_dispatcher;
}

std::shared_ptr<head::cloude_backend> plugin_loader::get_cloude_backend()
{
    return this->m_cloude_backend;
}

std::shared_ptr<plugin_manager> plugin_loader::get_plugin_manager()
{
    return this->m_plugin_manager;
}
