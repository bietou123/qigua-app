# 起卦

小六壬 / 六爻 / 大六壬 / 梅花易数 四种起卦法的**排盘工具**，安卓 APP + 网页两种形态。

## 这个 App 做什么、不做什么

**做**：按各派公认的规则把盘排出来，把与卦相关的古籍原文（周易六十四卦卦辞爻辞、小六壬六神诀等）原样呈现，并把每一步推演过程摊开给你看。

**不做**：不生成任何吉凶断语、运势解读、行动建议。原文之外的解释文字一个字都没有。断卦是你自己的事，这个工具只负责把盘排对、把原文找准。

所有古籍文本都是**在构建期从原书机械抽取**的，不由模型生成。数据来源、抽取方式、自校验结果和已知勘误，在 App 内「设置 → 关于数据来源」里能直接看到。

## 流派分歧怎么处理

术数各派规则常有冲突。原则是：**凡有分歧的地方，代码注释里写清采用哪一派、为什么，UI 上也让用户看得到。**

每次起卦结果页底部都有一个「说明」区块，会列出这一卦用到的具体取法，比如：

- **时辰依据**：真太阳时（经度 104.1°E）／北京时间
- **子时归属**：晚子时派（23 时起算次日）／早子时派
- **大六壬贵人**：本 App 取昼贵 甲未 乙申 丙酉 丁亥 戊未 己子 庚丑 辛午 壬卯 癸巳，夜贵取同组另一支。选它的理由是**可互校**，不是因为它更「正确」——口诀只给了每组共用的两支，并没说哪支属昼、哪支属夜。
- **梅花体用**：动爻所在卦为用，另一卦为体（另有以下卦为体的一派，结果页给出对照）

设置里能切换真太阳时和子时归属，切换会立刻影响所有四种起卦法的结果。

## 四种起卦法

| 方式 | 起卦入口 | 输出 |
|---|---|---|
| **小六壬** | 当前时间／报三个数 | 三宫（始中终）、六神诀原文、宫间生克 |
| **六爻** | 摇卦（随机）／手动录六次背面数／时间起卦 | 京房纳甲全盘、六亲六神、世应、伏神飞神、旬空月破、动爻变卦、卦辞爻辞 |
| **大六壬** | 当前时间／手动指定占时月将 | 天地盘、四课（右起）、三传（含遁干天将）、九宗门发用推演、十二天将、课体 |
| **梅花易数** | 两数／一数／文字／时间 | 本卦互卦变卦、体用生克、旺相休囚死、卦辞爻辞 |

六爻的「手动录背面数」是给用铜钱实摇的人用的：每爻数背面几个（0~3），六格填完点起卦。

## 跑起来

### 网页（开发/调试）

```bash
npm run build      # 把 src/ vendor/ 打进 www/，生成 www/src/data/yijing64.js
npm run serve      # http://127.0.0.1:5173
```

`www/` 是唯一会被打进 apk 的目录，所以 `src/` 和 `vendor/` 必须经 `npm run build` 复制进去，不能只改仓库根目录的源文件。

### 安卓 apk

需要 JDK 17 + Android SDK（platform 34 + build-tools）。

```bash
npm run build
npx cap sync android

export JAVA_HOME="/path/to/jdk-17"
export ANDROID_HOME="/path/to/android-sdk"
cd android && ./gradlew assembleDebug --no-daemon
# → android/app/build/outputs/apk/debug/app-debug.apk
```

**国内网络注意**：`services.gradle.org` 会返回 307 但传 0 字节（实际不通），所以 `gradle-wrapper.properties` 已改用腾讯云镜像；`android/build.gradle` 里阿里云 Maven 镜像放在官方源前面，官方源保留兜底。这两处改动是为了能在国内网络下从零构建，不要改回去。

**这个 App 申请 0 个安卓权限。** `AndroidManifest.xml` 里连 `INTERNET` 都没有——Capacitor 的 `https://localhost` 走的是内部 `WebViewAssetLoader` 直读 `assets/`，不经网络栈，所以去掉也照样加载。已在 android-34 上装无权限包实测起卦通过（`dumpsys package` 里 `android.permission` 出现 0 次）。

### 签名 release

