let currentUser = null;
let currentProfile = null;
let dataTable = null;
let systemSettings = null;
let allLeavesData = [];
let allPersonnelData = [];
let isSuperAdmin = false;   // ✅ เพิ่ม

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

    Swal.close();
    document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');
    initEditFlatpickr();
});

// ==========================================
// ระบบ Authentication ตรวจสอบสิทธิ์ Admin
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
    if (modAdmin) {
        return { isAdmin: true, user: session.user, profile: profile };
    }

    return { isAdmin: false };
}

function updateUI() {
    $('#admin-name').text(`${currentProfile.prefix || ''}${currentProfile.first_name} ${currentProfile.last_name}`);
    $('#admin-role').text(currentProfile.role === 'super_admin' ? 'Super Admin' : 'Module Admin');
    
    isSuperAdmin = (currentProfile.role === 'super_admin');   // ✅ กำหนดค่า

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
    if (tabId === 'attendance' && typeof attendanceDataTable !== 'undefined' && attendanceDataTable) attendanceDataTable.columns.adjust().draw();
}

// ==========================================
// 1. ดึงและบันทึกการตั้งค่าระบบ 
// ==========================================
async function loadSystemSettings() {
    const { data: leaveData } = await db.from('core_system_modules').select('settings').eq('module_id', 'leave').maybeSingle();

    systemSettings = leaveData?.settings || {
        fiscal_year: (new Date().getFullYear() + 543).toString(),
        eval_round: '1',
        sign_leave_admin: '',
        gas_url: '',
        slide_template_id: '',
        pdf_folder_id: ''   // ✅ เพิ่มบรรทัดนี้
    };

    $('#fiscal_year').val(systemSettings.fiscal_year);
    $('#evaluation_round').val(systemSettings.eval_round);
    $('#dash-fiscal-badge').text(`ปีงบประมาณ ${systemSettings.fiscal_year} (รอบที่ ${systemSettings.eval_round})`);

    // โหลดค่าตั้งค่า PDF
    $('#set_gas_url').val(systemSettings.gas_url || '');
    $('#set_slide_template_id').val(systemSettings.slide_template_id || '');
    $('#set_pdf_folder_id').val(systemSettings.pdf_folder_id || '');   // ✅ เพิ่ม

    // 🌟 อัปเดตช่องเลือกเจ้าหน้าที่ (Tom Select)
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

    const rawFiscal = $('#fiscal_year').val() || '';
    const newSettings = {
        fiscal_year: rawFiscal.trim(),
        eval_round: $('#evaluation_round').val() || '1',
        sign_leave_admin: $('#sign_leave_admin').val() || '',
        gas_url: ($('#set_gas_url').val() || '').trim(),
        slide_template_id: ($('#set_slide_template_id').val() || '').trim(),
        pdf_folder_id: ($('#set_pdf_folder_id').val() || '').trim()   // ✅ เพิ่ม
    };

    const { error } = await db.from('core_system_modules').update({ settings: newSettings, updated_at: new Date().toISOString() }).eq('module_id', 'leave');

    if (error) {
        Swal.fire('ผิดพลาด', error.message, 'error');
    } else {
        systemSettings = newSettings;
        $('#dash-fiscal-badge').text(`ปีงบประมาณ ${systemSettings.fiscal_year} (รอบที่ ${systemSettings.eval_round})`);
        Swal.fire({ icon: 'success', title: 'บันทึกการตั้งค่าสำเร็จ', timer: 1500, showConfirmButton: false });
        loadDashboardStats();
    }
}

