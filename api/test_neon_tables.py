from api.services.storage import _postgres_connection


def main() -> None:
    rfi_items_exists = False
    audit_log_exists = False

    try:
        with _postgres_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        to_regclass('public.rfi_items') AS rfi_items,
                        to_regclass('public.audit_log') AS audit_log;
                    """
                )
                row = cursor.fetchone()
                rfi_items_exists = bool(row and row["rfi_items"] is not None)
                audit_log_exists = bool(row and row["audit_log"] is not None)
    except Exception:
        print("Neon table verification: FAILED")
        print("rfi_items: MISSING")
        print("audit_log: MISSING")
        return

    verification_succeeded = rfi_items_exists and audit_log_exists
    print(f"Neon table verification: {'SUCCESS' if verification_succeeded else 'FAILED'}")
    print(f"rfi_items: {'EXISTS' if rfi_items_exists else 'MISSING'}")
    print(f"audit_log: {'EXISTS' if audit_log_exists else 'MISSING'}")


if __name__ == "__main__":
    main()
