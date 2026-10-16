# 新建游戏站：最短流程

1. 在母版外准备 game.config.json、keywords.json、facts.json。参考 fixtures/games 中的结构，替换全部虚构测试数据与核验状态。
2. 填入游戏名、域名、官方链接、真实关键词与核实来源；只选实际需要的分类和专题。
3. 从母版运行：

```bash
pnpm create-game --config /absolute/input/game.config.json --keywords /absolute/input/keywords.json --facts /absolute/input/facts.json --out ../new-game-wiki
```

路径含空格时加引号；父目录必须存在，目标目录必须不存在。输出拒绝覆盖、拒绝位于母版内。命令只复制 Git 跟踪文件中受控的源码、脚本、构建配置、资源与许可；未跟踪文件、环境凭据、个人临时文件、开发产物、外部工具目录与 IndexNow 身份不会复制。新增生产文件须先确认安全、加入 Git 暂存，并符合 scripts/lib/security.ts 清单。失败时保留独立目录排查，不自动清理用户数据。

4. 进入独立目录，阅读 LAUNCH_REPORT.md 与 .gameforge/content-plan.json。所有文章保持 draft: true。
5. 在独立站填入真实 MDX 内容，逐篇审核后再发布。母版的运营文档和 Agent Skills 仅留母版内供编辑工作参考，不随新站复制或部署。

```bash
pnpm dev
pnpm verify-game
pnpm audit-branding
pnpm predeploy
```

verify-game 允许尚无发布文章的起步站；predeploy 额外要求真实发布文章、联系方式，并拒绝 testOnly。获得相应域名与部署授权后参考母版 docs/DEPLOYMENT.md；仅上传独立站 dist，不上传项目根目录。

改游戏身份、域名、颜色、导航和首页时只改 game.config.json，再运行 configure-game（dev/build 自动执行）。文章仍使用 YAML frontmatter MDX，不修改核心组件。

可选 `--content /absolute/verified-mdx` 导入按 locale/category 组织的现有 MDX；文件仍须通过全部核验门禁。图片资源随后放入新站相应 public/images 或 src/assets 目录后重新验证。

初始化独立 Git 仓库后运行 `pnpm security:install-hook`，再提交。`pnpm check-sources` 默认只做离线 URL 校验；需要联网时显式使用 `pnpm check-sources --online`。详情见 CONTENT_WORKFLOW.md。

新站保留 LICENSE 与 licenses/；软件副本必须携带适用版权及授权文本。默认没有母版推广署名；法律通知中的原作者名称不得删除。来源审计与私有母版迁移方案仅在母版 docs/ 中，不作为新站网页发布。
