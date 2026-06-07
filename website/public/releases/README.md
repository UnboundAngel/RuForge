# Site-hosted Windows installer

Same-origin copy for `/download` progress streaming (GitHub `fetch` is CORS-blocked in the browser).

From repo root after a signed build:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File website/scripts/copy-installer-for-website.ps1
```

Or copy manually from `src-tauri/target/release/bundle/nsis/RuForge_<version>_x64-setup.exe` to this folder.

Upload with your Cloudflare Pages deploy. `*.exe` is gitignored here; drop the file in CI or before publish.

Without this file, `/download` must fall back to GitHub: the host SPA may return **200 HTML** for `/releases/*.exe` (saved as a corrupt ~200 KB “installer”). Run `copy-installer-for-website.ps1` before each deploy that should stream from same-origin.
