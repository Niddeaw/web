/* =======================================================
   dashboard_ui.js — Sidebar, Topbar, Avatar, Utilities
   เวอร์ชัน 2.1
   + Display Settings v2 (Font 5 ระดับ + Theme 8 สี + Auto Mode)
   + Settings Modal ฉบับเต็ม (auto-inject)
   + 🆕 initExtras() — โหลด Search/Notification/Skeleton/Confetti/Breadcrumb/Reminder
   + 🆕 Extras Exports
   ======================================================= */

/* =======================================================
🚀 AUTO-LOAD dashboard_extras.js
(ถ้าไฟล์นี้โหลดเสร็จแล้ว → ไม่โหลดซ้ำ)
======================================================= */
(function autoLoadExtras() {
    // ตรวจว่ามีใน DOM แล้วหรือยัง
    const exists = [...document.querySelectorAll('script[src]')]
        .some(s => s.src.includes('dashboard_extras.js'));
    if (exists) return;

    // สร้าง script tag แล้วโหลด
    const script = document.createElement('script');
    script.src = 'dashboard_extras.js';
    script.async = false;   // ให้โหลดตามลำดับ
    script.onload = () => console.log('✅ dashboard_extras.js auto-loaded');
    script.onerror = () => console.warn('❌ โหลด dashboard_extras.js ไม่สำเร็จ');
    document.head.appendChild(script);
})();

/* ---------- Utility: set ค่าใน stat card ---------- */
function setStat(id, v) {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
}

/* ---------- Utility: escape HTML ---------- */
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function (m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

/* ---------- Sidebar: mobile toggle ---------- */
function toggleSidebar(force) {
    const sb = document.getElementById('dSidebar');
    const ov = document.getElementById('dOverlay');
    if (!sb || !ov) return;
    const open = typeof force === 'boolean' ? force : !sb.classList.contains('open');
    sb.classList.toggle('open', open);
    ov.classList.toggle('open', open);
}

/* ---------- Sidebar: collapse (desktop) ---------- */
function applySidebarCollapsed(collapsed) {
    const sb = document.getElementById('dSidebar');
    const main = document.getElementById('dMain');
    const btn = document.getElementById('collapseBtn');
    if (!sb || !main) return;
    sb.classList.toggle('collapsed', collapsed);
    main.classList.toggle('collapsed', collapsed);
    document.body.classList.toggle('sb-collapsed', collapsed);
    if (btn) {
        const i = btn.querySelector('i');
        if (i) i.className = collapsed ? 'fa-solid fa-angles-right' : 'fa-solid fa-angles-left';
        btn.title = collapsed ? 'ขยายเมนู' : 'ย่อเมนู';
    }
}

function toggleSidebarCollapse() {
    const sb = document.getElementById('dSidebar');
    if (!sb) return;
    const next = !sb.classList.contains('collapsed');
    applySidebarCollapsed(next);
    try { localStorage.setItem('cp_sidebar_collapsed', next ? '1' : '0'); } catch (e) { }
}

function restoreSidebarCollapse() {
    let saved = '0';
    try { saved = localStorage.getItem('cp_sidebar_collapsed') || '0'; } catch (e) { }
    if (window.innerWidth > 760 && saved === '1') {
        applySidebarCollapsed(true);
    }
}

/* ---------- User: display name ---------- */
function setUserDisplayName(user) {
    if (!user) return;
    const el = document.getElementById('userName');
    if (el) el.innerText = `${user.prefix || ''}${user.first_name || ''} ${user.last_name || ''}`.trim();
}

/* ---------- User: role label (ไทย) ---------- */
function getRoleText(role) {
    const map = {
        super_admin: 'ผู้ดูแลสูงสุด (Super Admin)',
        admin: 'ผู้ดูแลระบบย่อย (Admin)',
        director: 'ผู้อำนวยการ',
        deputy: 'รองผู้อำนวยการ',
        teacher: 'ครูผู้สอน (Teacher)',
        staff: 'เจ้าหน้าที่ (Staff)',
        office: 'เจ้าหน้าที่สำนักงาน (Office)'
    };
    return map[role] || role || '';
}

function updateUserRoleLabel(role) {
    const el = document.getElementById('userRole');
    if (el) el.innerText = getRoleText(role);
}

/* ---------- User: avatar + preview ---------- */
function renderUserAvatar(user) {
    if (!user) return;
    const avatarImg = document.getElementById('userAvatarImg');
    const avatarInitial = document.getElementById('userAvatarInitial');
    const avatarPreview = document.getElementById('userAvatarPreview');

    const avatarUrl = user.avatar_url
        || user.profile_image
        || user.photo_url
        || user.image_url
        || user.picture
        || user.avatar
        || '';

    if (avatarUrl) {
        if (avatarImg) {
            avatarImg.src = avatarUrl;
            avatarImg.alt = `${user.first_name || ''} ${user.last_name || ''}`.trim();
            avatarImg.style.display = 'block';
            avatarImg.onerror = () => {
                avatarImg.style.display = 'none';
                if (avatarInitial) avatarInitial.style.display = 'block';
            };
        }
        if (avatarInitial) avatarInitial.style.display = 'none';
        if (avatarPreview) {
            avatarPreview.src = avatarUrl;
            avatarPreview.style.display = 'block';
        }
    } else {
        if (avatarImg) avatarImg.style.display = 'none';
        if (avatarInitial) {
            avatarInitial.style.display = 'block';
            avatarInitial.innerText = (user.first_name || '?').charAt(0);
        }
    }
}

/* ---------- Auth: logout ---------- */
function handleLogout() {
    Swal.fire({
        title: 'ออกจากระบบ?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'ออกจากระบบ',
        cancelButtonText: 'ยกเลิก'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try { localStorage.removeItem('activeMode'); } catch (e) { }
            await db.auth.signOut();
            window.location.replace('login.html');
        }
    });
}

