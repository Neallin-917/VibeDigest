import logging
import os
from typing import Optional, Dict, Any
from config import settings
from utils.llm_router import resolve_model_for_intent
# from utils.openai_client import get_openai_client # Deprecated for Translator
from langchain_core.messages import SystemMessage, HumanMessage
from utils.text_utils import LANGUAGE_MAP, detect_language, smart_chunk_text
from prompts import TRANSLATE_SYSTEM, TRANSLATE_USER, TRANSLATE_CHUNK_SYSTEM
from utils.trace_utils import build_trace_config

logger = logging.getLogger(__name__)

class Translator:
    """Text Translator using LiteLLM for high-quality translation"""

    def __init__(self):
        self.language_map = LANGUAGE_MAP
        provider_key = (
            os.getenv("OPENAI_API_KEY")
            if settings.LLM_PROVIDER == "custom"
            else os.getenv("OPENROUTER_API_KEY")
        )

        if provider_key:
             logger.info("Translator initialized via create_chat_model")
             from utils.llm_router import create_chat_model

             model_name = resolve_model_for_intent("translation") or settings.OPENAI_TRANSLATION_MODEL
             self.llm = create_chat_model(
                 model_name=model_name,
                 temperature=0.3,
                 max_tokens=4000
             )
        else:
             logger.warning("LLM API Key missing, Translator will fail.")
             self.llm = None

    async def translate_text(
        self,
        text: str,
        target_language: str,
        source_language: Optional[str] = None,
        trace_metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        Translate text to target language

        Args:
            text: Text to translate
            target_language: Target language code
            source_language: Source language code (optional, auto-detected)

        Returns:
            Translated text
        """
        try:
            if not self.llm:
                logger.warning("LLM API unavailable, cannot translate")
                return text
            
            if not source_language:
                source_language = detect_language(text)
            
            # If source and target languages match, return as-is
            if source_language == target_language:
                return text
            
            source_lang_name = self.language_map.get(source_language, source_language)
            target_lang_name = self.language_map.get(target_language, target_language)
            
            logger.info(f"开始翻译：{source_lang_name} -> {target_lang_name}")
            
            # Estimate text length to decide chunking
            if len(text) > 3000:
                logger.info(f"文本较长({len(text)} chars)，启用分块翻译")
                return await self._translate_with_chunks(
                    text,
                    target_lang_name,
                    source_lang_name,
                    trace_metadata=trace_metadata,
                )
            else:
                return await self._translate_single_text(
                    text,
                    target_lang_name,
                    source_lang_name,
                    trace_metadata=trace_metadata,
                )
                
        except Exception as e:
            logger.error(f"翻译失败: {str(e)}")
            return text
    
    async def _translate_single_text(
        self,
        text: str,
        target_lang_name: str,
        source_lang_name: str,
        trace_metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Translate a single text chunk."""
        system_prompt = TRANSLATE_SYSTEM.format(source_lang=source_lang_name, target_lang=target_lang_name)
        user_prompt = TRANSLATE_USER.format(source_lang=source_lang_name, target_lang=target_lang_name, text=text)

        try:
            messages = [
                SystemMessage(content=system_prompt),
                HumanMessage(content=user_prompt)
            ]
            # Use ainvoke for native async
            trace_config = build_trace_config(
                base=trace_metadata,
                run_name="Translate/Transcript",
                stage="translate",
                metadata={
                    "source_language": source_lang_name,
                    "target_language": target_lang_name,
                },
            )
            response = await self.llm.ainvoke(messages, config=trace_config)
            return response.content
            
        except Exception as e:
            logger.error(f"单文本翻译失败: {e}")
            return text
    
    async def _translate_with_chunks(
        self,
        text: str,
        target_lang_name: str,
        source_lang_name: str,
        trace_metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Translate long text in chunks."""
        chunks = smart_chunk_text(text, max_chars=4000)
        logger.info(f"分割为 {len(chunks)} 个块进行翻译")
        
        translated_chunks = []
        for i, chunk in enumerate(chunks):
            logger.info(f"正在翻译第 {i+1}/{len(chunks)} 块...")
            
            system_prompt = TRANSLATE_CHUNK_SYSTEM.format(
                source_lang=source_lang_name,
                target_lang=target_lang_name,
                current_part=i+1,
                total_parts=len(chunks)
            )
            user_prompt = TRANSLATE_USER.format(source_lang=source_lang_name, target_lang=target_lang_name, text=chunk)

            try:
                messages = [
                    SystemMessage(content=system_prompt),
                    HumanMessage(content=user_prompt)
                ]
                
                # Use ainvoke with specific run name for tracing
                trace_config = build_trace_config(
                    base=trace_metadata,
                    run_name="Translate/Transcript",
                    stage="translate",
                    metadata={
                        "chunk_index": i,
                        "source_language": source_lang_name,
                        "target_language": target_lang_name,
                    },
                )
                response = await self.llm.ainvoke(messages, config=trace_config)
                translated_chunks.append(response.content)
                
            except Exception as e:
                logger.error(f"翻译第 {i+1} 块失败: {e}")
                translated_chunks.append(chunk)
        
        return "\n\n".join(translated_chunks)
    
    def should_translate(self, source_language: str, target_language: str) -> bool:
        """Determine whether translation is needed."""
        if not source_language or not target_language:
            return False
        
        # Normalize language codes
        source_lang = source_language.lower().strip()
        target_lang = target_language.lower().strip()
        
        # If languages match, no translation needed
        if source_lang == target_lang:
            return False
        
        # Handle Chinese variants
        chinese_variants = ["zh", "zh-cn", "zh-hans", "chinese"]
        if source_lang in chinese_variants and target_lang in chinese_variants:
            return False
        
        return True
