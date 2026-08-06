# Test Scenarios & Coverage (User Journeys)

本文档旨在提供粒度更细的测试覆盖追踪，罗列具体的业务场景、UI 交互和后端逻辑。

> **当前状态**: 
> - **Frontend**: 重点转向 `/chat` 相关组件，Dashboard 组件已弃用。
> - **E2E**: 核心覆盖 `chat.spec.ts` 和 `task-creation.spec.ts`。

---

## 🖥 Frontend (前端)

### 🔴 E2E 关键流程 (End-to-End)
> 运行命令: `npx playwright test e2e/`

#### 1. Chat Interface (`e2e/chat.spec.ts`) - **核心 (P0)**
- **Welcome Screen**
    - [x] **空状态**: 显示欢迎语和行内输入框 (Typewriter)。
    - [ ] **示例卡片**: 点击示例卡片应直接填充并提交。
- **对话交互**
    - [x] **提交 URL**: 发送 YouTube 链接，显示 Loading 状态。
    - [x] **渐进式任务消息**: URL 提交后先渲染任务消息；视频元数据到达后，在同一消息中显示可播放 iframe。
- [x] **知识卡片**: 摘要输出写入后，在播放器下追加一条结论与最多两条关键洞察；在有明确对比、可比数值或步骤时，追加经过校验的表格、柱状图或步骤卡；时间戳不触发播放器跳转。
- **消息渲染**
    - [ ] **AI 回复**: 正常显示文本消息 (Markdown)。
- [ ] **工具状态**: 显示 "Thinking..." 或工具调用过程 (可选)。

#### 本地交互演示（无服务依赖）

- `cd frontend && npm run demo:chat` 启动确定性 fixture。
- 提交公开 YouTube 或 Bilibili 链接后，应依次看到：任务状态、可播放 iframe、结论、两条关键洞察、对比表和轻量柱状图。
- 不连接 Supabase、FastAPI、Worker 或模型服务；真实 Auth/Realtime 验证仍走独立的本地 Supabase 或 E2E 流程。

#### 2. 获客流程 (`e2e/task-creation.spec.ts`)
- **Landing Page**
    - [x] **未登录提交**: 输入 URL -> Generate -> 跳转 `/login`。
    - [x] **校验拦截**: 空 URL 或无效格式显示错误提示。

#### 3. 基础冒烟 (`e2e/smoke.spec.ts`)
- [x] **页面加载**: Landing, Login, Explore 页面无 500/404。
- [x] **关键元素**: Logo, 导航, 语言切换器可见。
- [x] **SEO**: Meta 标签检查。

---

### 📦 Component Unit Tests (组件单元测试)

#### 1. Chat Components (`src/components/chat`)
- [x] `ChatWorkspace.tsx`: Main chat layout and provider integration (`ChatWorkspace.test.tsx`).
- [ ] `ChatInput.tsx`: 输入框交互, 提交, Loading 状态禁用。
- [x] `TaskDataGroup.tsx`: 任务 Realtime 订阅、行内播放器和极简知识卡片 (`TaskDataGroup.test.tsx`)。
- [ ] `WelcomeScreen.tsx`: 示例加载, 布局响应式。

#### 2. Sidebar & Navigation
- [x] `Sidebar.tsx`: 历史记录列表加载, 删除操作, 路由切换.
- [x] `LandingNav.tsx`: 落地页导航, 语言切换,锚点跳转.
- [ ] `LibrarySidebar.tsx`: 搜索过滤逻辑。

#### 3. Legacy Components (Deprecated)
- `Dashboard/*`: 已停止维护，无需新增测试。

---

## ⚙️ Backend (后端)

### 核心逻辑模块
- **LangGraph Workflow**
    - [x] **State Management**: 状态流转 (Processing -> Completed)。
    - [x] **Tools**: Whisper, Summarizer 异常处理。
- **API Routes**
    - [x] `/api/chat`: AI SDK v6 接入, 消息流式传输, 鉴权与 mockDB 验证 (`route.test.ts`).

---
