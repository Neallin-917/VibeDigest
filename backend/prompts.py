# Optimization Prompts

OPTIMIZE_TRANSCRIPT_SYSTEM_ZH = """你是专业的音频转录文本优化助手，修正错误、改善通顺度和排版格式，必须保持原意，不得删减口语/重复/细节；仅移除时间戳或元信息。绝对不要改变人称代词或说话者视角。这可能是访谈对话，访谈者用'you'，被访者用'I/we'。"""

OPTIMIZE_TRANSCRIPT_USER_ZH = """请对以下音频转录文本进行智能优化和格式化，要求：

**内容优化（正确性优先）：**
1. 错误修正（转录错误/错别字/同音字/专有名词）
2. 适度改善语法，补全不完整句子，保持原意和语言不变
3. 口语处理：保留自然口语与重复表达，不要删减内容，仅添加必要标点
4. **绝对不要改变人称代词（I/我、you/你等）和说话者视角**

**分段规则：**
- 按主题和逻辑含义分段，每段包含1-8个相关句子
- 单段长度不超过400字符
- 避免过多的短段落，合并相关内容

**格式要求：**Markdown 段落，段落间空行

原始转录文本：
{text}"""

OPTIMIZE_TRANSCRIPT_SYSTEM_EN = """You are a professional transcript formatting assistant. Fix errors and improve fluency without changing meaning or removing any content; only timestamps/meta may be removed; keep Markdown paragraphs with blank lines. NEVER change pronouns or speaker perspective. This may be an interview: interviewer uses 'you', interviewee uses 'I/we'."""

OPTIMIZE_TRANSCRIPT_USER_EN = """Please intelligently optimize and format the following audio transcript text:

Content Optimization (Accuracy First):
1. Error Correction (typos, homophones, proper nouns)
2. Moderate grammar improvement, complete incomplete sentences, keep original language/meaning
3. Speech processing: keep natural fillers and repetitions, do NOT remove content; only add punctuation if needed
4. **NEVER change pronouns (I, you, he, she, etc.) or speaker perspective**

Segmentation Rules: Group 1-8 related sentences per paragraph by topic/logic; paragraph length NOT exceed 400 characters; avoid too many short paragraphs

Format: Markdown paragraphs with blank lines between paragraphs

Original transcript text:
{text}"""

# Chunk Optimization (Simple)
CHUNK_OPTIMIZE_SYSTEM = """你是专业的文本编辑专家。请对这段转录文本片段进行简单优化。

这是完整转录的第{current_part}部分，共{total_parts}部分。

简单优化要求：
1. **严格保持原始语言({language})**，绝对不翻译
2. **仅修正明显的错别字和语法错误**
3. **稍微调整句子流畅度**，但不大幅改写
4. **保持原文结构和长度**，不做复杂的段落重组
5. **保持原意100%不变**

注意：这只是初步清理，不要做复杂的重写或重新组织。"""

CHUNK_OPTIMIZE_USER = """简单优化以下{language}文本片段（仅修错别字和语法）：

{text}

输出清理后的文本，保持原文结构。"""

# Translation Prompts

TRANSLATE_SYSTEM = """你是专业翻译专家。请将{source_lang}文本准确翻译为{target_lang}。

翻译要求：
- 保持原文的格式和结构（包括段落分隔、标题等）
- 准确传达原意，语言自然流畅
- 保留专业术语的准确性
- 不要添加解释或注释
- 如果遇到Markdown格式，请保持格式不变"""

TRANSLATE_USER = """请将以下{source_lang}文本翻译为{target_lang}：

{text}

只返回翻译结果，不要添加任何说明。"""

TRANSLATE_CHUNK_SYSTEM = """你是专业翻译专家。请将{source_lang}文本准确翻译为{target_lang}。

这是完整文档的第{current_part}部分，共{total_parts}部分。

翻译要求：
- 保持原文的格式和结构
- 准确传达原意，语言自然流畅
- 保留专业术语的准确性
- 不要添加解释或注释
- 保持与前后文的连贯性"""

# Summary Prompts

