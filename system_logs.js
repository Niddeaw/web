// =====================================================
// system_logs.js — System Audit Logs Viewer (v4 FINAL)
// + ครบ WHO / WHAT / WHERE / WHEN
// + Detail Modal + Advanced Filters
// + initModuleSidebar มาตรฐาน
// + แก้: i18n URL → https:// (แก้ CORS)
// + แก้: sort by timestamp จาก data-ts
// + แก้: buttons ใช้เฉพาะ excel/pdf/print (ปลอดภัย)
// + แก้: destroy table ปลอดภัย
// =====================================================

let logsDataTable = null;
let allLogsCache = [];
let currentDateFrom = null;
let currentDateTo = null;

// =====================================================
// ACTION CATALOG
// =====================================================
const ACTION = {
    LOGIN: 'LOGIN', LOGOUT: 'LOGOUT', LOGIN_FAILED: 'LOGIN_FAILED',
    SESSION_EXPIRED: 'SESSION_EXPIRED', PASSWORD_CHANGE: 'PASSWORD_CHANGE', PASSWORD_RESET: 'PASSWORD_RESET',
    VIEW_PAGE: 'VIEW_PAGE', VIEW_DETAIL: 'VIEW_DETAIL', VIEW_REPORT: 'VIEW_REPORT',
    EXPORT: 'EXPORT', PRINT: 'PRINT', SEARCH: 'SEARCH', FILTER: 'FILTER',
    STUDENT: {
        CREATE: 'STUDENT_CREATE', UPDATE: 'STUDENT_UPDATE', DELETE: 'STUDENT_DELETE',
        VIEW: 'STUDENT_VIEW', IMPORT: 'STUDENT_IMPORT', EXPORT: 'STUDENT_EXPORT',
        TRANSFER: 'STUDENT_TRANSFER', GRADUATE: 'STUDENT_GRADUATE',
        SUSPEND: 'STUDENT_SUSPEND', STATUS_CHANGE: 'STUDENT_STATUS_CHANGE'
    },
    PERSONNEL: {
        CREATE: 'PERSONNEL_CREATE', UPDATE: 'PERSONNEL_UPDATE', DELETE: 'PERSONNEL_DELETE',
        VIEW: 'PERSONNEL_VIEW', ROLE_CHANGE: 'PERSONNEL_ROLE_CHANGE',
        ACTIVATE: 'PERSONNEL_ACTIVATE', DEACTIVATE: 'PERSONNEL_DEACTIVATE'
    },
    CLASSROOM: {
        CREATE: 'CLASSROOM_CREATE', UPDATE: 'CLASSROOM_UPDATE', DELETE: 'CLASSROOM_DELETE',
        VIEW: 'CLASSROOM_VIEW', ASSIGN_TEACHER: 'CLASSROOM_ASSIGN_TEACHER', ASSIGN_STUDENT: 'CLASSROOM_ASSIGN_STUDENT'
    },
    SUBJECT: { CREATE: 'SUBJECT_CREATE', UPDATE: 'SUBJECT_UPDATE', DELETE: 'SUBJECT_DELETE', VIEW: 'SUBJECT_VIEW' },
    SCHEDULE: { CREATE: 'SCHEDULE_CREATE', UPDATE: 'SCHEDULE_UPDATE', DELETE: 'SCHEDULE_DELETE', VIEW: 'SCHEDULE_VIEW', PUBLISH: 'SCHEDULE_PUBLISH' },
    ATTENDANCE: { MARK: 'ATTENDANCE_MARK', EDIT: 'ATTENDANCE_EDIT', VIEW: 'ATTENDANCE_VIEW', REPORT: 'ATTENDANCE_REPORT' },
    GRADE: { CREATE: 'GRADE_CREATE', UPDATE: 'GRADE_UPDATE', DELETE: 'GRADE_DELETE', VIEW: 'GRADE_VIEW', SUBMIT: 'GRADE_SUBMIT', APPROVE: 'GRADE_APPROVE', REPORT: 'GRADE_REPORT' },
    DOCUMENT: { CREATE: 'DOCUMENT_CREATE', UPDATE: 'DOCUMENT_UPDATE', DELETE: 'DOCUMENT_DELETE', VIEW: 'DOCUMENT_VIEW', DOWNLOAD: 'DOCUMENT_DOWNLOAD', APPROVE: 'DOCUMENT_APPROVE', REJECT: 'DOCUMENT_REJECT' },
    FINANCE: { CREATE: 'FINANCE_CREATE', UPDATE: 'FINANCE_UPDATE', DELETE: 'FINANCE_DELETE', VIEW: 'FINANCE_VIEW', PAYMENT: 'FINANCE_PAYMENT', REFUND: 'FINANCE_REFUND', REPORT: 'FINANCE_REPORT' },
    NOTIFICATION: { SEND: 'NOTIFICATION_SEND', VIEW: 'NOTIFICATION_VIEW', DELETE: 'NOTIFICATION_DELETE' },
    SYSTEM: {
        SETTING_UPDATE: 'SYSTEM_SETTING_UPDATE', BACKUP: 'SYSTEM_BACKUP', RESTORE: 'SYSTEM_RESTORE',
        LOG_DELETE: 'SYSTEM_LOG_DELETE', LOG_EXPORT: 'SYSTEM_LOG_EXPORT', LOG_VIEW: 'SYSTEM_LOG_VIEW', MAINTENANCE: 'SYSTEM_MAINTENANCE'
    }
};

const MODULE = {
    AUTH: 'AUTH', STUDENT: 'STUDENT', PERSONNEL: 'PERSONNEL', CLASSROOM: 'CLASSROOM',
    SUBJECT: 'SUBJECT', SCHEDULE: 'SCHEDULE', ATTENDANCE: 'ATTENDANCE', GRADE: 'GRADE',
    DOCUMENT: 'DOCUMENT', FINANCE: 'FINANCE', NOTIFICATION: 'NOTIFICATION',
    SYSTEM_LOGS: 'SYSTEM_LOGS', SETTINGS: 'SETTINGS', DASHBOARD: 'DASHBOARD', REPORT: 'REPORT',
    LEAVE: 'LEAVE', SDQ: 'SDQ', BEHAVIOR: 'BEHAVIOR', HOMEVISIT: 'HOMEVISIT', CALENDAR: 'CALENDAR'
};

