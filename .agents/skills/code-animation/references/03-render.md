# 03 · 渲染与编码：参数、坑、性能量级
这一篇是「把 HTML 变成 mp4」的完整手册：三个脚本的全部参数与环境变量、为什么必须那么做、实测的性能数字、以及 WSL/Debian 上的环境依赖。
## 1. 五个入口
仓库根目录有现成的 npm 脚本（`package.json`）：
```bash
npm run shot -- 0 60 120     # node scripts/shot.mjs      -> shots/f00000.png …
npm run sheet                # SHEET=shots/sheet.png SHEET_N=24 SHEET_W=460 node scripts/render.mjs frames 7
npm run render               # node scripts/render.mjs frames 7     -> frames/
npm run build                # bash scripts/build.sh               -> out/film.mp4
npm run audio                # node scripts/audio.mjs              -> out/track.wav
npm run make                 # render + build
npm run demo                 # sheet + render + build
```
约定：**脚本都在 `.agents/skills/code-animation/scripts/` 下，而 `frames/` `out/` `shots/` 都在项目根目录**，所以要么用 `npm run …`，要么先 `cd` 到项目根再 `node <技能包>/scripts/render.mjs …`。

前置条件（一次性）：
```bash
npm i                                    # 只装 puppeteer-core（^23.0.0），零其它依赖
# 装一个正经的 Chrome（三选一，脚本都认）
sudo apt install -y ./google-chrome-stable_current_amd64.deb   # ① 推荐：官方 .deb -> /usr/bin/google-chrome
#   下载：curl -sSL -O https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
dpkg-deb -x google-chrome-stable_current_amd64.deb ~/.local/opt/google-chrome-stable   # ② 没有 sudo：
ln -sf ~/.local/opt/google-chrome-stable/opt/google/chrome/chrome ~/.local/bin/google-chrome
npx puppeteer browsers install chrome                          # ③ 下到 ~/.cache/puppeteer（能用，但那是缓存目录）
```
> 两个渲染脚本找页面的顺序是：**项目根有 `film/index.html` 就用它，没有才用技能包自带的 `resources/skeleton.html`**。所以在这个仓库里 `npm i` 之后立刻就能跑通；在你自己的项目里把片子放成 `film/index.html` 即可，不用每次写 `HTML=`。
## 2. `scripts/render.mjs`：逐帧渲染器（120 行）
```bash
node scripts/render.mjs [输出目录=frames] [seed=7] [宽度] [标签页数=4]
```
例：
```bash
node scripts/render.mjs frames 7                 # 1920 宽、4 个标签页
node scripts/render.mjs frames 7 1920 1          # 单标签页（排查用）
node scripts/render.mjs /tmp/look 12 960 4       # 换种子、换宽度、换目录
```

| 位置参数 | 默认 | 含义 |
|---|---|---|
| 1 | `frames` | 输出目录（不存在会自动建） |
| 2 | `7` | seed |
| 3 | 空 | 输出宽度；**空的时候问页面**：横屏 1920、竖屏 1080（`AR < 1` 时） |
| 4 | `4` | 标签页数（`Math.max(1, +tabsS)`） |
**环境变量（全部）**：

