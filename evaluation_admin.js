// ==========================================
// ตัวแปรระบบ
// ==========================================
let currentUser = null;
let currentTermData = null;
let currentEvalRound = null;
let summaryDataTable = null;

// ==========================================
// ฟังก์ชันเริ่มต้น
// ==========================================
window.onload = async () => {
    console.log('🚀 Admin Panel เริ่มโหลด...');

    try { await checkAdminAuth(); } catch (e) { console.error('❌ checkAdminAuth:', e); }
    try { await loadDashboard(); } catch (e) { console.error('❌ loadDashboard:', e); }
    try { await loadEvalRounds(); } catch (e) { console.error('❌ loadEvalRounds:', e); }
    try { await loadCommitteeList(); } catch (e) { console.error('❌ loadCommitteeList:', e); }
    try { await loadSummary(); } catch (e) { console.error('❌ loadSummary:', e); }
    try { await loadAdminList(); } catch (e) { console.error('❌ loadAdminList:', e); }
    try { await loadUsersForAdmin(); } catch (e) { console.error('❌ loadUsersForAdmin:', e); }
    try { await loadGASConfig(); } catch (e) { console.error('❌ loadGASConfig:', e); }

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            console.log('📑 เปลี่ยน Tab:', this.dataset.tab);

            document.querySelectorAll('.tab-btn').forEach(b => {
                b.classList.remove('active', 'bg-purple-600', 'text-white');
                b.classList.add('bg-gray-200', 'text-gray-600');
            });

            this.classList.add('active', 'bg-purple-600', 'text-white');
            this.classList.remove('bg-gray-200', 'text-gray-600');

            document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');

            const targetTab = document.getElementById(this.dataset.tab);
            if (targetTab) {
                targetTab.style.display = 'block';
            } else {
                console.error('❌ ไม่พบ Tab element:', this.dataset.tab);
            }
        });
    });

    // Committee form submit
    const committeeForm = document.getElementById('committeeForm');
    if (committeeForm) {
        committeeForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            await saveCommittee();
        });
    }

    // Eval round form submit
    const evalRoundForm = document.getElementById('evalRoundForm');
    if (evalRoundForm) {
        evalRoundForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            await saveEvalRound();
        });
    }

    console.log('✅ Admin Panel โหลดเสร็จสมบูรณ์');
};

// ==========================================
// ตรวจสอบสิทธิ์ Admin
// ==========================================
async function checkAdminAuth() {
    const { data: { session } } = await db.auth.getSession();
    if (!session) return window.location.replace('index.html');

    const { data: profile } = await db.from('core_personnel').select('*').eq('id', session.user.id).single();
    currentUser = profile;
    console.log('👤 ผู้ใช้:', currentUser.first_name, currentUser.last_name, '(', currentUser.role, ')');

    if (!['admin', 'super_admin'].includes(currentUser.role)) {
        await Swal.fire({
            icon: 'error',
            title: 'ไม่มีสิทธิ์เข้าถึง',
            text: 'เฉพาะ Admin เท่านั้นที่สามารถเข้าถึงหน้านี้ได้',
            confirmButtonText: 'ตกลง'
        });
        window.location.replace('evaluation.html');
    }

    const { data: schoolInfo } = await db.from('core_school_info').select('*').single();
    currentTermData = schoolInfo;
}

// ==========================================
// Tab 1: Dashboard
// ==========================================
async function loadDashboard() {
    try {
        console.log('📊 กำลังโหลด Dashboard...');

        const { data: allPersonnel, error } = await db
            .from('core_personnel')
            .select('*');

        if (error) throw error;
        console.log('📋 บุคลากรทั้งหมด:', allPersonnel?.length || 0, 'คน');

        const teacherRoles = ['teacher'];
        const validStandings = ['ครูผู้ช่วย', 'ครู', 'ครูชำนาญการ', 'ครูชำนาญการพิเศษ'];

        const teacherList = (allPersonnel || []).filter(p => {
            const isTeacher = teacherRoles.includes(p.role);
            const hasValidStanding = p.academic_standing && validStandings.includes(p.academic_standing.trim());
            return isTeacher && hasValidStanding;
        });

        console.log('👨‍🏫 ข้าราชการครูทั้งหมด:', teacherList.length, 'คน');

        const total = teacherList.length;
        const assistant = teacherList.filter(t => t.academic_standing.trim() === 'ครูผู้ช่วย').length;
        const teacher = teacherList.filter(t => t.academic_standing.trim() === 'ครู').length;
        const specialist = teacherList.filter(t => t.academic_standing.trim() === 'ครูชำนาญการ').length;
        const expert = teacherList.filter(t => t.academic_standing.trim() === 'ครูชำนาญการพิเศษ').length;

        console.log('📊 แยกตามวิทยฐานะ:', { total, assistant, teacher, specialist, expert });

        const statTotal = document.getElementById('stat_total');
        const statAssistant = document.getElementById('stat_assistant');
        const statTeacher = document.getElementById('stat_teacher');
        const statSpecialist = document.getElementById('stat_specialist');
        const statExpert = document.getElementById('stat_expert');

        if (statTotal) statTotal.innerText = total;
        if (statAssistant) statAssistant.innerText = assistant;
        if (statTeacher) statTeacher.innerText = teacher;
        if (statSpecialist) statSpecialist.innerText = specialist;
        if (statExpert) statExpert.innerText = expert;

        const teacherIds = teacherList.map(t => t.id);
        let evalResults = [];

        if (teacherIds.length > 0) {
            const { data: evalData, error: evalError } = await db
                .from('eval_results')
                .select('evaluatee_id, status, total_score, eval_type')
                .in('evaluatee_id', teacherIds)
                .eq('eval_type', 'self');

            if (!evalError) {
                evalResults = evalData || [];
            }
        }

        const evaluated = new Set();
        const approved = new Set();

        evalResults.forEach(r => {
            evaluated.add(r.evaluatee_id);
            if (r.status === 'approved') approved.add(r.evaluatee_id);
        });

        const evalStatusSummary = document.getElementById('evalStatusSummary');
        if (evalStatusSummary) {
            evalStatusSummary.innerHTML = `
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div class="bg-yellow-50 p-4 rounded-xl text-center border border-yellow-200">
                        <p class="text-3xl font-bold text-yellow-600">${evaluated.size}</p>
                        <p class="text-sm text-gray-500">ประเมินตนเองแล้ว</p>
                    </div>
                    <div class="bg-green-50 p-4 rounded-xl text-center border border-green-200">
                        <p class="text-3xl font-bold text-green-600">${approved.size}</p>
                        <p class="text-sm text-gray-500">ผ่านการอนุมัติ</p>
                    </div>
                    <div class="bg-red-50 p-4 rounded-xl text-center border border-red-200">
                        <p class="text-3xl font-bold text-red-600">${total - evaluated.size}</p>
                        <p class="text-sm text-gray-500">ยังไม่ประเมิน</p>
                    </div>
                    <div class="bg-blue-50 p-4 rounded-xl text-center border border-blue-200">
                        <p class="text-3xl font-bold text-blue-600">${total}</p>
                        <p class="text-sm text-gray-500">รวมครูทั้งหมด</p>
                    </div>
                </div>
            `;
        }

    } catch (err) {
        console.error('❌ Error loading dashboard:', err);
        try {
            const statTotal = document.getElementById('stat_total');
            const statAssistant = document.getElementById('stat_assistant');
            const statTeacher = document.getElementById('stat_teacher');
            const statSpecialist = document.getElementById('stat_specialist');
            const statExpert = document.getElementById('stat_expert');

            if (statTotal) statTotal.innerText = '0';
            if (statAssistant) statAssistant.innerText = '0';
            if (statTeacher) statTeacher.innerText = '0';
            if (statSpecialist) statSpecialist.innerText = '0';
            if (statExpert) statExpert.innerText = '0';

            const evalStatusSummary = document.getElementById('evalStatusSummary');
            if (evalStatusSummary) {
                evalStatusSummary.innerHTML = '<p class="text-red-500">โหลดข้อมูลล้มเหลว</p>';
            }
        } catch (innerErr) {
            console.error('❌ Error updating UI:', innerErr);
        }
    }
}

