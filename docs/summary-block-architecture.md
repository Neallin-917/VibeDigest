# Implementation Plan: Unified Summary Block Rendering Architecture

> **Status**: Historical draft (superseded for chat, 2026-08-06)
> **Created**: 2026-01-30  
> **Author**: AI Assistant  

> 当前聊天面使用 `TaskDataGroup` 消费已持久化的任务/摘要数据：元数据到达时先展示播放器，摘要完成后追加极简知识卡片。本文保留为历史架构探索，不引用已删除的 `VideoDetailPanel`。

---

## 1. 目标

**核心目标**：建立一套"Block Type → Block Renderer"的统一渲染架构，使 SDK 输出与 UI 渲染解耦，支持渐进式扩展。

**设计原则**：
- **工程简单**：核心 schema 稳定，新功能只加 block type
- **可扩展性强**：新增字段 = 新增 block type + Renderer，无需改核心代码
- **向后兼容**：v2 现有字段映射为 block，不破坏已有数据

---

## 2. 核心概念

### 2.1 Block 定义

```typescript
interface Block<T = unknown> {
  type: string        // 渲染分发键
  data: T             // block 类型专属数据
  meta?: {            // 可选元信息
    order?: number    // 渲染顺序（覆盖默认）
    visible?: boolean // 是否渲染
  }
}
```

### 2.2 Block Types（初始集）

| Block Type | 数据来源 | 用途 |
|------------|----------|------|
| `overview` | v2.overview | 总览段落 |
| `keypoint` | v2.keypoints[] | 关键洞察卡片 |
| `action_item` | v2.action_items[] | 行动项 |
| `risk` | v2.risks[] | 风险提示 |

### 2.3 扩展 Block Types（后续）

| Block Type | 用途 | Phase |
|------------|------|-------|
| `hook` | 吸引力开场 | 2 |
| `highlight` | 金句/引用 | 2 |
| `glossary` | 术语解释 | 3 |
| `timeline_anchor` | 时间戳锚点 | 3 |

---

## 3. 架构设计

### 3.1 数据流

```
┌─────────────────────────────────────────────────────────────────┐
│                         Backend                                  │
│                                                                  │
│  LLM Response ──▶ Summarizer ──▶ SummaryV2 JSON                 │
│                                        │                         │
│                                        ▼                         │
│                              BlockTransformer                    │
│                              (v2 → blocks[])                     │
│                                        │                         │
│                                        ▼                         │
│                              task_outputs.content                │
│                              (JSON with blocks[])                │
└─────────────────────────────────────────────────────────────────┘
                                         │
                          Supabase Realtime / REST
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend                                 │
│                                                                  │
│  useSummary(taskId) ──▶ parse content ──▶ blocks[]              │
│                                                │                 │
│                                                ▼                 │
│                                      <SummaryRenderer>           │
│                                                │                 │
│                         ┌──────────────────────┼──────────┐     │
│                         ▼                      ▼          ▼     │
│                   OverviewBlock         KeypointCard    ...     │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 前端组件结构

```
src/components/summary/
├── SummaryRenderer.tsx      # 主渲染器，遍历 blocks
├── BlockRegistry.ts         # type → Component 映射表
├── blocks/
│   ├── OverviewBlock.tsx
│   ├── KeypointCard.tsx
│   ├── ActionItemBlock.tsx
│   ├── RiskBlock.tsx
│   └── index.ts             # 导出所有 blocks
├── hooks/
│   └── useSummaryBlocks.ts  # 数据获取 + 解析
└── types.ts                 # Block 类型定义
```

### 3.3 BlockRegistry 设计

```typescript
// BlockRegistry.ts
type BlockComponent<T = unknown> = React.FC<{ data: T; meta?: BlockMeta }>

const BlockRegistry: Record<string, BlockComponent> = {
  overview: OverviewBlock,
  keypoint: KeypointCard,
  action_item: ActionItemBlock,
  risk: RiskBlock,
  // 扩展点：新增 block type 只需加一行
}

// 未知类型降级处理
const FallbackBlock: BlockComponent = ({ data }) => (
  <div className="text-sm text-muted">{JSON.stringify(data)}</div>
)

