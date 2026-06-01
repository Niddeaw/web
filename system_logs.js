// system_logs.js — FULL DETAIL ACTIONS (v2)
// เพิ่ม: Action catalog ครบทุกการกระทำ + page_title + description + metadata
// รองรับ system_audit_logs (primary) และ core_access_logs (fallback)

let logsDataTable;
let currentDateFrom = null;
let currentDateTo = null;

// =====================================================
// ACTION CATALOG — ทุก Action ที่ระบบรองรับ
// ใช้ใน logUserAction() ได้เลย เช่น
//   logUserAction(ACTION.LOGIN, MODULE.AUTH)
//   logUserAction(ACTION.STUDENT.CREATE, MODULE.STUDENT, { entity_id: studentId })
// =====================================================
const ACTION = {
    // ---------- Auth ----------
    LOGIN:              'LOGIN',
    LOGOUT:             'LOGOUT',
    LOGIN_FAILED:       'LOGIN_FAILED',
    SESSION_EXPIRED:    'SESSION_EXPIRED',
    PASSWORD_CHANGE:    'PASSWORD_CHANGE',
    PASSWORD_RESET:     'PASSWORD_RESET',

    // ---------- การดูหน้า ----------
    VIEW_PAGE:          'VIEW_PAGE',
    VIEW_DETAIL:        'VIEW_DETAIL',
    VIEW_REPORT:        'VIEW_REPORT',
    EXPORT:             'EXPORT',
    PRINT:              'PRINT',
    SEARCH:             'SEARCH',
    FILTER:             'FILTER',

    // ---------- นักเรียน ----------
    STUDENT: {
        CREATE:         'STUDENT_CREATE',
        UPDATE:         'STUDENT_UPDATE',
        DELETE:         'STUDENT_DELETE',
        VIEW:           'STUDENT_VIEW',
        IMPORT:         'STUDENT_IMPORT',
        EXPORT:         'STUDENT_EXPORT',
        TRANSFER:       'STUDENT_TRANSFER',        // ย้ายชั้น
        GRADUATE:       'STUDENT_GRADUATE',        // จบการศึกษา
        SUSPEND:        'STUDENT_SUSPEND',         // พักการเรียน
        STATUS_CHANGE:  'STUDENT_STATUS_CHANGE',
    },

    // ---------- บุคลากร ----------
    PERSONNEL: {
        CREATE:         'PERSONNEL_CREATE',
        UPDATE:         'PERSONNEL_UPDATE',
        DELETE:         'PERSONNEL_DELETE',
        VIEW:           'PERSONNEL_VIEW',
        ROLE_CHANGE:    'PERSONNEL_ROLE_CHANGE',   // เปลี่ยนสิทธิ์
        ACTIVATE:       'PERSONNEL_ACTIVATE',
        DEACTIVATE:     'PERSONNEL_DEACTIVATE',
    },

    // ---------- ห้องเรียน / ชั้นเรียน ----------
    CLASSROOM: {
        CREATE:         'CLASSROOM_CREATE',
        UPDATE:         'CLASSROOM_UPDATE',
        DELETE:         'CLASSROOM_DELETE',
        VIEW:           'CLASSROOM_VIEW',
        ASSIGN_TEACHER: 'CLASSROOM_ASSIGN_TEACHER',
        ASSIGN_STUDENT: 'CLASSROOM_ASSIGN_STUDENT',
    },

    // ---------- วิชา / หลักสูตร ----------
    SUBJECT: {
        CREATE:         'SUBJECT_CREATE',
        UPDATE:         'SUBJECT_UPDATE',
        DELETE:         'SUBJECT_DELETE',
        VIEW:           'SUBJECT_VIEW',
    },

    // ---------- ตารางสอน ----------
    SCHEDULE: {
        CREATE:         'SCHEDULE_CREATE',
        UPDATE:         'SCHEDULE_UPDATE',
        DELETE:         'SCHEDULE_DELETE',
        VIEW:           'SCHEDULE_VIEW',
        PUBLISH:        'SCHEDULE_PUBLISH',
    },

    // ---------- การเช็คชื่อ ----------
    ATTENDANCE: {
        MARK:           'ATTENDANCE_MARK',
        EDIT:           'ATTENDANCE_EDIT',
        VIEW:           'ATTENDANCE_VIEW',
        REPORT:         'ATTENDANCE_REPORT',
    },

    // ---------- คะแนน / ผลการเรียน ----------
    GRADE: {
        CREATE:         'GRADE_CREATE',
        UPDATE:         'GRADE_UPDATE',
        DELETE:         'GRADE_DELETE',
        VIEW:           'GRADE_VIEW',
        SUBMIT:         'GRADE_SUBMIT',            // ส่งคะแนน
        APPROVE:        'GRADE_APPROVE',
        REPORT:         'GRADE_REPORT',
    },

    // ---------- เอกสาร ----------
    DOCUMENT: {
        CREATE:         'DOCUMENT_CREATE',
        UPDATE:         'DOCUMENT_UPDATE',
        DELETE:         'DOCUMENT_DELETE',
        VIEW:           'DOCUMENT_VIEW',
        DOWNLOAD:       'DOCUMENT_DOWNLOAD',
        APPROVE:        'DOCUMENT_APPROVE',
        REJECT:         'DOCUMENT_REJECT',
    },

    // ---------- การเงิน ----------
    FINANCE: {
        CREATE:         'FINANCE_CREATE',
        UPDATE:         'FINANCE_UPDATE',
        DELETE:         'FINANCE_DELETE',
        VIEW:           'FINANCE_VIEW',
        PAYMENT:        'FINANCE_PAYMENT',
        REFUND:         'FINANCE_REFUND',
        REPORT:         'FINANCE_REPORT',
    },

    // ---------- การแจ้งเตือน ----------
    NOTIFICATION: {
        SEND:           'NOTIFICATION_SEND',
        VIEW:           'NOTIFICATION_VIEW',
        DELETE:         'NOTIFICATION_DELETE',
    },

    // ---------- ระบบ / แอดมิน ----------
    SYSTEM: {
        SETTING_UPDATE: 'SYSTEM_SETTING_UPDATE',
        BACKUP:         'SYSTEM_BACKUP',
        RESTORE:        'SYSTEM_RESTORE',
        LOG_DELETE:     'SYSTEM_LOG_DELETE',
        LOG_EXPORT:     'SYSTEM_LOG_EXPORT',
        LOG_VIEW:       'SYSTEM_LOG_VIEW',
        MAINTENANCE:    'SYSTEM_MAINTENANCE',
    },
};

