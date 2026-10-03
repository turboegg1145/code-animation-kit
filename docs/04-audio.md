# 04 · 配乐：纯 Node 手写合成，和画面共用同一条节拍网格
`assets/audio.mjs`（744 行）是一个**不依赖任何库**的加法合成器：手写振荡器、包络、滤波器、乐器、编曲、母带，最后手写 WAV 头输出 16bit PCM。它证明的是「配乐也不必用素材」——和画面一样，全是代码。
## 1. 产物规格（实测）
```bash
node assets/audio.mjs        # 或 npm run audio
```
```
—— 合成完成 ——
输出文件   : out/track.wav
格式       : 44100 Hz / 立体声 / 16-bit PCM
时长       : 24.000 s（每声道 1058400 帧，4233644 字节）
峰值       : 0.841395  (-1.50 dBFS)
整体 RMS   : 0.184014  (-14.70 dBFS)
直流偏移   : 4.64e-5
MD5        : ba8faee94012d56b3c49862f52831b34
每秒 RMS (dBFS): …
一句话总结 : A 小调 120BPM 24.0s 立体声配乐 —— ink 段 Am 长音 drone + 打字机 tick + 上升涌流(0-6s)、
             pixel 段 chiptune 律动(6-13s)、type 段四踩推进 + riser(13-19s)、
             outro 段撞击 + 暖 pad + 延迟拨弦(19-24s)，峰值归一化 -1.5 dBFS，tanh 软削波。
```

| 项 | 值 |
|---|---|
| 采样率 / 声道 / 位深 | 44100 Hz / 立体声 / 16bit PCM |
| 时长 | 24.000 s（每声道 1,058,400 帧） |
| 文件大小 | 4,233,644 字节 |
| 峰值 | 0.841395 = **-1.50 dBFS**（`TARGET = Math.pow(10, -1.5/20)`） |
| 整体 RMS | 0.184014 = -14.70 dBFS |
| 直流偏移 | 4.64e-5 |
| 用时 | 5.3 s（本机 4 核） |
| **MD5** | **ba8faee94012d56b3c49862f52831b34 —— 连跑两次完全一致** |
**MD5 一致 = 「配乐也是确定性的」。** 和画面一样：没有 `Math.random`、不读时钟、不依赖遍历顺序。

**输出路径**（容易踩）：
```js
const OUT_PATH = resolve('out/track.wav');   // 相对运行目录，和 build.sh / render.mjs 一致
```
是**相对当前工作目录**，不是相对脚本目录。所以要么在仓库根跑 `node assets/audio.mjs`，要么用 `npm run audio`（npm 会把 cwd 设成包根）。在 `assets/` 里跑会在 `assets/out/` 下多出一份。
## 2. 十分钟地图（六节 + 行号）
文件自己的结构注释：
```
0 常量 → 1 随机数/噪声 → 2 基础工具（振荡器/包络/滤波器/总线）→ 3 乐器 → 4 编曲 → 5 母带 → 6 WAV 编码与输出
```

| 节 | 行号 | 内容 |
|---|---|---|
| 0 常量 | 25–47 | `SR/BPM/BEAT/BAR/FPS/DUR/N`、`OUT_PATH`、`S()`、`sLen()`、`SEC_*` |
| 1 随机数 / 噪声 | 54–70 | `mulberry32`、`rnd`、`NOISE`、`noiseAt` |
| 2 基础工具 | 76–224 | `freq` `wavetable` `osc` `sineBuf` `adsr` `expEnv` `lp1` `hp1` `lp1Sweep` `mix` `mixStereo` |
| 3 乐器 | 237–385 | `kick` `hat` `clap` `tick` `crash` `pluck` `pad` |
| 4 编曲 | 386–624 | `CHORDS` / `PROG` / `chordAt` + 四段安排 |
| 5 母带 | 625–677 | 隔直 → `tanh` 软削波 → 峰值归一 → 淡出 |
| 6 WAV 与统计 | 678–744 | `encodeWav16`、输出、峰值/RMS/直流/MD5/每秒 RMS |
## 3. 时基：只跟画面共用两条规则
```js
const SR = 44100;
const BPM = 120;
const BEAT = 60 / BPM;          // 0.5 s
const BAR = BEAT * 4;           // 2.0 s
const FPS = 30;
const FRAMES_PER_BEAT = BEAT * FPS;  // 15 帧/拍
const DUR = 24;                 // 改这个 + 下面的 SEC_* 分节边界 = 换一部片子的配乐
const N = DUR * SR;             // 每声道总帧数 = 1,058,400
```
* **BPM 必须和页面里的 `BPM` 相同**（骨架里是 `const FPS = 30, BPM = 120;`，于是 `BEAT = 15` 帧、`BAR = 60` 帧）。
* `FPS` 只被 `FRAMES_PER_BEAT` 用到，而 `FRAMES_PER_BEAT` 本身在编曲里没用——它是给你对齐用的说明性常量。