// ==========================================
// 2. จัดการแอดมินย่อยและกล่องค้นหา (เปลี่ยนเป็น Tom Select)
// ==========================================
async function loadPersonnelSearch() {
    const { data } = await db.from('core_personnel')
        .select('id, prefix, first_name, last_name, department')
        .order('first_name');

    allPersonnelData = data || [];

    if (data) {
        let htmlSearch = '<option value="">-- พิมพ์เพื่อค้นหา --</option>';
        data.forEach(p => {
            const name = `${p.prefix || ''}${p.first_name} ${p.last_name}`;
            htmlSearch += `<option value="${p.id}">${name}</option>`;
        });

        // ฟังก์ชันช่วยสร้าง Tom Select
        const initTomSelect = (selector, options) => {
            const el = document.querySelector(selector);
            if (!el) return;
            if (el.tomselect) el.tomselect.destroy();
            el.innerHTML = htmlSearch;
            new TomSelect(el, { create: false, dropdownParent: 'body', ...options });
        };

        // 🌟 กำหนดข้อมูลให้ Tom Select
        initTomSelect('#select-new-admin', { placeholder: '-- พิมพ์ค้นหาชื่อบุคลากร --' });
        initTomSelect('#filter-personnel', { placeholder: '-- ดูข้อมูลทุกคน --', allowEmptyOption: true });
        initTomSelect('#sign_leave_admin', { placeholder: '-- เลือกผู้รับผิดชอบ --' });
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
            </tr>
        `).join('');
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

        // 🌟 ล้างค่า Tom Select
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
// 3. แดชบอร์ดสรุปผลและแจ้งเตือน
// ==========================================
async function loadDashboardStats() {
    const { data: leaves, error } = await db.from('leave_requests')
        .select('*, core_personnel(prefix, first_name, last_name)')
        .eq('fiscal_year', systemSettings.fiscal_year)
        .eq('eval_round', systemSettings.eval_round);

    if (error) { console.error(error); return; }

    allLeavesData = leaves || [];
    const validLeaves = allLeavesData.filter(l => l.status !== 'ไม่อนุมัติ');

    const sickDays = validLeaves.filter(l => l.type === 'ลาป่วย').reduce((sum, l) => sum + l.total_days, 0);
    const personalDays = validLeaves.filter(l => l.type === 'ลากิจส่วนตัว').reduce((sum, l) => sum + l.total_days, 0);
    const pendingCount = allLeavesData.filter(l => l.status === 'รออนุมัติ').length;
    const uniquePeople = [...new Set(validLeaves.map(l => l.personnel_id))].length;

    $('#total-sick').html(`${sickDays} <span class="text-sm font-medium text-slate-500">วัน</span>`);
    $('#total-personal').html(`${personalDays} <span class="text-sm font-medium text-slate-500">วัน</span>`);
    $('#total-pending').html(`${pendingCount} <span class="text-sm font-medium text-slate-500">รายการ</span>`);
    $('#total-people').html(`${uniquePeople} <span class="text-sm font-medium text-slate-500">คน</span>`);

    checkLeaveLimits(validLeaves);
    renderTable();
}

function checkLeaveLimits(validLeaves) {
    const personnelStats = {};
    validLeaves.forEach(l => {
        if (!personnelStats[l.personnel_id]) {
            personnelStats[l.personnel_id] = { name: `${l.core_personnel.prefix || ''}${l.core_personnel.first_name} ${l.core_personnel.last_name}`, sick: 0, personal: 0 };
        }
        if (l.type === 'ลาป่วย') personnelStats[l.personnel_id].sick += l.total_days;
        if (l.type === 'ลากิจส่วนตัว') personnelStats[l.personnel_id].personal += l.total_days;
    });

    const alertZone = $('#alert-zone');
    alertZone.empty();
    let hasAlert = false;

    Object.values(personnelStats).forEach(p => {
        if (p.sick >= 25 || p.personal >= 40) {
            hasAlert = true;
            let alertMsg = [];
            if (p.sick >= 25) alertMsg.push(`<span class="text-red-600">ป่วย: ${p.sick}/30 วัน</span>`);
            if (p.personal >= 40) alertMsg.push(`<span class="text-orange-600">ลากิจ: ${p.personal}/45 วัน</span>`);

            alertZone.append(`
                <div class="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-xl shadow-sm">
                    <div class="text-sm">
                        <i class="fas fa-exclamation-triangle text-red-500 mr-2"></i>
                        <span class="font-bold text-slate-800">${p.name}</span>
                        <span class="mx-2 text-slate-400">|</span> 
                        ${alertMsg.join(', ')}
                    </div>
                </div>
            `);
        }
    });

    if (!hasAlert) {
        alertZone.html('<div class="text-center text-emerald-500 py-4 text-sm font-bold"><i class="fas fa-check-circle mr-2"></i> บุคลากรทุกคนยังอยู่ในเกณฑ์ปกติครับ</div>');
    }
}

// ==========================================
// 4. จัดการรายการลา 
// ==========================================
function filterTableByPerson() {
    const personId = $('#filter-personnel').val();
    if (personId) {
        const personName = $('#filter-personnel option:selected').text();
        dataTable.search(personName).draw();
    } else {
        dataTable.search('').draw();
    }
}

function renderTable() {
    if ($.fn.DataTable.isDataTable('#adminLeaveTable')) {
        $('#adminLeaveTable').DataTable().destroy();
    }

    const tbody = document.getElementById('tb-admin-leave');

    if (allLeavesData.length > 0) {
        tbody.innerHTML = allLeavesData.map((l) => {
            const fullName = `${l.core_personnel.prefix || ''}${l.core_personnel.first_name} ${l.core_personnel.last_name}`;
            const fmt = (iso) => { if (!iso) return '-'; const p = iso.split('-'); return `${p[2]}/${p[1]}/${parseInt(p[0]) + 543}`; };

            const isRejected = l.status === 'ไม่อนุมัติ';
            const displayDays = isRejected ? 0 : l.total_days;
            const displayTimes = isRejected ? 0 : 1;

            let statusHtml = '';
            if (l.status === 'รออนุมัติ') {
                statusHtml = '<span class="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold border border-amber-200">รออนุมัติ</span>';
            } else if (l.status === 'อนุมัติ') {
                statusHtml = '<span class="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold border border-emerald-200">อนุมัติ</span>';
            } else {
                const safeComment = l.reject_comment ? l.reject_comment.replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, '<br>') : 'ไม่มีการระบุเหตุผล';
                statusHtml = `<button onclick="showRejectComment('${safeComment}')" class="bg-rose-100 text-rose-700 px-3 py-1 rounded-full text-xs font-bold border border-rose-300 cursor-pointer hover:bg-rose-200 transition shadow-sm hover:scale-105"><i class="fas fa-times-circle mr-1"></i> ไม่อนุมัติ <i class="fas fa-hand-pointer ml-1 animate-pulse"></i></button>`;
            }

            let typeClass = l.type === 'ลาป่วย' ? 'text-blue-600' : (l.type === 'ลากิจส่วนตัว' ? 'text-orange-600' : 'text-rose-600');
            if (isRejected) typeClass = 'text-slate-400 line-through';

            // ✅ PDF Icon หรือ Printer Icon
            let pdfHtml = '';
            if (l.pdf_url) {
                pdfHtml = `<a href="${l.pdf_url}" target="_blank" class="bg-green-50 text-green-600 hover:bg-green-500 hover:text-white px-2 py-1.5 rounded-lg transition shadow-sm mr-1" title="เปิดไฟล์ PDF"><i class="fas fa-file-pdf"></i></a>`;
            } else {
                pdfHtml = `<button onclick="printLeavePDF('${l.id}')" class="bg-blue-50 text-blue-600 hover:bg-blue-500 hover:text-white px-2 py-1.5 rounded-lg transition shadow-sm mr-1" title="สร้างใบลา (PDF)"><i class="fas fa-print"></i></button>`;
            }

            // ปุ่มลบ: เฉพาะ Super Admin หรือสถานะไม่ใช่อนุมัติ
            const canDelete = (isSuperAdmin || l.status !== 'อนุมัติ');
            const deleteBtn = canDelete ? `<button onclick="deleteLeave('${l.id}', '${fullName}')" class="text-slate-300 hover:text-rose-600 transition" title="ลบรายการนี้"><i class="fas fa-trash-alt"></i></button>` : '';

            return `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="text-center text-slate-400 text-xs">${l.id.substring(0, 6)}</td>
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
    } else {
        tbody.innerHTML = '';
    }

    dataTable = $('#adminLeaveTable').DataTable({
        responsive: true,
        scrollX: false,
        language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
        order: [[0, 'desc']],
        columnDefs: [{ orderable: false, targets: [7] }],
        pageLength: 25
    });
}

