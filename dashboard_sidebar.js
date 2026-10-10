// ==========================================
// dashboard_sidebar.js
// Renderer + Auto-Seed สำหรับ Sidebar และ Topbar ของทุกโมดูล
// ----------------------------------------------------
// ใช้คู่กับ: dashboard_sidebar_actions.js (Action Library)
// โหลดหลัง: config.js, dashboard_ui.js, dashboard_sidebar_actions.js
// ==========================================

// ==========================================
// Global State
// ==========================================
let _sidebarConfigCache = {};
let _currentSidebarConfig = null;
let _currentModuleKey = null;
let _currentActiveId = null;

// ==========================================
// Helper: Detect Mobile
// ==========================================
function isMobile() {
    return window.innerWidth < 761;
}

// ==========================================
// Toggle Sidebar (Mobile)
// ==========================================
window.toggleSidebar = function (forceState) {
    const sidebar = document.getElementById('dSidebar');
    const overlay = document.getElementById('dOverlay');
    if (!sidebar || !overlay) return;

    const isOpen = sidebar.classList.contains('open') ||
        sidebar.classList.contains('show') ||
        sidebar.classList.contains('active') ||
        sidebar.classList.contains('is-open');

    const shouldOpen = typeof forceState === 'boolean' ? forceState : !isOpen;

    if (shouldOpen) {
        sidebar.classList.add('open');
        overlay.classList.add('open');
    } else {
        sidebar.classList.remove('open');
        overlay.classList.remove('open');
    }
};

// ==========================================
// Toggle Sidebar Collapse (Desktop)
// ==========================================
window.toggleSidebarCollapse = function () {
    const body = document.body;
    body.classList.toggle('sidebar-collapsed');

    const btn = document.getElementById('collapseBtn');
    if (btn) {
        const icon = btn.querySelector('i');
        if (icon) {
            icon.classList.toggle('fa-angles-left');
            icon.classList.toggle('fa-angles-right');
        }
    }

    // Save preference
    try {
        localStorage.setItem('wrk_sidebar_collapsed',
            body.classList.contains('sidebar-collapsed') ? '1' : '0');
    } catch (e) { }
};

// Restore collapse state
(function restoreCollapseState() {
    try {
        if (localStorage.getItem('wrk_sidebar_collapsed') === '1') {
            document.body.classList.add('sidebar-collapsed');
        }
    } catch (e) { }
})();

// ==========================================
// Sidebar Config Cache
// ==========================================
function _readSidebarCache(moduleKey) {
    try {
        const raw = sessionStorage.getItem(`wrk_sidebar_cfg_${moduleKey}`);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        // TTL 5 นาที
        if (parsed.ts && Date.now() - parsed.ts < 5 * 60 * 1000) {
            return parsed.data;
        }
        return null;
    } catch (e) { return null; }
}

function _writeSidebarCache(moduleKey, data) {
    try {
        sessionStorage.setItem(`wrk_sidebar_cfg_${moduleKey}`, JSON.stringify({
            ts: Date.now(), data
        }));
    } catch (e) { }
}

window.clearSidebarConfigCache = function () {
    try {
        Object.keys(sessionStorage).forEach(k => {
            if (k.startsWith('wrk_sidebar_cfg_')) {
                sessionStorage.removeItem(k);
            }
        });
    } catch (e) { }
};

