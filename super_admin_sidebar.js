// ==========================================
// super_admin_sidebar.js (ฉบับสมบูรณ์)
// + Role UI
// + Drag&Drop
// + Auto-Sync
// + Departments Collapse Fix
// + Dynamic Departments from core_system_modules
// ==========================================

// ---------- State ----------
let sidebarProfiles = [];
let currentProfileKey = 'default';
let currentSidebarConfig = null;
let isSidebarDirty = false;

// ✅ Cache สำหรับ departments ที่สร้างจาก modules
let _cachedDepartmentsFromModules = null;

// ---------- Icon Catalog ----------
const FA_ICONS = [
    'fa-house', 'fa-star', 'fa-list', 'fa-chart-line', 'fa-chart-pie', 'fa-chart-bar',
    'fa-chart-column', 'fa-users', 'fa-user', 'fa-user-tie', 'fa-user-shield',
    'fa-user-graduate', 'fa-user-plus', 'fa-user-group', 'fa-chalkboard-user',
    'fa-school', 'fa-school-flag', 'fa-building', 'fa-building-columns',
    'fa-book', 'fa-book-open', 'fa-book-atlas', 'fa-graduation-cap', 'fa-award',
    'fa-trophy', 'fa-medal', 'fa-crown', 'fa-calendar', 'fa-calendar-days',
    'fa-calendar-check', 'fa-calendar-plus', 'fa-clock', 'fa-bell', 'fa-envelope',
    'fa-envelope-open-text', 'fa-id-card', 'fa-address-book', 'fa-address-card',
    'fa-coins', 'fa-money-bill', 'fa-hand-holding-dollar', 'fa-hand-holding-heart',
    'fa-cart-shopping', 'fa-boxes-stacked', 'fa-box-open', 'fa-warehouse',
    'fa-clipboard', 'fa-clipboard-user', 'fa-clipboard-list', 'fa-clipboard-check',
    'fa-clipboard-question', 'fa-gavel', 'fa-shield', 'fa-shield-halved',
    'fa-shield-heart', 'fa-star-half-stroke', 'fa-house-chimney', 'fa-house-chimney-user',
    'fa-location-dot', 'fa-gear', 'fa-sliders', 'fa-wrench', 'fa-tools',
    'fa-screwdriver-wrench', 'fa-key', 'fa-lock', 'fa-unlock', 'fa-right-from-bracket',
    'fa-power-off', 'fa-compass', 'fa-map', 'fa-map-location-dot', 'fa-comments',
    'fa-comment', 'fa-message', 'fa-headset', 'fa-folder', 'fa-folder-open',
    'fa-folder-tree', 'fa-file', 'fa-file-lines', 'fa-file-invoice', 'fa-file-excel',
    'fa-image', 'fa-photo-film', 'fa-video', 'fa-camera', 'fa-download', 'fa-upload',
    'fa-cloud', 'fa-cloud-arrow-up', 'fa-check', 'fa-circle-check', 'fa-circle-info',
    'fa-triangle-exclamation', 'fa-circle-exclamation', 'fa-plus', 'fa-minus',
    'fa-xmark', 'fa-pen', 'fa-pen-to-square', 'fa-trash', 'fa-trash-can',
    'fa-copy', 'fa-clone', 'fa-arrow-up', 'fa-arrow-down', 'fa-arrow-right',
    'fa-arrow-left', 'fa-bars', 'fa-bars-staggered', 'fa-ellipsis', 'fa-ellipsis-vertical',
    'fa-heart', 'fa-thumbs-up', 'fa-face-smile', 'fa-lightbulb', 'fa-fire', 'fa-bolt',
    'fa-flask', 'fa-microscope', 'fa-dna', 'fa-calculator', 'fa-ruler', 'fa-globe',
    'fa-language', 'fa-earth-asia', 'fa-handshake', 'fa-people-group', 'fa-people-roof',
    'fa-person-chalkboard', 'fa-person-running', 'fa-person-swimming', 'fa-spinner',
    'fa-circle-notch', 'fa-rotate', 'fa-database', 'fa-server', 'fa-network-wired',
    'fa-mobile-screen', 'fa-desktop', 'fa-print', 'fa-inbox', 'fa-paper-plane',
    'fa-tag', 'fa-tags', 'fa-bookmark', 'fa-flag', 'fa-sitemap', 'fa-diagram-project',
    'fa-square-poll-vertical', 'fa-square-check', 'fa-user-doctor', 'fa-user-nurse',
    'fa-bus', 'fa-utensils', 'fa-mug-hot', 'fa-layer-group', 'fa-cubes', 'fa-cube',
    'fa-microchip', 'fa-code', 'fa-terminal', 'fa-link', 'fa-share',
    'fa-regular fa-calendar', 'fa-regular fa-calendar-check', 'fa-regular fa-calendar-days',
    'fa-regular fa-clock', 'fa-regular fa-star', 'fa-regular fa-heart',
    'fa-regular fa-user', 'fa-regular fa-envelope', 'fa-regular fa-file',
    'fa-regular fa-folder', 'fa-regular fa-comment', 'fa-regular fa-bell',
    'fa-regular fa-circle-check', 'fa-regular fa-square-check', 'fa-regular fa-image',
    'fa-brands fa-facebook', 'fa-brands fa-google', 'fa-brands fa-line',
    'fa-brands fa-youtube', 'fa-brands fa-github', 'fa-brands fa-discord',
    'fa-brands fa-tiktok', 'fa-brands fa-instagram'
];

// ---------- Helper: build icon tag ----------
function buildIconTag(iconValue, color = '') {
    const style = color ? `style="color: ${color};"` : '';
    if (!iconValue) return `<i class="fa-solid fa-cube" ${style}></i>`;
    if (iconValue.includes('fa-brands') || iconValue.includes('fa-regular')) return `<i class="${iconValue}" ${style}></i>`;
    const cleaned = iconValue.replace(/^fa-solid\s+/, '');
    return `<i class="fa-solid ${cleaned}" ${style}></i>`;
}

// ---------- Helper: Role badge ----------
function getRoleCatalog() {
    return window.WRK_ROLE_CATALOG || [
        { value: 'super_admin', label: 'Super Admin', color: '#9333ea', icon: 'fa-crown' },
        { value: 'admin', label: 'Admin', color: '#2563eb', icon: 'fa-user-shield' },
        { value: 'director', label: 'ผู้อำนวยการ', color: '#0891b2', icon: 'fa-user-tie' },
        { value: 'deputy', label: 'รองผู้อำนวยการ', color: '#06b6d4', icon: 'fa-user-tie' },
        { value: 'teacher', label: 'ครูผู้สอน', color: '#e11d48', icon: 'fa-chalkboard-user' },
        { value: 'staff', label: 'เจ้าหน้าที่', color: '#f59e0b', icon: 'fa-user' },
        { value: 'office', label: 'เจ้าหน้าที่สำนักงาน', color: '#10b981', icon: 'fa-briefcase' }
    ];
}

function getRoleColor(value) {
    const cat = getRoleCatalog().find(r => r.value === value);
    return cat ? cat.color : '#64748b';
}
function getRoleLabel(value) {
    const cat = getRoleCatalog().find(r => r.value === value);
    return cat ? cat.label : value;
}
function getRoleIcon(value) {
    const cat = getRoleCatalog().find(r => r.value === value);
    return cat ? cat.icon : 'fa-user';
}

// ==========================================
// ✅ Helper: สร้าง Overview Item ของแต่ละกลุ่มงาน
//    ใช้ร่วมกันทั้ง buildDepartmentsFromModules,
//    getFallbackDepartments, และ SHARED_DEPARTMENTS
// ==========================================
function buildOverviewItem(category) {
    const META = {
        academic:  { id: 'sub-academic-all',  label: 'ดูภาพรวมทั้งหมด', icon: 'fa-chart-pie', color: '#6366f1' },
        budget:    { id: 'sub-budget-all',    label: 'ดูภาพรวมทั้งหมด', icon: 'fa-chart-pie', color: '#10b981' },
        personnel: { id: 'sub-personnel-all', label: 'ดูภาพรวมทั้งหมด', icon: 'fa-chart-pie', color: '#a855f7' },
        general:   { id: 'sub-general-all',   label: 'ดูภาพรวมทั้งหมด', icon: 'fa-chart-pie', color: '#f97316' }
    };
    const m = META[category];
    if (!m) return null;

    return {
        id: m.id,
        icon: m.icon,
        label: m.label,
        // ✅ ใช้ href (ไม่ใช่ onclick) เพื่อให้คลิกได้จากทุกหน้า
        // index.html จะฟัง hashchange แล้ว switchTab ให้
        href: `index.html#${category}`,
        icon_bg_color: m.color,
        icon_text_color: '#ffffff',
        _isOverview: true
    };
}

// ==========================================
// ✅ Dynamic Departments Builder (จาก core_system_modules)
// ==========================================

/**
 * สร้าง departments array จากตาราง core_system_modules
 * จัดกลุ่มตาม category → academic / budget / personnel / general
 * @param {boolean} forceReload - บังคับโหลดใหม่ ไม่ใช้ cache
 * @returns {Promise<Array|null>} departments array หรือ null ถ้าไม่มีข้อมูล
 */
