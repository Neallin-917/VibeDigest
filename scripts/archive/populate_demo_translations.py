
import asyncio
import os
import sys
import json
import logging
from typing import Dict, Any
from pathlib import Path
from dotenv import load_dotenv

# Add backend to sys.path to import modules
backend_path = Path(__file__).resolve().parent.parent / "backend"
sys.path.append(str(backend_path))

# Load backend env
load_dotenv(backend_path / ".env")

from db_client import DBClient
from translator import Translator
from summarizer import Summarizer

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- MONKEY PATCHING SECTION ---
# The user's backend is configured with models (e.g. gpt-5/o1) that require 'max_completion_tokens'.
# Also, we want to force 'gpt-5' even if backend defaults to 'gpt-4o'.
# We patch the OpenAI library method directly to catch all cases (Translator and Summarizer).

from openai.resources.chat.completions import Completions

original_create = Completions.create

def patched_create(self, *args, **kwargs):
    # 1. Enforce GPT-5 if it was gpt-4o
    if kwargs.get('model') == 'gpt-4o':
         logger.info("🔧 Patching model: gpt-4o -> gpt-5")
         kwargs['model'] = 'gpt-5'
    
    # 2. Fix max_tokens -> max_completion_tokens
    if 'max_tokens' in kwargs:
         # logger.info("🔧 Patching max_tokens -> max_completion_tokens") # Commented out to reduce noise
         kwargs['max_completion_tokens'] = kwargs.pop('max_tokens')
         
    return original_create(self, *args, **kwargs)

Completions.create = patched_create
logger.info("🔧 Monkey-patched OpenAI.Completions.create to enforce GPT-5 and max_completion_tokens")
# -------------------------------

# Constants
DEMO_TASK_ID = "1e60a06c-ef37-4f82-bffd-1a5135cb45c7"
# Copied from frontend/src/lib/i18n.ts
SUPPORTED_LOCALES = ["en", "zh"]

async def translate_summary_content(translator: Translator, content_json: Dict, target_locale: str) -> Dict:
    """
    Translates the structured summary JSON content.
    """
    new_content = content_json.copy()
    new_content["language"] = target_locale
    
    # Translate Overview
    logger.info(f"   Translating overview to {target_locale}...")
    new_content["overview"] = await translator.translate_text(
        content_json["overview"], 
        target_language=target_locale
    )
    
    # Translate Keypoints
    new_keypoints = []
    total_kps = len(content_json.get("keypoints", []))
    for idx, kp in enumerate(content_json.get("keypoints", [])):
        logger.info(f"   Translating keypoint {idx+1}/{total_kps}...")
        new_kp = kp.copy()
        
        # Translate Title
        if kp.get("title"):
            new_kp["title"] = await translator.translate_text(kp["title"], target_language=target_locale)
            
        # Translate Detail
        if kp.get("detail"):
            new_kp["detail"] = await translator.translate_text(kp["detail"], target_language=target_locale)
            
        if kp.get("evidence"):
             new_kp["evidence"] = await translator.translate_text(kp["evidence"], target_language=target_locale)
             
        new_keypoints.append(new_kp)
        
    new_content["keypoints"] = new_keypoints
    return new_content