// ==========================================
// ✅ AUTO-SEED: สร้าง config ใน DB ถ้ายังไม่มี
// ==========================================
async function ensureSidebarConfig(moduleKey, fallbackConfig) {
    if (!moduleKey || !fallbackConfig) return false;

    try {
        // เช็คว่ามี config นี้ใน DB แล้วหรือยัง
        const { data: existing, error } = await db
            .from('core_sidebar_config')
            .select('config_key')
            .eq('config_key', moduleKey)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') throw error;

        // ✅ มีอยู่แล้ว → ไม่ต้อง seed
        if (existing) {
            console.log(`📌 Sidebar config "${moduleKey}" มีอยู่แล้ว`);
            return false;
        }

        // ✅ ยังไม่มี → seed จาก fallback
        console.log(`🌱 Auto-seeding sidebar: "${moduleKey}"`);

        // ทำความสะอาด config ก่อน save
        const cleanConfig = JSON.parse(JSON.stringify(fallbackConfig));
        delete cleanConfig.autoActivate;

        const { data: result, error: saveErr } = await db.rpc('save_sidebar_config', {
            p_key: moduleKey,
            p_data: cleanConfig
        });

        if (saveErr) throw saveErr;
        if (result && result.success === false) throw new Error(result.error);

        console.log(`✅ Auto-seed สำเร็จ: "${moduleKey}"`);
        return true;

    } catch (err) {
        console.warn('⚠️ ensureSidebarConfig error:', err);
        return false;
    }
}

// ==========================================
// ✅ Load Module Sidebar Config (DB → fallback)
// ==========================================
async function loadModuleSidebarConfig(moduleKey, fallbackConfig) {
    // ไม่มี moduleKey → ใช้ fallback
    if (!moduleKey) {
        return { config: fallbackConfig, from: 'fallback-no-key' };
    }

    // ✅ ลอง cache ก่อน
    const cached = _readSidebarCache(moduleKey);
    if (cached) {
        return { config: cached, from: 'cache' };
    }

    try {
        // ✅ ลองโหลดจาก DB
        const { data, error } = await db
            .from('core_sidebar_config')
            .select('config_data')
            .eq('config_key', moduleKey)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') throw error;

        // ✅ มีใน DB → ใช้ DB
        if (data?.config_data) {
            _writeSidebarCache(moduleKey, data.config_data);
            return { config: data.config_data, from: 'db' };
        }

        // ✅ ไม่มี → ใช้ fallback + auto-seed
        if (fallbackConfig) {
            await ensureSidebarConfig(moduleKey, fallbackConfig);
            _writeSidebarCache(moduleKey, fallbackConfig);
            return { config: fallbackConfig, from: 'fallback-seeded' };
        }

        return { config: null, from: 'not-found' };

    } catch (err) {
        console.warn('⚠️ loadModuleSidebarConfig error:', err);
        return { config: fallbackConfig, from: 'fallback-error' };
    }
}

// ==========================================
// ✅ Build Icon Style
// ==========================================
function _buildIconStyle(item, styleMode) {
    const bg = item.icon_bg_color || '';
    const txt = item.icon_text_color || '';

    // Outline mode → พื้นหลังโปร่งใส + สีจาก bg
    if (styleMode === 'outline') {
        let color = bg;
        if (!color || color === 'transparent' || _isLightColor(bg)) {
            color = txt || 'inherit';
        }
        return `background-color: transparent; color: ${color};`;
    }

    // Filled mode (default)
    return `background-color: ${bg || 'transparent'}; color: ${txt || 'inherit'};`;
}