async function buildDepartmentsFromModules(forceReload = false) {
    if (_cachedDepartmentsFromModules && !forceReload) {
        return _cachedDepartmentsFromModules;
    }

    try {
        const { data: modules, error } = await db
            .from('core_system_modules')
            .select('module_id, module_name, icon, url, category, display_order, is_active, target_blank, icon_bg_color, icon_text_color')
            .eq('is_active', true)
            .order('category')
            .order('display_order', { ascending: true });

        if (error) throw error;
        if (!modules || modules.length === 0) {
            console.warn('⚠️ buildDepartmentsFromModules: ไม่พบโมดูลที่เปิดใช้งาน');
            return null;
        }

        // ✅ Metadata ของแต่ละกลุ่มงาน
        const DEPT_META = {
            academic:  { id: 'dept-academic',  label: 'บริหารวิชาการ',   icon: 'fa-book-open',  icon_bg_color: '#3b82f6' },
            budget:    { id: 'dept-budget',    label: 'บริหารงบประมาณ',   icon: 'fa-coins',      icon_bg_color: '#10b981' },
            personnel: { id: 'dept-personnel', label: 'บริหารงานบุคคล',  icon: 'fa-users',      icon_bg_color: '#a855f7' },
            general:   { id: 'dept-general',   label: 'บริหารทั่วไป',     icon: 'fa-building',   icon_bg_color: '#f97316' }
        };

        // Group by category
        const grouped = {};
        modules.forEach(m => {
            const cat = m.category || 'general';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(m);
        });

        // Build departments array (เฉพาะกลุ่มที่มีโมดูล)
        const departments = [];
        for (const [catKey, meta] of Object.entries(DEPT_META)) {
            const items = grouped[catKey] || [];
            if (items.length === 0) continue;

            // ✅ เริ่มด้วย Overview เสมอ
const children = [];

const overview = buildOverviewItem(catKey);
if (overview) children.push(overview);

// แล้วตามด้วยโมดูลจริง
items.forEach(m => {
    children.push({
        id: `${m.module_id}_nav`,
        icon: (m.icon || 'fa-solid fa-cube').replace(/^fa-solid\s+/, ''),
        label: m.module_name,
        href: m.url || '#',
        target_blank: m.target_blank === true,
        icon_bg_color: m.icon_bg_color || '#f1f5f9',
        icon_text_color: m.icon_text_color || '#475569',
        _sourceModule: m.module_id,
        _autoSynced: true
    });
});

            departments.push({
                id: meta.id,
                icon: meta.icon,
                label: meta.label,
                icon_bg_color: meta.icon_bg_color,
                icon_text_color: '#ffffff',
                children
            });
        }

        if (departments.length === 0) return null;

        _cachedDepartmentsFromModules = departments;
        console.log('✅ buildDepartmentsFromModules:', departments.length, 'กลุ่ม /',
                    departments.reduce((s, d) => s + d.children.length, 0), 'โมดูล');
        return departments;

    } catch (err) {
        console.error('❌ buildDepartmentsFromModules error:', err);
        return null;
    }
}

/**
 * ล้าง cache (เรียกเมื่อบันทึก/เปลี่ยนโมดูล)
 */
function clearDepartmentsCache() {
    _cachedDepartmentsFromModules = null;
}

/**
 * ✅ Fallback สุดท้าย — ใช้เฉพาะเมื่อโหลดจาก DB ไม่ได้จริงๆ
 * ไม่มี hardcoded link — คืนเป็น 4 กลุ่มงานว่างๆ
 */
function getFallbackDepartments() {
    const defs = [
        { cat: 'academic',  id: 'dept-academic',  icon: 'fa-book-open',  label: 'บริหารวิชาการ',  color: '#3b82f6' },
        { cat: 'budget',    id: 'dept-budget',    icon: 'fa-coins',      label: 'บริหารงบประมาณ',  color: '#10b981' },
        { cat: 'personnel', id: 'dept-personnel', icon: 'fa-users',      label: 'บริหารงานบุคคล', color: '#a855f7' },
        { cat: 'general',   id: 'dept-general',   icon: 'fa-building',   label: 'บริหารทั่วไป',    color: '#f97316' }
    ];

    return defs.map(d => {
        const overview = buildOverviewItem(d.cat);
        return {
            id: d.id,
            icon: d.icon,
            label: d.label,
            icon_bg_color: d.color,
            icon_text_color: '#ffffff',
            children: overview ? [overview] : []
        };
    });
}

// ==========================================
// Role Selector rendering
// ==========================================
function renderRoleSelectorHtml(pathPrefix, idx, item) {
    const roles = Array.isArray(item.roles) ? item.roles : [];
    const catalog = getRoleCatalog();
    const hasRoles = roles.length > 0;

    let badges = '';
    if (!hasRoles) {
        badges = `<span class="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">ทุกคน</span>`;
    } else if (roles.length <= 3) {
        badges = roles.map(r => `
            <span class="text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap"
                style="background:${getRoleColor(r)}20; color:${getRoleColor(r)};">
                ${escapeHtml(getRoleLabel(r))}
            </span>
        `).join('');
    } else {
        badges = `<span class="text-[9px] font-bold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">${roles.length} roles</span>`;
    }

    const popoverId = `role-popover-${pathPrefix.replace(/\./g, '-')}-${idx}`;

    const checkboxesHtml = catalog.map(r => {
        const checked = roles.includes(r.value) ? 'checked' : '';
        return `
            <label class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" ${checked}
                    onchange="toggleItemRole('${pathPrefix}.${idx}', '${r.value}', this.checked)"
                    class="w-4 h-4 rounded" style="accent-color:${r.color};">
                <i class="fa-solid ${r.icon} text-xs" style="color:${r.color};"></i>
                <span class="text-xs font-bold" style="color:${r.color};">${escapeHtml(r.label)}</span>
            </label>
        `;
    }).join('');

    return `
        <div class="relative shrink-0" id="role-wrap-${pathPrefix.replace(/\./g, '-')}-${idx}">
            <button type="button"
                onclick="toggleRolePopover(event, '${popoverId}')"
                class="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition shrink-0"
                title="กำหนดสิทธิ์การมองเห็น">
                <i class="fa-solid fa-user-lock text-[10px] text-slate-500"></i>
                <div class="flex items-center gap-0.5 flex-wrap max-w-[160px]">
                    ${badges}
                </div>
                <i class="fa-solid fa-chevron-down text-[8px] text-slate-400"></i>
            </button>

            <div id="${popoverId}"
                class="hidden absolute right-0 top-full mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-2xl z-[100] p-2">
                <div class="flex items-center justify-between px-2 py-1 mb-1 border-b border-slate-100">
                    <span class="text-[10px] font-bold text-slate-500 uppercase">กำหนดสิทธิ์</span>
                    <button type="button"
                        onclick="clearItemRoles('${pathPrefix}.${idx}')"
                        class="text-[10px] text-rose-500 hover:text-rose-700 font-bold">ล้าง</button>
                </div>
                <div class="space-y-0.5 max-h-64 overflow-y-auto">
                    ${checkboxesHtml}
                </div>
                <div class="text-[9px] text-slate-400 mt-2 pt-2 border-t border-slate-100 text-center">
                    ไม่ติ๊ก = ทุกคนเห็น
                </div>
            </div>
        </div>
    `;
}

// ==========================================
// Popover control
// ==========================================
function toggleRolePopover(evt, popoverId) {
    evt.stopPropagation();
    document.querySelectorAll('[id^="role-popover-"]').forEach(el => {
        if (el.id !== popoverId) el.classList.add('hidden');
    });
    const el = document.getElementById(popoverId);
    if (el) el.classList.toggle('hidden');
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('[id^="role-wrap-"]') && !e.target.closest('[id^="role-popover-"]')) {
        document.querySelectorAll('[id^="role-popover-"]').forEach(el => el.classList.add('hidden'));
    }
});

// ==========================================
// Role manipulation
// ==========================================
function toggleItemRole(path, role, isChecked) {
    const item = getItemByPath(path);
    if (!item) return;
    if (!Array.isArray(item.roles)) item.roles = [];
    const idx = item.roles.indexOf(role);
    if (isChecked && idx === -1) item.roles.push(role);
    else if (!isChecked && idx !== -1) item.roles.splice(idx, 1);
    if (item.roles.length === 0) delete item.roles;
    markSidebarDirty();
    renderSidebarEditor();
    const popoverId = `role-popover-${path.replace(/\./g, '-')}`;
    const el = document.getElementById(popoverId);
    if (el) el.classList.remove('hidden');
}

function clearItemRoles(path) {
    const item = getItemByPath(path);
    if (!item) return;
    delete item.roles;
    markSidebarDirty();
    renderSidebarEditor();
}

