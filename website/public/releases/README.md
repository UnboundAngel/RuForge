# Site-hosted Windows installer

Same-origin copy for `/download` progress streaming (GitHub `fetch` is CORS-blocked in the browser).

From repo root after a signed build:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File website/scripts/copy-installer-for-website.ps1
```

Or copy manually from `src-tauri/target/release/bundle/nsis/RuForge_<version>_x64-setup.exe` to this folder.

Upload with your Cloudflare Pages deploy. `*.exe` is gitignored here; drop the file in CI or before publish.

Without this file, `/download` still works: it falls back to a direct browser download from GitHub Releases (no progress bar).