```bash
cd android && ./gradlew assembleRelease --no-daemon
# → android/app/build/outputs/apk/release/app-release.apk
```

签名信息读 `android/keystore.properties`，密钥是 `android/qigua-release.jks`（RSA 4096，有效期 30 年）。**这两个文件都在 .gitignore 里，请自行生成并妥善备份。**

> ⚠️ **keystore 丢了就再也无法给已安装的这个 App 发更新**（包名相同但签名不同的包，安卓会拒绝覆盖安装，用户只能卸载重装、丢掉本地数据）。把 `android/qigua-release.jks` 和 `android/keystore.properties` 复制一份到别处存好。

`keystore.properties` 不存在时 release 会退化成未签名包，这样别人拿到源码至少 `assembleDebug` 能直接跑。

当前证书指纹（换密钥后此处要同步更新）：
```
SHA-256  f6:28:b0:95:36:c7:7b:0d:ce:0a:27:d6:74:8a:44:bd:25:df:f6:d1:90:4c:4d:64:09:35:31:96:83:75:5e:9f
```

### 图标

```bash
npm run icons
```

用本机 Chrome 以 CDP 无头渲染 SVG 出图（项目零第三方运行时依赖，不想为几张 PNG 装图形库）。会生成五档密度的方形／圆形／自适应前景图标、`drawable/splash.png`，并把自适应图标背景色改成 `#100e0c`、删掉 Capacitor 默认那个会盖住 PNG 的矢量前景。改配色只需动 `tools/make-icons.cjs` 顶部的 `BG` / `GOLD` / `GOLD_HI`。

## 测试

```bash
npm test           # 62 个算法层单元测试
npm run smoke      # 无头 Chrome 跑 14 条起卦路径，检查渲染
npm run shots      # 逐屏截图到 screenshots/，供人眼看排版
```

`npm test` 必须写成 `node --test test/*.test.js`，写成 `node --test test/` 会被 node 当成单个测试文件而报一个假失败。

`npm run smoke` 的判定标准：每条路径至少渲染 3 张卡片、输出 HTML 里 `undefined`/`NaN`/`[object Object]` 出现 0 次、无 console 错误、无错误 toast，另外校验设置项确实透传到结果页、以及「所占何事」里注入的 `<img onerror>` 不会被执行。它抓到过一个单元测试抓不到的空指针（六爻无动爻时 `bianGua` 为 `null`）。

## 结构

```
src/core/calendar.js     历法：真太阳时、节气、四柱   resolve(dt, longitude, useTrueSolar, sect)
src/core/ganzhi.js       干支、五行、生克、纳音
src/modules/*.js         四种起卦法，纯函数，无 IO
src/data/yijing64.json   六十四卦原文（构建期抽取，带 _source/_selfCheck/_errata）
vendor/lunar.esm.js      lunar-javascript，唯一的第三方依赖，已 vendor
www/index.html app.css app.js   UI 层，不含任何术数计算
tools/                   构建、本地服务、无头测试、图标生成
test/                    node --test
ALGORITHM-BASELINE.md    算法验收基准（注意读它的第 8 节）
```

`ALGORITHM-BASELINE.md` 是这套算法的验收基准，但它自己也可能出错——第 1.7 节的贵人表最初就是错的（凭记忆写的），实现是对的。文档第 8 节专门讲了它自身的可信度边界，改算法前先读那节。

`www/app.js` 里的字段名全是用 `node -e` 逐个探出来的，不是猜的。之前凭记忆写测试导致 11 个假失败，别再猜。

## 已在真机验证的部分

android-34 模拟器（Pixel 5, 1080×2340）上装 release 包实测：四种起卦法全部能起、渲染无误、无 JS 报错。逐格核对过的两处：

- **大六壬**：占时申、月将午 → 天盘 = 地盘 −2，12 格逐一对上；四课右起，占时格高亮正确
- **六爻**：水山蹇，坎(戊)上艮(丙)下 → 兑宫金四世卦，世四应初，六爻纳甲逐爻无误

## 待办

- [ ] 换应用名/包名前先想清楚：包名一改就等于新 App，旧版数据不迁移
- [ ] `www/app.js` 目前是单文件约 600 行，再加起卦法的话该拆了

## 许可

MIT License，见 [LICENSE](LICENSE)。
