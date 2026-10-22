import urllib.request
import json
import time
from backend.config import CONFIG

class ImmichService:
    def __init__(self):
        self._cache = []
        self._last_fetch = 0
        self._cache_ttl = 600  # 10 minutes

    @property
    def config(self):
        return CONFIG.get("immich", {})

    def is_enabled(self):
        cfg = self.config
        return bool(cfg.get("enabled", False) and cfg.get("server_url") and cfg.get("api_key"))

    def get_headers(self):
        api_key = self.config.get("api_key", "").strip()
        return {
            "x-api-key": api_key,
            "Accept": "application/json",
            "User-Agent": "OmniHub/1.0"
        }

    def fetch_photos(self, limit=60):
        """Fetches recent photos or album assets from the Immich server."""
        if not self.is_enabled():
            return []

        now = time.time()
        if self._cache and (now - self._last_fetch < self._cache_ttl):
            return self._cache

        server_url = self.config.get("server_url", "").rstrip("/")
        album_id = (self.config.get("album_id") or "").strip()
        headers = self.get_headers()
        assets = []

        # 1. If album_id is specified, fetch from album endpoint
        if album_id:
            for ep in (f"/api/albums/{album_id}", f"/api/album/{album_id}"):
                try:
                    req = urllib.request.Request(f"{server_url}{ep}", headers=headers)
                    with urllib.request.urlopen(req, timeout=6) as res:
                        data = json.loads(res.read().decode("utf-8"))
                        raw_assets = data.get("assets", [])
                        for a in raw_assets:
                            aid = a.get("id")
                            if aid:
                                assets.append({
                                    "id": aid,
                                    "url": f"/api/photos/immich/{aid}",
                                    "title": a.get("originalFileName", "Immich Photo")
                                })
                        if assets:
                            break
                except Exception as e:
                    print(f"[ImmichService] Album fetch from {ep} failed: {e}")

        # 2. If no album_id or album was empty, query metadata search or timeline
        if not assets:
            search_url = f"{server_url}/api/search/metadata"
            payload = json.dumps({"type": "IMAGE", "size": limit, "page": 1}).encode("utf-8")
            try:
                search_headers = dict(headers)
                search_headers["Content-Type"] = "application/json"
                req = urllib.request.Request(search_url, data=payload, headers=search_headers)
                with urllib.request.urlopen(req, timeout=6) as res:
                    data = json.loads(res.read().decode("utf-8"))
                    items = data.get("assets", {}).get("items", []) or data.get("items", [])
                    for a in items:
                        aid = a.get("id")
                        if aid:
                            assets.append({
                                "id": aid,
                                "url": f"/api/photos/immich/{aid}",
                                "title": a.get("originalFileName", "Immich Photo")
                            })
            except Exception as e:
                print(f"[ImmichService] Search metadata fetch failed: {e}")

        # 3. Fallback: query /api/asset
        if not assets:
            try:
                req = urllib.request.Request(f"{server_url}/api/asset", headers=headers)
                with urllib.request.urlopen(req, timeout=6) as res:
                    raw_list = json.loads(res.read().decode("utf-8"))
                    if isinstance(raw_list, list):
                        for a in raw_list[:limit]:
                            aid = a.get("id") if isinstance(a, dict) else a
                            if aid:
                                assets.append({
                                    "id": aid,
                                    "url": f"/api/photos/immich/{aid}",
                                    "title": "Immich Photo"
                                })
            except Exception as e:
                print(f"[ImmichService] /api/asset fallback failed: {e}")

        if assets:
            self._cache = assets
            self._last_fetch = now
            print(f"[ImmichService] Discovered {len(assets)} Immich photos.")

        return assets

    def proxy_asset(self, asset_id, size="preview"):
        """Proxies photo bytes from Immich directly to frontend to avoid CORS and API key exposure."""
        if not self.is_enabled():
            return None, None

        server_url = self.config.get("server_url", "").rstrip("/")
        headers = self.get_headers()

        # Try preview thumbnail first, fallback to original
        candidates = [
            f"{server_url}/api/assets/{asset_id}/thumbnail?size={size}",
            f"{server_url}/api/asset/thumbnail/{asset_id}?size={size}",
            f"{server_url}/api/assets/{asset_id}/original",
            f"{server_url}/api/asset/file/{asset_id}"
        ]

        for url in candidates:
            try:
                req = urllib.request.Request(url, headers=headers)
                with urllib.request.urlopen(req, timeout=8) as res:
                    content_type = res.headers.get("Content-Type", "image/jpeg")
                    return res.read(), content_type
            except Exception:
                continue

        return None, None

immich_service = ImmichService()
