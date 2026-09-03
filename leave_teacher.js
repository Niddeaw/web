// ============================================================
// leave_teacher.js — ระบบการลา (ฝ่ายผู้ใช้งาน/ครู)
// ใช้ window object ทั้งหมด เพื่อป้องกัน Identifier conflict
// ปรับปรุงให้รองรับการคำนวณวันลาตามวันหยุดของโรงเรียน (ผ่าน leave_core.js)
// ============================================================

window.currentUser = null;
window.currentProfile = null;
window.currentUserId = null;
window.currentUserRole = '';
window.isAdminMode = false;
window.isModuleAdmin = false;
window.systemSettings = null;
window.allMyLeaves = [];
window.dataTable = null;
window.editingOriginalLeaveType = null;

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
// INIT
// ==========================================
$(document).ready(async function () {
    Swal.fire({ title: 'กำลังโหลดข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    try {
        await window.checkAuth();
        await window.loadSystemSettings();
        window.initFlatpickr();
        await window.loadLeaveData();
        Swal.close();
        document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');
    } catch (err) {
        console.error('Initialization error:', err);
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
});

// ==========================================
// ตรวจสอบสิทธิ์ และประกาศ Global Variables
// ==========================================
window.checkAuth = async function () {
    const result = await window.checkSessionAndRole('leave_teacher');
    if (!result) return;
    const { user, personnel, role, isAdmin, isTeacher } = result;
    window.currentUser = user;
    window.currentProfile = personnel;
    window.currentUserId = user.id;
    window.currentUserRole = role;
    window.isAdminMode = isAdmin;
    window.isModuleAdmin = await window.hasModuleAccess(role, 'leave', user.id);
    window.currentProfile = window.currentProfile;
    window.currentUserRole = window.currentUserRole;
    window.isModuleAdmin = window.isModuleAdmin;
    window.isAdminMode = window.isAdminMode;

    $('#display-name').text(`${window.currentProfile.prefix || ''}${window.currentProfile.first_name} ${window.currentProfile.last_name}`);
    if (window.isAdminMode || window.isModuleAdmin) {
        $('#btnAdminMode').removeClass('hidden').addClass('flex');
    } else {
        $('#btnAdminMode').addClass('hidden').removeClass('flex');
    }
    await window.logUserAction('เข้าสู่ระบบการลา (ครู)', 'leave');
};

// ==========================================
// ระบบตั้งค่า
// ==========================================
window.loadSystemSettings = async function () {
    const { data } = await db.from('core_system_modules').select('settings').eq('module_id', 'leave').single();
    window.systemSettings = data?.settings || {
        fiscal_year: (new Date().getFullYear() + 543).toString(),
        eval_round: '1',
        gas_url: '', slide_template_id: '', pdf_folder_id: '', evidence_folder_id: ''
    };
    $('#fiscal-badge').text(`ปีงบประมาณ ${window.systemSettings.fiscal_year} (รอบที่ ${window.systemSettings.eval_round})`);
};

// ==========================================
// Flatpickr (ปรับ onChange ให้เรียก calculateDays() โดยไม่ต้อง await)
// ==========================================
window.initFlatpickr = function () {
    function updateYear(instance) {
        const yearEl = instance.calendarContainer?.querySelector('.cur-year');
        if (yearEl && parseInt(yearEl.value) < 2400) yearEl.value = parseInt(yearEl.value) + 543;
    }

    // ฟังก์ชัน helper สำหรับ onChange ที่เรียก calculateDays() 
    // และไม่ต้องรอผล (fire-and-forget) เพื่อไม่ให้ UI ค้าง
    const handleDateChange = function (selectedDates, dateStr, instance) {
        if (selectedDates[0]) {
            const id = instance.element.id;
            const d = selectedDates[0];
            document.getElementById(id + '_iso').value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            instance.element.value = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}`;
        }
        // เรียก calculateDays() โดยไม่ต้อง await (async function แต่ไม่ต้องรอ)
        window.calculateDays();
    };

    const config = {
        locale: 'th', dateFormat: 'd/m/Y',
        onChange: handleDateChange,
        onReady: function (selectedDates, dateStr, instance) { updateYear(instance); },
        onMonthChange: function (selectedDates, dateStr, instance) { updateYear(instance); },
        onYearChange: function (selectedDates, dateStr, instance) { updateYear(instance); }
    };
    flatpickr("#start_date", config);
    flatpickr("#end_date", config);
    // flatpickr สำหรับ submitted_date
    flatpickr("#submitted_date", {
        locale: 'th',
        dateFormat: 'd/m/Y',
        onChange: function (selectedDates, dateStr, instance) {
            if (selectedDates[0]) {
                const d = selectedDates[0];
                document.getElementById('submitted_date_iso').value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                instance.element.value = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}`;
            }
        },
        onReady: function (selectedDates, dateStr, instance) { updateYear(instance); },
        onMonthChange: function (selectedDates, dateStr, instance) { updateYear(instance); },
        onYearChange: function (selectedDates, dateStr, instance) { updateYear(instance); }
    });
};

