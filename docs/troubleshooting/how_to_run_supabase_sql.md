# 如何运行 Supabase Database SQL

本文档记录了如何在本地环境连接和查询 Supabase 数据库，涵盖了命令行工具 (`psql`) 和 Python 脚本两种方式，并包含了常见问题的解决方案。

## 前置条件

1.  **环境变量配置**:
    确保你的 `.env` 或 `.env.local` 文件中包含了 `DATABASE_URL`。
    
    格式如下：
    ```bash
    DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres"
    ```
    *注意：生产环境通常使用 Transaction Pooler (端口 6543)。*

2.  **获取连接串**:
    你可以从 Supabase Dashboard 的 `Settings -> Database -> Connection string -> URI` 中找到。

---

## 方法一：使用 `psql` (命令行)

这是最直接的方式，适合快速检查数据或运行简单的 SQL 语句。

### 1. 运行单条 SQL
```bash
# 从命令行直接运行
psql "$DATABASE_URL" -c "SELECT * FROM tasks LIMIT 5;"
```

### 2. 进入交互式 Shell
```bash
psql "$DATABASE_URL"
# 进入后可以输入 SQL，例如：
# \d            (查看所有表)
# select now(); (查看当前时间)
# \q            (退出)
```

### 3. 运行 SQL 文件
```bash
psql "$DATABASE_URL" -f backend/sql/your_script.sql
```

---

## 方法二：使用 Python 脚本 (`DBClient`)

如果你需要结合业务逻辑或处理复杂数据，建议使用项目中的 `DBClient`。

### 1. 脚本模板
在 `backend/scripts/` 下创建一个新脚本，例如 `query_demo.py`：

```python
import os
import sys
import json

# --- 关键修复：防止 ImportError ---
# 在修改 sys.path 之前先尝试导入 supabase
# 这是因为项目根目录下可能有 supabase 文件夹，会导致命名空间冲突
try:
    import supabase
except ImportError:
    pass
# --------------------------------

# 将项目根目录添加到 python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.db_client import DBClient

def main():
    # 确保环境变量已加载 (如果未通过 IDE 运行，可能需要手动 export 或使用 python-dotenv)
    if not os.environ.get("DATABASE_URL"):
        print("Error: DATABASE_URL not set.")
        return

    client = DBClient()
    
    #示例：查询任务
    query = "SELECT id, status, video_url FROM tasks LIMIT 5"
    results = client._execute_query(query)
    
    print(json.dumps(results, indent=2, default=str))

if __name__ == "__main__":
    main()
```

### 2. 运行脚本
```bash
# 方式 A: 直接带入环境变量运行
DATABASE_URL="postgresql://..." python3 backend/scripts/query_demo.py

# 方式 B: 如果 .env 已配置，使用 export (在此项目环境中通常手动指定更稳妥)
export $(cat .env.local | xargs) && python3 backend/scripts/query_demo.py
```

---

## 常见问题排除 (Troubleshooting)

### 0. 先跑连接诊断脚本

仓库内已经提供了一个更明确的连接诊断：

```bash
uv run backend/scripts/db/check_connection.py
```

它会分别检查：

- `SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY`
- `DATABASE_URL`

并直接指出是：

- 项目 ref 不一致
- `SUPABASE_SERVICE_KEY` 失效
- `DATABASE_URL` 失效
- 或者整套配置都过期

### 1. `ImportError: cannot import name 'create_client' from 'supabase'`

**现象**: 运行 Python 脚本时报错，找不到 `create_client`。
**原因**: 项目目录中或其他依赖中存在与 `supabase` 库同名的文件夹或模块，导致 Python 的导入路径混乱（Shadowing）。
**解决**:
在脚本的最上方（`sys.path.append` 之前）显式导入一次 `supabase`。

```python
try:
    import supabase
except ImportError:
    pass
# 然后再修改 sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
```

### 2. `Connection refused` 或 `Timeout`

**原因**: 
1. `DATABASE_URL` 错误。
2. 网络问题（需翻墙或网络不稳定）。
3. 数据库暂停（Supabase 免费版若 7 天无活动会自动暂停）。

**解决**:
- 检查 Supabase Dashboard 确认项目状态是 Active。
- 尝试使用 `ping` 或 `telnet` 测试端口连通性。
- 确认密码是否包含特殊字符（需要 URL 编码）。

### 3. `Unregistered API key`

如果诊断脚本显示：

- `NEXT_PUBLIC_SUPABASE_ANON_KEY` 正常
- `SUPABASE_SERVICE_KEY` 返回 `Unregistered API key`
- `DATABASE_URL` 同时也连不上

通常说明 `.env.local` 中的管理员凭证已经过期，但项目本身没换。

处理方式：

1. 打开 Supabase Dashboard。
2. 到 `Settings -> API` 重新复制 `service_role` / Secret key。
3. 到 `Settings -> Database -> Connection string -> URI` 重新复制 `DATABASE_URL`。
4. 更新仓库根目录 `.env.local` 后再次运行：

```bash
uv run backend/scripts/db/check_connection.py
```
