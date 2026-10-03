---
name: code-animation
description: 用代码逐帧生成动画短片。一个 HTML、一块画布、一个 draw(t)，每帧是 (帧号,种子,宽度) 的纯函数；无头 Chrome 逐帧渲染 + ffmpeg 编码 + 纯 Node 合成配乐。当用户想要"代码动画 / 逐帧动画 / 程序化短片 / 数据可视化影片 / 像素动画视频 / 复刻某某模型直出视频"时使用。
---

# code-animation

把"一个会自己动的网页"变成一部片子。**画面是代码画的，不是模型生成的**——所以一切风格由约束决定，也所以镜头必须被逐帧审查。

## 什么时候用

- 用户要一段 10–90 秒的短片，且接受"风格化 > 写实"（铜版画、像素画、瑞士海报、终端、蓝图、半调网点、数据可视化镜头……）。
- 用户要复刻推特上那种"某模型直出视频"。
- 用户要一段**能 re-render** 的片头/片尾/循环动画（改一个参数就重新出片，不需要剪辑）。

不适用：写实视频、真人素材剪辑、需要精确对白的口播、超过 2 分钟的长片（逐帧渲染的时间会失控）。

## 铁律（违反任何一条，最后一定要返工）

1. **每帧都是纯函数** `frame(n, width, seed)`。禁止累积状态、禁止 `Date.now()`、禁止 `Math.random()`（用 `hash()/rng()`）。想要拖尾/运动模糊 → 把物体在 `t-k·dt` 重画 6–10 次、透明度递减。
2. **辅助函数写在分镜块之上。** 骨架的九节顺序是 参数 → 生成器 → 数学 → 画布池 → 调色板 → 辅助 → 引擎 → 分镜 → boot。删一段镜头时不该连带删掉 helper。
3. **画布池拿到的第一件事是 `wipe(g)`。** 池里的画布跨帧保留上下文：忘了 `restore()`、留着 clip/shadow/合成模式，都会泄漏到下一帧，帧就开始依赖渲染顺序。
4. **逻辑坐标短边固定 1080。** 场景永远不碰输出像素，引擎统缩放。输出高度必须偶数（libx264）。
5. **先出静帧再出片。** `npm run shot -- <帧号>` 比整片快两个数量级；每一段做完都先看静帧。
6. **渲染全片之前必须出 24 格拉片自检。** 见下面 QA 门。
7. **存帧用 `canvas.toDataURL()`，绝不用 `page.screenshot()`**；Chrome 必须带 `--disable-accelerated-2d-canvas`。
8. **编码必须打 BT.709 标**（用仓库里的 `build.sh`，别自己拼 ffmpeg 命令）。

## 流程

### ① 问清楚（不要跳过）
题材是什么？给谁看？成片几秒？横屏还是竖屏？要不要配乐？有没有必须出现的字/信息？
用户说不清时，给**三个风格方向**并各渲染一张关键帧让他挑——不要自己拍板。

### ② 写 brief.md
用 `BRIEF.template.md`。必须锁死：`FPS / BPM / 总帧数 / 画幅 / 调色板（4–6 色 + 角色）/ 四到六段分镜（每段名、长度、一句话内容）/ 每段的关键动作`。
段落长度取 `BEAT` 的整数倍；`BEAT = round(FPS*60/BPM)`。

### ③ 搭骨架
复制 `assets/skeleton.html`（脚本都在 `assets/` 下，用 `npm run …` 调用），改 FPS/BPM、`CUES`，然后**一个 plate 一个 plate 地填**：

```js
plate('名字',{len: 4*BAR, cutIn:false},(S,R)=>{
  // S.f 全局帧，S.i 段内局部帧，S.t 秒，S.b 每 3 帧重掷，S.nz 每帧重掷
  // 只画 S.i 这一帧，不许读上一帧
});
```

先只画静态构图（把 `S.i` 当 0 用），静帧确认构图；再加动画；再加细节。
跨段连续性用 `at('名字', 拍数)`，不要写死帧号。画面和声音共用的时刻写进 `CUES`。

### ④ 每段自检
```
npm run shot -- <该段首帧> <中段> <该段末帧>
```
看：文字有没有压物体？主体清不清楚？有没有越安全区（每轴中央 92%）？

### ⑤ 拉片自检（QA 门，不许跳）
```
npm run sheet
```
逐条核对 `docs/05-qa.md` 的清单，把问题列出来再改。**人类挑得出的毛病，拉片里基本都能挑出来。**

### ⑥ 配乐
```
npm run audio         # -> out/track.wav，与画面同长、同 BPM、分节边界对齐
```
改 BPM/时长/分节只改 `audio.mjs` 顶部的常量。

### ⑦ 渲染 + 编码
```
npm run render       # -> frames/f00000.png …
npm run build        # -> out/film.mp4（并自动校验帧数、时长、色彩标记）
```

## 反模式（会浪费你一小时以上）

| 症状 | 原因 |
|---|---|
| 报 `drawImage: The provided value is not of type '(CSSImageValue or HTMLCanvasElement …)'` | `cvs()` 返回画布，`wipe(cvs(...).getContext('2d'))` 返回上下文，两个不能混用 |
| 拉片里某几格是黑的 / 递归爆栈 | 联系表采样全片，而某段自己又要建联系表 → 加 `IN_SHEET` 闸门；嵌套渲染要换内容画布（`DEPTH`） |
| 一段动画整段不出现 | 局部帧减了全局帧（`S.i - (T0+X)` 得到负数） |
| 同一帧在不同标签页颜色不一样 | 没加 `--disable-accelerated-2d-canvas` |
| canvas 画中文是空白且不报错 | 没装中文字体（`fc-list :lang=zh` 为 0） |
| 末帧全黑 | 转场把最后一段的结尾也压黑了 → 给最后一段 `cutOut:false` |
| 饱和色整体偏色 | ffmpeg 没打 BT.709 标记 |

## 参考文档

`docs/00-principles.md` 原理 ｜ `docs/01-engine.md` 引擎与 API ｜ `docs/02-style.md` 风格与缓动 ｜
`docs/03-render.md` 渲染与编码 ｜ `docs/04-audio.md` 配乐 ｜ `docs/05-qa.md` 拉片清单 ｜
`docs/research-notes.md` 调研原始笔记

原理出处：[framewright](https://github.com/smwbev/framewright)、[every-frame-is-code](https://github.com/kiselas/every-frame-is-code)、[xilo-opus-video](https://github.com/Kianzzz/xilo-opus-video)（均 MIT）。
