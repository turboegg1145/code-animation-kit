# 01 · 引擎解剖：九节顺序、全部 API 签名、怎么加一个分镜
本文对应 `assets/skeleton.html`（**497 行**，可跑）。行号都是那个文件里的真实行号，改完对照着找。
## 0. 地图
| 行号 | 节 | 干什么 |
|---|---|---|
| 1–27 | 文件头 | URL 旋钮说明 + 九节顺序声明 |
| 29–43 | `/* ---------- 参数 ---------- */` | FPS/BPM/画幅/种子/宽度/安全区 |
| 45–61 | `/* ---------- 生成器：任何参数 -> 确定性随机 ---------- */` | `hash()` + `rng()` |
| 63–91 | `/* ---------- 数学 ---------- */` | `clamp` `lerp` `span` `smooth` `ease` `spring` `stagger` `pad` `bayer` |
| 93–103 | `/* ---------- 画布池：离屏画布复用，但不能留上一帧的脏 ---------- */` | `POOL` `cvs()` `wipe()` |
| 105–119 | `/* ---------- 调色板 + 字体 ---------- */` | `F_MONO` `F_SANS` `F_CJK` + 四套色板 |
| 120–293 | `辅助` | 画线/网点/位图字/发光/相机/逐像素后处理 |
| 295–372 | `引擎：分镜（plate）是时间轴上的段落，每一帧由「全局帧号」定位` | `plate` `TOTAL` `locate` `at` `cue` `cut` `DEPTH` `renderFrame` `contactSheet` |
| 373–467 | `分镜 · 示例（把这两段换成你自己的内容）` | `poster`（2 小节）+ `dots`（1 小节）|
| 468–497 | `启动` | `MAIN` `window.RISO` `boot()` |
骨架自带的两段演示分镜一共 180 帧 = 6.0 s（`poster:120` = 4.0 s，`dots:60` = 2.0 s）。
## 1. 九节顺序是硬的，理由只有一条
```
参数 → 生成器 → 数学 → 画布池 → 调色板 → 辅助 → 引擎 → 分镜 → 启动
```
**辅助函数必须在分镜块之上。** 因为实际工作方式是「一段一段地删改分镜」：如果你把某个 helper 夹在两段分镜中间，删掉上面那段镜头时，helper 会跟着被删掉，而报错位置会指向下面那段——排查成本从 10 秒变成 10 分钟。

同理，分镜块里不要写「只被这一段用一次」的小工具函数，除非它真的只服务这一段；一旦第二段也要用，立刻提到辅助节去。
## 2. 【参数】29–43
```js
const Q = new URLSearchParams(location.search);
const FPS = 30, BPM = 120;
const BEAT = Math.round(FPS * 60 / BPM);   // 120BPM -> 一拍 15 帧
const BAR  = BEAT * 4;                     // 一小节 60 帧 = 2 秒
const SHORT = 1080;                        // 逻辑短边：所有几何都在这个尺度里写
function parseAR(s){ const m=/^(\d+(?:\.\d+)?)[:x\/](\d+(?:\.\d+)?)$/.exec(s||''); return m ? (+m[1])/(+m[2]) : 16/9; }
const AR  = parseAR(Q.get('ar') || '16:9');
const LW  = AR >= 1 ? Math.round(SHORT*AR) : SHORT;
const LH  = AR >= 1 ? SHORT : Math.round(SHORT/AR);
const CX  = LW/2, CY = LH/2;
const SEED  = +(Q.get('s') || 7);
const WIDTH = +(Q.get('w') || 1920);
const SAFE  = 0.07;
const TITLE_Y = AR < 1 ? 0.70 : 0.84;
```
* **节拍网格**：`BEAT = Math.round(FPS*60/BPM)`。120 BPM @30fps → 一拍 15 帧、一小节 60 帧 = 2 秒。段落长度一律取 `BEAT` 的整数倍，节奏就自动对齐。
* **`?ar` 三种写法都收**：`16:9`、`16x9`、`16/9`（正则 `[:x\/]`）。横屏时短边是高度（`LH = SHORT`），竖屏时短边是宽度（`LW = SHORT`）。
* **逻辑坐标固定短边 1080**：场景只写逻辑坐标，`renderFrame` 里 `sc = W/LW` 一把缩放到输出像素。所以 `?w=960` 换输出宽度**不需要改一行构图代码**。
* `SAFE = 0.07` 是安全区：文字与主体别越过每边 7%（也就是中央 86% 区域；QA 清单里说的「每轴中央 92%」是更宽松的底线，见 05）。
* `TITLE_Y` 定义了但**全文件没用**（骨架留的钩子）。你要用就用，不用无所谓。
* `WIDTH` 是浏览器里实时预览的默认宽度，`render.mjs` 会用 `W=` 或 argv 覆盖它。
## 3. 【生成器】45–61：一个 hash、一个 PRNG、三个时间尺度
```js
function hash(){ /* FNV-1a，任意参数 -> 32 位种子 */ }
function rng(seed){ /* sfc32 */ }
```
**`hash(...args)` 的语义**：任意多个参数 → 一个 32 位无符号整数。实现是 FNV-1a，每个参数先用 `String(arg)` 加 `'|'` 转成字符串，逐字符 `h ^= c; h = Math.imul(h, 16777619)`，末尾再走一段雪崩（`h ^= h>>>13; h = Math.imul(h, 0x5bd1e995); h ^= h>>>15`）。要点：