function _isLightColor(hex) {
    if (!hex || typeof hex !== 'string') return false;
    const m = hex.trim().match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (!m) return false;
    const r = parseInt(m[1], 16);
    const g = parseInt(m[2], 16);
    const b = parseInt(m[3], 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.82;
}

// ==========================================
// ✅ Build Icon Tag
// ==========================================
function _buildIconTag(iconValue, color = '') {
    const style = color ? `style="color: ${color};"` : '';
    if (!iconValue) return `<i class="fa-solid fa-cube" ${style}></i>`;
    if (iconValue.includes('fa-brands') || iconValue.includes('fa-regular')) {
        return `<i class="${iconValue}" ${style}></i>`;
    }
    const cleaned = iconValue.replace(/^fa-solid\s+/, '');
    return `<i class="fa-solid ${cleaned}" ${style}></i>`;
}

// ==========================================
// ✅ Role Filter Helper
// ==========================================
function _isItemVisibleByRole(item) {
    if (!item.roles || !Array.isArray(item.roles) || item.roles.length === 0) {
        return true; // ไม่ระบุ roles → ทุกคนเห็น
    }
    const currentRole = window.currentUserRole || '';
    return item.roles.includes(currentRole);
}

// ==========================================
// ✅ Render Sidebar
// ==========================================
window.renderSidebar = function (config) {
    if (!config) {
        console.warn('⚠️ renderSidebar: ไม่มี config');
        return;
    }

    _currentSidebarConfig = config;

    const sidebar = document.getElementById('dSidebar');
    if (!sidebar) return;

    const styleMode = config.iconStyle || 'filled';
    const brand = config.brand || {};

    // ✅ Sync global icon style
    window._setGlobalIconStyle = function (mode) {
        window._wrkIconStyle = mode;
    };
    window._setGlobalIconStyle(styleMode);

    let html = '';

    // Brand
    html += `
        <div class="d-brand">
            <div class="d-logo">
                <img src="${_escapeAttr(brand.logo || '')}" alt="logo"
                     onerror="this.style.display='none'">
            </div>
            <div>
                <b>${_escapeHtml(brand.name || 'WRK System')}</b>
                <span>${_escapeHtml(brand.subtitle || '')}</span>
            </div>
        </div>
    `;

    html += `<nav class="d-nav">`;

    // Main Menu
    if (config.mainMenu && config.mainMenu.length > 0) {
        html += `<div class="d-nav-title">${_escapeHtml(config.mainMenuTitle || 'เมนูหลัก')}</div>`;
        html += _renderSidebarItems(config.mainMenu, styleMode);
    }

    // Departments (ถ้าเปิด)
    if (config.showAllDepartments && config.departments && config.departments.length > 0) {
        const collapsible = config.departmentsCollapsible !== false;
        const defaultOpen = config.departmentsDefaultOpen !== false;

        if (collapsible) {
            html += `
                <div class="d-nav-title collapsible ${defaultOpen ? '' : 'collapsed'}"
                     onclick="this.classList.toggle('collapsed'); this.nextElementSibling.classList.toggle('collapsed');">
                    <i class="fa-solid fa-folder section-icon"></i>
                    <span>${_escapeHtml(config.departmentsTitle || 'กลุ่มบริหารงาน')}</span>
                    <i class="fa-solid fa-chevron-down section-arrow"></i>
                </div>
                <div class="d-nav-section-items ${defaultOpen ? '' : 'collapsed'}">
                    ${_renderSidebarItems(config.departments, styleMode)}
                </div>
            `;
        } else {
            html += `<div class="d-nav-title">${_escapeHtml(config.departmentsTitle || 'กลุ่มบริหารงาน')}</div>`;
            html += _renderSidebarItems(config.departments, styleMode);
        }
    }

    // Module Menus
    if (config.moduleMenus && config.moduleMenus.length > 0) {
        config.moduleMenus.forEach(mod => {
            const collapsible = mod.collapsible === true;
            const defaultOpen = mod.defaultOpen !== false;
            const items = _renderSidebarItems(mod.items || [], styleMode);

            if (!items) return; // ถ้าไม่มี items ที่ show ได้ → ข้าม

            if (collapsible) {
                html += `
                    <div class="d-nav-title collapsible ${defaultOpen ? '' : 'collapsed'}"
                         onclick="this.classList.toggle('collapsed'); this.nextElementSibling.classList.toggle('collapsed');">
                        <i class="fa-solid fa-folder section-icon"></i>
                        <span>${_escapeHtml(mod.title || '')}</span>
                        <i class="fa-solid fa-chevron-down section-arrow"></i>
                    </div>
                    <div class="d-nav-section-items ${defaultOpen ? '' : 'collapsed'}">
                        ${items}
                    </div>
                `;
            } else {
                html += `<div class="d-nav-title">${_escapeHtml(mod.title || '')}</div>`;
                html += items;
            }
        });
    }

    // Footer Menu
    if (config.footerMenu && config.footerMenu.length > 0) {
        const collapsible = config.footerCollapsible === true;
        const items = _renderSidebarItems(config.footerMenu, styleMode);

        if (items) {
            if (collapsible) {
                html += `
                    <div class="d-nav-title collapsible"
                         onclick="this.classList.toggle('collapsed'); this.nextElementSibling.classList.toggle('collapsed');">
                        <i class="fa-solid fa-folder section-icon"></i>
                        <span>${_escapeHtml(config.footerMenuTitle || 'การตั้งค่า')}</span>
                        <i class="fa-solid fa-chevron-down section-arrow"></i>
                    </div>
                    <div class="d-nav-section-items">
                        ${items}
                    </div>
                `;
            } else {
                html += `<div class="d-nav-title">${_escapeHtml(config.footerMenuTitle || 'การตั้งค่า')}</div>`;
                html += items;
            }
        }
    }

    // Logout
    if (config.logoutItem) {
        html += _renderSingleItem(config.logoutItem, styleMode, 0);
    }

    html += `</nav>`;

    // Facebook button
    const fb = config.facebook;
    if (fb && fb.href) {
        html += `
            <div class="d-sidebar-bottom">
                <a href="${_escapeAttr(fb.href)}" target="_blank" rel="noopener"
                   class="d-fb-btn" title="${_escapeAttr(fb.label || 'ติดตามเพจ')}">
                    <i class="${fb.icon || 'fa-brands fa-facebook'}"></i>
                    <span>${_escapeHtml(fb.label || 'ติดตามเพจโรงเรียน')}</span>
                </a>
            </div>
        `;
    }

    sidebar.innerHTML = html;

    // ✅ Apply active state
    if (_currentActiveId) {
        setActiveNavItem(_currentActiveId);
    }

    // ✅ Re-apply user info (เพราะ innerHTML ทับ)
    if (window.currentProfile) {
        setUserDisplayName(window.currentProfile);
        renderUserAvatar(window.currentProfile);
    }
    if (window.currentUserRole) {
        updateUserRoleLabel(window.currentUserRole);
    }
};

// ==========================================
// ✅ Render Sidebar Items (array)
// ==========================================
function _renderSidebarItems(items, styleMode, depth = 0) {
    if (!Array.isArray(items)) return '';

    const visible = items.filter(item => {
        if (!item) return false;
        if (item.hidden) return false;
        return _isItemVisibleByRole(item);
    });

    if (visible.length === 0) return '';

    return visible.map(item => _renderSingleItem(item, styleMode, depth)).join('');
}

// ==========================================
// ✅ Render Single Item
// ==========================================
function _renderSingleItem(item, styleMode, depth) {
    if (!item) return '';

    const label = _escapeHtml(item.label || '');
    const iconStyle = _buildIconStyle(item, styleMode);
    const hasChildren = item.children && item.children.length > 0;

    // Class override
    const itemClass = item.class || '';
    const activeClass = itemClass.includes('active') || item.id === _currentActiveId ? 'active' : '';
    const logoutClass = itemClass.includes('logout') ? 'logout' : '';

    // Link/Onclick
    const href = item.href ? `href="${_escapeAttr(item.href)}"` : '';
    const target = item.target_blank ? 'target="_blank" rel="noopener"' : '';
    const onclick = item.onclick ? `onclick="${_escapeAttr(item.onclick)}"` : '';

    // Children (expandable)
    if (hasChildren) {
        const visibleChildren = item.children.filter(c => !c.hidden && _isItemVisibleByRole(c));
        if (visibleChildren.length === 0) return '';

        return `
            <div class="d-nav-group">
                <a class="group-header" style="cursor:pointer"
                   onclick="this.parentElement.classList.toggle('expanded')">
                    <span class="d-ico" style="${iconStyle}">${_buildIconTag(item.icon)}</span>
                    <span class="d-label">${label}</span>
                    <i class="fa-solid fa-chevron-right d-arrow"></i>
                </a>
                <div class="d-submenu">
                    ${visibleChildren.map(c => _renderSingleItem(c, styleMode, depth + 1)).join('')}
                </div>
            </div>
        `;
    }

    // Regular item
    return `
        <a id="${_escapeAttr(item.id || '')}"
           ${href} ${target} ${onclick}
           class="${activeClass} ${logoutClass}"
           title="${_escapeAttr(item.label || '')}">
            <span class="d-ico" style="${iconStyle}">${_buildIconTag(item.icon)}</span>
            <span class="d-label">${label}</span>
        </a>
    `;
}

// ==========================================
// ✅ Set Active Nav Item
// ==========================================
window.setActiveNavItem = function (id) {
    if (!id) return;
    _currentActiveId = id;

    document.querySelectorAll('.d-nav a').forEach(a => a.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
};

// ==========================================
// ✅ Render Topbar
// ==========================================
window.renderTopbar = function (options = {}) {
    const topbar = document.getElementById('dTopbar');
    if (!topbar) return;

    const {
        pageTitle = '',
        buttons = [],
        breadcrumb = []
    } = options;

    const currentRole = window.currentUserRole || '';
    const canManageSettings = (typeof window.canManageSettings === 'function')
        ? window.canManageSettings(currentRole)
        : ['super_admin', 'admin'].includes(currentRole);

    // Breadcrumb HTML
    let breadcrumbHtml = '';
    if (breadcrumb.length > 0) {
        breadcrumbHtml = breadcrumb.map((b, i) => {
            const isLast = i === breadcrumb.length - 1;
            if (isLast) {
                return `<span class="text-slate-400">${_escapeHtml(b.label)}</span>`;
            }
            return `<a href="${_escapeAttr(b.href || '#')}" 
                       class="text-blue-600 hover:text-blue-800 hover:underline">${_escapeHtml(b.label)}</a>
                    <i class="fa-solid fa-chevron-right text-[8px] text-slate-300 mx-1"></i>`;
        }).join('');
    }

    // Buttons HTML
    let buttonsHtml = '';
    if (buttons.length > 0) {
        buttonsHtml = buttons.map(btn => {
            const btnClass = btn.class || 'd-btn-mode settings';
            const btnHtml = btn.html || `<i class="${btn.icon || 'fa-solid fa-circle'}"></i><span class="hidden sm:inline">${_escapeHtml(btn.label || '')}</span>`;
            const btnTitle = btn.title ? `title="${_escapeAttr(btn.title)}"` : '';

            return `<button id="${_escapeAttr(btn.id || '')}"
                            ${btn.onclick ? `onclick="${_escapeAttr(btn.onclick)}"` : ''}
                            class="${_escapeAttr(btnClass)}"
                            ${btnTitle}>
                        ${btnHtml}
                    </button>`;
        }).join('');
    }

    // Build Topbar
    topbar.innerHTML = `
        <button class="d-menu" onclick="toggleSidebar()" title="เมนู">
            <i class="fa-solid fa-bars"></i>
        </button>
        <button class="d-collapse" id="collapseBtn" onclick="toggleSidebarCollapse()" title="ย่อ/ขยายเมนู">
            <i class="fa-solid fa-angles-left"></i>
        </button>

        <h2 id="pageTitle" class="page-title">
            ${_escapeHtml(pageTitle)}
        </h2>

        ${breadcrumbHtml ? `<div class="hidden md:flex items-center text-xs ml-2">${breadcrumbHtml}</div>` : ''}

        <div class="d-spacer"></div>

        ${buttonsHtml}

        <!-- Settings Button (แสดงเฉพาะผู้มีสิทธิ์) -->
        <div class="d-settings-wrap">
            <button class="d-settings-btn ${canManageSettings ? '' : 'hidden'}" 
                    id="admin-settings-btn"
                    onclick="if(typeof openSettingsModal==='function')openSettingsModal()"
                    title="ตั้งค่าการแสดงผล">
                <i class="fa-solid fa-sliders"></i>
                <span class="hidden sm:inline">แสดงผล</span>
            </button>
            <div class="d-settings-menu" id="settingsMenu">
                <div class="d-settings-title">ขนาดตัวอักษร</div>
                <div class="d-settings-options">
                    <button type="button" data-font="small" onclick="setFontSize('small')">เล็ก</button>
                    <button type="button" data-font="normal" onclick="setFontSize('normal')">ปกติ</button>
                    <button type="button" data-font="large" onclick="setFontSize('large')">ใหญ่</button>
                </div>
                <div class="d-settings-title">ความหนาแน่น</div>
                <div class="d-settings-options cols-2">
                    <button type="button" data-density="normal" onclick="setDensity('normal')">ปกติ</button>
                    <button type="button" data-density="compact" onclick="setDensity('compact')">กระชับ</button>
                </div>
            </div>
        </div>

        <!-- Date Chip -->
        <div class="d-chip">
            <i class="fa-regular fa-calendar mr-1"></i>
            <span id="todayChip">-</span>
        </div>

        <!-- User Profile -->
        <div class="d-profile">
            <div class="d-avatar-wrap">
                <div class="d-avatar" id="userAvatar">
                    <span id="userAvatarInitial">?</span>
                    <img id="userAvatarImg" src="" alt="" style="display:none;">
                </div>
            </div>
            <div>
                <b id="userName" class="text-sm">กำลังโหลด...</b>
                <small id="userRole">...</small>
            </div>
        </div>
    `;

    // ✅ Restore collapse icon state
    const collapsed = document.body.classList.contains('sidebar-collapsed');
    const collapseBtn = document.getElementById('collapseBtn');
    if (collapseBtn && collapsed) {
        const icon = collapseBtn.querySelector('i');
        if (icon) {
            icon.classList.remove('fa-angles-left');
            icon.classList.add('fa-angles-right');
        }
    }

    // ✅ Apply user info
    if (window.currentProfile) {
        setUserDisplayName(window.currentProfile);
        renderUserAvatar(window.currentProfile);
    }
    if (window.currentUserRole) {
        updateUserRoleLabel(window.currentUserRole);
    }

    // ✅ Apply date
    setTodayChip();
};

// ==========================================
// ✅ Set Today Chip
// ==========================================
window.setTodayChip = function () {
    const chip = document.getElementById('todayChip');
    if (!chip) return;

    const today = new Date();
    const thaiMonths = [
        'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];

    chip.textContent = `${today.getDate()} ${thaiMonths[today.getMonth()]} ${today.getFullYear() + 543}`;
};

// ==========================================
// ✅ Set User Display Name
// ==========================================
window.setUserDisplayName = function (user) {
    const el = document.getElementById('userName');
    if (!el || !user) return;

    const prefix = user.prefix || '';
    const firstName = user.first_name || '';
    const lastName = user.last_name || '';
    const fullName = `${prefix}${firstName} ${lastName}`.trim();

    el.textContent = fullName || 'ผู้ใช้งาน';
};

// ==========================================
// ✅ Update User Role Label
// ==========================================
window.updateUserRoleLabel = function (role) {
    const el = document.getElementById('userRole');
    if (!el) return;

    const roleMap = {
        'super_admin': 'ผู้ดูแลระบบสูงสุด',
        'admin': 'ผู้ดูแลระบบ',
        'director': 'ผู้อำนวยการ',
        'deputy': 'รองผู้อำนวยการ',
        'teacher': 'ครูผู้สอน',
        'staff': 'เจ้าหน้าที่',
        'office': 'เจ้าหน้าที่สำนักงาน'
    };

    el.textContent = roleMap[role] || role || 'ผู้ใช้งาน';
};

// ==========================================
// ✅ Render User Avatar
// ==========================================
window.renderUserAvatar = function (user) {
    if (!user) return;

    const avatarEl = document.getElementById('userAvatar');
    const initialEl = document.getElementById('userAvatarInitial');
    const imgEl = document.getElementById('userAvatarImg');
    if (!avatarEl) return;

    const fullName = `${user.prefix || ''}${user.first_name || ''} ${user.last_name || ''}`.trim();
    const initial = (user.first_name || '?').charAt(0).toUpperCase();

    const avatarUrl = user.avatar_students_url || user.avatar_url || user.profile_image_url;

    if (avatarUrl) {
        let finalUrl = avatarUrl;

        // Normalize Google Drive URL
        if (typeof window.normalizeGoogleDriveUrl === 'function') {
            finalUrl = window.normalizeGoogleDriveUrl(avatarUrl, 200) || avatarUrl;
        }

        if (imgEl && initialEl) {
            imgEl.src = finalUrl;
            imgEl.alt = fullName;
            imgEl.style.display = 'block';
            imgEl.style.width = '100%';
            imgEl.style.height = '100%';
            imgEl.style.objectFit = 'cover';
            imgEl.referrerPolicy = 'no-referrer';
            imgEl.onerror = function () {
                this.onerror = null;
                this.style.display = 'none';
                if (initialEl) initialEl.style.display = 'block';
            };
            initialEl.style.display = 'none';
        }
    } else {
        if (initialEl) {
            initialEl.textContent = initial;
            initialEl.style.display = 'block';
        }
        if (imgEl) imgEl.style.display = 'none';
    }
};

// ==========================================
// ✅ Set Font Size
// ==========================================
window.setFontSize = function (size) {
    document.documentElement.classList.remove('font-small', 'font-normal', 'font-large');
    document.documentElement.classList.add(`font-${size}`);
    try { localStorage.setItem('wrk_font_size', size); } catch (e) { }

    document.querySelectorAll('.d-settings-options button[data-font]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.font === size);
    });
};

// Restore font size
(function restoreFontSize() {
    try {
        const size = localStorage.getItem('wrk_font_size') || 'normal';
        document.documentElement.classList.add(`font-${size}`);
    } catch (e) { }
})();

// ==========================================
// ✅ Set Density
// ==========================================
window.setDensity = function (density) {
    document.documentElement.classList.remove('density-normal', 'density-compact');
    document.documentElement.classList.add(`density-${density}`);
    try { localStorage.setItem('wrk_density', density); } catch (e) { }

    document.querySelectorAll('.d-settings-options button[data-density]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.density === density);
    });
};

// Restore density
(function restoreDensity() {
    try {
        const density = localStorage.getItem('wrk_density') || 'normal';
        document.documentElement.classList.add(`density-${density}`);
    } catch (e) { }
})();

// ==========================================
// ✅ Toggle Settings Menu
// ==========================================
window.toggleSettingsMenu = function () {
    const menu = document.getElementById('settingsMenu');
    if (menu) menu.classList.toggle('show');
};

// Close on outside click
document.addEventListener('click', function (e) {
    const wrap = e.target.closest('.d-settings-wrap');
    if (!wrap) {
        const menu = document.getElementById('settingsMenu');
        if (menu) menu.classList.remove('show');
    }
});

// ==========================================
// ✅ Get Role Text
// ==========================================
window.getRoleText = function (role) {
    const roleMap = {
        'super_admin': 'Super Admin',
        'admin': 'Admin',
        'director': 'ผู้อำนวยการ',
        'deputy': 'รองผู้อำนวยการ',
        'teacher': 'ครูผู้สอน',
        'staff': 'เจ้าหน้าที่',
        'office': 'เจ้าหน้าที่สำนักงาน'
    };
    return roleMap[role] || role || '';
};

// ==========================================
// ✅ INIT MODULE SIDEBAR (Main Entry Point)
// ==========================================
window.initModuleSidebar = async function (options) {
    const {
        moduleKey = null,
        pageTitle = 'หน้าหลัก',
        activeId = null,
        topbarButtons = [],
        fallbackConfig = null,
        onReady = null,
        skipAutoRender = false,
        waitRole = false,
        breadcrumb = null
    } = options;

    _currentModuleKey = moduleKey;
    _currentActiveId = activeId;

    console.log(`🎯 initModuleSidebar: moduleKey="${moduleKey}", skipAutoRender=${skipAutoRender}`);

    // ✅ Load config (DB หรือ fallback)
    const { config: finalConfig, from } = await loadModuleSidebarConfig(moduleKey, fallbackConfig);

    console.log(`📚 Sidebar config [${from}]`);

    // ✅ Auto-render (ถ้าไม่ skip)
    if (!skipAutoRender && finalConfig) {
        renderSidebar(finalConfig);
    }

    // ✅ Render Topbar เสมอ
    renderTopbar({
        pageTitle,
        buttons: topbarButtons,
        breadcrumb: breadcrumb || (moduleKey ? [
            { label: 'หน้าหลัก', href: 'index.html' },
            { label: pageTitle }
        ] : [])
    });

    // ✅ Set active nav
    if (activeId) {
        setTimeout(() => setActiveNavItem(activeId), 100);
    }

    // ✅ onReady callback
    if (typeof onReady === 'function') {
        try {
            await onReady(finalConfig);
        } catch (err) {
            console.warn('⚠️ onReady error:', err);
        }
    }

    return finalConfig;
};

// ==========================================
// ✅ Alias function — backward compatible
// สำหรับ index.html ที่เรียก loadSidebarConfigFromDB
// ==========================================
window.loadSidebarConfigFromDB = async function (configKey) {
    if (!configKey) return null;
    try {
        // ✅ ใช้ cache ก่อน (เร็วกว่า)
        const cacheKey = `wrk_sidebar_cfg_${configKey}`;
        try {
            const raw = sessionStorage.getItem(cacheKey);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed.ts && Date.now() - parsed.ts < 5 * 60 * 1000) {
                    return parsed.data;
                }
            }
        } catch (e) { }

        // ✅ โหลดจาก DB
        const { data, error } = await db
            .from('core_sidebar_config')
            .select('config_data')
            .eq('config_key', configKey)
            .eq('is_active', true)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') throw error;
        if (!data?.config_data) return null;

        // ✅ Validate + cache
        const cfg = data.config_data;
        const hasContent = (cfg.mainMenu?.length > 0) ||
                          (cfg.moduleMenus?.length > 0) ||
                          (cfg.departments?.length > 0);
        if (!hasContent) return null;

        // Cache
        try {
            sessionStorage.setItem(cacheKey, JSON.stringify({
                ts: Date.now(),
                data: cfg
            }));
        } catch (e) { }

        return cfg;
    } catch (err) {
        console.warn(`loadSidebarConfigFromDB("${configKey}") error:`, err);
        return null;
    }
};

console.log('✅ loadSidebarConfigFromDB alias loaded');

// ==========================================
// ✅ Utils: Escape
// ==========================================
function _escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function _escapeAttr(str) {
    return _escapeHtml(str);
}

// ==========================================
// Exports
// ==========================================
window.ensureSidebarConfig = ensureSidebarConfig;
window.loadModuleSidebarConfig = loadModuleSidebarConfig;

console.log('✅ dashboard_sidebar.js loaded (+ Auto-Seed + Role Filter + Icon Colors + Dynamic Departments)');