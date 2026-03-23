// ==========================================
// ไฟล์ guidance_teacher.js (ระบบครูผู้สอนแนะแนว)
// ==========================================

let currentUserProfile = null;
let globalSystemSettings = null;
let globalGuidanceSettings = null;
let myClasses = []; 
let globalSelectedClass = null; 
let globalStudents = [];
let globalAttendance = [];
let globalScores = [];
let globalAttributes = [];
let weekDatesArray = [];
let globalIsSystemOpen = true; 

const ATTR_COLS = ['1.1', '1.2', '1.3', '1.4', '2.1', '2.2', '3.1', '4.1', '4.2', '4.3', '4.4', '4.5'];
const SCORE_COLS = ['ครั้งที่ 1', 'ครั้งที่ 2', 'ครั้งที่ 3', 'ครั้งที่ 4', 'ครั้งที่ 5', 'Pretest', 'Posttest'];

window.onload = async () => { await checkAuth(); };

async function checkAuth() {
    const { data: { session } } = await db.auth.getSession();
    if (session) {
        const { data: profile } = await db.from('core_personnel').select('*').eq('id', session.user.id).single();
        const { data: isGui } = await db.from('guidance_teachers').select('*').eq('teacher_id', session.user.id).single();
        const isTeacherMode = localStorage.getItem('activeMode') === 'teacher';

        // เช็คสิทธิ์ว่าเป็น Admin แนะแนวไหม
        let isGuidanceAdmin = false;
        if (profile && profile.role === 'super_admin') isGuidanceAdmin = true;
        if (profile && profile.role === 'admin') {
            const { data: modAdmin } = await db.from('core_module_admins').select('module_id').eq('user_id', session.user.id).eq('module_id', 'guidance').single();
            if(modAdmin) isGuidanceAdmin = true;
        }

        // ถ้าเป็นแอดมินแนะแนว และไม่ได้กดสลับโหมดมา ให้เด้งไปหน้าแอดมินอัตโนมัติ
        if (isGuidanceAdmin && !isTeacherMode) { 
            window.location.replace('guidance_admin.html'); return; 
        }
        
        if (!isGui) {
            await Swal.fire('ปฏิเสธการเข้าถึง', 'คุณยังไม่ได้รับสิทธิ์เป็นครูแนะแนว', 'error');
            window.location.replace('index.html'); return;
        }
        
        document.getElementById('dashboardView').classList.remove('hidden');
        document.getElementById('dashboardMain').classList.remove('hidden');
        document.getElementById('dashboardMain').classList.add('flex');
        
        await initDashboard(session.user.id, profile);

        if (isGuidanceAdmin) {
            addAdminSwitchButton();
        }
    } else { 
        window.location.replace('index.html'); 
    }
}

function addAdminSwitchButton() {
    let headerRightMenu = document.querySelector('#dashboardView .flex.items-center.gap-2.mt-3');
    if(headerRightMenu && !document.getElementById('btnSwitchAdmin')) {
        const btn = document.createElement('button');
        btn.id = 'btnSwitchAdmin';
        btn.className = 'text-sm font-bold text-purple-700 hover:text-purple-800 transition-colors flex items-center gap-1.5 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg border border-purple-200';
        btn.innerHTML = '<i class="fa-solid fa-user-shield"></i> <span class="hidden md:inline">โหมดแอดมิน</span>';
        btn.onclick = () => {
            localStorage.removeItem('activeMode');
            window.location.replace('guidance_admin.html');
        };
        headerRightMenu.insertBefore(btn, headerRightMenu.firstChild);
    }
}

function handleLogout() {
    Swal.fire({ title: 'ออกจากระบบ?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626' })
    .then(async (result) => { 
        if (result.isConfirmed) { 
            localStorage.removeItem('activeMode');
            await db.auth.signOut(); 
            window.location.replace('index.html'); 
        } 
    });
}

