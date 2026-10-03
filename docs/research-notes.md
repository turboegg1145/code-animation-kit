# 调研原始笔记：这些"代码直出视频"到底是什么

> 这是开工前写的原始调研笔记，保留原样（只改了标题）。
> 三个 MIT 开源 Agent Skill 的原理、骨架、质量方法论都在这里：framewright / every-frame-is-code / xilo-opus-video。
> 本仓库 `assets/` 里的骨架和 `docs/01`–`docs/05` 都是从这份笔记整理出来的。

> 起因：推特上刷屏的"Opus 5.5 / GPT-6 Astra 直出视频"到底是什么。
> 结论先行：**它们没有生成视频。** 模型写了一个会自己动的网页，再用无头浏览器一帧一帧截图，最后拿 ffmpeg 拼成 mp4。
> 本仓库按这个原理自己实现了一条 24 秒的片子，验证这条路走得通。

---

## 一、调研：这些"代码直出视频"的原理

### 1. 一句话揭底

[xilo-opus-video](https://github.com/Kianzzz/xilo-opus-video) 的 README 写得最直白（原文）：

> Opus 5.5 自己不会生成视频。推特上那些刷屏的像素动画、界面动效、游戏史短片，
> 其实是它写了一个会自己动的网页，再一帧一帧截图拍成的视频。

[framewright](https://github.com/smwbev/framewright) 的自我描述（原文）：

> One HTML file. Every frame is a pure function of (frame number, seed, width).
> Rendered with headless Chrome, assembled with ffmpeg, scored by a script.
> No footage, no images, no CDN.

翻译过来就是这套东西的全部秘密：**一个 HTML 文件，每一帧都是 `(帧号, 种子, 宽度)` 的纯函数；用无头 Chrome 渲染，用 ffmpeg 合成。**

### 2. 三个同类开源项目（都是 MIT）

| 项目 | 特点 |
|---|---|
| [smwbev/framewright](https://github.com/smwbev/framewright) | 最完整。骨架 HTML + 渲染脚本 + 编码脚本 + 拉片自检 + 评分脚本，Node ≥ 20 |
| [kiselas/every-frame-is-code](https://github.com/kiselas/every-frame-is-code) | 附一整套"怎么不像模型默认吐的东西"的写作规范（motion-kit 文档集） |
| [Kianzzz/xilo-opus-video](https://github.com/Kianzzz/xilo-opus-video) | 中文，流程最清楚：问需求 → 三个方案加预览 → 确认 → brief.md → 逐镜头做 → 逐镜头静帧自检 → 渲染 |

### 3. 为什么非要"每帧一个纯函数"

如果写成 `draw()` 一帧接一帧地累积状态（常见的 `requestAnimationFrame` 写法），会得到三个坏处；反过来就是纯函数的三个好处：

1. **可以 seek 到任意秒。** 想检查第 17.4 秒长什么样，直接渲染第 522 帧，不用从第 0 帧放一遍。
2. **逐帧渲染不受单帧耗时影响。** 实时播放时某帧算得慢就掉帧、看起来卡；离线逐帧渲染哪怕一帧要 2 秒，成片照样丝滑。
3. **两次渲染结果完全一致。** 没有累积误差，改了某一段不会让别的段"重掷骰子"。

代价是：**任何"记得上一帧"的效果都不能用。** 拖尾、运动模糊、粒子系统统统要改写成 `t` 的函数——见下面"依赖过去的效果"一节。

---

## 二、我的实现

```
film/index.html    影片本体。一个 HTML，一个 <canvas>，一个 draw(t)。约 970 行
render.mjs         逐帧渲染器：无头 Chrome + 多标签页并行 → frames/f00000.png ...
shot.mjs           只渲染指定几帧，用来人眼检查（比整片快得多）
audio.mjs          纯 Node 合成配乐（零依赖）→ out/track.wav
build.sh           编码成 out/film.mp4（BT.709 + AAC + faststart）并校验
shots/             自检用的定妆照和拉片
```

### 跑一遍

```bash
npm i puppeteer-core                 # 只依赖它
npx puppeteer browsers install chrome
node audio.mjs                       # -> out/track.wav
node render.mjs frames 7             # -> frames/f00000.png … f00719.png（720 帧）
./build.sh                           # -> out/film.mp4
```

单帧检查更快：`node shot.mjs 0 180 390 570 719` → `shots/f00000.png …`

浏览器里实时预览：直接开 `film/index.html`。URL 旋钮：`?f=140` 单帧、`?s=12` 换种子、`?w=960` 换宽度、`?grid=24&cw=460` 出拉片。

### 影片本身：《每一帧都是时间的函数》

720 帧 @ 30fps = **24.000 秒**，120 BPM（一拍 15 帧、一小节 60 帧），四段：

| 段落 | 帧 | 时间 | 风格 | 内容 |
|---|---|---|---|---|
| `ink` | 0–180 | 0–6 s | 铜版画 / 水墨纸本 | 一条线把自己画成山、水、船、芦苇、飞鸟，朱砂太阳盖下来，打字机中文标题 + 印章 |
| `pixel` | 180–390 | 6–13 s | 240×135 像素画 | 日落海景，整数倍 8× 放大，桶形畸变 + 色散 + 扫描线 + OSD 时间码 |
| `type` | 390–570 | 13–19 s | 瑞士海报 | 六张卡片每 2 拍硬切：EVERY / FRAME / IS CODE / 只是 / 时间的函数 / 同一个函数，任意一秒 |
| `phos` | 570–720 | 19–24 s | 磷光终端 | 打出本片源码 → 字烧成方块飞散 → 落成一张 24 格联系表 → 尾字幕 → 淡回**开头那一帧** |

四段分别对应四种"被约束出来的风格"：版画、限制色板像素画、瑞士平面设计、单色 CRT。
最后一段是全片的论证：一张 24 格联系表，用它自己证明"每一帧都是时间的函数"。

---

## 三、引擎骨架（照 framewright 的骨架重写）

```
参数 → 生成器 → 数学 → 画布池 → 调色板 → 辅助函数 → 生成数据 → 引擎 → plates → boot
```

这个顺序不是洁癖：**辅助函数必须写在 plates 块之上**，否则砍掉某一段镜头时会连带把夹在中间的辅助函数一起砍掉。

### 三个生成器，各管一段时间尺度

```js
R    = rng(hash(seed,'plate',name))            // 整段稳定：构图、山形、浪的位置
S.b  = rng(hash(seed,'b',name,Math.floor(n/3)))// 每 3 帧重掷：手绘线的"沸腾"抖动
S.nz = rng(hash(seed,'nz',n))                  // 每帧重掷：噪声场
```

三者都掺进了段落名，所以**插入或删掉一段，不会改变别的段的随机数**——改第 3 段不会让第 1 段的构图重掷。

`hash` 是 FNV-1a 32 位，`rng` 是 sfc32，返回 `{f,r,i,pick,sign,chance,g}`。

### 逻辑坐标固定短边 1080

场景永远画在"逻辑画布"上（横版 1920×1080），引擎在最后一步统一缩放到输出像素。输出宽度是可以变的（`?w=960`），但构图代码一行都不用改。

```js
const W=Math.round(width); let H=Math.round(W/AR); if(H%2) H++;   // 偶数高度给 libx264
```

### 画布池是个陷阱

`cvs(name,w,h)` 按名字复用画布——省掉了每帧新建 1920×1080 的开销，但**池里的画布跨帧保留上下文**：`save()` 忘了 `restore()`、留着 clip、留着 shadow、改过 `globalCompositeOperation`，都会泄漏到下一帧，于是帧与帧之间开始互相依赖、渲染顺序变了画面就变了。所以每块画布拿到的第一件事是 `wipe(g)`，里面除了 `clearRect` 还兜底一个 `g.reset()`。

我自己踩的另一个坑：**嵌套渲染必须换一块内容画布**。陈列表的每一格都要调 `renderFrame`，如果内外层共用 `'content'` 这块画布，内层一 resize 就把外层正在画的东西擦干净了。所以给嵌套深度编号：`cvs(DEPTH ? 'content@'+DEPTH : 'content', W, H)`。

### 帧与拍

```js
const FPS=30, BPM=120, BEAT=Math.round(FPS*60/BPM);  // 15 帧一拍
const BAR=BEAT*4;                                     // 60 帧一小节
```

每段长度取 BEAT 的整数倍。段内定位用**局部帧** `S.i`，跨段对齐用全局帧 `S.f`，两个千万别混——
我写联系表落格动画时写了 `stagger(S.i - (T0+SHEET_IN), ...)`，局部帧减全局帧得到 −542，24 格全被跳过，白屏了好几秒。

跨镜头的"同一时刻"不要写死帧号，用 `at('phos', 4)` 这种"某段第 x 拍"来算。

---

## 四、踩过的坑（都是可复现的工程细节）

**1. 必须 `--disable-accelerated-2d-canvas`。**
加速画布在几次 `toDataURL` 回读之后会退回软件光栅，于是"同一帧"在一个新标签页里和在一个用过一阵的标签页里像素不一样——多标签页并行渲染就会随机出现色差帧。

**2. 存图用 `canvas.toDataURL()`，绝不用 `page.screenshot()`。**
截图依赖 CSS 尺寸、设备像素比、滚动位置，拿到的不是画布上真实的像素。

**3. 中文要装字体。**
这台机器原本 `fc-list :lang=zh | wc -l` 是 0，canvas 画中文直接是空白（不报错）。
`sudo apt-get install fonts-noto-cjk fonts-wqy-microhei` 之后才正常。

**4. `cvs()` 返回画布，`wipe(cvs(...).getContext('2d'))` 返回上下文。**
我把后者存进 `pg`，转头 `drawImage(pg, ...)`，报的是
`Failed to execute 'drawImage' ...: The provided value is not of type '(CSSImageValue or HTMLCanvasElement ...)'`
——单帧渲染不报错，跑到拉片才炸。

**5. 无限递归得用"正在渲染中"的闸门。**
联系表要采样全片 24 帧，其中几帧落在 `phos` 段，而 `phos` 段自己又要建联系表。
`if(!SHEET) SHEET=buildSheet()` 这种写法挡不住（`SHEET` 要等函数返回才赋值），得显式加 `IN_SHEET` 布尔闸门。

**6. 编码必须打 BT.709 标。**
ffmpeg 单独跑会用 BT.601 的矩阵、还不写色彩标记；播放器按 BT.709 解读 HD 视频，于是饱和色系统性偏移（framewright 实测纯绿偏 39 个 level）。`build.sh` 里做了 `colorspace=all=bt709` 转换加四个标记。

**7. 最后一帧别被转场吃掉。**
我引擎里每段结尾默认压黑 3 帧做转场，结果最后一段的末帧也被压成全黑——而那一帧正是"淡回开头"的收尾。给最后一段加 `cutOut:false`。

---

## 五、质量方法论：怎么不像"模型默认吐的东西"

这部分来自 [every-frame-is-code](https://github.com/kiselas/every-frame-is-code) 的文档集，是这次调研里最值钱的部分。它的 README 直接点名了模型的"屋里的口味"（原文）：

> a dark navy background, a neon gradient, particles "for atmosphere",
> everything moving linearly and all at once, text on top of objects,
> and crossfades as the only transition

翻译：**深海军蓝底 + 霓虹渐变 + "为了氛围"的粒子 + 所有东西同时线性运动 + 文字压在物体上 + 只会用交叉溶解做转场。** 不给约束，模型每次都吐同一个屏保。

破解办法是**从题材反推风格**，而不是从"好看"反推：

- 科学史 → 铜版画、泛黄纸、棕褐
- 科技与代码 → ASCII、终端、单色磷光、半调网点
- 太空物理 → 不一定要霓虹，木刻版画 / 苏联科普插画 / 蓝图都行

**调色板固定 4–6 色并分配角色**（背景 / 暗部 / 中间调 / 亮部 / 强调），强调色不超过画面 5–10%。
**阴影不是黑**，是补色的暗变体（暖光给冷影）。本片用了三套：

```
Engraving   #efe6d2 #3b3226 #8a7a60 #fbf7ee #9e2b25
Swiss       #f2f0eb #111111 #7d7d7d #ffffff #e3242b
Phosphor    #020402 #0a1a0a #1f7a1f #b6ffb6 #ffffff
```

**约束就是风格。** 256×144 像素 + 16 色，等于把模型最不会做的决定（渐变、辉光、无意义的细节）直接拿走，只留下它做得好的（构图、节奏、形状）。像素段用 240×135，因为 240×8 = 1920、135×8 = 1080，整数倍放大，一个像素正好 8 个屏幕像素。

**缓动**：出现用 `outExpo/outQuart`，离开用 `inExpo/inCubic`，画面内移动 `inOutCubic`，有性格的出现用 `outBack/spring`。
**线性运动只在恒速过程里合法**（自转、传送带、走字）。

**闭式弹簧**（确定性、不需要积分，这是提示词模板里的关键招式）：

```js
function spring(t,zeta=0.45,omega=14){
  if(t<=0) return 0;
  const wd=omega*Math.sqrt(1-zeta*zeta);
  return 1-Math.exp(-zeta*omega*t)*(Math.cos(wd*t)+(zeta*omega/wd)*Math.sin(wd*t));
}
```

**依赖过去的效果不能用"盖一层半透明"**（那是在累积状态、破坏确定性），要改成把物体在 `t-k*dt` 重画若干次、透明度递减：

```js
for(let i=samples-1;i>=0;i--){ ctx.globalAlpha=(1-i/samples)**2; drawObj(ctx, t-i*span/samples); }
```

6–10 个采样就够。本片终端那段"字烧成方块飞散"就是这么做的：每个小方块按闭式抛物线位移，取 3 个子帧做运动模糊。

**静止帧超过 1.5–2 秒就"死"了**：最小生命 = 0.5–1.5% 的呼吸缩放（3–5 秒周期）/ 背景漂移 / 光闪烁。

**推镜要在对数空间插值 zoom**（否则近端冲、远端爬），相机一秒内别移动超过画面的 20%，大行程用 ±18 帧平滑。

**拉片自检清单**（渲染完必看）：文字不压物体、不落在最亮处；不越安全区（每轴中央 92%）；每条字幕停留够读；每帧都清楚该看哪；无超过 2 秒的静止；该缓动的地方没有线性；镜头越接近高潮越短、高潮前留一个停顿；前 2 秒要勾住人；帧间无突然的亮度跳变（除非故意闪）。

本片按这份清单改过的地方：ink 的水从随机短线改成分层水平线场、标题从压在水纹上改成加纸色题签、pixel 的海从彩色噪点改成 5 档抖动色阶、type 第 6 张卡重排成上中下三段、结尾从"淡成白纸"改成"淡回第 0 帧"。

---

## 六、这套路子的边界

- **不是视频生成。** 画面是代码画的，模型只写代码。所以"风格"完全由你给的约束决定，也所以它不会画出你没写的东西。
- **文字是它的强项**（毕竟在写代码画字），**复杂物理/写实材质是它的弱项**（流体、布料、真实光照基本别想；真物理还得按固定 dt 逐帧推，不能 seek）。
- **算力换像素。** 720 帧在 4 个标签页下大约 1 分钟；1920×1080 单帧 0.2–0.3 秒。要更长更高就得等比例换时间。
- **配乐另外合成。** 本仓库的 `audio.mjs` 是纯 Node 手写的加法合成 chiptune（方波主音、合成鼓、带限到 12 kHz），不是采样，质感偏游戏机。要真实乐器得另找音源。

---

## 七、出处

- framewright — https://github.com/smwbev/framewright （MIT）
- every-frame-is-code / motion-kit — https://github.com/kiselas/every-frame-is-code （MIT）
- xilo-opus-video — https://github.com/Kianzzz/xilo-opus-video （MIT）

本仓库的影片、引擎、配乐都是照着上面的原理重写的，没有直接使用它们的代码。
