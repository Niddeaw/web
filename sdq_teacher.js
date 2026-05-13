// ==========================================
// ไฟล์: sdq_teacher.js (ปรับปรุงให้นักเรียน 1 แถว + 3 ผู้ประเมิน)
// ==========================================

let teacherInfo = null;
let currentSchoolInfo = null;
let mergedDataList = [];          // enrollment list
let teacherChartInstance = null;

// สำหรับฟอร์มครูประเมิน (Modal)
let teacherCurrentEnrollment = null;
let teacherCurrentQIndex = 0;
let teacherAnswers = {};

const sdqQuestions = [
    { id: 1, text: "ห่วงใยความรู้สึกคนอื่น", cat: "prosocial", reverse: false },
    { id: 2, text: "อยู่นิ่งไม่ได้ นั่งไม่ติดที่", cat: "hyper", reverse: false },
    { id: 3, text: "มักจะบ่นว่าปวดหัว ปวดท้อง หรือไม่สบาย", cat: "emotional", reverse: false },
    { id: 4, text: "เต็มใจแบ่งปันสิ่งของให้เพื่อน", cat: "prosocial", reverse: false },
    { id: 5, text: "มักจะอาละวาด หรือโมโหร้าย", cat: "conduct", reverse: false },
    { id: 6, text: "ค่อนข้างแยกตัว ชอบเล่นคนเดียว", cat: "peer", reverse: false },
    { id: 7, text: "เชื่อฟัง มักจะทำตามที่ผู้ใหญ่ต้องการ", cat: "conduct", reverse: true },
    { id: 8, text: "กังวลใจหลายเรื่อง ดูวิตกกังวลเสมอ", cat: "emotional", reverse: false },
    { id: 9, text: "เป็นที่พึ่งได้เวลาคนอื่นเสียใจ", cat: "prosocial", reverse: false },
    { id: 10, text: "ยุกยิก กระสับกระส่าย", cat: "hyper", reverse: false },
    { id: 11, text: "มีเพื่อนสนิทอย่างน้อยหนึ่งคน", cat: "peer", reverse: true },
    { id: 12, text: "มักจะมีเรื่องทะเลาะวิวาทกับเด็กคนอื่น", cat: "conduct", reverse: false },
    { id: 13, text: "ดูไม่มีความสุข ร้องไห้บ่อย", cat: "emotional", reverse: false },
    { id: 14, text: "เป็นที่ชื่นชอบของเพื่อนๆ", cat: "peer", reverse: true },
    { id: 15, text: "วอกแวกง่าย ขาดสมาธิ", cat: "hyper", reverse: false },
    { id: 16, text: "ขี้กลัว ไม่กล้าแสดงออก", cat: "emotional", reverse: false },
    { id: 17, text: "ใจดีกับเด็กที่เล็กกว่า", cat: "prosocial", reverse: false },
    { id: 18, text: "มักจะถูกเด็กคนอื่นแกล้งหรือรังแก", cat: "peer", reverse: false },
    { id: 19, text: "มักจะโกหกหรือขี้โกง", cat: "conduct", reverse: false },
    { id: 20, text: "อาสาช่วยเหลือคนอื่นเสมอ", cat: "prosocial", reverse: false },
    { id: 21, text: "คิดก่อนทำ", cat: "hyper", reverse: true },
    { id: 22, text: "แอบเอาของคนอื่น", cat: "conduct", reverse: false },
    { id: 23, text: "เข้ากับผู้ใหญ่ได้ดีกว่าเด็กวัยเดียวกัน", cat: "peer", reverse: false },
    { id: 24, text: "ขี้ขลาด", cat: "emotional", reverse: false },
    { id: 25, text: "ทำงานจนเสร็จ มีความตั้งใจ", cat: "hyper", reverse: true }
];

$(document).ready(async function () {
    try {
        await fetchCoreInfo();
        const isAuth = await checkAuthTeacher();
        if (isAuth) {
            await loadTeacherData();
            document.body.classList.replace('opacity-0', 'opacity-100');
            createTeacherAssessmentModal(); // สร้าง modal ถ้ายังไม่มี
        }
    } catch (err) {
        console.error("System Error:", err);
        Swal.fire('เกิดข้อผิดพลาด', err.message || 'ไม่สามารถโหลดระบบได้', 'error');
    }
});

// ------------------------------------------
// 1. Auth & Config
// ------------------------------------------
async function fetchCoreInfo() {
    const { data, error } = await db.from('core_school_info').select('*').single();
    if (error) throw new Error('ไม่สามารถโหลดข้อมูลโรงเรียนได้: ' + error.message);
    currentSchoolInfo = data;
}

async function checkAuthTeacher() {
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError || !user) { window.location.href = 'login.html'; return false; }
    const { data: personnel, error: pError } = await db
        .from('core_personnel').select('*').eq('id', user.id).single();
    if (pError || !personnel) {
        await Swal.fire('ไม่พบข้อมูลผู้ใช้งาน', 'บัญชีนี้อาจไม่มีสิทธิ์ในระบบบุคลากร', 'error');
        window.location.href = 'login.html';
        return false;
    }
    const allowedRoles = ['teacher', 'admin', 'super_admin'];
    if (allowedRoles.includes(personnel.role)) {
        teacherInfo = personnel;
        $('#user-display').text(`ครู${personnel.first_name} ${personnel.last_name}`);
        return true;
    } else {
        await Swal.fire('ปฏิเสธการเข้าถึง', 'เฉพาะครูที่ปรึกษาหรือเจ้าหน้าที่เท่านั้น', 'error');
        window.location.href = 'index.html';
        return false;
    }
}