export function getBlockComponent(type: string): BlockComponent {
  return BlockRegistry[type] ?? FallbackBlock
}
```

---

## 4. Schema 设计

### 4.1 输出格式（task_outputs.content）

```json
{
  "version": 3,
  "language": "zh",
  "content_type": {
    "content_form": "tutorial",
    "info_structure": "sequential",
    "cognitive_goal": "execute"
  },
  "blocks": [
    {
      "type": "overview",
      "data": {
        "text": "本视频讲解了...",
        "hook": "3分钟掌握核心要点"
      }
    },
    {
      "type": "keypoint",
      "data": {
        "title": "关键洞察1",
        "detail": "详细说明...",
        "evidence": "原文引用...",
        "startSeconds": 120
      }
    },
    {
      "type": "action_item",
      "data": {
        "content": "下一步行动",
        "priority": "high"
      }
    }
  ]
}
```

### 4.2 向后兼容策略

```typescript
// 前端解析层自动转换 v2 → blocks[]
function normalizeToBlocks(content: unknown): Block[] {
  if (hasBlocksArray(content)) {
    return content.blocks // v3 格式，直接用
  }
  
  // v2 兼容：转换为 blocks
  const v2 = content as SummaryV2
  const blocks: Block[] = []
  
  if (v2.overview) {
    blocks.push({ type: 'overview', data: { text: v2.overview } })
  }
  v2.keypoints?.forEach(kp => {
    blocks.push({ type: 'keypoint', data: kp })
  })
  v2.action_items?.forEach(item => {
    blocks.push({ type: 'action_item', data: item })
  })
  v2.risks?.forEach(risk => {
    blocks.push({ type: 'risk', data: risk })
  })
  
  return blocks
}
```

---

## 5. 实施阶段

### Phase 1: 基础架构（不改后端）

**目标**：前端建立 Block 渲染架构，兼容现有 v2 数据

| 任务 | 文件 | 说明 |
|------|------|------|
| 1.1 | `types.ts` | 定义 Block 类型 |
| 1.2 | `BlockRegistry.ts` | 创建 type → Component 映射 |
| 1.3 | `blocks/*.tsx` | 迁移现有 UI 为独立 Block 组件 |
| 1.4 | `useSummaryBlocks.ts` | v2 → blocks[] 转换逻辑 |
| 1.5 | `SummaryRenderer.tsx` | 主渲染器 |
| 1.6 | 替换历史 `VideoDetailPanel` | 使用新架构 |

**产出**：前端完成解耦，现有功能不变

---

### Phase 2: 后端输出 blocks[]

**目标**：后端直接输出 blocks[] 格式，前端跳过转换

| 任务 | 文件 | 说明 |
|------|------|------|
| 2.1 | `prompts.py` | 新增 SUMMARY_V3_BLOCKS 模板 |
| 2.2 | `summarizer.py` | 输出 blocks[] 格式 |
| 2.3 | `useSummaryBlocks.ts` | 识别 v3 格式直接使用 |

**产出**：端到端 blocks[] 流程

---

### Phase 3: 扩展 Block Types

**目标**：增加可读性增强字段

| 任务 | Block Type | 说明 |
|------|------------|------|
| 3.1 | `hook` | 吸引力开场（overview 子字段 → 独立 block） |
| 3.2 | `highlight` | 金句卡片（新增） |
| 3.3 | `keypoint.impact` | 关键点增加"为什么重要" |

**产出**：可读性显著提升

---

### Phase 4: 高级特性（可选）

| 任务 | 说明 |
|------|------|
| 4.1 | Layout modes（reader/cards/timeline） |
| 4.2 | Block 排序/过滤 UI |
| 4.3 | 用户自定义 Block 显示偏好 |

---

## 6. 技术决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 状态管理 | Supabase Realtime（保留） | 已有，适合持久化 |
| Block 渲染 | Registry 映射表 | 简单可扩展 |
| 向后兼容 | 前端转换层 | 不破坏现有数据 |
| 版本标识 | `version: 3` | 区分新旧格式 |
| 未知 Block | FallbackBlock | 优雅降级 |

---

## 7. 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| v2 数据兼容 | Phase 1 先做转换层，验证通过再推进 |
| 渲染性能 | blocks[] 通常 < 30 项，无需虚拟化 |
| Block 类型膨胀 | 严格审核新增 type，保持核心集精简 |

---

## 8. 验收标准

### Phase 1 完成标准
- [ ] 历史 VideoDetailPanel 使用 SummaryRenderer
- [ ] 现有 v2 数据正常渲染
- [ ] 新增 Block type 只需改 BlockRegistry + 新组件

### Phase 2 完成标准
- [ ] 后端输出 blocks[] 格式
- [ ] 前端识别 v3 格式无需转换

### Phase 3 完成标准
- [ ] hook/highlight blocks 可用
- [ ] 用户可读性反馈正向

---

## 9. 相关文档

- [AGENTS.md](../AGENTS.md) - 项目架构总览
- [frontend_data_plane.md](./frontend_data_plane.md) - 前端数据流设计
- [backend/prompts.py](../backend/prompts.py) - Summary 模板定义