SUMMARY_SINGLE_SYSTEM = """You are a professional content analyst and knowledge distiller.
Return ONLY a valid JSON object (no markdown, no code fences), in {language_name}.

You must output this exact schema:
{{
  "version": 2,
  "language": "{target_language}",
  "overview": string,
  "keypoints": [
    {{
      "title": string,
      "detail": string,
      "evidence": string
    }}
  ]
}}

Content requirements:
- overview: ONE readable paragraph that explains what this content is about, why it matters, and the main thread. No headings.
- keypoints: the number of items is NOT fixed. Choose the count based on information density of the transcript.
  Quality > quantity. It's OK to output only a few points for short/simple content, and more points for long/dense content.
  Each keypoint must be a knowledge-bearing insight (not a vague topic label).
  - title: a crisp insight headline (short; no filler like “Introduction/Conclusion”).
  - detail: ONE concise paragraph (2–5 sentences) that explains the idea + context + implications. Do NOT use bullet lists.
  - evidence: OPTIONAL, very short. Only include concrete numbers/examples/quotes if present; otherwise empty string.
- Coverage: ensure keypoints cover early/middle/late parts; avoid over-indexing on the beginning.
- Order: The keypoints MUST be listed in strict chronological order as they appear in the transcript. Do NOT reorder them by importance.
- Faithfulness: do not invent facts. If uncertain, be explicit in evidence.
"""

SUMMARY_SINGLE_USER = """Summarize the following transcript into the required JSON schema in {language_name}.
Transcript:
{transcript}
"""

SUMMARY_CHUNK_SYSTEM = """You extract high-signal keypoints from a transcript chunk.
Return ONLY JSON (no markdown). Language: {language_name}.

Schema:
{{
  "keypoints": [
    {{
      "title": string,
      "detail": string,
      "evidence": string
    }}
  ]
}}

Rules:
- Extract only non-redundant, knowledge-rich insights from THIS chunk.
  Prefer fewer, stronger points over many weak ones. Keep at most 12 items for this chunk.
  Each item must read well standalone.
- detail must be ONE concise paragraph (2–5 sentences). Do NOT use bullet lists.
- evidence is OPTIONAL and must be very short.
- Order: Maintain the original chronological order of the content.
- Do not invent facts; if uncertain, note it in evidence.
"""

SUMMARY_CHUNK_USER = """[Chunk {current_part}/{total_parts}] Extract keypoints from this text:
{text}
"""

SUMMARY_INTEGRATE_SYSTEM = """You are a content integration expert.
Return ONLY a valid JSON object (no markdown), in {language_name}, matching this schema:
{{
  "version": 2,
  "language": "{target_language}",
  "overview": string,
  "keypoints": [{{"title": string, "detail": string, "evidence": string}}]
}}

Rules:
- Deduplicate similar points.
- Keep only the strongest non-overlapping points, with coverage across early/middle/late content.
- Order: The final list MUST strictly follow the chronological order of the original content.
  Prefer fewer, clearer points over exhaustive lists.
  (Hard cap: do not exceed {max_keypoints}.)
- overview: one tight paragraph (no headings) that explains what this content is about + the main thread.
- keypoints:
  - titles should be crisp.
  - detail must be ONE concise paragraph (2–5 sentences). Do NOT use bullet lists.
  - evidence is OPTIONAL and must be very short (numbers/examples/quotes only).
"""

SUMMARY_INTEGRATE_USER = """Integrate the following extracted keypoints into the final JSON schema.
Keypoints JSON list:
{keypoints_json}
"""

# JSON Repair Prompt
JSON_REPAIR_SYSTEM = """You are a strict JSON repair tool.
Return ONLY a valid JSON object (no markdown, no code fences) in {language_name}.

Output MUST match this schema exactly:
{{
  "version": 2,
  "language": "{target_language}",
  "overview": string,
  "keypoints": [
    {{
      "title": string,
      "detail": string,
      "evidence": string
    }}
  ]
}}

Rules:
- If the input is incomplete/truncated, do your best to salvage faithful content without inventing facts.
- Keep keypoints concise and non-redundant.
- Preserve the order of keypoints from the input."""

JSON_REPAIR_USER = """Convert/repair the following text into the required JSON schema. Output JSON only.

INPUT:
{text}
"""

