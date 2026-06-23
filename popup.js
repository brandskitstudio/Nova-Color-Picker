// ============================================================
// Nova Color Picker – popup.js
// ============================================================

document.addEventListener('DOMContentLoaded', () => {

    // ════════════════════════════════════════════════════════
    // 1. GLOBAL STATE
    // ════════════════════════════════════════════════════════
    let currentPickedColor = '#6366F1';

    // ════════════════════════════════════════════════════════
    // 2. SHARED DOM REFS
    // ════════════════════════════════════════════════════════
    const tabs         = document.querySelectorAll('.tab');
    const sections     = document.querySelectorAll('.tab-content');
    const toast        = document.getElementById('toast');
    const clearHistBtn = document.getElementById('clear-history');
    const historyList  = document.getElementById('history-list');

    // ════════════════════════════════════════════════════════
    // 3. TAB SWITCHING
    // ════════════════════════════════════════════════════════
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));
            tab.classList.add('active');
            const section = document.getElementById('tab-' + tab.dataset.tab);
            if (section) section.classList.add('active');
            if (tab.dataset.tab === 'panel') initPanel();
        });
    });

    // ════════════════════════════════════════════════════════
    // 4. PICKER TAB
    // ════════════════════════════════════════════════════════
    const pickBtn        = document.getElementById('pick-btn');
    const colorCard      = document.getElementById('color-card');
    const pickerEmpty    = document.getElementById('picker-empty');
    const mainPreview    = document.getElementById('main-preview');
    const colorNameEl    = document.getElementById('color-name');
    const colorLuminance = document.getElementById('color-luminance');
    const hexValue       = document.getElementById('hex-value');
    const rgbValue       = document.getElementById('rgb-value');
    const hslValue       = document.getElementById('hsl-value');
    const hsbValue       = document.getElementById('hsb-value');

    pickBtn.addEventListener('click', async () => {
        if (!window.EyeDropper) {
            alert('EyeDropper API not supported in this browser.');
            return;
        }
        try {
            const result = await new EyeDropper().open();
            const hex = result.sRGBHex.toUpperCase();
            setPickerColor(hex);
            addToHistory(hex);
            copyToClipboard(hex);
        } catch (e) { /* user cancelled */ }
    });

    function setPickerColor(hex) {
        currentPickedColor = hex;
        colorCard.classList.remove('hidden');
        pickerEmpty.classList.add('hidden');

        mainPreview.style.background = hex;
        colorNameEl.textContent = hex;

        const rgb = hexToRgb(hex);
        const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
        const hsb = rgbToHsb(rgb.r, rgb.g, rgb.b);
        const lum = luminance(rgb.r, rgb.g, rgb.b);

        colorLuminance.textContent = `Luminance: ${(lum * 100).toFixed(1)}%`;
        hexValue.textContent  = hex;
        rgbValue.textContent  = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
        hslValue.textContent  = `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
        hsbValue.textContent  = `hsb(${hsb.h}, ${hsb.s}%, ${hsb.b}%)`;
    }

    // Copy buttons
    document.querySelectorAll('.copy-btn[data-target]').forEach(btn => {
        btn.addEventListener('click', () => {
            const el = document.getElementById(btn.dataset.target);
            if (el) copyToClipboard(el.textContent, btn);
        });
    });

    // ════════════════════════════════════════════════════════
    // 5. HISTORY TAB
    // ════════════════════════════════════════════════════════
    clearHistBtn.addEventListener('click', () => {
        chrome.storage.local.set({ colorHistory: [] }, renderHistory);
    });

    function addToHistory(hex) {
        chrome.storage.local.get(['colorHistory'], result => {
            let history = result.colorHistory || [];
            history = history.filter(c => c !== hex);
            history.unshift(hex);
            if (history.length > 30) history.pop();
            chrome.storage.local.set({ colorHistory: history }, renderHistory);
        });
    }

    function renderHistory() {
        chrome.storage.local.get(['colorHistory'], result => {
            const history = result.colorHistory || [];
            historyList.innerHTML = '';

            if (history.length === 0) {
                historyList.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">🕐</div>
                        <p>No colors saved yet.<br>Start picking colors!</p>
                    </div>`;
                return;
            }

            history.forEach((hex, idx) => {
                const rgb  = hexToRgb(hex);
                const item = document.createElement('div');
                item.className = 'history-item';
                item.innerHTML = `
                    <div class="h-swatch" style="background:${hex}"></div>
                    <div class="h-info">
                        <div class="h-hex">${hex}</div>
                        <div class="h-rgb">rgb(${rgb.r}, ${rgb.g}, ${rgb.b})</div>
                    </div>
                    <div class="h-actions">
                        <button class="h-copy-btn">Copy</button>
                        <button class="h-del-btn">✕</button>
                    </div>`;

                item.querySelector('.h-copy-btn').addEventListener('click', e => {
                    e.stopPropagation();
                    copyToClipboard(hex);
                });
                item.querySelector('.h-del-btn').addEventListener('click', e => {
                    e.stopPropagation();
                    chrome.storage.local.get(['colorHistory'], r => {
                        const h = (r.colorHistory || []).filter((_, i) => i !== idx);
                        chrome.storage.local.set({ colorHistory: h }, renderHistory);
                    });
                });
                item.addEventListener('click', () => {
                    setPickerColor(hex);
                    tabs[0].click();
                });
                historyList.appendChild(item);
            });
        });
    }

    renderHistory();

    // ════════════════════════════════════════════════════════
    // 6. PANEL TAB  (professional color picker)
    // ════════════════════════════════════════════════════════
    let panelH = 240, panelS = 0.63, panelV = 0.60;
    let panelCurrentColor = '#6366F1';
    let isDraggingSpectrum = false, isDraggingHue = false;
    let panelInited = false;

    function initPanel() {
        if (panelInited) { renderPanel(); return; }
        panelInited = true;
        drawSpectrum();
        drawHueSlider();
        renderPanel();
    }

    const spectrumCanvas  = document.getElementById('color-spectrum');
    const hueCanvas       = document.getElementById('hue-slider');
    const specCursor      = document.getElementById('spectrum-cursor');
    const hueCursorEl     = document.getElementById('hue-cursor');
    const panelNewPreview = document.getElementById('panel-new-preview');
    const panelCurPreview = document.getElementById('panel-cur-preview');
    const panelHexInput   = document.getElementById('panel-hex-input');
    const panelCopyBtn    = document.getElementById('panel-copy-btn');
    const fieldH          = document.getElementById('field-h');
    const fieldS          = document.getElementById('field-s');
    const fieldB          = document.getElementById('field-b');
    const fieldR          = document.getElementById('field-r');
    const fieldG          = document.getElementById('field-g');
    const fieldBB         = document.getElementById('field-bb');

    function drawSpectrum() {
        const ctx = spectrumCanvas.getContext('2d');
        const w = spectrumCanvas.width, h = spectrumCanvas.height;
        const hGrad = ctx.createLinearGradient(0, 0, w, 0);
        hGrad.addColorStop(0, '#fff');
        hGrad.addColorStop(1, `hsl(${panelH},100%,50%)`);
        ctx.fillStyle = hGrad;
        ctx.fillRect(0, 0, w, h);
        const vGrad = ctx.createLinearGradient(0, 0, 0, h);
        vGrad.addColorStop(0, 'rgba(0,0,0,0)');
        vGrad.addColorStop(1, '#000');
        ctx.fillStyle = vGrad;
        ctx.fillRect(0, 0, w, h);
    }

    function drawHueSlider() {
        const ctx = hueCanvas.getContext('2d');
        const w = hueCanvas.width, h = hueCanvas.height;
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        for (let i = 0; i <= 360; i += 30) {
            grad.addColorStop(i / 360, `hsl(${i},100%,50%)`);
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
    }

    function renderPanel() {
        const rgb = hsvToRgb(panelH, panelS, panelV);
        const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
        const hsb = rgbToHsb(rgb.r, rgb.g, rgb.b);

        panelNewPreview.style.background = hex;
        panelCurPreview.style.background = panelCurrentColor;

        if (document.activeElement !== panelHexInput)
            panelHexInput.value = hex.replace('#', '');
        if (document.activeElement !== fieldH)  fieldH.value  = hsb.h;
        if (document.activeElement !== fieldS)  fieldS.value  = hsb.s;
        if (document.activeElement !== fieldB)  fieldB.value  = hsb.b;
        if (document.activeElement !== fieldR)  fieldR.value  = rgb.r;
        if (document.activeElement !== fieldG)  fieldG.value  = rgb.g;
        if (document.activeElement !== fieldBB) fieldBB.value = rgb.b;

        const sw = spectrumCanvas.offsetWidth  || spectrumCanvas.width;
        const sh = spectrumCanvas.offsetHeight || spectrumCanvas.height;
        specCursor.style.left = (panelS * sw) + 'px';
        specCursor.style.top  = ((1 - panelV) * sh) + 'px';

        const hh = hueCanvas.offsetHeight || hueCanvas.height;
        hueCursorEl.style.top = ((panelH / 360) * hh) + 'px';
    }

    // Spectrum drag
    function applySpectrumDrag(e) {
        const rect = spectrumCanvas.getBoundingClientRect();
        panelS = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        panelV = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
        renderPanel();
    }
    spectrumCanvas.addEventListener('mousedown', e => {
        isDraggingSpectrum = true;
        applySpectrumDrag(e);
        e.preventDefault();
    });

    // Hue drag (vertical)
    function applyHueDrag(e) {
        const rect = hueCanvas.getBoundingClientRect();
        panelH = Math.max(0, Math.min(360, ((e.clientY - rect.top) / rect.height) * 360));
        drawSpectrum();
        renderPanel();
    }
    hueCanvas.addEventListener('mousedown', e => {
        isDraggingHue = true;
        applyHueDrag(e);
        e.preventDefault();
    });

    document.addEventListener('mousemove', e => {
        if (isDraggingSpectrum) applySpectrumDrag(e);
        if (isDraggingHue) applyHueDrag(e);
    });
    document.addEventListener('mouseup', () => {
        isDraggingSpectrum = false;
        isDraggingHue = false;
    });

    // Numeric field inputs
    function applyHSBFields() {
        panelH = Math.max(0, Math.min(360, parseInt(fieldH.value)  || 0));
        panelS = Math.max(0, Math.min(100, parseInt(fieldS.value)  || 0)) / 100;
        panelV = Math.max(0, Math.min(100, parseInt(fieldB.value)  || 0)) / 100;
        drawSpectrum(); renderPanel();
    }
    function applyRGBFields() {
        const r = Math.max(0, Math.min(255, parseInt(fieldR.value)  || 0));
        const g = Math.max(0, Math.min(255, parseInt(fieldG.value)  || 0));
        const b = Math.max(0, Math.min(255, parseInt(fieldBB.value) || 0));
        const hsv = rgbToHsv(r, g, b);
        panelH = hsv.h; panelS = hsv.s; panelV = hsv.v;
        drawSpectrum(); renderPanel();
    }

    [fieldH, fieldS, fieldB].forEach(f  => f.addEventListener('input', applyHSBFields));
    [fieldR, fieldG, fieldBB].forEach(f => f.addEventListener('input', applyRGBFields));

    panelHexInput.addEventListener('input', () => {
        const v = panelHexInput.value.replace('#', '');
        if (/^[0-9A-Fa-f]{6}$/.test(v)) {
            const rgb = hexToRgb('#' + v);
            const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
            panelH = hsv.h; panelS = hsv.s; panelV = hsv.v;
            drawSpectrum(); renderPanel();
        }
    });

    panelCopyBtn.addEventListener('click', () => {
        const rgb = hsvToRgb(panelH, panelS, panelV);
        const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
        panelCurrentColor = hex;
        panelCurPreview.style.background = hex;
        copyToClipboard(hex);
    });

    // ════════════════════════════════════════════════════════
    // 7. GRADIENT TAB
    // ════════════════════════════════════════════════════════
    const gradientPreview = document.getElementById('gradient-preview');
    const stop0Swatch     = document.getElementById('stop0-swatch');
    const stop1Swatch     = document.getElementById('stop1-swatch');
    const stop0Input      = document.getElementById('stop0-input');
    const stop1Input      = document.getElementById('stop1-input');
    const gradientType    = document.getElementById('gradient-type');
    const gradientAngle   = document.getElementById('gradient-angle');
    const angleDisplay    = document.getElementById('angle-display');
    const gradientCss     = document.getElementById('gradient-css');
    const copyGradientBtn = document.getElementById('copy-gradient-css');

    function updateGradient() {
        const c0    = stop0Input.value;
        const c1    = stop1Input.value;
        const type  = gradientType.value;
        const angle = gradientAngle.value;
        let preview, css;

        if (type === 'linear') {
            preview = `linear-gradient(${angle}deg, ${c0}, ${c1})`;
            css     = `background: linear-gradient(${angle}deg, ${c0}, ${c1});`;
        } else {
            preview = `radial-gradient(circle, ${c0}, ${c1})`;
            css     = `background: radial-gradient(circle, ${c0}, ${c1});`;
        }

        gradientPreview.style.background = preview;
        gradientCss.textContent          = css;
        stop0Swatch.style.background     = c0;
        stop1Swatch.style.background     = c1;
    }

    [stop0Input, stop1Input].forEach(inp => inp.addEventListener('input', updateGradient));

    // Stop Pick buttons
    document.querySelectorAll('.stop-pick-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!window.EyeDropper) {
                alert('EyeDropper API not supported in this browser.');
                return;
            }
            try {
                const result = await new EyeDropper().open();
                const hex = result.sRGBHex.toUpperCase();
                const index = btn.dataset.index;
                const input = document.getElementById(`stop${index}-input`);
                if (input) {
                    input.value = hex;
                    updateGradient();
                }
            } catch (e) { /* user cancelled */ }
        });
    });

    gradientType.addEventListener('change', () => {
        const ag = document.getElementById('angle-group');
        if (ag) ag.style.display = gradientType.value === 'linear' ? 'flex' : 'none';
        updateGradient();
    });
    gradientAngle.addEventListener('input', () => {
        angleDisplay.textContent = gradientAngle.value + '°';
        updateGradient();
    });
    copyGradientBtn.addEventListener('click', () => copyToClipboard(gradientCss.textContent));
    updateGradient();

    // ════════════════════════════════════════════════════════
    // 8. UTILITIES
    // ════════════════════════════════════════════════════════
    function hexToRgb(hex) {
        hex = hex.replace('#', '');
        return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16)
        };
    }

    function rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
    }

    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h = 0, s = 0, l = (max + min) / 2;
        if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
    }

    function rgbToHsb(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
        let h = 0;
        if (d !== 0) {
            switch (max) {
                case r: h = ((g - b) / d % 6); break;
                case g: h = (b - r) / d + 2;   break;
                case b: h = (r - g) / d + 4;   break;
            }
        }
        return {
            h: Math.round(((h * 60) + 360) % 360),
            s: Math.round(max === 0 ? 0 : d / max * 100),
            b: Math.round(max * 100)
        };
    }

    function rgbToHsv(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
        let h = 0;
        if (d !== 0) {
            switch (max) {
                case r: h = ((g - b) / d % 6); break;
                case g: h = (b - r) / d + 2;   break;
                case b: h = (r - g) / d + 4;   break;
            }
            h = (h * 60 + 360) % 360;
        }
        return { h, s: max === 0 ? 0 : d / max, v: max };
    }

    function hsvToRgb(h, s, v) {
        const f = (n, k = (n + h / 60) % 6) => v - v * s * Math.max(Math.min(k, 4 - k, 1), 0);
        return {
            r: Math.round(f(5) * 255),
            g: Math.round(f(3) * 255),
            b: Math.round(f(1) * 255)
        };
    }

    function luminance(r, g, b) {
        return [r, g, b].reduce((sum, c, i) => {
            c /= 255;
            c = c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
            return sum + c * [0.2126, 0.7152, 0.0722][i];
        }, 0);
    }

    let toastTimer;
    function copyToClipboard(text, btn = null) {
        navigator.clipboard.writeText(text).then(() => {
            if (btn) {
                btn.classList.add('copied');
                setTimeout(() => btn.classList.remove('copied'), 1500);
            }
            clearTimeout(toastTimer);
            toast.classList.add('show');
            toastTimer = setTimeout(() => toast.classList.remove('show'), 2000);
        });
    }
});
