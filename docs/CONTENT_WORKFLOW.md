# 关键词到核验文章

复用 anvil-find-keywords 的意图核查、anvil-batch-articles 的批量草稿、anvil-new-article 的 MDX 规范。工具不使用 AI 猜测游戏事实。

keywords.json 每项必填 topicName、category、keyword、slug、intent、priority（1–5）、evidenceStatus（pending/verified/disputed）、pageType。可选 relevant（false 排除）、canonicalKeyword（显式同义词）、locale（默认 en）、sourceIds。

pageType 支持 beginner-guide、walkthrough、codes、tier-list、boss-guide、items、maps、builds、faq，不代表每个站都必须生成。

```bash
pnpm plan-content
pnpm plan-content input/next.json
```

先验证整批，再按优先级合并显式同义词。不同意图不能合并，URL 冲突失败。转换 CSV 后调用现有 bulk-new-posts，不覆盖已有稿件。写入 SEO 草稿、标签、来源引用、relatedCandidates；正文只链接真实发布页面，标签驱动相关文章。

facts.json 每项：id、url、title、kind、verified、verifiedAt、version、notes。kind 按优先级为 official/store/developer/gameplay/video/community。notes 写明公告段落、截图或时间点。核验 URL 格式不等于核实事实，verified 必须来自实际人工核对；普通 dev/build 不自动访问来源，工具不能证明审稿真实性。

未核实、重要断言缺失、仅社区传言或版本冲突时，保持 draft: true。禁止编造码、数值、掉率、发布日期、评分或在线人数。

```yaml
draft: false
pageType: beginner-guide
evidenceStatus: verified
sourceIds: [official-launch-notes]
gameVersion: verified-version
reviewedBy: real-reviewer
reviewedAt: 2026-10-15
```

来源版本必须与 gameVersion 一致；reviewedAt 不早于 verifiedAt，日期有效且不在未来。正文先直答、从 H2 开始，表格/步骤/有 ALT 图片按意图使用，不机械规定词数。没有相关文章时不虚造内链。

build 与 Astro 配置加载均执行证据门禁，遗漏审核记录不能发布。文章展示来源链接、核验时间、版本。继续运行 check-content 与 verify-game；没有降低原有内容校验。

## 逐条事实引用

重要事实可在文章 frontmatter 用 claims 逐条记录，sourceIds 必须属于该文章通过人工审核/版本检查的来源；重复 ID、空声明和未知引用会失败。claims 不替代正文审稿，也不让 verified 自动成为真实性证明。

```yaml
claims:
  - id: supported-platform
    statement: "在已核对的官方发行页面上列出的平台是……"
    sourceIds: [official-launch-notes]
```

## 来源 URL 与联网检查

离线门禁要求公共 HTTPS URL，无用户名/密码、凭据查询参数、私网/保留地址或非标准端口。`pnpm check-sources` 只验证格式，不发网络请求，草稿开发不依赖网络。

```bash
pnpm check-sources --online
pnpm check-sources --online --strict
pnpm check-sources --online --refresh
```

默认联网只查已发布文章与首页实际引用的来源；`--all` 才包含草稿未引用来源。每源总超时 8 秒、最多 3 次 HTTPS 重定向、2 个并发任务，先 HEAD，405/501 时用 GET 只读取响应头。每一跳解析 DNS 并固定已检查的公网地址，拒绝降级、私网和凭据 URL；保留标准 TLS 证书检查。不会携带账户凭据、Cookie 或环境代理。

成功缓存 24 小时，失败缓存 15 分钟；`--refresh` 强制重查。缓存与解释报告写在被 Git 忽略的 `.gameforge/source-cache.json` / `source-report.json`。HTTP 403/429、DNS、TLS、超时、重定向或安全拒绝有不同结果，网络状态不会修改 facts 的 verified。非 strict 模式报告问题但不阻断；`predeploy` 在本地验证之后执行 strict 联网检查，须处理引用源不可访问的问题。dev/build/verify-game 从不自动联网，因此网络波动不会阻断草稿开发。

HTTP 成功只说明端点当时可达；登录页、过时页面或错误断言仍可能返回 200。审稿人必须核对实际内容、版本、上下文与每项关键事实。
