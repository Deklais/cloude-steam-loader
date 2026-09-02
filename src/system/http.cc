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

#include "cloude/http.h"
#include "cloude/cloude_lifecycle.h"
#include "cloude/config.h"
#include "cloude/crypto.h"
#include "cloude/logger.h"

#include <atomic>
#include <chrono>
#include <cstdio>
#include <stdexcept>
#include <thread>

static size_t WriteByteCallback(char* ptr, size_t size, size_t nmemb, std::string* data)
{
    data->append(ptr, size * nmemb);
    return size * nmemb;
}

static size_t WriteFileCallback(void* ptr, size_t size, size_t nmemb, void* userdata)
{
    auto* data = static_cast<DownloadData*>(userdata);
    size_t written = fwrite(ptr, size, nmemb, data->fp);
    data->downloaded += written * size;
    if (data->progressCallback) {
        data->progressCallback(data->downloaded, data->totalSize);
    }
    return written;
}

static std::string get_proxy_url()
{
    return CONFIG.get({ "network", "proxy" }, "").get<std::string>();
}

static void apply_proxy(CURL* curl)
{
    const std::string proxy = get_proxy_url();
    if (proxy.empty()) {
        return;
    }

    curl_easy_setopt(curl, CURLOPT_PROXY, proxy.c_str());

    const std::string username = CONFIG.get({ "network", "proxyUsername" }, "").get<std::string>();
    const std::string stored_pw = CONFIG.get({ "network", "proxyPassword" }, "").get<std::string>();

    if (!username.empty()) {
        const std::string password = Crypto::is_encrypted(stored_pw) ? Crypto::decrypt(stored_pw) : stored_pw;
        const std::string userpwd  = username + ":" + password;
        curl_easy_setopt(curl, CURLOPT_PROXYUSERPWD, userpwd.c_str());
    }
}

namespace Http
{

std::string Get(const char* url, bool retry, const long timeout)
{
    logger.warn("Network disabled: blocked HTTP GET request to {}", url ? url : "<null>");
    (void)retry;
    (void)timeout;
    throw HttpError("Network disabled in Cloude Steam Loader");
}

std::string Post(const char* url, const std::string& postData, bool retry)
{
    logger.warn("Network disabled: blocked HTTP POST request to {}", url ? url : "<null>");
    (void)postData;
    (void)retry;
    throw HttpError("Network disabled in Cloude Steam Loader");
}

void DownloadWithProgress(const std::tuple<std::string, size_t>& download_info, const std::filesystem::path& destPath, std::function<void(size_t, size_t)> progressCallback)
{
    const auto& [url, expectedSize] = download_info;
    logger.warn("Network disabled: blocked download request to {}", url);
    (void)expectedSize;
    (void)destPath;
    (void)progressCallback;
    throw HttpError("Network disabled in Cloude Steam Loader");
}

} // namespace Http