// ==========================================
// Default Config
// ==========================================
function getDefaultSidebarConfig() {
    return {
        _meta: { display_name: 'ค่าเริ่มต้น (Default)', description: 'ใช้เมื่อไม่พบโปรไฟล์เฉพาะของ role' },
        brand: { logo: 'https://i.ibb.co/94wLv5v/WRK-PNG-200px.png', name: 'WRK System', subtitle: 'School Management System' },
        mainMenuTitle: 'เมนูหลัก',
        mainMenuCollapsible: false,
        mainMenu: [{ id: 'homeTabBtn', icon: 'fa-house', label: 'หน้าหลัก', onclick: 'switchToHome()', class: 'active' }],
        showAllDepartments: false,
        departmentsCollapsible: true,
        departmentsDefaultOpen: true,
        departmentsTitle: 'กลุ่มบริหารงาน',
        departments: [],
        moduleMenus: [{
            title: 'กลุ่มบริหารงาน',
            sectionId: 'sec-departments',
            collapsible: true,
            defaultOpen: true,
            items: [{
                id: 'academic', icon: 'fa-book-open', label: 'บริหารวิชาการ',
                children: [
                    { id: 'sub-academic-all', icon: 'fa-chart-pie', label: 'ดูภาพรวมทั้งหมด', onclick: "switchMainTab('academic', null)" }
                ]
            }]
        }],
        footerMenuTitle: 'การตั้งค่า',
        footerCollapsible: true,
        footerMenu: [{ icon: 'fa-key', label: 'เปลี่ยนรหัสผ่าน', onclick: 'changeMyPassword()' }],
        logoutItem: { icon: 'fa-power-off', label: 'ออกจากระบบ', onclick: 'logout()', class: 'logout' },
        facebook: { href: 'https://www.facebook.com/WRKOfficial', icon: 'fa-brands fa-facebook', label: 'ติดตามเพจโรงเรียน' }
    };
}

// ==========================================
// Load & Render Profiles
// ==========================================
async function loadSidebarProfiles() {
    const container = document.getElementById('sidebar-profiles-list');
    if (container) container.innerHTML = '<div class="text-slate-400 text-sm p-3 text-center"><i class="fa-solid fa-circle-notch fa-spin"></i> กำลังโหลด...</div>';

    try {
        const { data, error } = await db.from('core_sidebar_config').select('config_key, config_data, is_active, updated_at').order('config_key');
        if (error) throw error;
        sidebarProfiles = data || [];

        if (!sidebarProfiles.find(p => p.config_key === 'default')) {
            await db.rpc('save_sidebar_config', { p_key: 'default', p_data: getDefaultSidebarConfig() });
            return loadSidebarProfiles();
        }

        renderProfilesList();
        if (!sidebarProfiles.find(p => p.config_key === currentProfileKey)) currentProfileKey = 'default';
        await selectSidebarProfile(currentProfileKey, true);
    } catch (err) {
        console.error(err);
        if (container) container.innerHTML = `<div class="text-red-500 text-sm p-3">Error: ${escapeHtml(err.message)}</div>`;
    }
}

function renderProfilesList() {
    const container = document.getElementById('sidebar-profiles-list');
    if (!container) return;
    if (sidebarProfiles.length === 0) {
        container.innerHTML = '<div class="text-gray-400 text-sm p-3 text-center">ยังไม่มีโปรไฟล์</div>';
        return;
    }
    container.innerHTML = sidebarProfiles.map(p => {
        const active = p.config_key === currentProfileKey;
        const meta = p.config_data?._meta || {};
        const displayName = meta.display_name || p.config_key;
        const roleIcon = { 'default': 'fa-star', 'teacher': 'fa-chalkboard-user', 'admin': 'fa-user-shield', 'office': 'fa-briefcase', 'depthead': 'fa-users', 'index': 'fa-house', 'super_admin': 'fa-crown' }[p.config_key] || 'fa-folder';
        const inactive = p.is_active === false;
        return `
        <button onclick="selectSidebarProfile('${escapeAttr(p.config_key)}')"
            class="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all
                ${active ? 'bg-indigo-50 border-indigo-300 text-indigo-700 shadow-sm font-bold' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'}">
            <i class="fa-solid ${roleIcon} text-base"></i>
            <div class="flex-1 min-w-0">
                <div class="text-sm font-bold truncate">${escapeHtml(displayName)}</div>
                <div class="text-[10px] font-mono text-slate-400 truncate">${escapeHtml(p.config_key)}</div>
            </div>
            ${inactive ? '<span class="text-[9px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full shrink-0">ปิด</span>' : ''}
        </button>`;
    }).join('');
}

async function selectSidebarProfile(key, skipConfirm = false) {
    if (!skipConfirm && isSidebarDirty) {
        const { isConfirmed } = await Swal.fire({
            icon: 'warning', title: 'มีการแก้ไขที่ยังไม่บันทึก',
            text: 'ต้องการสลับโปรไฟล์และทิ้งการแก้ไขใช่หรือไม่?',
            showCancelButton: true, confirmButtonText: 'ทิ้งการแก้ไข', cancelButtonText: 'ยกเลิก'
        });
        if (!isConfirmed) return;
    }
    currentProfileKey = key;
    isSidebarDirty = false;
    const profile = sidebarProfiles.find(p => p.config_key === key);
    if (!profile) return;
    currentSidebarConfig = profile.config_data || getDefaultSidebarConfig();
    if (!currentSidebarConfig._meta) currentSidebarConfig._meta = {};
    renderProfilesList();
    renderSidebarEditor();
    renderSidebarPreview();
    updateSidebarDirtyBadge();
}

// ==========================================
// Create / Clone / Delete Profile
// ==========================================
async function createNewSidebarProfile() {
    const { value: formValues } = await Swal.fire({
        title: 'สร้างโปรไฟล์ Sidebar ใหม่',
        html: `
            <input id="swal-prof-key" class="swal2-input" placeholder="key (เช่น teacher, admin, office)">
            <input id="swal-prof-name" class="swal2-input" placeholder="ชื่อที่แสดง (เช่น ครูผู้สอน)">
            <input id="swal-prof-desc" class="swal2-input" placeholder="คำอธิบาย (ไม่บังคับ)">
            <div class="text-xs text-slate-500 mt-2 text-left px-2">
                <b>Tip:</b> ใช้ key ตรงกับ role ในระบบ: default, teacher, admin, office, depthead, super_admin
            </div>`,
        focusConfirm: false, showCancelButton: true,
        confirmButtonText: '<i class="fa-solid fa-plus"></i> สร้าง', cancelButtonText: 'ยกเลิก',
        preConfirm: () => {
            const key = document.getElementById('swal-prof-key').value.trim().toLowerCase().replace(/\s+/g, '_');
            const name = document.getElementById('swal-prof-name').value.trim();
            const desc = document.getElementById('swal-prof-desc').value.trim();
            if (!key) { Swal.showValidationMessage('กรุณากรอก key'); return false; }
            if (!/^[a-z0-9_]+$/.test(key)) { Swal.showValidationMessage('key ต้องเป็น a-z, 0-9, _ เท่านั้น'); return false; }
            if (sidebarProfiles.find(p => p.config_key === key)) { Swal.showValidationMessage('key นี้มีอยู่แล้ว'); return false; }
            return { key, name, desc };
        }
    });
    if (!formValues) return;
    Swal.fire({ title: 'กำลังสร้าง...', didOpen: () => Swal.showLoading() });
    try {
        const cfg = getDefaultSidebarConfig();
        cfg._meta = { display_name: formValues.name, description: formValues.desc || '' };
        const { data, error } = await db.rpc('save_sidebar_config', { p_key: formValues.key, p_data: cfg });
        if (error) throw error;
        if (data && data.success === false) throw new Error(data.error || 'บันทึกไม่สำเร็จ');
        await loadSidebarProfiles();
        await selectSidebarProfile(formValues.key, true);
        Swal.fire({ icon: 'success', title: 'สร้างโปรไฟล์สำเร็จ', timer: 1500, showConfirmButton: false });
    } catch (err) { Swal.fire('ผิดพลาด', err.message, 'error'); }
}

async function cloneSidebarProfile() {
    const { value: newKey } = await Swal.fire({
        title: `คัดลอกโปรไฟล์ "${currentProfileKey}"`,
        input: 'text', inputPlaceholder: 'key ของโปรไฟล์ใหม่',
        showCancelButton: true,
        confirmButtonText: '<i class="fa-solid fa-copy"></i> คัดลอก', cancelButtonText: 'ยกเลิก',
        inputValidator: (v) => {
            if (!v) return 'กรุณากรอก key';
            if (!/^[a-z0-9_]+$/.test(v)) return 'key ต้องเป็น a-z, 0-9, _ เท่านั้น';
            if (sidebarProfiles.find(p => p.config_key === v)) return 'key นี้มีอยู่แล้ว';
            return null;
        }
    });
    if (!newKey) return;
    Swal.fire({ title: 'กำลังคัดลอก...', didOpen: () => Swal.showLoading() });
    try {
        const cloned = JSON.parse(JSON.stringify(currentSidebarConfig));
        cloned._meta = { display_name: `${newKey} (คัดลอกจาก ${currentProfileKey})`, description: '' };
        const { data, error } = await db.rpc('save_sidebar_config', { p_key: newKey, p_data: cloned });
        if (error) throw error;
        if (data && data.success === false) throw new Error(data.error || 'บันทึกไม่สำเร็จ');
        await loadSidebarProfiles();
        await selectSidebarProfile(newKey, true);
        Swal.fire({ icon: 'success', title: 'คัดลอกสำเร็จ', timer: 1500, showConfirmButton: false });
    } catch (err) { Swal.fire('ผิดพลาด', err.message, 'error'); }
}

