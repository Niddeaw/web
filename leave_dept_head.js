// ============================================================
// leave_dept_head.js — ระบบรับทราบการลาสำหรับหัวหน้ากลุ่มสาระฯ
// ใช้ window object ทั้งหมดเพื่อป้องกัน conflict
// ============================================================

window.currentUser = null;
window.currentProfile = null;
window.currentUserRole = '';
window.headInfo = null;
window.systemSettings = null;
window.pendingLeaves = [];
window.doneLeaves = [];
window.pendingDT = null;
window.doneDT = null;

// ==========================================
// INIT
// ==========================================
$(document).ready(async function () {
    Swal.fire({ title: 'กำลังโหลดข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    try {
        const { data: { session } } = await db.auth.getSession();
        if (!session) { window.location.href = 'login.html'; return; }
        window.currentUser = session.user;

        const { data: profile } = await db.from('core_personnel')
            .select('*').eq('id', session.user.id).single();
        if (!profile) { await db.auth.signOut(); window.location.href = 'login.html'; return; }
        window.currentProfile = profile;
        window.currentUserRole = profile.role || 'teacher';

        const isSuperAdmin = (profile.role === 'super_admin');

        // ตรวจสอบว่าเป็นหัวหน้ากลุ่มสาระฯ
        const headInfo = await window.getDepartmentHeadInfo(session.user.id);

        // ✅ ถ้าไม่ใช่ทั้ง Super Admin และไม่ใช่หัวหน้ากลุ่มฯ → เตะออก
        if (!headInfo && !isSuperAdmin) {
            Swal.fire({
                icon: 'warning',
                title: 'ไม่มีสิทธิ์เข้าใช้งาน',
                text: 'คุณไม่ได้เป็นหัวหน้ากลุ่มสาระฯ ในระบบ',
                confirmButtonText: 'กลับหน้าหลัก'
            }).then(() => { window.location.href = 'leave.html'; });
            return;
        }

        window.isSuperAdmin = isSuperAdmin;
        window.headInfo = headInfo;
        window.currentGroupFilter = headInfo?.department_name || null;
        // ✅ โหลดรายชื่อหัวหน้ากลุ่มฯ ทั้งหมด (สำหรับจัดหมวดหมู่)
        try {
            const { data: deptHeads } = await db.from('core_department_heads')
                .select('personnel_id, department_id, department_name');
            window.allDeptHeads = deptHeads || [];
        } catch (err) {
            console.warn('loadAllDeptHeads error:', err);
            window.allDeptHeads = [];
        }

        // โหลด system settings
        const { data: sysData } = await db.from('core_system_modules')
            .select('settings').eq('module_id', 'leave').single();
        window.systemSettings = sysData?.settings || {
            fiscal_year: (new Date().getFullYear() + 543).toString(),
            eval_round: '1'
        };

        // อัปเดต UI
        $('#display-name').text(`${profile.prefix || ''}${profile.first_name} ${profile.last_name}`);

        // ✅ Super Admin → แสดง dropdown เลือกกลุ่ม + ปุ่มสลับโหมดแอดมิน
        if (isSuperAdmin) {
            $('#btnToggleAdmin').removeClass('hidden').addClass('flex');
            $('#deptHeadGroupFilter').removeClass('hidden');
            if (!headInfo) {
                $('#dept-badge').text('ทุกกลุ่ม (Super Admin)');
            } else {
                $('#dept-badge').text(`กลุ่ม${headInfo.department_name} (Super Admin)`);
            }
            // โหลดรายการกลุ่มทั้งหมด
            await window.loadAllDepartments();
        } else {
            $('#dept-badge').text(`กลุ่ม${headInfo.department_name}`);
        }

        await window.loadDeptHeadLeaves();

        if (typeof window.logUserAction === 'function') {
            await window.logUserAction(`เข้าสู่ระบบ (หัวหน้ากลุ่มสาระฯ: ${headInfo?.department_name || 'ทุกกลุ่ม'})`, 'leave');
        }

        Swal.close();
        document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');
    } catch (err) {
        console.error('Init error:', err);
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
});

// ==========================================
// โหลดข้อมูลใบลา (เฉพาะกลุ่มตัวเอง + เฉพาะครู)
// ==========================================
window.loadDeptHeadLeaves = async function () {
    try {
        let query = db.from('leave_requests')
            .select('*, core_personnel!personnel_id!inner(id, prefix, first_name, last_name, department, role, position)')
            .eq('fiscal_year', window.systemSettings.fiscal_year)
            .eq('eval_round', window.systemSettings.eval_round)
            .neq('personnel_id', window.currentUser.id)
            .order('created_at', { ascending: false });

        // ✅ กำหนดกลุ่มเป้าหมาย
        if (window.isSuperAdmin) {
            // Super Admin → ดูตาม dropdown (ถ้าไม่เลือก = ทุกกลุ่ม)
            if (window.currentGroupFilter) {
                query = query.eq('core_personnel.department', window.currentGroupFilter);
            }
        } else {
            // หัวหน้ากลุ่มฯ ปกติ → ดูเฉพาะกลุ่มตัวเอง
            query = query.eq('core_personnel.department', window.headInfo.department_name);
        }

        const { data, error } = await query;
        if (error) throw error;

        // ✅ กรองเฉพาะ teacher (ตัด staff ออก)
        const filtered = (data || []).filter(l => {
            if (typeof window.getPersonnelCategory !== 'function') return true;
            const cat = window.getPersonnelCategory(l, window.allDeptHeads || []);
            return cat === 'teacher';
        });

        window.pendingLeaves = filtered.filter(l => !l.ack_head && l.status !== 'ไม่อนุมัติ');
        window.doneLeaves = filtered.filter(l => l.ack_head);

        window.renderDeptTables();
        window.updateStats(filtered);
    } catch (err) {
        console.error('loadDeptHeadLeaves error:', err);
        Swal.fire('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลได้: ' + err.message, 'error');
    }
};

window.updateStats = function (all) {
    $('#stat-pending').text(window.pendingLeaves.length);
    $('#stat-done').text(window.doneLeaves.length);
    const teachers = new Set(all.map(l => l.personnel_id));
    $('#stat-teachers').text(teachers.size);
    const today = new Date().toLocaleDateString('sv-SE');
    const todayCount = all.filter(l => l.start_date <= today && l.end_date >= today).length;
    $('#stat-today').text(todayCount);
};

// ==========================================
// render ตาราง
// ==========================================
const fmtShort = (iso) => { if (!iso) return '-'; const p = iso.split('-'); return `${p[2]}/${p[1]}/${parseInt(p[0]) + 543}`; };
const fmtFull = (iso) => {
    if (!iso) return '-';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '-';
    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    return `${d.getDate()} ${months[d.getMonth()]} ${(d.getFullYear() + 543).toString().slice(-2)}`;
};

window.renderDeptTables = function () {
    // Pending
    if ($.fn.DataTable.isDataTable('#pendingTable')) $('#pendingTable').DataTable().destroy();
    const tbPending = document.getElementById('tb-pending');
    if (window.pendingLeaves.length > 0) {
        tbPending.innerHTML = window.pendingLeaves.map(l => {
            const name = `${l.core_personnel.prefix || ''}${l.core_personnel.first_name} ${l.core_personnel.last_name}`;
            const typeClass = l.type === 'ลาป่วย' ? 'text-blue-600' : (l.type === 'ลากิจส่วนตัว' ? 'text-orange-600' : 'text-rose-600');
            return `<tr class="hover:bg-slate-50">
                <td class="text-center text-slate-500 text-xs">${fmtFull(l.submitted_date || l.created_at)}</td>
                <td class="font-bold text-slate-700">${name}</td>
                <td class="font-bold ${typeClass} text-sm">${l.type}</td>
                <td class="text-slate-600 text-sm">${fmtShort(l.start_date)} - ${fmtShort(l.end_date)}</td>
                <td class="text-center font-black ${typeClass}">${l.is_half_day ? '0.5' : l.total_days}</td>
                <td class="text-slate-600 text-xs max-w-[200px] truncate" title="${l.reason}">${l.reason}</td>
                <td class="text-center whitespace-nowrap">
                    <button onclick="viewLeave('${l.id}')" class="btn-icon bg-indigo-50 text-indigo-600 hover:bg-indigo-500 hover:text-white" title="ดูรายละเอียด"><i class="fas fa-eye"></i></button>
                    <button onclick="window.acknowledgeLeaveHead('${l.id}')" class="ml-1 bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow transition"><i class="fas fa-user-check mr-1"></i> รับทราบ</button>
                </td>
            </tr>`;
        }).join('');
    } else tbPending.innerHTML = '';

    window.pendingDT = $('#pendingTable').DataTable({
        responsive: true, language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
        order: [[0, 'desc']], columnDefs: [{ orderable: false, targets: [6] }], pageLength: 15
    });

    // Done
    if ($.fn.DataTable.isDataTable('#doneTable')) $('#doneTable').DataTable().destroy();
    const tbDone = document.getElementById('tb-done');
    if (window.doneLeaves.length > 0) {
        tbDone.innerHTML = window.doneLeaves.map(l => {
            const name = `${l.core_personnel.prefix || ''}${l.core_personnel.first_name} ${l.core_personnel.last_name}`;
            const typeClass = l.type === 'ลาป่วย' ? 'text-blue-600' : (l.type === 'ลากิจส่วนตัว' ? 'text-orange-600' : 'text-rose-600');
            const statusHtml = l.status === 'อนุมัติ'
                ? '<span class="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-[10px] font-bold">อนุมัติ</span>'
                : (l.status === 'ไม่อนุมัติ'
                    ? '<span class="bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full text-[10px] font-bold">ไม่อนุมัติ</span>'
                    : '<span class="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-[10px] font-bold">รออนุมัติ</span>');
            return `<tr class="hover:bg-slate-50">
                <td class="text-center text-slate-500 text-xs">${fmtFull(l.submitted_date || l.created_at)}</td>
                <td class="font-bold text-slate-700">${name}</td>
                <td class="font-bold ${typeClass} text-sm">${l.type}</td>
                <td class="text-slate-600 text-sm">${fmtShort(l.start_date)} - ${fmtShort(l.end_date)}</td>
                <td class="text-center font-black ${typeClass}">${l.is_half_day ? '0.5' : l.total_days}</td>
                <td class="text-center">
                    <div class="flex flex-col items-center gap-1 text-xs">
                        ${l.ack_head ? `<div class="flex items-center gap-1 text-emerald-600 font-bold">
                            <i class="fas fa-users text-[10px]"></i>
                            <span>${fmtFull(l.ack_head_at)}</span>
                            <button onclick="editAckDate('${l.id}', 'ack_head')" class="ml-1 text-amber-500 hover:text-amber-700 transition" title="แก้ไขวันที่หัวหน้ารับทราบ">
                                <i class="fas fa-edit text-[10px]"></i>
                            </button>
                        </div>` : ''}
                        ${l.ack_admin ? `<div class="flex items-center gap-1 text-teal-600 font-bold">
                            <i class="fas fa-user-tie text-[10px]"></i>
                            <span>${fmtFull(l.ack_admin_at)}</span>
                            <button onclick="editAckDate('${l.id}', 'ack_admin')" class="ml-1 text-amber-500 hover:text-amber-700 transition" title="แก้ไขวันที่แอดมินรับทราบ">
                                <i class="fas fa-edit text-[10px]"></i>
                            </button>
                        </div>` : ''}
                        ${l.ack_deputy ? `<div class="flex items-center gap-1 text-blue-600 font-bold">
                            <i class="fas fa-user-shield text-[10px]"></i>
                            <span>${fmtFull(l.ack_deputy_at)}</span>
                            <button onclick="editAckDate('${l.id}', 'ack_deputy')" class="ml-1 text-amber-500 hover:text-amber-700 transition" title="แก้ไขวันที่รองผู้อำนวยการรับทราบ">
                                <i class="fas fa-edit text-[10px]"></i>
                            </button>
                        </div>` : ''}
                    </div>
                </td>
                <td class="text-center">${statusHtml}</td>
            </tr>`;
        }).join('');
    } else tbDone.innerHTML = '';

    window.doneDT = $('#doneTable').DataTable({
        responsive: true, language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
        order: [[0, 'desc']], columnDefs: [{ orderable: false, targets: [5, 6] }], pageLength: 15
    });
};

// ==========================================
// Tab switching
// ==========================================
window.switchTab = function (tabId) {
    $('.tab-content').addClass('hidden');
    $(`#tab-${tabId}`).removeClass('hidden');
    $('.tab-btn').removeClass('bg-amber-50 text-amber-700 border-amber-200').addClass('text-slate-500 border-transparent');
    $(`#btn-${tabId}`).removeClass('text-slate-500 border-transparent').addClass('bg-amber-50 text-amber-700 border-amber-200');
    setTimeout(() => {
        if (tabId === 'pending' && window.pendingDT) window.pendingDT.columns.adjust().draw();
        if (tabId === 'done' && window.doneDT) window.doneDT.columns.adjust().draw();
    }, 100);
};

// ==========================================
// View Leave Modal
// ==========================================
window.viewLeave = function (id) {
    const l = [...window.pendingLeaves, ...window.doneLeaves].find(x => x.id === id);
    if (!l) return;

    const fmtD = (iso) => { if (!iso) return '-'; const p = iso.split('-'); return `${p[2]}/${p[1]}/${parseInt(p[0]) + 543}`; };
    const fmtDateOnly = (iso) => {
        if (!iso) return '-';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '-';
        const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
            'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
        return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
    };
    const fullName = `${l.core_personnel.prefix || ''}${l.core_personnel.first_name} ${l.core_personnel.last_name}`;

    const html = `
        <div class="space-y-4">
            <div class="border border-slate-200 rounded-xl p-3 space-y-2">
                <div class="flex justify-between"><span class="text-sm font-bold text-slate-600">ชื่อครู</span><span class="font-bold text-slate-800">${fullName}</span></div>
                <div class="flex justify-between"><span class="text-sm font-bold text-slate-600">กลุ่มสาระฯ</span><span class="font-bold text-slate-800">${l.core_personnel.department || '-'}</span></div>
                <div class="flex justify-between"><span class="text-sm font-bold text-slate-600">ประเภทการลา</span><span class="font-bold text-slate-800">${l.type}</span></div>
                <div class="flex justify-between"><span class="text-sm font-bold text-slate-600">ช่วงวันที่</span><span class="font-bold text-slate-800">${fmtD(l.start_date)} - ${fmtD(l.end_date)}</span></div>
                <div class="flex justify-between"><span class="text-sm font-bold text-slate-600">จำนวนวัน</span><span class="font-bold text-slate-800">${l.is_half_day ? '0.5' : l.total_days} วัน</span></div>
                <div class="flex justify-between items-start gap-2"><span class="text-sm font-bold text-slate-600 flex-shrink-0">สาเหตุ</span><span class="text-slate-800 text-right">${l.reason}</span></div>
                ${l.submitted_date ? `<div class="flex justify-between"><span class="text-sm font-bold text-slate-600">วันที่ส่งใบลา</span><span class="text-slate-600 text-sm">${fmtDateOnly(l.submitted_date)}</span></div>` : ''}
                ${l.attachment_file_id ? `<div class="flex justify-between"><span class="text-sm font-bold text-slate-600">ไฟล์หลักฐาน</span><a href="https://lh5.googleusercontent.com/d/${l.attachment_file_id}" target="_blank" class="text-blue-600 hover:underline text-sm">ดูไฟล์</a></div>` : ''}
                ${l.ack_head ? `<div class="flex justify-between"><span class="text-sm font-bold text-slate-600">รับทราบเมื่อ</span><span class="text-emerald-600 text-sm font-bold">${fmtDateOnly(l.ack_head_at)}</span></div>` : ''}
            </div>
            ${!l.ack_head ? `<button onclick="window.acknowledgeLeaveHead('${l.id}'); closeViewModal();" class="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold shadow-lg transition flex items-center justify-center gap-2"><i class="fas fa-user-check"></i> รับทราบใบลานี้</button>` : ''}
        </div>
    `;
    document.getElementById('viewLeaveContent').innerHTML = html;
    document.getElementById('viewLeaveModal').classList.remove('hidden');
    document.getElementById('viewLeaveModal').classList.add('flex');
};

window.closeViewModal = function () {
    document.getElementById('viewLeaveModal').classList.add('hidden');
    document.getElementById('viewLeaveModal').classList.remove('flex');
};

// ==========================================
// LOGOUT
// ==========================================
window.logout = async function () {
    const { isConfirmed } = await Swal.fire({
        title: 'ออกจากระบบ?',
        text: "คุณต้องการออกจากระบบใช่หรือไม่",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'ออกจากระบบ',
        cancelButtonText: 'ยกเลิก'
    });
    if (isConfirmed) {
        await db.auth.signOut();
        window.location.replace("login.html");
    }
};

// ==========================================
// สำหรับ Super Admin: โหลดรายชื่อกลุ่มทั้งหมด
// ==========================================
window.loadAllDepartments = async function () {
    try {
        const { data: depts, error } = await db.from('core_department_heads')
            .select('department_name')
            .order('department_name');
        if (error) throw error;

        const select = document.getElementById('deptHeadGroupFilter');
        if (!select) return;

        let html = '<option value="">📁 ทุกกลุ่ม</option>';
        const uniqueDepts = [...new Set((depts || []).map(d => d.department_name))];
        uniqueDepts.forEach(d => {
            html += `<option value="${d}">${d}</option>`;
        });
        select.innerHTML = html;

        // ถ้า Super Admin เป็นหัวหน้ากลุ่มฯ ตัวเอง → default เลือกกลุ่มตัวเอง
        if (window.headInfo?.department_name) {
            select.value = window.headInfo.department_name;
            window.currentGroupFilter = window.headInfo.department_name;
        } else {
            select.value = '';
            window.currentGroupFilter = null;
        }
    } catch (err) {
        console.error('loadAllDepartments error:', err);
    }
};

// ==========================================
// Event: เปลี่ยนกลุ่มที่เลือก (Super Admin)
// ==========================================
window.onDeptHeadGroupChange = async function () {
    const select = document.getElementById('deptHeadGroupFilter');
    const val = select ? select.value : '';
    window.currentGroupFilter = val || null;

    // อัปเดต badge
    if (val) {
        $('#dept-badge').text(`กลุ่ม${val} (Super Admin)`);
    } else {
        $('#dept-badge').text('ทุกกลุ่ม (Super Admin)');
    }

    await window.loadDeptHeadLeaves();
};

console.log('✅ leave_dept_head.js loaded');