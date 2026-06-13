/**
 * eq_student.js — เวอร์ชันสมบูรณ์ (14 มิ.ย. 2569)
 * - แสดงผลหน้าเว็บ 3 แถว (สรุป, กราฟ, การ์ด 3 กลุ่ม)
 * - พิมพ์ PDF เรียบร้อย ใช้ table, รอโหลดรูป, margin พอดี
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

/* ---------- INITIAL LOAD ---------- */
window.addEventListener('load', async () => {
    Swal.fire({ title: 'กำลังเตรียมระบบประเมิน...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    try {
        const { data: { session } } = await db.auth.getSession();
        if (!session) throw new Error('No session');
        const sidFromEmail = session.user.email.split('@')[0];
        const { data: si } = await db.from('core_school_info').select('*').single();
        schoolInfo = si;
        const { data: std, error: stdError } = await db.from('core_students')
            .select(`*, student_enrollments ( classroom_id )`)
            .eq('student_id_card', sidFromEmail).single();
        if (stdError || !std) throw new Error('Student not found');
        currentStudent = std;
        currentClassroomId = std.student_enrollments?.[0]?.classroom_id;
        document.getElementById('std-name').textContent = `${std.prefix || ''}${std.first_name} ${std.last_name}`;
        if (si) {
            const { data: setting } = await db.from('eq_settings')
                .select('delay_seconds')
                .eq('academic_year', si.current_academic_year)
                .eq('semester', si.current_semester)
                .maybeSingle();
            if (setting) delaySeconds = setting.delay_seconds;
        }
        const existingData = await checkExistingResult();
        if (existingData) {
            Swal.close();
            showResult(existingData);
            return;
        }
        const { data: draft } = await db.from('eq_drafts')
            .select('*')
            .eq('student_id', currentStudent.id)
            .eq('academic_year', si.current_academic_year)
            .eq('semester', si.current_semester)
            .maybeSingle();
        if (draft && draft.answers) {
            answers = draft.answers;
            currentQ = draft.current_question || 1;
        }
        document.getElementById('view-loading').classList.add('hidden');
        document.getElementById('view-assessment').classList.remove('hidden');
        renderQuestion();
        Swal.close();
    } catch (err) {
        console.error(err);
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
});

async function checkExistingResult() {
    if (!currentStudent || !schoolInfo) return null;
    const { data, error } = await db.from('eq_assessments')
        .select('*')
        .eq('student_id', currentStudent.id)
        .eq('academic_year', schoolInfo.current_academic_year)
        .eq('semester', schoolInfo.current_semester)
        .maybeSingle();
    if (error) {
        console.error(error);
        return null;
    }
    return data;
}

/* ---------- ฟังก์ชันทำแบบประเมิน (52 ข้อ, timer) ---------- */
function renderQuestion() {
    const q = EQ_QUESTIONS_V2[currentQ - 1];
    const dim = EQ_DIMENSIONS_V2.find(d => d.key === q.dim);
    document.getElementById('q-counter').textContent = `${currentQ} / 52`;
    document.getElementById('progress-bar').style.width = `${((currentQ - 1) / 52) * 100}%`;
    document.getElementById('q-dim-label').textContent = `ด้าน${dim?.label || ''}`;
    document.getElementById('q-text').textContent = q.text;

    const container = document.getElementById('choices-container');
    container.innerHTML = EQ_CHOICES.map(ch => `
        <button data-val="${ch.value}" onclick="selectChoice(${ch.value})"
            class="choice-btn w-full flex items-center gap-4 p-4 rounded-2xl bg-slate-50 text-left transition-all hover:bg-blue-50">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center font-bold flex-shrink-0" style="background:${ch.color}20; color:${ch.color}">
                ${ch.value}
            </div>
            <span class="font-semibold text-slate-700">${ch.label}</span>
        </button>
    `).join('');

    const prev = answers[`q${currentQ}`];
    if (prev) {
        document.querySelectorAll('.choice-btn').forEach(btn => {
            if (parseInt(btn.dataset.val) === prev) btn.classList.add('ring-2', 'ring-blue-500');
        });
    }
    document.getElementById('btn-prev').disabled = currentQ <= 1;
    if (prev) {
        canProceed = true;
        enableNext();
    } else {
        canProceed = false;
        document.getElementById('btn-next').disabled = true;
        startTimer();
    }
}

function startTimer() {
    clearInterval(timerInterval);
    timerSeconds = delaySeconds;
    const section = document.getElementById('timer-section');
    const countEl = document.getElementById('timer-count');
    if (!section || !countEl) return;
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
    const btn = document.getElementById('btn-next');
    if (btn) btn.disabled = false;
}

function selectChoice(val) {
    answers[`q${currentQ}`] = val;
    document.querySelectorAll('.choice-btn').forEach(btn => {
        const v = parseInt(btn.dataset.val);
        if (v === val) btn.classList.add('ring-2', 'ring-blue-500');
        else btn.classList.remove('ring-2', 'ring-blue-500');
    });
    if (canProceed) enableNext();
    saveDraft();
}

function prevQuestion() {
    if (currentQ <= 1) return;
    clearInterval(timerInterval);
    currentQ--;
    renderQuestion();
}

async function nextQuestion() {
    if (!answers[`q${currentQ}`]) {
        return Swal.fire({ toast: true, position: 'top', icon: 'warning', title: 'กรุณาเลือกคำตอบก่อน', timer: 2000, showConfirmButton: false });
    }
    clearInterval(timerInterval);
    if (currentQ === 52) {
        await submitAssessment();
        return;
    }
    currentQ++;
    renderQuestion();
    saveDraft();
}

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

async function submitAssessment() {
    const answered = Object.keys(answers).length;
    if (answered < 52) {
        return Swal.fire('ยังไม่ครบ', `ตอบแล้ว ${answered}/52 ข้อ`, 'warning');
    }
    Swal.fire({ title: 'กำลังบันทึกผล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    const payload = buildAssessmentPayloadV2(
        currentStudent.id, currentClassroomId,
        schoolInfo.current_academic_year, schoolInfo.current_semester,
        answers
    );
    const { data, error } = await db.from('eq_assessments')
        .upsert(payload, { onConflict: 'student_id,academic_year,semester' })
        .select().single();
    if (error) {
        Swal.fire('บันทึกไม่สำเร็จ', error.message, 'error');
        return;
    }
    await db.from('eq_drafts').delete()
        .eq('student_id', currentStudent.id)
        .eq('academic_year', schoolInfo.current_academic_year)
        .eq('semester', schoolInfo.current_semester);
    Swal.close();
    showResult(data);
}

/* ---------- แสดงผลหน้าเว็บ (layout 3 แถว) ---------- */
function showResult(data) {
    document.getElementById('view-loading').classList.add('hidden');
    document.getElementById('view-assessment').classList.add('hidden');
    document.getElementById('view-result').classList.remove('hidden');

    const fullName = `${currentStudent.prefix || ''}${currentStudent.first_name} ${currentStudent.last_name}`;
    document.getElementById('res-name').innerText = fullName;

    const totalLevel = data.level_total;
    const totalColor = totalLevel === 'สูงกว่าเกณฑ์' ? 'bg-green-500 text-white' :
        totalLevel === 'เกณฑ์ปกติ' ? 'bg-blue-500 text-white' : 'bg-red-500 text-white';
    const badge = document.getElementById('res-total-badge');
    if (badge) badge.className = `mt-4 inline-flex items-center gap-2 px-6 py-3 rounded-2xl ${totalColor}`;
    document.getElementById('res-total-score').innerText = data.score_total;
    document.getElementById('res-total-level').innerText = `ระดับ: ${totalLevel}`;

    const subDims = [
        { label: '1.1 ควบคุมตนเอง', score: data.score_self_control, max: 24, level: data.level_self_control, group: 'ดี' },
        { label: '1.2 เห็นใจผู้อื่น', score: data.score_empathy, max: 24, level: data.level_empathy, group: 'ดี' },
        { label: '1.3 รับผิดชอบ', score: data.score_responsibility, max: 24, level: data.level_responsibility, group: 'ดี' },
        { label: '2.1 มีแรงจูงใจ', score: data.score_motivation, max: 24, level: data.level_motivation, group: 'เก่ง' },
        { label: '2.2 ตัดสินใจและแก้ปัญหา', score: data.score_problem_solving, max: 24, level: data.level_problem_solving, group: 'เก่ง' },
        { label: '2.3 สัมพันธภาพ', score: data.score_relationship, max: 24, level: data.level_relationship, group: 'เก่ง' },
        { label: '3.1 ภูมิใจตนเอง', score: data.score_self_esteem, max: 16, level: data.level_self_esteem, group: 'สุข' },
        { label: '3.2 พอใจชีวิต', score: data.score_life_satisfaction, max: 24, level: data.level_life_satisfaction, group: 'สุข' },
        { label: '3.3 สุขสงบทางใจ', score: data.score_peace_of_mind, max: 24, level: data.level_peace_of_mind, group: 'สุข' }
    ];

    // กราฟแท่ง
    const chartDiv = document.getElementById('bar-chart');
    if (chartDiv) {
        chartDiv.innerHTML = subDims.map(d => {
            const percent = (d.score / d.max) * 100;
            const barColor = d.level === 'สูงกว่าเกณฑ์' ? '#10b981' : (d.level === 'เกณฑ์ปกติ' ? '#3b82f6' : '#ef4444');
            return `
                <div>
                    <div class="flex justify-between text-sm mb-1">
                        <span><span class="font-semibold">${d.label}</span> (${d.score}/${d.max})</span>
                        <span>${Math.round(percent)}%</span>
                    </div>
                    <div class="w-full bg-slate-200 rounded-full h-3">
                        <div class="h-3 rounded-full" style="width: ${percent}%; background-color: ${barColor};"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // 3 การ์ดกลุ่ม
    const groups = [
        {
            name: 'ด้านดี', color: '#10b981', score: data.score_good, max: 72, level: data.level_good,
            items: subDims.filter(d => d.group === 'ดี')
        },
        {
            name: 'ด้านเก่ง', color: '#3b82f6', score: data.score_skill, max: 72, level: data.level_skill,
            items: subDims.filter(d => d.group === 'เก่ง')
        },
        {
            name: 'ด้านสุข', color: '#f59e0b', score: data.score_happy, max: 64, level: data.level_happy,
            items: subDims.filter(d => d.group === 'สุข')
        }
    ];

    const groupsContainer = document.getElementById('groups-container');
    if (groupsContainer) {
        groupsContainer.innerHTML = groups.map(g => {
            const levelClass = g.level === 'สูงกว่าเกณฑ์' ? 'bg-green-100 text-green-700' :
                g.level === 'เกณฑ์ปกติ' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700';
            return `
                <div class="glass rounded-2xl p-5 border-l-8 shadow-md" style="border-left-color: ${g.color}">
                    <div class="flex justify-between items-center mb-3">
                        <h3 class="font-bold text-xl text-slate-800">${g.name}</h3>
                        <span class="text-xs px-2 py-0.5 rounded-full ${levelClass}">${g.level}</span>
                    </div>
                    <p class="text-3xl font-black text-slate-800">${g.score} <span class="text-base font-normal text-slate-400">/ ${g.max}</span></p>
                    <div class="w-full bg-slate-200 rounded-full h-2.5 mt-2 mb-4">
                        <div class="h-2.5 rounded-full" style="width:${(g.score / g.max) * 100}%; background:${g.color}"></div>
                    </div>
                    <div class="grid grid-cols-1 gap-2 mt-3">
                        ${g.items.map(item => {
                const subLevelClass = item.level === 'สูงกว่าเกณฑ์' ? 'text-green-700' :
                    item.level === 'เกณฑ์ปกติ' ? 'text-blue-700' : 'text-red-700';
                return `
                                <div class="bg-slate-50 rounded-xl p-2 flex justify-between items-center">
                                    <span class="text-sm font-medium">${item.label}</span>
                                    <div class="text-right">
                                        <span class="font-bold">${item.score}/${item.max}</span>
                                        <span class="text-xs ml-1 ${subLevelClass}">(${item.level})</span>
                                    </div>
                                </div>
                            `;
            }).join('')}
                    </div>
                </div>
            `;
        }).join('');
    }
}

/* ---------- พิมพ์ PDF (สมบูรณ์, รอโหลดรูป, margin 0.5cm, ใช้ table) ---------- */
async function printResult() {
    Swal.fire({ title: 'กำลังสร้างไฟล์ PDF...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const { data: assessment, error } = await db.from('eq_assessments')
            .select('*')
            .eq('student_id', currentStudent.id)
            .eq('academic_year', schoolInfo.current_academic_year)
            .eq('semester', schoolInfo.current_semester)
            .single();
        if (error || !assessment) throw new Error('ไม่พบข้อมูลการประเมิน');

        // ดึงข้อมูลครูที่ปรึกษา
        let adviser1 = '-', adviser2 = '-';
        if (assessment.classroom_id) {
            const { data: cls } = await db.from('core_classrooms')
                .select(`
                    adviser1:core_personnel!adviser_id_1(prefix, first_name, last_name),
                    adviser2:core_personnel!adviser_id_2(prefix, first_name, last_name)
                `)
                .eq('id', assessment.classroom_id)
                .single();
            if (cls) {
                if (cls.adviser1) adviser1 = `${cls.adviser1.prefix || ''}${cls.adviser1.first_name} ${cls.adviser1.last_name}`;
                if (cls.adviser2) adviser2 = `${cls.adviser2.prefix || ''}${cls.adviser2.first_name} ${cls.adviser2.last_name}`;
            }
        }

        const schoolLogo = schoolInfo?.logo_url || 'https://i.ibb.co/94wLv5v/WRK-PNG-200px.png';
        const schoolName = schoolInfo?.school_name || 'โรงเรียนวัดไร่ขิงวิทยา';
        const academicYear = assessment.academic_year;
        const semester = assessment.semester;
        const fullName = `${currentStudent.prefix || ''}${currentStudent.first_name} ${currentStudent.last_name}`;
        const avatarUrl = currentStudent.avatar_students_url || null;

        Swal.close();
        generateFullPDF(assessment, schoolName, academicYear, semester, adviser1, adviser2, schoolLogo, fullName, avatarUrl);
    } catch (err) {
        Swal.close();
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
}

function generateFullPDF(assessment, schoolName, academicYear, semester, adviser1, adviser2, logoUrl, fullName, avatarUrl) {
    const subDims = [
        { label: '1.1 ควบคุมตนเอง', score: assessment.score_self_control, max: 24, level: assessment.level_self_control, group: 'ดี' },
        { label: '1.2 เห็นใจผู้อื่น', score: assessment.score_empathy, max: 24, level: assessment.level_empathy, group: 'ดี' },
        { label: '1.3 รับผิดชอบ', score: assessment.score_responsibility, max: 24, level: assessment.level_responsibility, group: 'ดี' },
        { label: '2.1 มีแรงจูงใจ', score: assessment.score_motivation, max: 24, level: assessment.level_motivation, group: 'เก่ง' },
        { label: '2.2 ตัดสินใจและแก้ปัญหา', score: assessment.score_problem_solving, max: 24, level: assessment.level_problem_solving, group: 'เก่ง' },
        { label: '2.3 สัมพันธภาพ', score: assessment.score_relationship, max: 24, level: assessment.level_relationship, group: 'เก่ง' },
        { label: '3.1 ภูมิใจตนเอง', score: assessment.score_self_esteem, max: 16, level: assessment.level_self_esteem, group: 'สุข' },
        { label: '3.2 พอใจชีวิต', score: assessment.score_life_satisfaction, max: 24, level: assessment.level_life_satisfaction, group: 'สุข' },
        { label: '3.3 สุขสงบทางใจ', score: assessment.score_peace_of_mind, max: 24, level: assessment.level_peace_of_mind, group: 'สุข' }
    ];

    const avatarHtml = avatarUrl 
        ? `<img src="${avatarUrl}" style="width:60px; height:60px; border-radius:50%; object-fit:cover; border:1px solid #cbd5e1;" crossorigin="anonymous">`
        : `<div style="width:60px; height:60px; border-radius:50%; background:#e2e8f0; display:flex; align-items:center; justify-content:center; font-size:24px; color:#94a3b8;"><i class="fas fa-user"></i></div>`;

    const html = `<!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><title>EQ Report</title>
    <style>
        @page { margin: 0.5cm 0.5cm 1.2cm 0.5cm; }
        body { font-family: 'Sarabun', 'Anuphan', sans-serif; font-size: 13px; color: #1e293b; background: white; margin: 0; padding: 0; }
        .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #312e81; padding-bottom: 8px; margin-bottom: 15px; }
        .logo-area { display: flex; align-items: center; gap: 12px; }
        .logo { height: 50px; width: auto; }
        .school-title { margin: 0; color: #312e81; font-size: 18px; font-weight: bold; }
        .school-sub { margin: 2px 0 0; font-size: 11px; color: #475569; }
        .info-area { text-align: right; font-size: 12px; }
        .student-card { background: #f8fafc; border-radius: 8px; padding: 10px; margin-bottom: 15px; display: flex; align-items: center; gap: 15px; }
        .student-details { flex: 1; }
        .student-avatar { flex-shrink: 0; }
        .total-card { text-align: center; background: #fef9e3; border-radius: 12px; padding: 12px; margin-bottom: 20px; }
        .total-score { font-size: 28px; font-weight: 900; margin: 0; }
        .total-level { font-size: 14px; font-weight: bold; margin-top: 5px; }
        .chart-title { font-size: 16px; font-weight: bold; margin: 15px 0 10px; }
        .bar-item { margin-bottom: 10px; }
        .bar-label { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 3px; }
        .bar-bg { background: #e2e8f0; border-radius: 20px; height: 10px; width: 100%; }
        .bar-fill { height: 10px; border-radius: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; vertical-align: top; }
        th { background: #312e81; color: white; }
        .sub-item { margin-bottom: 5px; }
        .footer { font-size: 9px; text-align: center; color: #94a3b8; margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 8px; }
        body { margin: 0; padding: 0; }
        .footer { margin-top: 15px; padding-top: 6px; font-size: 8px; page-break-inside: avoid; }
        table { page-break-inside: avoid; }
    </style>
    </head>
    <body>
    <div class="header">
        <div class="logo-area"><img class="logo" src="${logoUrl}" crossorigin="anonymous"><div><div class="school-title">${schoolName}</div><div class="school-sub">รายงานผลการประเมินความฉลาดทางอารมณ์ (EQ)</div></div></div>
        <div class="info-area"><div><b>ภาคเรียนที่ ${semester}</b> ปีการศึกษา ${academicYear}</div><div>ครูที่ปรึกษา: ${adviser1} ${adviser2 !== '-' ? ' / ' + adviser2 : ''}</div></div>
    </div>
    <div class="student-card">
        <div class="student-avatar">${avatarHtml}</div>
        <div class="student-details"><b>ชื่อ-สกุล:</b> ${fullName}<br><span style="font-size:12px;color:#64748b">วันที่ประเมิน: ${new Date(assessment.completed_at || new Date()).toLocaleDateString('th-TH')}</span></div>
    </div>
    <div class="total-card"><div class="total-score" style="color:${assessment.level_total === 'สูงกว่าเกณฑ์' ? '#15803d' : (assessment.level_total === 'เกณฑ์ปกติ' ? '#1d4ed8' : '#b91c1c')}">${assessment.score_total} <span style="font-size:14px;font-weight:normal;">/ 208 คะแนน</span></div><div class="total-level">ระดับรวม: ${assessment.level_total}</div></div>
    <div class="chart-title">📊 กราฟแสดงคะแนนรายด้านย่อย</div>
    ${subDims.map(d => {
        const percent = (d.score / d.max) * 100;
        const barColor = d.level === 'สูงกว่าเกณฑ์' ? '#10b981' : (d.level === 'เกณฑ์ปกติ' ? '#3b82f6' : '#ef4444');
        return `<div class="bar-item"><div class="bar-label"><span><b>${d.label}</b> (${d.score}/${d.max})</span><span>${Math.round(percent)}%</span></div><div class="bar-bg"><div class="bar-fill" style="width:${percent}%; background:${barColor};"></div></div></div>`;
    }).join('')}
    
    <table>
        <thead><tr><th>ด้าน</th><th>คะแนนรวม</th><th>ระดับ</th><th>รายละเอียดด้านย่อย (คะแนน)</th></tr></thead>
        <tbody>
            ${['ดี', 'เก่ง', 'สุข'].map(groupName => {
                const items = subDims.filter(d => d.group === groupName);
                const groupScore = items.reduce((s, i) => s + i.score, 0);
                const groupMax = items.reduce((s, i) => s + i.max, 0);
                const groupLevel = (groupName === 'ดี' ? assessment.level_good : (groupName === 'เก่ง' ? assessment.level_skill : assessment.level_happy));
                const details = items.map(it => `<div class="sub-item"><strong>${it.label}</strong> ${it.score}/${it.max} (${it.level})</div>`).join('');
                return `<tr><td style="font-weight:bold">ด้าน${groupName}</td><td style="text-align:center">${groupScore}/${groupMax}</td><td style="text-align:center">${groupLevel}</td><td>${details}</td></tr>`;
            }).join('')}
        </tbody>
    </table>
    <div class="footer">ระบบ WRK School Management System | EQ แบบประเมินกรมสุขภาพจิต (อายุ 12-17 ปี)</div>
    </body></html>`;

    const element = document.createElement('div');
    element.innerHTML = html;

    const images = element.querySelectorAll('img');
    if (images.length === 0) {
        generateStudentPdfNow(element, fullName);
    } else {
        let loaded = 0;
        images.forEach(img => {
            if (img.complete) {
                loaded++;
                if (loaded === images.length) generateStudentPdfNow(element, fullName);
            } else {
                img.addEventListener('load', () => {
                    loaded++;
                    if (loaded === images.length) generateStudentPdfNow(element, fullName);
                });
                img.addEventListener('error', () => {
                    loaded++;
                    if (loaded === images.length) generateStudentPdfNow(element, fullName);
                });
            }
        });
    }
}

function generateStudentPdfNow(element, fullName) {
    html2pdf().set({
        margin: [0.5, 0.5, 1.2, 0.5],
        filename: `EQ_${fullName}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF: { unit: 'cm', format: 'a4', orientation: 'portrait' }
    }).from(element).save();
}

async function logout() {
    const result = await Swal.fire({
        title: 'ออกจากระบบ?', icon: 'question', showCancelButton: true,
        cancelButtonText: 'ยกเลิก', confirmButtonText: 'ออกจากระบบ'
    });
    if (result.isConfirmed) {
        await db.auth.signOut();
        window.location.replace('login.html');
    }
}