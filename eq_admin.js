/**
 * eq_admin.js — Admin EQ Dashboard
 * CRUD | Import (Excel/Sheets) | Export | PDF | Settings
 */
let currentUser = null;
let schoolInfo = null;
let eqTable = null;
let allResults = [];
let allClassrooms = [];
let importMode = 'excel';

/* ── INIT ─────────────────────────────────────────── */
window.addEventListener('load', async () => {
    const { data: { user } } = await db.auth.getUser();
    if (!user) { window.location.href = 'index.html'; return; }

    const { data: p } = await db.from('core_personnel').select('*').eq('id', user.id).single();
    if (!p || (p.role !== 'admin' && p.role !== 'super_admin')) {
        Swal.fire('ไม่มีสิทธิ์', '', 'warning').then(() => window.location.href = 'index.html'); return;
    }
    currentUser = p;
    document.getElementById('user-display').textContent = `${p.prefix || ''}${p.first_name} ${p.last_name}`;

    if (p.role === 'super_admin') document.getElementById('btn-settings').classList.remove('hidden');

    const { data: si } = await db.from('core_school_info').select('*').single();
    schoolInfo = si;

    // โหลด settings
    if (si) {
        const { data: s } = await db.from('eq_settings')
            .select('*').eq('academic_year', si.current_academic_year).eq('semester', si.current_semester).maybeSingle();
        if (s) {
            document.getElementById('set-delay').value = s.delay_seconds;
            document.getElementById('set-active').checked = s.is_active;
        }
    }

    await loadClassrooms();
    await loadResults();
    await loadStats();
});

/* ── CLASSROOMS ─────────────────────────────────────── */
async function loadClassrooms() {
    const grade = document.getElementById('sel-grade').value;
    let q = db.from('core_classrooms').select('id, grade_level, room_number')
        .eq('academic_year', schoolInfo?.current_academic_year)
        .eq('semester', schoolInfo?.current_semester) /* 🌟 เพิ่มบรรทัดนี้: กรองเฉพาะภาคเรียนปัจจุบัน */
        .order('grade_level').order('room_number');
    if (grade) q = q.eq('grade_level', grade);

    const { data } = await q;
    allClassrooms = data || [];
    const sel = document.getElementById('sel-classroom');
    sel.innerHTML = `<option value="">-- ทุกห้อง --</option>` +
        allClassrooms.map(r => `<option value="${r.id}">ม.${r.grade_level}/${r.room_number}</option>`).join('');
}

/* ── STATS ──────────────────────────────────────────── */
async function loadStats() {
    const { data: eqs } = await db.from('eq_assessments')
        .select('level_total')
        .eq('academic_year', schoolInfo?.current_academic_year)
        .eq('semester', schoolInfo?.current_semester);

    const total = eqs?.length || 0;
    const high  = eqs?.filter(e => e.level_total === 'สูงกว่าเกณฑ์').length || 0;
    const mid   = eqs?.filter(e => e.level_total === 'ตามเกณฑ์').length || 0;
    const low   = eqs?.filter(e => e.level_total === 'ต่ำกว่าเกณฑ์').length || 0;

    const { data: allStd } = await db.from('core_students').select('id');
    const stdTotal = allStd?.length || 0;
    const pct = stdTotal > 0 ? Math.round(total / stdTotal * 100) : 0;

    document.getElementById('stat-cards').innerHTML = [
        { icon:'fa-users',        label:'นักเรียนทั้งหมด',    val:stdTotal, color:'slate' },
        { icon:'fa-check-circle', label:'ประเมินแล้ว',         val:`${total} (${pct}%)`, color:'indigo' },
        { icon:'fa-arrow-up',     label:'สูงกว่าเกณฑ์',       val:high, color:'green' },
        { icon:'fa-equals',       label:'ตามเกณฑ์',           val:mid,  color:'blue' },
        { icon:'fa-arrow-down',   label:'ต่ำกว่าเกณฑ์',       val:low,  color:'rose' },
        { icon:'fa-clock',        label:'ยังไม่ประเมิน',       val:stdTotal - total, color:'amber' },
    ].map(s => `
        <div class="glass rounded-2xl p-4 flex items-center gap-3 shadow-sm">
            <div class="h-11 w-11 bg-${s.color}-100 text-${s.color}-600 rounded-xl flex items-center justify-center flex-shrink-0">
                <i class="fas ${s.icon}"></i>
            </div>
            <div><p class="text-slate-400 text-[10px] font-bold uppercase">${s.label}</p>
            <h3 class="text-2xl font-bold text-slate-800">${s.val}</h3></div>
        </div>`).join('');
}

