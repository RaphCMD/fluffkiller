import asyncio
import json
from pathlib import Path
from openai import AsyncOpenAI
import sys
sys.stdout.reconfigure(encoding='utf-8')

# Replace with your actual key or use os.getenv("OPENAI_API_KEY")
client = AsyncOpenAI(api_key="")

MODEL_NAME = "gpt-4o"

# Escaped curly braces for format()
fluffkiller_PROMPT = """
SYSTEM:
You are a precise annotator tasked with labeling whether a paragraph in an article is relevant or fluff.

Label 1 (relevant) if the paragraph contributes new facts, essential quotes, direct commentary, narrative progression, or useful context directly related to the headline and main premise.

Label 0 (fluff) if the paragraph is filler: tangents, redundant background, moralizing conclusions, vague generalizations, low-information quotes, SEO padding, or image captions.

Do not include moral judgments or stylistic preferences. Only assess the paragraph’s contribution to the article's core story.

USER:
{payload}

Output only a JSON object:
{{
  "headline": string,
  "context": string,
  "annotations": [
    {{
      "paragraph": string,
      "reason": "brief explanation (1 sentence max)",
      "label": 0 or 1
    }}
  ]
}}

Fully continue writing the json until the entire file is processed. NO BATCHES.
"""

async def annotate_chunk(headline, context, chunk):
    payload = json.dumps({
        "headline": headline,
        "context": context,
        "paragraphs": chunk
    }, ensure_ascii=False)
    try:
        response = await client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {"role": "system", "content": fluffkiller_PROMPT.format(payload=payload)}
            ],
            temperature=0,
            max_tokens=4096,
        )
        content = response.choices[0].message.content.strip()
        if not content:
            print("Empty response from model.")
            return []
        try:
            if content.startswith("```json"):
                content = content.removeprefix("```json").removesuffix("```").strip()
            elif content.startswith("```"):
                content = content.removeprefix("```").removesuffix("```").strip()

            parsed = json.loads(content)

            return parsed.get("annotations", [])
        except json.JSONDecodeError:
            print("Invalid JSON from model:\n", content[:300])
            return []
    except Exception as e:
        print(f"Error processing chunk: {e}")
        return []

async def annotate_article(article):
    headline = article["headline"]
    context = article["context"]
    paragraphs = article["paragraphs"]
    chunk_size = 5
    all_annotations = []

    for i in range(0, len(paragraphs), chunk_size):
        chunk = paragraphs[i:i+chunk_size]
        annotations = await annotate_chunk(headline, context, chunk)
        all_annotations.extend(annotations)

    return {
        "headline": headline,
        "context": context,
        "annotations": all_annotations
    }

async def main():
    file_path = "./data/input_articles/fluffkiller_articleCons.json"
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            article = json.load(f)
    except Exception as e:
        print(f"Failed to load file: {e}")
        return

    result = await annotate_article(article)
    if result and result["annotations"]:
        out_path = f"annotated_{Path(file_path).stem}.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"Saved: {out_path}")
    else:
        print("Annotation failed or returned no annotations.")

if __name__ == "__main__":
    asyncio.run(main())
