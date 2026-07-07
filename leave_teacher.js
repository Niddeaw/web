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

async function checkAuth() {
    const result = await checkSessionAndRole('leave', WRK_ROLES.ALLOWED);
    if (!result) return;
    currentUser = result.user;
    currentProfile = result.personnel;
    $('#display-name').text(`${currentProfile.prefix || ''}${currentProfile.first_name} ${currentProfile.last_name}`);
    const isAdmin = isAdminUser(currentProfile.role, false);
    let isModuleAdmin = false;
    if (!isAdmin) {
        const { data: mod } = await db.from('core_module_admins').select('id').eq('user_id', currentUser.id).eq('module_id', 'leave').maybeSingle();
        isModuleAdmin = !!mod;
    }
    if (isAdmin || isModuleAdmin) {
        $('#btnAdminMode').removeClass('hidden').addClass('flex');
    }
}

async function handleLogout() {
    const { isConfirmed } = await Swal.fire({ title: 'ออกจากระบบ?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626' });
    if (isConfirmed) { await db.auth.signOut(); window.location.replace('login.html'); }
}

async function loadSystemSettings() {
    const { data } = await db.from('core_system_modules').select('settings').eq('module_id', 'leave').single();
    systemSettings = data?.settings || {
        fiscal_year: (new Date().getFullYear() + 543).toString(),
        eval_round: '1',
        gas_url: '', slide_template_id: '', pdf_folder_id: ''
    };
    $('#fiscal-badge').text(`ปีงบประมาณ ${systemSettings.fiscal_year} (รอบที่ ${systemSettings.eval_round})`);
}

