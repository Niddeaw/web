'use strict';

// =======================================================
// qr_tools.js — QR Code Tools Module (v1.3)
// -------------------------------------------------------
// ✅ Dual-library + Caption ใต้ QR (PNG/SVG/Print)
// ✅ ใช้ได้ทุก role / ไม่มี preset กลาง / History แยกตาม user
// Dependencies: node-qrcode OR qrcode-generator, Swal, dashboard_ui
// =======================================================

/* ============================================================
   1) STATE
   ============================================================ */
const QRH = {
    currentType: 'text',
    currentPayload: '',
    currentCaption: '',
    currentDataURL: null,
    currentSVG: null,
    currentOptions: { dark: '#0f172a', light: '#ffffff', size: 384, ecc: 'M' },
    historyKey: 'wrk_qr_history',
    maxHistory: 50
};

let currentUser = null;
let currentProfile = null;
let currentRole = 'teacher';
let currentViewRole = 'teacher';

/* ============================================================
   2) HELPERS
   ============================================================ */
const escHtml = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (m) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));

const escXml = (s) =>
    String(s ?? '').replace(/[<>&"']/g, (m) => ({
        '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;'
    }[m]));

function toast(icon, title) {
    if (typeof Swal === 'undefined') return;
    Swal.fire({
        toast: true, position: 'top-end', icon,
        title, showConfirmButton: false, timer: 1800, timerProgressBar: true
    });
}

function fmtDateTH(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '-';
    const M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
               'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${d.getDate()} ${M[d.getMonth()]} ${(d.getFullYear() + 543).toString().slice(-2)} ${hh}:${mm}`;
}

function typeMeta(type) {
    const map = {
        text:  { icon: 'fa-font',         color: '#6366f1', label: 'ข้อความ' },
        wifi:  { icon: 'fa-wifi',         color: '#0ea5e9', label: 'Wi-Fi' },
        vcard: { icon: 'fa-address-card', color: '#8b5cf6', label: 'นามบัตร' },
        phone: { icon: 'fa-phone',        color: '#10b981', label: 'เบอร์โทร' },
        email: { icon: 'fa-envelope',     color: '#f59e0b', label: 'อีเมล' }
    };
    return map[type] || { icon: 'fa-qrcode', color: '#64748b', label: 'QR' };
}

function escapeWifi(s) {
    return String(s ?? '').replace(/([\\;,:"])/g, '\\$1');
}

/* ============================================================
   3) QR LIBRARY LOADER (DUAL-LIBRARY)
   ============================================================ */
const QRLib = {
    _status: null,
    _loadingPromise: null,

    status() {
        if (this._status && this._status !== 'none') return this._status;
        if (typeof QRCode !== 'undefined' && typeof QRCode.toCanvas === 'function') {
            this._status = 'node-qrcode';
        } else if (typeof qrcode !== 'undefined' && typeof qrcode === 'function') {
            this._status = 'qrcode-generator';
        } else {
            this._status = 'none';
        }
        return this._status;
    },

    async ensure() {
        if (this.status() !== 'none') return true;
        if (this._loadingPromise) return this._loadingPromise;

        this._loadingPromise = (async () => {
            for (let i = 0; i < 30; i++) {
                await new Promise(r => setTimeout(r, 100));
                if (this.status() !== 'none') {
                    console.log(`✅ QR library พร้อมใช้: ${this._status}`);
                    return true;
                }
            }
            const fallbacks = [
                'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js',
                'https://unpkg.com/qrcode@1.5.3/build/qrcode.min.js',
                'https://cdn.skypack.dev/qrcode@1.5.3'
            ];
            for (const url of fallbacks) {
                try {
                    await this._loadScript(url);
                    if (typeof QRCode !== 'undefined' && typeof QRCode.toCanvas === 'function') {
                        this._status = 'node-qrcode';
                        console.log('✅ QRCode loaded from fallback:', url);
                        return true;
                    }
                } catch (e) {
                    console.warn('QR fallback failed:', url, e.message);
                }
            }
            return this.status() !== 'none';
        })();

        return this._loadingPromise;
    },

    _loadScript(url) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            const timer = setTimeout(() => reject(new Error('timeout')), 8000);
            s.src = url;
            s.crossOrigin = 'anonymous';
            s.onload = () => { clearTimeout(timer); resolve(); };
            s.onerror = () => { clearTimeout(timer); reject(new Error('load failed')); };
            document.head.appendChild(s);
        });
    },

    async toCanvas(canvas, text, options) {
        await this.ensure();
        const lib = this.status();
        if (lib === 'node-qrcode') return await QRCode.toCanvas(canvas, text, options);
        if (lib === 'qrcode-generator') return this._drawWithGenerator(canvas, text, options);
        throw new Error('ไม่พบ QR Library (ทั้ง node-qrcode และ qrcode-generator)');
    },

    async toString(text, options) {
        await this.ensure();
        const lib = this.status();
        if (lib === 'node-qrcode') return await QRCode.toString(text, { ...options, type: 'svg' });
        if (lib === 'qrcode-generator') return this._svgWithGenerator(text, options);
        throw new Error('ไม่พบ QR Library (ทั้ง node-qrcode และ qrcode-generator)');
    },

    _drawWithGenerator(canvas, text, options) {
        const { size = 384, dark = '#000', light = '#fff', ecc = 'M' } = options || {};
        const qr = this._makeGenerator(text, ecc);
        const moduleCount = qr.getModuleCount();
        const totalSize = size;
        const innerSize = totalSize - Math.max(16, Math.floor(totalSize * 0.08));
        const cellSize = Math.max(1, Math.floor(innerSize / moduleCount));
        const qrPixelSize = cellSize * moduleCount;
        const offset = Math.floor((totalSize - qrPixelSize) / 2);

        canvas.width = totalSize;
        canvas.height = totalSize;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = light;
        ctx.fillRect(0, 0, totalSize, totalSize);
        ctx.fillStyle = dark;
        for (let row = 0; row < moduleCount; row++) {
            for (let col = 0; col < moduleCount; col++) {
                if (qr.isDark(row, col)) {
                    ctx.fillRect(offset + col * cellSize, offset + row * cellSize, cellSize, cellSize);
                }
            }
        }
    },

    _svgWithGenerator(text, options) {
        const { size = 384, dark = '#000', light = '#fff', ecc = 'M' } = options || {};
        const qr = this._makeGenerator(text, ecc);
        const moduleCount = qr.getModuleCount();
        const cellSize = Math.max(2, Math.floor(size / (moduleCount + 8)));
        let svg = qr.createSvgTag({ cellSize, margin: cellSize * 2, scalable: true });
        svg = svg
            .replace(/fill="white"/gi, `fill="${light}"`)
            .replace(/fill="black"/gi, `fill="${dark}"`);
        return svg;
    },

    _makeGenerator(text, ecc) {
        const level = ['L', 'M', 'Q', 'H'].includes(ecc) ? ecc : 'M';
        const qr = qrcode(0, level);
        qr.addData(text);
        qr.make();
        return qr;
    }
};

