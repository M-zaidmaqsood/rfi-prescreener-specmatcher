import json
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


def load_api_key():
    # Find .env.local in the project root.
    env_file = Path(__file__).resolve().parents[1] / ".env.local"

    if not env_file.exists():
        raise FileNotFoundError(
            ".env.local was not found in the project root."
        )

    # Read the API key without printing it.
    for line in env_file.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("GEMINI_API_KEY="):
            key = line.split("=", 1)[1].strip().strip('"').strip("'")
            if key:
                return key

    raise ValueError("GEMINI_API_KEY is missing from .env.local")


def test_embedding():
    api_key = load_api_key()

    url = (
        "https://generativelanguage.googleapis.com/"
        "v1beta/models/gemini-embedding-2:embedContent"
    )

    payload = {
        "model": "models/gemini-embedding-2",
        "content": {
            "parts": [
                {
                    "text": (
                        "Concrete compressive strength shall be "
                        "4000 psi at 28 days."
                    )
                }
            ]
        },
        "outputDimensionality": 768,
    }

    request = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=30) as response:
            result = json.loads(response.read().decode("utf-8"))

        vector = result["embedding"]["values"]

        print("Gemini embedding test: SUCCESS")
        print("Model: gemini-embedding-2")
        print(f"Embedding dimensions: {len(vector)}")

        if len(vector) != 768:
            print("WARNING: Expected 768 dimensions.")

    except HTTPError as error:
        print(f"Gemini API returned HTTP {error.code}.")
        print(error.read().decode("utf-8"))

    except URLError as error:
        print(f"Network error: {error.reason}")

    except TimeoutError:
        print("Request timed out. Please try again.")

    except (KeyError, ValueError, json.JSONDecodeError) as error:
        print(f"Unexpected response: {error}")


if __name__ == "__main__":
    test_embedding()
