# 来源信息与品牌隔离审计

日期：2026-10-16。范围：整个 Git 跟踪树、生产复制清单、生成站 HTML/SEO/JSON-LD/Sitemap/robots/llms/ads、JS/CSS、搜索压缩片段和二进制资源指纹。基线为安全加固分支 `1992eb4309d627e457d7a66817225afb766ac8bf`；PR #2 未合并，本轮 PR 基于该分支叠加，合入 main 前须先完成依赖 PR。没有部署、域名、Cloudflare 或仓库设置操作。

## 完整来源清单与分类

逐文件、逐行命中及媒体 SHA-256 见 [BRANDING_SOURCE_INVENTORY.json](audits/BRANDING_SOURCE_INVENTORY.json)。初次扫描覆盖 516 个跟踪文件，1017 个命中位置：A 2、B 748、C 267。这是同一行可匹配多个词的“位置数”，不是缺陷数；路径/上下文分类是审计辅助，不是自动许可判断。二进制媒体另列指纹。当前树可用 `pnpm audit-branding --repository` 重新生成内部清单；母版根目录没有游戏配置时只做来源盘点，**不会声称母版演示构建通过生产品牌隔离**。

| 类别 | 处理原则 |
| --- | --- |
| A：依法应保留的版权/授权 | 原 LICENSE、依赖及字体通知、真实源码版权注释完整保留；必要的来源名称在许可文本中是合法信息。软件分发包含通知，不能因网页页脚无须推广就删除 LICENSE。 |
| B：母版内部资料 | README、开发文档、历史、Agent Skills、工作流、工厂实现和本报告允许真实记录来源；母版继续保留。母版 docs/.agent/fixtures/tools/原始研究不复制到新站，也不进入 dist。新站仅保留自身必要运行脚本和独立 README/检查 CI。 |
| C：生产页面不应继承的身份 | AnvilWiki/PNGTRID/anvil.wiki/GameForge/gameforge-wiki/上游与母版 URL、Anvil Quest/Forge Studios/Forge Master Kael、演示图与宣传内容，在新站实际产物中默认禁止；母版回归夹具不删除。 |

### 所有指定表面及实际发现

| 表面 | 发现/风险 | 修复或保留 |
| --- | --- | --- |
| README、开发文档、Agent Skills、研究资料 | 旧复制器会把母版手册、运营规则和技能带到新站；手册集合还可能生成公开路由 | 排除 docs/.agent/AGENTS，去掉新站 handbook collection、路由及 llms 手册目录；母版原件属 B 保留 |
| package.json、发布/部署脚本 | 母版名、homepage/repository/bugs、版本与开发命令可继承；Cloudflare commit marker 暴露母版命名及提交 SHA | 生成包使用本站名/描述/域名/关键字和 0.1.0，删除母版 remote 元数据及工厂命令；新站不写 anvilwiki-deploy.txt |
| Astro/站点配置、HTML head、SEO、JSON-LD | 旧游戏身份、作者/social/sameAs 或默认值可能在改站后遗留 | 编译 game.config，清旧 sameAs、作者、联系方式与外链，保留 canonical/hreflang/robots 双向 SEO 门禁 |
| Header/Footer/搜索界面 | 默认固定锤子图标、搜索厂商 UI 标签不体现独立身份 | 页眉页脚读本站 favicon，搜索页脚用本站名；母版 credit 默认关闭，只允许明确配置后的指定链接 |
| About/Contact/版权/隐私页面 | 通用页有“每日代码”、志愿组织、提交 PR 等未经本站证明的描述 | 生成站 About/Contact 按实际配置生成，不虚构维护组织/更新频率；广告/分析/评论披露随实际开关；软件许可另列 |
| Sitemap/robots/llms/ads.txt | 内部宣传/手册链接可能进入可抓取发现；测试站不可误当正式站 | 仅合法生产路由族，Sitemap 集合及 noindex/canonical 检查保留；未翻译页面排除；testOnly 禁爬；ads.txt 仅来自本站配置 |
| 公共图片/SVG/manifest | 演示 hero、截图、头像等会复制，甚至可改名绕过字符串检测 | 不复制 public/images、src/assets、demo ads；重新生成七份本站图标/hero；比对演示媒体指纹、本站配置及资源哈希 |
| JS/CSS/Pagefind | 旧 SEO 扫描未覆盖全部静态 JS/CSS，压缩搜索片段也可能含旧品牌 | 全产物扫描，解码常见转义与 gzip/brotli，检测内部词/地址/私密变量；保留真实合法版权注释 |
| GitHub Actions/环境示例 | 母版定时流程/账户标识不应进入独立站；环境值可能覆盖新站配置 | 新站独立只读检查 CI，无提交/部署定时任务；不复制母版 .env.example，不映射秘密；公共统计/广告/评论/赞助配置仍可用 |
| 多站配置 | 旧联系方式、GA/广告/评论 ID、赞助/联盟链接可能沿用 | 统一配置编译并清空未配置项；记录退役值；可传 peer config 对比另一站，显式相同配置视为有意共用 |
| LICENSE 与来源历史 | “去品牌”可能误删版权或冒充原创 | LICENSE 原文不变，六份完整分发许可校验；Git 历史/来源记录保留；不伪造版权归属 |