function initEditFlatpickr() {
    flatpickr(".edit-datepicker", { locale: "th", dateFormat: "Y-m-d", altInput: true, altFormat: "j F Y", onChange: function () { calculateEditDays(); } });
}

function calculateEditDays() {
    const start = $('#edit_start_date').val(), end = $('#edit_end_date').val(), type = $('#edit_leave_type').val();
    if (!start || !end) return;

    let startDate = new Date(start), endDate = new Date(end);
    if (endDate < startDate) {
        Swal.fire('วันที่ไม่ถูกต้อง', 'วันสิ้นสุดต้องไม่มาก่อนวันเริ่มลา', 'warning');
        $('#edit_end_date').val(''); return;
    }

    let count = 0;
    let curDate = new Date(startDate);
    while (curDate <= endDate) {
        const dayOfWeek = curDate.getDay();
        // ✅ เฉพาะ "ลาคลอดบุตร" ที่นับทุกวัน
        if (type === 'ลาคลอดบุตร') {
            count++;
        } else {
            if (dayOfWeek !== 0 && dayOfWeek !== 6) count++;
        }
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

    // 🌟 แก้ตัวแปร 'l' เป็น 'leave' และชี้ไปที่ ID ของฟอร์มแอดมิน
    $('#edit_contact_address').val(leave.contact_address || '');
    $('#edit_phone_number').val(leave.phone_number || '');

    $('#edit_reason').val(leave.reason);
    $('#edit_calc_days').text(leave.total_days);

    $('#editLeaveModal').removeClass('hidden');
}

// อัปเดตฟังก์ชันบันทึกการแก้ไข (ให้ครอบคลุมเบอร์โทร+ที่อยู่)
$('#editLeaveForm').on('submit', async function (e) {
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
        pdf_url: null               // ✅ ล้าง PDF URL เมื่อแก้ไขข้อมูล
    };

    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    const { error } = await db.from('leave_requests').update(updateData).eq('id', id);
    if (error) {
        Swal.fire('ข้อผิดพลาด', error.message, 'error');
    } else {
        closeEditModal();
        Swal.fire({ title: 'บันทึกสำเร็จ', text: 'แก้ไขข้อมูลเรียบร้อย', icon: 'success', timer: 1500, showConfirmButton: false });
        await loadDashboardStats();
    }
});

