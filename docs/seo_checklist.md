# SEO Checklist for International Web App (Web 出海应用 SEO 清单)

这份清单专为面向海外市场的 Web 应用（特别是 AI/SaaS 类工具）设计，旨在通过系统化的优化提升在 Google 等搜索引擎中的排名和可见性。

## 1. 基础技术 SEO (Technical SEO)
**目标**: 确保搜索引擎蜘蛛能高效爬取和索引网站。

- [x] **多语言/多地区架构 (Hreflang)**
    - 配置 `<link rel="alternate" hreflang="x" href="x" />` 标签，告诉 Google 不同语言/地区对应的页面版本。
    - 确保包含 `x-default` 指向默认版本（通常是英语）。
    - ✅ **已完成**: `layout.tsx` 中配置了 `alternates.languages`（包含 en/zh/es/fr/de/ja 和 x-default），`sitemap.ts` 也包含多语言 alternates。
- [x] **URL 结构优化**
    - 使用清晰的层级结构，推荐：`domain.com/en/`, `domain.com/es/` (子目录适合刚起步，权重集中)。
    - URL 需包含英文关键词，避免使用 ID 或乱码 (e.g., `/blog/seo-tips` vs `/blog?id=123`)。
    - ✅ **已完成**: 使用 `/[lang]/` 子目录结构，任务页面使用 SEO 友好的 slug (`/tasks/[id]/[slug]`)。
- [x] **Sitemap.xml (站点地图)**
    - 动态生成 Sitemap，包含所有重要页面。
    - 针对多语言站点，Sitemap 中也应包含 Hreflang 信息（可选，但推荐）。
    - 提交到 Google Search Console (GSC) 和 Bing Webmaster Tools。
    - ✅ **已完成**: `sitemap.ts` 动态生成，包含静态页面和 demo 任务页面，已包含 hreflang alternates。
- [x] **Robots.txt**
    - 正确配置，允许蜘蛛访问主要内容，屏蔽后台/API 路由。
    - 包含 Sitemap 的链接。
    - ✅ **已完成**: `robots.ts` 配置正确，允许 `/`，屏蔽 `/api/` 和 `/admin/`，包含 sitemap 链接。
- [x] **Canonical Tags (规范标签)**
    - 每个页面必须有 `<link rel="canonical" href="..." />`，防止因参数（如 UTM 码）导致的重复内容判定。
- [x] **Structured Data (结构化数据)**
    - 使用 JSON-LD 格式实现 Schema.org 标记。
    - 重点：`SoftwareApplication`, `Product`, `Organization`, `FAQPage`, `BreadcrumbList`。
    - 针对视频内容（如果是核心业务），使用 `VideoObject` Schema。
    - ✅ **已完成**: layout 中有 SoftwareApplication/WebSite/Organization，FAQ 页面有 FAQPage schema，任务页面有 VideoObject 和 BreadcrumbList。
- [x] **Core Web Vitals (核心网页指标)**
    - LCP (加载速度): < 2.5s
    - INP (交互延迟): < 200ms
    - CLS (视觉稳定性): < 0.1
    - 移动端适配 (Mobile-Friendly) 是 Google 移动优先索引的基础。

## 2. 页面与内容 SEO (On-Page SEO)
**目标**: 提升页面相关性，匹配用户搜索意图。

- [ ] **关键词策略 (Keyword Research)**
    - 使用 Ahrefs, Semrush 或 Google Keyword Planner 挖掘长尾词 (Long-tail keywords)。
    - 针对不同市场做本地化关键词研究（不仅仅是翻译，要是当地人的搜索习惯）。
- [ ] **Meta Tags 优化**
    - **Title**: 包含核心关键词 + 品牌名，控制在 60 字符内。吸引点击 (CTR)。
    - **Description**: 包含号召性用语 (CTA) 和关键词，控制在 160 字符内。
- [x] **Heading Tags (H1-H6)**
    - 每个页面仅一个 H1 (包含核心主题)。
    - H2-H6 逻辑清晰，包含相关关键词。
    - ✅ **已完成**: 各页面都有适当的 H1 标签（FAQ、Explore、Landing 等页面）。
