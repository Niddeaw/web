// ==========================================
// dashboard_sidebar.js
// Dynamic Sidebar + Topbar renderer
// - แก้ที่เดียว ทุกหน้าอัปเดตอัตโนมัติ
// - Backward compatible กับ dashboard_ui.js
// - Auto active link จาก URL หรือจาก config
// - รองรับ Search input ใน topbar
// ==========================================

// ==========================================
// DEFAULT CONFIG (override ได้จากแต่ละหน้า)
// ==========================================
const SIDEBAR_DEFAULTS = {
    brand: {
        logo: 'https://i.ibb.co/94wLv5v/WRK-PNG-200px.png',
        name: 'WRK System',
        subtitle: 'ยินดีต้อนรับ'
    },
    mainMenuTitle: 'เมนูหลัก',
    mainMenu: [
        { href: 'index.html', icon: 'fa-house', label: 'หน้าหลัก', id: 'nav-home' }
    ],
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
    search: null,                   // { id, placeholder, oninput } | null
    showSettingsMenu: true,
    showChip: true,
    showCollapse: true,
    showHamburger: true,
    profile: { name: 'กำลังโหลด...', role: '...' },
    buttons: []
};

// ==========================================
// ✅ Helper: สร้าง anchor HTML
// ==========================================
function _buildNavItem(item) {
    const attrs = [];

    // รวม class + hidden เข้าด้วยกัน
    let classList = [];
    if (item.class) classList.push(item.class);
    if (item.hidden) classList.push('hidden');

    if (item.id) attrs.push(`id="${item.id}"`);
    if (item.href) attrs.push(`href="${item.href}"`);
    if (item.onclick) attrs.push(`onclick="${item.onclick}"`);
    if (classList.length > 0) attrs.push(`class="${classList.join(' ')}"`);
    if (item.title || item.label) attrs.push(`title="${item.title || item.label}"`);
    if (item.target) attrs.push(`target="${item.target}" rel="noopener"`);

    if (item.dataAttrs) {
        Object.entries(item.dataAttrs).forEach(([k, v]) => attrs.push(`data-${k}="${v}"`));
    }

    // ถ้ามี badge → เพิ่ม UI
    let badgeHtml = '';
    if (item.badge) {
        badgeHtml = `<span class="ml-auto text-[10px] font-bold bg-rose-500 text-white px-1.5 py-0.5 rounded-full">${item.badge}</span>`;
    }

    const iconClass = item.icon && item.icon.includes('fa-brands')
        ? item.icon
        : 'fa-solid ' + (item.icon || 'fa-cube');

    return `
        <a ${attrs.join(' ')}>
            <span class="d-ico"><i class="${iconClass}"></i></span>
            <span class="d-label">${item.label}</span>
            ${badgeHtml}
        </a>
    `;
}

// ==========================================
// ✅ renderSidebar(config)
// ==========================================
function renderSidebar(userConfig = {}) {
    const config = {
        ...SIDEBAR_DEFAULTS,
        ...userConfig,
        brand: { ...SIDEBAR_DEFAULTS.brand, ...(userConfig.brand || {}) },
        facebook: { ...SIDEBAR_DEFAULTS.facebook, ...(userConfig.facebook || {}) }
    };

    const sidebarEl = document.getElementById('dSidebar');
    if (!sidebarEl) {
        console.warn('⚠️ renderSidebar: ไม่พบ #dSidebar');
        return;
    }

    // ---- Brand ----
    let html = `
        <div class="d-brand">
            <div class="d-logo"><img src="${config.brand.logo}" alt="logo"></div>
            <div><b>${config.brand.name}</b><span>${config.brand.subtitle}</span></div>
        </div>
        <nav class="d-nav">
    `;

    // ---- Main Menu ----
    if (config.mainMenu && config.mainMenu.length > 0) {
        html += `<div class="d-nav-title" style="margin-top:4px">${config.mainMenuTitle}</div>`;
        config.mainMenu.forEach(item => { html += _buildNavItem(item); });
    }

    // ---- Module Menus (array ของ group) ----
    if (config.moduleMenus && config.moduleMenus.length > 0) {
        config.moduleMenus.forEach(group => {
            if (group.title) html += `<div class="d-nav-title">${group.title}</div>`;
            (group.items || []).forEach(item => { html += _buildNavItem(item); });
        });
    }

    // ---- Footer Menu ----
    if (config.footerMenu && config.footerMenu.length > 0) {
        html += `<div class="d-nav-title">${config.footerMenuTitle}</div>`;
        config.footerMenu.forEach(item => { html += _buildNavItem(item); });
    }

    // ---- Logout ----
    html += _buildNavItem(config.logoutItem);

    html += `</nav>
        <div class="d-sidebar-bottom">
            <a href="${config.facebook.href}" target="_blank" rel="noopener" class="d-fb-btn">
                <i class="${config.facebook.icon}"></i>
                <span>${config.facebook.label}</span>
            </a>
        </div>
    `;

    sidebarEl.innerHTML = html;

    // ---- Auto activate ----
    if (userConfig.autoActivate !== false) {
        autoActivateFromUrl(userConfig.activeId);
    }

    // ---- Re-bind dashboard_ui events (ถ้ามี) ----
    if (typeof window.enhanceSidebar === 'function') {
        try { window.enhanceSidebar(); } catch (e) { /* ignore */ }
    }
}

