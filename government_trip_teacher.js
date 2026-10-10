// ============================================================
// government_trip_teacher.js — ระบบขอไปราชการ (ครูผู้ขอ) ฉบับสมบูรณ์
// ============================================================

window.currentUser = null;
window.currentProfile = null;
window.currentUserId = null;
window.currentUserRole = '';
window.isAdminMode = false;
window.isModuleAdmin = false;
window.systemSettings = null;
window.allMyTrips = [];
window.tripDataTable = null;

// ==========================================
// Nav buttons
// ==========================================
window.refreshTripNavButtons = function () {
    document.getElementById('btnNavDeptHead')?.classList.remove('hidden');
    document.getElementById('btnNavAdmin')?.classList.remove('hidden');
};

// ==========================================
// INIT
// ==========================================
$(document).ready(async function () {
    Swal.fire({ title: 'กำลังโหลดข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    try {
        await window.checkAuth();
        await window.loadTripSystemSettings();
        window.initTripFlatpickr();
        await window.loadTripData();
        window.refreshTripNavButtons();
        Swal.close();
        document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');
    } catch (err) {
        console.error('Initialization error:', err);
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
});

// ==========================================
// Auth
// ==========================================
window.checkAuth = async function () {
    const result = await window.checkSessionAndRole('government_trip_teacher');
    if (!result) return;
    const { user, personnel, role, isAdmin } = result;

    window.currentUser = user;
    window.currentProfile = personnel;
    window.currentUserId = user.id;
    window.currentUserRole = role;
    window.isAdminMode = isAdmin;
    window.isModuleAdmin = await window.hasModuleAccess(role, 'government_trip', user.id);

    setUserDisplayName(personnel);
    updateUserRoleLabel(role);
    renderUserAvatar(personnel);

    await window.logUserAction('เข้าสู่ระบบขอไปราชการ (ครู)', 'government_trip');
};

// ==========================================
// Settings
// ==========================================
window.loadTripSystemSettings = async function () {
    const { data } = await db.from('core_system_modules').select('settings').eq('module_id', 'government_trip').single();
    window.systemSettings = data?.settings || {
        fiscal_year: (new Date().getFullYear() + 543).toString(),
        eval_round: '1',
        gas_url: '', slide_template_id: '', pdf_folder_id: '', evidence_folder_id: ''
    };
    const badge = document.getElementById('fiscal-badge');
    if (badge) badge.textContent = `ปีงบประมาณ ${window.systemSettings.fiscal_year} (รอบที่ ${window.systemSettings.eval_round})`;
};

// ==========================================
// Flatpickr
// ==========================================
window.initTripFlatpickr = function () {
    function updateYear(instance) {
        const yearEl = instance.calendarContainer?.querySelector('.cur-year');
        if (yearEl && parseInt(yearEl.value) < 2400) yearEl.value = parseInt(yearEl.value) + 543;
    }

    const handleDateChange = function (selectedDates, dateStr, instance) {
        if (selectedDates[0]) {
            const id = instance.element.id;
            const d = selectedDates[0];
            document.getElementById(id + '_iso').value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            instance.element.value = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}`;
        }
        window.calculateTripDaysClient();
    };

    const config = {
        locale: 'th', dateFormat: 'd/m/Y',
        onChange: handleDateChange,
        onReady: (_, __, inst) => updateYear(inst),
        onMonthChange: (_, __, inst) => updateYear(inst),
        onYearChange: (_, __, inst) => updateYear(inst)
    };
    flatpickr("#start_date", config);
    flatpickr("#end_date", config);

    flatpickr("#submitted_date", {
        locale: 'th', dateFormat: 'd/m/Y',
        onChange: function (selectedDates, dateStr, instance) {
            if (selectedDates[0]) {
                const d = selectedDates[0];
                document.getElementById('submitted_date_iso').value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                instance.element.value = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}`;
            }
        },
        onReady: (_, __, inst) => updateYear(inst)
    });
};

// ==========================================
// Calculate days
// ==========================================
window.calculateTripDaysClient = function () {
    const startIso = $('#start_date_iso').val();
    const endIso = $('#end_date_iso').val();
    const days = window.calculateTripDays(startIso, endIso);
    $('#calc_days').text(days);
};

