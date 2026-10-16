# GameForge Wiki

可复用的游戏 Wiki 母版：资料齐备后，以配置与内容完成独立新站的本地上线准备。保留 Astro 静态生成、TypeScript、Tailwind、MDX Content Collections、Pagefind、多语言 SEO 和 Cloudflare Pages。

**一个游戏一个独立目录；未经核验的内容先存为草稿。** 不承诺收录、排名或收入。

```bash
pnpm install --frozen-lockfile
pnpm create-game --config /input/game.config.json --keywords /input/keywords.json --facts /input/facts.json --out ../my-game-wiki
```

需要 Node 22.13+、Git 和 packageManager 指定的 pnpm（也可使用 corepack pnpm）。目标目录必须不存在并位于母版以外。生成器安装依赖，复用原初始化器清理营销路由/示例内容，编译配置，复用批量文章工具生成草稿，执行检查，输出 LAUNCH_REPORT.md。不会创建远端仓库、部署、购买域名或修改 DNS。

结构样例：fixtures/games/roblox/ 和 fixtures/games/steam/。其中全部是虚构测试素材，不能作为真实资料或正式上线。真正使用时复制三个 JSON 到母版外的素材目录并填写核实资料。

文档入口：

- [快速开始](docs/QUICK_START.md)
- [配置说明](docs/CONFIGURATION.md)
- [关键词与内容工作流](docs/CONTENT_WORKFLOW.md)
- [SEO 上线检查](docs/SEO_CHECKLIST.md)
- [Cloudflare Pages 部署](docs/DEPLOYMENT.md)
- [来源与品牌隔离审计](docs/BRANDING_AUDIT.md)
- [私有母版迁移方案（待单独授权）](docs/PRIVATE_TEMPLATE_MIGRATION.md)
- [基线与实现说明](docs/GAMEFORGE_AUDIT.md)

保留首页、分类、详情、Boss/Codes/Tier 组件、目录、图集、内链、面包屑、JSON-LD、Canonical、Sitemap、hreflang、搜索、广告位和同意管理。评论、广告、联盟推广、高级视频、分析和语言扩展默认关闭。

```bash
# 母版完整验证
pnpm lint
pnpm typecheck
pnpm test
pnpm check-config
pnpm check-content
pnpm check-i18n --strict-ui
pnpm build
pnpm check-links
pnpm template-audit
pnpm test:e2e       # 检查 git archive HEAD，先提交
pnpm test:games     # 两个独立游戏站，测试后清理

# 独立游戏站
pnpm plan-content
pnpm verify-game
pnpm predeploy
pnpm audit-branding # 可加 --peer-config /other/game.config.json
```

母版根目录保留上游演示与宣传路由作为回归夹具。根目录构建不是正式游戏站。create-game 在独立输出中清除这些内容，生产 SEO 审计发现残留将失败。母版 docs 和技能不复制到新站，演示图片重新生成；内部资料不进入 dist。软件与依赖授权完整保留在 LICENSE/licenses 并随 dist 分发，默认不显示母版推广页脚。

独立站运行 gameforge-site、hardening、branding 三组可移植测试，验证自身配置、证据、安全、品牌及许可契约；宣传/示例契约属于母版回归套件，仍完整保留并运行。没有删除或跳过母版关键测试。

基于 [PNGTRID/AnvilWiki](https://github.com/PNGTRID/AnvilWiki) 改造，感谢 PNGTRID 与贡献者。保留 [MIT License](LICENSE)、原始版权、依赖和字体许可证。开发与 PR 仅面向 [jjasnek-ops/gameforge-wiki](https://github.com/jjasnek-ops/gameforge-wiki)。
