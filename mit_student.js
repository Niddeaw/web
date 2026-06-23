/**
 * mit_student.js — ตรรกะฝั่งนักเรียน (ทำข้อสอบ, แสดงผล, PDF)
 */
let currentStudent = null;
let currentClassroomId = null;
let schoolInfo = null;
let answers = {};
let currentQ = 1;
let timerInterval = null;
let timerSeconds = MI_DELAY_DEFAULT;
let canProceed = false;
let delaySeconds = MI_DELAY_DEFAULT;

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
            const { data: setting } = await db.from('mi_settings')
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
        const { data: draft } = await db.from('mi_drafts')
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
    const { data, error } = await db.from('mi_assessments')
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

function renderQuestion() {
    const q = MI_QUESTIONS[currentQ - 1];
    const dim = MI_DIMENSIONS.find(d => d.key === q.dim);
    document.getElementById('q-counter').textContent = `${currentQ} / 40`;
    document.getElementById('progress-bar').style.width = `${((currentQ - 1) / 40) * 100}%`;
    document.getElementById('q-dim-label').textContent = `ด้าน${dim?.label || ''}`;
    document.getElementById('q-text').textContent = q.text;

    const container = document.getElementById('choices-container');
    container.innerHTML = MI_CHOICES.map(ch => `
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
    if (currentQ === 40) {
        await submitAssessment();
        return;
    }
    currentQ++;
    renderQuestion();
    saveDraft();
}

async function saveDraft() {
    if (!currentStudent || !schoolInfo) return;
    await db.from('mi_drafts').upsert({
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
    if (answered < 40) {
        return Swal.fire('ยังไม่ครบ', `ตอบแล้ว ${answered}/40 ข้อ`, 'warning');
    }
    Swal.fire({ title: 'กำลังบันทึกผล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    const payload = buildAssessmentPayloadMI(
        currentStudent.id, currentClassroomId,
        schoolInfo.current_academic_year, schoolInfo.current_semester,
        answers
    );
    const { data, error } = await db.from('mi_assessments')
        .upsert(payload, { onConflict: 'student_id,academic_year,semester' })
        .select().single();
    if (error) {
        Swal.fire('บันทึกไม่สำเร็จ', error.message, 'error');
        return;
    }
    await db.from('mi_drafts').delete()
        .eq('student_id', currentStudent.id)
        .eq('academic_year', schoolInfo.current_academic_year)
        .eq('semester', schoolInfo.current_semester);
    Swal.close();
    showResult(data);
}

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
    document.getElementById('res-total-level').innerText = `ระดับรวม: ${totalLevel}`;

    const dims = MI_DIMENSIONS.map(d => ({
        key: d.key,
        label: d.label,
        score: data[`score_${d.key}`] || 0,
        max: d.maxScore,
        level: data[`level_${d.key}`] || ''
    }));
    const sorted = [...dims].sort((a,b) => b.score - a.score);
    const top3 = sorted.slice(0, 3);
    document.getElementById('res-top-dim').innerHTML = `🧠 ด้านที่โดดเด่นที่สุด: ${top3.map(d => `${d.label} (${d.score}/${d.max})`).join(' | ')}`;

    const chartDiv = document.getElementById('bar-chart');
    if (chartDiv) {
        chartDiv.innerHTML = dims.map(d => {
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

    const cardsContainer = document.getElementById('top-cards-container');
    if (cardsContainer) {
        cardsContainer.innerHTML = top3.map((d, idx) => {
            const colors = ['#10b981', '#3b82f6', '#f59e0b'];
            const levelClass = d.level === 'สูงกว่าเกณฑ์' ? 'bg-green-100 text-green-700' :
                d.level === 'เกณฑ์ปกติ' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700';
            return `
                <div class="glass rounded-2xl p-5 border-l-8 shadow-md" style="border-left-color: ${colors[idx]}">
                    <div class="flex justify-between items-center mb-3">
                        <h3 class="font-bold text-xl text-slate-800">อันดับ ${idx+1}</h3>
                        <span class="text-xs px-2 py-0.5 rounded-full ${levelClass}">${d.level}</span>
                    </div>
                    <p class="text-lg font-bold text-slate-800">${d.label}</p>
                    <p class="text-3xl font-black text-slate-800">${d.score} <span class="text-base font-normal text-slate-400">/ ${d.max}</span></p>
                    <div class="w-full bg-slate-200 rounded-full h-2.5 mt-2">
                        <div class="h-2.5 rounded-full" style="width:${(d.score/d.max)*100}%; background:${colors[idx]}"></div>
                    </div>
                </div>
            `;
        }).join('');
    }
}

async function printResult() {
    Swal.fire({ title: 'กำลังสร้างไฟล์ PDF...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const { data: assessment, error } = await db.from('mi_assessments')
            .select('*')
            .eq('student_id', currentStudent.id)
            .eq('academic_year', schoolInfo.current_academic_year)
            .eq('semester', schoolInfo.current_semester)
            .single();
        if (error || !assessment) throw new Error('ไม่พบข้อมูลการประเมิน');

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
        generateFullPDFMI(assessment, schoolName, academicYear, semester, adviser1, adviser2, schoolLogo, fullName, avatarUrl);
    } catch (err) {
        Swal.close();
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
}

function generateFullPDFMI(assessment, schoolName, academicYear, semester, adviser1, adviser2, logoUrl, fullName, avatarUrl) {
    const dims = MI_DIMENSIONS.map(d => ({
        key: d.key,
        label: d.label,
        score: assessment[`score_${d.key}`] || 0,
        max: d.maxScore,
        level: assessment[`level_${d.key}`] || ''
    }));

    const avatarHtml = avatarUrl 
        ? `<img src="${avatarUrl}" style="width:60px; height:60px; border-radius:50%; object-fit:cover; border:1px solid #cbd5e1;" crossorigin="anonymous">`
        : `<div style="width:60px; height:60px; border-radius:50%; background:#e2e8f0; display:flex; align-items:center; justify-content:center; font-size:24px; color:#94a3b8;"><i class="fas fa-user"></i></div>`;

    const html = `<!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><title>MI Report</title>
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
        .footer { font-size: 9px; text-align: center; color: #94a3b8; margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 8px; }
        body { margin: 0; padding: 0; }
        .footer { margin-top: 15px; padding-top: 6px; font-size: 8px; page-break-inside: avoid; }
        table { page-break-inside: avoid; }
    </style>
    </head>
    <body>
    <div class="header">
        <div class="logo-area"><img class="logo" src="${logoUrl}" crossorigin="anonymous"><div><div class="school-title">${schoolName}</div><div class="school-sub">รายงานผลการประเมินพหุปัญญา (MI)</div></div></div>
        <div class="info-area"><div><b>ภาคเรียนที่ ${semester}</b> ปีการศึกษา ${academicYear}</div><div>ครูที่ปรึกษา: ${adviser1} ${adviser2 !== '-' ? ' / ' + adviser2 : ''}</div></div>
    </div>
    <div class="student-card">
        <div class="student-avatar">${avatarHtml}</div>
        <div class="student-details"><b>ชื่อ-สกุล:</b> ${fullName}<br><span style="font-size:12px;color:#64748b">วันที่ประเมิน: ${new Date(assessment.completed_at || new Date()).toLocaleDateString('th-TH')}</span></div>
    </div>
    <div class="total-card"><div class="total-score" style="color:${assessment.level_total === 'สูงกว่าเกณฑ์' ? '#15803d' : (assessment.level_total === 'เกณฑ์ปกติ' ? '#1d4ed8' : '#b91c1c')}">${assessment.score_total} <span style="font-size:14px;font-weight:normal;">/ 200 คะแนน</span></div><div class="total-level">ระดับรวม: ${assessment.level_total}</div></div>
    <div class="chart-title">📊 กราฟแสดงคะแนนรายด้าน (8 ด้าน)</div>
    ${dims.map(d => {
        const percent = (d.score / d.max) * 100;
        const barColor = d.level === 'สูงกว่าเกณฑ์' ? '#10b981' : (d.level === 'เกณฑ์ปกติ' ? '#3b82f6' : '#ef4444');
        return `<div class="bar-item"><div class="bar-label"><span><b>${d.label}</b> (${d.score}/${d.max})</span><span>${Math.round(percent)}%</span></div><div class="bar-bg"><div class="bar-fill" style="width:${percent}%; background:${barColor};"></div></div></div>`;
    }).join('')}
    
    <table>
        <thead><tr><th>ด้าน</th><th>คะแนน</th><th>ระดับ</th></tr></thead>
        <tbody>
            ${dims.map(d => `<tr><td>${d.label}</td><td style="text-align:center">${d.score}/${d.max}</td><td style="text-align:center">${d.level}</td></tr>`).join('')}
        </tbody>
    </table>
    <div class="footer">ระบบ WRK School Management System | แบบประเมินพหุปัญญา 8 ด้าน</div>
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
        filename: `MI_${fullName}.pdf`,
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