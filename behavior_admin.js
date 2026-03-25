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
    
    const { data: gradeHeads } = await db.from('behavior_grade_heads').select('grade_level').eq('teacher_id', session.user.id);
    
    currentUser = profile;
    currentUser.managedGrades = gradeHeads ? gradeHeads.map(g => g.grade_level) : [];

    if(profile.role === 'super_admin') {
        $('#btn_settings').removeClass('hidden').addClass('flex');
        $('#btn_import_old').removeClass('hidden').addClass('flex'); // 🌟 เปิดปุ่มให้เฉพาะ Superuser
        $('#role_label').text('Superuser');
    } else {
        $('#role_label').text(`Admin หัวหน้าระดับชั้นมัธยมศึกษาปีที่ ${currentUser.managedGrades.join(', ')}`);
    }
    
    if (profile.role !== 'super_admin' && currentUser.managedGrades.length === 0) {
        window.location.replace('behavior_teacher.html'); 
        return;
    }

    if(profile.role === 'super_admin') {
        $('#btn_settings').removeClass('hidden').addClass('flex');
        $('#role_label').text('Superuser');
    } else {
        $('#role_label').text(`Admin หัวหน้าระดับชั้นมัธยมศึกษาปีที่ ${currentUser.managedGrades.join(', ')}`);
    }
    
    // 🌟 แก้ไขแสดงชื่อ-นามสกุลเต็ม
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
    const { data: students } = await db.from('core_students').select(`
        id, student_id_card, first_name, last_name,
        student_enrollments ( core_classrooms (grade_level, room_number) ),
        behavior_logs ( score_change, behavior_criteria(category) )
    `);

    if (!students) return;

    let filteredStudents = students;
    if (currentUser.role !== 'super_admin' && currentUser.managedGrades.length > 0) {
        filteredStudents = students.filter(s => {
            const enroll = s.student_enrollments?.[0];
            return enroll && currentUser.managedGrades.includes(enroll.core_classrooms.grade_level);
        });
    }

    allStudents = filteredStudents.map(s => {
        const totalScore = 100 + (s.behavior_logs?.reduce((sum, log) => sum + log.score_change, 0) || 0);
        const posCount = s.behavior_logs?.filter(l => l.score_change > 0).length || 0;
        const negCount = s.behavior_logs?.filter(l => l.score_change < 0).length || 0;
        const enroll = s.student_enrollments?.[0];
        
        return {
            id: s.id, sid: s.student_id_card, name: `${s.first_name} ${s.last_name}`,
            room: enroll && enroll.core_classrooms ? `${enroll.core_classrooms.grade_level}/${enroll.core_classrooms.room_number}` : '-',
            score: totalScore, pos: posCount, neg: negCount
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
            `<div class="text-center"><button onclick="viewHistory('${s.id}')" class="bg-white border border-blue-200 text-blue-600 px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-blue-50 transition shadow-sm"><i class="fas fa-eye"></i> ประวัติ</button></div>`
        ]),
        responsive: true, language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' }
    });
}