/* ── LOAD RESULTS ───────────────────────────────────── */
async function loadResults() {
    Swal.fire({ title: 'กำลังโหลด...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    const classroomId = document.getElementById('sel-classroom').value;

    let roomIds = [];
    if (classroomId) {
        roomIds = [classroomId];
    } else {
        const grade = document.getElementById('sel-grade').value;
        let q = db.from('core_classrooms').select('id')
            .eq('academic_year', schoolInfo?.current_academic_year);
        if (grade) q = q.eq('grade_level', grade);
        const { data } = await q;
        roomIds = (data || []).map(r => r.id);
    }

    let eqMap = {};
    if (roomIds.length > 0) {
        const { data: eqs } = await db.from('eq_assessments')
            .select('*')
            .eq('academic_year', schoolInfo?.current_academic_year)
            .eq('semester', schoolInfo?.current_semester)
            .in('classroom_id', roomIds);
        (eqs || []).forEach(e => { eqMap[e.student_id] = e; });
    }

    const { data: enrolls } = await db.from('student_enrollments')
        .select('student_id, student_number, classroom_id, core_students(prefix, first_name, last_name, student_id_card), core_classrooms(grade_level, room_number)')
        .in('classroom_id', roomIds.length ? roomIds : ['none'])
        .order('student_number');

    Swal.close();
    allResults = (enrolls || []).map(e => ({ ...e, eq: eqMap[e.student_id] || null }));
    renderTable(allResults);
}

/* ── RENDER TABLE ───────────────────────────────────── */
function levelBadge(level) {
    if (!level) return '<span class="text-slate-300 text-xs">-</span>';
    const cls = level === 'สูงกว่าเกณฑ์' ? 'bg-green-100 text-green-700' :
                level === 'ตามเกณฑ์'     ? 'bg-blue-100 text-blue-700'  : 'bg-red-100 text-red-700';
    return `<span class="text-xs font-bold px-2 py-0.5 rounded-full ${cls}">${level}</span>`;
}

function renderTable(rows) {
    if (eqTable) { eqTable.destroy(); eqTable = null; }
    const tbody = document.getElementById('eq-tbody');
    tbody.innerHTML = rows.map(r => {
        const eq = r.eq;
        const std = r.core_students;
        const cls = r.core_classrooms;
        const fullName = `${std?.prefix || ''}${std?.first_name || ''} ${std?.last_name || ''}`;
        const sc = k => eq ? `<span class="font-semibold">${eq[`score_${k}`]}</span>` : '<span class="text-slate-300">-</span>';
        const actions = eq
            ? `<div class="flex gap-1 justify-center">
                <button onclick='openEdit(${JSON.stringify({...r}).replace(/'/g,"&#39;")})' class="h-7 w-7 rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100 flex items-center justify-center" title="แก้ไข"><i class="fas fa-pen text-xs"></i></button>
                <button onclick="printStudentPdf(${JSON.stringify({...r}).replace(/'/g,"&#39;")})" class="h-7 w-7 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 flex items-center justify-center" title="PDF"><i class="fas fa-print text-xs"></i></button>
                <button onclick="deleteResult('${r.student_id}')" class="h-7 w-7 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 flex items-center justify-center" title="ลบ"><i class="fas fa-trash text-xs"></i></button>
               </div>`
            : '<span class="text-slate-300 text-xs">ยังไม่ประเมิน</span>';
        return `<tr>
            <td class="text-center text-sm">${cls ? `ม.${cls.grade_level}/${cls.room_number}` : '-'}</td>
            <td class="text-center font-bold text-slate-400">${r.student_number}</td>
            <td class="font-semibold text-slate-700 text-sm">${fullName}</td>
            <td class="text-center">${sc('self_aware')}</td>
            <td class="text-center">${sc('self_control')}</td>
            <td class="text-center">${sc('motivation')}</td>
            <td class="text-center">${sc('empathy')}</td>
            <td class="text-center">${sc('social')}</td>
            <td class="text-center font-bold text-lg text-slate-800">${eq?.score_total || '-'}</td>
            <td class="text-center">${levelBadge(eq?.level_total)}</td>
            <td>${actions}</td>
        </tr>`;
    }).join('');

    eqTable = new DataTable('#eq-table', {
        language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
        responsive: true, scrollX: true, pageLength: 25,
        columnDefs: [{ orderable: false, targets: [10] }],
    });
}

/* ── EDIT ────────────────────────────────────────────── */
function openEdit(rowData) {
    const eq = rowData.eq;
    const std = rowData.core_students;
    document.getElementById('edit-student-id').value = rowData.student_id;
    document.getElementById('edit-student-name').textContent = `${std?.prefix || ''}${std?.first_name || ''} ${std?.last_name || ''}`;
    document.getElementById('edit-self-aware').value = eq?.score_self_aware || '';
    document.getElementById('edit-self-control').value = eq?.score_self_control || '';
    document.getElementById('edit-motivation').value = eq?.score_motivation || '';
    document.getElementById('edit-empathy').value = eq?.score_empathy || '';
    document.getElementById('edit-social').value = eq?.score_social || '';
    document.getElementById('edit-note').value = eq?.note || '';
    document.getElementById('edit-modal').classList.remove('hidden');
    document.getElementById('edit-modal').classList.add('flex');
}

function closeEditModal() {
    document.getElementById('edit-modal').classList.add('hidden');
    document.getElementById('edit-modal').classList.remove('flex');
}

async function saveEdit() {
    const studentId = document.getElementById('edit-student-id').value;
    const sa = parseInt(document.getElementById('edit-self-aware').value);
    const sc = parseInt(document.getElementById('edit-self-control').value);
    const mo = parseInt(document.getElementById('edit-motivation').value);
    const em = parseInt(document.getElementById('edit-empathy').value);
    const so = parseInt(document.getElementById('edit-social').value);
    const note = document.getElementById('edit-note').value;

    const getLevel = (score, max) => {
        const pct = score / max * 100;
        return pct >= 80 ? 'สูงกว่าเกณฑ์' : pct >= 60 ? 'ตามเกณฑ์' : 'ต่ำกว่าเกณฑ์';
    };
    const total = sa + sc + mo + em + so;

    const payload = {
        score_self_aware: sa, score_self_control: sc, score_motivation: mo,
        score_empathy: em, score_social: so, score_total: total,
        level_self_aware: getLevel(sa, 33), level_self_control: getLevel(sc, 30),
        level_motivation: getLevel(mo, 27), level_empathy: getLevel(em, 30),
        level_social: getLevel(so, 36), level_total: getLevel(total, 156),
        recorder_id: currentUser.id, note
    };

    const { error } = await db.from('eq_assessments').update(payload)
        .eq('student_id', studentId)
        .eq('academic_year', schoolInfo.current_academic_year)
        .eq('semester', schoolInfo.current_semester);

    if (error) { Swal.fire('บันทึกไม่สำเร็จ', error.message, 'error'); return; }
    Swal.fire({ icon: 'success', title: 'บันทึกแล้ว!', timer: 1500, showConfirmButton: false });
    closeEditModal();
    loadResults();
    loadStats();
}

/* ── DELETE ──────────────────────────────────────────── */
async function deleteResult(studentId) {
    const r = await Swal.fire({
        title: 'ลบผลการประเมิน?', icon: 'warning',
        showCancelButton: true, confirmButtonColor: '#dc2626',
        confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก'
    });
    if (!r.isConfirmed) return;
    await db.from('eq_assessments').delete()
        .eq('student_id', studentId)
        .eq('academic_year', schoolInfo.current_academic_year)
        .eq('semester', schoolInfo.current_semester);
    Swal.fire({ icon: 'success', title: 'ลบแล้ว', timer: 1400, showConfirmButton: false });
    loadResults(); loadStats();
}

/* ── EXPORT ──────────────────────────────────────────── */
function exportExcel() {
    if (!allResults.length) return Swal.fire('ไม่มีข้อมูล', '', 'info');
    const rows = allResults.map(r => {
        const std = r.core_students;
        const cls = r.core_classrooms;
        const eq = r.eq;
        return {
            'ห้องเรียน': cls ? `ม.${cls.grade_level}/${cls.room_number}` : '-',
            'เลขที่': r.student_number,
            'ชื่อ-สกุล': `${std?.prefix || ''}${std?.first_name || ''} ${std?.last_name || ''}`,
            'รหัสนักเรียน': std?.student_id_card || '-',
            'ตระหนักรู้ตนเอง': eq?.score_self_aware || '-',
            'ควบคุมตนเอง': eq?.score_self_control || '-',
            'สร้างแรงจูงใจ': eq?.score_motivation || '-',
            'เห็นใจผู้อื่น': eq?.score_empathy || '-',
            'ทักษะสัมพันธภาพ': eq?.score_social || '-',
            'รวม': eq?.score_total || '-',
            'ระดับรวม': eq?.level_total || 'ยังไม่ประเมิน',
        };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.max(k.length + 4, 14) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'EQ');
    XLSX.writeFile(wb, `EQ_Admin_${new Date().toLocaleDateString('th-TH').replace(/\//g,'-')}.xlsx`);
}

/* ── PRINT PDF ───────────────────────────────────────── */
function printStudentPdf(rowData) {
    const std = rowData.core_students;
    const fullName = `${std?.prefix || ''}${std?.first_name || ''} ${std?.last_name || ''}`;
    const eq = rowData.eq;
    if (!eq) return Swal.fire('ยังไม่มีผล', 'นักเรียนยังไม่ได้ประเมิน EQ', 'info');

    Swal.fire({ title: 'กำลังสร้าง PDF...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const dimRows = EQ_DIMENSIONS.map(dim => {
        const score = eq[`score_${dim.key}`];
        const level = eq[`level_${dim.key}`];
        const color = level === 'สูงกว่าเกณฑ์' ? '#15803d' : level === 'ตามเกณฑ์' ? '#1d4ed8' : '#b91c1c';
        return `<tr style="border-bottom:1px solid #e2e8f0">
            <td style="padding:8px 12px;font-size:13px">${dim.label}</td>
            <td style="padding:8px 12px;text-align:center;font-weight:700">${score} / ${dim.maxScore}</td>
            <td style="padding:8px 12px;text-align:center;color:${color};font-weight:700">${level}</td>
        </tr>`;
    }).join('');

    const html = `<div style="font-family:'Anuphan',sans-serif;padding:30px 40px">
        <h2 style="text-align:center;color:#312e81;font-size:20px">รายงานผลการประเมิน EQ</h2>
        <p style="text-align:center;color:#64748b;font-size:13px">แบบประเมิน EQ กรมสุขภาพจิต (อายุ 12–17 ปี)</p>
        <div style="background:#f8fafc;border-radius:12px;padding:16px;margin:20px 0">
            <p style="margin:0;font-size:14px"><b>ชื่อ-สกุล:</b> ${fullName}</p>
            <p style="margin:4px 0 0;font-size:13px;color:#64748b">บันทึกโดย: ${currentUser ? `${currentUser.prefix || ''}${currentUser.first_name} ${currentUser.last_name}` : 'ระบบ'}</p>
        </div>
        <div style="text-align:center;background:${eq.level_total==='สูงกว่าเกณฑ์'?'#dcfce7':eq.level_total==='ตามเกณฑ์'?'#dbeafe':'#fee2e2'};border-radius:12px;padding:20px;margin-bottom:20px">
            <p style="font-size:28px;font-weight:900;margin:0">${eq.score_total} <span style="font-size:16px;font-weight:400;color:#64748b">/ 156</span></p>
            <p style="font-weight:700;margin:4px 0 0">ระดับ: ${eq.level_total}</p>
        </div>
        <table style="width:100%;border-collapse:collapse">
            <thead><tr style="background:#312e81;color:white">
                <th style="padding:10px 12px;text-align:left">ด้าน</th>
                <th style="padding:10px 12px;text-align:center">คะแนน</th>
                <th style="padding:10px 12px;text-align:center">ระดับ</th>
            </tr></thead>
            <tbody>${dimRows}</tbody>
        </table>
        ${eq.note ? `<div style="margin-top:16px;background:#fef9c3;border-radius:8px;padding:12px;font-size:13px"><b>หมายเหตุ:</b> ${eq.note}</div>` : ''}
        <p style="font-size:11px;color:#94a3b8;text-align:center;margin-top:24px">พิมพ์โดยระบบ WRK School Management System</p>
    </div>`;

    Swal.close();
    const el = document.createElement('div');
    el.innerHTML = html;
    html2pdf().set({
        margin: 5, filename: `EQ_${fullName}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(el).save();
}

/* ── IMPORT ──────────────────────────────────────────── */
function openImportModal() {
    document.getElementById('import-modal').classList.remove('hidden');
    document.getElementById('import-modal').classList.add('flex');
}
function closeImportModal() {
    document.getElementById('import-modal').classList.add('hidden');
    document.getElementById('import-modal').classList.remove('flex');
}
function setImportMode(mode) {
    importMode = mode;
    document.getElementById('import-excel-section').classList.toggle('hidden', mode !== 'excel');
    document.getElementById('import-sheets-section').classList.toggle('hidden', mode !== 'sheets');
    document.getElementById('tab-excel').className = `flex-1 py-2 rounded-xl font-bold text-sm ${mode==='excel'?'bg-amber-500 text-white':'bg-slate-100 text-slate-600'}`;
    document.getElementById('tab-sheets').className = `flex-1 py-2 rounded-xl font-bold text-sm ${mode==='sheets'?'bg-amber-500 text-white':'bg-slate-100 text-slate-600'}`;
}

async function handleFileImport(input) {
    const file = input.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async e => {
        try {
            const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
            await processImportRows(rows);
        } catch (err) { Swal.fire('ผิดพลาด', err.message, 'error'); }
        input.value = '';
    };
    reader.readAsArrayBuffer(file);
}

async function handleSheetsImport() {
    const url = document.getElementById('sheets-url').value.trim();
    const m = url.match(/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (!m) return Swal.fire('URL ไม่ถูกต้อง', '', 'error');
    Swal.fire({ title: 'กำลังดึงข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
        const csvUrl = `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv`;
        const res = await fetch(csvUrl);
        if (!res.ok) throw new Error('ไม่สามารถดึงข้อมูลได้ ตรวจสอบว่าแชร์เป็นสาธารณะแล้ว');
        const text = await res.text();
        Swal.close();
        const rows = text.trim().split('\n').map(r => r.split(',').map(c => c.replace(/^"|"$/g, '')));
        const headers = rows[0];
        const data = rows.slice(1).map(r => {
            const obj = {};
            headers.forEach((h, i) => { obj[h.trim()] = r[i]?.trim() || ''; });
            return obj;
        });
        await processImportRows(data);
    } catch (err) { Swal.close(); Swal.fire('ผิดพลาด', err.message, 'error'); }
}

async function processImportRows(rows) {
    const dataRows = rows.filter(r => String(r['รหัสนักเรียน'] || r['student_id_card'] || '').trim());
    if (!dataRows.length) return Swal.fire('ไม่พบข้อมูล', '', 'warning');

    Swal.fire({ title: `พบ ${dataRows.length} รายการ`, text: 'กำลังประมวลผล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const { data: stds } = await db.from('core_students').select('id, student_id_card, classroom_id');
    const stdMap = {};
    (stds || []).forEach(s => { stdMap[String(s.student_id_card).trim()] = s; });

    const getLevel = (score, max) => {
        const pct = score / max * 100;
        return pct >= 80 ? 'สูงกว่าเกณฑ์' : pct >= 60 ? 'ตามเกณฑ์' : 'ต่ำกว่าเกณฑ์';
    };

    const toInsert = [];
    const errors = [];

    dataRows.forEach(row => {
        const code = String(row['รหัสนักเรียน'] || row['student_id_card'] || '').trim();
        const std = stdMap[code];
        if (!std) { errors.push(`ไม่พบ: ${code}`); return; }

        const sa = parseInt(row['ตระหนักรู้ตนเอง'] || 0);
        const sc = parseInt(row['ควบคุมตนเอง'] || 0);
        const mo = parseInt(row['สร้างแรงจูงใจ'] || 0);
        const em = parseInt(row['เห็นใจผู้อื่น'] || 0);
        const so = parseInt(row['ทักษะสัมพันธภาพ'] || 0);
        const total = sa + sc + mo + em + so;

        toInsert.push({
            student_id: std.id, classroom_id: std.classroom_id,
            academic_year: schoolInfo.current_academic_year, semester: schoolInfo.current_semester,
            answers: {}, // นำเข้าจากภายนอก ไม่มีรายข้อ
            score_self_aware: sa, score_self_control: sc, score_motivation: mo, score_empathy: em, score_social: so, score_total: total,
            level_self_aware: getLevel(sa, 33), level_self_control: getLevel(sc, 30),
            level_motivation: getLevel(mo, 27), level_empathy: getLevel(em, 30),
            level_social: getLevel(so, 36), level_total: getLevel(total, 156),
            recorder_id: currentUser.id,
        });
    });

    let success = 0, failed = 0;
    for (const item of toInsert) {
        const { error } = await db.from('eq_assessments')
            .upsert(item, { onConflict: 'student_id,academic_year,semester' });
        if (error) failed++;
        else success++;
    }

    Swal.close();
    closeImportModal();
    await Swal.fire({
        icon: failed === 0 ? 'success' : 'warning',
        title: 'ผลการนำเข้า',
        html: `<p class="text-green-600 font-bold">✅ สำเร็จ: ${success} รายการ</p>${failed > 0 ? `<p class="text-red-500 font-bold">❌ ล้มเหลว: ${failed}</p>` : ''}${errors.length > 0 ? `<details><summary class="text-xs text-slate-400 cursor-pointer">ดูรายละเอียด</summary><pre class="text-xs text-red-400 mt-1 text-left max-h-24 overflow-auto">${errors.join('\n')}</pre></details>` : ''}`
    });
    loadResults(); loadStats();
}

/* ── SETTINGS ─────────────────────────────────────────── */
function openSettings() {
    document.getElementById('settings-modal').classList.remove('hidden');
    document.getElementById('settings-modal').classList.add('flex');
}
function closeSettings() {
    document.getElementById('settings-modal').classList.add('hidden');
    document.getElementById('settings-modal').classList.remove('flex');
}
async function saveSettings() {
    const delay = parseInt(document.getElementById('set-delay').value) || 0;
    const active = document.getElementById('set-active').checked;
    const { error } = await db.from('eq_settings').upsert({
        academic_year: schoolInfo.current_academic_year,
        semester: schoolInfo.current_semester,
        delay_seconds: delay, is_active: active
    }, { onConflict: 'academic_year,semester' });
    if (error) { Swal.fire('ผิดพลาด', error.message, 'error'); return; }
    Swal.fire({ icon: 'success', title: 'บันทึกแล้ว', timer: 1400, showConfirmButton: false });
    closeSettings();
}

async function handleLogout() {
    const r = await Swal.fire({ title: 'ออกจากระบบ?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'ออก', cancelButtonText: 'ยกเลิก' });
    if (r.isConfirmed) { await db.auth.signOut(); window.location.href = 'index.html'; }
}
