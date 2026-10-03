---
name: code-animation
description: 用代码逐帧生成动画短片的工作流：一个 HTML、一块画布、一个 draw(t)，每一帧都是 (帧号, 种子, 宽度) 的纯函数；无头 Chrome 逐帧渲染、ffmpeg 编码、纯 Node 合成配乐，中途用静帧和 24 格拉片自检。当用户要做代码动画、逐帧动画、程序化生成的短片、像素动画视频、数据可视化影片、可重渲的片头/循环动画，或想复刻推特上"某某模型直出视频"那种片子时使用。
---

# 代码动画

把"一个会自己动的网页"变成一部片子：**画面是代码画的，不是模型生成的**。
所以风格由约束决定，所以镜头必须被逐帧审查——**先静帧、再拉片、最后才渲染全片**。

本技能包内所有路径都相对技能包根目录（即本文件所在目录）：`scripts/` 是工具，`resources/skeleton.html` 是引擎骨架，`references/` 是参考资料。

下面的命令用 `npm run X` 写法，它假设项目里拷了本仓库的 `package.json`。**如果只拷了 `scripts/`，等价写法是**
`node scripts/shot.mjs <帧号...>`、`SHEET=shots/sheet.png node scripts/render.mjs frames 7`、`node scripts/render.mjs`、
`bash scripts/build.sh`、`node scripts/audio.mjs`。四个脚本都支持 `--help`——**先跑 `--help`，不要读源码**。

## 什么时候用 / 不用

**用**：10–90 秒的短片，且接受"风格化 > 写实"（铜版画、像素画、瑞士海报、终端、蓝图、半调网点、几何构成……）；
要复刻"模型直出视频"；要一段能 re-render 的片头/片尾/循环动画（改一个参数重新出片，不需要剪辑软件）。

**不用**：写实画面、真人素材剪辑、需要精确对白的口播、超过 2 分钟的长片（逐帧渲染的时间会失控）。

## 红线（违反任何一条，最后一定返工）

1. 每帧是纯函数：不许累积状态、不许 `Date.now()`、不许 `Math.random()`（用 `hash()/rng()`）。
2. 从画布池取到画布的第一件事是 `wipe(g)`，用完 `restore()`；否则上一帧的 clip/阴影/合成模式会泄漏到下一帧。
3. 逻辑坐标短边固定 1080，场景不碰输出像素；输出高度必须偶数。
4. 存帧用 `toDataURL()`，绝不用 `page.screenshot()`；Chrome 必须带 `--disable-accelerated-2d-canvas`。
5. 编码一律走 `scripts/build.sh`（BT.709 打标 + 帧数/时长校验），不要自己拼 ffmpeg 命令。
6. **没有出过 24 格拉片，不许渲染全片。**

## 先定规模（决策树）

| 成片时长 | 段数 | 风格 | 备注 |
|---|---|---|---|
| ≤ 10s | 1–2 段 | 一个风格做到底 | 一个动作、一个信息。别塞第二件事 |
| 10–40s | 3–5 段 | **每段换风格** | 最划算的区间。硬切、用节拍对齐 |
| 40–90s | 5–7 段 | 两三个风格来回 | 必须有叙事骨架，否则观众会走 |
| > 90s | — | — | 先劝退，或者拆成几条 |

横竖屏、有没有配乐、有没有必须出现的字——这三件事在动手前问清楚，**不要自己拍板**。
用户说不清风格时：给三个方向、各渲一张关键帧，让他挑。

## 七步流程

### ① 问 + 三个方向
题材 / 给谁看 / 几秒 / 横竖屏 / 要不要配乐 / 必须出现的字。
风格三选一：给三张关键帧（用 `scripts/shot.mjs` 渲同一个镜头的三种配色或构图），让人挑。

### ② brief.md（锁死参数）
抄 `references/BRIEF.md`，把 `FPS / BPM / 总帧数 / 画幅 / 调色板（4–6 色 + 角色）/ 分镜表 / CUES` 全部填死。
段落长度取 `BEAT = round(FPS*60/BPM)` 的整数倍。**这张表填不出来，说明还没想清楚，别开始画。**

### ③ 搭骨架
把 `resources/skeleton.html` 拷进项目（约定放在 `film/index.html`），改 `FPS/BPM`、改 `CUES`、换调色板。
九节顺序不能改：参数 → 生成器 → 数学 → 画布池 → 调色板 → **辅助函数** → 引擎 → 分镜 → boot。
辅助函数必须在分镜块**之上**，否则删一段镜头会把它一起删掉。

