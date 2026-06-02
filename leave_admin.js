let currentUser = null;
let currentProfile = null;
let dataTable = null;
let systemSettings = null;
let allLeavesData = [];
let allPersonnelData = [];
let isSuperAdmin = false;
let attendanceDataTable = null;
let allAttendanceData = [];

$(document).ready(async function () {
    Swal.fire({ title: 'กำลังตรวจสอบสิทธิ์...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) {
        await Swal.fire('ปฏิเสธการเข้าถึง', 'หน้านี้จำกัดเฉพาะผู้ดูแลระบบฝ่ายบุคลากรเท่านั้น', 'error');
        window.location.replace('leave_teacher.html');
        return;
    }
    currentUser = auth.user;
    currentProfile = auth.profile;
    await loadPersonnelSearch();
    await loadSystemSettings();
    updateUI();
    await loadDashboardStats();
    await loadAttendanceTable();
    initAttendanceFlatpickr();
    initEditFlatpickr();
    initAdminFlatpickr(); // สำหรับ modal เขียนใบลาแทน
    Swal.close();
    document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');
});

// ==========================================
// Authentication
// ==========================================
async function checkAdminAuth() {
    const { data: { session } } = await db.auth.getSession();
    if (!session) return { isAdmin: false };
    const { data: profile } = await db.from('core_personnel').select('*').eq('id', session.user.id).single();
    if (!profile) return { isAdmin: false };
    if (profile.role === 'super_admin' || profile.role === 'admin') {
        return { isAdmin: true, user: session.user, profile: profile };
    }
    const { data: modAdmin } = await db.from('core_module_admins').select('*').eq('user_id', session.user.id).eq('module_id', 'leave').maybeSingle();
    if (modAdmin) return { isAdmin: true, user: session.user, profile: profile };
    return { isAdmin: false };
}

function updateUI() {
    // อัปเดตชื่อผู้ใช้ใน Navbar
    $('#display-name').text(`${currentProfile.prefix || ''}${currentProfile.first_name} ${currentProfile.last_name}`);
    
    // กำหนดสิทธิ์ Super Admin
    isSuperAdmin = (currentProfile.role === 'super_admin');

    // ✅ เพิ่มบรรทัดนี้
    if (typeof toggleSettingsTab !== 'undefined') toggleSettingsTab(isSuperAdmin);
    
    if (currentProfile.role === 'super_admin') {
        $('#btn-import-excel').removeClass('hidden').addClass('flex');
    } else {
        $('#fiscal_year, #evaluation_round, #btn-save-settings, #select-new-admin, #btn-add-admin, #sign_leave_admin, #sign_hr_deputy, #sign_director').prop('disabled', true);
        $('#superadmin-only-section table').addClass('opacity-50 pointer-events-none');
    }
}

function switchTab(tabId) {
    $('.tab-content').addClass('hidden');
    $(`#tab-${tabId}`).removeClass('hidden');
    $('.sidebar-item').removeClass('sidebar-active');
    $(`#btn-${tabId}`).addClass('sidebar-active');
    const titles = { 'dashboard': 'แดชบอร์ดสรุปผล', 'manage-leave': 'จัดการรายการลา', 'attendance': 'บันทึกขาด/มาสาย', 'settings': 'ตั้งค่าระบบ & แอดมิน' };
    $('#page-title').text(titles[tabId] || 'แดชบอร์ดสรุปผล');
    if (tabId === 'manage-leave' && dataTable) dataTable.columns.adjust().draw();
    if (tabId === 'attendance' && attendanceDataTable) attendanceDataTable.columns.adjust().draw();
}

// ==========================================
// ตั้งค่าระบบ
// ==========================================
async function loadSystemSettings() {
    const { data: leaveData } = await db.from('core_system_modules').select('settings').eq('module_id', 'leave').maybeSingle();
    systemSettings = leaveData?.settings || {
        fiscal_year: (new Date().getFullYear() + 543).toString(),
        eval_round: '1',
        sign_leave_admin: '',
        gas_url: '', slide_template_id: '', pdf_folder_id: ''
    };
    $('#fiscal_year').val(systemSettings.fiscal_year);
    $('#evaluation_round').val(systemSettings.eval_round);
    $('#dash-fiscal-badge').text(`ปีงบประมาณ ${systemSettings.fiscal_year} (รอบที่ ${systemSettings.eval_round})`);
    $('#set_gas_url').val(systemSettings.gas_url || '');
    $('#set_slide_template_id').val(systemSettings.slide_template_id || '');
    $('#set_pdf_folder_id').val(systemSettings.pdf_folder_id || '');
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
    if (currentProfile.role !== 'super_admin') return;
    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    const newSettings = {
        fiscal_year: $('#fiscal_year').val().trim(),
        eval_round: $('#evaluation_round').val(),
        sign_leave_admin: $('#sign_leave_admin').val() || '',
        gas_url: $('#set_gas_url').val().trim(),
        slide_template_id: $('#set_slide_template_id').val().trim(),
        pdf_folder_id: $('#set_pdf_folder_id').val().trim()
    };
    const { error } = await db.from('core_system_modules').update({ settings: newSettings, updated_at: new Date().toISOString() }).eq('module_id', 'leave');
    if (error) Swal.fire('ผิดพลาด', error.message, 'error');
    else {
        systemSettings = newSettings;
        $('#dash-fiscal-badge').text(`ปีงบประมาณ ${systemSettings.fiscal_year} (รอบที่ ${systemSettings.eval_round})`);
        Swal.fire({ icon: 'success', title: 'บันทึกการตั้งค่าสำเร็จ', timer: 1500, showConfirmButton: false });
        loadDashboardStats();
    }
}

// ==========================================
// จัดการแอดมินและเลือกบุคลากร
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
    }
    if (currentProfile.role === 'super_admin') loadAdminList();
}

