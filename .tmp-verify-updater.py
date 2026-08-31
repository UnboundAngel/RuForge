import json
import urllib.request

u = json.load(
    urllib.request.urlopen(
        "https://raw.githubusercontent.com/UnboundAngel/RuForge/main/updater.json"
    )
)
s = u["platforms"]["windows-x86_64"]["signature"]
ok = (
    u["version"] == "0.4.0"
    and len(s) > 100
    and "http" not in s
    and ".sig" not in s
    and "\\" not in s
    and not s.startswith("/")
)
print(
    json.dumps(
        {
            "version": u["version"],
            "sigLen": len(s),
            "url": u["platforms"]["windows-x86_64"]["url"],
            "ok": ok,
        },
        indent=2,
    )
)
raise SystemExit(0 if ok else 1)
