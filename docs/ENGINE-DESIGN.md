# photo-dojo 兩個純前端引擎設計

## 0. 共同決策
- **核心無 canvas**：所有運算跑在 `Raster = { w, h, data: Uint8ClampedArray /* RGBA */ }` 純函式上，vitest `environment: 'node'` 直接用合成圖測。canvas 只在兩個薄 adapter：`src/lib/raster/fromImage.ts`（ImageBitmap/HTMLImageElement → Raster，含縮圖）與 `src/lib/raster/toBlob.ts`（Raster → canvas → Blob / object URL），這兩個由 e2e 覆蓋。
- 共用 `src/lib/raster/`：`resize(r, maxSide)`（box filter 整數倍縮，餘數 bilinear）、`toGray(r): Float32Array`（Rec.601）、`sobel(gray,w,h): {mag,gx,gy}`、`rotateCrop(r, deg)`（旋轉後裁最大內接矩形再縮回原尺寸）、`crop`、`rgb2hsv/hsv2rgb`、`boxBlur(gray|raster, radius, passes)`、`rng(seed)`（mulberry32）。
- **工作解析度**：analyze 長邊 320（sharpness/noise 用 480）。手機目標 <200ms。
- **分數形狀**：每指標回 `{ raw, score: 0–100, confidence: 0–1, hints: Hint[] }`，`Hint = { principle: PrincipleId, severity: 'info'|'warn', text }`。分數映射一律用 `lerpScore(x, [[x0,s0],[x1,s1],…])` 讓門檻是資料。confidence<0.3 不進 overall，UI 灰顯「參考」。
- 引用的 PrincipleId（必須存在於 `src/content/principles.ts`）：exposure, dynamic-range, rule-of-thirds, subject-placement, horizon-level, negative-space, leading-lines, color-harmony, saturation, white-balance, sharpness, noise, symmetry。

## 1. Engine 1 — `src/lib/analyze/`
```
types.ts        Raster re-export, MetricResult, LocalReport, Hint, THRESHOLDS
index.ts        analyze(raster): LocalReport（orchestrator，同步純函式）
exposure.ts saliency.ts thirds.ts horizon.ts negativeSpace.ts leadingLines.ts
colorHarmony.ts sharpness.ts noise.ts symmetry.ts scoring.ts
__tests__/synth.ts + 每指標一個 *.test.ts
```
### Orchestrator
1. `small = resize(r, 320)`, `gray = toGray(small)`, `edges = sobel(gray)`；`mid = resize(r, 480)` 給 sharpness/noise。
2. `sal = saliency(edges, small)` 算一次，傳給 thirds / negativeSpace / symmetry / sharpness。
3. 組 `LocalReport { size, metrics: {exposure, thirds, horizon, negativeSpace, leadingLines, colorHarmony, sharpness, noise, symmetry}, saliency: {cx, cy, bbox, mass}, overall, hints（severity 排序、同 principle 去重）, disclaimer: 'reference-indicators' }`。
4. overall = confidence 加權平均，權重 exposure .2 / sharpness .2 / thirds .15 / colorHarmony .15 / horizon .1 / negativeSpace .1 / leadingLines .05 / noise .05；confidence<0.3 剔除。

