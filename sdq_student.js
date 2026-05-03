// sdq_student.js
let currentUser = null;
let currentEnrollment = null;
let currentSchoolInfo = null;
let activeRole = '';
let currentQIndex = 0;
let answers = {}; // เก็บคำตอบแบบ Object { 1: 2, 2: 0, ... }

// ชุดคำถามมาตรฐาน SDQ 25 ข้อ พร้อมระบุด้านและข้อที่เป็นเชิงลบ (Reverse Score)
const sdqQuestions = [
    { id: 1, text: "ห่วงใยความรู้สึกคนอื่น", cat: "prosocial", reverse: false },
    { id: 2, text: "อยู่นิ่งไม่ได้ นั่งไม่ติดที่", cat: "hyper", reverse: false },
    { id: 3, text: "มักจะบ่นว่าปวดหัว ปวดท้อง หรือไม่สบาย", cat: "emotional", reverse: false },
    { id: 4, text: "เต็มใจแบ่งปันสิ่งของให้เพื่อน", cat: "prosocial", reverse: false },
    { id: 5, text: "มักจะอาละวาด หรือโมโหร้าย", cat: "conduct", reverse: false },
    { id: 6, text: "ค่อนข้างแยกตัว ชอบเล่นคนเดียว", cat: "peer", reverse: false },
    { id: 7, text: "เชื่อฟัง มักจะทำตามที่ผู้ใหญ่ต้องการ", cat: "conduct", reverse: true }, // Reverse
    { id: 8, text: "กังวลใจหลายเรื่อง ดูวิตกกังวลเสมอ", cat: "emotional", reverse: false },
    { id: 9, text: "เป็นที่พึ่งได้เวลาคนอื่นเสียใจ", cat: "prosocial", reverse: false },
    { id: 10, text: "ยุกยิก กระสับกระส่าย", cat: "hyper", reverse: false },
    { id: 11, text: "มีเพื่อนสนิทอย่างน้อยหนึ่งคน", cat: "peer", reverse: true }, // Reverse
    { id: 12, text: "มักจะมีเรื่องทะเลาะวิวาทกับเด็กคนอื่น", cat: "conduct", reverse: false },
    { id: 13, text: "ดูไม่มีความสุข ร้องไห้บ่อย", cat: "emotional", reverse: false },
    { id: 14, text: "เป็นที่ชื่นชอบของเพื่อนๆ", cat: "peer", reverse: true }, // Reverse
    { id: 15, text: "วอกแวกง่าย ขาดสมาธิ", cat: "hyper", reverse: false },
    { id: 16, text: "ขี้กลัว ไม่กล้าแสดงออก", cat: "emotional", reverse: false },
    { id: 17, text: "ใจดีกับเด็กที่เล็กกว่า", cat: "prosocial", reverse: false },
    { id: 18, text: "มักจะถูกเด็กคนอื่นแกล้งหรือรังแก", cat: "peer", reverse: false },
    { id: 19, text: "มักจะโกหกหรือขี้โกง", cat: "conduct", reverse: false },
    { id: 20, text: "อาสาช่วยเหลือคนอื่นเสมอ", cat: "prosocial", reverse: false },
    { id: 21, text: "คิดก่อนทำ", cat: "hyper", reverse: true }, // Reverse
    { id: 22, text: "แอบเอาของคนอื่น", cat: "conduct", reverse: false },
    { id: 23, text: "เข้ากับผู้ใหญ่ได้ดีกว่าเด็กวัยเดียวกัน", cat: "peer", reverse: false },
    { id: 24, text: "ขี้ขลาด", cat: "emotional", reverse: false },
    { id: 25, text: "ทำงานจนเสร็จ มีความตั้งใจ", cat: "hyper", reverse: true } // Reverse
];

$(document).ready(async function() {
    await checkStudentAuth();
    await fetchCoreInfo();
});

