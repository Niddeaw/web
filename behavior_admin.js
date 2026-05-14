let currentUser = null;
let schoolInfo = null;
let systemConfig = null; 
let allStudents = [];
let criteriaList = [];
let table = null;

$(document).ready(async function() {
    Swal.fire({ title: 'กำลังโหลดข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    await checkAuth();
    await loadSchoolInfo();
    await loadSystemConfig();
    await loadCriteria();
    await initStudentTable();
    loadDashboard();
    
    $('#evidence_file').change(function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) { $('#evidence_preview').attr('src', e.target.result).removeClass('hidden'); }
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

    // ── ตรวจสอบสิทธิ์ (ใช้ตารางเดียวกับ attendance_teacher.js) ──

    // 1. หัวหน้างานปกครอง (core_discipline_heads)
    let isDisciplineHead = false;
    if (sInfo?.current_academic_year) {
        const { data: discHead } = await db.from('core_discipline_heads')
            .select('id')
            .eq('personnel_id', session.user.id)
            .eq('academic_year', sInfo.current_academic_year)
            .maybeSingle();
        isDisciplineHead = !!discHead;
    }

    // 2. หัวหน้าระดับชั้น (behavior_grade_heads)
    const { data: gradeHeads } = await db.from('behavior_grade_heads')
        .select('grade_level')
        .eq('teacher_id', session.user.id);
    currentUser.managedGrades = gradeHeads ? gradeHeads.map(g => g.grade_level) : [];

    // ── กำหนดบทบาทภายใน (role) และแสดงผล ──
    // ซ่อนปุ่มตั้งค่าและนำเข้าไว้ก่อน
    $('#btn_settings').addClass('hidden').removeClass('flex');
    $('#btn_import_old').addClass('hidden').removeClass('flex');

    if (profile.role === 'super_admin') {
        // ✅ Superuser: ทุกอย่าง
        $('#btn_settings').removeClass('hidden').addClass('flex');
        $('#btn_import_old').removeClass('hidden').addClass('flex');
        $('#role_label').html('<i class="fas fa-crown text-amber-500 mr-1"></i> Superuser');
        currentUser.role = 'admin';
    } else if (isDisciplineHead) {
        // ✅ หัวหน้างานปกครอง: เห็นทั้งโรงเรียน, ไม่เห็นปุ่มตั้งค่า/นำเข้า
        currentUser.role = 'admin';
        $('#role_label').html('<i class="fas fa-shield-alt text-emerald-500 mr-1"></i> หัวหน้างานปกครอง');
    } else if (currentUser.managedGrades.length > 0) {
        // ✅ หัวหน้าระดับ: เห็นเฉพาะระดับชั้นที่ดูแล, ไม่เห็นปุ่มตั้งค่า/นำเข้า
        currentUser.role = 'grade_head';
        $('#role_label').html(`<i class="fas fa-layer-group text-blue-500 mr-1"></i> หัวหน้าระดับ ม.${currentUser.managedGrades.join(', ')}`);
    } else {
        // ❌ ไม่มีสิทธิ์ใด ๆ → กลับหน้า teacher
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
            id, student_id_card, prefix, first_name, last_name,
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

    // กรองตามระดับชั้นสำหรับหัวหน้าระดับ
    let filteredStudents = allFetchedStudents;
    if (currentUser.role === 'grade_head' && currentUser.managedGrades.length > 0) {
        filteredStudents = allFetchedStudents.filter(s => {
            const enroll = s.student_enrollments?.[0];
            return enroll && enroll.core_classrooms && currentUser.managedGrades.includes(enroll.core_classrooms.grade_level);
        });
    }

    allStudents = filteredStudents.map(s => {
        const totalScore = 100 + (s.behavior_logs?.reduce((sum, log) => sum + log.score_change, 0) || 0);
        const posCount = s.behavior_logs?.filter(l => l.score_change > 0).length || 0;
        const negCount = s.behavior_logs?.filter(l => l.score_change < 0).length || 0;
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
            neg: negCount
        };
    });

    // เรียงตามชั้น แล้วตามเลขที่
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
            `<div class="text-center"><button onclick="viewHistory('${s.id}')" class="bg-white border border-blue-200 text-blue-600 px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-blue-50 transition shadow-sm"><i class="fas fa-eye"></i> ประวัติ</button></div>`
        ]),
        responsive: true,
        language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
        order: [[0, 'asc'], [1, 'asc']] // ชั้น, เลขที่ (แต่เรียงไว้แล้ว)
    });
}

