# VibeDigest

[vibedigest.io](https://vibedigest.io)

[English](./README.md)

VibeDigest 是一个全栈工具，用来下载视频、转录音频，并生成 AI 驱动的浓缩知识内容。系统采用控制平面 / 数据平面拆分：HTTP 负责发起任务，Supabase Realtime 负责把任务状态推回前端，前端不通过轮询获取进度。

## 快速开始

### 环境要求

- Node.js 20+
- Python 3.10+
- `uv`
- Docker / Docker Compose
- `make`

### 初始化

```bash
cp .env.example .env.local
cp frontend/.env frontend/.env.local
make install
```

`.env.local` 至少需要配置以下两种模式之一：

- `OPENROUTER_API_KEY`
- `OPENAI_BASE_URL` + `OPENAI_API_KEY`

同时请补齐 Supabase 相关密钥。

### 启动

```bash
make start-backend
make start-frontend
```

如果后端希望走 Docker：

```bash
make start-dev
make start-frontend
```

前端默认运行在 [http://localhost:3000](http://localhost:3000)，后端默认运行在 `http://localhost:16081`。

## 架构概览

```text
Frontend (Next.js App Router)
  -> POST /api/process-video
  -> Backend (FastAPI + LangGraph)
  -> Supabase task records
  -> Supabase Realtime updates back to the frontend
```

更细的实现细节请看 `docs/codemaps/`。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `make install` | 安装前后端依赖 |
| `make start-backend` | 本地运行 FastAPI |
| `make start-frontend` | 本地运行 Next.js |
| `make test-backend` | 后端单测，加上条件满足时的本地 smoke |
| `make test-frontend` | 前端单测 |
| `cd frontend && npm run build` | 前端生产构建校验 |
| `make clean` | 清理本地生成物 |

## 文档归属

| 事实或流程 | 权威文档 |
| --- | --- |
| AI 规则、项目强约束、文档归属 | [AGENTS.md](./AGENTS.md) |
| 本地启动与核心命令 | [README.md](./README.md) |
| 开发流程与 PR 规范 | [CONTRIBUTING.md](./CONTRIBUTING.md) |
| 部署、监控、回滚 | [docs/RUNBOOK.md](./docs/RUNBOOK.md) |
| 架构与目录映射 | [docs/codemaps/architecture.md](./docs/codemaps/architecture.md) |
| 测试策略、前置条件、覆盖率政策 | [docs/testing/README.md](./docs/testing/README.md) |

## 其他文档

- [贡献指南](./CONTRIBUTING.md)
- [运行手册](./docs/RUNBOOK.md)
- [安全策略](./SECURITY.md)
- [更新日志](./CHANGELOG.md)

## License

许可证见 [LICENSE](./LICENSE)。
