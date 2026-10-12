// ============================================================
// government_trip_teacher.js — ระบบขอไปราชการ (ครู) v2.1
// ✅ Pattern กลาง + Companion (Lazy Load) + แก้บั๊ก saveTrip v2.0
// ============================================================

window.currentUser = null;
window.currentProfile = null;
window.currentUserId = null;
window.currentUserRole = '';
window.isAdminMode = false;
window.isModuleAdmin = false;
window.systemSettings = null;
window.schoolInfo = null;
window.allMyTrips = [];
window.tripDataTable = null;

// Tom Select instances
let tripTsTeachers = null;
let tripTsStudents = null;

// ==========================================
// Nav buttons — เช็ค role + headInfo
// ==========================================
window.refreshTripNavButtons = async function () {
    const role = window.currentUserRole || '';

    // หัวหน้ากลุ่มฯ หรือ super_admin → เห็นปุ่ม "หัวหน้ากลุ่มฯ"
    let isHead = false;
    if (window.currentUser?.id) {
        try {
            const headInfo = await window.getTripDeptHeadInfo(window.currentUser.id);
            isHead = !!headInfo;
        } catch (e) { /* ignore */ }
    }
    if (isHead || role === 'super_admin') {
        document.getElementById('btnNavDeptHead')?.classList.remove('hidden');
    }

    // admin/director/deputy/module admin → เห็นปุ่ม "โหมดแอดมิน"
    const canAdmin = ['super_admin', 'admin', 'director', 'deputy'].includes(role)
        || window.isModuleAdmin;
    if (canAdmin) {
        document.getElementById('btnNavAdmin')?.classList.remove('hidden');
    }
};