function loadDashboard() {
    $('#stat_positive').text(allStudents.filter(s => s.pos > 0).length);
    $('#stat_negative').text(allStudents.filter(s => s.neg > 0).length);
    $('#stat_high').text(allStudents.filter(s => s.score > 100).length);
    $('#stat_low').text(allStudents.filter(s => s.score < 50).length);
}

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
// 🌟 ฟังก์ชัน นำเข้าข้อมูลประวัติเก่าจากระบบ Excel 🌟
// ==========================================
async function importOldHistory(input) {
    const file = input.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, {raw: false});

            if(rows.length === 0) throw new Error("ไม่พบข้อมูลในไฟล์ Excel");

            Swal.fire({ title: 'กำลังประมวลผลข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

            // 1. หา/สร้าง Criteria สำหรับประวัติเก่า
            let oldCriteria = criteriaList.find(c => c.title === 'ประวัติจากระบบเก่า (นำเข้า)');
            if (!oldCriteria) {
                const {data: newCrit} = await db.from('behavior_criteria').insert({title: 'ประวัติจากระบบเก่า (นำเข้า)', category: 'negative', default_score: 5}).select().single();
                oldCriteria = newCrit;
                criteriaList.push(newCrit);
            }

            // 2. ดึงรหัสนักเรียนทั้งหมดที่มีในระบบเพื่อมาเทียบ ID (UUID)
            const {data: studentsList} = await db.from('core_students').select('id, student_id_card');
            const studentMap = {};
            studentsList.forEach(s => studentMap[s.student_id_card] = s.id);

            const logsToInsert = [];
            let missingStudents = 0;

            rows.forEach(row => {
                const stdCode = (row['รหัสนักเรียน'] || '').toString().trim();
                const desc = row['พฤติกรรมที่กระทำผิด'] || 'ไม่ได้ระบุ';
                const scoreRaw = row['คะแนนที่หัก'] || '0';
                const dateRaw = row['วันที่กระทำผิด']; 
                
                const stdUuid = studentMap[stdCode];
                if (stdUuid) {
                    let scoreChange = parseInt(scoreRaw);
                    if (isNaN(scoreChange)) scoreChange = -5;
                    if (scoreChange > 0) scoreChange = -scoreChange; // บังคับเป็นค่าติดลบเสมอ

                    // แปลงวันที่ 
                    let createdAt = new Date().toISOString();
                    if (dateRaw) {
                        const parts = dateRaw.split('/'); // กรณีเป็น String เช่น 28/5/2024
                        if (parts.length === 3) {
                            const d = parseInt(parts[0]);
                            const m = parseInt(parts[1]) - 1;
                            let y = parseInt(parts[2]);
                            if (y > 2500) y -= 543; // แปลง พ.ศ. เป็น ค.ศ.
                            const dateObj = new Date(y, m, d, 12, 0, 0);
                            if (!isNaN(dateObj.getTime())) {
                                createdAt = dateObj.toISOString();
                            }
                        } else {
                            // กรณี Excel ส่งมาเป็นรูปแบบอื่น ลองแปลงตรงๆ
                            const testDate = new Date(dateRaw);
                            if(!isNaN(testDate.getTime())) createdAt = testDate.toISOString();
                        }
                    }

                    logsToInsert.push({
                        student_id: stdUuid,
                        criteria_id: oldCriteria.id,
                        score_change: scoreChange,
                        description: desc,
                        created_at: createdAt,
                        recorder_id: currentUser.id,
                        academic_year: schoolInfo.current_academic_year,
                        semester: schoolInfo.current_semester
                    });
                } else {
                    missingStudents++;
                }
            });

            if (logsToInsert.length === 0) {
                Swal.fire('ไม่พบข้อมูลที่ตรงกัน', `ไม่สามารถจับคู่รหัสนักเรียนในไฟล์กับระบบได้เลย (ไม่พบ ${missingStudents} รายการ)`, 'error');
                return;
            }

            // 3. บันทึกลงฐานข้อมูล
            const { error } = await db.from('behavior_logs').insert(logsToInsert);
            if (!error) {
                Swal.fire({
                    icon: 'success',
                    title: 'นำเข้าสำเร็จ!',
                    text: `เพิ่มประวัติเก่าจำนวน ${logsToInsert.length} รายการ${missingStudents > 0 ? ` (ข้าม ${missingStudents} รายการที่ไม่พบรหัส)` : ''}`
                });
                initStudentTable(); // รีเฟรชตาราง
                loadDashboard();
            } else {
                throw error;
            }

        } catch(err) {
            Swal.fire('ผิดพลาด', err.message || 'รูปแบบไฟล์ไม่ถูกต้อง', 'error');
        }
        input.value = ""; 
    };
    reader.readAsArrayBuffer(file);
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