**定位一律用拍，绝不做浮点累加**：
```js
const S = (beat) => Math.round(beat * BEAT * SR);   // 拍 -> 采样下标
const sLen = (sec) => Math.round(sec * SR);         // 秒 -> 采样长度
```
`S(12)` = 264,600 = 6.0 s；`S(26)` = 573,300 = 13.0 s；`S(38)` = 837,900 = 19.0 s；`S(48)` = 1,058,400 = 24.0 s。**每一件乐器的 `start` 都写成 `S(拍号)`**，别写 `lastEnd + len`——那会累积漂移，60 秒后能差出几十毫秒。

**分节边界（必须和画面 plate 边界对齐）**：
```js
const SEC_INK = 0, SEC_PIXEL = S(12), SEC_TYPE = S(26), SEC_OUTRO = S(38), SEC_END = S(48);
const INK_END = SEC_PIXEL;   // 6.0 s  = 264,600
const TYPE_END = SEC_OUTRO;  // 19.0 s = 837,900
```

| 画面 plate | 帧范围 | 时间 | 拍 | 音频段 |
|---|---|---|---|---|
| `ink` | 0–179 | 0.0–6.0 s | 0–12 | drone + 打字机 |
| `pixel` | 180–389 | 6.0–13.0 s | 12–26 | chiptune 律动 |
| `type` | 390–569 | 13.0–19.0 s | 26–38 | 四踩 + riser |
| `phos` | 570–719 | 19.0–24.0 s | 38–48 | 撞击 + pad + 拨弦 |
核对办法（页面侧）：在浏览器里 `?f=0` 打开片子，控制台敲 `RISO.curves()`，会得到
```js
{fps: 30, bpm: 120, total: 720,
 start: {ink: 0, pixel: 180, type: 390, phos: 570},
 cues: [{name:'rule-in', plate:'poster', beat:2, f:30}, …]}
```
`start` 里的帧号 ÷ 30 必须等于 `SEC_*` 里的秒数。**对不上，观众就会听到「音乐换段了但画面还没切」。**

> `SEC_INK` / `SEC_TYPE` / `SEC_END` / `INK_END` / `TYPE_END` 目前只定义没被使用——它们是给你改片子时当锚点用的（比如 `if (i < INK_END)`），别以为是死代码就删。
## 4. 确定性随机：不用 `Math.random`
```js
function mulberry32(seed) { … }                      // 54 行
const rnd = mulberry32(0x1a2b3c4d);                  // 全局唯一随机源（种子写死 → 结果固定）
const NOISE = new Float32Array(N + SR);              // 68 行：预生成整条白噪声
const noiseAt = (k) => NOISE[((k % NOISE.length) + NOISE.length) % NOISE.length];   // 70 行
```
两条要点：

1. **噪声不是「每次调用取下一段」，而是「按起始采样点取切片」**（`noiseAt(k)`）。所以同一个事件（比如第 3 拍的地鼓瞬态）永远拿到同一段噪声，不需要任何顺序状态——这正是「纯函数」在音频里的等价物。
2. 预生成 `N + SR` 长度的噪声（多留 1 秒），是因为最长的事件（`crash` 的 1.7 s 衰减 + 尾巴）会越过 `N`。`noiseAt` 的取模保证了越界也能取到东西。
## 5. 基础工具层