// ✅ Alias — รองรับ onclick="logout()" ที่ใช้ใน Sidebar config
window.logout = handleLogout;

/* ---------- Auto-restore collapse on load ---------- */
document.addEventListener('DOMContentLoaded', () => {
    restoreSidebarCollapse();
});

/* ---------- Auto-close mobile sidebar on resize ---------- */
window.addEventListener('resize', () => {
    if (window.innerWidth > 760) {
        document.getElementById('dOverlay')?.classList.remove('open');
        document.getElementById('dSidebar')?.classList.remove('open');
    }
});

/* =======================================================
   ✅ Display Settings v2.0 — Font 5 ระดับ + Theme + Color Mode
   ======================================================= */

const DISPLAY_KEYS = {
    font: 'wrk_font_size',
    theme: 'wrk_theme',
    colorMode: 'wrk_color_mode',
    density: 'wrk_density'
};

/* ---------- Font Scale (5 ระดับ) ---------- */
const FONT_PRESETS = {
    xs: { scale: 0.85, label: 'เล็กพิเศษ', icon: 'fa-text-height', preview: 'A' },
    small: { scale: 0.92, label: 'เล็ก', icon: 'fa-text-height', preview: 'A' },
    normal: { scale: 1.00, label: 'ปกติ', icon: 'fa-text-height', preview: 'A' },
    large: { scale: 1.12, label: 'ใหญ่', icon: 'fa-text-height', preview: 'A' },
    xl: { scale: 1.25, label: 'ใหญ่พิเศษ', icon: 'fa-text-height', preview: 'A' }
};

/* ---------- Theme Presets (8 สี) ---------- */
const THEME_PRESETS = {
    blue: { name: 'น้ำเงิน', primary: '#2588e8', hover: '#1a75d1', light: '#eef7ff', icon: 'fa-droplet', dept: 'กลาง' },
    academic: { name: 'วิชาการ', primary: '#6366f1', hover: '#4f46e5', light: '#eef2ff', icon: 'fa-book-open', dept: 'วิชาการ' },
    budget: { name: 'งบประมาณ', primary: '#10b981', hover: '#059669', light: '#ecfdf5', icon: 'fa-coins', dept: 'งบประมาณ' },
    personnel: { name: 'บุคคล', primary: '#a855f7', hover: '#9333ea', light: '#faf5ff', icon: 'fa-users', dept: 'บุคคล' },
    general: { name: 'ทั่วไป', primary: '#f97316', hover: '#ea580c', light: '#fff7ed', icon: 'fa-building', dept: 'ทั่วไป' },
    rose: { name: 'ชมพู', primary: '#f43f5e', hover: '#e11d48', light: '#fff1f2', icon: 'fa-heart', dept: '' },
    teal: { name: 'เขียวน้ำทะเล', primary: '#14b8a6', hover: '#0d9488', light: '#f0fdfa', icon: 'fa-water', dept: '' },
    slate: { name: 'เทาโมโน', primary: '#475569', hover: '#334155', light: '#f1f5f9', icon: 'fa-circle-half-stroke', dept: '' }
};