function initFlatpickr() {
    const config = {
        locale: 'th', dateFormat: 'd/m/Y',
        onChange: function (selectedDates, dateStr, instance) {
            if (selectedDates[0]) {
                const id = instance.element.id;
                const d = selectedDates[0];
                document.getElementById(id + '_iso').value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                instance.element.value = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()+543}`;
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
        if (isEditMode && originalType) $('#leave_type').val(originalType);
        else $('#leave_type').val('');
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
    const guides = {
        "ลาป่วย": "<i class='fas fa-info-circle text-lg mt-0.5'></i> <span>ลาป่วยตั้งแต่ 3 วันทำการขึ้นไป ให้แนบใบรับรองแพทย์ในวันแรกที่มาปฏิบัติราชการ</span>",
        "ลากิจส่วนตัว": "<i class='fas fa-info-circle text-lg mt-0.5'></i> <span>ต้องส่งใบอนุญาตล่วงหน้าก่อนวันลาอย่างน้อย 3 วันทำการ และรอรับการอนุมัติก่อนถึงจะหยุดได้</span>",
        "ลาคลอดบุตร": "<i class='fas fa-info-circle text-lg mt-0.5'></i> <span>ลาคลอดบุตรได้ 90 วัน (นับรวมวันหยุดราชการ) โดยได้รับเงินเดือน และลาเพิ่มได้อีกไม่เกิน 90 วัน (ไม่ได้รับเงินเดือน)</span>",
        "ลาไปช่วยเหลือภริยาที่คลอดบุตร": "<i class='fas fa-info-circle text-lg mt-0.5'></i> <span>ลาได้ครั้งหนึ่งติดต่อกันไม่เกิน 15 วันทำการ โดยต้องลาภายใน 30 วันนับแต่วันที่ภริยาคลอดบุตร</span>"
    };
    if (guides[type]) $('#leave_guide').html(guides[type]).removeClass('hidden');
    else $('#leave_guide').addClass('hidden');
    calculateDays();
}

function calculateDays() {
    const startIso = $('#start_date_iso').val();
    const endIso = $('#end_date_iso').val();
    const type = $('#leave_type').val();
    const days = calculateDaysByType(startIso, endIso, type);
    $('#calc_days').text(days);
}

async function loadLeaveData() {
    const { data, error } = await db.from('leave_requests')
        .select('*')
        .eq('personnel_id', currentUser.id)
        .order('created_at', { ascending: false });
    if (error) { console.error(error); return; }
    allMyLeaves = data || [];

    const validLeaves = allMyLeaves.filter(l => 
        l.fiscal_year === systemSettings.fiscal_year && 
        l.eval_round === systemSettings.eval_round && 
        l.status !== 'ไม่อนุมัติ'
    );

    let sickCount = 0, sickDays = 0;
    let personalCount = 0, personalDays = 0;
    let maternityCount = 0, maternityDays = 0;

    validLeaves.forEach(l => {
        if (l.type === 'ลาป่วย') {
            sickCount++;
            sickDays += l.total_days;
        } else if (l.type === 'ลากิจส่วนตัว') {
            personalCount++;
            personalDays += l.total_days;
        } else if (l.type === 'ลาคลอดบุตร' || l.type === 'ลาไปช่วยเหลือภริยาที่คลอดบุตร') {
            maternityCount++;
            maternityDays += l.total_days;
        }
    });

    const totalCount = sickCount + personalCount + maternityCount;
    const totalDays = sickDays + personalDays + maternityDays;

    $('#stat-sick-count').text(sickCount);
    $('#stat-sick-days').text(sickDays);
    $('#stat-personal-count').text(personalCount);
    $('#stat-personal-days').text(personalDays);
    $('#stat-maternity-count').text(maternityCount);
    $('#stat-maternity-days').text(maternityDays);
    $('#stat-total-count').text(totalCount);
    $('#stat-total-days').text(totalDays);

    renderTable();
}

function renderTable() {
    if ($.fn.DataTable.isDataTable('#leaveTable')) $('#leaveTable').DataTable().destroy();
    const tbody = document.getElementById('tb-leave');
    if (allMyLeaves.length > 0) {
        tbody.innerHTML = allMyLeaves.map(l => {
            const createDate = new Date(l.created_at).toLocaleDateString('th-TH', {
                year: '2-digit', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });
            const fmt = (iso) => { if (!iso) return '-'; const p = iso.split('-'); return `${p[2]}/${p[1]}/${parseInt(p[0])+543}`; };
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
            let pdfHtml = '';
            if (l.pdf_url) {
                pdfHtml = `<a href="${l.pdf_url}" target="_blank" class="bg-green-50 text-green-600 hover:bg-green-500 hover:text-white px-2 py-1.5 rounded-lg transition shadow-sm mr-1" title="เปิดไฟล์ PDF"><i class="fas fa-file-pdf"></i></a>`;
            } else {
                pdfHtml = `<button onclick="printLeavePDF('${l.id}')" class="bg-blue-50 text-blue-600 hover:bg-blue-500 hover:text-white px-2 py-1.5 rounded-lg transition shadow-sm mr-1" title="สร้างใบลา (PDF)"><i class="fas fa-print"></i></button>`;
            }
            let btnHtml = pdfHtml;
            if (l.status === 'รออนุมัติ') {
                btnHtml += `<button onclick="editLeave('${l.id}')" class="text-yellow-600 hover:text-yellow-700 bg-yellow-50 px-2 py-1.5 rounded-lg transition shadow-sm mr-1" title="แก้ไขใบลา"><i class="fas fa-pen text-xs"></i></button>
                            <button onclick="deleteLeave('${l.id}')" class="text-rose-500 hover:text-rose-700 bg-rose-50 px-2 py-1.5 rounded-lg transition shadow-sm" title="ลบใบลา"><i class="fas fa-trash text-xs"></i></button>`;
            }
            return `<tr class="hover:bg-slate-50 transition-colors">
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
        responsive: true, scrollX: false, language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
        order: [[0, 'desc']], columnDefs: [{ orderable: false, targets: [7] }], pageLength: 25
    });
}

