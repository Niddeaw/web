/**
 * eq_student.js — ระบบประเมิน EQ สำหรับนักเรียน
 */

let currentStudent = null;
let currentClassroomId = null;
let schoolInfo = null;
let answers = {};
let currentQ = 1;
let timerInterval = null;
let timerSeconds = EQ_DELAY_DEFAULT;
let canProceed = false;
let delaySeconds = EQ_DELAY_DEFAULT;

/* ── INIT ─────────────────────────────────────────── */
window.addEventListener('load', async () => {
    // รับ student จาก localStorage (จาก login_student.html)
    const studentId = localStorage.getItem('student_id');
    const studentName = localStorage.getItem('student_name');

    if (!studentId) {
        Swal.fire('กรุณาเข้าสู่ระบบ', '', 'warning').then(() => window.location.href = 'login.html');
        return;
    }

    document.getElementById('std-name').textContent = studentName || '';

    // โหลด school info
    const { data: si } = await db.from('core_school_info').select('*').single();
    schoolInfo = si;

    // โหลด delay setting
    if (si) {
        const { data: setting } = await db.from('eq_settings')
            .select('delay_seconds')
            .eq('academic_year', si.current_academic_year)
            .eq('semester', si.current_semester)
            .maybeSingle();
        if (setting) delaySeconds = setting.delay_seconds;
    }

    // โหลดข้อมูลนักเรียน
    const { data: std } = await db.from('core_students')
        .select('id, prefix, first_name, last_name')
        .eq('id', studentId).single();
    currentStudent = std;

    // หา classroom
    if (si) {
        const { data: enroll } = await db.from('student_enrollments')
            .select('classroom_id')
            .eq('student_id', studentId)
            .maybeSingle();
        currentClassroomId = enroll?.classroom_id || null;
    }

    // ตรวจสอบว่าทำเสร็จแล้วหรือยัง
    if (si) {
        const { data: done } = await db.from('eq_assessments')
            .select('*')
            .eq('student_id', studentId)
            .eq('academic_year', si.current_academic_year)
            .eq('semester', si.current_semester)
            .maybeSingle();

        if (done) {
            showResult(done);
            return;
        }

        // ตรวจสอบฉบับร่าง
        const { data: draft } = await db.from('eq_drafts')
            .select('*')
            .eq('student_id', studentId)
            .eq('academic_year', si.current_academic_year)
            .eq('semester', si.current_semester)
            .maybeSingle();

        if (draft && Object.keys(draft.answers || {}).length > 0) {
            const cont = await Swal.fire({
                title: 'ทำค้างไว้',
                html: `<p class="text-sm">คุณทำค้างไว้ถึงข้อที่ <b class="text-indigo-600">${draft.current_question}</b><br>ต้องการทำต่อจากข้อเดิมไหม?</p>`,
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'ทำต่อจากข้อเดิม',
                cancelButtonText: 'เริ่มใหม่',
                confirmButtonColor: '#6366f1',
            });
            if (cont.isConfirmed) {
                answers = draft.answers || {};
                currentQ = draft.current_question || 1;
            } else {
                // ลบ draft เก่า
                await db.from('eq_drafts').delete()
                    .eq('student_id', studentId)
                    .eq('academic_year', si.current_academic_year)
                    .eq('semester', si.current_semester);
                answers = {}; currentQ = 1;
            }
        }
    }

    document.getElementById('view-loading').classList.add('hidden');
    document.getElementById('view-assessment').classList.remove('hidden');
    renderQuestion();
});

/* ── RENDER QUESTION ────────────────────────────────── */
function renderQuestion() {
    const q = EQ_QUESTIONS[currentQ - 1];
    const dim = EQ_DIMENSIONS.find(d => d.key === q.dim);

    document.getElementById('q-counter').textContent = `${currentQ} / 52`;
    document.getElementById('progress-bar').style.width = `${((currentQ - 1) / 52) * 100}%`;
    document.getElementById('q-dim-label').textContent = `ด้าน${dim?.label || ''}`;
    document.getElementById('q-text').textContent = q.text;

    // highlight ถ้าเคยตอบแล้ว
    const prev = answers[`q${currentQ}`];
    document.querySelectorAll('.choice-btn').forEach(btn => {
        const v = parseInt(btn.dataset.val);
        btn.className = `choice-btn w-full flex items-center gap-4 p-4 rounded-2xl bg-slate-50 text-left ${prev === v ? `selected-${v}` : ''}`;
    });

    // prev button
    document.getElementById('btn-prev').disabled = currentQ <= 1;

    // timer
    if (prev) {
        // ตอบแล้ว ไม่ต้องรอ
        canProceed = true;
        enableNext();
    } else {
        canProceed = false;
        document.getElementById('btn-next').disabled = true;
        startTimer();
    }
}