| 函数（行号） | 签名 | 说明 |
|---|---|---|
| `freq(name)` | 78 | 音名 → 频率（十二平均律，A4 = 440） |
| `wavetable(kind, f)` | 89 | 波表合成：`const TAB_SIZE = 8192;`，只叠 12 kHz 以下的谐波（`maxH = Math.max(1, Math.floor(12000 / f))`），saw = `1/h`、square 奇次 `1/h`、tri 奇次 `((h-1)/2%2? -1:1)/(h*h)`，末尾峰值归一；按 `kind + '|' + f.toFixed(4)` 缓存 |
| `osc(kind, f, len, phase0 = 0)` | 118 | 线性插值读波表，返回 `Float32Array` |
| `sineBuf(f, len, phase0 = 0)` | 136 | 纯正弦（低音/子音用它，省得查表） |
| `adsr(len, a, d, s, r)` | 150 | 线性 ADSR；总长不够时按比例压缩三段 |
| `expEnv(len, tau, attack = 0.002)` | 168 | 指数衰减包络（打击类默认用它） |
| `lp1(buf, fc)` / `hp1(buf, fc)` | 178 / 185 | 一阶低通 / 高通（**原地**处理并返回 `buf`） |
| `lp1Sweep(buf, fcFn, state = { y: 0 })` | 195 | 截止频率逐样变化的低通（`fcFn(i, len)`） |
| `mix(start, buf, gain = 1, pan = 0)` | 213 | 写进总线 `L`/`R`；**等功率 pan**：`gl = gain*cos((pan+1)*π/4)`、`gr = gain*sin((pan+1)*π/4)` |
| `mixStereo(start, bufL, bufR, gain = 1)` | 224 | 直接写左右（`pad` 的宽度处理用它） |
总线就是两个大数组（209–210）：
```js
const L = new Float32Array(N);
const R = new Float32Array(N);
```
**滤波器必须写成漏式积分**（源码注释专门警告过）：
```js
// 对：一阶低通 = y = (1-a)*x + a*y
// 错：y += a*x        —— 会变成无界随机游走，几十秒后直流爆表
```
## 6. 乐器层（7 件，全部可单独调用）
签名与默认值（逐字）：
```js
kick(startBeat,   { gain = 1,    pan = 0,    f0 = 140, f1 = 45, drop = 0.055, decay = 0.32, click = 0.22 } = {})
hat(startBeat,    { gain = 1,    pan = 0.22, decay = 0.028, hp = 7500 } = {})
clap(startBeat,   { gain = 1,    pan = 0 } = {})
tick(startBeat,   { gain = 1,    pan = 0,    f = 2600, decay = 0.022, hp = 4200, ping = 0.35 } = {})
crash(startBeat,  { gain = 0.7,  pan = 0,    decay = 1.7 } = {})
pluck(startBeat, note, { gain = 1, pan = -0.15, decay = 0.32, echoes = true } = {})
pad(startBeat, durBeats, notes, opt = {})
```
`pad` 的 `opt` 默认值：
```js
{ gain = 0.2, attack = 1.2, release = 1.2, sustain = 0.8,
  detune = 0.0035, hp = 60, sweep = null, width = 1.0, sub = null }
```
各件是怎么做出来的（改音色时改这些）：

* **`kick`**：正弦 + 音高指数下坠（`f0=140 → f1=45`，时间常数 `drop=0.055`）+ 3.5 ms 噪声瞬态（`click`）+ `Math.tanh((body+tr)*1.5)*0.75` 轻饱和。
* **`hat`**：噪声 + `hp` 高通 + `decay` 0.028 s。
* **`clap`**：三次 ~9 ms 微爆音（`b1/b2/b3`）+ tail，带通 900–5200 Hz，再叠一个 190 Hz 的桶音。
* **`tick`**：短促正弦 `f` + 高通 + 一点点 ping（打字机/木鱼）。
* **`crash`**：两层噪声，亮层 `bp 4200–15000` 快衰、暗层 `bp 900–4500` 慢衰。
* **`pluck`**：三角波 + `lp1Sweep` 从 4 kHz 关到 500 Hz；`echoes` 打开时带一个附点八分（0.75 拍）的回声，两级 `gain*0.34` / `gain*0.13`。
* **`pad`**：失谐双锯齿左右分开（`detune`）、逐声道滤波扫频（`fcR = fcL*0.94`）、中侧处理保持单声道兼容。
## 7. 编曲层：12 小节，每 2 拍换和弦
```js
const CHORDS = { Am:['A2','C3','E3','A3'], F:['F2','A2','C3','F3'],
                 C:['C3','E3','G3','C4'],  G:['G2','B2','D3','G3'] };
const PROG = ['Am', 'F', 'C', 'G'];
const PROG_ORIGIN = 12;   // 进行从第 12 拍（6.0 s，pixel 段起点）开始计
const chordAt = (beat) => PROG[(((Math.floor((beat - PROG_ORIGIN) / 2) % 4) + 4) % 4)];
```
2 小节 = 一个完整乐句 `Am - F - C - G`。四段：

