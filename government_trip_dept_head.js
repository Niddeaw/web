// ============================================================
// government_trip_dept_head.js — รับทราบใบขอไปราชการ (หัวหน้ากลุ่มสาระฯ)
// ✅ Pattern กลาง + Companion view + ฟิลด์ใหม่
// ============================================================

window.currentUser = null;
window.currentProfile = null;
window.currentUserRole = '';
window.headInfo = null;
window.systemSettings = null;
window.pendingTrips = [];
window.doneTrips = [];
window.pendingTripDT = null;
window.doneTripDT = null;
window.isSuperAdmin = false;
window.allDeptHeads = [];
window.academicPersonnelId = null;
window.currentGroupFilter = null;

// ==========================================
// Nav buttons
// ==========================================
window.refreshTripDeptHeadNavButtons = function () {
    const role = window.currentProfile?.role;
    const allowedRoles = ['super_admin', 'admin', 'director', 'deputy'];
    const canSee = window.isSuperAdmin || window.headInfo || allowedRoles.includes(role);
    if (canSee) {
        document.getElementById('btnNavTeacher')?.classList.remove('hidden');
        document.getElementById('btnNavAdmin')?.classList.remove('hidden');
    }
};

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

        setUserDisplayName(profile);
        updateUserRoleLabel(profile.role);
        renderUserAvatar(profile);

        const isSuperAdmin = (profile.role === 'super_admin');
        const headInfo = await window.getTripDeptHeadInfo(session.user.id);

        if (!headInfo && !isSuperAdmin) {
            Swal.fire({
                icon: 'warning', title: 'ไม่มีสิทธิ์',
                text: 'คุณไม่ได้เป็นหัวหน้ากลุ่มสาระฯ ในระบบ',
                confirmButtonText: 'กลับหน้าหลัก'
            }).then(() => { window.location.href = 'government_trip_teacher.html'; });
            return;
        }

        window.isSuperAdmin = isSuperAdmin;
        window.headInfo = headInfo;
        window.currentGroupFilter = headInfo?.department_name || null;

        const { data: deptHeads } = await db.from('core_department_heads')
            .select('personnel_id, department_id, department_name');
        window.allDeptHeads = deptHeads || [];

        // ✅ หา academicPersonnelId (รองวิชาการ)
        try {
            const { data: school } = await db.from('core_school_info').select('deputy_academic').single();
            if (school?.deputy_academic) {
                const clean = school.deputy_academic.replace(
                    /^(นาย|นาง|นางสาว|ด\.ต\.|ร\.ต\.|ว่าที่ ร\.ต\.|พระ|สามเณร|หม่อมหลวง|หม่อมหลวงหญิง)\s*/, ''
                ).trim();
                const parts = clean.split(/\s+/);
                if (parts.length >= 2) {
                    const { data: p } = await db.from('core_personnel')
                        .select('id').ilike('first_name', `%${parts[0]}%`).ilike('last_name', `%${parts[1]}%`).maybeSingle();
                    if (p) {
                        window.academicPersonnelId = p.id;
                        console.log('✅ รองวิชาการ ID:', p.id);
                    }
                }
            }
        } catch (e) { console.warn('academicPersonnelId error:', e); }

        const { data: sysData } = await db.from('core_system_modules')
            .select('settings').eq('module_id', 'government_trip').single();
        window.systemSettings = sysData?.settings || {
            fiscal_year: (new Date().getFullYear() + 543).toString(),
            eval_round: '1'
        };

        if (isSuperAdmin) {
            const wrap = document.getElementById('deptHeadGroupFilterWrap');
            if (wrap) wrap.classList.remove('hidden');
            await window.loadTripDepartments();
        }

        await window.loadTripDeptHeadRequests();
        await window.loadTripDeptTeachersCount();
        window.refreshTripDeptHeadNavButtons();

        await window.logUserAction('เข้าสู่ระบบรับทราบใบไปราชการ', 'government_trip');
        Swal.close();
        document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');
    } catch (err) {
        console.error('Init error:', err);
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
});

