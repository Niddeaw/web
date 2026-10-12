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
        home: {
            id: 'nav-home',
            icon: 'fa-house',
            label: 'หน้าหลัก',
            href: 'index.html',
            icon_bg_color: '#6366f1',
            icon_text_color: '#ffffff'
        },
        teacherView: {
            id: 'nav-teacher-view',
            icon: 'fa-book-open',
            label: 'ทะเบียนหนังสือรับ',
            onclick: "switchSidebarView('teacherView')",
            icon_bg_color: '#3b82f6',
            icon_text_color: '#ffffff'
        },
        adminView: {
            id: 'nav-admin-view',
            icon: 'fa-pen-to-square',
            label: 'จัดการหนังสือ',
            onclick: "switchSidebarView('adminView')",
            roles: ['super_admin', 'admin', 'director', 'deputy'],
            moduleAdmin: 'sarabun',   // ✅ เพิ่มบรรทัดนี้
            icon_bg_color: '#8b5cf6',
            icon_text_color: '#ffffff'
        },
        newDoc: {
            id: 'nav-new-doc',
            icon: 'fa-plus-circle',
            label: 'ลงรับหนังสือใหม่',
            onclick: "switchSidebarView('adminView', 'form')",
            roles: ['super_admin', 'admin', 'director', 'deputy'],
            moduleAdmin: 'sarabun',   // ✅ เพิ่มบรรทัดนี้
            icon_bg_color: '#10b981',
            icon_text_color: '#ffffff'
        },
        settings: {
            id: 'btn-settings',
            icon: 'fa-cog',
            label: 'ตั้งค่าระบบ',
            onclick: 'openSettingsModal()',
            roles: ['super_admin', 'admin'],   // ✅ ใส่ admin ด้วย (ถ้าต้องการให้ admin เห็น)
            icon_bg_color: '#475569',
            icon_text_color: '#ffffff'
        },
        logout: {
            icon: 'fa-power-off',
            label: 'ออกจากระบบ',
            onclick: 'logout()',
            class: 'logout'
        }
    },

    // ---------- ระบบประเมิน EQ (eq) ----------
    eq: {
        dashboard: {
            id: 'nav-eq-dashboard',
            icon: 'fa-brain',
            label: 'แดชบอร์ด EQ',
            onclick: "window.scrollTo({top:0,behavior:'smooth'})",
            icon_bg_color: '#8b5cf6',
            icon_text_color: '#ffffff',
            class: 'active'
        },
        settings: {
            id: 'btn-settings',
            icon: 'fa-gear',
            label: 'ตั้งค่า',
            onclick: 'openSettings()',
            icon_bg_color: '#f59e0b',
            icon_text_color: '#ffffff'
        }
    },

    // ---------- ระบบประเมินผล (evaluation) ----------
    evaluation: {
        dashboard: {
            id: 'nav-dashboard',
            icon: 'fa-user-check',
            label: 'ประเมินผล',
            href: 'evaluation.html',
            icon_bg_color: '#10b981',
            icon_text_color: '#ffffff'
        },
        admin: {
            id: 'nav-admin',
            icon: 'fa-user-shield',
            label: 'ตั้งค่ากรรมการ',
            href: 'evaluation_admin.html',
            roles: ['super_admin', 'admin', 'director', 'deputy'],
            icon_bg_color: '#4f46e5',
            icon_text_color: '#ffffff'
        },
        settings: {
            id: 'nav-settings',
            icon: 'fa-gear',
            label: 'ตั้งค่าระบบ',
            href: 'evaluation_settings.html',
            roles: ['super_admin'],
            icon_bg_color: '#7c3aed',
            icon_text_color: '#ffffff'
        }
    },

    // ---------- ระบบแนะแนว ปพ.5 (guidance) ----------
    guidance: {
        teacher: {
            id: 'nav-teacher',
            icon: 'fa-chalkboard-user',
            label: 'ครูผู้สอน',
            href: 'guidance_teacher.html',
            icon_bg_color: '#10b981',
            icon_text_color: '#ffffff'
        },
        admin: {
            id: 'nav-admin',
            icon: 'fa-user-shield',
            label: 'ผู้ดูแลระบบ',
            href: 'guidance_admin.html',
            roles: ['super_admin', 'admin', 'director', 'deputy'],
            icon_bg_color: '#4f46e5',
            icon_text_color: '#ffffff'
        }
    },

    // ---------- ระบบเยี่ยมบ้าน (homevisit) ----------
    homevisit: {
        form: {
            id: 'btn-tab-form',
            icon: 'fa-pen-to-square',
            label: 'กรอกฟอร์ม',
            onclick: "switchTab('form')",
            icon_bg_color: '#3b82f6',
            icon_text_color: '#ffffff'
        },
        data: {
            id: 'btn-tab-data',
            icon: 'fa-chart-bar',
            label: 'ดูภาพรวม',
            onclick: "switchTab('data')",
            icon_bg_color: '#8b5cf6',
            icon_text_color: '#ffffff'
        },
        report: {
            id: 'btn-tab-report',
            icon: 'fa-chart-pie',
            label: 'รายงาน',
            onclick: "switchTab('report')",
            icon_bg_color: '#f59e0b',
            icon_text_color: '#ffffff'
        },
        overview: {
            id: 'btn-open-overview',
            icon: 'fa-table-list',
            label: 'ภาพรวม Modal',
            onclick: "openOverviewModal('overview')",
            icon_bg_color: '#6366f1',
            icon_text_color: '#ffffff'
        },
        settings: {
            id: 'admin-settings-btn',
            icon: 'fa-gear',
            label: 'ตั้งค่าระบบ',
            onclick: 'openAdminModal()',
            icon_bg_color: '#f59e0b',
            icon_text_color: '#ffffff'
        },
        importExcel: {
            id: 'btn-import-excel',
            icon: 'fa-file-excel',
            label: 'นำเข้าข้อมูล',
            onclick: 'importFromExcel()',
            icon_bg_color: '#10b981',
            icon_text_color: '#ffffff'
        }
    },
    // ---------- ข้อมูลนักเรียน (info_student) ----------
    info_student: {
        home: {
            id: 'nav-home',
            icon: 'fa-house',
            label: 'หน้าหลัก',
            href: 'student_index.html',
            icon_bg_color: '#6366f1',
            icon_text_color: '#ffffff'
        },
        myInfo: {
            id: 'nav-my-info',
            icon: 'fa-id-card',
            label: 'ข้อมูลของฉัน',
            icon_bg_color: '#6366f1',
            icon_text_color: '#ffffff'
        },
        homevisit: {
            id: 'nav-shortcut-homevisit',
            icon: 'fa-house-chimney-user',
            label: 'เยี่ยมบ้านนักเรียน',
            href: 'homevisit_student.html',
            icon_bg_color: '#14b8a6',
            icon_text_color: '#ffffff'
        },
        attendance: {
            id: 'nav-shortcut-attend',
            icon: 'fa-calendar-check',
            label: 'สถิติการมาเรียน',
            onclick: "scrollToTab('tab2')",
            icon_bg_color: '#3b82f6',
            icon_text_color: '#ffffff'
        },
        sdq: {
            id: 'nav-shortcut-sdq',
            icon: 'fa-brain',
            label: 'ผลประเมิน SDQ/EQ',
            onclick: "scrollToTab('tab3')",
            icon_bg_color: '#8b5cf6',
            icon_text_color: '#ffffff'
        },
        club: {
            id: 'nav-shortcut-club',
            icon: 'fa-people-group',
            label: 'ชุมนุมที่เรียน',
            onclick: "scrollToTab('tab4')",
            icon_bg_color: '#6366f1',
            icon_text_color: '#ffffff'
        },
        logout: {
            icon: 'fa-power-off',
            label: 'ออกจากระบบ',
            onclick: 'logout()',
            class: 'logout'
        }
    },

    // ---------- ข้อมูลนักเรียน 360° (info_teacher) ----------
    info_teacher: {
        home: {
            id: 'nav-home',
            icon: 'fa-house',
            label: 'หน้าหลัก',
            href: 'index.html',
            icon_bg_color: '#6366f1',
            icon_text_color: '#ffffff'
        },
        studentInfo: {
            id: 'nav-info-student',
            icon: 'fa-user-graduate',
            label: 'ข้อมูลนักเรียน',
            icon_bg_color: '#10b981',
            icon_text_color: '#ffffff'
        },
        settings: {
            id: 'btnSettingsSidebar',
            icon: 'fa-gear',
            label: 'ตั้งค่าระบบ',
            onclick: 'openSettingsModal()',
            icon_bg_color: '#f59e0b',
            icon_text_color: '#ffffff',
            hidden: true   // เปิด/ปิดผ่าน applyAdminVisibility()
        },
        logout: {
            icon: 'fa-power-off',
            label: 'ออกจากระบบ',
            onclick: 'logout()',
            class: 'logout'
        }
    },

    // ---------- ระบบการลา (leave_admin) ----------
    leave_admin: {
        dashboard: {
            id: 'btn-dashboard',
            icon: 'fa-chart-pie',
            label: 'ภาพรวมสถิติ',
            onclick: "switchTab('dashboard')",
            icon_bg_color: '#3b82f6',
            icon_text_color: '#ffffff'
        },
        manageLeave: {
            id: 'btn-manage-leave',
            icon: 'fa-list-check',
            label: 'ตรวจสอบใบลา',
            onclick: "switchTab('manage-leave')",
            icon_bg_color: '#8b5cf6',
            icon_text_color: '#ffffff'
        },
        attendance: {
            id: 'btn-attendance',
            icon: 'fa-user-clock',
            label: 'บันทึกขาด/มาสาย',
            onclick: "switchTab('attendance')",
            icon_bg_color: '#14b8a6',
            icon_text_color: '#ffffff'
        },
        settings: {
            id: 'btn-settings',
            icon: 'fa-cog',
            label: 'ตั้งค่าระบบ',
            onclick: "switchTab('settings')",
            roles: ['super_admin', 'admin'],
            icon_bg_color: '#f59e0b',
            icon_text_color: '#ffffff'
        },
        superAdmin: {
            id: 'btnSuperAdmin',
            icon: 'fa-crown',
            label: 'ผู้ดูแลระบบสูงสุด',
            href: 'super_admin.html',
            roles: ['super_admin'],
            icon_bg_color: '#dc2626',
            icon_text_color: '#ffffff'
        },
        home: {
            id: 'nav-home',
            icon: 'fa-house',
            label: 'กลับหน้าหลัก',
            href: 'index.html',
            icon_bg_color: '#6366f1',
            icon_text_color: '#ffffff'
        },
        logout: {
            icon: 'fa-power-off',
            label: 'ออกจากระบบ',
            onclick: 'logout()',
            class: 'logout'
        }
    },

    // ---------- ระบบการลา (leave_dept_head) ----------
    leave_dept_head: {
        pending: {
            id: 'btn-pending',
            icon: 'fa-clock',
            label: 'รอรับทราบ',
            onclick: "switchTab('pending')",
            icon_bg_color: '#f59e0b',
            icon_text_color: '#ffffff'
        },
        done: {
            id: 'btn-done',
            icon: 'fa-check-circle',
            label: 'รับทราบแล้ว',
            onclick: "switchTab('done')",
            icon_bg_color: '#10b981',
            icon_text_color: '#ffffff'
        },
        home: {
            id: 'nav-home',
            icon: 'fa-house',
            label: 'กลับหน้าหลัก',
            href: 'index.html',
            icon_bg_color: '#6366f1',
            icon_text_color: '#ffffff'
        },
        logout: {
            icon: 'fa-power-off',
            label: 'ออกจากระบบ',
            onclick: 'logout()',
            class: 'logout'
        }
    },

    // ---------- ระบบการลา (leave_teacher) ----------
    leave_teacher: {
        history: {
            id: 'nav-history',
            icon: 'fa-list-ul',
            label: 'ประวัติการลา',
            onclick: "window.scrollTo({top:0,behavior:'smooth'})",
            icon_bg_color: '#8b5cf6',
            icon_text_color: '#ffffff'
        },
        write: {
            id: 'nav-write',
            icon: 'fa-pen-nib',
            label: 'เขียนใบลา',
            onclick: "openLeaveModal()",
            icon_bg_color: '#dc2626',
            icon_text_color: '#ffffff'
        },
        signature: {
            id: 'nav-signature',
            icon: 'fa-signature',
            label: 'ดูลายเซ็น',
            onclick: "viewSignature()",
            icon_bg_color: '#7c3aed',
            icon_text_color: '#ffffff'
        },
        export: {
            id: 'nav-export',
            icon: 'fa-file-excel',
            label: 'ส่งออก Excel',
            onclick: "exportExcel()",
            icon_bg_color: '#10b981',
            icon_text_color: '#ffffff'
        },
        home: {
            id: 'nav-home',
            icon: 'fa-house',
            label: 'กลับหน้าหลัก',
            href: 'index.html',
            icon_bg_color: '#6366f1',
            icon_text_color: '#ffffff'
        },
        logout: {
            icon: 'fa-power-off',
            label: 'ออกจากระบบ',
            onclick: 'logout()',
            class: 'logout'
        }
    },

    // ---------- ระบบจองห้องประชุม (meeting_room) ----------
    meeting_room: {
        calendar: {
            id: 'nav-calendar',
            icon: 'fa-calendar-days',
            label: 'ปฏิทินห้องประชุม',
            onclick: "switchTab('calendar-tab')",
            icon_bg_color: '#3b82f6',
            icon_text_color: '#ffffff'
        },
        myBooking: {
            id: 'nav-my-booking',
            icon: 'fa-list',
            label: 'การจองของฉัน',
            onclick: "switchTab('my-booking-tab')",
            icon_bg_color: '#6366f1',
            icon_text_color: '#ffffff'
        },
        home: {
            id: 'nav-home',
            icon: 'fa-house',
            label: 'กลับหน้าหลัก',
            href: 'index.html',
            icon_bg_color: '#6366f1',
            icon_text_color: '#ffffff'
        },
        logout: {
            icon: 'fa-power-off',
            label: 'ออกจากระบบ',
            onclick: 'logout()',
            class: 'logout'
        }
    },

    // ---------- ระบบประเมินพหุปัญญา (mit) ----------
    mit: {
        home: {
            id: 'nav-home',
            icon: 'fa-house',
            label: 'หน้าหลัก',
            href: 'index.html',
            icon_bg_color: '#64748b',
            icon_text_color: '#ffffff'
        },
        miDashboard: {
            id: 'nav-mi-dashboard',
            icon: 'fa-brain',
            label: 'แดชบอร์ด MI',
            onclick: "window.scrollTo({top:0,behavior:'smooth'})",
            icon_bg_color: '#8b5cf6',
            icon_text_color: '#ffffff'
        },
        logout: {
            icon: 'fa-power-off',
            label: 'ออกจากระบบ',
            onclick: 'logout()',
            class: 'logout'
        }
    },

    // ---------- ระบบผู้ปกครองเครือข่าย (parent_network) ----------
    parent_network: {
        form: {
            id: 'nav-form',
            icon: 'fa-pen',
            label: 'กรอกฟอร์ม',
            onclick: "switchTab('form')",
            icon_bg_color: '#3b82f6',
            icon_text_color: '#ffffff'
        },
        data: {
            id: 'nav-data',
            icon: 'fa-chart-bar',
            label: 'ดูภาพรวม',
            onclick: "switchTab('data')",
            icon_bg_color: '#8b5cf6',
            icon_text_color: '#ffffff'
        },
        home: {
            id: 'nav-home',
            icon: 'fa-house',
            label: 'กลับหน้าหลัก',
            href: 'index.html',
            icon_bg_color: '#6366f1',
            icon_text_color: '#ffffff'
        },
        logout: {
            icon: 'fa-power-off',
            label: 'ออกจากระบบ',
            onclick: 'logout()',
            class: 'logout'
        }
    },

    // ---------- ระบบบริหารจัดการบุคลากร (personnel) ----------
    personnel: {
        home: {
            id: 'nav-home',
            icon: 'fa-house',
            label: 'หน้าหลัก',
            href: 'index.html',
            icon_bg_color: '#64748b',
            icon_text_color: '#ffffff'
        },
        personnelList: {
            id: 'nav-personnel',
            icon: 'fa-address-book',
            label: 'ทะเบียนบุคลากร',
            onclick: "window.scrollTo({top:0,behavior:'smooth'})",
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
        },
        logout: {
            icon: 'fa-power-off',
            label: 'ออกจากระบบ',
            onclick: 'logout()',
            class: 'logout'
        }
    },

    // ---------- ระบบแฟ้มสะสมผลงาน (portfolio) ----------
    portfolio: {
        dashboard: {
            id: 'nav-dashboard',
            icon: 'fa-chart-pie',
            label: 'แดชบอร์ดภาพรวม',
            onclick: "switchTab('dashboard')",
            icon_bg_color: '#6366f1',
            icon_text_color: '#ffffff'
        },
        work: {
            id: 'nav-work',
            icon: 'fa-trophy',
            label: 'ผลงาน/รางวัล',
            onclick: "switchTab('work')",
            icon_bg_color: '#f59e0b',
            icon_text_color: '#ffffff'
        },
        training: {
            id: 'nav-training',
            icon: 'fa-chalkboard-user',
            label: 'ประวัติการอบรม',
            onclick: "switchTab('training')",
            icon_bg_color: '#10b981',
            icon_text_color: '#ffffff'
        },
        export: {
            id: 'nav-export',
            icon: 'fa-file-excel',
            label: 'ส่งออก Excel',
            onclick: 'openExportModal()',
            icon_bg_color: '#10b981',
            icon_text_color: '#ffffff'
        },
        importExcel: {
            id: 'nav-import',
            icon: 'fa-file-import',
            label: 'นำเข้าจาก Excel',
            onclick: 'triggerImportExcel()',
            roles: ['super_admin'],
            icon_bg_color: '#f59e0b',
            icon_text_color: '#ffffff'
        },
        template: {
            id: 'nav-template',
            icon: 'fa-download',
            label: 'ดาวน์โหลด Template',
            onclick: 'downloadImportTemplate()',
            roles: ['super_admin'],
            icon_bg_color: '#8b5cf6',
            icon_text_color: '#ffffff'
        },
        sheets: {
            id: 'nav-sheets',
            icon: 'fa-brands fa-google-drive',
            label: 'นำเข้าจาก Google Sheets',
            onclick: 'importFromGoogleSheets()',
            roles: ['super_admin'],
            icon_bg_color: '#10b981',
            icon_text_color: '#ffffff'
        },
        settings: {
            id: 'nav-settings',
            icon: 'fa-gear',
            label: 'ตั้งค่าระบบ',
            onclick: 'openSettingsModal()',
            roles: ['super_admin'],
            icon_bg_color: '#64748b',
            icon_text_color: '#ffffff'
        },
        logout: {
            icon: 'fa-power-off',
            label: 'ออกจากระบบ',
            onclick: 'logout()',
            class: 'logout'
        }
    },

    // ---------- ระบบงานทะเบียน (regis) ----------
    regis: {
        dashboard: {
            id: 'nav-regis-dashboard',
            icon: 'fa-chart-pie',
            label: 'ภาพรวมงานทะเบียน',
            onclick: "window.scrollTo({top:0,behavior:'smooth'})",
            icon_bg_color: '#3b82f6',
            icon_text_color: '#ffffff'
        },
        settings: {
            id: 'nav-regis-settings',
            icon: 'fa-gear',
            label: 'ตั้งค่าระบบ',
            onclick: 'openSettingsModal()',
            roles: ['super_admin', 'admin'],
            icon_bg_color: '#f59e0b',
            icon_text_color: '#ffffff'
        },
        admins: {
            id: 'nav-regis-admins',
            icon: 'fa-user-shield',
            label: 'ผู้ดูแลระบบโมดูล',
            onclick: 'openAdminModal()',
            roles: ['super_admin'],
            icon_bg_color: '#8b5cf6',
            icon_text_color: '#ffffff'
        },
        home: {
            id: 'nav-home',
            icon: 'fa-house',
            label: 'กลับหน้าหลัก',
            href: 'index.html',
            icon_bg_color: '#6366f1',
            icon_text_color: '#ffffff'
        },
        logout: {
            icon: 'fa-power-off',
            label: 'ออกจากระบบ',
            onclick: 'logout()',
            class: 'logout'
        }
    },

    // ---------- ระบบประเมินบุคลิกภาพ RIASEC (riasec) ----------
    riasec: {
        home: {
            id: 'nav-home',
            icon: 'fa-house',
            label: 'หน้าหลัก',
            href: 'index.html',
            icon_bg_color: '#64748b',
            icon_text_color: '#ffffff'
        },
        riasecDashboard: {
            id: 'nav-riasec-dashboard',
            icon: 'fa-user-tie',
            label: 'แดชบอร์ด RIASEC',
            onclick: "window.scrollTo({top:0,behavior:'smooth'})",
            icon_bg_color: '#8b5cf6',
            icon_text_color: '#ffffff'
        },
        logout: {
            icon: 'fa-power-off',
            label: 'ออกจากระบบ',
            onclick: 'logout()',
            class: 'logout'
        }
    },

    // ---------- ระบบทุนการศึกษา (scholarship) ----------
    scholarship: {
        home: {
            id: 'nav-home',
            icon: 'fa-house',
            label: 'หน้าหลัก',
            href: 'index.html',
            icon_bg_color: '#64748b',
            icon_text_color: '#ffffff'
        },
        recordScholarship: {
            id: 'nav-record-scholarship',
            icon: 'fa-save',
            label: 'บันทึกทุน',
            onclick: 'openRecordScholarshipModal()',
            roles: ['super_admin', 'admin', 'director', 'deputy'],
            icon_bg_color: '#8b5cf6',
            icon_text_color: '#ffffff'
        },
        applicantList: {
            id: 'nav-applicant-list',
            icon: 'fa-file-signature',
            label: 'รายชื่อผู้ขอทุน',
            onclick: 'openApplicantListModal()',
            roles: ['super_admin', 'admin', 'director', 'deputy'],
            icon_bg_color: '#3b82f6',
            icon_text_color: '#ffffff'
        },
        settings: {
            id: 'admin-settings-btn',
            icon: 'fa-cog',
            label: 'ตั้งค่าระบบ',
            onclick: 'openAdminModal()',
            roles: ['super_admin', 'admin', 'director', 'deputy'],
            icon_bg_color: '#475569',
            icon_text_color: '#ffffff'
        },
        logout: {
            icon: 'fa-power-off',
            label: 'ออกจากระบบ',
            onclick: 'logout()',
            class: 'logout'
        }
    },

    // ---------- ระบบ SDQ (sdq) ----------
    sdq: {
        home: {
            id: 'nav-home',
            icon: 'fa-house',
            label: 'หน้าหลัก',
            href: 'index.html',
            icon_bg_color: '#64748b',
            icon_text_color: '#ffffff'
        },
        teacher: {
            id: 'nav-sdq-teacher',
            icon: 'fa-clipboard-question',
            label: 'ข้อมูล SDQ',
            href: 'sdq_teacher.html',
            icon_bg_color: '#6366f1',
            icon_text_color: '#ffffff'
        },
        admin: {
            id: 'nav-sdq-admin',
            icon: 'fa-chart-line',
            label: 'แดชบอร์ด SDQ (Admin)',
            href: 'sdq_admin.html',
            roles: ['super_admin', 'admin'],
            icon_bg_color: '#0ea5e9',
            icon_text_color: '#ffffff'
        },
        adminManager: {
            id: 'nav-sdq-admin-manager',
            icon: 'fa-user-shield',
            label: 'จัดการแอดมิน',
            onclick: 'openAdminManager()',
            roles: ['super_admin', 'admin'],
            icon_bg_color: '#8b5cf6',
            icon_text_color: '#ffffff'
        },
        logout: {
            icon: 'fa-power-off',
            label: 'ออกจากระบบ',
            onclick: 'logout()',
            class: 'logout'
        }
    },

    // ---------- ระบบขอไปราชการ (government_trip) ----------
    government_trip: {
        home: {
            id: 'nav-home',
            icon: 'fa-house',
            label: 'หน้าหลัก',
            href: 'index.html',
            icon_bg_color: '#6366f1',
            icon_text_color: '#ffffff'
        },
        teacher: {
            id: 'nav-trip-teacher',
            icon: 'fa-plane-departure',
            label: 'ขอไปราชการ',
            href: 'government_trip_teacher.html',
            icon_bg_color: '#0ea5e9',
            icon_text_color: '#ffffff'
        },
        // ✅ ลบ deptHead ออก — ใช้ topbar button แทน
        admin: {
            id: 'nav-trip-admin',
            icon: 'fa-user-shield',
            label: 'จัดการระบบ (Admin)',
            href: 'government_trip_admin.html',
            roles: ['super_admin', 'admin', 'director', 'deputy'],
            icon_bg_color: '#ef4444',
            icon_text_color: '#ffffff'
        },
        logout: {
            icon: 'fa-power-off',
            label: 'ออกจากระบบ',
            onclick: 'logout()',
            class: 'logout'
        }
    },

    // ==========================================
    // ➕ เพิ่มโมดูลใหม่ที่นี่ (ที่เดียว ไม่ต้องแก้ HTML)
    // ==========================================
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