// Module ที่ใช้ใน logUserAction
const MODULE = {
    AUTH:           'AUTH',
    STUDENT:        'STUDENT',
    PERSONNEL:      'PERSONNEL',
    CLASSROOM:      'CLASSROOM',
    SUBJECT:        'SUBJECT',
    SCHEDULE:       'SCHEDULE',
    ATTENDANCE:     'ATTENDANCE',
    GRADE:          'GRADE',
    DOCUMENT:       'DOCUMENT',
    FINANCE:        'FINANCE',
    NOTIFICATION:   'NOTIFICATION',
    SYSTEM_LOGS:    'SYSTEM_LOGS',
    SETTINGS:       'SETTINGS',
    DASHBOARD:      'DASHBOARD',
    REPORT:         'REPORT',
};

// =====================================================
// ACTION DISPLAY MAP
// key → { label, icon, color, description }
// =====================================================
const ACTION_DISPLAY = {
    // Auth
    'LOGIN':                    { label: 'เข้าสู่ระบบ',           icon: 'fa-right-to-bracket',    color: 'green' },
    'LOGOUT':                   { label: 'ออกจากระบบ',            icon: 'fa-right-from-bracket',  color: 'red' },
    'LOGIN_FAILED':             { label: 'เข้าสู่ระบบล้มเหลว',   icon: 'fa-triangle-exclamation', color: 'red' },
    'SESSION_EXPIRED':          { label: 'Session หมดอายุ',       icon: 'fa-clock',               color: 'orange' },
    'PASSWORD_CHANGE':          { label: 'เปลี่ยนรหัสผ่าน',      icon: 'fa-key',                 color: 'amber' },
    'PASSWORD_RESET':           { label: 'รีเซ็ตรหัสผ่าน',       icon: 'fa-rotate-right',        color: 'amber' },

    // ดูหน้า
    'VIEW_PAGE':                { label: 'ดูหน้า',                icon: 'fa-eye',                 color: 'indigo' },
    'VIEW_DETAIL':              { label: 'ดูรายละเอียด',          icon: 'fa-magnifying-glass',    color: 'indigo' },
    'VIEW_REPORT':              { label: 'ดูรายงาน',              icon: 'fa-chart-bar',           color: 'indigo' },
    'EXPORT':                   { label: 'Export ข้อมูล',          icon: 'fa-file-export',         color: 'teal' },
    'PRINT':                    { label: 'พิมพ์เอกสาร',           icon: 'fa-print',               color: 'teal' },
    'SEARCH':                   { label: 'ค้นหา',                 icon: 'fa-magnifying-glass',    color: 'sky' },
    'FILTER':                   { label: 'กรองข้อมูล',            icon: 'fa-filter',              color: 'sky' },

    // นักเรียน
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

    // บุคลากร
    'PERSONNEL_CREATE':         { label: 'เพิ่มบุคลากร',          icon: 'fa-user-plus',           color: 'emerald' },
    'PERSONNEL_UPDATE':         { label: 'แก้ไขบุคลากร',          icon: 'fa-user-pen',            color: 'blue' },
    'PERSONNEL_DELETE':         { label: 'ลบบุคลากร',             icon: 'fa-user-minus',          color: 'rose' },
    'PERSONNEL_VIEW':           { label: 'ดูโปรไฟล์บุคลากร',     icon: 'fa-id-card',             color: 'indigo' },
    'PERSONNEL_ROLE_CHANGE':    { label: 'เปลี่ยนสิทธิ์การใช้งาน', icon: 'fa-user-shield',       color: 'amber' },
    'PERSONNEL_ACTIVATE':       { label: 'เปิดใช้งานบัญชี',      icon: 'fa-circle-check',        color: 'green' },
    'PERSONNEL_DEACTIVATE':     { label: 'ปิดใช้งานบัญชี',       icon: 'fa-circle-xmark',        color: 'slate' },

    // ห้องเรียน
    'CLASSROOM_CREATE':         { label: 'สร้างห้องเรียน',         icon: 'fa-door-open',           color: 'emerald' },
    'CLASSROOM_UPDATE':         { label: 'แก้ไขห้องเรียน',         icon: 'fa-pen-to-square',       color: 'blue' },
    'CLASSROOM_DELETE':         { label: 'ลบห้องเรียน',            icon: 'fa-trash-can',           color: 'rose' },
    'CLASSROOM_VIEW':           { label: 'ดูห้องเรียน',            icon: 'fa-chalkboard',          color: 'indigo' },
    'CLASSROOM_ASSIGN_TEACHER': { label: 'มอบหมายครูประจำชั้น',   icon: 'fa-chalkboard-user',     color: 'violet' },
    'CLASSROOM_ASSIGN_STUDENT': { label: 'มอบหมายนักเรียน',       icon: 'fa-users-line',          color: 'violet' },

    // วิชา
    'SUBJECT_CREATE':           { label: 'เพิ่มวิชา',              icon: 'fa-book-open-reader',    color: 'emerald' },
    'SUBJECT_UPDATE':           { label: 'แก้ไขวิชา',              icon: 'fa-book-open',           color: 'blue' },
    'SUBJECT_DELETE':           { label: 'ลบวิชา',                 icon: 'fa-trash-can',           color: 'rose' },
    'SUBJECT_VIEW':             { label: 'ดูวิชา',                 icon: 'fa-book',                color: 'indigo' },

    // ตารางสอน
    'SCHEDULE_CREATE':          { label: 'สร้างตารางสอน',          icon: 'fa-calendar-plus',       color: 'emerald' },
    'SCHEDULE_UPDATE':          { label: 'แก้ไขตารางสอน',          icon: 'fa-calendar-pen',        color: 'blue' },
    'SCHEDULE_DELETE':          { label: 'ลบตารางสอน',             icon: 'fa-calendar-xmark',      color: 'rose' },
    'SCHEDULE_VIEW':            { label: 'ดูตารางสอน',             icon: 'fa-calendar-days',       color: 'indigo' },
    'SCHEDULE_PUBLISH':         { label: 'เผยแพร่ตารางสอน',        icon: 'fa-calendar-check',      color: 'teal' },

    // เช็คชื่อ
    'ATTENDANCE_MARK':          { label: 'บันทึกการเข้าเรียน',    icon: 'fa-clipboard-user',      color: 'emerald' },
    'ATTENDANCE_EDIT':          { label: 'แก้ไขการเข้าเรียน',     icon: 'fa-clipboard-check',     color: 'blue' },
    'ATTENDANCE_VIEW':          { label: 'ดูการเข้าเรียน',        icon: 'fa-clipboard-list',      color: 'indigo' },
    'ATTENDANCE_REPORT':        { label: 'รายงานการเข้าเรียน',    icon: 'fa-chart-column',        color: 'violet' },

    // คะแนน
    'GRADE_CREATE':             { label: 'บันทึกคะแนน',           icon: 'fa-star',                color: 'emerald' },
    'GRADE_UPDATE':             { label: 'แก้ไขคะแนน',            icon: 'fa-star-half-stroke',    color: 'blue' },
    'GRADE_DELETE':             { label: 'ลบคะแนน',               icon: 'fa-trash-can',           color: 'rose' },
    'GRADE_VIEW':               { label: 'ดูคะแนน',               icon: 'fa-star',                color: 'indigo' },
    'GRADE_SUBMIT':             { label: 'ส่งคะแนน',              icon: 'fa-paper-plane',         color: 'teal' },
    'GRADE_APPROVE':            { label: 'อนุมัติคะแนน',          icon: 'fa-circle-check',        color: 'green' },
    'GRADE_REPORT':             { label: 'รายงานผลการเรียน',      icon: 'fa-chart-bar',           color: 'violet' },

    // เอกสาร
    'DOCUMENT_CREATE':          { label: 'สร้างเอกสาร',            icon: 'fa-file-circle-plus',    color: 'emerald' },
    'DOCUMENT_UPDATE':          { label: 'แก้ไขเอกสาร',            icon: 'fa-file-pen',            color: 'blue' },
    'DOCUMENT_DELETE':          { label: 'ลบเอกสาร',               icon: 'fa-file-circle-xmark',   color: 'rose' },
    'DOCUMENT_VIEW':            { label: 'ดูเอกสาร',               icon: 'fa-file-lines',          color: 'indigo' },
    'DOCUMENT_DOWNLOAD':        { label: 'ดาวน์โหลดเอกสาร',        icon: 'fa-file-arrow-down',     color: 'teal' },
    'DOCUMENT_APPROVE':         { label: 'อนุมัติเอกสาร',          icon: 'fa-file-circle-check',   color: 'green' },
    'DOCUMENT_REJECT':          { label: 'ปฏิเสธเอกสาร',           icon: 'fa-file-circle-xmark',   color: 'rose' },

    // การเงิน
    'FINANCE_CREATE':           { label: 'บันทึกรายการเงิน',       icon: 'fa-circle-plus',         color: 'emerald' },
    'FINANCE_UPDATE':           { label: 'แก้ไขรายการเงิน',        icon: 'fa-pen-to-square',       color: 'blue' },
    'FINANCE_DELETE':           { label: 'ลบรายการเงิน',           icon: 'fa-trash-can',           color: 'rose' },
    'FINANCE_VIEW':             { label: 'ดูรายการเงิน',           icon: 'fa-coins',               color: 'indigo' },
    'FINANCE_PAYMENT':          { label: 'รับชำระเงิน',            icon: 'fa-money-bill-wave',     color: 'green' },
    'FINANCE_REFUND':           { label: 'คืนเงิน',                icon: 'fa-rotate-left',         color: 'orange' },
    'FINANCE_REPORT':           { label: 'รายงานการเงิน',          icon: 'fa-file-invoice-dollar', color: 'violet' },

    // การแจ้งเตือน
    'NOTIFICATION_SEND':        { label: 'ส่งการแจ้งเตือน',        icon: 'fa-bell',                color: 'amber' },
    'NOTIFICATION_VIEW':        { label: 'ดูการแจ้งเตือน',         icon: 'fa-bell',                color: 'indigo' },
    'NOTIFICATION_DELETE':      { label: 'ลบการแจ้งเตือน',         icon: 'fa-bell-slash',          color: 'rose' },

    // ระบบ
    'SYSTEM_SETTING_UPDATE':    { label: 'แก้ไขการตั้งค่าระบบ',    icon: 'fa-gear',                color: 'amber' },
    'SYSTEM_BACKUP':            { label: 'สำรองข้อมูลระบบ',         icon: 'fa-hard-drive',          color: 'teal' },
    'SYSTEM_RESTORE':           { label: 'กู้คืนข้อมูลระบบ',        icon: 'fa-rotate-right',        color: 'orange' },
    'SYSTEM_LOG_DELETE':        { label: 'ลบ Log ระบบ',             icon: 'fa-trash-can',           color: 'rose' },
    'SYSTEM_LOG_EXPORT':        { label: 'Export Log ระบบ',         icon: 'fa-file-export',         color: 'teal' },
    'SYSTEM_LOG_VIEW':          { label: 'ดู Log ระบบ',             icon: 'fa-list-check',          color: 'indigo' },
    'SYSTEM_MAINTENANCE':       { label: 'โหมดซ่อมบำรุง',          icon: 'fa-screwdriver-wrench',  color: 'slate' },
};

