from api.services.storage import _database_url, _postgres_connection


def main() -> None:
    query_passed = False

    try:
        if not _database_url():
            raise RuntimeError("database URL is not configured")

        with _postgres_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1 AS connection_test")
                row = cursor.fetchone()
                query_passed = bool(row and row["connection_test"] == 1)

        if not query_passed:
            raise RuntimeError("connection test query returned an unexpected result")
    except Exception as error:
        if isinstance(error, RuntimeError) and str(error) == "database URL is not configured":
            category = "database URL is not configured"
        elif isinstance(error, (TimeoutError,)):
            category = "connection timed out"
        else:
            category = "database connection or query failed"

        print("Neon connection test: FAILED")
        print("Database backend: PostgreSQL")
        print("Query test: FAILED")
        print(f"Error category: {category}")
        return

    print("Neon connection test: SUCCESS")
    print("Database backend: PostgreSQL")
    print("Query test: PASSED")


if __name__ == "__main__":
    main()