function logout() {
    Swal.fire({ title: 'ออกจากระบบ?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'ออกจากระบบ' })
        .then(async (result) => { if (result.isConfirmed) { await db.auth.signOut(); window.location.href = 'login.html'; } });
}

// ------------------------------------------
// 2. โหลดข้อมูลนักเรียน + ผลประเมิน
// ------------------------------------------
async function loadTeacherData() {
    Swal.fire({ title: 'กำลังโหลดข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        // ✅ FIX 1: กรอง academic_year ด้วย เพื่อไม่ให้ได้ห้องจากปีการศึกษาเก่า
        const { data: classrooms, error: cError } = await db.from('core_classrooms')
            .select('id, grade_level, room_number, academic_year')
            .or(`adviser_id_1.eq.${teacherInfo.id},adviser_id_2.eq.${teacherInfo.id}`)
            .eq('academic_year', currentSchoolInfo.current_academic_year);
        if (cError) throw cError;
        if (!classrooms || classrooms.length === 0) {
            Swal.close();
            $('#advising-class-title').text('ไม่พบข้อมูลห้องเรียน');
            Swal.fire('ข้อมูล', 'คุณไม่มีชื่อเป็นครูที่ปรึกษาในปีการศึกษานี้', 'info');
            return;
        }

        const classLabels = classrooms.map(c => `ม.${c.grade_level}/${c.room_number}`).join(', ');
        $('#advising-class-title').text(`ห้องที่ปรึกษา: ${classLabels}`);
        const classIds = classrooms.map(c => c.id);

        // ✅ FIX 2: ไม่กรอง academic_year ใน student_enrollments เพราะ column นั้น null ทุกแถว
        // ใช้ classroom_id (ซึ่งถูกกรองตาม academic_year แล้ว) เป็น filter หลักแทน
        const { data: enrollments, error: sError } = await db
            .from('student_enrollments')
            .select(`
                id, student_number,
                core_students (id, prefix, first_name, last_name, student_id_card),
                core_classrooms (grade_level, room_number),
                sdq_assessments (
                    id, total_difficulty_score, assessor_type,
                    score_emotional, score_conduct, score_hyper, score_peer, score_prosocial,
                    created_at, academic_year, semester
                )
            `)
            .in('classroom_id', classIds)
            .order('student_number', { ascending: true });

        if (sError) throw sError;

        // ✅ FIX 3: กรอง sdq_assessments ให้ตรงกับ academic_year และ semester ปัจจุบัน
        const currentYear = currentSchoolInfo.current_academic_year;
        const currentSem = currentSchoolInfo.current_semester;
        mergedDataList = (enrollments || []).map(enrollment => ({
            ...enrollment,
            sdq_assessments: (enrollment.sdq_assessments || []).filter(
                a => a.academic_year === currentYear && a.semester === currentSem
            )
        }));
        buildStudentTable();
        updateTeacherDashboard();
        Swal.close();
    } catch (err) {
        console.error("Load Data Error:", err);
        Swal.fire('Error', 'ไม่สามารถดึงข้อมูลนักเรียนได้: ' + err.message, 'error');
    }
}

// ------------------------------------------
// 3. สร้างตารางนักเรียน 1 แถวต่อคน
// ------------------------------------------
function buildStudentTable() {
    const tbody = $('#teacherTable tbody');
    tbody.empty();
    if (mergedDataList.length === 0) {
        tbody.append('<tr><td colspan="8" class="p-8 text-center text-slate-400">ไม่พบข้อมูลนักเรียน</td></tr>');
        return;
    }

    mergedDataList.forEach(enrollment => {
        const student = enrollment.core_students;
        if (!student) return;
        const assessments = enrollment.sdq_assessments || [];

        // หาผลประเมินแต่ละประเภท
        const studentAssess = assessments.find(a => a.assessor_type === 'student') || null;
        const parentAssess = assessments.find(a => a.assessor_type === 'parent') || null;
        const teacherAssess = assessments.find(a => a.assessor_type === 'teacher') || null;

        // ฟังก์ชันสร้าง badge สถานะ
        function assessBadge(assess, label) {
            if (assess) {
                const score = assess.total_difficulty_score;
                let color = 'bg-blue-100 text-blue-700';
                if (score <= 15) color = 'bg-emerald-100 text-emerald-700';
                else if (score <= 18) color = 'bg-amber-100 text-amber-700';
                else color = 'bg-rose-100 text-rose-700';
                return `<span class="px-2 py-1 rounded-full text-[10px] font-bold ${color}">${label} (${score})</span>`;
            } else {
                return '<span class="px-2 py-1 bg-slate-100 text-slate-400 rounded-full text-[10px]">ยังไม่ประเมิน</span>';
            }
        }

        // ปุ่มสำหรับครู
        let teacherAction = '';
        if (teacherAssess) {
            teacherAction = `
                <div class="flex gap-1 justify-center">
                    <button onclick="viewSDQ('${teacherAssess.id}')" class="text-blue-600 hover:text-blue-800" title="ดู"><i class="fas fa-eye"></i></button>
                    <button onclick="startTeacherAssessment('${enrollment.id}', '${student.prefix || ''}${student.first_name} ${student.last_name}', 'edit', '${teacherAssess.id}')" class="text-yellow-600 hover:text-yellow-800" title="แก้ไข"><i class="fas fa-edit"></i></button>
                    <button onclick="deleteSDQ('${teacherAssess.id}')" class="text-orange-500 hover:text-orange-700" title="ลบ"><i class="fas fa-undo"></i></button>
                    <button onclick="printStudentSDQ('${enrollment.id}')" class="text-purple-600 hover:text-purple-800" title="พิมพ์รายงาน"><i class="fas fa-print"></i></button>
                </div>
            `;
        } else {
            teacherAction = `
            <div class="flex gap-1 justify-center">
                <button onclick="startTeacherAssessment('${enrollment.id}', '${student.prefix || ''}${student.first_name} ${student.last_name}', 'new')" 
                        class="px-3 py-1 bg-indigo-500 text-white rounded text-xs hover:bg-indigo-600">
                    <i class="fas fa-plus mr-1"></i> ประเมิน
                </button>
                    <button onclick="printStudentSDQ('${enrollment.id}')" class="text-purple-600 hover:text-purple-800" title="พิมพ์รายงาน"><i class="fas fa-print"></i></button>
            </div>
            `;
        }

        const studentName = `${student.prefix || ''}${student.first_name} ${student.last_name}`;
        tbody.append(`
            <tr class="border-b hover:bg-slate-50 transition-colors">
                <td class="p-3 text-center">${enrollment.student_number}</td>
                <td class="p-3 text-slate-500">${student.student_id_card}</td>
                <td class="p-3 font-bold text-slate-700">${studentName}</td>
                <td class="p-3 text-center">${assessBadge(studentAssess, 'นร.')}</td>
                <td class="p-3 text-center">${assessBadge(parentAssess, 'ผปค.')}</td>
                <td class="p-3 text-center">${assessBadge(teacherAssess, 'ครู')}</td>
                <td class="p-3 text-center">${teacherAction}</td>
            </tr>
        `);
    });
}

// ------------------------------------------
// 4. แดชบอร์ด
// ------------------------------------------
function updateTeacherDashboard() {
    let totalStudents = mergedDataList.length;
    let completedAll = 0; // มีครบ 3 ส่วน
    let normalCount = 0, riskCount = 0, problemCount = 0;

    mergedDataList.forEach(enrollment => {
        const assessments = enrollment.sdq_assessments || [];
        const hasStudent = assessments.some(a => a.assessor_type === 'student');
        const hasParent = assessments.some(a => a.assessor_type === 'parent');
        const hasTeacher = assessments.some(a => a.assessor_type === 'teacher');
        if (hasStudent && hasParent && hasTeacher) completedAll++;

        // ใช้ผลจากครูเป็นหลัก หรือถ้าไม่มีครูใช้ผู้ปกครอง หรือถ้าไม่มีใช้ นร. (ตามลำดับ)
        let primaryAssess = assessments.find(a => a.assessor_type === 'teacher') ||
            assessments.find(a => a.assessor_type === 'parent') ||
            assessments.find(a => a.assessor_type === 'student');
        if (primaryAssess) {
            let score = primaryAssess.total_difficulty_score;
            if (score <= 15) normalCount++;
            else if (score <= 18) riskCount++;
            else problemCount++;
        }
    });

    // อัปเดตข้อความสถิติ
    $('#statCompleted').text(`${completedAll} / ${totalStudents} คน (ประเมินครบ 3 ส่วน)`);

    // วงกลม
    const ctx = document.getElementById('sdqChart');
    if (ctx) {
        if (teacherChartInstance) teacherChartInstance.destroy();
        teacherChartInstance = new Chart(ctx.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['ปกติ', 'เสี่ยง', 'มีปัญหา', 'ยังไม่ประเมิน'],
                datasets: [{
                    data: [normalCount, riskCount, problemCount, totalStudents - (normalCount + riskCount + problemCount)],
                    backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#cbd5e1'],
                    borderWidth: 0
                }]
            },
            options: { plugins: { legend: { position: 'right' } }, cutout: '60%' }
        });
    }
}

// ------------------------------------------
// 5. ฟอร์มครูประเมิน (Modal)
// ------------------------------------------
function createTeacherAssessmentModal() {
    if ($('#teacherAssessmentModal').length) return;
    const modalHtml = `
    <div id="teacherAssessmentModal" class="fixed inset-0 z-50 flex items-center justify-center hidden bg-black/50">
        <div class="bg-white max-w-2xl w-full mx-4 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div class="sticky top-0 bg-white p-4 border-b flex justify-between items-center rounded-t-2xl">
                <h3 class="text-lg font-bold">แบบประเมิน SDQ (ครู)</h3>
                <div>
                    <span id="assessStudentName" class="text-sm text-indigo-600 font-bold mr-4"></span>
                    <button onclick="closeTeacherAssessment()" class="text-slate-400 hover:text-slate-700 text-2xl leading-none">&times;</button>
                </div>
            </div>
            <div class="p-6">
                <div id="teacherQuestionContainer" class="min-h-[150px]"></div>
                <div class="mt-4 flex justify-between items-center border-t pt-3">
                    <button id="btnTeacherPrev" class="px-4 py-2 bg-slate-100 rounded-lg" onclick="teacherNavQuestion(-1)">ย้อนกลับ</button>
                    <span id="teacherProgress" class="text-sm text-slate-500">ข้อที่ 1/25</span>
                    <button id="btnTeacherNext" class="px-6 py-2 bg-indigo-600 text-white rounded-lg hidden" onclick="teacherNavQuestion(1)">ถัดไป</button>
                    <button id="btnTeacherSubmit" class="px-6 py-2 bg-emerald-500 text-white rounded-lg hidden" onclick="submitTeacherAssessment()">ส่งแบบประเมิน</button>
                </div>
            </div>
        </div>
    </div>
    `;
    $('body').append(modalHtml);
}

function startTeacherAssessment(enrollmentId, studentFullName, mode = 'new', existingAssessId = null) {
    teacherCurrentEnrollment = enrollmentId;
    teacherCurrentQIndex = 0;
    teacherAnswers = {};
    $('#assessStudentName').text(`กำลังประเมิน: ${studentFullName}`);
    // หากต้องการแก้ไขสามารถโหลดคำตอบเดิมได้ (จาก existingAssessId) แต่ตอนนี้เริ่มใหม่
    $('#teacherAssessmentModal').removeClass('hidden');
    renderTeacherQuestion();
}

function closeTeacherAssessment() {
    $('#teacherAssessmentModal').addClass('hidden');
    teacherCurrentEnrollment = null;
}

function renderTeacherQuestion() {
    const q = sdqQuestions[teacherCurrentQIndex];
    const container = $('#teacherQuestionContainer');
    container.html(`
        <div class="w-full text-center">
            <h3 class="text-xl font-bold mb-4">${q.id}. ${q.text}</h3>
            <div class="flex justify-center gap-4">
                ${[0, 1, 2].map(val => `
                    <label class="flex-1 cursor-pointer border-2 rounded-xl p-4 text-center font-bold transition-all
                        ${teacherAnswers[q.id] === val ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-indigo-300'}">
                        <input type="radio" name="teacherChoice" value="${val}" class="sr-only" onchange="teacherSelectAnswer(${val})">
                        ${val === 0 ? 'ไม่จริง' : val === 1 ? 'ค่อนข้างจริง' : 'จริง'}
                    </label>
                `).join('')}
            </div>
        </div>
    `);

    const isLast = teacherCurrentQIndex === 24;
    const hasAnswer = teacherAnswers[q.id] !== undefined;
    $('#btnTeacherNext').toggleClass('hidden', isLast || !hasAnswer);
    $('#btnTeacherSubmit').toggleClass('hidden', !isLast || !hasAnswer);
    $('#btnTeacherPrev').toggleClass('hidden', teacherCurrentQIndex === 0);
    $('#teacherProgress').text(`ข้อที่ ${teacherCurrentQIndex + 1} / 25`);
}

function teacherSelectAnswer(val) {
    teacherAnswers[sdqQuestions[teacherCurrentQIndex].id] = parseInt(val);
    if (teacherCurrentQIndex < 24) {
        setTimeout(() => teacherNavQuestion(1), 250);
    } else {
        renderTeacherQuestion(); // refresh เพื่อให้ปุ่ม submit โผล่
    }
}

function teacherNavQuestion(step) {
    teacherCurrentQIndex += step;
    renderTeacherQuestion();
}

async function submitTeacherAssessment() {
    if (Object.keys(teacherAnswers).length < 25) {
        Swal.fire('กรุณาตอบให้ครบทุกข้อ', '', 'warning');
        return;
    }

    let scores = { emotional: 0, conduct: 0, hyper: 0, peer: 0, prosocial: 0 };
    sdqQuestions.forEach(q => {
        let val = parseInt(teacherAnswers[q.id]) || 0;
        if (q.reverse) val = val === 0 ? 2 : (val === 2 ? 0 : 1);
        scores[q.cat] += val;
    });
    const totalScore = scores.emotional + scores.conduct + scores.hyper + scores.peer;

    // หา student_id จาก mergedDataList
    const enrollment = mergedDataList.find(e => e.id === teacherCurrentEnrollment);
    if (!enrollment || !enrollment.core_students) {
        Swal.fire('ผิดพลาด', 'ไม่พบข้อมูลนักเรียน', 'error'); return;
    }

    const payload = {
        enrollment_id: teacherCurrentEnrollment,
        student_id: enrollment.core_students.id,
        academic_year: currentSchoolInfo.current_academic_year,
        semester: currentSchoolInfo.current_semester,
        assessor_type: 'teacher',
        score_emotional: scores.emotional,
        score_conduct: scores.conduct,
        score_hyper: scores.hyper,
        score_peer: scores.peer,
        score_prosocial: scores.prosocial,
        total_difficulty_score: totalScore
    };
    for (let i = 1; i <= 25; i++) payload[`q${i}`] = teacherAnswers[i] || 0;

    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading() });
    const { error } = await db.from('sdq_assessments').upsert(payload, {
        onConflict: 'enrollment_id, assessor_type'
    });
    Swal.close();
    if (error) {
        Swal.fire('ผิดพลาด', error.message, 'error');
    } else {
        Swal.fire('สำเร็จ', 'บันทึกผลประเมินครูเรียบร้อย', 'success');
        closeTeacherAssessment();
        loadTeacherData(); // รีเฟรชตารางและแดชบอร์ด
    }
}

