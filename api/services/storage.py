import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator


API_DIR = Path(__file__).resolve().parents[1]
SQLITE_FILE = API_DIR / "data" / "rfi.sqlite3"


def _database_url() -> str | None:
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        return database_url

    neon_database_url = os.getenv("NEON_DATABASE_URL")
    if neon_database_url:
        return neon_database_url

    env_file = API_DIR.parent / ".env.local"
    if not env_file.exists():
        return None

    values: dict[str, str] = {}
    for line in env_file.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        name, value = stripped.split("=", 1)
        if name.strip() in {"DATABASE_URL", "NEON_DATABASE_URL"}:
            values[name.strip()] = value.strip().strip('"').strip("'")

    return values.get("DATABASE_URL") or values.get("NEON_DATABASE_URL")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def _sqlite_connection() -> Iterator[sqlite3.Connection]:
    SQLITE_FILE.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(SQLITE_FILE)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def _postgres_connection() -> Any:
    try:
        import psycopg
        from psycopg.rows import dict_row
    except ImportError as error:
        raise RuntimeError(
            "PostgreSQL support is not installed. Install the API requirements."
        ) from error

    return psycopg.connect(_database_url(), prepare_threshold=None, row_factory=dict_row)


def initialize_database() -> None:
    schema = """
        CREATE TABLE IF NOT EXISTS rfi_items (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            question TEXT NOT NULL,
            trade TEXT NOT NULL,
            drawing_reference TEXT NOT NULL,
            urgency TEXT NOT NULL,
            analysis_json TEXT NOT NULL,
            status TEXT NOT NULL,
            reviewer_notes TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS audit_log (
            id TEXT PRIMARY KEY,
            rfi_id TEXT NOT NULL,
            action TEXT NOT NULL,
            reviewer TEXT NOT NULL,
            notes TEXT NOT NULL,
            previous_status TEXT,
            new_status TEXT,
            timestamp TEXT NOT NULL
        );
    """
    if _database_url():
        with _postgres_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(schema)
        return

    with _sqlite_connection() as connection:
        connection.executescript(schema)


def create_rfi(item: dict[str, Any]) -> dict[str, Any]:
    if _database_url():
        with _postgres_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO rfi_items
                    (id, title, question, trade, drawing_reference, urgency,
                     analysis_json, status, reviewer_notes, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        item["id"], item["title"], item["question"], item["trade"],
                        item["drawing_reference"], item["urgency"],
                        json.dumps(item["analysis"]), item["status"], "",
                        item["created_at"], item["created_at"],
                    ),
                )
        return item

    with _sqlite_connection() as connection:
        connection.execute(
            """
            INSERT INTO rfi_items
            (id, title, question, trade, drawing_reference, urgency,
             analysis_json, status, reviewer_notes, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                item["id"], item["title"], item["question"], item["trade"],
                item["drawing_reference"], item["urgency"],
                json.dumps(item["analysis"]), item["status"], "",
                item["created_at"], item["created_at"],
            ),
        )
    return item


def _row_to_item(row: Any) -> dict[str, Any]:
    item = dict(row)
    item["analysis"] = json.loads(item.pop("analysis_json"))
    return item


def list_rfis() -> list[dict[str, Any]]:
    if _database_url():
        with _postgres_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT * FROM rfi_items ORDER BY created_at DESC")
                return [_row_to_item(row) for row in cursor.fetchall()]

    with _sqlite_connection() as connection:
        rows = connection.execute(
            "SELECT * FROM rfi_items ORDER BY created_at DESC"
        ).fetchall()
    return [_row_to_item(row) for row in rows]


def get_rfi(rfi_id: str) -> dict[str, Any] | None:
    if _database_url():
        with _postgres_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT * FROM rfi_items WHERE id = %s", (rfi_id,))
                row = cursor.fetchone()
                return _row_to_item(row) if row else None

    with _sqlite_connection() as connection:
        row = connection.execute(
            "SELECT * FROM rfi_items WHERE id = ?", (rfi_id,)
        ).fetchone()
    return _row_to_item(row) if row else None


def update_review(
    rfi_id: str,
    analysis: dict[str, Any],
    status: str,
    reviewer_notes: str,
) -> None:
    updated_at = _now()
    if _database_url():
        with _postgres_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE rfi_items
                    SET analysis_json = %s, status = %s,
                        reviewer_notes = %s, updated_at = %s
                    WHERE id = %s
                    """,
                    (json.dumps(analysis), status, reviewer_notes, updated_at, rfi_id),
                )
        return

    with _sqlite_connection() as connection:
        connection.execute(
            """
            UPDATE rfi_items
            SET analysis_json = ?, status = ?, reviewer_notes = ?, updated_at = ?
            WHERE id = ?
            """,
            (json.dumps(analysis), status, reviewer_notes, updated_at, rfi_id),
        )


def add_audit_log(entry: dict[str, Any]) -> None:
    values = (
        entry["id"], entry["rfi_id"], entry["action"], entry["reviewer"],
        entry["notes"], entry["previous_status"], entry["new_status"],
        entry["timestamp"],
    )
    if _database_url():
        with _postgres_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO audit_log
                    (id, rfi_id, action, reviewer, notes, previous_status,
                     new_status, timestamp)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    values,
                )
        return

    with _sqlite_connection() as connection:
        connection.execute(
            """
            INSERT INTO audit_log
            (id, rfi_id, action, reviewer, notes, previous_status, new_status, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            values,
        )


def list_audit_logs(rfi_id: str) -> list[dict[str, Any]]:
    if _database_url():
        with _postgres_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT * FROM audit_log WHERE rfi_id = %s ORDER BY timestamp DESC",
                    (rfi_id,),
                )
                return [dict(row) for row in cursor.fetchall()]

    with _sqlite_connection() as connection:
        rows = connection.execute(
            "SELECT * FROM audit_log WHERE rfi_id = ? ORDER BY timestamp DESC",
            (rfi_id,),
        ).fetchall()
    return [dict(row) for row in rows]
