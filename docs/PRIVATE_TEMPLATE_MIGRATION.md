# 独立私有母版迁移方案（等待单独授权，未执行）

2026-10-16 只读核对：`jjasnek-ops/gameforge-wiki` 仍为 public Fork，parent 为 `PNGTRID/AnvilWiki`，API 报告 size 6392 KiB、forks_count 0。仓库状态可能改变，执行前必须重新核对。重命名、删 README、改 remote 不会解除 GitHub Fork 网络关系。本轮没有创建仓库、调整可见性、脱离 Fork、归档、删除、重写历史或强推。

## 推荐：新建空的独立私有仓库

1. 等待用户单独授权，明确新仓库的 owner/name、私有可见性、是否保留旧库为只读参考，以及备份位置。不把当前公开库改私有作为既定动作。
2. 合并经过审核的 PR #2 和品牌隔离 PR，或明确记录尚未合并的分支。记录 main/全部需要的分支和标签 SHA、默认分支、保护规则、当前 CI 结果、LFS/submodules 状态。导出需要的 issue/PR/release/wiki/附件与权限设置；Git 历史不包含这些 GitHub 元数据。
3. 对当前仓库做完整 fetch 和离线 `git bundle` 备份，校验可克隆及关键 SHA。对需要保留的 PR refs、未推送提交和工作区另行备份；不运行清理或历史过滤。秘密检查必须在迁移前做，已经公开过的真实秘密即使移入私有库仍应撤销轮换。
4. 创建**全新、空白、private、非 Fork** 的仓库，不预置 README/LICENSE，不接入部署服务。核对目标确实为空且属于授权 owner。以完整克隆为输入，分别推送所需 heads/tags；不对非空库使用 mirror、不强推、不删远端 refs。若使用 LFS，另做完整 LFS fetch/push 并校验对象；submodule 仓库需单独授权和保留引用。保留原提交、父子关系、作者、日期、标签和完整 LICENSE/SOURCE_PROVENANCE。
5. 更改本地新克隆的 origin，保留只读 upstream 来源记录；在新库设置默认分支及审查/保护规则。先禁用可能提交外部 URL、发布内容或部署的定时工作流，再核对 Actions 权限。迁移 YAML 不会迁移 Secrets、变量、环境保护、安装 App、Webhooks、Pages/Cloudflare 项目绑定等账户设置。这些都需独立授权后按最小权限重建，本轮不操作。
6. 在新私有库运行完整根目录测试、运营工具测试、原初始化器 E2E、Roblox/Steam 生成、SEO、品牌、许可与秘密检测。核对新旧 refs SHA、许可哈希、构建输出和新站功能一致，再由用户决定切换日常开发入口。
7. 旧公开 Fork 默认原样保留；是否归档或更新迁移说明另行授权。不要删除旧库来尝试消除来源。现有 PR、链接与公开提交仍可被追溯；新库私有也不能撤回已有克隆、搜索缓存、Fork、下载包及公共许可证声明。

## 备选：GitHub 的脱离 Fork 网络操作

[GitHub 官方文档](https://docs.github.com/en/pull-requests/how-tos/work-with-forks/detaching-a-fork) 当前提供的直接脱离条件包括 public、低于 1 GB、没有子 Fork；需要在执行时核对 UI 与最新限制。该操作永久改变网络关系，可能丢失与 Fork 关联的 issue/PR/wiki/star/watch 等元数据，不能仅按“保留代码”评估风险。即便符合条件，本轮也不点击 Leave fork network，不改可见性。若要走此路径，应先备份并列明实际会丢失的元数据，由用户单独授权。

参考：[复制仓库与 LFS](https://docs.github.com/en/repositories/creating-and-managing-repositories/duplicating-a-repository)、[MIT 保留通知条件](https://opensource.org/license/mit)。私有化控制今后的访问权限，不赋予隐藏原作者或否认来源的权利。