### 指標
- **exposure**：256 bin 直方圖；clipLow=%px<8、clipHigh=%px>247、median、p5/p95（DR=p95−p5）。score 從 100 扣：clipHigh `lerp([[0.5,0],[3,25],[10,60]])`、clipLow 同表但半權、|median−118| `lerp([[30,0],[70,30],[100,50]])`。DR 子分 `lerp(DR,[[60,30],[120,80],[180,100]])`。hints：clipHigh>3% → exposure warn「亮部約 X% 接近純白」；clipLow>6% → exposure；DR<80 → dynamic-range info。confidence 1.0，雙峰（兩峰距>15% 且谷<峰 20%）→ 0.6（剪影/高低調可能是刻意）。
- **saliency**：energy = boxBlur(sobel mag, r5, 2 passes) + 0.5×每像素與全圖平均 RGB 的距離（正規化）。取前 20% 能量像素：加權質心 (cx,cy)、bbox = 5–95 百分位、mass = 保留像素平均能量 / 全圖平均能量。輸出 0–1 座標。紋理滿版時質心≈中心且 mass 低。
- **thirds**：dThirds = 質心到 4 個三分交點最小距離（÷對角線）；dCenter；edgeDist=min(cx,1−cx,cy,1−cy)。score `lerp(dThirds,[[0.05,100],[0.12,75],[0.25,40],[0.4,15]])`；若 dCenter<0.06 且 symmetry score>70 → 下限 70（刻意置中）。edgeDist<0.08 或 bbox 觸及 >1 邊 → subject-placement warn。confidence = `lerp(mass,[[1.5,0.2],[3,1]])`。
- **horizon**：mag>60 百分位的像素取 φ=atan2(gy,gx)+90° 折到 (−90,90]，留 |φ|≤20°；0.5° bin 加權直方圖；空間一致性：切 8 欄，bin 要在 ≥5 欄有質量才算線。峰 bin 抛物線內插 → tilt。strength = 峰質量/近水平總質量；confidence = `lerp(strength,[[0.08,0],[0.25,1]]) × lerp(近水平質量/總質量,[[0.05,0],[0.2,1]])`。score `lerp(|tilt|,[[0.7,100],[2,85],[4,55],[7,25],[12,0]])`；|tilt|>2 且 conf>0.5 → horizon-level warn。
- **negativeSpace**：8×8 格，busy = 格平均 mag > 1.2×全圖中位 mag。emptyFraction、emptyContiguity（最大 4 連通空格區塊/64）。score `lerp(emptyFraction,[[0.1,40],[0.3,80],[0.6,100],[0.85,70]])`（描述性）。emptyFraction<0.12 → negative-space info「畫面滿」；>0.6 且連通>0.4 → info 正向。confidence 0.8。
- **leadingLines**：粗 Hough（θ 4°×45 bin、ρ 4px），mag>70 百分位投票；前 5 峰 NMS ±2 bin；length = votes/該線最大可能票數；lineCount = length>0.25 的峰數；convergent = ≥2 線交點落在質心 0.15 內。score `lerp(lineCount,[[0,40],[1,65],[2,85],[3,100]]) +10 if convergent`。**只給 info，從不 warn**。confidence 0.5。
- **colorHarmony**：每 2 px 取樣；k=5 k-means 8 迭代，初始化取 4×4×4 直方圖前 5 大 bin（確定性）。meanSat；castVector = 低飽和像素 (S<0.2, V 0.2–0.9) 的 mean(R−G, B−G)；色相圓變異（忽略 S<0.15 群）。分類：<0.15 單色/相近；兩群差≈180° 互補；三群≈120° 三分；否則分散。score：前三類 85–100，分散 `lerp(disp,[[0.3,75],[0.6,50]])`。saturation：meanSat<0.12 info「低飽和/近黑白」；>0.55 warn。white-balance：|cast|>18 warn（暖色門檻 24 防黃金時刻誤報），附方向詞。confidence 1.0；中性像素>80% → −0.4。
- **sharpness**：480 灰度 3×3 Laplacian 變異數（全圖＋主體 bbox 內），`sharp = lapVarSubject/(std(gray)²+ε)`。score `lerp(sharp,[[0.002,10],[0.01,45],[0.03,80],[0.08,100]])` — **常數需用 ~20 張真圖＋其模糊版校準，放 THRESHOLDS 附 TODO**。score<45 且 conf>0.5 → sharpness warn。confidence `lerp(std,[[15,0.2],[40,1]])`。
- **noise**：480 灰度，8×8 格取 Sobel 能量最低 20% 的平坦格，算減去 3×3 box blur 後殘差 std，取中位 → noiseSigma。score `lerp(σ,[[1.5,100],[3,80],[6,45],[10,10]])`。<50 → noise warn。confidence 0.7，平坦格<6 → 0.3。
- **symmetry**：mirrorErr = mean|g(x,y)−g(w−1−x,y)| / mean|g−mean|（左右、上下），symmetry = 1−min。score `lerp(sym,[[0.3,30],[0.6,70],[0.8,100]])`，只用來保護置中構圖與 info hint（>0.7）。從不 warn。