async function loadAdminList() {
    const { data, error } = await db.from('core_module_admins')
        .select('id, core_personnel(prefix, first_name, last_name)')
        .eq('module_id', 'leave');
    const tbody = document.getElementById('admin-list');
    if (data && data.length > 0) {
        tbody.innerHTML = data.map(admin => `
            <tr class="hover:bg-slate-50 border-b border-slate-100">
                <td class="p-3 font-bold text-slate-700">${admin.core_personnel?.prefix || ''}${admin.core_personnel?.first_name || ''} ${admin.core_personnel?.last_name || ''}</td>
                <td class="p-3 text-center">
                    <button onclick="removeModuleAdmin('${admin.id}')" class="text-rose-500 hover:text-white hover:bg-rose-500 bg-rose-50 px-3 py-1.5 rounded-lg transition-colors"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`).join('');
    } else {
        tbody.innerHTML = '<tr><td colspan="2" class="p-4 text-center text-slate-400">ยังไม่มีผู้ดูแลระบบ</td></tr>';
    }
}

async function addModuleAdmin() {
    const userId = $('#select-new-admin').val();
    if (!userId) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกบุคลากรก่อนครับ', 'warning');
    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    const { error } = await db.from('core_module_admins').insert({ user_id: userId, module_id: 'leave' });
    if (error) {
        if (error.code === '23505') Swal.fire('ซ้ำซ้อน', 'บุคลากรท่านนี้เป็นแอดมินอยู่แล้ว', 'warning');
        else Swal.fire('ผิดพลาด', error.message, 'error');
    } else {
        Swal.fire({ icon: 'success', title: 'แต่งตั้งสำเร็จ', timer: 1500, showConfirmButton: false });
        const selAdmin = document.getElementById('select-new-admin');
        if (selAdmin && selAdmin.tomselect) selAdmin.tomselect.clear();
        loadAdminList();
    }
}