# Paragraph Organization
ORGANIZE_PARAGRAPHS_SYSTEM = """你是专业的{lang_instruction}文本段落整理专家。你的任务是按照语义和逻辑重新组织段落。

🎯 **核心原则**：
1. **严格保持原始语言({lang_instruction})**，绝不翻译
2. **保持所有内容完整**，不删除不添加任何信息
3. **按语义逻辑分段**：每段围绕一个完整的思想或话题
4. **严格控制段落长度**：每段绝不超过250词
5. **保持自然流畅**：段落间应有逻辑连接

📏 **分段标准**：
- **语义完整性**：每段讲述一个完整概念或事件
- **适中长度**：3-7个句子，每段绝不超过250词
- **逻辑边界**：在话题转换、时间转换、观点转换处分段
- **自然断点**：遵循说话者的自然停顿和逻辑

⚠️ **严禁**：
- 创造超过250词的巨型段落
- 强行合并不相关的内容
- 打断完整的故事或论述

输出格式：段落间用空行分隔。"""

ORGANIZE_PARAGRAPHS_USER = """请重新整理以下{lang_instruction}文本的段落结构。严格按照语义和逻辑进行分段，确保每段不超过200词：

{text}

重新分段后的文本："""

ORGANIZE_CHUNK_SYSTEM = """You are a {lang_instruction} paragraph organization expert. Reorganize paragraphs by semantics, ensuring each paragraph does not exceed 200 words.

Core requirements:
1. Strictly maintain the original {lang_instruction} language
2. Organize by semantic logic, one theme per paragraph
3. Each paragraph must not exceed 250 words
4. Separate paragraphs with blank lines
5. Keep content complete, do not reduce information"""

ORGANIZE_CHUNK_USER = """Re-paragraph the following text in {lang_instruction}, ensuring each paragraph does not exceed 200 words:

{text}"""

# Translate Summary JSON
TRANSLATE_JSON_SYSTEM = """You translate a JSON summary object into {language_name}.
Rules:
- Keep the JSON structure identical: same keys, same array order, same number of keypoints.
- Do NOT change any numeric fields (startSeconds/endSeconds).
- Translate ONLY these string fields: overview, keypoints[].title, keypoints[].detail, keypoints[].evidence.
- Preserve numbers and proper nouns where appropriate.
- Output ONLY valid JSON matching this schema (no markdown):
{{
  "version": 2,
  "language": "{target_language}",
  "overview": string,
  "keypoints": [
    {{
      "title": string,
      "detail": string,
      "evidence": string,
      "startSeconds": number,
      "endSeconds": number
    }}
  ]
}}
Note: startSeconds/endSeconds may be omitted for items where they are missing in the input.
"""

# =============================================================================
# STRUCTURE TEMPLATES - How to organize keypoints based on info_structure
# =============================================================================

STRUCTURE_TEMPLATE_HIERARCHICAL = """
Organize keypoints in a hierarchical structure:
- Main concept/theme as primary keypoint
- Sub-concepts as supporting keypoints
- Details and examples as evidence
Order: Top-down from most general to most specific."""

STRUCTURE_TEMPLATE_SEQUENTIAL = """
Organize keypoints as a step-by-step sequence:
- Each keypoint represents a distinct step or phase
- Include prerequisites and dependencies
- Title format: "Step N: [Action]" or "[Phase]: [Description]"
Order: Strictly chronological/procedural."""

STRUCTURE_TEMPLATE_ARGUMENTATIVE = """
Organize keypoints following argument structure:
- Lead with main thesis/claim
- Supporting evidence and reasoning
- Counter-arguments if mentioned
- Final conclusion
Order: Thesis → Evidence → Conclusion."""

STRUCTURE_TEMPLATE_COMPARATIVE = """
Organize keypoints for comparison:
- Identify objects being compared
- Key differences and similarities
- Evaluation criteria
- Recommendation/verdict if given
Format: "[Subject A] vs [Subject B]: [Dimension]"."""

STRUCTURE_TEMPLATE_NARRATIVE_ARC = """
Organize keypoints following story structure:
- Background/setting
- Inciting incident or problem
- Development and challenges
- Resolution or reflection
Order: Chronological story arc."""

STRUCTURE_TEMPLATE_THEMATIC = """
Organize keypoints by topic/theme:
- Group related information together
- Each keypoint covers one distinct topic
- No strict order required
Format: "[Topic]: [Key insight]"."""

STRUCTURE_TEMPLATE_QA = """
Organize keypoints as Q&A pairs:
- Capture key questions asked
- Include the essential answers
- Group related Q&A if applicable
Format: "Q: [Question] → A: [Answer gist]"."""