/* ============================================================
   4) CAPTION HELPERS — wrap text (canvas + svg)
   ============================================================ */

/** ตัดข้อความเป็นหลายบรรทัด — รองรับไทย (ไม่มี space) */
function wrapTextLines(ctx, text, maxWidth) {
    const str = String(text || '').trim();
    if (!str) return [];

    // ถ้ามี space → word-based ก่อน, ไม่มี space → char-based
    const hasSpace = /\s/.test(str);

    if (!hasSpace) {
        const lines = [];
        let current = '';
        for (const ch of str) {
            if (current && ctx.measureText(current + ch).width > maxWidth) {
                lines.push(current);
                current = ch;
            } else {
                current += ch;
            }
        }
        if (current) lines.push(current);
        return lines;
    }

    const words = str.split(/\s+/);
    const lines = [];
    let current = '';

    for (const word of words) {
        const test = current ? current + ' ' + word : word;
        if (ctx.measureText(test).width <= maxWidth) {
            current = test;
        } else {
            if (current) lines.push(current);
            // word ยาวเกิน maxWidth → char break
            if (ctx.measureText(word).width > maxWidth) {
                let chunk = '';
                for (const ch of word) {
                    if (chunk && ctx.measureText(chunk + ch).width > maxWidth) {
                        lines.push(chunk);
                        chunk = ch;
                    } else {
                        chunk += ch;
                    }
                }
                current = chunk;
            } else {
                current = word;
            }
        }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [str];
}

/** ตัดข้อความสำหรับ SVG — ประมาณความกว้างตัวอักษร */
function wrapTextLinesSvg(text, maxWidth, fontSize) {
    const str = String(text || '').trim();
    if (!str) return [];

    const avgCharWidth = fontSize * 0.58;
    const maxChars = Math.max(6, Math.floor(maxWidth / avgCharWidth));
    if (str.length <= maxChars) return [str];

    const words = str.split(/\s+/);
    const lines = [];
    let current = '';

    for (const word of words) {
        const test = current ? current + ' ' + word : word;
        if (test.length <= maxChars) {
            current = test;
        } else {
            if (current) lines.push(current);
            if (word.length > maxChars) {
                let chunk = '';
                for (const ch of word) {
                    if (chunk && (chunk + ch).length > maxChars) {
                        lines.push(chunk);
                        chunk = ch;
                    } else {
                        chunk += ch;
                    }
                }
                current = chunk;
            } else {
                current = word;
            }
        }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [str];
}

/** สร้าง canvas ใหม่ = QR + caption ใต้ */
function buildCanvasWithCaption(qrCanvas, caption, size) {
    const padding = 16;
    const fontSize = Math.max(14, Math.min(28, Math.floor(size / 22)));
    const lineHeight = Math.round(fontSize * 1.45);
    const maxTextWidth = size - padding * 2;

    const measureCtx = document.createElement('canvas').getContext('2d');
    measureCtx.font = `600 ${fontSize}px Anuphan, sans-serif`;
    const lines = wrapTextLines(measureCtx, caption, maxTextWidth);

    const captionHeight = lines.length * lineHeight + padding * 2;
    const out = document.createElement('canvas');
    out.width = size;
    out.height = size + captionHeight;
    const ctx = out.getContext('2d');

    // พื้นหลัง
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);

    // QR
    ctx.drawImage(qrCanvas, 0, 0, size, size);

    // caption
    ctx.font = `600 ${fontSize}px Anuphan, sans-serif`;
    ctx.fillStyle = '#1e293b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    lines.forEach((line, i) => {
        const y = size + padding + lineHeight * (i + 0.5);
        ctx.fillText(line, size / 2, y);
    });

    return out;
}

