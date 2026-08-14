# 官方上游同步评估脚本
# 用法: pwsh sync-upstream.ps1
# 功能:
#   1. fetch 官方上游(NEXTINDIE/DeepSeek-Harness-for-VS-Code)
#   2. 显示上游新增提交与改动文件统计
#   3. 在临时分支试 merge,检测冲突文件清单与规模(不污染 main)
#   4. 给出同步建议(可移植项 vs 高风险项)
# 之后的操作由人决定: 值得合并就 git merge upstream/main 手动解决; 不值得就只 cherry-pick 独立文件。

# 注意: git 的 stderr 警告(如 branch 切换提示)在 PowerShell 中会显示为错误,
# 因此这里用 Continue 而不是 Stop;关键失败由后续逻辑判断。
$ErrorActionPreference = "Continue"
$repo = "C:\Users\lihe4\Downloads\DeepSeek-Harness-for-VS-Code"
Set-Location $repo

Write-Host "=== 1) 拉取官方上游 ===" -ForegroundColor Cyan
git fetch upstream 2>&1 | Out-Host

$behind = git rev-list --count main..upstream/main
$ahead = git rev-list --count main...upstream/main
if ([int]$behind -eq 0) {
    Write-Host "上游没有新提交,本地 main 已是最新。" -ForegroundColor Green
    exit 0
}
Write-Host "上游领先 $behind 个提交(fork 独有 $ahead 个提交)。" -ForegroundColor Yellow

Write-Host "`n=== 2) 上游新增提交 ===" -ForegroundColor Cyan
git log main..upstream/main --oneline | Out-Host

Write-Host "`n=== 3) 上游改动文件统计 ===" -ForegroundColor Cyan
git diff --stat main...upstream/main | Select-Object -Last 45 | Out-Host

Write-Host "`n=== 4) 冲突预检(临时分支试 merge,完成后自动放弃) ===" -ForegroundColor Cyan
$testBranch = "sync-check"
$exists = git branch --list $testBranch
if ($exists) { git branch -D $testBranch 2>$null | Out-Null }
git checkout -b $testBranch main 2>&1 | Out-Null
git merge upstream/main --no-commit 2>&1 | Select-String "CONFLICT|Auto-merging|Merge made" | Out-Host
$conflicts = git diff --name-only --diff-filter=U
if ($conflicts) {
    Write-Host "`n冲突文件($($conflicts.Count)):" -ForegroundColor Red
    foreach ($c in $conflicts) {
        $ours = (git show ":2:$c" 2>$null | Measure-Object -Line).Lines
        $theirs = (git show ":3:$c" 2>$null | Measure-Object -Line).Lines
        Write-Host ("  {0,-42} 个人 {1,5} 行 vs 上游 {2,5} 行" -f $c, $ours, $theirs)
    }
    Write-Host "`n建议: 若冲突集中在 ui.ts/channel.ts/hub.ts/l10n 等定制核心,完整合并成本高。" -ForegroundColor Yellow
    Write-Host "推荐做法: 保留个人 main(不动),按需 cherry-pick 上游的独立新文件(如新增的 src/** 单文件),"
    Write-Host "或手动移植价值高的功能; 架构级重构(多语言/面板体系)建议跳过。" -ForegroundColor Yellow
} else {
    Write-Host "`n无冲突,可直接合并: git merge upstream/main" -ForegroundColor Green
}
git merge --abort 2>$null | Out-Null
git checkout main 2>&1 | Out-Null
git branch -D $testBranch 2>$null | Out-Null
Write-Host "`n(main 未受影响,检查完成)" -ForegroundColor DarkGray
