# 关键词到核验文章

复用 anvil-find-keywords 的意图核查、anvil-batch-articles 的批量草稿、anvil-new-article 的 MDX 规范。工具不使用 AI 猜测游戏事实。

keywords.json 每项必填 topicName、category、keyword、slug、intent、priority（1–5）、evidenceStatus（pending/verified/disputed）、pageType。可选 relevant（false 排除）、canonicalKeyword（显式同义词）、locale（默认 en）、sourceIds。

pageType 支持 beginner-guide、walkthrough、codes、tier-list、boss-guide、items、maps、builds、faq，不代表每个站都必须生成。

```bash
pnpm plan-content
pnpm plan-content input/next.json
```

先验证整批，再按优先级合并显式同义词。不同意图不能合并，URL 冲突失败。转换 CSV 后调用现有 bulk-new-posts，不覆盖已有稿件。写入 SEO 草稿、标签、来源引用、relatedCandidates；正文只链接真实发布页面，标签驱动相关文章。

facts.json 每项：id、url、title、kind、verified、verifiedAt、version、notes。kind 按优先级为 official/store/developer/gameplay/video/community。notes 写明公告段落、截图或时间点。核验 URL 格式不等于核实事实，verified 必须来自实际人工核对；工具不自动访问来源或证明审稿真实性。

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