### Failure modes（UI 文案要當「參考指標」）
高調/低調/剪影/夜景/雪景會被 exposure 扣；極簡或刻意置中/多主體會讓 thirds 失準；人像/美食無地平線（靠低信心隱藏）；刻意荷蘭角、建築透視收斂；黑白/teal-orange 調色被當色偏；散景/長曝被當模糊；沙/布紋理被當雜訊。

### 合成圖 fixtures `__tests__/synth.ts`
`flat(w,h,rgb)`, `gradient(w,h,dir)`, `tiltedLine(w,h,deg,thickness,rgbAbove,rgbBelow)`（雙色地平線）, `disc(w,h,cx,cy,r,rgb,bg)`, `checker(w,h,cell)`, `stripes(w,h,angle,period)`, `addGaussianNoise(r,sigma,seed)`, `gaussianBlurRef(r,sigma)`（慢速參考）。

### Vitest（Engine 1）
raster：resize 保平均亮度±1 與比例；toGray 純紅=76±1；sobel 垂直階梯 gx≠0 gy≈0；rotateCrop(0) 恒等；rng 可重現且 ∈[0,1)。
exposure：flat(250) clipHigh≈100%、score<20、有 exposure hint；flat(128) ≥95 無 hint；gradient DR≥95；雙色剪影 conf≤0.6。
saliency：disc(0.33,0.33) 質心誤差<0.03、bbox 含 disc；flat mass≈1。
thirds：disc 在三分點 ≥95；置中非對稱 ≤50；置中對稱 ≥70；觸邊有 subject-placement。
horizon：tiltedLine ±1.5/4/8/0 → |tilt−deg|<0.6 且 conf>0.7；stripes 45° / checker / 噪聲 conf<0.3。
negativeSpace：flat+小 disc emptyFraction>0.8；checker(4) <0.1 且有 hint。
leadingLines：兩條匝聚於 disc 的條紋 lineCount≥2 convergent；flat 0；斷言永無 warn。
colorHarmony：半紅半青互補≥85；5 隨機色塊分散≤75；灰圖中性 +20 紅 → white-balance「暖」；灰圖 conf≤0.6 且 saturation info。
sharpness：checker(8) vs gaussianBlurRef σ3 差≥40；flat conf<0.3。
noise：flat(128)+σ8 → 量測 8±2、score<30；flat ≥95。
symmetry：鏡像漸層 ≥0.9；隨機 <0.4。
orchestrator：所有 metric key 存在、hint principle ∈ PRINCIPLE_IDS、overall∈[0,100]、去重、flat 圖 horizon 不影響 overall、1280×853 合成圖 <300ms（CI 跳過）。

