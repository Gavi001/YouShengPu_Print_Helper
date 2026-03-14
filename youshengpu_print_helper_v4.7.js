// ==UserScript==
// @name         有谱么智能助手
// @namespace    http://tampermonkey.net/
// @version      4.7
// @description  解锁有谱么乐谱播放功能，处理下架曲谱，提供智能打印功能，支持自定义页边距、智能分页及暗黑模式适配
// @author       Gavi
// @match        https://yopu.co/*
// @icon         https://cdn.yopu.co/img/logo.bd260b19.svg
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    // 获取当前页面路径
    const currentPath = window.location.pathname;
    const currentHref = window.location.href;
    
    // 判断当前页面类型
    const isViewPage = currentPath.startsWith('/view/');
    const isExplorePage = currentHref.startsWith('https://yopu.co/explore#');

    // 初始默认设置
    const DEFAULT_SETTINGS = {
        leftMargin: 5,
        rightMargin: 5,
        topMargin: 10,
        bottomMargin: 10,
        lineSpacing: 0
    };
    const PRINT_SETTINGS_KEY = 'youshengpu_print_settings';

    // --------------------------
    // 核心功能函数
    // --------------------------
    function unlockSpectrum() {
        try {
            // 覆盖setTimeout，防止功能屏蔽
            const originalSetTimeout = unsafeWindow.setTimeout;
            unsafeWindow.setTimeout = function(callback, delay, ...args) {
                if (typeof delay === 'number' && delay > 2000) {
                    return -1;
                }
                return originalSetTimeout(callback, delay, ...args);
            };
            
            // 同时覆盖window.setTimeout
            window.setTimeout = unsafeWindow.setTimeout;
            
            console.log('已执行 setTimeout 覆盖解锁');
        } catch (error) {
            console.error('解锁失败:', error);
        }
    }

    function handleCopyright() {
        const copyrightPatterns = [
            '应版权方要求已下架',
            'copyright',
            '版权所有',
            '受版权保护',
            '版权限制',
            '无法显示',
            '已下架'
        ];
        
        const bodyText = document.body.innerText;
        const hasCopyrightText = copyrightPatterns.some(pattern => 
            bodyText.includes(pattern)
        );
        
        const copyrightElements = document.querySelectorAll(
            '.copyright, .copyright-notice, .copyright-info, .restricted, .removed-content'
        );
        const hasCopyrightElements = copyrightElements.length > 0;
        
        if (!hasCopyrightText && !hasCopyrightElements) {
            return false;
        }
        
        GM_addStyle(`
            .copyright-note, .copyright, .copyright-notice, .restricted-content {
                display: none !important;
            }
            .song-preview .copyright {
                display: none !important;
            }
        `);
        
        const intervalId = setInterval(() => {
            Array.from(document.getElementsByClassName('copyright')).forEach((n) => {
                hideCopyrightElement(n);
            });
            
            Array.from(document.querySelectorAll('.restricted, .removed, .blocked')).forEach(n => {
                hideCopyrightElement(n);
            });
            
            Array.from(document.getElementsByClassName('song-preview')).forEach(preview => {
                const restrictedElements = preview.querySelectorAll('div:not([class]), div[class*="restrict"]');
                restrictedElements.forEach(el => {
                    if (copyrightPatterns.some(pattern => el.innerText.includes(pattern))) {
                        hideCopyrightElement(el);
                    }
                });
                
                const link = preview.querySelector('a');
                if (link && link.href) {
                    link.href = link.href
                        .replace('song#title=', 'explore#q=')
                        .replace('&artist=', ' ');
                }
            });
        }, 800);
        
        setTimeout(() => {
            clearInterval(intervalId);
        }, 5000);
        
        return true;
    }
    
    function hideCopyrightElement(element) {
        if (!element) return;
        
        if (element.nodeName === 'A') {
            element.classList.remove('copyright');
            if (element.href) {
                element.href = element.href
                    .replace('song#title=', 'explore#q=')
                    .replace('&artist=', ' ');
            }
        } else if (element.nodeName === 'DIV' && element.parentNode?.classList.contains('song-preview')) {
            element.style.display = 'none !important';
        } else {
            element.style.display = 'none !important';
        }
    }

    // --------------------------
    // View页面专用函数
    // --------------------------
    let getSavedPrintSettings, savePrintSettings, isSettingsModified, createPrintDialog;
    let createPrintButton, handlePrint, pageBySVGElements, createNewPage;
    let shouldInvertByFirstSVGText, normalizeColor, getColorLuminance, createUnlockStatus;

    if (isViewPage) {
        // 打印设置相关函数
        getSavedPrintSettings = function() {
            try {
                const saved = localStorage.getItem(PRINT_SETTINGS_KEY);
                return saved ? JSON.parse(saved) : { ...DEFAULT_SETTINGS };
            } catch (error) {
                console.error('获取保存的设置失败，使用默认设置:', error);
                return { ...DEFAULT_SETTINGS };
            }
        };

        savePrintSettings = function(settings) {
            try {
                localStorage.setItem(PRINT_SETTINGS_KEY, JSON.stringify(settings));
            } catch (error) {
                console.error('保存设置失败:', error);
            }
        };

        isSettingsModified = function(currentSettings) {
            return Object.keys(DEFAULT_SETTINGS).some(key =>
                currentSettings[key] !== DEFAULT_SETTINGS[key]
            );
        };

        createPrintDialog = function(inputCallback) {
            const overlay = document.createElement('div');
            overlay.id = 'print-settings-overlay';
            overlay.style.cssText = `
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100% !important;
                height: 100% !important;
                background: rgba(0, 0, 0, 0.5) !important;
                z-index: 99998 !important;
                display: block !important;
                overflow: hidden !important;
                pointer-events: auto !important;
            `;

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    document.body.removeChild(overlay);
                }
            });

            const dialog = document.createElement('div');
            dialog.id = 'print-settings-dialog';
            dialog.style.cssText = `
                background: rgba(255, 255, 255, 0.1) !important;
                backdrop-filter: blur(16px) !important;
                padding: 24px !important;
                border-radius: 16px !important;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25) !important;
                width: 360px !important;
                max-width: 90% !important;
                z-index: 99999 !important;
                border: 1px solid rgba(255, 255, 255, 0.18) !important;
                color: white !important;
                position: absolute !important;
                top: 50% !important;
                left: 50% !important;
                transform: translate(-50%, -50%) !important;
                margin: 0 !important;
                pointer-events: auto !important;
            `;

            const title = document.createElement('h3');
            title.textContent = '打印设置';
            title.style.cssText = `
                margin-top: 0;
                text-align: center;
                font-size: 20px;
                color: #fff;
                text-shadow: 
                    -1px -1px 1px rgba(0, 0, 0, 0.3), 
                    1px -1px 1px rgba(0, 0, 0, 0.3), 
                    -1px 1px 1px rgba(0, 0, 0, 0.3), 
                    1px 1px 1px rgba(0, 0, 0, 0.3);
            `;
            dialog.appendChild(title);

            const form = document.createElement('form');
            form.id = 'print-settings-form';

            const inputs = {};

            function createInputField(labelText, id, defaultValue, unit = '') {
                const container = document.createElement('div');
                container.style.cssText = 'margin-bottom: 18px;';

                const label = document.createElement('label');
                label.textContent = labelText;
                label.style.cssText = `
                    display: block;
                    margin-bottom: 6px;
                    font-weight: 500;
                    color: #e0e0e0;
                    text-shadow: 
                        -0.5px -0.5px 0.5px rgba(0, 0, 0, 0.2), 
                        0.5px -0.5px 0.5px rgba(0, 0, 0, 0.2), 
                        -0.5px 0.5px 0.5px rgba(0, 0, 0, 0.2), 
                        0.5px 0.5px 0.5px rgba(0, 0, 0, 0.2);
                `;
                label.setAttribute('for', id);

                const input = document.createElement('input');
                input.type = 'number';
                input.id = id;
                input.value = defaultValue;
                input.style.cssText = `
                    width: 100%;
                    padding: 10px 12px;
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    border-radius: 8px;
                    box-sizing: border-box;
                    background: rgba(255, 255, 255, 0.05);
                    backdrop-filter: blur(4px);
                    font-size: 14px;
                    color: #fff;
                    transition: border-color 0.3s, box-shadow 0.3s;
                `;

                input.addEventListener('focus', () => {
                    input.style.borderColor = '#8e24aa';
                    input.style.boxShadow = '0 0 0 3px rgba(142, 36, 170, 0.2)';
                });

                input.addEventListener('blur', () => {
                    input.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                    input.style.boxShadow = 'none';
                    checkSettingsChange();
                });

                const unitSpan = document.createElement('span');
                unitSpan.textContent = unit;
                unitSpan.style.cssText = `
                    margin-left: 5px;
                    color: #aaa;
                `;

                container.appendChild(label);
                container.appendChild(input);
                if (unit) container.appendChild(unitSpan);

                inputs[id] = input;
                return container;
            }

            const savedSettings = getSavedPrintSettings();

            form.appendChild(createInputField('左边距', 'left-margin', savedSettings.leftMargin, 'mm'));
            form.appendChild(createInputField('右边距', 'right-margin', savedSettings.rightMargin, 'mm'));
            form.appendChild(createInputField('上边距', 'top-margin', savedSettings.topMargin, 'mm'));
            form.appendChild(createInputField('下边距', 'bottom-margin', savedSettings.bottomMargin, 'mm'));
            form.appendChild(createInputField('行间距', 'line-spacing', savedSettings.lineSpacing, 'mm'));

            const resetText = document.createElement('div');
            resetText.textContent = '重置数据';
            resetText.style.cssText = `
                color: #ff9800;
                text-align: center;
                cursor: pointer;
                font-size: 13px;
                margin: -10px 0 5px 0;
                transition: color 0.2s;
                display: none;
            `;

            resetText.addEventListener('mouseenter', () => {
                resetText.style.color = '#ffb74d';
            });

            resetText.addEventListener('mouseleave', () => {
                resetText.style.color = '#ff9800';
            });

            resetText.addEventListener('click', () => {
                inputs['left-margin'].value = DEFAULT_SETTINGS.leftMargin;
                inputs['right-margin'].value = DEFAULT_SETTINGS.rightMargin;
                inputs['top-margin'].value = DEFAULT_SETTINGS.topMargin;
                inputs['bottom-margin'].value = DEFAULT_SETTINGS.bottomMargin;
                inputs['line-spacing'].value = DEFAULT_SETTINGS.lineSpacing;
                savePrintSettings(DEFAULT_SETTINGS);
                checkSettingsChange();
            });

            function checkSettingsChange() {
                const currentSettings = {
                    leftMargin: parseFloat(inputs['left-margin'].value) || 0,
                    rightMargin: parseFloat(inputs['right-margin'].value) || 0,
                    topMargin: parseFloat(inputs['top-margin'].value) || 0,
                    bottomMargin: parseFloat(inputs['bottom-margin'].value) || 0,
                    lineSpacing: parseFloat(inputs['line-spacing'].value) || 0
                };
                if (isSettingsModified(currentSettings)) {
                    resetText.style.display = 'block';
                } else {
                    resetText.style.display = 'none';
                }
            }

            form.appendChild(resetText);

            const buttonContainer = document.createElement('div');
            buttonContainer.style.cssText = `
                display: flex !important;
                gap: 12px !important;
                margin-top: 10px !important;
                width: 100% !important;
                box-sizing: border-box !important;
                padding: 0 !important;
                border: none !important;
                background: transparent !important;
                flex-wrap: nowrap !important;
                align-items: center !important;
                justify-content: space-between !important;
            `;

            const submitBtn = document.createElement('button');
            submitBtn.type = 'button';
            submitBtn.textContent = '确认打印';
            submitBtn.style.cssText = `
                flex: 1 !important;
                padding: 10px 16px !important;
                background: rgba(76, 175, 80, 0.9) !important;
                color: white !important;
                border: none !important;
                border-radius: 8px !important;
                cursor: pointer !important;
                font-size: 14px !important;
                font-weight: 500 !important;
                text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.2) !important;
                transition: background 0.3s, transform 0.2s !important;
                backdrop-filter: blur(4px) !important;
                box-sizing: border-box !important;
                min-width: 0 !important;
            `;

            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.textContent = '取消';
            cancelBtn.style.cssText = `
                flex: 1 !important;
                padding: 10px 16px !important;
                background: rgba(244, 67, 54, 0.9) !important;
                color: white !important;
                border: none !important;
                border-radius: 8px !important;
                cursor: pointer !important;
                font-size: 14px !important;
                font-weight: 500 !important;
                text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.2) !important;
                transition: background 0.3s, transform 0.2s !important;
                backdrop-filter: blur(4px) !important;
                box-sizing: border-box !important;
                min-width: 0 !important;
            `;

            submitBtn.addEventListener('mouseenter', () => {
                submitBtn.style.background = 'rgba(76, 175, 80, 1)';
                submitBtn.style.transform = 'translateY(-1px)';
            });

            submitBtn.addEventListener('mouseleave', () => {
                submitBtn.style.background = 'rgba(76, 175, 80, 0.9)';
                submitBtn.style.transform = 'translateY(0)';
            });

            cancelBtn.addEventListener('mouseenter', () => {
                cancelBtn.style.background = 'rgba(244, 67, 54, 1)';
                cancelBtn.style.transform = 'translateY(-1px)';
            });

            cancelBtn.addEventListener('mouseleave', () => {
                cancelBtn.style.background = 'rgba(244, 67, 54, 0.9)';
                cancelBtn.style.transform = 'translateY(0)';
            });

            buttonContainer.appendChild(submitBtn);
            buttonContainer.appendChild(cancelBtn);
            form.appendChild(buttonContainer);

            dialog.appendChild(form);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            checkSettingsChange();

            submitBtn.addEventListener('click', () => {
                const settings = {
                    leftMargin: parseFloat(inputs['left-margin'].value) || 5,
                    rightMargin: parseFloat(inputs['right-margin'].value) || 5,
                    topMargin: parseFloat(inputs['top-margin'].value) || 3,
                    bottomMargin: parseFloat(inputs['bottom-margin'].value) || 3,
                    lineSpacing: parseFloat(inputs['line-spacing'].value) || 0
                };
                savePrintSettings(settings);
                inputCallback(settings);
                document.body.removeChild(overlay);
            });

            cancelBtn.addEventListener('click', () => {
                document.body.removeChild(overlay);
            });
        };

        // 创建打印按钮
        createPrintButton = function() {
            const btn = document.createElement('button');
            btn.textContent = '🎼智能打印';
            btn.style.cssText = `
                padding: 8px 12px;
                background: rgba(76, 175, 80, 0.9);
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.2);
                transition: background 0.3s, transform 0.2s;
                margin-top: 8px;
                width: 100%;
            `;

            btn.addEventListener('mouseenter', () => {
                btn.style.background = 'rgba(76, 175, 80, 1)';
                btn.style.transform = 'translateY(-1px)';
            });

            btn.addEventListener('mouseleave', () => {
                btn.style.background = 'rgba(76, 175, 80, 0.9)';
                btn.style.transform = 'translateY(0)';
            });

            btn.addEventListener('click', handlePrint);
            return btn;
        };

        // 处理打印逻辑
        handlePrint = function() {
            createPrintDialog((inputValues) => {
                const printArea = document.querySelector('#nier-scroll-view > div > div > div.at-surface');
                if (!printArea) {
                    console.error('未找到目标打印区域');
                    showNotification('错误', '未找到目标打印区域', 'error');
                    return;
                }
                const printContainer = document.createElement('div');
                printContainer.id = 'temp-print-container';
                printContainer.style.cssText = `
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: auto;
                    background: #fff;
                    z-index: 99999;
                    overflow: visible;
                    margin: 0;
                    padding: 0;
                    display: none;
                `;
                const clonedArea = printArea.cloneNode(true);

                const pagedContent = pageBySVGElements(
                    clonedArea,
                    inputValues.lineSpacing,
                    inputValues.leftMargin,
                    inputValues.rightMargin,
                    inputValues.topMargin,
                    inputValues.bottomMargin-80
                );

                if (shouldInvertByFirstSVGText()) {
                    pagedContent.classList.add('needs-invert');
                }
                printContainer.appendChild(pagedContent);

                const watermark = document.createElement('div');
                watermark.id = 'print-watermark';
                watermark.style.cssText = `
                    text-align: center;
                    font-size: 12px;
                    color: #888;
                    margin-top: 10px;
                    page-break-before: avoid;
                `;

                if (pagedContent.children.length > 0) {
                    const lastPage = pagedContent.lastChild;
                    if (lastPage && lastPage.querySelector('.safe-area')) {
                        lastPage.querySelector('.safe-area').appendChild(watermark);
                    } else {
                        pagedContent.appendChild(watermark);
                    }
                }

                const style = document.createElement('style');
                style.setAttribute('media', 'print');
                style.textContent = `
                    body > *:not(#temp-print-container) {
                        display: none !important;
                    }
                    #temp-print-container {
                        position: absolute !important;
                        top: 0 !important;
                        left: 0 !important;
                        width: 100% !important;
                        background: #fff !important;
                        z-index: 99999;
                    }
                    .print-page {
                        width: 100%;
                        height: 297mm;
                        position: relative;
                        page-break-after: always;
                        box-sizing: border-box;
                        background: #fff !important;
                        overflow: visible !important;
                        display: flex;
                        flex-direction: column;
                        justify-content: flex-start;
                    }
                    .print-page:last-child {
                        page-break-after: avoid !important;
                    }
                    .print-header {
                        position: absolute;
                        top: 0;
                        left: 0;
                        right: 0;
                        width: 100%;
                        text-align: center;
                        font-size: 20px;
                        font-weight: bold;
                        color: #222 !important;
                        height: 12mm;
                        line-height: 12mm;
                        background: #fff !important;
                        z-index: 10;
                        page-break-before: avoid;
                        border: none !important;
                        box-shadow: none !important;
                        backdrop-filter: none !important;
                        font-family: 'Inter', 'PingFang SC', 'Helvetica Neue', Arial, sans-serif;
                        letter-spacing: 0.5px;
                        margin: 0 !important;
                        padding: 0 !important;
                    }
                    .safe-area {
                        width: calc(100% - (${inputValues.leftMargin}mm + ${inputValues.rightMargin}mm)) !important;
                        margin-left: ${inputValues.leftMargin}mm !important;
                        margin-right: ${inputValues.rightMargin}mm !important;
                        margin-top: ${inputValues.topMargin}mm !important;
                        margin-bottom: ${inputValues.bottomMargin}mm !important;
                        position: relative !important;
                        box-sizing: border-box;
                        background: #fff !important;
                        overflow: visible !important;
                        border-radius: 0 !important;
                        box-shadow: none !important;
                        backdrop-filter: none !important;
                    }
                    .measure {
                        width: 100% !important;
                        height: auto !important;
                        margin-bottom: ${inputValues.lineSpacing}mm !important;
                        position: relative !important;
                        background: transparent !important;
                    }
                    .measure, svg {
                        page-break-inside: avoid !important;
                        display: block !important;
                    }
                    .needs-invert .measure svg {
                        filter: invert(100%) hue-rotate(180deg) !important;
                    }
                    style {
                        display: none !important;
                    }
                    @page {
                        margin: 0;
                        size: A4;
                    }
                    body, html {
                        margin: 0 !important;
                        padding: 0 !important;
                        background: #fff !important;
                    }
                    .print-footer-custom {
                        position: absolute;
                        left: 0;
                        right: 0;
                        bottom: -50mm;
                        height: 12mm;
                        width: 100%;
                        z-index: 2147483647;
                        pointer-events: none;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 12px;
                        color: #888;
                        font-family: 'Inter', 'PingFang SC', 'Helvetica Neue', Arial, sans-serif;
                        background: transparent !important;
                        box-sizing: border-box;
                    }
                    .footer-center {
                        flex: 1;
                        text-align: center;
                        font-size: 12px;
                        color: #888;
                        font-family: inherit;
                        pointer-events: none;
                    }
                    .footer-right {
                        width: 80px;
                        text-align: right;
                        font-size: 12px;
                        color: #888;
                        font-family: inherit;
                        margin-right: 12mm;
                        pointer-events: none;
                    }
                `;
                document.head.appendChild(style);
                document.body.appendChild(printContainer);

                printContainer.style.display = 'block';

                const progressIndicator = createProgressIndicator();
                document.body.appendChild(progressIndicator);

                const scrollPosition = {
                    x: window.scrollX,
                    y: window.scrollY
                };

                setTimeout(() => {
                    try {
                        window.print();
                        showNotification('提示', '打印操作已启动', 'info');
                    } catch (error) {
                        console.error('打印失败:', error);
                        showNotification('错误', '打印操作失败', 'error');
                    } finally {
                        setTimeout(() => {
                            cleanup();
                        }, 3000);
                    }
                }, 300);

                function cleanup() {
                    if (printContainer.parentNode) {
                        document.body.removeChild(printContainer);
                    }
                    if (style.parentNode) {
                        document.head.removeChild(style);
                    }
                    if (progressIndicator.parentNode) {
                        document.body.removeChild(progressIndicator);
                    }
                    window.scrollTo(scrollPosition.x, scrollPosition.y);
                    const originalContent = document.querySelector('#nier-scroll-view > div > div > div.at-surface');
                    if (originalContent) {
                        originalContent.classList.remove('needs-invert');
                        const svgs = originalContent.querySelectorAll('svg');
                        svgs.forEach(svg => {
                            svg.style.filter = 'none';
                        });
                    }
                }

                const printListener = () => {
                    cleanup();
                    window.removeEventListener('afterprint', printListener);
                };

                window.addEventListener('afterprint', printListener);
            });
        };

        // 分页处理函数
        pageBySVGElements = function(container, lineSpacing, leftMargin, rightMargin, topMargin, bottomMargin) {
            const svgElements = Array.from(container.querySelectorAll('svg'));
            if (svgElements.length === 0) return container;

            const pageContainer = document.createElement('div');
            const HEADER_HEIGHT_MM = 12;
            const PAGE_HEIGHT_MM = 297 - HEADER_HEIGHT_MM - topMargin - bottomMargin;
            const PAGE_HEIGHT_PX = PAGE_HEIGHT_MM * 3.78; // 1mm ≈ 3.78px

            let tempPages = [];
            let tempPage = [];
            let tempHeight = 0;

            svgElements.forEach((svg, idx) => {
                const wrapper = document.createElement('div');
                wrapper.className = 'measure';
                wrapper.appendChild(svg.cloneNode(true));
                wrapper.style.marginBottom = `${lineSpacing}mm`;
                wrapper.style.display = 'block';
                wrapper.style.background = 'transparent';
                wrapper.style.visibility = 'hidden';
                wrapper.style.position = 'absolute';
                wrapper.style.left = '-9999px';
                document.body.appendChild(wrapper);
                const h = wrapper.getBoundingClientRect().height;
                document.body.removeChild(wrapper);

                if (tempHeight + h > PAGE_HEIGHT_PX && tempPage.length > 0) {
                    tempPages.push(tempPage);
                    tempPage = [];
                    tempHeight = 0;
                }
                tempPage.push(svg);
                tempHeight += h;
            });
            if (tempPage.length > 0) tempPages.push(tempPage);

            let title = document.title || '乐谱';
            const totalPages = tempPages.length;

            tempPages.forEach((svgGroup, pageIndex) => {
                const page = createNewPage(pageIndex < tempPages.length - 1);

                // 页眉
                const header = document.createElement('div');
                header.className = 'print-header glass-header';
                header.textContent = title;
                header.style.height = `12mm`;
                header.style.lineHeight = `12mm`;
                page.appendChild(header);

                // 安全区
                const safeArea = document.createElement('div');
                safeArea.className = 'safe-area glass-area';
                safeArea.style.marginLeft = `${leftMargin}mm`;
                safeArea.style.marginRight = `${rightMargin}mm`;
                safeArea.style.marginTop = `${topMargin}mm`;
                safeArea.style.marginBottom = `${bottomMargin}mm`;
                safeArea.style.overflow = 'hidden';
                safeArea.style.display = 'flex';
                safeArea.style.flexDirection = 'column';

                svgGroup.forEach(svg => {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'measure';
                    wrapper.appendChild(svg.cloneNode(true));
                    wrapper.style.marginBottom = `${lineSpacing}mm`;
                    wrapper.style.display = 'block';
                    safeArea.appendChild(wrapper);
                });
                page.appendChild(safeArea);

                // 页脚水印和页码
                const footer = document.createElement('div');
                footer.className = 'print-footer-custom';
                footer.innerHTML = `
                    <div class="footer-center">🎵Code By Gavi</div>
                    <div class="footer-right">${pageIndex + 1} / ${totalPages}</div>
                `;
                page.appendChild(footer);

                pageContainer.appendChild(page);
            });

            return pageContainer;
        };

        createNewPage = function(addPageBreak) {
            const page = document.createElement('div');
            page.className = 'print-page';
            page.style.cssText = `
                width: 100%;
                height: 297mm;
                position: relative;
                page-break-after: ${addPageBreak ? 'always' : 'auto'};
            `;
            return page;
        };

        // 颜色反色判断
        shouldInvertByFirstSVGText = function() {
            try {
                const firstText = document.querySelector('#nier-scroll-view > div > div > div.at-surface > svg:nth-child(1) > text:nth-child(1)');
                if (!firstText) return false;
                
                const fillColor = firstText.getAttribute('fill') || getComputedStyle(firstText).fill;
                const normalizedColor = normalizeColor(fillColor);
                
                return normalizedColor === 'rgb(255,255,255)' || getColorLuminance(normalizedColor) > 0.7;
            } catch (error) {
                console.error('判断反色失败:', error);
                return false;
            }
        };

        normalizeColor = function(color) {
            if (!color || color === 'none') return null;
            if (color.startsWith('rgb')) {
                const rgb = color.match(/\d+/g).map(Number);
                return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
            }
            if (color.startsWith('#')) {
                const hex = color.substring(1);
                let r, g, b;
                if (hex.length === 3) {
                    r = parseInt(hex[0] + hex[0], 16);
                    g = parseInt(hex[1] + hex[1], 16);
                    b = parseInt(hex[2] + hex[2], 16);
                } else {
                    r = parseInt(hex.substring(0, 2), 16);
                    g = parseInt(hex.substring(2, 4), 16);
                    b = parseInt(hex.substring(4, 6), 16);
                }
                return `rgb(${r},${g},${b})`;
            }
            const namedColors = {
                'black': 'rgb(0,0,0)',
                'white': 'rgb(255,255,255)',
                'gray': 'rgb(128,128,128)'
            };
            return namedColors[color] || null;
        };

        getColorLuminance = function(color) {
            if (!color) return 0;
            const rgb = color.match(/\d+/g).map(Number);
            if (!rgb || rgb.length < 3) return 0;
            return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
        };

        // 创建解锁状态提示
        createUnlockStatus = function(targetHeight) {
            const status = document.createElement('div');
            status.id = 'unlock-status';
            status.style.cssText = `
                padding: 0 12px;
                background: rgba(76, 175, 80, 0.9);
                color: #fff;
                font-size: 14px;
                border-radius: 6px;
                z-index: 9998;
                backdrop-filter: blur(12px);
                text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.2);
                cursor: pointer;
                transition: transform 0.2s, background 0.3s, color 0.3s;
                display: flex;
                align-items: center;
                margin-right: 0;
                border: 1px solid rgba(255, 255, 255, 0.1);
                height: ${targetHeight}px;
                box-sizing: border-box;
                white-space: nowrap;
            `;
            status.innerHTML = '🎼已解锁有声谱';
            status.isClicked = false;
            
            status.addEventListener('click', () => {
                status.isClicked = !status.isClicked;
                if (status.isClicked) {
                    status.innerHTML = '🎵By Gavi';
                    status.style.background = 'rgba(142, 36, 170, 0.9)';
                } else {
                    status.innerHTML = '🎼已解锁有声谱';
                    status.style.background = 'rgba(76, 175, 80, 0.9)';
                }
            });
            
            status.addEventListener('mouseenter', () => {
                status.style.transform = 'translateY(-1px)';
            });
            
            status.addEventListener('mouseleave', () => {
                status.style.transform = 'translateY(0)';
            });
            
            return status;
        };
    }

    // --------------------------
    // 公共函数
    // --------------------------
    function createProgressIndicator() {
        const indicator = document.createElement('div');
        indicator.id = 'print-progress-indicator';
        indicator.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 16px 24px;
            border-radius: 8px;
            z-index: 999999;
            display: flex;
            align-items: center;
            backdrop-filter: blur(8px);
            font-size: 16px;
        `;
        
        indicator.innerHTML = `
            <div class="spinner" style="width: 20px; height: 20px; border: 3px solid #f3f3f3; border-radius: 50%; border-top: 3px solid #4CAF50; animation: spin 1s linear infinite; margin-right: 12px;"></div>
            <span>正在准备打印...</span>
        `;
        
        const style = document.createElement('style');
        style.textContent = `
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
        
        return indicator;
    }

    function showNotification(title, message, type = 'info') {
        const notification = document.createElement('div');
        const colors = {
            info: 'rgba(33, 150, 243, 0.9)',
            success: 'rgba(76, 175, 80, 0.9)',
            error: 'rgba(244, 67, 54, 0.9)',
            warning: 'rgba(255, 152, 0, 0.9)'
        };
        
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${colors[type]};
            color: white;
            padding: 12px 16px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            z-index: 999999;
            display: flex;
            align-items: center;
            opacity: 0;
            transform: translateY(-10px);
            transition: opacity 0.3s, transform 0.3s;
            max-width: 300px;
        `;
        
        notification.innerHTML = `
            <div style="margin-right: 10px; font-size: 18px;">
                ${type === 'info' ? 'ℹ️' : type === 'success' ? '✅' : type === 'error' ? '❌' : '⚠️'}
            </div>
            <div>
                <div style="font-weight: bold; margin-bottom: 2px;">${title}</div>
                <div>${message}</div>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // 使用requestAnimationFrame实现延迟，避免使用被覆盖的setTimeout
        function delay(ms) {
            return new Promise(resolve => {
                const start = Date.now();
                function check() {
                    if (Date.now() - start >= ms) {
                        resolve();
                    } else {
                        requestAnimationFrame(check);
                    }
                }
                check();
            });
        }
        
        // 显示弹窗
        delay(10).then(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateY(0)';
        });
        
        // 3秒后隐藏弹窗
        delay(3000).then(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateY(-10px)';
            
            // 等待动画完成后移除元素
            delay(300).then(() => {
                if (notification.parentNode) {
                    document.body.removeChild(notification);
                }
            });
        });
    }

    function waitFor(selector, callback, timeout = 5000) {
        const start = Date.now();
        const check = () => {
            if (Date.now() - start > timeout) {
                console.error(`等待元素 ${selector} 超时`);
                return;
            }
            const el = document.querySelector(selector);
            el ? callback(el) : requestAnimationFrame(check);
        };
        check();
    }

    function blockInterceptedRequests() {
        try {
            // 拦截 fetch 请求
            const originalFetch = unsafeWindow.fetch;
            unsafeWindow.fetch = function(url, options) {
                if (url.includes('mcs.zijieapi.com') || url.includes('sentry.io')) {
                    return Promise.resolve(new Response(JSON.stringify({}), { 
                        status: 200, 
                        headers: { 'Content-Type': 'application/json' }
                    }));
                }
                return originalFetch.apply(this, arguments);
            };
            
            // 拦截 XMLHttpRequest 请求
            const originalXhrOpen = unsafeWindow.XMLHttpRequest.prototype.open;
            unsafeWindow.XMLHttpRequest.prototype.open = function(method, url) {
                if (url.includes('mcs.zijieapi.com') || url.includes('sentry.io')) {
                    this._blocked = true;
                    this.addEventListener('readystatechange', () => {
                        if (this.readyState === 4) {
                            this.status = 200;
                            this.statusText = 'OK';
                            this.responseText = JSON.stringify({});
                        }
                    });
                }
                return originalXhrOpen.apply(this, arguments);
            };
            
        } catch (error) {
            console.error('添加网络请求拦截器失败:', error);
        }
    }

    // --------------------------
    // 初始化函数
    // --------------------------
    function init() {
        try {
            if (isViewPage) {
                unlockSpectrum();
                
                // 等待目标元素加载完成
                const printButtonSelectors = [
                    '#c > div > div.layout.svelte-6ag0p0.nier > div.side.svelte-6ag0p0 > section.control.svelte-8xk2fn > div:nth-child(2)',
                    '.control > div:nth-child(2)',
                    '.control-panel > div',
                    '.side section > div',
                    '#c .side section > div'
                ];
                
                let printButtonAdded = false;
                
                for (const selector of printButtonSelectors) {
                    if (!printButtonAdded) {
                        waitFor(selector, (target) => {
                            if (!printButtonAdded) {
                                const printBtn = createPrintButton();
                                target.parentNode.insertBefore(printBtn, target.nextSibling);
                                printButtonAdded = true;
                            }
                        }, 3000);
                    }
                }
                
                // 如果所有选择器都失败，尝试直接在侧边栏添加按钮
                setTimeout(() => {
                    if (!printButtonAdded) {
                        const sidePanel = document.querySelector('.side, #c .side');
                        if (sidePanel) {
                            const printBtn = createPrintButton();
                            printBtn.style.cssText += `
                                position: relative !important;
                                z-index: 9999 !important;
                                margin: 10px auto !important;
                                display: block !important;
                            `;
                            sidePanel.appendChild(printBtn);
                            printButtonAdded = true;
                        }
                    }
                }, 4000);
                
                // 等待播放器区域加载完成
                waitFor('.right-buttons.svelte-uqhx9v', (target) => {
                    const targetHeight = target.offsetHeight;
                    const unlockStatus = createUnlockStatus(targetHeight);
                    target.parentNode.insertBefore(unlockStatus, target);
                    
                    const playerPanel = document.querySelector('#c > div > div.layout.svelte-6ag0p0.nier > div.main.svelte-6ag0p0 > div.panel.svelte-uqhx9v > div.player-panel.svelte-uqhx9v');
                    if (playerPanel) {
                        playerPanel.style.cssText = `
                            background: rgba(255, 255, 255, 0.05) !important;
                            backdrop-filter: blur(12px) !important;
                            border: 1px solid rgba(255, 255, 255, 0.1) !important;
                            position: relative !important;
                            z-index: 1 !important;
                        `;
                    }
                });
                
                showNotification('提示', '有谱么智能助手已加载', 'info');
            } else if (isExplorePage) {
                handleCopyright();
                showNotification('版权信息处理', '已完成下架曲谱处理', 'info');
            }
            
            blockInterceptedRequests();
            
        } catch (error) {
            console.error('初始化失败:', error);
            showNotification('错误', '助手初始化失败', 'error');
        }
    }

    // 初始化脚本
    init();

})();