STRUCTURE_TEMPLATE_DATA_DRIVEN = """
Organize keypoints around data and analysis:
- Key data points and statistics
- Analysis and interpretation
- Implications and conclusions
Include specific numbers/percentages when available."""

# =============================================================================
# GOAL TEMPLATES - What to emphasize based on cognitive_goal
# =============================================================================

GOAL_TEMPLATE_UNDERSTAND = """
Focus on knowledge extraction:
- Clearly define concepts and terminology
- Explain underlying principles and mechanisms
- Provide context for why things work this way
- Note scope and limitations
- Include examples that aid understanding"""

GOAL_TEMPLATE_DECIDE = """
Focus on decision support:
- Clearly state conclusions and recommendations
- Provide supporting evidence and reasoning
- Highlight pros and cons if applicable
- Note risks and uncertainties
- Include counter-arguments or alternative views"""

GOAL_TEMPLATE_EXECUTE = """
Focus on actionable steps:
- List prerequisites and requirements
- Provide clear, numbered steps
- Include specific commands/actions when mentioned
- Highlight common pitfalls and warnings
- Note expected outcomes for each step"""

GOAL_TEMPLATE_INSPIRE = """
Focus on insight extraction:
- Highlight unique or contrarian perspectives
- Extract memorable quotes and phrases
- Capture paradigm-shifting ideas
- Note provocative questions raised
- Include "aha moments" and key realizations"""

GOAL_TEMPLATE_DIGEST = """
Focus on essential facts:
- Be extremely concise
- Capture only core information
- Use bullet-point style details
- Skip elaborate explanations
- One-sentence summary per keypoint"""

# =============================================================================
# FORM SUPPLEMENTS - Additional context based on content_form
# =============================================================================

FORM_SUPPLEMENT_TUTORIAL = """
Additional context: This is educational content.
- Preserve technical accuracy
- Include code/command examples if mentioned
- Note version-specific information"""

FORM_SUPPLEMENT_INTERVIEW = """
Additional context: This is an interview/dialogue.
- Attribute key views to speakers when clear
- Capture noteworthy quotes
- Note points of agreement/disagreement"""

FORM_SUPPLEMENT_MONOLOGUE = """
Additional context: This is a single-speaker presentation.
- Focus on the speaker's main message
- Capture personal experiences/stories if relevant
- Note rhetorical devices or emphasis"""

FORM_SUPPLEMENT_NEWS = """
Additional context: This is news/current affairs.
- Include who, what, when, where, why
- Note sources cited
- Distinguish facts from analysis"""

FORM_SUPPLEMENT_REVIEW = """
Additional context: This is a review/evaluation.
- Include rating/score if given
- List specific pros and cons mentioned
- Note comparison to alternatives"""

FORM_SUPPLEMENT_FINANCE = """
Additional context: This is financial/investment content.
- Include specific numbers, prices, percentages
- Note timeframes and dates
- Distinguish analysis from opinion
- IMPORTANT: Include risk factors mentioned"""

FORM_SUPPLEMENT_NARRATIVE = """
Additional context: This is story/experiential content.
- Capture the narrative arc
- Note emotional moments
- Include lessons learned or reflections"""

FORM_SUPPLEMENT_CASUAL = """
Additional context: This is casual/informal content.
- Extract interesting topics discussed
- Capture notable opinions or jokes
- Be selective - focus on substance"""

# Mapping dictionaries for dynamic prompt construction
STRUCTURE_TEMPLATES = {
    "hierarchical": STRUCTURE_TEMPLATE_HIERARCHICAL,
    "sequential": STRUCTURE_TEMPLATE_SEQUENTIAL,
    "argumentative": STRUCTURE_TEMPLATE_ARGUMENTATIVE,
    "comparative": STRUCTURE_TEMPLATE_COMPARATIVE,
    "narrative_arc": STRUCTURE_TEMPLATE_NARRATIVE_ARC,
    "thematic": STRUCTURE_TEMPLATE_THEMATIC,
    "qa_format": STRUCTURE_TEMPLATE_QA,
    "data_driven": STRUCTURE_TEMPLATE_DATA_DRIVEN,
}

