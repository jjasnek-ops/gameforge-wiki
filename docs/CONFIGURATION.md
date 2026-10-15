# 游戏配置单一来源

game.config.json 是独立站配置真相源。scripts/lib/gameforge.ts 的严格 Zod schema 为可执行契约，未知字段报错。configure-game 编译到原有配置格式，不更换框架。

| 字段 | 用途与规则 |
| --- | --- |
| gameName / siteName / shortName | 游戏名/站名/短名，最长 55/80/30 字符 |
| domain | 裸主机名，不带协议/端口/路径/尾斜杠，公开 URL 使用 HTTPS |
| description | 40–165 字符，不夸大更新频率与排名 |
| platform / genre / developer | 核实过的游戏事实，未知时明确标待核实 |
| releaseDate | 可选，核实过的实际 ISO 日期；未来计划日期留在有来源的正文 |
| officialUrl | 必填 HTTPS 官网或官方 Steam/Roblox 页面 |
| discordUrl / youtubeUrl / contactEmail | 可选，上线前提供联系渠道 |
| themeColor | #RRGGBB，自动派生 CSS 品牌变量和 manifest |
| defaultLanguage | 无 URL 前缀的默认语言，默认 en |
| supportedLanguages | 候选语言列表，保留 en 基础字典，包含默认语言 |
| translatedLanguages | 默认语言以外拥有真实首页/FAQ 译文的语言 |
| navigation | 1–8 项 {key,label,icon}，与目录一致，icon 使用 lucide，不能占保留路由 |
| featureFlags | comments/adsense/adsterra/affiliates/advancedVideo/multilingual/analytics，全部默认 false |
| analytics | ga4 / cloudflareBeaconToken / gscVerification，仅公共标识，不放秘密 |
| advertising | adsenseClient、adsenseSlots {sticky,sidebar,incontent}、adsterraSlots、adsTxt 数组 |
| comments | 开评论必填 repo/repoId/category/categoryId，公共 Giscus ID |
| homepage | intro、可选 heroImage/heroAlt、facts、faq、modules |
| forbiddenTerms | 旧游戏名/旧域名等额外禁止项，残留即失败 |
| testOnly | 夹具必须 true，robots 禁止抓取，predeploy 拒绝 |

facts 为 {label,value,sourceId}，faq 为 {question,answer,sourceIds}，来源必须已核验且不能只有社区传言。modules 为 {category,title,description}，最多 8 项，只显示已有发布文章的分类。新手卡片最多 4 张，由真实分类自动派生，无资料不生成 Codes/Tier 内容。

默认 Hero 使用游戏名水印和品牌色。授权图片放 public/images，填写 heroImage 与非空 heroAlt。gen-assets 生成中性品牌图标/分享图，不冒充游戏实拍。改游戏身份后可重新运行 gen-assets。

多语言开关关闭时只启用默认语言。文章译文以真实 MDX 为准，缺失详情 fallback noindex，并退出 Sitemap/hreflang。首页真实译文在 locale JSON 管理，声明 translatedLanguages 后保留 home。禁止把克隆英文当译文。

派生产物：site/navigation/features、routing/ui、globals.css 品牌变量、locale 身份/首页、wrangler.toml、manifest、ads.txt。.gameforge/ui-base.json 是无游戏身份的通用字典。环境 SITE_URL 与 domain 冲突时失败，避免第二份域名源。联盟推荐内容继续在 affiliates.ts 配置并由开关控制。

法律页正文沿用上游英文实现；非英语 URL 始终 noindex，不因首页已翻译而提交索引。已有 en/ja 通用 UI 译文保留；其他语言需要在 locale JSON 中补齐真实文案。

Adsterra 启用后仍需按 docs/ads.md 提供自己的 public/ads/<slot>.html 广告代码；配置公共单元 ID 不会伪造或代替广告平台代码。

## 公共 ID 与凭据

`analytics.cloudflareToken` 已移除，避免把 Cloudflare API Token 当成公开 beacon ID。原来使用 Web Analytics 公共 ID 的站点将字段改为 `cloudflareBeaconToken`（32 位十六进制 ID 或 UUID）；GA4 Measurement ID 仍用 `ga4`。配置、facts、文章、wrangler [vars] 和 PUBLIC_ 变量里都不得放 API 凭据。

Cloudflare API Token、API Key、GitHub token、服务账号私钥等仅由实际部署环境的 Secrets 或私密环境变量注入，例如 `CLOUDFLARE_API_TOKEN`；静态站生成不需要这些凭据，也不会把它们映射到 PUBLIC_。本次加固不创建或修改任何外部 Secrets/账户。不要把私密 `.env*`、`.dev.vars*`、凭据 JSON、证书或私钥加入 Git。

`pnpm check-secrets` 检查跟踪文件与独立站输入；`pnpm check-secrets --staged` 直接检查 Git 暂存 blob，工作区清理不能掩盖已暂存凭据。安装依赖时 prepare 安装 `.githooks/pre-commit`；已有自定义 hooksPath 会保留，须把暂存检查接入现有 hook。新站 git init 后先运行 `pnpm security:install-hook`。CI/build/verify-game 也执行扫描。扫描仅输出位置/规则，不能证明不存在未知格式或人为绕过的秘密。