- [ ] **图片 SEO**
    - 文件名：`ai-video-transcriber.jpg` 而非 `IMG_001.jpg`。
    - Alt Text：描述图片内容，包含关键词。
    - 使用 WebP 格式并压缩。
- [x] **内容质量**
    - 避免"薄内容" (Thin Content)。
    - 针对常见问题创建详细的 Blog 或 Docs (Programmatic SEO 策略：例如针对每个 Youtube 视频生成摘要页面的 SEO)。
    - ✅ **已完成**: 已有详细的 FAQ 页面 (`/faq/page.tsx`)，探索页面展示社区摘要内容。

## 3. 站外与品牌 (Off-Page SEO & Branding)
**目标**: 建立权威性 (Authority) 和信任度 (Trust)。

- [ ] **外链建设 (Backlinks)**
    - 提交到高权重目录 (Directories): Product Hunt, G2, Capterra, AlternativeTo。
    - 寻找相关领域的 Guest Post 机会。
- [x] **社交媒体信号 (Social Signals)**
    - [x] 配置 Open Graph (OG) 标签（Facebook/LinkedIn/Discord）和 Twitter Cards。
    - [x] 确保分享时显示漂亮的预览图和标题。
- [ ] **品牌监控**
    - 设置 Google Alerts 监控品牌提及。

## 4. 数据分析与工具 (Analytics & Monitoring)
- [ ] **Google Search Console (GSC)**
    - 设置域名验证。
    - 监控索引覆盖率 (Coverage) 和核心网页指标 (Core Web Vitals)。
    - ⚠️ **待验证**: 代码中有 `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`，需确认已在 GSC 设置。
- [x] **轻量产品分析与 Web Vitals**
    - 使用 Vercel Analytics 与 Speed Insights 跟踪访问趋势和真实用户性能。
    - ✅ **已完成**: 移除重复的全站 GA4 脚本，避免为当前阶段增加第二条客户端采集链路。
- [ ] **Bing Webmaster Tools**
    - 不要忽略 Bing，尤其在美国市场有一定份额。
    - ⚠️ **待验证**: 代码中有 `NEXT_PUBLIC_BING_SITE_VERIFICATION`，需确认已在 Bing 设置。

## 5. 针对 VibeDigest (视频摘要/转录) 的特有建议
- [x] **Programmatic SEO (编程化 SEO)**
    - 如果您的应用生成公开的视频摘要页面，这是巨大的 SEO 机会。
    - 确保这些生成页面被索引：不仅需要 sitemap，还需要良好的内部链接结构（例如 "Latest Summaries", "Popular Videos"）。
    - 避免"自动生成内容"被判定为垃圾内容：增加人工编辑的附加值，或者确保摘要质量极高。
    - ✅ **已完成**: sitemap 包含 demo 任务页面，探索页面 (`/explore`) 提供内部链接结构。
- [x] **Video Schema**
    - 在摘要页面嵌入原视频信息 (Thumbnail, Embed URL, Duration, Author)。
    - ✅ **已完成**: 任务详情页面有完整的 VideoObject schema。

---

## 📊 完成进度总结

| 分类 | 已完成 | 待完成 |
|------|--------|--------|
| 技术 SEO | 7/7 | 0 |
| 页面内容 SEO | 2/5 | 3 |
| 站外品牌 | 1/3 | 2 |
| 数据分析 | 1/3 | 2 |
| VibeDigest 特有 | 2/2 | 0 |
| **总计** | **13/20** | **7** |

### 待完成事项 (7 项)
1. 关键词策略 - 使用 SEO 工具做研究
2. Meta Tags 优化 - 优化各页面标题和描述
3. 图片 SEO - 检查图片命名、Alt Text、WebP 格式
4. 外链建设 - 提交到 Product Hunt、G2 等
5. 品牌监控 - 设置 Google Alerts
6. Google Search Console - 验证并提交 sitemap
7. Bing Webmaster Tools - 验证并配置
