#!/usr/bin/env bash
# 把 frames/f%05d.png 编成 out/film.mp4（带配乐），并做完整性校验。
#
#   ./build.sh            720 帧 + out/track.wav
#   FPS=30 ./build.sh ...
#
# 三个必须做对的地方（framewright 的实测结论）：
#   1) -pix_fmt yuv420p        —— 否则播放器里可能解不出来
#   2) BT.709 矩阵转换 + 打标  —— ffmpeg 单独跑会用 BT.601 且不打标，
#      播放器按 BT.709 解读 HD 视频，饱和色会偏（实测纯绿偏 39 个 level）
#   3) 先写临时文件，编码成功才 rename —— 避免留下一个半截的 mp4
set -euo pipefail
# 切到仓库根目录：脚本在 assets/ 下，而 frames/ out/ 都在根目录。
# （不是 git 仓库时退回脚本所在目录。）
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || dirname "$0")"

FPS=${FPS:-30}
CRF=${CRF:-22}
FRAMES=${FRAMES:-frames}
AUDIO=${AUDIO:-out/track.wav}
OUT=${OUT:-out/film.mp4}
TMP="${OUT%.mp4}.tmp.mp4"
mkdir -p "$(dirname "$OUT")"

[ -d "$FRAMES" ] || { echo "没有 $FRAMES/，先跑 node render.mjs $FRAMES"; exit 1; }
N=$(ls "$FRAMES"/f*.png 2>/dev/null | wc -l)
echo "帧数 $N @ ${FPS}fps = $(echo "scale=3; $N/$FPS" | bc)s"

if [ -f "$AUDIO" ]; then
  # 音画时长必须一致，否则 -shortest 会悄悄把片子截短或留一段没声的尾巴
  ASEC=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$AUDIO")
  VSEC=$(echo "scale=3; $N/$FPS" | bc)
  if [ "$(echo "$ASEC < $VSEC - 0.05 || $ASEC > $VSEC + 0.05" | bc)" = "1" ]; then
    echo "⚠️  配乐 ${ASEC}s 与画面 ${VSEC}s 不一致（差 $(echo "$ASEC - $VSEC" | bc)s）"
    echo "    改 audio.mjs 顶部的 DUR 和 SEC_* 分节边界，或删掉 $AUDIO 出无声片"
  else
    echo "配乐 $AUDIO（${ASEC}s，与画面一致）"
  fi
  AUD=(-i "$AUDIO" -c:a aac -b:a 192k -shortest)
else
  AUD=()
  echo "（没有 $AUDIO，出无声片）"
fi

ffmpeg -y -loglevel error -stats \
  -framerate "$FPS" -i "$FRAMES/f%05d.png" \
  "${AUD[@]}" \
  -c:v libx264 -preset slow -crf "$CRF" -maxrate 14M -bufsize 28M \
  -pix_fmt yuv420p \
  -vf "scale=in_range=full:out_range=limited,colorspace=all=bt709:iall=bt709:fast=1" \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv \
  -movflags +faststart \
  "$TMP"
mv "$TMP" "$OUT"

echo "--- 校验 ---"
V=$(ffprobe -v error -select_streams v:0 -count_frames -show_entries stream=nb_read_frames,width,height,pix_fmt,color_space,color_primaries -of default=nw=1 "$OUT")
echo "$V"
D=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$OUT")
echo "时长 $D s（期望 $(echo "scale=3; $N/$FPS" | bc)）"
echo "-> $OUT  $(du -h "$OUT" | cut -f1)"
