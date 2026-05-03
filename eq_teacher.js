/**
 * eq_teacher.js — ครูที่ปรึกษาดูผลการประเมิน EQ
 */
let currentUser = null;
let schoolInfo = null;
let eqTable = null;
let allResults = [];

window.addEventListener('load', async () => {
    const { data: { user } } = await db.auth.getUser();
    if (!user) { window.location.href = 'index.html'; return; }

    const { data: p } = await db.from('core_personnel').select('*').eq('id', user.id).single();
    if (!p) return;
    currentUser = p;
    document.getElementById('user-display').textContent = `${p.prefix || ''}${p.first_name} ${p.last_name}`;

    const { data: si } = await db.from('core_school_info').select('*').single();
    schoolInfo = si;

    // โหลดห้องที่ครูเป็นที่ปรึกษา
    const { data: rooms } = await db.from('core_classrooms')
        .select('id, grade_level, room_number')
        .or(`adviser_id_1.eq.${user.id},adviser_id_2.eq.${user.id}`)
        .eq('academic_year', si?.current_academic_year)
        .eq('semester', si?.current_semester) /* 🌟 เพิ่มบรรทัดนี้: กรองเฉพาะภาคเรียนปัจจุบัน */
        .order('grade_level').order('room_number');

    const sel = document.getElementById('sel-classroom');
    if (!rooms || rooms.length === 0) {
        sel.innerHTML = '<option>ไม่พบห้องที่รับผิดชอบ</option>';
        return;
    }
    sel.innerHTML = rooms.map(r => `<option value="${r.id}">ม.${r.grade_level}/${r.room_number}</option>`).join('');
    loadResults();
});

