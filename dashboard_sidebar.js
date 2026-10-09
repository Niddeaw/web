// ==========================================
// dashboard_sidebar.js
// Dynamic Sidebar + Topbar Renderer
// + Role-based visibility
// + Icon color support
// + Fix: Profile/Avatar ไม่หายหลัง re-render
// + ✅ Settings Button → เปิด Modal Display Settings
// + ✅ FIX: Breadcrumb แสดงในทุกโหมด (search + title)
// ==========================================

const SIDEBAR_CONFIG_CACHE_KEY = 'cp_sidebar_config_cache';
const SIDEBAR_CONFIG_TTL = 5 * 60 * 1000;

let _sidebarConfigLoading = null;

async function loadSidebarConfigFromDB(configKey = 'default') {
    try {
        const cached = JSON.parse(localStorage.getItem(SIDEBAR_CONFIG_CACHE_KEY) || 'null');
        if (cached && cached.key === configKey && (Date.now() - cached.ts) < SIDEBAR_CONFIG_TTL) {
            return cached.data;
        }
    } catch (e) { }

    if (_sidebarConfigLoading) return _sidebarConfigLoading;

    _sidebarConfigLoading = (async () => {
        try {
            const { data, error } = await db.rpc('get_sidebar_config', { p_key: configKey });
            if (error || !data || Object.keys(data).length === 0) return null;
            try {
                localStorage.setItem(SIDEBAR_CONFIG_CACHE_KEY, JSON.stringify({
                    key: configKey, ts: Date.now(), data
                }));
            } catch (e) { }
            return data;
        } catch (err) {
            console.warn('loadSidebarConfigFromDB error:', err);
            return null;
        } finally {
            _sidebarConfigLoading = null;
        }
    })();

    return _sidebarConfigLoading;
}

function clearSidebarConfigCache() {
    try { localStorage.removeItem(SIDEBAR_CONFIG_CACHE_KEY); } catch (e) { }
}

async function renderSidebarAuto(configKey, overrides = {}) {
    const dbConfig = await loadSidebarConfigFromDB(configKey);
    const finalConfig = { ...(dbConfig || {}), ...overrides };
    renderSidebar(finalConfig);
}

window.loadSidebarConfigFromDB = loadSidebarConfigFromDB;
window.renderSidebarAuto = renderSidebarAuto;
window.clearSidebarConfigCache = clearSidebarConfigCache;