/* ---------- Density ---------- */
const DENSITY_PRESETS = {
    comfortable: { label: 'สบายตา', icon: 'fa-expand', desc: 'ช่องว่างเยอะ' },
    normal: { label: 'ปกติ', icon: 'fa-equals', desc: 'มาตรฐาน' },
    compact: { label: 'กระชับ', icon: 'fa-compress', desc: 'เห็นข้อมูลเยอะ' }
};

/* ---------- State ---------- */
let _displayState = {
    font: 'normal',
    theme: 'blue',
    colorMode: 'light',
    density: 'normal'
};

let _autoModeMediaQuery = null;
let _autoModeListener = null;

/* =======================================================
   📌 Apply Font Size
   ======================================================= */
function applyFontSize(size) {
    const preset = FONT_PRESETS[size] || FONT_PRESETS.normal;
    document.documentElement.style.setProperty('--d-font-scale', preset.scale);
    _displayState.font = size;
    _syncDisplayModalButtons('font', size);
    _saveDisplayState();
    _updateDisplayPreview();
}

/* =======================================================
   🎨 Apply Theme
   ======================================================= */
function applyTheme(theme) {
    const t = THEME_PRESETS[theme] || THEME_PRESETS.blue;
    const root = document.documentElement;
    root.style.setProperty('--d-primary', t.primary);
    root.style.setProperty('--d-primary-hover', t.hover);
    root.style.setProperty('--d-primary-light', t.light);

    const rgb = _hexToRgb(t.primary);
    if (rgb) {
        root.style.setProperty('--d-primary-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
    }

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme && !document.body.classList.contains('d-dark')) {
        metaTheme.setAttribute('content', t.primary);
    }

    _displayState.theme = theme;
    _syncDisplayModalButtons('theme', theme);
    _saveDisplayState();
    _updateDisplayPreview();
}

/* =======================================================
   🌙 Apply Color Mode (light | dark | auto)
   ======================================================= */
function applyColorMode(mode) {
    if (_autoModeListener && _autoModeMediaQuery) {
        try { _autoModeMediaQuery.removeEventListener('change', _autoModeListener); } catch (e) { }
        _autoModeListener = null;
    }

    let effectiveMode = mode;

    if (mode === 'auto') {
        _autoModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        effectiveMode = _autoModeMediaQuery.matches ? 'dark' : 'light';

        _autoModeListener = (e) => {
            const newMode = e.matches ? 'dark' : 'light';
            _applyModeClass(newMode);
        };
        _autoModeMediaQuery.addEventListener('change', _autoModeListener);
    }

    _applyModeClass(effectiveMode);

    _displayState.colorMode = mode;
    _syncDisplayModalButtons('colorMode', mode);
    _saveDisplayState();
    _updateDisplayPreview();
}

function _applyModeClass(effectiveMode) {
    document.documentElement.classList.toggle('dark', effectiveMode === 'dark');
    document.body.classList.toggle('d-dark', effectiveMode === 'dark');

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
        const t = THEME_PRESETS[_displayState.theme] || THEME_PRESETS.blue;
        metaTheme.setAttribute('content', effectiveMode === 'dark' ? '#0f172a' : t.primary);
    }
}

/* =======================================================
   📐 Apply Density
   ======================================================= */
function applyDensity(density) {
    document.body.classList.toggle('d-compact', density === 'compact');
    document.body.classList.toggle('d-comfortable', density === 'comfortable');
    _displayState.density = density;
    _syncDisplayModalButtons('density', density);
    _saveDisplayState();
    _updateDisplayPreview();
}

/* =======================================================
   💾 Save / Load State
   ======================================================= */
function _saveDisplayState() {
    try {
        localStorage.setItem(DISPLAY_KEYS.font, _displayState.font);
        localStorage.setItem(DISPLAY_KEYS.theme, _displayState.theme);
        localStorage.setItem(DISPLAY_KEYS.colorMode, _displayState.colorMode);
        localStorage.setItem(DISPLAY_KEYS.density, _displayState.density);
    } catch (e) { }
}

function _loadDisplayState() {
    try {
        _displayState.font = localStorage.getItem(DISPLAY_KEYS.font) || 'normal';
        _displayState.theme = localStorage.getItem(DISPLAY_KEYS.theme) || 'blue';
        _displayState.colorMode = localStorage.getItem(DISPLAY_KEYS.colorMode) || 'light';
        _displayState.density = localStorage.getItem(DISPLAY_KEYS.density) || 'normal';
    } catch (e) { }
}

/* =======================================================
   🔄 Init
   ======================================================= */
