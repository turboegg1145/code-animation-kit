# AGENTS.md

这个仓库是**用代码逐帧生成动画短片**的工具与工作流。在这里干活前先读完这一页；
要真的开一部片子，去读 `.agents/skills/code-animation/SKILL.md`（那是流程本身）。

## 这里的片子是什么

一个 HTML、一块画布、一个 `draw(t)`。**每一帧都是 `(帧号, 种子, 宽度)` 的纯函数**——它不记得上一帧。
无头 Chrome 把帧渲染成 PNG，ffmpeg 编码，纯 Node 合成配乐。没有素材、没有图片、没有 CDN、没有时间线编辑器。

## 铁律

1. **每帧是纯函数**：禁止累积状态、禁止 `Date.now()`、禁止 `Math.random()`（用 `hash()` / `rng()`）。
   要拖尾或运动模糊，就把物体在 `t−k·dt` 重画 6–10 次、透明度递减——不要叠半透明层。
2. **画布池拿到的第一件事是 `wipe(g)`，用完 `restore()`。** 池里的画布跨帧保留上下文，
   忘了 restore、留着 clip/shadow/合成模式，都会泄漏到下一帧，帧就开始依赖渲染顺序。
3. **逻辑坐标短边固定 1080**，场景永远不碰输出像素。输出高度必须偶数（libx264）。
4. **辅助函数写在分镜块之上。** 九节顺序：参数 → 生成器 → 数学 → 画布池 → 调色板 → 辅助 → 引擎 → 分镜 → boot。
5. **先静帧、再拉片、最后才渲染全片。** 顺序反了就是返工：720 帧要 3.5 分钟，而"字压在水纹上了"在第 1 帧就该看见。
6. **存帧用 `toDataURL()`，绝不用 `page.screenshot()`**；Chrome 必须带 `--disable-accelerated-2d-canvas`，
   否则同一帧在不同标签页里像素不同。
7. **编码一律走 `scripts/build.sh`**（BT.709 打标 + 帧数/时长校验），不要自己拼 ffmpeg 命令。
8. **改画面就只改片子自己的 HTML。** 不要为了让画面好看去动渲染器、编码参数或帧率。

## 命令

```bash
npm i && npx puppeteer browsers install chrome   # 首次（WSL/Debian 还要装一堆 libnss3 之类，见 references/03-render.md）

npm run shot -- 0 60 120   # 只看三帧（迭代主力，比全片快两个数量级）
npm run sheet              # 24 格拉片自检（QA 门）-> shots/sheet.png
npm run render             # 全片 -> frames/f00000.png …
npm run build              # 编码 -> out/film.mp4（自动校验帧数、时长、色彩标记）
npm run audio              # 配乐 -> out/track.wav（参考实现，见下）
npm run demo               # 拉片 + 渲染 + 编码，一条龙
```

脚本都在 `.agents/skills/code-animation/scripts/` 下。**每个脚本都支持 `--help`——先跑 `--help`，不要读源码**；
源码是给改工具的人看的。

## 路径约定

- 技能包内（`SKILL.md` 与 `references/`）所有路径都相对技能包根目录，即 `.agents/skills/code-animation/`。
- 片子的约定位置是项目根的 `film/index.html`；`scripts/render.mjs` 与 `scripts/shot.mjs` 会优先用它，
  没有才回退到技能包自带的 `resources/skeleton.html`。
- `frames/`、`shots/`、`out/`、`node_modules/` 都是产物，已在 `.gitignore` 里。

## 关于配乐

`scripts/audio.mjs` 是**参考实现**，不是通用配乐机：它写的是另一条 24 秒片子的乐谱。
骨架演示只有 6 秒，直接 `npm run audio` 会得到 24 秒音轨，`build.sh` 会打印
`⚠️ 配乐 Xs 与画面 Ys 不一致`——那是提醒你去改 `audio.mjs` 顶部的 `DUR` 与 `SEC_*`，不是 bug。

## 更多

- 流程、决策树、验收门：`.agents/skills/code-animation/SKILL.md`
- 参考资料：`.agents/skills/code-animation/references/`
- 给人看的说明：`README.md`