/** สร้าง SVG ใหม่ = QR + caption ใต้ */
function buildSvgWithCaption(qrSvg, caption, size) {
    const padding = 16;
    const fontSize = Math.max(14, Math.min(28, Math.floor(size / 22)));
    const lineHeight = Math.round(fontSize * 1.45);
    const maxTextWidth = size - padding * 2;

    const lines = wrapTextLinesSvg(caption, maxTextWidth, fontSize);
    const captionHeight = lines.length * lineHeight + padding * 2;
    const totalHeight = size + captionHeight;

    // ดึง inner content
    const match = qrSvg.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i);
    const inner = match ? match[1] : qrSvg;

    const textLines = lines.map((line, i) => {
        const y = size + padding + lineHeight * (i + 0.5);
        return `<text x="${size / 2}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-family="Anuphan, sans-serif" font-size="${fontSize}" font-weight="600" fill="#1e293b">${escXml(line)}</text>`;
    }).join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${totalHeight}" viewBox="0 0 ${size} ${totalHeight}">
  <rect width="${size}" height="${totalHeight}" fill="#ffffff"/>
  <g>${inner}</g>
  ${textLines}
</svg>`;
}

/* ============================================================
   5) ROLE BADGE
   ============================================================ */
const ROLE_BADGE_MAP = {
    super_admin: { icon: 'fa-crown',           label: 'Super Admin',       bg: '#fef3c7', color: '#92400e' },
    admin:       { icon: 'fa-user-shield',     label: 'Admin',             bg: '#dbeafe', color: '#1e40af' },
    director:    { icon: 'fa-user-tie',        label: 'ผู้อำนวยการ',        bg: '#cffafe', color: '#155e75' },
    deputy:      { icon: 'fa-user-tie',        label: 'รอง ผอ.',            bg: '#e0f2fe', color: '#075985' },
    teacher:     { icon: 'fa-chalkboard-user', label: 'ครูผู้สอน',          bg: '#fce7f3', color: '#9f1239' },
    staff:       { icon: 'fa-user',            label: 'เจ้าหน้าที่',         bg: '#fef3c7', color: '#92400e' },
    office:      { icon: 'fa-briefcase',       label: 'เจ้าหน้าที่สำนักงาน', bg: '#dcfce7', color: '#166534' }
};

function renderRoleBadge(role) {
    const slot = document.getElementById('qrRoleBadge');
    if (!slot) return;
    const meta = ROLE_BADGE_MAP[role] || { icon: 'fa-user', label: role, bg: '#f1f5f9', color: '#475569' };
    slot.innerHTML = `<i class="fas ${meta.icon}"></i><span>${escHtml(meta.label)}</span>`;
    slot.style.cssText = `
        display:inline-flex;align-items:center;gap:6px;
        padding:5px 12px;border-radius:9999px;
        font-size:11px;font-weight:800;letter-spacing:.3px;
        background:${meta.bg};color:${meta.color};
        border:1px solid ${meta.color}22;
    `;
    slot.classList.remove('hidden');
}

/* ============================================================
   6) INIT
   ============================================================ */
window.addEventListener('load', async () => {
    try {
        const result = await checkSessionAndRole(MODULE_NAME, WRK_ROLES.ALLOWED);
        if (!result) return;

        currentUser     = result.personnel;
        currentProfile  = result.personnel;
        currentRole     = result.role;
        currentViewRole = result.isAdmin ? 'admin' : 'teacher';

        setUserDisplayName(currentProfile);
        updateUserRoleLabel(currentRole);
        renderUserAvatar(currentProfile);
        renderRoleBadge(currentRole);

        // ✅ แทรกช่อง caption ก่อน #qrFormContainer
        ensureCaptionField();

        const lib = QRLib.status();
        if (lib === 'none') {
            console.warn('⚠️ ยังไม่พบ QR Library — กำลังลอง CDN สำรอง...');
            QRLib.ensure().then(ok => {
                if (!ok) console.error('❌ QR Library ทั้งหมดโหลดไม่ได้');
            });
        } else {
            console.log(`✅ QR Library: ${lib}`);
        }

        bindTypeTabs();
        bindStyleControls();
        loadSavedStyle();
        renderForm('text');
        renderHistory();

        if (typeof logUserAction === 'function') {
            await logUserAction(`เข้าสู่ระบบ ${MODULE_NAME}`, MODULE_KEY);
        }
        console.log('✅ QR Module initialized');
    } catch (err) {
        console.error('❌ Init error:', err);
        if (typeof Swal !== 'undefined') Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    } finally {
        if (typeof restoreSidebarCollapse === 'function') restoreSidebarCollapse();
        document.getElementById('mainBody')?.classList.replace('opacity-0', 'opacity-100');
    }
});

/* ============================================================
   7) CAPTION FIELD (inject ก่อน form container)
   ============================================================ */
function ensureCaptionField() {
    if (document.getElementById('qrCaption')) return;
    const container = document.getElementById('qrFormContainer');
    if (!container) return;

    const wrap = document.createElement('div');
    wrap.className = 'qr-form-group';
    wrap.style.marginBottom = '18px';
    wrap.innerHTML = `
        <label>
            <i class="fas fa-tag" style="color:#6366f1;margin-right:4px;"></i>
            ข้อความกำกับใต้ QR (ไม่บังคับ)
        </label>
        <input type="text" id="qrCaption"
            placeholder="เช่น เว็บไซต์โรงเรียน / Wi-Fi ห้องพักครู / ไลน์กลุ่ม ม.4/1"
            maxlength="120" autocomplete="off">
        <div style="font-size:11px;color:#94a3b8;margin-top:4px;display:flex;align-items:center;gap:4px;">
            <i class="fas fa-info-circle"></i>
            ข้อความนี้จะปรากฏใต้ QR Code เมื่อดาวน์โหลดเป็นภาพหรือพิมพ์
        </div>
    `;
    container.parentNode.insertBefore(wrap, container);

    // live-update: พิมพ์ caption แล้ว re-generate ทันที (ถ้ามี QR อยู่แล้ว)
    document.getElementById('qrCaption').addEventListener('input', () => {
        if (QRH.currentPayload) generateQR();
    });
}

/* ============================================================
   8) TAB SWITCHING
   ============================================================ */
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach((el) => el.classList.add('hidden'));
    const target = document.getElementById('tab-' + tabId);
    if (target) target.classList.remove('hidden');

    const navMap = { generator: 'nav-generator', history: 'nav-history' };
    if (navMap[tabId] && typeof setActiveNavItem === 'function') {
        setActiveNavItem(navMap[tabId]);
    }

    const titles = {
        generator: MODULE_NAME + ' — สร้าง QR Code',
        history:   MODULE_NAME + ' — ประวัติ'
    };
    const titleEl = document.getElementById('pageTitle');
    if (titleEl) titleEl.textContent = titles[tabId] || MODULE_NAME;

    if (window.innerWidth < 761 && typeof toggleSidebar === 'function') {
        toggleSidebar(false);
    }
}

/* ============================================================
   9) BIND UI
   ============================================================ */
function bindTypeTabs() {
    const tabs = document.querySelectorAll('#qrTypeTabs .qr-type-tab');
    tabs.forEach((btn) => {
        btn.addEventListener('click', () => {
            tabs.forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            QRH.currentType = btn.dataset.type;
            QRH.currentPayload = '';
            QRH.currentDataURL = null;
            QRH.currentSVG = null;
            renderForm(QRH.currentType);
            resetPreview();
        });
    });
}

function bindStyleControls() {
    ['qrColorDark', 'qrColorLight', 'qrSize', 'qrECC'].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', () => {
            readOptions();
            saveStyle();
            if (QRH.currentPayload) generateQR();
        });
    });
}

function readOptions() {
    QRH.currentOptions = {
        dark:  document.getElementById('qrColorDark')?.value  || '#0f172a',
        light: document.getElementById('qrColorLight')?.value || '#ffffff',
        size:  parseInt(document.getElementById('qrSize')?.value || '384', 10),
        ecc:   document.getElementById('qrECC')?.value || 'M'
    };
    return QRH.currentOptions;
}

function styleStorageKey() {
    return `wrk_qr_style_${currentUser?.id || 'anon'}`;
}

function saveStyle() {
    try { localStorage.setItem(styleStorageKey(), JSON.stringify(QRH.currentOptions)); }
    catch { /* ignore */ }
}

function loadSavedStyle() {
    try {
        const raw = localStorage.getItem(styleStorageKey());
        if (!raw) return;
        const saved = JSON.parse(raw);
        const setVal = (id, v) => {
            const el = document.getElementById(id);
            if (el && v != null) el.value = v;
        };
        setVal('qrColorDark',  saved.dark);
        setVal('qrColorLight', saved.light);
        setVal('qrSize', String(saved.size));
        setVal('qrECC', saved.ecc);
        readOptions();
    } catch { /* ignore */ }
}

/* ============================================================
   10) FORMS
   ============================================================ */
function renderForm(type) {
    const container = document.getElementById('qrFormContainer');
    if (!container) return;

    const submitBtn = `
        <button onclick="QRModule.generateFromForm()"
            class="w-full px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition-colors">
            <i class="fas fa-bolt mr-1"></i> สร้าง QR Code
        </button>`;

    const forms = {
        text: `
            <div class="qr-form-group">
                <label>ข้อความ / URL</label>
                <textarea id="qrText" rows="3" placeholder="https://... หรือข้อความอะไรก็ได้"></textarea>
            </div>
            ${submitBtn}`,
        wifi: `
            <div class="qr-form-group">
                <label>ชื่อ Wi-Fi (SSID)</label>
                <input type="text" id="qrWifiSsid" placeholder="เช่น WRK-WiFi" autocomplete="off">
            </div>
            <div class="qr-form-group">
                <label>รหัสผ่าน</label>
                <input type="text" id="qrWifiPass" placeholder="รหัสผ่าน Wi-Fi" autocomplete="off">
            </div>
            <div class="qr-form-group">
                <label>ประเภทการเข้ารหัส</label>
                <select id="qrWifiEnc">
                    <option value="WPA">WPA / WPA2 / WPA3 (แนะนำ)</option>
                    <option value="WEP">WEP</option>
                    <option value="nopass">ไม่มีรหัสผ่าน</option>
                </select>
            </div>
            ${submitBtn}`,
        vcard: `
            <div class="grid grid-cols-2 gap-3">
                <div class="qr-form-group"><label>ชื่อ</label><input type="text" id="qrVcFirst" placeholder="สมชาย"></div>
                <div class="qr-form-group"><label>นามสกุล</label><input type="text" id="qrVcLast" placeholder="ใจดี"></div>
            </div>
            <div class="qr-form-group"><label>ตำแหน่ง</label><input type="text" id="qrVcTitle" placeholder="ครูผู้สอน"></div>
            <div class="qr-form-group"><label>โรงเรียน / หน่วยงาน</label><input type="text" id="qrVcOrg" placeholder="โรงเรียน..."></div>
            <div class="qr-form-group"><label>เบอร์โทร</label><input type="tel" id="qrVcPhone" placeholder="08x-xxx-xxxx"></div>
            <div class="qr-form-group"><label>อีเมล</label><input type="email" id="qrVcEmail" placeholder="name@school.ac.th"></div>
            ${submitBtn}`,
        phone: `
            <div class="qr-form-group"><label>เบอร์โทรศัพท์</label><input type="tel" id="qrPhone" placeholder="0812345678"></div>
            ${submitBtn}`,
        email: `
            <div class="qr-form-group"><label>อีเมล</label><input type="email" id="qrEmailTo" placeholder="name@school.ac.th"></div>
            <div class="qr-form-group"><label>หัวข้อ (Subject)</label><input type="text" id="qrEmailSubject" placeholder="ติดต่อสอบถาม"></div>
            ${submitBtn}`
    };

    container.innerHTML = forms[type] || forms.text;
}

/* ============================================================
   11) BUILD PAYLOAD
   ============================================================ */
function buildPayload(type) {
    const val = (id) => (document.getElementById(id)?.value || '').trim();

    switch (type) {
        case 'text': {
            const v = val('qrText');
            if (!v) throw new Error('กรุณากรอกข้อความหรือ URL');
            return v;
        }
        case 'wifi': {
            const ssid = val('qrWifiSsid');
            const pass = val('qrWifiPass');
            const enc  = val('qrWifiEnc') || 'WPA';
            if (!ssid) throw new Error('กรุณากรอกชื่อ Wi-Fi');
            if (enc !== 'nopass' && !pass) throw new Error('กรุณากรอกรหัสผ่าน Wi-Fi');
            return `WIFI:T:${enc};S:${escapeWifi(ssid)};P:${escapeWifi(pass)};;`;
        }
        case 'vcard': {
            const first = val('qrVcFirst');
            const last  = val('qrVcLast');
            if (!first) throw new Error('กรุณากรอกชื่อ');
            const lines = [
                'BEGIN:VCARD', 'VERSION:3.0',
                `N:${last};${first};;;`,
                `FN:${first} ${last}`.trim()
            ];
            if (val('qrVcTitle')) lines.push(`TITLE:${val('qrVcTitle')}`);
            if (val('qrVcOrg'))   lines.push(`ORG:${val('qrVcOrg')}`);
            if (val('qrVcPhone')) lines.push(`TEL;TYPE=CELL:${val('qrVcPhone')}`);
            if (val('qrVcEmail')) lines.push(`EMAIL:${val('qrVcEmail')}`);
            lines.push('END:VCARD');
            return lines.join('\n');
        }
        case 'phone': {
            const p = val('qrPhone').replace(/[^0-9+]/g, '');
            if (!p) throw new Error('กรุณากรอกเบอร์โทร');
            return `tel:${p}`;
        }
        case 'email': {
            const to = val('qrEmailTo');
            if (!to) throw new Error('กรุณากรอกอีเมล');
            const sub = val('qrEmailSubject');
            return `mailto:${to}${sub ? '?subject=' + encodeURIComponent(sub) : ''}`;
        }
        default:
            return '';
    }
}

/* ============================================================
   12) GENERATE QR
   ============================================================ */
async function generateQR() {
    const box = document.getElementById('qrPreviewBox');
    if (!box) return;

    if (!QRH.currentPayload) { resetPreview(); return; }

    const { dark, light, size, ecc } = QRH.currentOptions;
    const caption = (document.getElementById('qrCaption')?.value || '').trim();
    QRH.currentCaption = caption;

    box.innerHTML = `
        <div class="text-center text-slate-400">
            <i class="fas fa-circle-notch fa-spin text-3xl mb-2 text-indigo-400"></i>
            <p class="text-sm">กำลังสร้าง...</p>
        </div>`;

    try {
        // ===== 1) สร้าง QR ลง temp canvas =====
        const tmpCanvas = document.createElement('canvas');
        await QRLib.toCanvas(tmpCanvas, QRH.currentPayload, {
            width: size, margin: 2,
            color: { dark, light },
            errorCorrectionLevel: ecc
        });

        // ===== 2) ถ้ามี caption → สร้าง canvas ใหม่พร้อม caption =====
        const finalCanvas = caption
            ? buildCanvasWithCaption(tmpCanvas, caption, size)
            : tmpCanvas;

        finalCanvas.style.cssText = `
            max-width:100%;height:auto;border-radius:12px;
            background:#fff;padding:12px;
            box-shadow:0 8px 24px rgba(15,23,42,.08);
        `;

        box.innerHTML = '';
        box.appendChild(finalCanvas);
        QRH.currentDataURL = finalCanvas.toDataURL('image/png');

        // ===== 3) SVG =====
        try {
            let svgStr = await QRLib.toString(QRH.currentPayload, {
                width: size, margin: 2,
                color: { dark, light },
                errorCorrectionLevel: ecc
            });
            if (caption) {
                svgStr = buildSvgWithCaption(svgStr, caption, size);
            }
            QRH.currentSVG = svgStr;
        } catch {
            QRH.currentSVG = null;
        }
    } catch (err) {
        console.error('QR generate error:', err);
        QRH.currentDataURL = null;
        QRH.currentSVG = null;
        box.innerHTML = `
            <div class="text-center text-rose-500">
                <i class="fas fa-triangle-exclamation text-4xl mb-2"></i>
                <p class="font-bold">ไม่พบ QR Library</p>
                <p class="text-xs mt-1 mb-3">${escHtml(err.message || 'โหลดไม่ได้')}</p>
                <button onclick="location.reload(true)"
                    class="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold">
                    <i class="fas fa-rotate-right mr-1"></i> รีโหลดแบบไม่ใช้แคช
                </button>
                <p class="text-[10px] text-slate-400 mt-2">หรือกด Ctrl+Shift+R (Windows) / Cmd+Shift+R (Mac)</p>
            </div>`;
    }
}

function resetPreview() {
    const box = document.getElementById('qrPreviewBox');
    if (!box) return;
    box.innerHTML = `
        <div class="text-center text-slate-400">
            <i class="fas fa-qrcode text-5xl mb-3 text-slate-300"></i>
            <p class="font-bold">QR Code จะแสดงที่นี่</p>
            <p class="text-xs mt-1">กรอกข้อมูลด้านซ้ายเพื่อสร้าง</p>
        </div>`;
}

function generateFromForm() {
    try {
        readOptions();
        saveStyle();
        QRH.currentPayload = buildPayload(QRH.currentType);
        QRH.currentCaption = (document.getElementById('qrCaption')?.value || '').trim();
        generateQR();
    } catch (err) {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'warning', title: 'ข้อมูลไม่ครบ',
                text: err.message, confirmButtonText: 'ตกลง'
            });
        } else {
            alert(err.message);
        }
    }
}

/* ============================================================
   13) DOWNLOAD / PRINT
   ============================================================ */
function downloadPNG() {
    if (!QRH.currentDataURL) { toast('info', 'กรุณาสร้าง QR Code ก่อน'); return; }
    const a = document.createElement('a');
    a.href = QRH.currentDataURL;
    a.download = `qrcode-${QRH.currentType}-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast('success', 'ดาวน์โหลด PNG แล้ว');
}