function initDisplaySettings() {
    _loadDisplayState();
    applyFontSize(_displayState.font);
    applyTheme(_displayState.theme);
    applyColorMode(_displayState.colorMode);
    applyDensity(_displayState.density);
}

/* =======================================================
   🖼️ Settings Modal (ฉบับเต็ม)
   ======================================================= */
function openDisplaySettingsModal() {
    let modal = document.getElementById('wrkDisplayModal');
    if (!modal) {
        modal = _buildDisplayModal();
        document.body.appendChild(modal);
        _bindDisplayModalEvents(modal);
    }
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    _syncDisplayModalButtons('font', _displayState.font);
    _syncDisplayModalButtons('theme', _displayState.theme);
    _syncDisplayModalButtons('colorMode', _displayState.colorMode);
    _syncDisplayModalButtons('density', _displayState.density);
    _updateDisplayPreview();
}

function closeDisplaySettingsModal() {
    const modal = document.getElementById('wrkDisplayModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

function _buildDisplayModal() {
    const modal = document.createElement('div');
    modal.id = 'wrkDisplayModal';
    modal.className = 'fixed inset-0 z-[100] hidden items-center justify-center p-4';

    const fontBtns = Object.entries(FONT_PRESETS).map(([key, p]) => `
        <button type="button" data-font="${key}"
            class="font-option flex flex-col items-center justify-center gap-1 py-3 rounded-xl border-2 border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 transition-all">
            <span style="font-size: ${0.8 + (p.scale - 0.85) * 2.5}em; font-weight: 700; line-height: 1;">Aa</span>
            <span class="text-[10px] font-bold text-slate-600">${p.label}</span>
        </button>
    `).join('');

    const themeBtns = Object.entries(THEME_PRESETS).map(([key, t]) => `
        <button type="button" data-theme="${key}"
            class="theme-option flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 border-slate-200 bg-white hover:border-slate-300 transition-all">
            <span class="w-10 h-10 rounded-full flex items-center justify-center text-white shadow-sm"
                  style="background: ${t.primary};">
                <i class="fas ${t.icon} text-base"></i>
            </span>
            <span class="text-[10px] font-bold text-slate-600 leading-tight text-center">${t.name}</span>
            ${t.dept ? `<span class="text-[8px] text-slate-400">${t.dept}</span>` : ''}
        </button>
    `).join('');

    const modeBtns = `
        <button type="button" data-mode="light"
            class="mode-option flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 border-slate-200 bg-white hover:border-slate-300 transition-all">
            <i class="fas fa-sun text-yellow-500 text-xl"></i>
            <span class="text-[11px] font-bold text-slate-700">สว่าง</span>
        </button>
        <button type="button" data-mode="dark"
            class="mode-option flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 border-slate-200 bg-white hover:border-slate-300 transition-all">
            <i class="fas fa-moon text-indigo-500 text-xl"></i>
            <span class="text-[11px] font-bold text-slate-700">มืด</span>
        </button>
        <button type="button" data-mode="auto"
            class="mode-option flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 border-slate-200 bg-white hover:border-slate-300 transition-all">
            <i class="fas fa-circle-half-stroke text-teal-500 text-xl"></i>
            <span class="text-[11px] font-bold text-slate-700">อัตโนมัติ</span>
        </button>
    `;

    const densityBtns = Object.entries(DENSITY_PRESETS).map(([key, d]) => `
        <button type="button" data-density="${key}"
            class="density-option flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 border-slate-200 bg-white hover:border-slate-300 transition-all">
            <i class="fas ${d.icon} text-slate-600 text-base"></i>
            <span class="text-[10px] font-bold text-slate-600">${d.label}</span>
        </button>
    `).join('');

    modal.innerHTML = `
        <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onclick="closeDisplaySettingsModal()"></div>
        <div class="relative bg-white rounded-3xl shadow-2xl z-10 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div class="px-6 py-4 border-b border-slate-100 flex items-center gap-3 bg-gradient-to-r from-slate-50 to-white">
                <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md">
                    <i class="fas fa-sliders text-lg"></i>
                </div>
                <div class="flex-1">
                    <h3 class="font-black text-slate-800 text-lg">ตั้งค่าการแสดงผล</h3>
                    <p class="text-[11px] text-slate-400">ปรับมุมมองให้เหมาะกับคุณ — มีผลกับทุกหน้าระบบ</p>
                </div>
                <button onclick="closeDisplaySettingsModal()" class="h-9 w-9 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-500 text-slate-500 flex items-center justify-center transition-colors">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <div class="overflow-y-auto p-6 space-y-6 flex-1">
                <section>
                    <div class="flex items-center gap-2 mb-3">
                        <i class="fas fa-font text-indigo-500"></i>
                        <h4 class="font-bold text-slate-700 text-sm">ขนาดตัวอักษร</h4>
                        <span class="text-[10px] text-slate-400">(5 ระดับ)</span>
                    </div>
                    <div class="grid grid-cols-5 gap-2">${fontBtns}</div>
                </section>

                <section>
                    <div class="flex items-center gap-2 mb-3">
                        <i class="fas fa-palette text-purple-500"></i>
                        <h4 class="font-bold text-slate-700 text-sm">ธีมสี</h4>
                        <span class="text-[10px] text-slate-400">(8 ธีม — แยกตามกลุ่มงาน)</span>
                    </div>
                    <div class="grid grid-cols-4 gap-2">${themeBtns}</div>
                </section>

                <section>
                    <div class="flex items-center gap-2 mb-3">
                        <i class="fas fa-circle-half-stroke text-teal-500"></i>
                        <h4 class="font-bold text-slate-700 text-sm">โหมดสี</h4>
                        <span class="text-[10px] text-slate-400">(Auto = ตามระบบเครื่อง)</span>
                    </div>
                    <div class="grid grid-cols-3 gap-3">${modeBtns}</div>
                </section>

                <section>
                    <div class="flex items-center gap-2 mb-3">
                        <i class="fas fa-layer-group text-amber-500"></i>
                        <h4 class="font-bold text-slate-700 text-sm">ความหนาแน่น</h4>
                    </div>
                    <div class="grid grid-cols-3 gap-2">${densityBtns}</div>
                </section>

                <section>
                    <div class="flex items-center gap-2 mb-3">
                        <i class="fas fa-eye text-emerald-500"></i>
                        <h4 class="font-bold text-slate-700 text-sm">ตัวอย่าง</h4>
                    </div>
                    <div id="displayPreview" class="rounded-2xl border-2 border-dashed border-slate-200 p-4 bg-slate-50/50">
                        <!-- dynamic preview -->
                    </div>
                </section>
            </div>

            <div class="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
                <button onclick="resetDisplaySettings()" class="px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-rose-50 hover:text-rose-600 text-slate-600 font-bold text-sm transition-colors">
                    <i class="fas fa-rotate-left mr-1.5"></i> คืนค่าเริ่มต้น
                </button>
                <button onclick="closeDisplaySettingsModal()" class="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md transition-colors">
                    <i class="fas fa-check mr-1.5"></i> เสร็จสิ้น
                </button>
            </div>
        </div>
    `;

    return modal;
}

function _bindDisplayModalEvents(modal) {
    modal.querySelectorAll('.font-option').forEach(btn => {
        btn.addEventListener('click', () => applyFontSize(btn.dataset.font));
    });
    modal.querySelectorAll('.theme-option').forEach(btn => {
        btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
    });
    modal.querySelectorAll('.mode-option').forEach(btn => {
        btn.addEventListener('click', () => applyColorMode(btn.dataset.mode));
    });
    modal.querySelectorAll('.density-option').forEach(btn => {
        btn.addEventListener('click', () => applyDensity(btn.dataset.density));
    });

    modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeDisplaySettingsModal();
    });
}

