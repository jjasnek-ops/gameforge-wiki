# GameForge 改造审计

日期：2026-10-15。只操作 jjasnek-ops/gameforge-wiki，未操作上游和其他游戏站。初始 main 工作区干净。

审计阅读 README、AGENTS、PRD、配置/内容/语言/路由/组件/脚本、现有内容技能、SEO/内容格式/部署文档。确认 Astro 7.3.2、MDX 8、TypeScript、Tailwind 3、静态 dist、Pagefind、24 套原测试。

基线生产构建通过：174 HTML 页面，Pagefind 索引 108 页/3 语言。初次测试为 400 通过、1 失败、1 原有 skip；失败是 setup.yml Python 在 Windows 用 GBK 读取 UTF-8，已明确 encoding=utf-8 修复真实路径。原生依赖下载和 pnpm 启动器在本地工具环境修复，未为此换锁文件/框架。

保留现有首页、分类、文章、Boss/Codes/Tier、搜索、SEO、Sitemap、fallback noindex、真实译文 hreflang、同意管理、广告/评论组件。新增配置编译器、关键词输入/去重、来源核验门禁、独立站生成和生产 SEO 审计。批量草稿和演示清理复用上游实现。

母版保留原营销/示例为回归夹具，新站独立输出中剥离路由/虚构资料/原站身份，生成中性品牌素材。docs 和 Agent Skills 留在仓库，不公开为生产页面。新站 CI 运行自身可移植配置/证据/组件测试，母版完整上游测试和初始化 E2E 不删除，新增两游戏完整生成测试。

事实真实性仍依赖人工核对来源。工具检查记录完整性/版本/日期/状态，不能证明链接内容或审稿人身份。语义同义词使用显式 canonicalKeyword，不假装自动理解全部意图。未部署、未创建新远端仓库、未修改外部账户和域名。


验收验证：26 套 Vitest、426 项通过；1 项为原有 English expiryDate 本地化条件豁免，未新增跳过。lint 与 Astro 类型检查零错误、零警告。配置、内容、严格 UI key、生产构建、Pagefind、内部链接均通过；本地 HTTP 逐条验证 Sitemap 的全部 URL 返回 200。原 apply-template 真实模式 E2E 通过。

两套完整独立站验证通过并清理临时目录：Roblox 36 个 HTML / 21 个 Sitemap URL，含真实日文测试译文与未译首页排除；Steam 19 个 HTML / 15 个 Sitemap URL，分类和页型不同。两站所有草稿默认隔离，审核后页面正常构建，广告默认关闭，产物无原游戏/域名残留；母版 src/public 内容哈希一致。生产 SEO 审计均零错误。

母版 template-audit 返回成功，但仍报告保留上游参考夹具带来的 9 项预期警告（5/14 健康项）。它们不代表生产站被豁免：新站运行严格 check-seo，残留示例与旧身份会失败。没有将这些警告改成虚假的全绿。

额外修复：Python UTF-8 跨平台读取、UI import 块兼容 CRLF、空 recent/tags 的 Sitemap 排除、空聚合页 hreflang、404 Canonical/noindex、跨语言标签页 Title 冲突。旧游戏身份自动记入 retired-identities，供生产产物审计。