* 参数顺序不同 → 不同结果（`hash(1,2) !== hash(2,1)`）。
* 字符串参与混入，所以 `'plate'` 这样的字面量标签是有效的隔离手段。
* 返回值一定是 `>>> 0` 的非负 32 位整数。

**`rng(seed)` 的语义**：用 sfc32 把种子摊开成一条随机流，**返回六个成员**（注意：没有 `g`）：
```js
{ f,                                       // () => [0,1)
  r: (lo,hi) => lo + (hi-lo)*f(),          // 区间浮点
  i: (n) => Math.floor(f()*n),             // [0,n) 整数
  pick: (arr) => arr[Math.floor(f()*arr.length)],
  chance: (p) => f() < p,
  sign: () => f() < 0.5 ? -1 : 1 }
```
**三个生成器，各管一个时间尺度**（都在 `renderFrame` 里构造，见 7 节）：
| 生成器 | 构造式 | 重掷频率 | 用来画什么 |
|---|---|---|---|
| `R` | `rng(hash(seed,'plate',P.name))` | **整段一次**（每次渲染这一段都一样） | 构图、地形、浪的位置、整段固定的倾斜 |
| `S.b` | `rng(hash(seed,'b',P.name,Math.floor(n/3)))` | **每 3 帧** | 手绘线的「沸腾」抖动 |
| `S.nz` | `rng(hash(seed,'nz',n))` | **每帧** | 噪声场、颗粒、抖动参数 |
**三者的调用式里都掺了 `P.name`（段落名）**，这是刻意的：插入或删掉一段不会平移其它段的随机数。你改第 3 段，第 5 段的画面一模一样——这在「一段一段做」的工作方式里是刚需。
## 4. 【数学】63–91
```js
const clamp=(v,a=0,b=1)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const span=(f,a,b)=>clamp((f-a)/(b-a));
const smooth=t=>{t=clamp(t);return t*t*(3-2*t)};
const ease=Object.freeze({ /* out, out4, outExpo, in, io, back */ });
function spring(t,zeta=0.42,omega=15){ ... }
function stagger(t,start,dur,i,n,spread=0.35,curve=ease.out4){ ... }
const pad=(n,w=2)=>String(n).padStart(w,'0');
const bayer=(x,y)=>{ /* 4x4 有序抖动矩阵，0..1 */ };
```
| 函数 | 用在什么时候 |
|---|---|
| `span(f,a,b)` | 把帧号映射成 0..1 的进度，**自动 clamp**：`span(S.i, -6, BEAT*0.9)` 表示「动画从第 −6 帧就开始，到 0.9 拍结束」 |
| `ease.out` | 通用出场（1−(1−t)³） |
| `ease.out4` | 更利落的出场（四次方），默认的 stagger 曲线 |
| `ease.outExpo` | 扫入、揭示：起步极快、尾部极慢 |
| `ease.in` | 离场、蓄力 |
| `ease.io` | 画面内移动（平滑起停） |
| `ease.back` | 有性格的弹入（过冲） |
| `spring(t, zeta, omega)` | 弹簧入场：`zeta` 越小越弹（<1 才有振荡），`omega` 越大越快 |
| `stagger(t,start,dur,i,n,spread=0.35,curve=ease.out4)` | 一组物体依次入场：`i` 是第几个、`n` 是总数、`spread` 是错位总量（**单位是帧**，不是拍：`s = start + i/(n-1)*spread`，所以只想错开半个动作就写几帧） |
| `bayer(x,y)` | 4×4 有序抖动，做像素画/半调的灰阶 |
| `pad(n,w=2)` | 时间码、帧号格式化 |
写法上记住一个习惯：**动画 = `ease.xxx(span(S.i, 起点, 终点))`**，一行一个动作，读起来就是分镜脚本。骨架里：
```js
const ruleIn = ease.outExpo(span(S.i, -6, BEAT*0.9));    // 朱砂横线扫入
const tin    = spring(span(S.i, BEAT*0.5, BEAT*2.0), 0.55, 9);  // 标题弹入
```
## 5. 【画布池】93–103：两个函数、四个陷阱
```js
const POOL={};
function cvs(name,w,h){ ... }     // 返回【画布】（HTMLCanvasElement）
function wipe(g){ if(g.reset) g.reset(); else g.canvas.width=g.canvas.width; return g; }  // 返回【上下文】
```
首次访问某个 `name` 时创建 canvas（`getContext('2d',{willReadFrequently:true})`），之后复用；尺寸不同才 resize。