// สีสำหรับ badge (tailwind class)
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
    slate:   { bg: 'bg-slate-100',   text: 'text-slate-700' },
};

// =====================================================
// สร้าง Action Badge จาก ACTION_DISPLAY map
// =====================================================
function getActionBadge(action) {
    const def = ACTION_DISPLAY[action];
    if (!def) {
        // fallback: badge เทาทั่วไป
        return `<span class="px-2 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-600">
                    <i class="fa-solid fa-circle-question mr-1"></i>${action}
                </span>`;
    }
    const c = COLOR_CLASSES[def.color] || COLOR_CLASSES['slate'];
    return `<span class="px-2 py-1 rounded-md text-xs font-medium ${c.bg} ${c.text}" title="${def.label}">
                <i class="fa-solid ${def.icon} mr-1"></i>${def.label}
            </span>`;
}

// =====================================================
// สร้าง Description Cell
// แสดงสรุปการกระทำที่อ่านได้ง่าย พร้อม metadata
// =====================================================
function getDescriptionHtml(log) {
    const metadata = log.metadata || {};
    const pageName = metadata.page_title || log.module || '-';
    const entityName = metadata.entity_name || '';
    const count = metadata.count || null;
    const details = metadata.details || null;
    const reason = log.reason || null;
    const status = log.status || 'SUCCESS';
    const errorMsg = log.error_message || '';

    let parts = [];

    // หน้าที่อยู่
    if (pageName && pageName !== '-')
        parts.push(`<span class="text-slate-500 text-xs"><i class="fa-solid fa-location-dot mr-1 text-slate-400"></i>${escapeHtml(pageName)}</span>`);

    // ชื่อ entity ที่กระทำ เช่น ชื่อนักเรียน
    if (entityName)
        parts.push(`<span class="text-slate-700 text-xs font-medium"><i class="fa-solid fa-tag mr-1 text-slate-400"></i>${escapeHtml(entityName)}</span>`);

    // จำนวน (เช่น import 50 รายการ)
    if (count !== null)
        parts.push(`<span class="text-xs text-slate-500">${escapeHtml(String(count))} รายการ</span>`);

    // รายละเอียดพิเศษ
    if (details)
        parts.push(`<span class="text-xs text-slate-400 italic">${escapeHtml(details)}</span>`);

    // เหตุผล (ถ้ามี เช่น เหตุผลลบ)
    if (reason)
        parts.push(`<span class="text-xs text-amber-600"><i class="fa-solid fa-comment-dots mr-1"></i>${escapeHtml(reason)}</span>`);

    // สถานะ (แสดงเฉพาะตอนล้มเหลว)
    if (status !== 'SUCCESS') {
        const sc = status === 'FAILED' ? 'text-red-600' : 'text-orange-500';
        parts.push(`<span class="text-xs ${sc} font-semibold"><i class="fa-solid fa-circle-xmark mr-1"></i>${status}${errorMsg ? ': ' + escapeHtml(errorMsg) : ''}</span>`);
    }

    if (parts.length === 0)
        return `<span class="text-slate-400 text-xs">-</span>`;

    return `<div class="flex flex-col gap-0.5">${parts.join('')}</div>`;
}

