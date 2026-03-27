let currentUser = null;
let currentProfile = null;
let dataTable = null;
let systemSettings = null;
let allLeavesData = [];
let allPersonnelData = [];

$(document).ready(async function() {
    Swal.fire({ title: 'กำลังตรวจสอบสิทธิ์...', didOpen: ()=>Swal.showLoading(), allowOutsideClick: false });
    
    // 1. ตรวจสอบสิทธิ์ (ต้องเป็น Super Admin หรือ Admin ระบบลา)
    const auth = await checkAdminAuth();
    if (!auth.isAdmin) {
        await Swal.fire('ปฏิเสธการเข้าถึง', 'หน้านี้จำกัดเฉพาะผู้ดูแลระบบฝ่ายบุคลากรเท่านั้น', 'error');
        window.location.replace('leave_teacher.html');
        return;
    }

    currentUser = auth.user;
    currentProfile = auth.profile;
    
    // 🌟 โหลดรายชื่อครูก่อน เพื่อเตรียมให้ช่อง Select2 ทั้งหมด
    await loadPersonnelSearch();
    // 🌟 โหลดการตั้งค่าตามมา เพื่อเอาค่าที่เคยตั้งไว้มายัดใส่ช่อง
    await loadSystemSettings();
    
    updateUI();
    await loadDashboardStats();
    
    Swal.close();
    document.getElementById('mainBody').classList.replace('opacity-0','opacity-100');
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
    $('#admin-name').text(`${currentProfile.prefix||''}${currentProfile.first_name} ${currentProfile.last_name}`);
    $('#admin-role').text(currentProfile.role === 'super_admin' ? 'Super Admin' : 'Module Admin');
    
    if (currentProfile.role === 'super_admin') {
        $('#btn-import-excel').removeClass('hidden').addClass('flex');
    } else {
        $('#fiscal_year, #evaluation_round, #btn-save-settings, #select-new-admin, #btn-add-admin, #sign_leave_admin, #sign_hr_deputy, #sign_director').prop('disabled', true);
        $('#superadmin-only-section table').addClass('opacity-50 pointer-events-none');
    }
}

// ==========================================
// ระบบสลับแท็บเมนู
// ==========================================
function switchTab(tabId) {
    $('.tab-content').addClass('hidden');
    $(`#tab-${tabId}`).removeClass('hidden');
    
    $('.sidebar-item').removeClass('sidebar-active');
    $(`#btn-${tabId}`).addClass('sidebar-active');
    
    const titles = { 'dashboard': 'แดชบอร์ดสรุปผล', 'manage-leave': 'จัดการรายการลา', 'settings': 'ตั้งค่าระบบ & แอดมิน' };
    $('#page-title').text(titles[tabId]);

    if(tabId === 'manage-leave') {
        if(dataTable) dataTable.columns.adjust().draw();
    }
}

// ==========================================
// 1. ดึงและบันทึกการตั้งค่าระบบ (Settings & Signatories)
// ==========================================
async function loadSystemSettings() {
    // 1. ดึงการตั้งค่าของระบบลา (เลือกแค่เจ้าหน้าที่)
    const { data: leaveData } = await db.from('core_system_modules').select('settings').eq('module_id', 'leave').single();
    
    systemSettings = leaveData?.settings || { 
        fiscal_year: (new Date().getFullYear() + 543).toString(), 
        eval_round: '1',
        sign_leave_admin: ''
    };

    $('#fiscal_year').val(systemSettings.fiscal_year);
    $('#evaluation_round').val(systemSettings.eval_round);
    $('#dash-fiscal-badge').text(`ปีงบประมาณ ${systemSettings.fiscal_year} (รอบที่ ${systemSettings.eval_round})`);
    
    // อัปเดตช่องเลือกเจ้าหน้าที่
    $('#sign_leave_admin').val(systemSettings.sign_leave_admin).trigger('change');

    // 2. ดึงข้อมูล ผอ. และ รองฯ จากส่วนกลาง (ตาราง core_school_info)
    const { data: schoolData } = await db.from('core_school_info').select('*').single();
    if (schoolData) {
        // 💡 หมายเหตุ: หากคอลัมน์ชื่อ ผอ. หรือ รองฯ ในฐานข้อมูลคุณครูใช้ชื่ออื่น ให้เปลี่ยนตรง .director_name ด้านล่างได้เลยครับ
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
        sign_leave_admin: $('#sign_leave_admin').val()
        // ไม่ต้องบันทึก ผอ. และ รองฯ แล้ว เพราะใช้ข้อมูลจากส่วนกลางตลอด
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
// 2. จัดการแอดมินย่อยและกล่องค้นหา (Select2)
// ==========================================
async function loadPersonnelSearch() {
    const { data } = await db.from('core_personnel').select('id, prefix, first_name, last_name').order('first_name');
    allPersonnelData = data || [];

    if (data) {
        let htmlSearch = '<option value="">-- พิมพ์เพื่อค้นหา --</option>';
        data.forEach(p => {
            const name = `${p.prefix||''}${p.first_name} ${p.last_name}`;
            htmlSearch += `<option value="${p.id}">${name}</option>`;
        });
        
        // กำหนดข้อมูลให้ Select2 ของหน้าตั้งค่าแอดมินและกล่องค้นหา
        $('#select-new-admin').html(htmlSearch).select2({ placeholder: '-- พิมพ์ค้นหาชื่อบุคลากร --', width: '100%' });
        $('#filter-personnel').html(htmlSearch).select2({ placeholder: '-- ดูข้อมูลทุกคน --', allowClear: true, width: '100%' });

        // กำหนดข้อมูลให้ Select2 ของผู้ลงนามใบลา
        $('.select2-personnel').html(htmlSearch).select2({ width: '100%' });
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
                <td class="p-3 font-bold text-slate-700">${admin.core_personnel?.prefix||''}${admin.core_personnel?.first_name||''} ${admin.core_personnel?.last_name||''}</td>
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
        if(error.code === '23505') Swal.fire('ซ้ำซ้อน', 'บุคลากรท่านนี้เป็นแอดมินอยู่แล้ว', 'warning');
        else Swal.fire('ผิดพลาด', error.message, 'error');
    } else {
        Swal.fire({ icon: 'success', title: 'แต่งตั้งสำเร็จ', timer: 1500, showConfirmButton: false });
        $('#select-new-admin').val(null).trigger('change');
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
// 3. แดชบอร์ดสรุปผลและแจ้งเตือน (Dashboard)
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
            personnelStats[l.personnel_id] = { name: `${l.core_personnel.prefix||''}${l.core_personnel.first_name} ${l.core_personnel.last_name}`, sick: 0, personal: 0 };
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
            if(p.sick >= 25) alertMsg.push(`<span class="text-red-600">ป่วย: ${p.sick}/30 วัน</span>`);
            if(p.personal >= 40) alertMsg.push(`<span class="text-orange-600">ลากิจ: ${p.personal}/45 วัน</span>`);

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

    if(!hasAlert) {
        alertZone.html('<div class="text-center text-emerald-500 py-4 text-sm font-bold"><i class="fas fa-check-circle mr-2"></i> บุคลากรทุกคนยังอยู่ในเกณฑ์ปกติครับ</div>');
    }
}

// ==========================================
// 4. จัดการรายการลา (DataTables & Approve/Reject)
// ==========================================
function filterTableByPerson() {
    const personId = $('#filter-personnel').val();
    if(personId) {
        const personName = $('#filter-personnel option:selected').text();
        dataTable.search(personName).draw();
    } else {
        dataTable.search('').draw();
    }
}

function renderTable() {
    if($.fn.DataTable.isDataTable('#adminLeaveTable')) $('#adminLeaveTable').DataTable().destroy();
    
    const tbody = document.getElementById('tb-admin-leave');
    
    if(allLeavesData.length > 0) {
        tbody.innerHTML = allLeavesData.map((l) => {
            const fullName = `${l.core_personnel.prefix||''}${l.core_personnel.first_name} ${l.core_personnel.last_name}`;
            const fmt = (iso) => { if(!iso) return '-'; const p = iso.split('-'); return `${p[2]}/${p[1]}/${parseInt(p[0])+543}`; };
            
            const isRejected = l.status === 'ไม่อนุมัติ';
            const displayDays = isRejected ? 0 : l.total_days;
            const displayTimes = isRejected ? 0 : 1; 

// 🌟 ระบบแสดงสถานะแบบกดดูเหตุผลได้
            let statusHtml = '';
            if(l.status === 'รออนุมัติ') {
                statusHtml = '<span class="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold border border-amber-200">รออนุมัติ</span>';
            } else if(l.status === 'อนุมัติ') {
                statusHtml = '<span class="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold border border-emerald-200">อนุมัติ</span>';
            } else {
                // แปลงข้อความให้ปลอดภัยก่อนส่งเข้าฟังก์ชัน
                const safeComment = l.reject_comment ? l.reject_comment.replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, '<br>') : 'ไม่มีการระบุเหตุผล';
                statusHtml = `<button onclick="showRejectComment('${safeComment}')" class="bg-rose-100 text-rose-700 px-3 py-1 rounded-full text-xs font-bold border border-rose-300 cursor-pointer hover:bg-rose-200 transition shadow-sm hover:scale-105"><i class="fas fa-times-circle mr-1"></i> ไม่อนุมัติ <i class="fas fa-hand-pointer ml-1 animate-pulse"></i></button>`;
            }

            let typeClass = l.type === 'ลาป่วย' ? 'text-blue-600' : (l.type === 'ลากิจส่วนตัว' ? 'text-orange-600' : 'text-rose-600');
            if (isRejected) typeClass = 'text-slate-400 line-through';

            // 🌟 เพิ่มปุ่มปริ้น PDF สีฟ้าไว้ด้านหน้าสุดของกลุ่มปุ่มจัดการ
            return `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="text-center text-slate-400 text-xs">${l.id.substring(0,6)}</td>
                <td class="font-bold text-slate-700">${fullName}</td>
                <td class="font-bold ${typeClass}">${l.type}</td>
                <td class="text-slate-600">${fmt(l.start_date)} - ${fmt(l.end_date)}</td>
                <td class="text-center font-black ${typeClass}">${displayDays}</td>
                <td class="text-center font-black ${typeClass}">${displayTimes}</td>
                <td class="text-center">${statusHtml}</td>
                <td class="text-center whitespace-nowrap">
                    <button onclick="printLeavePDF('${l.id}')" class="bg-blue-50 text-blue-600 hover:bg-blue-500 hover:text-white px-2 py-1.5 rounded-lg transition shadow-sm mr-1" title="ปริ้นใบลา (PDF)"><i class="fas fa-print"></i></button>
                    <button onclick="updateStatus('${l.id}', 'อนุมัติ')" class="bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white px-2 py-1.5 rounded-lg transition shadow-sm mr-1" title="อนุมัติ"><i class="fas fa-check"></i></button>
                    <button onclick="rejectLeave('${l.id}')" class="bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white px-2 py-1.5 rounded-lg transition shadow-sm mr-2" title="ไม่อนุมัติ (ระบุเหตุผล)"><i class="fas fa-times"></i></button>
                    <button onclick="deleteLeave('${l.id}', '${fullName}')" class="text-slate-300 hover:text-rose-600 transition" title="ลบรายการนี้"><i class="fas fa-trash-alt"></i></button>
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

// 🌟 ฟังก์ชันเตรียมสร้าง PDF
function printLeavePDF(id) {
    Swal.fire({
        icon: 'info',
        title: 'ระบบพิมพ์ใบลา',
        text: 'กำลังอยู่ในขั้นตอนพัฒนาฟังก์ชันออกเอกสาร PDF ครับ (ข้อมูลผู้ลงนามถูกบันทึกเตรียมไว้ในระบบแล้ว)',
        confirmButtonColor: '#4f46e5'
    });
    // โค้ดดึงข้อมูลมาวาด PDF ด้วย pdfMake/jsPDF จะอยู่ตรงนี้ในอนาคตครับ
}

async function updateStatus(id, newStatus) {
    Swal.fire({ title: 'กำลังอัปเดตสถานะ...', didOpen: ()=>Swal.showLoading(), allowOutsideClick: false });
    const { error } = await db.from('leave_requests').update({ status: newStatus, reject_comment: null, updated_at: new Date().toISOString() }).eq('id', id);
    
    if(error) {
        Swal.fire('ผิดพลาด', error.message, 'error');
    } else {
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
        inputAttributes: { 'aria-label': 'พิมพ์เหตุผลที่นี่' },
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#64748b',
        confirmButtonText: '<i class="fas fa-paper-plane mr-2"></i> ยืนยันไม่อนุมัติ',
        cancelButtonText: 'ยกเลิก',
        inputValidator: (value) => { if (!value) return 'กรุณาระบุเหตุผลด้วยครับ!' }
    });

    if (comment) {
        Swal.fire({ title: 'กำลังอัปเดตข้อมูล...', didOpen: ()=>Swal.showLoading(), allowOutsideClick: false });
        
        const { error } = await db.from('leave_requests')
            .update({ status: 'ไม่อนุมัติ', reject_comment: comment.trim(), updated_at: new Date().toISOString() })
            .eq('id', id);
        
        if (error) Swal.fire('ผิดพลาด', error.message, 'error');
        else {
            Swal.fire({ icon: 'success', title: 'ไม่อนุมัติเรียบร้อย', timer: 1500, showConfirmButton: false });
            await loadDashboardStats(); 
        }
    }
}

async function deleteLeave(id, name) {
    const { isConfirmed } = await Swal.fire({ title: 'ลบรายการลานี้?', html: `ต้องการลบรายการลาของ <b>${name}</b> หรือไม่?`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'ลบข้อมูล' });
    if(isConfirmed) {
        Swal.fire({ title: 'กำลังลบ...', didOpen: ()=>Swal.showLoading(), allowOutsideClick: false });
        const { error } = await db.from('leave_requests').delete().eq('id', id);
        if(!error) { await loadDashboardStats(); Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1500, showConfirmButton: false}); }
        else Swal.fire('ผิดพลาด', error.message, 'error');
    }
}

// ==========================================
// 5. ส่งออก Excel (Export/Import)
// ==========================================
function exportLeaveReport() {
    if(allLeavesData.length === 0) return Swal.fire('แจ้งเตือน', 'ไม่มีข้อมูลให้ส่งออก', 'info');
    
    const fmt = (iso) => { if(!iso) return '-'; const p = iso.split('-'); return `${p[2]}/${p[1]}/${parseInt(p[0])+543}`; };
    
    const exportData = allLeavesData.map(l => ({
        'วันที่ส่งใบลา': new Date(l.created_at).toLocaleDateString('th-TH'),
        'ชื่อ-สกุล': `${l.core_personnel.prefix||''}${l.core_personnel.first_name} ${l.core_personnel.last_name}`,
        'ปีงบประมาณ': l.fiscal_year,
        'รอบประเมิน': l.eval_round,
        'ประเภทการลา': l.type,
        'เริ่มวันที่': fmt(l.start_date),
        'ถึงวันที่': fmt(l.end_date),
        'จำนวน (วัน)': l.status === 'ไม่อนุมัติ' ? 0 : l.total_days, 
        'จำนวน (ครั้ง)': l.status === 'ไม่อนุมัติ' ? 0 : 1, 
        'สาเหตุ': l.reason,
        'สถานะ': l.status,
        'หมายเหตุ (ถ้าไม่อนุมัติ)': l.reject_comment || '' 
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = [{wch:15}, {wch:25}, {wch:12}, {wch:12}, {wch:15}, {wch:15}, {wch:15}, {wch:12}, {wch:12}, {wch:35}, {wch:15}, {wch:30}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "สรุปการลา");
    XLSX.writeFile(wb, `สรุปการลา_ปีงบประมาณ_${systemSettings.fiscal_year}_รอบ${systemSettings.eval_round}.xlsx`);
}

async function importLeaveExcel(event) {
    const file = event.target.files[0]; if(!file) return;
    event.target.value = '';

    Swal.fire({ title: 'กำลังนำเข้าข้อมูล...', html: 'กรุณารอสักครู่ ระบบกำลังอ่านไฟล์ Excel', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const reader = new FileReader();
    reader.onload = async(e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type:'array'});
            const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {raw:false});

            if(rows.length === 0) throw new Error('ไม่พบข้อมูลในไฟล์ Excel');

            let success = 0;
            for(let row of rows) {
                const fullName = row['ชื่อ-สกุล'] ? row['ชื่อ-สกุล'].trim() : '';
                const person = allPersonnelData.find(p => `${p.prefix||''}${p.first_name} ${p.last_name}` === fullName || `${p.first_name} ${p.last_name}` === fullName);

                if(person) {
                    const parseDate = (d) => { 
                        if(!d) return null; 
                        const p = d.split('/'); 
                        return `${parseInt(p[2])-543}-${p[1]}-${p[0]}`; 
                    };

                    await db.from('leave_requests').insert({
                        personnel_id: person.id,
                        type: row['ประเภทการลา'] || 'ลาป่วย',
                        start_date: parseDate(row['เริ่มวันที่']),
                        end_date: parseDate(row['ถึงวันที่']),
                        total_days: parseInt(row['จำนวน (วัน)']) || 0,
                        reason: row['สาเหตุ'] || 'นำเข้าจากระบบเก่า',
                        fiscal_year: row['ปีงบประมาณ'] || systemSettings.fiscal_year,
                        eval_round: row['รอบประเมิน'] || systemSettings.eval_round,
                        status: row['สถานะ'] || 'อนุมัติ',
                        reject_comment: row['หมายเหตุ (ถ้าไม่อนุมัติ)'] || null
                    });
                    success++;
                }
            }

            await loadDashboardStats();
            Swal.fire('สำเร็จ', `นำเข้าข้อมูลการลา ${success} รายการเรียบร้อยแล้ว`, 'success');
        } catch (err) { Swal.fire('ผิดพลาด', err.message, 'error'); }
    };
    reader.readAsArrayBuffer(file);
}

// 🌟 ฟังก์ชันแสดงเหตุผลที่ไม่อนุมัติผ่าน SweetAlert (หน้า Admin)
function showRejectComment(comment) {
    Swal.fire({
        icon: 'info',
        title: 'เหตุผลที่ไม่อนุมัติ',
        html: `<div class="text-left bg-rose-50 p-4 rounded-xl border border-rose-100 text-rose-800 mt-2 font-medium">${comment}</div>`,
        confirmButtonColor: '#4f46e5',
        confirmButtonText: 'ปิดหน้าต่าง'
    });
}