| 段 | 拍 | 内容 |
|---|---|---|
| ink 0–6 s | 0–12 | `pad` Am drone `gain 0.16`；`tick` 在 1.0–5.5 s 之间**不规则**间隔（打字机）；4.5–6.0 s 一段上升涌流，末尾 30 ms 收，`mix` 的 `gain` 用 0.30 的包络 |
| pixel 6–13 s | 12–26 | `kick` 每小节第 1、3 拍（`gain 0.78`）；八分音符 `hat`（0.19 / 0.115 交替，做出重音）；方波贝斯琶音 `mix` 0.42；主音动机 `const MOTIF = ['E5','D5','C5','B4'];` 在第 [12,16,20,24] 拍一小节一个长音，左右交替 `pan ±0.18` |
| type 13–19 s | 26–38 | 四踩 `kick`（`b%4===0 ? 0.95 : 0.82`）；第 2/4 拍 `clap` 0.55；直八 saw 贝斯过 `lp1(2600)`；反拍 `tick`；18–19 s riser（`8 + 26t` Hz 的振幅抖动） |
| outro 19–24 s | 38–48 | `crash(38)` `gain 0.95`；`pad` Am 19.0 s `gain 0.42` / F 21.0 s `gain 0.21`；四个 `pluck`：39.5 A4、41.0 C5、42.5 E5、44.0 D5；22.5 s 最终解决和弦 `['A2','E3','A3','C4','E4']`（五音宽 voicing）`gain 0.42`，包络 `Math.pow(1 - i/len, 1.6) * Math.exp(-t/1.35)` —— **正好在 24.0 s 归零** |
**收尾必须自己写死**：最后一件事是 0.15 s 的升余弦淡出 + `L[N-1]=0; R[N-1]=0;`。没有它，末尾会有一声「啪」。
## 8. 母带链（5.0–5.3）

| 步 | 行号 | 做什么 |
|---|---|---|
| 5.0 | 625 | 隔直：一阶高通 20 Hz（去掉低频直流） |
| 5.1 | 635 | 软削波 `tanh`，`const drive = 1.15 / (peak || 1);`（`DBG=1` 时打印母带前峰值） |
| 5.2 | 651 | 峰值归一化到 -1.5 dBFS：`const TARGET = Math.pow(10, -1.5 / 20);   // ≈ 0.8414` |
| 5.3 | 664 | 最后 0.15 s 升余弦淡出 + 末样点归零 |
**为什么是 -1.5 dBFS**：给 AAC（`build.sh` 里 `-b:a 192k`）留 headroom。归一化到 0 dBFS 的话，编码器的过冲会把峰值推过 0，解码回来就是削波。
## 9. 怎么改 BPM / 时长 / 分节
### 改 BPM
```js
const BPM = 120;      // 27 行
```
改完必须**同步改页面里的 BPM**（`assets/skeleton.html` 的参数节：`const FPS = 30, BPM = 120;`），否则画面的节拍网格和音乐错位。三个常见选择：