| 变量 | 默认 | 作用 |
|---|---|---|
| `HTML` | `resources/skeleton.html` | 要渲染的页面（会 `path.resolve`，不存在就报 `没有这个文件：…（用 HTML= 指定）` 并退出 1） |
| `AR` | 空 | 画幅，会作为 `&ar=` 拼进 URL（`?f=0&w=320&s=7&ar=9:16`） |
| `START` | `0` | 起始帧 |
| `END` | `total` | 结束帧（不含）；实际取 `Math.min(total, END)` |
| `RESUME` | 空 | 只要**存在**（`RESUME=1`）就跳过已存在的 `fNNNNN.png` |
| `SHEET` | 空 | 给路径 = 只出拉片、不渲视频（见 3 节） |
| `SHEET_N` | `24` | 拉片格数 |
| `SHEET_W` | `480` | 每格宽（像素） |
| `SHEET_FROM` | `0` | 拉片采样起点 |
| `SHEET_TO` | `total-1` | 拉片采样终点 |
| `CHROME` | 空 | Chrome 可执行文件路径（优先级最高） |
**Chrome 的查找顺序**（`findChrome()`）：`CHROME` / `CHROME_BIN` 环境变量 → **系统里装的那些**（`/usr/bin/google-chrome`、`/usr/bin/google-chrome-stable`、`/opt/google/chrome/chrome`、`~/.local/bin/google-chrome`、`~/.local/opt/google-chrome-stable/opt/google/chrome/chrome`、`/usr/bin/chromium`、`/snap/bin/chromium`、brave、edge）→ 都没有才用 `$HOME/.cache/puppeteer/chrome/*` 里**按版本号倒序**找到的 `chrome-linux64/chrome`。
> 顺序是**系统优先**：正经装的 Chrome 会跟着系统更新，而 `.cache/` 里的那份是死的、还可能被清理工具删掉。
> 实测过：用系统 Chrome（154.0.8037.97）和用 puppeteer 下到缓存里的（154.0.8037.57）渲染同一帧，
> 与已编码 mp4 解码帧的平均差 1.58/255、最大 9——差异全部来自 x264 有损压缩，不是浏览器。
```
找不到 Chrome：装一个（apt install google-chrome-stable，或 npx puppeteer browsers install chrome），或用 CHROME=/path/to/chrome 指定
```
**启动参数（逐字，和 `shot.mjs` 一致）**：
```js
args: ['--allow-file-access-from-files', '--disable-accelerated-2d-canvas',
       '--force-color-profile=srgb', '--hide-scrollbars', '--mute-audio', '--no-sandbox']
```
外加 `headless: true`、`protocolTimeout: 900000`（15 分钟，防止某帧超长后被协议层掐掉）。

**跑起来长这样**：
```
720 帧 = 24.0s @ 30fps，渲染 0..719，宽度 1920，4 个标签页
分镜： ink:180(6.0s)  pixel:210(7.0s)  type:180(6.0s)  phos:150(5.0s)
60/720  9s，约剩 99s
…
完成 720 帧，用时 205s
```
页面里的报错会被转发出来（每个 worker 页面都挂了 `pageerror` / `console` 监听）：
```
页面报错： xxx is not defined
控制台： Uncaught TypeError: …
第 417 帧失败： …
```
有失败帧时最后会 `process.exit(1)`——**别忽略它**，那说明有些帧是缺的，`build.sh` 编出来的片子会跳帧。
## 3. `scripts/shot.mjs`：静帧取样（52 行）
```bash
node scripts/shot.mjs <帧号...>          # -> shots/f00000.png …
```

| 环境变量 | 默认 | 作用 |
|---|---|---|
| `SEED` | `7` | 种子 |
| `W` | `1920` | 宽度 |
| `HTML` | `resources/skeleton.html` | 页面 |
| `OUT` | `shots` | 输出目录（自动建） |
| `CHROME` | 空 | 同 render.mjs |
和 `render.mjs` 的差异（别踩）：

* **没有 `/usr/bin/*` 兜底**：找不到 Chrome 直接 `找不到 Chrome`，只能靠 `CHROME=` 或 puppeteer 缓存目录。
* 不接受 `AR`（不会拼 `&ar=`），要竖版就直接给 `W=1080`。
* 用法为空时报 `用法：node shot.mjs <帧号...>` 并退出 1。
* 帧号可以做任何事：`0 100 250 563`，重复也行，乱序也行（这也是「可 seek」的直接体现）。
```bash
node scripts/shot.mjs 0 60 120
W=960 OUT=/tmp/look node scripts/shot.mjs 419
HTML=/tmp/sk-card.html node scripts/shot.mjs 200 300
```
**这一条命令是迭代的主力**：单帧 0.5 秒左右，比整片快两个数量级。
## 4. `scripts/build.sh`：编码 + 打标 + 校验（61 行）
```bash
bash scripts/build.sh          # 或 npm run build
```

