// system_logs.js — FIXED
// แก้ไข: ดึงข้อมูลจาก system_audit_logs (primary) + fallback core_access_logs
//         เพิ่มคอลัมน์ IP Address ในตารางและ query
//         Fallback insert ครบทุก field รวม ip_address

let logsDataTable;
let currentDateFrom = null;
let currentDateTo = null;

window.onload = async () => {
    await checkSuperAdminAuth();
};

// =========================================
// 1. ตรวจสอบสิทธิ์ (Super Admin เท่านั้น)
// =========================================
async function checkSuperAdminAuth() {
    try {
        const { data: { session } } = await db.auth.getSession();
        if (!session) throw new Error("No session");
        const { data: profile, error } = await db.from('core_personnel')
            .select('role')
            .eq('id', session.user.id)
            .single();
        if (error || !profile) throw new Error("Profile not found");
        if (profile.role !== 'super_admin') {
            Swal.fire({ icon: 'error', title: 'ปฏิเสธการเข้าถึง', text: 'คุณไม่มีสิทธิ์เข้าถึงหน้านี้ (เฉพาะ Super Admin)', confirmButtonColor: '#3085d6' })
                .then(() => window.location.replace('index.html'));
            return;
        }
        document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');
        await logUserAction('VIEW_PAGE', 'SYSTEM_LOGS');

        // Event listeners
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

// =========================================
// 2. โหลดข้อมูล Logs
//    FIX: ดึงจาก system_audit_logs (primary) พร้อม ip_address
//         ถ้า query ล้มเหลว fallback ไป core_access_logs
// =========================================
async function loadLogsData(dateFrom = null, dateTo = null) {
    Swal.fire({ title: 'กำลังโหลดข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        // --- FIX: ดึงจาก system_audit_logs เป็นหลัก ---
        let logs = [];
        let useAuditTable = true;

        try {
            let query = db.from('system_audit_logs')
                .select(`
                    id, action, module, ip_address, user_agent, created_at,
                    performed_by,
                    core_personnel!performed_by (prefix, first_name, last_name, role)
                `);
            if (dateFrom) {
                const start = new Date(dateFrom); start.setHours(0, 0, 0, 0);
                query = query.gte('created_at', start.toISOString());
            }
            if (dateTo) {
                const end = new Date(dateTo); end.setHours(23, 59, 59, 999);
                query = query.lte('created_at', end.toISOString());
            }
            const { data, error } = await query.order('created_at', { ascending: false });
            if (error) throw error;
            logs = data || [];
        } catch (auditErr) {
            // Fallback: ดึงจาก core_access_logs (โครงสร้างเก่า)
            console.warn('system_audit_logs unavailable, fallback to core_access_logs:', auditErr.message);
            useAuditTable = false;
            let query = db.from('core_access_logs')
                .select(`
                    id, action, module, ip_address, user_agent, created_at,
                    core_personnel!user_id (prefix, first_name, last_name, role)
                `);
            if (dateFrom) {
                const start = new Date(dateFrom); start.setHours(0, 0, 0, 0);
                query = query.gte('created_at', start.toISOString());
            }
            if (dateTo) {
                const end = new Date(dateTo); end.setHours(23, 59, 59, 999);
                query = query.lte('created_at', end.toISOString());
            }
            const { data, error } = await query.order('created_at', { ascending: false });
            if (error) throw error;
            logs = data || [];
        }

        updateStatistics(logs);

        const tableData = logs.map(log => {
            const dateObj = new Date(log.created_at);
            const formattedDate = `${dateObj.toLocaleDateString('th-TH')} ${dateObj.toLocaleTimeString('th-TH')}`;

            // ชื่อผู้ใช้
            let fullName = 'ไม่ทราบชื่อ/ถูกลบ';
            const personnel = log.core_personnel;
            if (personnel) {
                const prefix = personnel.prefix || '';
                const firstName = personnel.first_name || '';
                const lastName = personnel.last_name || '';
                fullName = `${prefix}${firstName} ${lastName}`.trim() || 'ไม่ระบุชื่อ';
            }

            const userRole = personnel ? getRoleBadge(personnel.role) : '-';

            // IP Address — FIX: แสดงคอลัมน์ IP
            const ipText = log.ip_address || '-';
            const ipHtml = ipText !== '-'
                ? `<span class="font-mono text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded">${escapeHtml(ipText)}</span>`
                : `<span class="text-xs text-slate-400">-</span>`;

            // Action badge
            let actionBadge = `<span class="px-2 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700">${log.action}</span>`;
            if (log.action === 'LOGIN')
                actionBadge = `<span class="px-2 py-1 rounded-md text-xs font-medium bg-green-100 text-green-700"><i class="fa-solid fa-right-to-bracket mr-1"></i>LOGIN</span>`;
            else if (log.action === 'LOGOUT')
                actionBadge = `<span class="px-2 py-1 rounded-md text-xs font-medium bg-red-100 text-red-700"><i class="fa-solid fa-right-from-bracket mr-1"></i>LOGOUT</span>`;
            else if (log.action.includes('UPDATE') || log.action.includes('EDIT'))
                actionBadge = `<span class="px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-700"><i class="fa-solid fa-pen mr-1"></i>${log.action}</span>`;
            else if (log.action.includes('CREATE') || log.action.includes('ADD'))
                actionBadge = `<span class="px-2 py-1 rounded-md text-xs font-medium bg-emerald-100 text-emerald-700"><i class="fa-solid fa-plus mr-1"></i>${log.action}</span>`;
            else if (log.action.includes('DELETE') || log.action.includes('REMOVE'))
                actionBadge = `<span class="px-2 py-1 rounded-md text-xs font-medium bg-rose-100 text-rose-700"><i class="fa-solid fa-trash mr-1"></i>${log.action}</span>`;
            else if (log.action === 'VIEW_PAGE')
                actionBadge = `<span class="px-2 py-1 rounded-md text-xs font-medium bg-indigo-100 text-indigo-700"><i class="fa-solid fa-eye mr-1"></i>VIEW_PAGE</span>`;

            // User Agent
            const uaText = log.user_agent || '-';
            const uaShort = uaText.length > 50 ? uaText.substring(0, 50) + '...' : uaText;
            const uaHtml = `<div class="cursor-pointer text-slate-500 hover:text-primary-600 transition-colors truncate w-48 text-xs" onclick="showUserAgentModal('${escapeHtml(uaText)}')" title="คลิกเพื่อดูรายละเอียด">${escapeHtml(uaShort)}</div>`;

            // FIX: เพิ่ม ipHtml เป็น column ที่ 6
            return [formattedDate, fullName, userRole, `<span class="font-semibold text-primary-600">${log.module}</span>`, actionBadge, ipHtml, uaHtml];
        });

        if ($.fn.DataTable.isDataTable('#logsTable')) $('#logsTable').DataTable().destroy();
        logsDataTable = $('#logsTable').DataTable({
            data: tableData,
            responsive: true,
            pageLength: 50,
            dom: '<"flex flex-col md:flex-row justify-between items-center mb-4"<"flex items-center gap-2"B><"flex items-center gap-2"f>>rt<"flex flex-col md:flex-row justify-between items-center mt-4"ip>',
            buttons: [
                { extend: 'excelHtml5', text: '<i class="fa-solid fa-file-excel mr-1"></i> Export Excel', className: 'bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium border-none', title: 'ระบบ_logs_' + new Date().toLocaleDateString('th-TH') },
                { extend: 'pdfHtml5', text: '<i class="fa-solid fa-file-pdf mr-1"></i> Export PDF', className: 'bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium border-none', title: 'ระบบ_logs_' + new Date().toLocaleDateString('th-TH'), orientation: 'landscape', pageSize: 'A3' },
                { extend: 'searchBuilder', text: '<i class="fa-solid fa-filter mr-1"></i> ตัวกรองขั้นสูง', className: 'bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-sm font-medium border-none' }
            ],
            language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
            order: [[0, 'asc']]
        });
        Swal.close();
    } catch (error) {
        console.error(error);
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถโหลดข้อมูล Logs ได้: ' + error.message, 'error');
    }
}

// =========================================
// 3. ฟังก์ชันอำนวยความสะดวก
// =========================================
function updateStatistics(logs) {
    document.getElementById('totalLogsCount').innerText = logs.length;
    document.getElementById('loginCount').innerText = logs.filter(l => l.action === 'LOGIN').length;
    document.getElementById('logoutCount').innerText = logs.filter(l => l.action === 'LOGOUT').length;
    document.getElementById('viewCount').innerText = logs.filter(l => l.action === 'VIEW_PAGE').length;
}

function getRoleBadge(role) {
    switch (role) {
        case 'super_admin': return '<span class="px-2 py-1 bg-purple-100 text-purple-700 rounded-lg text-xs font-bold"><i class="fa-solid fa-crown mr-1"></i>Super Admin</span>';
        case 'admin': return '<span class="px-2 py-1 bg-amber-100 text-amber-700 rounded-lg text-xs font-bold"><i class="fa-solid fa-user-shield mr-1"></i>Admin</span>';
        case 'teacher': return '<span class="px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold">Teacher</span>';
        default: return `<span class="px-2 py-1 bg-gray-100 text-gray-700 rounded-lg text-xs font-bold">${role}</span>`;
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, function (m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        if (m === '"') return '&quot;';
        if (m === "'") return '&#39;';
        return m;
    });
}

// =========================================
// 4. ตัวกรองช่วงวันที่
// =========================================
function applyDateFilter() {
    const dateFrom = document.getElementById('dateFrom').value;
    const dateTo = document.getElementById('dateTo').value;
    if (!dateFrom && !dateTo) { Swal.fire('แจ้งเตือน', 'กรุณาเลือกวันที่เริ่มต้นหรือสิ้นสุดอย่างน้อย 1 รายการ', 'info'); return; }
    if (dateFrom && dateTo && new Date(dateFrom) > new Date(dateTo)) { Swal.fire('วันที่ไม่ถูกต้อง', 'วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด', 'error'); return; }
    currentDateFrom = dateFrom;
    currentDateTo = dateTo;
    loadLogsData(currentDateFrom, currentDateTo);
}

function clearDateFilter() {
    document.getElementById('dateFrom').value = '';
    document.getElementById('dateTo').value = '';
    currentDateFrom = null;
    currentDateTo = null;
    loadLogsData();
}

function refreshLogs() {
    loadLogsData(currentDateFrom, currentDateTo);
}

// =========================================
// 5. User Agent Modal
// =========================================
function showUserAgentModal(uaText) {
    document.getElementById('uaFullText').textContent = uaText;
    document.getElementById('uaModal').classList.remove('hidden');
}
function closeUaModal() {
    document.getElementById('uaModal').classList.add('hidden');
}

// =========================================
// 6. บันทึก Log — FIX: fallback insert ครบ field + ip_address
// =========================================
async function logUserAction(action, module, options = {}) {
    try {
        const { data: { session } } = await db.auth.getSession();
        if (!session) return;
        const userIp = await getUserIP();
        const logData = {
            action, module,
            entity_type: options.entity_type || null,
            entity_id: options.entity_id || null,
            old_values: options.old_values || null,
            new_values: options.new_values || null,
            performed_by: session.user.id,
            ip_address: userIp,           // FIX: บันทึก IP เสมอ
            user_agent: navigator.userAgent,
            status: options.status || 'SUCCESS',
            error_message: options.error_message || null,
            source: options.source || 'UI',
            reason: options.reason || null,
            metadata: options.metadata || null
        };

        const { error } = await db.from('system_audit_logs').insert([logData]);
        if (error) {
            // FIX: Fallback ครบ field รวม ip_address
            await db.from('core_access_logs').insert([{
                user_id: session.user.id,
                action,
                module,
                ip_address: userIp,       // FIX: เพิ่ม ip_address ใน fallback
                user_agent: navigator.userAgent
            }]);
        }
    } catch (err) {
        console.error("Failed to save log:", err);
    }
}

async function getUserIP() {
    try {
        const res = await fetch('https://api.ipify.org?format=json');
        const data = await res.json();
        return data.ip;
    } catch { return null; }
}

// =========================================
// 7. Logout
// =========================================
function handleLogout() {
    Swal.fire({ title: 'ออกจากระบบ?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626' })
        .then(async (result) => {
            if (result.isConfirmed) {
                await logUserAction('LOGOUT', 'AUTH');
                await db.auth.signOut();
                window.location.replace('index.html');
            }
        });
}

// =========================================
// 8. ลบ Logs เก่า — FIX: ลบจากทั้ง 2 ตาราง
// =========================================
document.getElementById('clearOldLogsBtn')?.addEventListener('click', async () => {
    const result = await Swal.fire({
        title: 'ลบประวัติ Logs เก่า',
        html: `
            <p class="text-left">เลือกระยะเวลาที่ต้องการลบ:</p>
            <select id="logDeleteOption" class="swal2-input w-full mt-2">
                <option value="30">เก่ากว่า 30 วัน</option>
                <option value="90">เก่ากว่า 90 วัน</option>
                <option value="180">เก่ากว่า 180 วัน</option>
                <option value="365">เก่ากว่า 1 ปี</option>
                <option value="all">ลบทั้งหมด (ไม่แนะนำ)</option>
            </select>
        `,
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
        if (days === 'all') {
            // FIX: ลบทั้ง 2 ตาราง
            const [r1, r2] = await Promise.all([
                db.from('system_audit_logs').delete().not('id', 'is', null),
                db.from('core_access_logs').delete().not('id', 'is', null)
            ]);
            if (r1.error) throw r1.error;
            if (r2.error) console.warn('core_access_logs delete warn:', r2.error.message);
        } else {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - parseInt(days));
            const iso = cutoff.toISOString();
            // FIX: ลบทั้ง 2 ตาราง
            const [r1, r2] = await Promise.all([
                db.from('system_audit_logs').delete().lt('created_at', iso),
                db.from('core_access_logs').delete().lt('created_at', iso)
            ]);
            if (r1.error) throw r1.error;
            if (r2.error) console.warn('core_access_logs delete warn:', r2.error.message);
        }
        Swal.fire('สำเร็จ', days === 'all' ? 'ลบ Logs ทั้งหมดเรียบร้อย' : `ลบ Logs ที่เก่ากว่า ${days} วัน เรียบร้อย`, 'success');
        loadLogsData(currentDateFrom, currentDateTo);
    } catch (err) {
        Swal.fire('ผิดพลาด', 'ไม่สามารถลบ Logs: ' + err.message, 'error');
    }
});