**四个陷阱**（都是真踩过的）：

1. **返回值类型不同**。`cvs()` 给画布，`wipe()` 给上下文。混用会报：
   `Failed to execute 'drawImage' on 'CanvasRenderingContext2D': The provided value is not of type '(CSSImageValue or HTMLCanvasElement or ...)'`。
   记法：`wipe(cvs(...).getContext('2d'))` 是「清一块画布并拿它的上下文」。
2. **拿画布拿到的是带脏东西的画布**。池里的画布跨帧保留上下文：忘了 `restore()`、留着 `clip` / `shadow` / `globalCompositeOperation`，都会泄漏到下一帧——帧就开始依赖渲染顺序，确定性没了。所以每一段的第一件事几乎总是 `g.fillRect` 铺底或 `g.clearRect`。
3. **这个错误单帧不报**。`drawImage` 传错类型只在真正走到那一行才炸；单帧渲染时你可能恰好没进那个分支，跑到 24 格拉片才看见几格是黑/空白。**改完 helper 先出一次拉片。**
4. **画布尺寸是全局性能开关**。1920×1080 的一块画布每帧的 `getImageData/putImageData` 都是 200 万像素级；能复用就别新建，能小就别大。
## 6. 【调色板 + 字体】105–119
```js
const F_MONO='"DejaVu Sans Mono","Noto Sans Mono",Menlo,Consolas,monospace';
const F_SANS='"Helvetica Neue",Helvetica,"Liberation Sans","DejaVu Sans",Arial,sans-serif';
const F_CJK ='"Noto Sans CJK SC","Noto Sans SC","WenQuanYi Micro Hei","DejaVu Sans",sans-serif';
```
四套现成色板（照抄或改）：
```js
const INK=Object.freeze({bg:'#e9dfc9', paper:'#f3ecdb', ink:'#2b2620', mid:'#8a7a60', light:'#fbf7ee', accent:'#a33028'});  // 6 色：铜版画/纸本，朱砂约 5%
const P16=['#1a1c2c','#5d275d','#b13e53','#ef7d57','#ffcd75','#a7f070','#38b764','#257179',
           '#29366f','#3b5dc9','#41a6f6','#73eff7','#f4f4f4','#94b0c2','#566c86','#333c57'];  // sweetie16：16 色像素画
const POS=Object.freeze({bg:'#f2f0eb', ink:'#111111', mid:'#7d7d7d', red:'#e3242b', white:'#ffffff'});  // 瑞士海报 5 色
const PHO=Object.freeze({bg:'#030603', mid:'#175c17', lit:'#5fdc5f', hi:'#c8ffc8', white:'#ffffff'});  // 磷光终端 5 色
```
用哪套不是审美问题，是**角色分配**问题：背景 / 暗部 / 中间调 / 亮部 / 强调，五到六个槽位。强调色只占画面 5–10%（详见 02）。
## 7. 【辅助】124–293：工具箱
| 签名 | 作用 / 性能要点 |
|---|---|
| `boil(pts,b,amp)` | 沿法线抖动折线。`b` 传 `S.b`（每 3 帧重掷）= 手绘沸腾；传 `S.nz` = 噪点 |
| `inkLine(g,pts,o={})` | 按**累计长度**揭示折线（恒定笔速，不是按点均分）。`o.reveal` 默认 1，`o.color` 默认 `INK.ink`，`o.w` 默认 2.4，`o.cap` 默认 `'round'`，`o.alpha` |
| `ridgePts(x0,x1,yBase,amp,R,n=90)` | 4 个正弦叠加成一维分形 → 山脊/波浪。用 `R`（整段固定），所以地形不会抖 |
| `hatch(g,x0,y0,x1,y1,spacing,angle,o={})` | 斜排线（版画的阴影全靠它）。`o.color` 默认 `INK.mid`，`o.w` 默认 1.1，`o.alpha` |
| `halftone(g,x,y,w,h,cell,color,alpha=1)` | 半调网点，**缓存成 pattern**（key = `'ht'+cell`，按 `c.__color` 判重）。不要每帧画几千个圆 |
| `scanlines(g,x,y,w,h,period,alpha,color='#000')` | 扫描线 pattern（key = `'sl'+period`，画每周期 42% 高） |
| `glyphs(str,o)` | 系统字体 → 阈值 → 位图字形。`o.px` 默认 14、`o.weight` 默认 `'bold'`、`o.font` 默认 `F_MONO`、`o.thr` 默认 0.5。缓存 `GLYPH`，返回 `{c,x0,y0,w,h}` |
| `pixText(g,str,o)` | 位图字。`o.cell` 默认 6、`o.fit`（字号自适应到不超行宽）、`o.x/o.y`、`o.align`（`'center'`/`'right'`）、`o.base`（`'middle'`/`'bottom'`）、`o.bg` + `o.pad` 默认 1、`o.reveal`、`o.color`、`o.alpha`。**吸附到字形网格**（`Math.round(x/cell)*cell`），否则字母逐帧抖 |
| `vText(g,str,o)` | 矢量字。`o.size` 默认 120、`o.font` 默认 `F_SANS`、`o.weight` 默认 `'bold'`、`o.color`、`o.align`、`o.base` 默认 `'alphabetic'`、`o.ls`、`o.alpha`、`o.stroke`+`o.lw` 默认 3、`o.outlineOnly` |
| `textW(g,str,size,weight='bold',font=F_SANS)` | 量文本宽度（排版对齐用） |
| `post(src,dst,S,o={})` | 逐像素收尾：`o.grain`、`o.vig`、`o.lift`。三者都为假时退化成一句 `drawImage`。**最贵的一步**：1920×1080 实测吃掉一帧的 85–90% |
| `camPush(g,t,from,to,tx=0,ty=0)` | 相机推拉。`z = Math.exp(lerp(Math.log(from), Math.log(to), t))` —— **对数插值**，否则近端冲、远端爬 |
| `glowText(g,str,o)` | 发光字：8 个方向铺 halo（`alpha*0.16`）+ 中心 0.35 + core 1.0。`o.core` 默认 `'#fff'`、`o.halo` 默认 `'#3f3'`、`o.size`（**没有默认值，必须给**）、`o.font` 默认 `F_MONO` |
骨架里**定义了但演示分镜没用**的：`TITLE_Y`、`bayer`、`smooth`、`textW`、`F_CJK`、`POS`、`PHO`、`P16`、`scanlines`、`halftone`、`hatch`、`ridgePts`、`boil`、`inkLine`、`rng.pick`、`rng.chance`、`rng.sign`。它们是留给你的工具箱，不是死代码。
## 8. 【引擎】298–372：准确签名
```js
const PLATES=[];
function plate(name,opts,fn){
  if(PLATES.some(p=>p.name===name)) console.warn(`重名分镜：${name}`);
  PLATES.push(Object.assign({name,fn},opts));
}
function TOTAL(){ return PLATES.reduce((a,p)=>a+p.len,0); }
function locate(n)                 // -> {idx, local}；越界回落到末段的最后一帧
function at(name,x=0)              // -> 全局帧号 = 该段起点 + x 拍；找不到 throw `at()：没有叫 ${name} 的分镜`
const CUES=[['poster',2,'rule-in'],['dots',0,'dissolve']];   // 画面和声音共用的提示点表
function cue(name)                 // -> at(命中的 [plate, beat])；找不到 throw `cue()：没有叫 ${name} 的提示点`
function cut(g,S,amt)              // 用 rgba(0,0,0,amt) 铺满整块画布（转场用）
let DEPTH=0;                       // 嵌套渲染深度：联系表渲染一格时是 1，正常渲染是 0
function renderFrame(n,width,seed,target)
function contactSheet(n,cellW,seed,target,f0=0,f1=TOTAL()-1)
```
**`plate(name, opts, fn)` 的 `opts` 只有三个键**：
| 键 | 默认 | 作用 |
|---|---|---|
| `len` | 必填 | 段落长度（帧）。取 `BEAT` 的整数倍 |
| `cutIn` | `true` | 段首 4 帧压黑渐入；`false` 关掉 |
| `cutOut` | `true` | 段尾 3 帧压黑渐出；`false` 关掉 |
**`renderFrame` 的 7 步**（照着读源码最省事）：