async function initDashboard(userId, profile) {
    currentUserProfile = profile; 
    document.getElementById('userNameDisplay').innerText = `สวัสดี, ครู${profile.first_name}`;
    
    const { data: sysInfo } = await db.from('core_school_info').select('*').single();
    globalSystemSettings = sysInfo || {};
    const currentSemester = sysInfo?.current_semester || '1', currentYear = sysInfo?.current_academic_year || '2569';
    
    const { data: guiInfo } = await db.from('guidance_settings').select('*').single();
    globalGuidanceSettings = guiInfo || {};

    document.getElementById('infoSubject').innerText = `วิชา: ${guiInfo?.subject_name || 'กิจกรรมแนะแนว'}`; 
    document.getElementById('infoTerm').innerText = `ภาคเรียน: ${currentSemester}/${currentYear}`; 
    document.getElementById('infoDirector').innerText = `ผู้อำนวยการ: ${sysInfo?.director_name || '-'}`;
    
    const { data: mod } = await db.from('core_system_modules').select('is_active').eq('module_id', 'guidance').single();
    globalIsSystemOpen = mod ? mod.is_active : true;
    
    if (globalIsSystemOpen) {
        document.getElementById('systemClosedBanner')?.classList.add('hidden');
    } else {
        document.getElementById('systemClosedBanner')?.classList.remove('hidden');
        document.getElementById('btnSaveAll').classList.replace('bg-brand-600', 'bg-gray-500');
        document.getElementById('btnSaveAll').innerHTML = '<i class="fa-solid fa-lock"></i> ระบบปิดการบันทึก';
    }
    
    const { data: mapped } = await db.from('guidance_classes')
        .select('classroom_id, start_date, core_classrooms(id, grade_level, room_number, semester, academic_year)')
        .eq('teacher_id', userId);
        
    if (mapped) {
        myClasses = mapped.filter(m => m.core_classrooms.semester === currentSemester && m.core_classrooms.academic_year === currentYear)
                          .map(m => ({ id: m.classroom_id, grade: m.core_classrooms.grade_level, room: m.core_classrooms.room_number, start_date: m.start_date }))
                          .sort((a,b) => a.grade - b.grade || a.room - b.room);
    }
    
    const select = document.getElementById('classSelect');
    select.innerHTML = '<option value="">-- กรุณาเลือกห้อง --</option>'; 
    myClasses.forEach(cls => select.innerHTML += `<option value="${cls.id}">ม.${cls.grade}/${cls.room}</option>`);

    await updateClassStatusBadges();
}

function switchTab(tabId, btnElement) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active')); btnElement.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active')); document.getElementById(tabId).classList.add('active');
}

