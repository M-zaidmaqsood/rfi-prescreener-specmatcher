
from services.retrieval import retrieve_relevant_specs


results = retrieve_relevant_specs(
    "What are the requirements for concrete vibration and placement?"
)

print("\nRetrieval results:\n")

for result in results:
    print("Section:", result["section_id"])
    print("Title:", result["title"])
    print("Similarity:", result["similarity"])
    print("Specification:", result["text"])
    print("-" * 50)