// ==========================================
// Load data
// ==========================================
window.loadTripData = async function () {
    const { data, error } = await db.from('government_trip_requests')
        .select('*').eq('personnel_id', window.currentUser.id)
        .order('created_at', { ascending: false });
    if (error) { console.error(error); return; }
    window.allMyTrips = data || [];

    const thisRound = window.allMyTrips.filter(t =>
        t.fiscal_year === window.systemSettings.fiscal_year &&
        t.eval_round === window.systemSettings.eval_round
    );

    const pending = thisRound.filter(t => t.status === 'รออนุมัติ').length;
    const approved = thisRound.filter(t => t.status === 'อนุมัติ').length;
    const totalDays = thisRound.filter(t => t.status === 'อนุมัติ').reduce((s, t) => s + Number(t.total_days || 0), 0);

    $('#stat-total-count').text(thisRound.length);
    $('#stat-pending').text(pending);
    $('#stat-approved').text(approved);
    $('#stat-total-days').text(totalDays);

    window.renderTripTable();
};

// ==========================================
// Render table
// ==========================================
window.renderTripTable = function () {
    if ($.fn.DataTable.isDataTable('#tripTable')) $('#tripTable').DataTable().destroy();
    const tbody = document.getElementById('tb-trip');

    if (window.allMyTrips.length > 0) {
        tbody.innerHTML = window.allMyTrips.map(t => {
            const createDate = new Date(t.created_at).toLocaleDateString('th-TH', {
                year: '2-digit', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });
            const fmt = (iso) => { if (!iso) return '-'; const p = iso.split('-'); return `${p[2]}/${p[1]}/${parseInt(p[0]) + 543}`; };
            const isRejected = t.status === 'ไม่อนุมัติ';
            const displayDays = isRejected ? 0 : t.total_days;

            // ✅ Badge รับทราบ — Academic ก่อน (ถ้ามี) แล้วค่อย Head
            const ackBadge = t.ack_academic
                ? `<span class="text-[10px] text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full font-bold" title="รองวิชาการรับทราบแล้ว"><i class="fas fa-user-graduate mr-0.5"></i>รองวิชาการรับทราบ</span>`
                : (t.ack_head
                    ? `<span class="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-bold" title="หัวหน้ากลุ่มฯ รับทราบแล้ว"><i class="fas fa-user-check mr-0.5"></i>หัวหน้ากลุ่มฯ รับทราบ</span>`
                    : '');

            let statusHtml = '';
            if (t.status === 'รออนุมัติ') {
                statusHtml = `<div class="flex flex-col items-center gap-1">
                    <span class="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold border border-amber-200"><i class="fas fa-clock mr-1"></i> รออนุมัติ</span>
                    ${ackBadge}
                </div>`;
            } else if (t.status === 'อนุมัติ') {
                statusHtml = `<div class="flex flex-col items-center gap-1">
                    <span class="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold border border-emerald-200"><i class="fas fa-check-circle mr-1"></i> อนุมัติ</span>
                    ${ackBadge}
                </div>`;
            } else {
                const safeComment = t.reject_comment
                    ? t.reject_comment.replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, '<br>')
                    : 'ไม่มีการระบุเหตุผล';
                statusHtml = `<div class="flex flex-col items-center gap-1">
                    <button onclick="window.showTripRejectComment('${safeComment}')" class="bg-rose-100 text-rose-700 px-3 py-1 rounded-full text-xs font-bold border border-rose-300 cursor-pointer hover:bg-rose-200 transition shadow-sm">
                        <i class="fas fa-times-circle mr-1"></i> ไม่อนุมัติ
                    </button>
                    ${ackBadge}
                </div>`;
            }

            let pdfHtml = '';
            if (t.pdf_url) {
                pdfHtml = `<a href="${t.pdf_url}" target="_blank" class="bg-green-50 text-green-600 hover:bg-green-500 hover:text-white px-2 py-1.5 rounded-lg transition shadow-sm mr-1" title="เปิดไฟล์ PDF"><i class="fas fa-file-pdf"></i></a>`;
            } else {
                pdfHtml = `<button onclick="window.generateTripPDF('${t.id}', window.systemSettings)" class="bg-blue-50 text-blue-600 hover:bg-blue-500 hover:text-white px-2 py-1.5 rounded-lg transition shadow-sm mr-1" title="สร้าง PDF"><i class="fas fa-print"></i></button>`;
            }

            let btnHtml = pdfHtml;
            if (t.status === 'รออนุมัติ') {
                btnHtml += `<button onclick="window.editTrip('${t.id}')" class="text-yellow-600 hover:text-yellow-700 bg-yellow-50 px-2 py-1.5 rounded-lg transition shadow-sm mr-1" title="แก้ไข"><i class="fas fa-pen text-xs"></i></button>
                            <button onclick="window.deleteTrip('${t.id}')" class="text-rose-500 hover:text-rose-700 bg-rose-50 px-2 py-1.5 rounded-lg transition shadow-sm" title="ลบ"><i class="fas fa-trash text-xs"></i></button>`;
            }

            return `<tr class="hover:bg-slate-50 transition-colors">
                <td class="py-3 px-4 text-center text-slate-500 text-xs" data-order="${new Date(t.created_at).getTime()}">${createDate} น.</td>
                <td class="py-3 px-4 font-bold text-sky-700">${t.trip_type || '-'}</td>
                <td class="py-3 px-4 text-slate-700 font-medium">${t.title}</td>
                <td class="py-3 px-4 text-slate-600">${fmt(t.start_date)} - ${fmt(t.end_date)}</td>
                <td class="py-3 px-4 text-center font-black text-sky-600">${displayDays}</td>
                <td class="py-3 px-4 text-slate-600 text-xs max-w-[200px] truncate" title="${t.location || ''}">${t.location || '-'}</td>
                <td class="py-3 px-4 text-center">${statusHtml}</td>
                <td class="py-3 px-4 text-center whitespace-nowrap">${btnHtml}</td>
            </tr>`;
        }).join('');
    } else {
        tbody.innerHTML = '';
    }

    window.tripDataTable = $('#tripTable').DataTable({
        scrollX: true,
        scrollCollapse: true,
        autoWidth: false,
        language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
        order: [[0, 'desc']],
        columnDefs: [{ orderable: false, targets: [7] }],
        pageLength: 25
    });
};

