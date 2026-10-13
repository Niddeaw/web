// ==========================================================================
// evaluation_config.js — Single Source of Truth สำหรับระบบประเมิน
// --------------------------------------------------------------------------
// โหลดหลัง: config.js
// โหลดก่อน: evaluation_core.js, evaluation_admin.js, evaluation_settings.js
// 
// รวมไว้ที่เดียว:
//   - Role constants (MANAGE / VIEW_ADMIN / SETTINGS / EVALUATE)
//   - Navigation visibility
//   - Topbar role UI (ใช้ร่วม 3 หน้า)
//   - Shared nav functions
//   - Guard flag ป้องกัน double-init
// ==========================================================================

(function () {
    'use strict';

    // ==========================================
    // 1. ROLE DEFINITIONS — Single Source of Truth
    // ==========================================
    window.EVAL_ROLES = {
        // ระดับ "จัดการ" — แก้/ลบ/บันทึกคะแนน ได้
        MANAGE: ['super_admin', 'admin'],

        // ระดับ "ดูหน้าตั้งค่ากรรมการ" — เข้า evaluation_admin.html ได้ (view mode สำหรับ director/deputy)
        VIEW_ADMIN: ['super_admin', 'admin', 'director', 'deputy'],

        // ระดับ "ตั้งค่าระบบ" — เข้า evaluation_settings.html ได้
        SETTINGS: ['super_admin'],

        // ระดับ "ประเมินผล" — เข้า evaluation.html ได้
        EVALUATE: ['super_admin', 'admin', 'director', 'deputy', 'teacher'],

        // Helper functions
        can(role, level) {
            const list = window.EVAL_ROLES[level] || [];
            return list.includes(role);
        },
        canManage(role) { return window.EVAL_ROLES.can(role, 'MANAGE'); },
        canViewAdmin(role) { return window.EVAL_ROLES.can(role, 'VIEW_ADMIN'); },
        canSettings(role) { return window.EVAL_ROLES.can(role, 'SETTINGS'); },
        canEvaluate(role) { return window.EVAL_ROLES.can(role, 'EVALUATE'); }
    };

    // ==========================================
    // 2. NAV VISIBILITY — ใครเห็นปุ่มไหนบน topbar
    // ==========================================
    window.EVAL_NAV = {
        // ✅ ใช้ร่วมกัน — ผู้บริหาร 4 ตำแหน่งเห็นทั้งปุ่มประเมินผล + ปุ่มตั้งค่ากรรมการ
        ADMIN_VIEW: ['super_admin', 'admin', 'director', 'deputy'],
        SETTINGS_PAGE: ['super_admin']
    };

    // ==========================================
    // 3. GUARD FLAG — ป้องกัน double init
    // ==========================================
    window._evalCoreInitialized = false;

    // ==========================================
    // 4. SHARED TOPBAR UI — ใช้ร่วม 3 หน้า
    // ==========================================
    window.applyEvaluationTopbarRoleUI = function () {
        const role = window.currentUserRole
            || (typeof currentUser !== 'undefined' && currentUser && currentUser.role)
            || null;
        if (!role) return false;

        const badge = document.getElementById('super-admin-badge');
        const btnDashboard = document.getElementById('btn-goto-dashboard');
        const btnAdmin = document.getElementById('btn-goto-admin');
        const btnSettings = document.getElementById('btn-goto-settings');

        if (badge) {
            badge.classList.toggle('hidden', role !== 'super_admin');
        }
        // ✅ ใช้ ADMIN_VIEW ร่วมกัน — ผู้บริหาร 4 ตำแหน่งเห็นทั้งปุ่ม "ประเมินผล" และ "ตั้งค่ากรรมการ"
        if (btnDashboard) {
            btnDashboard.classList.toggle('hidden', !window.EVAL_NAV.ADMIN_VIEW.includes(role));
        }
        if (btnAdmin) {
            btnAdmin.classList.toggle('hidden', !window.EVAL_NAV.ADMIN_VIEW.includes(role));
        }
        if (btnSettings) {
            btnSettings.classList.toggle('hidden', !window.EVAL_NAV.SETTINGS_PAGE.includes(role));
        }
        return true;
    };

    // ==========================================
    // 5. SHARED REFRESH — ใช้ร่วม 3 หน้า
    // ==========================================
    window.refreshEvaluationTopbarUI = function () {
        // 1) วันที่
        if (typeof setTodayChip === 'function') {
            try { setTodayChip(); } catch (e) { /* ignore */ }
        }

        // 2) ข้อมูลผู้ใช้
        try {
            const user = (typeof currentUser !== 'undefined' && currentUser)
                ? currentUser
                : window.currentProfile;
            if (user) {
                if (typeof setUserDisplayName === 'function') setUserDisplayName(user);
                if (typeof updateUserRoleLabel === 'function') updateUserRoleLabel(user.role);
                if (typeof renderUserAvatar === 'function') renderUserAvatar(user);
            }
        } catch (e) { /* ignore */ }

        // 3) Round badge (เฉพาะ evaluation.html)
        try {
            if (typeof currentEvalRound !== 'undefined' && currentEvalRound) {
                const badge = document.getElementById('eval_round_badge');
                const display = document.getElementById('eval_round_display');
                if (badge && display) {
                    display.textContent = `${currentEvalRound.round_name} (ครั้งที่ ${currentEvalRound.round_number})`;
                    badge.classList.remove('hidden');
                }
            }
        } catch (e) { /* ignore */ }

        // 4) ปุ่มนำทาง — ตาม role
        try {
            window.applyEvaluationTopbarRoleUI();
        } catch (e) {
            console.warn('applyEvaluationTopbarRoleUI error:', e);
        }
    };

    // ==========================================
    // 6. SHARED NAV FUNCTIONS
    // ==========================================
    window.goToEvaluationDashboard = function () {
        window.location.href = 'evaluation.html';
    };
    window.goToEvaluationAdmin = function () {
        window.location.href = 'evaluation_admin.html';
    };
    window.goToEvaluationSettings = function () {
        window.location.href = 'evaluation_settings.html';
    };

    // ==========================================
    // 7. ALIASES — ตาม naming convention ของโมดูลอื่น
    // ==========================================
    // Sidebar re-render หลัง config + role พร้อม → auto refresh
    window.onSidebarRendered = function () {
        if (typeof window.refreshEvaluationTopbarUI === 'function') {
            try { window.refreshEvaluationTopbarUI(); } catch (e) { /* ignore */ }
        }
    };

    // Alias สำหรับ backward-compat
    window.refreshTopbarUser = window.refreshEvaluationTopbarUI;
    window.updateUIBasedOnRole = window.applyEvaluationTopbarRoleUI;
    window.refreshNavButtons = window.refreshEvaluationTopbarUI;

    // ==========================================
    // 8. INIT SIDEBAR (callback) — ให้ทุกหน้าเรียกใช้
    // ==========================================
    window.initEvaluationSidebar = function (options) {
        const {
            pageTitle = 'ประเมินผล',
            activeId = 'nav-dashboard',
            fallbackConfig = null
        } = options || {};

        if (typeof initModuleSidebar !== 'function') {
            console.error('❌ initModuleSidebar not found — dashboard_sidebar.js loaded?');
            return;
        }

        initModuleSidebar({
            moduleKey: 'evaluation',
            pageTitle,
            activeId,
            topbarButtons: options?.topbarButtons || [],
            fallbackConfig,
            onReady: () => {
                window.refreshEvaluationTopbarUI();
                // Fallback: เผื่อ role ยังโหลดไม่เสร็จ
                setTimeout(() => window.refreshEvaluationTopbarUI(), 800);
            }
        });
    };

    console.log('✅ evaluation_config.js loaded (Single Source of Truth)');
})();