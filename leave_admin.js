// ============================================================
// leave_admin.js — ระบบการลา (ฝ่ายบริหาร) ฉบับแก้ไขสมบูรณ์
// - รองรับ submitted_date (วันที่ส่งใบลา) และ approved_date (วันที่อนุมัติ)
// - viewLeave แสดงข้อมูลการลาทั้งหมด + สถานะรับทราบ
// - การอัปโหลดหลักฐาน (evidence) สำหรับลา >= 3 วัน
// - เพิ่มระบบจัดการวันหยุดของโรงเรียน (เฉพาะ Super Admin)
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
// INIT
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
        window.currentUserRole = role;   // ✅ เพิ่มบรรทัดนี้
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

        applyVisibilityByRole(role, isAdminMode, {
            settingsBtn: 'btn-settings'
        });

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
// สลับแท็บ (ปรับปรุงให้โหลดวันหยุดเมื่อเปิด Settings)
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
    // ✅ โหลดส่วนตั้งค่าวันหยุดเมื่อเปิดแท็บ Settings
    if (tabId === 'settings') {
        showHolidaySettingsAdmin();
    }
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
        signature_folder_id: '',
        evidence_folder_id: ''
    };
    $('#fiscal_year').val(systemSettings.fiscal_year);
    $('#evaluation_round').val(systemSettings.eval_round);
    $('#dash-fiscal-badge').text(`ปีงบประมาณ ${systemSettings.fiscal_year} (รอบที่ ${systemSettings.eval_round})`);
    $('#set_gas_url').val(systemSettings.gas_url || '');
    $('#set_slide_template_id').val(systemSettings.slide_template_id || '');
    $('#set_pdf_folder_id').val(systemSettings.pdf_folder_id || '');
    $('#set_signature_folder_id').val(systemSettings.signature_folder_id || '');
    $('#set_evidence_folder_id').val(systemSettings.evidence_folder_id || '');

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
        signature_folder_id: $('#set_signature_folder_id').val().trim(),
        evidence_folder_id: $('#set_evidence_folder_id').val().trim()
    };
    const { error } = await db.from('core_system_modules').update({ settings: newSettings, updated_at: new Date().toISOString() }).eq('module_id', 'leave');
    if (error) {
        Swal.fire('ผิดพลาด', error.message, 'error');
    } else {
        systemSettings = newSettings;
        $('#dash-fiscal-badge').text(`ปีงบประมาณ ${systemSettings.fiscal_year} (รอบที่ ${systemSettings.eval_round})`);

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

    const userIds = admins.map(a => a.user_id);
    const { data: personnel } = await db.from('core_personnel')
        .select('id, prefix, first_name, last_name')
        .in('id', userIds);

    const personnelMap = {};
    (personnel || []).forEach(p => { personnelMap[p.id] = p; });

    tbody.innerHTML = admins.map(admin => {
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

    const approvedLeaves = allLeavesData.filter(l => l.status === 'อนุมัติ');
    const pendingLeaves = allLeavesData.filter(l => l.status === 'รออนุมัติ');

    const approvedSickDays = approvedLeaves.filter(l => l.type === 'ลาป่วย').reduce((sum, l) => sum + l.total_days, 0);
    const approvedPersonalDays = approvedLeaves.filter(l => l.type === 'ลากิจส่วนตัว').reduce((sum, l) => sum + l.total_days, 0);
    const approvedPeople = [...new Set(approvedLeaves.map(l => l.personnel_id))].length;

    const pendingSickDays = pendingLeaves.filter(l => l.type === 'ลาป่วย').reduce((sum, l) => sum + l.total_days, 0);
    const pendingPersonalDays = pendingLeaves.filter(l => l.type === 'ลากิจส่วนตัว').reduce((sum, l) => sum + l.total_days, 0);
    const pendingPeople = [...new Set(pendingLeaves.map(l => l.personnel_id))].length;
    const pendingCount = pendingLeaves.length;

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
            .eq('status', 'อนุมัติ');
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
// ฟังก์ชันแปลงวันที่สำหรับแสดงผล
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
// renderTable()
// ==========================================
function renderTable() {
    if ($.fn.DataTable.isDataTable('#adminLeaveTable')) {
        $('#adminLeaveTable').DataTable().destroy();
    }

    const tbody = document.getElementById('tb-admin-leave');
    const role = currentUserRole;
    const isSuperAdmin = role === 'super_admin';
    const isDirector = role === 'director';
    const isDeputy = role === 'deputy';
    const isAdmin = role === 'admin';

    const canApprove = isSuperAdmin || isDirector;

    let ackField = null;
    if (isAdmin) ackField = 'ack_admin';
    else if (isDeputy) ackField = 'ack_deputy';
    else if (isDirector) ackField = 'ack_director';

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
            const displayDays = isRejected ? 0 : (l.is_half_day ? 0.5 : l.total_days);
            const displayTimes = isRejected ? 0 : 1;

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

            let typeClass = l.type === 'ลาป่วย' ? 'text-blue-600'
                : (l.type === 'ลากิจส่วนตัว' ? 'text-orange-600' : 'text-rose-600');
            if (isRejected) typeClass = 'text-slate-400 line-through';

            let pdfHtml = '';
            if (l.pdf_url) {
                pdfHtml = `
                <a href="${l.pdf_url}" target="_blank" class="btn-icon bg-green-50 text-green-600 hover:bg-green-500 hover:text-white" title="เปิด PDF"><i class="fas fa-file-pdf"></i></a>
                <button onclick="window.generateLeavePDF('${l.id}', systemSettings)" class="btn-icon bg-blue-50 text-blue-600 hover:bg-blue-500 hover:text-white" title="สร้างใหม่ (แทนที่ไฟล์เดิม)"><i class="fas fa-sync-alt"></i></button>
            `;
            } else {
                pdfHtml = `<button onclick="window.generateLeavePDF('${l.id}', systemSettings)" class="btn-icon bg-blue-50 text-blue-600 hover:bg-blue-500 hover:text-white" title="สร้าง PDF"><i class="fas fa-print"></i></button>`;
            }

            const viewBtn = `<button onclick="viewLeave('${l.id}')" class="btn-icon bg-indigo-50 text-indigo-600 hover:bg-indigo-500 hover:text-white" title="ดูรายละเอียด"><i class="fas fa-eye"></i></button>`;

            let ackBtn = '';
            if (isSuperAdmin) {
                const superAckDefs = [
                    { field: 'ack_admin', label: 'รับทราบแทนแอดมิน' },
                    { field: 'ack_deputy', label: 'รับทราบแทนรองผู้อำนวยการ' },
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

            const approveBtn = canApprove
                ? `<button onclick="updateStatus('${l.id}', 'อนุมัติ')" class="btn-icon bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white" title="อนุมัติ"><i class="fas fa-thumbs-up"></i></button>
                   <button onclick="rejectLeave('${l.id}')" class="btn-icon bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white" title="ไม่อนุมัติ"><i class="fas fa-thumbs-down"></i></button>`
                : '';

            const editBtn = `<button onclick="editLeave('${l.id}')" class="btn-icon bg-amber-50 text-amber-600 hover:bg-amber-500 hover:text-white" title="แก้ไขข้อมูล"><i class="fas fa-edit"></i></button>`;

            const canDelete = isSuperAdmin || (l.status !== 'อนุมัติ' && (isModuleAdmin || !isSuperAdmin));
            const deleteBtn = canDelete
                ? `<button onclick="deleteLeave('${l.id}', '${safeFullName}')" class="btn-icon text-slate-300 hover:bg-rose-50 hover:text-rose-600" title="ลบ"><i class="fas fa-trash-alt"></i></button>`
                : '';

            const dateDisplay = formatDateThai(l.created_at);
            const dateOrder = l.created_at || '';

            const resetAckBtn = isSuperAdmin
                ? `<button onclick="resetAllAcknowledge('${l.id}')" class="btn-icon text-amber-600 hover:bg-amber-100 hover:text-amber-700" title="ยกเลิกรับทราบทั้งหมด"><i class="fas fa-undo-alt"></i></button>`
                : '';

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
                        ${resetAckBtn}
                    </div>
                </td>
            </tr>`;
        }).join('');
    } else {
        tbody.innerHTML = '';
    }

    dataTable = $('#adminLeaveTable').DataTable({
        responsive: true,
        scrollX: false,
        language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
        order: [[0, 'desc']],
        columnDefs: [
            { responsivePriority: 1, targets: -1 },
            { orderable: false, targets: [8] }
        ],
        pageLength: 25
    });
}

// ==========================================
// ฟังก์ชันจัดการใบลา
// ==========================================

// ----- แก้ไขใบลา (พร้อม submitted_date) -----
function initEditFlatpickr() {
    flatpickr(".edit-datepicker", {
        locale: "th",
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "j F Y",
        onChange: function () { calculateEditDays(); }
    });
    flatpickr("#edit_submitted_date", {
        locale: "th",
        dateFormat: "Y-m-d",
        altInput: true,
        altFormat: "j F Y"
    });
}

// แทนที่ calculateEditDays
async function calculateEditDays() {
    const start = $('#edit_start_date').val();
    const end = $('#edit_end_date').val();
    const type = $('#edit_leave_type').val();
    const isHalfDay = $('#edit_is_half_day').is(':checked');
    let days;
    if (isHalfDay) {
        days = 0.5;
    } else {
        if (!start || !end) return;
        let startDate = new Date(start), endDate = new Date(end);
        if (endDate < startDate) {
            Swal.fire('วันที่ไม่ถูกต้อง', 'วันสิ้นสุดต้องไม่มาก่อนวันเริ่มลา', 'warning');
            $('#edit_end_date').val('');
            return;
        }
        days = await window.calculateDaysByTypeWithHoliday(start, end, type);
    }
    $('#edit_calc_days').text(days % 1 === 0 ? days : days.toFixed(1));

    const wrapper = document.getElementById('edit_evidence_upload_wrapper');
    const fileInput = document.getElementById('edit_evidence_file');
    if (days >= 3) {
        wrapper.classList.remove('hidden');
        fileInput.setAttribute('required', 'required');
    } else {
        wrapper.classList.add('hidden');
        fileInput.removeAttribute('required');
        fileInput.value = '';
    }
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
    $('#edit_is_half_day').prop('checked', leave.is_half_day || false);
    calculateEditDays();

    const submittedDateInput = document.querySelector("#edit_submitted_date");
    if (submittedDateInput && submittedDateInput._flatpickr) {
        if (leave.submitted_date) {
            submittedDateInput._flatpickr.setDate(leave.submitted_date);
        } else {
            submittedDateInput._flatpickr.clear();
        }
    }

    const wrapper = document.getElementById('edit_evidence_upload_wrapper');
    const fileInput = document.getElementById('edit_evidence_file');
    const existingDiv = document.getElementById('edit_existing_evidence');
    const existingName = document.getElementById('edit_existing_evidence_name');

    const days = parseFloat($('#edit_calc_days').text());
    if (days >= 3) {
        wrapper.classList.remove('hidden');
        fileInput.setAttribute('required', 'required');
        if (leave.attachment_file_id) {
            existingDiv.classList.remove('hidden');
            existingName.textContent = `ไฟล์หลักฐาน ID: ${leave.attachment_file_id}`;
            existingDiv.dataset.fileId = leave.attachment_file_id;
        } else {
            existingDiv.classList.add('hidden');
        }
    } else {
        wrapper.classList.add('hidden');
        fileInput.removeAttribute('required');
        fileInput.value = '';
        existingDiv.classList.add('hidden');
    }

    $('#editLeaveModal').removeClass('hidden');
}

function closeEditModal() { $('#editLeaveModal').addClass('hidden'); $('#editLeaveForm')[0].reset(); }

$('#editLeaveForm').on('submit', async function (e) {
    e.preventDefault();

    if (!isModuleAdmin && !requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้น')) return;

    const id = $('#edit_leave_id').val();
    const days = parseFloat($('#edit_calc_days').text());
    if (isNaN(days) || days <= 0) {
        Swal.fire('ข้อมูลไม่ถูกต้อง', 'จำนวนวันลาต้องมากกว่า 0', 'warning');
        return;
    }

    let attachmentFileId = null;
    const fileInput = document.getElementById('edit_evidence_file');
    const existingDiv = document.getElementById('edit_existing_evidence');
    const existingFileId = existingDiv.dataset.fileId || null;

    if (days >= 3) {
        if (fileInput.files && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            if (file.size > 5 * 1024 * 1024) {
                Swal.fire('ไฟล์ใหญ่เกินไป', 'กรุณาอัปโหลดไฟล์ขนาดไม่เกิน 5MB', 'warning');
                return;
            }
            try {
                attachmentFileId = await window.uploadEvidenceFile(file, systemSettings.evidence_folder_id, systemSettings.gas_url);
            } catch (err) {
                Swal.fire('อัปโหลดไม่สำเร็จ', err.message, 'error');
                return;
            }
        } else if (existingFileId) {
            attachmentFileId = existingFileId;
        } else {
            Swal.fire('แจ้งเตือน', 'กรุณาอัปโหลดไฟล์หลักฐาน (จำเป็นสำหรับการลา 3 วันขึ้นไป)', 'warning');
            return;
        }
    }

    const submittedDateIso = $('#edit_submitted_date').val() || null;
    const isHalfDay = $('#edit_is_half_day').is(':checked');

    const updateData = {
        type: $('#edit_leave_type').val(),
        start_date: $('#edit_start_date').val(),
        end_date: $('#edit_end_date').val(),
        total_days: days,
        reason: $('#edit_reason').val(),
        contact_address: $('#edit_contact_address').val(),
        phone_number: $('#edit_phone_number').val(),
        attachment_file_id: attachmentFileId,
        submitted_date: submittedDateIso,
        is_half_day: isHalfDay,
        pdf_url: null
    };

    // ✅ ดึง personnel_id ของใบลานี้จาก allLeavesData
    const leaveRecord = allLeavesData.find(l => l.id === id);
    if (!leaveRecord) {
        Swal.fire('ผิดพลาด', 'ไม่พบข้อมูลใบลา', 'error');
        return;
    }
    const personnelId = leaveRecord.personnel_id;

    // ตรวจสอบซ้ำ (ข้ามรายการตัวเอง)
    const duplicate = await window.checkDuplicateLeave(
        personnelId,
        $('#edit_leave_type').val(),
        $('#edit_start_date').val(),
        $('#edit_end_date').val(),
        id  // ข้ามตัวเอง
    );

    if (duplicate.exists) {
        const existingName = duplicate.existingLeave?.core_personnel
            ? `${duplicate.existingLeave.core_personnel.prefix || ''}${duplicate.existingLeave.core_personnel.first_name} ${duplicate.existingLeave.core_personnel.last_name}`
            : 'บุคลากร';
        await Swal.fire({
            icon: 'warning',
            title: 'มีใบลาซ้ำ',
            html: `
                <div class="text-left">
                    <p>พบข้อมูลการลานี้แล้วสำหรับ <b>${existingName}</b></p>
                    <p class="text-sm text-slate-600">ประเภท: ${$('#edit_leave_type').val()}</p>
                    <p class="text-sm text-slate-600">วันที่: ${window.formatDateThai($('#edit_start_date').val())} - ${window.formatDateThai($('#edit_end_date').val())}</p>
                    <p class="text-sm text-slate-600">สถานะ: <span class="font-bold">${duplicate.existingLeave.status}</span></p>
                </div>
            `,
            confirmButtonText: 'ตกลง'
        });
        return;
    }

    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    const { error } = await db.from('leave_requests').update(updateData).eq('id', id);
    if (error) {
        Swal.fire('ข้อผิดพลาด', error.message, 'error');
    } else {
        await logUserAction(`แก้ไขใบลา ID: ${id}`, 'leave');
        closeEditModal();
        Swal.fire({ title: 'บันทึกสำเร็จ', text: 'แก้ไขข้อมูลเรียบร้อย', icon: 'success', timer: 1500, showConfirmButton: false });
        await loadDashboardStats();
    }
});

// ----- อนุมัติ/ไม่อนุมัติ (พร้อมระบุวันที่อนุมัติ) -----
async function updateStatus(id, newStatus) {
    if (!isModuleAdmin && !requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้น')) return;

    const { data: leave, error: fetchError } = await db.from('leave_requests')
        .select('ack_admin, ack_deputy, ack_director, status')
        .eq('id', id)
        .single();
    if (fetchError) {
        Swal.fire('ผิดพลาด', fetchError.message, 'error');
        return;
    }

    if (currentUserRole !== 'super_admin' && leave.status === 'รออนุมัติ') {
        if (!leave.ack_admin) {
            Swal.fire({
                icon: 'warning',
                title: 'ไม่สามารถอนุมัติได้',
                text: 'กรุณารอให้แอดมินรับทราบก่อน จึงจะสามารถอนุมัติได้'
            });
            return;
        }
        if (!leave.ack_deputy) {
            Swal.fire({
                icon: 'warning',
                title: 'ไม่สามารถอนุมัติได้',
                text: 'กรุณารอให้รองผู้อำนวยการรับทราบก่อน จึงจะสามารถอนุมัติได้'
            });
            return;
        }
    }

    const now = new Date().toISOString();
    const today = new Date().toLocaleDateString('sv-SE');

    const { value: customApprovedDate } = await Swal.fire({
        title: 'วันที่อนุมัติ',
        text: 'ระบุวันที่อนุมัติ (ถ้าต้องการย้อนหลัง) หรือกดตกลงเพื่อใช้วันนี้',
        input: 'date',
        inputValue: today,
        showCancelButton: true,
        confirmButtonText: 'ตกลง',
        cancelButtonText: 'ยกเลิก'
    });
    if (customApprovedDate === undefined) return;

    const finalApprovedDate = customApprovedDate || today;
    const finalApprovedDateTime = new Date(finalApprovedDate + 'T12:00:00+07:00').toISOString();

    let updateData = {
        status: newStatus,
        reject_comment: null,
        updated_at: now,
        approved_at: now,
        approved_date: finalApprovedDate
    };

    if (currentUserRole === 'super_admin' && newStatus === 'อนุมัติ') {
        updateData.ack_admin = true;
        updateData.ack_admin_at = finalApprovedDateTime;
        updateData.ack_deputy = true;
        updateData.ack_deputy_at = finalApprovedDateTime;
        updateData.ack_director = true;
        updateData.ack_director_at = finalApprovedDateTime;
    } else {
        if (currentUserRole === 'director' || currentUserRole === 'super_admin') {
            updateData.ack_director = true;
            updateData.ack_director_at = finalApprovedDateTime;
        }
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

    if (currentUserRole !== 'super_admin' && leave.status === 'รออนุมัติ') {
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

    if (!comment) return;

    const today = new Date().toLocaleDateString('sv-SE');
    const { value: customRejectDate } = await Swal.fire({
        title: 'วันที่ไม่อนุมัติ',
        text: 'ระบุวันที่ไม่อนุมัติ (ถ้าต้องการย้อนหลัง) หรือกดตกลงเพื่อใช้วันนี้',
        input: 'date',
        inputValue: today,
        showCancelButton: true,
        confirmButtonText: 'ตกลง',
        cancelButtonText: 'ยกเลิก'
    });
    if (customRejectDate === undefined) return;

    const finalRejectDate = customRejectDate || today;

    Swal.fire({ title: 'กำลังอัปเดตข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    const now = new Date().toISOString();
    let updateData = {
        status: 'ไม่อนุมัติ',
        reject_comment: comment.trim(),
        updated_at: now,
        approved_at: now,
        approved_date: finalRejectDate
    };

    if (currentUserRole === 'super_admin') {
        updateData.ack_admin = true;
        updateData.ack_deputy = true;
        updateData.ack_director = true;
        updateData.ack_admin_at = now;
        updateData.ack_deputy_at = now;
        updateData.ack_director_at = now;
    } else if (currentUserRole === 'director') {
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

function showRejectComment(comment) {
    Swal.fire({ icon: 'info', title: 'เหตุผลที่ไม่อนุมัติ', html: `<div class="text-left bg-rose-50 p-4 rounded-xl border border-rose-100 text-rose-800 mt-2 font-medium">${comment}</div>`, confirmButtonColor: '#4f46e5', confirmButtonText: 'ปิดหน้าต่าง' });
}

// ----- ลบใบลา -----
async function deleteLeave(id, name) {
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
// ยกเลิกรับทราบทั้งหมด (เฉพาะ Super Admin)
// ==========================================
async function resetAllAcknowledge(id) {
    if (currentUserRole !== 'super_admin') {
        Swal.fire('ไม่มีสิทธิ์', 'เฉพาะ Super Admin เท่านั้นที่ดำเนินการนี้ได้', 'warning');
        return;
    }

    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันการยกเลิกรับทราบทั้งหมด',
        html: 'คุณต้องการยกเลิกรับทราบทั้งหมด (แอดมิน, รองผู้อำนวยการ, ผู้อำนวยการ) และเปลี่ยนสถานะเป็น "รออนุมัติ" ใช่หรือไม่?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'ใช่, ยกเลิกเลย',
        cancelButtonText: 'ยกเลิก'
    });

    if (!isConfirmed) return;

    Swal.fire({
        title: 'กำลังดำเนินการ...',
        didOpen: () => Swal.showLoading(),
        allowOutsideClick: false,
        showConfirmButton: false
    });

    try {
        const updateData = {
            ack_admin: false,
            ack_admin_at: null,
            ack_deputy: false,
            ack_deputy_at: null,
            ack_director: false,
            ack_director_at: null,
            status: 'รออนุมัติ',
            reject_comment: null,
            approved_at: null,
            approved_date: null,
            updated_at: new Date().toISOString()
        };

        const { error } = await db.from('leave_requests')
            .update(updateData)
            .eq('id', id);

        if (error) throw error;

        await logUserAction(`ยกเลิกรับทราบทั้งหมด ID: ${id} (Super Admin)`, 'leave');
        Swal.fire({
            icon: 'success',
            title: 'ดำเนินการสำเร็จ',
            text: 'ยกเลิกรับทราบทั้งหมดเรียบร้อย สถานะกลับเป็นรออนุมัติ',
            timer: 1500,
            showConfirmButton: false
        });
        await loadDashboardStats();

    } catch (err) {
        console.error('resetAllAcknowledge error:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// ดูรายละเอียดใบลา (แสดงข้อมูลทั้งหมด + สถานะรับทราบ)
// ==========================================
function viewLeave(id) {
    const l = allLeavesData.find(x => x.id === id);
    if (!l) return;

    const effectiveRole = currentUserRole === 'teacher' && (isAdminMode || isModuleAdmin) ? 'admin' : currentUserRole;
    const isSuperAdminView = effectiveRole === 'super_admin';

    function fmt(iso) {
        if (!iso) return '-';
        const p = iso.split('-');
        return `${p[2]}/${p[1]}/${parseInt(p[0]) + 543}`;
    }
    // ลบหรือแทนที่ฟังก์ชัน fmtDateTime เดิม
    function formatDateOnly(iso) {
        if (!iso) return '-';
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '-';
        const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
            'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
        return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
    }
    const approvedDisplay = l.approved_date || l.approved_at;
    const leaveInfoHtml = `
        <div class="border border-slate-200 rounded-xl p-3 space-y-2 mb-4">
            <div class="flex justify-between items-center">
                <span class="text-sm font-bold text-slate-600">ประเภทการลา</span>
                <span class="font-bold text-slate-800">${l.type}</span>
            </div>
            <div class="flex justify-between items-center">
                <span class="text-sm font-bold text-slate-600">ช่วงวันที่</span>
                <span class="font-bold text-slate-800">${fmt(l.start_date)} - ${fmt(l.end_date)}</span>
            </div>
            <div class="flex justify-between items-center">
                <span class="text-sm font-bold text-slate-600">จำนวนวัน</span>
                <span class="font-bold text-slate-800">${l.total_days} วัน</span>
            </div>
            <div class="flex justify-between items-center">
                <span class="text-sm font-bold text-slate-600">สาเหตุ</span>
                <span class="font-bold text-slate-800">${l.reason}</span>
            </div>
            <div class="flex justify-between items-center">
                <span class="text-sm font-bold text-slate-600">สถานะ</span>
                <span>${l.status === 'รออนุมัติ' ? '<span class="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-xs font-bold">รออนุมัติ</span>' :
            l.status === 'อนุมัติ' ? '<span class="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-xs font-bold">อนุมัติ</span>' :
                '<span class="bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full text-xs font-bold">ไม่อนุมัติ</span>'}</span>
            </div>
            <div class="flex justify-between items-center">
    <span class="text-sm font-bold text-slate-600">ครึ่งวัน</span>
    <span class="font-bold text-slate-800">${l.is_half_day ? '✅ ใช่' : '❌ ไม่'}</span>
</div>
<div class="flex justify-between items-center">
    <span class="text-sm font-bold text-slate-600">จำนวนวัน</span>
    <span class="font-bold text-slate-800">${l.is_half_day ? '0.5 (ครึ่งวัน)' : l.total_days + ' วัน'}</span>
</div>
            ${l.reject_comment ? `<div class="flex justify-between items-start"><span class="text-sm font-bold text-slate-600">เหตุผลที่ไม่อนุมัติ</span><span class="text-rose-700 text-sm">${l.reject_comment}</span></div>` : ''}
${approvedDisplay ? `<div class="flex justify-between items-center"><span class="text-sm font-bold text-slate-600">อนุมัติเมื่อ</span><span class="text-slate-600 text-sm">${formatDateOnly(approvedDisplay)}</span></div>` : ''}
            ${l.submitted_date ? `<div class="flex justify-between items-center"><span class="text-sm font-bold text-slate-600">วันที่ส่งใบลา</span><span class="text-slate-600 text-sm">${fmt(l.submitted_date)}</span></div>` : ''}
            ${l.attachment_file_id ? `<div class="flex justify-between items-center"><span class="text-sm font-bold text-slate-600">ไฟล์หลักฐาน</span><a href="https://lh5.googleusercontent.com/d/${l.attachment_file_id}" target="_blank" class="text-blue-600 hover:underline text-sm">ดูไฟล์</a></div>` : ''}
        </div>
    `;

    function buildAckRow(label, field) {
        const done = !!l[field];
        const atField = field + '_at';
        const atValue = l[atField] ? formatDateOnly(l[atField]) : '';
        let buttonHtml = '';
        if (isSuperAdminView && !done) {
            buttonHtml = `<button onclick="acknowledgeLeave('${l.id}', '${field}'); closeViewModal()" class="ml-2 px-3 py-1 bg-teal-500 hover:bg-teal-600 text-white rounded-lg text-xs font-bold shadow-sm transition"><i class="fas fa-check-double mr-1"></i> รับทราบแทน</button>`;
        } else if (effectiveRole === 'admin' && field === 'ack_admin' && !done) {
            buttonHtml = `<button onclick="acknowledgeLeave('${l.id}', '${field}'); closeViewModal()" class="ml-2 px-3 py-1 bg-teal-500 hover:bg-teal-600 text-white rounded-lg text-xs font-bold shadow-sm transition"><i class="fas fa-check-double mr-1"></i> รับทราบ</button>`;
        } else if (effectiveRole === 'deputy' && field === 'ack_deputy' && !done) {
            buttonHtml = `<button onclick="acknowledgeLeave('${l.id}', '${field}'); closeViewModal()" class="ml-2 px-3 py-1 bg-teal-500 hover:bg-teal-600 text-white rounded-lg text-xs font-bold shadow-sm transition"><i class="fas fa-check-double mr-1"></i> รับทราบ</button>`;
        } else if (effectiveRole === 'director' && field === 'ack_director' && !done) {
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

    const ackHtml = `
        <div class="border border-slate-200 rounded-xl p-3">
            <p class="text-xs font-bold text-slate-500 mb-2"><i class="fas fa-signature mr-1 text-indigo-400"></i>สถานะการรับทราบ</p>
            ${buildAckRow('<i class="fas fa-user-tie text-slate-400 mr-1.5"></i>แอดมิน', 'ack_admin')}
            ${buildAckRow('<i class="fas fa-user-shield text-slate-400 mr-1.5"></i>รองผู้อำนวยการ', 'ack_deputy')}
            ${buildAckRow('<i class="fas fa-crown text-slate-400 mr-1.5"></i>ผู้อำนวยการ', 'ack_director')}
        </div>
    `;

    let actionHtml = '';
    if ((effectiveRole === 'super_admin' || effectiveRole === 'director') && l.status === 'รออนุมัติ') {
        if (l.ack_admin && l.ack_deputy) {
            actionHtml = `
                <div class="flex flex-wrap gap-2 pt-2">
                    <button onclick="updateStatus('${l.id}', 'อนุมัติ'); closeViewModal()" class="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-sm flex items-center gap-2 transition shadow-sm"><i class="fas fa-thumbs-up"></i> อนุมัติ</button>
                    <button onclick="rejectLeave('${l.id}'); closeViewModal()" class="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-bold text-sm flex items-center gap-2 transition shadow-sm"><i class="fas fa-thumbs-down"></i> ไม่อนุมัติ</button>
                </div>
            `;
        } else {
            actionHtml = `<div class="text-xs text-amber-600 bg-amber-50 border border-amber-200 p-2 rounded-lg"><i class="fas fa-info-circle mr-1"></i> ต้องรอให้ <b>แอดมิน</b> และ <b>รองผู้อำนวยการ</b> รับทราบก่อน จึงจะสามารถอนุมัติ/ไม่อนุมัติได้</div>`;
        }
    }

    const fullHtml = `
        <div class="space-y-4">
            ${leaveInfoHtml}
            ${ackHtml}
            ${actionHtml ? `<div class="pt-2">${actionHtml}</div>` : ''}
        </div>
    `;

    document.getElementById('viewLeaveContent').innerHTML = fullHtml;
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

    const today = new Date().toLocaleDateString('sv-SE');
    const { value: customDate } = await Swal.fire({
        title: 'วันที่รับทราบ',
        text: 'ระบุวันที่รับทราบ (ถ้าต้องการย้อนหลัง) หรือกดตกลงเพื่อใช้วันนี้',
        input: 'date',
        inputValue: today,
        showCancelButton: true,
        confirmButtonText: 'ตกลง',
        cancelButtonText: 'ยกเลิก'
    });
    if (customDate === undefined) return;

    const finalDate = customDate || today;
    const finalDateTime = new Date(finalDate + 'T12:00:00+07:00').toISOString();

    const now = new Date().toISOString();
    let updateData = { updated_at: now };
    updateData[field] = true;
    updateData[field + '_at'] = finalDateTime;

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
// ฟังก์ชันส่งออก Excel (คงเดิม)
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

        // กรองเฉพาะตำแหน่งที่ต้องการ (ผู้อำนวยการ, รองผู้อำนวยการ, ครูทุกประเภท, พนักงานราชการ)
        // และตัดตำแหน่งที่ไม่ต้องการออก
        let personnel = allPersonnelData.filter(p => {
            const pos = p.position || '';

            // ตัดตำแหน่งที่ไม่ต้องการออกก่อน
            if (pos.includes('ครูอัตราจ้าง')) return false;
            if (pos.includes('ครูพี่เลี้ยงเด็กพิการ')) return false;
            if (pos.includes('เจ้าหน้าที่สำนักงาน')) return false;
            if (pos.includes('พนักงานขับรถยนต์')) return false;
            if (pos.includes('พนักงานบริการ')) return false;
            if (pos.includes('พนักงานรักษาความปลอดภัย')) return false;
            // สามารถเพิ่มตำแหน่งอื่นที่ต้องการตัดได้ที่นี่

            // อนุญาตเฉพาะตำแหน่งที่มีคำเหล่านี้
            return pos.includes('ผู้อำนวยการ') ||
                pos.includes('รองผู้อำนวยการ') ||
                pos.includes('ครู') ||
                pos.includes('พนักงานราชการ');
        });

        const { data: leaves, error: leavesErr } = await db.from('leave_requests')
            .select('personnel_id, type, total_days')
            .eq('fiscal_year', systemSettings.fiscal_year)
            .eq('eval_round', systemSettings.eval_round)
            .eq('status', 'อนุมัติ');
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
// ระบบบันทึกขาด/มาสาย
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
        eval_round: systemSettings.eval_round,
        submitted_date: submittedDateIso,
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
// สร้างใบลา (Admin) พร้อม submitted_date และอัปโหลดหลักฐาน
// ==========================================
function initAdminFlatpickr() {
    const config = {
        locale: 'th',
        dateFormat: 'd/m/Y',
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
    flatpickr("#admin_submitted_date", config);
}

// แทนที่ adminCalculateDays
window.adminCalculateDays = async function () {
    const startIso = $('#admin_start_date_iso').val();
    const endIso = $('#admin_end_date_iso').val();
    const type = $('#admin_leave_type').val();
    const isHalfDay = $('#admin_is_half_day').is(':checked');
    const days = await window.calculateDaysWithHalfDay(startIso, endIso, type, isHalfDay);
    $('#admin_calc_days').text(days);

    const wrapper = document.getElementById('admin_evidence_upload_wrapper');
    const fileInput = document.getElementById('admin_evidence_file');
    if (days >= 3) {
        wrapper.classList.remove('hidden');
        fileInput.setAttribute('required', 'required');
    } else {
        wrapper.classList.add('hidden');
        fileInput.removeAttribute('required');
        fileInput.value = '';
    }
};

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
    $('#admin_start_date_iso, #admin_end_date_iso, #admin_submitted_date_iso').val('');
    $('#admin_calc_days').text('0');
    $('#admin_leave_guide').addClass('hidden');
    document.getElementById('admin_evidence_upload_wrapper').classList.add('hidden');
    document.getElementById('admin_evidence_file').value = '';
    document.getElementById('admin_existing_evidence').classList.add('hidden');

    if (typeof adminFlatpickrInstance !== 'undefined' && adminFlatpickrInstance) adminFlatpickrInstance.destroy();
    initAdminFlatpickr();
    $('#adminLeaveModal').removeClass('hidden').addClass('flex');
}
function closeAdminLeaveModal() {
    $('#adminLeaveModal').addClass('hidden').removeClass('flex');
}

window.saveLeaveForAdmin = async function (e) {
    e.preventDefault();
    if (!isModuleAdmin && !requireAdmin(currentUserRole, isAdminMode, 'เฉพาะผู้ดูแลระบบเท่านั้น')) return;

    const personnelId = $('#admin_personnel_id').val();
    if (!personnelId) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกบุคลากร', 'warning');
    const type = $('#admin_leave_type').val();
    const reason = $('#admin_reason').val().trim();
    const startDate = $('#admin_start_date_iso').val();
    const endDate = $('#admin_end_date_iso').val();
    const totalDays = parseFloat($('#admin_calc_days').text());
    const contactAddress = $('#admin_contact_address').val().trim();
    const phoneNumber = $('#admin_phone_number').val().trim();
    const isHalfDay = $('#admin_is_half_day').is(':checked');
    const submittedDateIso = $('#admin_submitted_date_iso').val() || null;

    if (!type) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกประเภทการลา', 'warning');
    if (totalDays <= 0) return Swal.fire('ข้อมูลไม่ถูกต้อง', 'จำนวนวันลาต้องมากกว่า 0 วัน', 'warning');

    let attachmentFileId = null;
    const fileInput = document.getElementById('admin_evidence_file');
    if (totalDays >= 3) {
        if (fileInput.files && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            if (file.size > 5 * 1024 * 1024) {
                Swal.fire('ไฟล์ใหญ่เกินไป', 'กรุณาอัปโหลดไฟล์ขนาดไม่เกิน 5MB', 'warning');
                return;
            }
            try {
                attachmentFileId = await window.uploadEvidenceFile(file, systemSettings.evidence_folder_id, systemSettings.gas_url);
            } catch (err) {
                Swal.fire('อัปโหลดไม่สำเร็จ', err.message, 'error');
                return;
            }
        } else {
            Swal.fire('แจ้งเตือน', 'กรุณาอัปโหลดไฟล์หลักฐาน (จำเป็นสำหรับการลา 3 วันขึ้นไป)', 'warning');
            return;
        }
    }

    // ✅ ตรวจสอบข้อมูลซ้ำ
    const duplicate = await window.checkDuplicateLeave(
        personnelId,
        type,
        startDate,
        endDate,
        null  // ไม่มี id เพราะเป็นการสร้างใหม่
    );

    if (duplicate.exists) {
        const existingName = duplicate.existingLeave?.core_personnel
            ? `${duplicate.existingLeave.core_personnel.prefix || ''}${duplicate.existingLeave.core_personnel.first_name} ${duplicate.existingLeave.core_personnel.last_name}`
            : 'บุคลากร';
        await Swal.fire({
            icon: 'warning',
            title: 'มีใบลาซ้ำ',
            html: `
                <div class="text-left">
                    <p>พบข้อมูลการลานี้แล้วสำหรับ <b>${existingName}</b></p>
                    <p class="text-sm text-slate-600">ประเภท: ${type}</p>
                    <p class="text-sm text-slate-600">วันที่: ${window.formatDateThai(startDate)} - ${window.formatDateThai(endDate)}</p>
                    <p class="text-sm text-slate-600">สถานะ: <span class="font-bold">${duplicate.existingLeave.status}</span></p>
                </div>
            `,
            confirmButtonText: 'ตกลง'
        });
        return;
    }

    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    const payload = {
        personnel_id: personnelId,
        type,
        reason,
        start_date: startDate,
        end_date: endDate,
        total_days: totalDays,
        contact_address: contactAddress,
        phone_number: phoneNumber,
        fiscal_year: systemSettings.fiscal_year,
        eval_round: systemSettings.eval_round,
        status: 'รออนุมัติ',
        reject_comment: null,
        attachment_file_id: attachmentFileId,
        pdf_url: null,
        is_half_day: isHalfDay,
        submitted_date: submittedDateIso
    };
    try {
        const { error } = await db.from('leave_requests').insert([payload]);
        if (error) throw error;
        await logUserAction(`บันทึกใบลาให้ ${personnelId} (${type})`, 'leave');
        closeAdminLeaveModal();
        Swal.fire({ icon: 'success', title: 'บันทึกใบลาเรียบร้อย', text: 'ใบลาอยู่ในสถานะรออนุมัติ', timer: 1500, showConfirmButton: false });
        await loadDashboardStats();
    } catch (err) { Swal.fire('ผิดพลาด', err.message, 'error'); }
};

// ==========================================
// จัดการลายเซ็นบุคลากร
// ==========================================
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

    if ($.fn.DataTable.isDataTable('#signatureTable')) {
        $('#signatureTable').DataTable().destroy();
    }

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

    $('#signatureTable').DataTable({
        responsive: true,
        scrollX: false,
        language: {
            url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json'
        },
        pageLength: 10,
        order: [[0, 'asc']],
        columnDefs: [
            { orderable: false, targets: [3, 4] }
        ]
    });
}

async function uploadSignature(personnelId, fileInput) {
    const file = fileInput.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
        Swal.fire('ไฟล์ใหญ่เกินไป', 'กรุณาอัปโหลดไฟล์ขนาดไม่เกิน 2MB', 'warning');
        fileInput.value = '';
        return;
    }

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
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async function () {
            const base64 = reader.result.split(',')[1];

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
            console.warn('ไม่สามารถลบไฟล์ใน Drive ได้:', result.message);
        }

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
        { wch: 30 },
        { wch: 28 },
        { wch: 28 },
        { wch: 12 },
        { wch: 60 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ลายเซ็นบุคลากร');

    const today = new Date().toLocaleDateString('th-TH', {
        year: 'numeric', month: '2-digit', day: '2-digit'
    }).replace(/\//g, '-');
    XLSX.writeFile(wb, `ลายเซ็นบุคลากร_${today}.xlsx`);
}

// ============================================================
// ฟังก์ชันจัดการวันหยุดของโรงเรียน (เฉพาะ Super Admin) — สำหรับหน้า Admin
// ============================================================

// โหลดรายการวันหยุด
window.loadHolidaysAdmin = async function () {
    // ตรวจสอบสิทธิ์ Super Admin
    if (window.currentUserRole !== 'super_admin') {
        const container = document.getElementById('holidayListContainerAdmin');
        if (container) container.innerHTML = '<span class="text-rose-500 text-sm">เฉพาะ Super Admin เท่านั้น</span>';
        return;
    }

    try {
        const { data: holidays, error } = await window.db
            .from('school_holidays')
            .select('*')
            .order('start_date', { ascending: true });

        if (error) throw error;

        const container = document.getElementById('holidayListContainerAdmin');
        if (!container) return;

        if (!holidays || holidays.length === 0) {
            container.innerHTML = `<span class="text-slate-400 text-sm">ยังไม่มีวันหยุดที่กำหนด</span>`;
            return;
        }

        // Super Admin จะเห็นปุ่มลบ
        const isSuperAdmin = window.currentUserRole === 'super_admin';
        container.innerHTML = holidays.map(h => {
            const start = new Date(h.start_date).toLocaleDateString('th-TH');
            const end = new Date(h.end_date).toLocaleDateString('th-TH');
            const desc = h.description ? `: ${h.description}` : '';
            const deleteBtn = isSuperAdmin ?
                `<span class="remove-holiday" onclick="window.deleteHolidayAdmin('${h.id}')" title="ลบวันหยุดนี้"><i class="fas fa-times-circle"></i></span>` :
                '';
            return `<span class="holiday-tag">${start} - ${end} ${desc} ${deleteBtn}</span>`;
        }).join('');
    } catch (err) {
        console.error('loadHolidaysAdmin error:', err);
        const container = document.getElementById('holidayListContainerAdmin');
        if (container) container.innerHTML = '<span class="text-rose-500 text-sm">เกิดข้อผิดพลาดในการโหลด</span>';
    }
};

// แสดงฟอร์มเพิ่มวันหยุด
window.addHolidayAdmin = function () {
    if (window.currentUserRole !== 'super_admin') {
        Swal.fire('ไม่มีสิทธิ์', 'เฉพาะ Super Admin เท่านั้นที่เพิ่มวันหยุดได้', 'error');
        return;
    }
    const form = document.getElementById('addHolidayFormAdmin');
    if (!form) return;
    form.classList.toggle('hidden');
    if (!form.classList.contains('hidden')) {
        document.getElementById('holidayStartDateAdmin').value = new Date().toISOString().split('T')[0];
        document.getElementById('holidayEndDateAdmin').value = new Date().toISOString().split('T')[0];
        document.getElementById('holidayDescriptionAdmin').value = '';
    }
};

window.cancelAddHolidayAdmin = function () {
    const form = document.getElementById('addHolidayFormAdmin');
    if (form) form.classList.add('hidden');
};

// บันทึกวันหยุดใหม่
window.saveHolidayAdmin = async function () {
    if (window.currentUserRole !== 'super_admin') {
        Swal.fire('ไม่มีสิทธิ์', 'เฉพาะ Super Admin เท่านั้นที่เพิ่มวันหยุดได้', 'error');
        return;
    }

    const startDate = document.getElementById('holidayStartDateAdmin').value;
    const endDate = document.getElementById('holidayEndDateAdmin').value;
    const description = document.getElementById('holidayDescriptionAdmin').value.trim();

    if (!startDate || !endDate) {
        Swal.fire('กรุณากรอกข้อมูล', 'ต้องระบุวันที่เริ่มต้นและสิ้นสุด', 'warning');
        return;
    }

    if (new Date(startDate) > new Date(endDate)) {
        Swal.fire('วันที่ไม่ถูกต้อง', 'วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด', 'warning');
        return;
    }

    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    try {
        const { error } = await window.db.from('school_holidays').insert({
            start_date: startDate,
            end_date: endDate,
            description: description || null,
            created_by: currentUser.id,
            created_at: new Date().toISOString()
        });

        if (error) throw error;

        await window.logUserAction(`เพิ่มวันหยุด (Admin): ${startDate} - ${endDate}`, 'leave');
        Swal.fire({ icon: 'success', title: 'เพิ่มวันหยุดเรียบร้อย', timer: 1500, showConfirmButton: false });
        document.getElementById('addHolidayFormAdmin').classList.add('hidden');
        await window.loadHolidaysAdmin();
    } catch (err) {
        console.error('saveHolidayAdmin error:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
};

// ลบวันหยุด
window.deleteHolidayAdmin = async function (holidayId) {
    if (window.currentUserRole !== 'super_admin') {
        Swal.fire('ไม่มีสิทธิ์', 'เฉพาะ Super Admin เท่านั้นที่ลบวันหยุดได้', 'error');
        return;
    }

    const { isConfirmed } = await Swal.fire({
        title: 'ลบวันหยุดนี้?',
        text: 'คุณต้องการลบวันหยุดนี้ใช่หรือไม่',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'ลบ',
        cancelButtonText: 'ยกเลิก'
    });

    if (!isConfirmed) return;

    Swal.fire({ title: 'กำลังลบ...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    try {
        const { error } = await window.db.from('school_holidays').delete().eq('id', holidayId);
        if (error) throw error;

        await window.logUserAction(`ลบวันหยุด (Admin) ID: ${holidayId}`, 'leave');
        Swal.fire({ icon: 'success', title: 'ลบวันหยุดเรียบร้อย', timer: 1500, showConfirmButton: false });
        await window.loadHolidaysAdmin();
    } catch (err) {
        console.error('deleteHolidayAdmin error:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
};

// แสดงส่วนตั้งค่าวันหยุดเฉพาะ Super Admin (เรียกเมื่อเปิดแท็บ Settings)
window.showHolidaySettingsAdmin = function () {
    const section = document.getElementById('holidaySettingsSectionAdmin');
    if (!section) return;
    if (window.currentUserRole === 'super_admin') {
        section.classList.remove('hidden');
        window.loadHolidaysAdmin();
    } else {
        section.classList.add('hidden');
    }
};

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
window.checkDuplicateLeave = window.checkDuplicateLeave; // (ไม่จำเป็น ถ้าใช้ window โดยตรง)

console.log('✅ leave_admin.js loaded with submitted_date, approved_date, evidence upload, full viewLeave, and holiday management (Super Admin only)');