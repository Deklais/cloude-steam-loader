# Cloude Steam Loader local-only report

This fork was changed into a minimal local-only Steam UI plugin loader.

## Changed files

- `src/system/http.cc`
- `src/engine/plugin_loader.cc`
- `src/lua_host/api/http.cc`
- `src/engine/cloude_updater.cc`
- `src/cloude.cc`
- `src/bindings/library_updater.cc`
- `src/bindings/plugin_mgr.cc`
- `src/bindings/theme_cfg.cc`
- `src/bindings/theme_mgr.cc`
- `src/bindings/entry_point.cc`
- `src/bindings/default_cfg.cc`
- `src/CMakeLists.txt`
- `src/typescript/frontend/index.tsx`
- `src/typescript/frontend/components/PluginCrashModal.tsx`
- `src/typescript/frontend/components/PluginInstaller.tsx`
- `src/typescript/frontend/settings/general/Installer.tsx`
- `src/typescript/frontend/settings/index.tsx`
- `src/typescript/frontend/settings/plugins/index.tsx`
- `src/typescript/frontend/settings/themes/ThemeComponent.tsx`
- `src/typescript/frontend/types/index.ts`
- `src/typescript/frontend/utils/globals.ts`
- `src/typescript/frontend/utils/index.tsx`
- `src/typescript/frontend/utils/update-bump.ts`
- `src/typescript/frontend/package.json`
- `examples/local-plugins/top-right-notifications/*`

## Network functions disabled

- C++ `Http::Get`, `Http::Post`, and `Http::DownloadWithProgress` now log a warning and throw.
- Lua plugin `http.request`, `http.get`, `http.post`, `http.put`, `http.delete`, and `http.download` now return `nil, "Network disabled in Cloude Steam Loader"`.
- Plugin backend RPC methods `http_request` and `http_download` are blocked in `plugin_loader`.
- Browser CSS/JS injection from plugin backends rejects payloads containing `http://` or `https://`.
- Cloude GitHub release checks and update downloads are blocked.
- Plugin/theme update checks against `steambrew.app` are blocked.
- Remote plugin install, remote plugin update, remote theme install, and remote theme update return safe errors.
- Frontend update notifications and the custom `steam://cloude/...` URL handler are disabled.
- Proxy/network settings default to disabled and are not shown in the simplified UI.

Local IPC sockets/WebSocket-style bridges are intentionally kept because they are required for the Steam UI, native backend, and local plugin host to communicate on the same machine.

## Local plugins folder

At runtime the loader reads local plugins from:

```text
CLOUDE__PLUGINS_PATH
```

The UI shows this path under `Settings` and opens it with `Open Plugins Folder`.

## Example local plugin

Example:

```text
examples/local-plugins/top-right-notifications
```

Name: `TopRight Notifications`

Description: `Moves Steam notification to top-right if possible`

It has no backend and does not call network APIs.

## Build

From a Visual Studio Developer PowerShell:

```powershell
cmake --preset windows-debug -DCLOUDE_BUILD_TO_STEAM_PATH=OFF -DCLOUDE_BUILD_TESTS=OFF -DMZ_LZMA=OFF -DMZ_ZSTD=OFF -DCURL_ZSTD=OFF
cmake --build build --parallel 8
```

If `cmake` resolves to MinGW/MSYS on this machine, use Visual Studio's CMake explicitly:

```powershell
& "C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe" --preset windows-debug -DCLOUDE_BUILD_TO_STEAM_PATH=OFF -DCLOUDE_BUILD_TESTS=OFF -DMZ_LZMA=OFF -DMZ_ZSTD=OFF -DCURL_ZSTD=OFF
& "C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe" --build build --parallel 8
```

## Rollback

To discard the local-only changes and return to the cloned upstream state:

```powershell
git restore .
git clean -fd examples/local-plugins LOCAL_ONLY_REPORT.md
```