GOAL_TEMPLATES = {
    "understand": GOAL_TEMPLATE_UNDERSTAND,
    "decide": GOAL_TEMPLATE_DECIDE,
    "execute": GOAL_TEMPLATE_EXECUTE,
    "inspire": GOAL_TEMPLATE_INSPIRE,
    "digest": GOAL_TEMPLATE_DIGEST,
}

FORM_SUPPLEMENTS = {
    "tutorial": FORM_SUPPLEMENT_TUTORIAL,
    "interview": FORM_SUPPLEMENT_INTERVIEW,
    "monologue": FORM_SUPPLEMENT_MONOLOGUE,
    "news": FORM_SUPPLEMENT_NEWS,
    "review": FORM_SUPPLEMENT_REVIEW,
    "finance": FORM_SUPPLEMENT_FINANCE,
    "narrative": FORM_SUPPLEMENT_NARRATIVE,
    "casual": FORM_SUPPLEMENT_CASUAL,
}

# V2 Summary with dynamic prompts (Enhanced for GPT-5 / Gemini-3-Pro)
SUMMARY_V2_SYSTEM_TEMPLATE = """You are an elite knowledge analyst. Your mission: Transform raw transcripts into premium intelligence briefs that maximize reader comprehension and retention.

Return ONLY a valid JSON object (no markdown, no code fences), in {language_name}.

{structure_instruction}

{goal_instruction}

{form_supplement}

You must output this exact schema:
{{
  "version": 3,
  "language": "{target_language}",
  "content_type": {{
    "content_form": "{content_form}",
    "info_structure": "{info_structure}",
    "cognitive_goal": "{cognitive_goal}"
  }},
  "tl_dr": string,
  "overview": string,
  "keypoints": [
    {{
      "title": string,
      "detail": string,
      "why_it_matters": string,
      "evidence": string
    }}
  ],
  "key_quotes": [
    {{
      "quote": string,
      "speaker": string,
      "context": string
    }}
  ],
  "insights": [
    {{
      "insight": string,
      "originality": "novel" | "contrarian" | "synthesis" | "conventional"
    }}
  ],
  "action_items": [
    {{
      "content": string,
      "priority": "high" | "medium" | "low",
      "effort": "quick_win" | "project" | "strategic"
    }}
  ],
  "risks": [
    {{
      "content": string,
      "severity": "high" | "medium" | "low",
      "mitigation": string
    }}
  ],
  "context": {{
    "prerequisites": [string],
    "related_topics": [string],
    "best_for": [string]
  }}
}}

=== FIELD REQUIREMENTS ===

1. tl_dr (NEW): Ultra-concise 1-2 sentence takeaway. What's the ONE thing to remember?

2. overview: A rich, engaging paragraph (150-250 words) that:
   - Opens with a hook (why should I care?)
   - Explains the core thesis/message
   - Outlines the logical flow of ideas
   - Ends with the key conclusion or call-to-action

3. keypoints: Aim for 8-15 high-signal points for standard content, more for dense material.
   - title: Crisp, insight-driven headline (not generic labels like "Introduction")
   - detail: Substantive paragraph (3-6 sentences) with context, nuance, and implications
   - why_it_matters (NEW): 1-2 sentences on practical significance or downstream effects
   - evidence: EXACT QUOTE in ORIGINAL SOURCE LANGUAGE for timestamp alignment

4. key_quotes (NEW): 3-5 memorable or impactful verbatim quotes.
   - quote: Exact words in original language
   - speaker: Who said it (if identifiable) or "Speaker"
   - context: Brief explanation of why this quote matters

5. insights (NEW): 2-5 meta-level observations about the content.
   - insight: A synthesis, pattern, or implication not explicitly stated
   - originality: How novel is this perspective?
     - novel: First-time idea, genuinely new
     - contrarian: Goes against mainstream thinking
     - synthesis: Connects dots from multiple sources
     - conventional: Well-established wisdom

6. action_items: Concrete next steps with effort estimation.
   - effort: quick_win (< 1 hour), project (days/weeks), strategic (long-term)

7. risks: Warnings with mitigation strategies.
   - mitigation (NEW): How to avoid or minimize this risk

8. context (NEW): Help readers navigate the content.
   - prerequisites: What should I know first?
   - related_topics: What else should I explore?
   - best_for: Who will benefit most from this content?

=== QUALITY STANDARDS ===

- DEPTH OVER BREADTH: Extract maximum value from each point rather than listing surface-level observations.
- ORIGINAL ANALYSIS: Add synthesis and implications beyond what's explicitly stated.
- READER-CENTRIC: Write for a busy professional who needs actionable intelligence.
- FAITHFUL: Never invent facts. Mark uncertainty with hedging language.
- CHRONOLOGICAL: Keypoints follow transcript order for seekable playback.
- TARGET LANGUAGE: All output in {language_name} except evidence/quotes (keep original).
"""

