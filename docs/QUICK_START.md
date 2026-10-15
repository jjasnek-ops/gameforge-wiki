# 新建游戏站：最短流程

1. 在母版外准备 game.config.json、keywords.json、facts.json。参考 fixtures/games 中的结构，替换全部虚构测试数据与核验状态。
2. 填入游戏名、域名、官方链接、真实关键词与核实来源；只选实际需要的分类和专题。
3. 从母版运行：

```bash
pnpm create-game --config /absolute/input/game.config.json --keywords /absolute/input/keywords.json --facts /absolute/input/facts.json --out ../new-game-wiki
```

路径含空格时加引号；父目录必须存在，目标目录必须不存在。输出拒绝覆盖、拒绝位于母版内。命令复制当前 Git 跟踪/未忽略文件，不复制 .git、环境密钥或 IndexNow 身份。失败时保留独立目录排查，不自动清理用户数据。

4. 进入独立目录，阅读 LAUNCH_REPORT.md 与 .gameforge/content-plan.json。所有文章保持 draft: true。
5. 使用保留的 anvil-new-article / anvil-batch-articles 技能填入真实内容，逐篇审核后再发布。

```bash
pnpm dev
pnpm verify-game
pnpm predeploy
```

verify-game 允许尚无发布文章的起步站；predeploy 额外要求真实发布文章、联系方式，并拒绝 testOnly。获得相应域名与部署授权后按 DEPLOYMENT.md 部署。

改游戏身份、域名、颜色、导航和首页时只改 game.config.json，再运行 configure-game（dev/build 自动执行）。文章仍使用 YAML frontmatter MDX，不修改核心组件。

可选 `--content /absolute/verified-mdx` 导入按 locale/category 组织的现有 MDX；文件仍须通过全部核验门禁。图片资源随后放入新站相应 public/images 或 src/assets 目录后重新验证。