// =====================================================
// 1. ตรวจสอบสิทธิ์ (Super Admin เท่านั้น)
// =====================================================
window.onload = async () => { await checkSuperAdminAuth(); };

async function checkSuperAdminAuth() {
    try {
        const { data: { session } } = await db.auth.getSession();
        if (!session) throw new Error("No session");
        const { data: profile, error } = await db.from('core_personnel')
            .select('role').eq('id', session.user.id).single();
        if (error || !profile) throw new Error("Profile not found");
        if (profile.role !== 'super_admin') {
            Swal.fire({ icon: 'error', title: 'ปฏิเสธการเข้าถึง', text: 'คุณไม่มีสิทธิ์เข้าถึงหน้านี้ (เฉพาะ Super Admin)', confirmButtonColor: '#3085d6' })
                .then(() => window.location.replace('index.html'));
            return;
        }
        document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');
        await logUserAction(ACTION.SYSTEM.LOG_VIEW, MODULE.SYSTEM_LOGS, {
            metadata: { page_title: 'System Logs' }
        });

        document.getElementById('applyDateFilterBtn').addEventListener('click', applyDateFilter);
        document.getElementById('clearDateFilterBtn').addEventListener('click', clearDateFilter);
        document.getElementById('refreshLogsBtn').addEventListener('click', () => refreshLogs());
        document.getElementById('closeUaModal').addEventListener('click', closeUaModal);
        document.getElementById('closeUaModalBtn').addEventListener('click', closeUaModal);
        window.addEventListener('click', (e) => { if (e.target === document.getElementById('uaModal')) closeUaModal(); });

        await loadLogsData();
    } catch (err) {
        window.location.replace('index.html');
    }
}