// =====================================================
// ACTION_DISPLAY MAP
// =====================================================
const ACTION_DISPLAY = {
    'LOGIN':                    { label: 'เข้าสู่ระบบ',           icon: 'fa-right-to-bracket',    color: 'green' },
    'LOGOUT':                   { label: 'ออกจากระบบ',            icon: 'fa-right-from-bracket',  color: 'red' },
    'LOGIN_FAILED':             { label: 'เข้าสู่ระบบล้มเหลว',   icon: 'fa-triangle-exclamation', color: 'red' },
    'SESSION_EXPIRED':          { label: 'Session หมดอายุ',       icon: 'fa-clock',               color: 'orange' },
    'PASSWORD_CHANGE':          { label: 'เปลี่ยนรหัสผ่าน',      icon: 'fa-key',                 color: 'amber' },
    'PASSWORD_RESET':           { label: 'รีเซ็ตรหัสผ่าน',       icon: 'fa-rotate-right',        color: 'amber' },
    'VIEW_PAGE':                { label: 'ดูหน้า',                icon: 'fa-eye',                 color: 'indigo' },
    'VIEW_DETAIL':              { label: 'ดูรายละเอียด',          icon: 'fa-magnifying-glass',    color: 'indigo' },
    'VIEW_REPORT':              { label: 'ดูรายงาน',              icon: 'fa-chart-bar',           color: 'indigo' },
    'EXPORT':                   { label: 'Export ข้อมูล',          icon: 'fa-file-export',         color: 'teal' },
    'PRINT':                    { label: 'พิมพ์เอกสาร',           icon: 'fa-print',               color: 'teal' },
    'SEARCH':                   { label: 'ค้นหา',                 icon: 'fa-magnifying-glass',    color: 'sky' },
    'FILTER':                   { label: 'กรองข้อมูล',            icon: 'fa-filter',              color: 'sky' },
    'STUDENT_CREATE':           { label: 'เพิ่มนักเรียน',         icon: 'fa-user-plus',           color: 'emerald' },
    'STUDENT_UPDATE':           { label: 'แก้ไขนักเรียน',         icon: 'fa-user-pen',            color: 'blue' },
    'STUDENT_DELETE':           { label: 'ลบนักเรียน',            icon: 'fa-user-minus',          color: 'rose' },
    'STUDENT_VIEW':             { label: 'ดูโปรไฟล์นักเรียน',    icon: 'fa-user',                color: 'indigo' },
    'STUDENT_IMPORT':           { label: 'Import นักเรียน',       icon: 'fa-file-import',         color: 'cyan' },
    'STUDENT_EXPORT':           { label: 'Export นักเรียน',       icon: 'fa-file-export',         color: 'teal' },
    'STUDENT_TRANSFER':         { label: 'ย้ายชั้นเรียน',         icon: 'fa-right-left',          color: 'violet' },
    'STUDENT_GRADUATE':         { label: 'บันทึกจบการศึกษา',     icon: 'fa-graduation-cap',      color: 'purple' },
    'STUDENT_SUSPEND':          { label: 'พักการเรียน',           icon: 'fa-user-clock',          color: 'orange' },
    'STUDENT_STATUS_CHANGE':    { label: 'เปลี่ยนสถานะนักเรียน', icon: 'fa-circle-dot',          color: 'yellow' },
    'PERSONNEL_CREATE':         { label: 'เพิ่มบุคลากร',          icon: 'fa-user-plus',           color: 'emerald' },
    'PERSONNEL_UPDATE':         { label: 'แก้ไขบุคลากร',          icon: 'fa-user-pen',            color: 'blue' },
    'PERSONNEL_DELETE':         { label: 'ลบบุคลากร',             icon: 'fa-user-minus',          color: 'rose' },
    'PERSONNEL_VIEW':           { label: 'ดูโปรไฟล์บุคลากร',     icon: 'fa-id-card',             color: 'indigo' },
    'PERSONNEL_ROLE_CHANGE':    { label: 'เปลี่ยนสิทธิ์',         icon: 'fa-user-shield',         color: 'amber' },
    'PERSONNEL_ACTIVATE':       { label: 'เปิดใช้งานบัญชี',      icon: 'fa-circle-check',        color: 'green' },
    'PERSONNEL_DEACTIVATE':     { label: 'ปิดใช้งานบัญชี',       icon: 'fa-circle-xmark',        color: 'slate' },
    'CLASSROOM_CREATE':         { label: 'สร้างห้องเรียน',         icon: 'fa-door-open',           color: 'emerald' },
    'CLASSROOM_UPDATE':         { label: 'แก้ไขห้องเรียน',         icon: 'fa-pen-to-square',       color: 'blue' },
    'CLASSROOM_DELETE':         { label: 'ลบห้องเรียน',            icon: 'fa-trash-can',           color: 'rose' },
    'CLASSROOM_VIEW':           { label: 'ดูห้องเรียน',            icon: 'fa-chalkboard',          color: 'indigo' },
    'CLASSROOM_ASSIGN_TEACHER': { label: 'มอบหมายครูประจำชั้น',   icon: 'fa-chalkboard-user',     color: 'violet' },
    'CLASSROOM_ASSIGN_STUDENT': { label: 'มอบหมายนักเรียน',       icon: 'fa-users-line',          color: 'violet' },
    'SUBJECT_CREATE':           { label: 'เพิ่มวิชา',              icon: 'fa-book-open-reader',    color: 'emerald' },
    'SUBJECT_UPDATE':           { label: 'แก้ไขวิชา',              icon: 'fa-book-open',           color: 'blue' },
    'SUBJECT_DELETE':           { label: 'ลบวิชา',                 icon: 'fa-trash-can',           color: 'rose' },
    'SUBJECT_VIEW':             { label: 'ดูวิชา',                 icon: 'fa-book',                color: 'indigo' },
    'SCHEDULE_CREATE':          { label: 'สร้างตารางสอน',          icon: 'fa-calendar-plus',       color: 'emerald' },
    'SCHEDULE_UPDATE':          { label: 'แก้ไขตารางสอน',          icon: 'fa-calendar-pen',        color: 'blue' },
    'SCHEDULE_DELETE':          { label: 'ลบตารางสอน',             icon: 'fa-calendar-xmark',      color: 'rose' },
    'SCHEDULE_VIEW':            { label: 'ดูตารางสอน',             icon: 'fa-calendar-days',       color: 'indigo' },
    'SCHEDULE_PUBLISH':         { label: 'เผยแพร่ตารางสอน',        icon: 'fa-calendar-check',      color: 'teal' },
    'ATTENDANCE_MARK':          { label: 'บันทึกการเข้าเรียน',    icon: 'fa-clipboard-user',      color: 'emerald' },
    'ATTENDANCE_EDIT':          { label: 'แก้ไขการเข้าเรียน',     icon: 'fa-clipboard-check',     color: 'blue' },
    'ATTENDANCE_VIEW':          { label: 'ดูการเข้าเรียน',        icon: 'fa-clipboard-list',      color: 'indigo' },
    'ATTENDANCE_REPORT':        { label: 'รายงานการเข้าเรียน',    icon: 'fa-chart-column',        color: 'violet' },
    'GRADE_CREATE':             { label: 'บันทึกคะแนน',           icon: 'fa-star',                color: 'emerald' },
    'GRADE_UPDATE':             { label: 'แก้ไขคะแนน',            icon: 'fa-star-half-stroke',    color: 'blue' },
    'GRADE_DELETE':             { label: 'ลบคะแนน',               icon: 'fa-trash-can',           color: 'rose' },
    'GRADE_VIEW':               { label: 'ดูคะแนน',               icon: 'fa-star',                color: 'indigo' },
    'GRADE_SUBMIT':             { label: 'ส่งคะแนน',              icon: 'fa-paper-plane',         color: 'teal' },
    'GRADE_APPROVE':            { label: 'อนุมัติคะแนน',          icon: 'fa-circle-check',        color: 'green' },
    'GRADE_REPORT':             { label: 'รายงานผลการเรียน',      icon: 'fa-chart-bar',           color: 'violet' },
    'DOCUMENT_CREATE':          { label: 'สร้างเอกสาร',            icon: 'fa-file-circle-plus',    color: 'emerald' },
    'DOCUMENT_UPDATE':          { label: 'แก้ไขเอกสาร',            icon: 'fa-file-pen',            color: 'blue' },
    'DOCUMENT_DELETE':          { label: 'ลบเอกสาร',               icon: 'fa-file-circle-xmark',   color: 'rose' },
    'DOCUMENT_VIEW':            { label: 'ดูเอกสาร',               icon: 'fa-file-lines',          color: 'indigo' },
    'DOCUMENT_DOWNLOAD':        { label: 'ดาวน์โหลดเอกสาร',        icon: 'fa-file-arrow-down',     color: 'teal' },
    'DOCUMENT_APPROVE':         { label: 'อนุมัติเอกสาร',          icon: 'fa-file-circle-check',   color: 'green' },
    'DOCUMENT_REJECT':          { label: 'ปฏิเสธเอกสาร',           icon: 'fa-file-circle-xmark',   color: 'rose' },
    'FINANCE_CREATE':           { label: 'บันทึกรายการเงิน',       icon: 'fa-circle-plus',         color: 'emerald' },
    'FINANCE_UPDATE':           { label: 'แก้ไขรายการเงิน',        icon: 'fa-pen-to-square',       color: 'blue' },
    'FINANCE_DELETE':           { label: 'ลบรายการเงิน',           icon: 'fa-trash-can',           color: 'rose' },
    'FINANCE_VIEW':             { label: 'ดูรายการเงิน',           icon: 'fa-coins',               color: 'indigo' },
    'FINANCE_PAYMENT':          { label: 'รับชำระเงิน',            icon: 'fa-money-bill-wave',     color: 'green' },
    'FINANCE_REFUND':           { label: 'คืนเงิน',                icon: 'fa-rotate-left',         color: 'orange' },
    'FINANCE_REPORT':           { label: 'รายงานการเงิน',          icon: 'fa-file-invoice-dollar', color: 'violet' },
    'NOTIFICATION_SEND':        { label: 'ส่งการแจ้งเตือน',        icon: 'fa-bell',                color: 'amber' },
    'NOTIFICATION_VIEW':        { label: 'ดูการแจ้งเตือน',         icon: 'fa-bell',                color: 'indigo' },
    'NOTIFICATION_DELETE':      { label: 'ลบการแจ้งเตือน',         icon: 'fa-bell-slash',          color: 'rose' },
    'SYSTEM_SETTING_UPDATE':    { label: 'แก้ไขการตั้งค่าระบบ',    icon: 'fa-gear',                color: 'amber' },
    'SYSTEM_BACKUP':            { label: 'สำรองข้อมูลระบบ',         icon: 'fa-hard-drive',          color: 'teal' },
    'SYSTEM_RESTORE':           { label: 'กู้คืนข้อมูลระบบ',        icon: 'fa-rotate-right',        color: 'orange' },
    'SYSTEM_LOG_DELETE':        { label: 'ลบ Log ระบบ',             icon: 'fa-trash-can',           color: 'rose' },
    'SYSTEM_LOG_EXPORT':        { label: 'Export Log ระบบ',         icon: 'fa-file-export',         color: 'teal' },
    'SYSTEM_LOG_VIEW':          { label: 'ดู Log ระบบ',             icon: 'fa-list-check',          color: 'indigo' },
    'SYSTEM_MAINTENANCE':       { label: 'โหมดซ่อมบำรุง',          icon: 'fa-screwdriver-wrench',  color: 'slate' }
};