async function loadResults() {
    const classroomId = document.getElementById('sel-classroom').value;
    if (!classroomId) return;

    Swal.fire({ title: 'กำลังโหลด...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const { data: enrolls } = await db.from('student_enrollments')
        .select('student_id, student_number, core_students(prefix, first_name, last_name)')
        .eq('classroom_id', classroomId).order('student_number');

    const studentIds = (enrolls || []).map(e => e.student_id);
    let eqMap = {};
    if (studentIds.length > 0) {
        const { data: eqs } = await db.from('eq_assessments')
            .select('*')
            .in('student_id', studentIds)
            .eq('academic_year', schoolInfo?.current_academic_year)
            .eq('semester', schoolInfo?.current_semester);
        (eqs || []).forEach(e => { eqMap[e.student_id] = e; });
    }

    Swal.close();
    allResults = (enrolls || []).map(e => ({ ...e, eq: eqMap[e.student_id] || null }));
    renderTable(allResults);
    renderStats(allResults);
}

function renderStats(rows) {
    const total = rows.length;
    const done = rows.filter(r => r.eq).length;
    const high = rows.filter(r => r.eq?.level_total === 'สูงกว่าเกณฑ์').length;
    const low  = rows.filter(r => r.eq?.level_total === 'ต่ำกว่าเกณฑ์').length;

    document.getElementById('stat-cards').innerHTML = [
        { icon:'fa-users', label:'นักเรียนทั้งหมด', val:total, color:'indigo' },
        { icon:'fa-check-circle', label:'ประเมินแล้ว', val:done, color:'green' },
        { icon:'fa-arrow-up', label:'สูงกว่าเกณฑ์', val:high, color:'emerald' },
        { icon:'fa-arrow-down', label:'ต่ำกว่าเกณฑ์', val:low, color:'rose' },
    ].map(s => `
        <div class="glass rounded-2xl p-4 flex items-center gap-3 shadow-sm">
            <div class="h-11 w-11 bg-${s.color}-100 text-${s.color}-600 rounded-xl flex items-center justify-center flex-shrink-0">
                <i class="fas ${s.icon}"></i>
            </div>
            <div>
                <p class="text-slate-400 text-[10px] font-bold uppercase">${s.label}</p>
                <h3 class="text-2xl font-bold text-slate-800">${s.val}</h3>
            </div>
        </div>`).join('');
}

function levelBadge(level) {
    if (!level) return '<span class="text-slate-300 text-xs">-</span>';
    const cls = level === 'สูงกว่าเกณฑ์' ? 'bg-green-100 text-green-700' :
                level === 'ตามเกณฑ์'     ? 'bg-blue-100 text-blue-700'  : 'bg-red-100 text-red-700';
    return `<span class="text-xs font-bold px-2 py-0.5 rounded-full ${cls}">${level}</span>`;
}

function renderTable(rows) {
    if (eqTable) { eqTable.destroy(); eqTable = null; }
    const tbody = document.getElementById('eq-tbody');
    tbody.innerHTML = rows.map((r, i) => {
        const eq = r.eq;
        const std = r.core_students;
        const fullName = `${std?.prefix || ''}${std?.first_name || ''} ${std?.last_name || ''}`;
        const scoreCell = (key, max) => eq ? `${eq[`score_${key}`]} <span class="text-slate-300 text-xs">/${max}</span>` : '<span class="text-slate-300">-</span>';
        return `<tr>
            <td class="text-center font-bold text-slate-400">${r.student_number}</td>
            <td class="font-semibold text-slate-700">${fullName}</td>
            <td class="text-center">${scoreCell('self_aware',33)}</td>
            <td class="text-center">${scoreCell('self_control',30)}</td>
            <td class="text-center">${scoreCell('motivation',27)}</td>
            <td class="text-center">${scoreCell('empathy',30)}</td>
            <td class="text-center">${scoreCell('social',36)}</td>
            <td class="text-center font-bold text-slate-800">${eq ? eq.score_total : '-'}</td>
            <td class="text-center">${levelBadge(eq?.level_total)}</td>
            <td class="text-center">
                ${eq ? `<button onclick='printStudentPdf(${JSON.stringify(r).replace(/'/g,"&#39;")})' class="text-indigo-600 hover:text-indigo-800 text-sm" title="พิมพ์ PDF"><i class="fas fa-print"></i></button>` : '<span class="text-slate-300 text-xs">ยังไม่ประเมิน</span>'}
            </td>
        </tr>`;
    }).join('');

    eqTable = new DataTable('#eq-table', {
        language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
        responsive: true, scrollX: true, pageLength: 25,
        columnDefs: [{ orderable: false, targets: [9] }],
    });
}

function exportExcel() {
    if (!allResults.length) return Swal.fire('ไม่มีข้อมูล', '', 'info');
    const rows = allResults.map(r => {
        const std = r.core_students;
        const eq = r.eq;
        return {
            'เลขที่': r.student_number,
            'ชื่อ-สกุล': `${std?.prefix || ''}${std?.first_name || ''} ${std?.last_name || ''}`,
            'ตระหนักรู้ตนเอง': eq?.score_self_aware || '-',
            'ควบคุมตนเอง': eq?.score_self_control || '-',
            'สร้างแรงจูงใจ': eq?.score_motivation || '-',
            'เห็นใจผู้อื่น': eq?.score_empathy || '-',
            'ทักษะสัมพันธภาพ': eq?.score_social || '-',
            'รวม': eq?.score_total || '-',
            'ระดับ': eq?.level_total || 'ยังไม่ประเมิน',
        };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.max(k.length + 4, 14) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'EQ');
    XLSX.writeFile(wb, `EQ_Results_${new Date().toLocaleDateString('th-TH').replace(/\//g,'-')}.xlsx`);
}

function printStudentPdf(rowData) {
    const std = rowData.core_students;
    const eq = rowData.eq;
    const fullName = `${std?.prefix || ''}${std?.first_name || ''} ${std?.last_name || ''}`;
    generateEQPdf(eq, fullName);
}

function generateEQPdf(data, fullName) {
    Swal.fire({ title: 'กำลังสร้าง PDF...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
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
    const html = `<div style="font-family:'Anuphan',sans-serif;padding:30px 40px">
        <h2 style="text-align:center;color:#312e81;font-size:20px">รายงานผลการประเมิน EQ</h2>
        <p style="text-align:center;color:#64748b;font-size:13px;margin-top:4px">แบบประเมิน EQ กรมสุขภาพจิต (อายุ 12–17 ปี)</p>
        <div style="background:#f8fafc;border-radius:12px;padding:16px;margin:20px 0">
            <p style="margin:0;font-size:14px"><b>ชื่อ-สกุล:</b> ${fullName}</p>
        </div>
        <div style="text-align:center;background:${data.level_total==='สูงกว่าเกณฑ์'?'#dcfce7':data.level_total==='ตามเกณฑ์'?'#dbeafe':'#fee2e2'};border-radius:12px;padding:20px;margin-bottom:20px">
            <p style="font-size:28px;font-weight:900;margin:0">${data.score_total} <span style="font-size:16px;font-weight:400;color:#64748b">/ 156</span></p>
            <p style="font-weight:700;margin:4px 0 0">ระดับ: ${data.level_total}</p>
        </div>
        <table style="width:100%;border-collapse:collapse">
            <thead><tr style="background:#312e81;color:white">
                <th style="padding:10px 12px;text-align:left">ด้าน</th>
                <th style="padding:10px 12px;text-align:center">คะแนน</th>
                <th style="padding:10px 12px;text-align:center">ระดับ</th>
            </tr></thead>
            <tbody>${dimRows}</tbody>
        </table>
        <p style="font-size:11px;color:#94a3b8;text-align:center;margin-top:24px">พิมพ์โดยระบบ WRK School Management System</p>
    </div>`;
    const el = document.createElement('div');
    el.innerHTML = html;
    Swal.close();
    html2pdf().set({
        margin: 5, filename: `EQ_${fullName}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(el).save();
}

async function handleLogout() {
    const r = await Swal.fire({ title: 'ออกจากระบบ?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'ออก', cancelButtonText: 'ยกเลิก' });
    if (r.isConfirmed) { await db.auth.signOut(); window.location.href = 'index.html'; }
}