// =====================================================
// 2. โหลดข้อมูล Logs
//    ดึงจาก system_audit_logs (primary) + fallback core_access_logs
//    รวม ip_address, metadata, description
// =====================================================
async function loadLogsData(dateFrom = null, dateTo = null) {
    Swal.fire({ title: 'กำลังโหลดข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        let logs = [];

        try {
            // Primary: system_audit_logs
            let query = db.from('system_audit_logs')
                .select(`id, action, module, ip_address, user_agent, created_at,
                         status, error_message, reason, metadata,
                         core_personnel!system_audit_logs_performed_by_fkey (prefix, first_name, last_name, role)`);
            if (dateFrom) { const s = new Date(dateFrom); s.setHours(0,0,0,0); query = query.gte('created_at', s.toISOString()); }
            if (dateTo)   { const e = new Date(dateTo);   e.setHours(23,59,59,999); query = query.lte('created_at', e.toISOString()); }
            const { data, error } = await query.order('created_at', { ascending: false });
            if (error) throw error;
            logs = data || [];
        } catch {
            // Fallback: core_access_logs
            let query = db.from('core_access_logs')
                .select(`id, action, module, ip_address, user_agent, created_at,
                         core_personnel (prefix, first_name, last_name, role)`);
            if (dateFrom) { const s = new Date(dateFrom); s.setHours(0,0,0,0); query = query.gte('created_at', s.toISOString()); }
            if (dateTo)   { const e = new Date(dateTo);   e.setHours(23,59,59,999); query = query.lte('created_at', e.toISOString()); }
            const { data, error } = await query.order('created_at', { ascending: false });
            if (error) throw error;
            logs = data || [];
        }

        updateStatistics(logs);

        const tableData = logs.map(log => {
            // วันเวลา
            const dateObj = new Date(log.created_at);
            const formattedDate = `${dateObj.toLocaleDateString('th-TH')} ${dateObj.toLocaleTimeString('th-TH')}`;

            // ชื่อผู้ใช้
            let fullName = 'ไม่ทราบชื่อ/ถูกลบ';
            const p = log.core_personnel;
            if (p) {
                fullName = `${p.prefix || ''}${p.first_name || ''} ${p.last_name || ''}`.trim() || 'ไม่ระบุชื่อ';
            }
            const userRole = p ? getRoleBadge(p.role) : '-';

            // Action badge (จาก map)
            const actionBadge = getActionBadge(log.action);

            // Description cell — หน้า + entity + metadata
            const descHtml = getDescriptionHtml(log);

            // IP Address
            const ipHtml = log.ip_address
                ? `<span class="font-mono text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded">${escapeHtml(log.ip_address)}</span>`
                : `<span class="text-xs text-slate-400">-</span>`;

            // Module badge
            const moduleHtml = `<span class="font-semibold text-primary-600 text-xs">${escapeHtml(log.module)}</span>`;

            // User Agent
            const uaText = log.user_agent || '-';
            const uaShort = uaText.length > 45 ? uaText.substring(0, 45) + '...' : uaText;
            const uaHtml = `<div class="cursor-pointer text-slate-500 hover:text-primary-600 transition-colors text-xs w-44 truncate"
                                onclick="showUserAgentModal('${escapeHtml(uaText)}')"
                                title="คลิกเพื่อดูรายละเอียด">${escapeHtml(uaShort)}</div>`;

            return [formattedDate, fullName, userRole, moduleHtml, actionBadge, descHtml, ipHtml, uaHtml];
        });

        if ($.fn.DataTable.isDataTable('#logsTable')) $('#logsTable').DataTable().destroy();
        logsDataTable = $('#logsTable').DataTable({
            data: tableData,
            responsive: true,
            pageLength: 50,
            dom: '<"flex flex-col md:flex-row justify-between items-center mb-4"<"flex items-center gap-2"B><"flex items-center gap-2"f>>rt<"flex flex-col md:flex-row justify-between items-center mt-4"ip>',
            buttons: [
                { extend: 'excelHtml5', text: '<i class="fa-solid fa-file-excel mr-1"></i> Export Excel', className: 'bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium border-none', title: 'system_logs_' + new Date().toLocaleDateString('th-TH') },
                { extend: 'pdfHtml5',   text: '<i class="fa-solid fa-file-pdf mr-1"></i> Export PDF',   className: 'bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium border-none', title: 'system_logs_' + new Date().toLocaleDateString('th-TH'), orientation: 'landscape', pageSize: 'A3' },
                { extend: 'searchBuilder', text: '<i class="fa-solid fa-filter mr-1"></i> ตัวกรองขั้นสูง', className: 'bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-sm font-medium border-none' }
            ],
            language: { url: '//cdn.datatables.net/plug-ins/1.13.7/i18n/th.json' },
            order: [[0, 'desc']]
        });
        Swal.close();
    } catch (error) {
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถโหลดข้อมูล Logs ได้: ' + error.message, 'error');
    }
}

// =====================================================
// 3. ฟังก์ชันอำนวยความสะดวก
// =====================================================
function updateStatistics(logs) {
    document.getElementById('totalLogsCount').innerText = logs.length;
    document.getElementById('loginCount').innerText  = logs.filter(l => l.action === 'LOGIN').length;
    document.getElementById('logoutCount').innerText = logs.filter(l => l.action === 'LOGOUT').length;
    document.getElementById('viewCount').innerText   = logs.filter(l => l.action === 'VIEW_PAGE' || l.action === 'SYSTEM_LOG_VIEW').length;
}

function getRoleBadge(role) {
    switch (role) {
        case 'super_admin': return '<span class="px-2 py-1 bg-purple-100 text-purple-700 rounded-lg text-xs font-bold"><i class="fa-solid fa-crown mr-1"></i>Super Admin</span>';
        case 'admin':       return '<span class="px-2 py-1 bg-amber-100 text-amber-700 rounded-lg text-xs font-bold"><i class="fa-solid fa-user-shield mr-1"></i>Admin</span>';
        case 'teacher':     return '<span class="px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold">Teacher</span>';
        default:            return `<span class="px-2 py-1 bg-gray-100 text-gray-700 rounded-lg text-xs font-bold">${role}</span>`;
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m =>
        ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])
    );
}