function downloadSVG() {
    if (!QRH.currentSVG) { toast('info', 'กรุณาสร้าง QR Code ก่อน'); return; }
    const blob = new Blob([QRH.currentSVG], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qrcode-${QRH.currentType}-${Date.now()}.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('success', 'ดาวน์โหลด SVG แล้ว');
}

function printQR() {
    if (!QRH.currentDataURL) { toast('info', 'กรุณาสร้าง QR Code ก่อน'); return; }
    const w = window.open('', '_blank', 'width=640,height=720');
    if (!w) { toast('warning', 'Popup ถูกบล็อก กรุณาอนุญาต'); return; }
    w.document.write(`
        <!DOCTYPE html><html><head><meta charset="UTF-8"><title>พิมพ์ QR Code</title>
        <style>
            body { margin:0; display:flex; align-items:center; justify-content:center; min-height:100vh; font-family:'Anuphan',sans-serif; }
            .wrap { text-align:center; padding:24px; }
            img { max-width:80vw; max-height:75vh; }
            .brand { font-size:11px; color:#94a3b8; margin-top:10px; }
        </style></head><body>
            <div class="wrap">
                <img src="${QRH.currentDataURL}" onload="setTimeout(()=>window.print(),120)">
                <div class="brand">WRK System</div>
            </div>
        </body></html>`);
    w.document.close();
}

/* ============================================================
   14) HISTORY
   ============================================================ */
function historyStorageKey() {
    return `${QRH.historyKey}_${currentUser?.id || 'anon'}`;
}

function loadHistory() {
    try { return JSON.parse(localStorage.getItem(historyStorageKey()) || '[]'); }
    catch { return []; }
}

function saveHistoryToStorage(list) {
    try {
        localStorage.setItem(historyStorageKey(), JSON.stringify(list.slice(0, QRH.maxHistory)));
    } catch (e) { console.warn('Cannot save QR history:', e); }
}

function collectFormValues() {
    const vals = {};
    document
        .querySelectorAll('#qrFormContainer input, #qrFormContainer textarea, #qrFormContainer select')
        .forEach((el) => { if (el.id) vals[el.id] = el.value; });
    return vals;
}

function applyFormValues(vals) {
    Object.entries(vals || {}).forEach(([id, v]) => {
        const el = document.getElementById(id);
        if (el) el.value = v;
    });
}

function deriveLabel(type, payload, caption) {
    if (caption) return caption;
    try {
        switch (type) {
            case 'wifi': {
                const m = payload.match(/S:([^;]+)/);
                return 'Wi-Fi: ' + (m ? m[1].replace(/\\(.)/g, '$1') : '');
            }
            case 'vcard': {
                const m = payload.match(/FN:(.+)/);
                return 'นามบัตร: ' + (m ? m[1] : '');
            }
            case 'phone': return 'โทร: ' + payload.replace(/^tel:/, '');
            case 'email': return 'อีเมล: ' + payload.replace(/^mailto:/, '').split('?')[0];
            default: {
                const s = String(payload || '');
                return s.length > 60 ? s.slice(0, 60) + '…' : s;
            }
        }
    } catch { return type; }
}

function saveToHistory() {
    if (!QRH.currentDataURL) { toast('info', 'กรุณาสร้าง QR Code ก่อน'); return; }
    const list = loadHistory();
    const entry = {
        id: 'qr-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        type: QRH.currentType,
        payload: QRH.currentPayload,
        caption: QRH.currentCaption,
        label: deriveLabel(QRH.currentType, QRH.currentPayload, QRH.currentCaption),
        dataURL: QRH.currentDataURL,
        options: { ...QRH.currentOptions },
        formValues: collectFormValues(),
        createdAt: new Date().toISOString()
    };
    list.unshift(entry);
    saveHistoryToStorage(list);
    renderHistory();
    toast('success', 'บันทึกในประวัติแล้ว');
}

function useHistoryItem(id) {
    const item = loadHistory().find((x) => x.id === id);
    if (!item) return;

    QRH.currentType = item.type;
    QRH.currentPayload = item.payload;
    QRH.currentCaption = item.caption || '';
    QRH.currentOptions = { ...QRH.currentOptions, ...(item.options || {}) };

    const setVal = (elId, v) => {
        const el = document.getElementById(elId);
        if (el && v != null) el.value = v;
    };
    setVal('qrColorDark',  QRH.currentOptions.dark);
    setVal('qrColorLight', QRH.currentOptions.light);
    setVal('qrSize', String(QRH.currentOptions.size));
    setVal('qrECC', QRH.currentOptions.ecc);
    setVal('qrCaption', QRH.currentCaption);

    document.querySelectorAll('#qrTypeTabs .qr-type-tab').forEach((b) => {
        b.classList.toggle('active', b.dataset.type === item.type);
    });

    renderForm(item.type);
    applyFormValues(item.formValues);
    switchTab('generator');
    generateQR();
    toast('success', 'โหลดจากประวัติแล้ว');
}

function deleteHistoryItem(id) {
    const doDelete = () => {
        const list = loadHistory().filter((x) => x.id !== id);
        saveHistoryToStorage(list);
        renderHistory();
        toast('success', 'ลบแล้ว');
    };
    if (typeof Swal === 'undefined') return doDelete();
    Swal.fire({
        icon: 'warning', title: 'ลบรายการนี้?',
        showCancelButton: true, confirmButtonColor: '#dc2626',
        confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก'
    }).then((r) => { if (r.isConfirmed) doDelete(); });
}

function clearHistory() {
    const doClear = () => {
        saveHistoryToStorage([]);
        renderHistory();
        toast('success', 'ล้างประวัติทั้งหมดแล้ว');
    };
    if (typeof Swal === 'undefined') return doClear();
    Swal.fire({
        icon: 'warning', title: 'ล้างประวัติทั้งหมด?',
        text: 'ไม่สามารถกู้คืนได้',
        showCancelButton: true, confirmButtonColor: '#dc2626',
        confirmButtonText: 'ล้างทั้งหมด', cancelButtonText: 'ยกเลิก'
    }).then((r) => { if (r.isConfirmed) doClear(); });
}

function renderHistory() {
    const wrap = document.getElementById('qrHistoryList');
    if (!wrap) return;

    const list = loadHistory();
    if (list.length === 0) {
        wrap.innerHTML = `
            <div class="text-center text-slate-400 py-10">
                <i class="fas fa-inbox text-4xl mb-3 text-slate-300"></i>
                <p>ยังไม่มีประวัติ</p>
            </div>`;
        return;
    }

    wrap.innerHTML = list.map((item) => {
        const m = typeMeta(item.type);
        const title = item.caption || item.label || item.payload || '-';
        const sub = item.caption ? item.label : '';
        return `
            <div class="qr-history-item" data-id="${escHtml(item.id)}">
                <img src="${escHtml(item.dataURL)}" alt="QR">
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap;">
                        <span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;padding:2px 7px;border-radius:6px;background:${m.color}15;color:${m.color};">
                            <i class="fas ${m.icon}"></i> ${escHtml(m.label)}
                        </span>
                        <span style="font-size:10px;color:#94a3b8;">${escHtml(fmtDateTH(item.createdAt))}</span>
                    </div>
                    <div style="font-size:13px;font-weight:700;color:#334155;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                        ${escHtml(title)}
                    </div>
                    ${sub ? `<div style="font-size:11px;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(sub)}</div>` : ''}
                </div>
                <div style="display:flex;gap:4px;flex-shrink:0;">
                    <button type="button" onclick="QRModule.useHistoryItem('${escHtml(item.id)}')" title="ใช้ซ้ำ"
                        style="width:32px;height:32px;border-radius:8px;border:none;background:#eef2ff;color:#4f46e5;cursor:pointer;"
                        onmouseover="this.style.background='#e0e7ff'" onmouseout="this.style.background='#eef2ff'">
                        <i class="fas fa-rotate-right"></i>
                    </button>
                    <button type="button" onclick="QRModule.deleteHistoryItem('${escHtml(item.id)}')" title="ลบ"
                        style="width:32px;height:32px;border-radius:8px;border:none;background:#fef2f2;color:#dc2626;cursor:pointer;"
                        onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='#fef2f2'">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>`;
    }).join('');
}

/* ============================================================
   15) EXPORTS
   ============================================================ */
window.QRModule = {
    generateFromForm,
    generateQR,
    resetPreview,
    downloadPNG,
    downloadSVG,
    printQR,
    saveToHistory,
    loadHistory,
    renderHistory,
    useHistoryItem,
    deleteHistoryItem,
    clearHistory,
    getLibraryStatus: () => QRLib.status(),
    ensureLibrary: () => QRLib.ensure()
};

window.switchTab = switchTab;

console.log('✅ qr_tools.js loaded (v1.3 — caption support)');