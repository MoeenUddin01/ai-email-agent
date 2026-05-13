"""Test script: Generate AI reply for a sample course inquiry email."""
import asyncio
import sys
sys.path.insert(0, "/home/moeen/projects/ai-email-agent")

from src.rag.service import RAGService


SAMPLE_EMAIL = {
    "sender": "prospective.student@gmail.com",
    "subject": "Question about Data Science course",
    "body_text": (
        "Hi, I'm interested in your Data Science program. I have a background in "
        "Python and statistics, and I'd like to know more about the curriculum, "
        "duration, and prerequisites. Also, are there any upcoming intake dates? "
        "Please let me know the fee structure as well."
    ),
}


async def main():
    print("=" * 60)
    print("AI Email Agent - Test Reply Generation")
    print("=" * 60)

    rag = RAGService()

    print(f"\nFrom: {SAMPLE_EMAIL['sender']}")
    print(f"Subject: {SAMPLE_EMAIL['subject']}")
    print(f"Body: {SAMPLE_EMAIL['body_text'][:80]}...")
    print("\n--- Generating AI reply ---\n")

    result = await rag.generate_reply(
        email_content=SAMPLE_EMAIL["body_text"],
        sender=SAMPLE_EMAIL["sender"],
        subject=SAMPLE_EMAIL["subject"],
    )

    print("=== AI GENERATED DRAFT ===")
    print(result["draft_content"])
    print(f"\nModel used: {result['model_used']}")

    if result.get("retrieved_context", {}).get("documents"):
        docs = result["retrieved_context"]["documents"]
        print(f"\nKnowledge sources found: {len(docs)}")
        for d in docs:
            sim = d.get("similarity", 0)
            print(f"  - match: {sim:.1%}")
    else:
        print("\nNo knowledge base docs retrieved (mock reply)")

    if result.get("token_info"):
        ti = result["token_info"]
        print(f"\nToken usage: ~{ti['estimated_prompt_tokens']} / {ti['max_context_window']} ({ti['usage_pct']}%)")

    print("\n" + "=" * 60)
    print("Done. Fix the OAuth issue to test via the web UI.")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