| BPM | 一拍 | 一拍帧数 @30fps | 适合 |
|---|---|---|---|
| 90 | 0.667 s | 20 | 缓慢、纪录片、水墨 |
| 120 | 0.5 s | 15 | 通用（本仓库全部示例） |
| 140 | 0.429 s | ≈12.9 | 快节奏、像素/游戏 |
> 140 BPM 的「一拍帧数」不是整数（`Math.round(30*60/140)` = 13），骨架的 `BEAT` 用的就是 `Math.round`——**接受这个舍入**，别为了整除去改 FPS。
### 改时长
```js
const DUR = 24;       // 31 行
const N = DUR * SR;   // 32 行（自动跟着变）
```
`DUR` 改完，**四个分节边界也要改成新分镜的切换拍**（45 行）：
```js
const SEC_INK = 0, SEC_PIXEL = S(12), SEC_TYPE = S(26), SEC_OUTRO = S(38), SEC_END = S(48);
```
边界必须是**整数拍**（因为 `S(beat) = Math.round(beat*BEAT*SR)`，非整数拍不会崩，但和画面 plate 的帧边界对不齐）。
### 改分节
拍 → 秒 → 帧的换算（BPM 120 / 30fps）：
```
拍号 12 → 6.0 s  → 第 180 帧
拍号 26 → 13.0 s → 第 390 帧
拍号 38 → 19.0 s → 第 570 帧
拍号 48 → 24.0 s → 第 720 帧
```
**核对步骤**（每次改完都做）：
```bash
node assets/audio.mjs          # 看「时长 : 24.000 s」
bash assets/build.sh           # 看「配乐 out/track.wav（24.000000s，与画面一致）」
```
`build.sh` 的音画时长检查容差是 0.05 s——差超过就打印 ⚠️ 并告诉你改哪里。
### 给 6 秒骨架片配乐（完整例子）
骨架演示是 `poster`(120 帧) + `dots`(60 帧) = 180 帧 = 6.0 s = **12 拍**。最小改法：
```js
const DUR = 6;                                                        // 31 行
const SEC_INK = 0, SEC_PIXEL = S(4), SEC_TYPE = S(8), SEC_OUTRO = S(12), SEC_END = S(12);
const PROG_ORIGIN = 4;                                                // 394 行：律动从第 4 拍开始
const N = DUR * SR;                                                   // 32 行（= 264,600）
```
然后把四段材料按 12 拍重排（**不改编曲代码的话，音乐会在第 6 秒被硬切掉**，听起来像断电）：

| 拍 | 用哪段的材料 |
|---|---|
| 0–4 | ink 段：Am drone `pad` + 3–5 个不规则 `tick`（对应 `poster` 的扫入与标题） |
| 4–8 | pixel 段：`kick` + 八分 `hat` + 方波贝斯 + `MOTIF` 只走一次（对应英文副标题的逐字揭示） |
| 8–12 | type 段：四踩 + `clap` + riser 到第 11 拍，11.5 拍处落一个 `crash` + Am 解决和弦 |
改完两个命令验收：
```bash
node assets/audio.mjs            # 时长必须是 6.000 s
bash assets/build.sh             # 必须打印「配乐 out/track.wav（6.000000s，与画面一致）」
```
## 10. 听感局限（实测，别吹）
1. **动态范围被压扁**。峰值 -1.50 dBFS、整体 RMS -14.70 dBFS，两者只差 **13.2 dB**（这就是 README 里说的「约 14 dB」）。原因是 5.1 的 `tanh` 软削波 + 5.2 的整体归一化：任何一段想做成「耳语」，最后都会被拉到差不多的响度。

   每秒 RMS（dBFS）实测：
   ```
   0s -33.5  1s -25.1  2s -25.1  3s -25.4  4s -26.3  5s -23.7
   6s -13.8  7s -14.2  8s -13.7  9s -14.5 10s -13.8 11s -14.2
   12s -14.0 13s -12.1 14s -11.5 15s -12.2 16s -11.4 17s -11.9
   18s -11.4 19s -11.5 20s -15.6 21s -20.3 22s -20.7 23s -32.9
   ```
   段间差只有 2–3 dB（6–19 s 全在 -11 到 -14），**对比全靠配器而不是响度**。要更宽的动态：调小 `drive` 的分子（1.15）、或者在归一化前按段做不同的增益。

2. **非采样音色**。全是振荡器 + 噪声 + 滤波，没有一件真乐器/鼓机采样；带限到 12 kHz（`maxH` 那条规则），所以镲片听起来是「嘶」而不是「沙」。质感偏游戏机——**这是选择，不是缺陷**：它和像素/终端/版画那类画面是同一种「不是照片」的语言。

3. **动机只有 4 个音**（`MOTIF = ['E5','D5','C5','B4']`），一小节一个，全片重复 4 次。够用是因为画面在变；但它经不起单独听。

