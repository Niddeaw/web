let currentUser = null;
let schoolInfo = null;
let allStudents = [];
let criteriaList = [];
let table = null;

$(document).ready(async function() {
    Swal.fire({ title: 'กำลังเข้าสู่ระบบ...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    await checkAuth();
    await loadSchoolInfo();
    await loadCriteria();
    await initStudentTable();
    loadDashboard();
    
    // ตั้งค่า Select2 ค้นหาชื่อครู
    $('.select2-teacher').select2({
        placeholder: "-- พิมพ์ค้นหาชื่อครู --",
        allowClear: true,
        width: '100%',
        dropdownParent: $('#gradeHeadModal') // เพื่อให้ Select2 ไม่โดนหน้าต่าง Modal บัง
    });
    await loadTeachersForSelect();
    
    Swal.close();
});

async function checkAuth() {
    const { data: { session } } = await db.auth.getSession();
    if (!session) { window.location.replace('index.html'); return; }

    const { data: profile } = await db.from('core_personnel').select('*').eq('id', session.user.id).single();
    const { data: moduleAdmin } = await db.from('core_module_admins').select('*').eq('user_id', session.user.id).eq('module_id', 'behavior').maybeSingle();

    if (profile.role !== 'super_admin' && !moduleAdmin) {
        window.location.replace('behavior_teacher.html'); 
        return;
    }

    currentUser = profile;
    if(profile.role === 'super_admin') {
        $('#btn_settings').removeClass('hidden');
        $('#btn_grade_head').removeClass('hidden');
    }
    $('#user_info').html(`<i class="fas fa-user-circle text-slate-400 mr-1"></i> ${profile.first_name}`);
}

function handleLogout() {
    Swal.fire({ title: 'ออกจากระบบ?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626' })
    .then(async (result) => { 
        if (result.isConfirmed) { 
            localStorage.removeItem('activeMode');
            await db.auth.signOut(); 
            window.location.replace('index.html'); 
        } 
    });
}

async function loadSchoolInfo() {
    const { data } = await db.from('core_school_info').select('*').single();
    schoolInfo = data || {};
}

async function loadCriteria() {
    const { data, error } = await db.from('behavior_criteria').select('*');
    if (error || !data) return;

    criteriaList = data;
    let html = '<option value="">-- เลือกรายการความประพฤติ --</option>';
    data.forEach(c => {
        html += `<option value="${c.id}" data-score="${c.category === 'negative' ? -c.default_score : c.default_score}">${c.title} (${c.category === 'negative' ? '-' : '+'}${c.default_score})</option>`;
    });
    $('#criteria_select').html(html);
}

async function initStudentTable() {
    const { data: students, error } = await db
        .from('core_students')
        .select(`
            id, student_id_card, first_name, last_name,
            student_enrollments ( classroom_id, core_classrooms (grade_level, room_number) ),
            behavior_logs ( score_change, behavior_criteria(category) )
        `);

    if (error || !students) return;

    allStudents = students.map(s => {
        const totalScore = 100 + (s.behavior_logs?.reduce((sum, log) => sum + log.score_change, 0) || 0);
        const posCount = s.behavior_logs?.filter(l => l.score_change > 0).length || 0;
        const negCount = s.behavior_logs?.filter(l => l.score_change < 0).length || 0;
        const enroll = s.student_enrollments && s.student_enrollments[0];
        
        return {
            id: s.id,
            sid: s.student_id_card,
            name: `${s.first_name} ${s.last_name}`,
            room: enroll && enroll.core_classrooms ? `${enroll.core_classrooms.grade_level}/${enroll.core_classrooms.room_number}` : '-',
            score: totalScore,
            pos: posCount,
            neg: negCount
        };
    });

    renderTable(allStudents);
}

function renderTable(data) {
    if ($.fn.DataTable.isDataTable('#studentTable')) $('#studentTable').DataTable().destroy();
    
    table = $('#studentTable').DataTable({
        data: data.map(s => [
            `<span class="font-medium text-slate-700">${s.sid}</span>`, 
            `<span class="font-bold text-blue-800">${s.name}</span>`, 
            `<span class="text-slate-600">ม.${s.room}</span>`, 
            `<div class="text-center"><span class="px-3 py-1 rounded-lg text-sm font-black ${s.score < 50 ? 'bg-red-100 text-red-600' : (s.score >= 100 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-600')}">${s.score}</span></div>`,
            `<div class="text-center"><button onclick="viewHistory('${s.id}')" class="bg-white border border-blue-200 text-blue-600 px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-blue-50 transition shadow-sm flex items-center justify-center gap-1.5 mx-auto"><i class="fas fa-eye"></i> ประวัติ</button></div>`
        ]),
        responsive: true,
        language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' }
    });
}

function loadDashboard() {
    $('#stat_positive').text(allStudents.filter(s => s.pos > 0).length);
    $('#stat_negative').text(allStudents.filter(s => s.neg > 0).length);
    $('#stat_high').text(allStudents.filter(s => s.score > 100).length);
    $('#stat_low').text(allStudents.filter(s => s.score < 50).length);
}

// ระบบค้นหา Autocomplete
async function searchStudent(val) {
    if(val.length < 2) { $('#search_results').hide(); return; }
    const { data } = await db.from('core_students')
        .select('id, student_id_card, first_name, last_name')
        .or(`student_id_card.ilike.%${val}%,first_name.ilike.%${val}%,last_name.ilike.%${val}%`)
        .limit(5);
    
    let html = '';
    (data || []).forEach(s => {
        html += `<div onclick="selectStudent('${s.id}', '${s.student_id_card} ${s.first_name} ${s.last_name}')" class="p-3 hover:bg-red-50 cursor-pointer border-b text-sm font-medium text-slate-700">${s.student_id_card} - ${s.first_name} ${s.last_name}</div>`;
    });
    $('#search_results').html(html).show();
}

function selectStudent(id, info) {
    $('#selected_student_id').val(id);
    $('#selected_student_info').text(`นักเรียนที่เลือก: ${info}`).removeClass('hidden');
    $('#search_results').hide();
    $('#search_student').val('');
}

function updateDefaultScore() {
    const score = $('#criteria_select option:selected').data('score');
    $('#score_input').val(score);
}

// 🌟 ฟังก์ชันจัดการ Modal (ลบ hidden เพิ่ม flex จะได้แสดงผลเป๊ะๆ)
function openRecordModal() { 
    $('#recordModal').removeClass('hidden').addClass('flex'); 
}
function closeRecordModal() { 
    $('#recordModal').addClass('hidden').removeClass('flex'); 
}

const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbznwaIBQWhEtFE16LXo_5oQ7nowHHMFTHwLxoXyHgxNqfNwOAXOj20hAldzQ-Lvaja9lw/exec";

async function saveBehaviorRecord() {
    const studentId = $('#selected_student_id').val();
    const criteriaId = $('#criteria_select').val();
    const score = parseInt($('#score_input').val());
    const fileInput = $('#evidence_file')[0]?.files[0];
    
    if(!studentId || !criteriaId || isNaN(score)) return Swal.fire('ข้อมูลไม่ครบ', 'กรุณาเลือกนักเรียน, เกณฑ์ประเมิน และตรวจสอบคะแนน', 'warning');

    Swal.fire({ title: 'กำลังบันทึกข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    let finalImageUrl = "";

    if (fileInput) {
        try {
            Swal.fire({ title: 'กำลังอัปโหลดรูปภาพ...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
            const base64Data = await blobToBase64(fileInput);
            
            const response = await fetch(GAS_WEB_APP_URL, {
                method: "POST",
                body: JSON.stringify({
                    base64: base64Data,
                    fileName: `behavior_${studentId}_${Date.now()}.${fileInput.name.split('.').pop()}`
                })
            });
            const resData = await response.json();
            if(resData.status === "success") {
                finalImageUrl = resData.url;
            }
        } catch (err) {
            console.error("Upload failed:", err);
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

    if(!error) {
        Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ!', timer: 1500, showConfirmButton: false });
        
        $('#selected_student_id').val('');
        $('#selected_student_info').addClass('hidden');
        $('#criteria_select').val('');
        $('#score_input').val('');
        $('#description_text').val('');
        $('#evidence_file').val('');
        
        closeRecordModal();
        await initStudentTable(); 
        loadDashboard();
    } else {
        Swal.fire('Error', error.message, 'error');
    }
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result;
            const base64Data = result.split(',')[1];
            resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
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
    const filtered = allStudents.filter(s => mode === 'more' ? s.score > val : s.score < val);
    renderTable(filtered);
}

function exportTable() {
    const exportData = allStudents.map(s => ({
        'เลขประจำตัว': s.sid,
        'ชื่อ-นามสกุล': s.name,
        'ชั้นเรียน': s.room,
        'คะแนนปัจจุบัน': s.score,
        'จำนวนครั้งที่ทำดี': s.pos,
        'จำนวนครั้งที่ผิดระเบียบ': s.neg
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "BehaviorReport");
    XLSX.writeFile(workbook, `สรุปคะแนนความประพฤติ_${new Date().toLocaleDateString('th-TH')}.xlsx`);
}

function viewHistory(id) {
    location.href = `student_history.html?id=${id}`;
}

// ==========================================
// 🌟 ระบบจัดการหัวหน้าระดับชั้น
// ==========================================
async function loadTeachersForSelect() {
    const { data } = await db.from('core_personnel').select('id, prefix, first_name, last_name').order('first_name');
    if (data) {
        let html = '<option value="">-- พิมพ์ค้นหาชื่อครู --</option>';
        data.forEach(t => {
            html += `<option value="${t.id}">${t.prefix || ''}${t.first_name} ${t.last_name}</option>`;
        });
        $('#grade_head_teacher').html(html);
    }
}

async function loadGradeHeads() {
    const { data, error } = await db.from('behavior_grade_heads').select('id, grade_level, teacher_id, core_personnel(prefix, first_name, last_name)').order('grade_level');
    const tbody = document.getElementById('grade_head_list');
    
    if (error) {
        if (error.code === 'PGRST205') {
            tbody.innerHTML = `<tr><td colspan="3" class="p-6 text-center text-red-500">กรุณารันคำสั่ง SQL สร้างตาราง (behavior_grade_heads) ก่อนครับ</td></tr>`;
        }
        return;
    }

    if (data && data.length > 0) {
        tbody.innerHTML = data.map(h => `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="p-4 font-bold text-slate-700">ม.${h.grade_level}</td>
                <td class="p-4 text-blue-700 font-bold">${h.core_personnel?.prefix || ''}${h.core_personnel?.first_name} ${h.core_personnel?.last_name}</td>
                <td class="p-4 text-center">
                    <button onclick="deleteGradeHead('${h.id}')" class="text-rose-400 hover:text-white hover:bg-rose-500 bg-rose-50 px-3 py-1.5 rounded-lg transition-colors"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
    } else {
        tbody.innerHTML = '<tr><td colspan="3" class="p-6 text-center text-slate-400">ยังไม่มีข้อมูลการแต่งตั้งหัวหน้าระดับชั้น</td></tr>';
    }
}

async function saveGradeHead() {
    const teacherId = $('#grade_head_teacher').val();
    const gradeLevel = $('#grade_head_level').val();
    
    if (!teacherId || !gradeLevel) return Swal.fire('ข้อมูลไม่ครบ', 'กรุณาเลือกชื่อครูและระดับชั้นครับ', 'warning');
    
    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    const { error } = await db.from('behavior_grade_heads').insert({
        grade_level: parseInt(gradeLevel),
        teacher_id: teacherId
    });
    
    if (error) {
        if(error.code === '23505') Swal.fire('ซ้ำซ้อน', 'มีชื่อครูดูแลระดับชั้นนี้ในระบบแล้วครับ', 'warning');
        else Swal.fire('ผิดพลาด', error.message, 'error');
    } else {
        Swal.fire({ icon: 'success', title: 'แต่งตั้งสำเร็จ', timer: 1500, showConfirmButton: false });
        $('#grade_head_teacher').val(null).trigger('change'); // ล้างค่าใน Select2
        loadGradeHeads();
    }
}

async function deleteGradeHead(id) {
    Swal.fire({ title: 'กำลังลบสิทธิ์...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    const { error } = await db.from('behavior_grade_heads').delete().eq('id', id);
    if (!error) {
        Swal.fire({ icon: 'success', title: 'ถอดถอนสิทธิ์สำเร็จ', timer: 1500, showConfirmButton: false });
        loadGradeHeads();
    } else {
        Swal.fire('ผิดพลาด', error.message, 'error');
    }
}

function openGradeHeadModal() {
    $('#gradeHeadModal').removeClass('hidden').addClass('flex');
    loadGradeHeads();
}
function closeGradeHeadModal() {
    $('#gradeHeadModal').addClass('hidden').removeClass('flex');
}