// ==========================================
// ✅ renderTopbar(config)
// ==========================================
function renderTopbar(userConfig = {}) {
    const config = {
        ...TOPBAR_DEFAULTS,
        ...userConfig,
        profile: { ...TOPBAR_DEFAULTS.profile, ...(userConfig.profile || {}) },
        buttons: userConfig.buttons || TOPBAR_DEFAULTS.buttons
    };

    const topbarEl = document.getElementById('dTopbar');
    if (!topbarEl) {
        console.warn('⚠️ renderTopbar: ไม่พบ #dTopbar');
        return;
    }

    let html = '';

    // ---- Hamburger ----
    if (config.showHamburger) {
        html += `<button class="d-menu" onclick="toggleSidebar()"><i class="fa-solid fa-bars"></i></button>`;
    }

    // ---- Collapse ----
    if (config.showCollapse) {
        html += `<button class="d-collapse" id="collapseBtn" onclick="toggleSidebarCollapse()" title="ย่อ/ขยายเมนู">
            <i class="fa-solid fa-angles-left"></i>
        </button>`;
    }

    // ---- Search หรือ Title ----
    if (config.search) {
        const sid = config.search.id || 'appSearch';
        const placeholder = config.search.placeholder || 'ค้นหา...';
        const oninput = config.search.oninput ? `oninput="${config.search.oninput}"` : '';
        html += `
            <div class="d-search">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input id="${sid}" placeholder="${placeholder}" ${oninput}>
            </div>
        `;
    } else if (config.pageTitle) {
        html += `<h2 id="pageTitle">${config.pageTitle}</h2>`;
    }

    // ---- Spacer ----
    html += `<div class="d-spacer"></div>`;

    // ---- Custom buttons (โหมด admin/teacher, etc.) ----
    (config.buttons || []).forEach(btn => {
        const btnClass = btn.class || 'hidden hv-topbtn';
        html += `
            <button id="${btn.id}" ${btn.onclick ? `onclick="${btn.onclick}"` : ''}
                class="${btnClass}"
                title="${btn.title || ''}">
                <i class="${btn.icon}"></i>
                <span class="hidden sm:inline">${btn.label || ''}</span>
            </button>
        `;
    });

    // ---- Settings menu ----
    if (config.showSettingsMenu) {
        html += `
            <div class="d-settings-wrap">
                <button class="d-settings-btn" id="settingsBtn" onclick="toggleSettingsMenu()" title="ตั้งค่าการแสดงผล">
                    <i class="fa-solid fa-sliders"></i>
                    <span>แสดงผล</span>
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
        `;
    }

    // ---- Date Chip ----
    if (config.showChip) {
        html += `<div class="d-chip"><i class="fa-regular fa-calendar mr-1"></i> <span id="todayChip">-</span></div>`;
    }

    // ---- Profile ----
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

    // ---- Re-bind dashboard_ui events ----
    if (typeof window.enhanceTopbar === 'function') {
        try { window.enhanceTopbar(); } catch (e) { /* ignore */ }
    }
}