// ------------------------------------------
// 6. ฟังก์ชันดูผลการประเมิน (ดีไซน์ใหม่)
// ------------------------------------------
function viewSDQ(sdqId) {
    let targetAssess = null;
    let studentFullName = '';
    let roomInfo = null;
    let enrollmentId = null; // ✅ เพิ่มตัวแปรเก็บ enrollmentId

    // ค้นหาข้อมูล assessment และ enrollment ที่เกี่ยวข้อง
    for (let enrollment of mergedDataList) {
        if (enrollment.sdq_assessments) {
            const found = enrollment.sdq_assessments.find(a => a.id === sdqId);
            if (found) {
                targetAssess = found;
                const student = enrollment.core_students;
                studentFullName = `${student.prefix || ''}${student.first_name} ${student.last_name}`;
                roomInfo = enrollment.core_classrooms;
                enrollmentId = enrollment.id; // ✅ เก็บ enrollmentId
                break;
            }
        }
    }

    if (!targetAssess) return Swal.fire('ไม่พบข้อมูล', '', 'error');

    const assessorLabel = targetAssess.assessor_type === 'student' ? 'นักเรียน' :
        targetAssess.assessor_type === 'parent' ? 'ผู้ปกครอง' : 'ครู';
    const roomText = roomInfo ? `ม.${roomInfo.grade_level}/${roomInfo.room_number}` : '';
    const totalScore = targetAssess.total_difficulty_score;
    let statusText = 'ปกติ', statusColor = 'emerald';
    if (totalScore > 18) { statusText = 'มีปัญหา'; statusColor = 'rose'; }
    else if (totalScore > 15) { statusText = 'เสี่ยง'; statusColor = 'amber'; }

    const html = `
        <div class="text-left space-y-3 p-2">
            <div class="text-center">
                <h3 class="text-xl font-bold text-slate-800 mb-1">📋 ผลการประเมิน SDQ</h3>
                <p class="text-lg font-bold text-indigo-600">${studentFullName}</p>
                <p class="text-sm text-slate-500">${roomText} | ผู้ประเมิน: ${assessorLabel}</p>
            </div>
            <div class="grid grid-cols-2 gap-3 mt-3">
                <div class="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
                    <span>😢 ด้านอารมณ์</span>
                    <span class="font-bold text-indigo-600">${targetAssess.score_emotional}</span>
                </div>
                <div class="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
                    <span>😠 ความประพฤติ</span>
                    <span class="font-bold text-indigo-600">${targetAssess.score_conduct}</span>
                </div>
                <div class="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
                    <span>⚡ ไม่อยู่นิ่ง</span>
                    <span class="font-bold text-indigo-600">${targetAssess.score_hyper}</span>
                </div>
                <div class="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
                    <span>🤝 ความสัมพันธ์กับเพื่อน</span>
                    <span class="font-bold text-indigo-600">${targetAssess.score_peer}</span>
                </div>
                <div class="flex justify-between items-center p-3 bg-emerald-50 rounded-xl col-span-2">
                    <span>🌟 ด้านสังคม</span>
                    <span class="font-bold text-emerald-700">${targetAssess.score_prosocial}</span>
                </div>
            </div>
            <div class="text-center mt-4">
                <div class="text-3xl font-black text-indigo-600">${totalScore} <span class="text-base font-normal text-slate-400">/ 40</span></div>
                <div class="inline-block mt-2 px-4 py-1 rounded-full text-sm font-bold bg-${statusColor}-100 text-${statusColor}-700">
                    สถานะ: ${statusText}
                </div>
            </div>
        </div>
    `;

    Swal.fire({
        title: '',
        html: html,
        showConfirmButton: true,
        confirmButtonText: '<i class="fas fa-print mr-1"></i> พิมพ์',
        showCancelButton: true,
        cancelButtonText: 'ปิด',
        customClass: {
            popup: 'rounded-2xl p-4'
        }
    }).then((result) => {
        if (result.isConfirmed) {
            // ✅ เปลี่ยนจาก printSDQ(sdqId) เป็นพิมพ์รายงานรวมทั้ง 3 ส่วน
            if (enrollmentId) {
                printStudentSDQ(enrollmentId);
            } else {
                Swal.fire('ผิดพลาด', 'ไม่พบข้อมูลนักเรียน', 'error');
            }
        }
    });
}

