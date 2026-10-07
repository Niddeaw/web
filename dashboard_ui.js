/* =======================================================
   dashboard_ui.js — Sidebar, Topbar, Avatar, Utilities
   ======================================================= */

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
   Display Settings — Font Size + Density
   ======================================================= */

const DISPLAY_KEYS = {
    font: 'cp_font_size',
    density: 'cp_density'
};

function applyFontSize(size) {
    const scale = { small: 0.9, normal: 1, large: 1.15 }[size] || 1;
    document.documentElement.style.setProperty('--d-font-scale', scale);
    document.querySelectorAll('[data-font]').forEach(b => {
        b.classList.toggle('active', b.dataset.font === size);
    });
    try { localStorage.setItem(DISPLAY_KEYS.font, size); } catch (e) { }
}

function applyDensity(density) {
    document.body.classList.toggle('d-compact', density === 'compact');
    document.querySelectorAll('[data-density]').forEach(b => {
        b.classList.toggle('active', b.dataset.density === density);
    });
    try { localStorage.setItem(DISPLAY_KEYS.density, density); } catch (e) { }
}

function setFontSize(size) { applyFontSize(size); }
function setDensity(density) { applyDensity(density); }

function initDisplaySettings() {
    let font = 'normal';
    let density = 'normal';
    try {
        font = localStorage.getItem(DISPLAY_KEYS.font) || 'normal';
        density = localStorage.getItem(DISPLAY_KEYS.density) || 'normal';
    } catch (e) { }
    applyFontSize(font);
    applyDensity(density);
}

function toggleSettingsMenu(force) {
    const menu = document.getElementById('settingsMenu');
    const btn = document.getElementById('settingsBtn');
    if (!menu || !btn) return;
    const open = typeof force === 'boolean' ? force : !menu.classList.contains('open');
    menu.classList.toggle('open', open);
    btn.classList.toggle('active', open);
}

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
   แปลง URL ของ Google Drive ทุกรูปแบบให้เป็น direct CDN URL
   ======================================================= */
function normalizeGoogleDriveUrl(rawUrl, size = 400) {
    if (!rawUrl || typeof rawUrl !== 'string') return null;
    const s = rawUrl.trim();
    if (!s) return null;

    let fileId = null;
    const patterns = [
        /\/file\/d\/([a-zA-Z0-9_-]{10,})/,   // /file/d/XXX/
        /[?&]id=([a-zA-Z0-9_-]{10,})/,        // ?id=XXX
        /\/d\/([a-zA-Z0-9_-]{10,})/,          // /d/XXX
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
   🖼️ Personnel Avatar Helper (เผื่อใช้ในอนาคต)
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

// ✅ ส่ง hash ไปด้วย → index.html จะอ่านแล้ว switch tab ให้เอง
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
// ใช้แทน per-module sidebar files (behavior_sidebar.js, club_sidebar.js ฯลฯ)
//
// @param {object} options
//   - moduleKey      : string      key สำหรับโหลด config จาก DB (เช่น 'club_system')
//   - fallbackConfig : object      config สำรองถ้า DB ว่าง
//   - pageTitle      : string      ชื่อหน้า (topbar)
//   - topbarButtons  : array       ปุ่มบน topbar
//   - activeId       : string      id ของเมนูที่ active
//   - onReady        : function    callback หลัง render (เช่น updateSidebarNav)
//   - waitRole       : boolean     รอ currentUserRole ก่อน re-render (default true)
//   - reRenderDelay  : number      หน่วง ms ก่อน re-render (default 0)
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
        reRenderDelay = 0
    } = options;

    // ============ 1) Render fallback ทันที (เมื่อ DOM พร้อม) ============
    const renderFallback = () => {
        try {
            if (fallbackConfig) {
                renderSidebar({ ...fallbackConfig, autoActivate: false });
            }
            renderTopbar({ pageTitle, buttons: topbarButtons });
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
        // Set active item
        if (activeId) {
            setTimeout(() => setActiveNavItem(activeId), 50);
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderFallback);
    } else {
        renderFallback();
    }

    // ============ 2) Full init (โหลด DB config) ============
    window.addEventListener('load', async () => {
        // รอ currentUserRole (สำหรับ role filter)
        if (waitRole) {
            let waited = 0;
            while (!window.currentUserRole && waited < 5000) {
                await new Promise(r => setTimeout(r, 150));
                waited += 150;
            }
        }

        // หน่วงเวลาเพิ่มถ้ากำหนด
        if (reRenderDelay > 0) {
            await new Promise(r => setTimeout(r, reRenderDelay));
        }

        // โหลด DB config
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
        renderTopbar({ pageTitle, buttons: topbarButtons });
        console.log('✅ initModuleSidebar: re-rendered');
        _applyOnReady();
    });
}

window.initModuleSidebar = initModuleSidebar;

console.log('✅ dashboard_ui.js loaded (+ Global Nav Helpers)');