/* ── TIMER ──────────────────────────────────────────── */
function startTimer() {
    clearInterval(timerInterval);
    timerSeconds = delaySeconds;
    const section = document.getElementById('timer-section');
    const countEl = document.getElementById('timer-count');
    const textEl = document.getElementById('timer-text');
    section.classList.remove('hidden');
    countEl.textContent = timerSeconds;

    timerInterval = setInterval(() => {
        timerSeconds--;
        countEl.textContent = timerSeconds;
        if (timerSeconds <= 0) {
            clearInterval(timerInterval);
            canProceed = true;
            section.classList.add('hidden');
            if (answers[`q${currentQ}`]) enableNext();
        }
    }, 1000);
}

function enableNext() {
    document.getElementById('btn-next').disabled = false;
}

/* ── SELECT CHOICE ─────────────────────────────────── */
function selectChoice(val) {
    answers[`q${currentQ}`] = val;
    document.querySelectorAll('.choice-btn').forEach(btn => {
        const v = parseInt(btn.dataset.val);
        btn.className = `choice-btn w-full flex items-center gap-4 p-4 rounded-2xl bg-slate-50 text-left ${v === val ? `selected-${v}` : ''}`;
    });
    if (canProceed) enableNext();
    saveDraft();
}

/* ── NAVIGATION ─────────────────────────────────────── */
function prevQuestion() {
    if (currentQ <= 1) return;
    clearInterval(timerInterval);
    currentQ--;
    document.getElementById('view-assessment').classList.add('fade-up');
    setTimeout(() => document.getElementById('view-assessment').classList.remove('fade-up'), 400);
    renderQuestion();
}

async function nextQuestion() {
    if (!answers[`q${currentQ}`]) {
        return Swal.fire({ toast: true, position: 'top', icon: 'warning', title: 'กรุณาเลือกคำตอบก่อน', timer: 2000, showConfirmButton: false });
    }
    clearInterval(timerInterval);

    if (currentQ === 52) {
        // ส่งคำตอบ
        await submitAssessment();
        return;
    }
    currentQ++;
    renderQuestion();
    saveDraft();
}

/* ── SAVE DRAFT ─────────────────────────────────────── */
async function saveDraft() {
    if (!currentStudent || !schoolInfo) return;
    await db.from('eq_drafts').upsert({
        student_id: currentStudent.id,
        academic_year: schoolInfo.current_academic_year,
        semester: schoolInfo.current_semester,
        answers: answers,
        current_question: currentQ,
        updated_at: new Date().toISOString(),
    }, { onConflict: 'student_id,academic_year,semester' });
}