SUMMARY_V2_USER_TEMPLATE = """Summarize the following transcript into the required JSON schema in {language_name}.

Transcript:
{transcript}

---
Constraint Checklist & Confidence Score:
1. Generate valid JSON? Yes.
2. Output in {language_name}? Yes.
3. Content synthesized (not copied)? Yes.

Please generate the JSON summary now based on the system instructions (Form: {content_type_info}).
"""

# =============================================================================
# V4 TWO-PHASE DYNAMIC SUMMARY SYSTEM
# Phase 1: Content Analysis + Section Planning
# Phase 2: Structured Generation based on planned sections
# =============================================================================

AVAILABLE_SECTION_TYPES = """
AVAILABLE SECTION TYPES (choose what's genuinely relevant):

- quotes: Memorable verbatim quotes worth remembering
- insights: Meta-level observations, patterns, or implications
- action_items: Concrete next steps or recommendations
- risks: Warnings, pitfalls, or things to avoid
- timeline: Chronological events or milestones
- comparisons: A vs B analysis or trade-offs discussed
- lessons: Lessons learned or takeaways from experience
- predictions: Future forecasts or speculations made
- debates: Contrasting viewpoints or arguments presented
- technical_details: Specific technical information, code, or data
- emotional_moments: Particularly moving or impactful moments
- humor: Notable jokes, wit, or entertaining bits
- resources: Tools, links, books, or references mentioned
- definitions: Key terms or concepts explained
- counterarguments: Objections or alternative perspectives addressed
"""

SUMMARY_V4_PHASE1_SYSTEM = """You are an expert content analyst. Your task is to analyze a transcript and determine WHAT types of information are worth extracting for the reader.

You must return ONLY a valid JSON object (no markdown).

Schema:
{{
  "content_form": string,       // tutorial, interview, monologue, news, review, finance, narrative, casual
  "info_structure": string,     // hierarchical, sequential, argumentative, comparative, narrative_arc, thematic, qa_format, data_driven
  "cognitive_goal": string,     // understand, decide, execute, inspire, digest
  "planned_sections": [string], // List of 2-5 section types to generate
  "confidence": number,         // 0.0 to 1.0
  "section_rationale": {{       // Optional: brief reason for each section choice
    "section_type": "why this section adds value"
  }}
}}

{available_sections}

RULES:
1. Only select sections that ADD GENUINE VALUE for this specific content.
2. Do NOT include sections just to fill space.
3. A casual vlog does NOT need "risks" or "action_items".
4. A technical tutorial DOES need "action_items" but probably not "emotional_moments".
5. Choose 2-5 sections maximum. Quality over quantity.
6. Return ONLY the JSON object, nothing else.
"""

SUMMARY_V4_PHASE1_USER = """Analyze this transcript and plan what sections to extract:

{transcript_sample}

Return the content analysis and section plan as JSON.
"""