const COLOR_CLASSES = {
    green:   { bg: 'bg-green-100',   text: 'text-green-700' },
    red:     { bg: 'bg-red-100',     text: 'text-red-700' },
    orange:  { bg: 'bg-orange-100',  text: 'text-orange-700' },
    amber:   { bg: 'bg-amber-100',   text: 'text-amber-700' },
    yellow:  { bg: 'bg-yellow-100',  text: 'text-yellow-700' },
    blue:    { bg: 'bg-blue-100',    text: 'text-blue-700' },
    indigo:  { bg: 'bg-indigo-100',  text: 'text-indigo-700' },
    violet:  { bg: 'bg-violet-100',  text: 'text-violet-700' },
    purple:  { bg: 'bg-purple-100',  text: 'text-purple-700' },
    emerald: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
    teal:    { bg: 'bg-teal-100',    text: 'text-teal-700' },
    cyan:    { bg: 'bg-cyan-100',    text: 'text-cyan-700' },
    sky:     { bg: 'bg-sky-100',     text: 'text-sky-700' },
    rose:    { bg: 'bg-rose-100',    text: 'text-rose-700' },
    slate:   { bg: 'bg-slate-100',   text: 'text-slate-700' }
};

// =====================================================
// Helper: escapeHtml
// =====================================================
function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

// =====================================================
// Helper: relative time
// =====================================================
function getRelativeTime(dateInput) {
    const d = new Date(dateInput);
    const diffMs = Date.now() - d.getTime();
    const sec = Math.floor(diffMs / 1000);
    if (sec < 60) return 'เมื่อสักครู่';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} นาทีที่แล้ว`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} ชั่วโมงที่แล้ว`;
    const day = Math.floor(hr / 24);
    if (day < 30) return `${day} วันที่แล้ว`;
    const mon = Math.floor(day / 30);
    if (mon < 12) return `${mon} เดือนที่แล้ว`;
    return `${Math.floor(mon / 12)} ปีที่แล้ว`;
}

// =====================================================
// Helper: role badge
// =====================================================
function getRoleBadge(role) {
    const map = {
        super_admin: { label: 'Super Admin', icon: 'fa-crown' },
        admin:       { label: 'Admin',       icon: 'fa-user-shield' },
        director:    { label: 'ผู้อำนวยการ', icon: 'fa-user-tie' },
        deputy:      { label: 'รอง ผอ.',     icon: 'fa-user-tie' },
        teacher:     { label: 'ครู',           icon: 'fa-chalkboard-user' },
        staff:       { label: 'เจ้าหน้าที่',    icon: 'fa-user' },
        office:      { label: 'ธุรการ',       icon: 'fa-briefcase' }
    };
    const r = map[role] || { label: role || 'ไม่ระบุ', icon: 'fa-user' };
    return `<span class="role-badge role-${role || 'default'}"><i class="fa-solid ${r.icon} mr-0.5"></i>${r.label}</span>`;
}

