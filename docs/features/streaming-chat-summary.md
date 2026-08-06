# Feature: Streaming Structured Summary in Chat

> **Status**: Superseded by the persisted inline-task implementation (2026-08-06)
> **Created**: 2026-02-01  
> **Depends On**: [summary-block-rendering.md](./summary-block-rendering.md)  
> **Owner**: @haoran

---

## Problem Statement

用户提问时，希望在**对话框内流式输出结构化的 Summary UI**，而不是等待右侧面板加载完成。

当前实现：
- URL 提交后立即创建并持久化一条 `data-task-status` 消息。
- 任务记录经 Supabase Realtime 更新；视频标题或封面到达时，该消息立即渲染可播放 iframe。
- 摘要输出持久化后，同一消息只追加一条结论和最多两张关键洞察，不等待页面右侧面板。
- 时间戳只保留为内部结构化证据，不参与播放器跳转，直到内容定位可靠性被重新验证。

本文余下内容保留为 2026-02 的技术探索记录，不能作为当前产品行为或实现路线的依据。

---

## Goals

1. **即时反馈**：用户提问后，立即看到 Summary 组件逐个渲染
2. **一致体验**：Chat 内的 Summary 渲染与右侧面板保持一致
3. **渐进增强**：从简单方案开始，逐步增加实时性

---

## Technical Challenge

### 核心问题：Streaming JSON 无法直接渲染

```
LLM 流式输出: {"keypoints": [{"title": "AI的突破
                              ↑
                              无法解析！JSON 不完整
```

结构化 UI 需要完整的数据结构，但流式输出是逐 token 的。

---

## Solution Options

### Option A: Streaming JSON Parser

使用增量 JSON 解析器，边接收边渲染：

```typescript
import { JSONParser } from '@streamparser/json';

const parser = new JSONParser({ paths: ['$.keypoints[*]'] });
parser.onValue = ({ value }) => {
  // 每解析出一个 keypoint，立即渲染
  appendToUI(<KeypointCard data={value} />);
};

for await (const chunk of llmStream) {
  parser.write(chunk);
}
```

| Pros | Cons |
|------|------|
| 真正的实时渲染 | 实现复杂 |
| 用户体验最佳 | 错误处理困难 |
| | Schema 变化需要同步更新 parser |

**评估**：技术难度高，Phase 3+ 考虑

---

### Option B: Section-by-Section Tool Calls (Recommended)

**核心思想**：让 LLM 逐个调用 Tool，每个 Tool 对应一个 UI Block。

```typescript
// 后端定义多个渲染 Tool
const tools = {
  render_overview: tool({
    execute: async ({ headline, tagline }) => 
      ({ type: 'overview', headline, tagline })
  }),
  
  render_keypoint: tool({
    execute: async ({ title, detail, timestamp }) => 
      ({ type: 'keypoint', title, detail, timestamp })
  }),
  
  render_quote: tool({
    execute: async ({ speaker, text }) => 
      ({ type: 'quote', speaker, text })
  }),
};

// 前端：每个 Tool Result 立即渲染
function renderToolPart(part) {
  switch (part.output?.type) {
    case 'overview': return <OverviewCard {...part.output} />;
    case 'keypoint': return <KeypointCard {...part.output} />;
    case 'quote': return <QuoteCard {...part.output} />;
  }
}
```

**用户体验**：

```
[用户]: 总结这个视频

[AI]: 正在分析...
      ┌─────────────────────────┐
      │  Overview               │  ← Tool #1 完成
      │  Jensen黄谈AI未来       │
      └─────────────────────────┘
      
      ┌─────────────────────────┐
      │  Keypoint #1            │  ← Tool #2 完成
      │  CUDA改变了一切         │
      └─────────────────────────┘
      
      ┌─────────────────────────┐
      │  Keypoint #2            │  ← Tool #3 完成
      │  AI Scaling Law         │
      └─────────────────────────┘
      ...
```

| Pros | Cons |
|------|------|
| 利用现有 Tool 基础设施 | 需要改 Prompt |
| 每个组件独立渲染 | Tool 调用有开销 |
| 健壮，易于扩展 | LLM 可能不按顺序调用 |
| 无需解析半成品 JSON | |

**评估**：推荐方案，工期 2-3 天

---

### Option C: Hybrid (Markdown Stream + Final Blocks)

```
[AI文字流]: 这个视频讨论了AI的未来发展方向...（实时出字）

[处理完成后]:
┌─ Summary Card ─────────────────┐
│ Headline: Jensen黄深度解析...  │
│ Keypoints: [...]               │
└────────────────────────────────┘
```

| Pros | Cons |
|------|------|
| 实现简单 | 体验分裂 |
| 文字部分即时 | 结构化内容仍需等待 |

**评估**：过渡方案，可快速实现

---

## Recommended Implementation Path

| Phase | 内容 | 工期 | 依赖 |
|-------|------|------|------|
| **Phase 0** | 保持现状（Summary 在右侧面板） | 0 | - |
| **Phase 1** | Chat 中渲染 Summary Tool Result 为卡片 | 1d | Block 组件就绪 |
| **Phase 2** | Section-by-Section Tool Calls | 2-3d | Phase 1 |
| **Phase 3** | 真正的 Streaming JSON Parser | 5d+ | 需求验证 |

---

## Phase 1: Summary Cards in Chat

### 目标