// ==========================================
// ฟังก์ชันพิมพ์รายงานนักเรียน (รวมทุกผู้ประเมิน)
// ==========================================
// async function printStudentSDQ(enrollmentId) {
//     const enrollment = mergedDataList.find(e => e.id === enrollmentId);
//     if (!enrollment) return Swal.fire('ไม่พบข้อมูล', '', 'error');
    
//     const student = enrollment.core_students;
//     const assessments = enrollment.sdq_assessments || [];
//     const roomInfo = enrollment.core_classrooms;
//     const studentFullName = `${student.prefix || ''}${student.first_name} ${student.last_name}`;
//     const roomText = roomInfo ? `ม.${roomInfo.grade_level}/${roomInfo.room_number}` : '-';
    
//     const studentAssess = assessments.find(a => a.assessor_type === 'student');
//     const parentAssess = assessments.find(a => a.assessor_type === 'parent');
//     const teacherAssess = assessments.find(a => a.assessor_type === 'teacher');
    
//     // ฟังก์ชันช่วยดึงสถานะ
//     function getStatus(score) {
//         if (score <= 15) return { text: 'ปกติ', color: '#10b981' };
//         if (score <= 18) return { text: 'เสี่ยง', color: '#f59e0b' };
//         return { text: 'มีปัญหา', color: '#ef4444' };
//     }
    