function openLeaveModal() {
    document.getElementById('leaveForm').reset();
    $('#leave_id').val('');
    $('#start_date_iso, #end_date_iso').val('');
    $('#calc_days').text('0');
    $('#contact_address, #phone_number').val('');
    editingOriginalLeaveType = null;
    if ($('#start_date')[0] && $('#start_date')[0]._flatpickr) $('#start_date')[0]._flatpickr.clear();
    if ($('#end_date')[0] && $('#end_date')[0]._flatpickr) $('#end_date')[0]._flatpickr.clear();
    $('#leave_guide').addClass('hidden');
    $('#leaveModal').removeClass('hidden').addClass('flex');
}

function closeLeaveModal() {
    $('#leaveModal').addClass('hidden').removeClass('flex');
}

function editLeave(id) {
    const l = allMyLeaves.find(item => item.id === id);
    if (!l) return;
    $('#leave_id').val(l.id);
    $('#leave_type').val(l.type);
    $('#leave_reason').val(l.reason);
    $('#start_date_iso').val(l.start_date);
    $('#end_date_iso').val(l.end_date);
    $('#calc_days').text(l.total_days);
    $('#contact_address').val(l.contact_address || '');
    $('#phone_number').val(l.phone_number || '');
    editingOriginalLeaveType = l.type;
    const setFp = (iso, idDisplay) => {
        if (!iso) return;
        const parts = iso.split('-');
        const y = parseInt(parts[0]), m = parseInt(parts[1]), d = parseInt(parts[2]);
        const fp = $(`#${idDisplay}`)[0]._flatpickr;
        fp.setDate(new Date(y, m-1, d), false);
        $(`#${idDisplay}`).val(`${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${y+543}`);
    };
    setFp(l.start_date, 'start_date');
    setFp(l.end_date, 'end_date');
    updateLeaveGuide();
    $('#leaveModal').removeClass('hidden').addClass('flex');
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
        personnel_id: currentUser.id, type, reason, start_date: startDate, end_date: endDate, total_days: totalDays,
        contact_address: contactAddress, phone_number: phoneNumber,
        fiscal_year: systemSettings.fiscal_year, eval_round: systemSettings.eval_round,
        status: 'รออนุมัติ', reject_comment: null
    };
    try {
        if (id) {
            const { error } = await db.from('leave_requests').update({ ...payload, pdf_url: null, updated_at: new Date().toISOString() }).eq('id', id);
            if (error) throw error;
        } else {
            const { error } = await db.from('leave_requests').insert([payload]);
            if (error) throw error;
        }
        closeLeaveModal();
        await loadLeaveData();
        Swal.fire({ icon: 'success', title: 'ส่งใบลาเรียบร้อยแล้ว', timer: 1500, showConfirmButton: false });
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
    const fmt = (iso) => { if (!iso) return '-'; const p = iso.split('-'); return `${p[2]}/${p[1]}/${parseInt(p[0])+543}`; };
    const exportData = allMyLeaves.map(l => ({
        'วันที่ส่งใบลา': new Date(l.created_at).toLocaleDateString('th-TH'),
        'ปีงบประมาณ': l.fiscal_year, 'รอบประเมิน': l.eval_round, 'ประเภทการลา': l.type,
        'เริ่มวันที่': fmt(l.start_date), 'ถึงวันที่': fmt(l.end_date),
        'จำนวน (วัน)': l.status === 'ไม่อนุมัติ' ? 0 : l.total_days,
        'จำนวน (ครั้ง)': l.status === 'ไม่อนุมัติ' ? 0 : 1,
        'สาเหตุ': l.reason, 'ที่อยู่ติดต่อ': l.contact_address || '-', 'เบอร์โทรศัพท์': l.phone_number || '-',
        'สถานะ': l.status, 'เหตุผล (กรณีไม่อนุมัติ)': l.reject_comment || ''
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = [{ wch:15 }, { wch:12 }, { wch:12 }, { wch:20 }, { wch:15 }, { wch:15 }, { wch:12 }, { wch:12 }, { wch:35 }, { wch:35 }, { wch:15 }, { wch:15 }, { wch:30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ประวัติการลา");
    XLSX.writeFile(wb, `ประวัติการลา_${currentProfile.first_name}.xlsx`);
}

async function printLeavePDF(id) {
    await generateLeavePDF(id, systemSettings);
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