function closeEditModal() {
    $('#editLeaveModal').addClass('hidden');
    $('#editLeaveForm')[0].reset();
}

let attendanceDataTable = null;
let allAttendanceData = [];

$(document).ready(function () {
    initAttendanceFlatpickr();
});

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

            return `
            <tr class="hover:bg-slate-50">
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
    } else {
        tbody.innerHTML = '';
    }

    attendanceDataTable = $('#attendanceTable').DataTable({
        responsive: true, language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
        order: [[0, 'desc']], columnDefs: [{ orderable: false, targets: [5] }]
    });
}

// 🌟 ระบบเพิ่ม/แก้ไข การขาดลามาสาย (เปลี่ยนเป็น Tom Select เต็มรูปแบบ)
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
        onChange: function (value) {
            const person = allPersonnelData.find(p => p.id === value);
            $('#att_department').val(person?.department || 'ไม่ระบุ/ไม่มีกลุ่มสาระฯ');
        }
    });
    attEl.tomselect.clear(true);

    if (mode === 'add') {
        $('#att_modal_title').html('<i class="fas fa-plus-circle mr-2"></i>เพิ่มรายการ ขาด/มาสาย');
        document.querySelector("#att_record_date")._flatpickr.setDate(new Date());
    } else if (mode === 'edit') {
        $('#att_modal_title').html('<i class="fas fa-edit mr-2"></i>แก้ไขรายการ');
        const record = allAttendanceData.find(r => r.id === id);
        if (record) {
            $('#att_id').val(record.id);
            attEl.tomselect.setValue(record.personnel_id);
            document.querySelector("#att_record_date")._flatpickr.setDate(record.record_date);
            $('#att_record_type').val(record.record_type);
            $('#att_reason').val(record.reason);
        }
    }

    $('#attendanceModal').removeClass('hidden');
}

function closeAttendanceModal() {
    $('#attendanceModal').addClass('hidden');
}

$('#attendanceForm').on('submit', async function (e) {
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
    else {
        closeAttendanceModal();
        Swal.fire({ title: 'บันทึกสำเร็จ', icon: 'success', timer: 1500, showConfirmButton: false });
        await loadAttendanceTable();
    }
});

async function deleteAttendance(id) {
    const { isConfirmed } = await Swal.fire({ title: 'ยืนยันการลบ?', text: 'คุณต้องการลบรายการนี้ใช่หรือไม่?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'ใช่, ลบเลย!' });
    if (isConfirmed) {
        Swal.fire({ title: 'กำลังลบ...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
        const { error } = await db.from('personnel_attendance').delete().eq('id', id);
        if (error) Swal.fire('ผิดพลาด', error.message, 'error');
        else {
            Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1500, showConfirmButton: false });
            await loadAttendanceTable();
        }
    }
}

// ==========================================
// 🌟 ฟังก์ชันพิมพ์ใบลา PDF (พร้อม checkbox, แยกตำแหน่ง)
// ==========================================
async function printLeavePDF(id) {
    if (!systemSettings.gas_url || !systemSettings.slide_template_id || !systemSettings.pdf_folder_id) {
        let missing = [];
        if (!systemSettings.gas_url) missing.push('GAS URL');
        if (!systemSettings.slide_template_id) missing.push('Slide Template ID');
        if (!systemSettings.pdf_folder_id) missing.push('PDF Folder ID');
        return Swal.fire('ตั้งค่าไม่สมบูรณ์', `กรุณาตั้งค่า ${missing.join(', ')} ในเมนู "ตั้งค่าระบบ" ก่อนพิมพ์ PDF`, 'warning');
    }

    Swal.fire({
        title: 'กำลังสร้างไฟล์ PDF...',
        html: 'ระบบกำลังดึงข้อมูลและประมวลผลผ่านระบบส่วนกลาง<br><span class="text-xs text-slate-400">อาจใช้เวลา 5-10 วินาที</span>',
        didOpen: () => Swal.showLoading(),
        allowOutsideClick: false,
        showConfirmButton: false
    });

    try {
        // 1. ดึงข้อมูลใบลา + ข้อมูลบุคลากร
        const { data: leave, error } = await db.from('leave_requests')
            .select('*, core_personnel(*)')
            .eq('id', id)
            .single();
        if (error) throw error;
        const p = leave.core_personnel;

        // 2. ดึงข้อมูลโรงเรียน
        const { data: school } = await db.from('core_school_info').select('*').single();
        const directorName = school?.director_name || '...................................................';
        const schoolName = school?.school_name || '........................';
        const deputyAcademicName = school?.deputy_academic || '...................................................';

        // 3. กำหนดผู้บังคับบัญชา
        let commanderName = '';
        let commanderPosition = '';
        const isDeputyDirector = p.position?.startsWith('รองผู้อำนวยการ');
        if (isDeputyDirector) {
            commanderName = '';
            commanderPosition = '';
        } else {
            const { data: isHead } = await db.from('core_department_heads')
                .select('department_id, department_name')
                .eq('personnel_id', p.id)
                .maybeSingle();
            if (isHead) {
                commanderName = deputyAcademicName;
                commanderPosition = 'รองผู้อำนวยการกลุ่มบริหารวิชาการ';
            } else {
                const { data: headPerson } = await db.from('core_department_heads')
                    .select('core_personnel!inner(prefix, first_name, last_name)')
                    .eq('department_name', p.department)
                    .maybeSingle();
                if (headPerson?.core_personnel) {
                    const head = headPerson.core_personnel;
                    commanderName = `${head.prefix || ''}${head.first_name} ${head.last_name}`;
                    commanderPosition = `หัวหน้ากลุ่มสาระการเรียนรู้${p.department || ''}`;
                } else {
                    commanderName = '...................................................';
                    commanderPosition = '...................................................';
                }
            }
        }

        // 4. ดึงใบลาทั้งหมดสำหรับสถิติ
        const { data: allLeavesStats, error: statsError } = await db.from('leave_requests')
            .select('type, total_days, id, created_at, start_date, end_date')
            .eq('personnel_id', leave.personnel_id)
            .eq('fiscal_year', leave.fiscal_year)
            .neq('status', 'ไม่อนุมัติ')
            .lte('created_at', leave.created_at);
        if (statsError) throw statsError;

        // โครงสร้างสถิติ (เหมือนเดิม)
        const statsData = {
            sick: { prior: { count: 0, days: 0 }, now: { count: 0, days: 0 }, total: { count: 0, days: 0 } },
            personal: { prior: { count: 0, days: 0 }, now: { count: 0, days: 0 }, total: { count: 0, days: 0 } },
            maternity: { prior: { count: 0, days: 0 }, now: { count: 0, days: 0 }, total: { count: 0, days: 0 } },
            other: { prior: { count: 0, days: 0 }, now: { count: 0, days: 0 }, total: { count: 0, days: 0 } }
        };

        for (const l of allLeavesStats) {
            const isCurrent = (l.id === leave.id);
            let category = null;
            if (l.type === 'ลาป่วย') category = 'sick';
            else if (l.type === 'ลากิจส่วนตัว') category = 'personal';
            else if (l.type === 'ลาคลอดบุตร' || l.type === 'ลาไปช่วยเหลือภริยาที่คลอดบุตร') category = 'maternity';
            else category = 'other';
            if (!category) continue;
            if (isCurrent) {
                statsData[category].now.count = 1;
                statsData[category].now.days = l.total_days;
            } else {
                statsData[category].prior.count += 1;
                statsData[category].prior.days += l.total_days;
            }
        }
        for (const cat of ['sick', 'personal', 'maternity', 'other']) {
            statsData[cat].total.count = statsData[cat].prior.count + statsData[cat].now.count;
            statsData[cat].total.days = statsData[cat].prior.days + statsData[cat].now.days;
        }

        // 5. จัดรูปแบบข้อมูล
        const fullName = `${p.prefix || ''}${p.first_name} ${p.last_name}`;
        const position = p.position || 'ครู';
        const rank = p.rank || '';
        const academicStanding = p.academic_standing || '';
        const fullPosition = `${position}${rank ? ' ' + rank : ''}${academicStanding ? ' ' + academicStanding : ''}`;

        const formatDateThai = (isoString) => {
            if (!isoString) return '-';
            const d = new Date(isoString);
            if (isNaN(d.getTime())) return '-';
            const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
            return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
        };

        const thMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
        const sDate = new Date(leave.start_date);
        const eDate = new Date(leave.end_date);
        const wDateObj = new Date(leave.created_at);
        const strWriteDate = `วันที่ ${wDateObj.getDate()} เดือน ${thMonths[wDateObj.getMonth()]} พ.ศ. ${wDateObj.getFullYear() + 543}`;

        // 8. Checkbox และเหตุผลแยกสี
        const leaveType = leave.type;
        const isSick = leaveType === 'ลาป่วย';
        const isPersonal = leaveType === 'ลากิจส่วนตัว';
        const isMaternity = leaveType === 'ลาคลอดบุตร';
        const isOther = !isSick && !isPersonal && !isMaternity;
        const checkSick = isSick ? '☑' : '☐';
        const checkPersonal = isPersonal ? '☑' : '☐';
        const checkMaternity = isMaternity ? '☑' : '☐';
        const checkOther = isOther ? '☑' : '☐';
        let reasonRed = '', reasonBlue = '';
        if (isSick || isPersonal) reasonRed = leave.reason;
        else reasonBlue = leave.reason;
        const leaveTypeForTitle = leaveType;
        const leaveTypeForOther = isOther ? leaveType : '';

        // 9. หาการลาครั้งสุดท้าย
        const previousLeaves = allLeavesStats.filter(l => l.id !== leave.id);
        let lastLeave = null;
        if (previousLeaves.length > 0) {
            previousLeaves.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            lastLeave = previousLeaves[0];
        }
        let lastStartDate = '', lastEndDate = '', lastTotalDays = '';
        let lastCheckSick = '☐', lastCheckPersonal = '☐', lastCheckMaternity = '☐';
        let lastLeaveTypeName = '';
        let lastStartD = '', lastStartM = '', lastStartY = '';
        let lastEndD = '', lastEndM = '', lastEndY = '';
        if (lastLeave && lastLeave.start_date && lastLeave.end_date) {
            const start = new Date(lastLeave.start_date);
            const end = new Date(lastLeave.end_date);
            if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                lastStartDate = formatDateThai(lastLeave.start_date);
                lastEndDate = formatDateThai(lastLeave.end_date);
                lastTotalDays = lastLeave.total_days.toString();
                if (lastLeave.type === 'ลาป่วย') lastCheckSick = '☑';
                else if (lastLeave.type === 'ลากิจส่วนตัว') lastCheckPersonal = '☑';
                else if (lastLeave.type === 'ลาคลอดบุตร' || lastLeave.type === 'ลาไปช่วยเหลือภริยาที่คลอดบุตร') lastCheckMaternity = '☑';
                else lastLeaveTypeName = lastLeave.type;
                lastStartD = start.getDate().toString();
                lastStartM = thMonths[start.getMonth()];
                lastStartY = (start.getFullYear() + 543).toString();
                lastEndD = end.getDate().toString();
                lastEndM = thMonths[end.getMonth()];
                lastEndY = (end.getFullYear() + 543).toString();
            }
        }

        // 10. สร้าง replacements
        const replacements = {
            "{{W_DAY}}": wDateObj.getDate().toString(),
            "{{W_MONTH}}": thMonths[wDateObj.getMonth()],
            "{{W_YEAR}}": (wDateObj.getFullYear() + 543).toString(),
            "{{START_D}}": sDate.getDate().toString(),
            "{{START_M}}": thMonths[sDate.getMonth()],
            "{{START_Y}}": (sDate.getFullYear() + 543).toString(),
            "{{END_D}}": eDate.getDate().toString(),
            "{{END_M}}": thMonths[eDate.getMonth()],
            "{{END_Y}}": (eDate.getFullYear() + 543).toString(),
            "{{WRITE_DATE}}": strWriteDate,
            "{{SCHOOL_NAME}}": schoolName,
            "{{LEAVE_TYPE}}": leaveTypeForTitle,
            "{{LEAVE_TYPE_OTHER}}": leaveTypeForOther,
            "{{FULL_NAME}}": fullName,
            "{{POSITION}}": position,
            "{{RANK}}": rank,
            "{{ACADEMIC_STANDING}}": academicStanding,
            "{{FULL_POSITION}}": fullPosition,
            "{{DEPARTMENT}}": p.department || '-',
            "{{REASON}}": leave.reason,
            "{{START_DATE}}": formatDateThai(leave.start_date),
            "{{END_DATE}}": formatDateThai(leave.end_date),
            "{{TOTAL_DAYS}}": leave.total_days.toString(),
            "{{CONTACT_ADDRESS}}": leave.contact_address || '-',
            "{{PHONE_NUMBER}}": leave.phone_number || '-',
            "{{COMMANDER_NAME}}": commanderName,
            "{{COMMANDER_POSITION}}": commanderPosition,
            "{{DIRECTOR_NAME}}": directorName,
            "{{CHECK_SICK}}": checkSick,
            "{{CHECK_PERSONAL}}": checkPersonal,
            "{{CHECK_MATERNITY}}": checkMaternity,
            "{{CHECK_OTHER}}": checkOther,
            "{{REASON_RED}}": reasonRed,
            "{{REASON_BLUE}}": reasonBlue,
            "{{STAT_SICK_PRIOR}}": statsData.sick.prior.days.toString(),
            "{{STAT_SICK_NOW}}": statsData.sick.now.days.toString(),
            "{{STAT_SICK_TOTAL}}": statsData.sick.total.days.toString(),
            "{{STAT_PERS_PRIOR}}": statsData.personal.prior.days.toString(),
            "{{STAT_PERS_NOW}}": statsData.personal.now.days.toString(),
            "{{STAT_PERS_TOTAL}}": statsData.personal.total.days.toString(),
            "{{STAT_MAT_PRIOR}}": statsData.maternity.prior.days.toString(),
            "{{STAT_MAT_NOW}}": statsData.maternity.now.days.toString(),
            "{{STAT_MAT_TOTAL}}": statsData.maternity.total.days.toString(),
            "{{LAST_START_DATE}}": lastStartDate,
            "{{LAST_END_DATE}}": lastEndDate,
            "{{LAST_TOTAL_DAYS}}": lastTotalDays,
            "{{LAST_CHECK_SICK}}": lastCheckSick,
            "{{LAST_CHECK_PERSONAL}}": lastCheckPersonal,
            "{{LAST_CHECK_MATERNITY}}": lastCheckMaternity,
            "{{LAST_LEAVE_TYPE_NAME}}": lastLeaveTypeName,
            "{{LAST_START_D}}": lastStartD,
            "{{LAST_START_M}}": lastStartM,
            "{{LAST_START_Y}}": lastStartY,
            "{{LAST_END_D}}": lastEndD,
            "{{LAST_END_M}}": lastEndM,
            "{{LAST_END_Y}}": lastEndY,
            "{{A1}}": statsData.sick.prior.count,
            "{{A2}}": statsData.sick.prior.days,
            "{{A3}}": statsData.sick.now.count,
            "{{A4}}": statsData.sick.now.days,
            "{{A5}}": statsData.sick.total.count,
            "{{A6}}": statsData.sick.total.days,
            "{{A7}}": statsData.personal.prior.count,
            "{{A8}}": statsData.personal.prior.days,
            "{{A9}}": statsData.personal.now.count,
            "{{A10}}": statsData.personal.now.days,
            "{{A11}}": statsData.personal.total.count,
            "{{A12}}": statsData.personal.total.days,
            "{{A13}}": statsData.maternity.prior.count,
            "{{A14}}": statsData.maternity.prior.days,
            "{{A15}}": statsData.maternity.now.count,
            "{{A16}}": statsData.maternity.now.days,
            "{{A17}}": statsData.maternity.total.count,
            "{{A18}}": statsData.maternity.total.days,
            "{{A19}}": statsData.other.prior.count,
            "{{A20}}": statsData.other.prior.days,
            "{{A21}}": statsData.other.now.count,
            "{{A22}}": statsData.other.now.days,
            "{{A23}}": statsData.other.total.count,
            "{{A24}}": statsData.other.total.days
        };

        const payload = {
            action: 'generate_pdf',
            templateId: systemSettings.slide_template_id,
            pdfFolderId: systemSettings.pdf_folder_id,
            fileName: `ใบลา_${p.first_name}_${leave.start_date.replace(/-/g, '')}`,
            replacements: replacements
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        const response = await fetch(systemSettings.gas_url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const rawText = await response.text();
        let result;
        try {
            result = JSON.parse(rawText);
        } catch (e) {
            throw new Error('GAS ตอบกลับไม่ใช่ JSON: ' + rawText.substring(0, 200));
        }
        if (result && result.status === 'success' && result.url) {
            // ✅ บันทึก pdf_url ลงฐานข้อมูล
            await db.from('leave_requests').update({ pdf_url: result.url }).eq('id', id);
            Swal.close();
            window.open(result.url, '_blank');
        } else {
            throw new Error(result.message || 'ประมวลผล PDF ไม่สำเร็จ');
        }
    } catch (err) {
        console.error('PrintLeavePDF Error:', err);
        let errorMsg = err.message;
        if (err.name === 'AbortError') errorMsg = 'การเชื่อมต่อหมดเวลา (30 วินาที) กรุณาลองใหม่อีกครั้ง';
        Swal.fire('ผิดพลาด', errorMsg, 'error');
    }
}

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
        input: 'textarea',
        inputPlaceholder: 'พิมพ์เหตุผลที่นี่...',
        showCancelButton: true, confirmButtonColor: '#dc2626', cancelButtonColor: '#64748b', confirmButtonText: '<i class="fas fa-paper-plane mr-2"></i> ยืนยันไม่อนุมัติ', cancelButtonText: 'ยกเลิก',
        inputValidator: (value) => { if (!value) return 'กรุณาระบุเหตุผลด้วยครับ!' }
    });

    if (comment) {
        Swal.fire({ title: 'กำลังอัปเดตข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
        const { error } = await db.from('leave_requests').update({ status: 'ไม่อนุมัติ', reject_comment: comment.trim(), updated_at: new Date().toISOString() }).eq('id', id);
        if (error) Swal.fire('ผิดพลาด', error.message, 'error');
        else { Swal.fire({ icon: 'success', title: 'ไม่อนุมัติเรียบร้อย', timer: 1500, showConfirmButton: false }); await loadDashboardStats(); }
    }
}

async function deleteLeave(id, name) {
    // ✅ ตรวจสอบสถานะและสิทธิ์
    const { data: leave, error: fetchError } = await db.from('leave_requests')
        .select('status')
        .eq('id', id)
        .single();
    
    if (fetchError) {
        Swal.fire('ผิดพลาด', fetchError.message, 'error');
        return;
    }
    
    // ✅ ถ้าสถานะเป็น 'อนุมัติ' และผู้ใช้ไม่ใช่ super_admin → ห้ามลบ
    if (leave.status === 'อนุมัติ' && !isSuperAdmin) {
        Swal.fire('ไม่สามารถลบได้', 'รายการลาที่อนุมัติแล้วไม่สามารถลบได้ เพื่อรักษาความถูกต้องของสถิติ หากจำเป็นต้องลบ โปรดติดต่อ Super Admin', 'warning');
        return;
    }
    
    const { isConfirmed } = await Swal.fire({
        title: 'ลบรายการลานี้?',
        html: `ต้องการลบรายการลาของ <b>${name}</b> หรือไม่?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'ลบข้อมูล'
    });
    
    if (isConfirmed) {
        Swal.fire({ title: 'กำลังลบ...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
        const { error } = await db.from('leave_requests').delete().eq('id', id);
        if (!error) {
            await loadDashboardStats();
            Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1500, showConfirmButton: false });
        } else {
            Swal.fire('ผิดพลาด', error.message, 'error');
        }
    }
}

