# 提交清单（dsh-go / 市场）

发布 dsh-skills-tools 1.0.0 时需要提交或核对的信息。

## 包

- npm：dsh-skills-tools@1.0.0，tag latest，publishConfig.access = public
- GitHub：https://github.com/hxlog/dsh-skills-tools，tag v1.0.0
- dsh-package.json：id hxlog/dsh-skills-tools，manifest_version 2，entrypoints.bundle cordis.patch.yml
- 权限：fs.read、fs.write、network、process.spawn（git 子进程）
- 能力：skills.management、skills.provider、git.import、settings.panel

## 必须随包提供

- package.json / dsh-package.json / cordis.patch.yml / icon.svg / LICENSE
- lib/（宿主 ESM）与 client/client.js（构建产物）
- locale/zh.json、locale/en.json
- README.md、README.en.md
- docs/API.md、docs/VERIFICATION.md、docs/MARKETPLACES.md

## 审核问答

**为什么需要 process.spawn？**
导入与更新通过本机 git 命令完成（clone / ls-remote / rev-parse），以参数数组启动，不经过 shell；不使用远程 API，也不执行仓库内脚本。

**为什么需要 fs.write？**
把克隆结果复制为只读快照，并写入 state.json、logs.jsonl 与临时目录；不会修改用户仓库或原生技能目录。

**是否会上传数据？**
不会。除 git 传输本身外没有出站请求；不收集遥测。

**如何卸载干净？**
移除插件行并重启；数据目录 $DSH_HOME/dsh-skills-tools 可整体删除。

## 发布命令

    npm test
    npm run test:manager
    npm run ci-check
    npm run verify:dsh-go
    npm pack --dry-run
    npm publish            # 需要浏览器 OTP
    git tag v1.0.0 && git push --tags
    gh release create v1.0.0 --notes-file docs/release-notes-v1.0.0.md
