# 有声谱智能打印助手（Youshengpu Print Helper）

## 项目背景与初衷

我是一名机械设计制造及其自动化专业的大一新生，只会基础的 C 语言和 Python，对前端技术几乎一窍不通。平时喜欢玩吉他，在`yopu.co`网站看有声谱时发现两个痛点（要VIP😫😭）：一是谱子能看但不能播放，二是打印时要么只能打一页，要么排版混乱。

偶然看到 52pojie 论坛的两篇帖子（[帖子 1](https://www.52pojie.cn/thread-1806852-1-1.html)、[帖子 2](https://www.52pojie.cn/thread-1831687-1-1.html)），受到启发后，决定用 AI 辅助开发一个用户脚本解决这些问题。目前功能虽能满足基本需求，但代码肯定有很多不规范的地方，欢迎大家指正！

## 目前功能范围
<img width="262" height="339" alt="Snipaste_2025-08-01_16-02-03" src="https://github.com/user-attachments/assets/70d4da8e-b3b1-4930-b6c4-81d0503a59b1" />



## 核心功能与破解思路

基于对以下两个页面的结构分析（2025 年 8 月 1 日验证有效）：



*   六线谱参考页：[https://yopu.co/view/rplY9nb1](https://yopu.co/view/rplY9nb1)

*   和弦谱参考页：[https://yopu.co/view/aPex8EXb](https://yopu.co/view/aPex8EXb)

### 一、关键元素定位方法



1.  **打开开发者工具**：在目标页面按`F12`→「Elements」→左上角「选择元素」按钮，点击页面元素即可在右侧看到对应 HTML 代码。

2.  **稳定选择器原则**：优先使用`id`或不含随机字符的`class`（避免使用`svelte-xxxx`等动态生成的 class，可能随页面更新变化）。

### 二、各版本功能实现细节

#### v1.0：解锁有声谱播放

**核心问题**：网站通过定时器限制播放，且隐藏部分打印区域。

**实现步骤**：

1.  **突破播放限制**：

```
// 覆盖定时器函数，阻止播放限制触发

unsafeWindow.setTimeout = function() {};
```


#### v2.0：新增智能打印按钮

**核心问题**：网站原生 “打印曲谱” 按钮需 VIP，且打印内容不全。

**实现步骤**：

1.  **解除内容屏蔽**：

*   控制区域核心元素（六线谱 / 和弦谱通用）：

    `#c > div > div.layout > div.side > section.control`

    （原`svelte-xxxx`类为动态生成，已移除，使用稳定层级定位）

*   查找并替换`no-print`类：


```
const target = document.querySelector('#c > div > div.layout > div.side > section.control');

const noPrintParent = findParentWithClass(target, 'no-print'); // 向上查找含no-print的父元素

noPrintParent.classList.replace('no-print', 'print');
```

2.  **按钮插入位置**：

    控制区域内 “打印曲谱” 按钮下方的`div`元素：

    `#c > div > div.layout > div.side > section.control > div:nth-child(2)`

3.  **插入自定义按钮**：



```
const printBtn = createPrintButton();&#x20;

target.parentNode.insertBefore(printBtn, target.nextSibling); // 插入到目标元素后方
```

#### v3.0：突破打印限制与排版优化

**核心问题**：浏览器原生打印被限制为 “仅第一页”，且乐谱跨页断裂。

**实现步骤**：



1.  **乐谱内容区域**：

    所有 SVG 乐谱的容器（核心打印区域）：

    `#nier-scroll-view > div > div > ``div.at``-surface`

    （验证：该容器在两个参考页中均稳定存在，直接包含乐谱的`svg`元素）

2.  **智能分页算法**：



```
// 提取所有乐谱SVG元素

const svgElements = document.querySelectorAll('#nier-scroll-view > div > div > div.at-surface svg');
```

#### v4.0：自定义打印设置面板

**核心问题**：不同用户需要个性化边距和行间距。

**实现步骤**：



1.  **设置面板应用**：

    生成打印页面时，将用户设置应用到安全区：



```
.safe-area {

&#x20; margin-left: \${leftMargin}mm !important;

&#x20; margin-right: \${rightMargin}mm !important;

&#x20; /\* 其他边距和行间距设置 \*/

}
```
#### v4.5：下架曲谱解锁

**来源**：https://update.greasyfork.org.cn/scripts/493587/%E6%9C%89%E8%B0%B1%E4%B9%88%20Copyleft.user.js

**实现步骤**：

    GM_addStyle('.copyright-note {display:none;}')
    setInterval(()=>{
        Array.from(document.getElementsByClassName('copyright')).forEach((n)=>{
          if (n.nodeName=='A'){
              n.classList.remove('copyright');
          }
          if (n.nodeName=='DIV'&&n.parentNode.classList.contains('song-preview')){
              n.classList.remove('copyright');
              n.parentNode.getElementsByTagName('a')[0].href=n.parentNode.getElementsByTagName('a')[0].href.replace('song#title=','explore#q=').replace('&artist=',' ');
          }
        })
    },1000)


#### 和弦谱特有元素（v5.0 开发中）



1.  **和弦标注元素**（仅和弦谱存在）：

    `#nier-scroll-view > div > div > ``div.at``-surface > div.chord-mark`

    （验证：在和弦谱参考页中，该元素包含 C、Am 等和弦符号，部分使用`position: absolute`）

2.  **和弦指法图**（仅和弦谱存在）：

    `#nier-scroll-view > div > div > ``div.at``-surface > svg.chord-diagram`

    （动态生成的 SVG，含`data-finger`属性，控制指法显示）

## 更新日志

#### v4.7 - 解决网页更新拦截脚本问题

#### v4.5 - 下架曲谱解锁



*   新增解锁版权下架乐谱


#### v4.0 - 自定义打印设置



*   新增可编辑打印设置面板，支持自定义左 / 右 / 上 / 下边距（mm）及行间距

*   设置项自动保存至本地，无需重复调整

*   优化面板 UI，采用毛玻璃视觉设计，提升交互体验

#### v3.0 - 自适应排版与限制突破



*   修复网站 "仅能打印第一页" 的限制，支持完整乐谱打印

*   优化按钮样式，融入页面设计，提升易用性

*   新增智能分页算法，避免 SVG 元素跨页断裂，解决分页失败问题

*   优化字符编码处理，消除打印乱码

*   支持暗黑模式自动反色，解决白色文本打印不清问题

#### v2.0 - 解锁打印



*   在页面控制区添加「🎼智能打印」按钮，一键触发打印流程

*   解除打印区域屏蔽，替换no-print类为print，确保内容可被打印捕获

*   修复打印区域捕获不全的问题

#### v1.0 - 核心解锁功能



*   突破有声谱内容限制，通过覆盖定时器（\`setTimeout\`）逻辑解锁完整乐谱播放

*   拦截网站监控请求，避免限制行为被检测

## 后续开发难点（求大佬支援！）

目前聚焦 v5.0 和弦谱打印，核心问题：



1.  **和弦元素检测不全**

*   和弦标注（`div.chord-mark`）多使用`position: absolute`，脱离文档流，现有`querySelectorAll`无法完整捕获。

*   需开发 “坐标关联” 逻辑：通过`getBoundingClientRect()`获取元素位置，与下方六线谱小节绑定。

1.  **和弦图谱渲染失败**

*   指法图（`svg.chord-diagram`）依赖`data-finger`属性和`transform`样式，克隆时需完整复制这些属性，否则显示空白。

1.  **排版关联失效**

*   和弦符号与六线谱小节存在严格位置对应，分页时需确保 “符号 + 小节” 作为整体拆分，避免跨页分离。

## 共建邀请

作为小白，代码全靠 AI 辅助 + 手动调试，肯定有很多漏洞：



*   若发现元素定位失效（页面更新导致），欢迎提 Issue 告知新的选择器

*   若有解决和弦谱打印难点的思路，恳请提交 PR（哪怕只是片段代码）

*   若能指导 “如何稳定捕获 absolute 元素”“动态 SVG 克隆技巧”，我会整理成笔记分享

这个项目能帮到同样喜欢音乐的朋友就很开心了，期待和大家一起完善它！

## 免责声明



1.  本项目仅用于**个人学习**，参考 52pojie 论坛技术思路，未涉及恶意攻击。

2.  脚本功能依赖`yopu.co`页面结构，若网站更新可能失效，不保证实时维护。

3.  使用时请遵守原网站用户协议，本项目与`yopu.co`无关联，产生的纠纷由使用者自行承担。

## 开发者手记

作为纯小白，写代码时连 “选择器层级” 都搞不懂，全靠一遍遍试错 + AI 解释。现在的版本可能还有很多 “笨办法”，但至少能解决自己的需求了。如果有大佬愿意指点，哪怕是骂我代码写得烂，我也会认真听的！

—— 一个努力用机械专业知识（其实用不上）+ AI 写代码的爱音乐🎵的大一学生

如果这个工具对你有帮助，哪怕只是点个Star，对我都是莫大的鼓励！也欢迎大家指出问题，我会认真学习改正～

> （注：文档部分内容可能由 AI 生成）
