import json
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


PROJECT_ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = PROJECT_ROOT / ".env.local"
DEFAULT_MODEL = "gemini-2.5-flash"
TIMEOUT_SECONDS = 30


def read_env_file() -> dict[str, str]:
    if not ENV_FILE.exists():
        return {}

    values = {}
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        name, value = stripped.split("=", 1)
        values[name.strip()] = value.strip().strip('"').strip("'")
    return values


def get_model(env_file_values: dict[str, str]) -> str:
    model = os.getenv("GEMINI_GENERATION_MODEL") or env_file_values.get(
        "GEMINI_GENERATION_MODEL", DEFAULT_MODEL
    )
    return model.removeprefix("models/")


def print_result(
    success: bool,
    model: str,
    http_status: int | None,
    valid_json: bool,
    error: str | None = None,
) -> None:
    print(f"Gemini generation test: {'SUCCESS' if success else 'FAILED'}")
    print(f"Model name: {model}")
    print(f"HTTP status: {http_status if http_status is not None else 'unavailable'}")
    print(f"Valid JSON: {'YES' if valid_json else 'NO'}")
    if error:
        print(f"Error: {error}")


def main() -> None:
    env_file_values = read_env_file()
    model = get_model(env_file_values)
    api_key = env_file_values.get("GEMINI_API_KEY", "")

    if not api_key:
        print_result(
            success=False,
            model=model,
            http_status=None,
            valid_json=False,
            error="GEMINI_API_KEY is missing from the root .env.local file.",
        )
        return

    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "text": (
                            'Return a JSON object with status set to "success" '
                            "and a short message."
                        )
                    }
                ]
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.1,
        },
    }
    request = Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        },
        method="POST",
    )

    http_status = None
    try:
        with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            http_status = response.status
            response_data = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        print_result(False, model, error.code, False, f"HTTP request failed ({error.code}).")
        return
    except URLError as error:
        reason = error.reason
        if isinstance(reason, TimeoutError):
            message = "request timed out."
        else:
            message = "network request failed."
        print_result(False, model, None, False, message)
        return
    except TimeoutError:
        print_result(False, model, None, False, "request timed out.")
        return
    except (UnicodeDecodeError, json.JSONDecodeError):
        print_result(False, model, http_status, False, "response was not valid JSON.")
        return

    try:
        candidates = response_data["candidates"]
        if not candidates:
            raise ValueError("response contained no candidates.")
        parts = candidates[0]["content"]["parts"]
        text = next(part["text"] for part in parts if isinstance(part.get("text"), str))
        returned_json = json.loads(text)
        if not isinstance(returned_json, dict):
            raise ValueError("returned JSON was not an object.")
        if returned_json.get("status") != "success":
            raise ValueError('returned JSON did not contain status "success".')
    except (KeyError, IndexError, TypeError, StopIteration):
        print_result(False, model, http_status, False, "response structure was unexpected.")
        return
    except json.JSONDecodeError:
        print_result(False, model, http_status, False, "candidate text was not valid JSON.")
        return
    except ValueError as error:
        print_result(False, model, http_status, True, str(error))
        return

    print_result(True, model, http_status, True)


if __name__ == "__main__":
    main()