当 `get_task_outputs` Tool 返回 Summary 时，在 Chat 中渲染为漂亮的卡片。

### 改动范围

| 文件 | 改动 |
|------|------|
| `ChatContainer.tsx` | 识别 summary output，渲染为卡片 |
| `components/chat/tools/` | 新增 `SummaryResultCard.tsx` |

### 实现

```tsx
// tools/GetTaskOutputsTool.tsx
function GetTaskOutputsTool({ output }) {
  const summaryOutput = output?.outputs?.find(o => o.kind === 'summary');
  
  if (summaryOutput) {
    const parsed = JSON.parse(summaryOutput.content);
    return <SummaryCard data={parsed} />;
  }
  
  return <DefaultOutputDisplay output={output} />;
}
```

---

## Phase 2: Section-by-Section Tools

### 新增 Tools

```typescript
// /api/chat/route.ts

const summarySectionTools = {
  render_summary_overview: tool({
    description: "Render the summary overview section",
    inputSchema: z.object({
      headline: z.string(),
      tagline: z.string().optional(),
      hook: z.string().optional(),
    }),
    execute: async (data) => ({ type: 'summary_overview', ...data }),
  }),
  
  render_summary_keypoint: tool({
    description: "Render a single keypoint from the summary",
    inputSchema: z.object({
      title: z.string(),
      detail: z.string(),
      evidence: z.string().optional(),
      startSeconds: z.number().optional(),
    }),
    execute: async (data) => ({ type: 'summary_keypoint', ...data }),
  }),
  
  render_summary_quote: tool({
    description: "Render a notable quote from the video",
    inputSchema: z.object({
      speaker: z.string(),
      text: z.string(),
      timestamp: z.number().optional(),
    }),
    execute: async (data) => ({ type: 'summary_quote', ...data }),
  }),
};
```

### System Prompt 调整

```
When presenting video summaries in chat, use the render_summary_* tools:
1. Call render_summary_overview FIRST with the main headline
2. Call render_summary_keypoint for EACH key insight (typically 3-7)
3. Call render_summary_quote for any notable quotes
4. Do NOT output the summary as plain text - always use the rendering tools
```

### 前端渲染

```tsx
// ChatContainer.tsx - renderToolPart()

case 'render_summary_overview':
  return <OverviewBlock data={result} />;

case 'render_summary_keypoint':
  return <KeypointCard data={result} />;

case 'render_summary_quote':
  return <QuoteBlock data={result} />;
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                           Chat Flow                             │
│                                                                 │
│  User: "总结这个视频"                                            │
│            │                                                    │
│            ▼                                                    │
│  ┌─────────────────┐                                           │
│  │  /api/chat      │                                           │
│  │  streamText()   │                                           │
│  └────────┬────────┘                                           │
│           │                                                    │
│           ▼                                                    │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  LLM (with render_summary_* tools)                       │  │
│  │                                                          │  │
│  │  1. render_summary_overview({ headline: "..." })         │  │
│  │  2. render_summary_keypoint({ title: "...", ... })       │  │
│  │  3. render_summary_keypoint({ title: "...", ... })       │  │
│  │  4. render_summary_quote({ speaker: "...", text: "..." })│  │
│  └─────────────────────────────────────────────────────────┘  │
│           │                                                    │
│           ▼ (streaming tool results)                           │
│  ┌─────────────────┐                                           │
│  │  ChatContainer  │                                           │
│  │  renderToolPart │                                           │
│  └────────┬────────┘                                           │
│           │                                                    │
│           ▼                                                    │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  UI Components                                           │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐        │  │
│  │  │OverviewBlock│ │KeypointCard │ │ QuoteBlock  │        │  │
│  │  └─────────────┘ └─────────────┘ └─────────────┘        │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Shared Components Strategy

为确保 Chat 和 DetailPanel 渲染一致：

```
src/components/summary/
├── blocks/                    # 可复用 Block 组件
│   ├── OverviewBlock.tsx     # Chat + Panel 共用
│   ├── KeypointCard.tsx      # Chat + Panel 共用
│   └── QuoteBlock.tsx        # Chat + Panel 共用
├── SummaryRenderer.tsx       # 用于 Panel（渲染 blocks[]）
└── index.ts

src/components/chat/tools/
├── GetTaskOutputsTool.tsx    # 当前：显示 Tool 结果
└── SummaryToolParts.tsx      # 新增：包装 summary blocks 为 tool part
```

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-01 | 选择 Option B (Tool-based) | 利用现有基础设施，风险可控 |
| 2026-02-01 | 先做 Phase 1 | 验证卡片渲染效果 |
| 2026-02-01 | Block 组件共享 | 保持 Chat 和 Panel 一致性 |

---

## Open Questions

1. **Tool 调用顺序**：如何确保 LLM 按正确顺序调用 render_summary_* tools？
2. **性能**：多个 Tool 调用是否比单个 JSON 输出慢？
3. **回退**：如果 LLM 不调用 Tool，如何优雅降级？
4. **编辑/重新生成**：用户想修改某个 keypoint，如何处理？

---

## Related Files

- `frontend/src/app/api/chat/route.ts` - Chat API (Tool 定义)
- `frontend/src/components/chat/ChatContainer.tsx` - Chat 渲染
- `frontend/src/components/chat/tools/` - Tool UI 组件
- `docs/features/summary-block-rendering.md` - Block 架构依赖
