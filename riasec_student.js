/**
 * riasec_student.js — ตรรกะฝั่งนักเรียน (ทำข้อสอบ, แสดงผล, PDF)
 */
let currentStudent = null;
let currentClassroomId = null;
let schoolInfo = null;
let answers = {};
let currentQ = 1;
let timerInterval = null;
let timerSeconds = RIASEC_DELAY_DEFAULT;
let canProceed = false;
let delaySeconds = RIASEC_DELAY_DEFAULT;

const TOTAL_QUESTIONS = RIASEC_QUESTIONS.length;
const TOTAL_MAX_SCORE = RIASEC_DIMENSIONS.reduce((sum, d) => sum + d.maxScore, 0);

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
            const { data: setting } = await db.from('riasec_settings')
                .select('delay_seconds')
                .eq('academic_year', String(si.current_academic_year))
                .eq('semester', String(si.current_semester))
                .maybeSingle();
            if (setting) delaySeconds = setting.delay_seconds;
        }
        const existingData = await checkExistingResult();
        if (existingData) {
            Swal.close();
            showResult(existingData);
            return;
        }
        const { data: draft } = await db.from('riasec_drafts')
            .select('*')
            .eq('student_id', currentStudent.id)
            .eq('academic_year', String(si.current_academic_year))
            .eq('semester', String(si.current_semester))
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
    const { data, error } = await db.from('riasec_assessments')
        .select('*')
        .eq('student_id', currentStudent.id)
        .eq('academic_year', String(schoolInfo.current_academic_year))
        .eq('semester', String(schoolInfo.current_semester))
        .maybeSingle();
    if (error) {
        console.error(error);
        return null;
    }
    return data;
}

