> GameForge 当前工作流请先读 [QUICK_START](QUICK_START.md)、[CONFIGURATION](CONFIGURATION.md)、[CONTENT_WORKFLOW](CONTENT_WORKFLOW.md)；下文保留上游参考。

# Cloudflare Pages 部署

本次只实现母版和本地检查，不购买域名、不部署、不修改 DNS/NS/DS/DNSSEC。一个游戏对应一个独立仓库和一个 Pages 项目。

1. 独立站写完真实内容并人工审核，补联系方式，执行 pnpm predeploy。testOnly 夹具不能部署。
2. 获得对应仓库/域名部署授权后，再初始化新站 Git、提交、推送到获授权仓库。不能覆盖母版，不能操作上游。
3. Cloudflare Pages 连接该仓库：Astro 静态站、Node 22.13+、pnpm build、dist 输出，无适配器。
4. game.config.json 的 domain 是唯一公开域名源。构建派生 wrangler.toml 和 SITE_URL，冲突环境值会失败。集成公共 ID 也从 JSON 派生；秘密不进仓库。
5. 先使用获授权 Pages 域名时填对应 hostname；切最终域名时更新 domain 并重建验证。预览/生产 Canonical 的安排在部署授权时确定。
6. 经域名授权后使用 Pages Custom domains 接入自定义域名与 HTTPS，并按现有 DNS 托管方式完成必要记录。本次不执行这些外部操作。
7. 部署后实际访问主页/分类/文章/404、robots.txt、sitemap-index.xml、Pagefind 和 ads.txt，在 GSC 完成所有权验证并提交 Sitemap。

没有自动上传脚本绕过域名授权。构建通过不等于公网已经上线。原 upstream-deployment.md 保留为上游历史参考，以本页和 CONFIGURATION.md 为 GameForge 当前入口。
