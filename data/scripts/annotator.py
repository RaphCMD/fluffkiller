import asyncio
import json
import sys
import aiofiles
from pathlib import Path
from openai import AsyncOpenAI
from asyncio import Semaphore

sys.stdout.reconfigure(encoding='utf-8')

client = AsyncOpenAI(api_key="")
MODEL_NAME = "gpt-4o"
RATE_LIMIT_SEMAPHORE = Semaphore(3)  # max 3 concurrent API calls

fluffkiller_PROMPT = """
SYSTEM:
You are a precise annotator tasked with labeling whether a paragraph in an article is relevant or fluff.

Label 1 (relevant) if the paragraph contributes new facts, essential quotes, direct commentary, narrative progression, or useful context directly related to the headline and main premise.

Label 0 (fluff) if the paragraph is filler: tangents, redundant background, moralizing conclusions, vague generalizations, low-information quotes, SEO padding, or image captions.

Do not include moral judgments or stylistic preferences. Only assess the paragraph’s contribution to the article's core story.

If you come across an embedding/background information about the author/image caption/etc., ignore it and continue with the next paragraph. Do not include it in the output.
If the context provided is fluff compares to the headline, do not use it as context and just use the headline as context.

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

    async with RATE_LIMIT_SEMAPHORE:
        await asyncio.sleep(1.5)  # throttle to respect TPM limits
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
                    content = content.removeprefix("```").removesuffix("```\n").strip()
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

async def process_file(file_path):
    try:
        async with aiofiles.open(file_path, "r", encoding="utf-8") as f:
            content = await f.read()
            article = json.loads(content)
        result = await annotate_article(article)
        if result and result["annotations"]:
            out_path = f"annotated_{Path(file_path).stem}.json"
            async with aiofiles.open(out_path, "w", encoding="utf-8") as f:
                await f.write(json.dumps(result, ensure_ascii=False, indent=2))
            print(f"Saved: {out_path}")
        else:
            print(f"Failed or empty annotations: {file_path}")
    except Exception as e:
        print(f"Error reading {file_path}: {e}")

async def main():
    input_dir = Path("./data/input_articles")
    json_files = list(input_dir.glob("*.json"))
    print(f"Found {len(json_files)} articles to process.")
    await asyncio.gather(*(process_file(f) for f in json_files))

if __name__ == "__main__":
    asyncio.run(main())