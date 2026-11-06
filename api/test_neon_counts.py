from api.services.storage import _postgres_connection


def main() -> None:
    try:
        with _postgres_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        (SELECT COUNT(*) FROM public.rfi_items) AS rfi_items_count,
                        (SELECT COUNT(*) FROM public.audit_log) AS audit_log_count;
                    """
                )
                row = cursor.fetchone()
                if row is None:
                    raise RuntimeError("count query returned no result")

                print(f"rfi_items count: {row['rfi_items_count']}")
                print(f"audit_log count: {row['audit_log_count']}")
                print("Neon record count test: SUCCESS")
    except Exception:
        print("Neon record count test: FAILED")
        print("Error category: database connection or query failed")


if __name__ == "__main__":
    main()