function exportLeaveReport() {
    if (allLeavesData.length === 0) return Swal.fire('แจ้งเตือน', 'ไม่มีข้อมูลให้ส่งออก', 'info');
    const fmt = (iso) => { if (!iso) return '-'; const p = iso.split('-'); return `${p[2]}/${p[1]}/${parseInt(p[0]) + 543}`; };
    const exportData = allLeavesData.map(l => ({
        'วันที่ส่งใบลา': new Date(l.created_at).toLocaleDateString('th-TH'), 'ชื่อ-สกุล': `${l.core_personnel.prefix || ''}${l.core_personnel.first_name} ${l.core_personnel.last_name}`,
        'ปีงบประมาณ': l.fiscal_year, 'รอบประเมิน': l.eval_round, 'ประเภทการลา': l.type, 'เริ่มวันที่': fmt(l.start_date), 'ถึงวันที่': fmt(l.end_date),
        'จำนวน (วัน)': l.status === 'ไม่อนุมัติ' ? 0 : l.total_days, 'จำนวน (ครั้ง)': l.status === 'ไม่อนุมัติ' ? 0 : 1, 'สาเหตุ': l.reason, 'สถานะ': l.status, 'หมายเหตุ (ถ้าไม่อนุมัติ)': l.reject_comment || ''
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = [{ wch: 15 }, { wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 35 }, { wch: 15 }, { wch: 30 }];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "สรุปการลา"); XLSX.writeFile(wb, `สรุปการลา_ปีงบประมาณ_${systemSettings.fiscal_year}_รอบ${systemSettings.eval_round}.xlsx`);
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
                        total_days: parseInt(row['จำนวน (วัน)']) || 0, reason: row['สาเหตุ'] || 'นำเข้าจากระบบเก่า', fiscal_year: row['ปีงบประมาณ'] || systemSettings.fiscal_year,
                        eval_round: row['รอบประเมิน'] || systemSettings.eval_round, status: row['สถานะ'] || 'อนุมัติ', reject_comment: row['หมายเหตุ (ถ้าไม่อนุมัติ)'] || null
                    });
                    success++;
                }
            }
            await loadDashboardStats(); Swal.fire('สำเร็จ', `นำเข้าข้อมูลการลา ${success} รายการเรียบร้อยแล้ว`, 'success');
        } catch (err) { Swal.fire('ผิดพลาด', err.message, 'error'); }
    }; reader.readAsArrayBuffer(file);
}

function showRejectComment(comment) { Swal.fire({ icon: 'info', title: 'เหตุผลที่ไม่อนุมัติ', html: `<div class="text-left bg-rose-50 p-4 rounded-xl border border-rose-100 text-rose-800 mt-2 font-medium">${comment}</div>`, confirmButtonColor: '#4f46e5', confirmButtonText: 'ปิดหน้าต่าง' }); }