```js
plate('名字', {len: 4*BAR, cutIn: false}, (S, R) => {
  // S.f 全局帧，S.i 段内局部帧，S.t 秒，S.b 每 3 帧重掷，S.nz 每帧重掷
  // 只画这一帧，不许读上一帧
});
```

一个 plate 一个 plate 地填：**先只画静态构图**（把 `S.i` 当 0），静帧确认构图 → 再加动画 → 再加细节。
跨段对齐用 `at('名字', 拍数)`，不要写死帧号；画面和声音共用的时刻写进 `CUES`。

### ④ 每段自检（静帧）
```bash
npm run shot -- <段首帧> <中段帧> <段末帧>
```
看四件事：文字压物体没有？主体清不清楚？有没有越安全区（每轴中央 92%）？这一秒里视线该落在哪？

### ⑤ 拉片自检（QA 门）
```bash
npm run sheet            # -> shots/sheet.png，24 格覆盖全片
```
逐条核对 `references/05-qa.md` 的清单：文字压不压物体、有没有超过 1.5 秒的静止、该缓动的地方有没有线性、
前 2 秒勾不勾人、镜头是不是越接近高潮越短。**人类挑得出的毛病，拉片里基本都能挑出来。**

### ⑥ 配乐
```bash
npm run audio            # -> out/track.wav
```
`scripts/audio.mjs` 是**参考实现**（另一条 24 秒片子的乐谱），换片子要改它顶部的 `DUR` 与 `SEC_*` 分节边界，
让分节边界与 plate 边界对齐。`build.sh` 会在音画时长不一致时报警——那个警告不是 bug，是提醒你去改常量。

### ⑦ 渲染 + 编码
```bash
npm run render           # -> frames/f00000.png …
npm run build            # -> out/film.mp4（自动校验帧数、时长、色彩标记）
```
渲染前把 `post()`（逐像素颗粒 + 暗角）调好：它占单帧耗时的 85–90%，开着 200–700ms/帧、关掉 50–80ms/帧。

## 反模式（每条都真的花掉过我一小时以上）

| 症状 | 原因 |
|---|---|
| `drawImage: The provided value is not of type '(CSSImageValue or HTMLCanvasElement …)'` | `cvs()` 返回画布、`wipe(cvs(...).getContext('2d'))` 返回上下文，两者不能混用 |
| 拉片里某几格黑掉 / 递归爆栈 | 联系表要采样全片，而某段自己又要建联系表 → 加"正在渲染中"的闸门；嵌套渲染必须换一块内容画布，否则内层 resize 会擦掉外层 |
| 某段动画整段不出现 | 局部帧减了全局帧（`S.i - (T0+X)` 得到负数）→ 一律用 `S.f` |
| 同一帧在不同标签页颜色不一样 | 没加 `--disable-accelerated-2d-canvas` |
| canvas 画中文是空白、还不报错 | 没装中文字体（`fc-list :lang=zh \| wc -l` 为 0） |
| 末帧全黑 | 转场把最后一段的结尾也压黑了 → 给最后一段 `cutOut: false` |
| 饱和色整体偏色 | ffmpeg 没打 BT.709 标记 |
| 画面"像模型默认吐的" | 深海军蓝 + 霓虹渐变 + 为了氛围的粒子 + 全部匀速 + 只有交叉溶解。**风格必须从题材反推**，见 `references/02-style.md` |

## 参考资料

| 文件 | 内容 |
|---|---|
| `references/00-principles.md` | 为什么每帧必须是纯函数，以及它的代价 |
| `references/01-engine.md` | 引擎解剖：九节顺序、全部 API 签名、手把手加一个新分镜 |
| `references/02-style.md` | 风格与约束：调色板、缓动与时长表、动画十二法、相机规则 |
| `references/03-render.md` | 渲染与编码：参数、环境变量、坑、性能量级 |
| `references/04-audio.md` | 配乐：结构、节拍对齐、怎么改 BPM 和分节 |
| `references/05-qa.md` | 拉片自检清单 18 条 + 常见病对照表 + 量化命令 |
| `references/BRIEF.md` | 开工前要填死的参数表 |
| `references/research-notes.md` | 调研原始笔记（framewright / every-frame-is-code / xilo-opus-video） |

原理出处（均 MIT，实现全部重写）：[framewright](https://github.com/smwbev/framewright)、
[every-frame-is-code](https://github.com/kiselas/every-frame-is-code)、
[xilo-opus-video](https://github.com/Kianzzz/xilo-opus-video)。