// =====================================================
// Helper: action badge
// =====================================================
function getActionBadge(action) {
    const def = ACTION_DISPLAY[action];
    if (!def) {
        return `<span class="chip bg-slate-100 text-slate-600"><i class="fa-solid fa-circle-question"></i>${escapeHtml(action)}</span>`;
    }
    const c = COLOR_CLASSES[def.color] || COLOR_CLASSES.slate;
    return `<span class="chip ${c.bg} ${c.text}" title="${def.label}"><i class="fa-solid ${def.icon}"></i>${def.label}</span>`;
}

// =====================================================
// Helper: จัดหมวด ACTION
// =====================================================
function getActionCategory(action) {
    if (!action) return 'OTHER';
    if (action === 'LOGIN' || action === 'LOGOUT' || action === 'LOGIN_FAILED' || action === 'SESSION_EXPIRED' || action === 'PASSWORD_CHANGE' || action === 'PASSWORD_RESET') return 'AUTH';
    if (action.startsWith('VIEW') || action.endsWith('_VIEW') || action.endsWith('_REPORT')) return 'VIEW';
    if (action.startsWith('SYSTEM')) return 'SYSTEM';
    if (action === 'EXPORT' || action === 'PRINT' || action.endsWith('_EXPORT') || action.endsWith('_DOWNLOAD')) return 'EXPORT';
    if (action.includes('_CREATE') || action.includes('_MARK') || action.includes('_IMPORT') || action.includes('_SEND')) return 'CREATE';
    if (action.includes('_UPDATE') || action.includes('_EDIT') || action.includes('_APPROVE') || action.includes('_SUBMIT') || action.includes('_PUBLISH') || action.includes('_TRANSFER') || action.includes('_STATUS_CHANGE') || action.includes('_ROLE_CHANGE')) return 'UPDATE';
    if (action.includes('_DELETE') || action.includes('_REJECT') || action.includes('_REFUND')) return 'DELETE';
    return 'OTHER';
}

// =====================================================
// Module label mapping
// =====================================================
function getModuleLabel(mod) {
    const map = {
        AUTH: 'เข้า/ออกระบบ', STUDENT: 'นักเรียน', PERSONNEL: 'บุคลากร',
        CLASSROOM: 'ห้องเรียน', SUBJECT: 'วิชา', SCHEDULE: 'ตารางสอน',
        ATTENDANCE: 'เช็คชื่อ', GRADE: 'คะแนน', DOCUMENT: 'เอกสาร',
        FINANCE: 'การเงิน', NOTIFICATION: 'แจ้งเตือน', SYSTEM_LOGS: 'System Logs',
        SETTINGS: 'ตั้งค่า', DASHBOARD: 'แดชบอร์ด', REPORT: 'รายงาน',
        LEAVE: 'การลา', SDQ: 'SDQ', BEHAVIOR: 'ปกครอง',
        HOMEVISIT: 'เยี่ยมบ้าน', CALENDAR: 'ปฏิทิน'
    };
    return map[mod] || mod || '-';
}

// =====================================================
// INIT
// =====================================================
window.onload = async () => { await checkSuperAdminAuth(); };

async function checkSuperAdminAuth() {
    try {
        const { data: { session } } = await db.auth.getSession();
        if (!session) throw new Error('No session');

        const { data: profile, error } = await db.from('core_personnel')
            .select('role, prefix, first_name, last_name').eq('id', session.user.id).single();
        if (error || !profile) throw new Error('Profile not found');

        if (profile.role !== 'super_admin') {
            Swal.fire({ icon: 'error', title: 'ปฏิเสธการเข้าถึง', text: 'เฉพาะ Super Admin เท่านั้น' })
                .then(() => window.location.replace('index.html'));
            return;
        }

        window.currentProfile = profile;
        window.currentUserRole = profile.role;
        if (typeof setUserDisplayName === 'function') setUserDisplayName(profile);
        if (typeof updateUserRoleLabel === 'function') updateUserRoleLabel(profile.role);
        if (typeof renderUserAvatar === 'function') renderUserAvatar(profile);

        document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');

        await logUserAction(ACTION.SYSTEM.LOG_VIEW, MODULE.SYSTEM_LOGS, {
            metadata: { page_title: 'System Logs' }
        });

        document.getElementById('btnApplyFilter')?.addEventListener('click', applyFilters);
        document.getElementById('btnClearFilter')?.addEventListener('click', clearFilters);
        document.getElementById('btnRefresh')?.addEventListener('click', () => loadLogsData());
        document.getElementById('btnClearOld')?.addEventListener('click', clearOldLogs);

        await loadLogsData();
    } catch (err) {
        console.error('Auth error:', err);
        window.location.replace('index.html');
    }
}

