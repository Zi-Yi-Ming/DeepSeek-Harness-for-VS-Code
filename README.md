# DeepSeek Harness for VS Code (dsh-vscode)

<img width="3071" height="1919" alt="屏幕截图 2026-08-14 175802" src="https://github.com/user-attachments/assets/e9881be7-332c-4591-9590-26e487802e5e" />
<img width="3066" height="1919" alt="屏幕截图 2026-08-14 180205" src="https://github.com/user-attachments/assets/ab613456-637e-4dd6-b23c-ba4d0f49324a" />


> **个人修改版(fork:foorgange)**
> 本仓库是 [NEXTINDIE/DeepSeek-Harness-for-VS-Code](https://github.com/NEXTINDIE/DeepSeek-Harness-for-VS-Code) 的个人 fork 修改版,
> 在原版基础上深度定制,包含大量个人改动(部分改动曾以 PR 回馈上游,PR #3~#6)。
>
> **特性清单**:
>
> - 工作区自动同步:VS Code 打开的文件夹自动成为 DSH 工作区,无需手动指定
> - 侧边栏图标:DeepSeek 官方鲸鱼 logo(纯黑/淡色主题自适应 SVG)
> - 界面去 emoji:所有 UI 图标改为纯黑/淡色线条 SVG,文案与文档不含 emoji(含运行时过滤,服务端数据也滤)
> - 对话标签页:每个会话在编辑器区以标签页打开,侧边栏为带搜索框、按工作区分组的会话列表(可展开/收起)
> - 会话统计实时常驻:轮数/步数/耗时/tok·s/缓存命中/输入输出 token 常驻显示并实时刷新
> - 任务进度面板:输入框上方常驻「任务」摘要条,展开显示完整任务清单,与 Web 端一致且实时同步
> - 插话发送:Ctrl+Enter(Cmd+Enter)立即打断当前回合插入新指令,排队消息带「插话发送」按钮
> - 回合级 Git 回退:回合分隔线带「还原检查点」,回退前代码审核预览(diff 逐文件展开),/undo /redo /checkpoints
> - 与 Web 端完全双向同步:对话历史、权限预设、模型与推理等级、工作区及其中的会话
> - SCM 提交信息生成:源代码管理面板一键让 DSH 生成提交信息
> - 对话动效与流畅度优化:流式渲染节流 + 闪烁光标 + 消息动画(尊重系统减少动态效果设置)
> - 新建对话自动归属当前 VS Code 目录(工作区→打开文件目录→用户主目录兜底),可弹出选择器指定工作区
> - 对话内容限宽居中(输入框 760px、消息区 1200px)
>
> 安装本修改版:直接下载 [Releases](https://github.com/foorgange/DeepSeek-Harness-for-VS-Code/releases) 中的 `.vsix` 文件
> (VS Code → 扩展 → 右上角 … → 从 VSIX 安装)。
>
> 本 README 即为个人版说明(不再保留原版 README 内容)。

---

## 功能总览

在 VS Code 中直接使用 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)(`dsh`),支持**中英文双语界面**。

### 界面与交互

- **对话标签页**:每个会话在编辑器区以独立标签页打开,可与代码文件随意切换;侧边栏为会话列表(搜索框 + 按工作区分组 + 展开/收起),运行中会话有高亮圆点
- **独立聊天窗口**:`DSH: 打开独立聊天窗口` 命令,以及侧边栏子 tab 视图
- **现代聊天界面**:大号圆角输入框、胶囊工具栏(思考深度 / 模型 / 预设 / 权限)、消息区限宽居中(1200px)、输入框 760px
- **动效**:消息淡入、流式闪烁光标、按钮过渡,全部尊重 `prefers-reduced-motion`
- **纯线条图标**:无 emoji,黑白 SVG 自动适配明暗主题

### 对话能力

- **实时会话统计**:轮数 · 步骤 · LLM/工具耗时 · 首 token · tok/s · 缓存命中 · 输入/输出 token,常驻显示每 5 秒刷新
- **任务进度面板**:「任务 N 进行中 · M 待处理」摘要条 + 展开清单(完成=对勾/进行中=圆弧/待处理=虚线圆),与 Web 端同步
- **插话发送**:运行中 Ctrl+Enter(Cmd+Enter)立即打断当前回合;Enter 排队;排队消息带「插话发送」按钮
- **回合级 Git 回退**(服务端 dsh-git-rollback 插件自动安装):回合分隔线带「还原检查点」,点击后先展示代码审核预览(逐文件增删行数 + 可展开 diff + 将删除的未跟踪文件提示),确认后回退;支持 `/undo` `/redo` `/checkpoints` 斜杠命令
- **审批/提问卡片**:工具调用审批、多选提问、计划模式确认
- **排队消息实时同步**:队列状态即时转发,插话/移除即时生效

### 与 Web 端双向同步

- 对话历史:Web 端聊过的会话在插件端打开即可见完整历史(自动回填 + 「加载更早」分页)
- 权限预设、模型、推理等级:任一端切换,另一端即时可见
- 工作区与其中的会话:新建会话自动挂入工作区,Web 端左侧按工作区分组可见
- 会话统计/任务进度/目标卡片:实时刷新,与 Web 端一致

### 其他

- **SCM 提交信息生成**:源代码管理面板(SCM)标题栏「生成提交信息」按钮,DSH 根据 diff 生成提交信息写入输入框
- **@dsh 聊天参与者**:VS Code 原生 Chat 面板输入 `@` 选择 `dsh`,支持 `/new`、`/session <ID>`、`/preset <名>` 斜杠命令;跟随提示自动生成
- **新建对话归属**:自动归入当前 VS Code 目录对应工作区(工作区→打开文件目录→用户主目录兜底),可弹出目录选择器指定
- **长会话历史修复**:历史回放过滤流式分片,12 万+ 事件会话不卡死
- **界面 emoji 双层防线**:源码无 emoji + 运行时过滤(服务端数据里的 emoji 也会被滤掉)

## 快捷键

| 操作 | 快捷键 |
|---|---|
| 发送消息 | `Enter`(Shift+Enter 换行) |
| 插话(打断当前回合) | `Ctrl+Enter`(macOS `Cmd+Enter`) |
| 停止回复 | 输入框右侧按钮 |

## 安装

从 [Releases](https://github.com/foorgange/DeepSeek-Harness-for-VS-Code/releases) 下载最新 `.vsix`:
VS Code → 扩展 → 右上角 `...` → **从 VSIX 安装**。

要求:VS Code 1.90+,本机可运行 `dsh`(服务器自动启动,或手动 `dsh web`)。

## 开发

```bash
npm install
npm run typecheck     # 类型检查
npm run build         # esbuild 构建 dist/
npm test              # 冒烟测试(store 链路 + 渲染 + 产物/emoji 验证)
```

打包:参见维护手册(手工 zip 打包 vsix)。

## 相关链接

- Fork 仓库:https://github.com/foorgange/DeepSeek-Harness-for-VS-Code
- 上游:https://github.com/NEXTINDIE/DeepSeek-Harness-for-VS-Code
- DSH 本体:https://github.com/deepseek-ai/deepseek-harness
- 回馈上游的 PR:#3(工作区同步)、#4(鲸鱼图标)、#5(编辑器标签页+会话列表)、#6(去 emoji)