// ==========================================
// INIT
// ==========================================
$(document).ready(async function () {
    Swal.fire({ title: 'กำลังโหลดข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    try {
        await window.checkAuth();
        await window.loadTripSystemSettings();
        await window.loadSchoolInfo();
        window.initTripFlatpickr();
        await window.loadTripData();
        await window.refreshTripNavButtons();
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
// School info
// ==========================================
window.loadSchoolInfo = async function () {
    try {
        const { data } = await db.from('core_school_info').select('*').single();
        window.schoolInfo = data || {};
    } catch (e) {
        window.schoolInfo = {};
    }
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

    const makeCfg = (hiddenId) => ({
        locale: 'th', dateFormat: 'd/m/Y',
        onChange: function (dates, str, inst) {
            if (dates[0]) {
                const d = dates[0];
                if (hiddenId) {
                    document.getElementById(hiddenId).value =
                        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                }
                inst.element.value =
                    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}`;
                if (hiddenId === 'start_date_iso' || hiddenId === 'end_date_iso') {
                    window.calculateTripDaysClient();
                }
            }
        },
        onReady: (_, __, inst) => updateYear(inst),
        onMonthChange: (_, __, inst) => updateYear(inst),
        onYearChange: (_, __, inst) => updateYear(inst)
    });

    flatpickr("#start_date", makeCfg('start_date_iso'));
    flatpickr("#end_date", makeCfg('end_date_iso'));
    flatpickr("#submitted_date", makeCfg('submitted_date_iso'));
    flatpickr("#doc_date", makeCfg('doc_date_iso'));
    flatpickr("#depart_from_date", makeCfg('depart_from_date_iso'));
    flatpickr("#return_to_date", makeCfg('return_to_date_iso'));
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

            // ✅ ใช้ purpose แทน trip_type
            const purposeLabel = t.purpose || t.trip_type || '-';

            const ackBadge = t.ack_academic
                ? `<span class="text-[10px] text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full font-bold"><i class="fas fa-user-graduate mr-0.5"></i>รองวิชาการรับทราบ</span>`
                : (t.ack_head
                    ? `<span class="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-bold"><i class="fas fa-user-check mr-0.5"></i>หัวหน้ากลุ่มฯ รับทราบ</span>`
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

            const compBadge = (t.companion_count > 1)
                ? `<span class="text-[10px] text-indigo-600 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full font-bold ml-1"><i class="fas fa-users mr-0.5"></i>${t.companion_count} คน</span>`
                : '';

            return `<tr class="hover:bg-slate-50 transition-colors">
                <td class="py-3 px-4 text-center text-slate-500 text-xs" data-order="${new Date(t.created_at).getTime()}">${createDate} น.</td>
                <td class="py-3 px-4 font-bold text-sky-700">${purposeLabel}</td>
                <td class="py-3 px-4 text-slate-700 font-medium">${t.title} ${compBadge}</td>
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
        scrollX: true, scrollCollapse: true, autoWidth: false,
        language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
        order: [[0, 'desc']],
        columnDefs: [{ orderable: false, targets: [7] }],
        pageLength: 25
    });
};

// ==========================================
// Tom Select: Lazy Load Companions
// ==========================================
async function initTripCompanionSelects() {
    // ---- ครู (Lazy Load) ----
    const teacherEl = document.getElementById('companion_teachers');
    if (teacherEl) {
        if (tripTsTeachers) tripTsTeachers.destroy();
        teacherEl.innerHTML = '';

        tripTsTeachers = new TomSelect(teacherEl, {
            valueField: 'id',
            labelField: 'name',
            searchField: ['name'],
            plugins: ['remove_button'],
            placeholder: 'พิมพ์ชื่อครูอย่างน้อย 2 ตัวอักษร...',
            dropdownParent: 'body',
            maxItems: null,
            preload: false,
            load: async function (query, callback) {
                if (query.length < 2) return callback();
                try {
                    const { data } = await db.from('core_personnel')
                        .select('id, prefix, first_name, last_name, department, position')
                        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
                        .neq('id', window.currentUser.id)
                        .order('first_name')
                        .limit(30);

                    const results = (data || []).map(t => ({
                        id: t.id,
                        name: `${t.prefix || ''}${t.first_name} ${t.last_name}`,
                        department: t.department || '',
                        position: t.position || ''
                    }));
                    callback(results);
                } catch (err) {
                    console.error(err);
                    callback();
                }
            },
            render: {
                option: function (data, escape) {
                    return `<div class="p-2 border-b border-slate-50">
                        <div class="font-bold text-slate-800">${escape(data.name)}</div>
                        <div class="text-xs text-slate-500">${escape(data.position)} ${data.department ? `• ${escape(data.department)}` : ''}</div>
                    </div>`;
                },
                item: function (data, escape) {
                    return `<div class="text-xs">${escape(data.name)}</div>`;
                }
            },
            onChange: () => updateTotalCompanions()
        });
    }

    // ---- นักเรียน (Lazy Load) ----
    const studentEl = document.getElementById('companion_students');
    if (studentEl) {
        if (tripTsStudents) tripTsStudents.destroy();
        studentEl.innerHTML = '';

        tripTsStudents = new TomSelect(studentEl, {
            valueField: 'id',
            labelField: 'display',
            searchField: ['display', 'name', 'student_id_card'],
            plugins: ['remove_button'],
            placeholder: 'พิมพ์ชื่อ/รหัส/เลขที่นักเรียน...',
            dropdownParent: 'body',
            maxItems: null,
            preload: false,
            load: async function (query, callback) {
                if (query.length < 2) return callback();
                try {
                    const acadYear = String(window.schoolInfo?.current_academic_year || '');
                    const sem = String(window.schoolInfo?.current_semester || '1');

                    const { data: students } = await db.from('core_students')
                        .select(`
                            id, prefix, first_name, last_name, student_id_card,
                            student_enrollments(
                                student_number, academic_year, semester,
                                core_classrooms(grade_level, room_number)
                            )
                        `)
                        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,student_id_card.ilike.%${query}%`)
                        .order('first_name')
                        .limit(30);

                    const results = (students || []).map(s => {
                        const enrList = s.student_enrollments || [];
                        const current = enrList.find(e =>
                            String(e.academic_year) === acadYear && String(e.semester) === sem
                        ) || enrList[0];
                        const cls = current?.core_classrooms;
                        const classText = cls ? `ม.${cls.grade_level}/${cls.room_number}` : '-';
                        const numText = current?.student_number ? `เลขที่ ${current.student_number}` : '';
                        const name = `${s.prefix || ''}${s.first_name} ${s.last_name}`;

                        return {
                            id: s.id,
                            name: name,
                            display: `${name} (${classText} ${numText}) - ${s.student_id_card}`,
                            class_text: classText,
                            student_number: current?.student_number || '-',
                            student_id_card: s.student_id_card
                        };
                    });
                    callback(results);
                } catch (err) {
                    console.error(err);
                    callback();
                }
            },
            render: {
                option: function (data, escape) {
                    return `<div class="p-2 border-b border-slate-50">
                        <div class="font-bold text-slate-800">${escape(data.name)}</div>
                        <div class="text-xs text-slate-500">
                            ${escape(data.class_text)} • เลขที่ ${escape(data.student_number)} • ${escape(data.student_id_card)}
                        </div>
                    </div>`;
                },
                item: function (data, escape) {
                    return `<div class="text-xs">${escape(data.name)} <span class="text-slate-400">(${escape(data.class_text)})</span></div>`;
                }
            },
            onChange: () => updateTotalCompanions()
        });
    }
}

// ==========================================
// Toggle / Update Companions
// ==========================================
window.toggleCompanions = function () {
    const checked = document.getElementById('has_companions').checked;
    const panel = document.getElementById('companionsPanel');
    if (checked) {
        panel.classList.remove('hidden');
        if (!tripTsTeachers) initTripCompanionSelects();
        updateTotalCompanions();
    } else {
        panel.classList.add('hidden');
        if (tripTsTeachers) tripTsTeachers.clear();
        if (tripTsStudents) tripTsStudents.clear();
        updateTotalCompanions();
    }
};

window.updateTotalCompanions = function () {
    const teacherCount = tripTsTeachers ? tripTsTeachers.items.length : 0;
    const studentCount = tripTsStudents ? tripTsStudents.items.length : 0;
    const total = 1 + teacherCount + studentCount;
    const el = document.getElementById('total_companions');
    if (el) el.textContent = total;
};

// ==========================================
// Purpose / Req toggles
// ==========================================
window.onPurposeChange = function () {
    const selected = document.querySelector('input[name="purpose"]:checked');
    const otherWrap = document.getElementById('purposeOtherWrap');
    if (selected?.value === 'อื่นๆ') {
        otherWrap.classList.remove('hidden');
    } else {
        otherWrap.classList.add('hidden');
        document.getElementById('purpose_other').value = '';
    }
};

window.toggleExpenseAmount = function () {
    const checked = document.getElementById('req_travel_expense').checked;
    const wrap = document.getElementById('expenseAmountWrap');
    if (checked) wrap.classList.remove('hidden');
    else {
        wrap.classList.add('hidden');
        document.getElementById('travel_expense_amount').value = '';
    }
};

window.toggleOtherReq = function () {
    const checked = document.getElementById('req_other').checked;
    const wrap = document.getElementById('otherReqWrap');
    if (checked) wrap.classList.remove('hidden');
    else {
        wrap.classList.add('hidden');
        document.getElementById('req_other_text').value = '';
    }
};

// ==========================================
// Modal open/close
// ==========================================
window.openTripModal = function () {
    document.getElementById('tripForm').reset();
    $('#trip_id').val('');
    ['start_date_iso', 'end_date_iso', 'submitted_date_iso', 'doc_date_iso', 'depart_from_date_iso', 'return_to_date_iso'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    $('#calc_days').text('0');
    $('#existing_attachment').addClass('hidden');
    $('#attachment_file').val('');

    ['start_date', 'end_date', 'submitted_date', 'doc_date', 'depart_from_date', 'return_to_date'].forEach(id => {
        const fp = $(`#${id}`)[0]?._flatpickr;
        if (fp) fp.clear();
    });

    const reqName = `${window.currentProfile.prefix || ''}${window.currentProfile.first_name} ${window.currentProfile.last_name}`;
    const reqEl = document.getElementById('requester_name');
    if (reqEl) reqEl.value = reqName;

    document.getElementById('has_companions').checked = false;
    document.getElementById('companionsPanel').classList.add('hidden');
    if (tripTsTeachers) tripTsTeachers.clear();
    if (tripTsStudents) tripTsStudents.clear();
    updateTotalCompanions();

    document.querySelectorAll('input[name="purpose"]').forEach(r => r.checked = false);
    document.getElementById('purposeOtherWrap').classList.add('hidden');

    ['req_official_letter', 'req_parent_notice', 'req_travel_expense', 'req_school_car', 'req_other'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = false;
    });
    document.getElementById('expenseAmountWrap').classList.add('hidden');
    document.getElementById('otherReqWrap').classList.add('hidden');

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
    $('#title').val(t.title);
    $('#location').val(t.location || '');
    $('#start_date_iso').val(t.start_date);
    $('#end_date_iso').val(t.end_date);
    $('#contact_phone').val(t.contact_phone || '');
    $('#contact_address').val(t.contact_address || '');
    $('#calc_days').text(t.total_days);

    const reqName = `${window.currentProfile.prefix || ''}${window.currentProfile.first_name} ${window.currentProfile.last_name}`;
    const reqEl = document.getElementById('requester_name');
    if (reqEl) reqEl.value = reqName;

    const setFp = (iso, idDisplay) => {
        if (!iso) return;
        const parts = iso.split('-');
        const y = parseInt(parts[0]), m = parseInt(parts[1]), d = parseInt(parts[2]);
        const fp = $(`#${idDisplay}`)[0]._flatpickr;
        if (fp) {
            fp.setDate(new Date(y, m - 1, d), false);
            $(`#${idDisplay}`).val(`${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y + 543}`);
            $(`#${idDisplay}_iso`).val(iso);
        }
    };
    setFp(t.start_date, 'start_date');
    setFp(t.end_date, 'end_date');
    if (t.submitted_date) setFp(t.submitted_date, 'submitted_date');
    if (t.doc_date) setFp(t.doc_date, 'doc_date');
    if (t.depart_from_date) setFp(t.depart_from_date, 'depart_from_date');
    if (t.return_to_date) setFp(t.return_to_date, 'return_to_date');

    // Companions
    const compTeachers = Array.isArray(t.companion_teachers) ? t.companion_teachers : [];
    const compStudents = Array.isArray(t.companion_students) ? t.companion_students : [];
    if (compTeachers.length > 0 || compStudents.length > 0) {
        document.getElementById('has_companions').checked = true;
        document.getElementById('companionsPanel').classList.remove('hidden');
        setTimeout(() => {
            if (tripTsTeachers) tripTsTeachers.setValue(compTeachers);
            if (tripTsStudents) tripTsStudents.setValue(compStudents);
            updateTotalCompanions();
        }, 200);
    }

    // Purpose
    if (t.purpose) {
        const radio = document.querySelector(`input[name="purpose"][value="${t.purpose}"]`);
        if (radio) radio.checked = true;
        if (t.purpose === 'อื่นๆ' && t.purpose_other) {
            document.getElementById('purposeOtherWrap').classList.remove('hidden');
            document.getElementById('purpose_other').value = t.purpose_other;
        }
    }

    // Doc
    if (t.doc_number) document.getElementById('doc_number').value = t.doc_number;

    // Travel vehicle
    if (t.travel_vehicle) document.getElementById('travel_vehicle').value = t.travel_vehicle;
    if (t.depart_from_time) document.getElementById('depart_from_time').value = t.depart_from_time;
    if (t.return_to_time) document.getElementById('return_to_time').value = t.return_to_time;

    // Req
    if (t.req_official_letter) document.getElementById('req_official_letter').checked = true;
    if (t.req_parent_notice) document.getElementById('req_parent_notice').checked = true;
    if (t.req_school_car) document.getElementById('req_school_car').checked = true;
    if (t.req_travel_expense) {
        document.getElementById('req_travel_expense').checked = true;
        document.getElementById('expenseAmountWrap').classList.remove('hidden');
        document.getElementById('travel_expense_amount').value = t.travel_expense_amount || '';
    }
    if (t.req_other) {
        document.getElementById('req_other').checked = true;
        document.getElementById('otherReqWrap').classList.remove('hidden');
        document.getElementById('req_other_text').value = t.req_other_text || '';
    }

    if (t.attachment_file_id) {
        $('#existing_attachment').removeClass('hidden');
        $('#existing_attachment_name').text(`ไฟล์เดิม ID: ${t.attachment_file_id}`);
        $('#existing_attachment').data('fileId', t.attachment_file_id);
    }

    $('#tripModal').removeClass('hidden').addClass('flex');
};

// ==========================================
// Save — แก้ตาม v2.0 (ลบ field เก่าที่ไม่มีในฟอร์ม)
// ==========================================
window.saveTrip = async function (e) {
    e.preventDefault();
    const id = $('#trip_id').val();
    const title = $('#title').val().trim();
    const location = $('#location').val().trim();
    const startDate = $('#start_date_iso').val();
    const endDate = $('#end_date_iso').val();
    const totalDays = parseFloat($('#calc_days').text());
    const contact_phone = $('#contact_phone').val().trim();
    const contact_address = $('#contact_address').val().trim();
    const submittedDateIso = $('#submitted_date_iso').val() || null;

    if (!title || !location || !startDate || !endDate) {
        return Swal.fire('ข้อมูลไม่ครบ', 'กรุณากรอกข้อมูลที่มี * ให้ครบ', 'warning');
    }
    if (totalDays <= 0) return Swal.fire('ข้อมูลไม่ถูกต้อง', 'จำนวนวันต้องมากกว่า 0', 'warning');

    // ✅ Companions
    const companionsChecked = document.getElementById('has_companions').checked;
    const companionTeachers = companionsChecked && tripTsTeachers ? tripTsTeachers.getValue() : [];
    const companionStudents = companionsChecked && tripTsStudents ? tripTsStudents.getValue() : [];
    const companionCount = 1 + companionTeachers.length + companionStudents.length;

    // ✅ Purpose
    const purposeRadio = document.querySelector('input[name="purpose"]:checked');
    const purpose = purposeRadio?.value || '';
    const purposeOther = purpose === 'อื่นๆ' ? document.getElementById('purpose_other').value.trim() : '';
    if (!purpose) return Swal.fire('ข้อมูลไม่ครบ', 'กรุณาเลือกความประสงค์', 'warning');
    if (purpose === 'อื่นๆ' && !purposeOther) return Swal.fire('ข้อมูลไม่ครบ', 'กรุณาระบุความประสงค์อื่นๆ', 'warning');

    // ✅ Additional fields
    const docNumber = document.getElementById('doc_number').value.trim();
    const docDateIso = document.getElementById('doc_date_iso').value || null;
    const travelVehicle = document.getElementById('travel_vehicle').value.trim();
    const departFromDateIso = document.getElementById('depart_from_date_iso').value || null;
    const departFromTime = document.getElementById('depart_from_time').value || null;
    const returnToDateIso = document.getElementById('return_to_date_iso').value || null;
    const returnToTime = document.getElementById('return_to_time').value || null;

    const reqOfficial = document.getElementById('req_official_letter').checked;
    const reqParent = document.getElementById('req_parent_notice').checked;
    const reqSchoolCar = document.getElementById('req_school_car').checked;
    const reqExpense = document.getElementById('req_travel_expense').checked;
    const expenseAmount = reqExpense ? parseFloat(document.getElementById('travel_expense_amount').value) || null : null;
    const reqOther = document.getElementById('req_other').checked;
    const reqOtherText = reqOther ? document.getElementById('req_other_text').value.trim() : '';

    // File upload
    let attachmentFileId = null;
    const fileInput = $('#attachment_file')[0];
    const existingDiv = $('#existing_attachment');
    const existingFileId = existingDiv.data('fileId') || null;

    if (fileInput && fileInput.files && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        if (file.size > 5 * 1024 * 1024) {
            Swal.fire('ไฟล์ใหญ่เกินไป', 'ไม่เกิน 5MB', 'warning'); return;
        }
        try {
            attachmentFileId = await window.uploadTripFile(file, window.systemSettings.evidence_folder_id, window.systemSettings.gas_url);
        } catch (err) {
            Swal.fire('อัปโหลดไม่สำเร็จ', err.message, 'error'); return;
        }
    } else if (existingFileId) {
        attachmentFileId = existingFileId;
    }

    // Duplicate check
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

    // ✅ Payload v2.1 — ตัด field เก่าที่ไม่มีในฟอร์มออก, เก็บ purpose แทน trip_type
    const payload = {
        personnel_id: window.currentUser.id,
        fiscal_year: window.systemSettings.fiscal_year,
        eval_round: window.systemSettings.eval_round,
        purpose: purpose,
        purpose_other: purposeOther || null,
        title,
        location,
        start_date: startDate,
        end_date: endDate,
        total_days: totalDays,
        contact_phone,
        contact_address,
        attachment_file_id: attachmentFileId,
        pdf_url: null,
        submitted_date: submittedDateIso,
        status: 'รออนุมัติ',
        // Companion fields
        companion_teachers: companionTeachers,
        companion_students: companionStudents,
        companion_count: companionCount,
        // Doc
        doc_number: docNumber || null,
        doc_date: docDateIso,
        // Travel
        travel_vehicle: travelVehicle || null,
        depart_from_date: departFromDateIso,
        depart_from_time: departFromTime,
        return_to_date: returnToDateIso,
        return_to_time: returnToTime,
        // Req
        req_official_letter: reqOfficial,
        req_parent_notice: reqParent,
        req_travel_expense: reqExpense,
        travel_expense_amount: expenseAmount,
        req_school_car: reqSchoolCar,
        req_other: reqOther,
        req_other_text: reqOtherText || null
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
// Misc
// ==========================================
window.showTripRejectComment = function (comment) {
    Swal.fire({
        icon: 'info', title: 'เหตุผลที่ไม่อนุมัติ',
        html: `<div class="text-left bg-rose-50 p-4 rounded-xl border border-rose-100 text-rose-800 mt-2 font-medium">${comment}</div>`,
        confirmButtonColor: '#4f46e5', confirmButtonText: 'ปิด'
    });
};

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

window.exportTripExcel = function () {
    if (window.allMyTrips.length === 0) return Swal.fire('แจ้งเตือน', 'ไม่มีข้อมูลให้ส่งออก', 'info');
    const fmt = (iso) => { if (!iso) return '-'; const p = iso.split('-'); return `${p[2]}/${p[1]}/${parseInt(p[0]) + 543}`; };

    const exportData = window.allMyTrips.map(t => ({
        'วันที่ยื่น': new Date(t.created_at).toLocaleDateString('th-TH'),
        'ปีงบประมาณ': t.fiscal_year,
        'รอบ': t.eval_round,
        'ความประสงค์': t.purpose || '-',
        'เรื่อง': t.title,
        'สถานที่': t.location || '-',
        'เริ่ม': fmt(t.start_date),
        'สิ้นสุด': fmt(t.end_date),
        'จำนวนวัน': t.status === 'ไม่อนุมัติ' ? 0 : t.total_days,
        'ผู้ร่วมเดินทาง': t.companion_count || 1,
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

console.log('✅ government_trip_teacher.js v2.1 loaded (แก้ saveTrip + nav buttons)');