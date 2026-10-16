# 软件来源与许可记录（母版内部）

本项目由 https://github.com/PNGTRID/AnvilWiki 派生，当前母版为 https://github.com/jjasnek-ops/gameforge-wiki 。Git 历史与原作者声明真实保留；修改品牌不表示重新创作了全部代码，也不表示获得游戏素材的权利。本文件不复制到独立站、不进入 dist；它是 B 类来源记录，不是需要抹去的泄露。

原项目 `LICENSE` 完整保留 `Copyright (c) 2026 AnvilWiki contributors`、MIT 授权、保留通知条件和免责条款。`licenses/site-software.txt` 是相同文本的分发副本。以 LF 归一化后的 SHA-256 为 `66a7943308a74e32788b272b1d30faa5b87f250d1750f7a901765cad79b1f9ae`；检测不会通过移除它来实现“无母版字样”。

2026-10-16 核对的许可来源：

| 分发文本 | 来源及适用对象 |
| --- | --- |
| site-software.txt | [原项目 LICENSE](https://raw.githubusercontent.com/PNGTRID/AnvilWiki/main/LICENSE)，本站软件继承代码 |
| astro.txt | 当前锁文件安装的 `astro/LICENSE`，Astro 客户端软件 |
| tailwindcss.txt | 当前锁文件安装的 `tailwindcss/LICENSE`，生成样式使用的框架 |
| pagefind.txt | 当前锁文件安装的 `pagefind/LICENSE/LICENSE`，分发到浏览器的搜索运行时 |
| lato.txt | [Lato OFL](https://raw.githubusercontent.com/google/fonts/main/ofl/lato/OFL.txt)，图形生成使用的字体及其授权条件 |
| lucide.txt | [Lucide LICENSE](https://raw.githubusercontent.com/lucide-icons/lucide/main/LICENSE)，完整保留 Lucide ISC 与继承的 Feather MIT 声明 |

`pnpm-lock.yaml` 记录实际依赖版本。安装包带有的其他依赖授权仍保留在安装包中；新增要分发到浏览器的依赖、字体、图片时必须重新核对其许可，不能把本清单当作未来所有依赖的许可证明。清单哈希记录在 `licenses/manifest.json`，新站构建复制六份完整文本至 `dist/licenses/`。原 LICENSE 仍随新站源码保留。修改作者如需添加自己的版权，应另加真实声明，不能覆盖原声明；本轮没有虚构新的权利人。

MIT 要求在软件副本或重要部分中保留版权及许可声明，不要求首页出现推广页脚。参见 [MIT 标准文本](https://opensource.org/license/mit)。软件许可不替代游戏名称、商标、截图、攻略内容和第三方资源各自的授权。