/* ── SUBMIT ─────────────────────────────────────────── */
async function submitAssessment() {
    const answered = Object.keys(answers).length;
    if (answered < 52) {
        return Swal.fire('ยังไม่ครบ', `ตอบแล้ว ${answered}/52 ข้อ`, 'warning');
    }

    Swal.fire({ title: 'กำลังบันทึกผล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const payload = buildAssessmentPayload(
        currentStudent.id, currentClassroomId,
        schoolInfo.current_academic_year, schoolInfo.current_semester,
        answers
    );

    const { data, error } = await db.from('eq_assessments')
        .upsert(payload, { onConflict: 'student_id,academic_year,semester' })
        .select().single();

    if (error) { Swal.fire('บันทึกไม่สำเร็จ', error.message, 'error'); return; }

    // ลบ draft
    await db.from('eq_drafts').delete()
        .eq('student_id', currentStudent.id)
        .eq('academic_year', schoolInfo.current_academic_year)
        .eq('semester', schoolInfo.current_semester);

    Swal.close();
    showResult(data);
}

/* ── SHOW RESULT ─────────────────────────────────────── */
function showResult(data) {
    document.getElementById('view-loading').classList.add('hidden');
    document.getElementById('view-assessment').classList.add('hidden');
    document.getElementById('view-result').classList.remove('hidden');

    const fullName = currentStudent
        ? `${currentStudent.prefix || ''}${currentStudent.first_name} ${currentStudent.last_name}`
        : localStorage.getItem('student_name') || '';

    document.getElementById('res-name').textContent = fullName;

    const totalLevel = data.level_total;
    const totalColor = totalLevel === 'สูงกว่าเกณฑ์' ? 'bg-green-500 text-white' :
                       totalLevel === 'ตามเกณฑ์'     ? 'bg-blue-500 text-white'  : 'bg-red-500 text-white';
    document.getElementById('res-total-badge').className = `mt-4 inline-flex items-center gap-2 px-6 py-3 rounded-2xl ${totalColor}`;
    document.getElementById('res-total-score').textContent = data.score_total;
    document.getElementById('res-total-level').textContent = `ระดับ: ${totalLevel}`;

    // Dimension cards
    const dimEl = document.getElementById('res-dims');
    dimEl.innerHTML = EQ_DIMENSIONS.map(dim => {
        const score = data[`score_${dim.key}`];
        const level = data[`level_${dim.key}`];
        const color = level === 'สูงกว่าเกณฑ์' ? 'border-green-200 bg-green-50' :
                      level === 'ตามเกณฑ์'     ? 'border-blue-200 bg-blue-50'  : 'border-red-200 bg-red-50';
        const textColor = level === 'สูงกว่าเกณฑ์' ? 'text-green-700' :
                          level === 'ตามเกณฑ์'     ? 'text-blue-700'  : 'text-red-700';
        const pct = Math.round(score / dim.maxScore * 100);
        return `<div class="glass border-2 ${color} rounded-2xl p-4">
            <div class="flex items-center gap-2 mb-2">
                <div class="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm" style="background:${dim.color}">
                    <i class="fas ${dim.icon}"></i>
                </div>
                <p class="font-bold text-slate-700 text-sm">${dim.label}</p>
            </div>
            <p class="text-2xl font-black ${textColor}">${score} <span class="text-sm font-normal text-slate-400">/ ${dim.maxScore}</span></p>
            <div class="w-full bg-slate-200 rounded-full h-1.5 mt-2">
                <div class="h-1.5 rounded-full" style="width:${pct}%;background:${dim.color}"></div>
            </div>
            <p class="text-xs font-bold ${textColor} mt-1">${level}</p>
        </div>`;
    }).join('');
}

/* ── PRINT PDF ─────────────────────────────────────── */
async function printResult() {
    Swal.fire({ title: 'กำลังสร้าง PDF...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const studentId = localStorage.getItem('student_id');
    const { data } = await db.from('eq_assessments')
        .select('*').eq('student_id', studentId)
        .eq('academic_year', schoolInfo.current_academic_year)
        .eq('semester', schoolInfo.current_semester).single();

    Swal.close();
    if (!data) return;

    const fullName = currentStudent
        ? `${currentStudent.prefix || ''}${currentStudent.first_name} ${currentStudent.last_name}`
        : localStorage.getItem('student_name');

    generateEQPdf(data, fullName);
}

function generateEQPdf(data, fullName) {
    const dimRows = EQ_DIMENSIONS.map(dim => {
        const score = data[`score_${dim.key}`];
        const level = data[`level_${dim.key}`];
        const color = level === 'สูงกว่าเกณฑ์' ? '#15803d' : level === 'ตามเกณฑ์' ? '#1d4ed8' : '#b91c1c';
        return `<tr style="border-bottom:1px solid #e2e8f0">
            <td style="padding:8px 12px;font-size:13px">${dim.label}</td>
            <td style="padding:8px 12px;text-align:center;font-weight:700">${score} / ${dim.maxScore}</td>
            <td style="padding:8px 12px;text-align:center;color:${color};font-weight:700">${level}</td>
        </tr>`;
    }).join('');

    const html = `<div style="font-family:'Anuphan',sans-serif;padding:30px 40px;max-width:700px;margin:0 auto">
        <div style="text-align:center;margin-bottom:24px">
            <h2 style="font-size:20px;color:#312e81;margin:0">รายงานผลการประเมินความฉลาดทางอารมณ์ (EQ)</h2>
            <p style="color:#64748b;font-size:13px;margin-top:4px">แบบประเมิน EQ กรมสุขภาพจิต (อายุ 12–17 ปี)</p>
        </div>
        <div style="background:#f8fafc;border-radius:12px;padding:16px;margin-bottom:20px">
            <p style="margin:0;font-size:14px"><b>ชื่อ-สกุล:</b> ${fullName}</p>
            <p style="margin:4px 0 0;font-size:13px;color:#64748b">ประเมินเมื่อ: ${new Date(data.completed_at).toLocaleDateString('th-TH', {year:'numeric',month:'long',day:'numeric'})}</p>
        </div>
        <div style="text-align:center;background:${data.level_total==='สูงกว่าเกณฑ์'?'#dcfce7':data.level_total==='ตามเกณฑ์'?'#dbeafe':'#fee2e2'};border-radius:12px;padding:20px;margin-bottom:20px">
            <p style="font-size:28px;font-weight:900;color:${data.level_total==='สูงกว่าเกณฑ์'?'#15803d':data.level_total==='ตามเกณฑ์'?'#1d4ed8':'#b91c1c'};margin:0">${data.score_total} <span style="font-size:16px;font-weight:400;color:#64748b">/ 156 คะแนน</span></p>
            <p style="font-size:15px;font-weight:700;margin:4px 0 0;color:#475569">ระดับ: ${data.level_total}</p>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead><tr style="background:#312e81;color:white">
                <th style="padding:10px 12px;text-align:left;border-radius:8px 0 0 0">ด้าน</th>
                <th style="padding:10px 12px;text-align:center">คะแนน</th>
                <th style="padding:10px 12px;text-align:center;border-radius:0 8px 0 0">ระดับ</th>
            </tr></thead>
            <tbody>${dimRows}</tbody>
        </table>
        <p style="font-size:11px;color:#94a3b8;text-align:center;margin-top:24px">พิมพ์โดยระบบ WRK School Management System</p>
    </div>`;

    const el = document.createElement('div');
    el.innerHTML = html;
    html2pdf().set({
        margin: 5, filename: `EQ_${fullName}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(el).save();
}

async function logout() {
    localStorage.removeItem('student_id');
    localStorage.removeItem('student_name');
    localStorage.removeItem('student_sid');
    window.location.href = 'index.html';
}
