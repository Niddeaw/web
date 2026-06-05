// behavior_admin.js - ทุกบทบาทเห็นทั้งโรงเรียน, ค้นหาและกรองทำงานสมบูรณ์

let currentUser = null;
let schoolInfo = null;
let systemConfig = null;
let allStudents = [];           // นักเรียนทั้งโรงเรียน
let criteriaList = [];
let table = null;

$(document).ready(async function () {
    Swal.fire({ title: 'กำลังโหลดข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    await checkAuth();
    await loadSchoolInfo();
    await loadSystemConfig();
    await loadCriteria();
    await initStudentTable();
    loadDashboard();

    // ผูก event ให้ช่องค้นหา
    $('#search_student').on('input', function () {
        searchStudent($(this).val());
    });

    $('#evidence_file').change(function (e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (e) { $('#evidence_preview').attr('src', e.target.result).removeClass('hidden'); }
            reader.readAsDataURL(file);
        } else {
            $('#evidence_preview').addClass('hidden');
        }
    });

    Swal.close();
});

async function checkAuth() {
    const { data: { session } } = await db.auth.getSession();
    if (!session) { window.location.replace('index.html'); return; }

    const { data: profile } = await db.from('core_personnel').select('*').eq('id', session.user.id).single();
    const { data: sInfo } = await db.from('core_school_info').select('current_academic_year').single();

    currentUser = profile;

    let isDisciplineHead = false;
    if (sInfo?.current_academic_year) {
        const { data: discHead } = await db.from('core_discipline_heads')
            .select('id')
            .eq('personnel_id', session.user.id)
            .eq('academic_year', sInfo.current_academic_year)
            .maybeSingle();
        isDisciplineHead = !!discHead;
    }

    const { data: gradeHeads } = await db.from('behavior_grade_heads')
        .select('grade_level')
        .eq('teacher_id', session.user.id);
    // หัวหน้าระดับ: managedGrades เก็บไว้ label เท่านั้น ไม่ได้จำกัดสิทธิ์ (เพิ่ม/ตัดได้ทุกชั้น)
    currentUser.managedGrades = gradeHeads ? gradeHeads.map(g => g.grade_level) : [];
    currentUser.isDisciplineHead = isDisciplineHead; // เก็บไว้ตรวจสิทธิ์ลบ

    // ซ่อนปุ่มตั้งค่า/นำเข้าก่อน
    $('#btn_settings').addClass('hidden').removeClass('flex');
    $('#btn_import_old').addClass('hidden').removeClass('flex');

    // กำหนดสิทธิ์ (ทุกคนเห็นทั้งโรงเรียน เพิ่ม/ตัดได้ทุกชั้น)
    if (profile.role === 'super_admin') {
        $('#btn_settings').removeClass('hidden').addClass('flex');
        $('#btn_import_old').removeClass('hidden').addClass('flex');
        $('#btn_import_excel').removeClass('hidden').addClass('flex');   // ✅ ปุ่มนำเข้า Excel
        $('#role_label').html('<i class="fas fa-crown text-amber-500 mr-1"></i> Superuser');
        currentUser.role = 'super_admin';
    } else if (isDisciplineHead || currentUser.managedGrades.length > 0) {
        currentUser.role = 'admin';   // เพิ่ม/ตัดคะแนนได้ทุกชั้นเรียน
        if (isDisciplineHead) {
            // หัวหน้าปกครอง: เห็นปุ่มตั้งค่าและลบรายการได้
            $('#btn_settings').removeClass('hidden').addClass('flex');
            $('#role_label').html('<i class="fas fa-shield-alt text-emerald-500 mr-1"></i> หัวหน้างานปกครอง');
        } else {
            // หัวหน้าระดับ: เพิ่ม/ตัดได้ทุกชั้น (ไม่จำกัดแค่ระดับตัวเอง)
            $('#role_label').html(`<i class="fas fa-layer-group text-blue-500 mr-1"></i> หัวหน้าระดับ ม.${currentUser.managedGrades.join(', ')}`);
        }
    } else {
        window.location.replace('behavior_teacher.html');
        return;
    }

    $('#user_display').html(`ครู${profile.first_name} ${profile.last_name}`);
}

async function logout() {
    await db.auth.signOut();
    window.location.replace('index.html');
}

async function loadSchoolInfo() {
    const { data } = await db.from('core_school_info').select('*').single();
    schoolInfo = data || {};
}

async function loadSystemConfig() {
    const { data } = await db.from('behavior_system_config').select('*').eq('id', 1).maybeSingle();
    systemConfig = data || null;
}

async function loadCriteria() {
    const { data } = await db.from('behavior_criteria').select('*');
    if (data) criteriaList = data;
}

async function initStudentTable() {
    Swal.fire({ title: 'กำลังโหลดข้อมูลนักเรียน...', text: 'กรุณารอสักครู่', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    let allFetchedStudents = [];
    let from = 0;
    const limit = 1000;

    while (true) {
        const { data, error } = await db.from('core_students').select(`
            id, student_id_card, prefix, first_name, last_name, avatar_students_url,
            student_enrollments ( student_number, core_classrooms (grade_level, room_number) ),
            behavior_logs ( score_change, behavior_criteria(category) )
        `).range(from, from + limit - 1);

        if (error) {
            console.error('Error fetching students:', error);
            Swal.fire('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลนักเรียนได้', 'error');
            return;
        }

        if (data && data.length > 0) {
            allFetchedStudents = allFetchedStudents.concat(data);
        }

        if (!data || data.length < limit) break;
        from += limit;
    }

    if (allFetchedStudents.length === 0) {
        Swal.close();
        return;
    }

    // เก็บทั้งโรงเรียน (ไม่กรอง)
    allStudents = allFetchedStudents.map(s => {
        const totalScore = 100 + (s.behavior_logs?.reduce((sum, log) => sum + log.score_change, 0) || 0);
        const posCount = s.behavior_logs?.filter(l => l.score_change > 0).length || 0;
        const negCount = s.behavior_logs?.filter(l => l.score_change < 0).length || 0;
        // จำแนกขั้นโทษจาก score_change: เบา 1-3, กลาง 4-7, ร้ายแรง 8+
        const sevLight  = s.behavior_logs?.filter(l => l.score_change < 0 && Math.abs(l.score_change) <= 3).length || 0;
        const sevMedium = s.behavior_logs?.filter(l => l.score_change < 0 && Math.abs(l.score_change) >= 4 && Math.abs(l.score_change) <= 7).length || 0;
        const sevHeavy  = s.behavior_logs?.filter(l => l.score_change < 0 && Math.abs(l.score_change) >= 8).length || 0;
        const enroll = s.student_enrollments?.[0];
        const classroom = enroll?.core_classrooms;
        const prefix = s.prefix || '';
        const firstName = s.first_name || '';
        const lastName = s.last_name || '';

        return {
            id: s.id,
            sid: s.student_id_card,
            prefix: prefix,
            firstName: firstName,
            lastName: lastName,
            fullName: `${prefix}${firstName} ${lastName}`.trim(),
            student_number: enroll?.student_number || 0,
            grade_level: classroom ? parseInt(classroom.grade_level) : 0,
            room_number: classroom ? classroom.room_number : '',
            roomDisplay: classroom ? `ม.${classroom.grade_level}/${classroom.room_number}` : '-',
            score: totalScore,
            pos: posCount,
            neg: negCount,
            sevLight,
            sevMedium,
            sevHeavy,
            avatar: s.avatar_students_url || null   // รูปโปรไฟล์นักเรียน
        };
    });

    // เรียงตามชั้น แล้วเลขที่
    allStudents.sort((a, b) => a.grade_level - b.grade_level || a.student_number - b.student_number);

    renderTable(allStudents);
    Swal.close();
}

function renderTable(data) {
    if ($.fn.DataTable.isDataTable('#studentTable')) $('#studentTable').DataTable().destroy();

    table = $('#studentTable').DataTable({
        data: data.map(s => [
            `<span class="text-slate-600 font-medium">${s.roomDisplay}</span>`,
            `<span class="text-center font-bold text-gray-600">${s.student_number || '-'}</span>`,
            `<span class="font-medium text-slate-700">${s.sid}</span>`,
            `<span class="font-bold text-blue-800">${s.fullName}</span>`,
            `<div class="text-center"><span class="px-3 py-1 rounded-lg text-sm font-black ${s.score < 50 ? 'bg-red-100 text-red-600' : (s.score >= 100 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-600')}">${s.score}</span></div>`,
            `<div class="text-center"><button onclick="viewHistory('${s.id}')" class="history-btn bg-white border border-blue-200 text-blue-600 px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-blue-50 transition shadow-sm"><i class="fas fa-eye"></i> ประวัติ</button></div>`
        ]),
        responsive: {
            details: {
                display: $.fn.dataTable.Responsive.display.childRowImmediate,
                type: 'none'
            }
        },
        columnDefs: [
            { responsivePriority: 1, targets: 3 },  // ชื่อ-นามสกุล (สำคัญสุด)
            { responsivePriority: 2, targets: 4 },  // คะแนน
            { responsivePriority: 3, targets: 5 },  // ปุ่มประวัติ (ห้ามหาย)
            { responsivePriority: 4, targets: 0 },  // ชั้นเรียน
            { responsivePriority: 5, targets: 2 },  // รหัสนักเรียน
            { responsivePriority: 6, targets: 1 }   // เลขที่
        ],
        language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
        order: [[0, 'asc'], [1, 'asc']]
    });
}

function loadDashboard() {
    // ใช้ allStudents เสมอ
    $('#stat_positive').text(allStudents.filter(s => s.pos > 0).length);
    $('#stat_negative').text(allStudents.filter(s => s.neg > 0).length);
    $('#stat_high').text(allStudents.filter(s => s.score > 100).length);
    $('#stat_low').text(allStudents.filter(s => s.score < 50).length);
    // การ์ดขั้นโทษ — นับนักเรียนที่มีประวัติขั้นนั้นอย่างน้อย 1 ครั้ง
    $('#stat_sev_light').text(allStudents.filter(s => s.sevLight > 0).length);
    $('#stat_sev_medium').text(allStudents.filter(s => s.sevMedium > 0).length);
    $('#stat_sev_heavy').text(allStudents.filter(s => s.sevHeavy > 0).length);
    loadRecentLogs();
}

// ── 10 รายการล่าสุด (ทำดี / ผิดระเบียบ) ─────────────────────────────────
async function loadRecentLogs() {
    const cols = 'id, student_id, score_change, created_at, behavior_criteria(title), recorder:core_personnel!recorder_id(prefix, first_name, last_name), student:core_students!student_id(student_id_card, first_name, last_name, student_enrollments(student_number, core_classrooms(grade_level, room_number)))';

    const [posRes, negRes] = await Promise.all([
        db.from('behavior_logs').select(cols)
            .gt('score_change', 0).order('created_at', { ascending: false }).limit(10),
        db.from('behavior_logs').select(cols)
            .lt('score_change', 0).order('created_at', { ascending: false }).limit(10)
    ]);

    renderRecentTable('recent_positive_body', posRes.data || [], 'positive');
    renderRecentTable('recent_negative_body', negRes.data || [], 'negative');
}

function renderRecentTable(tbodyId, logs, type) {
    if (!logs.length) {
        $('#' + tbodyId).html('<tr><td colspan="7" class="py-6 text-center text-slate-300">ยังไม่มีรายการ</td></tr>');
        return;
    }

    const isPos = type === 'positive';

    let html = '';
    logs.forEach(function(log) {
        const date = new Date(log.created_at).toLocaleDateString('th-TH', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        // ดึงข้อมูล enrollment
        const student  = log.student || {};
        const enroll   = Array.isArray(student.student_enrollments) ? student.student_enrollments[0] : student.student_enrollments;
        const classroom = enroll?.core_classrooms || {};
        const room      = classroom.grade_level ? `ม.${classroom.grade_level}/${classroom.room_number}` : '-';
        const sid       = student.student_id_card || '-';
        const fullName  = ((student.first_name || '') + ' ' + (student.last_name || '')).trim() || '-';

        const criteria = log.behavior_criteria?.title || '-';
        const scoreVal = (isPos ? '+' : '') + log.score_change;
        const scoreClass = isPos ? 'text-green-600 font-black' : 'text-red-600 font-black';

        const rec = log.recorder
            ? (log.recorder.prefix || '') + log.recorder.first_name + ' ' + log.recorder.last_name
            : '-';

        // กด row → เปิดประวัตินักเรียน
        const studentUUID = log.student_id;
        html += `<tr class="border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition"
                     onclick="viewHistory('${studentUUID}')" title="ดูประวัติ ${fullName}">
            <td class="py-2 pr-2 text-slate-400 whitespace-nowrap">${date}</td>
            <td class="py-2 pr-2 whitespace-nowrap">${room}</td>
            <td class="py-2 pr-2 text-slate-500">${sid}</td>
            <td class="py-2 pr-3 font-medium text-slate-700 whitespace-nowrap">${fullName}</td>
            <td class="py-2 pr-2 text-slate-500 max-w-[120px] truncate" title="${criteria}">${criteria}</td>
            <td class="py-2 pr-2 text-center ${scoreClass}">${scoreVal}</td>
            <td class="py-2 text-slate-400 whitespace-nowrap">${rec}</td>
        </tr>`;
    });

    $('#' + tbodyId).html(html);
}

// ค้นหาจาก allStudents
async function searchStudent(val) {
    if (val.length < 2) { $('#search_results').hide(); return; }

    const matched = allStudents.filter(s =>
        (s.sid || '').includes(val) ||
        (s.fullName || '').includes(val)
    ).slice(0, 5);

    let html = '';
    matched.forEach(s => {
        html += `<div onclick="selectStudent('${s.id}', '${s.sid} - ${s.fullName}')"
                 class="p-3 hover:bg-blue-50 cursor-pointer border-b text-sm font-medium text-slate-700">
                 ${s.sid} - ${s.fullName} (${s.roomDisplay})</div>`;
    });

    $('#search_results').html(html || '<div class="p-3 text-sm text-slate-400">ไม่พบนักเรียน</div>').show();
}

function selectStudent(id, info) {
    $('#selected_student_id').val(id);
    $('#selected_student_name').text(`นักเรียนที่เลือก: ${info}`);
    $('#selected_student_info').removeClass('hidden').addClass('flex');
    $('#search_results').hide();
    $('#search_student').val('');
}

function clearSelectedStudent() {
    $('#selected_student_id').val('');
    $('#selected_student_info').addClass('hidden').removeClass('flex');
}

function openRecordModal(type = 'all') {
    $('#recordModal').removeClass('hidden').addClass('flex');
    let html = '<option value="">-- เลือกรายการความประพฤติ --</option>';
    let filteredCriteria = criteriaList;

    if (type !== 'all') {
        filteredCriteria = criteriaList.filter(c => c.category === type);
        if (type === 'positive') $('#modalTitle').html('<i class="fas fa-plus-circle mr-3 text-green-600"></i>เพิ่มคะแนน (ทำความดี)');
        else $('#modalTitle').html('<i class="fas fa-minus-circle mr-3 text-red-600"></i>ตัดคะแนน (ผิดระเบียบ)');
    } else {
        $('#modalTitle').html('<i class="fas fa-edit mr-3 text-blue-600"></i>บันทึกความประพฤติ');
    }

    filteredCriteria.forEach(c => {
        html += `<option value="${c.id}" data-score="${c.category === 'negative' ? -c.default_score : c.default_score}">${c.title} (${c.category === 'negative' ? '-' : '+'}${c.default_score})</option>`;
    });

    $('#criteria_select').html(html);
    $('#score_input').val('');
}

function updateDefaultScore() { $('#score_input').val($('#criteria_select option:selected').data('score')); }
function closeRecordModal() {
    $('#recordModal').addClass('hidden').removeClass('flex');
    $('#evidence_file').val('');
    $('#evidence_preview').addClass('hidden');
}

async function resizeImage(file, maxWidth = 1000) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; }
                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.8);
            };
        };
    });
}