## 生产隔离契约

复制仅来自 Git 跟踪的生产文件族，拒绝敏感路径、链接、个人临时文件和已知开发产物。新增生产文件要先安全审核并加入 Git。新站不含母版手册/技能/研究/fixture/演示图片；保留构建代码、锁文件、字体、授权、三个可移植回归测试及自身配置。尚需在新站手动加入获授权的真实游戏媒体和广告单元 HTML；不凭空复制示例。

构建的 postbuild 生成 Pagefind、分发许可并执行秘密和品牌审计。dist 文件族白名单只接收实际静态页面、已配置分类/语言/标签、必要 assets/fonts/Pagefind/SEO/广告与精确许可文件；research/docs/maps/环境配置/源码等失败。只允许部署 dist，不把整个项目目录当静态根目录。母版构建保留历史演示用回归契约，不是可上线游戏站。

`pnpm audit-branding` 在生成站审计实际 dist；`--peer-config /absolute/other/game.config.json` 额外核对另一站。固定母版禁止词、用户 forbiddenTerms、旧值和 peer 对比不等于自动理解所有人名/图像或世界上所有站点；未来新媒体、依赖与第三方脚本仍须审核。完整软件许可是明确例外，不是随意忽略所有名为 LICENSE 的文件。

## 验证记录

新增品牌测试覆盖 HTML/JS/CSS/转义文本/压缩搜索片段、显式 credit、peer 联系方式与统计、复制及 dist 清单、演示资源、许可完整性与旧图片。两站端到端流程同时覆盖草稿、发布 MDX、真实日文译文/Unicode 标签、事实门禁、缺失 Sitemap/错误 canonical/robots、集成开关和开关恢复。实际结果在提交前核验，并在 PR 中记录；不删除旧测试或放宽门禁以通过。

## 不能承诺隐藏的关联

MIT 原作者名称和合法声明必须保留。原公开 Fork、提交作者/父提交/时间、PR、历史下载和缓存都可能关联项目；新私有库也无法撤回既有副本。Astro/Tailwind/Pagefind、Lucide 图标、布局、DOM/CSS 结构、资源命名、通用代码与默认插图风格同样可被指纹关联。相同统计/广告/评论 ID、联系方式、DNS/托管网络、相似内容或同时发布的行为也可能关联站点；检测只对已提供的配置及已知指纹负责。不能保证匿名、隐藏上游来源或使各站技术上不可关联。

私有母版方案和待授权边界见 [PRIVATE_TEMPLATE_MIGRATION.md](PRIVATE_TEMPLATE_MIGRATION.md)。