// =====================================================
// โหลดข้อมูล Logs
// =====================================================
async function loadLogsData(dateFrom = null, dateTo = null) {
    Swal.fire({ title: 'กำลังโหลดข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        let logs = [];

        try {
            let query = db.from('system_audit_logs')
                .select(`id, action, module, entity_type, entity_id, old_values, new_values,
                         ip_address, user_agent, created_at, status, error_message, reason, metadata, source,
                         core_personnel!system_audit_logs_performed_by_fkey (prefix, first_name, last_name, role, department, email)`);
            if (dateFrom) { const s = new Date(dateFrom); s.setHours(0,0,0,0); query = query.gte('created_at', s.toISOString()); }
            if (dateTo)   { const e = new Date(dateTo);   e.setHours(23,59,59,999); query = query.lte('created_at', e.toISOString()); }
            const { data, error } = await query.order('created_at', { ascending: false }).limit(2000);
            if (error) throw error;
            logs = data || [];
        } catch (errPrimary) {
            console.warn('Primary fetch failed, using fallback:', errPrimary);
            let query = db.from('core_access_logs')
                .select(`id, action, module, ip_address, user_agent, created_at,
                         core_personnel (prefix, first_name, last_name, role)`);
            if (dateFrom) { const s = new Date(dateFrom); s.setHours(0,0,0,0); query = query.gte('created_at', s.toISOString()); }
            if (dateTo)   { const e = new Date(dateTo);   e.setHours(23,59,59,999); query = query.lte('created_at', e.toISOString()); }
            const { data, error } = await query.order('created_at', { ascending: false }).limit(2000);
            if (error) throw error;
            logs = data || [];
        }

        allLogsCache = logs;

        populateFilterOptions(logs);
        updateStatistics(logs);
        renderTable(logs);

        Swal.close();
    } catch (error) {
        console.error('loadLogsData error:', error);
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถโหลด Logs ได้: ' + error.message, 'error');
    }
}

// =====================================================
// Populate filter dropdown
// =====================================================
function populateFilterOptions(logs) {
    const users = new Set();
    const modules = new Set();

    logs.forEach(l => {
        const p = l.core_personnel;
        if (p) {
            const key = `${p.prefix||''}${p.first_name||''} ${p.last_name||''}`.trim();
            if (key) users.add(key);
        }
        if (l.module) modules.add(l.module);
    });

    const userSel = document.getElementById('filterUser');
    if (userSel) {
        const cur = userSel.value;
        let html = '<option value="">ทุกคน</option>';
        [...users].sort().forEach(u => { html += `<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`; });
        userSel.innerHTML = html;
        userSel.value = cur;
    }

    const modSel = document.getElementById('filterModule');
    if (modSel) {
        const cur = modSel.value;
        let html = '<option value="">ทั้งหมด</option>';
        [...modules].sort().forEach(m => { html += `<option value="${m}">${getModuleLabel(m)}</option>`; });
        modSel.innerHTML = html;
        modSel.value = cur;
    }
}

// =====================================================
// Update statistics
// =====================================================
function updateStatistics(logs) {
    const total = logs.length;
    const login = logs.filter(l => l.action === 'LOGIN').length;
    const logout = logs.filter(l => l.action === 'LOGOUT').length;
    const view = logs.filter(l => getActionCategory(l.action) === 'VIEW').length;
    const change = logs.filter(l => ['CREATE', 'UPDATE', 'DELETE'].includes(getActionCategory(l.action))).length;
    const failed = logs.filter(l => l.status && l.status !== 'SUCCESS').length;

    document.getElementById('stat-total').textContent = total.toLocaleString();
    document.getElementById('stat-login').textContent = login.toLocaleString();
    document.getElementById('stat-logout').textContent = logout.toLocaleString();
    document.getElementById('stat-view').textContent = view.toLocaleString();
    document.getElementById('stat-change').textContent = change.toLocaleString();
    document.getElementById('stat-failed').textContent = failed.toLocaleString();
}

// =====================================================
// Render ตาราง
// =====================================================
function renderTable(logs) {
    // ✅ Destroy table เก่าให้สมบูรณ์
    if ($.fn.DataTable.isDataTable('#logsTable')) {
        try {
            $('#logsTable').DataTable().clear().destroy();
        } catch (e) {
            console.warn('Destroy table warning:', e);
        }
    }
    $('#logsTable tbody').empty();

    const tableData = logs.map(log => {
        const d = new Date(log.created_at);

        // ---------- WHEN (มี data-ts สำหรับ sort) ----------
        const dateStr = d.toLocaleDateString('th-TH', { day:'2-digit', month:'short', year:'numeric' });
        const timeStr = d.toLocaleTimeString('th-TH', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
        const relTime = getRelativeTime(log.created_at);
        const whenHtml = `
            <div class="flex flex-col items-start gap-0.5" data-ts="${log.created_at}">
                <span class="text-xs font-bold text-slate-700">${timeStr}</span>
                <span class="text-[10px] text-slate-500">${dateStr}</span>
                <span class="text-[10px] text-indigo-500 font-medium"><i class="fa-regular fa-clock mr-0.5"></i>${relTime}</span>
            </div>`;

        // ---------- WHO ----------
        const p = log.core_personnel;
        const fullName = p ? `${p.prefix||''}${p.first_name||''} ${p.last_name||''}`.trim() : 'ไม่ทราบ/ถูกลบ';
        const initial = (p?.first_name || '?').charAt(0).toUpperCase();
        const roleBadge = p ? getRoleBadge(p.role) : '<span class="text-xs text-slate-400">-</span>';
        const dept = p?.department ? `<div class="text-[10px] text-slate-400"><i class="fa-solid fa-building mr-0.5"></i>${escapeHtml(p.department)}</div>` : '';
        const whoHtml = `
            <div class="flex items-center gap-2">
                <div class="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-blue-500 text-white text-xs font-bold flex items-center justify-center shrink-0">${initial}</div>
                <div class="min-w-0">
                    <div class="font-bold text-xs text-slate-800 truncate" title="${escapeHtml(fullName)}">${escapeHtml(fullName)}</div>
                    ${roleBadge}
                    ${dept}
                </div>
            </div>`;

        // ---------- WHAT ----------
        const actionBadge = getActionBadge(log.action);
        const entityName = log.metadata?.entity_name || '';
        const entityType = log.entity_type || '';
        const whatHtml = `
            <div class="flex flex-col gap-0.5">
                ${actionBadge}
                ${entityType ? `<span class="text-[10px] text-slate-500 font-mono">${escapeHtml(entityType)}${log.entity_id ? ': ' + escapeHtml(String(log.entity_id).substring(0, 20)) : ''}</span>` : ''}
                ${entityName ? `<span class="text-[10px] text-slate-600 truncate max-w-[200px]" title="${escapeHtml(entityName)}">${escapeHtml(entityName)}</span>` : ''}
            </div>`;

        // ---------- WHERE ----------
        const moduleLabel = getModuleLabel(log.module);
        const pageTitle = log.metadata?.page_title || '';
        const pageUrl = log.metadata?.page_url || '';
        const whereHtml = `
            <div class="flex flex-col gap-0.5">
                <span class="text-xs font-bold text-primary-600"><i class="fa-solid fa-cube mr-1 opacity-60"></i>${escapeHtml(moduleLabel)}</span>
                ${pageTitle ? `<span class="text-[10px] text-slate-500 truncate max-w-[180px]" title="${escapeHtml(pageTitle)}"><i class="fa-solid fa-file-lines mr-0.5"></i>${escapeHtml(pageTitle)}</span>` : ''}
                ${pageUrl ? `<a href="${escapeHtml(pageUrl)}" target="_blank" class="text-[9px] text-indigo-500 hover:underline truncate max-w-[180px]" title="${escapeHtml(pageUrl)}">${escapeHtml(pageUrl)}</a>` : ''}
            </div>`;

        // ---------- DETAILS ----------
        let detailsParts = [];
        if (log.metadata?.count) detailsParts.push(`<span class="chip bg-cyan-100 text-cyan-700">${log.metadata.count} รายการ</span>`);
        if (log.metadata?.details) detailsParts.push(`<span class="text-[10px] text-slate-500 italic">${escapeHtml(log.metadata.details)}</span>`);
        if (log.reason) detailsParts.push(`<span class="text-[10px] text-amber-600"><i class="fa-solid fa-comment-dots mr-0.5"></i>${escapeHtml(log.reason)}</span>`);
        const detailsHtml = detailsParts.length > 0
            ? `<div class="flex flex-col gap-0.5">${detailsParts.join('')}</div>`
            : '<span class="text-xs text-slate-400">-</span>';

        // ---------- STATUS ----------
        let statusHtml;
        if (log.status === 'SUCCESS' || !log.status) {
            statusHtml = '<span class="chip bg-emerald-100 text-emerald-700"><i class="fa-solid fa-circle-check"></i>สำเร็จ</span>';
        } else if (log.status === 'FAILED') {
            statusHtml = '<span class="chip bg-rose-100 text-rose-700" title="' + escapeHtml(log.error_message || '') + '"><i class="fa-solid fa-circle-xmark"></i>ล้มเหลว</span>';
        } else {
            statusHtml = `<span class="chip bg-amber-100 text-amber-700"><i class="fa-solid fa-triangle-exclamation"></i>${escapeHtml(log.status)}</span>`;
        }

        // ---------- IP ----------
        const ipHtml = log.ip_address
            ? `<span class="font-mono text-[10px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded">${escapeHtml(log.ip_address)}</span>`
            : '<span class="text-xs text-slate-300">-</span>';

        // ---------- VIEW BUTTON ----------
        const viewBtn = `<button onclick="viewLogDetail('${log.id}')" class="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-500 hover:text-white transition flex items-center justify-center" title="ดูรายละเอียด"><i class="fas fa-eye text-xs"></i></button>`;

        return [whenHtml, whoHtml, whatHtml, whereHtml, detailsHtml, statusHtml, ipHtml, viewBtn];
    });

    // ✅ DataTable init (ปลอดภัย — ใช้เฉพาะ excel/pdf/print)
    logsDataTable = $('#logsTable').DataTable({
        data: tableData,
        responsive: true,
        pageLength: 25,
        lengthMenu: [[10, 25, 50, 100, -1], [10, 25, 50, 100, 'ทั้งหมด']],
        dom: '<"flex flex-col md:flex-row justify-between items-center mb-4 gap-3"<"flex items-center gap-2"B><"flex items-center gap-2"f>>rt<"flex flex-col md:flex-row justify-between items-center mt-4 gap-3"ip>',
        buttons: [
            {
                extend: 'excelHtml5',
                text: '<i class="fa-solid fa-file-excel mr-1"></i> Excel',
                className: 'bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold border-none',
                title: 'system_logs_' + new Date().toLocaleDateString('th-TH')
            },
            {
                extend: 'pdfHtml5',
                text: '<i class="fa-solid fa-file-pdf mr-1"></i> PDF',
                className: 'bg-rose-500 hover:bg-rose-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold border-none',
                title: 'system_logs_' + new Date().toLocaleDateString('th-TH'),
                orientation: 'landscape',
                pageSize: 'A3'
            },
            {
                extend: 'print',
                text: '<i class="fa-solid fa-print mr-1"></i> พิมพ์',
                className: 'bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold border-none'
            }
        ],
        // ✅ ใช้ https:// + เวอร์ชันเดียวกับ core_head.js
        language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },

        // ✅ เรียงจากใหม่สุด (desc) ตาม data-ts
        order: [[0, 'desc']],

        // ✅ columns config — เรียงตาม data-ts ใน HTML
        columns: [
            {
                render: function (data, type, row, meta) {
                    if (type === 'sort' || type === 'type') {
                        const m = String(data).match(/data-ts="([^"]+)"/);
                        return m ? m[1] : '';
                    }
                    return data;
                }
            },
            { render: function (d) { return d; } },
            { render: function (d) { return d; } },
            { render: function (d) { return d; } },
            { render: function (d) { return d; } },
            { render: function (d) { return d; } },
            { render: function (d) { return d; } },
            { render: function (d) { return d; } }
        ],

        columnDefs: [
            { orderable: false, targets: [2, 4, 7] },
            { responsivePriority: 1, targets: 1 },
            { responsivePriority: 2, targets: 2 },
            { responsivePriority: 3, targets: 7 },
            { responsivePriority: 4, targets: 0 },
            { responsivePriority: 5, targets: 5 },
            { responsivePriority: 6, targets: 3 },
            { responsivePriority: 7, targets: 4 },
            { responsivePriority: 8, targets: 6 }
        ]
    });

    // ปรับ style
    $('.dataTables_filter input').addClass('px-3 py-1.5 border border-slate-300 rounded-lg outline-none focus:border-indigo-500 text-sm w-full md:w-64');
    $('.dataTables_length select').addClass('px-3 py-1.5 border border-slate-300 rounded-lg outline-none focus:border-indigo-500 text-sm');
}

