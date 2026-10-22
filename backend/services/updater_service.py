import os
import sys
import time
import threading
import subprocess
import json
from backend.config import CONFIG
from backend.database import get_connection, backup_database, list_backups

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCRIPTS_DIR = os.path.join(BASE_DIR, "scripts")
UPDATE_SCRIPT = os.path.join(SCRIPTS_DIR, "update.sh")

class UpdaterService:
    def __init__(self):
        self.branch = CONFIG.get("updater", {}).get("branch", "main")
        self.interval = CONFIG.get("updater", {}).get("poll_interval_seconds", 120)
        self.auto_update = CONFIG.get("updater", {}).get("auto_update_enabled", True)

        self.state = {
            "current_commit": self._get_local_commit(),
            "remote_commit": None,
            "branch": self.branch,
            "last_checked_at": None,
            "last_updated_at": None,
            "is_updating": False,
            "update_available": False,
            "last_update_log": "",
            "frontend_reload_flag": False
        }

        self._thread = None
        self._running = False

    def start(self):
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._poll_loop, daemon=True)
        self._thread.start()
        print(f"[UpdaterService] Background GitHub watcher started (polling every {self.interval}s on branch '{self.branch}')")

    def _poll_loop(self):
        while self._running:
            try:
                self.check_for_updates()
                if self.auto_update and self.state["update_available"] and not self.state["is_updating"]:
                    print("[UpdaterService] Auto-update enabled and new commit detected. Triggering safe update...")
                    self.trigger_update()
            except Exception as e:
                print(f"[UpdaterService] Poll error: {e}")
            time.sleep(self.interval)

    def _get_local_commit(self):
        try:
            res = subprocess.run(
                ["git", "rev-parse", "HEAD"],
                cwd=BASE_DIR,
                capture_output=True,
                text=True,
                timeout=5
            )
            if res.returncode == 0:
                return res.stdout.strip()
        except Exception:
            pass
        return "development"

    def check_for_updates(self):
        self.state["current_commit"] = self._get_local_commit()
        self.state["last_checked_at"] = time.time()

        try:
            # Quick lightweight TLS handshake to check remote SHA without pulling
            res = subprocess.run(
                ["git", "ls-remote", "origin", f"refs/heads/{self.branch}"],
                cwd=BASE_DIR,
                capture_output=True,
                text=True,
                timeout=10
            )
            if res.returncode == 0 and res.stdout.strip():
                remote_sha = res.stdout.strip().split()[0]
                self.state["remote_commit"] = remote_sha
                self.state["update_available"] = (remote_sha != self.state["current_commit"])
            else:
                self.state["remote_commit"] = self.state["current_commit"]
                self.state["update_available"] = False
        except Exception as e:
            # Offline or origin not yet configured
            self.state["update_available"] = False

        return {
            "current_commit": self.state["current_commit"],
            "remote_commit": self.state["remote_commit"],
            "update_available": self.state["update_available"],
            "last_checked_at": self.state["last_checked_at"]
        }

    def trigger_update(self):
        if self.state["is_updating"]:
            return {"status": "in_progress", "message": "An update is already running."}

        self.state["is_updating"] = True
        print("[UpdaterService] Starting atomic update workflow...")

        def run_update():
            try:
                cmd = [UPDATE_SCRIPT, "--force"]
                res = subprocess.run(
                    cmd,
                    cwd=BASE_DIR,
                    capture_output=True,
                    text=True,
                    timeout=120
                )
                output = res.stdout + "\n" + res.stderr
                self.state["last_update_log"] = output
                print(f"[UpdaterService] Update output:\n{output}")

                if res.returncode == 0:
                    self.state["current_commit"] = self._get_local_commit()
                    self.state["update_available"] = False
                    self.state["last_updated_at"] = time.time()
                    self.state["frontend_reload_flag"] = True
                    self._record_history("success", "Update succeeded", self.state["current_commit"])
                    self.schedule_restart(delay_seconds=1.5)
                else:
                    self._record_history("failed", "Update script returned error", self.state["current_commit"])
            except Exception as e:
                self.state["last_update_log"] = str(e)
                self._record_history("error", str(e), self.state["current_commit"])
            finally:
                self.state["is_updating"] = False

        # Run in separate thread to prevent blocking HTTP requests
        t = threading.Thread(target=run_update, daemon=True)
        t.start()

        return {
            "status": "started",
            "message": "Update and database migration initiated in background."
        }

    def _record_history(self, status, message, commit_hash):
        try:
            conn = get_connection()
            c = conn.cursor()
            c.execute("""
                INSERT INTO system_updates (commit_hash, branch, status, message, timestamp)
                VALUES (?, ?, ?, ?, ?)
            """, (commit_hash, self.branch, status, message, time.time()))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"[UpdaterService] Could not log history: {e}")

    def get_status(self):
        return {
            "current_commit": self.state["current_commit"],
            "remote_commit": self.state["remote_commit"],
            "branch": self.branch,
            "update_available": self.state["update_available"],
            "is_updating": self.state["is_updating"],
            "last_checked_at": self.state["last_checked_at"],
            "last_updated_at": self.state["last_updated_at"],
            "poll_interval_seconds": self.interval,
            "auto_update_enabled": self.auto_update,
            "backups_available": len(list_backups())
        }

    def consume_reload_flag(self):
        flag = self.state["frontend_reload_flag"]
        self.state["frontend_reload_flag"] = False
        return flag

    def schedule_restart(self, delay_seconds=1.5):
        def _restart():
            time.sleep(delay_seconds)
            print("[UpdaterService] Shutting down and redeploying OmniHub...")
            try:
                res = subprocess.run(["systemctl", "--user", "is-active", "--quiet", "omnihub.service"], capture_output=True)
                if res.returncode == 0:
                    subprocess.run(["systemctl", "--user", "restart", "omnihub.service"])
                    return
            except Exception:
                pass
            os.execv(sys.executable, [sys.executable] + sys.argv)

        threading.Thread(target=_restart, daemon=True).start()

updater_service = UpdaterService()