1. `n = ((n % TOTAL()) + TOTAL()) % TOTAL();` —— 帧号回绕，负数也正确。
2. `const W=Math.round(width); let H=Math.round(W/AR); if(H%2) H++;` —— 高度强制偶数（libx264 要求偶数尺寸）。
3. `const cv=cvs(DEPTH?'content@'+DEPTH:'content',W,H), g=wipe(cv.getContext('2d')), sc=W/LW;` —— 拿内容画布并清空。**嵌套时换名字**，否则联系表会把外层画面擦掉。
4. `locate(n)` 找到段落，构造 `S`：
```js
const S={ f:n, i:local, t:local/P.len, len:P.len, g, cv, sc, seed,
          W:LW, H:LH, name:P.name, post:{}, grain:1,
          b:rng(hash(seed,'b',P.name,Math.floor(n/3))),
          nz:rng(hash(seed,'nz',n)) };
```
| 字段 | 含义 |
|---|---|
| `S.f` / `S.i` / `S.t` / `S.len` | 全局帧 / 段内帧 / 段内进度 / 段长 |
| `S.g` | 2D 上下文（已经缩放到逻辑坐标） |
| `S.cv` | 内容画布（`getImageData` 之类直接用它） |
| `S.sc` | 缩放比 `W/LW`（很少需要） |
| `S.W` / `S.H` | **逻辑坐标**的宽高（1080 短边那一套） |
| `S.seed` | 种子（`post()` 的颗粒也用它） |
| `S.name` | 段落名 |
| `S.post` | 输出给 `post()`、也输出给 `contactSheet` 标签的收尾参数 |
| `S.grain` | 全局颗粒倍率（默认 1，可让整段更脏或更干净） |
| `S.b` / `S.nz` | 每 3 帧 / 每帧重掷的随机流 |
5. `const R=rng(hash(seed,'plate',P.name));` —— 整段固定随机流，**传进 `fn` 的第二个参数**。
6. 铺黑 → `g.setTransform(sc,0,0,sc,0,0)` → `imageSmoothingEnabled=true` → `DEPTH++` → `try{ P.fn(S,R); } finally { DEPTH--; }`。
7. 转场 → `setTransform` 复位 → `target` resize → `post(cv,target,S,S.post)` → 返回 `S`。

