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

$(document).ready(async () => {
    // 1. ตรวจสอบ Auth และดึงข้อมูล
    await checkStudentAuth();

    // 2. ค่อยๆ แสดงหน้าเว็บขึ้นมา
    setTimeout(() => $('#mainBody').removeClass('opacity-0'), 100);
});

// 🌟 ฟังก์ชันตรวจสอบสิทธิ์และดึงข้อมูลนักเรียน (ฉบับแก้ไขอาการค้าง)
async function checkStudentAuth() {
    try {
        const { data: { session }, error: authError } = await db.auth.getSession();
        if (authError || !session) {
            window.location.href = 'login.html';
            return;
        }

        const { data: schoolInfo } = await db.from('core_school_info').select('*').single();
        currentSchoolInfo = schoolInfo;

        const sidFromEmail = session.user.email.split('@')[0];

        const { data: studentData, error: stdError } = await db
            .from('core_students')
            .select(`
                *,
                student_enrollments (
                    id, student_number, academic_year, classroom_id,
                    core_classrooms (grade_level, room_number)
                )
            `)
            .eq('student_id_card', sidFromEmail)
            .single();

        if (stdError || !studentData) throw new Error("ไม่พบข้อมูลนักเรียนในฐานข้อมูล");

        currentUser = studentData;

        // ✅ ใช้ enrollment ล่าสุด (ไม่ต้องกรองปี/ภาค)
        if (studentData.student_enrollments && studentData.student_enrollments.length > 0) {
            currentEnrollment = studentData.student_enrollments[0]; // ใช้อันแรก (เรียงตามคิวรี)
        }

        const fullName = `${studentData.prefix || ''}${studentData.first_name} ${studentData.last_name}`;
        const userInfoEl = document.getElementById('userInfoDisplay');
        if (userInfoEl) {
            let roomText = '';
            if (currentEnrollment && currentEnrollment.core_classrooms) {
                const cls = currentEnrollment.core_classrooms;
                roomText = ` (ม.${cls.grade_level}/${cls.room_number})`;
            }
            userInfoEl.textContent = `${fullName}${roomText}`;
        }

        const viewLoading = document.getElementById('view-loading');
        if (viewLoading) viewLoading.classList.add('hidden');

        const roleSelection = document.getElementById('role-selection');
        if (roleSelection) roleSelection.classList.remove('hidden');

        Swal.close();

    } catch (err) {
        console.error("Auth Error:", err);
        Swal.fire('พบข้อผิดพลาด', err.message, 'error');
    }
}
/* ── ฟังก์ชันเริ่มทำแบบประเมิน (คลิกจากหน้าเลือกบทบาท) ── */
async function startSDQ(role) {
    activeRole = role; // กำหนดค่าบทบาท 'student' หรือ 'parent'
    $('#roleSelection').hide();
    // พอเลือกบทบาทเสร็จ ให้เรียกฟังก์ชันตรวจสอบประวัติ
    await checkExistingAssessment();
    $('#sdqForm').removeClass('hidden');
    renderQuestion();
}