async function deleteSidebarProfile() {
    if (currentProfileKey === 'default') return Swal.fire('ไม่อนุญาต', 'ไม่สามารถลบโปรไฟล์ default ได้', 'warning');
    const { isConfirmed } = await Swal.fire({
        icon: 'warning', title: `ลบโปรไฟล์ "${currentProfileKey}"?`,
        text: 'การลบไม่สามารถกู้คืนได้', showCancelButton: true,
        confirmButtonColor: '#dc2626', confirmButtonText: 'ลบเลย', cancelButtonText: 'ยกเลิก'
    });
    if (!isConfirmed) return;
    Swal.fire({ title: 'กำลังลบ...', didOpen: () => Swal.showLoading() });
    try {
        const { error } = await db.from('core_sidebar_config').delete().eq('config_key', currentProfileKey);
        if (error) throw error;
        currentProfileKey = 'default';
        await loadSidebarProfiles();
        Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1500, showConfirmButton: false });
    } catch (err) { Swal.fire('ผิดพลาด', err.message, 'error'); }
}

// ==========================================
// Save Config
// ==========================================
async function saveSidebarConfig() {
    if (!currentSidebarConfig) return;
    const nameInput = document.getElementById('sb_profile_display_name');
    if (nameInput) {
        if (!currentSidebarConfig._meta) currentSidebarConfig._meta = {};
        currentSidebarConfig._meta.display_name = nameInput.value.trim() || currentProfileKey;
    }

    // ✅ Auto-fill departments: ดึงจาก modules ก่อน → fallback SHARED → fallback minimal
    if (currentSidebarConfig.showAllDepartments &&
        (!currentSidebarConfig.departments || currentSidebarConfig.departments.length === 0)) {

        let sharedDepts = null;

        // 1) ลองดึงจาก core_system_modules (แหล่งข้อมูลจริง)
        sharedDepts = await buildDepartmentsFromModules();

        // 2) ถ้าดึงไม่ได้ → ลองใช้ SHARED_DEPARTMENTS จาก dashboard_sidebar.js
        if (!sharedDepts) {
            try {
                if (typeof SHARED_DEPARTMENTS !== 'undefined' && Array.isArray(SHARED_DEPARTMENTS)) {
                    sharedDepts = SHARED_DEPARTMENTS;
                    console.log('⚠️ ใช้ SHARED_DEPARTMENTS เป็น fallback');
                }
            } catch (e) { /* ignore */ }
        }

        // 3) สุดท้าย → minimal fallback (4 กลุ่มว่าง)
        if (!sharedDepts) {
            sharedDepts = getFallbackDepartments();
            console.log('⚠️ ใช้ getFallbackDepartments (minimal) เป็น fallback');
        }

        currentSidebarConfig.departments = JSON.parse(JSON.stringify(sharedDepts));
        if (!currentSidebarConfig.departmentsTitle) {
            currentSidebarConfig.departmentsTitle = 'กลุ่มบริหารงาน';
        }
        console.log('✅ Auto-filled departments:', currentSidebarConfig.departments.length, 'กลุ่ม');
    }

    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading() });

    try {
        const { data, error } = await db.rpc('save_sidebar_config', {
            p_key: currentProfileKey,
            p_data: currentSidebarConfig
        });

        if (error) throw error;
        if (data && data.success === false) throw new Error(data.error || 'บันทึกไม่สำเร็จ');

        isSidebarDirty = false;
        updateSidebarDirtyBadge();

        // ✅ ล้าง Cache
        if (typeof clearSidebarConfigCache === 'function') {
            clearSidebarConfigCache();
        }
        try {
            localStorage.removeItem('cp_sidebar_config_cache');
        } catch (e) {}

        // ✅ Reload Profiles
        const { data: refreshed } = await db
            .from('core_sidebar_config')
            .select('config_key, config_data, is_active, updated_at')
            .order('config_key');
        if (refreshed) {
            sidebarProfiles = refreshed;
            renderProfilesList();
        }

        console.log('✅ บันทึก Sidebar Config สำเร็จ:', currentProfileKey);
        Swal.fire({
            icon: 'success',
            title: 'บันทึกสำเร็จ',
            text: `โปรไฟล์ "${currentProfileKey}"`,
            timer: 1500,
            showConfirmButton: false
        });

    } catch (err) {
        console.error('❌ saveSidebarConfig error:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

function markSidebarDirty() { isSidebarDirty = true; updateSidebarDirtyBadge(); }
function updateSidebarDirtyBadge() {
    const badge = document.getElementById('sidebar-dirty-badge');
    if (!badge) return;
    badge.classList.toggle('hidden', !isSidebarDirty);
    badge.classList.toggle('inline-flex', isSidebarDirty);
}

// ==========================================
// Editor Rendering
// ==========================================
function renderSidebarEditor() {
    if (!currentSidebarConfig) return;
    const brand = currentSidebarConfig.brand || {};
    setVal('sb_brand_logo', brand.logo || '');
    setVal('sb_brand_name', brand.name || '');
    setVal('sb_brand_subtitle', brand.subtitle || '');
    setVal('sb_main_title', currentSidebarConfig.mainMenuTitle || 'เมนูหลัก');
    setVal('sb_dept_title', currentSidebarConfig.departmentsTitle || 'กลุ่มบริหารงาน');
    setVal('sb_footer_title', currentSidebarConfig.footerMenuTitle || 'การตั้งค่า');
    setVal('sb_profile_display_name', (currentSidebarConfig._meta || {}).display_name || currentProfileKey);
    const keyLabel = document.getElementById('current_profile_key_label');
    if (keyLabel) keyLabel.textContent = currentProfileKey;

    // Departments checkboxes
    const showAll = document.getElementById('sb_show_all_depts');
    if (showAll) showAll.checked = !!currentSidebarConfig.showAllDepartments;

    const deptCollapsible = document.getElementById('sb_departments_collapsible');
    if (deptCollapsible) {
        deptCollapsible.checked = currentSidebarConfig.departmentsCollapsible !== false;
        deptCollapsible.disabled = !currentSidebarConfig.showAllDepartments;
    }

    const deptOpen = document.getElementById('sb_departments_default_open');
    if (deptOpen) {
        deptOpen.checked = currentSidebarConfig.departmentsDefaultOpen !== false;
        deptOpen.disabled = !currentSidebarConfig.showAllDepartments ||
                            currentSidebarConfig.departmentsCollapsible === false;
    }

    renderItemList('sb_main_menu_list', currentSidebarConfig.mainMenu || [], 'mainMenu');
    renderItemList('sb_footer_menu_list', currentSidebarConfig.footerMenu || [], 'footerMenu');
    renderModuleMenus();

    const fb = currentSidebarConfig.facebook || {};
    setVal('sb_fb_href', fb.href || '');
    setVal('sb_fb_label', fb.label || '');
}

function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
}

function renderModuleMenus() {
    const container = document.getElementById('sb_module_menus_list');
    if (!container) return;
    const modules = currentSidebarConfig.moduleMenus || [];
    if (modules.length === 0) {
        container.innerHTML = '<div class="text-gray-400 text-sm p-4 text-center border-2 border-dashed rounded-xl">ยังไม่มีกลุ่มโมดูล</div>';
        return;
    }
    container.innerHTML = modules.map((mod, idx) => `
    <div class="bg-white border border-slate-200 rounded-2xl shadow-sm" data-module-idx="${idx}">
        <div class="bg-slate-50 px-4 py-3 flex items-center gap-3 border-b border-slate-200 rounded-t-2xl">
            <i class="fa-solid fa-grip-vertical text-slate-400 cursor-grab module-drag-handle"></i>
            <input type="text" value="${escapeAttr(mod.title || '')}"
                oninput="updateModuleMenu(${idx}, 'title', this.value)"
                class="flex-1 bg-transparent border-0 font-bold text-slate-800 outline-none focus:bg-white focus:border focus:border-indigo-300 rounded px-2 py-1 text-sm">
            <label class="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                <input type="checkbox" ${mod.collapsible ? 'checked' : ''}
                    onchange="updateModuleMenu(${idx}, 'collapsible', this.checked)"
                    class="w-3.5 h-3.5 text-indigo-600 rounded">
                <span>พับได้</span>
            </label>
            <label class="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                <input type="checkbox" ${mod.defaultOpen !== false ? 'checked' : ''}
                    onchange="updateModuleMenu(${idx}, 'defaultOpen', this.checked)"
                    class="w-3.5 h-3.5 text-indigo-600 rounded">
                <span>เปิดเริ่มต้น</span>
            </label>
            <button onclick="deleteModuleMenu(${idx})"
                class="text-rose-500 hover:bg-rose-50 h-7 w-7 rounded-lg transition-colors">
                <i class="fa-solid fa-trash text-xs"></i>
            </button>
        </div>
        <div class="p-3">
            <div id="module-items-${idx}" class="space-y-2"
                 data-module-idx="${idx}"
                 data-sortable-path="moduleMenus.${idx}.items">
                ${renderSubItemsHtml(mod.items || [], `moduleMenus.${idx}.items`)}
            </div>
            <button onclick="addSubItem('moduleMenus.${idx}.items')"
                class="mt-2 w-full py-2 border-2 border-dashed border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 hover:border-indigo-300 hover:text-indigo-600 text-xs font-bold transition-all">
                <i class="fa-solid fa-plus mr-1"></i> เพิ่มรายการย่อย
            </button>
        </div>
    </div>
    `).join('');
    initSidebarSortables();
}

function renderItemList(containerId, items, pathPrefix) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.setAttribute('data-sortable-path', pathPrefix);
    if (items.length === 0) {
        container.innerHTML = '<div class="text-gray-400 text-xs p-3 text-center border-2 border-dashed rounded-xl empty-hint">ยังไม่มีรายการ</div>';
    } else {
        container.innerHTML = renderSubItemsHtml(items, pathPrefix);
    }
}