function _syncDisplayModalButtons(group, value) {
    const modal = document.getElementById('wrkDisplayModal');
    if (!modal) return;

    const selectorMap = {
        font: '.font-option',
        theme: '.theme-option',
        colorMode: '.mode-option',
        density: '.density-option'
    };
    const dataAttrMap = {
        font: 'font',
        theme: 'theme',
        colorMode: 'mode',
        density: 'density'
    };

    const selector = selectorMap[group];
    const attr = dataAttrMap[group];
    if (!selector || !attr) return;

    modal.querySelectorAll(selector).forEach(btn => {
        const isActive = btn.dataset[attr] === value;
        btn.classList.toggle('border-indigo-500', isActive);
        btn.classList.toggle('bg-indigo-50', isActive);
        btn.classList.toggle('ring-2', isActive);
        btn.classList.toggle('ring-indigo-200', isActive);
        btn.classList.toggle('border-slate-200', !isActive);
        btn.classList.toggle('bg-white', !isActive);
    });
}

function _updateDisplayPreview() {
    const preview = document.getElementById('displayPreview');
    if (!preview) return;

    const t = THEME_PRESETS[_displayState.theme] || THEME_PRESETS.blue;
    const isDark = document.body.classList.contains('d-dark');

    preview.innerHTML = `
        <div class="rounded-xl p-4 space-y-3" style="background: ${isDark ? '#1e293b' : '#fff'}; color: ${isDark ? '#e2e8f0' : '#334155'};">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md"
                     style="background: ${t.primary};">
                    <i class="fas fa-graduation-cap"></i>
                </div>
                <div>
                    <h5 class="font-bold">โรงเรียนวัดไร่ขิงวิทยา</h5>
                    <p class="text-xs opacity-70">ตัวอย่างข้อความในระบบ</p>
                </div>
            </div>
            <p class="text-sm leading-relaxed opacity-90">
                นี่คือตัวอย่างการแสดงผล — ขนาดตัวอักษร ธีมสี และความหนาแน่นจะปรับตามที่เลือก
            </p>
            <div class="flex gap-2">
                <button class="px-3 py-1.5 rounded-lg text-white text-xs font-bold shadow-sm" style="background: ${t.primary};">
                    <i class="fas fa-check mr-1"></i> ปุ่มหลัก
                </button>
                <button class="px-3 py-1.5 rounded-lg text-xs font-bold border" style="border-color: ${t.primary}; color: ${t.primary};">
                    ปุ่มรอง
                </button>
            </div>
        </div>
    `;
}