function blobToBase64(blob) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(blob);
    });
}

async function saveBehaviorRecord() {
    const studentId = $('#selected_student_id').val();
    const criteriaId = $('#criteria_select').val();
    const score = parseInt($('#score_input').val());
    const fileInput = $('#evidence_file')[0].files[0];

    if (!studentId || !criteriaId || isNaN(score))
        return Swal.fire('ข้อมูลไม่ครบ', 'กรุณาเลือกนักเรียนและเกณฑ์ให้ถูกต้อง', 'warning');

    if (!fileInput)
        return Swal.fire('กรุณาแนบรูปหลักฐาน', 'ต้องอัปโหลดรูปภาพหลักฐานทุกครั้ง', 'warning');

    // ค้นหาจาก allStudents
    const student = allStudents.find(s => s.id === studentId);
    const studentSid = student?.sid || studentId;
    const studentFirstName = student?.firstName || '';
    const studentLastName = student?.lastName || '';

    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const safeName = `${studentFirstName}_${studentLastName}`.replace(/[\/\\:*?"<>|\s]/g, '_');
    const fileName = `behavior_${studentSid}-${safeName}_${dateStr}.jpg`;

    let finalImageUrl = null;

    if (fileInput) {
        if (!systemConfig || !systemConfig.gas_url || !systemConfig.drive_folder_id) {
            return Swal.fire('ตั้งค่าไม่สมบูรณ์', 'แอดมินยังไม่ได้ตั้งค่าการเชื่อมต่อ Google Drive API', 'error');
        }

        try {
            Swal.fire({ title: 'กำลังย่อขนาดและอัปโหลดรูปภาพ...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
            const resizedBlob = await resizeImage(fileInput);
            const base64Data = await blobToBase64(resizedBlob);

            const response = await fetch(systemConfig.gas_url, {
                method: "POST",
                body: JSON.stringify({
                    action: 'upload',              // ✅ แก้ bug: ต้องส่ง action ด้วยเสมอ
                    base64: base64Data,
                    fileName: fileName,
                    folderId: systemConfig.drive_folder_id
                })
            });

            const resData = await response.json();
            if (resData.status === 'success') finalImageUrl = resData.url;
            else throw new Error(resData.message);
        } catch (err) {
            console.error('Upload Error:', err);
            return Swal.fire('อัปโหลดรูปไม่สำเร็จ', 'โปรดตรวจสอบการเชื่อมต่อ API ของ Google', 'error');
        }
    }

    Swal.fire({ title: 'กำลังจัดเก็บลงฐานข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    const { error } = await db.from('behavior_logs').insert([{
        student_id: studentId,
        criteria_id: criteriaId,
        score_change: score,
        recorder_id: currentUser.id,
        description: $('#description_text').val(),
        evidence_url: finalImageUrl,
        academic_year: schoolInfo.current_academic_year,
        semester: schoolInfo.current_semester
    }]);

    if (!error) {
        Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ!', timer: 1500, showConfirmButton: false });
        clearSelectedStudent();
        $('#criteria_select').val('');
        $('#score_input').val('');
        $('#description_text').val('');
        closeRecordModal();
        initStudentTable();
        loadDashboard();
    } else {
        Swal.fire('Error', error.message, 'error');
    }
}

async function importFromGoogleSheet() {
    const { value: url } = await Swal.fire({
        title: 'นำเข้าจาก Google Sheet',
        html: '<p class="text-sm text-slate-500 mb-2">กรุณาวางลิงก์ Google Sheet ที่ต้องการนำเข้า<br><span class="text-rose-500 font-bold">*อย่าลืมตั้งค่าแชร์ไฟล์เป็น "ทุกคนที่มีลิงก์" (Viewer)*</span></p>',
        input: 'url',
        inputPlaceholder: 'https://docs.google.com/spreadsheets/d/...',
        showCancelButton: true,
        confirmButtonColor: '#f59e0b',
        confirmButtonText: '<i class="fas fa-cloud-download-alt mr-2"></i> ดึงข้อมูล',
        cancelButtonText: 'ยกเลิก',
        inputValidator: (value) => {
            if (!value || !value.includes('docs.google.com/spreadsheets')) {
                return 'กรุณาใส่ลิงก์ Google Sheet ให้ถูกต้อง';
            }
        }
    });

    if (!url) return;

    const match = url.match(/\/d\/(.*?)(\/|$)/);
    if (!match || !match[1]) {
        return Swal.fire('ผิดพลาด', 'ไม่พบรหัส Sheet ID จากลิงก์', 'error');
    }
    const sheetId = match[1];

    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;

    try {
        Swal.fire({ title: 'กำลังดึงข้อมูลจาก Google Sheet...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
        const response = await fetch(csvUrl);
        if (!response.ok) throw new Error('ไม่สามารถเข้าถึงไฟล์ได้ กรุณาตรวจสอบว่าเปิดการแชร์ไฟล์เป็นสาธารณะ (Anyone with the link) แล้วหรือยัง');

        const csvText = await response.text();
        const wb = XLSX.read(csvText, { type: 'string', raw: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' });

        await processImportData(rows);
    } catch (err) {
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
}

// ── นำเข้าจาก Excel (เฉพาะ super admin) ────────────────────────────────
function importFromExcel() {
    // เปิด file picker ผ่าน input ที่ซ่อนอยู่
    const input = document.getElementById('excel_import_input');
    input.value = '';          // reset เผื่อเลือกไฟล์เดิมซ้ำ
    input.click();
}

async function handleExcelImport(input) {
    const file = input.files[0];
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls'].includes(ext)) {
        return Swal.fire('ไฟล์ไม่ถูกต้อง', 'กรุณาเลือกไฟล์ .xlsx หรือ .xls เท่านั้น', 'error');
    }

    // แสดง preview ชื่อไฟล์ + ยืนยัน
    const confirm = await Swal.fire({
        title: 'นำเข้าจาก Excel',
        html: `<div class="text-left">
            <p class="text-sm text-slate-600 mb-3">ไฟล์ที่เลือก: <span class="font-bold text-blue-700">${file.name}</span></p>
            <div class="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                <i class="fas fa-exclamation-triangle mr-1"></i>
                ระบบจะอ่านข้อมูลจากชีทแรก โดยข้ามแถวที่ไม่มีรหัสนักเรียน<br>
                คอลัมน์: รหัสนักเรียน*, วันที่/เวลา, รายการ, รายละเอียด, คะแนน*, หลักฐาน (URL), ผู้บันทึก
            </div>
        </div>`,
        showCancelButton: true,
        confirmButtonColor: '#7c3aed',
        confirmButtonText: '<i class="fas fa-file-import mr-1"></i> นำเข้าเลย',
        cancelButtonText: 'ยกเลิก'
    });
    if (!confirm.isConfirmed) return;

    try {
        Swal.fire({ title: 'กำลังอ่านไฟล์ Excel...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

        const arrayBuffer = await file.arrayBuffer();
        const wb = XLSX.read(arrayBuffer, { type: 'array', raw: false, cellDates: false });

        // อ่านชีทแรก — range:2 = ข้าม 2 แถวแรก (title/คำอธิบาย) ให้แถวที่ 3 เป็น header
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '', range: 2 });

        if (rows.length === 0) {
            return Swal.fire('ไม่พบข้อมูล', 'ไม่พบข้อมูลในชีทแรก กรุณาตรวจสอบไฟล์', 'warning');
        }

        await processImportData(rows);
    } catch (err) {
        Swal.fire('เกิดข้อผิดพลาด', err.message || 'ไม่สามารถอ่านไฟล์ได้', 'error');
    }
}

async function processImportData(rows) {
    // ── Fix 2: normalize column names — ลบ * และ whitespace ออกจาก key ทุกตัว ──
    const normalizedRows = rows.map(function(r) {
        const norm = {};
        Object.keys(r).forEach(function(k) {
            norm[k.replace(/\*/g, '').trim()] = r[k];
        });
        return norm;
    });

    // ── Fix: กรองเฉพาะแถวที่รหัสนักเรียนเป็นตัวเลขล้วน (ข้ามแถวตัวอย่าง/คำเตือน) ──
    const dataRows = normalizedRows.filter(function(r) {
        const stdCode = String(r['รหัสนักเรียน'] || '').trim();
        return /^\d+$/.test(stdCode);
    });

    if (dataRows.length === 0) throw new Error('ไม่พบข้อมูลในไฟล์ (ตรวจสอบว่ามีคอลัมน์ "รหัสนักเรียน" หรือไม่)');

    Swal.fire({
        title: `พบข้อมูล ${dataRows.length} รายการ`,
        text: 'กำลังประมวลผลและตรวจสอบรหัสนักเรียน...',
        didOpen: () => Swal.showLoading(),
        allowOutsideClick: false
    });

    const { data: studentsList, error: stuErr } = await db.from('core_students').select('id, student_id_card').limit(10000);
    if (stuErr) throw stuErr;

    const studentMap = {};
    (studentsList || []).forEach(s => { studentMap[String(s.student_id_card).trim()] = s.id; });

    const criteriaCache = new Map();
    (criteriaList || []).forEach(c => criteriaCache.set(c.title.trim(), c.id));

    const uniqueNewCriteria = new Map();
    dataRows.forEach(row => {
        const title = String(row['รายการ'] || 'ประวัติจากระบบเก่า (นำเข้า)').trim();
        const scoreChange = parseInt(String(row['คะแนน'] || '0').replace(/[^0-9+\-]/g, ''));
        if (!criteriaCache.has(title) && !isNaN(scoreChange) && scoreChange !== 0) {
            uniqueNewCriteria.set(title, scoreChange);
        }
    });

    if (uniqueNewCriteria.size > 0) {
        const criteriaToInsert = Array.from(uniqueNewCriteria.entries()).map(([title, score]) => ({
            title: title,
            category: score >= 0 ? 'positive' : 'negative',
            default_score: Math.abs(score) || 5
        }));

        const { data: newCriteriaRecords, error: critErr } = await db.from('behavior_criteria').insert(criteriaToInsert).select();
        if (critErr) throw critErr;

        newCriteriaRecords.forEach(c => {
            criteriaCache.set(c.title, c.id);
            if (Array.isArray(criteriaList)) criteriaList.push(c);
        });
    }

    function parseDateTime(raw) {
        if (!raw || String(raw).trim() === '') return new Date().toISOString();
        const s = String(raw).trim();
        // รองรับ: "27/11/2024, 8:34:24" | "15/03/2567 08:30" | "d/m/yyyy h:mm" ทุกรูปแบบ
        const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::\d{2})?)?/);
        if (m) {
            let [, d, mo, y, hr = '12', mn = '0'] = m;
            if (parseInt(y) > 2400) y = parseInt(y) - 543;   // แปลง พ.ศ. → ค.ศ.
            const dt = new Date(parseInt(y), parseInt(mo) - 1, parseInt(d), parseInt(hr), parseInt(mn));
            if (!isNaN(dt.getTime())) return dt.toISOString();
        }
        const dt2 = new Date(s);
        return !isNaN(dt2.getTime()) ? dt2.toISOString() : new Date().toISOString();
    }

    const logsToInsert = [];
    const errors = [];

    for (const row of dataRows) {
        const stdCode = String(row['รหัสนักเรียน'] || '').trim();
        const title = String(row['รายการ'] || 'ประวัติจากระบบเก่า (นำเข้า)').trim();
        const scoreRaw = String(row['คะแนน'] || '0').replace(/[^0-9+\-]/g, '');
        let scoreChange = parseInt(scoreRaw);

        if (isNaN(scoreChange) || scoreChange === 0) {
            errors.push(`รหัส ${stdCode}: คะแนน "${row['คะแนน']}" ไม่ถูกต้อง`);
            continue;
        }

        const stdUuid = studentMap[stdCode];
        if (!stdUuid) {
            errors.push(`ไม่พบรหัสนักเรียน: ${stdCode}`);
            continue;
        }

        const criteriaId = criteriaCache.get(title);
        if (!criteriaId) continue;

        const desc = String(row['รายละเอียด'] || '').trim();
        const recorder = String(row['ผู้บันทึก'] || '').trim();
        const fullDesc = [desc, recorder ? `ผู้บันทึกเดิม: ${recorder}` : ''].filter(Boolean).join(' | ');

        logsToInsert.push({
            student_id: stdUuid,
            criteria_id: criteriaId,
            score_change: scoreChange,
            description: fullDesc || null,
            evidence_url: String(row['หลักฐาน (URL)'] || row['หลักฐาน'] || '').trim() || null,
            created_at: parseDateTime(row['วันที่/เวลา']),
            recorder_id: currentUser.id,
            academic_year: schoolInfo.current_academic_year,
            semester: schoolInfo.current_semester
        });
    }

    if (logsToInsert.length === 0) {
        const errMsg = errors.slice(0, 5).join('\n');
        Swal.fire('ไม่พบข้อมูลที่ใช้ได้', errMsg || 'ตรวจสอบรหัสนักเรียนและคะแนน', 'error');
        return;
    }

    // ── Dedup: ข้ามรายการที่มีอยู่แล้ว (student_id + created_at + score_change) ──
    Swal.fire({ title: 'กำลังตรวจสอบรายการซ้ำ...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    const importStudentIds = [...new Set(logsToInsert.map(l => l.student_id))];

    // ดึง existing logs แบบ batch 50 IDs ต่อครั้ง เพื่อหลีกเลี่ยง URL too long (400)
    const DEDUP_BATCH = 50;
    let existingLogs = [];
    for (let i = 0; i < importStudentIds.length; i += DEDUP_BATCH) {
        const batchIds = importStudentIds.slice(i, i + DEDUP_BATCH);
        const { data: batchLogs, error: fetchErr } = await db
            .from('behavior_logs')
            .select('student_id, created_at, score_change')
            .in('student_id', batchIds);
        if (fetchErr) throw fetchErr;
        if (batchLogs) existingLogs = existingLogs.concat(batchLogs);
    }

    // สร้าง Set ของ key "student_id|ISO_date|score" เพื่อ lookup O(1)
    const existingKeys = new Set(
        (existingLogs || []).map(l => {
            // normalize เป็น date string เฉพาะวัน+ชม+นาที เพื่อให้ tolerance เรื่อง timezone/ms
            const dt = new Date(l.created_at);
            const dateKey = `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}-${dt.getHours()}-${dt.getMinutes()}`;
            return `${l.student_id}|${dateKey}|${l.score_change}`;
        })
    );

    const dedupedLogs = [];
    const dupSkipped = [];
    logsToInsert.forEach(function(log) {
        const dt = new Date(log.created_at);
        const dateKey = `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}-${dt.getHours()}-${dt.getMinutes()}`;
        const key = `${log.student_id}|${dateKey}|${log.score_change}`;
        if (existingKeys.has(key)) {
            dupSkipped.push(log);
        } else {
            dedupedLogs.push(log);
        }
    });

    if (dedupedLogs.length === 0) {
        await Swal.fire({
            icon: 'info',
            title: 'ไม่มีรายการใหม่',
            html: `<p>ข้อมูลทั้งหมด <b>${dupSkipped.length}</b> รายการมีอยู่ในระบบแล้ว</p>
                   <p class="text-sm text-slate-500 mt-1">ระบบข้ามรายการซ้ำทั้งหมด ไม่มีการเพิ่มข้อมูล</p>`
        });
        return;
    }

    // Insert เฉพาะรายการใหม่ที่ไม่ซ้ำ
    const BATCH = 100;
    let success = 0;
    for (let i = 0; i < dedupedLogs.length; i += BATCH) {
        const batchData = dedupedLogs.slice(i, i + BATCH);
        const { error } = await db.from('behavior_logs').insert(batchData);
        if (error) throw error;
        success += batchData.length;
    }

    const invalidSkip = dataRows.length - logsToInsert.length;   // ข้ามเพราะ error (รหัสไม่พบ ฯลฯ)
    const totalSkipped = dupSkipped.length + invalidSkip;

    await Swal.fire({
        icon: 'success',
        title: 'นำเข้าสำเร็จ!',
        html: `<div class="text-left space-y-1">
                 <p>✅ เพิ่มใหม่ <b class="text-green-700">${success}</b> รายการ</p>
                 ${dupSkipped.length > 0 ? `<p>⏭️ ข้ามซ้ำ <b class="text-blue-600">${dupSkipped.length}</b> รายการ (มีอยู่แล้ว)</p>` : ''}
                 ${invalidSkip > 0 ? `<p>⚠️ ข้ามผิดพลาด <b class="text-amber-600">${invalidSkip}</b> รายการ (รหัสไม่พบ/คะแนนผิด)</p>` : ''}
               </div>
               ${errors.length > 0 ? `<details class="mt-3 text-left"><summary class="text-xs cursor-pointer text-slate-400">รายละเอียด error (${errors.length} รายการ)</summary>
               <pre class="text-xs text-red-400 max-h-28 overflow-y-auto mt-1 bg-red-50 p-2 rounded-lg">${errors.slice(0, 15).join('\n')}</pre></details>` : ''}`
    });

    initStudentTable();
    loadDashboard();
}

function filterByScore(type) {
    let filtered = [];
    if (type === 'positive') filtered = allStudents.filter(s => s.pos > 0);
    else if (type === 'negative') filtered = allStudents.filter(s => s.neg > 0);
    else if (type === 'high') filtered = allStudents.filter(s => s.score > 100);
    else if (type === 'low') filtered = allStudents.filter(s => s.score < 50);
    renderTable(filtered);
}

function filterCustomScore(mode) {
    const val = parseInt($('#filter_score_val').val());
    if (isNaN(val)) return;
    renderTable(allStudents.filter(s => mode === 'more' ? s.score > val : s.score < val));
}

async function exportTable() {
    // ── Step 1: เลือกประเภทรายการ ──────────────────────────────────────────
    const { value: exportType } = await Swal.fire({
        title: '<i class="fas fa-file-excel mr-2 text-green-600"></i>ส่งออก Excel',
        html: `
        <div class="text-left space-y-4 pt-2">
            <div>
                <p class="text-xs font-bold text-slate-500 mb-2">1. เลือกประเภทรายการ</p>
                <div class="grid grid-cols-2 gap-2">
                    <label class="flex items-center gap-2 border-2 border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:border-blue-400 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
                        <input type="radio" name="exp_type" value="positive" class="accent-blue-500">
                        <span class="text-sm font-medium text-green-700"><i class="fas fa-plus-circle mr-1"></i>เพิ่มคะแนน</span>
                    </label>
                    <label class="flex items-center gap-2 border-2 border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:border-blue-400 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
                        <input type="radio" name="exp_type" value="negative" class="accent-blue-500">
                        <span class="text-sm font-medium text-red-700"><i class="fas fa-minus-circle mr-1"></i>ตัดคะแนน</span>
                    </label>
                    <label class="flex items-center gap-2 border-2 border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:border-blue-400 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
                        <input type="radio" name="exp_type" value="both" class="accent-blue-500">
                        <span class="text-sm font-medium text-blue-700"><i class="fas fa-exchange-alt mr-1"></i>เพิ่ม+ตัดคะแนน</span>
                    </label>
                    <label class="flex items-center gap-2 border-2 border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:border-blue-400 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
                        <input type="radio" name="exp_type" value="all_students" class="accent-blue-500" checked>
                        <span class="text-sm font-medium text-slate-700"><i class="fas fa-users mr-1"></i>นักเรียนทุกคน</span>
                    </label>
                </div>
            </div>

            <div>
                <p class="text-xs font-bold text-slate-500 mb-2">2. เลือกช่วงเวลา</p>
                <div class="grid grid-cols-2 gap-2">
                    <label class="flex items-center gap-2 border-2 border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:border-blue-400 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
                        <input type="radio" name="exp_period" value="day" class="accent-blue-500">
                        <span class="text-sm font-medium"><i class="fas fa-calendar-day mr-1 text-slate-400"></i>รายวัน (วันนี้)</span>
                    </label>
                    <label class="flex items-center gap-2 border-2 border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:border-blue-400 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
                        <input type="radio" name="exp_period" value="week" class="accent-blue-500">
                        <span class="text-sm font-medium"><i class="fas fa-calendar-week mr-1 text-slate-400"></i>รายสัปดาห์</span>
                    </label>
                    <label class="flex items-center gap-2 border-2 border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:border-blue-400 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
                        <input type="radio" name="exp_period" value="month" class="accent-blue-500" onchange="document.getElementById('month_picker').classList.toggle('hidden', this.value !== 'month')">
                        <span class="text-sm font-medium"><i class="fas fa-calendar-alt mr-1 text-slate-400"></i>รายเดือน</span>
                    </label>
                    <label class="flex items-center gap-2 border-2 border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:border-blue-400 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
                        <input type="radio" name="exp_period" value="all" class="accent-blue-500" checked onchange="document.getElementById('month_picker').classList.add('hidden')">
                        <span class="text-sm font-medium"><i class="fas fa-calendar mr-1 text-slate-400"></i>ทั้งหมด</span>
                    </label>
                </div>
                <div id="month_picker" class="hidden mt-2 flex gap-2">
                    <select id="sel_month" class="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                        ${['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'].map((m,i) => `<option value="${i}" ${i === new Date().getMonth() ? 'selected' : ''}>${m}</option>`).join('')}
                    </select>
                    <select id="sel_year" class="w-28 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                        ${Array.from({length: 5}, (_,i) => new Date().getFullYear() - i).map(y => `<option value="${y}" ${y === new Date().getFullYear() ? 'selected' : ''}>${y + 543}</option>`).join('')}
                    </select>
                </div>
            </div>

            <div>
                <p class="text-xs font-bold text-slate-500 mb-2">3. เลือกระดับชั้น</p>
                <div class="grid grid-cols-3 gap-2">
                    <label class="flex items-center gap-2 border-2 border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:border-blue-400 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
                        <input type="radio" name="exp_grade" value="1" class="accent-blue-500">
                        <span class="text-sm font-medium">ม.1</span>
                    </label>
                    <label class="flex items-center gap-2 border-2 border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:border-blue-400 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
                        <input type="radio" name="exp_grade" value="2" class="accent-blue-500">
                        <span class="text-sm font-medium">ม.2</span>
                    </label>
                    <label class="flex items-center gap-2 border-2 border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:border-blue-400 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
                        <input type="radio" name="exp_grade" value="3" class="accent-blue-500">
                        <span class="text-sm font-medium">ม.3</span>
                    </label>
                    <label class="flex items-center gap-2 border-2 border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:border-blue-400 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
                        <input type="radio" name="exp_grade" value="4" class="accent-blue-500">
                        <span class="text-sm font-medium">ม.4</span>
                    </label>
                    <label class="flex items-center gap-2 border-2 border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:border-blue-400 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
                        <input type="radio" name="exp_grade" value="5" class="accent-blue-500">
                        <span class="text-sm font-medium">ม.5</span>
                    </label>
                    <label class="flex items-center gap-2 border-2 border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:border-blue-400 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
                        <input type="radio" name="exp_grade" value="6" class="accent-blue-500">
                        <span class="text-sm font-medium">ม.6</span>
                    </label>
                    <label class="flex items-center gap-2 border-2 border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:border-blue-400 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
                        <input type="radio" name="exp_grade" value="1-3" class="accent-blue-500">
                        <span class="text-sm font-medium">ม.1-3</span>
                    </label>
                    <label class="flex items-center gap-2 border-2 border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:border-blue-400 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
                        <input type="radio" name="exp_grade" value="4-6" class="accent-blue-500">
                        <span class="text-sm font-medium">ม.4-6</span>
                    </label>
                    <label class="flex items-center gap-2 border-2 border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:border-blue-400 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50">
                        <input type="radio" name="exp_grade" value="all" class="accent-blue-500" checked>
                        <span class="text-sm font-medium">ทุกระดับ</span>
                    </label>
                </div>
            </div>
        </div>`,
        width: '600px',
        showCancelButton: true,
        confirmButtonColor: '#16a34a',
        confirmButtonText: '<i class="fas fa-file-excel mr-1"></i> ส่งออก Excel',
        cancelButtonText: 'ยกเลิก',
        focusConfirm: false,
        preConfirm: () => {
            const type   = document.querySelector('input[name="exp_type"]:checked')?.value;
            const period = document.querySelector('input[name="exp_period"]:checked')?.value;
            const grade  = document.querySelector('input[name="exp_grade"]:checked')?.value;
            if (!type || !period || !grade)
                return Swal.showValidationMessage('กรุณาเลือกให้ครบทุกข้อ');
            const month  = period === 'month' ? parseInt(document.getElementById('sel_month')?.value ?? new Date().getMonth()) : null;
            const year   = period === 'month' ? parseInt(document.getElementById('sel_year')?.value ?? new Date().getFullYear()) : null;
            return { type, period, grade, month, year };
        }
    });

    if (!exportType) return;

    Swal.fire({ title: 'กำลังเตรียมข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    // ── กำหนดช่วงเวลา ──────────────────────────────────────────────────────
    const now = new Date();
    let dateFrom = null;
    if (exportType.period === 'day') {
        dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (exportType.period === 'week') {
        const day = now.getDay(); // 0=อาทิตย์
        const diff = (day === 0) ? 6 : day - 1; // จันทร์ = วันแรกของสัปดาห์
        dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
    } else if (exportType.period === 'month') {
        const m = exportType.month ?? now.getMonth();
        const y = exportType.year ?? now.getFullYear();
        dateFrom = new Date(y, m, 1);
        // dateTo = สิ้นเดือนที่เลือก
        const dateToMonth = new Date(y, m + 1, 0, 23, 59, 59);
        // store for use in query
        exportType._dateTo = dateToMonth;
    }

    // ── กำหนดระดับชั้น ─────────────────────────────────────────────────────
    let gradeFilter = null;
    if (exportType.grade === '1-3')       gradeFilter = [1, 2, 3];
    else if (exportType.grade === '4-6')  gradeFilter = [4, 5, 6];
    else if (exportType.grade !== 'all')  gradeFilter = [parseInt(exportType.grade)];

    // ── กรองนักเรียน ────────────────────────────────────────────────────────
    let filteredStudents = allStudents;
    if (gradeFilter) {
        filteredStudents = filteredStudents.filter(s => gradeFilter.includes(s.grade_level));
    }

    // ── สร้างชื่อไฟล์ ───────────────────────────────────────────────────────
    const typeLabel   = { positive: 'เพิ่มคะแนน', negative: 'ตัดคะแนน', both: 'เพิ่มและตัดคะแนน', all_students: 'นักเรียนทุกคน' };
    const periodLabel = { day: 'รายวัน', week: 'รายสัปดาห์', month: 'รายเดือน', all: 'ทั้งหมด' };
    const gradeLabel  = exportType.grade === 'all' ? 'ทุกระดับ' : (exportType.grade === '1-3' ? 'ม.1-3' : (exportType.grade === '4-6' ? 'ม.4-6' : `ม.${exportType.grade}`));
    const dateStr     = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const fileName    = `ความประพฤติ_${typeLabel[exportType.type]}_${periodLabel[exportType.period]}_${gradeLabel}_${dateStr}.xlsx`;

    // สร้าง Set ของ student_id ที่ผ่านกรองระดับชั้น (ใช้กรองใน JS แทน .in() ที่ทำให้ URL ยาวเกิน)
    const filteredStudentIdSet = gradeFilter
        ? new Set(filteredStudents.map(s => s.id))
        : null;

    // ── โหมด "นักเรียนทุกคน" → สรุปรายนักเรียน ────────────────────────────
    if (exportType.type === 'all_students') {
        let periodScores = {};
        if (exportType.period !== 'all') {
            // ดึง logs ตามช่วงเวลา ไม่ใช้ .in() → กรองระดับชั้นใน JS
            const { data: periodLogs } = await db.from('behavior_logs')
                .select('student_id, score_change')
                .gte('created_at', dateFrom.toISOString());
            (periodLogs || []).forEach(log => {
                if (filteredStudentIdSet && !filteredStudentIdSet.has(log.student_id)) return;
                if (!periodScores[log.student_id]) periodScores[log.student_id] = { pos: 0, neg: 0 };
                if (log.score_change > 0) periodScores[log.student_id].pos += log.score_change;
                else periodScores[log.student_id].neg += Math.abs(log.score_change);
            });
        }

        const exportData = filteredStudents.map(s => {
            const row = {
                'เลขประจำตัว': s.sid,
                'ชื่อ-นามสกุล': s.fullName,
                'ชั้นเรียน': s.roomDisplay,
                'คะแนนปัจจุบัน': s.score
            };
            if (exportType.period !== 'all') {
                const ps = periodScores[s.id] || { pos: 0, neg: 0 };
                row['คะแนนที่ได้รับ (ช่วงนี้)'] = ps.pos;
                row['คะแนนที่ถูกตัด (ช่วงนี้)'] = ps.neg;
            } else {
                row['จำนวนครั้งที่ทำดี'] = s.pos;
                row['จำนวนครั้งที่ผิดระเบียบ'] = s.neg;
            }
            return row;
        });

        _writeExcel(exportData, fileName, `สรุปคะแนนความประพฤติ (${periodLabel[exportType.period]})`);
        return;
    }

    // ── โหมดดู log รายรายการ ──────────────────────────────────────────────
    // ไม่ใช้ .in('student_id', ...) เพื่อหลีกเลี่ยง 400 Bad Request (URL ยาวเกิน)
    // กรองระดับชั้นใน JS หลังดึงข้อมูลมาแล้ว
    let logQuery = db.from('behavior_logs')
        .select(`
            student_id, score_change, description, created_at,
            behavior_criteria(title, category),
            student:core_students!student_id(
                student_id_card, prefix, first_name, last_name,
                student_enrollments(student_number, core_classrooms(grade_level, room_number))
            ),
            recorder:core_personnel!recorder_id(prefix, first_name, last_name)
        `)
        .order('created_at', { ascending: false });

    if (exportType.type === 'positive') logQuery = logQuery.gt('score_change', 0);
    else if (exportType.type === 'negative') logQuery = logQuery.lt('score_change', 0);
    if (dateFrom) logQuery = logQuery.gte('created_at', dateFrom.toISOString());

    const { data: rawLogs, error } = await logQuery.limit(10000);
    if (error) {
        Swal.close();
        return Swal.fire('ผิดพลาด', error.message, 'error');
    }

    // กรองระดับชั้นใน JS
    const logs = filteredStudentIdSet
        ? (rawLogs || []).filter(log => filteredStudentIdSet.has(log.student_id))
        : (rawLogs || []);

    if (!logs || logs.length === 0) {
        Swal.close();
        return Swal.fire('ไม่พบข้อมูล', 'ไม่มีรายการในเงื่อนไขที่เลือก', 'info');
    }

    // ── สร้าง lookup คะแนนปัจจุบัน จาก allStudents ─────────────────────────
    const scoreMap = {};
    allStudents.forEach(s => { scoreMap[s.id] = s.score; });

    const exportData = logs.map(log => {
        const student  = log.student || {};
        const enroll   = Array.isArray(student.student_enrollments) ? student.student_enrollments[0] : student.student_enrollments;
        const classroom = enroll?.core_classrooms || {};
        const roomDisplay = classroom.grade_level ? `ม.${classroom.grade_level}/${classroom.room_number}` : '-';
        const fullName    = ((student.prefix || '') + (student.first_name || '') + ' ' + (student.last_name || '')).trim() || '-';
        const recorder    = log.recorder
            ? ((log.recorder.prefix || '') + log.recorder.first_name + ' ' + log.recorder.last_name).trim()
            : '-';
        const createdAt = new Date(log.created_at).toLocaleDateString('th-TH', {
            year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        const categoryLabel = log.behavior_criteria?.category === 'positive' ? 'เพิ่มคะแนน' : 'ตัดคะแนน';

        return {
            'เลขประจำตัว':       student.student_id_card || '-',
            'ชื่อ-นามสกุล':      fullName,
            'ชั้นเรียน':          roomDisplay,
            'รายการ':             log.behavior_criteria?.title || '-',
            'ประเภท':             categoryLabel,
            'คะแนน':              log.score_change > 0 ? `+${log.score_change}` : String(log.score_change),
            'วันเวลา':            createdAt,
            'คะแนนปัจจุบัน':     scoreMap[log.student_id] ?? '-',
            'ผู้บันทึก':          recorder,
            'รายละเอียด':         log.description || ''
        };
    });

    _writeExcel(exportData, fileName, `รายการ${typeLabel[exportType.type]}`);
}

async function exportSummary() {
    Swal.fire({ title: 'กำลังเตรียมข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    // ดึง logs ทั้งหมด (ไม่ใช้ .in() เพื่อหลีกเลี่ยง 400)
    const { data: allLogs, error } = await db.from('behavior_logs')
        .select('student_id, score_change, created_at');
    if (error) {
        Swal.close();
        return Swal.fire('ผิดพลาด', error.message, 'error');
    }

    // จัดกลุ่ม logs ตาม student_id
    const logMap = {};
    (allLogs || []).forEach(log => {
        if (!logMap[log.student_id]) logMap[log.student_id] = [];
        logMap[log.student_id].push(log);
    });

    const now = new Date();
    const startOfDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayOfWeek    = now.getDay();
    const startOfWeek  = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const sorted = [...allStudents].sort((a, b) => a.grade_level - b.grade_level || a.room_number - b.room_number || String(a.sid).localeCompare(String(b.sid)));
    const exportData = sorted.map(s => {
        const logs = logMap[s.id] || [];
        const logsDay   = logs.filter(l => new Date(l.created_at) >= startOfDay);
        const logsWeek  = logs.filter(l => new Date(l.created_at) >= startOfWeek);
        const logsMonth = logs.filter(l => new Date(l.created_at) >= startOfMonth);

        const sumScore = arr => arr.reduce((acc, l) => acc + l.score_change, 0);
        const posScore = arr => arr.filter(l => l.score_change > 0).reduce((acc, l) => acc + l.score_change, 0);
        const negScore = arr => arr.filter(l => l.score_change < 0).reduce((acc, l) => acc + Math.abs(l.score_change), 0);

        return {
            'เลขประจำตัว':          s.sid,
            'ชื่อ-นามสกุล':          `${s.prefix}${s.firstName} ${s.lastName}`.trim(),
            'ชั้นเรียน':              s.roomDisplay,
            'คะแนนปัจจุบัน':         s.score,
            'รวมได้รับ (ทั้งหมด)':   posScore(logs),
            'รวมถูกตัด (ทั้งหมด)':   negScore(logs),
            'รวมได้รับ (เดือนนี้)':  posScore(logsMonth),
            'รวมถูกตัด (เดือนนี้)':  negScore(logsMonth),
            'รวมได้รับ (สัปดาห์นี้)': posScore(logsWeek),
            'รวมถูกตัด (สัปดาห์นี้)': negScore(logsWeek),
            'รวมได้รับ (วันนี้)':    posScore(logsDay),
            'รวมถูกตัด (วันนี้)':    negScore(logsDay),
            'จำนวนครั้งทำดี':         s.pos,
            'จำนวนครั้งผิดระเบียบ':   s.neg
        };
    });

    const dateStr  = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const fileName = `สรุปคะแนนความประพฤติ_${dateStr}.xlsx`;
    _writeExcel(exportData, fileName, 'สรุปคะแนน');
}

function _writeExcel(exportData, fileName, sheetName) {
    const worksheet = XLSX.utils.json_to_sheet(exportData);

    // ปรับความกว้างคอลัมน์อัตโนมัติ
    const cols = Object.keys(exportData[0] || {}).map(key => ({
        wch: Math.max(key.length * 2, 12)
    }));
    worksheet['!cols'] = cols;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
    XLSX.writeFile(workbook, fileName);
    Swal.close();
}

// viewHistory → แทนด้วย inline modal ด้านล่าง
// ── ประวัติ + ลบ (inline modal) ──────────────────────────────────────────
function viewHistory(studentId) {
    const student = allStudents.find(s => s.id === studentId);
    if (!student) return;

    $('#historyStudentName').text(student.fullName + ' (' + student.roomDisplay + ')');
    $('#historyStudentScore').text(student.score);

    // แสดงรูปโปรไฟล์นักเรียน
    const $avatar = $('#historyAvatar');
    const $avatarWrap = $('#historyAvatarWrap');
    if (student.avatar) {
        $avatar.attr('src', student.avatar).removeClass('hidden');
        $avatarWrap.removeClass('hidden');
    } else {
        $avatar.addClass('hidden');
        $avatarWrap.addClass('hidden');
    }

    $('#historyModal').data('studentId', studentId).removeClass('hidden').addClass('flex');
    loadStudentHistory(studentId);
}

async function loadStudentHistory(studentId) {
    $('#historyBody').html('<tr><td colspan="6" class="text-center py-8 text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i>กำลังโหลด...</td></tr>');

    const { data, error } = await db.from('behavior_logs')
        .select('id, criteria_id, score_change, description, evidence_url, created_at, updated_at, behavior_criteria(id, title, category), recorder:core_personnel!recorder_id(prefix, first_name, last_name), updatedBy:core_personnel!updated_by(prefix, first_name, last_name)')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false });

    if (error) {
        $('#historyBody').html('<tr><td colspan="6" class="text-center py-4 text-red-400">เกิดข้อผิดพลาด: ' + error.message + '</td></tr>');
        return;
    }

    // ── สิทธิ์แต่ละระดับ ──────────────────────────────────────────────────
    const isSuperAdmin    = currentUser.role === 'super_admin';
    const isDiscHead      = currentUser.isDisciplineHead;
    const isGradeHead     = currentUser.role === 'admin' && currentUser.managedGrades.length > 0 && !isDiscHead;
    const canEdit         = isSuperAdmin || isDiscHead || isGradeHead;   // ทุกระดับที่สูงกว่าครู
    const canDelete       = isSuperAdmin || isDiscHead;

    if (!data || data.length === 0) {
        $('#historyBody').html('<tr><td colspan="6" class="text-center py-8 text-slate-400">ไม่มีประวัติการบันทึก</td></tr>');
        return;
    }

    let html = '';
    data.forEach(function(log) {
        const date = new Date(log.created_at).toLocaleDateString('th-TH', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
        const isPos      = log.score_change > 0;
        const scoreClass = isPos ? 'text-green-600' : 'text-red-600';
        const scorePre   = isPos ? '+' : '';
        const recorder   = log.recorder
            ? (log.recorder.prefix || '') + log.recorder.first_name + ' ' + log.recorder.last_name
            : '-';
        const evidenceLink = log.evidence_url
            ? '<a href="' + log.evidence_url + '" target="_blank" class="text-blue-500 hover:underline text-xs ml-1"><i class="fas fa-image"></i></a>'
            : '';

        // แสดงแก้ไขล่าสุด (ถ้ามี updated_at และต่างจาก created_at)
        let editedLine = '';
        if (log.updated_at && log.updated_at !== log.created_at) {
            const updDate = new Date(log.updated_at).toLocaleDateString('th-TH', {
                year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });
            const updBy = log.updatedBy
                ? (log.updatedBy.prefix || '') + log.updatedBy.first_name + ' ' + log.updatedBy.last_name
                : '-';
            editedLine = '<div class="text-amber-500 text-[10px] mt-0.5">'
                + '<i class="fas fa-pen mr-1"></i>แก้ไขล่าสุด ' + updDate + ' โดย ' + updBy + '</div>';
        }

        // ปุ่มแก้ไข
        const editBtn = canEdit
            ? '<button onclick="editLog(\'' + log.id + '\', \'' + studentId + '\')" '
              + 'class="text-blue-300 hover:text-blue-600 transition p-1 rounded-lg hover:bg-blue-50" title="แก้ไข">'
              + '<i class="fas fa-pen text-xs"></i></button>'
            : '';

        // ปุ่มลบ
        const deleteBtn = canDelete
            ? '<button onclick="deleteLog(\'' + log.id + '\', \'' + studentId + '\')" '
              + 'class="text-red-300 hover:text-red-600 transition p-1 rounded-lg hover:bg-red-50" title="ลบ">'
              + '<i class="fas fa-trash-alt text-xs"></i></button>'
            : '';

        html += '<tr class="border-b border-slate-100 hover:bg-slate-50">'
            + '<td class="py-2 px-3 text-xs text-slate-500 whitespace-nowrap">' + date + '</td>'
            + '<td class="py-2 px-3 text-sm font-medium">' + (log.behavior_criteria ? log.behavior_criteria.title : '-') + '</td>'
            + '<td class="py-2 px-3 text-center font-black ' + scoreClass + '">' + scorePre + log.score_change + '</td>'
            + '<td class="py-2 px-3 text-xs text-slate-500">' + (log.description || '-') + evidenceLink
            + '<div class="text-slate-400 text-[10px] mt-0.5">บันทึกโดย: ' + recorder + '</div>'
            + editedLine + '</td>'
            + '<td class="py-2 px-3 text-center whitespace-nowrap">' + editBtn + ' ' + deleteBtn + '</td>'
            + '</tr>';
    });

    $('#historyBody').html(html);
}

// ── แก้ไข log ───────────────────────────────────────────────────────────
async function editLog(logId, studentId) {
    // โหลดข้อมูล log ที่จะแก้ไข
    const { data: log, error } = await db.from('behavior_logs')
        .select('id, criteria_id, score_change, description, evidence_url, behavior_criteria(id, title, category)')
        .eq('id', logId).single();
    if (error || !log) return Swal.fire('ผิดพลาด', 'ไม่พบข้อมูลรายการนี้', 'error');

    const curCategory = log.behavior_criteria?.category || 'negative';

    // สร้าง options criteria
    const criteriaOptions = criteriaList
        .filter(c => c.category === curCategory)
        .map(c => '<option value="' + c.id + '" data-score="' + (c.category === 'negative' ? -c.default_score : c.default_score) + '"'
            + (c.id === log.criteria_id ? ' selected' : '') + '>'
            + c.title + ' (' + (c.category === 'negative' ? '-' : '+') + c.default_score + ')</option>')
        .join('');

    // แสดงรูปเดิม (ถ้ามี)
    const existingImgHtml = log.evidence_url
        ? `<div class="mt-2">
              <p class="text-[10px] text-slate-400 mb-1">รูปปัจจุบัน (คลิกเพื่อดู):</p>
              <a href="${log.evidence_url}" target="_blank">
                <img src="${log.evidence_url}" class="h-20 rounded-xl object-cover border border-slate-200 hover:opacity-80 transition">
              </a>
           </div>`
        : '<p class="text-[10px] text-slate-400 mt-1">ยังไม่มีรูปหลักฐาน</p>';

    const { value: formValues } = await Swal.fire({
        title: '<i class="fas fa-pen mr-2 text-blue-500"></i>แก้ไขรายการ',
        width: '660px',
        html: `
        <div class="text-left space-y-3">
            <div>
                <label class="block text-xs font-bold text-slate-500 mb-1">รายการเกณฑ์</label>
                <select id="edit_criteria" class="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400"
                    onchange="document.getElementById('edit_score').value = this.options[this.selectedIndex].dataset.score">
                    ${criteriaOptions}
                </select>
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-500 mb-1">คะแนน</label>
                <input id="edit_score" type="number" value="${log.score_change}"
                    class="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm text-center font-bold outline-none focus:border-blue-400">
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-500 mb-1">รายละเอียดเพิ่มเติม</label>
                <textarea id="edit_desc" rows="2"
                    class="w-full border-2 border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400">${log.description || ''}</textarea>
            </div>
            <div>
                <label class="block text-xs font-bold text-slate-500 mb-1">
                    รูปภาพหลักฐาน
                    <span class="font-normal text-slate-400">(เลือกใหม่เพื่อแทนที่รูปเดิม — ย่อขนาดอัตโนมัติ)</span>
                </label>
                ${existingImgHtml}
                <input type="file" id="edit_evidence" accept="image/*"
                    class="w-full text-sm mt-2 file:mr-3 file:py-1.5 file:px-4 file:rounded-full file:border-0
                           file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    onchange="
                        const f = this.files[0];
                        const preview = document.getElementById('edit_new_preview');
                        if (f) { preview.src = URL.createObjectURL(f); preview.classList.remove('hidden'); }
                        else { preview.classList.add('hidden'); }
                    ">
                <img id="edit_new_preview" class="hidden mt-2 h-28 rounded-xl object-cover border border-blue-200 w-full">
            </div>
        </div>`,
        showCancelButton: true,
        confirmButtonColor: '#2563eb',
        confirmButtonText: '<i class="fas fa-save mr-1"></i> บันทึก',
        cancelButtonText: 'ยกเลิก',
        focusConfirm: false,
        preConfirm: async () => {
            const criteriaId = document.getElementById('edit_criteria').value;
            const score      = parseInt(document.getElementById('edit_score').value);
            const desc       = document.getElementById('edit_desc').value.trim();
            const fileInput  = document.getElementById('edit_evidence').files[0];

            if (!criteriaId || isNaN(score))
                return Swal.showValidationMessage('กรุณาเลือกเกณฑ์และระบุคะแนน');

            // ── อัปโหลดรูปใหม่ (ถ้าเลือกไว้) ──────────────────────────────
            let newImageUrl = undefined;   // undefined = ไม่แตะ evidence_url เดิม
            if (fileInput) {
                if (!systemConfig?.gas_url || !systemConfig?.drive_folder_id)
                    return Swal.showValidationMessage('ยังไม่ได้ตั้งค่า Google Drive API');
                try {
                    // ชื่อไฟล์ตรึงตาม logId → GAS ลบของเดิมและแทนที่อัตโนมัติ
                    const fileName = `behavior_edit_${logId}.jpg`;
                    const resizedBlob = await resizeImage(fileInput);
                    const base64Data  = await blobToBase64(resizedBlob);
                    const res = await fetch(systemConfig.gas_url, {
                        method: 'POST',
                        body: JSON.stringify({
                            action: 'upload',
                            base64: base64Data,
                            fileName: fileName,
                            folderId: systemConfig.drive_folder_id
                        })
                    });
                    const resData = await res.json();
                    if (resData.status === 'success') newImageUrl = resData.url;
                    else return Swal.showValidationMessage('อัปโหลดรูปไม่สำเร็จ: ' + resData.message);
                } catch (err) {
                    return Swal.showValidationMessage('อัปโหลดรูปไม่สำเร็จ: ' + err.message);
                }
            }

            return { criteriaId, score, desc, newImageUrl };
        }
    });

    if (!formValues) return;

    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    const updateData = {
        criteria_id:  formValues.criteriaId,
        score_change: formValues.score,
        description:  formValues.desc,
        updated_at:   new Date().toISOString(),
        updated_by:   currentUser.id
    };
    // อัปเดต evidence_url เฉพาะเมื่อมีการอัปโหลดรูปใหม่
    if (formValues.newImageUrl !== undefined) updateData.evidence_url = formValues.newImageUrl;

    const { error: updErr } = await db.from('behavior_logs').update(updateData).eq('id', logId);
    if (updErr) return Swal.fire('ผิดพลาด', updErr.message, 'error');

    await initStudentTable();
    loadDashboard();
    const student = allStudents.find(s => s.id === studentId);
    if (student) $('#historyStudentScore').text(student.score);
    await loadStudentHistory(studentId);
    Swal.fire({ icon: 'success', title: 'แก้ไขสำเร็จ', timer: 1200, showConfirmButton: false });
}

async function deleteLog(logId, studentId) {
    const result = await Swal.fire({
        title: 'ยืนยันการลบ',
        text: 'ลบรายการนี้? ไม่สามารถกู้คืนได้',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: '<i class="fas fa-trash-alt mr-1"></i> ลบเลย',
        cancelButtonText: 'ยกเลิก'
    });
    if (!result.isConfirmed) return;

    Swal.fire({ title: 'กำลังลบ...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    const { error } = await db.from('behavior_logs').delete().eq('id', logId);
    if (error) return Swal.fire('ผิดพลาด', error.message, 'error');

    // รีโหลดตารางหลักและ dashboard
    await initStudentTable();
    loadDashboard();

    // อัปเดตคะแนนใน modal header
    const student = allStudents.find(s => s.id === studentId);
    if (student) $('#historyStudentScore').text(student.score);

    await loadStudentHistory(studentId);
    Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1200, showConfirmButton: false });
}

function closeHistoryModal() {
    $('#historyModal').addClass('hidden').removeClass('flex');
}