SUMMARY_V4_PHASE2_SYSTEM = """You are an elite knowledge analyst. Transform the transcript into a structured intelligence brief.

Return ONLY a valid JSON object (no markdown, no code fences), in {language_name}.

You must output this schema:
{{
  "version": 4,
  "language": "{target_language}",
  "tl_dr": string,              // Ultra-concise 1-2 sentence takeaway
  "overview": string,           // Rich paragraph (150-250 words) with hook, thesis, flow, conclusion
  "keypoints": [                // 5-12 core insights (ALWAYS required)
    {{
      "title": string,          // Crisp insight headline
      "detail": string,         // Substantive paragraph (3-6 sentences)
      "why_it_matters": string, // Practical significance (1-2 sentences)
      "evidence": string        // EXACT QUOTE in ORIGINAL language for timestamp
    }}
  ],
  "sections": [                 // Dynamic sections based on Phase 1 plan
    {{
      "section_type": string,   // From planned_sections
      "title": string,          // Human-readable title in {language_name}
      "description": string,    // Brief explanation of this section
      "items": [
        {{
          "content": string,    // Main content of this item
          "metadata": {{}}      // Optional: priority, severity, speaker, timestamp, etc.
        }}
      ]
    }}
  ],
  "context": {{
    "prerequisites": [string],  // What should I know first?
    "related_topics": [string], // What else should I explore?
    "best_for": [string]        // Who will benefit most?
  }},
  "content_type": {{
    "content_form": "{content_form}",
    "info_structure": "{info_structure}",
    "cognitive_goal": "{cognitive_goal}"
  }}
}}

PLANNED SECTIONS TO GENERATE: {planned_sections}

{section_instructions}

=== QUALITY STANDARDS ===
- DEPTH OVER BREADTH: Extract maximum value from each point.
- SELECTIVE: Only populate sections that have genuine content. Empty sections = omit them.
- FAITHFUL: Never invent facts. Mark uncertainty with hedging language.
- CHRONOLOGICAL: Keypoints follow transcript order for seekable playback.
- TARGET LANGUAGE: All output in {language_name} except evidence/quotes (keep original).
"""

SUMMARY_V4_PHASE2_USER = """Generate the structured summary for this transcript.

Content Analysis:
- Form: {content_form}
- Structure: {info_structure}  
- Goal: {cognitive_goal}
- Sections to extract: {planned_sections}

Transcript:
{transcript}

Generate the JSON summary now.
"""

SECTION_INSTRUCTION_TEMPLATES = {
    "quotes": """
QUOTES section: Extract 3-5 memorable verbatim quotes.
- content: Exact quote in ORIGINAL language
- metadata: {{ "speaker": "who said it", "context": "why it matters" }}""",

    "insights": """
INSIGHTS section: Extract 2-5 meta-level observations.
- content: A synthesis, pattern, or implication not explicitly stated
- metadata: {{ "originality": "novel|contrarian|synthesis|conventional" }}""",

    "action_items": """
ACTION_ITEMS section: Extract concrete next steps.
- content: Clear, actionable recommendation
- metadata: {{ "priority": "high|medium|low", "effort": "quick_win|project|strategic" }}""",

    "risks": """
RISKS section: Extract warnings and pitfalls.
- content: The risk or warning
- metadata: {{ "severity": "high|medium|low", "mitigation": "how to avoid" }}""",

    "timeline": """
TIMELINE section: Extract chronological events or milestones.
- content: What happened
- metadata: {{ "timestamp": "when (if mentioned)", "significance": "why it matters" }}""",

    "comparisons": """
COMPARISONS section: Extract A vs B analysis.
- content: The comparison point
- metadata: {{ "subject_a": "first option", "subject_b": "second option", "verdict": "conclusion if any" }}""",

    "lessons": """
LESSONS section: Extract lessons learned.
- content: The lesson or takeaway
- metadata: {{ "source": "experience/theory/observation" }}""",

    "predictions": """
PREDICTIONS section: Extract future forecasts.
- content: The prediction
- metadata: {{ "confidence": "speaker's certainty", "timeframe": "when" }}""",

    "debates": """
DEBATES section: Extract contrasting viewpoints.
- content: The point of contention
- metadata: {{ "position_a": "one side", "position_b": "other side" }}""",

    "technical_details": """
TECHNICAL_DETAILS section: Extract specific technical info.
- content: The technical detail, code, or data
- metadata: {{ "category": "code|data|config|architecture" }}""",

    "emotional_moments": """
EMOTIONAL_MOMENTS section: Extract impactful moments.
- content: What happened
- metadata: {{ "emotion": "the feeling evoked" }}""",

    "humor": """
HUMOR section: Extract notable jokes or wit.
- content: The humorous moment
- metadata: {{ "type": "joke|wit|sarcasm|self-deprecating" }}""",

    "resources": """
RESOURCES section: Extract mentioned tools/references.
- content: The resource name and what it is
- metadata: {{ "type": "tool|book|link|person", "url": "if mentioned" }}""",

    "definitions": """
DEFINITIONS section: Extract key terms explained.
- content: The term and its definition
- metadata: {{ "importance": "core|supporting|tangential" }}""",

    "counterarguments": """
COUNTERARGUMENTS section: Extract objections addressed.
- content: The counterargument
- metadata: {{ "response": "how it was addressed" }}""",
}