async function checkStudentAuth() {
    const { data: { user } } = await db.auth.getUser();
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    
    // ดึงข้อมูลนักเรียนและห้องเรียนปัจจุบัน (Single Source of Truth)
    const { data: studentData, error } = await db
        .from('core_students')
        .select(`
            id, first_name, last_name, prefix,
            student_enrollments (id, student_number, core_classrooms(grade_level, room_number))
        `)
        .eq('id', user.id)
        .single();
        
    if (error || !studentData) {
        Swal.fire('ข้อผิดพลาด', 'ไม่พบข้อมูลนักเรียนในระบบ', 'error');
        return;
    }
    
    currentUser = studentData;
    // ดึง enrollment ล่าสุด (สมมติว่า index 0 คือปีปัจจุบัน จัดเรียงจาก API หลัก)
    currentEnrollment = studentData.student_enrollments[0];
    const room = currentEnrollment.core_classrooms;
    
    $('#userInfoDisplay').text(`${studentData.prefix}${studentData.first_name} ${studentData.last_name} | ม.${room.grade_level}/${room.room_number} เลขที่ ${currentEnrollment.student_number}`);
}

async function fetchCoreInfo() {
    const { data } = await db.from('core_school_info').select('*').single();
    currentSchoolInfo = data;
}

async function checkExistingResult() {
    const { data, error } = await db
        .from('sdq_assessments')
        .select('*')
        .eq('student_id', currentUser.id)
        .eq('academic_year', currentSchoolInfo.current_academic_year)
        .eq('semester', currentSchoolInfo.current_semester);
        
    if (data && data.length > 0) {
        renderResult(data[0]);
    } else {
        Swal.fire('ข้อมูล', 'ยังไม่มีประวัติการทำแบบประเมินในเทอมนี้', 'info');
    }
}

function startSDQ(role) {
    activeRole = role;
    $('#roleSelection').hide();
    $('#sdqForm').removeClass('hidden');
    renderQuestion();
}

function renderQuestion() {
    const q = sdqQuestions[currentQIndex];
    $('#questionText').text(`${q.id}. ${q.text}`);
    
    // อัปเดต Progress
    const percent = Math.round(((currentQIndex) / 25) * 100);
    $('#progressBar').css('width', `${percent}%`);
    $('#progressText').text(`ข้อที่ ${currentQIndex + 1} / 25`);
    $('#percentText').text(`${percent}%`);
    
    // เคลียร์ Radio
    $('input[name="sdqChoice"]').prop('checked', false);
    if (answers[q.id] !== undefined) {
        $(`#choice${answers[q.id]}`).prop('checked', true);
        $('#btnNext').removeClass('hidden');
    } else {
        $('#btnNext').addClass('hidden');
    }

    // จัดการปุ่ม
    $('#btnPrev').toggleClass('hidden', currentQIndex === 0);
    
    if (currentQIndex === 24 && answers[q.id] !== undefined) {
        $('#btnSubmit').removeClass('hidden');
        $('#btnNext').addClass('hidden');
    } else {
        $('#btnSubmit').addClass('hidden');
    }
}

function selectAnswer(val) {
    answers[sdqQuestions[currentQIndex].id] = val;
    $('#btnNext').removeClass('hidden');
    if(currentQIndex === 24) {
        $('#btnSubmit').removeClass('hidden');
        $('#btnNext').addClass('hidden');
    } else {
        // Auto-next for UX
        setTimeout(() => navQuestion(1), 300);
    }
}

function navQuestion(step) {
    currentQIndex += step;
    renderQuestion();
}

