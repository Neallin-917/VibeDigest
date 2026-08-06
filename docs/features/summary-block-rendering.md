# Feature: Summary Block Rendering Enhancement

> **Status**: Historical proposal (superseded for chat, 2026-08-06)
> **Created**: 2026-02-01  
> **Related**: [summary-block-architecture.md](../summary-block-architecture.md)  
> **Owner**: @haoran

> 当前产品在 `TaskDataGroup` 中以行内播放器、单条结论和最多两张关键洞察卡片渲染已持久化结果；不再有 `VideoDetailPanel` 或交互式时间戳跳转。本文余下内容是历史方案，不是当前实现约束。

---

## Problem Statement

用户反馈："**结论太简单，UI 渲染太单调，可读性不好**"

当前 Summary 输出是固定字段的扁平 JSON，前端渲染为简单列表，缺乏视觉层次和内容深度。

---

## Goals

1. **提升可读性**：Summary 内容支持富文本格式（Markdown）
2. **增加内容深度**：允许 LLM 输出更丰富的结构（引用、对比表、FAQ 等）
3. **架构可扩展**：新增内容类型不需要改核心代码

---

## Solution Overview

采用**渐进式实施**策略，分两步验证：

| Phase | 内容 | 风险 | 工期 |
|-------|------|------|------|
| **0.5** | Markdown 增强（保持现有 Schema） | 极低 | 2h |
| **1.0** | Block-Based 架构（完整重构） | 中 | 2-3d |

---

## Phase 0.5: Markdown Enhancement (Quick Win)

### 改动范围

| 层 | 文件 | 改动 |
|----|------|------|
| Backend | `backend/prompts.py` | 允许 `keypoints.detail` 使用 Markdown |
| Frontend | 历史 `VideoDetailPanel.tsx` | 用 `react-markdown` 渲染 detail 字段 |

### 实现步骤

#### Step 1: 修改 Prompt

```python
# backend/prompts.py - SUMMARY_V2_SYSTEM_TEMPLATE

# 在 keypoints 说明中添加：
"detail": "深入解释该洞察点，可使用 Markdown 格式：
  - **加粗** 强调关键术语
  - 使用列表组织多个子点
  - 必要时使用 `代码块` 标注技术名词"
```

#### Step 2: 前端渲染

```bash
cd frontend && npm install react-markdown
```

```tsx
// 历史 VideoDetailPanel.tsx
import ReactMarkdown from 'react-markdown';

// 替换 {kp.detail} 为：
<ReactMarkdown className="prose prose-sm dark:prose-invert">
  {kp.detail}
</ReactMarkdown>
```

### 验收标准

- [ ] detail 中的 **加粗**、列表、代码块正确渲染
- [ ] 现有数据（纯文本）不受影响
- [ ] 无 XSS 风险（react-markdown 默认安全）

---

## Phase 1.0: Block-Based Architecture

> 详细设计见 [summary-block-architecture.md](../summary-block-architecture.md)

### 核心概念

```typescript
interface Block<T = unknown> {
  type: string      // 渲染分发键
  data: T           // block 专属数据
}

// 示例 Block Types
type BlockType = 
  | 'overview'       // 总览
  | 'keypoint'       // 关键洞察
  | 'quote'          // 金句引用
  | 'comparison'     // 对比表
  | 'faq'            // 问答
  | 'action_item'    // 行动项
  | 'risk'           // 风险提示
```

### 前端架构

```
src/components/summary/
├── SummaryRenderer.tsx      # 主渲染器
├── BlockRegistry.ts         # type → Component 映射
├── blocks/
│   ├── OverviewBlock.tsx
│   ├── KeypointCard.tsx
│   ├── QuoteBlock.tsx
│   ├── ComparisonTable.tsx
│   ├── FAQBlock.tsx
│   └── ...
└── hooks/
    └── useSummaryBlocks.ts  # v2 → blocks[] 兼容层
```

### 后端 Schema (v3)

```json
{
  "version": 3,
  "blocks": [
    { "type": "overview", "data": { "text": "...", "hook": "..." } },
    { "type": "keypoint", "data": { "title": "...", "detail": "...", "startSeconds": 120 } },
    { "type": "quote", "data": { "speaker": "Jensen Huang", "text": "..." } },
    { "type": "comparison", "data": { "headers": [...], "rows": [...] } }
  ]
}
```

### 向后兼容

前端自动将 v2 数据转换为 blocks[]：

```typescript
function normalizeToBlocks(content: unknown): Block[] {
  if (content.blocks) return content.blocks;  // v3
  
  // v2 兼容
  const blocks: Block[] = [];
  if (content.overview) blocks.push({ type: 'overview', data: { text: content.overview } });
  content.keypoints?.forEach(kp => blocks.push({ type: 'keypoint', data: kp }));
  // ...
  return blocks;
}
```

### 实施顺序

| Step | 任务 | 依赖 |
|------|------|------|
| 1.1 | 创建 `types.ts` + `BlockRegistry.ts` | - |
| 1.2 | 迁移现有 UI 为独立 Block 组件 | 1.1 |
| 1.3 | 创建 `useSummaryBlocks.ts` 兼容层 | 1.1 |
| 1.4 | 创建 `SummaryRenderer.tsx` | 1.2, 1.3 |
| 1.5 | 替换历史 `VideoDetailPanel` 使用新架构 | 1.4 |
| 1.6 | 后端输出 v3 格式（可选） | 1.5 验证通过后 |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-01 | 先做 Phase 0.5 验证 | 最小风险验证"Markdown 是否够用" |
| 2026-02-01 | 保留 v2 兼容层 | 不破坏线上数据 |

---

## Open Questions

1. **Block 类型边界**：哪些内容应该是独立 Block？哪些是 Keypoint 的子字段？
2. **LLM 稳定性**：让 LLM 选择 Block 类型，如何保证输出稳定性？
3. **性能**：blocks[] 过多是否需要虚拟滚动？

---

## Related Files

- `backend/prompts.py` - Summary Prompt 模板
- `backend/services/summarizer/models.py` - Pydantic Schema
- `frontend/src/components/chat/VideoDetailPanel.tsx` - 历史渲染组件（已删除）
- `docs/summary-block-architecture.md` - 详细架构设计