// ==========================================
// Tab 3: สรุปผล - แก้ไขให้แสดงบุคลากรทั้งหมดที่มีวิทยฐานะครู
// ==========================================
async function loadSummary() {
    try {
        console.log('📋 กำลังโหลดสรุปผล...');

        // ✅ แก้ไข: ดึงบุคลากรที่มี role เป็น teacher, admin, super_admin, deputy, director
        // แต่กรองเฉพาะที่มี academic_standing เป็นวิทยฐานะครู
        const { data: teachers, error: tErr } = await db
            .from('core_personnel')
            .select('id, prefix, first_name, last_name, academic_standing, department, role')
            .in('role', ['teacher', 'admin', 'super_admin', 'deputy', 'director']);

        if (tErr) throw tErr;

        const validStandings = ['ครูผู้ช่วย', 'ครู', 'ครูชำนาญการ', 'ครูชำนาญการพิเศษ'];
        const allTeachers = (teachers || []).filter(t =>
            t.academic_standing && validStandings.includes(t.academic_standing.trim())
        );

        console.log('👨‍🏫 ครูทั้งหมด (รวม Admin):', allTeachers.length, 'คน');

        if (allTeachers.length === 0) {
            document.getElementById('summaryBody').innerHTML =
                '<tr><td colspan="8" class="text-center py-8 text-gray-400">ไม่พบข้อมูลครู</td></tr>';
            return;
        }

        const teacherIds = allTeachers.map(t => t.id);

        const [{ data: selfData }, { data: committeeData }] = await Promise.all([
            db.from('eval_results')
                .select('evaluatee_id, total_score, status, created_at')
                .in('evaluatee_id', teacherIds)
                .eq('eval_type', 'self')
                .order('created_at', { ascending: false }),
            db.from('eval_results')
                .select('evaluatee_id, total_score, status, created_at')
                .in('evaluatee_id', teacherIds)
                .eq('eval_type', 'committee')
                .order('created_at', { ascending: false })
        ]);

        const latestSelf = {};
        (selfData || []).forEach(r => {
            if (!latestSelf[r.evaluatee_id]) latestSelf[r.evaluatee_id] = r;
        });
        const latestCommittee = {};
        (committeeData || []).forEach(r => {
            if (!latestCommittee[r.evaluatee_id]) latestCommittee[r.evaluatee_id] = r;
        });

        const deptOrder = [
            'ภาษาไทย',
            'คณิตศาสตร์',
            'วิทยาศาสตร์และเทคโนโลยี (วิทยาศาสตร์)',
            'วิทยาศาสตร์และเทคโนโลยี (เทคโนโลยี)',
            'สังคมศึกษา ศาสนาและวัฒนธรรม',
            'สุขศึกษาและพลศึกษา',
            'ศิลปะ',
            'การงานอาชีพ',
            'ภาษาต่างประเทศ (ภาษาอังกฤษ)',
            'ภาษาต่างประเทศ (ภาษาจีน)',
            'แนะแนว'
        ];

        allTeachers.sort((a, b) => {
            const ai = deptOrder.indexOf(a.department) !== -1 ? deptOrder.indexOf(a.department) : 99;
            const bi = deptOrder.indexOf(b.department) !== -1 ? deptOrder.indexOf(b.department) : 99;
            return ai !== bi ? ai - bi : (a.first_name || '').localeCompare(b.first_name || '', 'th');
        });

        let html = '';
        allTeachers.forEach(teacher => {
            const self = latestSelf[teacher.id];
            const committee = latestCommittee[teacher.id];
            const selfScore = self?.total_score || 0;
            const committeeScore = committee?.total_score || 0;
            const total = Math.max(selfScore, committeeScore);

            let grade = '-', gradeColor = 'bg-gray-100 text-gray-500';
            if (total >= 80) { grade = 'ดีมาก'; gradeColor = 'bg-emerald-100 text-emerald-700'; }
            else if (total >= 70) { grade = 'ดี'; gradeColor = 'bg-blue-100 text-blue-700'; }
            else if (total >= 60) { grade = 'พอใช้'; gradeColor = 'bg-yellow-100 text-yellow-700'; }
            else if (total > 0) { grade = 'ควรปรับปรุง'; gradeColor = 'bg-red-100 text-red-700'; }

            const selfClass = selfScore >= 60 ? 'text-green-600 font-bold' : (selfScore > 0 ? 'text-red-500' : 'text-gray-400');
            const committeeClass = committeeScore >= 60 ? 'text-green-600 font-bold' : (committeeScore > 0 ? 'text-red-500' : 'text-gray-400');

            // ✅ แสดงคำนำหน้า + ชื่อ-สกุล
            const fullName = teacher.prefix
                ? `${teacher.prefix}${teacher.first_name} ${teacher.last_name}`
                : `${teacher.first_name} ${teacher.last_name}`;

            html += `
                <tr>
                    <td class="font-medium">${fullName}</td>
                    <td>${teacher.academic_standing || '-'}</td>
                    <td class="text-center">${teacher.department || '-'}</td>
                    <td class="text-center ${selfClass}">${selfScore > 0 ? selfScore.toFixed(2) : '-'}</td>
                    <td class="text-center ${committeeClass}">${committeeScore > 0 ? committeeScore.toFixed(2) : '-'}</td>
                    <td class="text-center font-bold text-blue-600">${total > 0 ? total.toFixed(2) : '-'}</td>
                    <td class="text-center">
                        <span class="px-2 py-1 rounded-full text-xs font-bold ${gradeColor}">${grade}</span>
                    </td>
                </tr>`;
        });

        document.getElementById('summaryBody').innerHTML = html;

        if (summaryDataTable) {
            summaryDataTable.destroy();
            summaryDataTable = null;
        }

        summaryDataTable = new DataTable('#summaryTable', {
            language: {
                url: 'https://cdn.datatables.net/plug-ins/2.0.8/i18n/th.json'
            },
            pageLength: 25,
            lengthMenu: [[10, 25, 50, -1], [10, 25, 50, 'ทั้งหมด']],
            order: [[2, 'asc'], [0, 'asc']],
            columnDefs: [
                { targets: [3, 4, 5], type: 'num-fmt' },
                { targets: [3, 4, 5, 6], className: 'text-center' }
            ],
            dom: '<"flex flex-wrap justify-between items-center gap-2 mb-3"lf>rt<"flex flex-wrap justify-between items-center gap-2 mt-3"ip>'
        });

        console.log('✅ โหลดสรุปผลสำเร็จ ครูทั้งหมด:', allTeachers.length, 'คน');

    } catch (err) {
        console.error('❌ Error loading summary:', err);
        const body = document.getElementById('summaryBody');
        if (body) body.innerHTML =
            '<tr><td colspan="8" class="text-center py-8 text-red-500">โหลดข้อมูลล้มเหลว: ' + err.message + '</td></tr>';
    }
}