| 环境变量 | 默认 | 作用 |
|---|---|---|
| `FPS` | `30` | 输入帧率（**必须与页面里的 `FPS` 一致**） |
| `CRF` | `22` | x264 质量（越小越好越大；18 = 更清晰更大） |
| `FRAMES` | `frames` | 帧目录 |
| `AUDIO` | `out/track.wav` | 配乐；**文件不存在就出无声片**（不报错） |
| `OUT` | `out/film.mp4` | 输出；先写 `${OUT%.mp4}.tmp.mp4` 再 `mv` |
脚本第一件事是切到仓库根目录：
```bash
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || dirname "$0")"
```
所以 `bash scripts/build.sh` 在任何子目录里都能跑；不是 git 仓库时退回脚本所在目录。

**音画时长一致性检查**（有音频时才做）：拿 `ffprobe` 读音频时长与 `N/FPS` 比，差超过 0.05 s 就警告：
```
⚠️  配乐 24.000000s 与画面 6.000000s 不一致（差 18.000000s）
    改 audio.mjs 顶部的 DUR 和 SEC_* 分节边界，或删掉 out/track.wav 出无声片
```
一致时打印 `配乐 out/track.wav（24.000000s，与画面一致）`。**这就是为什么 `audio.mjs` 直接跑出来的 24 秒音轨配 6 秒骨架会报警**——它不是 bug，是提醒你去改 `DUR` / `SEC_*`。

**ffmpeg 参数（逐字，别自己拼）**：
```bash
ffmpeg -y -loglevel error -stats \
  -framerate "$FPS" -i "$FRAMES/f%05d.png" \
  "${AUD[@]}" \
  -c:v libx264 -preset slow -crf "$CRF" -maxrate 14M -bufsize 28M \
  -pix_fmt yuv420p \
  -vf "scale=in_range=full:out_range=limited,colorspace=all=bt709:iall=bt709:fast=1" \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv \
  -movflags +faststart \
  "$TMP"
```
有音频时 `${AUD[@]}` = `-i "$AUDIO" -c:a aac -b:a 192k -shortest`；没有时是空数组。

**校验段的输出**（真的会打印这些）：
```
帧数 720 @ 30fps = 24.000s
配乐 out/track.wav（24.000000s，与画面一致）
--- 校验 ---
width=1920
height=1080
pix_fmt=yuv420p
color_space=bt709
color_primaries=bt709
nb_read_frames=720
时长 24.000000 s（期望 24.000）
-> out/film.mp4  8.6M
```
`nb_read_frames` 必须等于你期望的帧数，`color_space` / `color_primaries` 必须是 `bt709`。这两个对不上，片子就是废的——重新看本节。
## 5. 为什么必须 `--disable-accelerated-2d-canvas`
Chrome 的加速 2D 画布在经历几次 `getImageData`（我们每帧都在做逐像素后处理）之后会**退回软件光栅**。退回之后，同一个绘制指令的舍入结果会变——于是：

* 刚开的新标签页和你用过的标签页，渲同一帧的**像素不一样**；
* 4 标签页并行时，不同标签页渲出的帧颜色有细微差别，拼起来在暗部能看到跳变。

加上 `--disable-accelerated-2d-canvas` 之后，所有标签页都走同一条软件路径，结果完全一致。这条是「确定性」在工程层的必要条件和**唯一**必要条件里最容易被忽略的一条。
## 6. 为什么用 `toDataURL` 而不是 `page.screenshot`

