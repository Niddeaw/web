// sdq_teacher.js — Unified Teacher + Admin (v5)
// รองรับการประเมินแบบ step (ทีละข้อ) สำหรับครู พร้อมแสดงชื่อนักเรียน

let userInfo = null;
let currentSchoolInfo = null;
let systemDataList = [];
let tableInstance = null;

let isTeacher = false;
let isAdmin = false;
let currentMode = '';
let myClassIds = [];

// =================== ตัวแปรสำหรับฟอร์มประเมินครู (step) ===================
let teacherQuestions = [];
let teacherAnswers = {};
let currentTeacherQIndex = 0;
let currentTeacherEnrollment = null;

// ==========================================
// 🚀 เริ่มต้น
// ==========================================
$(document).ready(async function () {
    try {
        await fetchCoreInfo();
        const authorized = await checkAuthAndRoles();
        if (authorized) {
            setupUI();
            await loadData();
            document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');
        }
    } catch (err) {
        console.error("System Error:", err);
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
});

// ==========================================
// 1. ดึงข้อมูลโรงเรียน
// ==========================================
async function fetchCoreInfo() {
    const { data, error } = await db.from('core_school_info').select('*').single();
    if (error) throw error;
    currentSchoolInfo = data;
}

// ==========================================
// 2. ตรวจสอบสิทธิ์
// ==========================================
async function checkAuthAndRoles() {
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError || !user) { window.location.href = 'login.html'; return false; }

    const { data: personnel } = await db.from('core_personnel').select('*').eq('id', user.id).single();
    if (!personnel) { window.location.href = 'index.html'; return false; }

    userInfo = personnel;
    $('#user-display').text(`${personnel.prefix || ''}${personnel.first_name} ${personnel.last_name}`);

    if (['admin', 'super_admin'].includes(personnel.role)) isAdmin = true;
    if (!isAdmin) {
        const { data: modAdmin } = await db.from('core_module_admins').select('id').eq('user_id', user.id).eq('module_id', 'sdq').maybeSingle();
        if (modAdmin) isAdmin = true;
    }

    const { data: classrooms } = await db.from('core_classrooms')
        .select('id, grade_level, room_number')
        .or(`adviser_id_1.eq.${user.id},adviser_id_2.eq.${user.id}`)
        .eq('academic_year', currentSchoolInfo.current_academic_year);
    if (classrooms && classrooms.length > 0) {
        isTeacher = true;
        myClassIds = classrooms.map(c => c.id);
    }

    if (!isAdmin && !isTeacher) {
        await Swal.fire('ปฏิเสธการเข้าถึง', 'คุณไม่มีสิทธิ์ในระบบนี้', 'error');
        window.location.href = 'index.html';
        return false;
    }
    currentMode = isTeacher ? 'teacher' : 'admin';
    return true;
}

function setupUI() {
    if (isAdmin && isTeacher) {
        $('#roleSwitchContainer').html(`<button onclick="toggleMode()" class="flex items-center gap-2 px-4 py-2 bg-purple-50 text-purple-600 hover:bg-purple-100 rounded-xl text-sm font-bold shadow-sm"><i class="fa-solid fa-user-shield sm:mr-1"></i><span class="hidden md:inline">สลับโหมด</span></button>`);
    }
    if (isAdmin) $('#adminManagerBtn').removeClass('hidden');
}

async function toggleMode() {
    currentMode = (currentMode === 'teacher') ? 'admin' : 'teacher';
    await loadData();
}