// ==========================================
// Modal
// ==========================================
window.openTripModal = function () {
    document.getElementById('tripForm').reset();
    $('#trip_id').val('');
    $('#start_date_iso, #end_date_iso, #submitted_date_iso').val('');
    $('#calc_days').text('0');
    $('#existing_attachment').addClass('hidden');
    $('#attachment_file').val('');

    const fpStart = $('#start_date')[0]?._flatpickr;
    const fpEnd = $('#end_date')[0]?._flatpickr;
    const fpSub = $('#submitted_date')[0]?._flatpickr;
    if (fpStart) fpStart.clear();
    if (fpEnd) fpEnd.clear();
    if (fpSub) fpSub.clear();

    $('#tripModal').removeClass('hidden').addClass('flex');
};

window.closeTripModal = function () {
    $('#tripModal').addClass('hidden').removeClass('flex');
};

// ==========================================
// Edit
// ==========================================
window.editTrip = function (id) {
    const t = window.allMyTrips.find(item => item.id === id);
    if (!t) return;

    $('#trip_id').val(t.id);
    $('#trip_type').val(t.trip_type || '');
    $('#title').val(t.title);
    $('#objective').val(t.objective || '');
    $('#location').val(t.location || '');
    $('#start_date_iso').val(t.start_date);
    $('#end_date_iso').val(t.end_date);
    $('#travel_by').val(t.travel_by || '');
    $('#vehicle_registration').val(t.vehicle_registration || '');
    $('#budget_source').val(t.budget_source || '');
    $('#budget_amount').val(t.budget_amount || '');
    $('#contact_phone').val(t.contact_phone || '');
    $('#contact_address').val(t.contact_address || '');
    $('#calc_days').text(t.total_days);

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
    setFp(t.start_date, 'start_date');
    setFp(t.end_date, 'end_date');
    if (t.submitted_date) setFp(t.submitted_date, 'submitted_date');

    if (t.attachment_file_id) {
        $('#existing_attachment').removeClass('hidden');
        $('#existing_attachment_name').text(`ไฟล์เดิม ID: ${t.attachment_file_id}`);
        $('#existing_attachment').data('fileId', t.attachment_file_id);
    }

    $('#tripModal').removeClass('hidden').addClass('flex');
};