function resetDisplaySettings() {
    Swal.fire({
        title: 'คืนค่าเริ่มต้น?',
        text: 'การตั้งค่าทั้งหมดจะกลับเป็นค่าเริ่มต้น',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#6366f1',
        confirmButtonText: 'คืนค่า',
        cancelButtonText: 'ยกเลิก'
    }).then((result) => {
        if (result.isConfirmed) {
            applyFontSize('normal');
            applyTheme('blue');
            applyColorMode('light');
            applyDensity('normal');
            _updateDisplayPreview();
            Swal.fire({ icon: 'success', title: 'คืนค่าเรียบร้อย', timer: 1200, showConfirmButton: false });
        }
    });
}

/* ---------- Helpers ---------- */
function _hexToRgb(hex) {
    const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
}

/* ---------- Legacy wrapper (รองรับของเดิม) ---------- */
function setFontSize(size) { applyFontSize(size); }
function setDensity(density) { applyDensity(density); }

/* ---------- toggleSettingsMenu (legacy — เปิด modal แทน) ---------- */
function toggleSettingsMenu() {
    openDisplaySettingsModal();
}

/* ---------- setTodayChip ---------- */
function setTodayChip() {
    const el = document.getElementById('todayChip');
    if (el) {
        el.textContent = new Date().toLocaleDateString('th-TH', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    restoreSidebarCollapse();
    initDisplaySettings();
    setTodayChip();
});

/* =======================================================
   🔧 Normalize Google Drive URL
   ======================================================= */
function normalizeGoogleDriveUrl(rawUrl, size = 400) {
    if (!rawUrl || typeof rawUrl !== 'string') return null;
    const s = rawUrl.trim();
    if (!s) return null;

    let fileId = null;
    const patterns = [
        /\/file\/d\/([a-zA-Z0-9_-]{10,})/,
        /[?&]id=([a-zA-Z0-9_-]{10,})/,
        /\/d\/([a-zA-Z0-9_-]{10,})/,
        /\/uc\?export=\w+&id=([a-zA-Z0-9_-]{10,})/
    ];
    for (const p of patterns) {
        const m = s.match(p);
        if (m && m[1]) { fileId = m[1]; break; }
    }

    if (fileId) {
        return `https://lh3.googleusercontent.com/d/${fileId}=w${size}`;
    }
    return s;
}

/* =======================================================
   🖼️ Student Avatar Helper
   ======================================================= */
function getStudentAvatarUrl(student, size = 400) {
    if (!student) return null;
    const rawUrl =
        student.avatar_students_url ||
        student.avatar_url ||
        student.profile_image ||
        student.photo_url ||
        student.image_url ||
        student.picture ||
        student.avatar ||
        null;

    if (!rawUrl) return null;
    return normalizeGoogleDriveUrl(rawUrl, size) || rawUrl;
}

function renderStudentAvatar(student, opts = {}) {
    const size = opts.size || 32;
    const rounded = opts.rounded || 'full';
    const border = opts.border !== false;
    const pxSize = size * 2;

    const url = getStudentAvatarUrl(student, pxSize);

    const fullName = opts.name
        || (student && `${student.prefix || ''}${student.first_name || ''} ${student.last_name || ''}`.trim())
        || 'ไม่ระบุชื่อ';
    const initial = (fullName || '?').trim().charAt(0).toUpperCase();

    const roundClass = rounded === 'full' ? 'rounded-full' : 'rounded-xl';
    const borderClass = border ? 'border-2 border-slate-200 shadow-sm' : '';
    const baseStyle = `width:${size}px;height:${size}px;flex-shrink:0;display:inline-block;`;

    const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=ebd9fc&color=7c3aed&font-size=0.45&bold=true&size=${pxSize}`;

    if (url) {
        return `<img src="${url}"
                     alt="${fullName}"
                     loading="lazy"
                     decoding="async"
                     referrerpolicy="no-referrer"
                     class="object-cover ${roundClass} ${borderClass} bg-slate-100"
                     style="${baseStyle}"
                     data-fallback="${fallbackUrl}"
                     onerror="if(!this.dataset.failed){this.dataset.failed='1';this.src=this.dataset.fallback;}">`;
    }

    return `<div class="${roundClass} bg-gradient-to-br from-purple-200 to-purple-300 text-purple-700 flex items-center justify-center font-bold ${borderClass}"
                 style="${baseStyle}font-size:${Math.round(size * 0.42)}px;"
                 title="${fullName}">${initial}</div>`;
}

/* =======================================================
   🖼️ Personnel Avatar Helper
   ======================================================= */
function getPersonnelAvatarUrl(p) {
    if (!p) return null;
    return p.avatar_url
        || p.profile_image
        || p.photo_url
        || p.image_url
        || p.picture
        || p.avatar
        || null;
}

// =======================================================
// ✅ Global Navigation Helpers
// =======================================================
if (typeof window.switchToHome !== 'function') {
    window.switchToHome = function () {
        window.location.href = 'index.html';
    };
}

if (typeof window.switchMainTab !== 'function') {
    window.switchMainTab = function (category, btnElement) {
        const hash = category ? '#' + category : '';
        window.location.href = 'index.html' + hash;
    };
}

if (typeof window.changeMyPassword !== 'function') {
    window.changeMyPassword = async function () {
        if (typeof Swal === 'undefined') return;

        const { value: formValues } = await Swal.fire({
            title: 'เปลี่ยนรหัสผ่าน',
            html: `
                <div class="text-sm text-gray-500 mb-3">กรุณาตั้งรหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร)</div>
                <input id="swal-pwd1" type="password" placeholder="รหัสผ่านใหม่" class="w-full border border-gray-300 rounded-lg px-4 py-3 mb-3 outline-none focus:border-blue-500">
                <input id="swal-pwd2" type="password" placeholder="ยืนยันรหัสผ่านใหม่อีกครั้ง" class="w-full border border-gray-300 rounded-lg px-4 py-3 outline-none focus:border-blue-500">
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonColor: '#2563eb',
            confirmButtonText: 'อัปเดตรหัสผ่าน',
            cancelButtonText: 'ยกเลิก',
            preConfirm: () => {
                const p1 = document.getElementById('swal-pwd1').value;
                const p2 = document.getElementById('swal-pwd2').value;
                if (!p1 || p1.length < 6) { Swal.showValidationMessage('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'); return false; }
                if (p1 !== p2) { Swal.showValidationMessage('รหัสผ่านทั้งสองช่องไม่ตรงกัน'); return false; }
                return p1;
            }
        });

        if (!formValues) return;
        Swal.fire({ title: 'กำลังอัปเดต...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const { error } = await db.auth.updateUser({ password: formValues });
        if (error) Swal.fire('ผิดพลาด', error.message, 'error');
        else Swal.fire({ icon: 'success', title: 'เปลี่ยนรหัสผ่านสำเร็จ!', text: 'ครั้งต่อไปกรุณาใช้รหัสผ่านใหม่นี้ในการเข้าสู่ระบบ' });
    };
}