async function submitAssessment() {
    if (Object.keys(answers).length < 25) {
        Swal.fire('แจ้งเตือน', 'กรุณาตอบคำถามให้ครบทุกข้อ', 'warning');
        return;
    }

    Swal.fire({ title: 'กำลังคำนวณผล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    // 1. คำนวณคะแนน
    let scores = { emotional: 0, conduct: 0, hyper: 0, peer: 0, prosocial: 0 };
    
    sdqQuestions.forEach(q => {
        let val = answers[q.id];
        if (q.reverse) {
            val = val === 0 ? 2 : (val === 2 ? 0 : 1); // กลับคะแนน
        }
        scores[q.cat] += val;
    });

    const totalScore = scores.emotional + scores.conduct + scores.hyper + scores.peer;

    // 2. เตรียมข้อมูลบันทึกลง DB
    const payload = {
        student_id: currentUser.id,
        enrollment_id: currentEnrollment.id,
        academic_year: currentSchoolInfo.current_academic_year,
        semester: currentSchoolInfo.current_semester,
        assessor_type: activeRole,
        score_emotional: scores.emotional,
        score_conduct: scores.conduct,
        score_hyper: scores.hyper,
        score_peer: scores.peer,
        score_prosocial: scores.prosocial,
        total_difficulty_score: totalScore
    };

    // ใส่คะแนนรายข้อ q1-q25
    for(let i=1; i<=25; i++) { payload[`q${i}`] = answers[i]; }

    // 3. บันทึก (ใช้ Upsert เพื่อให้ทำซ้ำ/แก้ไขได้)
    const { error } = await db.from('sdq_assessments').upsert(payload, { onConflict: 'enrollment_id, assessor_type' });

    Swal.close();
    if (error) {
        Swal.fire('Error', 'เกิดข้อผิดพลาดในการบันทึกข้อมูล: ' + error.message, 'error');
    } else {
        renderResult(payload);
    }
}

// ในไฟล์ sdq_student.js ค้นหาฟังก์ชัน renderResult แล้วแทนที่ด้วยโค้ดนี้

function renderResult(data) {
    $('#roleSelection, #sdqForm, #welcomeSection').hide();
    $('#resultView').removeClass('hidden');

    // เกณฑ์การแปลผล (ปรับสีให้เข้ากับ Tailwind ธีม)
    const getRiskLevel = (score, type) => {
        if(type === 'total') return score <= 15 ? ['ปกติ', 'bg-emerald-50 border-emerald-200 text-emerald-700', 'text-emerald-600'] 
                                : score <= 18 ? ['เสี่ยง', 'bg-amber-50 border-amber-200 text-amber-700', 'text-amber-500'] 
                                : ['มีปัญหา', 'bg-rose-50 border-rose-200 text-rose-700', 'text-rose-600'];
        return ['ปกติ', 'bg-slate-50', 'text-slate-700'];
    };

    const totalStatus = getRiskLevel(data.total_difficulty_score, 'total');

    // อัปเดต UI รายด้าน (ใช้สไตล์การ์ดเล็ก)
    $('#scoreDetails').html(`
        <div class="p-4 border border-slate-100 bg-slate-50 rounded-xl flex justify-between items-center">
            <span class="text-sm font-bold text-slate-600">ด้านอารมณ์</span>
            <span class="text-lg font-black text-indigo-600">${data.score_emotional}</span>
        </div>
        <div class="p-4 border border-slate-100 bg-slate-50 rounded-xl flex justify-between items-center">
            <span class="text-sm font-bold text-slate-600">ความประพฤติ</span>
            <span class="text-lg font-black text-indigo-600">${data.score_conduct}</span>
        </div>
        <div class="p-4 border border-slate-100 bg-slate-50 rounded-xl flex justify-between items-center">
            <span class="text-sm font-bold text-slate-600">พฤติกรรมไม่อยู่นิ่ง</span>
            <span class="text-lg font-black text-indigo-600">${data.score_hyper}</span>
        </div>
        <div class="p-4 border border-slate-100 bg-slate-50 rounded-xl flex justify-between items-center">
            <span class="text-sm font-bold text-slate-600">ความสัมพันธ์กับเพื่อน</span>
            <span class="text-lg font-black text-indigo-600">${data.score_peer}</span>
        </div>
    `);

    // อัปเดตกล่องคะแนนรวม
    $('#totalScoreCard').attr('class', `mt-6 p-6 rounded-2xl border-2 text-center ${totalStatus[1]}`);
    $('#totalScoreCard').html(`
        <div class="text-sm font-bold opacity-80 uppercase tracking-wide mb-2">คะแนนรวมความยากลำบาก</div>
        <div class="text-5xl font-black mb-2">${data.total_difficulty_score} <span class="text-xl font-medium opacity-50">/ 40</span></div>
        <div class="inline-block px-4 py-1.5 bg-white/60 rounded-full text-sm font-bold mt-2 shadow-sm ${totalStatus[2]}">
            ผลการประเมิน: ${totalStatus[0]}
        </div>
    `);
}

function exportToPDF() {
    const element = document.getElementById('printArea');
    const opt = {
        margin: 0.5,
        filename: `SDQ_${currentUser.first_name}_${currentSchoolInfo.current_academic_year}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
}