// ==========================================================================
// wrk_module_admin.js — Module Admin Central Helper
// --------------------------------------------------------------------------
// ใช้ร่วมทุกโมดูล เพื่อ sync สิทธิ์ module admin เข้า Sidebar กลาง
//
// ⚙️ Concept:
//   - window._userModuleAdmins = array ของ module_id ที่ user เป็น admin
//   - dashboard_sidebar.js ใช้ array นี้ filter เมนูที่มี moduleAdmin field
//
// 📚 Usage:
//   1) เพิ่ม <script src="wrk_module_admin.js"></script> ใน core_head.js
//   2) ต้นไฟล์ module.js: WRKModuleAdmin.bootstrap('sarabun', 'sarabun_auth_cache', 'isSarabunAdmin');
//   3) หลัง auth เสร็จ:    WRKModuleAdmin.sync('sarabun', isSarabunAdmin);
// ==========================================================================

(function () {
    'use strict';

    // ==========================================
    // Internal State
    // ==========================================
    const STORAGE_KEY = 'wrk_module_admins_cache';  // ← backup ใน sessionStorage
    const DEBUG = true;  // ← เปลี่ยนเป็น false เมื่อ production

    function _log(...args) {
        if (DEBUG) console.log('🔑 [ModuleAdmin]', ...args);
    }

    // ==========================================
    // Core: get / set / merge
    // ==========================================
    
    /**
     * ดึง list ปัจจุบัน (จาก memory → sessionStorage)
     * @returns {string[]}
     */
    function get() {
        // 1) จาก memory ก่อน
        if (Array.isArray(window._userModuleAdmins)) {
            return window._userModuleAdmins;
        }

        // 2) จาก sessionStorage (สำรอง)
        try {
            const raw = sessionStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    window._userModuleAdmins = parsed;
                    return parsed;
                }
            }
        } catch (e) {}

        // 3) Default empty
        window._userModuleAdmins = [];
        return [];
    }

    /**
     * บันทึก list ลง memory + sessionStorage
     * @param {string[]} list
     */
    function _save(list) {
        const clean = Array.from(new Set(list.filter(Boolean)));
        window._userModuleAdmins = clean;
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
        } catch (e) {}
        return clean;
    }

    /**
     * เพิ่ม module เข้า list (ไม่ทับของเดิม)
     * @param {string} moduleKey
     * @returns {boolean} - true ถ้ามีการเปลี่ยนแปลง
     */
    function add(moduleKey) {
        if (!moduleKey) return false;
        const list = get();
        if (list.includes(moduleKey)) return false;
        _save([...list, moduleKey]);
        _log(`➕ Add "${moduleKey}" →`, window._userModuleAdmins);
        return true;
    }

    /**
     * ลบ module ออกจาก list
     * @param {string} moduleKey
     * @returns {boolean} - true ถ้ามีการเปลี่ยนแปลง
     */
    function remove(moduleKey) {
        if (!moduleKey) return false;
        const list = get();
        if (!list.includes(moduleKey)) return false;
        _save(list.filter(k => k !== moduleKey));
        _log(`➖ Remove "${moduleKey}" →`, window._userModuleAdmins);
        return true;
    }

    /**
     * ล้างทั้งหมด
     */
    function clear() {
        _save([]);
        _log('🧹 Clear all');
    }

    // ==========================================
    // Main API: bootstrap / sync
    // ==========================================

    /**
     * Bootstrap — เรียกต้นไฟล์ module.js (ก่อน initModuleSidebar)
     * อ่านค่าจาก auth cache → set list ทันที เพื่อให้ sidebar render ครั้งแรกได้ถูกต้อง
     *
     * @param {string} moduleKey - module_id เช่น 'sarabun'
     * @param {string} cacheKey - key ของ auth cache เช่น 'sarabun_auth_cache'
     * @param {string} flagName - ชื่อ flag ใน cache เช่น 'isSarabunAdmin'
     */
    function bootstrap(moduleKey, cacheKey, flagName) {
        if (!moduleKey || !cacheKey || !flagName) {
            console.warn('⚠️ [ModuleAdmin] bootstrap: ต้องระบุ moduleKey, cacheKey, flagName');
            return;
        }

        try {
            const raw = sessionStorage.getItem(cacheKey);
            if (raw) {
                const parsed = JSON.parse(raw);
                const flagValue = parsed?.data?.[flagName];
                if (flagValue === true) {
                    add(moduleKey);
                    _log(`⚡ Bootstrap "${moduleKey}": admin=true (จาก cache) →`, get());
                    return;
                }
            }
            _log(`⚡ Bootstrap "${moduleKey}": ยังไม่ทราบสิทธิ์ (ไม่มี cache)`);
        } catch (e) {
            _log(`⚡ Bootstrap "${moduleKey}": cache error →`, e.message);
        }
    }

    /**
     * Sync — เรียกหลังตรวจสิทธิ์เสร็จ (ใน checkAuth / updateUIBasedOnRole)
     * อัปเดต list → ถ้ามีการเปลี่ยนแปลง → trigger rerenderSidebar
     *
     * @param {string} moduleKey - module_id
     * @param {boolean} isAdmin - true=เพิ่ม, false=ลบ
     * @param {boolean} autoRerender - default=true
     * @returns {boolean} - true ถ้ามีการเปลี่ยนแปลง
     */
    function sync(moduleKey, isAdmin, autoRerender = true) {
        if (!moduleKey) return false;

        const changed = isAdmin ? add(moduleKey) : remove(moduleKey);

        if (changed && autoRerender) {
            _log(`🔄 Trigger rerenderSidebar ("${moduleKey}" → ${isAdmin})`);
            if (typeof window.rerenderSidebar === 'function') {
                try {
                    window.rerenderSidebar();
                } catch (e) {
                    console.warn('⚠️ rerenderSidebar error:', e);
                }
            }
        }

        return changed;
    }

    /**
     * Sync หลายโมดูลพร้อมกัน — สำหรับหน้าที่โหลดหลายโมดูล (เช่น index.html)
     * @param {Object<string, boolean>} modulesMap - { sarabun: true, behavior: false, ... }
     */
    function syncBulk(modulesMap) {
        if (!modulesMap || typeof modulesMap !== 'object') return false;

        const before = JSON.stringify(get());
        const list = get();

        Object.entries(modulesMap).forEach(([key, isAdmin]) => {
            const idx = list.indexOf(key);
            if (isAdmin && idx === -1) list.push(key);
            else if (!isAdmin && idx !== -1) list.splice(idx, 1);
        });

        _save(list);
        const after = JSON.stringify(get());
        const changed = before !== after;

        if (changed) {
            _log('🔄 syncBulk →', get());
            if (typeof window.rerenderSidebar === 'function') {
                try { window.rerenderSidebar(); } catch (e) {}
            }
        }
        return changed;
    }

    /**
     * Reset — ล้าง list ทั้งหมด (ใช้ตอน logout)
     */
    function reset() {
        try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) {}
        window._userModuleAdmins = [];
        _log('🧹 Reset');
    }

    // ==========================================
    // Public API
    // ==========================================
    window.WRKModuleAdmin = {
        // Core
        get,
        add,
        remove,
        clear,
        reset,

        // High-level
        bootstrap,
        sync,
        syncBulk,

        // Info
        has(moduleKey) {
            return get().includes(moduleKey);
        },
        list() {
            return [...get()];
        },
        dump() {
            console.table(get().map(k => ({ module_id: k })));
            return get();
        }
    };

    // ✅ Auto-init: อ่านจาก sessionStorage ทันที
    get();

    _log('✅ wrk_module_admin.js loaded');
})();