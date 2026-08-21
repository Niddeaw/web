// ============================================================
// leave_admin.js — ระบบการลา (ฝ่ายบริหาร) ฉบับแก้ไขสมบูรณ์
// - ใช้ checkSessionAndRole(), hasModuleAccess(), requireAdmin()
// - ใช้ logUserAction() ทุกการกระทำสำคัญ
// - ใช้ applyVisibilityByRole() และ canManageSettings()
// - ใช้ logout() มาตรฐานกลาง
// - เรียกใช้ฟังก์ชันจาก leave_core.js
// ============================================================

let currentUser = null;
let currentProfile = null;
let currentUserId = null;
let currentUserRole = '';
let isAdminMode = false;
let isModuleAdmin = false;
let dataTable = null;
let systemSettings = null;
let allLeavesData = [];
let allPersonnelData = [];
let attendanceDataTable = null;
let allAttendanceData = [];

// ==========================================
// LOGOUT (มาตรฐานกลาง)
// ==========================================
async function logout() {
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
}

// ==========================================
// INIT (ส่วนที่แก้ไข)
// ==========================================
$(document).ready(async function () {
    Swal.fire({ title: 'กำลังตรวจสอบสิทธิ์...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    try {
        const session = await checkSessionAndRole('leave_admin');
        if (!session) return;

        const { user, personnel, role, isAdmin } = session;
        currentUser = user;
        currentProfile = personnel;
        currentUserId = user.id;
        currentUserRole = role;
        isAdminMode = isAdmin;

        isModuleAdmin = await hasModuleAccess(role, 'leave', user.id);

        if (!isAdmin && !isModuleAdmin) {
            await Swal.fire({
                icon: 'warning',
                title: 'ไม่มีสิทธิ์เข้าใช้งาน',
                text: 'คุณไม่ได้รับอนุญาตให้ใช้ระบบจัดการการลา กรุณาติดต่อผู้ดูแลระบบ',
                confirmButtonText: 'กลับหน้าหลัก'
            });
            window.location.href = 'index.html';
            return;
        }

        // ---- จัดการปุ่มตามบทบาท (ไม่รวม toggleBtn) ----
        applyVisibilityByRole(role, isAdminMode, {
            settingsBtn: 'btn-settings'
            // ไม่ส่ง toggleBtn เพื่อให้เราจัดการเอง
        });

        // ---- แสดงปุ่มสลับโหมดสำหรับ admin และ module admin ----
        if (isAdminMode || isModuleAdmin) {
            $('#btnToggleMode').removeClass('hidden').addClass('inline-flex');
        } else {
            $('#btnToggleMode').addClass('hidden').removeClass('inline-flex');
        }

        await logUserAction('เข้าสู่ระบบจัดการการลา (Admin)', 'leave');

        await loadPersonnelSearch();
        await loadSystemSettings();
        updateUI();
        await loadDashboardStats();
        await loadAttendanceTable();
        initAttendanceFlatpickr();
        initEditFlatpickr();
        initAdminFlatpickr();

        Swal.close();
        document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');

    } catch (err) {
        console.error('Initialization error:', err);
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
});

// ==========================================
// อัปเดต UI ตามสิทธิ์
// ==========================================
function updateUI() {
    $('#display-name').text(`${currentProfile.prefix || ''}${currentProfile.first_name} ${currentProfile.last_name}`);

    const isSuperAdmin = canManageSettings(currentUserRole);

    if (isSuperAdmin) {
        $('#btn-import-excel').removeClass('hidden').addClass('flex');
        $('#fiscal_year, #evaluation_round, #btn-save-settings, #select-new-admin, #btn-add-admin, #sign_leave_admin, #sign_hr_deputy, #sign_director').prop('disabled', false);
        $('#superadmin-only-section table').removeClass('opacity-50 pointer-events-none');
    } else {
        $('#btn-import-excel').addClass('hidden').removeClass('flex');
        $('#fiscal_year, #evaluation_round, #btn-save-settings, #select-new-admin, #btn-add-admin, #sign_leave_admin, #sign_hr_deputy, #sign_director').prop('disabled', true);
        $('#superadmin-only-section table').addClass('opacity-50 pointer-events-none');
    }
}

// ==========================================
// สลับแท็บ
// ==========================================
function switchTab(tabId) {
    $('.tab-content').addClass('hidden');
    $(`#tab-${tabId}`).removeClass('hidden');
    $('.sidebar-item').removeClass('sidebar-active');
    $(`#btn-${tabId}`).addClass('sidebar-active');
    const titles = {
        'dashboard': 'แดชบอร์ดสรุปผล',
        'manage-leave': 'จัดการรายการลา',
        'attendance': 'บันทึกขาด/มาสาย',
        'settings': 'ตั้งค่าระบบ & แอดมิน'
    };
    $('#page-title').text(titles[tabId] || 'แดชบอร์ดสรุปผล');
    if (tabId === 'manage-leave' && dataTable) dataTable.columns.adjust().draw();
    if (tabId === 'attendance' && attendanceDataTable) attendanceDataTable.columns.adjust().draw();
}

// ==========================================
// ระบบตั้งค่า (ใช้ requireAdmin)
// ==========================================
async function loadSystemSettings() {
    const { data: leaveData } = await db.from('core_system_modules').select('settings').eq('module_id', 'leave').maybeSingle();
    systemSettings = leaveData?.settings || {
        fiscal_year: (new Date().getFullYear() + 543).toString(),
        eval_round: '1',
        sign_leave_admin: '',
        gas_url: '',
        slide_template_id: '',
        pdf_folder_id: '',
        signature_folder_id: ''   // ✅ เพิ่ม default
    };
    $('#fiscal_year').val(systemSettings.fiscal_year);
    $('#evaluation_round').val(systemSettings.eval_round);
    $('#dash-fiscal-badge').text(`ปีงบประมาณ ${systemSettings.fiscal_year} (รอบที่ ${systemSettings.eval_round})`);
    $('#set_gas_url').val(systemSettings.gas_url || '');
    $('#set_slide_template_id').val(systemSettings.slide_template_id || '');
    $('#set_pdf_folder_id').val(systemSettings.pdf_folder_id || '');
    $('#set_signature_folder_id').val(systemSettings.signature_folder_id || '');

    // ✅ อัปเดต UI แสดงโฟลเดอร์ลายเซ็น (ถ้ามี element)
    const sigDisplay = document.getElementById('sig-folder-id-display');
    if (sigDisplay) {
        sigDisplay.textContent = systemSettings.signature_folder_id || 'ยังไม่ได้ตั้งค่า';
    }

    const signAdminEl = document.getElementById('sign_leave_admin');
    if (signAdminEl) {
        if (signAdminEl.tomselect) signAdminEl.tomselect.setValue(systemSettings.sign_leave_admin);
        else signAdminEl.value = systemSettings.sign_leave_admin;
    }
    const { data: schoolData } = await db.from('core_school_info').select('*').single();
    if (schoolData) {
        $('#display_director').text(schoolData.director_name || 'ไม่ได้ตั้งค่าในส่วนกลาง');
        $('#display_hr_deputy').text(schoolData.deputy_hr || 'ไม่ได้ตั้งค่าในส่วนกลาง');
    } else {
        $('#display_director').text('ไม่พบข้อมูลส่วนกลาง');
        $('#display_hr_deputy').text('ไม่พบข้อมูลส่วนกลาง');
    }
}

async function saveSystemSettings(e) {
    e.preventDefault();
    if (!requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบสูงสุดเท่านั้น')) return;

    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    const newSettings = {
        fiscal_year: $('#fiscal_year').val().trim(),
        eval_round: $('#evaluation_round').val(),
        sign_leave_admin: $('#sign_leave_admin').val() || '',
        gas_url: $('#set_gas_url').val().trim(),
        slide_template_id: $('#set_slide_template_id').val().trim(),
        pdf_folder_id: $('#set_pdf_folder_id').val().trim(),
        signature_folder_id: $('#set_signature_folder_id').val().trim()   // ✅ เพิ่มบรรทัดนี้
    };
    const { error } = await db.from('core_system_modules').update({ settings: newSettings, updated_at: new Date().toISOString() }).eq('module_id', 'leave');
    if (error) {
        Swal.fire('ผิดพลาด', error.message, 'error');
    } else {
        systemSettings = newSettings;
        $('#dash-fiscal-badge').text(`ปีงบประมาณ ${systemSettings.fiscal_year} (รอบที่ ${systemSettings.eval_round})`);

        // ✅ อัปเดต UI แสดงโฟลเดอร์ลายเซ็น
        const sigDisplay = document.getElementById('sig-folder-id-display');
        if (sigDisplay) {
            sigDisplay.textContent = systemSettings.signature_folder_id || 'ยังไม่ได้ตั้งค่า';
        }

        await logUserAction(`บันทึกการตั้งค่าระบบลา (ปี ${systemSettings.fiscal_year})`, 'leave');
        Swal.fire({ icon: 'success', title: 'บันทึกการตั้งค่าสำเร็จ', timer: 1500, showConfirmButton: false });
        loadDashboardStats();
    }
}

// ==========================================
// จัดการบุคลากรและผู้ดูแลระบบ
// ==========================================
async function loadPersonnelSearch() {
    const { data } = await db.from('core_personnel')
        .select('id, prefix, first_name, last_name, department, position, academic_standing')
        .order('first_name');
    allPersonnelData = data || [];
    if (data) {
        let htmlSearch = '<option value="">-- พิมพ์เพื่อค้นหา --</option>';
        data.forEach(p => {
            const name = `${p.prefix || ''}${p.first_name} ${p.last_name}`;
            htmlSearch += `<option value="${p.id}">${name}</option>`;
        });
        const initTomSelect = (selector, options) => {
            const el = document.querySelector(selector);
            if (!el) return;
            if (el.tomselect) el.tomselect.destroy();
            el.innerHTML = htmlSearch;
            new TomSelect(el, { create: false, dropdownParent: 'body', ...options });
        };
        initTomSelect('#select-new-admin', { placeholder: '-- พิมพ์ค้นหาชื่อบุคลากร --' });
        initTomSelect('#filter-personnel', { placeholder: '-- ดูข้อมูลทุกคน --', allowEmptyOption: true });
        initTomSelect('#sign_leave_admin', { placeholder: '-- เลือกผู้รับผิดชอบ --' });
        initTomSelect('#admin_personnel_id', { placeholder: '-- เลือกบุคลากร --' });
        initTomSelect('#att_personnel_id', { placeholder: '-- เลือกบุคลากร --' });
    }
    if (currentUserRole === 'super_admin' || isModuleAdmin) loadAdminList();
}

// ==========================================
// จัดการ Module Admin (ใช้ requireAdmin)
// ==========================================
async function loadAdminList() {
    const tbody = document.getElementById('admin-list');
    tbody.innerHTML = '<tr><td colspan="2" class="p-4 text-center text-slate-400">กำลังโหลด...</td></tr>';

    // Step 1: ดึงรายการ module admins
    const { data: admins, error } = await db.from('core_module_admins')
        .select('id, user_id')
        .eq('module_id', 'leave');

    if (error) {
        console.error('loadAdminList error:', error);
        tbody.innerHTML = '<tr><td colspan="2" class="p-4 text-center text-red-400">เกิดข้อผิดพลาดในการโหลด</td></tr>';
        return;
    }

    if (!admins || admins.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" class="p-4 text-center text-slate-400">ยังไม่มีผู้ดูแลระบบ</td></tr>';
        return;
    }

    // Step 2: ดึงข้อมูลบุคลากรด้วย user_id ที่ได้มา
    const userIds = admins.map(a => a.user_id);
    const { data: personnel } = await db.from('core_personnel')
        .select('id, prefix, first_name, last_name')
        .in('id', userIds);

    const personnelMap = {};
    (personnel || []).forEach(p => { personnelMap[p.id] = p; });

    // Step 3: render ตาราง
    tbody.innerHTML = admins.map(admin => {
        // หาจาก query ใหม่ก่อน แล้ว fallback ไป allPersonnelData
        const p = personnelMap[admin.user_id]
            || allPersonnelData.find(x => x.id === admin.user_id)
            || null;
        const name = p
            ? `${p.prefix || ''}${p.first_name || ''} ${p.last_name || ''}`.trim()
            : `(ID: ${admin.user_id})`;
        return `
        <tr class="hover:bg-slate-50 border-b border-slate-100">
            <td class="p-3 font-bold text-slate-700">${name}</td>
            <td class="p-3 text-center">
                <button onclick="removeModuleAdmin('${admin.id}')" class="text-rose-500 hover:text-white hover:bg-rose-500 bg-rose-50 px-3 py-1.5 rounded-lg transition-colors"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
    }).join('');
}

async function addModuleAdmin() {
    if (!requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้น')) return;

    const userId = $('#select-new-admin').val();
    if (!userId) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกบุคลากรก่อนครับ', 'warning');
    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    const { error } = await db.from('core_module_admins').insert({ user_id: userId, module_id: 'leave' });
    if (error) {
        if (error.code === '23505') Swal.fire('ซ้ำซ้อน', 'บุคลากรท่านนี้เป็นแอดมินอยู่แล้ว', 'warning');
        else Swal.fire('ผิดพลาด', error.message, 'error');
    } else {
        await logUserAction(`แต่งตั้ง Module Admin ลา (ID: ${userId})`, 'leave');
        Swal.fire({ icon: 'success', title: 'แต่งตั้งสำเร็จ', timer: 1500, showConfirmButton: false });
        const selAdmin = document.getElementById('select-new-admin');
        if (selAdmin && selAdmin.tomselect) selAdmin.tomselect.clear();
        loadAdminList();
    }
}

async function removeModuleAdmin(id) {
    if (!requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้น')) return;

    Swal.fire({ title: 'กำลังลบสิทธิ์...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    const { error } = await db.from('core_module_admins').delete().eq('id', id);
    if (!error) {
        await logUserAction(`ถอดถอน Module Admin ลา (ID: ${id})`, 'leave');
        Swal.fire({ icon: 'success', title: 'ถอดถอนสิทธิ์สำเร็จ', timer: 1500, showConfirmButton: false });
        loadAdminList();
    } else Swal.fire('ผิดพลาด', error.message, 'error');
}

// ==========================================
// Dashboard & ตารางข้อมูล
// ==========================================
async function loadDashboardStats() {
    const { data: leaves, error } = await db.from('leave_requests')
        .select('*, core_personnel(prefix, first_name, last_name, department, position)')
        .eq('fiscal_year', systemSettings.fiscal_year)
        .eq('eval_round', systemSettings.eval_round);
    if (error) { console.error(error); return; }
    allLeavesData = leaves || [];

    // แยกตามสถานะ
    const approvedLeaves = allLeavesData.filter(l => l.status === 'อนุมัติ');
    const pendingLeaves = allLeavesData.filter(l => l.status === 'รออนุมัติ');

    // อนุมัติแล้ว
    const approvedSickDays = approvedLeaves.filter(l => l.type === 'ลาป่วย').reduce((sum, l) => sum + l.total_days, 0);
    const approvedPersonalDays = approvedLeaves.filter(l => l.type === 'ลากิจส่วนตัว').reduce((sum, l) => sum + l.total_days, 0);
    const approvedPeople = [...new Set(approvedLeaves.map(l => l.personnel_id))].length;

    // รออนุมัติ
    const pendingSickDays = pendingLeaves.filter(l => l.type === 'ลาป่วย').reduce((sum, l) => sum + l.total_days, 0);
    const pendingPersonalDays = pendingLeaves.filter(l => l.type === 'ลากิจส่วนตัว').reduce((sum, l) => sum + l.total_days, 0);
    const pendingPeople = [...new Set(pendingLeaves.map(l => l.personnel_id))].length;
    const pendingCount = pendingLeaves.length;

    // อัปเดต DOM
    $('#total-sick').html(`
        ${approvedSickDays} <span class="text-sm font-medium text-slate-500">วัน</span>
        <div class="text-xs text-amber-500 font-medium mt-1">รออนุมัติ ${pendingSickDays} วัน</div>
    `);
    $('#total-personal').html(`
        ${approvedPersonalDays} <span class="text-sm font-medium text-slate-500">วัน</span>
        <div class="text-xs text-amber-500 font-medium mt-1">รออนุมัติ ${pendingPersonalDays} วัน</div>
    `);
    $('#total-pending').html(`
        ${pendingCount} <span class="text-sm font-medium text-slate-500">รายการ</span>
    `);
    $('#total-people').html(`
        ${approvedPeople} <span class="text-sm font-medium text-slate-500">คน</span>
        <div class="text-xs text-amber-500 font-medium mt-1">รออนุมัติ ${pendingPeople} คน</div>
    `);

    // ส่งเฉพาะ approvedLeaves ไป checkLeaveLimits
    checkLeaveLimits(approvedLeaves);
    await loadPromotionWarnings();
    renderTable();
}

function checkLeaveLimits(approvedLeaves) {
    const personnelStats = {};
    approvedLeaves.forEach(l => {
        if (!personnelStats[l.personnel_id]) {
            personnelStats[l.personnel_id] = {
                name: `${l.core_personnel.prefix || ''}${l.core_personnel.first_name} ${l.core_personnel.last_name}`,
                sick: 0,
                personal: 0,
                totalCount: 0
            };
        }
        if (l.type === 'ลาป่วย') personnelStats[l.personnel_id].sick += l.total_days;
        if (l.type === 'ลากิจส่วนตัว') personnelStats[l.personnel_id].personal += l.total_days;
        personnelStats[l.personnel_id].totalCount++;
    });

    const alertZone = $('#alert-zone');
    alertZone.empty();
    let hasAlert = false;

    Object.values(personnelStats).forEach(p => {
        const warnings = [];
        if (p.sick >= 25) warnings.push(`<span class="text-red-600">ป่วย: ${p.sick}/30 วัน</span>`);
        if (p.personal >= 40) warnings.push(`<span class="text-orange-600">ลากิจ: ${p.personal}/45 วัน</span>`);
        if (p.totalCount >= 4) {
            let msg = '';
            if (p.totalCount > 6) msg = `<span class="text-red-600">ลาทั้งหมด: ${p.totalCount} ครั้ง (เกินเกณฑ์ 6 ครั้ง)</span>`;
            else if (p.totalCount === 6) msg = `<span class="text-orange-600">ลาทั้งหมด: ${p.totalCount} ครั้ง (ถึงเกณฑ์ 6 ครั้ง)</span>`;
            else msg = `<span class="text-amber-600">ลาทั้งหมด: ${p.totalCount} ครั้ง (ใกล้เกณฑ์ 6 ครั้ง)</span>`;
            warnings.push(msg);
        }
        if (warnings.length > 0) {
            hasAlert = true;
            alertZone.append(`
                <div class="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-xl shadow-sm">
                    <div class="text-sm">
                        <i class="fas fa-exclamation-triangle text-red-500 mr-2"></i>
                        <span class="font-bold text-slate-800">${p.name}</span>
                        <span class="mx-2 text-slate-400">|</span> 
                        ${warnings.join(', ')}
                    </div>
                </div>
            `);
        }
    });

    if (!hasAlert) {
        alertZone.html('<div class="text-center text-emerald-500 py-4 text-sm font-bold"><i class="fas fa-check-circle mr-2"></i> บุคลากรทุกคนยังอยู่ในเกณฑ์ปกติครับ</div>');
    }
}

async function loadPromotionWarnings() {
    try {
        const { data: leaves, error: leavesErr } = await db.from('leave_requests')
            .select('personnel_id, type, total_days, status')
            .eq('fiscal_year', systemSettings.fiscal_year)
            .eq('eval_round', systemSettings.eval_round)
            .eq('status', 'อนุมัติ'); // 🔁 เปลี่ยนจาก .neq('status', 'ไม่อนุมัติ')
        if (leavesErr) throw leavesErr;

        const { data: attendances, error: attErr } = await db.from('personnel_attendance')
            .select('personnel_id, record_type')
            .eq('fiscal_year', systemSettings.fiscal_year)
            .eq('eval_round', systemSettings.eval_round);
        if (attErr) throw attErr;

        const statsMap = new Map();
        for (const l of leaves) {
            if (!statsMap.has(l.personnel_id)) {
                statsMap.set(l.personnel_id, { sickDays: 0, personalDays: 0, totalLeaveCount: 0, lateCount: 0 });
            }
            const stat = statsMap.get(l.personnel_id);
            if (l.type === 'ลาป่วย') stat.sickDays += l.total_days;
            else if (l.type === 'ลากิจส่วนตัว') stat.personalDays += l.total_days;
            stat.totalLeaveCount++;
        }
        for (const a of attendances) {
            if (a.record_type === 'มาสาย') {
                if (!statsMap.has(a.personnel_id)) {
                    statsMap.set(a.personnel_id, { sickDays: 0, personalDays: 0, totalLeaveCount: 0, lateCount: 0 });
                }
                statsMap.get(a.personnel_id).lateCount++;
            }
        }

        const evaluation = [];
        for (const [personnelId, stat] of statsMap.entries()) {
            const totalSickPersonal = stat.sickDays + stat.personalDays;
            let isEligible = true;
            const reasons = [];
            if (totalSickPersonal > 23) {
                isEligible = false;
                reasons.push(`ลาป่วย+ลากิจรวม ${totalSickPersonal} วัน (เกิน 23 วัน)`);
            }
            if (stat.totalLeaveCount > 6) {
                isEligible = false;
                reasons.push(`ลาทั้งหมด ${stat.totalLeaveCount} ครั้ง (เกิน 6 ครั้ง)`);
            }
            if (stat.lateCount > 23) {
                isEligible = false;
                reasons.push(`มาสาย ${stat.lateCount} ครั้ง (เกิน 23 ครั้ง)`);
            }
            if (!isEligible) {
                const personnel = allPersonnelData.find(p => p.id === personnelId);
                const name = personnel ? `${personnel.prefix || ''}${personnel.first_name} ${personnel.last_name}` : 'ไม่พบชื่อ';
                evaluation.push({ name, reasons, totalSickPersonal, totalLeaveCount: stat.totalLeaveCount, lateCount: stat.lateCount });
            }
        }

        const alertZone = $('#promotion-alert-zone');
        if (evaluation.length === 0) {
            alertZone.html('<div class="text-center text-emerald-500 py-4 text-sm font-bold"><i class="fas fa-check-circle mr-2"></i> บุคลากรทุกคนผ่านเกณฑ์การเลื่อนเงินเดือน</div>');
            return;
        }
        let html = '';
        for (const p of evaluation) {
            html += `
                <div class="flex flex-col p-3 bg-yellow-50 border border-yellow-200 rounded-xl shadow-sm">
                    <div class="flex items-start gap-2">
                        <i class="fas fa-exclamation-triangle text-yellow-600 mt-1"></i>
                        <div class="flex-1">
                            <div class="font-bold text-slate-800">${p.name}</div>
                            <div class="text-sm text-slate-600">${p.reasons.join(', ')}</div>
                            <div class="text-xs text-slate-400 mt-1">(ลาป่วย+กิจ ${p.totalSickPersonal} วัน | ลาทั้งหมด ${p.totalLeaveCount} ครั้ง | มาสาย ${p.lateCount} ครั้ง)</div>
                        </div>
                    </div>
                </div>
            `;
        }
        alertZone.html(html);
    } catch (err) {
        console.error('loadPromotionWarnings error:', err);
        $('#promotion-alert-zone').html('<div class="text-center text-red-500 py-4 text-sm">เกิดข้อผิดพลาดในการโหลดข้อมูล</div>');
    }
}

function filterTableByPerson() {
    const personId = $('#filter-personnel').val();
    if (personId) {
        const personName = $('#filter-personnel option:selected').text();
        dataTable.search(personName).draw();
    } else dataTable.search('').draw();
}

// ==========================================
// ฟังก์ชันแปลงวันที่สำหรับแสดงผล (เพิ่มเข้ามา)
// ==========================================
function formatDateThai(isoString) {
    if (!isoString) return '-';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '-';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear() + 543;
    return `${day}/${month}/${year}`;
}

// ==========================================
// renderTable() ฉบับเต็ม
// ==========================================
function renderTable() {
    // ถ้ามี DataTable อยู่แล้ว ให้ทำลายทิ้ง
    if ($.fn.DataTable.isDataTable('#adminLeaveTable')) {
        $('#adminLeaveTable').DataTable().destroy();
    }

    const tbody = document.getElementById('tb-admin-leave');
    const role = currentUserRole;
    const isSuperAdmin = role === 'super_admin';
    const isDirector = role === 'director';
    const isDeputy = role === 'deputy';
    const isAdmin = role === 'admin';

    // กำหนดว่า role ไหนสามารถอนุมัติได้ (director + super_admin)
    const canApprove = isSuperAdmin || isDirector;

    // กำหนด ackField สำหรับปุ่มรับทราบเฉพาะ role ของผู้ใช้
    // super_admin: กดรับทราบแทนได้ทุกตำแหน่ง (แสดงปุ่มรับทราบรายตำแหน่งที่ยังไม่รับทราบ)
    let ackField = null;
    if (isAdmin) ackField = 'ack_admin';
    else if (isDeputy) ackField = 'ack_deputy';
    else if (isDirector) ackField = 'ack_director';
    // super_admin จะจัดการ ackField แบบพิเศษด้านล่าง (per-row)

    if (allLeavesData.length > 0) {
        tbody.innerHTML = allLeavesData.map(l => {
            const fullName = `${l.core_personnel.prefix || ''}${l.core_personnel.first_name} ${l.core_personnel.last_name}`;
            const safeFullName = fullName.replace(/'/g, "\\'");
            const fmt = (iso) => {
                if (!iso) return '-';
                const p = iso.split('-');
                return `${p[2]}/${p[1]}/${parseInt(p[0]) + 543}`;
            };
            const isRejected = l.status === 'ไม่อนุมัติ';
            const displayDays = isRejected ? 0 : l.total_days;
            const displayTimes = isRejected ? 0 : 1;

            // ---- สถานะใบลา ----
            let statusHtml = '';
            if (l.status === 'รออนุมัติ') {
                statusHtml = '<span class="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold border border-amber-200">รออนุมัติ</span>';
            } else if (l.status === 'อนุมัติ') {
                statusHtml = '<span class="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold border border-emerald-200">อนุมัติ</span>';
            } else {
                const safeComment = l.reject_comment
                    ? l.reject_comment.replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, '<br>')
                    : 'ไม่มีการระบุเหตุผล';
                statusHtml = `<button onclick="showRejectComment('${safeComment}')" class="bg-rose-100 text-rose-700 px-3 py-1 rounded-full text-xs font-bold border border-rose-300 cursor-pointer hover:bg-rose-200 transition shadow-sm"><i class="fas fa-times-circle mr-1"></i> ไม่อนุมัติ</button>`;
            }

            // ---- สถานะรับทราบ (แสดงผลทุก role) ----
            const ackAdmin = l.ack_admin ? '✅' : '⏳';
            const ackDeputy = l.ack_deputy ? '✅' : '⏳';
            const ackDirector = l.ack_director ? '✅' : '⏳';

            const ackStatusHtml = `
                <div class="flex flex-col items-start text-xs space-y-0.5">
                    <span class="font-medium text-slate-600">แอดมิน: ${ackAdmin}</span>
                    <span class="font-medium text-slate-600">รองผู้อำนวยการ: ${ackDeputy}</span>
                    <span class="font-medium text-slate-600">ผู้อำนวยการ: ${ackDirector}</span>
                </div>
            `;

            // ---- สีตามประเภทการลา ----
            let typeClass = l.type === 'ลาป่วย' ? 'text-blue-600'
                : (l.type === 'ลากิจส่วนตัว' ? 'text-orange-600' : 'text-rose-600');
            if (isRejected) typeClass = 'text-slate-400 line-through';

            // ---- ปุ่ม PDF ----
            let pdfHtml = '';
            if (l.pdf_url) {
                pdfHtml = `
                <a href="${l.pdf_url}" target="_blank" class="btn-icon bg-green-50 text-green-600 hover:bg-green-500 hover:text-white" title="เปิด PDF"><i class="fas fa-file-pdf"></i></a>
                <button onclick="window.generateLeavePDF('${l.id}', systemSettings)" class="btn-icon bg-blue-50 text-blue-600 hover:bg-blue-500 hover:text-white" title="สร้างใหม่ (แทนที่ไฟล์เดิม)"><i class="fas fa-sync-alt"></i></button>
            `;
            } else {
                pdfHtml = `<button onclick="window.generateLeavePDF('${l.id}', systemSettings)" class="btn-icon bg-blue-50 text-blue-600 hover:bg-blue-500 hover:text-white" title="สร้าง PDF"><i class="fas fa-print"></i></button>`;
            }
            
            // ---- ปุ่มดูรายละเอียด ----
            const viewBtn = `<button onclick="viewLeave('${l.id}')" class="btn-icon bg-indigo-50 text-indigo-600 hover:bg-indigo-500 hover:text-white" title="ดูรายละเอียด"><i class="fas fa-eye"></i></button>`;

            // ---- ปุ่มรับทราบ ----
            // super_admin: แสดงปุ่มรับทราบแทนทุกตำแหน่งที่ยังไม่รับทราบ
            // admin/deputy/director: แสดงปุ่มรับทราบเฉพาะตำแหน่งของตัวเอง
            let ackBtn = '';
            if (isSuperAdmin) {
                const superAckDefs = [
                    { field: 'ack_admin',    label: 'รับทราบแทนแอดมิน' },
                    { field: 'ack_deputy',   label: 'รับทราบแทนรองผู้อำนวยการ' },
                    { field: 'ack_director', label: 'รับทราบแทนผู้อำนวยการ' }
                ];
                superAckDefs.forEach(def => {
                    if (!l[def.field]) {
                        ackBtn += `<button onclick="acknowledgeLeave('${l.id}', '${def.field}')" class="btn-icon bg-teal-50 text-teal-600 hover:bg-teal-500 hover:text-white" title="${def.label}"><i class="fas fa-check"></i></button>`;
                    } else {
                        ackBtn += `<button class="btn-icon bg-teal-100 text-teal-600 cursor-default" title="${def.label.replace('รับทราบแทน', '')} รับทราบแล้ว" disabled><i class="fas fa-check-double"></i></button>`;
                    }
                });
            } else if (ackField) {
                const alreadyAck = !!l[ackField];
                ackBtn = alreadyAck
                    ? `<button class="btn-icon bg-teal-100 text-teal-600 cursor-default" title="รับทราบแล้ว" disabled><i class="fas fa-check-double"></i></button>`
                    : `<button onclick="acknowledgeLeave('${l.id}', '${ackField}')" class="btn-icon bg-teal-50 text-teal-600 hover:bg-teal-500 hover:text-white" title="รับทราบ"><i class="fas fa-check"></i></button>`;
            }

            // ---- ปุ่มอนุมัติ/ไม่อนุมัติ (เฉพาะ director/super_admin) ----
            const approveBtn = canApprove
                ? `<button onclick="updateStatus('${l.id}', 'อนุมัติ')" class="btn-icon bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white" title="อนุมัติ"><i class="fas fa-thumbs-up"></i></button>
                   <button onclick="rejectLeave('${l.id}')" class="btn-icon bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white" title="ไม่อนุมัติ"><i class="fas fa-thumbs-down"></i></button>`
                : '';

            // ---- ปุ่มแก้ไข ----
            const editBtn = `<button onclick="editLeave('${l.id}')" class="btn-icon bg-amber-50 text-amber-600 hover:bg-amber-500 hover:text-white" title="แก้ไขข้อมูล"><i class="fas fa-edit"></i></button>`;

            // ---- ปุ่มลบ ----
            // Super admin: ลบได้ทุกสถานะ
            // Module admin + admin ทั่วไป: ลบได้เฉพาะที่ยังไม่อนุมัติ
            const canDelete = isSuperAdmin || (l.status !== 'อนุมัติ' && (isModuleAdmin || !isSuperAdmin));
            const deleteBtn = canDelete
                ? `<button onclick="deleteLeave('${l.id}', '${safeFullName}')" class="btn-icon text-slate-300 hover:bg-rose-50 hover:text-rose-600" title="ลบ"><i class="fas fa-trash-alt"></i></button>`
                : '';

            // ============================================================
            // คอลัมน์แรก: เปลี่ยนจากรหัสเป็นวันที่ส่ง พร้อม data-order
            // ============================================================
            const dateDisplay = formatDateThai(l.created_at);
            const dateOrder = l.created_at || '';

            return `<tr class="hover:bg-slate-50 transition-colors">
                <td class="text-center text-slate-600 text-sm font-medium" data-order="${dateOrder}">${dateDisplay}</td>
                <td class="font-bold text-slate-700">${fullName}</td>
                <td class="font-bold ${typeClass}">${l.type}</td>
                <td class="text-slate-600">${fmt(l.start_date)} - ${fmt(l.end_date)}</td>
                <td class="text-center font-black ${typeClass}">${displayDays}</td>
                <td class="text-center font-black ${typeClass}">${displayTimes}</td>
                <td class="text-center">${statusHtml}</td>
                <td class="text-center">${ackStatusHtml}</td>
                <td class="text-center whitespace-nowrap">
                    <div class="inline-flex items-center gap-1">
                        ${pdfHtml}
                        ${viewBtn}
                        ${ackBtn}
                        ${approveBtn}
                        ${editBtn}
                        ${deleteBtn}
                    </div>
                </td>
            </tr>`;
        }).join('');
    } else {
        tbody.innerHTML = '';
    }

    // สร้าง DataTable ใหม่
    dataTable = $('#adminLeaveTable').DataTable({
        responsive: true,
        scrollX: false,
        language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
        order: [[0, 'desc']],  // เรียงตามคอลัมน์แรก (วันที่ส่ง) จากล่าสุดไปเก่าสุด
        columnDefs: [
            { responsivePriority: 1, targets: -1 },
            { orderable: false, targets: [8] } // คอลัมน์จัดการ (index 8)
        ],
        pageLength: 25
    });
}

// ==========================================
// ฟังก์ชันจัดการใบลา (ใช้ requireAdmin)
// ==========================================

// ----- แก้ไขใบลา -----
function initEditFlatpickr() {
    flatpickr(".edit-datepicker", { locale: "th", dateFormat: "Y-m-d", altInput: true, altFormat: "j F Y", onChange: function () { calculateEditDays(); } });
}
function calculateEditDays() {
    const start = $('#edit_start_date').val(), end = $('#edit_end_date').val(), type = $('#edit_leave_type').val();
    if (!start || !end) return;
    let startDate = new Date(start), endDate = new Date(end);
    if (endDate < startDate) { Swal.fire('วันที่ไม่ถูกต้อง', 'วันสิ้นสุดต้องไม่มาก่อนวันเริ่มลา', 'warning'); $('#edit_end_date').val(''); return; }
    let count = 0, curDate = new Date(startDate);
    while (curDate <= endDate) {
        const dayOfWeek = curDate.getDay();
        if (type === 'ลาคลอดบุตร') count++;
        else if (dayOfWeek !== 0 && dayOfWeek !== 6) count++;
        curDate.setDate(curDate.getDate() + 1);
    }
    $('#edit_calc_days').text(count);
}
function editLeave(id) {
    const leave = allLeavesData.find(l => l.id === id);
    if (!leave) return Swal.fire('ข้อผิดพลาด', 'ไม่พบข้อมูลการลานี้', 'error');
    $('#edit_leave_id').val(leave.id);
    $('#edit_leave_type').val(leave.type);
    document.querySelector("#edit_start_date")._flatpickr.setDate(leave.start_date);
    document.querySelector("#edit_end_date")._flatpickr.setDate(leave.end_date);
    $('#edit_contact_address').val(leave.contact_address || '');
    $('#edit_phone_number').val(leave.phone_number || '');
    $('#edit_reason').val(leave.reason);
    $('#edit_calc_days').text(leave.total_days);
    $('#editLeaveModal').removeClass('hidden');
}
$('#editLeaveForm').on('submit', async function (e) {
    e.preventDefault();
    if (!requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้น')) return;

    const id = $('#edit_leave_id').val();
    const updateData = {
        type: $('#edit_leave_type').val(),
        start_date: $('#edit_start_date').val(),
        end_date: $('#edit_end_date').val(),
        total_days: parseInt($('#edit_calc_days').text()),
        reason: $('#edit_reason').val(),
        contact_address: $('#edit_contact_address').val(),
        phone_number: $('#edit_phone_number').val(),
        pdf_url: null
    };
    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    const { error } = await db.from('leave_requests').update(updateData).eq('id', id);
    if (error) Swal.fire('ข้อผิดพลาด', error.message, 'error');
    else {
        await logUserAction(`แก้ไขใบลา ID: ${id}`, 'leave');
        closeEditModal();
        Swal.fire({ title: 'บันทึกสำเร็จ', text: 'แก้ไขข้อมูลเรียบร้อย', icon: 'success', timer: 1500, showConfirmButton: false });
        await loadDashboardStats();
    }
});
function closeEditModal() { $('#editLeaveModal').addClass('hidden'); $('#editLeaveForm')[0].reset(); }

// ----- อนุมัติ/ไม่อนุมัติ -----
// ======================== updateStatus ========================
async function updateStatus(id, newStatus) {
    if (!requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้น')) return;

    const { data: leave, error: fetchError } = await db.from('leave_requests')
        .select('ack_admin, ack_deputy, ack_director, status')
        .eq('id', id)
        .single();
    if (fetchError) {
        Swal.fire('ผิดพลาด', fetchError.message, 'error');
        return;
    }

    if (leave.status === 'รออนุมัติ') {
        if (!leave.ack_admin) {
            Swal.fire({ icon: 'warning', title: 'ไม่สามารถอนุมัติได้', text: 'กรุณารอให้แอดมินรับทราบก่อน จึงจะสามารถอนุมัติได้' });
            return;
        }
        if (!leave.ack_deputy) {
            Swal.fire({ icon: 'warning', title: 'ไม่สามารถอนุมัติได้', text: 'กรุณารอให้รองผู้อำนวยการรับทราบก่อน จึงจะสามารถอนุมัติได้' });
            return;
        }
    }

    const now = new Date().toISOString();
    let updateData = {
        status: newStatus,
        reject_comment: null,
        updated_at: now,
        approved_at: now  // ✅ บันทึกเวลาอนุมัติ
    };

    if (currentUserRole === 'director' || currentUserRole === 'super_admin') {
        updateData.ack_director = true;
        updateData.ack_director_at = now;
    }

    Swal.fire({ title: 'กำลังอัปเดตสถานะ...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    const { error } = await db.from('leave_requests').update(updateData).eq('id', id);
    if (error) {
        Swal.fire('ผิดพลาด', error.message, 'error');
    } else {
        await logUserAction(`อนุมัติใบลา ID: ${id} (${newStatus})`, 'leave');
        const Toast = Swal.mixin({ toast: true, position: 'bottom-end', showConfirmButton: false, timer: 1500 });
        Toast.fire({ icon: 'success', title: `ปรับสถานะเป็น "${newStatus}" เรียบร้อย` });
        await loadDashboardStats();
    }
}

// ======================== rejectLeave ========================
async function rejectLeave(id) {
    if (!requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้น')) return;

    const { data: leave, error: fetchError } = await db.from('leave_requests')
        .select('ack_admin, ack_deputy, ack_director, status')
        .eq('id', id)
        .single();
    if (fetchError) {
        Swal.fire('ผิดพลาด', fetchError.message, 'error');
        return;
    }

    if (leave.status === 'รออนุมัติ') {
        if (!leave.ack_admin) {
            Swal.fire({ icon: 'warning', title: 'ไม่สามารถไม่อนุมัติได้', text: 'กรุณารอให้แอดมินรับทราบก่อน จึงจะสามารถไม่อนุมัติได้' });
            return;
        }
        if (!leave.ack_deputy) {
            Swal.fire({ icon: 'warning', title: 'ไม่สามารถไม่อนุมัติได้', text: 'กรุณารอให้รองผู้อำนวยการรับทราบก่อน จึงจะสามารถไม่อนุมัติได้' });
            return;
        }
    }

    const { value: comment } = await Swal.fire({
        title: 'ไม่อนุมัติการลา',
        html: '<p class="text-sm text-slate-500 mb-3">กรุณาระบุเหตุผลที่ไม่อนุมัติ เพื่อส่งกลับไปให้บุคลากรทราบ</p>',
        input: 'textarea',
        inputPlaceholder: 'พิมพ์เหตุผลที่นี่...',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#64748b',
        confirmButtonText: '<i class="fas fa-paper-plane mr-2"></i> ยืนยันไม่อนุมัติ',
        cancelButtonText: 'ยกเลิก',
        inputValidator: (value) => { if (!value) return 'กรุณาระบุเหตุผลด้วยครับ!'; }
    });

    if (comment) {
        Swal.fire({ title: 'กำลังอัปเดตข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

        const now = new Date().toISOString();
        let updateData = {
            status: 'ไม่อนุมัติ',
            reject_comment: comment.trim(),
            updated_at: now,
            approved_at: now  // ✅ บันทึกเวลา (กรณีไม่อนุมัติก็ใช้เป็น timestamp)
        };

        const effectiveRole = currentUserRole === 'teacher' && (isAdminMode || isModuleAdmin) ? 'admin' : currentUserRole;
        if (effectiveRole === 'director' || effectiveRole === 'super_admin') {
            updateData.ack_director = true;
            updateData.ack_director_at = now;
        }

        const { error } = await db.from('leave_requests').update(updateData).eq('id', id);
        if (error) {
            Swal.fire('ผิดพลาด', error.message, 'error');
        } else {
            await logUserAction(`ไม่อนุมัติใบลา ID: ${id} (เหตุผล: ${comment})`, 'leave');
            Swal.fire({ icon: 'success', title: 'ไม่อนุมัติเรียบร้อย', timer: 1500, showConfirmButton: false });
            await loadDashboardStats();
        }
    }
}

function showRejectComment(comment) {
    Swal.fire({ icon: 'info', title: 'เหตุผลที่ไม่อนุมัติ', html: `<div class="text-left bg-rose-50 p-4 rounded-xl border border-rose-100 text-rose-800 mt-2 font-medium">${comment}</div>`, confirmButtonColor: '#4f46e5', confirmButtonText: 'ปิดหน้าต่าง' });
}

// ----- ลบใบลา -----
async function deleteLeave(id, name) {
    // Module admin (แอดมินประจำโมดูล) สามารถลบใบลาได้ (เฉพาะที่ยังไม่อนุมัติ)
    // Super admin สามารถลบได้ทุกสถานะ
    if (!isModuleAdmin && !requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้น')) return;

    const { data: leave, error: fetchError } = await db.from('leave_requests').select('status').eq('id', id).single();
    if (fetchError) { Swal.fire('ผิดพลาด', fetchError.message, 'error'); return; }
    if (leave.status === 'อนุมัติ' && !canManageSettings(currentUserRole)) {
        Swal.fire('ไม่สามารถลบได้', 'รายการลาที่อนุมัติแล้วไม่สามารถลบได้ เพื่อรักษาความถูกต้องของสถิติ หากจำเป็นต้องลบ โปรดติดต่อ Super Admin', 'warning');
        return;
    }
    const { isConfirmed } = await Swal.fire({ title: 'ลบรายการลานี้?', html: `ต้องการลบรายการลาของ <b>${name}</b> หรือไม่?`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'ลบข้อมูล' });
    if (isConfirmed) {
        Swal.fire({ title: 'กำลังลบ...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
        const { error } = await db.from('leave_requests').delete().eq('id', id);
        if (!error) {
            await logUserAction(`ลบใบลา ID: ${id} (${name})`, 'leave');
            await loadDashboardStats();
            Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1500, showConfirmButton: false });
        }
        else Swal.fire('ผิดพลาด', error.message, 'error');
    }
}

// ==========================================
// ดูรายละเอียดใบลา
// ==========================================
function viewLeave(id) {
    const l = allLeavesData.find(x => x.id === id);
    if (!l) return;
    const fmt = (iso) => { if (!iso) return '-'; const p = iso.split('-'); return `${p[2]}/${p[1]}/${parseInt(p[0]) + 543}`; };
    const fmtDateTime = (iso) => {
        if (!iso) return '-';
        const d = new Date(iso);
        const thMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
        return `${d.getDate()} ${thMonths[d.getMonth()]} ${d.getFullYear() + 543} เวลา ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} น.`;
    };

    const fullName = `${l.core_personnel.prefix || ''}${l.core_personnel.first_name} ${l.core_personnel.last_name}`;

    const statusMap = {
        'รออนุมัติ': '<span class="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold border border-amber-200">รออนุมัติ</span>',
        'อนุมัติ': '<span class="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold border border-emerald-200">อนุมัติ</span>',
        'ไม่อนุมัติ': '<span class="bg-rose-100 text-rose-700 px-3 py-1 rounded-full text-xs font-bold border border-rose-200">ไม่อนุมัติ</span>'
    };
    const statusBadge = statusMap[l.status] || statusMap['รออนุมัติ'];

    let effectiveRole = currentUserRole;
    if (effectiveRole === 'teacher' && (isAdminMode || isModuleAdmin)) {
        effectiveRole = 'admin';
    }

    const isSuperAdminView = effectiveRole === 'super_admin';

    let myAckField = null;
    if (!isSuperAdminView && effectiveRole !== 'director') {
        const ackFieldMap = { admin: 'ack_admin', deputy: 'ack_deputy' };
        myAckField = ackFieldMap[effectiveRole] || null;
    } else if (effectiveRole === 'director') {
        myAckField = 'ack_director';
    }
    // super_admin: แสดงปุ่มรับทราบแทนได้ทุกตำแหน่งที่ยังไม่รับทราบ (จัดการใน buildAckRow)

    function buildAckRow(label, field) {
        const done = !!l[field];
        const atField = field + '_at';
        const atValue = l[atField] ? fmtDateTime(l[atField]) : '';
        let buttonHtml = '';
        // super_admin: แสดงปุ่มรับทราบแทนทุกตำแหน่งที่ยังไม่รับทราบ
        if (isSuperAdminView && !done) {
            buttonHtml = `<button onclick="acknowledgeLeave('${l.id}', '${field}'); closeViewModal()" class="ml-2 px-3 py-1 bg-teal-500 hover:bg-teal-600 text-white rounded-lg text-xs font-bold shadow-sm transition"><i class="fas fa-check-double mr-1"></i> รับทราบแทน</button>`;
        } else if (myAckField === field && !done) {
            buttonHtml = `<button onclick="acknowledgeLeave('${l.id}', '${field}'); closeViewModal()" class="ml-2 px-3 py-1 bg-teal-500 hover:bg-teal-600 text-white rounded-lg text-xs font-bold shadow-sm transition"><i class="fas fa-check-double mr-1"></i> รับทราบ</button>`;
        }
        return `<div class="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
            <span class="text-sm text-slate-600">${label}</span>
            <div class="flex items-center gap-2">
                ${done
                ? `<span class="text-xs font-bold text-teal-600 bg-teal-50 border border-teal-200 px-3 py-1 rounded-full"><i class="fas fa-check-double mr-1"></i>รับทราบแล้ว${atValue ? ' (' + atValue + ')' : ''}</span>`
                : `<span class="text-xs font-bold text-slate-400 bg-slate-50 border border-slate-200 px-3 py-1 rounded-full"><i class="fas fa-clock mr-1"></i>ยังไม่รับทราบ</span>`
            }
                ${buttonHtml}
            </div>
        </div>`;
    }

    const canApprove = effectiveRole === 'super_admin' || effectiveRole === 'director';
    let actionButtons = '';
    if (canApprove && l.status === 'รออนุมัติ') {
        const canApproveAction = l.ack_admin && l.ack_deputy;
        if (!canApproveAction) {
            actionButtons = `<div class="text-xs text-amber-600 bg-amber-50 border border-amber-200 p-2 rounded-lg">
                <i class="fas fa-info-circle mr-1"></i> 
                ต้องรอให้ <b>แอดมิน</b> และ <b>รองผู้อำนวยการ</b> รับทราบก่อน จึงจะสามารถอนุมัติ/ไม่อนุมัติได้
            </div>`;
        } else {
            actionButtons = `<button onclick="updateStatus('${l.id}', 'อนุมัติ'); closeViewModal()" class="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-sm flex items-center gap-2 transition shadow-sm"><i class="fas fa-thumbs-up"></i> อนุมัติ</button>
                         <button onclick="rejectLeave('${l.id}'); closeViewModal()" class="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold text-sm flex items-center gap-2 transition shadow-sm"><i class="fas fa-thumbs-down"></i> ไม่อนุมัติ</button>`;
        }
    }

    // แสดงวันที่อนุมัติ (ถ้ามี)
    const approvedAtHtml = l.approved_at ? `<div class="text-xs text-slate-500 mt-1">อนุมัติเมื่อ: ${fmtDateTime(l.approved_at)}</div>` : '';

    document.getElementById('viewLeaveContent').innerHTML = `
        <div class="space-y-4">
            <div class="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                    <p class="text-lg font-black text-slate-800">${fullName}</p>
                    <p class="text-sm text-slate-500">${l.core_personnel.department || ''} ${l.core_personnel.position || ''}</p>
                    ${approvedAtHtml}
                </div>
                ${statusBadge}
            </div>
            <!-- ... (ส่วนอื่นๆ เหมือนเดิม) ... -->
            <div class="border border-slate-200 rounded-xl p-3">
                <p class="text-xs font-bold text-slate-500 mb-2"><i class="fas fa-signature mr-1 text-indigo-400"></i>สถานะการรับทราบ</p>
                ${buildAckRow('<i class="fas fa-user-tie text-slate-400 mr-1.5"></i>แอดมิน', 'ack_admin')}
                ${buildAckRow('<i class="fas fa-user-shield text-slate-400 mr-1.5"></i>รองผู้อำนวยการ', 'ack_deputy')}
                ${buildAckRow('<i class="fas fa-crown text-slate-400 mr-1.5"></i>ผู้อำนวยการ', 'ack_director')}
            </div>
            ${actionButtons ? `<div class="flex flex-wrap gap-2 pt-2">${actionButtons}</div>` : ''}
        </div>
    `;
    document.getElementById('viewLeaveModal').classList.remove('hidden');
    document.getElementById('viewLeaveModal').classList.add('flex');
}

function closeViewModal() {
    document.getElementById('viewLeaveModal').classList.add('hidden');
    document.getElementById('viewLeaveModal').classList.remove('flex');
}

// ==========================================
// รับทราบใบลา
// ==========================================
async function acknowledgeLeave(id, field) {
    const allowedFields = { admin: 'ack_admin', deputy: 'ack_deputy', director: 'ack_director' };
    if (!Object.values(allowedFields).includes(field)) return;

    const { data: leave, error: fetchError } = await db.from('leave_requests')
        .select('ack_admin, ack_deputy, ack_director, status')
        .eq('id', id)
        .single();
    if (fetchError) {
        Swal.fire('ผิดพลาด', fetchError.message, 'error');
        return;
    }

    // super_admin สามารถรับทราบแทนได้ทุกตำแหน่งโดยไม่ต้องรอลำดับ
    const isSuperAdminAck = currentUserRole === 'super_admin';

    if (!isSuperAdminAck && field === 'ack_deputy' && !leave.ack_admin) {
        Swal.fire({
            icon: 'warning',
            title: 'ไม่สามารถรับทราบได้',
            text: 'กรุณารอให้แอดมินรับทราบก่อน แล้วจึงค่อยกดรับทราบ',
            confirmButtonText: 'ตกลง'
        });
        return;
    }

    if (!isSuperAdminAck && field === 'ack_director' && !leave.ack_admin) {
        Swal.fire({
            icon: 'warning',
            title: 'ไม่สามารถรับทราบได้',
            text: 'กรุณารอให้แอดมินรับทราบก่อน',
            confirmButtonText: 'ตกลง'
        });
        return;
    }

    // ✅ บันทึกเวลาปัจจุบัน
    const now = new Date().toISOString();
    let updateData = { updated_at: now };
    updateData[field] = true;
    updateData[field + '_at'] = now;

    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    const { error } = await db.from('leave_requests')
        .update(updateData)
        .eq('id', id);

    if (error) {
        Swal.fire('ผิดพลาด', error.message, 'error');
    } else {
        const labelMap = { ack_admin: 'แอดมิน', ack_deputy: 'รองผู้อำนวยการ', ack_director: 'ผู้อำนวยการ' };
        await logUserAction(`รับทราบใบลา ID: ${id} (${labelMap[field]})`, 'leave');
        Swal.mixin({ toast: true, position: 'bottom-end', showConfirmButton: false, timer: 1500 })
            .fire({ icon: 'success', title: `บันทึกการรับทราบเรียบร้อย` });
        await loadDashboardStats();
    }
}

// ==========================================
// ฟังก์ชันส่งออก Excel
// ==========================================
function exportLeaveReport() {
    if (allLeavesData.length === 0) return Swal.fire('แจ้งเตือน', 'ไม่มีข้อมูลให้ส่งออก', 'info');
    const fmt = (iso) => { if (!iso) return '-'; const p = iso.split('-'); return `${p[2]}/${p[1]}/${parseInt(p[0]) + 543}`; };
    const exportData = allLeavesData.map(l => ({
        'วันที่ส่งใบลา': new Date(l.created_at).toLocaleDateString('th-TH'),
        'ชื่อ-สกุล': `${l.core_personnel.prefix || ''}${l.core_personnel.first_name} ${l.core_personnel.last_name}`,
        'ปีงบประมาณ': l.fiscal_year, 'รอบประเมิน': l.eval_round, 'ประเภทการลา': l.type,
        'เริ่มวันที่': fmt(l.start_date), 'ถึงวันที่': fmt(l.end_date),
        'จำนวน (วัน)': l.status === 'ไม่อนุมัติ' ? 0 : l.total_days,
        'จำนวน (ครั้ง)': l.status === 'ไม่อนุมัติ' ? 0 : 1,
        'สาเหตุ': l.reason, 'สถานะ': l.status, 'หมายเหตุ (ถ้าไม่อนุมัติ)': l.reject_comment || ''
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = [{ wch: 15 }, { wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 35 }, { wch: 15 }, { wch: 30 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "สรุปการลา");
    XLSX.writeFile(wb, `สรุปการลา_ปีงบประมาณ_${systemSettings.fiscal_year}_รอบ${systemSettings.eval_round}.xlsx`);
    logUserAction(`ส่งออกสรุปการลา (Excel)`, 'leave');
}

async function exportLeaveSummaryReport() {
    try {
        Swal.fire({ title: 'กำลังสร้างรายงาน...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

        let personnel = allPersonnelData.filter(p => {
            const pos = p.position || '';
            if (pos === 'ผู้อำนวยการสถานศึกษา') return false;
            if (pos.includes('พนักงานราชการ')) return false;
            if (pos.includes('ครูอัตราจ้าง')) return false;
            return true;
        });

        const { data: leaves, error: leavesErr } = await db.from('leave_requests')
            .select('personnel_id, type, total_days')
            .eq('fiscal_year', systemSettings.fiscal_year)
            .eq('eval_round', systemSettings.eval_round)
            .eq('status', 'อนุมัติ'); // 🔁 เปลี่ยนจาก .neq('status', 'ไม่อนุมัติ')
        if (leavesErr) throw leavesErr;

        const { data: attendances, error: attErr } = await db.from('personnel_attendance')
            .select('personnel_id, record_type')
            .eq('fiscal_year', systemSettings.fiscal_year)
            .eq('eval_round', systemSettings.eval_round);
        if (attErr) throw attErr;

        const stats = new Map();
        personnel.forEach(p => {
            stats.set(p.id, {
                lateCount: 0,
                personalCount: 0, personalDays: 0,
                sickCount: 0, sickDays: 0
            });
        });

        for (const l of leaves) {
            const s = stats.get(l.personnel_id);
            if (s) {
                if (l.type === 'ลากิจส่วนตัว') {
                    s.personalCount++;
                    s.personalDays += l.total_days;
                } else if (l.type === 'ลาป่วย') {
                    s.sickCount++;
                    s.sickDays += l.total_days;
                }
            }
        }
        for (const a of attendances) {
            if (a.record_type === 'มาสาย') {
                const s = stats.get(a.personnel_id);
                if (s) s.lateCount++;
            }
        }

        const reportData = [];
        for (const p of personnel) {
            const s = stats.get(p.id) || { lateCount: 0, personalCount: 0, personalDays: 0, sickCount: 0, sickDays: 0 };
            reportData.push({
                fullName: `${p.prefix || ''}${p.first_name} ${p.last_name}`,
                position: p.position || '',
                rank: p.academic_standing || '',
                department: p.department || '',
                lateCount: s.lateCount,
                personalCount: s.personalCount,
                personalDays: s.personalDays,
                sickCount: s.sickCount,
                sickDays: s.sickDays
            });
        }

        const departmentOrder = [
            'ภาษาไทย', 'คณิตศาสตร์',
            'วิทยาศาสตร์และเทคโนโลยี (วิทยาศาสตร์)',
            'วิทยาศาสตร์และเทคโนโลยี (เทคโนโลยี)',
            'สังคมศึกษา ศาสนาและวัฒนธรรม',
            'สุขศึกษาและพลศึกษา', 'ศิลปะ', 'การงานอาชีพ',
            'ภาษาต่างประเทศ (ภาษาอังกฤษ)', 'ภาษาต่างประเทศ (ภาษาจีน)', 'แนะแนว'
        ];
        function getDeptOrder(dept) {
            const idx = departmentOrder.indexOf(dept);
            return idx === -1 ? 999 : idx;
        }

        reportData.sort((a, b) => {
            const aIsVice = a.position.includes('รองผู้อำนวยการ');
            const bIsVice = b.position.includes('รองผู้อำนวยการ');
            if (aIsVice && !bIsVice) return -1;
            if (!aIsVice && bIsVice) return 1;
            if (aIsVice && bIsVice) return a.fullName.localeCompare(b.fullName, 'th');
            const deptA = getDeptOrder(a.department);
            const deptB = getDeptOrder(b.department);
            if (deptA !== deptB) return deptA - deptB;
            return a.fullName.localeCompare(b.fullName, 'th');
        });

        const excelRows = reportData.map((item, index) => ({
            'ลำดับที่': index + 1,
            'ชื่อ - สกุล': item.fullName,
            'ตำแหน่ง': item.position,
            'วิทยฐานะ': item.rank,
            'มาสาย (ครั้ง)': item.lateCount,
            'ลากิจ (ครั้ง)': item.personalCount,
            'ลากิจ (วัน)': item.personalDays,
            'ลาป่วย (ครั้ง)': item.sickCount,
            'ลาป่วย (วัน)': item.sickDays,
            'รวม (ครั้ง)': item.personalCount + item.sickCount,
            'รวม (วัน)': item.personalDays + item.sickDays
        }));

        if (excelRows.length === 0) {
            Swal.fire('แจ้งเตือน', 'ไม่มีข้อมูลบุคลากรในช่วงนี้', 'info');
            return;
        }

        const ws = XLSX.utils.json_to_sheet(excelRows);
        ws['!cols'] = [
            { wch: 8 }, { wch: 30 }, { wch: 25 }, { wch: 20 },
            { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
            { wch: 12 }, { wch: 12 }
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'สรุปการลา_ตามกลุ่มสาระฯ');
        XLSX.writeFile(wb, `สรุปการลา_${systemSettings.fiscal_year}_รอบ${systemSettings.eval_round}.xlsx`);

        await logUserAction(`ส่งออกรายงานสรุปการลา (Excel)`, 'leave');
        Swal.fire({ icon: 'success', title: 'ส่งออกรายงานสำเร็จ', timer: 1500, showConfirmButton: false });
    } catch (err) {
        console.error(err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

async function exportAttendanceReport() {
    try {
        const { data: attendanceStats, error } = await db.from('personnel_attendance')
            .select('personnel_id, record_type')
            .eq('fiscal_year', systemSettings.fiscal_year)
            .eq('eval_round', systemSettings.eval_round);
        if (error) throw error;

        const counts = {};
        attendanceStats.forEach(att => {
            if (!counts[att.personnel_id]) {
                counts[att.personnel_id] = { late: 0, absent: 0 };
            }
            if (att.record_type === 'มาสาย') {
                counts[att.personnel_id].late++;
            } else if (att.record_type === 'ขาดราชการ') {
                counts[att.personnel_id].absent++;
            }
        });

        const personnelList = allPersonnelData;
        const exportData = personnelList
            .map(p => {
                const c = counts[p.id] || { late: 0, absent: 0 };
                return {
                    'ชื่อ-สกุล': `${p.prefix || ''}${p.first_name} ${p.last_name}`,
                    'มาสาย (ครั้ง)': c.late,
                    'ขาดราชการ (ครั้ง)': c.absent,
                    'รวม': c.late + c.absent
                };
            })
            .filter(item => item['รวม'] > 0);

        if (exportData.length === 0) {
            Swal.fire('แจ้งเตือน', 'ไม่มีข้อมูลการขาด/มาสายในช่วงนี้', 'info');
            return;
        }

        const ws = XLSX.utils.json_to_sheet(exportData);
        ws['!cols'] = [
            { wch: 30 },
            { wch: 15 },
            { wch: 15 },
            { wch: 10 }
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'สรุปการขาด-มาสาย');
        XLSX.writeFile(wb, `สรุปการขาด_มาสาย_${systemSettings.fiscal_year}_รอบ${systemSettings.eval_round}.xlsx`);

        await logUserAction(`ส่งออกสรุปการขาด/มาสาย (Excel)`, 'leave');
        Swal.fire({ icon: 'success', title: 'ส่งออกข้อมูลสำเร็จ', timer: 1500, showConfirmButton: false });
    } catch (err) {
        console.error(err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// นำเข้า Excel (เฉพาะ Super Admin)
// ==========================================
async function importLeaveExcel(event) {
    if (!requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้น')) return;

    const file = event.target.files[0]; if (!file) return; event.target.value = '';
    Swal.fire({ title: 'กำลังนำเข้าข้อมูล...', html: 'กรุณารอสักครู่ ระบบกำลังอ่านไฟล์ Excel', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { raw: false });
            if (rows.length === 0) throw new Error('ไม่พบข้อมูลในไฟล์ Excel');
            let success = 0;
            for (let row of rows) {
                const fullName = row['ชื่อ-สกุล'] ? row['ชื่อ-สกุล'].trim() : '';
                const person = allPersonnelData.find(p => `${p.prefix || ''}${p.first_name} ${p.last_name}` === fullName || `${p.first_name} ${p.last_name}` === fullName);
                if (person) {
                    const parseDate = (d) => { if (!d) return null; const p = d.split('/'); return `${parseInt(p[2]) - 543}-${p[1]}-${p[0]}`; };
                    await db.from('leave_requests').insert({
                        personnel_id: person.id, type: row['ประเภทการลา'] || 'ลาป่วย', start_date: parseDate(row['เริ่มวันที่']), end_date: parseDate(row['ถึงวันที่']),
                        total_days: parseInt(row['จำนวน (วัน)']) || 0, reason: row['สาเหตุ'] || 'นำเข้าจากระบบเก่า',
                        fiscal_year: row['ปีงบประมาณ'] || systemSettings.fiscal_year, eval_round: row['รอบประเมิน'] || systemSettings.eval_round,
                        status: row['สถานะ'] || 'อนุมัติ', reject_comment: row['หมายเหตุ (ถ้าไม่อนุมัติ)'] || null
                    });
                    success++;
                }
            }
            await logUserAction(`นำเข้า Excel: ${success} รายการ`, 'leave');
            await loadDashboardStats();
            Swal.fire('สำเร็จ', `นำเข้าข้อมูลการลา ${success} รายการเรียบร้อยแล้ว`, 'success');
        } catch (err) { Swal.fire('ผิดพลาด', err.message, 'error'); }
    };
    reader.readAsArrayBuffer(file);
}

// ==========================================
// ระบบบันทึกขาด/มาสาย (ใช้ requireAdmin)
// ==========================================
function initAttendanceFlatpickr() {
    flatpickr(".att-datepicker", { locale: "th", dateFormat: "Y-m-d", altInput: true, altFormat: "j F Y" });
}

async function loadAttendanceTable() {
    try {
        const { data, error } = await db.from('personnel_attendance')
            .select('*, core_personnel(prefix, first_name, last_name, department)')
            .eq('fiscal_year', systemSettings.fiscal_year)
            .eq('eval_round', systemSettings.eval_round)
            .order('record_date', { ascending: false });
        if (error) throw error;
        allAttendanceData = data || [];
        renderAttendanceTable();
    } catch (err) {
        console.error('Error loading attendance:', err);
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถโหลดข้อมูลการขาด/มาสายได้', 'error');
    }
}
function renderAttendanceTable() {
    if ($.fn.DataTable.isDataTable('#attendanceTable')) $('#attendanceTable').DataTable().destroy();
    const tbody = document.getElementById('tb-attendance');
    const fmtDate = (iso) => { if (!iso) return '-'; const p = iso.split('-'); return `${p[2]}/${p[1]}/${parseInt(p[0]) + 543}`; };
    if (allAttendanceData.length > 0) {
        tbody.innerHTML = allAttendanceData.map(a => {
            const fullName = `${a.core_personnel?.prefix || ''}${a.core_personnel?.first_name} ${a.core_personnel?.last_name}`;
            const dept = a.core_personnel?.department || '-';
            const typeClass = a.record_type === 'มาสาย' ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-red-100 text-red-700 border-red-200';
            const typeBadge = `<span class="px-3 py-1 rounded-full text-xs font-bold border ${typeClass}">${a.record_type}</span>`;
            return `<tr class="hover:bg-slate-50">
                <td class="text-center">${fmtDate(a.record_date)}</td>
                <td class="font-bold text-slate-700">${fullName}</td>
                <td class="text-slate-600 text-sm">${dept}</td>
                <td class="text-center">${typeBadge}</td>
                <td class="text-slate-500 text-sm truncate max-w-[200px]">${a.reason || '-'}</td>
                <td class="text-center whitespace-nowrap">
                    <button onclick="openAttendanceModal('edit', '${a.id}')" class="bg-amber-50 text-amber-600 hover:bg-amber-500 hover:text-white px-2 py-1.5 rounded-lg transition shadow-sm mr-1" title="แก้ไข"><i class="fas fa-edit"></i></button>
                    <button onclick="deleteAttendance('${a.id}')" class="text-slate-300 hover:text-rose-600 transition p-1.5" title="ลบ"><i class="fas fa-trash-alt"></i></button>
                </td>
            </tr>`;
        }).join('');
    } else tbody.innerHTML = '';
    attendanceDataTable = $('#attendanceTable').DataTable({
        responsive: true, language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
        order: [[0, 'desc']], columnDefs: [{ orderable: false, targets: [5] }]
    });
}

function openAttendanceModal(mode, id = null) {
    if (!requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้น')) return;

    $('#attendanceForm')[0].reset();
    $('#att_id').val('');
    $('#att_department').val('');

    const optionsHtml = $('#filter-personnel').html();
    const attEl = document.getElementById('att_personnel_id');
    if (attEl.tomselect) attEl.tomselect.destroy();
    attEl.innerHTML = optionsHtml;
    new TomSelect(attEl, {
        create: false,
        placeholder: '-- ค้นหาและเลือกรายชื่อ --',
        dropdownParent: 'body',
        onChange: function (value) {
            const person = allPersonnelData.find(p => p.id === value);
            $('#att_department').val(person?.department || 'ไม่ระบุ/ไม่มีกลุ่มสาระฯ');
        }
    });
    attEl.tomselect.clear(true);

    const recordDateInput = document.querySelector("#att_record_date");
    if (!recordDateInput._flatpickr) {
        flatpickr("#att_record_date", {
            locale: "th",
            dateFormat: "Y-m-d",
            altInput: true,
            altFormat: "j F Y"
        });
    }

    if (mode === 'add') {
        $('#att_modal_title').html('<i class="fas fa-plus-circle mr-2"></i>เพิ่มรายการ ขาด/มาสาย');
        if (recordDateInput._flatpickr) {
            recordDateInput._flatpickr.setDate(new Date());
        } else {
            document.querySelector("#att_record_date").value = new Date().toISOString().split('T')[0];
        }
    } else if (mode === 'edit') {
        $('#att_modal_title').html('<i class="fas fa-edit mr-2"></i>แก้ไขรายการ');
        const record = allAttendanceData.find(r => r.id === id);
        if (record) {
            $('#att_id').val(record.id);
            attEl.tomselect.setValue(record.personnel_id);
            if (recordDateInput._flatpickr) {
                recordDateInput._flatpickr.setDate(record.record_date);
            } else {
                document.querySelector("#att_record_date").value = record.record_date;
            }
            $('#att_record_type').val(record.record_type);
            $('#att_reason').val(record.reason);
        }
    }
    $('#attendanceModal').removeClass('hidden');
}

function closeAttendanceModal() { $('#attendanceModal').addClass('hidden'); }
$('#attendanceForm').on('submit', async function (e) {
    e.preventDefault();
    if (!requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้น')) return;

    const id = $('#att_id').val();
    const payload = {
        personnel_id: $('#att_personnel_id').val(),
        record_date: $('#att_record_date').val(),
        record_type: $('#att_record_type').val(),
        reason: $('#att_reason').val(),
        fiscal_year: systemSettings.fiscal_year,
        eval_round: systemSettings.eval_round
    };
    if (!payload.personnel_id) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกบุคลากร', 'warning');
    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    let dbError;
    if (id) {
        payload.updated_at = new Date().toISOString();
        const { error } = await db.from('personnel_attendance').update(payload).eq('id', id);
        dbError = error;
    } else {
        const { error } = await db.from('personnel_attendance').insert([payload]);
        dbError = error;
    }
    if (dbError) Swal.fire('ข้อผิดพลาด', dbError.message, 'error');
    else {
        await logUserAction(`${id ? 'แก้ไข' : 'เพิ่ม'}รายการขาด/มาสาย (${payload.record_type})`, 'leave');
        closeAttendanceModal();
        Swal.fire({ title: 'บันทึกสำเร็จ', icon: 'success', timer: 1500, showConfirmButton: false });
        await loadAttendanceTable();
    }
});
async function deleteAttendance(id) {
    if (!requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้น')) return;

    const { isConfirmed } = await Swal.fire({ title: 'ยืนยันการลบ?', text: 'คุณต้องการลบรายการนี้ใช่หรือไม่?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'ใช่, ลบเลย!' });
    if (isConfirmed) {
        Swal.fire({ title: 'กำลังลบ...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
        const { error } = await db.from('personnel_attendance').delete().eq('id', id);
        if (error) Swal.fire('ผิดพลาด', error.message, 'error');
        else {
            await logUserAction(`ลบรายการขาด/มาสาย ID: ${id}`, 'leave');
            Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1500, showConfirmButton: false });
            await loadAttendanceTable();
        }
    }
}

// ==========================================
// สร้างใบลา (Admin)
// ==========================================
function initAdminFlatpickr() {
    const config = {
        locale: 'th', dateFormat: 'd/m/Y',
        onChange: function (selectedDates, dateStr, instance) {
            if (selectedDates[0]) {
                const id = instance.element.id;
                const d = selectedDates[0];
                $(`#${id}_iso`).val(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
                instance.element.value = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}`;
            }
            adminCalculateDays();
        },
        onReady: (_, __, inst) => { const yearEl = inst.calendarContainer?.querySelector('.cur-year'); if (yearEl && parseInt(yearEl.value) < 2400) yearEl.value = parseInt(yearEl.value) + 543; },
        onMonthChange: (_, __, inst) => { const yearEl = inst.calendarContainer?.querySelector('.cur-year'); if (yearEl && parseInt(yearEl.value) < 2400) yearEl.value = parseInt(yearEl.value) + 543; },
        onYearChange: (_, __, inst) => { const yearEl = inst.calendarContainer?.querySelector('.cur-year'); if (yearEl && parseInt(yearEl.value) < 2400) yearEl.value = parseInt(yearEl.value) + 543; }
    };
    flatpickr("#admin_start_date", config);
    flatpickr("#admin_end_date", config);
}

function adminCalculateDays() {
    const startIso = $('#admin_start_date_iso').val();
    const endIso = $('#admin_end_date_iso').val();
    const type = $('#admin_leave_type').val();
    const days = window.calculateDaysByType(startIso, endIso, type);
    $('#admin_calc_days').text(days);
}

function adminUpdateLeaveGuide() {
    const type = $('#admin_leave_type').val();
    const guideBox = $('#admin_leave_guide');

    const personnelId = $('#admin_personnel_id').val();
    const personnel = allPersonnelData.find(p => p.id === personnelId);
    const prefix = personnel?.prefix || '';
    const gender = window.getGenderFromPrefix(prefix);

    const resetLeaveType = () => {
        $('#admin_leave_type').val('');
        guideBox.addClass('hidden');
        adminCalculateDays();
    };

    if (type === 'ลาคลอดบุตร' && gender !== 'หญิง') {
        Swal.fire({
            icon: 'error',
            title: 'ไม่สามารถเลือกลาคลอดบุตรได้',
            text: 'บุคลากรท่านนี้เป็นเพศชาย ไม่มีสิทธิ์ลาคลอดบุตร',
            confirmButtonText: 'ตกลง'
        }).then(() => resetLeaveType());
        return;
    }

    if (type === 'ลาไปช่วยเหลือภริยาที่คลอดบุตร' && gender !== 'ชาย') {
        Swal.fire({
            icon: 'error',
            title: 'ไม่สามารถเลือกลาไปช่วยเหลือภริยาได้',
            text: 'บุคลากรท่านนี้เป็นเพศหญิง ไม่มีสิทธิ์ลาไปช่วยเหลือภริยาที่คลอดบุตร',
            confirmButtonText: 'ตกลง'
        }).then(() => resetLeaveType());
        return;
    }

    if (type === 'ลาพักผ่อน') {
        Swal.fire({
            icon: 'warning',
            title: 'ไม่สามารถเลือกลาพักผ่อนได้',
            text: 'ผู้ปฏิบัติงานในสถานศึกษาและได้หยุดราชการตามวันหยุดภาคการศึกษาเกินกว่าวันลาพักผ่อน (ปิดเทอม) ไม่มีสิทธิ์ลาพักผ่อน',
            confirmButtonText: 'ตกลง'
        }).then(() => resetLeaveType());
        return;
    }

    const guides = {
        "ลาป่วย": "<i class='fas fa-info-circle'></i> ลาป่วยตั้งแต่ 3 วันทำการขึ้นไป ให้แนบใบรับรองแพทย์",
        "ลากิจส่วนตัว": "<i class='fas fa-info-circle'></i> ต้องส่งใบอนุญาตล่วงหน้าก่อนวันลาอย่างน้อย 3 วันทำการ",
        "ลาคลอดบุตร": "<i class='fas fa-info-circle'></i> ลาคลอดบุตรได้ 90 วัน (นับรวมวันหยุดราชการ)",
        "ลาไปช่วยเหลือภริยาที่คลอดบุตร": "<i class='fas fa-info-circle'></i> ลาได้ครั้งหนึ่งติดต่อกันไม่เกิน 15 วันทำการ"
    };
    if (guides[type]) guideBox.html(guides[type]).removeClass('hidden');
    else guideBox.addClass('hidden');
    adminCalculateDays();
}

async function openAdminLeaveModal() {
    // Module admin (แอดมินประจำโมดูล) สามารถเขียนใบลาแทนบุคลากรได้
    if (!isModuleAdmin && !requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้น')) return;

    const selectEl = document.getElementById('admin_personnel_id');
    if (selectEl.tomselect) selectEl.tomselect.destroy();
    let options = '<option value="">-- เลือกบุคลากร --</option>';
    allPersonnelData.forEach(p => {
        options += `<option value="${p.id}">${p.prefix || ''}${p.first_name} ${p.last_name}</option>`;
    });
    selectEl.innerHTML = options;
    new TomSelect(selectEl, { create: false, placeholder: 'ค้นหาชื่อบุคลากร', dropdownParent: 'body' });
    $('#adminLeaveForm')[0].reset();
    $('#admin_leave_id').val('');
    $('#admin_start_date_iso, #admin_end_date_iso').val('');
    $('#admin_calc_days').text('0');
    $('#admin_leave_guide').addClass('hidden');
    if (typeof adminFlatpickrInstance !== 'undefined' && adminFlatpickrInstance) adminFlatpickrInstance.destroy();
    initAdminFlatpickr();
    $('#adminLeaveModal').removeClass('hidden').addClass('flex');
}
function closeAdminLeaveModal() {
    $('#adminLeaveModal').addClass('hidden').removeClass('flex');
}
async function saveLeaveForAdmin(e) {
    e.preventDefault();
    // Module admin (แอดมินประจำโมดูล) สามารถบันทึกใบลาแทนบุคลากรทุกคนได้
    if (!isModuleAdmin && !requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้น')) return;

    const personnelId = $('#admin_personnel_id').val();
    if (!personnelId) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกบุคลากร', 'warning');
    const type = $('#admin_leave_type').val();
    const reason = $('#admin_reason').val().trim();
    const startDate = $('#admin_start_date_iso').val();
    const endDate = $('#admin_end_date_iso').val();
    const totalDays = parseInt($('#admin_calc_days').text());
    const contactAddress = $('#admin_contact_address').val().trim();
    const phoneNumber = $('#admin_phone_number').val().trim();
    if (!type) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกประเภทการลา', 'warning');
    if (totalDays <= 0) return Swal.fire('ข้อมูลไม่ถูกต้อง', 'จำนวนวันลาต้องมากกว่า 0 วัน', 'warning');
    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    const payload = {
        personnel_id: personnelId, type, reason, start_date: startDate, end_date: endDate, total_days: totalDays,
        contact_address: contactAddress, phone_number: phoneNumber,
        fiscal_year: systemSettings.fiscal_year, eval_round: systemSettings.eval_round,
        status: 'รออนุมัติ', reject_comment: null
    };
    try {
        const { error } = await db.from('leave_requests').insert([payload]);
        if (error) throw error;
        await logUserAction(`บันทึกใบลาให้ ${personnelId} (${type})`, 'leave');
        closeAdminLeaveModal();
        Swal.fire({ icon: 'success', title: 'บันทึกใบลาเรียบร้อย', text: 'ใบลาอยู่ในสถานะรออนุมัติ', timer: 1500, showConfirmButton: false });
        await loadDashboardStats();
    } catch (err) { Swal.fire('ผิดพลาด', err.message, 'error'); }
}

// ======================== จัดการลายเซ็นบุคลากร (พร้อมอัปโหลดไฟล์) ========================

async function openSignatureModal() {
    if (!requireAdmin(currentUserRole, isAdminMode, 'เฉพาะ Super Admin เท่านั้น')) return;
    if (!systemSettings.signature_folder_id) {
        Swal.fire('ยังไม่ได้ตั้งค่า', 'กรุณากำหนดโฟลเดอร์ลายเซ็นใน "ตั้งค่าระบบ" ก่อน', 'warning');
        return;
    }
    if (!systemSettings.gas_url) {
        Swal.fire('ยังไม่ได้ตั้งค่า', 'กรุณากำหนด GAS URL ใน "ตั้งค่าระบบ" ก่อน', 'warning');
        return;
    }
    $('#signatureModal').removeClass('hidden').addClass('flex');
    document.getElementById('sig-folder-id-display-modal').textContent = systemSettings.signature_folder_id;
    await loadSignatureList();
}

function closeSignatureModal() {
    $('#signatureModal').addClass('hidden').removeClass('flex');
}

async function loadSignatureList() {
    const { data: personnel, error } = await db.from('core_personnel')
        .select('id, prefix, first_name, last_name, position, department, signature_file_id')
        .order('first_name');
    if (error) { console.error(error); return; }

    const tbody = document.getElementById('signature-tbody');
    if (!tbody) return;

    // ถ้ามี DataTable อยู่แล้ว ให้ทำลายทิ้ง
    if ($.fn.DataTable.isDataTable('#signatureTable')) {
        $('#signatureTable').DataTable().destroy();
    }

    // สร้าง HTML rows
    tbody.innerHTML = personnel.map(p => {
        const name = `${p.prefix || ''}${p.first_name} ${p.last_name}`;
        const hasSig = !!p.signature_file_id;
        const fileId = p.signature_file_id || '';

        return `<tr class="border-b border-slate-100">
            <td class="p-2 font-medium">${name}</td>
            <td class="p-2 text-slate-600">${p.position || '-'}</td>
            <td class="p-2 text-slate-600">${p.department || '-'}</td>
            <td class="p-2 text-center">
                ${hasSig
                ? `<span class="text-emerald-600 font-bold"><i class="fas fa-check-circle"></i> มีลายเซ็น</span>`
                : `<span class="text-slate-400"><i class="fas fa-times-circle"></i> ไม่มี</span>`
            }
            </td>
            <td class="p-2 text-center">
                <div class="flex items-center justify-center gap-2 flex-wrap">
                    ${hasSig
                ? `<button onclick="viewSignatureImage('${fileId}', \`${name}\`)" class="btn-icon bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white" title="ดูลายเซ็น"><i class="fas fa-eye"></i></button>`
                : `<button class="btn-icon bg-slate-100 text-slate-300 cursor-not-allowed" title="ยังไม่มีลายเซ็น" disabled><i class="fas fa-eye"></i></button>`
            }
                    <label class="cursor-pointer bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow transition flex items-center gap-1">
                        <i class="fas fa-upload"></i> อัปโหลด
                        <input type="file" accept="image/*" class="hidden" onchange="uploadSignature('${p.id}', this)">
                    </label>
                    ${hasSig
                ? `<button onclick="removeSignature('${p.id}')" class="bg-rose-500 hover:bg-rose-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow transition flex items-center gap-1">
                            <i class="fas fa-trash"></i> ลบ
                        </button>`
                : ''
            }
                </div>
            </td>
        </tr>`;
    }).join('');

    // สร้าง DataTable ใหม่
    $('#signatureTable').DataTable({
        responsive: true,
        scrollX: false,
        language: {
            url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json'
        },
        pageLength: 10,
        order: [[0, 'asc']],
        columnDefs: [
            { orderable: false, targets: [3, 4] } // ลายเซ็น และ จัดการ
        ]
    });
}

async function uploadSignature(personnelId, fileInput) {
    const file = fileInput.files[0];
    if (!file) return;

    // ตรวจสอบขนาดไฟล์ (ไม่เกิน 2MB)
    if (file.size > 2 * 1024 * 1024) {
        Swal.fire('ไฟล์ใหญ่เกินไป', 'กรุณาอัปโหลดไฟล์ขนาดไม่เกิน 2MB', 'warning');
        fileInput.value = '';
        return;
    }

    // ตรวจสอบประเภทไฟล์
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
        Swal.fire('ไฟล์ไม่ถูกต้อง', 'กรุณาอัปโหลดไฟล์รูปภาพ .png, .jpg, .jpeg เท่านั้น', 'warning');
        fileInput.value = '';
        return;
    }

    Swal.fire({
        title: 'กำลังอัปโหลด...',
        text: 'กรุณารอสักครู่ ระบบกำลังอัปโหลดไฟล์',
        didOpen: () => Swal.showLoading(),
        allowOutsideClick: false,
        showConfirmButton: false
    });

    try {
        // อ่านไฟล์เป็น Base64
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async function () {
            const base64 = reader.result.split(',')[1]; // ตัด part "data:image/...;base64,"

            // เรียก GAS เพื่ออัปโหลดไฟล์
            const payload = {
                action: 'upload',
                folderId: systemSettings.signature_folder_id,
                fileName: `signature_${personnelId}_${Date.now()}.${file.name.split('.').pop()}`,
                base64: base64,
                mimeType: file.type
            };

            const response = await fetch(systemSettings.gas_url, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (result.status === 'success' && result.fileId) {
                // บันทึก fileId ลงฐานข้อมูล
                const { error } = await db.from('core_personnel')
                    .update({ signature_file_id: result.fileId })
                    .eq('id', personnelId);

                if (error) throw error;

                Swal.fire({ icon: 'success', title: 'อัปโหลดสำเร็จ', timer: 1500, showConfirmButton: false });
                fileInput.value = '';
                await loadSignatureList();
            } else {
                throw new Error(result.message || 'อัปโหลดไม่สำเร็จ');
            }
        };
        reader.onerror = function () {
            throw new Error('ไม่สามารถอ่านไฟล์ได้');
        };
    } catch (err) {
        console.error('Upload error:', err);
        Swal.fire('ผิดพลาด', err.message || 'เกิดข้อผิดพลาดในการอัปโหลด', 'error');
        fileInput.value = '';
    }
}

async function removeSignature(personnelId) {
    // ดึงข้อมูลบุคลากรเพื่อทราบ fileId ที่จะลบ
    const { data: personnel, error } = await db.from('core_personnel')
        .select('signature_file_id')
        .eq('id', personnelId)
        .single();
    if (error) {
        Swal.fire('ผิดพลาด', error.message, 'error');
        return;
    }

    const fileIdToDelete = personnel?.signature_file_id;
    if (!fileIdToDelete) {
        Swal.fire('ไม่พบไฟล์', 'บุคลากรนี้ไม่มีไฟล์ลายเซ็นในระบบ', 'info');
        return;
    }

    const { isConfirmed } = await Swal.fire({
        title: 'ลบลายเซ็น?',
        text: 'คุณต้องการลบไฟล์ลายเซ็นของบุคลากรนี้ใช่หรือไม่ (ไฟล์ใน Drive จะถูกลบ)',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'ลบ'
    });
    if (!isConfirmed) return;

    Swal.fire({
        title: 'กำลังลบ...',
        didOpen: () => Swal.showLoading(),
        allowOutsideClick: false,
        showConfirmButton: false
    });

    try {
        // ลบไฟล์ใน Drive ผ่าน GAS (สร้าง endpoint เพิ่ม)
        const payload = {
            action: 'delete_file',
            fileId: fileIdToDelete
        };

        const response = await fetch(systemSettings.gas_url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (result.status !== 'success') {
            // ถ้าลบไฟล์ไม่สำเร็จ (ไฟล์ถูกลบไปแล้ว) ให้ทำต่อ
            console.warn('ไม่สามารถลบไฟล์ใน Drive ได้:', result.message);
        }

        // ลบ record ในฐานข้อมูล
        const { error: dbError } = await db.from('core_personnel')
            .update({ signature_file_id: null })
            .eq('id', personnelId);

        if (dbError) throw dbError;

        Swal.fire({ icon: 'success', title: 'ลบลายเซ็นแล้ว', timer: 1500, showConfirmButton: false });
        await loadSignatureList();
    } catch (err) {
        console.error('Delete error:', err);
        Swal.fire('ผิดพลาด', err.message || 'เกิดข้อผิดพลาดในการลบ', 'error');
    }
}

async function refreshSignatureList() {
    await loadSignatureList();
}

function viewSignatureImage(fileId, name) {
    if (!fileId) return;
    const imgUrl = `https://lh5.googleusercontent.com/d/${fileId}`;
    const modal = document.getElementById('viewSignatureImageModal');
    document.getElementById('sig-view-name').textContent = name;
    const img = document.getElementById('sig-view-img');
    const errEl = document.getElementById('sig-view-error');
    img.style.display = '';
    errEl.classList.add('hidden');
    img.src = imgUrl;
    img.onerror = () => {
        img.style.display = 'none';
        errEl.classList.remove('hidden');
    };
    document.getElementById('sig-view-link').href = imgUrl;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeViewSignatureImageModal() {
    const modal = document.getElementById('viewSignatureImageModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.getElementById('sig-view-img').src = '';
}

async function exportSignatureExcel() {
    const { data: personnel, error } = await db.from('core_personnel')
        .select('prefix, first_name, last_name, position, department, signature_file_id')
        .order('first_name');

    if (error || !personnel || !personnel.length) {
        Swal.fire('ไม่มีข้อมูล', 'ไม่สามารถดึงข้อมูลบุคลากรได้', 'warning');
        return;
    }

    // โหลด SheetJS จาก CDN แบบ lazy
    if (typeof XLSX === 'undefined') {
        await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    const rows = personnel.map(p => {
        const hasSig = !!p.signature_file_id;
        const sigUrl = p.signature_file_id
            ? `https://lh5.googleusercontent.com/d/${p.signature_file_id}`
            : '';
        return {
            'ชื่อ-สกุล': `${p.prefix || ''}${p.first_name} ${p.last_name}`,
            'ตำแหน่ง': p.position || '-',
            'กลุ่มงาน': p.department || '-',
            'ลายเซ็น': hasSig ? 'มีลายเซ็น' : 'ไม่มี',
            'URL รูปลายเซ็น': sigUrl
        };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
        { wch: 30 }, // ชื่อ-สกุล
        { wch: 28 }, // ตำแหน่ง
        { wch: 28 }, // กลุ่มงาน
        { wch: 12 }, // ลายเซ็น
        { wch: 60 }  // URL
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ลายเซ็นบุคลากร');

    const today = new Date().toLocaleDateString('th-TH', {
        year: 'numeric', month: '2-digit', day: '2-digit'
    }).replace(/\//g, '-');
    XLSX.writeFile(wb, `ลายเซ็นบุคลากร_${today}.xlsx`);
}

// ==========================================
// ประกาศฟังก์ชัน global
// ==========================================
window.switchTab = switchTab;
window.viewLeave = viewLeave;
window.closeViewModal = closeViewModal;
window.acknowledgeLeave = acknowledgeLeave;
window.loadDashboardStats = loadDashboardStats;
window.filterTableByPerson = filterTableByPerson;
window.editLeave = editLeave;
window.closeEditModal = closeEditModal;
window.updateStatus = updateStatus;
window.rejectLeave = rejectLeave;
window.deleteLeave = deleteLeave;
window.exportLeaveReport = exportLeaveReport;
window.exportLeaveSummaryReport = exportLeaveSummaryReport;
window.exportAttendanceReport = exportAttendanceReport;
window.importLeaveExcel = importLeaveExcel;
window.showRejectComment = showRejectComment;
window.openAttendanceModal = openAttendanceModal;
window.closeAttendanceModal = closeAttendanceModal;
window.deleteAttendance = deleteAttendance;
window.openAdminLeaveModal = openAdminLeaveModal;
window.closeAdminLeaveModal = closeAdminLeaveModal;
window.saveLeaveForAdmin = saveLeaveForAdmin;
window.adminUpdateLeaveGuide = adminUpdateLeaveGuide;
window.adminCalculateDays = adminCalculateDays;
window.addModuleAdmin = addModuleAdmin;
window.removeModuleAdmin = removeModuleAdmin;
window.saveSystemSettings = saveSystemSettings;
window.logout = logout;
window.viewSignatureImage = viewSignatureImage;
window.closeViewSignatureImageModal = closeViewSignatureImageModal;
window.exportSignatureExcel = exportSignatureExcel;

console.log('✅ leave_admin.js loaded with config.js & leave_core.js integration');