//     // สรุปผลโดยใช้ primaryAssess (ครู > ผู้ปกครอง > นักเรียน)
//     const primaryAssess = teacherAssess || parentAssess || studentAssess;
//     let overallStatus = { text: 'ยังไม่ประเมิน', color: '#94a3b8' };
//     let overallScore = null;
//     if (primaryAssess) {
//         overallStatus = getStatus(primaryAssess.total_difficulty_score);
//         overallScore = primaryAssess.total_difficulty_score;
//     }
    
//     const schoolName = currentSchoolInfo?.school_name || currentSchoolInfo?.name || 'โรงเรียน';
    
//     // สร้าง HTML
//     const tempDiv = document.createElement('div');
//     tempDiv.style.cssText = 'font-family: "Sarabun", sans-serif; padding: 20px; max-width: 800px; margin: auto; background: white;';
    
//     // ฟังก์ชันสร้างแถวคะแนน
//     function buildAssessRow(assess, label) {
//         if (!assess) return `<tr><td>${label}</td><td colspan="5" style="text-align:center; color:#94a3b8;">ยังไม่ประเมิน</td></tr>`;
//         const status = getStatus(assess.total_difficulty_score);
//         const date = assess.created_at ? new Date(assess.created_at).toLocaleDateString('th-TH') : '-';
//         return `
//         <tr>
//             <td style="padding: 8px 10px; border-bottom:1px solid #e2e8f0;">${label}</td>
//             <td style="padding: 8px 10px; text-align:center; border-bottom:1px solid #e2e8f0;">${assess.score_emotional}</td>
//             <td style="padding: 8px 10px; text-align:center; border-bottom:1px solid #e2e8f0;">${assess.score_conduct}</td>
//             <td style="padding: 8px 10px; text-align:center; border-bottom:1px solid #e2e8f0;">${assess.score_hyper}</td>
//             <td style="padding: 8px 10px; text-align:center; border-bottom:1px solid #e2e8f0;">${assess.score_peer}</td>
//             <td style="padding: 8px 10px; text-align:center; border-bottom:1px solid #e2e8f0;">${assess.score_prosocial}</td>
//             <td style="padding: 8px 10px; text-align:center; font-weight:bold; border-bottom:1px solid #e2e8f0;">${assess.total_difficulty_score}</td>
//             <td style="padding: 8px 10px; text-align:center; border-bottom:1px solid #e2e8f0;"><span style="color:${status.color};font-weight:bold;">${status.text}</span></td>
//             <td style="padding: 8px 10px; text-align:center; border-bottom:1px solid #e2e8f0;">${date}</td>
//         </tr>`;
//     }
    
//     tempDiv.innerHTML = `
//         <div style="text-align:center; margin-bottom:5px;">
//             <div style="font-size:16px; font-weight:bold; color:#4f46e5;">${schoolName}</div>
//             <div style="font-size:14px; color:#64748b;">รายงานผลการประเมิน SDQ</div>
//         </div>
//         <div style="text-align:center; border-bottom:2px solid #e2e8f0; padding-bottom:10px; margin-bottom:20px;">
//             <h2 style="margin:5px 0; font-size:20px;">📋 ${studentFullName}</h2>
//             <p style="margin:0; font-size:14px;">${roomText} | ปีการศึกษา ${currentSchoolInfo.current_academic_year} ภาคเรียนที่ ${currentSchoolInfo.current_semester}</p>
//         </div>
        