// =======================================================
// ✅ initModuleSidebar — Helper กลางสำหรับทุกโมดูล
// + ✅ breadcrumb support
// =======================================================
async function initModuleSidebar(options = {}) {
    const {
        moduleKey = null,
        fallbackConfig = null,
        pageTitle = 'WRK System',
        topbarButtons = [],
        activeId = null,
        onReady = null,
        waitRole = true,
        reRenderDelay = 0,
        breadcrumb = null       // 🆕
    } = options;

    const renderFallback = () => {
        try {
            if (fallbackConfig) {
                renderSidebar({ ...fallbackConfig, autoActivate: false });
            }
            renderTopbar({ pageTitle, buttons: topbarButtons, breadcrumb });
            console.log('📦 initModuleSidebar: fallback rendered');
            _applyOnReady();
        } catch (e) {
            console.error('❌ Fallback render error:', e);
        }
    };

    const _applyOnReady = () => {
        if (typeof onReady === 'function') {
            try { onReady(); } catch (e) { console.warn('onReady error:', e); }
        }
        if (activeId) {
            setTimeout(() => setActiveNavItem(activeId), 50);
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderFallback);
    } else {
        renderFallback();
    }

    window.addEventListener('load', async () => {
        if (waitRole) {
            let waited = 0;
            while (!window.currentUserRole && waited < 5000) {
                await new Promise(r => setTimeout(r, 150));
                waited += 150;
            }
        }

        if (reRenderDelay > 0) {
            await new Promise(r => setTimeout(r, reRenderDelay));
        }

        let dbConfig = null;
        try {
            if (moduleKey && typeof loadSidebarConfigFromDB === 'function') {
                const keys = [moduleKey, window.currentUserRole, 'default'];
                for (const key of keys) {
                    if (!key) continue;
                    dbConfig = await loadSidebarConfigFromDB(key);
                    if (dbConfig && Object.keys(dbConfig).length > 0) {
                        console.log(`✅ initModuleSidebar: DB key="${key}"`);
                        break;
                    }
                }
            }
        } catch (e) {
            console.warn('⚠️ Load DB config error:', e);
        }

        const finalConfig = (dbConfig && Object.keys(dbConfig).length > 0)
            ? dbConfig
            : fallbackConfig;

        if (!finalConfig) {
            console.warn('⚠️ initModuleSidebar: ไม่มี config ให้ render');
            _applyOnReady();
            return;
        }

        renderSidebar({ ...finalConfig, autoActivate: false });
        renderTopbar({ pageTitle, buttons: topbarButtons, breadcrumb });
        console.log('✅ initModuleSidebar: re-rendered');
        _applyOnReady();
    });
}