4. **没有混响、没有空间**。`pad` 的宽度靠失谐 + 中侧处理撑；要空间感只能自己加一条延迟线（`pluck` 里的回声就是一个 0.75 拍的延迟）。

5. **和声进行固定 4 个和弦循环**（`Am-F-C-G`）。换成别的进行只要改 `PROG` 和 `CHORDS`——它们是数据不是代码。
## 11. 校验与复现
```bash
# 可复现性（同一台机器）
node assets/audio.mjs | grep MD5      # 连跑两次必须是同一个值
# MD5        : ba8faee94012d56b3c49862f52831b34

# 规格（用 ffprobe 而不是耳朵）
ffprobe -v error -show_entries stream=codec_name,sample_rate,channels,bits_per_sample \
  -show_entries format=duration -of default=nw=1 out/track.wav

# 峰值 / 响度（EBU R128；本片大约 -14 LUFS 附近，短视频平台的标准值）
ffmpeg -v error -i out/track.wav -af "ebur128=peak=true" -f null - 2>&1 | tail -20

# 只看某个段落的频谱（确认 12 kHz 带限）
ffmpeg -v error -ss 14 -t 2 -i out/track.wav -af "showspectrumpic=s=1024x512:legend=1" -y /tmp/spec.png
```
## 12. 一段最小可用的段落模板
给新片子写配乐时，不要从零开始——套这个骨架，每段 12–16 行：
```js
// ============ 第 2 段：4.0 s – 10.0 s（第 8 – 20 拍）============
for (let b = 8; b < 20; b++) {
  const c = chordAt(b);
  // 每拍：贝斯根音（低八度）
  if (b % 2 === 0) {
    const root = CHORDS[c][0];
    const buf = osc('square', freq(root) / 2, sLen(BEAT * 0.9));
    lp1(buf, 2600);
    const env = adsr(buf.length, 0.006, 0.08, 0.55, 0.25);
    for (let i = 0; i < buf.length; i++) buf[i] *= env[i];
    mix(S(b), buf, 0.38, 0);
  }
  // 每小节：底鼓 1、3 拍
  if (b % 4 === 0 || b % 4 === 2) kick(b, { gain: 0.78 });
  // 八分音符 hat，重音交替
  for (let k = 0; k < 2; k++) hat(b + k * 0.5, { gain: k ? 0.115 : 0.19 });
  // 一小节一个长音（动机的音从和弦音里取）
  if (b % 4 === 0) pad(b, 4, CHORDS[c], { gain: 0.16, attack: 0.4, release: 0.6 });
}
```
三条纪律：

1. **定位只用 `S(拍)`**，不要用「上一件事结束的位置」。
2. **音色处理是原地函数**（`lp1` / `hp1` 改的是同一个 `Float32Array`），所以 `osc(...)` 出来的 buffer 可以放心改——它每次都是新的。
3. **写完之后立刻 `node assets/audio.mjs` 看每秒 RMS**：如果某一段的 RMS 比邻居高 6 dB 以上，说明配器堆太满了（听感上会「糊」）。
## 13. 速查
```bash
node assets/audio.mjs                                  # -> out/track.wav（24.000 s，MD5 可复现）
DBG=1 node assets/audio.mjs                            # 额外打印母带前峰值
ffprobe … out/track.wav                                # 规格
bash assets/build.sh                                   # 编码时自动检查音画时长是否一致
```

| 想改什么 | 改哪里 |
|---|---|
| 速度 | 27 行 `BPM`（+ 画面里的 `BPM`） |
| 总长 | 31 行 `DUR` + 45 行 `SEC_*` |
| 段落边界 | 45–47 行 `SEC_PIXEL/SEC_TYPE/SEC_OUTRO/SEC_END` |
| 和声进行 | 387 行 `CHORDS`、393 行 `PROG` |
| 主音动机 | pixel 段的 `const MOTIF = ['E5','D5','C5','B4'];` |
| 音色 | 3 乐器层各函数（237–385 行） |
| 响度/动态 | 635 行 `drive` 的分子、651 行 `TARGET` |
| 输出路径 | 34 行 `OUT_PATH`（当前是相对运行目录的 `out/track.wav`） |
上一篇：[`03-render.md`](03-render.md) · 下一篇：[`05-qa.md`](05-qa.md) —— 出片前的拉片自检清单。