//         <!-- ตารางเปรียบเทียบ -->
//         <div style="page-break-inside: avoid; margin-bottom:20px;">
//             <h3 style="color:#334155; font-size:16px; margin-bottom:10px;">📝 คะแนนรายด้านจากผู้ประเมิน</h3>
//             <table style="width:100%; border-collapse:collapse; border:1px solid #e2e8f0; font-size:12px;">
//                 <thead>
//                     <tr style="background:#f8fafc;">
//                         <th style="padding:10px; text-align:left; border-bottom:2px solid #e2e8f0;">ผู้ประเมิน</th>
//                         <th style="padding:10px; text-align:center; border-bottom:2px solid #e2e8f0;">อารมณ์</th>
//                         <th style="padding:10px; text-align:center; border-bottom:2px solid #e2e8f0;">ความประพฤติ</th>
//                         <th style="padding:10px; text-align:center; border-bottom:2px solid #e2e8f0;">ไม่อยู่นิ่ง</th>
//                         <th style="padding:10px; text-align:center; border-bottom:2px solid #e2e8f0;">เพื่อน</th>
//                         <th style="padding:10px; text-align:center; border-bottom:2px solid #e2e8f0;">สังคม</th>
//                         <th style="padding:10px; text-align:center; border-bottom:2px solid #e2e8f0;">รวม</th>
//                         <th style="padding:10px; text-align:center; border-bottom:2px solid #e2e8f0;">สถานะ</th>
//                         <th style="padding:10px; text-align:center; border-bottom:2px solid #e2e8f0;">วันที่</th>
//                     </tr>
//                 </thead>
//                 <tbody>
//                     ${buildAssessRow(studentAssess, '🧑‍🎓 นักเรียน')}
//                     ${buildAssessRow(parentAssess, '👨‍👩‍👧 ผู้ปกครอง')}
//                     ${buildAssessRow(teacherAssess, '👩‍🏫 ครู')}
//                 </tbody>
//             </table>
//         </div>
        
//         <!-- กราฟเปรียบเทียบ -->
//         <div style="page-break-inside: avoid; margin-bottom:20px;">
//             <canvas id="compareChart_${enrollmentId}" width="600" height="250"></canvas>
//         </div>
        
//         <!-- สรุปผลภาพรวม -->
//         <div style="page-break-inside: avoid; background:${overallStatus.color}15; border:2px solid ${overallStatus.color}; border-radius:10px; padding:15px; text-align:center;">
//             <div style="font-size:14px; color:#64748b;">สรุปผลภาพรวม</div>
//             <div style="font-size:36px; font-weight:900; color:${overallStatus.color}; margin:5px 0;">${overallScore !== null ? overallScore+'/40' : '-'}</div>
//             <div style="display:inline-block; background:${overallStatus.color}; color:white; padding:6px 20px; border-radius:20px; font-weight:bold;">${overallStatus.text}</div>
//             <div style="margin-top:10px; font-size:12px; color:#64748b;">* ใช้ผลจากครู > ผู้ปกครอง > นักเรียน</div>
//         </div>
        
//         <div style="text-align:center; margin-top:20px; color:#94a3b8; font-size:11px;">
//             พิมพ์เมื่อ: ${new Date().toLocaleDateString('th-TH')} | ระบบ SDQ Teacher
//         </div>
//     `;
    
//     document.body.appendChild(tempDiv);
//     await new Promise(resolve => setTimeout(resolve, 200));
    
//     // สร้างกราฟเรดาร์เปรียบเทียบ
//     const canvas = tempDiv.querySelector(`#compareChart_${enrollmentId}`);
//     if (canvas) {
//         const ctx = canvas.getContext('2d');
//         const labels = ['อารมณ์', 'ความประพฤติ', 'ไม่อยู่นิ่ง', 'เพื่อน', 'สังคม'];
//         const datasets = [];
//         if (studentAssess) datasets.push({ label: 'นักเรียน', data: [studentAssess.score_emotional, studentAssess.score_conduct, studentAssess.score_hyper, studentAssess.score_peer, studentAssess.score_prosocial], borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)' });
//         if (parentAssess) datasets.push({ label: 'ผู้ปกครอง', data: [parentAssess.score_emotional, parentAssess.score_conduct, parentAssess.score_hyper, parentAssess.score_peer, parentAssess.score_prosocial], borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)' });
//         if (teacherAssess) datasets.push({ label: 'ครู', data: [teacherAssess.score_emotional, teacherAssess.score_conduct, teacherAssess.score_hyper, teacherAssess.score_peer, teacherAssess.score_prosocial], borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)' });
        
//         new Chart(ctx, {
//             type: 'radar',
//             data: { labels, datasets },
//             options: {
//                 responsive: true,
//                 maintainAspectRatio: true,
//                 scales: { r: { beginAtZero: true, max: 10, ticks: { stepSize: 2 } } },
//                 plugins: { legend: { position: 'bottom' } }
//             }
//         });
//         await new Promise(resolve => setTimeout(resolve, 500));
//     }
    
//     // สร้าง PDF
//     await html2pdf().set({
//         margin: [0.5, 0.5, 0.5, 0.5],
//         filename: `SDQ_Report_${studentFullName}_${currentSchoolInfo.current_academic_year}.pdf`,
//         image: { type: 'jpeg', quality: 0.98 },
//         html2canvas: { scale: 2, useCORS: true, logging: false },
//         jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' },
//         pagebreak: { mode: ['avoid-all', 'css', 'legacy'], avoid: ['tr'] }
//     }).from(tempDiv).save();
    