function renderSubItemsHtml(items, pathPrefix, level = 0) {
    return items.map((item, idx) => {
        const hasChildren = item.children && item.children.length > 0;
        const isAutoSynced = item._sourceModule && item._autoSynced;
        const wantsBlank = item.target_blank === true || item.target_blank === 'true';

        return `
        <div class="border ${isAutoSynced ? 'border-emerald-300 bg-emerald-50/30' : 'border-slate-200 bg-white'} rounded-xl shadow-sm" data-item-path="${pathPrefix}.${idx}">
            <div class="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 transition-colors flex-wrap rounded-xl">
                <i class="fa-solid fa-grip-vertical sub-drag-handle text-slate-300 cursor-grab text-xs"></i>

                <div class="flex items-center gap-1.5 shrink-0 border border-slate-200 rounded-lg p-1 bg-white">
                    <button onclick="openIconPicker('${pathPrefix}.${idx}')"
                        class="w-8 h-8 rounded-md flex items-center justify-center transition-colors shadow-sm"
                        style="background-color: ${item.icon_bg_color || '#f1f5f9'}; color: ${item.icon_text_color || '#475569'};"
                        title="เปลี่ยนไอคอน">
                        ${buildIconTag(item.icon)}
                    </button>

                    <div class="flex flex-col items-center" title="สีพื้นหลังไอคอน">
                        <input type="color" value="${item.icon_bg_color || '#f1f5f9'}"
                            onchange="updateItem('${pathPrefix}.${idx}', 'icon_bg_color', this.value)"
                            class="w-4 h-4 p-0 border-0 rounded cursor-pointer bg-transparent">
                        <span class="text-[7px] text-slate-400 mt-0.5">BG</span>
                    </div>

                    <div class="flex flex-col items-center border-l border-slate-200 pl-1.5" title="สีไอคอน">
                        <input type="color" value="${item.icon_text_color || '#475569'}"
                            onchange="updateItem('${pathPrefix}.${idx}', 'icon_text_color', this.value)"
                            class="w-4 h-4 p-0 border-0 rounded cursor-pointer bg-transparent">
                        <span class="text-[7px] text-slate-400 mt-0.5">ICON</span>
                    </div>
                </div>

                <input type="text" value="${escapeAttr(item.label || '')}"
                    oninput="updateItem('${pathPrefix}.${idx}', 'label', this.value)"
                    placeholder="ชื่อเมนู"
                    class="flex-1 min-w-0 bg-transparent border-0 text-sm font-medium text-slate-700 outline-none focus:bg-white focus:border focus:border-indigo-300 rounded px-1.5 py-1">
                <input type="text" value="${escapeAttr(item.href || item.onclick || '')}"
                    oninput="updateItemLink('${pathPrefix}.${idx}', this.value)"
                    placeholder="href หรือ onclick"
                    class="flex-1 min-w-0 bg-transparent border-0 text-xs font-mono text-slate-500 outline-none focus:bg-white focus:border focus:border-indigo-300 rounded px-1.5 py-1"
                    title="ใส่ URL หรือ JS">

                ${renderRoleSelectorHtml(pathPrefix, idx, item)}

                <label class="flex items-center gap-1 cursor-pointer shrink-0" title="เปิดในแท็บใหม่">
                    <input type="checkbox" ${wantsBlank ? 'checked' : ''}
                        onchange="updateItem('${pathPrefix}.${idx}', 'target_blank', this.checked)"
                        class="w-3.5 h-3.5 text-indigo-600 rounded">
                    <i class="fa-solid fa-external-link-alt text-[10px] text-slate-500"></i>
                </label>

                ${item.id ? `<span class="text-[9px] font-mono text-slate-400 px-1.5 py-0.5 bg-slate-100 rounded shrink-0">#${escapeHtml(item.id)}</span>` : ''}
                ${isAutoSynced ? `<span class="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded shrink-0" title="Sync จาก Module: ${escapeAttr(item._sourceModule)}">AUTO</span>` : ''}

                <button onclick="moveItemToGroup('${pathPrefix}.${idx}')"
                    class="text-blue-500 hover:bg-blue-50 h-7 w-7 rounded-lg transition-colors shrink-0"
                    title="ย้ายไปกลุ่มอื่น">
                    <i class="fa-solid fa-arrow-right-arrow-left text-xs"></i>
                </button>
                <button onclick="addChildToItem('${pathPrefix}.${idx}')"
                    class="text-emerald-600 hover:bg-emerald-50 h-7 w-7 rounded-lg transition-colors shrink-0"
                    title="เพิ่มเมนูย่อย">
                    <i class="fa-solid fa-plus text-xs"></i>
                </button>
                <button onclick="deleteItem('${pathPrefix}.${idx}')"
                    class="text-rose-500 hover:bg-rose-50 h-7 w-7 rounded-lg transition-colors shrink-0"
                    title="ลบ">
                    <i class="fa-solid fa-trash text-xs"></i>
                </button>
            </div>
            ${hasChildren ? `
                <div class="pl-10 pr-3 pb-3 space-y-1.5"
                     data-children-of="${pathPrefix}.${idx}"
                     data-sortable-path="${pathPrefix}.${idx}.children">
                    ${renderSubItemsHtml(item.children, `${pathPrefix}.${idx}.children`, level + 1)}
                </div>
            ` : ''}
        </div>`;
    }).join('');
}

// ==========================================
// Item Manipulation
// ==========================================
function getArrayByPath(path) {
    const parts = path.split('.');
    let obj = currentSidebarConfig;
    for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (p === '') continue;
        const num = parseInt(p, 10);
        obj = isNaN(num) ? obj[p] : obj[num];
        if (obj === undefined) return null;
    }
    return obj;
}

function getItemByPath(path) {
    const parts = path.split('.');
    const last = parts.pop();
    const arr = getArrayByPath(parts.join('.'));
    return arr ? arr[parseInt(last, 10)] : null;
}

function updateItem(path, field, value) {
    const item = getItemByPath(path);
    if (!item) return;
    item[field] = value;
    markSidebarDirty();
    renderSidebarPreview();
}

function updateItemLink(path, value) {
    const item = getItemByPath(path);
    if (!item) return;
    const v = value.trim();
    if (/^[\w\-./?=&%#]+\.(html?|php|aspx?)$/i.test(v) || v.startsWith('http')) {
        item.href = v; delete item.onclick;
    } else if (v) {
        item.onclick = v; delete item.href;
    } else {
        delete item.href; delete item.onclick;
    }
    markSidebarDirty();
    renderSidebarPreview();
}

function addItem(pathPrefix) {
    const arr = getArrayByPath(pathPrefix);
    if (!arr) return;
    arr.push({ id: '', icon: 'fa-circle', label: 'เมนูใหม่', href: '#' });
    markSidebarDirty();
    renderSidebarEditor();
    renderSidebarPreview();
}
function addSubItem(pathPrefix) { addItem(pathPrefix); }
function addChildToItem(path) {
    const item = getItemByPath(path);
    if (!item) return;
    if (!item.children) item.children = [];
    item.children.push({ id: '', icon: 'fa-circle', label: 'เมนูย่อย', href: '#' });
    markSidebarDirty();
    renderSidebarEditor();
    renderSidebarPreview();
}
function deleteItem(path) {
    const parts = path.split('.');
    const last = parseInt(parts.pop(), 10);
    const arr = getArrayByPath(parts.join('.'));
    if (!arr || isNaN(last)) return;
    arr.splice(last, 1);
    markSidebarDirty();
    renderSidebarEditor();
    renderSidebarPreview();
}
function addModuleMenu() {
    if (!currentSidebarConfig.moduleMenus) currentSidebarConfig.moduleMenus = [];
    const idx = currentSidebarConfig.moduleMenus.length;
    currentSidebarConfig.moduleMenus.push({
        title: 'กลุ่มใหม่',
        sectionId: `sec-module-${idx}`,
        collapsible: true,
        defaultOpen: true,
        items: []
    });
    markSidebarDirty();
    renderSidebarEditor();
    renderSidebarPreview();
}
function updateModuleMenu(idx, field, value) {
    if (!currentSidebarConfig.moduleMenus[idx]) return;
    currentSidebarConfig.moduleMenus[idx][field] = value;
    markSidebarDirty();
    renderSidebarPreview();
}
function deleteModuleMenu(idx) {
    currentSidebarConfig.moduleMenus.splice(idx, 1);
    markSidebarDirty();
    renderSidebarEditor();
    renderSidebarPreview();
}

// ==========================================
// Move Item
// ==========================================
function getAvailableMoveTargets(currentPath) {
    const targets = [];
    if (Array.isArray(currentSidebarConfig.moduleMenus)) {
        currentSidebarConfig.moduleMenus.forEach((mod, modIdx) => {
            const path = `moduleMenus.${modIdx}.items`;
            if (path === currentPath) return;
            targets.push({ value: path, label: `📁 ${mod.title} (ระดับบน)`, indent: 0 });
        });
    }
    const walk = (items, path, indent = 1) => {
        if (!Array.isArray(items)) return;
        items.forEach((item, idx) => {
            const itemPath = `${path}.${idx}`;
            if (itemPath === currentPath) return;
            if (isDescendantPath(currentPath, itemPath)) return;
            const isHomeBtn = item.id === 'homeTabBtn';
            const isLogout = item.class && item.class.includes('logout');
            if (!isHomeBtn && !isLogout) {
                const childPath = `${itemPath}.children`;
                if (childPath !== currentPath && !isDescendantPath(currentPath, childPath)) {
                    const childCount = (item.children || []).length;
                    targets.push({
                        value: childPath,
                        label: `📂 ${item.label || item.id || '(ไม่มีชื่อ)'}${childCount > 0 ? ` (${childCount})` : ''}`,
                        indent
                    });
                }
            }
            if (item.children) walk(item.children, `${itemPath}.children`, indent + 1);
        });
    };
    if (Array.isArray(currentSidebarConfig.moduleMenus)) {
        currentSidebarConfig.moduleMenus.forEach((mod, modIdx) => {
            walk(mod.items, `moduleMenus.${modIdx}.items`);
        });
    }
    return targets;
}

async function moveItemToGroup(path) {
    const item = getItemByPath(path);
    if (!item) return;
    const targets = getAvailableMoveTargets(path);
    if (targets.length === 0) return Swal.fire('ไม่มีที่ย้าย', 'ไม่พบกลุ่มเป้าหมายให้ย้ายไป', 'info');

    const optionsHtml = targets.map(t => `<option value="${escapeAttr(t.value)}">${'&nbsp;'.repeat((t.indent || 0) * 4)}${escapeHtml(t.label)}</option>`).join('');

    const { value: targetPath } = await Swal.fire({
        title: `<i class="fa-solid fa-arrow-right-arrow-left text-blue-600 mr-2"></i> ย้ายเมนู`,
        html: `
            <p class="text-sm text-slate-600 mb-3 text-left">ย้าย "<b class="text-blue-700">${escapeHtml(item.label)}</b>" ไปยัง:</p>
            <select id="swal-move-target" class="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-blue-500 bg-white">
                <option value="">-- เลือกกลุ่มปลายทาง --</option>
                ${optionsHtml}
            </select>`,
        focusConfirm: false, showCancelButton: true,
        confirmButtonText: '<i class="fa-solid fa-check"></i> ย้ายเลย', cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#2563eb',
        preConfirm: () => {
            const v = document.getElementById('swal-move-target').value;
            if (!v) { Swal.showValidationMessage('กรุณาเลือกปลายทาง'); return false; }
            return v;
        }
    });
    if (!targetPath) return;

    const parts = path.split('.');
    const last = parseInt(parts.pop(), 10);
    const fromArr = getArrayByPath(parts.join('.'));
    if (!fromArr || isNaN(last)) return Swal.fire('ผิดพลาด', 'ไม่พบตำแหน่งต้นทาง', 'error');

    const [movedItem] = fromArr.splice(last, 1);
    if (!movedItem) return Swal.fire('ผิดพลาด', 'ไม่พบ item ต้นทาง', 'error');

    let toArr = null;
    if (targetPath.endsWith('.children')) {
        const parentPath = targetPath.slice(0, -'.children'.length);
        const parentItem = getItemByPath(parentPath);
        if (parentItem) {
            if (!Array.isArray(parentItem.children)) parentItem.children = [];
            toArr = parentItem.children;
        }
    }
    if (!toArr) toArr = getArrayByPath(targetPath);
    if (!toArr) {
        fromArr.splice(last, 0, movedItem);
        return Swal.fire('ผิดพลาด', 'ไม่พบปลายทาง', 'error');
    }

    toArr.push(movedItem);
    markSidebarDirty();
    renderSidebarEditor();
    renderSidebarPreview();
    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'ย้ายสำเร็จ', showConfirmButton: false, timer: 1500 });
}

// ==========================================
// Sortable: Drag & Drop ข้าม Container
// ==========================================
function isDescendantPath(sourcePath, targetPath) {
    return targetPath === sourcePath || targetPath.startsWith(sourcePath + '.');
}

function initSidebarSortables() {
    if (typeof Sortable === 'undefined') return;

    const modContainer = document.getElementById('sb_module_menus_list');
    if (modContainer) {
        if (modContainer._sortable) modContainer._sortable.destroy();
        modContainer._sortable = new Sortable(modContainer, {
            animation: 160, handle: '.module-drag-handle', ghostClass: 'opacity-30',
            group: 'sidebar-sections',
            onEnd: (evt) => {
                const items = currentSidebarConfig.moduleMenus;
                const [moved] = items.splice(evt.oldIndex, 1);
                items.splice(evt.newIndex, 0, moved);
                markSidebarDirty();
                renderSidebarEditor();
                renderSidebarPreview();
            }
        });
    }

    document.querySelectorAll('[data-sortable-path]').forEach(container => {
        if (container.id === 'sb_module_menus_list') return;
        if (container._sortable) container._sortable.destroy();
        container._sortable = new Sortable(container, {
            animation: 150, handle: '.sub-drag-handle',
            ghostClass: 'sortable-ghost', chosenClass: 'sortable-chosen', dragClass: 'sortable-drag',
            group: 'sidebar-items', fallbackOnBody: true, swapThreshold: 0.65, emptyInsertThreshold: 20,
            onEnd: handleSidebarSortEnd
        });
    });
}

function handleSidebarSortEnd(evt) {
    const fromEl = evt.from;
    const toEl = evt.to;
    const fromPath = fromEl.getAttribute('data-sortable-path');
    const toPath = toEl.getAttribute('data-sortable-path');
    if (!fromPath || !toPath) { renderSidebarEditor(); return; }

    const fromArr = getArrayByPath(fromPath);
    if (!fromArr) { renderSidebarEditor(); return; }

    if (fromPath === toPath) {
        const [moved] = fromArr.splice(evt.oldIndex, 1);
        fromArr.splice(evt.newIndex, 0, moved);
        markSidebarDirty(); renderSidebarEditor(); renderSidebarPreview();
        return;
    }

    const movingItemPath = `${fromPath}.${evt.oldIndex}`;
    if (isDescendantPath(movingItemPath, toPath)) {
        Swal.fire({ icon: 'warning', title: 'ย้ายไม่ได้', text: 'ไม่สามารถย้ายเมนูเข้าไปในกลุ่มย่อยของตัวเองได้', timer: 2500, showConfirmButton: false });
        renderSidebarEditor();
        return;
    }

    const [movedItem] = fromArr.splice(evt.oldIndex, 1);
    if (!movedItem) { renderSidebarEditor(); return; }

    let toArr = null;
    if (toPath.endsWith('.children')) {
        const parentPath = toPath.slice(0, -'.children'.length);
        const parentItem = getItemByPath(parentPath);
        if (parentItem) {
            if (!Array.isArray(parentItem.children)) parentItem.children = [];
            toArr = parentItem.children;
        }
    }
    if (!toArr) toArr = getArrayByPath(toPath);
    if (!toArr) {
        fromArr.splice(evt.oldIndex, 0, movedItem);
        renderSidebarEditor();
        return;
    }

    const insertAt = Math.min(evt.newIndex, toArr.length);
    toArr.splice(insertAt, 0, movedItem);
    toEl.querySelectorAll('.empty-hint').forEach(el => el.remove());

    markSidebarDirty();
    renderSidebarEditor();
    renderSidebarPreview();
    Swal.fire({
        toast: true, position: 'top-end', icon: 'success', title: 'ย้ายเมนูสำเร็จ',
        html: `<span class="text-xs text-slate-500">${escapeHtml(fromPath.replace(/\./g, ' › '))} <i class="fa-solid fa-arrow-right mx-1"></i> ${escapeHtml(toPath.replace(/\./g, ' › '))}</span>`,
        showConfirmButton: false, timer: 1800
    });
}

// ==========================================
// Icon Picker
// ==========================================
let _iconPickerTargetPath = null;
let _iconPickerFiltered = FA_ICONS.slice();

function openIconPicker(path) {
    _iconPickerTargetPath = path;
    _iconPickerFiltered = FA_ICONS.slice();
    const modal = document.getElementById('iconPickerModal');
    if (!modal) return;
    modal.classList.remove('hidden'); modal.classList.add('flex');
    renderIconGrid();
    const search = document.getElementById('icon-picker-search');
    if (search) { search.value = ''; setTimeout(() => search.focus(), 100); }
}
function closeIconPicker() {
    const modal = document.getElementById('iconPickerModal');
    if (!modal) return;
    modal.classList.add('hidden'); modal.classList.remove('flex');
    _iconPickerTargetPath = null;
}
function filterIconPicker(q) {
    const kw = (q || '').toLowerCase().trim();
    _iconPickerFiltered = !kw ? FA_ICONS.slice() : FA_ICONS.filter(ic => ic.toLowerCase().includes(kw));
    renderIconGrid();
}
function renderIconGrid() {
    const grid = document.getElementById('icon-picker-grid');
    if (!grid) return;
    if (_iconPickerFiltered.length === 0) {
        grid.innerHTML = '<div class="col-span-full text-center py-8 text-slate-400 text-sm">ไม่พบไอคอน</div>';
        return;
    }
    const currentItem = _iconPickerTargetPath ? getItemByPath(_iconPickerTargetPath) : null;
    const currentIcon = currentItem?.icon || '';
    grid.innerHTML = _iconPickerFiltered.map(ic => {
        const norm = ic.replace(/^fa-solid\s+/, '');
        const curNorm = (currentIcon || '').replace(/^fa-solid\s+/, '');
        const isActive = norm === curNorm && !ic.includes('fa-regular') && !ic.includes('fa-brands');
        return `<button onclick="selectIcon('${escapeAttr(ic)}')"
            class="aspect-square rounded-xl border flex flex-col items-center justify-center gap-1 transition-all
                ${isActive ? 'border-indigo-500 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-200' : 'border-slate-200 bg-white hover:bg-slate-50 hover:border-indigo-300 text-slate-600'}"
            title="${escapeAttr(ic)}">${buildIconTag(ic)}</button>`;
    }).join('');
}
function selectIcon(iconClass) {
    if (!_iconPickerTargetPath) return;
    const item = getItemByPath(_iconPickerTargetPath);
    if (!item) return;
    item.icon = iconClass;
    markSidebarDirty(); closeIconPicker();
    renderSidebarEditor(); renderSidebarPreview();
}

// ==========================================
// Live Preview (async)
// ==========================================
async function renderSidebarPreview() {
    const preview = document.getElementById('sidebar-preview');
    if (!preview || !currentSidebarConfig) return;
    const cfg = currentSidebarConfig;
    const brand = cfg.brand || {};

    // ✅ ดึง departments: ใช้ config ก่อน → ถ้าว่างดึงจาก modules
    let previewDepts = cfg.departments || [];
    if (cfg.showAllDepartments && previewDepts.length === 0) {
        const fromModules = await buildDepartmentsFromModules();
        if (fromModules) {
            previewDepts = fromModules;
            cfg.departments = JSON.parse(JSON.stringify(fromModules)); // cache ลง config
            if (!cfg.departmentsTitle) cfg.departmentsTitle = 'กลุ่มบริหารงาน';
        } else {
            previewDepts = getFallbackDepartments();
        }
    }

    let html = `
        <div class="d-brand">
            <div class="d-logo"><img src="${escapeAttr(brand.logo || '')}" alt="logo" onerror="this.style.display='none'"></div>
            <div><b>${escapeHtml(brand.name || 'WRK System')}</b><span>${escapeHtml(brand.subtitle || '')}</span></div>
        </div>
        <nav class="d-nav">`;

    if (cfg.mainMenu?.length > 0) {
        html += `<div class="d-nav-title">${escapeHtml(cfg.mainMenuTitle || 'เมนูหลัก')}</div>`;
        html += renderPreviewItems(cfg.mainMenu);
    }

    // Departments — render แบบ section พับได้ ตรงกับ renderSidebar() จริง
    if (cfg.showAllDepartments && previewDepts.length > 0) {
        const collapsible = cfg.departmentsCollapsible !== false;
        const defaultOpen = cfg.departmentsDefaultOpen !== false;

        if (collapsible) {
            html += `
                <div class="d-nav-title collapsible ${defaultOpen ? '' : 'collapsed'}">
                    <i class="fa-solid fa-folder section-icon"></i>
                    <span>${escapeHtml(cfg.departmentsTitle || 'กลุ่มบริหารงาน')}</span>
                    <i class="fa-solid fa-chevron-down section-arrow"></i>
                </div>
                <div class="d-nav-section-items ${defaultOpen ? '' : 'collapsed'}">
                    ${renderPreviewItems(previewDepts)}
                </div>
            `;
        } else {
            html += `<div class="d-nav-title">${escapeHtml(cfg.departmentsTitle || 'กลุ่มบริหารงาน')}</div>`;
            html += renderPreviewItems(previewDepts);
        }
    }

    (cfg.moduleMenus || []).forEach(mod => {
        const collapsible = mod.collapsible === true;
        const defaultOpen = mod.defaultOpen !== false;
        const items = renderPreviewItems(mod.items || []);

        if (collapsible) {
            html += `
                <div class="d-nav-title collapsible ${defaultOpen ? '' : 'collapsed'}">
                    <i class="fa-solid fa-folder section-icon"></i>
                    <span>${escapeHtml(mod.title || '')}</span>
                    <i class="fa-solid fa-chevron-down section-arrow"></i>
                </div>
                <div class="d-nav-section-items ${defaultOpen ? '' : 'collapsed'}">
                    ${items}
                </div>
            `;
        } else {
            html += `<div class="d-nav-title">${escapeHtml(mod.title || '')}</div>`;
            html += items;
        }
    });

    if (cfg.footerMenu?.length > 0) {
        const collapsible = cfg.footerCollapsible === true;
        const items = renderPreviewItems(cfg.footerMenu);

        if (collapsible) {
            html += `
                <div class="d-nav-title collapsible">
                    <i class="fa-solid fa-folder section-icon"></i>
                    <span>${escapeHtml(cfg.footerMenuTitle || 'การตั้งค่า')}</span>
                    <i class="fa-solid fa-chevron-down section-arrow"></i>
                </div>
                <div class="d-nav-section-items">
                    ${items}
                </div>
            `;
        } else {
            html += `<div class="d-nav-title">${escapeHtml(cfg.footerMenuTitle || 'การตั้งค่า')}</div>`;
            html += items;
        }
    }

    if (cfg.logoutItem) html += renderPreviewItem(cfg.logoutItem, 0);
    html += `</nav>`;
    preview.innerHTML = html;
}

function renderPreviewItems(items, depth = 0) {
    return items.filter(item => !item.hidden).map(item => renderPreviewItem(item, depth)).join('');
}

function renderPreviewItem(item, depth) {
    const label = escapeHtml(item.label || '');
    const hasChildren = item.children && item.children.length > 0;
    const wantsBlank = item.target_blank === true || item.target_blank === 'true';
    const roles = Array.isArray(item.roles) ? item.roles : [];
    const rolesBadge = roles.length > 0
        ? `<span class="text-[8px] font-bold px-1 py-0.5 rounded ml-1" style="background:#e0e7ff;color:#4338ca;" title="${escapeAttr(roles.join(', '))}"><i class="fa-solid fa-user-lock text-[7px]"></i> ${roles.length}</span>`
        : '';

    const iconStyle = `background-color: ${item.icon_bg_color || 'transparent'}; color: ${item.icon_text_color || 'inherit'};`;

    if (hasChildren) {
        return `
            <div class="d-nav-group expanded">
                <a class="group-header" style="pointer-events:none">
                    <span class="d-ico" style="${iconStyle}">${buildIconTag(item.icon)}</span>
                    <span class="d-label">${label}${rolesBadge}</span>
                    <i class="fa-solid fa-chevron-right d-arrow"></i>
                </a>
                <div class="d-submenu">${renderPreviewItems(item.children, depth + 1)}</div>
            </div>`;
    }
    return `
        <a style="pointer-events:none" ${item.class ? `class="${escapeAttr(item.class)}"` : ''}>
            <span class="d-ico" style="${iconStyle}">${buildIconTag(item.icon)}</span>
            <span class="d-label">${label}${wantsBlank ? ' <i class="fa-solid fa-external-link-alt text-[8px] opacity-60"></i>' : ''}${rolesBadge}</span>
        </a>`;
}

// ==========================================
// Brand / Config Field Updates
// ==========================================
function updateBrandField(field, value) {
    if (!currentSidebarConfig.brand) currentSidebarConfig.brand = {};
    currentSidebarConfig.brand[field] = value;
    markSidebarDirty(); renderSidebarPreview();
}

async function updateConfigField(field, value) {
    currentSidebarConfig[field] = value;
    markSidebarDirty();

    // ✅ เมื่อเปิด showAllDepartments + departments ยังว่าง → ดึงจาก modules อัตโนมัติ
    if (field === 'showAllDepartments' && value === true) {
        const isEmpty = !currentSidebarConfig.departments || currentSidebarConfig.departments.length === 0;
        if (isEmpty) {
            Swal.fire({
                title: 'กำลังโหลดกลุ่มงาน...',
                html: 'ดึงข้อมูลจากระบบย่อยที่เปิดใช้งาน',
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            });

            const depts = await buildDepartmentsFromModules();

            if (depts && depts.length > 0) {
                currentSidebarConfig.departments = JSON.parse(JSON.stringify(depts));
                if (!currentSidebarConfig.departmentsTitle) {
                    currentSidebarConfig.departmentsTitle = 'กลุ่มบริหารงาน';
                }
                Swal.close();
                Swal.fire({
                    toast: true, position: 'top-end', icon: 'success',
                    title: `โหลด ${depts.length} กลุ่มงานสำเร็จ`,
                    timer: 1800, showConfirmButton: false
                });
            } else {
                Swal.close();
                currentSidebarConfig.departments = getFallbackDepartments();
                if (!currentSidebarConfig.departmentsTitle) {
                    currentSidebarConfig.departmentsTitle = 'กลุ่มบริหารงาน';
                }
                Swal.fire({
                    icon: 'info',
                    title: 'ยังไม่มีระบบย่อย',
                    html: `กรุณาเพิ่มระบบที่เมนู <b>"จัดการระบบย่อย"</b> ก่อน<br>
                           <span class="text-sm text-slate-500">ตอนนี้แสดง 4 กลุ่มงานว่างไว้ก่อน</span>`,
                    confirmButtonText: 'เข้าใจแล้ว'
                });
            }
        }
    }

    // Toggle disable/enable checkbox
    if (field === 'showAllDepartments' || field === 'departmentsCollapsible') {
        const deptCollapsible = document.getElementById('sb_departments_collapsible');
        if (deptCollapsible) deptCollapsible.disabled = !currentSidebarConfig.showAllDepartments;
        const deptOpen = document.getElementById('sb_departments_default_open');
        if (deptOpen) {
            deptOpen.disabled = !currentSidebarConfig.showAllDepartments ||
                                currentSidebarConfig.departmentsCollapsible === false;
        }
    }

    renderSidebarPreview();
}

function updateFacebookField(field, value) {
    if (!currentSidebarConfig.facebook) currentSidebarConfig.facebook = {};
    currentSidebarConfig.facebook[field] = value;
    markSidebarDirty(); renderSidebarPreview();
}

function updateProfileMeta(field, value) {
    if (!currentSidebarConfig._meta) currentSidebarConfig._meta = {};
    currentSidebarConfig._meta[field] = value;
    markSidebarDirty();
}

// ==========================================
// ✅ Reload Departments (ปุ่มเล็กๆ ข้าง checkbox)
// ==========================================
async function reloadDepartmentsFromModules() {
    if (!currentSidebarConfig.showAllDepartments) {
        return Swal.fire('แจ้งเตือน', 'กรุณาติ๊ก "แสดง 4 กลุ่มบริหารงาน" ก่อน', 'warning');
    }

    const { isConfirmed } = await Swal.fire({
        icon: 'question',
        title: 'โหลดกลุ่มงานใหม่?',
        html: 'ระบบจะดึงข้อมูลจาก <b>ระบบย่อย (Micro-services)</b><br>ที่เปิดใช้งานทั้งหมดมาทับข้อมูลเดิม',
        showCancelButton: true,
        confirmButtonText: '<i class="fa-solid fa-rotate"></i> โหลดใหม่',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#6366f1'
    });
    if (!isConfirmed) return;

    Swal.fire({ title: 'กำลังโหลด...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    const depts = await buildDepartmentsFromModules(true);
    if (depts && depts.length > 0) {
        currentSidebarConfig.departments = JSON.parse(JSON.stringify(depts));
        markSidebarDirty();
        renderSidebarPreview();
        Swal.close();
        Swal.fire({
            toast: true, position: 'top-end', icon: 'success',
            title: `โหลด ${depts.length} กลุ่มงานสำเร็จ`,
            timer: 1800, showConfirmButton: false
        });
    } else {
        Swal.close();
        Swal.fire('ไม่พบข้อมูล', 'ยังไม่มีระบบย่อยที่เปิดใช้งาน', 'warning');
    }
}

// ==========================================
// Import / Export
// ==========================================
function exportSidebarJSON() {
    const blob = new Blob([JSON.stringify(currentSidebarConfig, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sidebar-${currentProfileKey}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function importSidebarJSON() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,application/json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const parsed = JSON.parse(ev.target.result);
                if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('รูปแบบไม่ถูกต้อง');
                Swal.fire({
                    icon: 'warning', title: 'ยืนยันการนำเข้า?', text: 'ข้อมูลเดิมจะถูกแทนที่',
                    showCancelButton: true, confirmButtonText: 'นำเข้า', cancelButtonText: 'ยกเลิก'
                }).then(r => {
                    if (r.isConfirmed) {
                        currentSidebarConfig = parsed;
                        markSidebarDirty();
                        renderSidebarEditor();
                        renderSidebarPreview();
                        Swal.fire({ icon: 'success', title: 'นำเข้าสำเร็จ', timer: 1200, showConfirmButton: false });
                    }
                });
            } catch (err) { Swal.fire('ผิดพลาด', 'ไม่สามารถอ่านไฟล์ได้: ' + err.message, 'error'); }
        };
        reader.readAsText(file);
    };
    input.click();
}

async function resetToDefaults() {
    const { isConfirmed } = await Swal.fire({
        icon: 'warning', title: 'รีเซ็ตเป็นค่าเริ่มต้น?', text: 'ข้อมูลที่แก้ไขจะถูกแทนที่ด้วยค่า default',
        showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'รีเซ็ต', cancelButtonText: 'ยกเลิก'
    });
    if (!isConfirmed) return;
    const fresh = getDefaultSidebarConfig();
    fresh._meta = { ...fresh._meta, ...(currentSidebarConfig._meta || {}) };
    currentSidebarConfig = fresh;
    markSidebarDirty();
    renderSidebarEditor();
    renderSidebarPreview();
    Swal.fire({ icon: 'success', title: 'รีเซ็ตแล้ว', text: 'อย่าลืมกดบันทึก', timer: 1500, showConfirmButton: false });
}

// ==========================================
// Sync ทั้งหมด
// ==========================================
async function syncAllToSidebar() {
    if (typeof window.syncAllModulesToSidebar !== 'function') {
        return Swal.fire('ไม่พร้อมใช้งาน', 'ไม่พบฟังก์ชัน syncAllModulesToSidebar — ตรวจสอบ super_admin_school.js', 'error');
    }
    const { isConfirmed } = await Swal.fire({
        icon: 'question',
        title: 'Sync ทั้งหมด?',
        html: `ระบบจะเพิ่ม <b>Micro-services ทั้งหมด</b><br>ที่ยังไม่มีใน Sidebar เข้าไปโดยอัตโนมัติ<br><span class="text-xs text-slate-500">(แยกกลุ่มตาม <b>กลุ่มงาน</b> ของแต่ละระบบ)</span>`,
        showCancelButton: true,
        confirmButtonText: '<i class="fa-solid fa-rotate"></i> Sync เลย',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#10b981'
    });
    if (!isConfirmed) return;
    await window.syncAllModulesToSidebar();
    await loadSidebarProfiles();
}

// ==========================================
// Utils
// ==========================================
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escapeAttr(str) { return escapeHtml(str); }

// ==========================================
// Exports
// ==========================================
window.loadSidebarProfiles = loadSidebarProfiles;
window.selectSidebarProfile = selectSidebarProfile;
window.createNewSidebarProfile = createNewSidebarProfile;
window.cloneSidebarProfile = cloneSidebarProfile;
window.deleteSidebarProfile = deleteSidebarProfile;
window.saveSidebarConfig = saveSidebarConfig;
window.addItem = addItem;
window.addSubItem = addSubItem;
window.addChildToItem = addChildToItem;
window.deleteItem = deleteItem;
window.addModuleMenu = addModuleMenu;
window.updateModuleMenu = updateModuleMenu;
window.deleteModuleMenu = deleteModuleMenu;
window.updateItem = updateItem;
window.updateItemLink = updateItemLink;
window.openIconPicker = openIconPicker;
window.closeIconPicker = closeIconPicker;
window.filterIconPicker = filterIconPicker;
window.selectIcon = selectIcon;
window.updateBrandField = updateBrandField;
window.updateConfigField = updateConfigField;
window.updateFacebookField = updateFacebookField;
window.updateProfileMeta = updateProfileMeta;
window.exportSidebarJSON = exportSidebarJSON;
window.importSidebarJSON = importSidebarJSON;
window.resetToDefaults = resetToDefaults;
window.renderSidebarPreview = renderSidebarPreview;
window.syncAllToSidebar = syncAllToSidebar;
window.moveItemToGroup = moveItemToGroup;
window.initSidebarSortables = initSidebarSortables;
window.handleSidebarSortEnd = handleSidebarSortEnd;
window.isDescendantPath = isDescendantPath;
window.toggleItemRole = toggleItemRole;
window.clearItemRoles = clearItemRoles;
window.toggleRolePopover = toggleRolePopover;

// ✅ Exports ของ Dynamic Departments
window.getFallbackDepartments = getFallbackDepartments;
window.buildDepartmentsFromModules = buildDepartmentsFromModules;
window.clearDepartmentsCache = clearDepartmentsCache;
window.reloadDepartmentsFromModules = reloadDepartmentsFromModules;

console.log('✅ super_admin_sidebar.js loaded (+ Role UI + Drag&Drop + Auto-Sync + Dynamic Departments)');