async function removeModuleAdmin(id) {
    Swal.fire({ title: 'กำลังลบสิทธิ์...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    const { error } = await db.from('core_module_admins').delete().eq('id', id);
    if (!error) {
        Swal.fire({ icon: 'success', title: 'ถอดถอนสิทธิ์สำเร็จ', timer: 1500, showConfirmButton: false });
        loadAdminList();
    } else Swal.fire('ผิดพลาด', error.message, 'error');
}

// ==========================================
// แดชบอร์ด
// ==========================================
async function loadDashboardStats() {
    const { data: leaves, error } = await db.from('leave_requests')
        .select('*, core_personnel(prefix, first_name, last_name)')
        .eq('fiscal_year', systemSettings.fiscal_year)
        .eq('eval_round', systemSettings.eval_round);
    if (error) { console.error(error); return; }
    allLeavesData = leaves || [];
    const validLeaves = allLeavesData.filter(l => l.status !== 'ไม่อนุมัติ');
    const sickDays = validLeaves.filter(l => l.type === 'ลาป่วย').reduce((sum,l) => sum + l.total_days,0);
    const personalDays = validLeaves.filter(l => l.type === 'ลากิจส่วนตัว').reduce((sum,l) => sum + l.total_days,0);
    const pendingCount = allLeavesData.filter(l => l.status === 'รออนุมัติ').length;
    const uniquePeople = [...new Set(validLeaves.map(l => l.personnel_id))].length;
    $('#total-sick').html(`${sickDays} <span class="text-sm font-medium text-slate-500">วัน</span>`);
    $('#total-personal').html(`${personalDays} <span class="text-sm font-medium text-slate-500">วัน</span>`);
    $('#total-pending').html(`${pendingCount} <span class="text-sm font-medium text-slate-500">รายการ</span>`);
    $('#total-people').html(`${uniquePeople} <span class="text-sm font-medium text-slate-500">คน</span>`);
    checkLeaveLimits(validLeaves);
    await loadPromotionWarnings();   // <-- เพิ่มบรรทัดนี้
    renderTable();
}

function checkLeaveLimits(validLeaves) {
    const personnelStats = {};
    validLeaves.forEach(l => {
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

        if (p.sick >= 25) {
            warnings.push(`<span class="text-red-600">ป่วย: ${p.sick}/30 วัน</span>`);
        }
        if (p.personal >= 40) {
            warnings.push(`<span class="text-orange-600">ลากิจ: ${p.personal}/45 วัน</span>`);
        }
        if (p.totalCount >= 4) {
            let msg = '';
            if (p.totalCount > 6) {
                msg = `<span class="text-red-600">ลาทั้งหมด: ${p.totalCount} ครั้ง (เกินเกณฑ์ 6 ครั้ง)</span>`;
            } else if (p.totalCount === 6) {
                msg = `<span class="text-orange-600">ลาทั้งหมด: ${p.totalCount} ครั้ง (ถึงเกณฑ์ 6 ครั้ง)</span>`;
            } else {
                msg = `<span class="text-amber-600">ลาทั้งหมด: ${p.totalCount} ครั้ง (ใกล้เกณฑ์ 6 ครั้ง)</span>`;
            }
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
        // 1. ดึงข้อมูลการลาทั้งหมดของปีงบประมาณ/รอบประเมินปัจจุบัน (ไม่รวม "ไม่อนุมัติ")
        const { data: leaves, error: leavesErr } = await db.from('leave_requests')
            .select('personnel_id, type, total_days, status')
            .eq('fiscal_year', systemSettings.fiscal_year)
            .eq('eval_round', systemSettings.eval_round)
            .neq('status', 'ไม่อนุมัติ');
        if (leavesErr) throw leavesErr;

        // 2. ดึงข้อมูลการขาด/มาสายทั้งหมดในรอบประเมินปัจจุบัน
        const { data: attendances, error: attErr } = await db.from('personnel_attendance')
            .select('personnel_id, record_type')
            .eq('fiscal_year', systemSettings.fiscal_year)
            .eq('eval_round', systemSettings.eval_round);
        if (attErr) throw attErr;

        // สร้างแผนที่เก็บสถิติบุคลากร
        const statsMap = new Map(); // key = personnel_id

        // รวมข้อมูลการลา
        for (const l of leaves) {
            if (!statsMap.has(l.personnel_id)) {
                statsMap.set(l.personnel_id, {
                    sickDays: 0,
                    personalDays: 0,
                    totalLeaveCount: 0,
                    lateCount: 0
                });
            }
            const stat = statsMap.get(l.personnel_id);
            if (l.type === 'ลาป่วย') stat.sickDays += l.total_days;
            else if (l.type === 'ลากิจส่วนตัว') stat.personalDays += l.total_days;
            stat.totalLeaveCount++; // นับทุกชนิด (รวมคลอดด้วย)
        }

        // รวมข้อมูลมาสาย
        for (const a of attendances) {
            if (a.record_type === 'มาสาย') {
                if (!statsMap.has(a.personnel_id)) {
                    statsMap.set(a.personnel_id, {
                        sickDays: 0, personalDays: 0, totalLeaveCount: 0, lateCount: 0
                    });
                }
                statsMap.get(a.personnel_id).lateCount++;
            }
        }

        // สร้างอาร์เรย์ผลการประเมิน
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
                // หมายเหตุ: กรณีมีผลงานดีเด่นและวันลาไม่เกิน 15 วันอาจยังพิจารณาได้ – ยังไม่ได้ implement
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

        // แสดงผล
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

// ==========================================
// จัดการรายการลา (ตาราง)
// ==========================================
function filterTableByPerson() {
    const personId = $('#filter-personnel').val();
    if (personId) {
        const personName = $('#filter-personnel option:selected').text();
        dataTable.search(personName).draw();
    } else dataTable.search('').draw();
}

function renderTable() {
    if ($.fn.DataTable.isDataTable('#adminLeaveTable')) $('#adminLeaveTable').DataTable().destroy();
    const tbody = document.getElementById('tb-admin-leave');
    if (allLeavesData.length > 0) {
        tbody.innerHTML = allLeavesData.map(l => {
            const fullName = `${l.core_personnel.prefix || ''}${l.core_personnel.first_name} ${l.core_personnel.last_name}`;
            const fmt = (iso) => { if (!iso) return '-'; const p = iso.split('-'); return `${p[2]}/${p[1]}/${parseInt(p[0])+543}`; };
            const isRejected = l.status === 'ไม่อนุมัติ';
            const displayDays = isRejected ? 0 : l.total_days;
            const displayTimes = isRejected ? 0 : 1;
            let statusHtml = '';
            if (l.status === 'รออนุมัติ') statusHtml = '<span class="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold border border-amber-200">รออนุมัติ</span>';
            else if (l.status === 'อนุมัติ') statusHtml = '<span class="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold border border-emerald-200">อนุมัติ</span>';
            else {
                const safeComment = l.reject_comment ? l.reject_comment.replace(/'/g, "\\'").replace(/"/g,'&quot;').replace(/\n/g,'<br>') : 'ไม่มีการระบุเหตุผล';
                statusHtml = `<button onclick="showRejectComment('${safeComment}')" class="bg-rose-100 text-rose-700 px-3 py-1 rounded-full text-xs font-bold border border-rose-300 cursor-pointer hover:bg-rose-200 transition shadow-sm hover:scale-105"><i class="fas fa-times-circle mr-1"></i> ไม่อนุมัติ <i class="fas fa-hand-pointer ml-1 animate-pulse"></i></button>`;
            }
            let typeClass = l.type === 'ลาป่วย' ? 'text-blue-600' : (l.type === 'ลากิจส่วนตัว' ? 'text-orange-600' : 'text-rose-600');
            if (isRejected) typeClass = 'text-slate-400 line-through';
            let pdfHtml = '';
            if (l.pdf_url) pdfHtml = `<a href="${l.pdf_url}" target="_blank" class="bg-green-50 text-green-600 hover:bg-green-500 hover:text-white px-2 py-1.5 rounded-lg transition shadow-sm mr-1" title="เปิดไฟล์ PDF"><i class="fas fa-file-pdf"></i></a>`;
            else pdfHtml = `<button onclick="printLeavePDF('${l.id}')" class="bg-blue-50 text-blue-600 hover:bg-blue-500 hover:text-white px-2 py-1.5 rounded-lg transition shadow-sm mr-1" title="สร้างใบลา (PDF)"><i class="fas fa-print"></i></button>`;
            const canDelete = (isSuperAdmin || l.status !== 'อนุมัติ');
            const deleteBtn = canDelete ? `<button onclick="deleteLeave('${l.id}', '${fullName}')" class="text-slate-300 hover:text-rose-600 transition" title="ลบรายการนี้"><i class="fas fa-trash-alt"></i></button>` : '';
            return `<tr class="hover:bg-slate-50 transition-colors">
                <td class="text-center text-slate-400 text-xs">${l.id.substring(0,6)}</td>
                <td class="font-bold text-slate-700">${fullName}</td>
                <td class="font-bold ${typeClass}">${l.type}</td>
                <td class="text-slate-600">${fmt(l.start_date)} - ${fmt(l.end_date)}</td>
                <td class="text-center font-black ${typeClass}">${displayDays}</td>
                <td class="text-center font-black ${typeClass}">${displayTimes}</td>
                <td class="text-center">${statusHtml}</td>
                <td class="text-center whitespace-nowrap">
                    ${pdfHtml}
                    <button onclick="editLeave('${l.id}')" class="bg-amber-50 text-amber-600 hover:bg-amber-500 hover:text-white px-2 py-1.5 rounded-lg transition shadow-sm mr-1" title="แก้ไขข้อมูล"><i class="fas fa-edit"></i></button>
                    <button onclick="updateStatus('${l.id}', 'อนุมัติ')" class="bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white px-2 py-1.5 rounded-lg transition shadow-sm mr-1" title="อนุมัติ"><i class="fas fa-check"></i></button>
                    <button onclick="rejectLeave('${l.id}')" class="bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white px-2 py-1.5 rounded-lg transition shadow-sm mr-2" title="ไม่อนุมัติ (ระบุเหตุผล)"><i class="fas fa-times"></i></button>
                    ${deleteBtn}
                </td>
            </tr>`;
        }).join('');
    } else tbody.innerHTML = '';
    dataTable = $('#adminLeaveTable').DataTable({
        responsive: true, scrollX: false, 
        language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
        order: [[0, 'desc']], 
        columnDefs: [
            { responsivePriority: 1, targets: -1}, 
            { orderable: false, targets: [7] }
        ], 
        pageLength: 25
    });
}

// ==========================================
// แก้ไขใบลา (Admin)
// ==========================================
function initEditFlatpickr() {
    flatpickr(".edit-datepicker", { locale: "th", dateFormat: "Y-m-d", altInput: true, altFormat: "j F Y", onChange: function () { calculateEditDays(); } });
}
function calculateEditDays() {
    const start = $('#edit_start_date').val(), end = $('#edit_end_date').val(), type = $('#edit_leave_type').val();
    if (!start || !end) return;
    let startDate = new Date(start), endDate = new Date(end);
    if (endDate < startDate) { Swal.fire('วันที่ไม่ถูกต้อง','วันสิ้นสุดต้องไม่มาก่อนวันเริ่มลา','warning'); $('#edit_end_date').val(''); return; }
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
    if (!leave) return Swal.fire('ข้อผิดพลาด','ไม่พบข้อมูลการลานี้','error');
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
$('#editLeaveForm').on('submit', async function(e) {
    e.preventDefault();
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
    else { closeEditModal(); Swal.fire({ title: 'บันทึกสำเร็จ', text:'แก้ไขข้อมูลเรียบร้อย', icon:'success', timer:1500, showConfirmButton:false }); await loadDashboardStats(); }
});
function closeEditModal() { $('#editLeaveModal').addClass('hidden'); $('#editLeaveForm')[0].reset(); }

// ==========================================
// Attendance functions
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
        onChange: function(value) {
            const person = allPersonnelData.find(p => p.id === value);
            $('#att_department').val(person?.department || 'ไม่ระบุ/ไม่มีกลุ่มสาระฯ');
        }
    });
    attEl.tomselect.clear(true);

    // ✅ ป้องกัน flatpickr undefined
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
$('#attendanceForm').on('submit', async function(e) {
    e.preventDefault();
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
    else { closeAttendanceModal(); Swal.fire({ title: 'บันทึกสำเร็จ', icon: 'success', timer: 1500, showConfirmButton: false }); await loadAttendanceTable(); }
});
async function deleteAttendance(id) {
    const { isConfirmed } = await Swal.fire({ title: 'ยืนยันการลบ?', text: 'คุณต้องการลบรายการนี้ใช่หรือไม่?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'ใช่, ลบเลย!' });
    if (isConfirmed) {
        Swal.fire({ title: 'กำลังลบ...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
        const { error } = await db.from('personnel_attendance').delete().eq('id', id);
        if (error) Swal.fire('ผิดพลาด', error.message, 'error');
        else { Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1500, showConfirmButton: false }); await loadAttendanceTable(); }
    }
}

// ==========================================
// พิมพ์ PDF (call core)
// ==========================================
async function printLeavePDF(id) {
    await generateLeavePDF(id, systemSettings, db, Swal, window);
}

// ==========================================
// อัปเดตสถานะ, ไม่อนุมัติ, ลบ
// ==========================================
async function updateStatus(id, newStatus) {
    Swal.fire({ title: 'กำลังอัปเดตสถานะ...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    const { error } = await db.from('leave_requests').update({ status: newStatus, reject_comment: null, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) Swal.fire('ผิดพลาด', error.message, 'error');
    else {
        const Toast = Swal.mixin({ toast: true, position: 'bottom-end', showConfirmButton: false, timer: 1500 });
        Toast.fire({ icon: 'success', title: `ปรับสถานะเป็น "${newStatus}" เรียบร้อย` });
        await loadDashboardStats();
    }
}
async function rejectLeave(id) {
    const { value: comment } = await Swal.fire({
        title: 'ไม่อนุมัติการลา',
        html: '<p class="text-sm text-slate-500 mb-3">กรุณาระบุเหตุผลที่ไม่อนุมัติ เพื่อส่งกลับไปให้บุคลากรทราบ</p>',
        input: 'textarea', inputPlaceholder: 'พิมพ์เหตุผลที่นี่...',
        showCancelButton: true, confirmButtonColor: '#dc2626', cancelButtonColor: '#64748b',
        confirmButtonText: '<i class="fas fa-paper-plane mr-2"></i> ยืนยันไม่อนุมัติ', cancelButtonText: 'ยกเลิก',
        inputValidator: (value) => { if (!value) return 'กรุณาระบุเหตุผลด้วยครับ!'; }
    });
    if (comment) {
        Swal.fire({ title: 'กำลังอัปเดตข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
        const { error } = await db.from('leave_requests').update({ status: 'ไม่อนุมัติ', reject_comment: comment.trim(), updated_at: new Date().toISOString() }).eq('id', id);
        if (error) Swal.fire('ผิดพลาด', error.message, 'error');
        else { Swal.fire({ icon: 'success', title: 'ไม่อนุมัติเรียบร้อย', timer: 1500, showConfirmButton: false }); await loadDashboardStats(); }
    }
}
async function deleteLeave(id, name) {
    const { data: leave, error: fetchError } = await db.from('leave_requests').select('status').eq('id', id).single();
    if (fetchError) { Swal.fire('ผิดพลาด', fetchError.message, 'error'); return; }
    if (leave.status === 'อนุมัติ' && !isSuperAdmin) {
        Swal.fire('ไม่สามารถลบได้', 'รายการลาที่อนุมัติแล้วไม่สามารถลบได้ เพื่อรักษาความถูกต้องของสถิติ หากจำเป็นต้องลบ โปรดติดต่อ Super Admin', 'warning');
        return;
    }
    const { isConfirmed } = await Swal.fire({ title: 'ลบรายการลานี้?', html: `ต้องการลบรายการลาของ <b>${name}</b> หรือไม่?`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'ลบข้อมูล' });
    if (isConfirmed) {
        Swal.fire({ title: 'กำลังลบ...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
        const { error } = await db.from('leave_requests').delete().eq('id', id);
        if (!error) { await loadDashboardStats(); Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1500, showConfirmButton: false }); }
        else Swal.fire('ผิดพลาด', error.message, 'error');
    }
}

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
    ws['!cols'] = [{ wch:15 }, { wch:25 }, { wch:12 }, { wch:12 }, { wch:15 }, { wch:15 }, { wch:15 }, { wch:12 }, { wch:12 }, { wch:35 }, { wch:15 }, { wch:30 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "สรุปการลา");
    XLSX.writeFile(wb, `สรุปการลา_ปีงบประมาณ_${systemSettings.fiscal_year}_รอบ${systemSettings.eval_round}.xlsx`);
}

async function exportLeaveSummaryReport() {
    try {
        Swal.fire({ title: 'กำลังสร้างรายงาน...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

        // 1. กรองบุคลากร (ไม่เอาผู้อำนวยการ (ไม่รวมรอง), พนักงานราชการ, ครูอัตราจ้าง)
        let personnel = allPersonnelData.filter(p => {
            const pos = p.position || '';
            // ตรวจสอบว่าไม่ใช่ "ผู้อำนวยการ" (เฉพาะคำเดียว ไม่รวม "รอง")
            if (pos === 'ผู้อำนวยการสถานศึกษา') return false;
            if (pos.includes('พนักงานราชการ')) return false;
            if (pos.includes('ครูอัตราจ้าง')) return false;
            return true;
        });

        // 2. ดึงข้อมูลการลา
        const { data: leaves, error: leavesErr } = await db.from('leave_requests')
            .select('personnel_id, type, total_days')
            .eq('fiscal_year', systemSettings.fiscal_year)
            .eq('eval_round', systemSettings.eval_round)
            .neq('status', 'ไม่อนุมัติ');
        if (leavesErr) throw leavesErr;

        // 3. ดึงข้อมูลการมาสาย
        const { data: attendances, error: attErr } = await db.from('personnel_attendance')
            .select('personnel_id, record_type')
            .eq('fiscal_year', systemSettings.fiscal_year)
            .eq('eval_round', systemSettings.eval_round);
        if (attErr) throw attErr;

        // 4. สร้าง Map เก็บสถิติ
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

        // 5. เตรียมข้อมูลรายงาน
        const reportData = [];
        for (const p of personnel) {
            const s = stats.get(p.id) || { lateCount:0, personalCount:0, personalDays:0, sickCount:0, sickDays:0 };
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

        // 6. กำหนดลำดับกลุ่มสาระฯ (เหมือนเดิม)
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

        // 7. เรียงลำดับ: รองฯ → กลุ่มสาระฯ → ชื่อ
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

        // 8. สร้าง Excel
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

        Swal.fire({ icon: 'success', title: 'ส่งออกรายงานสำเร็จ', timer: 1500, showConfirmButton: false });
    } catch (err) {
        console.error(err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

async function importLeaveExcel(event) {
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
            await loadDashboardStats(); Swal.fire('สำเร็จ', `นำเข้าข้อมูลการลา ${success} รายการเรียบร้อยแล้ว`, 'success');
        } catch (err) { Swal.fire('ผิดพลาด', err.message, 'error'); }
    };
    reader.readAsArrayBuffer(file);
}

async function exportAttendanceReport() {
    try {
        // ดึงข้อมูลสถิติจาก personnel_attendance ตามปีงบประมาณและรอบประเมินปัจจุบัน
        const { data: attendanceStats, error } = await db.from('personnel_attendance')
            .select('personnel_id, record_type')
            .eq('fiscal_year', systemSettings.fiscal_year)
            .eq('eval_round', systemSettings.eval_round);
        if (error) throw error;

        // นับจำนวนครั้งของแต่ละบุคลากร แยกประเภท
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

        // ดึงรายชื่อบุคลากรทั้งหมด (จาก allPersonnelData ที่โหลดไว้แล้ว)
        const personnelList = allPersonnelData;
        // สร้างข้อมูลสำหรับ Excel เฉพาะผู้ที่มีสถิติอย่างน้อย 1 ครั้ง (ตามที่ต้องการ)
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
            .filter(item => item['รวม'] > 0);  // แสดงเฉพาะผู้ที่มีสถิติ (ถ้าต้องการแสดงทั้งหมดให้ลบ filter ออก)

        if (exportData.length === 0) {
            Swal.fire('แจ้งเตือน', 'ไม่มีข้อมูลการขาด/มาสายในช่วงนี้', 'info');
            return;
        }

        // สร้าง Excel
        const ws = XLSX.utils.json_to_sheet(exportData);
        ws['!cols'] = [
            { wch: 30 },   // ชื่อ-สกุล
            { wch: 15 },   // มาสาย
            { wch: 15 },   // ขาดราชการ
            { wch: 10 }    // รวม
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'สรุปการขาด-มาสาย');
        XLSX.writeFile(wb, `สรุปการขาด_มาสาย_${systemSettings.fiscal_year}_รอบ${systemSettings.eval_round}.xlsx`);

        Swal.fire({ icon: 'success', title: 'ส่งออกข้อมูลสำเร็จ', timer: 1500, showConfirmButton: false });
    } catch (err) {
        console.error(err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

function showRejectComment(comment) {
    Swal.fire({ icon: 'info', title: 'เหตุผลที่ไม่อนุมัติ', html: `<div class="text-left bg-rose-50 p-4 rounded-xl border border-rose-100 text-rose-800 mt-2 font-medium">${comment}</div>`, confirmButtonColor: '#4f46e5', confirmButtonText: 'ปิดหน้าต่าง' });
}

// ==========================================
// Admin เขียนใบลาแทนบุคลากร
// ==========================================
function initAdminFlatpickr() {
    const config = {
        locale: 'th', dateFormat: 'd/m/Y',
        onChange: function(selectedDates, dateStr, instance) {
            if (selectedDates[0]) {
                const id = instance.element.id;
                const d = selectedDates[0];
                $(`#${id}_iso`).val(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
                instance.element.value = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()+543}`;
            }
            adminCalculateDays();
        },
        onReady: (_,__,inst) => { const yearEl = inst.calendarContainer?.querySelector('.cur-year'); if(yearEl && parseInt(yearEl.value)<2400) yearEl.value = parseInt(yearEl.value)+543; },
        onMonthChange: (_,__,inst) => { const yearEl = inst.calendarContainer?.querySelector('.cur-year'); if(yearEl && parseInt(yearEl.value)<2400) yearEl.value = parseInt(yearEl.value)+543; },
        onYearChange: (_,__,inst) => { const yearEl = inst.calendarContainer?.querySelector('.cur-year'); if(yearEl && parseInt(yearEl.value)<2400) yearEl.value = parseInt(yearEl.value)+543; }
    };
    flatpickr("#admin_start_date", config);
    flatpickr("#admin_end_date", config);
}
function adminCalculateDays() {
    const startIso = $('#admin_start_date_iso').val();
    const endIso = $('#admin_end_date_iso').val();
    const type = $('#admin_leave_type').val();
    const days = calculateDaysByType(startIso, endIso, type);
    $('#admin_calc_days').text(days);
}
function adminUpdateLeaveGuide() {
    const type = $('#admin_leave_type').val();
    const guideBox = $('#admin_leave_guide');
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
        closeAdminLeaveModal();
        Swal.fire({ icon: 'success', title: 'บันทึกใบลาเรียบร้อย', text: 'ใบลาอยู่ในสถานะรออนุมัติ', timer: 1500, showConfirmButton: false });
        await loadDashboardStats();
    } catch(err) { Swal.fire('ผิดพลาด', err.message, 'error'); }
}