// ==========================================
// ✅ Auto activate จาก URL ปัจจุบัน หรือ forceId
// ==========================================
function autoActivateFromUrl(forceId = null) {
    const currentPage = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();

    let activated = false;
    document.querySelectorAll('.d-nav a').forEach(a => {
        const href = (a.getAttribute('href') || '').toLowerCase();
        // Clear active
        a.classList.remove('active');

        // ถ้า forceId ตรงกับ id → activate
        if (forceId && a.id === forceId) {
            a.classList.add('active');
            activated = true;
            return;
        }

        // match จาก href (ถ้าไม่ได้ forceId)
        if (!forceId && href && href === currentPage) {
            a.classList.add('active');
            activated = true;
        }
    });

    return activated;
}

// ==========================================
// ✅ Helper: แสดง/ซ่อนเมนูตาม ID
// ==========================================
function showNavItem(id, show = true) {
    const el = document.getElementById(id);
    if (!el) return;
    if (show) {
        el.classList.remove('hidden');
    } else {
        el.classList.add('hidden');
    }
}

function hideNavItem(id) {
    showNavItem(id, false);
}

// ==========================================
// ✅ Helper: ตั้ง active link แบบ manual
// ==========================================
function setActiveNavItem(id) {
    document.querySelectorAll('.d-nav a').forEach(a => a.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}

// ==========================================
// ✅ Helper: เพิ่ม/ลบเมนูแบบ dynamic (หลัง render)
// ==========================================
function insertNavItem(item, options = {}) {
    const { groupTitle = null, before = null, after = null } = options;
    const navEl = document.querySelector('#dSidebar .d-nav');
    if (!navEl) return;

    let targetEl = null;

    // ถ้ามี groupTitle → หา title ที่ตรง
    if (groupTitle) {
        const titles = navEl.querySelectorAll('.d-nav-title');
        for (const t of titles) {
            if (t.textContent.trim() === groupTitle) {
                targetEl = t;
                break;
            }
        }
        if (!targetEl) {
            // ถ้าไม่มี title นั้น สร้างใหม่ + append ท้าย nav
            const newTitle = document.createElement('div');
            newTitle.className = 'd-nav-title';
            newTitle.textContent = groupTitle;
            navEl.appendChild(newTitle);
            targetEl = newTitle;
        }
    }

    // Insert ตาม before/after
    const temp = document.createElement('div');
    temp.innerHTML = _buildNavItem(item);
    const newItem = temp.firstElementChild;

    if (before) {
        const ref = document.getElementById(before);
        if (ref) ref.parentNode.insertBefore(newItem, ref);
        else navEl.appendChild(newItem);
    } else if (after) {
        const ref = document.getElementById(after);
        if (ref && ref.nextSibling) ref.parentNode.insertBefore(newItem, ref.nextSibling);
        else navEl.appendChild(newItem);
    } else if (targetEl && targetEl.nextSibling) {
        targetEl.parentNode.insertBefore(newItem, targetEl.nextSibling);
    } else {
        navEl.appendChild(newItem);
    }

    return newItem;
}

// ==========================================
// ✅ Helper: ซ่อนเมนูทั้งหมดในกลุ่มที่ระบุ
// ==========================================
function hideNavItems(ids = []) {
    ids.forEach(id => hideNavItem(id));
}

// ==========================================
// ✅ Helper: แสดงเมนูตาม Role
// ==========================================
function applyNavVisibilityByRole(visibleIds = []) {
    document.querySelectorAll('.d-nav a[id]').forEach(a => {
        const shouldShow = visibleIds.includes(a.id);
        a.classList.toggle('hidden', !shouldShow);
    });
}

// ==========================================
// ✅ Export global
// ==========================================
window.renderSidebar = renderSidebar;
window.renderTopbar = renderTopbar;
window.autoActivateFromUrl = autoActivateFromUrl;
window.showNavItem = showNavItem;
window.hideNavItem = hideNavItem;
window.setActiveNavItem = setActiveNavItem;
window.insertNavItem = insertNavItem;
window.hideNavItems = hideNavItems;
window.applyNavVisibilityByRole = applyNavVisibilityByRole;
window.SIDEBAR_DEFAULTS = SIDEBAR_DEFAULTS;
window.TOPBAR_DEFAULTS = TOPBAR_DEFAULTS;

console.log('✅ dashboard_sidebar.js loaded');