| | `canvas.toDataURL('image/png')` | `page.screenshot()` |
|---|---|---|
| 来源 | 画布里的真实像素 | 浏览器合成器的输出 |
| 受 CSS / `max-width` / 设备像素比影响 | 否 | 是 |
| 需要额外设置吗 | 否（`renderFrame` 已经把 target 画好了） | 要设视口、deviceScaleFactor、clip |
| 编码 | 浏览器内 PNG 编码 | 另外一轮 PNG 编码 |
| 确定性 | 高 | 低（受视口/滚动/DOM 状态影响） |
配套的两件事：页面里的 `<canvas id="c">` 只是**输出载体**（`window.RISO` 每次渲染后把内容 `post()` 到它上面），真正决定像素的是 `renderFrame` 里的内容画布。所以别去截图——直接要 `dataURL`。

代价是 PNG 编码也算进了单帧耗时（见 9 节的实测数字）。
## 7. BT.709 打标：不做会系统性偏色
ffmpeg 自己跑的时候会用 **BT.601** 的矩阵、而且**不写色彩标记**；播放器按 BT.709 解读 HD 视频，于是饱和色系统性偏移——framewright 的实测结论是**纯绿偏 39 个 level**。

`build.sh` 里做的是两件事：

1. `-vf "scale=in_range=full:out_range=limited,colorspace=all=bt709:iall=bt709:fast=1"`：把全范围（full range）的 PNG 转到有限范围（16–235），并做 BT.709 矩阵转换；
2. `-color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv`：把四个标记写进码流。

验证：
```bash
ffprobe -v error -select_streams v:0 \
  -show_entries stream=pix_fmt,color_space,color_primaries,color_transfer,color_range \
  -of default=nw=1 out/film.mp4
# color_space=bt709  color_primaries=bt709  color_transfer=bt709  color_range=tv
```
**PNG 帧本身是 sRGB/full range**，所以「scale 到 limited」这一步不能省；只打标记不转范围，暗部和亮部会被切。
## 8. URL 旋钮（浏览器调试用）
直接打开 `resources/skeleton.html`（`file://` 就行），或者给无头脚本拼 URL：

| 旋钮 | 例子 | 作用 |
|---|---|---|
| `?f=` | `?f=140` | 只渲染第 140 帧（静态图） |
| `?s=` | `?s=12` | 换种子 |
| `?w=` | `?w=960` | 换输出宽度 |
| `?grid=&cw=` | `?grid=12&cw=440` | 出拉片（格数 + 每格宽） |
| `?from=&to=` | `?from=60&to=180` | 配合 `?grid` 限定采样窗口（也用于实时预览的起点） |
| `?ar=` | `?ar=9:16` | 画幅，`:`、`x`、`/` 三种分隔符都收（正则 `[:x\/]`） |
| 什么都不带 | — | `requestAnimationFrame` 实时预览（宽度上限 `Math.min(WIDTH,1280)`） |
竖版要点：`?ar=9:16` 之后 `LW=1080, LH=1920`（短边仍是 1080），`render.mjs` 的宽度默认值也会变成 1080。
## 9. 性能量级（实测，不是估算）
测试机：WSL2 / 4 核 / Node v22.23.3 / Chrome for Testing 154。**在页面内**用 `performance.now()` 包 `window.RISO.frame(n,w,7)`，所以含 `toDataURL` 的 PNG 编码：

| 场景（1920 宽） | 单帧耗时 |
|---|---|
| 骨架演示 f0 / f30 / f90 / f120 / f179 | 712.6 / 582.5 / 468.5 / 527.0 / 646.1 ms |
| 同一份代码，`S.post.grain` 与 `S.post.vig` 置 0 | 62.1 / 79.7 / 52.6 / 58.7 / 71.3 ms |
| 骨架演示 @960 宽 | 148.3 / 343.3 / 160.6 / 169.2 / 222.6 ms |
| 成品 24 秒片 `film/index.html` f0 / f200 / f400 / f600 / f700 | 421.5 / 586 / 470.1 / 447 / 1316.1 ms |
结论：

