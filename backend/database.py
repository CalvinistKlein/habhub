import os
import sys
import sqlite3
import json
import time
import shutil
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "omnihub.db")
BACKUP_DIR = os.path.join(DATA_DIR, "backups")

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(BACKUP_DIR, exist_ok=True)

def get_connection(db_file=None):
    target = db_file or DB_PATH
    os.makedirs(os.path.dirname(target), exist_ok=True)
    conn = sqlite3.connect(target)
    conn.row_factory = sqlite3.Row
    return conn

# ==============================================================================
# SCHEMA MIGRATIONS REGISTRY
# ==============================================================================
# Add new migrations sequentially to this list when database structure evolves.
# Migrations are executed in transactions and never overwrite or drop user data.
MIGRATIONS = [
    {
        "version": 1,
        "name": "initial_schema",
        "sql": """
            CREATE TABLE IF NOT EXISTS alarms (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                time_str TEXT NOT NULL,
                label TEXT DEFAULT 'Alarm',
                days TEXT DEFAULT '1,2,3,4,5',
                voice_briefing INTEGER DEFAULT 1,
                enabled INTEGER DEFAULT 1,
                created_at REAL
            );

            CREATE TABLE IF NOT EXISTS timers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                duration_seconds INTEGER NOT NULL,
                remaining_seconds INTEGER NOT NULL,
                label TEXT DEFAULT 'Timer',
                status TEXT DEFAULT 'running',
                started_at REAL,
                updated_at REAL
            );

            CREATE TABLE IF NOT EXISTS kv_store (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at REAL
            );

            CREATE TABLE IF NOT EXISTS chat_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                tier TEXT DEFAULT 'hermes',
                metadata TEXT,
                timestamp REAL
            );
        """
    },
    {
        "version": 2,
        "name": "add_system_update_history",
        "sql": """
            CREATE TABLE IF NOT EXISTS system_updates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                commit_hash TEXT NOT NULL,
                branch TEXT DEFAULT 'main',
                status TEXT NOT NULL,
                message TEXT,
                backup_file TEXT,
                timestamp REAL NOT NULL
            );
        """
    },
    {
        "version": 3,
        "name": "add_weather_cache_table",
        "sql": """
            CREATE TABLE IF NOT EXISTS weather_cache (
                id INTEGER PRIMARY KEY,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                data_json TEXT NOT NULL,
                fetched_at REAL NOT NULL
            );
        """
    }
]

def init_db():
    """Initializes the database and runs all pending migrations."""
    conn = get_connection()
    c = conn.cursor()

    # Migration tracking table
    c.execute("""
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at REAL NOT NULL
        )
    """)
    conn.commit()

    # Apply migrations
    migrate_db(conn)

    # Seed default morning alarm if alarms table is empty
    c.execute("SELECT COUNT(*) as count FROM alarms")
    if c.fetchone()["count"] == 0:
        c.execute("""
            INSERT INTO alarms (time_str, label, days, voice_briefing, enabled, created_at)
            VALUES ('06:30', 'Tomorrow Morning', '1,2,3,4,5', 1, 1, ?)
        """, (time.time(),))
        conn.commit()

    conn.close()

def migrate_db(conn=None):
    """Executes any unapplied migrations in chronological order."""
    close_when_done = False
    if conn is None:
        conn = get_connection()
        close_when_done = True

    c = conn.cursor()
    c.execute("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at REAL NOT NULL)")
    conn.commit()

    c.execute("SELECT version FROM schema_migrations")
    applied_versions = {row["version"] for row in c.fetchall()}

    applied_count = 0
    for migration in MIGRATIONS:
        v = migration["version"]
        if v not in applied_versions:
            print(f"[Database Migration] Applying v{v}: {migration['name']}...")
            try:
                c.executescript(migration["sql"])
                c.execute(
                    "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
                    (v, migration["name"], time.time())
                )
                conn.commit()
                applied_count += 1
                print(f"[Database Migration] Successfully applied v{v}.")
            except Exception as e:
                conn.rollback()
                print(f"[Database Migration] Error applying migration v{v}: {e}")
                if close_when_done:
                    conn.close()
                raise e

    if applied_count == 0:
        print("[Database Migration] Schema is already up to date.")

    if close_when_done:
        conn.close()
    return applied_count

