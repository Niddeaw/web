// ==========================================
// dashboard_sidebar_actions.js
// Central Action Library — ใช้ร่วมทุกโมดูลในหน้า Dashboard
// ----------------------------------------------------
// ใช้คู่กับ: dashboard_sidebar.js (initModuleSidebar)
// โหลดหลัง: config.js
// โหลดก่อน: dashboard_sidebar.js
// ==========================================

window.WRK_SIDEBAR_ACTIONS = {

    // ==========================================
    // Common actions — ใช้ซ้ำได้ทุกโมดูล
    // ==========================================
    common: {
        home: {
            id: 'nav-home',
            icon: 'fa-house',
            label: 'หน้าหลัก',
            href: 'index.html',
            icon_bg_color: '#6366f1',
            icon_text_color: '#ffffff'
        },
        settings: {
            id: 'btn-settings',
            icon: 'fa-gear',
            label: 'ตั้งค่าระบบ',
            icon_bg_color: '#f59e0b',
            icon_text_color: '#ffffff',
            roles: ['super_admin', 'admin'],
            order: 90
        },
        stats: {
            id: 'btn-stats',
            icon: 'fa-chart-pie',
            label: 'รายงานสถิติ',
            icon_bg_color: '#3b82f6',
            icon_text_color: '#ffffff',
            order: 10
        },
        report: {
            id: 'btn-report',
            icon: 'fa-file-lines',
            label: 'รายงาน',
            icon_bg_color: '#6366f1',
            icon_text_color: '#ffffff',
            order: 11
        },
        history: {
            id: 'btn-history',
            icon: 'fa-clock-rotate-left',
            label: 'ประวัติ',
            icon_bg_color: '#8b5cf6',
            icon_text_color: '#ffffff',
            order: 12
        },
        export: {
            id: 'btn-export',
            icon: 'fa-file-excel',
            label: 'ส่งออก Excel',
            icon_bg_color: '#10b981',
            icon_text_color: '#ffffff',
            order: 20
        },
        refresh: {
            id: 'btn-refresh',
            icon: 'fa-rotate',
            label: 'รีเฟรช',
            icon_bg_color: '#64748b',
            icon_text_color: '#ffffff',
            order: 99
        }
    },

    // ==========================================
    // Module-specific actions
    // ==========================================

    // ---------- ระบบงานปกครอง (behavior) ----------
    behavior: {
        dashboard: {
            id: 'navDashboard',
            icon: 'fa-chart-pie',
            label: 'ภาพรวม',
            href: 'behavior_dashboard.html',
            icon_bg_color: '#3b82f6',
            icon_text_color: '#ffffff'
        },
        admin: {
            id: 'navAdmin',
            icon: 'fa-users-cog',
            label: 'จัดการนักเรียน',
            href: 'behavior_admin.html',
            icon_bg_color: '#8b5cf6',
            icon_text_color: '#ffffff'
        },
        teacher: {
            id: 'navTeacher',
            icon: 'fa-user-tie',
            label: 'ครูที่ปรึกษา',
            href: 'behavior_teacher.html',
            icon_bg_color: '#14b8a6',
            icon_text_color: '#ffffff'
        },
        settings: {
            id: 'navSettings',
            icon: 'fa-gear',
            label: 'ตั้งค่าระบบ',
            href: 'behavior_settings.html',
            roles: ['super_admin', 'admin'],
            icon_bg_color: '#f59e0b',
            icon_text_color: '#ffffff'
        }
    },

    // ---------- ระบบเช็คชื่อ (attendance) ----------
    attendance: {
        check: {
            id: 'nav-attendance',
            icon: 'fa-calendar-check',
            label: 'เช็คชื่อ',
            href: 'attendance_teacher.html',
            icon_bg_color: '#3b82f6',
            icon_text_color: '#ffffff'
        },
        stats: {
            id: 'btn-stats-report',
            icon: 'fa-chart-pie',
            label: 'รายงานสถิติ',
            onclick: 'openStatsModal()',
            icon_bg_color: '#3b82f6',
            icon_text_color: '#ffffff'
        },
        grade: {
            id: 'btn-grade-overview',
            icon: 'fa-chart-bar',
            label: 'ภาพรวมระดับชั้น',
            onclick: 'openGradeOverview()',
            icon_bg_color: '#8b5cf6',
            icon_text_color: '#ffffff'
        },
        history: {
            id: 'btn-history',
            icon: 'fa-history',
            label: 'ประวัติการเช็คชื่อ',
            onclick: 'openHistoryModal()',
            icon_bg_color: '#14b8a6',
            icon_text_color: '#ffffff'
        },
        admin: {
            id: 'admin-settings-btn',
            icon: 'fa-cog',
            label: 'ตั้งค่าระบบ',
            onclick: 'openAdminModal()',
            roles: ['super_admin', 'admin'],
            icon_bg_color: '#f59e0b',
            icon_text_color: '#ffffff'
        }
    },

    // ---------- ระบบปฏิทิน (calendar) ----------
    calendar: {
        manage: {
            id: 'nav-calendar',
            icon: 'fa-calendar-alt',
            label: 'จัดการปฏิทิน',
            href: 'calendar_admin.html',
            icon_bg_color: '#6366f1',
            icon_text_color: '#ffffff'
        },
        settings: {
            id: 'btn-settings',
            icon: 'fa-gear',
            label: 'ตั้งค่าระบบ',
            onclick: 'openSettings()',
            roles: ['super_admin', 'admin'],
            icon_bg_color: '#f59e0b',
            icon_text_color: '#ffffff'
        }
    },

        // ---------- ระบบชุมนุม (club_system) ----------
    club_system: {
        myClub: {
            id: 'nav-my-club',
            icon: 'fa-users-rectangle',
            label: 'ชุมนุมของฉัน',
            onclick: "switchSidebarView('teacher')",
            icon_bg_color: '#6366f1',
            icon_text_color: '#ffffff',
            class: 'active'
        },
        manageClubs: {
            id: 'nav-manage-clubs',
            icon: 'fa-layer-group',
            label: 'จัดการชุมนุม',
            onclick: "switchSidebarView('admin', 'admin-tab-clubs')",
            icon_bg_color: '#8b5cf6',
            icon_text_color: '#ffffff',
            hidden: true
        },
        checkStudents: {
            id: 'nav-check-students',
            icon: 'fa-users-viewfinder',
            label: 'ตรวจสอบนักเรียน',
            onclick: "switchSidebarView('admin', 'admin-tab-students')",
            icon_bg_color: '#14b8a6',
            icon_text_color: '#ffffff',
            hidden: true
        },
        settings: {
            id: 'btn-settings',
            icon: 'fa-users-gear',
            label: 'ตั้งค่าระบบ',
            onclick: 'openAdminSettings()',
            icon_bg_color: '#f59e0b',
            icon_text_color: '#ffffff',
            hidden: true
        }
    },

        // ---------- ระบบสารบรรณ (sarabun) ----------
    sarabun: {
        teacherView: {
            id: 'nav-teacher-view',
            icon: 'fa-book-open',
            label: 'ทะเบียนหนังสือรับ',
            onclick: "switchSidebarView('teacherView')",
            icon_bg_color: '#3b82f6',
            icon_text_color: '#ffffff',
            class: 'active'
        },
        adminView: {
            id: 'nav-admin-view',
            icon: 'fa-pen-to-square',
            label: 'จัดการหนังสือ',
            onclick: "switchSidebarView('adminView')",
            icon_bg_color: '#8b5cf6',
            icon_text_color: '#ffffff'
        },
        newDoc: {
            id: 'nav-new-doc',
            icon: 'fa-plus-circle',
            label: 'ลงรับหนังสือใหม่',
            onclick: "switchSidebarView('adminView', 'form')",
            icon_bg_color: '#10b981',
            icon_text_color: '#ffffff'
        },
        settings: {
            id: 'btn-settings',
            icon: 'fa-cog',
            label: 'ตั้งค่าระบบ',
            onclick: 'openSettingsModal()',
            icon_bg_color: '#475569',
            icon_text_color: '#ffffff'
        }
    },

    

    // ==========================================
    // ➕ เพิ่มโมดูลใหม่ที่นี่ (ที่เดียว ไม่ต้องแก้ HTML)
    // ==========================================
    // ,
    // eq: {
    //     admin:   { id: 'nav-admin',   icon: 'fa-clipboard-list', label: 'จัดการแบบประเมิน', href: 'eq_admin.html' },
    //     teacher: { id: 'nav-teacher', icon: 'fa-chalkboard-user', label: 'ทำแบบประเมิน', href: 'eq_teacher.html' },
    //     stats:   { id: 'nav-stats',   icon: 'fa-chart-pie', label: 'สถิติ', onclick: 'openStats()' }
    // },
    // guidance: { ... }
};

// ==========================================
// Helper: ดึง action item
// ==========================================
window.getSidebarAction = function (moduleKey, actionKey, overrides = {}) {
    const commonLib = WRK_SIDEBAR_ACTIONS.common || {};
    const moduleLib = WRK_SIDEBAR_ACTIONS[moduleKey] || {};

    const base = moduleLib[actionKey] || commonLib[actionKey];
    if (!base) {
        console.warn(`⚠️ ไม่พบ sidebar action: ${moduleKey}.${actionKey}`);
        return null;
    }
    return { ...base, ...overrides };
};

// ==========================================
// Helper: สร้าง items array จาก list ของ action keys
// ==========================================
window.buildSidebarItems = function (moduleKey, actionKeys = [], overrides = {}) {
    return actionKeys
        .map(k => getSidebarAction(moduleKey, k, overrides[k] || {}))
        .filter(Boolean);
};

console.log('✅ dashboard_sidebar_actions.js loaded');