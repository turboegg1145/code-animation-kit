# code-animation-kit

> **English abstract.** A tiny toolkit for making animated short films *out of code*: one HTML file, one canvas, one
> `draw(t)`. Every frame is a pure function of `(frame number, seed, width)`; headless Chrome renders the frames,
> ffmpeg assembles them. No footage, no images, no CDN, no timeline editor.
>
> It ships a runnable engine skeleton, a frame renderer with multi-tab parallelism, a contact-sheet QA tool,
> a pure-Node chiptune synthesiser, and the methodology that decides whether the result looks *made* or *generated*.
>
> The whole workflow is packaged as a standard **Agent Skill** (`.agents/skills/code-animation/`), so
> [Antigravity](https://antigravity.google/docs/skills), Claude Code, or any agent that reads `AGENTS.md`
> can pick it up and run it.

![骨架自带的演示分镜](assets/skeleton-sheet.png)

上面这张是 `resources/skeleton.html` 跑出来的：12 格拉片、6 秒、两段分镜（瑞士海报 + 半调网点溶解）。开箱即跑。

---

## 这是什么

2025 年底刷屏的"某某模型直出视频"，绝大多数不是视频生成——是模型写了一个会自己动的网页，再一帧一帧拍成视频。
这个仓库把那套流程里**跟题材无关的部分**抽出来做成工具与工作流：

| 你会得到 | 你不会得到 |
|---|---|
| 一个能跑的引擎骨架（画布池 / 节拍网格 / 分镜系统 / 联系表 / 确定性随机） | 现成的画面。画面得你自己写 |
| 逐帧渲染器（多标签页并行）+ 编码脚本（BT.709 + faststart + 自动校验） | 剪辑、转场库、关键帧编辑器 |
| 纯 Node 合成配乐（方波主音 / 合成鼓 / 与画面共用节拍）的参考实现 | 采样音源、混音台、开箱即用的"配乐机" |
| 一套决定"像人做的还是像模型默认吐的"的判据与拉片清单 | 风格模板。风格必须从题材反推 |

## 三步跑起来

```bash
npm i
# 还要一个 Chrome——用系统装的那个，别用缓存（见下）
sudo apt install -y ./google-chrome-stable_current_amd64.deb
#   .deb 下载：curl -sSL -O https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
#   没有 sudo：dpkg-deb -x <deb> ~/.local/opt/google-chrome-stable && ln -sf ~/.local/opt/google-chrome-stable/opt/google/chrome/chrome ~/.local/bin/google-chrome
#   WSL/Debian 还缺一堆 libnss3 之类的运行库，见 references/03-render.md

npm run shot -- 0 60 120     # 只渲染 3 帧，先看清楚再往下走
npm run sheet                # 24 格拉片 -> shots/sheet.png
npm run demo                 # 渲染 + 编码 -> out/film.mp4（6 秒演示片）
```

浏览器里实时预览：直接打开 `.agents/skills/code-animation/resources/skeleton.html`。
URL 旋钮：`?f=90` 单帧 ｜ `?grid=12&cw=440` 拉片 ｜ `?s=12` 换种子 ｜ `?w=960` 换宽度 ｜ `?ar=9:16` 竖版。

---

## 装进你的 agent

整套工作流是一个标准的 **Agent Skill**（[agentskills.io](https://agentskills.io/home) 开放标准，
Antigravity 与 Claude Code 都认），外加一份 `AGENTS.md`。三种用法：

**① 就在这个仓库里用**——什么都不用装：把 `AGENTS.md` 和 `.agents/` 一起克隆下来，agent 自己会读。

**② 全局安装**（任何项目都能用）：

```bash
# DeepSeek Harness，以及任何读 ~/.agents/skills 的 agent（跨工具的约定位置）
mkdir -p ~/.agents/skills        && cp -r .agents/skills/code-animation ~/.agents/skills/
# Antigravity 2.0 / CLI
mkdir -p ~/.gemini/config/skills && cp -r .agents/skills/code-animation ~/.gemini/config/skills/
# Claude Code（同一个包，同一个开放标准）
mkdir -p ~/.claude/skills        && cp -r .agents/skills/code-animation ~/.claude/skills/
```

装完之后直接说需求，或在对话里打 `/code-animation` 显式调用。

全局装的技能包在**别的项目**里也能直接跑：`scripts/` 先找技能包自己的 `node_modules`，找不到就回退到
**当前运行目录**的 `node_modules`。所以在任意项目里 `npm i puppeteer-core` 之后：

```bash
cd 任意项目
npm i puppeteer-core
node ~/.agents/skills/code-animation/scripts/shot.mjs 0      # 项目里没有 film/index.html 就用技能包自带的骨架
```

**③ 开一部新片子**：把工具拷进新项目，让 agent 照技能执行。

```bash
mkdir -p my-film/film && cd my-film
cp -r <技能包>/scripts .                                  # 四个脚本
cp <技能包>/resources/skeleton.html film/index.html       # 骨架 -> 你的片子
npm i puppeteer-core                                      # 只依赖这一个包
# 然后对 agent 说：照 code-animation 做一部 20 秒的片子，题材是……
```

想继续用 `npm run shot/sheet/render/build` 这套简写，就把本仓库的 `package.json` 也一起拷过去
（只拷 `scripts/` 的话，等价命令是 `node scripts/shot.mjs …`，每个脚本都支持 `--help`）。

`scripts/render.mjs` 与 `scripts/shot.mjs` 会优先渲染项目里的 `film/index.html`，没有才回退到技能包自带的骨架。

---

## 盒子里有什么

```
AGENTS.md                              给任何 agent 的常驻约束（铁律 8 条 + 命令表）
.agents/skills/code-animation/
├── SKILL.md                           流程本身：决策树 + 七步 + 验收门 + 反模式表
├── scripts/render.mjs                 逐帧渲染器：无头 Chrome + 4 个标签页并行抢帧
├── scripts/shot.mjs                   只渲染指定几帧（迭代的主力，比全片快两个数量级）
├── scripts/build.sh                   ffmpeg 编码 + BT.709 打标 + 帧数/时长校验
├── scripts/audio.mjs                  纯 Node 合成配乐，零依赖，确定性 —— **参考实现**，见下
├── resources/skeleton.html            引擎骨架（497 行，可跑，自带两段演示分镜）—— 一切的起点
└── references/                        参考资料（跟着技能包走，全局安装时一起被拷走）
    ├── BRIEF.md                       开工前要填死的参数表
    ├── 00-principles.md               为什么每帧必须是纯函数，以及代价
    ├── 01-engine.md                   引擎解剖 + 手把手加一个新分镜
    ├── 02-style.md                    风格与约束：调色板、缓动、动画十二法、相机
    ├── 03-render.md                   渲染与编码：参数、坑、性能量级
    ├── 04-audio.md                    配乐：结构、节拍对齐、怎么改 BPM
    ├── 05-qa.md                       拉片自检清单 + 常见病对照表
    └── research-notes.md              调研原始笔记
.agents/rules/code-animation.md        文件级规则：改片子 HTML 时自动生效的确定性约束
```

四个脚本都支持 `--help`，**先跑 `--help`，不要读源码**。

---

## 工作流

```
① 问清楚 + 三个方向   题材、时长、画幅、要不要配乐、给谁看；风格给三张关键帧让人挑
② brief.md            锁死：时长/帧数/节拍/调色板/四到六段分镜/每段一句话
③ 搭骨架              拷 skeleton.html -> film/index.html，改 FPS/BPM、填 plate
④ 逐段做              一段一段来：先静态构图 → 再做动画 → 每段跑 npm run shot 看静帧
⑤ 拉片自检            24 格拉片，照 references/05-qa.md 逐条挑，改到挑不出为止（QA 门）
⑥ 配乐                改 audio.mjs 顶部的 DUR / SEC_*，让分节与 plate 边界对齐
⑦ 渲染 + 编码         npm run render && npm run build（自动校验帧数与时长）
```

**顺序不能省。** 我自己的经验：跳过 ① 直接开工，做出来的东西十有八九是"深海军蓝底 + 霓虹渐变 + 为了氛围的粒子"；
跳过 ⑤ 直接渲染全片，720 帧要 3.5 分钟，而"这个字压在水纹上了"这种问题在第 1 帧的静帧里就能看出来。

细节在 [SKILL.md](.agents/skills/code-animation/SKILL.md)。

---

## 引擎的三十秒版本

一个 HTML 文件里，九节按固定顺序排开，**辅助函数必须在分镜之上**（否则删掉一段镜头会把夹在中间的辅助函数一起删掉）：

```
参数 → 生成器 → 数学 → 画布池 → 调色板 → 辅助函数 → 引擎 → 分镜 → boot
```

三件事值得单独说：

**三个生成器，各管一个时间尺度。** 都掺进段落名，所以插入或删掉一段不会改变别的段的随机数：

```js
R    = rng(hash(seed,'plate',name))              // 整段稳定：构图、地形、浪的位置
S.b  = rng(hash(seed,'b',name,Math.floor(n/3)))  // 每 3 帧重掷：手绘线的"沸腾"抖动
S.nz = rng(hash(seed,'nz',n))                    // 每帧重掷：噪声场
```

**逻辑坐标固定短边 1080。** 场景只画逻辑坐标，引擎统一缩放到输出像素，`?w=960` 换宽度不用改一行构图代码。

**节拍即时间轴。** `FPS=30, BPM=120 → BEAT=15 帧`；每段长度取 BEAT 的整数倍；段内用局部帧 `S.i`，
跨段对齐用全局帧 `S.f`，镜头之间不写死帧号而用 `at('dots',2)`。

```js
plate('dots',{len:BAR,cutIn:false,cutOut:false},(S,R)=>{ /* 画这一段的第 S.i 帧 */ });
```

细节、API 签名、以及"怎么加一个新分镜"在 [01-engine.md](.agents/skills/code-animation/references/01-engine.md)。

---

## 诚实的部分

- **它不生成画面。** 它让模型写代码画画面。画不出来的东西（流体、布料、写实材质）就是画不出来——
  真物理得按固定 dt 逐帧推，代价是不能 seek。
- **文字是强项，节奏是弱项。** 代码画字特别准；但"缓动够不够、镜头是不是该再短一点"这种判断，
  只能靠规则 + 拉片 + 人类看一眼。这套工具替不了人眼。
- **配乐是合成的，而且 `audio.mjs` 是"一部片子的配乐"的参考实现，不是通用配乐机。** 它是手写的加法合成
  chiptune（动态范围约 14 dB，不是管弦），四段结构是为另一条 24 秒片子写的。换片子要改 `DUR` 和 `SEC_*`；
  `build.sh` 会检查音画时长并在不一致时报警。
- **性能量级要心里有数，而且波动很大。** 1920×1080 单帧的耗时几乎全由逐像素后处理（`post()` 的颗粒 + 暗角）
  决定：关掉 50–80ms/帧，开着 200–700ms/帧（同一台机器上，随并行标签页数和系统负载能差三倍）。
  720 帧 @4 标签页实测 3.2–3.5 分钟。**先把 `post()` 调好，再决定要不要全片重渲。**

---

## 出处

这套工具链的原理来自三个 MIT 开源项目，实现全部重写：

- [smwbev/framewright](https://github.com/smwbev/framewright) — 骨架结构、渲染脚本、编码参数、拉片自检
- [kiselas/every-frame-is-code](https://github.com/kiselas/every-frame-is-code) — 质量方法论、动画十二法在代码里的落地
- [Kianzzz/xilo-opus-video](https://github.com/Kianzzz/xilo-opus-video) — 中文流程：问需求 → 方案预览 → brief → 逐镜头静帧自检

用这套工具做出来的第一条片子（24 秒，四段风格）：**[turboegg1145/every-frame-is-a-function](https://github.com/turboegg1145/every-frame-is-a-function)**
——那个仓库的 README 写了做它的过程中踩的 8 个坑。

MIT License.