// 🌟 ฟังก์ชันตรวจสอบว่าเคยทำประเมินในเทอมนี้ไปหรือยัง
async function checkExistingAssessment() {
    Swal.fire({ title: 'กำลังตรวจสอบข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    try {
        const { data: exist } = await db.from('sdq_assessments')
            .select('*')
            .eq('student_id', currentUser.id)
            .eq('academic_year', currentSchoolInfo.current_academic_year)
            .eq('semester', currentSchoolInfo.current_semester)
            .eq('assessor_type', activeRole)
            .maybeSingle();

        Swal.close();

        if (exist) {
            const result = await Swal.fire({
                title: 'คุณเคยประเมินแล้ว!',
                text: `ระบบพบผลการประเมิน SDQ (ในฐานะ${activeRole === 'parent' ? 'ผู้ปกครอง' : 'นักเรียน'}) ของเทอมนี้แล้ว`,
                icon: 'info',
                showCancelButton: true,
                confirmButtonText: '<i class="fas fa-chart-pie mr-1"></i> ดูผลประเมิน',
                cancelButtonText: '<i class="fas fa-redo mr-1"></i> ทำใหม่',
                confirmButtonColor: '#4f46e5',
                cancelButtonColor: '#f59e0b',
                allowOutsideClick: false
            });

            if (result.isConfirmed) {
                $('#roleSelection').addClass('hidden');
                $('#sdqForm').addClass('hidden');
                $('#welcomeSection').hide();
                $('#resultView').removeClass('hidden');

                if (typeof renderSDQResult === 'function') {
                    renderSDQResult(exist);
                } else {
                    renderResult(exist);
                }

            } else if (result.dismiss === Swal.DismissReason.cancel) {
                answers = {};
                currentQIndex = 0;
                $('#roleSelection').addClass('hidden');
                $('#sdqForm').removeClass('hidden');
                renderQuestion();
            }
        } else {
            $('#roleSelection').addClass('hidden');
            $('#sdqForm').removeClass('hidden');
            renderQuestion();
        }
    } catch (err) {
        console.error("Check Exist Error:", err);
        Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถตรวจสอบข้อมูลเดิมได้', 'error');
    }
}

function renderSDQResult(data) {
    $('#roleSelection, #sdqForm, #welcomeSection').hide();
    $('#resultView').removeClass('hidden');
    renderResult(data);
}

/* ── ฟังก์ชันดูผลย้อนหลัง (คลิกลิงก์ด้านล่าง) ── */
async function checkExistingResult() {
    // เด้งให้เลือกก่อนว่าจะดูผลของใคร
    const { value: role } = await Swal.fire({
        title: 'เลือกผลประเมินที่ต้องการดู',
        input: 'select',
        inputOptions: {
            'student': 'นักเรียนประเมินตนเอง',
            'parent': 'ผู้ปกครองประเมินนักเรียน'
        },
        inputPlaceholder: 'เลือกบทบาท...',
        showCancelButton: true,
        confirmButtonText: 'ตกลง',
        cancelButtonText: 'ยกเลิก'
    });

    // ถ้าเด็กเลือกแล้วกดตกลง
    if (role) {
        activeRole = role;
        await checkExistingAssessment(); // ใช้ฟังก์ชันเช็คประวัติที่เรามีอยู่แล้วดึงข้อมูลมาให้เลย
    }
}

function renderQuestion() {
    const q = sdqQuestions[currentQIndex];
    $('#questionText').text(`${q.id}. ${q.text}`);

    const percent = Math.round(((currentQIndex) / 25) * 100);
    $('#progressBar').css('width', `${percent}%`);
    $('#progressText').text(`ข้อที่ ${currentQIndex + 1} / 25`);
    $('#percentText').text(`${percent}%`);

    $('input[name="sdqChoice"]').prop('checked', false);
    if (answers[q.id] !== undefined) {
        $(`#choice${answers[q.id]}`).prop('checked', true);
        $('#btnNext').removeClass('hidden');
    } else {
        $('#btnNext').addClass('hidden');
    }

    $('#btnPrev').toggleClass('hidden', currentQIndex === 0);

    if (currentQIndex === 24 && answers[q.id] !== undefined) {
        $('#btnSubmit').removeClass('hidden');
        $('#btnNext').addClass('hidden');
    } else {
        $('#btnSubmit').addClass('hidden');
    }
}

function selectAnswer(val) {
    const currentQ = sdqQuestions[currentQIndex];
    answers[currentQ.id] = parseInt(val);

    // อัปเดต UI ทันที
    $('#btnNext').removeClass('hidden');

    if (currentQIndex === 24) {
        $('#btnSubmit').removeClass('hidden');
        $('#btnNext').addClass('hidden');
    } else {
        // เลื่อนไปข้อถัดไปอัตโนมัติหลังจากเลือกคำตอบ
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

    Swal.fire({
        title: 'กำลังคำนวณและบันทึกผล...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    let scores = { emotional: 0, conduct: 0, hyper: 0, peer: 0, prosocial: 0 };

    sdqQuestions.forEach(q => {
        let val = parseInt(answers[q.id]) || 0;
        if (q.reverse) {
            val = val === 0 ? 2 : (val === 2 ? 0 : 1);
        }
        scores[q.cat] += val;
    });

    const totalScore = scores.emotional + scores.conduct + scores.hyper + scores.peer;

    const payload = {
        student_id: currentUser.id,
        enrollment_id: currentEnrollment?.id,
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

    for (let i = 1; i <= 25; i++) {
        payload[`q${i}`] = answers[i] || 0;
    }

    const { error } = await db.from('sdq_assessments').upsert(payload, {
        onConflict: 'enrollment_id, assessor_type'
    });

    if (!currentEnrollment?.id) {
        Swal.fire('ผิดพลาด', 'ไม่พบข้อมูลการลงทะเบียนนักเรียน', 'error');
        return;
    }
    payload.enrollment_id = currentEnrollment.id;

    if (error) {
        Swal.fire('Error', 'เกิดข้อผิดพลาด: ' + error.message, 'error');
    } else {
        Swal.close();
        renderResult(payload);
    }
}

function renderResult(data) {
    $('#roleSelection, #sdqForm, #welcomeSection').hide();
    $('#resultView').removeClass('hidden');

    const getRiskLevel = (score, type) => {
        if (type === 'total') return score <= 15 ? ['ปกติ', 'bg-emerald-50 border-emerald-200 text-emerald-700', 'text-emerald-600']
            : score <= 18 ? ['เสี่ยง', 'bg-amber-50 border-amber-200 text-amber-700', 'text-amber-500']
                : ['มีปัญหา', 'bg-rose-50 border-rose-200 text-rose-700', 'text-rose-600'];
        return ['ปกติ', 'bg-slate-50', 'text-slate-700'];
    };

    const totalStatus = getRiskLevel(data.total_difficulty_score, 'total');

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

    $('#totalScoreCard').attr('class', `mt-6 p-6 rounded-2xl border-2 text-center ${totalStatus[1]}`);
    $('#totalScoreCard').html(`
        <div class="text-sm font-bold opacity-80 uppercase tracking-wide mb-2">คะแนนรวมความยากลำบาก</div>
        <div class="text-5xl font-black mb-2">${data.total_difficulty_score} <span class="text-xl font-medium opacity-50">/ 40</span></div>
        <div class="inline-block px-4 py-1.5 bg-white/60 rounded-full text-sm font-bold mt-2 shadow-sm ${totalStatus[2]}">
            ผลการประเมิน: ${totalStatus[0]}
        </div>
        <div class="text-xs text-slate-400 mt-3">*ประเมินในฐานะ: ${data.assessor_type === 'parent' ? 'ผู้ปกครอง' : 'นักเรียน'}</div>
    `);
}

function exportToPDF() {
    const element = document.getElementById('printArea');
    const roleName = activeRole === 'parent' ? 'Parent' : 'Student';
    const opt = {
        margin: [0.5, 0.5, 0.5, 0.5], // Top, Left, Bottom, Right
        filename: `SDQ_${currentUser.first_name}_${roleName}_${currentSchoolInfo.current_academic_year}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
}