// =====================================================
// Filters
// =====================================================
function applyFilters() {
    const dateFrom = document.getElementById('filterDateFrom').value;
    const dateTo = document.getElementById('filterDateTo').value;
    const user = document.getElementById('filterUser').value;
    const actionCat = document.getElementById('filterActionCat').value;
    const moduleVal = document.getElementById('filterModule').value;
    const status = document.getElementById('filterStatus').value;

    // ถ้าเปลี่ยนช่วงวันที่ → reload จาก DB ใหม่
    if (dateFrom !== (currentDateFrom || '') || dateTo !== (currentDateTo || '')) {
        currentDateFrom = dateFrom || null;
        currentDateTo = dateTo || null;
        // โหลดใหม่ + filter ต่อ
        loadLogsData(dateFrom, dateTo).then(() => {
            applyClientFilters(user, actionCat, moduleVal, status);
        });
        return;
    }

    applyClientFilters(user, actionCat, moduleVal, status);
}

function applyClientFilters(user, actionCat, moduleVal, status) {
    let filtered = [...allLogsCache];

    if (user) {
        filtered = filtered.filter(l => {
            const p = l.core_personnel;
            if (!p) return false;
            const name = `${p.prefix||''}${p.first_name||''} ${p.last_name||''}`.trim();
            return name === user;
        });
    }
    if (actionCat) filtered = filtered.filter(l => getActionCategory(l.action) === actionCat);
    if (moduleVal) filtered = filtered.filter(l => l.module === moduleVal);
    if (status) {
        filtered = filtered.filter(l => {
            const s = l.status || 'SUCCESS';
            return s === status;
        });
    }

    updateStatistics(filtered);
    renderTable(filtered);
}

function clearFilters() {
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value = '';
    document.getElementById('filterUser').value = '';
    document.getElementById('filterActionCat').value = '';
    document.getElementById('filterModule').value = '';
    document.getElementById('filterStatus').value = '';
    currentDateFrom = null;
    currentDateTo = null;
    loadLogsData();
}