// =====================================================
// 4. ตัวกรองช่วงวันที่
// =====================================================
function applyDateFilter() {
    const dateFrom = document.getElementById('dateFrom').value;
    const dateTo   = document.getElementById('dateTo').value;
    if (!dateFrom && !dateTo) { Swal.fire('แจ้งเตือน', 'กรุณาเลือกวันที่อย่างน้อย 1 รายการ', 'info'); return; }
    if (dateFrom && dateTo && new Date(dateFrom) > new Date(dateTo)) { Swal.fire('วันที่ไม่ถูกต้อง', 'วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด', 'error'); return; }
    currentDateFrom = dateFrom; currentDateTo = dateTo;
    loadLogsData(currentDateFrom, currentDateTo);
}
function clearDateFilter() {
    document.getElementById('dateFrom').value = '';
    document.getElementById('dateTo').value   = '';
    currentDateFrom = null; currentDateTo = null;
    loadLogsData();
}
function refreshLogs() { loadLogsData(currentDateFrom, currentDateTo); }

// =====================================================
// 5. User Agent Modal
// =====================================================
function showUserAgentModal(uaText) {
    document.getElementById('uaFullText').textContent = uaText;
    document.getElementById('uaModal').classList.remove('hidden');
}
function closeUaModal() { document.getElementById('uaModal').classList.add('hidden'); }