// ==========================================
// Load requests
// ==========================================
window.loadTripDeptHeadRequests = async function () {
    try {
        let query = db.from('government_trip_requests')
            .select('*, core_personnel!personnel_id!inner(id, prefix, first_name, last_name, department, role, position)')
            .eq('fiscal_year', window.systemSettings.fiscal_year)
            .eq('eval_round', window.systemSettings.eval_round)
            .neq('personnel_id', window.currentUser.id)
            .order('created_at', { ascending: false });

        if (window.isSuperAdmin) {
            if (window.currentGroupFilter) {
                query = query.eq('core_personnel.department', window.currentGroupFilter);
            }
        } else {
            query = query.eq('core_personnel.department', window.headInfo.department_name);
        }

        const { data, error } = await query;
        if (error) throw error;

        const filtered = (data || []).filter(t => {
            const cat = window.getTripPersonnelCategory(t, window.allDeptHeads || []);
            if (cat === 'head') {
                return t.personnel_id === window.currentUser.id;
            }
            return cat === 'teacher';
        });

        window.pendingTrips = filtered.filter(t => !t.ack_head && t.status !== 'ไม่อนุมัติ');
        window.doneTrips = filtered.filter(t => t.ack_head);

        window.renderTripDeptTables();
        window.updateTripDeptStats(filtered);
        window.loadTripDeptTeachersCount();
    } catch (err) {
        console.error('loadTripDeptHeadRequests error:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
};

window.updateTripDeptStats = function (all) {
    $('#stat-pending').text(window.pendingTrips.length);
    $('#stat-done').text(window.doneTrips.length);
    const today = new Date().toLocaleDateString('sv-SE');
    const todayCount = all.filter(t => t.start_date <= today && t.end_date >= today).length;
    $('#stat-today').text(todayCount);
};

window.loadTripDeptTeachersCount = async function () {
    try {
        const targetDept = window.isSuperAdmin ? window.currentGroupFilter : window.headInfo.department_name;
        let query = db.from('core_personnel').select('id, department, position');
        if (targetDept) query = query.eq('department', targetDept);
        const { data, error } = await query;
        if (error) throw error;

        const staffKeywords = ['เจ้าหน้าที่', 'พนักงานขับรถ', 'พนักงานบริการ', 'พนักงานขับรถยนต์', 'พนักงานรักษาความปลอดภัย', 'ลูกจ้าง', 'ลูกจ้างชั่วคราว', 'ลูกจ้างประจำ', 'พนักงานธุรการ', 'พนักงานบริการทั่วไป', 'พนักงานบริการโรงเรียน', 'ครูพี่เลี้ยงเด็กพิการ'];
        const teachers = (data || []).filter(p => {
            const pos = p.position || '';
            if (staffKeywords.some(kw => pos.includes(kw))) return false;
            return pos.includes('ครู') || pos.includes('พนักงานราชการ');
        });
        $('#stat-teachers').text(teachers.length);
    } catch (err) {
        $('#stat-teachers').text('-');
    }
};

// ==========================================
// Format helpers
// ==========================================
const fmtTripShort = (iso) => { if (!iso) return '-'; const p = iso.split('-'); return `${p[2]}/${p[1]}/${parseInt(p[0]) + 543}`; };
const fmtTripFull = (iso) => {
    if (!iso) return '-';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '-';
    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    return `${d.getDate()} ${months[d.getMonth()]} ${(d.getFullYear() + 543).toString().slice(-2)}`;
};

// ==========================================
// Render tables
// ==========================================
window.renderTripDeptTables = function () {
    // ===== PENDING =====
    if ($.fn.DataTable.isDataTable('#pendingTripTable')) $('#pendingTripTable').DataTable().destroy();
    const tbPending = document.getElementById('tb-pending-trip');
    if (window.pendingTrips.length > 0) {
        tbPending.innerHTML = window.pendingTrips.map(t => {
            const name = `${t.core_personnel.prefix || ''}${t.core_personnel.first_name} ${t.core_personnel.last_name}`;
            const compBadge = (t.companion_count > 1)
                ? `<span class="text-[10px] text-indigo-600 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-full font-bold ml-1"><i class="fas fa-users mr-0.5"></i>${t.companion_count}</span>`
                : '';
            return `<tr class="hover:bg-slate-50">
                <td class="text-center text-slate-500 text-xs">${fmtTripFull(t.submitted_date || t.created_at)}</td>
                <td class="font-bold text-slate-700">${name}</td>
                <td class="text-slate-700 font-medium">${t.title} ${compBadge}</td>
                <td class="text-slate-600 text-sm">${fmtTripShort(t.start_date)} - ${fmtTripShort(t.end_date)}</td>
                <td class="text-center font-black text-sky-600">${t.total_days}</td>
                <td class="text-slate-600 text-xs max-w-[200px] truncate">${t.location || '-'}</td>
                <td class="text-center whitespace-nowrap">
                    <div class="inline-flex items-center gap-1">
                        <button onclick="window.viewTrip('${t.id}')" 
                            class="bg-indigo-100 text-indigo-700 hover:bg-indigo-600 hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm">
                            <i class="fas fa-eye mr-1"></i> ดู
                        </button>
                        <button onclick="window.acknowledgeTripHead('${t.id}')" 
                            class="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow transition">
                            <i class="fas fa-user-check mr-1"></i> รับทราบ
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    } else tbPending.innerHTML = '';

    window.pendingTripDT = $('#pendingTripTable').DataTable({
        scrollX: true,
        scrollCollapse: true,
        autoWidth: false,
        language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
        order: [[0, 'desc']],
        columnDefs: [
            { orderable: false, targets: [6] },
            { width: '180px', targets: [6] }
        ],
        pageLength: 15
    });

    // ===== DONE =====
    if ($.fn.DataTable.isDataTable('#doneTripTable')) $('#doneTripTable').DataTable().destroy();
    const tbDone = document.getElementById('tb-done-trip');
    if (window.doneTrips.length > 0) {
        tbDone.innerHTML = window.doneTrips.map(t => {
            const name = `${t.core_personnel.prefix || ''}${t.core_personnel.first_name} ${t.core_personnel.last_name}`;
            const statusHtml = t.status === 'อนุมัติ'
                ? '<span class="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-[10px] font-bold">อนุมัติ</span>'
                : (t.status === 'ไม่อนุมัติ'
                    ? '<span class="bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full text-[10px] font-bold">ไม่อนุมัติ</span>'
                    : '<span class="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-[10px] font-bold">รออนุมัติ</span>');
            return `<tr class="hover:bg-slate-50">
                <td class="text-center text-slate-500 text-xs">${fmtTripFull(t.submitted_date || t.created_at)}</td>
                <td class="font-bold text-slate-700">${name}</td>
                <td class="text-slate-700 font-medium">${t.title}</td>
                <td class="text-slate-600 text-sm">${fmtTripShort(t.start_date)} - ${fmtTripShort(t.end_date)}</td>
                <td class="text-center font-black text-sky-600">${t.total_days}</td>
                <td class="text-center">
                    <div class="flex flex-col items-center gap-1 text-xs">
                        ${t.ack_academic ? `<div class="flex items-center gap-1 text-rose-600 font-bold">
                            <i class="fas fa-user-graduate text-[10px]"></i>
                            <span>${fmtTripFull(t.ack_academic_at)}</span>
                            <button onclick="editTripAckDate('${t.id}', 'ack_academic')" class="ml-1 text-amber-500 hover:text-amber-700 transition" title="แก้ไขวันที่">
                                <i class="fas fa-edit text-[10px]"></i>
                            </button>
                        </div>` : ''}
                        ${t.ack_head ? `<div class="flex items-center gap-1 text-emerald-600 font-bold">
                            <i class="fas fa-check-double text-[10px]"></i>
                            <span>${fmtTripFull(t.ack_head_at)}</span>
                            <button onclick="editTripAckDate('${t.id}', 'ack_head')" class="ml-1 text-amber-500 hover:text-amber-700 transition" title="แก้ไขวันที่">
                                <i class="fas fa-edit text-[10px]"></i>
                            </button>
                        </div>` : ''}
                    </div>
                </td>
                <td class="text-center">${statusHtml}</td>
            </tr>`;
        }).join('');
    } else tbDone.innerHTML = '';

    window.doneTripDT = $('#doneTripTable').DataTable({
        scrollX: true,
        scrollCollapse: true,
        autoWidth: false,
        language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
        order: [[0, 'desc']],
        columnDefs: [{ orderable: false, targets: [5, 6] }],
        pageLength: 15
    });
};

// ==========================================
// Tab switch
// ==========================================
window.switchTripTab = function (tabId) {
    $('.tab-content').addClass('hidden');
    $(`#tab-${tabId}`).removeClass('hidden');

    const idMap = { pending: 'btn-pending', done: 'btn-done' };
    if (idMap[tabId] && typeof setActiveNavItem === 'function') setActiveNavItem(idMap[tabId]);

    const btnPending = document.getElementById('tabBtnPending');
    const btnDone = document.getElementById('tabBtnDone');
    if (tabId === 'pending') {
        btnPending.className = 'px-4 py-2 rounded-xl font-bold text-sm bg-sky-600 text-white';
        btnDone.className = 'px-4 py-2 rounded-xl font-bold text-sm bg-slate-100 text-slate-600';
    } else {
        btnPending.className = 'px-4 py-2 rounded-xl font-bold text-sm bg-slate-100 text-slate-600';
        btnDone.className = 'px-4 py-2 rounded-xl font-bold text-sm bg-sky-600 text-white';
    }

    const titles = { pending: 'รอรับทราบ', done: 'รับทราบแล้ว' };
    const titleEl = document.getElementById('pageTitle');
    if (titleEl) titleEl.textContent = titles[tabId] || 'รับทราบใบขอไปราชการ';

    if (window.innerWidth < 761 && typeof toggleSidebar === 'function') toggleSidebar(false);
    setTimeout(() => {
        if (tabId === 'pending' && window.pendingTripDT) window.pendingTripDT.columns.adjust().draw();
        if (tabId === 'done' && window.doneTripDT) window.doneTripDT.columns.adjust().draw();
    }, 100);
};

// ==========================================
// View trip modal (ฉบับเต็ม — พร้อม companions)
// ==========================================
window.viewTrip = function (id) {
    const t = [...window.pendingTrips, ...window.doneTrips].find(x => x.id === id);
    if (!t) return;

    const fullName = `${t.core_personnel.prefix || ''}${t.core_personnel.first_name} ${t.core_personnel.last_name}`;
    const hasCompanions = (t.companion_count > 1);

    // Format helpers
    const fmtDateThai = (iso) => {
        if (!iso) return '-';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '-';
        const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
        return `${d.getDate()} ${months[d.getMonth()]} ${(d.getFullYear() + 543).toString().slice(-2)}`;
    };
    const fmtTime = (tm) => {
        if (!tm) return '-';
        const p = String(tm).split(':');
        return `${p[0]}.${p[1]} น.`;
    };

    const html = `
        <div class="space-y-3 text-sm">
            <!-- ข้อมูลการไปราชการ -->
            <div class="border border-slate-200 rounded-xl p-3 space-y-2">
                <div class="text-xs font-bold text-sky-700 mb-2">
                    <i class="fas fa-plane-departure mr-1"></i>รายละเอียดการไปราชการ
                </div>
                <div class="flex justify-between"><span class="text-slate-600">ชื่อครู</span><span class="font-bold text-slate-800">${fullName}</span></div>
                <div class="flex justify-between"><span class="text-slate-600">กลุ่มสาระฯ</span><span class="font-bold text-slate-800">${t.core_personnel.department || '-'}</span></div>
                ${t.purpose ? `<div class="flex justify-between"><span class="text-slate-600">ความประสงค์</span><span class="font-bold text-slate-800">${t.purpose}${t.purpose_other ? ` (${t.purpose_other})` : ''}</span></div>` : ''}
                <div class="flex justify-between items-start gap-2"><span class="text-slate-600 flex-shrink-0">เรื่อง</span><span class="font-bold text-slate-800 text-right">${t.title}</span></div>
                <div class="flex justify-between"><span class="text-slate-600">สถานที่</span><span class="font-bold text-slate-800">${t.location || '-'}</span></div>
                ${t.doc_number ? `<div class="flex justify-between"><span class="text-slate-600">ตามหนังสือที่</span><span class="font-bold text-slate-800">${t.doc_number}${t.doc_date ? ` ลงวันที่ ${fmtDateThai(t.doc_date)}` : ''}</span></div>` : ''}
                <div class="flex justify-between"><span class="text-slate-600">ช่วงวันที่</span><span class="font-bold text-slate-800">${fmtTripShort(t.start_date)} - ${fmtTripShort(t.end_date)}</span></div>
                <div class="flex justify-between"><span class="text-slate-600">จำนวนวัน</span><span class="font-bold text-slate-800">${t.total_days} วัน</span></div>
            </div>

            <!-- วันเวลาเดินทาง -->
            ${(t.depart_from_date || t.return_to_date) ? `
                <div class="border border-amber-200 bg-amber-50/50 rounded-xl p-3 space-y-2">
                    <div class="text-xs font-bold text-amber-700 mb-2">
                        <i class="fas fa-clock mr-1"></i>วันเวลาเดินทาง
                    </div>
                    ${t.depart_from_date ? `<div class="flex justify-between"><span class="text-slate-600">ออกจากที่พัก</span><span class="font-bold text-slate-800">${fmtDateThai(t.depart_from_date)} เวลา ${fmtTime(t.depart_from_time)}</span></div>` : ''}
                    ${t.return_to_date ? `<div class="flex justify-between"><span class="text-slate-600">กลับถึงที่พัก</span><span class="font-bold text-slate-800">${fmtDateThai(t.return_to_date)} เวลา ${fmtTime(t.return_to_time)}</span></div>` : ''}
                    ${t.travel_vehicle ? `<div class="flex justify-between"><span class="text-slate-600">พาหนะ</span><span class="font-bold text-slate-800">${t.travel_vehicle}</span></div>` : ''}
                </div>
            ` : ''}

            <!-- ผู้ร่วมเดินทาง -->
            ${hasCompanions ? `
                <div class="border border-indigo-200 bg-indigo-50/50 rounded-xl p-3">
                    <div class="text-xs font-bold text-indigo-700 mb-2">
                        <i class="fas fa-users mr-1"></i>ผู้ร่วมเดินทาง (รวม ${t.companion_count} คน)
                    </div>
                    <div id="dept-view-trip-companions-${t.id}" class="text-xs">
                        <div class="text-center text-slate-400 py-2"><i class="fas fa-spinner fa-spin mr-1"></i>กำลังโหลด...</div>
                    </div>
                </div>
            ` : ''}

            <!-- ขอความอนุเคราะห์ -->
            ${(t.req_official_letter || t.req_parent_notice || t.req_travel_expense || t.req_school_car || t.req_other) ? `
                <div class="border border-purple-200 bg-purple-50/50 rounded-xl p-3">
                    <div class="text-xs font-bold text-purple-700 mb-2">
                        <i class="fas fa-hand-holding-heart mr-1"></i>ขอความอนุเคราะห์
                    </div>
                    <ul class="text-xs space-y-1 text-slate-700">
                        ${t.req_official_letter ? '<li><i class="fas fa-file-signature text-purple-500 mr-1"></i>หนังสือไปราชการ</li>' : ''}
                        ${t.req_parent_notice ? '<li><i class="fas fa-bullhorn text-purple-500 mr-1"></i>หนังสือแจ้งผู้ปกครอง</li>' : ''}
                        ${t.req_school_car ? '<li><i class="fas fa-bus text-purple-500 mr-1"></i>รถยนต์โรงเรียน</li>' : ''}
                        ${t.req_travel_expense ? `<li><i class="fas fa-money-bill-wave text-purple-500 mr-1"></i>ค่าพาหนะเดินทาง${t.travel_expense_amount ? ` (${Number(t.travel_expense_amount).toLocaleString('th-TH')} บาท)` : ''}</li>` : ''}
                        ${t.req_other ? `<li><i class="fas fa-ellipsis text-purple-500 mr-1"></i>${t.req_other_text || 'อื่นๆ'}</li>` : ''}
                    </ul>
                </div>
            ` : ''}

            <!-- สถานะการรับทราบ -->
            <div class="border border-slate-200 rounded-xl p-3 space-y-2">
                <div class="text-xs font-bold text-slate-500 mb-2">
                    <i class="fas fa-signature mr-1 text-indigo-400"></i>สถานะการรับทราบ/อนุมัติ
                </div>
                ${t.ack_academic ? `<div class="flex justify-between items-center text-xs">
                    <span class="text-slate-600"><i class="fas fa-user-graduate text-rose-400 mr-1"></i>รองวิชาการ</span>
                    <span class="text-emerald-600 font-bold"><i class="fas fa-check-double mr-1"></i>${fmtDateThai(t.ack_academic_at)}</span>
                </div>` : ''}
                ${t.ack_head ? `<div class="flex justify-between items-center text-xs">
                    <span class="text-slate-600"><i class="fas fa-user-check text-emerald-400 mr-1"></i>หัวหน้ากลุ่มฯ</span>
                    <span class="text-emerald-600 font-bold"><i class="fas fa-check-double mr-1"></i>${fmtDateThai(t.ack_head_at)}</span>
                </div>` : ''}
                ${t.ack_admin ? `<div class="flex justify-between items-center text-xs">
                    <span class="text-slate-600"><i class="fas fa-user-shield text-teal-400 mr-1"></i>แอดมิน</span>
                    <span class="text-emerald-600 font-bold"><i class="fas fa-check-double mr-1"></i>${fmtDateThai(t.ack_admin_at)}</span>
                </div>` : ''}
                ${t.ack_deputy_hr ? `<div class="flex justify-between items-center text-xs">
                    <span class="text-slate-600"><i class="fas fa-user-tie text-indigo-400 mr-1"></i>รอง ผอ.บุคคล</span>
                    <span class="text-emerald-600 font-bold"><i class="fas fa-check-double mr-1"></i>${fmtDateThai(t.ack_deputy_hr_at)}</span>
                </div>` : ''}
                ${t.status === 'อนุมัติ' ? `<div class="flex justify-between items-center text-xs">
                    <span class="text-slate-600"><i class="fas fa-crown text-amber-400 mr-1"></i>ผู้อำนวยการ</span>
                    <span class="text-emerald-600 font-bold"><i class="fas fa-check-double mr-1"></i>อนุมัติแล้ว</span>
                </div>` : ''}
            </div>

            ${t.reject_comment ? `
                <div class="bg-rose-50 border border-rose-200 p-3 rounded-xl text-xs">
                    <b class="text-rose-700">เหตุผลที่ไม่อนุมัติ:</b><br>
                    <span class="text-rose-800">${t.reject_comment}</span>
                </div>
            ` : ''}

            ${!t.ack_head ? `
                <button onclick="window.acknowledgeTripHead('${t.id}'); closeViewTripModal();" 
                    class="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold shadow-lg transition flex items-center justify-center gap-2">
                    <i class="fas fa-user-check"></i> รับทราบใบนี้
                </button>
            ` : ''}
        </div>
    `;

    document.getElementById('viewTripContent').innerHTML = html;
    document.getElementById('viewTripModal').classList.remove('hidden');
    document.getElementById('viewTripModal').classList.add('flex');

    // ✅ โหลด companions
    if (hasCompanions && typeof window.fetchTripCompanions === 'function') {
        window.fetchTripCompanions(t).then(comp => {
            const container = document.getElementById(`dept-view-trip-companions-${t.id}`);
            if (!container) return;
            let innerHtml = '';
            if (comp.teachers.length > 0) {
                innerHtml += `<div class="mb-2">
                    <div class="font-bold text-sky-700 mb-1">👨‍🏫 ครู (${comp.teachers.length} คน)</div>
                    <ul class="ml-3 space-y-0.5">
                        ${comp.teachers.map((tc, i) => `<li>${i + 1}. ${tc.name}${tc.department ? ` <span class="text-slate-500">(${tc.department})</span>` : ''}</li>`).join('')}
                    </ul>
                </div>`;
            }
            if (comp.students.length > 0) {
                innerHtml += `<div>
                    <div class="font-bold text-emerald-700 mb-1">🎓 นักเรียน (${comp.students.length} คน)</div>
                    <ul class="ml-3 space-y-0.5">
                        ${comp.students.map((s, i) => `<li>${i + 1}. ${s.name} <span class="text-slate-500">(${s.class_text} เลขที่ ${s.student_number})</span></li>`).join('')}
                    </ul>
                </div>`;
            }
            container.innerHTML = innerHtml || '<div class="text-slate-400 text-center">ไม่มีข้อมูล</div>';
        });
    }
};

window.closeViewTripModal = function () {
    document.getElementById('viewTripModal').classList.add('hidden');
    document.getElementById('viewTripModal').classList.remove('flex');
};

// ==========================================
// Super Admin: dropdown กลุ่ม
// ==========================================
window.loadTripDepartments = async function () {
    try {
        const { data: depts } = await db.from('core_department_heads').select('department_name').order('department_name');
        const select = document.getElementById('deptHeadGroupFilter');
        if (!select) return;
        let html = '<option value="">📁 ทุกกลุ่ม</option>';
        const unique = [...new Set((depts || []).map(d => d.department_name))];
        unique.forEach(d => { html += `<option value="${d}">${d}</option>`; });
        select.innerHTML = html;
        if (window.headInfo?.department_name) {
            select.value = window.headInfo.department_name;
            window.currentGroupFilter = window.headInfo.department_name;
        }
    } catch (err) { console.error(err); }
};

window.onTripDeptHeadGroupChange = async function () {
    const select = document.getElementById('deptHeadGroupFilter');
    window.currentGroupFilter = select ? (select.value || null) : null;
    await window.loadTripDeptHeadRequests();
    await window.loadTripDeptTeachersCount();
};

// ==========================================
// Expose globals
// ==========================================
window.loadTripDeptHeadRequests = window.loadTripDeptHeadRequests;
window.renderTripDeptTables = window.renderTripDeptTables;
window.updateTripDeptStats = window.updateTripDeptStats;
window.loadTripDeptTeachersCount = window.loadTripDeptTeachersCount;
window.loadTripDepartments = window.loadTripDepartments;
window.onTripDeptHeadGroupChange = window.onTripDeptHeadGroupChange;
window.viewTrip = window.viewTrip;
window.closeViewTripModal = window.closeViewTripModal;
window.switchTripTab = window.switchTripTab;
window.acknowledgeTripHead = window.acknowledgeTripHead;
window.editTripAckDate = window.editTripAckDate;

console.log('✅ government_trip_dept_head.js loaded (v2.0 + Companions)');