// ==========================================
// Tab 2: จัดการกรรมการ
// ==========================================
async function loadEvalRounds() {
    try {
        const { data, error } = await db
            .from('eval_rounds')
            .select('*')
            .order('fiscal_year', { ascending: false })
            .order('round_number', { ascending: true });

        if (error) throw error;

        const select = document.getElementById('admin_eval_round');
        if (!select) {
            console.error('❌ ไม่พบ element: admin_eval_round');
            return;
        }

        select.innerHTML = '<option value="">-- เลือกรอบ --</option>';
        data?.forEach(round => {
            const active = round.is_active ? ' ✅ Active' : '';
            select.innerHTML += `
                <option value="${round.id}" ${round.is_active ? 'selected' : ''}>
                    ${round.round_name}${active}
                </option>
            `;
        });

        await loadUsersForCommittee();
        await loadAllEvalRounds();
        await loadActiveRound();
    } catch (err) {
        console.error('Error loading eval rounds:', err);
    }
}

async function loadUsersForCommittee() {
    try {
        const { data, error } = await db
            .from('core_personnel')
            .select('id, first_name, last_name, role, academic_standing')
            .in('role', ['deputy', 'teacher', 'staff']);

        if (error) throw error;

        const select = document.getElementById('admin_committee');
        if (!select) return;

        select.innerHTML = '';
        data?.forEach(user => {
            const label = `${user.first_name} ${user.last_name} (${user.role}${user.academic_standing ? ' - ' + user.academic_standing : ''})`;
            select.innerHTML += `<option value="${user.id}">${label}</option>`;
        });
    } catch (err) {
        console.error('Error loading users:', err);
    }
}