// =====================================================
// 6. บันทึก Log — ครบ field + ip + metadata + page_title
//
//   ตัวอย่างการเรียกจากหน้าอื่น:
//
//   // เข้าหน้านักเรียน
//   await logUserAction(ACTION.STUDENT.VIEW, MODULE.STUDENT, {
//       entity_id: student.id,
//       metadata: { page_title: 'ข้อมูลนักเรียน', entity_name: student.fullname }
//   });
//
//   // บันทึกคะแนน
//   await logUserAction(ACTION.GRADE.CREATE, MODULE.GRADE, {
//       entity_id: gradeId,
//       metadata: { page_title: 'บันทึกคะแนน', entity_name: subjectName, details: `${score}/${maxScore}` }
//   });
//
//   // ลบนักเรียน
//   await logUserAction(ACTION.STUDENT.DELETE, MODULE.STUDENT, {
//       entity_id: student.id,
//       reason: 'ย้ายสถานศึกษา',
//       metadata: { page_title: 'จัดการนักเรียน', entity_name: student.fullname }
//   });
//
//   // Import นักเรียน
//   await logUserAction(ACTION.STUDENT.IMPORT, MODULE.STUDENT, {
//       metadata: { page_title: 'นำเข้าข้อมูลนักเรียน', count: importedRows }
//   });
// =====================================================
async function logUserAction(action, module, options = {}) {
    try {
        const { data: { session } } = await db.auth.getSession();
        if (!session) return;
        const userIp = await getUserIP();
        const logData = {
            action, module,
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
            metadata:      options.metadata      || null,  // { page_title, entity_name, count, details }
        };
        const { error } = await db.from('system_audit_logs').insert([logData]);
        if (error) {
            await db.from('core_access_logs').insert([{
                user_id:    session.user.id,
                action, module,
                ip_address: userIp,
                user_agent: navigator.userAgent
            }]);
        }
    } catch (err) { console.error("Failed to save log:", err); }
}