// ==========================================
// SHARED DEPARTMENTS
// ==========================================
const SHARED_DEPARTMENTS = [
    {
        id: 'dept-academic', icon: 'fa-book-open', label: 'บริหารวิชาการ',
        icon_bg_color: '#6366f1', icon_text_color: '#ffffff',
        children: [
            {
                id: 'sub-academic-all', icon: 'fa-chart-pie', label: 'ดูภาพรวมทั้งหมด',
                href: 'index.html#academic', icon_bg_color: '#6366f1', icon_text_color: '#ffffff'
            },
            { id: 'nav-aca-guidance-t', icon: 'fa-compass', label: 'ปพ.5 แนะแนว', href: 'guidance_teacher.html' },
            { id: 'nav-aca-guidance-a', icon: 'fa-user-shield', label: 'ปพ.5 แนะแนว (Admin)', href: 'guidance_admin.html' },
            { id: 'nav-aca-scholarship', icon: 'fa-hand-holding-dollar', label: 'ทุนการศึกษา', href: 'scholarship_teacher.html' },
            { id: 'nav-aca-club', icon: 'fa-users-rectangle', label: 'ชุมนุม', href: 'club_teacher.html' }
        ]
    },
    {
        id: 'dept-budget', icon: 'fa-coins', label: 'บริหารงบประมาณ',
        icon_bg_color: '#10b981', icon_text_color: '#ffffff',
        children: [
            {
                id: 'sub-budget-all', icon: 'fa-chart-pie', label: 'ดูภาพรวมทั้งหมด',
                href: 'index.html#budget', icon_bg_color: '#10b981', icon_text_color: '#ffffff'
            },
            { id: 'nav-bud-overview', icon: 'fa-chart-pie', label: 'ภาพรวมงบประมาณ', href: 'budget_overview.html' },
            { id: 'nav-bud-purchase', icon: 'fa-shopping-cart', label: 'จัดซื้อจัดจ้าง', href: 'purchase.html' },
            { id: 'nav-bud-assets', icon: 'fa-boxes-stacked', label: 'ครุภัณฑ์', href: 'assets.html' }
        ]
    },
    {
        id: 'dept-personnel', icon: 'fa-users', label: 'บริหารงานบุคคล',
        icon_bg_color: '#a855f7', icon_text_color: '#ffffff',
        children: [
            {
                id: 'sub-personnel-all', icon: 'fa-chart-pie', label: 'ดูภาพรวมทั้งหมด',
                href: 'index.html#personnel', icon_bg_color: '#a855f7', icon_text_color: '#ffffff'
            },
            { id: 'nav-per-list', icon: 'fa-id-card', label: 'ข้อมูลบุคลากร', href: 'personnel.html' },
            { id: 'nav-per-leave', icon: 'fa-envelope-open-text', label: 'ระบบการลา', href: 'leave.html' },
            { id: 'nav-per-eval', icon: 'fa-star-half-stroke', label: 'ประเมินผล', href: 'evaluation.html' }
        ]
    },
    {
        id: 'dept-general', icon: 'fa-building', label: 'บริหารทั่วไป',
        icon_bg_color: '#f97316', icon_text_color: '#ffffff',
        children: [
            {
                id: 'sub-general-all', icon: 'fa-chart-pie', label: 'ดูภาพรวมทั้งหมด',
                href: 'index.html#general', icon_bg_color: '#f97316', icon_text_color: '#ffffff'
            },
            { id: 'nav-gen-attendance', icon: 'fa-clipboard-user', label: 'เช็คชื่อหน้าเสาธง', href: 'attendance_teacher.html' },
            { id: 'nav-gen-discipline', icon: 'fa-gavel', label: 'งานปกครอง', href: 'behavior_teacher.html' },
            { id: 'nav-gen-homevisit', icon: 'fa-house-chimney-user', label: 'เยี่ยมบ้านนักเรียน', href: 'homevisit.html' },
            { id: 'nav-gen-calendar', icon: 'fa-calendar-alt', label: 'ปฏิทินกิจกรรม', href: 'calendar_admin.html' }
        ]
    }
];

const SIDEBAR_DEFAULTS = {
    brand: {
        logo: 'https://i.ibb.co/94wLv5v/WRK-PNG-200px.png',
        name: 'WRK System',
        subtitle: 'ยินดีต้อนรับ'
    },
    mainMenuTitle: 'เมนูหลัก',
    mainMenu: [{ href: 'index.html', icon: 'fa-house', label: 'หน้าหลัก', id: 'nav-home' }],
    showAllDepartments: false,
    departmentsTitle: 'กลุ่มบริหารงาน',
    departments: SHARED_DEPARTMENTS,
    moduleMenus: [],
    footerMenuTitle: 'การตั้งค่า',
    footerMenu: [],
    logoutItem: { icon: 'fa-power-off', label: 'ออกจากระบบ', onclick: 'logout()', class: 'logout' },
    facebook: {
        href: 'https://www.facebook.com/WRKOfficial',
        icon: 'fa-brands fa-facebook',
        label: 'ติดตามเพจโรงเรียน'
    }
};

const TOPBAR_DEFAULTS = {
    pageTitle: 'WRK System',
    search: null,
    breadcrumb: null,        // 🆕
    showSettingsMenu: true,
    showChip: true,
    showCollapse: true,
    showHamburger: true,
    profile: { name: 'กำลังโหลด...', role: '...' },
    buttons: []
};

const SS_KEYS = {
    groups: 'cp_sidebar_groups_open',
    sections: 'cp_sidebar_sections_open'
};