function loadDashboard() {
    $('#stat_positive').text(allStudents.filter(s => s.pos > 0).length);
    $('#stat_negative').text(allStudents.filter(s => s.neg > 0).length);
    $('#stat_high').text(allStudents.filter(s => s.score > 100).length);
    $('#stat_low').text(allStudents.filter(s => s.score < 50).length);
}

// ── ฟังก์ชันอื่น ๆ คงเดิม (searchStudent, saveBehaviorRecord, importFromGoogleSheet ฯลฯ) ──
// (สามารถคัดลอกมาจากไฟล์ก่อนหน้าได้เลย)

async function searchStudent(val) {
    if(val.length < 2) { $('#search_results').hide(); return; }
    const matched = allStudents.filter(s => s.sid.includes(val) || s.name.includes(val)).slice(0, 5);
    let html = '';
    matched.forEach(s => {
        html += `<div onclick="selectStudent('${s.id}', '${s.sid} - ${s.name}')" class="p-3 hover:bg-blue-50 cursor-pointer border-b text-sm font-medium text-slate-700">${s.sid} - ${s.name} (ม.${s.room})</div>`;
    });
    $('#search_results').html(html).show();
}

function selectStudent(id, info) {
    $('#selected_student_id').val(id);
    $('#selected_student_name').text(`นักเรียนที่เลือก: ${info}`);
    $('#selected_student_info').removeClass('hidden').addClass('flex');
    $('#search_results').hide(); $('#search_student').val('');
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
    $('#evidence_file').val(''); $('#evidence_preview').addClass('hidden');
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
                canvas.width = width; canvas.height = height;
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
    
    if(!studentId || !criteriaId || isNaN(score)) return Swal.fire('ข้อมูลไม่ครบ', 'กรุณาเลือกนักเรียนและเกณฑ์ให้ถูกต้อง', 'warning');

    Swal.fire({ title: 'กำลังบันทึกข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

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
                    base64: base64Data,
                    fileName: `behavior_${studentId}_${Date.now()}.jpg`,
                    folderId: systemConfig.drive_folder_id 
                })
            });
            const resData = await response.json();
            if(resData.status === "success") finalImageUrl = resData.url;
            else throw new Error(resData.message);
            
        } catch (err) {
            console.error("Upload Error: ", err);
            return Swal.fire('อัปโหลดรูปไม่สำเร็จ', 'โปรดตรวจสอบการเชื่อมต่อ API ของ Google', 'error');
        }
    }

    Swal.fire({ title: 'กำลังจัดเก็บลงฐานข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    const { error } = await db.from('behavior_logs').insert([{
        student_id: studentId, criteria_id: criteriaId, score_change: score,
        recorder_id: currentUser.id, description: $('#description_text').val(),
        evidence_url: finalImageUrl,
        academic_year: schoolInfo.current_academic_year, semester: schoolInfo.current_semester
    }]);

    if(!error) {
        Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ!', timer: 1500, showConfirmButton: false });
        clearSelectedStudent();
        $('#criteria_select').val(''); $('#score_input').val(''); $('#description_text').val('');
        closeRecordModal(); initStudentTable(); loadDashboard();
    } else {
        Swal.fire('Error', error.message, 'error');
    }
}

// ==========================================
// 🌟 ฟังก์ชัน นำเข้าข้อมูลประวัติเก่าจาก Google Sheet 🌟
// ==========================================
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

