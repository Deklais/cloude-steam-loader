# Cloude Steam Loader

Cloude Steam Loader is an experimental, local-first plugin loader for the desktop Steam client. It injects local JavaScript and CSS plugins into Steam UI while keeping remote installers, automatic updates, and native backend HTTP disabled.

This snapshot targets Windows x64 and was tested with Steam client build `1788291500` from September 2026. Steam updates can change internal APIs, so keep a backup before replacing loader files.

## Highlights

- Loads plugins from `<Steam>\cloude\plugins`.
- Supports frontend-only JavaScript and CSS plugins.
- Keeps plugin and theme installation local.
- Blocks native remote installers, update downloads, and backend HTTP calls.
- Includes compatibility fixes for the current four-argument `CreateSimpleProcess` ABI and Steam's `BFinishedInitBeforeLogin` readiness API.

## Runtime layout

```text
Steam\
├── wsock32.dll                         # copy of cloude.bootstrap64.dll
└── cloude\
    ├── bin\
    │   ├── cloude.crashhandler64.exe
    │   └── cloude.luavm64.exe
    ├── config\
    ├── lib\
    │   ├── cloude.bootstrap64.dll
    │   ├── cloude.dll
    │   └── cloude.hhx64.dll
    ├── plugins\
    └── themes\
```

## Build on Windows

Requirements:

- Visual Studio 2022 with the C++ desktop workload;
- CMake and Ninja;
- Bun, used by the TypeScript build.

From a Visual Studio 2022 Developer PowerShell:

```powershell
cmake --preset windows-debug `
  -DCLOUDE_BUILD_TO_STEAM_PATH=OFF `
  -DCLOUDE_BUILD_TESTS=OFF `
  -DMZ_LZMA=OFF `
  -DMZ_ZSTD=OFF `
  -DCURL_ZSTD=OFF

cmake --build build --parallel 8
```

The five Windows runtime files are written to `build/`:

- `cloude.dll`
- `cloude.bootstrap64.dll`
- `cloude.hhx64.dll`
- `cloude.luavm64.exe`
- `cloude.crashhandler64.exe`

## Manual installation

1. Exit Steam completely.
2. Back up an existing `wsock32.dll` and `cloude` directory from the Steam folder.
3. Create the runtime layout shown above.
4. Copy `cloude.bootstrap64.dll` both to `cloude\lib` and to the Steam root as `wsock32.dll`.
5. Copy the other four build artifacts to their matching `bin` or `lib` directories.
6. Place local plugins in `cloude\plugins`, then start Steam.

Do not install the proxy DLL over an unrelated `wsock32.dll` without identifying and backing it up first.

## Project status

This is a source snapshot for local development, not an official Steam or Valve product. The loader relies on internal Steam interfaces and may require another compatibility update after a Steam client release.

The code is derived from the open-source [SteamClientHomebrew/Millennium](https://github.com/SteamClientHomebrew/Millennium) project and retains its MIT license and attribution.

## License

[MIT](LICENSE.md)
