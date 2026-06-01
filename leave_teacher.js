let currentUser = null;
let currentProfile = null;
let systemSettings = null;
let allMyLeaves = [];
let dataTable = null;
let editingOriginalLeaveType = null;

$(document).ready(async function () {
    Swal.fire({ title: 'กำลังโหลดข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    await checkAuth();
    await loadSystemSettings();
    initFlatpickr();
    await loadLeaveData();
    Swal.close();
    document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');
});

// ==========================================
// 1. ตรวจสอบสิทธิ์ (Authentication)
// ==========================================
async function checkAuth() {
    const { data: { session }, error } = await db.auth.getSession();
    if (!session) { window.location.replace('login.html'); return; }

    const { data: profile } = await db.from('core_personnel').select('*').eq('id', session.user.id).single();
    if (!profile) { await db.auth.signOut(); window.location.replace('login.html'); return; }

    currentUser = session.user;
    currentProfile = profile;

    $('#display-name').text(`${profile.prefix || ''}${profile.first_name} ${profile.last_name}`);

    const { data: modAdmin } = await db.from('core_module_admins').select('*').eq('user_id', currentUser.id).eq('module_id', 'leave').maybeSingle();
    if (profile.role === 'super_admin' || profile.role === 'admin' || modAdmin) {
        $('#btnAdminMode').removeClass('hidden').addClass('flex');
    }
}

async function handleLogout() {
    const { isConfirmed } = await Swal.fire({ title: 'ออกจากระบบ?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626' });
    if (isConfirmed) { await db.auth.signOut(); window.location.replace('login.html'); }
}

// ==========================================
// 2. ดึงการตั้งค่าปีงบประมาณและรอบประเมิน
// ==========================================
async function loadSystemSettings() {
    const { data } = await db.from('core_system_modules').select('settings').eq('module_id', 'leave').single();

    systemSettings = data?.settings || {
        fiscal_year: (new Date().getFullYear() + 543).toString(),
        eval_round: '1',
        gas_url: '',
        slide_template_id: '',
        pdf_folder_id: ''
    };

    $('#fiscal-badge').text(`ปีงบประมาณ ${systemSettings.fiscal_year} (รอบที่ ${systemSettings.eval_round})`);
}

// ==========================================
// 3. ระบบคำนวณปฏิทินและวันลา
// ==========================================
function initFlatpickr() {
    const config = {
        locale: 'th',
        dateFormat: 'd/m/Y',
        onChange: function (selectedDates, dateStr, instance) {
            if (selectedDates[0]) {
                const id = instance.element.id;
                const d = selectedDates[0];
                document.getElementById(id + '_iso').value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                instance.element.value = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}`;
            }
            calculateDays();
        },
        onReady: function (selectedDates, dateStr, instance) { updateYear(instance); },
        onMonthChange: function (selectedDates, dateStr, instance) { updateYear(instance); },
        onYearChange: function (selectedDates, dateStr, instance) { updateYear(instance); }
    };

    function updateYear(instance) {
        const yearEl = instance.calendarContainer?.querySelector('.cur-year');
        if (yearEl && parseInt(yearEl.value) < 2400) yearEl.value = parseInt(yearEl.value) + 543;
    }

    flatpickr("#start_date", config);
    flatpickr("#end_date", config);
}

function updateLeaveGuide() {
    const type = $('#leave_type').val();
    const prefix = currentProfile?.prefix || '';
    const gender = getGenderFromPrefix(prefix);
    const isEditMode = $('#leave_id').val() !== '';

    const resetLeaveType = (originalType = '') => {
        if (isEditMode && originalType) {
            $('#leave_type').val(originalType);
        } else {
            $('#leave_type').val('');
        }
        $('#leave_guide').addClass('hidden');
        calculateDays();
    };

    if (type === 'ลาคลอดบุตร' && gender !== 'หญิง') {
        Swal.fire({ icon: 'error', title: 'ไม่สามารถเลือกลาคลอดบุตรได้', text: 'ท่านเป็นเพศชาย ไม่มีสิทธิ์ลาคลอดบุตร', confirmButtonText: 'ตกลง' }).then(() => resetLeaveType(editingOriginalLeaveType));
        return;
    }
    if (type === 'ลาไปช่วยเหลือภริยาที่คลอดบุตร' && gender !== 'ชาย') {
        Swal.fire({ icon: 'error', title: 'ไม่สามารถเลือกลาไปช่วยเหลือภริยาได้', text: 'ท่านเป็นเพศหญิง ไม่มีสิทธิ์ลาไปช่วยเหลือภริยาที่คลอดบุตร', confirmButtonText: 'ตกลง' }).then(() => resetLeaveType(editingOriginalLeaveType));
        return;
    }
    if (type === 'ลาพักผ่อน') {
        Swal.fire({ icon: 'warning', title: 'ไม่สามารถเลือกลาพักผ่อนได้', text: 'ผู้ปฏิบัติงานในสถานศึกษาและได้หยุดราชการตามวันหยุดภาคการศึกษาเกินกว่าวันลาพักผ่อน (ปิดเทอม) ไม่มีสิทธิ์ลาพักผ่อน', confirmButtonText: 'ตกลง' }).then(() => resetLeaveType(editingOriginalLeaveType));
        return;
    }

    const guideBox = $('#leave_guide');
    const guides = {
        "ลาป่วย": "<i class='fas fa-info-circle text-lg mt-0.5'></i> <span>ลาป่วยตั้งแต่ 3 วันทำการขึ้นไป ให้แนบใบรับรองแพทย์ในวันแรกที่มาปฏิบัติราชการ</span>",
        "ลากิจส่วนตัว": "<i class='fas fa-info-circle text-lg mt-0.5'></i> <span>ต้องส่งใบอนุญาตล่วงหน้าก่อนวันลาอย่างน้อย 3 วันทำการ และรอรับการอนุมัติก่อนถึงจะหยุดได้</span>",
        "ลาคลอดบุตร": "<i class='fas fa-info-circle text-lg mt-0.5'></i> <span>ลาคลอดบุตรได้ 90 วัน (นับรวมวันหยุดราชการ) โดยได้รับเงินเดือน และลาเพิ่มได้อีกไม่เกิน 90 วัน (ไม่ได้รับเงินเดือน)</span>",
        "ลาไปช่วยเหลือภริยาที่คลอดบุตร": "<i class='fas fa-info-circle text-lg mt-0.5'></i> <span>ลาได้ครั้งหนึ่งติดต่อกันไม่เกิน 15 วันทำการ โดยต้องลาภายใน 30 วันนับแต่วันที่ภริยาคลอดบุตร</span>"
    };
    if (guides[type]) {
        guideBox.html(guides[type]).removeClass('hidden');
    } else {
        guideBox.addClass('hidden');
    }
    calculateDays();
}

function calculateDays() {
    const startIso = $('#start_date_iso').val();
    const endIso = $('#end_date_iso').val();
    const type = $('#leave_type').val();
    if (!startIso || !endIso || !type) { $('#calc_days').text('0'); return; }
    const startDate = new Date(startIso);
    const endDate = new Date(endIso);
    if (endDate < startDate) {
        Swal.fire({ toast: true, position: 'bottom-end', icon: 'error', title: 'วันสิ้นสุดต้องไม่มาก่อนวันเริ่มต้น', showConfirmButton: false, timer: 2000 });
        $('#calc_days').text('0');
        return;
    }
    let count = 0;
    let curDate = new Date(startDate);
    while (curDate <= endDate) {
        const dayOfWeek = curDate.getDay();
        if (type === 'ลาคลอดบุตร') {
            count++;
        } else {
            if (dayOfWeek !== 0 && dayOfWeek !== 6) count++;
        }
        curDate.setDate(curDate.getDate() + 1);
    }
    $('#calc_days').text(count);
}

function getGenderFromPrefix(prefix) {
    if (!prefix) return 'unknown';
    const malePrefixes = ['นาย', 'ว่าที่ ร.ต.', 'ร.ต.', 'ด.ต.', 'ว่าที่', 'สามเณร', 'พระ', 'หม่อมหลวง'];
    const femalePrefixes = ['นางสาว', 'นาง', 'น.ส.', 'หม่อมหลวงหญิง'];
    if (malePrefixes.some(male => prefix.includes(male) || prefix === male)) return 'ชาย';
    if (femalePrefixes.some(female => prefix.includes(female) || prefix === female)) return 'หญิง';
    return 'unknown';
}

// ==========================================
// 4. จัดการข้อมูล (CRUD)
// ==========================================
async function loadLeaveData() {
    const { data, error } = await db.from('leave_requests')
        .select('*')
        .eq('personnel_id', currentUser.id)
        .order('created_at', { ascending: false });
    if (error) { console.error(error); return; }
    allMyLeaves = data || [];
    const validLeaves = allMyLeaves.filter(l => l.fiscal_year === systemSettings.fiscal_year && l.eval_round === systemSettings.eval_round && l.status !== 'ไม่อนุมัติ');
    let sick = 0, personal = 0, maternity = 0, times = validLeaves.length;
    validLeaves.forEach(l => {
        if (l.type === 'ลาป่วย') sick += l.total_days;
        if (l.type === 'ลากิจส่วนตัว') personal += l.total_days;
        if (l.type === 'ลาคลอดบุตร' || l.type === 'ลาไปช่วยเหลือภริยาที่คลอดบุตร') maternity += l.total_days;
    });
    $('#stat-sick').text(sick);
    $('#stat-personal').text(personal);
    $('#stat-maternity').text(maternity);
    $('#stat-times').text(times);
    renderTable();
}

function renderTable() {
    if ($.fn.DataTable.isDataTable('#leaveTable')) $('#leaveTable').DataTable().destroy();

    const tbody = document.getElementById('tb-leave');

    if (allMyLeaves.length > 0) {
        tbody.innerHTML = allMyLeaves.map(l => {
            const createDate = new Date(l.created_at).toLocaleDateString('th-TH', {
                year: '2-digit',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            const fmt = (iso) => {
                if (!iso) return '-';
                const p = iso.split('-');
                return `${p[2]}/${p[1]}/${parseInt(p[0]) + 543}`;
            };

            const isRejected = l.status === 'ไม่อนุมัติ';
            const displayDays = isRejected ? 0 : l.total_days;
            const displayTimes = isRejected ? 0 : 1;

            let statusHtml = '';
            if (l.status === 'รออนุมัติ') {
                statusHtml = '<span class="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold border border-amber-200"><i class="fas fa-clock mr-1"></i> รออนุมัติ</span>';
            } else if (l.status === 'อนุมัติ') {
                statusHtml = '<span class="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold border border-emerald-200"><i class="fas fa-check-circle mr-1"></i> อนุมัติ</span>';
            } else {
                const safeComment = l.reject_comment ? l.reject_comment.replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, '<br>') : 'ไม่มีการระบุเหตุผล';
                statusHtml = `<button onclick="showRejectComment('${safeComment}')" class="bg-rose-100 text-rose-700 px-3 py-1 rounded-full text-xs font-bold border border-rose-300 cursor-pointer hover:bg-rose-200 transition shadow-sm hover:scale-105"><i class="fas fa-times-circle mr-1"></i> ไม่อนุมัติ <i class="fas fa-hand-pointer ml-1 animate-pulse"></i></button>`;
            }

            let typeClass = l.type === 'ลาป่วย' ? 'text-blue-600' : (l.type === 'ลากิจส่วนตัว' ? 'text-orange-600' : 'text-rose-600');
            if (isRejected) typeClass = 'text-slate-400 line-through';

            // ✅ PDF Button: ถ้ามี PDF URL ให้แสดงไอคอน PDF (เปิดไฟล์เดิม) ถ้าไม่มีให้แสดง Printer (สร้างใหม่)
            let pdfHtml = '';
            if (l.pdf_url) {
                pdfHtml = `<a href="${l.pdf_url}" target="_blank" class="bg-green-50 text-green-600 hover:bg-green-500 hover:text-white px-2 py-1.5 rounded-lg transition shadow-sm mr-1" title="เปิดไฟล์ PDF"><i class="fas fa-file-pdf"></i></a>`;
            } else {
                pdfHtml = `<button onclick="printLeavePDF('${l.id}')" class="bg-blue-50 text-blue-600 hover:bg-blue-500 hover:text-white px-2 py-1.5 rounded-lg transition shadow-sm mr-1" title="สร้างใบลา (PDF)"><i class="fas fa-print"></i></button>`;
            }

            let btnHtml = pdfHtml;
            if (l.status === 'รออนุมัติ') {
                btnHtml += `
                    <button onclick="editLeave('${l.id}')" class="text-yellow-600 hover:text-yellow-700 bg-yellow-50 px-2 py-1.5 rounded-lg transition shadow-sm mr-1" title="แก้ไขใบลา"><i class="fas fa-pen text-xs"></i></button>
                    <button onclick="deleteLeave('${l.id}')" class="text-rose-500 hover:text-rose-700 bg-rose-50 px-2 py-1.5 rounded-lg transition shadow-sm" title="ลบใบลา"><i class="fas fa-trash text-xs"></i></button>
                `;
            }

            return `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="py-3 px-4 text-center text-slate-500 text-xs" data-order="${new Date(l.created_at).getTime()}">${createDate} น.</td>
                <td class="py-3 px-4 font-bold ${typeClass}">${l.type}</td>
                <td class="py-3 px-4 text-slate-600">${fmt(l.start_date)} - ${fmt(l.end_date)}</td>
                <td class="py-3 px-4 text-center font-black ${typeClass}">${displayDays}</td>
                <td class="py-3 px-4 text-center font-black ${typeClass}">${displayTimes}</td>
                <td class="py-3 px-4 text-slate-600 text-xs max-w-[200px] truncate" title="${l.reason}">${l.reason}</td>
                <td class="py-3 px-4 text-center">${statusHtml}</td>
                <td class="py-3 px-4 text-center whitespace-nowrap">${btnHtml}</td>
            </tr>`;
        }).join('');
    } else {
        tbody.innerHTML = '';
    }

    dataTable = $('#leaveTable').DataTable({
        responsive: true,
        scrollX: false,
        language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
        order: [[0, 'desc']],
        columnDefs: [{ orderable: false, targets: [7] }],
        pageLength: 25
    });
}

function openLeaveModal() {
    document.getElementById('leaveForm').reset();
    document.getElementById('leave_id').value = '';
    document.getElementById('start_date_iso').value = '';
    document.getElementById('end_date_iso').value = '';
    document.getElementById('calc_days').innerText = '0';
    document.getElementById('contact_address').value = '';
    document.getElementById('phone_number').value = '';
    editingOriginalLeaveType = null;
    if ($('#start_date')[0] && $('#start_date')[0]._flatpickr) $('#start_date')[0]._flatpickr.clear();
    if ($('#end_date')[0] && $('#end_date')[0]._flatpickr) $('#end_date')[0]._flatpickr.clear();
    $('#leave_guide').addClass('hidden');
    document.getElementById('leaveModal').classList.remove('hidden');
    document.getElementById('leaveModal').classList.add('flex');
}

function closeLeaveModal() {
    document.getElementById('leaveModal').classList.add('hidden');
    document.getElementById('leaveModal').classList.remove('flex');
}

function editLeave(id) {
    const l = allMyLeaves.find(item => item.id === id);
    if (!l) return;
    document.getElementById('leave_id').value = l.id;
    document.getElementById('leave_type').value = l.type;
    document.getElementById('leave_reason').value = l.reason;
    document.getElementById('start_date_iso').value = l.start_date;
    document.getElementById('end_date_iso').value = l.end_date;
    document.getElementById('calc_days').innerText = l.total_days;
    document.getElementById('contact_address').value = l.contact_address || '';
    document.getElementById('phone_number').value = l.phone_number || '';
    editingOriginalLeaveType = l.type;
    const setFp = (iso, idDisplay) => {
        const parts = iso.split('-');
        const y = parseInt(parts[0]), m = parseInt(parts[1]), d = parseInt(parts[2]);
        const fp = $(`#${idDisplay}`)[0]._flatpickr;
        fp.setDate(new Date(y, m - 1, d), false);
        $(`#${idDisplay}`).val(`${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y + 543}`);
    };
    setFp(l.start_date, 'start_date');
    setFp(l.end_date, 'end_date');
    updateLeaveGuide();
    document.getElementById('leaveModal').classList.remove('hidden');
    document.getElementById('leaveModal').classList.add('flex');
}

async function saveLeave(e) {
    e.preventDefault();
    const id = $('#leave_id').val();
    const type = $('#leave_type').val();
    const reason = $('#leave_reason').val().trim();
    const startDate = $('#start_date_iso').val();
    const endDate = $('#end_date_iso').val();
    const totalDays = parseInt($('#calc_days').text());
    const contactAddress = $('#contact_address').val().trim();
    const phoneNumber = $('#phone_number').val().trim();

    if (totalDays <= 0) return Swal.fire('ข้อมูลไม่ถูกต้อง', 'จำนวนวันลาต้องมากกว่า 0 วัน', 'warning');

    Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const payload = {
        personnel_id: currentUser.id,
        type, reason, start_date: startDate, end_date: endDate, total_days: totalDays,
        contact_address: contactAddress, phone_number: phoneNumber,
        fiscal_year: systemSettings.fiscal_year, eval_round: systemSettings.eval_round,
        status: 'รออนุมัติ', reject_comment: null
    };

    try {
        if (id) {
            // ✅ แก้ไข: ล้าง pdf_url ทิ้งเพื่อให้สร้างใหม่ครั้งถัดไป
            const { error } = await db.from('leave_requests').update({
                ...payload,
                pdf_url: null,
                updated_at: new Date().toISOString()
            }).eq('id', id);
            if (error) throw error;
        } else {
            const { error } = await db.from('leave_requests').insert([payload]);
            if (error) throw error;
        }
        closeLeaveModal();
        await loadLeaveData();
        Swal.fire({ icon: 'success', title: 'ส่งใบลาเรียบร้อยแล้ว', text: 'ข้อมูลของคุณถูกส่งเข้าสู่ระบบส่วนกลางแล้ว', timer: 1500, showConfirmButton: false });
    } catch (err) { Swal.fire('เกิดข้อผิดพลาด', err.message, 'error'); }
}

async function deleteLeave(id) {
    const { isConfirmed } = await Swal.fire({ title: 'ยกเลิกใบลา?', text: "ต้องการยกเลิกและลบรายการลานี้ใช่หรือไม่?", icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'ใช่, ลบเลย' });
    if (isConfirmed) {
        Swal.fire({ title: 'กำลังลบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const { error } = await db.from('leave_requests').delete().eq('id', id);
        if (!error) { await loadLeaveData(); Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1500, showConfirmButton: false }); }
        else Swal.fire('ผิดพลาด', error.message, 'error');
    }
}

function exportExcel() {
    if (allMyLeaves.length === 0) return Swal.fire('แจ้งเตือน', 'ไม่มีข้อมูลให้ส่งออก', 'info');
    const fmt = (iso) => { if (!iso) return '-'; const p = iso.split('-'); return `${p[2]}/${p[1]}/${parseInt(p[0]) + 543}`; };
    const exportData = allMyLeaves.map(l => ({
        'วันที่ส่งใบลา': new Date(l.created_at).toLocaleDateString('th-TH'), 'ปีงบประมาณ': l.fiscal_year,
        'รอบประเมิน': l.eval_round, 'ประเภทการลา': l.type, 'เริ่มวันที่': fmt(l.start_date), 'ถึงวันที่': fmt(l.end_date),
        'จำนวน (วัน)': l.status === 'ไม่อนุมัติ' ? 0 : l.total_days, 'จำนวน (ครั้ง)': l.status === 'ไม่อนุมัติ' ? 0 : 1,
        'สาเหตุ': l.reason, 'ที่อยู่ติดต่อ': l.contact_address || '-', 'เบอร์โทรศัพท์': l.phone_number || '-',
        'สถานะ': l.status, 'เหตุผล (กรณีไม่อนุมัติ)': l.reject_comment || ''
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = [{ wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 35 }, { wch: 35 }, { wch: 15 }, { wch: 15 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ประวัติการลา");
    XLSX.writeFile(wb, `ประวัติการลา_${currentProfile.first_name}.xlsx`);
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

function showRejectComment(comment) {
    Swal.fire({
        icon: 'info',
        title: 'เหตุผลที่ไม่อนุมัติ',
        html: `<div class="text-left bg-rose-50 p-4 rounded-xl border border-rose-100 text-rose-800 mt-2 font-medium">${comment}</div>`,
        confirmButtonColor: '#4f46e5',
        confirmButtonText: 'ปิดหน้าต่าง'
    });
}