async function getUserIP() {
    try {
        const res  = await fetch('https://api.ipify.org?format=json');
        const data = await res.json();
        return data.ip;
    } catch { return null; }
}

// =====================================================
// 7. Logout
// =====================================================
function handleLogout() {
    Swal.fire({ title: 'ออกจากระบบ?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626' })
        .then(async (result) => {
            if (result.isConfirmed) {
                await logUserAction(ACTION.LOGOUT, MODULE.AUTH, {
                    metadata: { page_title: 'ออกจากระบบ' }
                });
                await db.auth.signOut();
                window.location.replace('index.html');
            }
        });
}

// =====================================================
// 8. ลบ Logs เก่า (ทั้ง 2 ตาราง)
// =====================================================
document.getElementById('clearOldLogsBtn')?.addEventListener('click', async () => {
    const result = await Swal.fire({
        title: 'ลบประวัติ Logs เก่า',
        html: `<p class="text-left">เลือกระยะเวลาที่ต้องการลบ:</p>
               <select id="logDeleteOption" class="swal2-input w-full mt-2">
                   <option value="30">เก่ากว่า 30 วัน</option>
                   <option value="90">เก่ากว่า 90 วัน</option>
                   <option value="180">เก่ากว่า 180 วัน</option>
                   <option value="365">เก่ากว่า 1 ปี</option>
                   <option value="all">ลบทั้งหมด (ไม่แนะนำ)</option>
               </select>`,
        icon: 'warning', showCancelButton: true,
        confirmButtonColor: '#d33', confirmButtonText: 'ยืนยันการลบ', cancelButtonText: 'ยกเลิก',
        preConfirm: () => document.getElementById('logDeleteOption').value
    });
    if (!result.isConfirmed) return;
    const days = result.value;
    try {
        await logUserAction(ACTION.SYSTEM.LOG_DELETE, MODULE.SYSTEM_LOGS, {
            metadata: { page_title: 'System Logs', details: days === 'all' ? 'ลบทั้งหมด' : `เก่ากว่า ${days} วัน` }
        });
        if (days === 'all') {
            await Promise.all([
                db.from('system_audit_logs').delete().not('id', 'is', null),
                db.from('core_access_logs').delete().not('id', 'is', null)
            ]);
            Swal.fire('สำเร็จ', 'ลบ Logs ทั้งหมดเรียบร้อย', 'success');
        } else {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - parseInt(days));
            const iso = cutoff.toISOString();
            await Promise.all([
                db.from('system_audit_logs').delete().lt('created_at', iso),
                db.from('core_access_logs').delete().lt('created_at', iso)
            ]);
            Swal.fire('สำเร็จ', `ลบ Logs ที่เก่ากว่า ${days} วัน เรียบร้อย`, 'success');
        }
        loadLogsData(currentDateFrom, currentDateTo);
    } catch (err) {
        Swal.fire('ผิดพลาด', 'ไม่สามารถลบ Logs: ' + err.message, 'error');
    }
});