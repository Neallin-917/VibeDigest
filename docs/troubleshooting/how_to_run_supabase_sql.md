# Supabase 数据库诊断与迁移

生产 schema 的唯一仓库来源是 `supabase/migrations/`。不要从
`backend/sql/`、临时 Python 脚本或 Dashboard 中复制一份平行 schema。

## 只读诊断

先运行项目自带的连接检查：

```bash
uv run python backend/scripts/db/check_connection.py
```

临时 SQL 诊断应保持只读，并显式使用环境中的 `DATABASE_URL`：

```bash
psql "$DATABASE_URL" -c \
  "select id, status, created_at from public.tasks order by created_at desc limit 5"
```

不要在命令行、日志或文档中打印连接串、service key 或 JWT secret。

## Schema 变更

1. 在 `supabase/migrations/` 新建有序、可审阅的 migration。
2. 先在隔离的 Supabase development branch 或一次性测试数据库执行完整
   migration chain。
3. 运行 `make test-queue-integration`、`make test-backend` 与前端 build。
4. 对已有项目先比较远端 migration history；存在漂移时按
   `docs/RUNBOOK.md` 做 reconcile，不要直接强推。
5. 生产发布优先 roll forward；破坏性回滚必须有备份和人工批准。

数据库写操作不属于常规排障。诊断阶段只收集 schema、migration、policy、
index 与 extension 的元数据，确认目标后再进入发布流程。