**转场的判定**（原文逻辑，别改错方向）：
```js
const edgeIn = local, edgeOut = P.len-1-local;
if(P.cutIn!==false && edgeIn<4)        cut(g,S,1-edgeIn/4);   // 段首 4 帧
else if(P.cutOut!==false && edgeOut<3) cut(g,S,1-edgeOut/3);  // 段尾 3 帧
```
最后一段想要「淡回开头/停在最后一帧」，必须 `cutOut:false`，否则末帧被压成全黑。
## 9. `contactSheet` 357 与 `window.RISO` 471
```js
function contactSheet(n,cellW,seed,target,f0=0,f1=TOTAL()-1)
```
* `cols = AR>=1 ? 6 : 8`，`rows = Math.ceil(n/cols)`，`cellH = Math.round(cellW/AR)`，标签高 `lab=26`，间隙 `gap=8`。
* 画布尺寸：`SW = cols*(cellW+gap)+gap`，`SH = rows*(cellH+lab+gap)+gap`，底 `#181818`。
* 第 i 格采样的帧号：`f = n>1 ? Math.round(f0+i*(f1-f0)/(n-1)) : f0`。
* 每格用 `renderFrame(f, cellW*2, seed, tmp)` 渲到**两倍尺寸**再缩下来——这样逐像素后处理不会作伪。
* 标签：`f=${f}  ${S.name}  t=${S.t.toFixed(2)}  ${(f/FPS).toFixed(1)}s`，字体 `'12px '+F_MONO`，颜色 `'#ddd'`。
```js
window.RISO = {
  fps, bpm,
  get total(){ return TOTAL(); },
  get plates(){ return PLATES.map(p=>({name:p.name,len:p.len})); },
  frame(n,width,seed){ renderFrame(n,width??WIDTH,seed??SEED,MAIN); return MAIN.toDataURL('image/png'); },
  contact(n,cellW,f0,f1){ contactSheet(n||24,cellW||480,SEED,MAIN,f0??0,f1??TOTAL()-1); return MAIN.toDataURL('image/png'); },
  curves(){ /* -> {fps,bpm,total,start:{段名:起始帧},cues:[{name,plate,beat,f}]} */ },
};
```
`boot()`（484）按 URL 分三种模式：`?grid` → 出拉片；`?f` → 单帧；什么都没有 → `requestAnimationFrame` 实时预览（宽度上限 `Math.min(WIDTH,1280)`）。结尾 `window.__ready=true`，`render.mjs` / `shot.mjs` 就是等这个标志。
## 10. 手把手：加一个新分镜
**这条路径已经实测跑通**（下面代码原样贴进骨架 468 行之前，`node assets/shot.mjs 200 300 419` 正常出帧）。
### 第 1 步：决定它在时间轴上的位置和长度
* 长度取 `BEAT` 的整数倍。`4*BAR`（8 秒）够讲一件事，`BAR`（2 秒）是一张卡。
* 位置就是 `plate()` 被调用的顺序——插在 `dots` 之后，它就从第 180 帧开始。
### 第 2 步：只画静态构图
先把 `S.i` 当 0 用，画完出静帧：
```bash
node assets/shot.mjs 180 300        # 段首 + 中段
```
### 第 3 步：加动画、加错位、加收尾
```js
/* =====================================================================
   分镜 · 数据卡（自己加的第三段：接在 dots 之后）
   ===================================================================== */
plate('card',{len:4*BAR},(S,R)=>{
  const g=S.g;

  g.fillStyle=DEMO.bg; g.fillRect(-200,-200,LW+400,LH+400);

  /* 整段固定不变的东西用 R：重新渲染这一段永远拿到同一串随机数 */
  const tilt=R.r(-0.015,0.015);
  const cols=7, rows=4, total=cols*rows;

  camPush(g,S.t,1.05,1.0);                          /* 整段极缓地拉远，对数插值 */

  const tin=ease.outExpo(span(S.i,-4,BEAT*1.4));    /* -4：第 0 帧就已经有东西可看 */
  const solved=span(S.i,BEAT*2.4,BEAT*3.6);         /* 全亮之后再收一次版 */

  g.save(); g.translate(CX,CY); g.rotate(tilt); g.translate(-CX,-CY);

  for(let k=0;k<total;k++){
    const cx=LW*0.16+(k%cols)*(LW*0.68/(cols-1));
    const cy=LH*0.26+Math.floor(k/cols)*(LH*0.30/(rows-1));
    const d=(k%cols)/(cols-1)+Math.floor(k/cols)/(rows-1);      /* 0 左上 -> 2 右下 */
    const p=stagger(S.i,0,BEAT*1.6,d*10,20,0.9,ease.out);       /* 错位：顺序携带意义 */
    g.globalAlpha=tin*(0.15+0.85*p);
    g.fillStyle=(p>0.99&&solved>0)?DEMO.accent:DEMO.mid;
    g.beginPath(); g.arc(cx,cy,LH*0.013*(0.35+0.65*p),0,6.2832); g.fill();
    g.globalAlpha=tin*0.5*p;
    g.fillStyle=DEMO.ink;
    g.fillRect(cx-LH*0.03,cy+LH*0.020,LH*0.06*(0.35+0.65*S.nz.f()),LH*0.004);  /* S.nz 每帧重掷 */
  }
  g.globalAlpha=1; g.restore();

  if(solved>0.001){
    vText(g,'THE DATA IS THE DRAWING',{x:CX,y:LH*(1-SAFE*1.2),size:Math.min(LH*0.075,LW*0.062),
      color:DEMO.ink,align:'center',alpha:solved});
  }

  S.post.grain=4; S.post.vig=0.16;
});
```
这段代码里每一件事都有来源：
| 写法 | 理由 |
|---|---|
| `g.fillStyle=DEMO.bg; g.fillRect(-200,-200,LW+400,LH+400)` | 铺底要超出画布，因为 `camPush` 会缩放，边缘会露出来 |
| `R.r(-0.015,0.015)` | 整段固定的一点点倾斜 = 手工感；换成 `S.nz` 就变成抽风 |
| `span(S.i,-4,...)` | 起手放在第 0 帧之前，**第 0 帧必须有东西可看** |
| `stagger(..., d*10, 20, 0.9, ease.out)` | 错位顺序 = 从左上到右下，顺序本身携带意义 |
| `p>0.99 ? DEMO.accent : DEMO.mid` | 强调色只在「亮完」之后出现，占比很小 |
| `S.nz.f()` 那条短线 | 每帧重掷 → 只抖不闪；颗粒感来自「每帧不同」 |
| `S.post.grain=4; S.post.vig=0.16;` | 收尾统一在 `post()` 做，别在分镜里逐像素画噪点 |
### 第 4 步：登记提示点（可选但推荐）
画面和声音共用的时刻写进 `CUES`：
```js
const CUES=[['poster',2,'rule-in'],['dots',0,'dissolve'],['card',0,'card-in']];
```
之后画面里可以用 `cue('card-in')`，配乐里用同一个名字对齐（见 04）。
### 第 5 步：验收
```bash
node assets/shot.mjs 180 200 300 419                 # 段首/入场/中段/末帧
SHEET=shots/sheet.png SHEET_N=24 SHEET_W=460 node assets/render.mjs frames 7   # 24 格拉片
START=180 END=420 node assets/render.mjs frames 7 1920 4                       # 只渲这一段
```
看四件事：**第 0 帧有没有东西**、**末帧有没有被转场压黑**、**有没有哪一帧说不清该看哪**、**有没有超过 2 秒的静止**。
## 11. 嵌套渲染：`DEPTH` 与 `IN_SHEET` 两个闸门
**`DEPTH`（骨架里已有，328）** 解决「画布互相擦除」：联系表渲染每一格时会递归调用 `renderFrame`，如果内层和外层共用 `'content'` 这块画布，内层会把外层正在画的东西清掉。所以：
```js
const cv = cvs(DEPTH ? 'content@'+DEPTH : 'content', W, H);
```
**`IN_SHEET`（骨架里没有，得自己加）** 解决「无限递归」：如果你的某一段分镜自己要画一张联系表（比如结尾把全片 24 帧摆成网格），而联系表又要渲染每一帧 → 无限递归 → 爆栈。