//     setTimeout(() => {
//         if (tempDiv && tempDiv.parentNode) document.body.removeChild(tempDiv);
//     }, 500);
// }
async function printStudentSDQ(enrollmentId) {
    const enrollment = mergedDataList.find(e => e.id === enrollmentId);
    if (!enrollment) return Swal.fire('ไม่พบข้อมูล', '', 'error');
    
    const student = enrollment.core_students;
    const assessments = enrollment.sdq_assessments || [];
    const roomInfo = enrollment.core_classrooms;
    const studentFullName = `${student.prefix || ''}${student.first_name} ${student.last_name}`;
    const roomText = roomInfo ? `ม.${roomInfo.grade_level}/${roomInfo.room_number}` : '-';
    
    const studentAssess = assessments.find(a => a.assessor_type === 'student');
    const parentAssess = assessments.find(a => a.assessor_type === 'parent');
    const teacherAssess = assessments.find(a => a.assessor_type === 'teacher');
    
    function getStatus(score) {
        if (score <= 15) return { text: 'ปกติ', color: '#10b981' };
        if (score <= 18) return { text: 'เสี่ยง', color: '#f59e0b' };
        return { text: 'มีปัญหา', color: '#ef4444' };
    }
    
    const primaryAssess = teacherAssess || parentAssess || studentAssess;
    let overallStatus = { text: 'ยังไม่ประเมิน', color: '#94a3b8' };
    let overallScore = null;
    if (primaryAssess) {
        overallStatus = getStatus(primaryAssess.total_difficulty_score);
        overallScore = primaryAssess.total_difficulty_score;
    }
    
    const schoolName = currentSchoolInfo?.school_name || currentSchoolInfo?.name || 'โรงเรียน';
    
    const tempDiv = document.createElement('div');
    tempDiv.style.cssText = 'font-family: "Sarabun", sans-serif; padding: 10px; max-width: 800px; margin: auto; background: white; font-size: 11px;';
    
    function buildAssessRow(assess, label) {
        if (!assess) return `<tr><td>${label}</td><td colspan="5" style="text-align:center; color:#94a3b8;">-</td></tr>`;
        const status = getStatus(assess.total_difficulty_score);
        return `
        <tr>
            <td style="padding:4px 6px; border-bottom:1px solid #e2e8f0;">${label}</td>
            <td style="padding:4px 6px; text-align:center; border-bottom:1px solid #e2e8f0;">${assess.score_emotional}</td>
            <td style="padding:4px 6px; text-align:center; border-bottom:1px solid #e2e8f0;">${assess.score_conduct}</td>
            <td style="padding:4px 6px; text-align:center; border-bottom:1px solid #e2e8f0;">${assess.score_hyper}</td>
            <td style="padding:4px 6px; text-align:center; border-bottom:1px solid #e2e8f0;">${assess.score_peer}</td>
            <td style="padding:4px 6px; text-align:center; border-bottom:1px solid #e2e8f0;">${assess.score_prosocial}</td>
            <td style="padding:4px 6px; text-align:center; font-weight:bold; border-bottom:1px solid #e2e8f0;">${assess.total_difficulty_score}</td>
            <td style="padding:4px 6px; text-align:center; border-bottom:1px solid #e2e8f0;"><span style="color:${status.color};font-weight:bold;font-size:10px;">${status.text}</span></td>
        </tr>`;
    }
    
    tempDiv.innerHTML = `
        <div style="text-align:center; margin-bottom:3px;">
            <div style="font-size:14px; font-weight:bold; color:#4f46e5;">${schoolName}</div>
            <div style="font-size:11px; color:#64748b;">รายงานผลการประเมิน SDQ</div>
        </div>
        <div style="text-align:center; border-bottom:1px solid #e2e8f0; padding-bottom:8px; margin-bottom:12px;">
            <h2 style="margin:4px 0; font-size:18px;">📋 ${studentFullName}</h2>
            <p style="margin:0; font-size:12px;">${roomText} | ปีการศึกษา ${currentSchoolInfo.current_academic_year} ภาคเรียนที่ ${currentSchoolInfo.current_semester}</p>
        </div>
        
        <!-- ตารางเปรียบเทียบกระชับ -->
        <div style="page-break-inside: avoid; margin-bottom:15px;">
            <h3 style="color:#334155; font-size:14px; margin-bottom:6px;">📝 คะแนนรายด้าน</h3>
            <table style="width:100%; border-collapse:collapse; border:1px solid #e2e8f0; font-size:10px;">
                <thead>
                    <tr style="background:#f8fafc;">
                        <th style="padding:5px; text-align:left; border-bottom:2px solid #e2e8f0;">ผู้ประเมิน</th>
                        <th style="padding:5px; text-align:center; border-bottom:2px solid #e2e8f0;">อารมณ์</th>
                        <th style="padding:5px; text-align:center; border-bottom:2px solid #e2e8f0;">ประพฤติ</th>
                        <th style="padding:5px; text-align:center; border-bottom:2px solid #e2e8f0;">นิ่ง</th>
                        <th style="padding:5px; text-align:center; border-bottom:2px solid #e2e8f0;">เพื่อน</th>
                        <th style="padding:5px; text-align:center; border-bottom:2px solid #e2e8f0;">สังคม</th>
                        <th style="padding:5px; text-align:center; border-bottom:2px solid #e2e8f0;">รวม</th>
                        <th style="padding:5px; text-align:center; border-bottom:2px solid #e2e8f0;">สถานะ</th>
                    </tr>
                </thead>
                <tbody>
                    ${buildAssessRow(studentAssess, '🧑🎓 นักเรียน')}
                    ${buildAssessRow(parentAssess, '👨‍👩‍👧 ผู้ปกครอง')}
                    ${buildAssessRow(teacherAssess, '👩‍🏫 ครู')}
                </tbody>
            </table>
        </div>
        
        <!-- กราฟเรดาร์เล็ก -->
        <div style="display:flex; justify-content:center; margin-bottom:15px;">
            <canvas id="compareChart_${enrollmentId}" width="400" height="180"></canvas>
        </div>
        
        <!-- สรุปผล -->
        <div style="text-align:center; padding:10px; background:${overallStatus.color}15; border:1px solid ${overallStatus.color}; border-radius:8px;">
            <div style="font-size:12px; color:#64748b;">สรุปผลภาพรวม</div>
            <div style="font-size:28px; font-weight:900; color:${overallStatus.color}; margin:2px 0;">${overallScore !== null ? overallScore+'/40' : '-'}</div>
            <div style="display:inline-block; background:${overallStatus.color}; color:white; padding:4px 16px; border-radius:16px; font-weight:bold; font-size:12px;">${overallStatus.text}</div>
        </div>
        
        <div style="text-align:center; margin-top:8px; color:#94a3b8; font-size:9px;">
            พิมพ์เมื่อ ${new Date().toLocaleDateString('th-TH')} | ระบบ SDQ Teacher
        </div>
    `;
    
    document.body.appendChild(tempDiv);
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const canvas = tempDiv.querySelector(`#compareChart_${enrollmentId}`);
    if (canvas) {
        const ctx = canvas.getContext('2d');
        const labels = ['อารมณ์', 'ความประพฤติ', 'ไม่อยู่นิ่ง', 'เพื่อน', 'สังคม'];
        const datasets = [];
        if (studentAssess) datasets.push({ label: 'นักเรียน', data: [studentAssess.score_emotional, studentAssess.score_conduct, studentAssess.score_hyper, studentAssess.score_peer, studentAssess.score_prosocial], borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)' });
        if (parentAssess) datasets.push({ label: 'ผู้ปกครอง', data: [parentAssess.score_emotional, parentAssess.score_conduct, parentAssess.score_hyper, parentAssess.score_peer, parentAssess.score_prosocial], borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)' });
        if (teacherAssess) datasets.push({ label: 'ครู', data: [teacherAssess.score_emotional, teacherAssess.score_conduct, teacherAssess.score_hyper, teacherAssess.score_peer, teacherAssess.score_prosocial], borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)' });
        
        new Chart(ctx, {
            type: 'radar',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                scales: { r: { beginAtZero: true, max: 10, ticks: { stepSize: 2, font: { size: 8 } }, pointLabels: { font: { size: 9 } } } },
                plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } }
            }
        });
        await new Promise(resolve => setTimeout(resolve, 400));
    }
    
    await html2pdf().set({
        margin: [0.4, 0.4, 0.4, 0.4],
        filename: `SDQ_Report_${studentFullName}.pdf`,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all'], avoid: ['tr', '.keep-together'] }
    }).from(tempDiv).save();
    
    setTimeout(() => {
        if (tempDiv && tempDiv.parentNode) document.body.removeChild(tempDiv);
    }, 500);
}