// ==========================================
// ฟังก์ชันคำนวณวันลา (เวอร์ชัน async รองรับวันหยุด)
// ==========================================
window.calculateDays = async function () {
    const startIso = $('#start_date_iso').val();
    const endIso = $('#end_date_iso').val();
    const type = $('#leave_type').val();
    const isHalfDay = $('#is_half_day').is(':checked');
    const days = await window.calculateDaysWithHalfDay(startIso, endIso, type, isHalfDay);
    $('#calc_days').text(days % 1 === 0 ? days : days.toFixed(1));

    // จัดการช่องอัปโหลดหลักฐาน (ถ้ามี)
    const wrapper = $('#evidence_upload_wrapper');
    if (wrapper.length) {
        const fileInput = $('#evidence_file');
        if (days >= 3) {
            wrapper.removeClass('hidden');
            fileInput.prop('required', true);
        } else {
            wrapper.addClass('hidden');
            fileInput.prop('required', false);
            fileInput.val('');
        }
    }
};

// ==========================================
// อัปเดตคำแนะนำตามประเภทการลา
// ==========================================
window.updateLeaveGuide = function () {
    const type = $('#leave_type').val();
    const prefix = window.currentProfile?.prefix || '';
    const gender = window.getGenderFromPrefix(prefix);
    const isEditMode = $('#leave_id').val() !== '';
    const resetLeaveType = (originalType = '') => {
        if (isEditMode && originalType) $('#leave_type').val(originalType);
        else $('#leave_type').val('');
        $('#leave_guide').addClass('hidden');
        window.calculateDays(); // ไม่ต้อง await
    };
    if (type === 'ลาคลอดบุตร' && gender !== 'หญิง') {
        Swal.fire({ icon: 'error', title: 'ไม่สามารถเลือกลาคลอดบุตรได้', text: 'ท่านเป็นเพศชาย ไม่มีสิทธิ์ลาคลอดบุตร', confirmButtonText: 'ตกลง' }).then(() => resetLeaveType(window.editingOriginalLeaveType));
        return;
    }
    if (type === 'ลาไปช่วยเหลือภริยาที่คลอดบุตร' && gender !== 'ชาย') {
        Swal.fire({ icon: 'error', title: 'ไม่สามารถเลือกลาไปช่วยเหลือภริยาได้', text: 'ท่านเป็นเพศหญิง ไม่มีสิทธิ์ลาไปช่วยเหลือภริยาที่คลอดบุตร', confirmButtonText: 'ตกลง' }).then(() => resetLeaveType(window.editingOriginalLeaveType));
        return;
    }
    if (type === 'ลาพักผ่อน') {
        Swal.fire({ icon: 'warning', title: 'ไม่สามารถเลือกลาพักผ่อนได้', text: 'ผู้ปฏิบัติงานในสถานศึกษาและได้หยุดราชการตามวันหยุดภาคการศึกษาเกินกว่าวันลาพักผ่อน (ปิดเทอม) ไม่มีสิทธิ์ลาพักผ่อน', confirmButtonText: 'ตกลง' }).then(() => resetLeaveType(window.editingOriginalLeaveType));
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
    window.calculateDays(); // ไม่ต้อง await
};

// ==========================================
// โหลดข้อมูลการลา
// ==========================================
window.loadLeaveData = async function () {
    const { data, error } = await db.from('leave_requests')
        .select('*')
        .eq('personnel_id', window.currentUser.id)
        .order('created_at', { ascending: false });
    if (error) { console.error(error); return; }
    window.allMyLeaves = data || [];

    const approvedLeaves = window.allMyLeaves.filter(l =>
        l.fiscal_year === window.systemSettings.fiscal_year &&
        l.eval_round === window.systemSettings.eval_round &&
        l.status === 'อนุมัติ'
    );

    let sickCount = 0, sickDays = 0;
    let personalCount = 0, personalDays = 0;
    let maternityCount = 0, maternityDays = 0;
    approvedLeaves.forEach(l => {
        if (l.type === 'ลาป่วย') { sickCount++; sickDays += l.total_days; }
        else if (l.type === 'ลากิจส่วนตัว') { personalCount++; personalDays += l.total_days; }
        else if (l.type === 'ลาคลอดบุตร' || l.type === 'ลาไปช่วยเหลือภริยาที่คลอดบุตร') { maternityCount++; maternityDays += l.total_days; }
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

    window.renderTable();
};

// ==========================================
// แสดงตาราง
// ==========================================
window.renderTable = function () {
    if ($.fn.DataTable.isDataTable('#leaveTable')) $('#leaveTable').DataTable().destroy();
    const tbody = document.getElementById('tb-leave');
    if (window.allMyLeaves.length > 0) {
        tbody.innerHTML = window.allMyLeaves.map(l => {
            const createDate = new Date(l.created_at).toLocaleDateString('th-TH', {
                year: '2-digit', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });
            const fmt = (iso) => { if (!iso) return '-'; const p = iso.split('-'); return `${p[2]}/${p[1]}/${parseInt(p[0]) + 543}`; };
            const isRejected = l.status === 'ไม่อนุมัติ';
            const displayDays = isRejected ? 0 : (l.is_half_day ? 0.5 : l.total_days);
            const displayTimes = isRejected ? 0 : 1;
            let statusHtml = '';
            if (l.status === 'รออนุมัติ') {
                statusHtml = '<span class="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold border border-amber-200"><i class="fas fa-clock mr-1"></i> รออนุมัติ</span>';
            } else if (l.status === 'อนุมัติ') {
                statusHtml = '<span class="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold border border-emerald-200"><i class="fas fa-check-circle mr-1"></i> อนุมัติ</span>';
            } else {
                const safeComment = l.reject_comment ? l.reject_comment.replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, '<br>') : 'ไม่มีการระบุเหตุผล';
                statusHtml = `<button onclick="window.showRejectComment('${safeComment}')" class="bg-rose-100 text-rose-700 px-3 py-1 rounded-full text-xs font-bold border border-rose-300 cursor-pointer hover:bg-rose-200 transition shadow-sm hover:scale-105"><i class="fas fa-times-circle mr-1"></i> ไม่อนุมัติ <i class="fas fa-hand-pointer ml-1 animate-pulse"></i></button>`;
            }
            let typeClass = l.type === 'ลาป่วย' ? 'text-blue-600' : (l.type === 'ลากิจส่วนตัว' ? 'text-orange-600' : 'text-rose-600');
            if (isRejected) typeClass = 'text-slate-400 line-through';
            let pdfHtml = '';
            if (l.pdf_url) {
                pdfHtml = `<a href="${l.pdf_url}" target="_blank" class="bg-green-50 text-green-600 hover:bg-green-500 hover:text-white px-2 py-1.5 rounded-lg transition shadow-sm mr-1" title="เปิดไฟล์ PDF"><i class="fas fa-file-pdf"></i></a>`;
            } else {
                pdfHtml = `<button onclick="window.generateLeavePDF('${l.id}', window.systemSettings)" class="bg-blue-50 text-blue-600 hover:bg-blue-500 hover:text-white px-2 py-1.5 rounded-lg transition shadow-sm mr-1" title="สร้างใบลา (PDF)"><i class="fas fa-print"></i></button>`;
            }
            let btnHtml = pdfHtml;
            if (l.status === 'รออนุมัติ') {
                btnHtml += `<button onclick="window.editLeave('${l.id}')" class="text-yellow-600 hover:text-yellow-700 bg-yellow-50 px-2 py-1.5 rounded-lg transition shadow-sm mr-1" title="แก้ไขใบลา"><i class="fas fa-pen text-xs"></i></button>
                            <button onclick="window.deleteLeave('${l.id}')" class="text-rose-500 hover:text-rose-700 bg-rose-50 px-2 py-1.5 rounded-lg transition shadow-sm" title="ลบใบลา"><i class="fas fa-trash text-xs"></i></button>`;
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
    window.dataTable = $('#leaveTable').DataTable({
        responsive: true, scrollX: false, language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
        order: [[0, 'desc']], columnDefs: [{ orderable: false, targets: [7] }], pageLength: 25
    });
};

// ==========================================
// เปิด Modal
// ==========================================
window.openLeaveModal = function () {
    document.getElementById('leaveForm').reset();
    $('#leave_id').val('');
    $('#start_date_iso, #end_date_iso, #submitted_date_iso').val('');
    $('#calc_days').text('0');
    $('#contact_address, #phone_number').val('');
    $('#is_half_day').prop('checked', false);
    window.editingOriginalLeaveType = null;

    $('#evidence_upload_wrapper').addClass('hidden');
    $('#evidence_file').val('');
    $('#existing_evidence').addClass('hidden');

    const fpSubmitted = $('#submitted_date')[0]?._flatpickr;
    if (fpSubmitted) fpSubmitted.clear();

    const fpStart = $('#start_date')[0]?._flatpickr;
    const fpEnd = $('#end_date')[0]?._flatpickr;
    if (fpStart) fpStart.clear();
    if (fpEnd) fpEnd.clear();

    $('#leaveModal').removeClass('hidden').addClass('flex');
};

window.closeLeaveModal = function () {
    $('#leaveModal').addClass('hidden').removeClass('flex');
};

// ==========================================
// แก้ไขใบลา
// ==========================================
window.editLeave = function (id) {
    const l = window.allMyLeaves.find(item => item.id === id);
    if (!l) return;

    $('#leave_id').val(l.id);
    $('#leave_type').val(l.type);
    $('#leave_reason').val(l.reason);
    $('#start_date_iso').val(l.start_date);
    $('#end_date_iso').val(l.end_date);
    $('#calc_days').text(l.total_days);
    $('#contact_address').val(l.contact_address || '');
    $('#phone_number').val(l.phone_number || '');
    $('#is_half_day').prop('checked', l.is_half_day || false);
    window.editingOriginalLeaveType = l.type;

    const setFp = (iso, idDisplay) => {
        if (!iso) return;
        const parts = iso.split('-');
        const y = parseInt(parts[0]), m = parseInt(parts[1]), d = parseInt(parts[2]);
        const fp = $(`#${idDisplay}`)[0]._flatpickr;
        if (fp) {
            fp.setDate(new Date(y, m - 1, d), false);
            $(`#${idDisplay}`).val(`${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y + 543}`);
        }
    };
    setFp(l.start_date, 'start_date');
    setFp(l.end_date, 'end_date');

    if (l.submitted_date) {
        setFp(l.submitted_date, 'submitted_date');
    } else {
        const fp = $('#submitted_date')[0]?._flatpickr;
        if (fp) fp.clear();
        $('#submitted_date_iso').val('');
    }

    const wrapper = $('#evidence_upload_wrapper');
    const fileInput = $('#evidence_file');
    const existingDiv = $('#existing_evidence');
    const existingName = $('#existing_evidence_name');

    if (wrapper.length) {
        if (l.total_days >= 3) {
            wrapper.removeClass('hidden');
            fileInput.prop('required', true);
            if (l.attachment_file_id) {
                existingDiv.removeClass('hidden');
                existingName.text(`ไฟล์หลักฐาน ID: ${l.attachment_file_id}`);
                existingDiv.data('fileId', l.attachment_file_id);
            } else {
                existingDiv.addClass('hidden');
            }
        } else {
            wrapper.addClass('hidden');
            fileInput.prop('required', false);
            fileInput.val('');
            existingDiv.addClass('hidden');
        }
    }

    window.calculateDays(); // ไม่ต้อง await
    window.updateLeaveGuide();
    $('#leaveModal').removeClass('hidden').addClass('flex');
};

// ==========================================
// บันทึกใบลา
// ==========================================
window.saveLeave = async function (e) {
    e.preventDefault();
    const id = $('#leave_id').val();
    const type = $('#leave_type').val();
    const reason = $('#leave_reason').val().trim();
    const startDate = $('#start_date_iso').val();
    const endDate = $('#end_date_iso').val();
    const totalDays = parseFloat($('#calc_days').text());
    const contactAddress = $('#contact_address').val().trim();
    const phoneNumber = $('#phone_number').val().trim();
    const isHalfDay = $('#is_half_day').is(':checked');
    const submittedDateIso = $('#submitted_date_iso').val() || null;

    if (totalDays <= 0) return Swal.fire('ข้อมูลไม่ถูกต้อง', 'จำนวนวันลาต้องมากกว่า 0 วัน', 'warning');

    let attachmentFileId = null;
    const fileInput = $('#evidence_file')[0];
    const existingDiv = $('#existing_evidence');
    const existingFileId = existingDiv.data('fileId') || null;

    if (totalDays >= 3) {
        if (fileInput && fileInput.files && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            if (file.size > 5 * 1024 * 1024) {
                Swal.fire('ไฟล์ใหญ่เกินไป', 'กรุณาอัปโหลดไฟล์ขนาดไม่เกิน 5MB', 'warning');
                return;
            }
            try {
                attachmentFileId = await window.uploadEvidenceFile(file, window.systemSettings.evidence_folder_id, window.systemSettings.gas_url);
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

    // ✅ ตรวจสอบข้อมูลซ้ำ
    const duplicate = await window.checkDuplicateLeave(
        window.currentUser.id,
        type,
        startDate,
        endDate,
        id || null  // ถ้ามี id (แก้ไข) จะไม่นับรายการนี้
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
    
    Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const payload = {
        personnel_id: window.currentUser.id,
        type,
        reason,
        start_date: startDate,
        end_date: endDate,
        total_days: totalDays,
        contact_address: contactAddress,
        phone_number: phoneNumber,
        fiscal_year: window.systemSettings.fiscal_year,
        eval_round: window.systemSettings.eval_round,
        status: 'รออนุมัติ',
        reject_comment: null,
        attachment_file_id: attachmentFileId,
        pdf_url: null,
        is_half_day: isHalfDay,
        submitted_date: submittedDateIso
    };

    try {
        if (id) {
            const { error } = await db.from('leave_requests').update(payload).eq('id', id);
            if (error) throw error;
        } else {
            const { error } = await db.from('leave_requests').insert([payload]);
            if (error) throw error;
        }
        await window.logUserAction(`${id ? 'แก้ไข' : 'ส่ง'}ใบลา (${type})`, 'leave');
        window.closeLeaveModal();
        await window.loadLeaveData();
        Swal.fire({ icon: 'success', title: id ? 'แก้ไขใบลาเรียบร้อยแล้ว' : 'ส่งใบลาเรียบร้อยแล้ว', timer: 1500, showConfirmButton: false });
    } catch (err) {
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
};

// ==========================================
// ลบใบลา
// ==========================================
window.deleteLeave = async function (id) {
    const { isConfirmed } = await Swal.fire({ title: 'ยกเลิกใบลา?', text: "ต้องการยกเลิกและลบรายการลานี้ใช่หรือไม่?", icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'ใช่, ลบเลย' });
    if (isConfirmed) {
        Swal.fire({ title: 'กำลังลบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const { error } = await db.from('leave_requests').delete().eq('id', id);
        if (!error) {
            await window.logUserAction(`ลบใบลา ID: ${id}`, 'leave');
            await window.loadLeaveData();
            Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1500, showConfirmButton: false });
        }
        else Swal.fire('ผิดพลาด', error.message, 'error');
    }
};

// ==========================================
// ส่งออก Excel
// ==========================================
window.exportExcel = function () {
    if (window.allMyLeaves.length === 0) return Swal.fire('แจ้งเตือน', 'ไม่มีข้อมูลให้ส่งออก', 'info');
    const fmt = (iso) => { if (!iso) return '-'; const p = iso.split('-'); return `${p[2]}/${p[1]}/${parseInt(p[0]) + 543}`; };
    const exportData = window.allMyLeaves.map(l => ({
        'วันที่ส่งใบลา': new Date(l.created_at).toLocaleDateString('th-TH'),
        'ปีงบประมาณ': l.fiscal_year, 'รอบประเมิน': l.eval_round, 'ประเภทการลา': l.type,
        'เริ่มวันที่': fmt(l.start_date), 'ถึงวันที่': fmt(l.end_date),
        'จำนวน (วัน)': l.status === 'ไม่อนุมัติ' ? 0 : l.total_days,
        'จำนวน (ครั้ง)': l.status === 'ไม่อนุมัติ' ? 0 : 1,
        'สาเหตุ': l.reason, 'ที่อยู่ติดต่อ': l.contact_address || '-', 'เบอร์โทรศัพท์': l.phone_number || '-',
        'สถานะ': l.status, 'เหตุผล (กรณีไม่อนุมัติ)': l.reject_comment || ''
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = [{ wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 35 }, { wch: 35 }, { wch: 15 }, { wch: 15 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ประวัติการลา");
    XLSX.writeFile(wb, `ประวัติการลา_${window.currentProfile.first_name}.xlsx`);
    window.logUserAction('ส่งออกประวัติการลา (Excel)', 'leave');
};

// ==========================================
// แสดงเหตุผลที่ไม่อนุมัติ
// ==========================================
window.showRejectComment = function (comment) {
    Swal.fire({
        icon: 'info',
        title: 'เหตุผลที่ไม่อนุมัติ',
        html: `<div class="text-left bg-rose-50 p-4 rounded-xl border border-rose-100 text-rose-800 mt-2 font-medium">${comment}</div>`,
        confirmButtonColor: '#4f46e5',
        confirmButtonText: 'ปิดหน้าต่าง'
    });
};

// ==========================================
// ฟังก์ชันสลับโหมด (เรียกโดยปุ่มใน HTML)
// ==========================================
window.toggleAdminMode = function () {
    window.switchToAdminMode();
};

// ==========================================
// ดูลายเซ็น (read-only — ดึงจาก core_personnel.signature_file_id)
// ==========================================
window.viewSignature = async function () {
    $('#signatureModal').removeClass('hidden').addClass('flex');
    $('#sig-loading').removeClass('hidden').addClass('flex');
    $('#sig-img').addClass('hidden');
    $('#sig-empty').addClass('hidden').removeClass('flex');

    try {
        const userId = window.currentUser.id;
        const { data, error } = await db
            .from('core_personnel')
            .select('signature_file_id')
            .eq('id', userId)
            .single();

        $('#sig-loading').addClass('hidden').removeClass('flex');

        if (!error && data?.signature_file_id) {
            const sigUrl = `https://lh5.googleusercontent.com/d/${data.signature_file_id}`;
            $('#sig-img').attr('src', sigUrl).removeClass('hidden');
        } else {
            $('#sig-empty').removeClass('hidden').addClass('flex');
        }
    } catch (err) {
        $('#sig-loading').addClass('hidden').removeClass('flex');
        $('#sig-empty').removeClass('hidden').addClass('flex');
        console.error('Error loading signature:', err);
    }
};

window.closeSignatureModal = function () {
    $('#signatureModal').addClass('hidden').removeClass('flex');
};

console.log('✅ leave_teacher.js loaded (with holiday-aware calculation)');