// =====================================================
// Detail Modal
// =====================================================
function viewLogDetail(logId) {
    const log = allLogsCache.find(l => l.id === logId);
    if (!log) return;

    const d = new Date(log.created_at);
    const dateStr = d.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const timeStr = d.toLocaleTimeString('th-TH');
    const relTime = getRelativeTime(log.created_at);

    const p = log.core_personnel;
    const fullName = p ? `${p.prefix||''}${p.first_name||''} ${p.last_name||''}`.trim() : 'ไม่ทราบ/ถูกลบ';
    const initial = (p?.first_name || '?').charAt(0).toUpperCase();

    const actionDef = ACTION_DISPLAY[log.action] || { label: log.action, icon: 'fa-circle-question', color: 'slate' };
    const c = COLOR_CLASSES[actionDef.color] || COLOR_CLASSES.slate;

    let diffHtml = '';
    if (log.old_values || log.new_values) {
        const oldJson = log.old_values ? JSON.stringify(log.old_values, null, 2) : '-';
        const newJson = log.new_values ? JSON.stringify(log.new_values, null, 2) : '-';
        diffHtml = `
            <div class="detail-section diff">
                <h4><i class="fa-solid fa-code-compare mr-1"></i>การเปลี่ยนแปลง (Diff)</h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <div class="text-[10px] font-bold text-rose-600 mb-1">ก่อน (Old)</div>
                        <pre class="text-[10px] bg-rose-50 border border-rose-200 rounded-lg p-2 overflow-x-auto max-h-40">${escapeHtml(oldJson)}</pre>
                    </div>
                    <div>
                        <div class="text-[10px] font-bold text-emerald-600 mb-1">หลัง (New)</div>
                        <pre class="text-[10px] bg-emerald-50 border border-emerald-200 rounded-lg p-2 overflow-x-auto max-h-40">${escapeHtml(newJson)}</pre>
                    </div>
                </div>
            </div>`;
    }

    const metadataJson = log.metadata ? JSON.stringify(log.metadata, null, 2) : null;

    const html = `
        <div class="detail-section who">
            <h4><i class="fa-solid fa-user mr-1"></i>ใคร (WHO)</h4>
            <div class="flex items-center gap-3">
                <div class="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-blue-500 text-white text-lg font-bold flex items-center justify-center">${initial}</div>
                <div class="flex-1">
                    <div class="font-bold text-slate-800 text-base">${escapeHtml(fullName)}</div>
                    <div class="mt-1 flex flex-wrap items-center gap-2">
                        ${p ? getRoleBadge(p.role) : ''}
                        ${p?.department ? `<span class="text-xs text-slate-500"><i class="fa-solid fa-building mr-1"></i>${escapeHtml(p.department)}</span>` : ''}
                        ${p?.email ? `<span class="text-xs text-slate-500"><i class="fa-solid fa-envelope mr-1"></i>${escapeHtml(p.email)}</span>` : ''}
                    </div>
                </div>
            </div>
        </div>

        <div class="detail-section when">
            <h4><i class="fa-solid fa-calendar mr-1"></i>เมื่อไหร่ (WHEN)</h4>
            <div class="text-sm">
                <div class="font-bold text-slate-800">${dateStr}</div>
                <div class="text-slate-600 flex items-center gap-2 mt-1">
                    <i class="fa-regular fa-clock"></i>${timeStr} น.
                    <span class="chip bg-indigo-100 text-indigo-700">${relTime}</span>
                </div>
            </div>
        </div>

        <div class="detail-section what">
            <h4><i class="fa-solid fa-bolt mr-1"></i>ทำอะไร (WHAT)</h4>
            <div class="space-y-2">
                <div class="flex items-center gap-2">
                    <span class="chip ${c.bg} ${c.text} text-sm py-1 px-3"><i class="fa-solid ${actionDef.icon}"></i>${escapeHtml(actionDef.label)}</span>
                    <span class="text-xs text-slate-400 font-mono">${escapeHtml(log.action)}</span>
                </div>
                ${log.entity_type ? `
                    <div class="text-xs">
                        <span class="font-bold text-slate-600">Entity:</span>
                        <span class="font-mono text-indigo-600">${escapeHtml(log.entity_type)}</span>
                        ${log.entity_id ? ` <span class="text-slate-400">#${escapeHtml(String(log.entity_id))}</span>` : ''}
                    </div>` : ''}
                ${log.metadata?.entity_name ? `
                    <div class="text-xs">
                        <span class="font-bold text-slate-600">ชื่อ entity:</span>
                        <span class="text-slate-700">${escapeHtml(log.metadata.entity_name)}</span>
                    </div>` : ''}
                ${log.metadata?.count ? `
                    <div class="text-xs">
                        <span class="font-bold text-slate-600">จำนวน:</span>
                        <span class="text-cyan-700 font-bold">${log.metadata.count} รายการ</span>
                    </div>` : ''}
                ${log.reason ? `
                    <div class="text-xs bg-amber-50 border border-amber-200 rounded-lg p-2">
                        <span class="font-bold text-amber-700"><i class="fa-solid fa-comment-dots mr-1"></i>สาเหตุ:</span>
                        <span class="text-amber-800">${escapeHtml(log.reason)}</span>
                    </div>` : ''}
            </div>
        </div>

        <div class="detail-section where">
            <h4><i class="fa-solid fa-location-dot mr-1"></i>ที่ไหน (WHERE)</h4>
            <div class="space-y-1.5 text-sm">
                <div>
                    <span class="font-bold text-slate-600">โมดูล:</span>
                    <span class="font-semibold text-primary-600">${escapeHtml(getModuleLabel(log.module))}</span>
                    <span class="text-xs text-slate-400 font-mono">(${escapeHtml(log.module)})</span>
                </div>
                ${log.metadata?.page_title ? `
                    <div>
                        <span class="font-bold text-slate-600">หน้า:</span>
                        <span class="text-slate-700">${escapeHtml(log.metadata.page_title)}</span>
                    </div>` : ''}
                ${log.metadata?.page_url ? `
                    <div>
                        <span class="font-bold text-slate-600">URL:</span>
                        <a href="${escapeHtml(log.metadata.page_url)}" target="_blank" class="text-indigo-600 hover:underline text-xs">${escapeHtml(log.metadata.page_url)}</a>
                    </div>` : ''}
            </div>
        </div>

        ${diffHtml}

        <div class="detail-section tech">
            <h4><i class="fa-solid fa-microchip mr-1"></i>ข้อมูลเทคนิค</h4>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                <div>
                    <span class="font-bold text-slate-600">สถานะ:</span>
                    ${log.status === 'SUCCESS' || !log.status
                        ? '<span class="chip bg-emerald-100 text-emerald-700"><i class="fa-solid fa-circle-check"></i>สำเร็จ</span>'
                        : `<span class="chip bg-rose-100 text-rose-700"><i class="fa-solid fa-circle-xmark"></i>${escapeHtml(log.status)}</span>`}
                </div>
                <div>
                    <span class="font-bold text-slate-600">Source:</span>
                    <span class="font-mono text-slate-700">${escapeHtml(log.source || 'UI')}</span>
                </div>
                <div class="md:col-span-2">
                    <span class="font-bold text-slate-600">IP:</span>
                    <span class="font-mono bg-slate-100 px-2 py-0.5 rounded">${escapeHtml(log.ip_address || '-')}</span>
                </div>
                <div class="md:col-span-2">
                    <span class="font-bold text-slate-600">User Agent:</span>
                    <button onclick="showUserAgentModal(\`${escapeHtml(log.user_agent || '').replace(/`/g, '\\`')}\`)" class="text-indigo-600 hover:underline">ดูรายละเอียด</button>
                    <div class="text-[10px] text-slate-500 mt-0.5 break-all">${escapeHtml((log.user_agent || '-').substring(0, 120))}${(log.user_agent || '').length > 120 ? '...' : ''}</div>
                </div>
                <div class="md:col-span-2">
                    <span class="font-bold text-slate-600">Log ID:</span>
                    <span class="font-mono text-[10px] bg-slate-100 px-2 py-0.5 rounded">${escapeHtml(log.id)}</span>
                </div>
                ${log.error_message ? `
                    <div class="md:col-span-2 bg-rose-50 border border-rose-200 rounded-lg p-2">
                        <span class="font-bold text-rose-700">Error:</span>
                        <div class="text-rose-800 text-[11px] mt-1">${escapeHtml(log.error_message)}</div>
                    </div>` : ''}
                ${metadataJson ? `
                    <div class="md:col-span-2">
                        <span class="font-bold text-slate-600">Metadata:</span>
                        <pre class="text-[10px] bg-slate-50 border border-slate-200 rounded-lg p-2 mt-1 overflow-x-auto max-h-32">${escapeHtml(metadataJson)}</pre>
                    </div>` : ''}
            </div>
        </div>
    `;

    document.getElementById('detailBody').innerHTML = html;
    document.getElementById('detail-log-id').textContent = '#' + logId.substring(0, 8);
    document.getElementById('detailModal').classList.remove('hidden');
    document.getElementById('detailModal').classList.add('flex');
}