function renderQuestion() {
    const q = RIASEC_QUESTIONS[currentQ - 1];
    const dim = RIASEC_DIMENSIONS.find(d => d.key === q.dim);
    document.getElementById('q-counter').textContent = `${currentQ} / ${TOTAL_QUESTIONS}`;
    document.getElementById('progress-bar').style.width = `${((currentQ - 1) / TOTAL_QUESTIONS) * 100}%`;
    document.getElementById('q-dim-label').textContent = `ด้าน${dim?.label || ''}`;
    document.getElementById('q-text').textContent = q.text;

    const container = document.getElementById('choices-container');
    container.innerHTML = RIASEC_CHOICES.map(ch => `
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
    if (currentQ === TOTAL_QUESTIONS) {
        await submitAssessment();
        return;
    }
    currentQ++;
    renderQuestion();
    saveDraft();
}

async function saveDraft() {
    if (!currentStudent || !schoolInfo) return;
    await db.from('riasec_drafts').upsert({
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
    if (answered < TOTAL_QUESTIONS) {
        return Swal.fire('ยังไม่ครบ', `ตอบแล้ว ${answered}/${TOTAL_QUESTIONS} ข้อ`, 'warning');
    }

    let classroomId = currentClassroomId;
    if (!classroomId) {
        const { data: enroll, error: enrollErr } = await db.from('student_enrollments')
            .select('classroom_id')
            .eq('student_id', currentStudent.id)
            .order('academic_year', { ascending: false })
            .order('semester', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (enrollErr) {
            console.error('Error fetching enrollment:', enrollErr);
        }

        if (enroll?.classroom_id) {
            classroomId = enroll.classroom_id;
            currentClassroomId = classroomId;
        } else {
            Swal.close();
            return Swal.fire(
                'ไม่พบข้อมูลห้องเรียน',
                'กรุณาติดต่อครูที่ปรึกษาเพื่อลงทะเบียนเรียนก่อนทำแบบประเมิน',
                'error'
            );
        }
    }

    Swal.fire({ title: 'กำลังบันทึกผล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const payload = buildAssessmentPayloadRIASEC(
        currentStudent.id,
        classroomId,
        schoolInfo.current_academic_year,
        schoolInfo.current_semester,
        answers
    );

    try {
        const { data, error } = await db.from('riasec_assessments')
            .upsert(payload, { onConflict: 'student_id,academic_year,semester' })
            .select().single();

        if (error) throw error;

        // ✅ ลบ draft (ใช้ค่าเดิมที่ใช้ตอน upsert โดยไม่แปลงเป็น String)
        const { error: deleteError } = await db.from('riasec_drafts')
            .delete()
            .eq('student_id', currentStudent.id)
            .eq('academic_year', schoolInfo.current_academic_year)
            .eq('semester', schoolInfo.current_semester);

        if (deleteError) {
            console.error('❌ ลบ draft ไม่สำเร็จ:', deleteError);
            // ถ้าลบไม่สำเร็จ ให้ลองลบอีกครั้งโดยใช้เงื่อนไขที่แน่นอน (อาจจะต้องแปลงเป็น String)
            // หรือแจ้งให้ผู้ดูแลระบบทราบ แต่ไม่ต้องแจ้งผู้ใช้ เพราะ assessment บันทึกแล้ว
        } else {
            console.log('✅ ลบ draft สำเร็จ');
        }

        Swal.close();
        showResult(data);
    } catch (err) {
        Swal.close();
        Swal.fire('บันทึกไม่สำเร็จ', err.message, 'error');
        console.error('❌ submitAssessment error:', err);
    }
}

function showResult(data) {
    document.getElementById('view-loading').classList.add('hidden');
    document.getElementById('view-assessment').classList.add('hidden');
    document.getElementById('view-result').classList.remove('hidden');

    const fullName = `${currentStudent.prefix || ''}${currentStudent.first_name} ${currentStudent.last_name}`;
    document.getElementById('res-name').innerText = fullName;

    // อัปเดตข้อความคะแนนรวมสูงสุด
    const totalMaxLabel = document.querySelector('#res-total-badge span.text-sm.opacity-80');
    if (totalMaxLabel) totalMaxLabel.textContent = `/ ${TOTAL_MAX_SCORE} คะแนน`;

    const getLevelStyle = (level) => {
        if (!level) {
            return { bg: 'bg-slate-500', text: 'text-white', badge: 'bg-slate-100 text-slate-700', bar: '#94a3b8' };
        }
        if (level === 'สูง') {
            return { bg: 'bg-green-500', text: 'text-white', badge: 'bg-green-100 text-green-700', bar: '#10b981' };
        } else if (level === 'ปานกลาง') {
            return { bg: 'bg-blue-500', text: 'text-white', badge: 'bg-blue-100 text-blue-700', bar: '#3b82f6' };
        } else if (level === 'ต่ำ') {
            return { bg: 'bg-amber-500', text: 'text-white', badge: 'bg-amber-100 text-amber-700', bar: '#f59e0b' };
        } else {
            return { bg: 'bg-slate-500', text: 'text-white', badge: 'bg-slate-100 text-slate-700', bar: '#94a3b8' };
        }
    };

    const totalLevel = data.level_total;
    const totalStyle = getLevelStyle(totalLevel);
    const badge = document.getElementById('res-total-badge');
    if (badge) {
        badge.className = `mt-4 inline-flex items-center gap-2 px-6 py-3 rounded-2xl ${totalStyle.bg} ${totalStyle.text}`;
    }
    document.getElementById('res-total-score').innerText = data.score_total;
    document.getElementById('res-total-level').innerText = `ระดับรวม: ${totalLevel}`;

    const dims = RIASEC_DIMENSIONS.map(d => ({
        key: d.key,
        label: d.label,
        score: data[`score_${d.key}`] || 0,
        max: d.maxScore,
        level: data[`level_${d.key}`] || ''
    }));

    const sorted = [...dims].sort((a, b) => b.score - a.score);
    const top3 = sorted.slice(0, 3);
    document.getElementById('res-top-dim').innerHTML = `🧠 ด้านที่โดดเด่นที่สุด: ${top3.map(d => `${d.label} (${d.score}/${d.max})`).join(' | ')}`;

    const chartDiv = document.getElementById('bar-chart');
    if (chartDiv) {
        chartDiv.innerHTML = dims.map(d => {
            const percent = (d.score / d.max) * 100;
            const style = getLevelStyle(d.level);
            return `
                <div>
                    <div class="flex justify-between text-sm mb-1">
                        <span><span class="font-semibold">${d.label}</span> (${d.score}/${d.max})</span>
                        <span>${Math.round(percent)}%</span>
                    </div>
                    <div class="w-full bg-slate-200 rounded-full h-3">
                        <div class="h-3 rounded-full" style="width: ${percent}%; background-color: ${style.bar};"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // --- การ์ด 3 อันดับแรก ---
    const cardsContainer = document.getElementById('top-cards-container');
    if (cardsContainer) {
        const borderColors = ['#10b981', '#3b82f6', '#f59e0b'];
        cardsContainer.innerHTML = top3.map((d, idx) => {
            const style = getLevelStyle(d.level);
            return `
                <div class="glass rounded-2xl p-5 border-l-8 shadow-md" style="border-left-color: ${borderColors[idx]}">
                    <div class="flex justify-between items-center mb-3">
                        <h3 class="font-bold text-xl text-slate-800">อันดับ ${idx + 1}</h3>
                        <span class="text-xs px-2 py-0.5 rounded-full ${style.badge}">${d.level}</span>
                    </div>
                    <p class="text-lg font-bold text-slate-800">${d.label}</p>
                    <p class="text-3xl font-black text-slate-800">${d.score} <span class="text-base font-normal text-slate-400">/ ${d.max}</span></p>
                    <div class="w-full bg-slate-200 rounded-full h-2.5 mt-2">
                        <div class="h-2.5 rounded-full" style="width: ${(d.score / d.max) * 100}%; background: ${borderColors[idx]};"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // --- ส่วนแสดงอาชีพแนะนำ (3 อันดับแรก) ---
    const careerContainer = document.createElement('div');
    careerContainer.id = 'career-suggestions';
    careerContainer.className = 'glass rounded-3xl shadow-xl p-5 mt-6';

    let careerHtml = `<h3 class="font-bold text-slate-800 text-lg mb-3 flex items-center gap-2">
        <i class="fas fa-briefcase text-purple-500"></i> อาชีพที่แนะนำตามบุคลิกภาพของคุณ
    </h3>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">`;

    const borderColors2 = ['#10b981', '#3b82f6', '#f59e0b'];

    top3.forEach((d, idx) => {
        const careers = RIASEC_CAREERS[d.key] || [];
        const careerList = careers.slice(0, 5).map(c => `<li class="text-sm text-slate-600">${c}</li>`).join('');
        careerHtml += `
            <div class="bg-slate-50 rounded-xl p-4 border-l-4" style="border-left-color: ${borderColors2[idx] || '#cbd5e1'}">
                <h4 class="font-bold text-slate-700">อันดับ ${idx + 1}: ${d.label}</h4>
                <ul class="mt-2 space-y-1">
                    ${careerList || '<li class="text-xs text-slate-400">ไม่มีข้อมูลอาชีพ</li>'}
                </ul>
            </div>
        `;
    });

    careerHtml += `</div>`;
    careerContainer.innerHTML = careerHtml;

    // ✅ ใช้ตัวแปร cardsContainer ที่ประกาศไว้แล้ว
    if (cardsContainer) {
        cardsContainer.parentNode.insertBefore(careerContainer, cardsContainer.nextSibling);
    } else {
        document.getElementById('view-result').appendChild(careerContainer);
    }
}

async function printResult() {
    Swal.fire({ title: 'กำลังสร้างไฟล์ PDF...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const { data: assessment, error } = await db.from('riasec_assessments')
            .select('*')
            .eq('student_id', currentStudent.id)
            .eq('academic_year', String(schoolInfo.current_academic_year))
            .eq('semester', String(schoolInfo.current_semester))
            .single();
        if (error || !assessment) throw new Error('ไม่พบข้อมูลการประเมิน');

        let adviser1 = '-', adviser2 = '-';
        let gradeLevel = '', roomNumber = '', studentNumber = '';
        if (assessment.classroom_id) {
            const { data: cls } = await db.from('core_classrooms')
                .select('grade_level, room_number, adviser1:core_personnel!adviser_id_1(prefix, first_name, last_name), adviser2:core_personnel!adviser_id_2(prefix, first_name, last_name)')
                .eq('id', assessment.classroom_id)
                .single();
            if (cls) {
                gradeLevel = cls.grade_level || '';
                roomNumber = cls.room_number || '';
                if (cls.adviser1) adviser1 = `${cls.adviser1.prefix || ''}${cls.adviser1.first_name} ${cls.adviser1.last_name}`;
                if (cls.adviser2) adviser2 = `${cls.adviser2.prefix || ''}${cls.adviser2.first_name} ${cls.adviser2.last_name}`;
            }
            const { data: enroll } = await db.from('student_enrollments')
                .select('student_number')
                .eq('student_id', currentStudent.id)
                .eq('classroom_id', assessment.classroom_id)
                .maybeSingle();
            if (enroll) studentNumber = enroll.student_number || '';
        }
        assessment._gradeLevel = gradeLevel;
        assessment._roomNumber = roomNumber;
        assessment._studentNumber = studentNumber;

        const schoolLogo = schoolInfo?.logo_url || 'https://i.ibb.co/94wLv5v/WRK-PNG-200px.png';
        const schoolName = schoolInfo?.school_name || 'โรงเรียนวัดไร่ขิงวิทยา';
        const academicYear = assessment.academic_year;
        const semester = assessment.semester;
        const fullName = `${currentStudent.prefix || ''}${currentStudent.first_name} ${currentStudent.last_name}`;
        const avatarUrl = currentStudent.avatar_students_url || null;

        Swal.close();
        generateFullPDFRIASEC(assessment, schoolName, academicYear, semester, adviser1, adviser2, schoolLogo, fullName, avatarUrl);
    } catch (err) {
        Swal.close();
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
}

function buildRIASECPdfHtml(opts) {
    var assessment = opts.assessment || {};
    var schoolName = opts.schoolName || '';
    var academicYear = opts.academicYear || '';
    var semester = opts.semester || '';
    var adviser1 = opts.adviser1 || '';
    var adviser2 = opts.adviser2 || '';
    var logoUrl = opts.logoUrl || '';
    var fullName = opts.fullName || '';
    var avatarUrl = opts.avatarUrl || '';
    var dims = opts.dims || [];
    var top3 = opts.top3 || [];
    var studentIdCard = opts.studentIdCard || '-';
    var studentNumber = opts.studentNumber || '-';
    var gradeLevel = opts.gradeLevel || '-';
    var roomNumber = opts.roomNumber || '-';
    var docTitle = opts.docTitle || 'รายงานผลการประเมินบุคลิกภาพ RIASEC';

    var scoreTotal = assessment.score_total ?? '-'; // ยังคงไว้ใช้ในตารางสรุป
    var totalLevel = assessment.level_total || '-'; // ยังคงไว้ใช้ในตารางสรุป

    function getLvlColor(lv) {
        if (lv === 'สูง') return '#10b981';
        if (lv === 'ปานกลาง') return '#3b82f6';
        return '#ef4444';
    }

    function getLvlClass(lv) {
        if (lv === 'สูง') return 'lh';
        if (lv === 'ปานกลาง') return 'lm';
        return 'll';
    }

    var avatarHtml = avatarUrl
        ? '<img src="' + avatarUrl + '" width="70" height="90" style="object-fit:cover;display:block;" crossorigin="anonymous">'
        : '<div style="width:70px;height:90px;text-align:center;line-height:90px;font-size:30px;color:#94a3b8;">&#128100;</div>';

    var DC = ['#ef4444', '#3b82f6', '#8b5cf6', '#22c55e', '#f59e0b', '#14b8a6'];

    // ---- PIE SVG ----
    var pieTot = 0;
    for (var i = 0; i < dims.length; i++) pieTot += dims[i].score;
    if (pieTot === 0) pieTot = 1;
    var slices = '', sa = -Math.PI / 2;
    var pcx = 60, pcy = 60, pr = 48;
    for (var i = 0; i < dims.length; i++) {
        var ang = (dims[i].score / pieTot) * 2 * Math.PI;
        if (ang < 0.001) { sa += ang; continue; }
        var ea = sa + ang;
        var x1 = pcx + pr * Math.cos(sa), y1 = pcy + pr * Math.sin(sa);
        var x2 = pcx + pr * Math.cos(ea), y2 = pcy + pr * Math.sin(ea);
        var la = ang > Math.PI ? 1 : 0;
        slices += '<path d="M' + pcx + ',' + pcy + ' L' + x1.toFixed(1) + ',' + y1.toFixed(1) +
            ' A' + pr + ',' + pr + ' 0 ' + la + ',1 ' + x2.toFixed(1) + ',' + y2.toFixed(1) +
            ' Z" fill="' + DC[i] + '" stroke="white" stroke-width="1.5"/>';
        sa = ea;
    }
    var piesvg = '<svg width="110" height="110" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"><rect width="120" height="120" fill="white"/>' + slices + '</svg>';

    // ---- LEGEND ----
    var legend = '';
    for (var i = 0; i < dims.length; i++) {
        legend += '<div style="margin-bottom:3px;font-size:11px;color:#374151;">' +
            '<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + DC[i] + ';margin-right:5px;vertical-align:middle;"></span>' +
            '<span style="vertical-align:middle;">' + dims[i].label + ' (' + dims[i].score + '/' + dims[i].max + ')</span></div>';
    }

    // ---- RADAR SVG ----
    var rcx = 90, rcy = 90, rr = 55, n = dims.length;
    var grid = '', axes = '', lbs = '', dts = '', rpts = [];
    for (var i = 0; i < n; i++) {
        var ang = (2 * Math.PI * i / n) - Math.PI / 2;
        var pct = dims[i].max > 0 ? dims[i].score / dims[i].max : 0;
        rpts.push((rcx + rr * pct * Math.cos(ang)).toFixed(1) + ',' + (rcy + rr * pct * Math.sin(ang)).toFixed(1));
        var ex = rcx + rr * Math.cos(ang), ey = rcy + rr * Math.sin(ang);
        axes += '<line x1="' + rcx + '" y1="' + rcy + '" x2="' + ex.toFixed(1) + '" y2="' + ey.toFixed(1) + '" stroke="#d1d5db" stroke-width="1"/>';
        var lx = rcx + (rr + 20) * Math.cos(ang), ly = rcy + (rr + 20) * Math.sin(ang);
        lbs += '<text x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" text-anchor="middle" dominant-baseline="middle" font-size="7.5" fill="#374151" font-family="Sarabun,sans-serif">' + dims[i].label + '</text>';
        var dx = rcx + rr * pct * Math.cos(ang), dy = rcy + rr * pct * Math.sin(ang);
        dts += '<circle cx="' + dx.toFixed(1) + '" cy="' + dy.toFixed(1) + '" r="2.5" fill="' + DC[i] + '" stroke="white" stroke-width="1"/>';
    }
    var fracs = [0.25, 0.5, 0.75, 1];
    for (var f = 0; f < 4; f++) {
        var gp = [];
        for (var i = 0; i < n; i++) {
            var ang = (2 * Math.PI * i / n) - Math.PI / 2;
            gp.push((rcx + rr * fracs[f] * Math.cos(ang)).toFixed(1) + ',' + (rcy + rr * fracs[f] * Math.sin(ang)).toFixed(1));
        }
        grid += '<polygon points="' + gp.join(' ') + '" fill="none" stroke="#e5e7eb" stroke-width="1"/>';
    }
    var radarsvg = '<svg width="170" height="170" viewBox="0 0 180 180" xmlns="http://www.w3.org/2000/svg"><rect width="180" height="180" fill="white"/>' +
        grid + axes +
        '<polygon points="' + rpts.join(' ') + '" fill="#e0e7ff" stroke="#6366f1" stroke-width="1.5" stroke-linejoin="round"/>' +
        dts + lbs + '</svg>';

    // ---- อาชีพแนะนำ (Career) ----
    var careerHtml = '';
    if (top3.length > 0) {
        careerHtml = '<div class="box" style="margin-top:5px;margin-bottom:4px;">' +
            '<div class="stitle2">💼 อาชีพที่แนะนำตามบุคลิกภาพของคุณ</div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px;">';
        var borderColors = ['#10b981', '#3b82f6', '#f59e0b'];
        top3.forEach(function (d, idx) {
            var careers = RIASEC_CAREERS[d.key] || [];
            var list = careers.slice(0, 5).map(function (c) {
                return '<li style="font-size:10px;color:#374151;list-style-type:disc;margin-left:12px;">' + c + '</li>';
            }).join('');
            careerHtml +=
                '<div style="flex:1;min-width:120px;background:#f8fafc;padding:6px 8px;border-radius:4px;border-left:3px solid ' + borderColors[idx] + ';margin-bottom:4px;">' +
                '<div style="font-weight:bold;font-size:11px;color:#1e293b;">อันดับ ' + (idx + 1) + ': ' + d.label + '</div>' +
                '<ul style="margin:2px 0 0 0;padding:0;">' + list + '</ul>' +
                '</div>';
        });
        careerHtml += '</div></div>';
    }

    // ---- BAR CHART ----
    var bars = '';
    for (var i = 0; i < dims.length; i++) {
        var pct = dims[i].max > 0 ? (dims[i].score / dims[i].max * 100) : 0;
        bars += '<div style="margin-bottom:3px;">' +
            '<div style="font-size:10px;margin-bottom:1px;">' +
            '<span style="font-weight:600;float:left;">' + dims[i].label + '</span>' +
            '<span style="float:right;">' + dims[i].score + '/' + dims[i].max + ' (' + Math.round(pct) + '%)</span>' +
            '<div style="clear:both;"></div></div>' +
            '<div style="background:#e5e7eb;border-radius:4px;height:6px;width:100%;">' +
            '<div style="width:' + pct.toFixed(1) + '%;background:' + getLvlColor(dims[i].level) + ';height:6px;border-radius:4px;"></div>' +
            '</div></div>';
    }

    // ---- TABLE ROWS ----
    var trows = '';
    for (var i = 0; i < dims.length; i++) {
        var pct = dims[i].max > 0 ? Math.round(dims[i].score / dims[i].max * 100) : 0;
        trows += '<tr>' +
            '<td style="text-align:left;font-size:11px;">' + dims[i].label + '</td>' +
            '<td style="font-size:11px;">' + dims[i].score + '</td>' +
            '<td style="font-size:11px;">' + dims[i].max + '</td>' +
            '<td style="font-size:11px;">' + pct + '%</td>' +
            '<td class="' + getLvlClass(dims[i].level) + '" style="font-size:13px;">' + dims[i].level + '</td>' +
            '</tr>';
    }
    var totPct = (scoreTotal !== '-') ? Math.round(scoreTotal / TOTAL_MAX_SCORE * 100) : '-';
    trows += '<tr style="background:#f1f5f9;font-weight:700;">' +
        '<td style="text-align:left;font-size:13px;"><b>รวม</b></td>' +
        '<td style="font-size:11px;"><b>' + scoreTotal + '</b></td>' +
        '<td style="font-size:13px;"><b>' + TOTAL_MAX_SCORE + '</b></td>' +
        '<td style="font-size:11px;"><b>' + totPct + '%</b></td>' +
        '<td class="' + getLvlClass(totalLevel) + '" style="font-size:13px;"><b>' + totalLevel + '</b></td>' +
        '</tr>';

    var dateStr = new Date(assessment.completed_at || new Date()).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    var printDate = new Date().toLocaleDateString('th-TH');
    var advLine = adviser1 + (adviser2 && adviser2 !== '-' ? ' / ' + adviser2 : '');
    var gradeDisp = (gradeLevel && gradeLevel !== '-') ? 'ม.' + gradeLevel : '-';

    var css =
        '* {box-sizing:border-box;margin:0;padding:0;}' +
        'html,body {width:210mm;background:white;}' +
        'body {font-family:Sarabun,Anuphan,sans-serif;font-size:11px;color:#1e293b;padding:5mm 7mm;}' +
        '.box {background:#ffffff;border:1px solid #e2e8f0;border-radius:5px;padding:6px;}' +
        '.stitle2 {font-size:11px;font-weight:700;color:#312e81;border-bottom:1px solid #e2e8f0;padding-bottom:2px;margin-bottom:4px;}' +
        'table.dt {width:100%;border-collapse:collapse;}' +
        'table.dt th,table.dt td {border:1px solid #cbd5e1;padding:3px 5px;text-align:center;vertical-align:middle;font-size:11px;}' +
        'table.dt th {background:#312e81;color:white;font-size:10px;}' +
        '.lh {color:#15803d;font-weight:700;}' +
        '.lm {color:#1d4ed8;font-weight:700;}' +
        '.ll {color:#b91c1c;font-weight:700;}' +
        '.footer {font-size:9px;text-align:center;color:#94a3b8;margin-top:4px;border-top:1px solid #e2e8f0;padding-top:4px;}';

    var html =
        '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' + css + '</style></head><body>' +

        // HEADER
        '<table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:2px solid #312e81;margin-bottom:5px;padding-bottom:4px;">' +
        '<tr>' +
        '<td width="60%" valign="middle">' +
        '<table cellpadding="0" cellspacing="0"><tr>' +
        '<td width="50" valign="middle"><img src="' + logoUrl + '" width="40" height="40" crossorigin="anonymous"></td>' +
        '<td valign="middle" style="padding-left:8px;">' +
        '<div style="color:#312e81;font-size:14px;font-weight:900;line-height:1.2;">' + schoolName + '</div>' +
        '<div style="font-size:10px;color:#475569;">' + docTitle + '</div>' +
        '</td></tr></table>' +
        '</td>' +
        '<td width="40%" align="right" valign="bottom" style="font-size:10px;line-height:1.5;">' +
        '<div><b>ภาคเรียนที่ ' + semester + '</b> ปีการศึกษา ' + academicYear + '</div>' +
        '<div>ครูที่ปรึกษา: ' + advLine + '</div>' +
        '<div>วันที่ประเมิน: ' + dateStr + '</div>' +
        '</td>' +
        '</tr></table>' +

        // ✅ แทนที่ ROW 1: ข้อมูลนักเรียน (เต็มความกว้าง, ไม่มีผลรวม)
        '<div class="box" style="margin-bottom:5px;">' +
        '<table cellpadding="0" cellspacing="0" style="width:100%;">' +
        '<tr>' +
        '<td valign="top" style="padding-right:8px;width:78px;">' +
        '<div style="width:72px;height:90px;border-radius:5px;overflow:hidden;border:1.5px solid #cbd5e1;background:#f8fafc;">' + avatarHtml + '</div>' +
        '</td>' +
        '<td valign="top" style="line-height:1.6;">' +
        '<div style="font-size:13px;font-weight:800;color:#1e293b;margin-bottom:3px;">' + fullName + '</div>' +
        '<div><span style="color:#64748b;font-size:11px;">เลขประจำตัว: </span><b style="color:#312e81;font-size:13px;">' + studentIdCard + '</b></div>' +
        '<div>' +
        '<span style="color:#64748b;font-size:11px;">ชั้น: </span><b style="color:#312e81;font-size:12px;">' + gradeDisp + '</b>&nbsp;&nbsp;' +
        '<span style="color:#64748b;font-size:11px;">ห้อง: </span><b style="color:#312e81;font-size:12px;">' + roomNumber + '</b>' +
        '</div>' +
        '<div><span style="color:#64748b;font-size:11px;">เลขที่: </span><b style="color:#312e81;font-size:12px;">' + studentNumber + '</b></div>' +
        '</td>' +
        '</tr>' +
        '</table>' +
        '</div>' +

        // ROW 2: Pie + Radar
        '<table width="100%" cellpadding="0" cellspacing="4" style="margin-bottom:5px;">' +
        '<tr>' +
        '<td width="50%" valign="top">' +
        '<div class="box">' +
        '<div class="stitle2">🥧 สัดส่วนคะแนนบุคลิกภาพรายด้าน</div>' +
        '<table cellpadding="0" cellspacing="0"><tr>' +
        '<td width="120" valign="middle" style="padding-right:4px;">' + piesvg + '</td>' +
        '<td valign="middle">' + legend + '</td>' +
        '</tr></table>' +
        '</div>' +
        '</td>' +
        '<td width="50%" valign="top">' +
        '<div class="box" style="text-align:center;">' +
        '<div class="stitle2">🕸️ กราฟเรดาร์ RIASEC</div>' +
        radarsvg +
        '</div>' +
        '</td>' +
        '</tr></table>' +

        // อาชีพแนะนำ
        careerHtml +

        // ROW 3: กราฟแท่ง
        '<div class="box" style="margin-bottom:4px;">' +
        '<div class="stitle2">📊 กราฟแสดงคะแนนบุคลิกภาพรายด้าน 6 ด้าน</div>' +
        bars +
        '</div>' +

        // ROW 4: ตารางสรุป (ยังคงมีคะแนนรวมและระดับรวมในตาราง)
        '<div class="box">' +
        '<div class="stitle2">📋 ตารางสรุปผลการประเมินบุคลิกภาพ 6 ด้าน</div>' +
        '<table class="dt">' +
        '<thead><tr>' +
        '<th style="text-align:left;width:30%;">ด้าน</th>' +
        '<th>คะแนน</th><th>เต็ม</th><th>ร้อยละ</th><th>ระดับ</th>' +
        '</tr></thead>' +
        '<tbody>' + trows + '</tbody>' +
        '</table>' +
        '</div>' +

        '<div class="footer">ระบบ WRK School Management System | แบบประเมินบุคลิกภาพ RIASEC 6 ด้าน | พิมพ์วันที่ ' + printDate + '</div>' +
        '</body></html>';

    return html;
}

function generateFullPDFRIASEC(assessment, schoolName, academicYear, semester, adviser1, adviser2, logoUrl, fullName, avatarUrl) {
    // ✅ ใช้ฟังก์ชัน getLevel ที่ให้ 'ต่ำ', 'ปานกลาง', 'สูง'
    const getLevel = (score, norm) => {
        if (score < norm.min) return 'ต่ำ';
        if (score <= norm.max) return 'ปานกลาง';
        return 'สูง';
    };

    const dims = RIASEC_DIMENSIONS.map(d => {
        const score = assessment['score_' + d.key] || 0;
        const levelFromDb = assessment['level_' + d.key];
        const norm = RIASEC_NORM[d.key] || { min: 10, max: 18 };
        const level = levelFromDb || getLevel(score, norm);
        return { key: d.key, label: d.label, score: score, max: d.maxScore, level: level };
    });

    if (assessment.score_total === undefined || assessment.score_total === null) {
        assessment.score_total = dims.reduce(function (s, d) { return s + d.score; }, 0);
    }
    if (!assessment.level_total) {
        const normTotal = RIASEC_NORM.total || { min: 60, max: 108 };
        assessment.level_total = getLevel(assessment.score_total, normTotal);
    }

    // หา 3 อันดับแรก
    const sorted = [...dims].sort((a, b) => b.score - a.score);
    const top3 = sorted.slice(0, 3);

    const studentIdCard = currentStudent ? (currentStudent.student_id_card || '') : '';
    const gradeLevel = assessment._gradeLevel || '';
    const roomNumber = assessment._roomNumber || '';
    const studentNumber = assessment._studentNumber || '';

    const html = buildRIASECPdfHtml({
        assessment: assessment,
        schoolName: schoolName,
        academicYear: academicYear,
        semester: semester,
        adviser1: adviser1,
        adviser2: adviser2,
        logoUrl: logoUrl,
        fullName: fullName,
        avatarUrl: avatarUrl,
        dims: dims,
        top3: top3,  // ✅ ส่ง top3 ไปยัง buildRIASECPdfHtml
        studentIdCard: studentIdCard,
        studentNumber: studentNumber,
        gradeLevel: gradeLevel,
        roomNumber: roomNumber,
        docTitle: 'รายงานผลการประเมินบุคลิกภาพ RIASEC'
    });

    generateStudentPdfFromHtml(html, fullName);
}

function generateStudentPdfFromHtml(html, fullName) {
    var opt = {
        margin: [0.45, 0.45, 0.7, 0.45],
        filename: 'RIASEC_' + fullName + '.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
            scale: 2,
            useCORS: true,
            letterRendering: true,
            windowWidth: 794,
            logging: false
        },
        jsPDF: { unit: 'cm', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(html, 'string').save();
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