# ==============================================================================
# DATABASE BACKUP & RESTORE UTILITIES
# ==============================================================================

def backup_database(label="auto", max_backups=15):
    """
    Safely creates an online point-in-time backup using SQLite's native backup API.
    Does not lock reads/writes and prevents database corruption.
    Rotates older backups beyond max_backups.
    """
    os.makedirs(BACKUP_DIR, exist_ok=True)
    if not os.path.exists(DB_PATH):
        init_db()

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_filename = f"omnihub_backup_{label}_{timestamp}.db"
    backup_filepath = os.path.join(BACKUP_DIR, backup_filename)

    print(f"[Database Backup] Creating online snapshot: {backup_filename}")
    source_conn = get_connection()
    dest_conn = sqlite3.connect(backup_filepath)

    try:
        source_conn.backup(dest_conn, pages=100)
        dest_conn.close()
        source_conn.close()
        print(f"[Database Backup] Backup complete: {backup_filepath}")
    except Exception as e:
        print(f"[Database Backup] Backup failed: {e}")
        dest_conn.close()
        source_conn.close()
        raise e

    # Rotate old backups
    try:
        backups = list_backups()
        if len(backups) > max_backups:
            for old in backups[max_backups:]:
                old_file = os.path.join(BACKUP_DIR, old["filename"])
                if os.path.exists(old_file):
                    os.remove(old_file)
                    print(f"[Database Backup] Rotated old backup: {old['filename']}")
    except Exception as e:
        print(f"[Database Backup] Rotation warning: {e}")

    return backup_filepath

def restore_database(backup_filepath):
    """Restores database from a given backup file path."""
    if not os.path.exists(backup_filepath):
        raise FileNotFoundError(f"Backup file not found: {backup_filepath}")

    print(f"[Database Restore] Restoring from {backup_filepath} to {DB_PATH}")
    # Create safety backup of current db first if it exists
    if os.path.exists(DB_PATH):
        safety_path = f"{DB_PATH}.pre_restore_{int(time.time())}"
        shutil.copy2(DB_PATH, safety_path)

    # Use online restore
    source_conn = sqlite3.connect(backup_filepath)
    dest_conn = get_connection()
    source_conn.backup(dest_conn)
    source_conn.close()
    dest_conn.close()
    print("[Database Restore] Restore complete.")
    return True

def list_backups():
    """Lists available database backups sorted newest first."""
    if not os.path.exists(BACKUP_DIR):
        return []
    files = [f for f in os.listdir(BACKUP_DIR) if f.endswith(".db")]
    backups = []
    for f in files:
        full_path = os.path.join(BACKUP_DIR, f)
        stat = os.stat(full_path)
        backups.append({
            "filename": f,
            "path": full_path,
            "size_bytes": stat.st_size,
            "created_at": stat.st_mtime,
            "created_iso": datetime.fromtimestamp(stat.st_mtime).isoformat()
        })
    backups.sort(key=lambda x: x["created_at"], reverse=True)
    return backups

# ==============================================================================
# ALARMS & PREFERENCES HELPERS
# ==============================================================================

def get_alarms():
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM alarms ORDER BY time_str ASC")
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return rows

def set_kv(key, value):
    conn = get_connection()
    c = conn.cursor()
    c.execute("""
        INSERT INTO kv_store (key, value, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
    """, (key, json.dumps(value), time.time()))
    conn.commit()
    conn.close()

def get_kv(key, default=None):
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT value FROM kv_store WHERE key = ?", (key,))
    row = c.fetchone()
    conn.close()
    if row:
        try:
            return json.loads(row["value"])
        except Exception:
            return row["value"]
    return default

# CLI entrypoint for migration and backup execution
if __name__ == "__main__":
    if "--migrate" in sys.argv:
        print("[CLI] Running database migrations...")
        init_db()
    elif "--backup" in sys.argv:
        label = sys.argv[2] if len(sys.argv) > 2 else "manual"
        backup_database(label=label)
    elif "--list-backups" in sys.argv:
        for b in list_backups():
            print(f"- {b['filename']} ({b['size_bytes']} bytes, {b['created_iso']})")
    else:
        init_db()
        print(f"OmniHub database initialized at: {DB_PATH}")