async def main():
    task_id = sys.argv[1] if len(sys.argv) > 1 else DEMO_TASK_ID
    logger.info(f"🚀 Starting translation population for Task ID: {task_id}")
    
    db = DBClient()
    translator = Translator()
    summarizer = Summarizer()
    
    logger.info("Fetching existing outputs...")
    outputs = db.get_task_outputs(task_id)
    
    # 1. Determine Source Language and Content
    # Priority: summary_source > checking script_raw + existing summary
    
    summary_source_output = next((o for o in outputs if o['kind'] == 'summary_source'), None)
    script_raw_output = next((o for o in outputs if o['kind'] == 'script_raw'), None)
    
    source_language = 'en' # Default
    source_content = None
    
    # Try to load from summary_source first (The true original)
    if summary_source_output and summary_source_output.get('content'):
        try:
            content_raw = summary_source_output['content']
            if isinstance(content_raw, str):
                try: 
                    # Handle potential double encoding in source too
                    parsed = json.loads(content_raw) 
                    if isinstance(parsed, str): 
                        parsed = json.loads(parsed)
                    source_content = parsed
                except:
                    pass
            else:
                source_content = content_raw
                
            if source_content and isinstance(source_content, dict):
                source_language = source_content.get('language') or 'en'
                logger.info(f"📝 Detected Source Language from 'summary_source': {source_language}")
                logger.info("✅ Using 'summary_source' as authoritative content.")
        except Exception as e:
            logger.warning(f"⚠️ Could not parse summary_source: {e}")

    # Fallback: Detect from Script Raw if source content not yet found
    if not source_content:
        if script_raw_output and script_raw_output.get('content'):
            try:
                script_raw_content = json.loads(script_raw_output['content'])
                source_language = script_raw_content.get('language') or 'en'
                logger.info(f"📝 Detected Source Language from Transcript: {source_language}")
            except:
                logger.warning("⚠️ Could not parse script_raw content. Defaulting to 'en'.")
        else:
             logger.warning("⚠️ No script_raw found. Defaulting to 'en'.")

        # Now try to find existing summary (locale=source_language)
        source_summary_output = next((o for o in outputs if o['kind'] == 'summary' and o['locale'] == source_language), None)
        
        # Check if valid
        if source_summary_output and source_summary_output['status'] == 'completed':
            try:
                content_raw = source_summary_output['content']
                if isinstance(content_raw, str):
                    try:
                        parsed = json.loads(content_raw)
                        if isinstance(parsed, str): parsed = json.loads(parsed)
                        source_content = parsed
                        logger.info(f"✅ Found existing valid source summary ({source_language}).")
                    except:
                        pass
            except:
                 logger.warning(f"⚠️ Existing source summary ({source_language}) is invalid. Will regenerate.")
    
    # Regenerate if missing or invalid (only if we still don't have source_content)
    if not source_content:
        logger.info(f"⚙️ Generating authoritative source summary for {source_language}...")
        
        # We need the full script text
        script_output = next((o for o in outputs if o['kind'] == 'script'), None)
        if not script_output or not script_output.get('content'):
            logger.error("❌ Critical: No script/transcript found. Cannot generate summary.")
            return

        script_text = script_output['content']
        task = db.get_task(task_id)
        video_title = task.get('video_title') or "Unknown Video"
        
        # Use Summarizer to generate
        try:
            source_content = await summarizer.summarize_in_language_with_anchors(
                transcript=script_text,
                summary_language=source_language,
                video_title=video_title,
                script_raw_json=script_raw_output.get('content') if script_raw_output else None
            )
            
            if isinstance(source_content, str):
                try:
                    source_content = json.loads(source_content)
                except:
                     logger.warning("Source content is string but not valid JSON (from summarizer).")
            
            # Save it to DB as summary (locale=source)
            content_str = json.dumps(source_content, ensure_ascii=False)
            logger.info(f"💾 Saving generated source summary ({source_language})...")
            
            # Check if output row exists to update, else create
            source_summary_output = next((o for o in outputs if o['kind'] == 'summary' and o['locale'] == source_language), None)
            
            if source_summary_output:
                db.update_output_status(source_summary_output['id'], status='completed', progress=100, content=content_str)
            else:
                db.create_task_output(task_id, task['user_id'], 'summary', locale=source_language)
                # Re-fetch outputs to get ID... simplified for now.
                # Just re-querying or relying on next run. 
                # Ideally we update the just-created row.
                outputs = db.get_task_outputs(task_id)
                new_out = next((o for o in outputs if o['kind'] == 'summary' and o['locale'] == source_language), None)
                if new_out:
                    db.update_output_status(new_out['id'], status='completed', progress=100, content=content_str)
            
            logger.info("✅ Source summary generated and saved.")
            
        except Exception as e:
            logger.error(f"❌ Failed to generate source summary: {e}")
            import traceback
            traceback.print_exc()
            return

    # Ensure source_content is a dict (Redundant check but safe)
    if isinstance(source_content, str):
        try:
             source_content = json.loads(source_content)
             if isinstance(source_content, str): source_content = json.loads(source_content)
        except:
             pass

    if not isinstance(source_content, dict):
        logger.error(f"❌ Source content is not a dictionary. Type: {type(source_content)}")
        return

    # 4. Consistency Check: Sync summary_source -> summary (locale=source)
    # If we loaded from summary_source, ensure the summary record matches it.
    if summary_source_output:
        # Find corresponding summary locale record
        matching_summary = next((o for o in outputs if o['kind'] == 'summary' and o['locale'] == source_language), None)
        content_str = json.dumps(source_content, ensure_ascii=False)
        
        if matching_summary:
            # Check if we need to update (simple check)
            if matching_summary.get('content') != content_str:
                 logger.info(f"🔄 Syncing 'summary' ({source_language}) to match 'summary_source'...")
                 db.update_output_status(matching_summary['id'], status='completed', progress=100, content=content_str)
        else:
             logger.info(f"➕ Creating 'summary' ({source_language}) to match 'summary_source'...")
             # Create new
             task = db.get_task(task_id) # Need user_id
             new_row = db.create_task_output(task_id, task['user_id'], 'summary', locale=source_language)
             db.update_output_status(new_row['id'], status='completed', progress=100, content=content_str)


    # Ensure source_content is a dict
    if isinstance(source_content, str):
        try:
            source_content = json.loads(source_content)
        except:
             logger.warning("Source content is string but not valid JSON after all checks. Double encoded?")
             # Try one more time if double encoded
             try:
                 source_content = json.loads(json.loads(source_content))
             except:
                 pass

    if not isinstance(source_content, dict):
        logger.error(f"❌ Source content is not a dictionary. Type: {type(source_content)}")
        logger.error(f"Content: {str(source_content)[:500]}")
        return

    # 3. Iterate through supported locales and Translate from Source
    logger.info("--------------------------------------------------")
    logger.info("Starting Translations...")
    
    for target_locale in SUPPORTED_LOCALES:
        if target_locale == source_language:
            continue
            
        logger.info(f"🌍 Processing locale: {target_locale}")
        
        # Check if already exists
        # Refresh outputs first? Maybe necessary if we just inserted.
        existing = next((o for o in outputs if o['kind'] == 'summary' and o['locale'] == target_locale), None)
        
        if existing and existing['status'] == 'completed':
             logger.info(f"✅ Translation for {target_locale} already exists. Skipping.")
             continue
        
        # Generate Translation
        try:
            translated_content = await translate_summary_content(translator, source_content, target_locale)
            translated_content_str = json.dumps(translated_content, ensure_ascii=False)
            
            # Save
            if existing: # Update
                 db.update_output_status(existing['id'], status='completed', progress=100, content=translated_content_str)
            else: # Create
                 # Fetch user_id from task (outputs list usually has it, distinct per row, but same for task)
                 user_id = outputs[0]['user_id']
                 new_row = db.create_task_output(task_id, user_id, 'summary', locale=target_locale)
                 db.update_output_status(new_row['id'], status='completed', progress=100, content=translated_content_str)
                 
            logger.info(f"✅ Successfully saved {target_locale} translation!")
            
        except Exception as e:
            logger.error(f"❌ Failed to translate {target_locale}: {e}")

    logger.info("--------------------------------------------------")
    logger.info("🎉 All translations processed.")

if __name__ == "__main__":
    asyncio.run(main())