// ==========================================
// Save
// ==========================================
window.saveTrip = async function (e) {
    e.preventDefault();
    const id = $('#trip_id').val();
    const trip_type = $('#trip_type').val();
    const title = $('#title').val().trim();
    const objective = $('#objective').val().trim();
    const location = $('#location').val().trim();
    const startDate = $('#start_date_iso').val();
    const endDate = $('#end_date_iso').val();
    const totalDays = parseFloat($('#calc_days').text());
    const travel_by = $('#travel_by').val();
    const vehicle_registration = $('#vehicle_registration').val().trim();
    const budget_source = $('#budget_source').val();
    const budget_amount = $('#budget_amount').val();
    const contact_phone = $('#contact_phone').val().trim();
    const contact_address = $('#contact_address').val().trim();
    const submittedDateIso = $('#submitted_date_iso').val() || null;

    if (!trip_type || !title || !location || !startDate || !endDate) {
        return Swal.fire('ข้อมูลไม่ครบ', 'กรุณากรอกข้อมูลที่มี * ให้ครบ', 'warning');
    }
    if (totalDays <= 0) return Swal.fire('ข้อมูลไม่ถูกต้อง', 'จำนวนวันต้องมากกว่า 0', 'warning');

    let attachmentFileId = null;
    const fileInput = $('#attachment_file')[0];
    const existingDiv = $('#existing_attachment');
    const existingFileId = existingDiv.data('fileId') || null;

    if (fileInput && fileInput.files && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        if (file.size > 5 * 1024 * 1024) {
            Swal.fire('ไฟล์ใหญ่เกินไป', 'กรุณาอัปโหลดไม่เกิน 5MB', 'warning'); return;
        }
        try {
            attachmentFileId = await window.uploadTripFile(file, window.systemSettings.evidence_folder_id, window.systemSettings.gas_url);
        } catch (err) {
            Swal.fire('อัปโหลดไม่สำเร็จ', err.message, 'error'); return;
        }
    } else if (existingFileId) {
        attachmentFileId = existingFileId;
    }

    const dup = await window.checkDuplicateTrip(window.currentUser.id, title, startDate, endDate, id || null);
    if (dup.exists) {
        await Swal.fire({
            icon: 'warning', title: 'มีใบซ้ำ',
            html: `<div class="text-left">
                <p>พบใบขอที่มี "<b>${title}</b>" ช่วงวันที่เดียวกันแล้ว</p>
                <p class="text-sm text-slate-600">สถานะ: <b>${dup.existingTrip.status}</b></p>
            </div>`
        });
        return;
    }

    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    const payload = {
        personnel_id: window.currentUser.id,
        fiscal_year: window.systemSettings.fiscal_year,
        eval_round: window.systemSettings.eval_round,
        trip_type, title, objective, location,
        start_date: startDate, end_date: endDate, total_days: totalDays,
        travel_by, vehicle_registration,
        budget_source, budget_amount: budget_amount ? parseFloat(budget_amount) : null,
        contact_phone, contact_address,
        attachment_file_id: attachmentFileId,
        pdf_url: null,
        submitted_date: submittedDateIso,
        status: 'รออนุมัติ'
    };

    try {
        if (id) {
            const { error } = await db.from('government_trip_requests').update(payload).eq('id', id);
            if (error) throw error;
        } else {
            const { error } = await db.from('government_trip_requests').insert([payload]);
            if (error) throw error;
        }
        await window.logUserAction(`${id ? 'แก้ไข' : 'ส่ง'}ใบขอไปราชการ (${title})`, 'government_trip');
        window.closeTripModal();
        await window.loadTripData();
        Swal.fire({ icon: 'success', title: id ? 'แก้ไขเรียบร้อย' : 'ส่งใบขอเรียบร้อย', timer: 1500, showConfirmButton: false });
    } catch (err) {
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
};

// ==========================================
// Delete
// ==========================================
window.deleteTrip = async function (id) {
    const { isConfirmed } = await Swal.fire({
        title: 'ยกเลิกใบขอ?', text: 'ต้องการลบรายการนี้ใช่หรือไม่?',
        icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626',
        confirmButtonText: 'ใช่, ลบเลย', cancelButtonText: 'ยกเลิก'
    });
    if (!isConfirmed) return;

    Swal.fire({ title: 'กำลังลบ...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    const { error } = await db.from('government_trip_requests').delete().eq('id', id);
    if (error) { Swal.fire('ผิดพลาด', error.message, 'error'); return; }

    await window.logUserAction(`ลบใบขอไปราชการ ID: ${id}`, 'government_trip');
    await window.loadTripData();
    Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1500, showConfirmButton: false });
};

// ==========================================
// Reject comment
// ==========================================
window.showTripRejectComment = function (comment) {
    Swal.fire({
        icon: 'info', title: 'เหตุผลที่ไม่อนุมัติ',
        html: `<div class="text-left bg-rose-50 p-4 rounded-xl border border-rose-100 text-rose-800 mt-2 font-medium">${comment}</div>`,
        confirmButtonColor: '#4f46e5', confirmButtonText: 'ปิด'
    });
};

// ==========================================
// Signature view
// ==========================================
window.viewTripSignature = async function () {
    $('#signatureModal').removeClass('hidden').addClass('flex');
    $('#sig-loading').removeClass('hidden').addClass('flex');
    $('#sig-img').addClass('hidden');
    $('#sig-empty').addClass('hidden').removeClass('flex');

    try {
        const { data, error } = await db.from('core_personnel')
            .select('signature_file_id').eq('id', window.currentUser.id).single();
        $('#sig-loading').addClass('hidden').removeClass('flex');
        if (!error && data?.signature_file_id) {
            $('#sig-img').attr('src', `https://lh5.googleusercontent.com/d/${data.signature_file_id}`).removeClass('hidden');
        } else {
            $('#sig-empty').removeClass('hidden').addClass('flex');
        }
    } catch (err) {
        $('#sig-loading').addClass('hidden').removeClass('flex');
        $('#sig-empty').removeClass('hidden').addClass('flex');
    }
};

window.closeSignatureModal = function () {
    $('#signatureModal').addClass('hidden').removeClass('flex');
};

// ==========================================
// Export Excel
// ==========================================
window.exportTripExcel = function () {
    if (window.allMyTrips.length === 0) return Swal.fire('แจ้งเตือน', 'ไม่มีข้อมูลให้ส่งออก', 'info');
    const fmt = (iso) => { if (!iso) return '-'; const p = iso.split('-'); return `${p[2]}/${p[1]}/${parseInt(p[0]) + 543}`; };

    const exportData = window.allMyTrips.map(t => ({
        'วันที่ยื่น': new Date(t.created_at).toLocaleDateString('th-TH'),
        'ปีงบประมาณ': t.fiscal_year,
        'รอบ': t.eval_round,
        'ประเภท': t.trip_type || '-',
        'เรื่อง': t.title,
        'วัตถุประสงค์': t.objective || '-',
        'สถานที่': t.location || '-',
        'เริ่ม': fmt(t.start_date),
        'สิ้นสุด': fmt(t.end_date),
        'จำนวนวัน': t.status === 'ไม่อนุมัติ' ? 0 : t.total_days,
        'เดินทางโดย': t.travel_by || '-',
        'งบประมาณจาก': t.budget_source || '-',
        'จำนวนเงิน': t.budget_amount || '-',
        'สถานะ': t.status,
        'หัวหน้ารับทราบ': t.ack_head ? '✓' : '-',
        'รองวิชาการ': t.ack_academic ? '✓' : '-',
        'แอดมิน': t.ack_admin ? '✓' : '-',
        'รองบุคคล': t.ack_deputy_hr ? '✓' : '-',
        'เหตุผล': t.reject_comment || ''
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ประวัติขอไปราชการ");
    XLSX.writeFile(wb, `ประวัติขอไปราชการ_${window.currentProfile.first_name}.xlsx`);
    window.logUserAction('ส่งออกประวัติขอไปราชการ (Excel)', 'government_trip');
};

console.log('✅ government_trip_teacher.js loaded (ฉบับสมบูรณ์)');