function closeDetailModal() {
    document.getElementById('detailModal').classList.add('hidden');
    document.getElementById('detailModal').classList.remove('flex');
}

// =====================================================
// User Agent Modal
// =====================================================
function showUserAgentModal(uaText) {
    document.getElementById('uaFullText').textContent = uaText || '-';
    document.getElementById('uaModal').classList.remove('hidden');
    document.getElementById('uaModal').classList.add('flex');
}
function closeUaModal() {
    document.getElementById('uaModal').classList.add('hidden');
    document.getElementById('uaModal').classList.remove('flex');
}

// =====================================================
// logUserAction
// =====================================================
async function logUserAction(action, module, options = {}) {
    try {
        const { data: { session } } = await db.auth.getSession();
        if (!session) return;

        const userIp = await getUserIP();

        const enrichedMetadata = {
            ...(options.metadata || {})
        };
        if (!enrichedMetadata.page_title) {
            enrichedMetadata.page_title = document.title || '-';
        }
        if (!enrichedMetadata.page_url) {
            enrichedMetadata.page_url = window.location.pathname + window.location.hash;
        }

        const logData = {
            action,
            module,
            entity_type:   options.entity_type   || null,
            entity_id:     options.entity_id     || null,
            old_values:    options.old_values    || null,
            new_values:    options.new_values    || null,
            performed_by:  session.user.id,
            ip_address:    userIp,
            user_agent:    navigator.userAgent,
            status:        options.status        || 'SUCCESS',
            error_message: options.error_message || null,
            source:        options.source        || 'UI',
            reason:        options.reason        || null,
            metadata:      enrichedMetadata
        };

        const { error } = await db.from('system_audit_logs').insert([logData]);
        if (error) {
            console.warn('Primary log insert failed, using fallback:', error);
            await db.from('core_access_logs').insert([{
                user_id:    session.user.id,
                action,
                module,
                ip_address: userIp,
                user_agent: navigator.userAgent
            }]);
        }
    } catch (err) {
        console.error('Failed to save log:', err);
    }
}

async function getUserIP() {
    try {
        const res = await fetch('https://api.ipify.org?format=json');
        const data = await res.json();
        return data.ip;
    } catch { return null; }
}

// =====================================================
// Logout
// =====================================================
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
            await logUserAction(ACTION.LOGOUT, MODULE.AUTH, {
                metadata: { page_title: 'ออกจากระบบ' }
            });
            await db.auth.signOut();
            window.location.replace('login.html');
        }
    });
}

// =====================================================
// ลบ Logs เก่า
// =====================================================
async function clearOldLogs() {
    const result = await Swal.fire({
        title: 'ลบประวัติ Logs เก่า',
        html: `
            <p class="text-left text-sm text-slate-600 mb-2">เลือกระยะเวลาที่ต้องการลบ:</p>
            <select id="logDeleteOption" class="swal2-input w-full">
                <option value="30">เก่ากว่า 30 วัน</option>
                <option value="90">เก่ากว่า 90 วัน</option>
                <option value="180">เก่ากว่า 180 วัน</option>
                <option value="365">เก่ากว่า 1 ปี</option>
                <option value="all">ลบทั้งหมด (ไม่แนะนำ)</option>
            </select>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'ยืนยันการลบ',
        cancelButtonText: 'ยกเลิก',
        preConfirm: () => document.getElementById('logDeleteOption').value
    });
    if (!result.isConfirmed) return;

    const days = result.value;
    try {
        await logUserAction(ACTION.SYSTEM.LOG_DELETE, MODULE.SYSTEM_LOGS, {
            metadata: {
                page_title: 'System Logs',
                details: days === 'all' ? 'ลบทั้งหมด' : `เก่ากว่า ${days} วัน`
            }
        });

        if (days === 'all') {
            await Promise.all([
                db.from('system_audit_logs').delete().not('id', 'is', null),
                db.from('core_access_logs').delete().not('id', 'is', null)
            ]);
        } else {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - parseInt(days));
            const iso = cutoff.toISOString();
            await Promise.all([
                db.from('system_audit_logs').delete().lt('created_at', iso),
                db.from('core_access_logs').delete().lt('created_at', iso)
            ]);
        }

        Swal.fire({
            icon: 'success',
            title: 'ลบสำเร็จ',
            text: days === 'all' ? 'ลบ Logs ทั้งหมดเรียบร้อย' : `ลบ Logs ที่เก่ากว่า ${days} วัน เรียบร้อย`,
            timer: 1500,
            showConfirmButton: false
        }).then(() => {
            // ✅ หน่วงเวลาให้ Swal ปิดก่อน แล้วค่อย reload
            setTimeout(() => {
                currentDateFrom = null;
                currentDateTo = null;
                loadLogsData();
            }, 150);
        });
    } catch (err) {
        Swal.fire('ผิดพลาด', 'ไม่สามารถลบ Logs: ' + err.message, 'error');
    }
}

// =====================================================
// Exports
// =====================================================
window.ACTION = ACTION;
window.MODULE = MODULE;
window.ACTION_DISPLAY = ACTION_DISPLAY;
window.logUserAction = logUserAction;
window.handleLogout = handleLogout;
window.viewLogDetail = viewLogDetail;
window.closeDetailModal = closeDetailModal;
window.showUserAgentModal = showUserAgentModal;
window.closeUaModal = closeUaModal;
window.getRelativeTime = getRelativeTime;

console.log('✅ system_logs.js v4 loaded (CORS fix + sort fix + safe buttons)');