async function deleteSDQ(sdqId) {
    const result = await Swal.fire({
        title: 'ยืนยันการลบ/รีเซ็ต',
        text: 'การประเมินนี้จะถูกลบออก',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#f59e0b',
        cancelButtonText: 'ยกเลิก',
        confirmButtonText: 'ยืนยัน'
    });
    if (result.isConfirmed) {
        Swal.fire({ title: 'กำลังลบ...', didOpen: () => Swal.showLoading() });
        const { error } = await db.from('sdq_assessments').delete().eq('id', sdqId);
        Swal.close();
        if (error) Swal.fire('ผิดพลาด', error.message, 'error');
        else {
            Swal.fire('สำเร็จ', '', 'success');
            loadTeacherData();
        }
    }
}

// ------------------------------------------
// 7. Export Excel (ปรับให้มี 3 ผู้ประเมินในแถวเดียว)
// ------------------------------------------
function exportTeacherExcel() {
    if (mergedDataList.length === 0) return Swal.fire('ไม่มีข้อมูล', '', 'warning');

    const excelData = mergedDataList.map(enrollment => {
        const s = enrollment.core_students;
        const assessments = enrollment.sdq_assessments || [];
        const studentAssess = assessments.find(a => a.assessor_type === 'student');
        const parentAssess = assessments.find(a => a.assessor_type === 'parent');
        const teacherAssess = assessments.find(a => a.assessor_type === 'teacher');

        return {
            'เลขที่': enrollment.student_number,
            'รหัสนักเรียน': s.student_id_card,
            'ชื่อ-นามสกุล': `${s.prefix || ''}${s.first_name} ${s.last_name}`,
            'คะแนนรวม (นร.)': studentAssess ? studentAssess.total_difficulty_score : '-',
            'อารมณ์ (นร.)': studentAssess ? studentAssess.score_emotional : '-',
            'ความประพฤติ (นร.)': studentAssess ? studentAssess.score_conduct : '-',
            'สมาธิสั้น (นร.)': studentAssess ? studentAssess.score_hyper : '-',
            'เพื่อน (นร.)': studentAssess ? studentAssess.score_peer : '-',
            'สังคม (นร.)': studentAssess ? studentAssess.score_prosocial : '-',

            'คะแนนรวม (ผปค.)': parentAssess ? parentAssess.total_difficulty_score : '-',
            'อารมณ์ (ผปค.)': parentAssess ? parentAssess.score_emotional : '-',
            'ความประพฤติ (ผปค.)': parentAssess ? parentAssess.score_conduct : '-',
            'สมาธิสั้น (ผปค.)': parentAssess ? parentAssess.score_hyper : '-',
            'เพื่อน (ผปค.)': parentAssess ? parentAssess.score_peer : '-',
            'สังคม (ผปค.)': parentAssess ? parentAssess.score_prosocial : '-',

            'คะแนนรวม (ครู)': teacherAssess ? teacherAssess.total_difficulty_score : '-',
            'อารมณ์ (ครู)': teacherAssess ? teacherAssess.score_emotional : '-',
            'ความประพฤติ (ครู)': teacherAssess ? teacherAssess.score_conduct : '-',
            'สมาธิสั้น (ครู)': teacherAssess ? teacherAssess.score_hyper : '-',
            'เพื่อน (ครู)': teacherAssess ? teacherAssess.score_peer : '-',
            'สังคม (ครู)': teacherAssess ? teacherAssess.score_prosocial : '-',
        };
    });

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SDQ_Class_Report");
    XLSX.writeFile(wb, `SDQ_Class_${new Date().getTime()}.xlsx`);
}