async function processImportData(rows) {
    const dataRows = rows.filter(r => {
        const stdCode = String(r['รหัสนักเรียน'] || '').trim();
        return stdCode !== '' && stdCode !== 'รหัสนักเรียน*';
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
        const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
        if (m) {
            let [, d, mo, y, hr = '12', mn = '0'] = m;
            if (parseInt(y) > 2400) y = parseInt(y) - 543;
            const dt = new Date(parseInt(y), parseInt(mo) - 1, parseInt(d), parseInt(hr), parseInt(mn));
            if (!isNaN(dt.getTime())) return dt.toISOString();
        }
        const dt2 = new Date(s);
        return !isNaN(dt2.getTime()) ? dt2.toISOString() : new Date().toISOString();
    }

    const logsToInsert = [];
    const errors = [];

    for (const row of dataRows) {
        const stdCode  = String(row['รหัสนักเรียน'] || '').trim();
        const title    = String(row['รายการ'] || 'ประวัติจากระบบเก่า (นำเข้า)').trim();
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
            student_id:    stdUuid,
            criteria_id:   criteriaId,
            score_change:  scoreChange,
            description:   fullDesc || null,
            evidence_url:  String(row['หลักฐาน (URL)'] || row['หลักฐาน'] || '').trim() || null,
            created_at:    parseDateTime(row['วันที่/เวลา']),
            recorder_id:   currentUser.id,
            academic_year: schoolInfo.current_academic_year,
            semester:      schoolInfo.current_semester
        });
    }

    if (logsToInsert.length === 0) {
        const errMsg = errors.slice(0, 5).join('\n');
        Swal.fire('ไม่พบข้อมูลที่ใช้ได้', errMsg || 'ตรวจสอบรหัสนักเรียนและคะแนน', 'error');
        return;
    }

    const BATCH = 100;
    let success = 0;
    for (let i = 0; i < logsToInsert.length; i += BATCH) {
        const batchData = logsToInsert.slice(i, i + BATCH);
        const { error } = await db.from('behavior_logs').insert(batchData);
        if (error) throw error;
        success += batchData.length;
    }

    const skipCount = dataRows.length - logsToInsert.length;
    await Swal.fire({
        icon: 'success',
        title: 'นำเข้าสำเร็จ!',
        html: `<p>บันทึก <b>${success}</b> รายการ</p>
               ${skipCount > 0 ? `<p class="text-sm text-amber-600 mt-1">ข้าม ${skipCount} รายการ (ไม่พบรหัส/คะแนนผิด)</p>` : ''}
               ${errors.length > 0 ? `<details class="mt-2 text-left"><summary class="text-xs cursor-pointer text-slate-400">รายละเอียด error</summary>
               <pre class="text-xs text-red-400 max-h-24 overflow-y-auto mt-1">${errors.slice(0,10).join('\n')}</pre></details>` : ''}`
    });
    
    initStudentTable();
    loadDashboard();
}

function filterByScore(type) {
    let filtered = [];
    if(type === 'positive') filtered = allStudents.filter(s => s.pos > 0);
    else if(type === 'negative') filtered = allStudents.filter(s => s.neg > 0);
    else if(type === 'high') filtered = allStudents.filter(s => s.score > 100);
    else if(type === 'low') filtered = allStudents.filter(s => s.score < 50);
    renderTable(filtered);
}

function filterCustomScore(mode) {
    const val = parseInt($('#filter_score_val').val());
    if(isNaN(val)) return;
    renderTable(allStudents.filter(s => mode === 'more' ? s.score > val : s.score < val));
}

function exportTable() {
    const exportData = allStudents.map(s => ({
        'เลขประจำตัว': s.sid, 'ชื่อ-นามสกุล': s.name, 'ชั้นเรียน': s.room,
        'คะแนนปัจจุบัน': s.score, 'จำนวนครั้งที่ทำดี': s.pos, 'จำนวนครั้งที่ผิดระเบียบ': s.neg
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Behavior");
    XLSX.writeFile(workbook, `สรุปคะแนนความประพฤติ.xlsx`);
}

function viewHistory(id) { location.href = `student_history.html?id=${id}`; }