window.initModuleSidebar = initModuleSidebar;

/* =======================================================
   🔗 Exports — Display Settings
   ======================================================= */
window.setFontSize = applyFontSize;
window.setDensity = applyDensity;
window.setTheme = applyTheme;
window.setColorMode = applyColorMode;
window.applyFontSize = applyFontSize;
window.applyDensity = applyDensity;
window.applyTheme = applyTheme;
window.applyColorMode = applyColorMode;
window.openDisplaySettingsModal = openDisplaySettingsModal;
window.closeDisplaySettingsModal = closeDisplaySettingsModal;
window.resetDisplaySettings = resetDisplaySettings;
window.initDisplaySettings = initDisplaySettings;
window.toggleSettingsMenu = toggleSettingsMenu;

/* ---------- Auto-init ---------- */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDisplaySettings);
} else {
    initDisplaySettings();
}

/* =======================================================
   🚀 INIT EXTRAS — โหลดลูกเล่นทั้งหมด
   (Search, Notification, Skeleton, Confetti, Breadcrumb, Reminder, IconAnim)
   ต้องโหลด dashboard_extras.js ก่อน dashboard_ui.js
   ======================================================= */
window.addEventListener('load', () => {
    if (typeof window.initExtras === 'function') {
        try {
            window.initExtras();
            console.log('✅ initExtras loaded successfully');
        } catch (e) {
            console.warn('⚠️ initExtras error:', e);
        }
    } else {
        console.warn('⚠️ dashboard_extras.js ไม่ได้ถูกโหลด — ลูกเล่นจะไม่ทำงาน');
    }
});

/* =======================================================
   🎁 Extras Exports — ปลอดภัย (ไม่ทับของเดิมถ้ามีอยู่)
   ใช้ pattern: window.X = window.X || undefined
   (dashboard_extras.js เป็นเจ้าของจริง)
   ======================================================= */
if (typeof window.Confetti === 'undefined') window.Confetti = undefined;
if (typeof window.Skeleton === 'undefined') window.Skeleton = undefined;
if (typeof window.GlobalSearch === 'undefined') window.GlobalSearch = undefined;
if (typeof window.NotificationCenter === 'undefined') window.NotificationCenter = undefined;
if (typeof window.Breadcrumb === 'undefined') window.Breadcrumb = undefined;
if (typeof window.AutoReminder === 'undefined') window.AutoReminder = undefined;
if (typeof window.IconAnim === 'undefined') window.IconAnim = undefined;

console.log('✅ dashboard_ui.js loaded (v2.1 + Display Settings v2 + initExtras)');