* **`post()` 的逐像素颗粒 + 暗角吃掉一帧的 85–90%。** 关掉它，一帧只要 50–80 ms。
* 整片：30 帧 @1920 用 1 个标签页 20 s、4 个标签页 8 s ⇒ **720 帧约 3.2–3.5 分钟**。
* 渲染时间是**线性叠加**的，不是玄学：`总时间 ≈ 帧数 × 单帧耗时 ÷ min(标签页数, 核数) × 1.15`。
* 那个 1316 ms 的 f700 是典型的「嵌套渲染」（一段分镜自己渲了 24 格联系表）——它只出现在那一帧，不影响别的帧，这正是纯函数引擎的好处。

> 仓库 README 里写的「1920×1080 单帧 175–300 ms」是**乐观值**（更快的机器 / 更轻的后处理）。在本机 4 核实测是 0.47–0.71 s/帧。**做时间预算时按你自己的机器实测一遍**，命令：
> ```bash
> HTML=resources/skeleton.html W=1920 OUT=/tmp/perf node scripts/shot.mjs 0 30 90 120 179
> ```
> 输出末尾的秒数 ÷ 帧数就是单帧耗时。

**提速的四个手段**（按性价比排序）：

1. 用 `shot.mjs`（单帧）迭代，别用整片；
2. 迭代期间把 `S.post.grain` / `S.post.vig` 关掉或调小，只在出片时打开；
3. 迭代期间降宽度（`W=960` 大约快 3 倍）；
4. 真的赶时间：`START` / `END` 分段在多台机器上渲，或者提高 `tabs`（见下）。

**多标签页并行**：默认 4（`4` 个标签页约等于 `nproc`）。核数少时提高 `tabs` 收益很小（本机 4 核，30 帧：1 tab 20 s → 4 tabs 8 s，2.5×）。核数多（16+）可以试 `8`。别超过核数太多，否则只是在抢内存，还会让 `toDataURL` 的编码互相拖慢。
## 10. 环境依赖：Chrome、字体、apt 包
### 10.1 Chrome
```bash
google-chrome --version                                  # 系统装的：Google Chrome 154.0.8037.97
npx puppeteer browsers install chrome                    # 或用缓存里那份
ls ~/.cache/puppeteer/chrome/*/chrome-linux64/chrome     # 例如 linux-154.0.8037.57/chrome-linux64/chrome
```
想用手头已有的浏览器：
```bash
CHROME=/usr/bin/google-chrome node scripts/render.mjs frames 7   # 一般不用设，findChrome 会自己找到
```
### 10.2 WSL / Debian / Ubuntu 上的浏览器依赖
无头 Chrome 在最小化的 WSL/Debian 里会因为缺 `.so` 起不来，症状是 `Failed to launch the browser process` 或一段 `error while loading shared libraries`。

**Ubuntu 24.04（本机验证过）**——注意 24.04 起这些包名带 `t64` 后缀：
```bash
sudo apt-get update
sudo apt-get install -y \
  libnss3 libnspr4 libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 \
  libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
  libgbm1 libasound2t64 libatspi2.0-0t64 libpango-1.0-0 libcairo2 \
  libxshmfence1 fonts-noto-cjk fonts-wqy-microhei
```
**Ubuntu 22.04 / Debian 12（旧名，没有 `t64`）**：
```bash
sudo apt-get install -y \
  libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
  libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
  libgbm1 libasound2 libatspi2.0-0 libpango-1.0-0 libcairo2 \
  fonts-noto-cjk fonts-wqy-microhei
```
**验证缺库（不会骗人）**：
```bash
CH=$(ls ~/.cache/puppeteer/chrome/*/chrome-linux64/chrome | head -1)
ldd "$CH" | grep "not found"          # 必须没有任何输出
"$CH" --version                        # Google Chrome for Testing 154.0.8037.57
```
`libatk` / `libasound` 这类包在某些发行版里是「虚拟包」或改名了（24.04 就是 `t64`），`dpkg -l | grep libatk` 查不到不代表缺库——**以 `ldd | grep "not found"` 为准**。
### 10.3 中文字体（不装就白字）
canvas 画中文时如果系统没有中文字体，**不报错，直接画空白**。
```bash
fc-list :lang=zh | wc -l        # 0 = 缺字体；本机装完是 32
fc-match "Noto Sans CJK SC"     # NotoSansCJK-Regular.ttc: "Noto Sans CJK SC" "Regular"
```
装：
```bash
sudo apt-get install -y fonts-noto-cjk fonts-wqy-microhei && fc-cache -f
```
代码里用骨架的 `F_CJK`：
```js
const F_CJK ='"Noto Sans CJK SC","Noto Sans SC","WenQuanYi Micro Hei","DejaVu Sans",sans-serif';
```
## 11. 断点续渲与分段
```bash
# 渲到一半断了：接着渲，已有的帧自动跳过
RESUME=1 node scripts/render.mjs frames 7

# 只想重渲被改过的那一段（第 390–570 帧）
START=390 END=570 node scripts/render.mjs frames 7

# 换种子重出一版，不覆盖旧的
node scripts/render.mjs /tmp/v2 12 1920 4
```
`RESUME` 的判定是「文件存在就跳过」，所以它**不会**发现「帧存在但内容过期」。改过某段代码之后要重渲那一段，正确做法是删掉那几帧（或换目录）：
```bash
rm -f frames/f00{390..570}.png        # 注意前面的 0 位数：文件名是 f%05d
START=390 END=570 node scripts/render.mjs frames 7
```
## 12. 排错对照表