关键在于**这一个写法挡不住**：
```js
if(!SHEET) SHEET = buildSheet();   // ✗ 没用：SHEET 要等 buildSheet() 返回才被赋值，
                                   //   递归调用发生时它还是 null
```
必须用「进入前就置位」的布尔闸门。成品片 `film/index.html` 里的做法（行号是那个文件的）：
```js
let SHEET=null, IN_SHEET=false;                       // 803
function buildSheet(n,seed){
  if(IN_SHEET) return null;                           // 807
  IN_SHEET=true;                                      // 808
  try { /* … 在这里调 renderFrame … */ }
  finally { IN_SHEET=false; }                         // 819
}
// 分镜里：
if(!SHEET && !IN_SHEET) SHEET=buildSheet(384,SEED);   // 905
// 文字/元素的透明度也要跟着让路，否则小格里塞满大字：
const txtA = IN_SHEET ? 1 : ease.out4(span(S.i, ...)); // 857 附近的用法
```
两个闸门的分工：
| 闸门 | 防什么 | 症状 |
|---|---|---|
| `DEPTH`（引擎提供） | 内层渲染擦掉外层画布 | 联系表整张变黑/只画出一格 |
| `IN_SHEET`（自己加） | 分镜里的联系表递归调用自己 | `RangeError: Maximum call stack size exceeded`，或渲染到某帧卡死 |
## 12. 常见改动速查
| 想改 | 改哪里 | 连带影响 |
|---|---|---|
| 帧率 | `const FPS = 30` | `BEAT` 跟着变；音频侧的 `FPS` 常量也要同步 |
| 速度 | `const BPM = 120` | `BEAT`、`BAR` 变；段落长度若写的是拍数则自动跟随 |
| 画幅 | 加 `?ar=9:16`（或 `?ar=9x16` / `?ar=9/16`） | `LW/LH/CX/CY` 全变；`contactSheet` 的列数变 8 |
| 种子 | `?s=12` 或 `SEED=12` | 所有随机流变；构图会换一套 |
| 输出宽度 | `?w=960` / `W=960` / `render.mjs` 的第 3 个参数 | 逻辑坐标不变，只是缩放 |
| 段落顺序 | 调整 `plate()` 的调用顺序 | 起始帧跟着变；用 `at()` 的地方不用改 |
| 末帧别被压黑 | 最后一段 `cutOut:false` | 转场少一次渐出 |
改完的最小验证：`node assets/shot.mjs <该段首帧> <该段末帧>` + 一次 24 格拉片。

下一篇：[`02-style.md`](02-style.md) —— 调色板、缓动、十二法、相机。
