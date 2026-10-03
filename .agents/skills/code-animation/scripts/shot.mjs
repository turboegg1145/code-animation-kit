/* 静帧取样：node shot.mjs 0 100 250 563 ...  -> shots/f00000.png
   给人眼看的自检工具，比整片渲染快得多。参数见 --help。 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`NAME
shot.mjs — 静帧取样：只渲染指定的几帧，迭代时用这个

USAGE
  node scripts/shot.mjs <帧号...>

ENV
  HTML=<页面>     默认：项目里的 film/index.html，没有就用技能包自带的 resources/skeleton.html
  AR=16:9         画幅
  SEED=7          种子
  W=1920          输出宽度（shot.mjs 用 W）
  START=0 END=720 只渲一段
  RESUME=1        跳过已存在的帧
  SHEET=out/sheet.png   只出一张拉片，不渲染视频
  SHEET_N=24 SHEET_W=480 SHEET_FROM=0 SHEET_TO=719
  CHROME=<路径>   指定 Chrome
`);
  process.exit(0);
}

let puppeteer;
try {
  ({ default: puppeteer } = await import('puppeteer-core'));
} catch {
  console.error('缺依赖：先在这个仓库根目录跑 `npm i`（需要 puppeteer-core）。');
  process.exit(1);
}

const HOME = process.env.HOME || '';
function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;          // ① 显式指定优先
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const HOME = process.env.HOME || '';
  // ② 系统里正经装的那一个（apt / .deb / 用户级解包都认）
  for (const p of [
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/opt/google/chrome/chrome',
    HOME + '/.local/bin/google-chrome', HOME + '/.local/bin/google-chrome-stable',
    HOME + '/.local/opt/google-chrome-stable/opt/google/chrome/chrome',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium',
    '/usr/bin/brave-browser', '/usr/bin/microsoft-edge',
  ]) if (fs.existsSync(p)) return p;
  // ③ 都没装，就用 puppeteer 下到缓存里的
  const root = path.join(HOME, '.cache/puppeteer/chrome');
  if (fs.existsSync(root)) {
    // 目录名可能是 154.0.8037.57 也可能是 linux-154.0.8037.57：按版本号倒序
    const ver = d => (d.match(/\d+(\.\d+)+/) || ['0'])[0].split('.').map(Number);
    const vers = fs.readdirSync(root).sort((a, b) => {
      const pa = ver(a), pb = ver(b);
      for (let i = 0; i < 4; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pb[i] || 0) - (pa[i] || 0);
      return 0;
    });
    for (const v of vers) for (const bin of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
      const p = path.join(root, v, bin);
      if (fs.existsSync(p)) return p;
    }
  }
  throw new Error('找不到 Chrome：装一个（apt install google-chrome-stable，或 npx puppeteer browsers install chrome），'
    + '或用 CHROME=/path/to/chrome 指定');
}



const frames = process.argv.slice(2).map(Number).filter(n => !Number.isNaN(n));
if (!frames.length) { console.error('用法：node shot.mjs <帧号...>'); process.exit(1); }
const seed = +(process.env.SEED || 7);
const width = +(process.env.W || 1920);
const html = path.resolve(process.env.HTML || (fs.existsSync('film/index.html')
  ? 'film/index.html'                      // 项目里的片子优先
  : path.resolve(HERE, '../resources/skeleton.html')))  // 否则用技能包自带的骨架;
const outDir = process.env.OUT || 'shots';
fs.mkdirSync(outDir, { recursive: true });

const b = await puppeteer.launch({
  executablePath: findChrome(), headless: true, protocolTimeout: 900000,
  args: ['--allow-file-access-from-files', '--disable-accelerated-2d-canvas',
         '--force-color-profile=srgb', '--hide-scrollbars', '--mute-audio', '--no-sandbox'],
});
const p = await b.newPage();
p.on('pageerror', e => console.error('页面报错：', e.message));
await p.goto('file://' + html + `?f=0&w=320&s=${seed}`, { waitUntil: 'load', timeout: 120000 });
await p.waitForFunction('window.__ready===true', { timeout: 120000 });

const t0 = Date.now();
for (const n of frames) {
  const u = await p.evaluate((n, w, s) => window.RISO.frame(n, w, s), n, width, seed);
  const out = path.join(outDir, `f${String(n).padStart(5, '0')}.png`);
  fs.writeFileSync(out, Buffer.from(u.split(',')[1], 'base64'));
  console.log(`${out}  ${t0 && ''}`);
}
console.log(`${frames.length} 张，${((Date.now() - t0) / 1000).toFixed(1)}s`);
await b.close();