| 症状 | 原因 | 改法 |
|---|---|---|
| `找不到 Chrome：…` | 没装浏览器或路径不对 | `sudo apt install ./google-chrome-stable_*.deb`（或无 sudo 解到 `~/.local/opt/`），或 `CHROME=…` |
| `没有这个文件：…（用 HTML= 指定）` | `HTML=` 指错了 | 默认按 `film/index.html` → 技能包 `resources/skeleton.html` 的顺序找；用 `HTML=` 可以显式指定 |
| 卡在 `waitForFunction('window.__ready===true')` 后超时 | 页面里有 JS 报错，`boot()` 没走到最后一行 | 看 `页面报错：` 那行；先在浏览器里打开同一个 URL |
| 中文全是空白（但英文正常） | 没装中文字体 | `fc-list :lang=zh` → `apt install fonts-noto-cjk` |
| 同一帧在不同标签页颜色不一样 | 没加 `--disable-accelerated-2d-canvas` | 用仓库里的 `render.mjs`（已带） |
| 拉片里有几格是黑的 / 递归爆栈 | 联系表采样全片，而某段又要建联系表 | 加 `IN_SHEET` 闸门（见 01 第 11 节） |
| 部分帧缺失 / `exit code 1` / 视频抖动 | 某些帧渲染失败，或改了构图但旧帧还在 | 看 `第 N 帧失败：`；删掉那一段帧再 `RESUME=1` 渲 |
| 编码后颜色发灰/发绿 | 没打 BT.709 标记、或用了自己的 ffmpeg 命令 | 用 `build.sh`；`ffprobe` 查 `color_space=bt709` |
| `nb_read_frames` 不等于期望值 | 帧命名不连续（`f%05d`）或缺帧 | 检查 `frames/` 有没有断号 |
| 视频末尾有一段没声音/被截短 | 音画时长不一致（`-shortest` 生效） | 看 `build.sh` 的 ⚠️ 提示，改 `audio.mjs` 的 `DUR`/`SEC_*` |
| 吃满内存 / 竖版尺寸不对 | `tabs` 或宽度太大；只给了 `W=1080` 但页面还是 16:9 | `tabs` 降到 4 以内或降 `W`；竖版同时给 `AR=9:16`（`shot.mjs` 不支持 `AR`，用浏览器或 `render.mjs`） |
## 13. 一页速查
含 ffprobe 校验命令的完整速查表在 [`05-qa.md`](05-qa.md) 第 9 节；本文各参数见第 2 / 3 / 4 节。
下一篇：[`04-audio.md`](04-audio.md) —— 纯 Node 合成配乐、节拍对齐、怎么改 BPM 和时长。
