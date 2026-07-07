# 域名迁移完成记录 (vibedigest.io)

本记录保留域名迁移的执行路径和验证项。当前生产主站为 `https://www.vibedigest.io`，后端 API 为 `https://api.vibedigest.io`。

> 状态：已完成。后续只在稳定观察期结束后清理第三方控制台中的旧域名白名单。

为了降低风险，我们将迁移分为三个阶段。**您可以分阶段验证，不必一次性全部完成。**

## 阶段概览 (Phased Approach)

### 阶段 1: 准备 (Preparation) - **可以现在做，不影响现有服务**
- **目标**: 让外部服务 (Auth, Payment) 提前信任新域名。
- **验证**: 此时旧域名完全正常工作。新域名配置已就绪。
- **操作**:
  - 在 Auth/Google/Creem/Resend 中**添加**新域名 (不要删除旧的)。
  - 更新代码中的 Allow List (CORS, Config) 以包含新旧两个域名。

### 阶段 2: 切换 (Switch) - **核心变更**
- **目标**: 将流量导向新域名。
- **验证**: 访问 `vibedigest.io` 能看到站点。
- **操作**:
  - 修改 DNS 记录。
  - Vercel/Hosting 绑定新域名。

### 阶段 3: 清理与全面验证 (Verify & Cleanup) - **上线后**
- **目标**: 确保所有功能在新域名下正常，且 SEO 转移平滑。
- **验证**: 登录、支付、收信功能测试。
- **操作**:
  - 移除代码和配置中的旧域名引用。
  - 设置 SEO 重定向。

---

## 用户审查 (User Review Required)

> [!IMPORTANT]
> **API 地址变更**: 生产 `NEXT_PUBLIC_API_URL` 和 `BACKEND_API_URL` 均已切换到 `https://api.vibedigest.io`。

> [!WARNING]
> **OAuth 回调 URL**: Supabase Auth redirect allowlist 已反向验证；生产回调可正常进入 Google OAuth。

## 变更方案 (Proposed Changes)

### 前端 (Frontend)

将所有面向用户的旧域名引用替换为 `vibedigest.io` / `www.vibedigest.io`。

#### [MODIFY] [robots.ts](file:///Users/haoran/Documents/coding/VibeDigest/frontend/src/app/robots.ts)
- 更新 `baseUrl` 为 `'https://vibedigest.io'`。

#### [MODIFY] [sitemap.ts](file:///Users/haoran/Documents/coding/VibeDigest/frontend/src/app/sitemap.ts)
- 更新默认 `baseUrl` 为 `'https://vibedigest.io'`。

#### [MODIFY] [page.tsx (FAQ)](file:///Users/haoran/Documents/coding/VibeDigest/frontend/src/app/[lang]/faq/page.tsx)
- 更新联系邮箱域名 (如有)。

#### [MODIFY] [page.tsx (About)](file:///Users/haoran/Documents/coding/VibeDigest/frontend/src/app/[lang]/about/page.tsx)
- 更新 JSON-LD 中的 `url` 和 `logo` 地址。

#### [MODIFY] [layout.tsx](file:///Users/haoran/Documents/coding/VibeDigest/frontend/src/app/[lang]/layout.tsx)
- 更新默认 `baseUrl`。

#### [MODIFY] [.env](file:///Users/haoran/Documents/coding/VibeDigest/frontend/.env)
- 建议更新 `NEXT_PUBLIC_API_URL` (如果指向生产环境)。当前为 `localhost`，如果需要指向生产环境请指示。计划中将保留 `localhost` 用于开发环境，但更新注释或添加生产环境示例。

### 后端 (Backend)

#### [MODIFY] [main.py](file:///Users/haoran/Documents/coding/VibeDigest/backend/main.py)
- 更新 `DEFAULT_ORIGINS` 列表，添加 `https://vibedigest.io` 和 `https://www.vibedigest.io`。

### 文档 (Documentation)

#### [MODIFY] [docs/codemaps/api.md](file:///Users/haoran/Documents/coding/VibeDigest/docs/codemaps/api.md)
#### [MODIFY] [docs/codemaps/config.md](file:///Users/haoran/Documents/coding/VibeDigest/docs/codemaps/config.md)
- 更新文档中的生产环境 URL 引用。

## 外部服务配置指南 (External Services Configuration)

### 阶段 1 执行 (执行此步不会影响现有网站)

#### 1. 身份验证 (Authentication - Add Only)
此阶段**仅添加**新域名，**不要删除**旧域名。
- **Supabase Auth**:
  - `Redirect URLs`: **新增** `https://vibedigest.io/**`。保留旧的。
  - **验证**: 保存成功即可。
- **Google Cloud Console**:
  - `Authorized JavaScript origins`: **新增** `https://vibedigest.io` 和 `https://www.vibedigest.io`。
  - `Authorized redirect URIs`: **新增** 对应的回调地址。
  - **验证**: 保存成功即可。

#### 2. 支付网关 (Payments - Add Only)
- **Creem**:
  - `Webhooks`: production endpoint 使用 `https://api.vibedigest.io/api/webhook/creem`。
  - **验证**: endpoint 可达且探测 POST 返回 `200`；生产 Creem API key 可用。

#### 3. 邮件 (Email)
- **Resend**:
  - `Domains`: 添加并验证 `vibedigest.io`。这通常不冲突。

---

### 阶段 2 执行 (切换时刻)

#### 1. 域名与托管 (DNS & Hosting)
- **Vercel / 托管平台**:
  - 绑定 `vibedigest.io`。
  - **验证**: 访问新域名，应能看到页面 (可能需等待 DNS 传播)。

#### 2. 核心设置更新
- **Supabase Auth**:
  - 确认新域名能访问后，将 `Site URL` 更新为 `https://www.vibedigest.io` (这会影响重置密码等邮件中的默认链接)。

---

### 阶段 3 执行 (后续清理)

#### 1. 分析与监控
- **Google Analytics / Search Console**: 添加新属性。

#### 2. 旧域名处理
- 确认新域名完全稳定运行 1-2 周后，可以考虑从 Auth/CORS 白名单中移除旧域名。

## 验证计划 (Verification Plan)

### 自动化检查
- 运行 `rg` 搜索旧域名字符串，确保没有面向用户的遗漏。
- 运行 `grep` 搜索 `vibedigest.io` 确认替换成功。

### 手动验证
- 部署后检查 `robots.txt` 和 `sitemap.xml` 是否指向新域名。
- 检查 CORS headers (需要部署环境)。
- 检查 `sitemap.xml` 生成内容。