async function updateClassStatusBadges() {
    const container = document.getElementById('classStatusContainer');
    if (!myClasses.length) return;

    const badgePromises = myClasses.map(async (cls) => {
        const { data: enrolls, count: n_std } = await db.from('student_enrollments').select('student_id', { count: 'exact' }).eq('classroom_id', cls.id);
        if (!n_std || n_std === 0) return { cls, isComplete: false, isEmpty: true };

        const stdIds = enrolls.map(e => e.student_id);
        const [attRes, attrRes] = await Promise.all([
            db.from('guidance_attendance').select('*', { count: 'exact', head: true }).eq('classroom_id', cls.id),
            db.from('guidance_attributes').select('*', { count: 'exact', head: true }).in('student_id', stdIds)
        ]);

        const isComplete = (attRes.count >= n_std * 20) && (attrRes.count >= n_std * 12);
        return { cls, isComplete, isEmpty: false };
    });

    const results = await Promise.all(badgePromises);

    container.innerHTML = results.map(res => {
        let badgeClass = res.isEmpty ? 'bg-gray-100 text-gray-500' : (res.isComplete ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-600');
        let icon = res.isEmpty ? '⚪' : (res.isComplete ? '🟢' : '🔴');
        return `<button onclick="document.getElementById('classSelect').value='${res.cls.id}'; loadAllData();" class="px-3 py-1.5 rounded-lg text-sm font-bold border ${badgeClass}">${icon} ม.${res.cls.grade}/${res.cls.room}</button>`;
    }).join('');
}

async function loadAllData() {
    const classId = document.getElementById('classSelect').value; if (!classId) return;
    Swal.fire({ title: 'กำลังโหลดข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    globalSelectedClass = myClasses.find(c => c.id === classId);
    const startDateDisplay = document.getElementById('startDateDisplay');
    if (globalSelectedClass.start_date) { 
        startDateDisplay.innerHTML = `📅 วันที่เริ่มสอน: <b>${new Date(globalSelectedClass.start_date).toLocaleDateString('th-TH', { dateStyle: 'full' })}</b>`; 
        startDateDisplay.className = 'text-sm font-bold text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200'; 
        const startObj = new Date(globalSelectedClass.start_date);
        weekDatesArray = Array.from({length: 20}, (_, i) => { let d = new Date(startObj); d.setDate(startObj.getDate() + (i * 7)); return d; });
    } else { 
        startDateDisplay.innerHTML = `⚠️ ยังไม่ได้กำหนดวันที่เริ่มสอน`; startDateDisplay.className = 'text-sm font-bold text-red-600 bg-red-50 px-3 py-1.5 rounded-lg border border-red-200'; 
        weekDatesArray = Array.from({length: 20}, () => null);
    }
    
    const { data: stds } = await db.from('student_enrollments')
        .select(`id, student_number, status, student_id, core_students(student_id_card, prefix, first_name, last_name)`)
        .eq('classroom_id', classId).order('student_number');
    
    globalStudents = stds ? stds.map(s => ({
        id: s.student_id, student_number: s.student_number, student_id_card: s.core_students.student_id_card,
        prefix: s.core_students.prefix, first_name: s.core_students.first_name, last_name: s.core_students.last_name, student_status: s.status
    })) : [];

    const stdIds = globalStudents.map(s => s.id);
    const { data: att } = await db.from('guidance_attendance').select('*').eq('classroom_id', classId); 
    globalAttendance = att || [];
    
    if (stdIds.length > 0) {
        const { data: scrs } = await db.from('guidance_scores').select('*').in('student_id', stdIds); globalScores = scrs || [];
        const { data: attrs } = await db.from('guidance_attributes').select('*').in('student_id', stdIds); globalAttributes = attrs || [];
    } else { globalScores = []; globalAttributes = []; }
    
    renderAttendanceTab(); renderScoresTab(); renderAttributesTab();
    Swal.close();
}

function selectColor(el) { if(el) el.setAttribute('data-val', el.value); }
function calcAttTotal(stdId) { let t = 0; for(let w=1;w<=20;w++){ const s = document.getElementById(`att_${stdId}_w${w}`); if(s && s.value==='มา') t++; } document.getElementById(`att_total_${stdId}`).innerText = t; calcAttr(stdId, t); }
function calcScoreTotal(stdId) { let t = 0; for(let i=1;i<=5;i++){ const v = document.getElementById(`sc_${stdId}_ครั้งที่ ${i}`)?.value; if(v) t += parseFloat(v); } document.getElementById(`sc_total_${stdId}`).innerText = t; }
function calcAttr(stdId, attTotal) {
    let pass = true; ATTR_COLS.forEach(c => { const el=document.getElementById(`at_${stdId}_${c}`); if(el){ selectColor(el); if(el.value==="0") pass=false; } });
    const p1 = document.getElementById(`at_sum1_${stdId}`), p2 = document.getElementById(`at_sum2_${stdId}`), p3 = document.getElementById(`at_sum3_${stdId}`);
    if(p1) p1.innerHTML = pass ? '<span class="text-blue-600 font-bold">ผ</span>' : '<span class="text-red-600 font-bold">มผ</span>';
    if(p2) p2.innerHTML = attTotal>=16 ? '<span class="text-indigo-600 font-bold">ผ</span>' : '<span class="text-red-600 font-bold">มผ</span>';
    if(p3) p3.innerHTML = (pass && attTotal>=16) ? '<span class="text-emerald-600 font-bold">ผ</span>' : '<span class="text-red-600 font-bold">มผ</span>';
}

function renderAttendanceTab() {
    const tbody = document.getElementById('tb-attendance'), tr1 = document.getElementById('att-header-row-1'), tr2 = document.getElementById('att-header-row-2');
    if(!globalStudents.length) { tbody.innerHTML = '<tr><td colspan="24" class="p-8 text-center text-gray-400">ยังไม่มีนักเรียนในห้องนี้ (ติดต่อแอดมิน)</td></tr>'; return; }
    document.querySelectorAll('.dynamic-th').forEach(el => el.remove()); const targetTh = tr1.children[2]; 
    weekDatesArray.forEach((d, i) => {
        const th1 = document.createElement('th'); th1.className = 'dynamic-th w-16 px-1'; th1.innerText = `ส.${i+1}`; tr1.insertBefore(th1, targetTh); 
        const th2 = document.createElement('th'); th2.className = 'dynamic-th p-1 text-[10px]'; th2.innerText = d ? d.toLocaleDateString('th-TH',{day:'numeric',month:'short'}) : '-รอตั้งค่า-'; tr2.appendChild(th2);
    });
    const lockAttr = globalIsSystemOpen ? '' : 'disabled class="opacity-60 bg-gray-100"';
    tbody.innerHTML = globalStudents.map(std => {
        const myAtt = globalAttendance.filter(a => a.student_id === std.id);
        const drops = Array.from({length:20}, (_,i) => {
            const w=i+1, v = myAtt.find(a=>a.week_number===w)?.status || 'มา';
            return `<td class="p-1"><select id="att_${std.id}_w${w}" class="tiny-select w-full" data-val="${v}" onchange="selectColor(this); calcAttTotal('${std.id}')" ${lockAttr}><option value="มา" ${v==='มา'?'selected':''}>มา</option><option value="ป่วย" ${v==='ป่วย'?'selected':''}>ป่วย</option><option value="ลา" ${v==='ลา'?'selected':''}>ลา</option><option value="ขาด" ${v==='ขาด'?'selected':''}>ขาด</option></select></td>`;
        }).join('');
        return `<tr><td class="col-no">${std.student_number}</td><td class="col-name">${std.prefix}${std.first_name} ${std.last_name}</td>${drops}<td class="font-bold text-green-700 bg-green-50 border-l-2 border-green-200" id="att_total_${std.id}">0</td><td class="p-1 bg-gray-50 border-l-2 border-gray-300 text-center font-bold text-sm">${std.student_status}</td></tr>`;
    }).join('');
    globalStudents.forEach(std => calcAttTotal(std.id));
}

function renderScoresTab() {
    const tbody = document.getElementById('tb-scores'); if(!globalStudents.length) return;
    const lockAttr = globalIsSystemOpen ? '' : 'disabled class="opacity-60 bg-gray-100"';
    tbody.innerHTML = globalStudents.map(std => {
        const mySc = globalScores.filter(s => s.student_id === std.id);
        const inps = SCORE_COLS.map(c => {
            const v = mySc.find(s=>s.column_name===c)?.score_value ?? '';
            return `<td><input type="number" id="sc_${std.id}_${c}" class="w-full text-center ${lockAttr}" value="${v}" oninput="calcScoreTotal('${std.id}')" ${lockAttr}></td>`;
        });
        inps.splice(5, 0, `<td class="font-bold text-green-700 bg-green-50 border-l-2 border-green-200" id="sc_total_${std.id}">0</td>`);
        return `<tr><td class="col-no">${std.student_number}</td><td class="col-name">${std.prefix}${std.first_name} ${std.last_name}</td>${inps.join('')}</tr>`;
    }).join('');
    globalStudents.forEach(std => calcScoreTotal(std.id));
}

function renderAttributesTab() {
    const tbody = document.getElementById('tb-attributes'); if(!globalStudents.length) return;
    const lockAttr = globalIsSystemOpen ? '' : 'disabled class="opacity-60 bg-gray-100"';
    tbody.innerHTML = globalStudents.map(std => {
        const myAt = globalAttributes.filter(a => a.student_id === std.id);
        const drops = ATTR_COLS.map(c => {
            const v = myAt.find(a=>a.attribute_name===c)?.score ?? 1;
            return `<td class="p-1"><select id="at_${std.id}_${c}" class="tiny-select w-full" data-val="${v}" onchange="calcAttTotal('${std.id}')" ${lockAttr}><option value="1" ${v===1?'selected':''}>ผ</option><option value="0" ${v===0?'selected':''}>มผ</option></select></td>`;
        }).join('');
        return `<tr><td class="col-no">${std.student_number}</td><td class="col-name">${std.prefix}${std.first_name} ${std.last_name}</td>${drops}<td class="bg-blue-50/50 border-l-2 border-gray-300 text-center" id="at_sum1_${std.id}"></td><td class="bg-indigo-50/50 border-l border-gray-300 text-center" id="at_sum2_${std.id}"></td><td class="bg-emerald-50/50 border-l-2 border-emerald-300 text-center" id="at_sum3_${std.id}"></td></tr>`;
    }).join('');
    globalStudents.forEach(std => calcAttTotal(std.id));
}

async function saveAllData() {
    if (!globalIsSystemOpen) return Swal.fire('ผิดพลาด', 'ระบบถูกปิดการบันทึกแล้ว', 'error');
    const classId = globalSelectedClass.id;
    Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    
    try {
        const attToUpsert = [], scToUpsert = [], atToUpsert = [];
        globalStudents.forEach(std => {
            for(let w=1; w<=20; w++) {
                const s = document.getElementById(`att_${std.id}_w${w}`);
                if(s && weekDatesArray[w-1]) attToUpsert.push({ student_id: std.id, classroom_id: classId, week_number: w, status: s.value, check_date: weekDatesArray[w-1].toISOString().split('T')[0] });
            }
            SCORE_COLS.forEach(c => { const v = document.getElementById(`sc_${std.id}_${c}`)?.value; if(v!=='') scToUpsert.push({ student_id: std.id, column_name: c, score_value: parseFloat(v) }); });
            ATTR_COLS.forEach(c => { const s = document.getElementById(`at_${std.id}_${c}`); if(s) atToUpsert.push({ student_id: std.id, attribute_name: c, score: parseInt(s.value) }); });
        });

        if(attToUpsert.length > 0) await db.from('guidance_attendance').upsert(attToUpsert, { onConflict: 'student_id, week_number' });
        if(scToUpsert.length > 0) await db.from('guidance_scores').upsert(scToUpsert, { onConflict: 'student_id, column_name' });
        if(atToUpsert.length > 0) await db.from('guidance_attributes').upsert(atToUpsert, { onConflict: 'student_id, attribute_name' });

        await updateClassStatusBadges();
        Swal.fire({ icon: 'success', title: 'บันทึกเรียบร้อย!', timer: 1500, showConfirmButton: false });
    } catch (err) { Swal.fire('เกิดข้อผิดพลาด', err.message, 'error'); }
}

function printPDF_v7() {
    if(!globalSelectedClass || globalStudents.length === 0) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกห้องเรียนและตรวจสอบให้แน่ใจว่ามีข้อมูลนักเรียน', 'warning');
    
    const sysInfo = globalSystemSettings || { current_semester: '1', current_academic_year: '2569', school_name: 'โรงเรียนวัดไร่ขิงวิทยา' };
    const guiInfo = globalGuidanceSettings || { subject_name: 'กิจกรรมแนะแนว', head_guidance: '' };
    
    const term = sysInfo.current_semester;
    const year = sysInfo.current_academic_year;
    const school = sysInfo.school_name;
    const className = `ม.${globalSelectedClass.grade}/${globalSelectedClass.room}`;
    
    let trRows = globalStudents.map((std, i) => {
        return `<tr>
            <td class="col-center">${i+1}</td>
            <td class="col-left">${std.student_id_card || '-'}</td>
            <td class="col-left">${std.prefix}${std.first_name} ${std.last_name}</td>
            <td class="col-center"></td>
            <td class="col-center"></td>
        </tr>`;
    }).join('');

    const page1 = `
    <div class="page-break" style="padding: 20px;">
        <h3 style="text-align:center; font-weight:bold; font-size:16pt; margin-bottom: 20px;">แบบบันทึกผลการประเมินกิจกรรมพัฒนาผู้เรียน (${guiInfo.subject_name})</h3>
        <table style="width:100%; border:none; margin-bottom: 10px; font-size:12pt;">
            <tr>
                <td style="border:none; text-align:left;">ภาคเรียนที่ ${term} ปีการศึกษา ${year}</td>
                <td style="border:none; text-align:right;">ระดับชั้น ${className}</td>
            </tr>
            <tr>
                <td style="border:none; text-align:left;" colspan="2">สถานศึกษา ${school}</td>
            </tr>
        </table>
        <table class="print-table">
            <thead>
                <tr>
                    <th style="width:50px;">ลำดับ</th>
                    <th style="width:120px;">เลขประจำตัว</th>
                    <th>ชื่อ - นามสกุล</th>
                    <th style="width:100px;">เวลาเรียน (ผ/มผ)</th>
                    <th style="width:100px;">ผลการประเมิน</th>
                </tr>
            </thead>
            <tbody>${trRows}</tbody>
        </table>
        <div style="margin-top: 30px; display:flex; justify-content: space-around; font-size:11pt; text-align:center;">
            <div>ลงชื่อ...................................................ครูผู้สอน<br>(...................................................)</div>
            <div>ลงชื่อ...................................................หัวหน้างานแนะแนว<br>(${guiInfo.head_guidance || '...................................................'})</div>
        </div>
    </div>`;

    const stylePrint = `
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap');
            #print-wrapper { font-family: 'Sarabun', sans-serif !important; color: #000 !important; background: #fff !important; }
            #print-wrapper table, #print-wrapper th, #print-wrapper td, #print-wrapper tr { background-color: #ffffff !important; color: #000000 !important; }
            #print-wrapper .col-center { text-align: center !important; vertical-align: middle !important; padding: 4px; }
            #print-wrapper .col-left { text-align: left !important; padding-left: 6px !important; vertical-align: middle !important; padding: 4px; }
            .print-table { width: 100%; border-collapse: collapse; font-size: 11pt; border: 1px solid #000;}
            .print-table th, .print-table td { border: 1px solid #000; }
            .page-break { page-break-after: always; }
        </style>
    `;

    document.getElementById('print-area').innerHTML = stylePrint + `<div id="print-wrapper">${page1}</div>`;
    setTimeout(() => { window.print(); }, 500);
}

function exportExcelAll() {
    if(!globalSelectedClass || globalStudents.length === 0) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกห้องเรียนและต้องมีนักเรียนก่อนทำการส่งออก', 'warning');
    const wb = XLSX.utils.book_new();

    const attData = [['เลขที่', 'รหัสนักเรียน', 'ชื่อ', 'นามสกุล', ...Array.from({length:20}, (_,i)=>`ส.${i+1}`)]];
    globalStudents.forEach(std => {
        const row = [std.student_number, std.student_id_card, std.first_name, std.last_name];
        for(let w=1; w<=20; w++) {
            const el = document.getElementById(`att_${std.id}_w${w}`);
            row.push(el ? el.value : '');
        }
        attData.push(row);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(attData), "เวลาเรียน");

    const scData = [['เลขที่', 'รหัสนักเรียน', 'ชื่อ', 'นามสกุล', ...SCORE_COLS]];
    globalStudents.forEach(std => {
        const row = [std.student_number, std.student_id_card, std.first_name, std.last_name];
        SCORE_COLS.forEach(c => {
            const el = document.getElementById(`sc_${std.id}_${c}`);
            row.push(el ? el.value : '');
        });
        scData.push(row);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(scData), "คะแนน");

    const attrData = [['เลขที่', 'รหัสนักเรียน', 'ชื่อ', 'นามสกุล', ...ATTR_COLS]];
    globalStudents.forEach(std => {
        const row = [std.student_number, std.student_id_card, std.first_name, std.last_name];
        ATTR_COLS.forEach(c => {
            const el = document.getElementById(`at_${std.id}_${c}`);
            row.push(el ? (el.value==='1'?'ผ':'มผ') : '');
        });
        attrData.push(row);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(attrData), "คุณลักษณะ");

    XLSX.writeFile(wb, `ปพ5_แนะแนว_ม.${globalSelectedClass.grade}-${globalSelectedClass.room}.xlsx`);
}

async function importExcelAll(event) {
    const file = event.target.files[0];
    if(!file) return;
    Swal.fire({ title: 'กำลังดึงข้อมูลจาก Excel...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});

            if(workbook.Sheets["เวลาเรียน"]) {
                const rows = XLSX.utils.sheet_to_json(workbook.Sheets["เวลาเรียน"]);
                rows.forEach(row => {
                    const std = globalStudents.find(s => s.student_id_card == row['รหัสนักเรียน']);
                    if(std) {
                        for(let w=1; w<=20; w++) {
                            const el = document.getElementById(`att_${std.id}_w${w}`);
                            if(el && row[`ส.${w}`]) { el.value = row[`ส.${w}`]; selectColor(el); }
                        }
                        calcAttTotal(std.id);
                    }
                });
            }

            if(workbook.Sheets["คะแนน"]) {
                const rows = XLSX.utils.sheet_to_json(workbook.Sheets["คะแนน"]);
                rows.forEach(row => {
                    const std = globalStudents.find(s => s.student_id_card == row['รหัสนักเรียน']);
                    if(std) {
                        SCORE_COLS.forEach(c => {
                            const el = document.getElementById(`sc_${std.id}_${c}`);
                            if(el && row[c] !== undefined) el.value = row[c];
                        });
                        calcScoreTotal(std.id);
                    }
                });
            }

            if(workbook.Sheets["คุณลักษณะ"]) {
                const rows = XLSX.utils.sheet_to_json(workbook.Sheets["คุณลักษณะ"]);
                rows.forEach(row => {
                    const std = globalStudents.find(s => s.student_id_card == row['รหัสนักเรียน']);
                    if(std) {
                        ATTR_COLS.forEach(c => {
                            const el = document.getElementById(`at_${std.id}_${c}`);
                            if(el && row[c] !== undefined) { el.value = (row[c] === 'ผ' || row[c] == 1) ? '1' : '0'; selectColor(el); }
                        });
                        calcAttTotal(std.id);
                    }
                });
            }

            Swal.fire({ icon: 'success', title: 'นำเข้าสำเร็จ!', text: 'ข้อมูลอยู่บนหน้าจอแล้ว กรุณากด "บันทึกข้อมูล" เพื่อเก็บลงฐานข้อมูล' });
        } catch(err) {
            Swal.fire('ผิดพลาด', 'รูปแบบไฟล์ไม่ถูกต้อง หรือหาชีตข้อมูลไม่พบ', 'error');
        }
        event.target.value = '';
    };
    reader.readAsArrayBuffer(file);
}