## 2. Engine 2 — `src/lib/variants/`
```
types.ts     FlawId, Difficulty, VariantResult
registry.ts  FLAWS: Record<FlawId,{principle, requires: SourceTag[], excludes: SourceTag[], tiers}>
index.ts     makeVariant(src, flawId, seed, difficulty?) / pickFlaw(tags, report, srsWeights, seed)
flaws/tilt.ts exposure.ts cropSubject.ts centerCrop.ts desaturate.ts colorCast.ts blur.ts noise.ts
__tests__/
```
- `VariantResult = { raster, flawId, principle, params, explain, cropApplied: {x,y,w,h} | null }`。tilt 類回傳 cropApplied 讓好圖套同樣裁切（避免「內容多的是好圖」洩題）。輸入 Raster 長邊 800。
- **確定性**：`r = rng(hash(seed ^ flawIndex))`，所有隨機皆取自 r；參數 `value = min + r()*(max−min)`，正負號 `r()<0.5`。題目 id = `${imageId}:${flawId}:${seed}`。
- **8 壞法**（principle / 轉換 / hard / medium / easy / 守門）：
  - `tilt` horizon-level：rotateCrop θ 再縮回原尺寸；3–4.5 / 4.5–6.5 / 6.5–9°；源圖自身 |tilt|>1.5° 跳過。
  - `overexpose`/`underexpose` exposure：LUT `255·(in/255)^γ + offset`；over γ.75/+15 → .65/+25 → .55/+35；under γ1.5/−20 → 1.75/−30 → 2.0/−40；套後 clip 需 +5pt 以上否則升一級重試一次。
  - `cropSubject` subject-placement：用 saliency bbox 裁 70–80% 視窗，讓質心貼邊（hard edgeDist 0.08 / medium 0.03）或切掉 bbox 25–45%（easy）；需 mass≥2 且 bbox<40% 面積。
  - `centerCrop` rule-of-thirds：源圖 dThirds<0.12 且 symmetry<60；裁 80%（medium）/70%（easy）視窗把質心推到正中。
  - `desaturate` saturation：HSV S×k，k .45/.3/.05，加 +8 亮度提升模擬手機平淡感；需 meanSat≥0.25。
  - `colorCast` white-balance：通道偏移暖(+R,−B)/冷/綠/洋紅，18/26/35，扣掉平均保亮度；需源 |cast|<12 且中性像素≥15%。
  - `blur` sharpness：三段 box blur r 1.5/2.5/4（800px）；需源 sharpness≥60，套後需掉≥25pt。
  - `noise` noise：Box-Muller 亮度噪聲 σ 10/18/28 +30% 色度噪聲；需源 noise≥70，emptyFraction≥0.15。
- **反卡通守門**：套用後重跑對應指標，delta 需落帶（tilt 量測 ±1°、clip +5~+45pt、sharpness −25~−70）；超帶則參數×0.75 重做一次。絕不疊加兩種壞法。
- **來源資格（tags）**：tilt 需 horizon|architecture、排除 portrait/food；overexpose 排除 highkey/night；underexpose 排除 lowkey/night；cropSubject/centerCrop 排除 busy/symmetric（centerCrop 另排除 centered）；desaturate/colorCast 排除 bw、colorCast 另排除 night；noise 排除 busy/night。runtime 守門需要源圖 LocalReport（每張算一次快取）。`pickFlaw` 過濾後依 SRS 權重確定性抽樣；無可用回 null。

### Vitest（Engine 2）
同 seed byte-identical、seed 不同 params 不同；tilt 在 tiltedLine(0) 上量測≈θ±0.8、尺寸不變、無黑角（測試路徑用洋紅哨兵填充）、cropApplied 在界內、三難度區間；exposure clip +5pt 且 ≤60%、亮度隨難度單調；cropSubject disc 在三分點 → edgeDist<0.08（hard）/bbox 觸邊（easy），flat 不合格；centerCrop 質心距中心<0.04；desaturate meanSat −≥0.15、easy <0.05、亮度±3；colorCast 幅度≥15 方向正確、亮度±3；blur 掉≥25、hard 掉幅<easy；noise σ ±30%、checker 不合格；registry 每 FlawId 的 principle 在註冊表、8 個原則各≥1 壞法、tags=['portrait'] 永不抽 tilt、['bw'] 永不抽 desaturate/colorCast、全排除回 null、SRS 權重 3:1 抽樣比≈3×(±20%)；守門超標重試 75%。

## 3. 實作順序
raster+synth → exposure/saliency/thirds/horizon → 其餘指標+orchestrator+adapter+真圖校準 → 6 種無 saliency 依賴壞法 → cropSubject/centerCrop/pickFlaw/守門 → check/e2e 接線。