function _loadState(key, fallback = {}) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (e) { return fallback; }
}
function _saveState(key, state) {
    try { localStorage.setItem(key, JSON.stringify(state)); } catch (e) { }
}
function _esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ==========================================
// 🎨 Icon Style State (filled | outline)
// ==========================================
let _activeIconStyle = 'filled';   // ค่าเริ่มต้น

function _setGlobalIconStyle(style) {
    _activeIconStyle = (style === 'outline') ? 'outline' : 'filled';
}
window._setGlobalIconStyle = _setGlobalIconStyle;

// ==========================================
// ✅ Icon Style Helpers
// ==========================================
function _isLightColor(hex) {
    if (!hex || typeof hex !== 'string') return false;
    const m = hex.trim().match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (!m) return false;
    const r = parseInt(m[1], 16);
    const g = parseInt(m[2], 16);
    const b = parseInt(m[3], 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.82;   // สว่างเกินไป → ใช้ text_color แทน
}

/**
 * @param {Object} item - sidebar item
 * @param {String} context - 'sidebar' | 'cards' (อื่นๆ คงเดิม)
 */
function _getIconStyle(item, context = 'sidebar') {
    const bg = item.icon_bg_color || '';
    const txt = item.icon_text_color || '';

    // Context อื่นๆ หรือ filled mode → ใช้ค่าปกติ
    if (context !== 'sidebar' || _activeIconStyle !== 'outline') {
        return `background-color: ${bg || 'transparent'}; color: ${txt || 'inherit'};`;
    }

    // ✅ Outline mode: พื้นหลังโปร่งใส + ไอคอนสีจาก bg
    let color = bg;
    if (!color || color === 'transparent' || _isLightColor(color)) {
        color = txt || 'inherit';
    }
    return `background-color: transparent; color: ${color};`;
}

window._getIconStyle = _getIconStyle;

// ==========================================
// ✅ Role-based filter
// ==========================================
function _passesRoleFilter(item) {
    if (!Array.isArray(item.roles) || item.roles.length === 0) return true;
    const userRole = window.currentUserRole;
    if (!userRole) return false;
    return item.roles.includes(userRole);
}

// ==========================================
// _buildNavItem
// ==========================================
function _buildNavItem(item) {
    if (!_passesRoleFilter(item)) return '';

    const attrs = [];
    let classList = [];
    if (item.class) classList.push(item.class);
    if (item.hidden) classList.push('hidden');

    if (item.id) attrs.push(`id="${item.id}"`);
    if (item.href) attrs.push(`href="${item.href}"`);
    if (item.onclick) attrs.push(`onclick="${item.onclick}"`);
    if (classList.length > 0) attrs.push(`class="${classList.join(' ')}"`);
    if (item.title || item.label) attrs.push(`title="${_esc(item.title || item.label)}"`);

    const wantsBlank = item.target_blank === true || item.target_blank === 'true';
    if (wantsBlank) attrs.push(`target="_blank" rel="noopener"`);
    else if (item.target) attrs.push(`target="${item.target}" rel="noopener"`);

    if (item.dataAttrs) {
        Object.entries(item.dataAttrs).forEach(([k, v]) => attrs.push(`data-${k}="${_esc(v)}"`));
    }

    let badgeHtml = '';
    if (item.badge) {
        badgeHtml = `<span class="ml-auto text-[10px] font-bold bg-rose-500 text-white px-1.5 py-0.5 rounded-full">${_esc(item.badge)}</span>`;
    }

    const iconClass = item.icon && item.icon.includes('fa-brands')
        ? item.icon
        : 'fa-solid ' + (item.icon || 'fa-cube');

    const iconStyle = _getIconStyle(item, 'sidebar');

    // Group (มี children)
    if (item.children && item.children.length > 0) {
        const visibleChildren = item.children.filter(child => _passesRoleFilter(child));
        if (visibleChildren.length === 0) return '';

        const groupId = item.id || `group-${Math.random().toString(36).slice(2, 9)}`;
        const childrenHtml = visibleChildren
            .filter(c => !c.hidden)
            .map(child => _buildNavItem(child))
            .join('');

        return `
            <div class="d-nav-group" id="grp-${_esc(groupId)}" data-group-id="${_esc(groupId)}">
                <a class="group-header" onclick="toggleSidebarGroup('${_esc(groupId)}')" title="${_esc(item.label)}">
                    <span class="d-ico" style="${iconStyle}"><i class="${iconClass}"></i></span>
                    <span class="d-label">${_esc(item.label)}</span>
                    <i class="fa-solid fa-chevron-right d-arrow"></i>
                    ${badgeHtml}
                </a>
                <div class="d-submenu">
                    ${childrenHtml}
                </div>
            </div>
        `;
    }

    return `
        <a ${attrs.join(' ')}>
            <span class="d-ico" style="${iconStyle}"><i class="${iconClass}"></i></span>
            <span class="d-label">${_esc(item.label)}</span>
            ${badgeHtml}
        </a>
    `;
}

// ==========================================
// _buildSection
// ==========================================
function _buildSection(title, itemsHtml, options = {}) {
    const { collapsible = false, sectionId = null, defaultOpen = true } = options;
    if (!collapsible) return `<div class="d-nav-title">${_esc(title)}</div>${itemsHtml}`;

    const sid = sectionId || `sec-${title.replace(/\s+/g, '-').toLowerCase()}`;
    const state = _loadState(SS_KEYS.sections, {});
    const isOpen = state[sid] !== undefined ? state[sid] : defaultOpen;

    return `
        <div class="d-nav-title collapsible ${isOpen ? '' : 'collapsed'}"
             data-section-id="${_esc(sid)}"
             onclick="toggleSidebarSection('${_esc(sid)}')">
            <i class="fa-solid fa-folder section-icon"></i>
            <span>${_esc(title)}</span>
            <i class="fa-solid fa-chevron-down section-arrow"></i>
        </div>
        <div class="d-nav-section-items ${isOpen ? '' : 'collapsed'}" data-section-items="${_esc(sid)}">
            ${itemsHtml}
        </div>
    `;
}

// ==========================================
// renderSidebar
// ==========================================
function renderSidebar(userConfig = {}) {
    const config = {
        ...SIDEBAR_DEFAULTS,
        ...userConfig,
        brand: { ...SIDEBAR_DEFAULTS.brand, ...(userConfig.brand || {}) },
        facebook: { ...SIDEBAR_DEFAULTS.facebook, ...(userConfig.facebook || {}) }
    };

    // ✅ อ่าน iconStyle จาก config → set global
    // _setGlobalIconStyle(config.iconStyle || 'filled');    // ✅ แบบเติมสีไอคอน
    _setGlobalIconStyle(config.iconStyle || 'outline');   // ✅ default = outline

    if (config.showAllDepartments && (!Array.isArray(config.departments) || config.departments.length === 0)) {
        config.departments = SIDEBAR_DEFAULTS.departments || SHARED_DEPARTMENTS || [];
        console.log('✅ renderSidebar: Fallback departments =', config.departments.length, 'กลุ่ม');
    }

    const sidebarEl = document.getElementById('dSidebar');
    if (!sidebarEl) { console.warn('⚠️ renderSidebar: ไม่พบ #dSidebar'); return; }

    let html = '';
    html += `
        <div class="d-brand">
            <div class="d-logo"><img src="${_esc(config.brand.logo)}" alt="logo"></div>
            <div><b>${_esc(config.brand.name)}</b><span>${_esc(config.brand.subtitle)}</span></div>
        </div>
        <nav class="d-nav">
    `;

    if (config.mainMenu && config.mainMenu.length > 0) {
        const visible = config.mainMenu.filter(_passesRoleFilter);
        const itemsHtml = visible.map(item => _buildNavItem(item)).join('');
        html += _buildSection(config.mainMenuTitle, itemsHtml, {
            collapsible: config.mainMenuCollapsible === true,
            sectionId: 'sec-main',
            defaultOpen: true
        });
    }

    if (config.showAllDepartments && config.departments && config.departments.length > 0) {
        const deptItemsHtml = config.departments
            .filter(_passesRoleFilter)
            .map(dept => _buildNavItem(dept))
            .join('');
        html += _buildSection(config.departmentsTitle, deptItemsHtml, {
            collapsible: config.departmentsCollapsible !== false,
            sectionId: 'sec-departments',
            defaultOpen: config.departmentsDefaultOpen !== false
        });
    }

    if (config.moduleMenus && config.moduleMenus.length > 0) {
        config.moduleMenus.forEach((group, idx) => {
            const visible = (group.items || []).filter(_passesRoleFilter);
            const itemsHtml = visible.map(item => _buildNavItem(item)).join('');
            if (itemsHtml.trim() === '') return;
            html += _buildSection(group.title || `เมนู ${idx + 1}`, itemsHtml, {
                collapsible: group.collapsible === true,
                sectionId: group.sectionId || `sec-module-${idx}`,
                defaultOpen: group.defaultOpen !== false
            });
        });
    }

    if (config.footerMenu && config.footerMenu.length > 0) {
        const visible = config.footerMenu.filter(_passesRoleFilter);
        const itemsHtml = visible.map(item => _buildNavItem(item)).join('');
        html += _buildSection(config.footerMenuTitle, itemsHtml, {
            collapsible: config.footerCollapsible === true,
            sectionId: 'sec-footer',
            defaultOpen: true
        });
    }

    html += _buildNavItem(config.logoutItem);

    html += `</nav>
        <div class="d-sidebar-bottom">
            <a href="${_esc(config.facebook.href)}" target="_blank" rel="noopener" class="d-fb-btn">
                <i class="${config.facebook.icon}"></i>
                <span>${_esc(config.facebook.label)}</span>
            </a>
        </div>
    `;

    sidebarEl.innerHTML = html;
    _restoreGroupStates();

    if (userConfig.autoActivate !== false) autoActivateFromUrl(userConfig.activeId);
    else if (userConfig.activeId) setActiveNavItem(userConfig.activeId);

    _autoExpandActiveParents();

    if (typeof window.enhanceSidebar === 'function') {
        try { window.enhanceSidebar(); } catch (e) { }
    }
}

// ==========================================
// Toggle / Restore / Auto
// ==========================================
function toggleSidebarGroup(groupId, force) {
    const grp = document.getElementById(`grp-${groupId}`);
    if (!grp) return;
    const currentState = grp.classList.contains('expanded');
    const newState = typeof force === 'boolean' ? force : !currentState;
    grp.classList.toggle('expanded', newState);
    const state = _loadState(SS_KEYS.groups, {});
    state[groupId] = newState;
    _saveState(SS_KEYS.groups, state);
}

function _restoreGroupStates() {
    const state = _loadState(SS_KEYS.groups, {});
    document.querySelectorAll('.d-nav-group').forEach(grp => {
        const gid = grp.getAttribute('data-group-id');
        if (gid && state[gid]) grp.classList.add('expanded');
    });
}

function _autoExpandActiveParents() {
    const activeLink = document.querySelector('.d-nav a.active');
    if (!activeLink) return;
    const parentGrp = activeLink.closest('.d-nav-group');
    if (parentGrp) parentGrp.classList.add('expanded');
}

function toggleSidebarSection(sectionId, force) {
    const title = document.querySelector(`.d-nav-title[data-section-id="${sectionId}"]`);
    const items = document.querySelector(`.d-nav-section-items[data-section-items="${sectionId}"]`);
    if (!title || !items) return;
    const currentState = !title.classList.contains('collapsed');
    const newState = typeof force === 'boolean' ? force : !currentState;
    title.classList.toggle('collapsed', !newState);
    items.classList.toggle('collapsed', !newState);
    const state = _loadState(SS_KEYS.sections, {});
    state[sectionId] = newState;
    _saveState(SS_KEYS.sections, state);
}

// ==========================================
// renderTopbar
// ✅ FIX: Breadcrumb render ทุกโหมด (search + title)
// ✅ Settings Button → เปิด Modal Display Settings
// ==========================================
function renderTopbar(userConfig = {}) {
    const config = {
        ...TOPBAR_DEFAULTS,
        ...userConfig,
        profile: { ...TOPBAR_DEFAULTS.profile, ...(userConfig.profile || {}) },
        buttons: userConfig.buttons || TOPBAR_DEFAULTS.buttons
    };

    // ✅ FIX: ถ้ามี window.currentProfile ให้ใช้ข้อมูลจริง
    if (window.currentProfile && window.currentProfile.first_name) {
        const p = window.currentProfile;
        config.profile = {
            name: `${p.prefix || ''}${p.first_name} ${p.last_name}`.trim() || 'ผู้ใช้งาน',
            role: p.position || window.currentUserRole || '...'
        };
    }

    const topbarEl = document.getElementById('dTopbar');
    if (!topbarEl) { console.warn('⚠️ renderTopbar: ไม่พบ #dTopbar'); return; }

    let html = '';
    if (config.showHamburger) html += `<button class="d-menu" onclick="toggleSidebar()"><i class="fa-solid fa-bars"></i></button>`;
    if (config.showCollapse) html += `<button class="d-collapse" id="collapseBtn" onclick="toggleSidebarCollapse()" title="ย่อ/ขยายเมนู"><i class="fa-solid fa-angles-left"></i></button>`;

    // =====================================================
    // 🧭 Page Head — แสดง Breadcrumb ทุกโหมด
    // =====================================================
    const breadcrumbItems = Array.isArray(config.breadcrumb) ? config.breadcrumb : null;

    if (config.search) {
        // ✅ โหมดค้นหา — ใส่ breadcrumb ก่อน search box
        html += `<div id="wrkBreadcrumb" class="d-breadcrumb hidden"></div>`;

        const sid = config.search.id || 'appSearch';
        const placeholder = config.search.placeholder || 'ค้นหา...';
        const oninput = config.search.oninput ? `oninput="${config.search.oninput}"` : '';
        html += `<div class="d-search"><i class="fa-solid fa-magnifying-glass"></i><input id="${sid}" placeholder="${_esc(placeholder)}" ${oninput}></div>`;
    } else {
        // ✅ โหมด title — page head + breadcrumb container
        const title = config.pageTitle || 'WRK System';
        html += `
            <div class="d-page-head">
                <h2 id="pageTitle" class="d-page-title">${_esc(title)}</h2>
                <div id="wrkBreadcrumb" class="d-breadcrumb hidden"></div>
            </div>
        `;
    }

    html += `<div class="d-spacer"></div>`;

    // =====================================================
    // 🔍 Global Search Button
    // =====================================================
    html += `
        <button class="d-icon-btn" onclick="if(window.GlobalSearch)GlobalSearch.open()" title="ค้นหา (Ctrl+K)">
            <i class="fa-solid fa-magnifying-glass"></i>
        </button>
    `;

    // =====================================================
    // 🔔 Notification Button (พร้อม badge)
    // =====================================================
    html += `
        <button class="d-icon-btn" onclick="if(window.NotificationCenter)NotificationCenter.open()" title="การแจ้งเตือน" id="wrkNotifBtn">
            <i class="fa-solid fa-bell"></i>
            <span id="wrkNotifBadge" class="d-notif-badge hidden">0</span>
        </button>
    `;

    // Custom buttons (จาก initModuleSidebar)
    (config.buttons || []).forEach(btn => {
        const btnClass = btn.class || 'hidden hv-topbtn';
        const innerHTML = btn.html || `<i class="${btn.icon}"></i><span class="hidden sm:inline">${_esc(btn.label || '')}</span>`;
        html += `<button id="${btn.id}" ${btn.onclick ? `onclick="${btn.onclick}"` : ''} class="${btnClass}" title="${_esc(btn.title || '')}">${innerHTML}</button>`;
    });

    // ✅ Settings Button → เปิด Modal Display Settings
    if (config.showSettingsMenu) {
        html += `
            <div class="d-settings-wrap">
                <button class="d-settings-btn" id="settingsBtn" onclick="openDisplaySettingsModal()" title="ตั้งค่าการแสดงผล">
                    <i class="fa-solid fa-sliders"></i><span>แสดงผล</span>
                </button>
            </div>
        `;
    }

    if (config.showChip) html += `<div class="d-chip"><i class="fa-regular fa-calendar mr-1"></i> <span id="todayChip">-</span></div>`;

    html += `
        <div class="d-profile">
            <div class="d-avatar-wrap">
                <div class="d-avatar" id="userAvatar">
                    <span id="userAvatarInitial">?</span>
                    <img id="userAvatarImg" src="" alt="" style="display:none;">
                </div>
                <img id="userAvatarPreview" class="d-avatar-preview" src="" alt="" style="display:none;">
            </div>
            <div>
                <b id="userName" class="text-sm">${config.profile.name}</b>
                <small id="userRole">${config.profile.role}</small>
            </div>
        </div>
    `;

    topbarEl.innerHTML = html;

    // ✅ FIX: วาด Avatar กลับทันที
    if (window.currentProfile && typeof renderUserAvatar === 'function') {
        try { renderUserAvatar(window.currentProfile); } catch (e) { }
    }
    // ✅ FIX: อัปเดตวันที่กลับทันที
    if (typeof setTodayChip === 'function') {
        try { setTodayChip(); } catch (e) { }
    }

    // =====================================================
    // 🧭 Breadcrumb: ถ้ามี config.breadcrumb → set ทันที
    // =====================================================
    if (breadcrumbItems && breadcrumbItems.length > 0 && window.Breadcrumb) {
        try {
            window.Breadcrumb.set(breadcrumbItems);
        } catch (e) {
            console.warn('Breadcrumb.set error:', e);
        }
    }

    // =====================================================
    // 🔔 อัปเดต Notification badge
    // =====================================================
    if (window.NotificationCenter && typeof window.NotificationCenter._updateBadge === 'function') {
        try { window.NotificationCenter._updateBadge(); } catch (e) { }
    }

    if (typeof window.enhanceTopbar === 'function') {
        try { window.enhanceTopbar(); } catch (e) { }
    }
}

// ==========================================
// Auto activate / Helpers
// ==========================================
function autoActivateFromUrl(forceId = null) {
    const currentPage = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
    let activated = false;
    document.querySelectorAll('.d-nav a').forEach(a => {
        const href = (a.getAttribute('href') || '').toLowerCase();
        a.classList.remove('active');
        if (forceId && a.id === forceId) { a.classList.add('active'); activated = true; return; }
        if (!forceId && href && href === currentPage) { a.classList.add('active'); activated = true; }
    });
    return activated;
}

function showNavItem(id, show = true) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('hidden', !show);
}
function hideNavItem(id) { showNavItem(id, false); }
function hideNavItems(ids = []) { ids.forEach(id => hideNavItem(id)); }
function setActiveNavItem(id) {
    document.querySelectorAll('.d-nav a').forEach(a => a.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) {
        el.classList.add('active');
        const parentGrp = el.closest('.d-nav-group');
        if (parentGrp) parentGrp.classList.add('expanded');
    }
}
function applyNavVisibilityByRole(visibleIds = []) {
    document.querySelectorAll('.d-nav a[id]').forEach(a => {
        const shouldShow = visibleIds.includes(a.id);
        a.classList.toggle('hidden', !shouldShow);
    });
}

window.renderSidebar = renderSidebar;
window.renderTopbar = renderTopbar;
window.autoActivateFromUrl = autoActivateFromUrl;
window.showNavItem = showNavItem;
window.hideNavItem = hideNavItem;
window.hideNavItems = hideNavItems;
window.setActiveNavItem = setActiveNavItem;
window.applyNavVisibilityByRole = applyNavVisibilityByRole;
window.toggleSidebarGroup = toggleSidebarGroup;
window.toggleSidebarSection = toggleSidebarSection;
window.SHARED_DEPARTMENTS = SHARED_DEPARTMENTS;
window.SIDEBAR_DEFAULTS = SIDEBAR_DEFAULTS;
window.TOPBAR_DEFAULTS = TOPBAR_DEFAULTS;

console.log('✅ dashboard_sidebar.js loaded (+ Breadcrumb fix + Role filter + Icon colors + Display Modal)');