async function saveCommittee() {
    const evalRoundId = document.getElementById('admin_eval_round').value;
    const committeeIds = Array.from(document.getElementById('admin_committee').selectedOptions || []).map(o => o.value);
    const department = document.getElementById('admin_department').value;
    const scoringMode = document.getElementById('admin_scoring_mode').value;

    if (!evalRoundId || committeeIds.length === 0 || !department) {
        return Swal.fire('แจ้งเตือน', 'กรุณาเลือกข้อมูลให้ครบถ้วน', 'warning');
    }

    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        await db.from('eval_committee').delete().eq('eval_round_id', evalRoundId);

        const payload = committeeIds.map(evaluatorId => ({
            evaluator_id: evaluatorId,
            target_departments: [department],
            eval_round_id: evalRoundId,
            scoring_mode: scoringMode,
            is_active: true
        }));

        const { error } = await db.from('eval_committee').insert(payload);
        if (error) throw error;

        Swal.fire('สำเร็จ', 'แต่งตั้งกรรมการเรียบร้อย', 'success');
        await loadCommitteeList();
    } catch (err) {
        console.error('Error saving committee:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

async function loadCommitteeList() {
    try {
        const { data, error } = await db
            .from('eval_committee')
            .select('*')
            .eq('is_active', true);

        if (error) throw error;

        const container = document.getElementById('committeeList');
        if (!container) return;

        if (!data || data.length === 0) {
            container.innerHTML = '<p class="text-gray-400">ยังไม่มีกรรมการที่แต่งตั้ง</p>';
            return;
        }

        const evaluatorIds = data.map(c => c.evaluator_id);
        const { data: personnelData } = await db
            .from('core_personnel')
            .select('id, first_name, last_name')
            .in('id', evaluatorIds);

        const personnelMap = {};
        personnelData?.forEach(p => {
            personnelMap[p.id] = p;
        });

        const groups = {};
        data.forEach(item => {
            const key = `${item.eval_round_id}-${item.target_departments.join(',')}`;
            if (!groups[key]) {
                groups[key] = {
                    round_id: item.eval_round_id,
                    department: item.target_departments.join(', '),
                    scoring: item.scoring_mode || 'average',
                    members: []
                };
            }
            const evaluator = personnelMap[item.evaluator_id];
            if (evaluator) {
                groups[key].members.push(`${evaluator.first_name} ${evaluator.last_name}`);
            }
        });

        const roundIds = [...new Set(Object.values(groups).map(g => g.round_id))];
        const { data: roundData } = await db
            .from('eval_rounds')
            .select('id, round_name')
            .in('id', roundIds);

        const roundMap = {};
        roundData?.forEach(r => {
            roundMap[r.id] = r;
        });

        let html = '<div class="space-y-3">';
        Object.values(groups).forEach(g => {
            const round = roundMap[g.round_id];
            html += `
                <div class="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <div class="flex flex-wrap justify-between gap-2">
                        <span class="font-bold text-sm">${round?.round_name || '-'}</span>
                        <span class="text-sm text-gray-500">กลุ่ม: ${g.department}</span>
                        <span class="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">โหมด: ${g.scoring}</span>
                    </div>
                    <div class="mt-2 flex flex-wrap gap-1">
                        ${g.members.map(m => `<span class="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs">${m}</span>`).join('')}
                    </div>
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;

    } catch (err) {
        console.error('Error loading committee list:', err);
        const container = document.getElementById('committeeList');
        if (container) {
            container.innerHTML = '<p class="text-red-500">โหลดข้อมูลล้มเหลว</p>';
        }
    }
}

// ==========================================
// Export Excel / PDF
// ==========================================
function exportExcel() {
    if (!summaryDataTable) {
        Swal.fire('แจ้งเตือน', 'ยังไม่มีข้อมูล กรุณารอโหลดให้เสร็จก่อน', 'warning');
        return;
    }
    try {
        const headers = ['ชื่อ-สกุล', 'วิทยฐานะ', 'กลุ่มสาระ', 'ประเมินตนเอง', 'กรรมการ', 'คะแนนรวม', 'ระดับ'];
        const rows = summaryDataTable.rows({ search: 'applied' }).data().toArray().map(row => {
            return row.map(cell => {
                const tmp = document.createElement('div');
                tmp.innerHTML = cell;
                return tmp.innerText.trim();
            });
        });

        const wsData = [headers, ...rows];
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];

        XLSX.utils.book_append_sheet(wb, ws, 'สรุปผลประเมิน');
        XLSX.writeFile(wb, `สรุปผลการประเมิน_${new Date().toLocaleDateString('th-TH')}.xlsx`);
    } catch (err) {
        console.error('Export Excel error:', err);
        Swal.fire('ผิดพลาด', 'ไม่สามารถส่งออก Excel ได้', 'error');
    }
}

async function exportPDF() {
    const rows = [];
    document.querySelectorAll('#summaryBody tr').forEach(tr => {
        const cols = tr.querySelectorAll('td');
        if (cols.length > 1) {
            rows.push({
                name: cols[0]?.innerText || '-',
                standing: cols[1]?.innerText || '-',
                department: cols[2]?.innerText || '-',
                self: parseFloat(cols[3]?.innerText) || 0,
                committee: parseFloat(cols[4]?.innerText) || 0,
                total: parseFloat(cols[5]?.innerText) || 0,
                grade: cols[6]?.innerText?.trim() || '-'
            });
        }
    });

    const { data: configs } = await db
        .from('system_config')
        .select('*')
        .in('key', ['gas_api_url', 'gas_template_id']);

    const gasApiUrl = configs?.find(c => c.key === 'gas_api_url')?.value || '';
    const gasTemplateId = configs?.find(c => c.key === 'gas_template_id')?.value || '';

    if (!gasApiUrl) {
        return Swal.fire('แจ้งเตือน', 'กรุณาตั้งค่า GAS API URL ในแท็บตั้งค่าระบบ', 'warning');
    }

    Swal.fire({ title: 'กำลังสร้าง PDF...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const response = await fetch(gasApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                data: rows,
                templateId: gasTemplateId,
                schoolName: currentTermData?.school_name || 'โรงเรียน',
                academicYear: currentTermData?.current_academic_year || '',
                semester: currentTermData?.current_semester || ''
            })
        });

        const result = await response.json();
        Swal.close();

        if (result.success && result.url) {
            window.open(result.url, '_blank');
            Swal.fire('สำเร็จ', 'สร้าง PDF เรียบร้อย', 'success');
        } else {
            Swal.fire('ผิดพลาด', result.message || 'ไม่สามารถสร้าง PDF ได้', 'error');
        }
    } catch (err) {
        Swal.close();
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// Tab 4: ตั้งค่าระบบ - รอบการประเมิน
// ==========================================

// ✅ โหลดรอบ Active และแสดงใน UI
async function loadActiveRound() {
    try {
        const { data, error } = await db
            .from('eval_rounds')
            .select('*')
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error('Error loading active round:', error);
            return;
        }

        currentEvalRound = data;

        const displayElement = document.getElementById('current_active_round');
        const periodElement = document.getElementById('current_active_period');

        if (data) {
            console.log('🔄 รอบ Active ปัจจุบัน:', data.round_name);
            if (displayElement) {
                displayElement.innerText = `${data.round_name}`;
                displayElement.className = 'text-xl font-bold text-blue-700';
            }
            if (periodElement) {
                periodElement.innerText = `${formatDate(data.start_date)} - ${formatDate(data.end_date)}`;
            }
        } else {
            console.log('⚠️ ไม่มีรอบ Active');
            if (displayElement) {
                displayElement.innerText = '❌ ยังไม่มีรอบ Active';
                displayElement.className = 'text-xl font-bold text-red-500';
            }
            if (periodElement) {
                periodElement.innerText = 'กรุณาตั้งค่ารอบ Active';
            }
        }

    } catch (err) {
        console.error('Error loading active round:', err);
    }
}

// ✅ โหลดและแสดงรอบการประเมินทั้งหมด
async function loadAllEvalRounds() {
    try {
        const { data, error } = await db
            .from('eval_rounds')
            .select('*')
            .order('fiscal_year', { ascending: false })
            .order('round_number', { ascending: true });

        if (error) throw error;

        const container = document.getElementById('roundList');
        if (!container) return;

        if (!data || data.length === 0) {
            container.innerHTML = '<p class="text-gray-400">ยังไม่มีรอบการประเมิน</p>';
            return;
        }

        // จัดกลุ่มตามปีงบประมาณ
        const grouped = {};
        data.forEach(r => {
            if (!grouped[r.fiscal_year]) {
                grouped[r.fiscal_year] = [];
            }
            grouped[r.fiscal_year].push(r);
        });

        let html = '';
        const sortedYears = Object.keys(grouped).sort((a, b) => b - a);

        sortedYears.forEach(year => {
            const rounds = grouped[year];
            const hasActive = rounds.some(r => r.is_active);

            html += `
                <div class="mb-4 border border-gray-200 rounded-xl overflow-hidden">
                    <div class="bg-gray-50 px-4 py-2 flex justify-between items-center border-b border-gray-200">
                        <span class="font-bold text-gray-700">
                            <i class="fa-solid fa-calendar text-blue-500 mr-2"></i>
                            ปีงบประมาณ ${year}
                            ${hasActive ? '<span class="ml-2 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">มีรอบ Active</span>' : ''}
                        </span>
                        <span class="text-sm text-gray-400">${rounds.length} รอบ</span>
                    </div>
                    <div class="p-2 space-y-1">
            `;

            rounds.forEach(r => {
                const isActive = r.is_active;
                const roundThai = r.round_number === 1 ? 'ครั้งที่ 1 (ต.ค.-มี.ค.)' : 'ครั้งที่ 2 (เม.ย.-ก.ย.)';

                html += `
                    <div class="flex flex-wrap justify-between items-center p-3 rounded-lg ${isActive ? 'bg-blue-50 border border-blue-200' : 'bg-white border border-gray-100'} hover:shadow-sm transition-shadow">
                        <div class="flex-1 min-w-[200px]">
                            <div class="flex items-center gap-3 flex-wrap">
                                <span class="font-bold ${isActive ? 'text-blue-700' : 'text-gray-700'}">
                                    ${r.round_name}
                                </span>
                                <span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                                    ${roundThai}
                                </span>
                                ${isActive ? '<span class="px-2 py-0.5 bg-blue-500 text-white text-xs rounded-full">🟢 Active</span>' : ''}
                            </div>
                            <div class="text-xs text-gray-400 mt-0.5">
                                ${formatDate(r.start_date)} - ${formatDate(r.end_date)}
                            </div>
                        </div>
                        <div class="flex items-center gap-2 mt-2 md:mt-0">
                            ${isActive ? `
                                <!-- ✅ ปุ่มปิด Active (สีแดง) -->
                                <button onclick="deactivateRound('${r.id}')" 
                                        class="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm flex items-center gap-1">
                                    <i class="fa-solid fa-power-off"></i> ปิด Active
                                </button>
                                <span class="text-green-600 text-sm font-bold">
                                    <i class="fa-solid fa-circle-check"></i> กำลังใช้งาน
                                </span>
                            ` : `
                                <!-- ✅ ปุ่มตั้ง Active (สีน้ำเงิน) -->
                                <button onclick="toggleActiveRound('${r.id}')" 
                                        class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm flex items-center gap-1">
                                    <i class="fa-solid fa-check-circle"></i> ตั้ง Active
                                </button>
                            `}
                            <!-- ✅ ปุ่มลบ (สีแดงอ่อน) -->
                            <button onclick="deleteEvalRound('${r.id}')" 
                                    class="text-red-400 hover:text-red-600 text-sm px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
        await updateEvalRoundSelect();

    } catch (err) {
        console.error('Error loading eval rounds:', err);
        const container = document.getElementById('roundList');
        if (container) {
            container.innerHTML = '<p class="text-red-500">โหลดข้อมูลล้มเหลว</p>';
        }
    }
}

// ✅ อัปเดต Select รอบการประเมิน
async function updateEvalRoundSelect() {
    try {
        const { data, error } = await db
            .from('eval_rounds')
            .select('*')
            .order('fiscal_year', { ascending: false })
            .order('round_number', { ascending: true });

        if (error) throw error;

        const select = document.getElementById('admin_eval_round');
        if (!select) return;

        select.innerHTML = '<option value="">-- เลือกรอบ --</option>';
        data?.forEach(round => {
            const active = round.is_active ? ' ✅ Active' : '';
            select.innerHTML += `
                <option value="${round.id}" ${round.is_active ? 'selected' : ''}>
                    ${round.round_name}${active}
                </option>
            `;
        });
    } catch (err) {
        console.error('Error updating eval round select:', err);
    }
}

// ✅ ฟังก์ชันสลับ Active (ตรวจสอบให้มีเพียงรอบเดียว)
// ✅ ฟังก์ชันสลับ Active (ปรับปรุง - ใช้ SQL Trigger ช่วย)
async function toggleActiveRound(roundId) {
    // ตรวจสอบว่ามีรอบ Active อื่นอยู่หรือไม่
    const { data: activeRounds } = await db
        .from('eval_rounds')
        .select('id, round_name')
        .eq('is_active', true)
        .neq('id', roundId);

    // ถ้ามีรอบ Active อื่น ให้ถามก่อน
    if (activeRounds && activeRounds.length > 0) {
        const activeNames = activeRounds.map(r => r.round_name).join(', ');
        const result = await Swal.fire({
            icon: 'warning',
            title: 'มีรอบ Active อยู่แล้ว',
            html: `
                <p>ปัจจุบันมีรอบ Active: <b>${activeNames}</b></p>
                <p class="text-sm text-gray-500 mt-2">ต้องการเปลี่ยนเป็นรอบนี้หรือไม่?</p>
                <p class="text-sm text-red-500">(รอบเดิมจะถูกปิดอัตโนมัติ)</p>
            `,
            showCancelButton: true,
            confirmButtonText: '✅ เปลี่ยนทันที',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#3085d6'
        });

        if (!result.isConfirmed) return;
    }

    const { data: roundData } = await db
        .from('eval_rounds')
        .select('round_name')
        .eq('id', roundId)
        .single();

    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        // ✅ เปิด Active รอบที่เลือก (Trigger จะปิดรอบเดิมอัตโนมัติ)
        const { error } = await db
            .from('eval_rounds')
            .update({ is_active: true })
            .eq('id', roundId);

        if (error) throw error;

        await loadAllEvalRounds();
        await loadEvalRounds();
        await loadActiveRound();

        Swal.fire({
            icon: 'success',
            title: 'สำเร็จ!',
            html: `เปลี่ยนรอบ Active เป็น <b>${roundData?.round_name || 'รอบที่เลือก'}</b> เรียบร้อย`,
            timer: 2000,
            showConfirmButton: true
        });
    } catch (err) {
        console.error('Error toggling active round:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ✅ ฟังก์ชันสร้างรอบปีงบประมาณอัตโนมัติ
async function generateDefaultRounds() {
    const result = await Swal.fire({
        icon: 'question',
        title: 'สร้างรอบปีงบประมาณอัตโนมัติ',
        html: `
            <p>ระบบจะสร้างรอบการประเมินสำหรับปีงบประมาณถัดไป</p>
            <p class="text-sm text-gray-500 mt-2">ปีงบประมาณปัจจุบัน: <b>${getCurrentFiscalYear()}</b></p>
            <p class="text-sm text-gray-500">จะสร้างรอบสำหรับปีงบประมาณ: <b>${getCurrentFiscalYear() + 1}</b></p>
            <p class="text-xs text-gray-400 mt-2">* จะไม่สร้างซ้ำถ้ามีอยู่แล้ว</p>
        `,
        showCancelButton: true,
        confirmButtonText: '✅ สร้าง',
        cancelButtonText: 'ยกเลิก'
    });

    if (!result.isConfirmed) return;

    Swal.fire({ title: 'กำลังสร้าง...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const nextYear = getCurrentFiscalYear() + 1;

        const rounds = [
            {
                fiscal_year: nextYear,
                round_number: 1,
                round_name: `การประเมินครั้งที่ 1/${nextYear}`,
                start_date: new Date(nextYear - 1, 9, 1).toISOString().split('T')[0],
                end_date: new Date(nextYear, 2, 31).toISOString().split('T')[0],
                is_active: false
            },
            {
                fiscal_year: nextYear,
                round_number: 2,
                round_name: `การประเมินครั้งที่ 2/${nextYear}`,
                start_date: new Date(nextYear, 3, 1).toISOString().split('T')[0],
                end_date: new Date(nextYear, 8, 30).toISOString().split('T')[0],
                is_active: false
            }
        ];

        let inserted = 0;
        for (const round of rounds) {
            const { data: existing } = await db
                .from('eval_rounds')
                .select('id')
                .eq('fiscal_year', round.fiscal_year)
                .eq('round_number', round.round_number)
                .maybeSingle();

            if (!existing) {
                const { error } = await db.from('eval_rounds').insert([round]);
                if (error) throw error;
                inserted++;
            }
        }

        await loadAllEvalRounds();
        await loadEvalRounds();
        await loadActiveRound();

        Swal.fire({
            icon: 'success',
            title: 'สำเร็จ!',
            html: `สร้างรอบปีงบประมาณ ${nextYear} เรียบร้อย (เพิ่ม ${inserted} รอบ)`,
            timer: 2000,
            showConfirmButton: true
        });
    } catch (err) {
        console.error('Error generating default rounds:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ✅ ฟังก์ชันตั้ง Active อัตโนมัติตามวันปัจจุบัน
async function autoSetActiveRound() {
    const today = new Date();
    const currentYear = getCurrentFiscalYear();
    const currentMonth = today.getMonth();

    let targetRound = 1;
    if (currentMonth >= 3 && currentMonth <= 8) {
        targetRound = 2;
    }

    Swal.fire({ title: 'กำลังตรวจสอบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const { data: targetRoundData } = await db
            .from('eval_rounds')
            .select('*')
            .eq('fiscal_year', currentYear)
            .eq('round_number', targetRound)
            .maybeSingle();

        if (!targetRoundData) {
            Swal.close();
            return Swal.fire('แจ้งเตือน', `ไม่พบรอบที่ ${targetRound} ของปีงบประมาณ ${currentYear}`, 'warning');
        }

        await db.from('eval_rounds').update({ is_active: false }).neq('id', '');

        await db.from('eval_rounds')
            .update({ is_active: true })
            .eq('id', targetRoundData.id);

        await loadAllEvalRounds();
        await loadEvalRounds();
        await loadActiveRound();

        Swal.fire({
            icon: 'success',
            title: 'ตั้งค่า Active อัตโนมัติ',
            html: `ตั้ง <b>${targetRoundData.round_name}</b> เป็น Active<br><span class="text-sm text-gray-500">ตามวันปัจจุบัน</span>`,
            timer: 2000,
            showConfirmButton: true
        });
    } catch (err) {
        console.error('Error auto setting active round:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ✅ ฟังก์ชันบันทึกรอบใหม่
async function saveEvalRound() {
    if (currentUser.role !== 'super_admin') {
        return Swal.fire('ไม่มีสิทธิ์', 'เฉพาะ Super Admin เท่านั้นที่ตั้งค่ารอบการประเมินได้', 'error');
    }

    const fiscalYear = parseInt(document.getElementById('round_fiscal_year').value);
    const roundNumber = parseInt(document.getElementById('round_number').value);
    const roundName = document.getElementById('round_name').value;
    const startDate = document.getElementById('round_start').value;
    const endDate = document.getElementById('round_end').value;
    const isActive = document.getElementById('round_is_active').checked;

    if (!fiscalYear || !roundName || !startDate || !endDate) {
        return Swal.fire('แจ้งเตือน', 'กรุณากรอกข้อมูลให้ครบถ้วน', 'warning');
    }

    if (new Date(startDate) >= new Date(endDate)) {
        return Swal.fire('แจ้งเตือน', 'วันที่เริ่มต้องน้อยกว่าวันที่สิ้นสุด', 'warning');
    }

    const { data: existing } = await db
        .from('eval_rounds')
        .select('id')
        .eq('fiscal_year', fiscalYear)
        .eq('round_number', roundNumber)
        .maybeSingle();

    if (existing) {
        return Swal.fire('แจ้งเตือน', `มีรอบที่ ${roundNumber} ของปีงบประมาณ ${fiscalYear} อยู่แล้ว`, 'warning');
    }

    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        if (isActive) {
            await db.from('eval_rounds').update({ is_active: false }).neq('id', '');
        }

        const data = {
            fiscal_year: fiscalYear,
            round_number: roundNumber,
            round_name: roundName,
            start_date: startDate,
            end_date: endDate,
            is_active: isActive
        };

        console.log('📝 กำลังบันทึกข้อมูล:', data);

        const { error } = await db.from('eval_rounds').insert([data]);
        if (error) {
            console.error('❌ Insert error:', error);

            if (error.message.includes('row-level security policy')) {
                Swal.close();
                return Swal.fire({
                    icon: 'error',
                    title: 'ข้อผิดพลาดด้านความปลอดภัย',
                    html: `
                        <p>ไม่สามารถบันทึกข้อมูลได้เนื่องจากนโยบายความปลอดภัย</p>
                        <p class="text-sm text-gray-500 mt-2">กรุณาติดต่อผู้ดูแลระบบเพื่อตั้งค่า RLS Policy</p>
                        <p class="text-xs text-gray-400 mt-2">Error: ${error.message}</p>
                    `,
                    confirmButtonText: 'ตกลง'
                });
            }
            throw error;
        }

        Swal.fire('สำเร็จ', 'บันทึกรอบการประเมินเรียบร้อย', 'success');
        document.getElementById('evalRoundForm').reset();
        document.getElementById('round_is_active').checked = false;
        await loadAllEvalRounds();
        await loadEvalRounds();
        await loadActiveRound();
    } catch (err) {
        console.error('❌ Error saving eval round:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ✅ ฟังก์ชันลบรอบ
async function deleteEvalRound(roundId) {
    const { data: roundData } = await db
        .from('eval_rounds')
        .select('round_name, is_active')
        .eq('id', roundId)
        .single();

    if (roundData?.is_active) {
        return Swal.fire('⚠️ ไม่สามารถลบรอบที่กำลัง Active', `"${roundData.round_name}" กำลังถูกใช้งานอยู่`, 'warning');
    }

    const result = await Swal.fire({
        icon: 'warning',
        title: 'ยืนยันการลบ',
        html: `
            <p>คุณต้องการลบรอบ <b>${roundData?.round_name || 'นี้'}</b> หรือไม่?</p>
            <p class="text-sm text-red-500 mt-2">⚠️ ข้อมูลที่เกี่ยวข้องจะถูกลบด้วย</p>
        `,
        showCancelButton: true,
        confirmButtonText: '🗑️ ลบ',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#d33'
    });

    if (!result.isConfirmed) return;

    Swal.fire({ title: 'กำลังลบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        await db.from('eval_committee').delete().eq('eval_round_id', roundId);

        const { error } = await db.from('eval_rounds').delete().eq('id', roundId);
        if (error) throw error;

        await loadAllEvalRounds();
        await loadEvalRounds();
        await loadActiveRound();

        Swal.fire('สำเร็จ', 'ลบรอบการประเมินเรียบร้อย', 'success');
    } catch (err) {
        console.error('Error deleting eval round:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ✅ เพิ่มฟังก์ชันปิด Active (เพิ่มในส่วน Tab 4)
async function deactivateRound(roundId) {
    const { data: roundData } = await db
        .from('eval_rounds')
        .select('round_name')
        .eq('id', roundId)
        .single();

    const result = await Swal.fire({
        icon: 'question',
        title: 'ยืนยันการปิด Active',
        html: `
            <p>คุณต้องการปิด Active ของ <b>${roundData?.round_name || 'รอบนี้'}</b> หรือไม่?</p>
            <p class="text-sm text-gray-500 mt-2">(หลังจากปิด จะไม่มีรอบ Active)</p>
        `,
        showCancelButton: true,
        confirmButtonText: '✅ ปิด Active',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#d33'
    });

    if (!result.isConfirmed) return;

    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const { error } = await db
            .from('eval_rounds')
            .update({ is_active: false })
            .eq('id', roundId);

        if (error) throw error;

        await loadAllEvalRounds();
        await loadEvalRounds();
        await loadActiveRound();

        Swal.fire({
            icon: 'success',
            title: 'สำเร็จ!',
            html: `ปิด Active ของ <b>${roundData?.round_name || 'รอบที่เลือก'}</b> เรียบร้อย`,
            timer: 2000,
            showConfirmButton: true
        });
    } catch (err) {
        console.error('Error deactivating round:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ✅ ฟังก์ชันช่วยเหลือ - หาปีงบประมาณปัจจุบัน
function getCurrentFiscalYear() {
    const now = new Date();
    const year = now.getFullYear() + 543;
    const month = now.getMonth();

    if (month < 9) {
        return year - 1;
    }
    return year;
}

// ==========================================
// GAS Config
// ==========================================
async function loadGASConfig() {
    try {
        const { data, error } = await db
            .from('system_config')
            .select('*')
            .in('key', ['gas_api_url', 'gas_template_id']);

        if (error) throw error;

        data?.forEach(item => {
            if (item.key === 'gas_api_url') {
                document.getElementById('gas_api_url').value = item.value || '';
            } else if (item.key === 'gas_template_id') {
                document.getElementById('gas_template_id').value = item.value || '';
            }
        });
    } catch (err) {
        console.error('Error loading GAS config:', err);
    }
}

async function saveGASConfig() {
    const configs = [
        { key: 'gas_api_url', value: document.getElementById('gas_api_url').value },
        { key: 'gas_template_id', value: document.getElementById('gas_template_id').value }
    ];

    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        for (const config of configs) {
            const { error } = await db
                .from('system_config')
                .upsert([config], { onConflict: 'key' });

            if (error) throw error;
        }

        Swal.fire('สำเร็จ', 'บันทึกการตั้งค่า GAS เรียบร้อย', 'success');
    } catch (err) {
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// Admin Management
// ==========================================
async function loadUsersForAdmin() {
    try {
        const { data, error } = await db
            .from('core_personnel')
            .select('id, first_name, last_name, role')
            .not('role', 'in', '("admin","super_admin")');

        if (error) throw error;

        const select = document.getElementById('admin_user_select');
        if (!select) return;

        select.innerHTML = '<option value="">-- เลือกผู้ใช้ --</option>';
        data?.forEach(user => {
            select.innerHTML += `
                <option value="${user.id}">${user.first_name} ${user.last_name} (${user.role})</option>
            `;
        });
    } catch (err) {
        console.error('Error loading users for admin:', err);
    }
}

async function loadAdminList() {
    try {
        const { data, error } = await db
            .from('core_personnel')
            .select('id, first_name, last_name, role')
            .in('role', ['admin', 'super_admin']);

        if (error) throw error;

        const container = document.getElementById('adminList');
        if (!container) return;

        if (!data || data.length === 0) {
            container.innerHTML = '<p class="text-gray-400">ยังไม่มีแอดมิน</p>';
            return;
        }

        container.innerHTML = data.map(user => `
            <div class="flex justify-between items-center border-b py-2">
                <span><b>${user.first_name} ${user.last_name}</b> (${user.role})</span>
                ${user.id !== currentUser.id ? `<button onclick="removeAdmin('${user.id}')" class="text-red-500 hover:text-red-700 text-sm">❌ ลบ</button>` : '<span class="text-xs text-gray-400">(คุณ)</span>'}
            </div>
        `).join('');
    } catch (err) {
        console.error('Error loading admin list:', err);
    }
}

async function addAdmin() {
    const userId = document.getElementById('admin_user_select').value;
    const role = document.getElementById('admin_role_select').value;

    if (!userId) {
        return Swal.fire('แจ้งเตือน', 'กรุณาเลือกผู้ใช้', 'warning');
    }

    Swal.fire({ title: 'กำลังเพิ่ม...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const { error } = await db
            .from('core_personnel')
            .update({ role: role })
            .eq('id', userId);

        if (error) throw error;

        Swal.fire('สำเร็จ', 'เพิ่มแอดมินเรียบร้อย', 'success');
        await loadAdminList();
        await loadUsersForAdmin();
    } catch (err) {
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

async function removeAdmin(userId) {
    const result = await Swal.fire({
        icon: 'warning',
        title: 'ยืนยันการลบ',
        text: 'คุณต้องการลบแอดมินคนนี้หรือไม่?',
        showCancelButton: true,
        confirmButtonText: 'ลบ',
        cancelButtonText: 'ยกเลิก'
    });

    if (!result.isConfirmed) return;

    Swal.fire({ title: 'กำลังลบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const { error } = await db
            .from('core_personnel')
            .update({ role: 'teacher' })
            .eq('id', userId);

        if (error) throw error;

        Swal.fire('สำเร็จ', 'ลบแอดมินเรียบร้อย', 'success');
        await loadAdminList();
        await loadUsersForAdmin();
    } catch (err) {
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// ฟังก์ชันช่วยเหลือ
// ==========================================
function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}