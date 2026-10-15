# SEO 上线自检

运行 verify-game，正式部署前运行 predeploy。报告为 .gameforge/seo-report.json。本地检查不保证 Google 收录或排名，Lighthouse 只是性能体验指标。

- 独立 Title/Description、唯一 H1、合理 H2/H3，首屏直答。
- Canonical、OG URL、OG/Twitter 图片、robots 与域名一致，图片存在且 ALT 有意义。
- JSON-LD 可解析，文章有 Article/BreadcrumbList，FAQ 与可见问答一致。
- Sitemap 仅真实静态文件，无草稿、noindex、404、空分类、fallback、营销页或重复 URL。
- hreflang 只指向可索引真实版本，不把相同英文副本当翻译。
- 无重复正文、示例游戏名、上游域名或旧身份；旧词加入 forbiddenTerms。
- 来源、核验日期、版本、人工审稿完整；没有虚构事实。
- check-links 验证全部内部链接与资源，首页/分类/文章/404 和搜索可用。
- 广告默认关闭；开启时核对真实单位、同意管理、ads.txt 与政策。
- 授权部署后实际检查 HTTPS、robots、Sitemap、状态码和 GSC 所有权。

自动审计覆盖元信息、Canonical、Robots、JSON-LD、Breadcrumb、OG/Twitter、ALT、标题层级、重复标题/描述/正文、hreflang 与 Sitemap。广告 iframe 文件不作为 SEO 落地页。死链由原 check-links 门禁承担。


加固审计同时比较：所有实际 indexable HTML ↔ Sitemap URL（双向差集）；实际来源决定的应索引文章/首页/分类等也不得缺失。检查 HTML 和 Sitemap 的 hreflang 目标存在、可索引、与实际语言相符，英文 fallback 和空分类不得被提交。canonical 与实际路径、og:url 一致，robots meta/Cloudflare X-Robots-Tag、robots.txt 与 Sitemap 不得矛盾；Sitemap index 必须完整引用全部子 Sitemap。

`testOnly: true` 的虚构夹具仍故意 Disallow: /，这是测试数据隔离的明确例外，双向页面集合与翻译门禁仍全部执行。正式站没有该例外。
