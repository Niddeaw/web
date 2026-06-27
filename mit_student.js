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
        const { data: draft } = await db.from('mi_drafts')
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
    const { data, error } = await db.from('mi_assessments')
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

    // ตรวจสอบ classroom_id
    if (!currentClassroomId) {
        console.warn('⚠️ ไม่พบ classroom_id ของนักเรียน');
        // อาจใช้ null ก็ได้ แต่ควรมี
    }

    const payload = buildAssessmentPayloadMI(
        currentStudent.id, currentClassroomId,
        schoolInfo.current_academic_year, schoolInfo.current_semester,
        answers
    );

    try {
        const { data, error } = await db.from('mi_assessments')
            .upsert(payload, { onConflict: 'student_id,academic_year,semester' })
            .select().single();

        if (error) throw error;

        // ✅ ลบ Draft ทันทีที่บันทึกสำเร็จ
        await db.from('mi_drafts')
            .delete()
            .eq('student_id', currentStudent.id)
            .eq('academic_year', String(schoolInfo.current_academic_year))
            .eq('semester', String(schoolInfo.current_semester));

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

    // Helper: กำหนดสีและคลาสตามระดับ (ปรับให้เหมาะกับ MI)
    const getLevelStyle = (level) => {
        if (!level) {
            return { bg: 'bg-slate-500', text: 'text-white', badge: 'bg-slate-100 text-slate-700', bar: '#94a3b8' };
        }
        if (level === 'โดดเด่น' || level === 'สูง' || level === 'สูงกว่าเกณฑ์') {
            return { bg: 'bg-green-500', text: 'text-white', badge: 'bg-green-100 text-green-700', bar: '#10b981' };
        } else if (level === 'ปานกลาง' || level === 'เกณฑ์ปกติ') {
            return { bg: 'bg-blue-500', text: 'text-white', badge: 'bg-blue-100 text-blue-700', bar: '#3b82f6' };
        } else if (level === 'ควรพัฒนา' || level === 'ต่ำ' || level === 'ต่ำกว่าเกณฑ์') {
            return { bg: 'bg-amber-500', text: 'text-white', badge: 'bg-amber-100 text-amber-700', bar: '#f59e0b' };
        } else {
            return { bg: 'bg-slate-500', text: 'text-white', badge: 'bg-slate-100 text-slate-700', bar: '#94a3b8' };
        }
    };

    // ---- ระดับรวม (Total) ----
    const totalLevel = data.level_total;
    const totalStyle = getLevelStyle(totalLevel);
    const badge = document.getElementById('res-total-badge');
    if (badge) {
        badge.className = `mt-4 inline-flex items-center gap-2 px-6 py-3 rounded-2xl ${totalStyle.bg} ${totalStyle.text}`;
    }
    document.getElementById('res-total-score').innerText = data.score_total;
    document.getElementById('res-total-level').innerText = `ระดับรวม: ${totalLevel}`;

    // ---- เตรียมข้อมูลรายด้าน (8 ด้าน) ----
    const dims = MI_DIMENSIONS.map(d => ({
        key: d.key,
        label: d.label,
        score: data[`score_${d.key}`] || 0,
        max: d.maxScore,
        level: data[`level_${d.key}`] || ''
    }));

    // เรียงลำดับจากคะแนนมากไปน้อย และแสดง 3 อันดับแรก
    const sorted = [...dims].sort((a, b) => b.score - a.score);
    const top3 = sorted.slice(0, 3);
    document.getElementById('res-top-dim').innerHTML = `🧠 ด้านที่โดดเด่นที่สุด: ${top3.map(d => `${d.label} (${d.score}/${d.max})`).join(' | ')}`;

    // ---- กราฟแท่ง (Bar Chart) ----
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

    // ---- การ์ดแสดง 3 อันดับแรก (Top 3 Cards) ----
    const cardsContainer = document.getElementById('top-cards-container');
    if (cardsContainer) {
        cardsContainer.innerHTML = top3.map((d, idx) => {
            // สีขอบการ์ด: เขียว, ฟ้า, เหลือง (ตามอันดับ)
            const borderColors = ['#10b981', '#3b82f6', '#f59e0b'];
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
}

async function printResult() {
    Swal.fire({ title: 'กำลังสร้างไฟล์ PDF...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const { data: assessment, error } = await db.from('mi_assessments')
            .select('*')
            .eq('student_id', currentStudent.id)
            .eq('academic_year', String(schoolInfo.current_academic_year))
            .eq('semester', String(schoolInfo.current_semester))
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

// ฟังก์ชัน buildMIPdfHtml แบบ string concatenation ปลอดภัย 100%
function buildMIPdfHtml(opts) {
    var assessment = opts.assessment;
    var schoolName = opts.schoolName;
    var academicYear = opts.academicYear;
    var semester = opts.semester;
    var adviser1 = opts.adviser1;
    var adviser2 = opts.adviser2;
    var logoUrl = opts.logoUrl;
    var fullName = opts.fullName;
    var avatarUrl = opts.avatarUrl;
    var dims = opts.dims;
    var studentIdCard = opts.studentIdCard || '-';
    var studentNumber = opts.studentNumber || '-';
    var gradeLevel = opts.gradeLevel || '-';
    var roomNumber = opts.roomNumber || '-';
    var docTitle = opts.docTitle || 'รายงานผลการประเมินพหุปัญญา (MI)';

    // สีตามระดับรวม
    var totalLevel = assessment.level_total || '';
    var isHigh = ['สูงกว่าเกณฑ์','โดดเด่น','สูง'].indexOf(totalLevel) >= 0;
    var isMid  = ['เกณฑ์ปกติ','ปานกลาง'].indexOf(totalLevel) >= 0;
    var totalColor  = isHigh ? '#15803d' : (isMid ? '#1d4ed8' : '#b91c1c');
    var totalBg     = isHigh ? '#dcfce7' : (isMid ? '#dbeafe' : '#fee2e2');
    var totalBorder = isHigh ? '#16a34a' : (isMid ? '#2563eb' : '#dc2626');

    function getLevelColor(level) {
        if (['สูงกว่าเกณฑ์','โดดเด่น','สูง'].indexOf(level) >= 0) return '#10b981';
        if (['เกณฑ์ปกติ','ปานกลาง'].indexOf(level) >= 0) return '#3b82f6';
        return '#ef4444';
    }
    function getLevelClass(level) {
        if (['สูงกว่าเกณฑ์','โดดเด่น','สูง'].indexOf(level) >= 0) return 'level-high';
        if (['เกณฑ์ปกติ','ปานกลาง'].indexOf(level) >= 0) return 'level-mid';
        return 'level-low';
    }

    var avatarHtml = avatarUrl
        ? '<img src="' + avatarUrl + '" style="width:100%;height:100%;object-fit:cover;" crossorigin="anonymous">'
        : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:40px;color:#94a3b8;">&#128100;</div>';

    var dimColors = ['#6366f1','#0ea5e9','#8b5cf6','#ec4899','#f59e0b','#10b981','#14b8a6','#f97316'];

    // --- PIE CHART (SVG) ---
    var totalScore = 0;
    for (var i = 0; i < dims.length; i++) totalScore += dims[i].score;
    if (totalScore === 0) totalScore = 1;
    var cx = 95, cy = 95, r = 80;
    var slices = '';
    var startAngle = -Math.PI / 2;
    for (var i = 0; i < dims.length; i++) {
        var angle = (dims[i].score / totalScore) * 2 * Math.PI;
        if (angle < 0.001) { startAngle += angle; continue; }
        var endAngle = startAngle + angle;
        var x1 = cx + r * Math.cos(startAngle);
        var y1 = cy + r * Math.sin(startAngle);
        var x2 = cx + r * Math.cos(endAngle);
        var y2 = cy + r * Math.sin(endAngle);
        var largeArc = angle > Math.PI ? 1 : 0;
        slices += '<path d="M' + cx + ',' + cy + ' L' + x1.toFixed(1) + ',' + y1.toFixed(1) +
            ' A' + r + ',' + r + ' 0 ' + largeArc + ',1 ' + x2.toFixed(1) + ',' + y2.toFixed(1) +
            ' Z" fill="' + dimColors[i] + '" stroke="white" stroke-width="1.5"/>';
        startAngle = endAngle;
    }
    var pieChart = '<svg width="190" height="190" viewBox="0 0 190 190" xmlns="http://www.w3.org/2000/svg">' + slices + '</svg>';

    // --- RADAR CHART (SVG) ---
    var rcx = 115, rcy = 115, rr = 88;
    var n = dims.length;
    var gridLines = '', axisLines = '', labels = '', dots = '';
    var radarPoints = [];
    for (var i = 0; i < n; i++) {
        var angle = (2 * Math.PI * i / n) - Math.PI / 2;
        var pct = dims[i].max > 0 ? dims[i].score / dims[i].max : 0;
        var px = rcx + rr * pct * Math.cos(angle);
        var py = rcy + rr * pct * Math.sin(angle);
        radarPoints.push(px.toFixed(1) + ',' + py.toFixed(1));
        // axis
        var ex = rcx + rr * Math.cos(angle);
        var ey = rcy + rr * Math.sin(angle);
        axisLines += '<line x1="' + rcx + '" y1="' + rcy + '" x2="' + ex.toFixed(1) + '" y2="' + ey.toFixed(1) + '" stroke="#cbd5e1" stroke-width="1"/>';
        // label
        var lx = rcx + (rr + 16) * Math.cos(angle);
        var ly = rcy + (rr + 16) * Math.sin(angle);
        var shortLbl = dims[i].label.length > 4 ? dims[i].label.substring(0,4) : dims[i].label;
        labels += '<text x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" text-anchor="middle" dominant-baseline="middle" font-size="8.5" fill="#475569" font-family="Sarabun,sans-serif">' + shortLbl + '</text>';
        // dot
        dots += '<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="3" fill="' + dimColors[i] + '" stroke="white" stroke-width="1"/>';
    }
    // grid rings
    var fracs = [0.25, 0.5, 0.75, 1];
    for (var f = 0; f < fracs.length; f++) {
        var gpts = [];
        for (var i = 0; i < n; i++) {
            var angle = (2 * Math.PI * i / n) - Math.PI / 2;
            gpts.push((rcx + rr * fracs[f] * Math.cos(angle)).toFixed(1) + ',' + (rcy + rr * fracs[f] * Math.sin(angle)).toFixed(1));
        }
        gridLines += '<polygon points="' + gpts.join(' ') + '" fill="none" stroke="#e2e8f0" stroke-width="1"/>';
    }
    var radarChart = '<svg width="230" height="230" viewBox="0 0 230 230" xmlns="http://www.w3.org/2000/svg">' +
        gridLines + axisLines +
        '<polygon points="' + radarPoints.join(' ') + '" fill="#6366f118" stroke="#6366f1" stroke-width="2" stroke-linejoin="round"/>' +
        dots + labels + '</svg>';

    // --- LEGEND ---
    var legendHtml = '';
    for (var i = 0; i < dims.length; i++) {
        legendHtml += '<div style="display:flex;align-items:center;gap:4px;margin-bottom:3px;">' +
            '<div style="width:9px;height:9px;border-radius:2px;background:' + dimColors[i] + ';flex-shrink:0;"></div>' +
            '<span style="font-size:8.5px;color:#475569;">' + dims[i].label + ' (' + dims[i].score + '/' + dims[i].max + ')</span>' +
            '</div>';
    }

    // --- BAR CHART rows ---
    var barRows = '';
    for (var i = 0; i < dims.length; i++) {
        var pct = dims[i].max > 0 ? (dims[i].score / dims[i].max * 100) : 0;
        var col = getLevelColor(dims[i].level);
        barRows += '<div style="margin-bottom:4px;">' +
            '<div style="display:flex;justify-content:space-between;font-size:8.5px;margin-bottom:1px;">' +
            '<span><b>' + dims[i].label + '</b></span>' +
            '<span>' + dims[i].score + '/' + dims[i].max + ' (' + Math.round(pct) + '%)</span>' +
            '</div>' +
            '<div style="background:#e2e8f0;border-radius:8px;height:6px;">' +
            '<div style="width:' + pct.toFixed(1) + '%;background:' + col + ';height:6px;border-radius:8px;"></div>' +
            '</div></div>';
    }

    // --- TABLE rows ---
    var tableRows = '';
    for (var i = 0; i < dims.length; i++) {
        var pct = dims[i].max > 0 ? Math.round(dims[i].score / dims[i].max * 100) : 0;
        var cls = getLevelClass(dims[i].level);
        tableRows += '<tr><td>' + dims[i].label + '</td><td>' + dims[i].score + '</td><td>' + dims[i].max + '</td><td>' + pct + '%</td><td class="' + cls + '">' + dims[i].level + '</td></tr>';
    }
    var totalPct = Math.round((assessment.score_total / 200) * 100);
    tableRows += '<tr style="background:#f1f5f9;font-weight:800;"><td><b>รวม</b></td><td><b>' + assessment.score_total + '</b></td><td><b>200</b></td><td><b>' + totalPct + '%</b></td><td class="' + getLevelClass(totalLevel) + '"><b>' + totalLevel + '</b></td></tr>';

    var dateStr = new Date(assessment.completed_at || new Date()).toLocaleDateString('th-TH', {year:'numeric',month:'long',day:'numeric'});
    var printDate = new Date().toLocaleDateString('th-TH');
    var adviserLine = adviser1 + (adviser2 && adviser2 !== '-' ? ' / ' + adviser2 : '');
    var gradeDisplay = gradeLevel && gradeLevel !== '-' ? 'ม.' + gradeLevel : '-';

    var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>MI Report</title><style>' +
        '* { box-sizing:border-box; margin:0; padding:0; }' +
        '@page { size:A4 portrait; margin:0.45cm; }' +
        'body { font-family:Sarabun,Anuphan,sans-serif; font-size:11px; color:#1e293b; background:white; }' +
        '.hdr { display:flex; align-items:center; justify-content:space-between; border-bottom:3px solid #312e81; padding-bottom:5px; margin-bottom:7px; }' +
        '.logo { height:42px; width:auto; }' +
        '.school-title { color:#312e81; font-size:14px; font-weight:900; }' +
        '.school-sub { font-size:9.5px; color:#475569; margin-top:1px; }' +
        '.info-area { text-align:right; font-size:9.5px; line-height:1.7; }' +
        '.row { display:flex; gap:7px; margin-bottom:6px; }' +
        '.box { background:#f8fafc; border:1px solid #e2e8f0; border-radius:7px; padding:7px; }' +
        '.sec-title { font-size:10px; font-weight:800; color:#312e81; border-bottom:1.5px solid #e2e8f0; padding-bottom:2px; margin-bottom:5px; }' +
        '.info-lbl { font-size:9px; color:#64748b; white-space:nowrap; }' +
        '.info-val { font-size:9.5px; font-weight:700; color:#312e81; }' +
        'table { width:100%; border-collapse:collapse; font-size:9px; }' +
        'th,td { border:1px solid #cbd5e1; padding:3.5px 5px; text-align:center; }' +
        'th { background:#312e81; color:white; }' +
        'td:first-child { text-align:left; }' +
        '.level-high { color:#15803d; font-weight:700; }' +
        '.level-mid { color:#1d4ed8; font-weight:700; }' +
        '.level-low { color:#b91c1c; font-weight:700; }' +
        '.footer { font-size:7.5px; text-align:center; color:#94a3b8; margin-top:4px; border-top:1px solid #e2e8f0; padding-top:3px; }' +
        '</style></head><body>' +

        // HEADER
        '<div class="hdr">' +
            '<div style="display:flex;align-items:center;gap:10px;">' +
                '<img class="logo" src="' + logoUrl + '" crossorigin="anonymous">' +
                '<div><div class="school-title">' + schoolName + '</div><div class="school-sub">' + docTitle + '</div></div>' +
            '</div>' +
            '<div class="info-area">' +
                '<div><b>ภาคเรียนที่ ' + semester + '</b> ปีการศึกษา ' + academicYear + '</div>' +
                '<div>ครูที่ปรึกษา: ' + adviserLine + '</div>' +
                '<div>วันที่ประเมิน: ' + dateStr + '</div>' +
            '</div>' +
        '</div>' +

        // ROW 1: Student info + Assessment
        '<div class="row">' +
            // กล่องซ้าย: รูป + ข้อมูล
            '<div class="box" style="flex:0 0 40%;display:flex;gap:9px;align-items:flex-start;">' +
                '<div style="flex-shrink:0;width:80px;height:98px;border-radius:7px;overflow:hidden;border:2px solid #cbd5e1;background:#e2e8f0;">' + avatarHtml + '</div>' +
                '<div style="flex:1;">' +
                    '<div style="font-size:12px;font-weight:800;color:#1e293b;line-height:1.4;margin-bottom:6px;">' + fullName + '</div>' +
                    '<div style="display:flex;gap:4px;margin-bottom:4px;align-items:center;">' +
                        '<span class="info-lbl">เลขประจำตัว:</span>' +
                        '<span class="info-val">' + studentIdCard + '</span>' +
                    '</div>' +
                    '<div style="display:flex;gap:4px;margin-bottom:4px;align-items:center;">' +
                        '<span class="info-lbl">ชั้น:</span><span class="info-val">' + gradeDisplay + '</span>' +
                        '<span class="info-lbl" style="margin-left:5px;">ห้อง:</span><span class="info-val">' + roomNumber + '</span>' +
                    '</div>' +
                    '<div style="display:flex;gap:4px;margin-bottom:4px;align-items:center;">' +
                        '<span class="info-lbl">เลขที่:</span><span class="info-val">' + studentNumber + '</span>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            // กล่องขวา: ผลประเมิน
            '<div class="box" style="flex:1;">' +
                '<div class="sec-title">🏆 ผลการประเมินรวม</div>' +
                '<div style="text-align:center;padding:5px;background:' + totalBg + ';border:1.5px solid ' + totalBorder + ';border-radius:7px;margin-bottom:5px;">' +
                    '<div style="font-size:24px;font-weight:900;color:' + totalColor + ';line-height:1;">' + assessment.score_total + ' <span style="font-size:12px;font-weight:500;">/ 200</span></div>' +
                    '<div style="font-size:10.5px;font-weight:700;color:' + totalColor + ';margin-top:2px;">ระดับรวม: ' + totalLevel + '</div>' +
                '</div>' +
                '<div class="sec-title">📊 คะแนนรายด้าน</div>' +
                barRows +
            '</div>' +
        '</div>' +

        // ROW 2: Pie + Radar
        '<div class="row">' +
            '<div class="box" style="flex:1;display:flex;flex-direction:column;align-items:center;">' +
                '<div class="sec-title" style="width:100%;text-align:center;">🥧 สัดส่วนคะแนนรายด้าน</div>' +
                '<div style="display:flex;gap:6px;align-items:center;justify-content:center;">' +
                    pieChart +
                    '<div style="min-width:100px;">' + legendHtml + '</div>' +
                '</div>' +
            '</div>' +
            '<div class="box" style="flex:1;display:flex;flex-direction:column;align-items:center;">' +
                '<div class="sec-title" style="width:100%;text-align:center;">🕸️ กราฟเรดาร์พหุปัญญา</div>' +
                radarChart +
            '</div>' +
        '</div>' +

        // ROW 3: Table
        '<div class="box" style="margin-bottom:4px;">' +
            '<div class="sec-title">📋 ตารางสรุปผลการประเมิน 8 ด้าน</div>' +
            '<table><thead><tr><th style="text-align:left;width:27%;">ด้าน</th><th>คะแนน</th><th>เต็ม</th><th>ร้อยละ</th><th>ระดับ</th></tr></thead>' +
            '<tbody>' + tableRows + '</tbody></table>' +
        '</div>' +

        '<div class="footer">ระบบ WRK School Management System | แบบประเมินพหุปัญญา (Multiple Intelligences) 8 ด้าน | พิมพ์วันที่ ' + printDate + '</div>' +
        '</body></html>';

    return html;
}

function generateFullPDFMI(assessment, schoolName, academicYear, semester, adviser1, adviser2, logoUrl, fullName, avatarUrl) {
    const dims = MI_DIMENSIONS.map(d => ({
        key: d.key,
        label: d.label,
        score: assessment[`score_${d.key}`] || 0,
        max: d.maxScore,
        level: assessment[`level_${d.key}`] || ''
    }));

    // ข้อมูลนักเรียนเพิ่มเติม
    const studentIdCard = currentStudent?.student_id_card || '';
    const studentNumber = currentStudent?.student_enrollments?.[0]?.student_number || '';
    const gradeLevel = currentStudent?.student_enrollments?.[0]?.grade_level || '';
    const roomNumber = currentStudent?.student_enrollments?.[0]?.room_number || '';

    const html = buildMIPdfHtml({
        assessment, schoolName, academicYear, semester,
        adviser1, adviser2, logoUrl, fullName, avatarUrl,
        dims,
        studentIdCard, studentNumber, gradeLevel, roomNumber,
        docTitle: 'รายงานผลการประเมินพหุปัญญา (MI)'
    });

    const element = document.createElement('div');
    element.innerHTML = html;
    element.style.position = 'fixed';
    element.style.left = '-9999px';
    document.body.appendChild(element);

    // รอให้ Chart.js render เสร็จก่อน generate PDF
    setTimeout(() => {
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
    }, 800);
}

function generateStudentPdfNow(element, fullName) {
    html2pdf().set({
        margin: [0.4, 0.4, 0.8, 0.4],
        filename: `MI_${fullName}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF: { unit: 'cm', format: 'a4', orientation: 'portrait' }
    }).from(element).save().then(() => {
        document.body.removeChild(element);
    });
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