// ==========================================
// 4. โหลดข้อมูล
// ==========================================
async function loadData() {
    Swal.fire({ title: 'กำลังโหลดข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    systemDataList = [];

    if (currentMode === 'teacher') {
        $('#mode-subtitle').text('Teacher Dashboard').removeClass('text-rose-500').addClass('text-slate-500');
        $('#table-title').html('<i class="fa-solid fa-users mr-2 text-indigo-500"></i> รายชื่อนักเรียนประจำชั้น');
        $('#adminFilters').addClass('hidden');
        if (isAdmin && isTeacher) $('#switch-text').text('สลับไปโหมดแอดมิน');
    } else {
        $('#mode-subtitle').text('Admin Dashboard').removeClass('text-slate-500').addClass('text-rose-500');
        $('#table-title').html('<i class="fa-solid fa-globe mr-2 text-indigo-500"></i> นักเรียนทั้งหมดทุกระดับชั้น');
        $('#adminFilters').removeClass('hidden');
        if (isAdmin && isTeacher) $('#switch-text').text('สลับไปโหมดครู');
    }

    try {
        let classIds = [];
        if (currentMode === 'teacher') {
            classIds = myClassIds;
        } else {
            const { data: allClassrooms, error: cErr } = await db.from('core_classrooms')
                .select('id, grade_level, room_number')
                .eq('academic_year', currentSchoolInfo.current_academic_year)
                .order('grade_level').order('room_number');
            if (cErr) throw cErr;
            classIds = (allClassrooms || []).map(c => c.id);
            populateAdminFilters(allClassrooms || []);
        }

        if (classIds.length === 0) {
            systemDataList = [];
            updateDashboard([]);
            renderTable([]);
            Swal.close();
            return;
        }

        const { data, error } = await db.from('student_enrollments')
            .select(`
                id, student_number, classroom_id,
                core_students (id, prefix, first_name, last_name, student_id_card),
                core_classrooms (grade_level, room_number),
                sdq_assessments (
                    id, total_difficulty_score, assessor_type,
                    score_emotional, score_conduct, score_hyper, score_peer, score_prosocial,
                    created_at, academic_year, semester, q1,q2,q3,q4,q5,q6,q7,q8,q9,q10,
                    q11,q12,q13,q14,q15,q16,q17,q18,q19,q20,q21,q22,q23,q24,q25
                )
            `)
            .in('classroom_id', classIds)
            .order('student_number', { ascending: true });

        if (error) throw error;

        const curYear = currentSchoolInfo.current_academic_year;
        const curSem = currentSchoolInfo.current_semester;
        systemDataList = (data || []).map(item => ({
            ...item,
            sdq_assessments: (item.sdq_assessments || []).filter(a => a.academic_year === curYear && a.semester === curSem)
        }));

        updateDashboard(systemDataList);
        renderTable(systemDataList);
        Swal.close();
    } catch (err) {
        console.error(err);
        Swal.fire('Error', 'ไม่สามารถโหลดข้อมูลได้: ' + err.message, 'error');
    }
}

function populateAdminFilters(classrooms) {
    const grades = [...new Set(classrooms.map(c => c.grade_level))].sort((a,b)=>a-b);
    const rooms = [...new Set(classrooms.map(c => c.room_number))].sort((a,b)=>a-b);
    $('#filterGrade').html('<option value="">ทุกระดับชั้น</option>' + grades.map(g=>`<option value="${g}">ม.${g}</option>`).join(''));
    $('#filterRoom').html('<option value="">ทุกห้อง</option>' + rooms.map(r=>`<option value="${r}">ห้อง ${r}</option>`).join(''));
}

function updateDashboard(data) {
    let stats = { total: data.length, assessed: 0, normal: 0, risk: 0, problem: 0 };
    data.forEach(item => {
        const main = (item.sdq_assessments || []).find(x => x.assessor_type === 'teacher') ||
                     (item.sdq_assessments || []).find(x => x.assessor_type === 'parent') ||
                     (item.sdq_assessments || []).find(x => x.assessor_type === 'student');
        if (main) {
            stats.assessed++;
            const s = main.total_difficulty_score;
            if (s <= 15) stats.normal++;
            else if (s <= 18) stats.risk++;
            else stats.problem++;
        }
    });
    $('#stat-total').text(stats.total);
    $('#stat-assessed').text(stats.assessed);
    $('#stat-normal').text(stats.normal);
    $('#stat-risk').text(stats.risk);
    $('#stat-problem').text(stats.problem);
}

// ==========================================
// 6. Render Table
// ==========================================
function renderTable(data) {
    if (tableInstance) { tableInstance.destroy(); tableInstance = null; }
    const tbody = $('#mainTable tbody');
    const thead = $('#dynamicThead');
    tbody.empty();

    if (currentMode === 'teacher') {
        thead.html(`<tr><th class="p-4">ห้อง</th><th class="p-4">เลขที่</th><th class="p-4">ชื่อ-สกุล</th><th class="p-4 text-center">นร.</th><th class="p-4 text-center">ผปค.</th><th class="p-4 text-center">ครู</th><th class="p-4 text-center">คะแนน(ครู)</th><th class="p-4 text-center">จัดการ</th></tr>`);
    } else {
        thead.html(`<tr><th class="p-4">ชั้น/ห้อง</th><th class="p-4">เลขที่</th><th class="p-4">ชื่อ-สกุล</th><th class="p-4 text-center">นร.</th><th class="p-4 text-center">ผปค.</th><th class="p-4 text-center">ครู</th><th class="p-4 text-center">คะแนนรวม</th><th class="p-4 text-center">สถานะ</th><th class="p-4 text-center">จัดการ</th></tr>`);
    }

    const colSpan = currentMode === 'teacher' ? 8 : 9;
    if (!data || data.length === 0) {
        tbody.append(`<tr><td colspan="${colSpan}" class="p-8 text-center text-slate-400">ไม่พบข้อมูลนักเรียน</td></tr>`);
        tableInstance = $('#mainTable').DataTable({ language: { url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/th.json' }, pageLength: 50, destroy: true });
        return;
    }

    const doneBadge = `<span class="px-2 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-bold border border-emerald-200"><i class="fas fa-check"></i> ทำแล้ว</span>`;
    const pendBadge = `<span class="px-2 py-1 bg-slate-50 text-slate-400 rounded-lg text-[10px] font-bold border border-slate-200">ยังไม่ทำ</span>`;

    data.forEach(item => {
        const student = item.core_students;
        if (!student) return;
        const room = item.core_classrooms;
        const roomTxt = room ? `ม.${room.grade_level}/${room.room_number}` : '-';
        const asmts = item.sdq_assessments || [];
        const teaEval = asmts.find(a => a.assessor_type === 'teacher');
        const parEval = asmts.find(a => a.assessor_type === 'parent');
        const stdEval = asmts.find(a => a.assessor_type === 'student');
        const mainEval = teaEval || parEval || stdEval;
        const stdName = `${student.prefix || ''}${student.first_name} ${student.last_name}`;

        if (currentMode === 'teacher') {
            const actionBtn = teaEval
                ? `<div class="flex gap-2 justify-center">
                    <button onclick="viewSDQ('${item.id}')" class="text-blue-600 hover:text-blue-800" title="ดูผล"><i class="fas fa-eye"></i></button>
                    <button onclick="startTeacherAssessment('${item.id}')" class="text-amber-600 hover:text-amber-800" title="แก้ไขการประเมิน"><i class="fas fa-edit"></i></button>
                   </div>`
                : `<button onclick="startTeacherAssessment('${item.id}')" class="px-3 py-1 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700"><i class="fas fa-edit mr-1"></i> ประเมิน</button>`;
            tbody.append(`<tr><td class="p-3 text-center">${roomTxt}</td><td class="p-3 text-center">${item.student_number}</td><td class="p-3 font-bold">${stdName}</td><td class="p-3 text-center">${stdEval ? doneBadge : pendBadge}</td><td class="p-3 text-center">${parEval ? doneBadge : pendBadge}</td><td class="p-3 text-center">${teaEval ? doneBadge : pendBadge}</td><td class="p-3 text-center font-black">${teaEval ? teaEval.total_difficulty_score : '-'}</td><td class="p-3 text-center">${actionBtn}</td></tr>`);
        } else {
            let scoreTxt = '-', resultBadge = '<span class="px-2 py-1 bg-slate-100 text-slate-500 rounded-lg text-xs">ยังไม่ประเมิน</span>';
            if (mainEval) {
                scoreTxt = `<span class="font-black text-indigo-600">${mainEval.total_difficulty_score}</span>`;
                const sc = mainEval.total_difficulty_score;
                if (sc <= 15) resultBadge = '<span class="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">ปกติ</span>';
                else if (sc <= 18) resultBadge = '<span class="text-xs font-bold text-amber-500 bg-amber-50 px-2 py-1 rounded-lg">เสี่ยง</span>';
                else resultBadge = '<span class="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded-lg">มีปัญหา</span>';
            }
            const actionBtn = `<div class="flex gap-2 justify-center"><button onclick="viewSDQ('${item.id}')" class="text-blue-600"><i class="fas fa-eye"></i></button><button onclick="printStudentSDQ('${item.id}')" class="text-purple-600"><i class="fas fa-print"></i></button><button onclick="deleteAllAssessments('${item.id}')" class="text-rose-500"><i class="fas fa-trash"></i></button></div>`;
            tbody.append(`<tr><td class="p-3 text-center">${roomTxt}</td><td class="p-3 text-center">${item.student_number}</td><td class="p-3 font-bold">${stdName}</td><td class="p-3 text-center">${stdEval ? doneBadge : pendBadge}</td><td class="p-3 text-center">${parEval ? doneBadge : pendBadge}</td><td class="p-3 text-center">${teaEval ? doneBadge : pendBadge}</td><td class="p-3 text-center">${scoreTxt}</td><td class="p-3 text-center">${resultBadge}</td><td class="p-3 text-center">${actionBtn}</td></tr>`);
        }
    });

    tableInstance = $('#mainTable').DataTable({ language: { url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/th.json' }, pageLength: 50, destroy: true });
}

// DataTable filter
$.fn.dataTable.ext.search = [];
$.fn.dataTable.ext.search.push(function(settings, data) {
    if (currentMode !== 'admin') return true;
    const fGrade = $('#filterGrade').val();
    const fRoom = $('#filterRoom').val();
    const classTxt = data[0];
    return (!fGrade || classTxt.includes('ม.'+fGrade+'/')) && (!fRoom || classTxt.endsWith('/'+fRoom));
});
$(document).on('change', '#filterGrade, #filterRoom', function() { if(tableInstance) tableInstance.draw(); });

// ==========================================
// 7. View SDQ (แสดงผลรวม)
// ==========================================
function viewSDQ(enrollmentId) {
    const enrollment = systemDataList.find(e => e.id === enrollmentId);
    if (!enrollment) return Swal.fire('ไม่พบข้อมูล');
    const student = enrollment.core_students;
    const asmts = enrollment.sdq_assessments || [];
    const teaEval = asmts.find(a=>a.assessor_type==='teacher');
    const parEval = asmts.find(a=>a.assessor_type==='parent');
    const stdEval = asmts.find(a=>a.assessor_type==='student');
    const stdName = `${student.prefix||''}${student.first_name} ${student.last_name}`;
    const room = enrollment.core_classrooms;
    const roomTxt = room ? `ม.${room.grade_level}/${room.room_number}` : '';

    function row(label, ev) {
        if(!ev) return `<tr><td class="py-2 px-3 font-bold">${label}</td><td colspan="6" class="text-center text-slate-400">ยังไม่ประเมิน</td></tr>`;
        const sc = ev.total_difficulty_score;
        const color = sc<=15?'emerald':sc<=18?'amber':'rose';
        return `<tr><td class="py-2 px-3 font-bold">${label}</td><td class="text-center">${ev.score_emotional}</td><td class="text-center">${ev.score_conduct}</td><td class="text-center">${ev.score_hyper}</td><td class="text-center">${ev.score_peer}</td><td class="text-center">${ev.score_prosocial}</td><td class="text-center font-black text-${color}-600">${sc}</td></tr>`;
    }
    Swal.fire({
        title: `📋 ผลประเมิน SDQ`,
        html: `<p class="font-bold text-indigo-600">${stdName}</p><p class="text-slate-500 text-sm mb-2">${roomTxt}</p><div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-slate-100"><tr><th>ผู้ประเมิน</th><th>อารมณ์</th><th>ประพฤติ</th><th>ไม่อยู่นิ่ง</th><th>เพื่อน</th><th>สังคม</th><th>รวม</th></tr></thead><tbody>${row('🧑 นักเรียน',stdEval)}${row('👨‍👩‍👧 ผู้ปกครอง',parEval)}${row('👩‍🏫 ครู',teaEval)}</tbody></table></div>`,
        width: '650px', showConfirmButton: currentMode==='admin', confirmButtonText: '<i class="fas fa-print"></i> พิมพ์', showCancelButton: true, cancelButtonText: 'ปิด'
    }).then(res => { if(res.isConfirmed) printStudentSDQ(enrollmentId); });
}

// ==========================================
// 8. ลบการประเมินทั้งหมด (admin)
// ==========================================
async function deleteAllAssessments(enrollmentId) {
    const confirm = await Swal.fire({ title: 'ยืนยันลบทั้งหมด?', text: 'จะลบทุกผู้ประเมิน', icon:'warning', showCancelButton:true, confirmButtonColor:'#ef4444', confirmButtonText:'ลบ' });
    if(confirm.isConfirmed){
        const {error} = await db.from('sdq_assessments').delete().eq('enrollment_id', enrollmentId);
        if(error) Swal.fire('ผิดพลาด',error.message,'error');
        else { Swal.fire('สำเร็จ','','success'); loadData(); }
    }
}

// ==========================================
// 9. พิมพ์รายงานรายบุคคล
// ==========================================
async function printStudentSDQ(enrollmentId) {
    const enrollment = systemDataList.find(e=>e.id===enrollmentId);
    if(!enrollment) return;
    const student = enrollment.core_students;
    const asmts = enrollment.sdq_assessments || [];
    const tea = asmts.find(a=>a.assessor_type==='teacher');
    const par = asmts.find(a=>a.assessor_type==='parent');
    const std = asmts.find(a=>a.assessor_type==='student');
    const name = `${student.prefix||''}${student.first_name} ${student.last_name}`;
    const room = enrollment.core_classrooms;
    const roomTxt = room ? `ม.${room.grade_level}/${room.room_number}` : '-';
    const school = currentSchoolInfo?.school_name || 'โรงเรียน';
    const getStatus = (s) => s<=15?{text:'ปกติ',color:'#10b981'}:s<=18?{text:'เสี่ยง',color:'#f59e0b'}:{text:'มีปัญหา',color:'#ef4444'};
    const primary = tea||par||std;
    const overall = primary ? getStatus(primary.total_difficulty_score) : {text:'ยังไม่ประเมิน',color:'#94a3b8'};
    const buildRow = (assess,label) => {
        if(!assess) return `<tr><td>${label}</td><td colspan="7" class="text-center">-</td></tr>`;
        const s = getStatus(assess.total_difficulty_score);
        return `<tr><td>${label}</td><td class="text-center">${assess.score_emotional}</td><td class="text-center">${assess.score_conduct}</td><td class="text-center">${assess.score_hyper}</td><td class="text-center">${assess.score_peer}</td><td class="text-center">${assess.score_prosocial}</td><td class="text-center font-bold">${assess.total_difficulty_score}</td><td class="text-center" style="color:${s.color}">${s.text}</td></tr>`;
    };
    const div = document.createElement('div');
    div.innerHTML = `<div style="font-family:'Sarabun',sans-serif;padding:20px;max-width:800px;margin:auto;background:white;"><div style="text-align:center"><div style="font-size:16px;font-weight:bold;color:#4f46e5">${school}</div><div>รายงานผล SDQ</div></div><div style="text-align:center;border-bottom:1px solid #ccc;margin-bottom:10px"><h2>${name}</h2><p>${roomTxt} | ปี ${currentSchoolInfo?.current_academic_year} เทอม ${currentSchoolInfo?.current_semester}</p></div><h3>คะแนนรายด้าน</h3><table style="width:100%;border-collapse:collapse;border:1px solid #ddd"><thead><tr><th>ผู้ประเมิน</th><th>อารมณ์</th><th>ประพฤติ</th><th>ไม่อยู่นิ่ง</th><th>เพื่อน</th><th>สังคม</th><th>รวม</th><th>สถานะ</th></tr></thead><tbody>${buildRow(std,'นักเรียน')}${buildRow(par,'ผู้ปกครอง')}${buildRow(tea,'ครู')}</tbody></table><div style="text-align:center;margin-top:15px;background:${overall.color}15;padding:10px"><div>สรุปภาพรวม</div><div style="font-size:24px;font-weight:bold;color:${overall.color}">${primary?primary.total_difficulty_score+'/40':'-'}</div><span style="background:${overall.color};color:white;padding:4px 16px;border-radius:20px">${overall.text}</span></div><div style="text-align:center;font-size:9px;color:#aaa;margin-top:10px">พิมพ์ ${new Date().toLocaleDateString('th-TH')}</div></div>`;
    document.body.appendChild(div);
    await html2pdf().set({ margin:[0.5,0.5,0.5,0.5], filename: `SDQ_${name}.pdf`, image:{type:'jpeg',quality:0.95}, html2canvas:{scale:2}, jsPDF:{unit:'in',format:'a4',orientation:'portrait'} }).from(div).save();
    setTimeout(()=>div.remove(),500);
}

// ==========================================
// 10. พิมพ์สรุปภาพรวม
// ==========================================
async function printSummaryPDF() {
    if(systemDataList.length===0) return Swal.fire('ไม่มีข้อมูล');
    const school = currentSchoolInfo?.school_name || 'โรงเรียน';
    const modeTitle = currentMode==='admin'? 'ภาพรวมทุกระดับชั้น' : 'ห้องที่ปรึกษา';
    let normal=0, risk=0, problem=0, none=0, rows='';
    systemDataList.forEach((item,idx)=>{
        const s = item.core_students;
        const room = item.core_classrooms;
        const roomTxt = room ? `ม.${room.grade_level}/${room.room_number}` : '-';
        const asmts = item.sdq_assessments || [];
        const tea = asmts.find(a=>a.assessor_type==='teacher');
        const par = asmts.find(a=>a.assessor_type==='parent');
        const std = asmts.find(a=>a.assessor_type==='student');
        const main = tea||par||std;
        let score='-', status='ยังไม่ประเมิน', color='#94a3b8';
        if(main){
            score = main.total_difficulty_score;
            if(score<=15){ normal++; status='ปกติ'; color='#10b981'; }
            else if(score<=18){ risk++; status='เสี่ยง'; color='#f59e0b'; }
            else { problem++; status='มีปัญหา'; color='#ef4444'; }
        } else { none++; }
        rows += `<tr style="background:${idx%2===0?'#f8fafc':'white'}"><td class="p-2 text-center">${idx+1}</td><td class="p-2 text-center">${roomTxt}</td><td class="p-2">${s?`${s.prefix||''}${s.first_name} ${s.last_name}`:''}</td><td class="p-2 text-center">${tea?'✓':'-'}</td><td class="p-2 text-center">${par?'✓':'-'}</td><td class="p-2 text-center">${std?'✓':'-'}</td><td class="p-2 text-center font-bold">${score}</td><td class="p-2 text-center" style="color:${color}">${status}</td></tr>`;
    });
    const div = document.createElement('div');
    div.innerHTML = `<div style="font-family:'Sarabun',sans-serif;padding:20px"><div style="text-align:center"><div style="font-size:18px;font-weight:bold">${school}</div><div>สรุปผล SDQ - ${modeTitle}</div><div>ปี ${currentSchoolInfo?.current_academic_year} เทอม ${currentSchoolInfo?.current_semester}</div></div><div style="display:flex;gap:10px;justify-content:center;margin:15px 0"><div style="background:#f0fdf4;padding:5px 15px;border-radius:10px"><div>ปกติ</div><div style="font-size:22px;font-weight:bold;color:#10b981">${normal}</div></div><div style="background:#fffbeb;padding:5px 15px;border-radius:10px"><div>เสี่ยง</div><div style="font-size:22px;font-weight:bold;color:#f59e0b">${risk}</div></div><div style="background:#fff1f2;padding:5px 15px;border-radius:10px"><div>มีปัญหา</div><div style="font-size:22px;font-weight:bold;color:#ef4444">${problem}</div></div><div style="background:#f8fafc;padding:5px 15px;border-radius:10px"><div>ยังไม่ประเมิน</div><div style="font-size:22px;font-weight:bold;color:#94a3b8">${none}</div></div></div><table style="width:100%;border-collapse:collapse;border:1px solid #ddd;font-size:10px"><thead><tr style="background:#e0e7ff"><th>#</th><th>ห้อง</th><th>ชื่อ</th><th>ครู</th><th>ผปค.</th><th>นร.</th><th>คะแนน</th><th>สถานะ</th></tr></thead><tbody>${rows}</tbody></table><div style="text-align:center;font-size:9px;margin-top:10px">พิมพ์ ${new Date().toLocaleDateString('th-TH')}</div></div>`;
    document.body.appendChild(div);
    await html2pdf().set({ margin:[0.4,0.4,0.4,0.4], filename: `SDQ_Summary_${currentSchoolInfo?.current_academic_year}.pdf`, image:{type:'jpeg',quality:0.95}, html2canvas:{scale:2}, jsPDF:{unit:'in',format:'a4',orientation:'landscape'} }).from(div).save();
    setTimeout(()=>div.remove(),500);
}

// ==========================================
// 11. Export Excel
// ==========================================
function exportExcel() {
    if(!systemDataList.length) return Swal.fire('ไม่มีข้อมูล');
    const data = systemDataList.map(item=>{
        const s = item.core_students;
        const room = item.core_classrooms;
        const roomTxt = room?`ม.${room.grade_level}/${room.room_number}`:'-';
        const asmts = item.sdq_assessments||[];
        const tea = asmts.find(a=>a.assessor_type==='teacher');
        const par = asmts.find(a=>a.assessor_type==='parent');
        const std = asmts.find(a=>a.assessor_type==='student');
        if(currentMode==='teacher'){
            return { 'ห้อง':roomTxt, 'เลขที่':item.student_number, 'ชื่อ-สกุล':`${s.prefix||''}${s.first_name} ${s.last_name}`, 'นร.':std?'แล้ว':'ยัง', 'ผปค.':par?'แล้ว':'ยัง', 'ครู':tea?'แล้ว':'ยัง', 'คะแนนครู':tea?.total_difficulty_score||'-' };
        } else {
            const main = tea||par||std;
            return { 'ชั้น/ห้อง':roomTxt, 'เลขที่':item.student_number, 'รหัส':s?.student_id_card, 'ชื่อ':`${s.prefix||''}${s.first_name} ${s.last_name}`, 'คะแนนนร.':std?.total_difficulty_score||'-', 'คะแนนผปค.':par?.total_difficulty_score||'-', 'คะแนนครู':tea?.total_difficulty_score||'-', 'อารมณ์':main?.score_emotional||'-', 'ประพฤติ':main?.score_conduct||'-', 'สมาธิสั้น':main?.score_hyper||'-', 'เพื่อน':main?.score_peer||'-', 'สังคม':main?.score_prosocial||'-' };
        }
    });
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.writeFile(XLSX.utils.book_new(), ws, `SDQ_${currentMode}_${currentSchoolInfo?.current_academic_year}.xlsx`);
}

// ==========================================
// 12. ฟังก์ชันประเมินครู (step)
// ==========================================
function loadTeacherQuestions() {
    if(teacherQuestions.length) return;
    teacherQuestions = [
        { id:1, text:"ห่วงใยความรู้สึกคนอื่น", cat:"prosocial", reverse:false },
        { id:2, text:"อยู่นิ่งไม่ได้ นั่งไม่ติดที่", cat:"hyper", reverse:false },
        { id:3, text:"มักจะบ่นว่าปวดหัว ปวดท้อง หรือไม่สบาย", cat:"emotional", reverse:false },
        { id:4, text:"เต็มใจแบ่งปันสิ่งของให้เพื่อน", cat:"prosocial", reverse:false },
        { id:5, text:"มักจะอาละวาด หรือโมโหร้าย", cat:"conduct", reverse:false },
        { id:6, text:"ค่อนข้างแยกตัว ชอบเล่นคนเดียว", cat:"peer", reverse:false },
        { id:7, text:"เชื่อฟัง มักจะทำตามที่ผู้ใหญ่ต้องการ", cat:"conduct", reverse:true },
        { id:8, text:"กังวลใจหลายเรื่อง ดูวิตกกังวลเสมอ", cat:"emotional", reverse:false },
        { id:9, text:"เป็นที่พึ่งได้เวลาคนอื่นเสียใจ", cat:"prosocial", reverse:false },
        { id:10, text:"ยุกยิก กระสับกระส่าย", cat:"hyper", reverse:false },
        { id:11, text:"มีเพื่อนสนิทอย่างน้อยหนึ่งคน", cat:"peer", reverse:true },
        { id:12, text:"มักจะมีเรื่องทะเลาะวิวาทกับเด็กคนอื่น", cat:"conduct", reverse:false },
        { id:13, text:"ดูไม่มีความสุข ร้องไห้บ่อย", cat:"emotional", reverse:false },
        { id:14, text:"เป็นที่ชื่นชอบของเพื่อนๆ", cat:"peer", reverse:true },
        { id:15, text:"วอกแวกง่าย ขาดสมาธิ", cat:"hyper", reverse:false },
        { id:16, text:"ขี้กลัว ไม่กล้าแสดงออก", cat:"emotional", reverse:false },
        { id:17, text:"ใจดีกับเด็กที่เล็กกว่า", cat:"prosocial", reverse:false },
        { id:18, text:"มักจะถูกเด็กคนอื่นแกล้งหรือรังแก", cat:"peer", reverse:false },
        { id:19, text:"มักจะโกหกหรือขี้โกง", cat:"conduct", reverse:false },
        { id:20, text:"อาสาช่วยเหลือคนอื่นเสมอ", cat:"prosocial", reverse:false },
        { id:21, text:"คิดก่อนทำ", cat:"hyper", reverse:true },
        { id:22, text:"แอบเอาของคนอื่น", cat:"conduct", reverse:false },
        { id:23, text:"เข้ากับผู้ใหญ่ได้ดีกว่าเด็กวัยเดียวกัน", cat:"peer", reverse:false },
        { id:24, text:"ขี้ขลาด", cat:"emotional", reverse:false },
        { id:25, text:"ทำงานจนเสร็จ มีความตั้งใจ", cat:"hyper", reverse:true }
    ];
}

async function startTeacherAssessment(enrollmentId) {
    const enrollment = systemDataList.find(e => e.id === enrollmentId);
    if (!enrollment) { Swal.fire('ไม่พบข้อมูลนักเรียน'); return; }
    const student = enrollment.core_students;
    const room = enrollment.core_classrooms;
    const studentName = `${student.prefix || ''}${student.first_name} ${student.last_name}`;
    const roomText = room ? `ม.${room.grade_level}/${room.room_number}` : '-';
    currentTeacherEnrollment = enrollment;
    
    loadTeacherQuestions();
    // ตรวจสอบการประเมินเดิม
    const existingAssess = (enrollment.sdq_assessments || []).find(a => a.assessor_type === 'teacher');
    if (existingAssess) {
        const confirm = await Swal.fire({
            title: 'พบการประเมินเดิม',
            text: `นักเรียน ${studentName} (${roomText}) มีการประเมินโดยครูแล้ว คุณต้องการแก้ไขหรือทำใหม่?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'แก้ไขข้อมูลเดิม',
            cancelButtonText: 'ทำใหม่ (ลบข้อมูลเดิม)',
            confirmButtonColor: '#f59e0b',
            cancelButtonColor: '#ef4444'
        });
        if (confirm.isConfirmed) {
            // โหลดคำตอบเดิม
            teacherAnswers = {};
            for (let i = 1; i <= 25; i++) {
                const val = existingAssess[`q${i}`];
                if (val !== undefined && val !== null) teacherAnswers[i] = val;
            }
        } else {
            // ลบการประเมินเดิม
            const { error } = await db.from('sdq_assessments').delete().eq('id', existingAssess.id);
            if (error) { Swal.fire('ผิดพลาด', 'ไม่สามารถลบข้อมูลเดิมได้', 'error'); return; }
            teacherAnswers = {};
        }
    } else {
        teacherAnswers = {};
    }
    currentTeacherQIndex = 0;
    // แสดงข้อมูลในฟอร์ม
    $('#teacherAssessStudentName').text(studentName);
    $('#teacherAssessRoomInfo').text(roomText);
    renderTeacherQuestion();
    $('#teacherStepForm').removeClass('hidden').css('display','flex');
}

function renderTeacherQuestion() {
    const q = teacherQuestions[currentTeacherQIndex];
    $('#teacherQuestionText').text(`${q.id}. ${q.text}`);
    const percent = Math.round(((currentTeacherQIndex) / 25) * 100);
    $('#teacherProgressBar').css('width', `${percent}%`);
    $('#teacherProgressText').text(`ข้อที่ ${currentTeacherQIndex + 1} / 25`);
    $('#teacherPercentText').text(`${percent}%`);
    $('input[name="teacherChoice"]').prop('checked', false);
    if (teacherAnswers[q.id] !== undefined) {
        $(`input[name="teacherChoice"][value="${teacherAnswers[q.id]}"]`).prop('checked', true);
        $('#teacherBtnNext').removeClass('hidden');
    } else {
        $('#teacherBtnNext').addClass('hidden');
    }
    $('#teacherBtnPrev').toggleClass('hidden', currentTeacherQIndex === 0);
    if (currentTeacherQIndex === 24 && teacherAnswers[q.id] !== undefined) {
        $('#teacherBtnSubmit').removeClass('hidden');
        $('#teacherBtnNext').addClass('hidden');
    } else {
        $('#teacherBtnSubmit').addClass('hidden');
    }
}

function teacherSelectAnswer(val) {
    const q = teacherQuestions[currentTeacherQIndex];
    teacherAnswers[q.id] = parseInt(val);
    $('#teacherBtnNext').removeClass('hidden');
    if (currentTeacherQIndex === 24) {
        $('#teacherBtnSubmit').removeClass('hidden');
        $('#teacherBtnNext').addClass('hidden');
    } else {
        setTimeout(() => teacherNavQuestion(1), 300);
    }
}

function teacherNavQuestion(step) {
    currentTeacherQIndex += step;
    renderTeacherQuestion();
}

function closeTeacherStepForm() {
    $('#teacherStepForm').addClass('hidden').css('display','none');
}

async function submitTeacherAssessment() {
    if (Object.keys(teacherAnswers).length < 25) {
        Swal.fire('แจ้งเตือน', 'กรุณาตอบคำถามให้ครบทุกข้อ', 'warning');
        return;
    }
    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    let scores = { emotional:0, conduct:0, hyper:0, peer:0, prosocial:0 };
    teacherQuestions.forEach(q => {
        let val = teacherAnswers[q.id] || 0;
        if (q.reverse) val = val === 0 ? 2 : (val === 2 ? 0 : 1);
        scores[q.cat] += val;
    });
    const totalScore = scores.emotional + scores.conduct + scores.hyper + scores.peer;
    const payload = {
        student_id: currentTeacherEnrollment.core_students?.id,
        enrollment_id: currentTeacherEnrollment.id,
        academic_year: currentSchoolInfo.current_academic_year,
        semester: currentSchoolInfo.current_semester,
        assessor_type: 'teacher',
        score_emotional: scores.emotional,
        score_conduct: scores.conduct,
        score_hyper: scores.hyper,
        score_peer: scores.peer,
        score_prosocial: scores.prosocial,
        total_difficulty_score: totalScore,
        created_at: new Date().toISOString()
    };
    for (let i=1; i<=25; i++) payload[`q${i}`] = teacherAnswers[i] || 0;
    const { error } = await db.from('sdq_assessments').upsert(payload, { onConflict: 'enrollment_id, assessor_type' });
    if (error) {
        Swal.fire('Error', error.message, 'error');
    } else {
        Swal.fire('บันทึกสำเร็จ!', '', 'success');
        closeTeacherStepForm();
        await loadData();
    }
}

// ==========================================
// 13. Logout
// ==========================================
function logout() {
    Swal.fire({ title:'ออกจากระบบ?', icon:'warning', showCancelButton:true, confirmButtonColor:'#ef4444', confirmButtonText:'ออกจากระบบ', cancelButtonText:'ยกเลิก' })
        .then(async r => { if(r.isConfirmed){ await db.auth.signOut(); window.location.href='login.html'; } });
}

// ==========================================
// 14. จัดการแอดมิน (ย่อเพื่อความกระชับ แต่ใช้ได้จริง)
// ==========================================
async function openAdminManager() { document.getElementById('adminManagerModal').classList.remove('hidden'); await Promise.all([loadPersonnelOptions(), loadCurrentAdmins()]); }
function closeAdminManager() { document.getElementById('adminManagerModal').classList.add('hidden'); }

async function loadPersonnelOptions() {
    try {
        const { data: currentAdmins } = await db
            .from('core_module_admins')
            .select('user_id')
            .eq('module_id', 'sdq');

        const adminUserIds = currentAdmins ? currentAdmins.map(a => a.user_id) : [];

        const { data: personnel, error } = await db
            .from('core_personnel')
            .select(`id, prefix, first_name, last_name, position, department`)
            .order('first_name', { ascending: true });

        if (error) throw error;

        const select = document.getElementById('personnelSelect');
        select.innerHTML = '';

        if (select.tomselect) {
            select.tomselect.destroy();
        }

        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = '-- เลือกบุคลากร --';
        select.appendChild(emptyOption);

        if (personnel) {
            personnel.forEach(p => {
                if (adminUserIds.includes(p.id)) return;

                const fullName = `${p.prefix || ''}${p.first_name} ${p.last_name}`;
                const dept = p.department ? ` [${p.department}]` : '';
                const pos = p.position ? ` - ${p.position}` : '';

                const option = document.createElement('option');
                option.value = p.id;
                option.textContent = `${fullName}${pos}${dept}`;
                select.appendChild(option);
            });
        }

        new TomSelect(select, {
            placeholder: 'ค้นหาชื่อครู/บุคลากร...',
            allowEmptyOption: true,
            plugins: ['clear_button'],
            maxOptions: null,
            dropdownParent: 'body',
            render: {
                option: function (data, escape) {
                    return `<div>${escape(data.text)}</div>`;
                },
                no_results: function () {
                    return '<div class="no-results">ไม่พบบุคลากร</div>';
                }
            }
        });

    } catch (err) {
        console.error('Load personnel error:', err);
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถโหลดรายชื่อบุคลากรได้', 'error');
    }
}

async function loadCurrentAdmins() {
    try {
        const { data: moduleAdmins, error: adminError } = await db
            .from('core_module_admins')
            .select(`
                id,
                user_id,
                created_at,
                core_personnel!inner (
                    id,
                    prefix,
                    first_name,
                    last_name,
                    position,
                    department
                )
            `)
            .eq('module_id', 'sdq');

        if (adminError) throw adminError;

        const { data: superAdmins, error: superError } = await db
            .from('core_personnel')
            .select('id, prefix, first_name, last_name, position, department')
            .eq('role', 'super_admin');

        if (superError) throw superError;

        const adminListDiv = document.getElementById('adminList');

        let html = '';
        let totalCount = 0;

        if (superAdmins && superAdmins.length > 0) {
            superAdmins.forEach(admin => {
                const fullName = `${admin.prefix || ''}${admin.first_name} ${admin.last_name}`;
                const dept = admin.department || '';
                const pos = admin.position || '';

                html += `
                    <div class="flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-800 flex items-center justify-center">
                                <i class="fa-solid fa-crown text-amber-600"></i>
                            </div>
                            <div>
                                <div class="font-bold text-slate-800 dark:text-white">${fullName}</div>
                                <div class="text-xs text-slate-500">${pos}${dept ? ` · ${dept}` : ''}</div>
                                <span class="inline-block mt-1 px-2 py-0.5 bg-amber-100 dark:bg-amber-800 text-amber-700 dark:text-amber-300 text-xs rounded-full font-bold">
                                    <i class="fa-solid fa-star mr-1"></i>Super Admin
                                </span>
                            </div>
                        </div>
                        <span class="text-xs text-slate-400">ถาวร</span>
                    </div>
                `;
                totalCount++;
            });
        }

        if (moduleAdmins && moduleAdmins.length > 0) {
            moduleAdmins.forEach(admin => {
                const p = admin.core_personnel;
                const fullName = `${p.prefix || ''}${p.first_name} ${p.last_name}`;
                const dept = p.department || '';
                const pos = p.position || '';
                const createdDate = admin.created_at
                    ? new Date(admin.created_at).toLocaleDateString('th-TH')
                    : 'ไม่ระบุ';

                html += `
                    <div class="flex items-center justify-between p-4 bg-white dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
                                <i class="fa-solid fa-user-shield text-indigo-600"></i>
                            </div>
                            <div>
                                <div class="font-bold text-slate-800 dark:text-white">${fullName}</div>
                                <div class="text-xs text-slate-500">${pos}${dept ? ` · ${dept}` : ''}</div>
                                <span class="inline-block mt-1 px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs rounded-full font-medium">
                                    <i class="fa-solid fa-clock mr-1"></i>ตั้งแต่ ${createdDate}
                                </span>
                            </div>
                        </div>
                        <button onclick="removeSDQAdmin('${admin.id}', '${fullName}')" 
                                class="px-3 py-2 bg-rose-50 hover:bg-rose-100 dark:bg-rose-900/20 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 rounded-lg text-sm font-bold transition-colors">
                            <i class="fa-solid fa-trash mr-1"></i>ถอดถอน
                        </button>
                    </div>
                `;
                totalCount++;
            });
        }

        if (html === '') {
            html = `
                <div class="text-center text-slate-400 py-8">
                    <i class="fa-solid fa-user-slash text-3xl mb-2"></i>
                    <p>ยังไม่มีผู้ดูแลระบบ SDQ</p>
                </div>
            `;
        }

        adminListDiv.innerHTML = html;
        document.getElementById('adminCount').textContent = `(${totalCount} คน)`;
    } catch (err) {
        console.error('Load admins error:', err);
        document.getElementById('adminList').innerHTML = `
            <div class="text-center text-rose-400 py-8">
                <i class="fa-solid fa-triangle-exclamation text-3xl mb-2"></i>
                <p>ไม่สามารถโหลดข้อมูลได้</p>
                <p class="text-xs mt-1">${err.message}</p>
            </div>
        `;
    }
}

async function addSDQAdmin() {
    const select = document.getElementById('personnelSelect');
    const personnelId = select.tomselect ? select.tomselect.getValue() : select.value;

    if (!personnelId || personnelId === '') {
        return Swal.fire('กรุณาเลือก', 'กรุณาเลือกครู/บุคลากรก่อน', 'warning');
    }

    try {
        const { data: personnel, error: personnelError } = await db
            .from('core_personnel')
            .select('id, email, prefix, first_name, last_name')
            .eq('id', personnelId)
            .single();

        if (personnelError || !personnel) {
            return Swal.fire('ข้อผิดพลาด', 'ไม่พบข้อมูลบุคลากร', 'error');
        }

        const userId = personnel.id;

        const { data: existing, error: existingError } = await db
            .from('core_module_admins')
            .select('id')
            .eq('user_id', userId)
            .eq('module_id', 'sdq')
            .maybeSingle();

        if (existingError) {
            console.error('Check existing error:', existingError);
            return Swal.fire('ข้อผิดพลาด', 'ไม่สามารถตรวจสอบข้อมูลได้', 'error');
        }

        if (existing) {
            return Swal.fire('ซ้ำซ้อน', 'บุคลากรนี้เป็นผู้ดูแล SDQ อยู่แล้ว', 'info');
        }

        const { error: insertError } = await db
            .from('core_module_admins')
            .insert({
                user_id: userId,
                module_id: 'sdq',
                created_at: new Date().toISOString()
            });

        if (insertError) throw insertError;

        Swal.fire({
            icon: 'success',
            title: 'แต่งตั้งสำเร็จ!',
            text: `${personnel.prefix || ''}${personnel.first_name} ${personnel.last_name} มีสิทธิ์จัดการระบบ SDQ แล้ว`,
            timer: 2000,
            showConfirmButton: false
        });

        if (select.tomselect) {
            select.tomselect.clear();
        }

        await loadCurrentAdmins();
        await loadPersonnelOptions();

    } catch (err) {
        console.error('Add admin error:', err);
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถเพิ่มผู้ดูแลได้: ' + err.message, 'error');
    }
}

async function removeSDQAdmin(adminId, adminName) {
    const result = await Swal.fire({
        title: 'ยืนยันการถอดถอน?',
        html: `คุณต้องการถอดถอน <strong>${adminName}</strong> จากการเป็นผู้ดูแลระบบ SDQ ใช่หรือไม่?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonText: 'ยกเลิก',
        confirmButtonText: '<i class="fa-solid fa-trash mr-1"></i> ถอดถอน'
    });

    if (!result.isConfirmed) return;

    try {
        const { error } = await db
            .from('core_module_admins')
            .delete()
            .eq('id', adminId);

        if (error) throw error;

        Swal.fire({
            icon: 'success',
            title: 'ถอดถอนสำเร็จ!',
            text: `${adminName} ไม่มีสิทธิ์จัดการระบบ SDQ แล้ว`,
            timer: 2000,
            showConfirmButton: false
        });

        await loadCurrentAdmins();
        await loadPersonnelOptions();
    } catch (err) {
        console.error('Remove admin error:', err);
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถถอดถอนได้: ' + err.message, 'error');
    }
}