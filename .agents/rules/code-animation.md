---
trigger: glob
globs: "**/film/*.html, **/*film*.html, .agents/skills/code-animation/**/*.html"
description: "编辑这套代码动画工具链里的片子（逐帧渲染的 HTML）时必须遵守的确定性约束。"
---

# 改片子时的确定性约束

你正在编辑一部**逐帧渲染**的代码动画。这个文件里的每一行都必须是 `f(帧号)` 能算出来的东西——
下面的每一条被违反，都会在成片里变成一个看得见的故障。

- **不要引入任何跨帧状态。** 不用 `Date.now()`、`performance.now()`、`Math.random()`、全局累加器、
  也不用"上一帧算了什么"。随机一律走 `hash()` / `rng()`，它们是种子的纯函数。
- **画布池的出口必须干净。** 拿到画布先 `wipe(g)`；`save()` 过的必须 `restore()`；
  用完 `clip()`、`shadowBlur`、`globalCompositeOperation`、`globalAlpha` 都要还原——
  池里的画布跨帧复用，泄漏的状态会让画面开始依赖渲染顺序。
- **不要碰输出像素。** 场景只画逻辑坐标（短边 1080），缩放交给引擎。写死 `1920` / `1080` 的构图代码是 bug。
- **时间要对齐节拍，不要写死帧号。** 段内用 `S.i`，跨段或与音乐对齐用全局帧 `S.f` 和 `at('段名', 拍数)`。
  写死帧号会在改段长时全部错位。
- **改完必须看一眼。** 改任何画面代码之后，至少跑一次 `npm run shot -- <受影响的帧>`；
  改完一整段之后跑 `npm run sheet` 出拉片，照着 `.agents/skills/code-animation/references/05-qa.md` 逐条核对。
  没出过拉片就不要渲染全片。
- **不要为了让画面好看去改工具。** 帧率、编码参数、渲染器、`--disable-accelerated-2d-canvas` 都不是画面参数。
