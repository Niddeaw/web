// ==========================================
// evaluation_admin_results.js - จัดการผลการประเมินและการให้คะแนน
// ==========================================

// ==========================================
// TAB 3: ผลการประเมิน (เดิม)
// ==========================================
async function loadResultsTable() {
    const tbody = document.getElementById('tb-results');
    if (!tbody) return;

    if (resultsDataTable) {
        resultsDataTable.destroy();
        resultsDataTable = null;
    }

    const roundId = document.getElementById('filter_round_for_results').value;

    let query = db.from('eval_final_results').select('*, core_personnel(first_name, last_name, academic_standing)');
    if (roundId) {
        query = query.eq('eval_round_id', roundId);
    }
    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
        console.error('Error loading results:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-8 text-red-400">
                    <i class="fa-solid fa-circle-exclamation mr-2"></i>โหลดข้อมูลล้มเหลว
                </td>
            </tr>
        `;
        return;
    }

    if (!data || data.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-8 text-gray-400">
                    <i class="fa-solid fa-info-circle mr-2"></i>ยังไม่มีผลการประเมิน${roundId ? ' ในรอบนี้' : ''}
                </td>
            </tr>
        `;
        return;
    }

    let html = '';
    data.forEach(result => {
        const user = result.core_personnel;
        const name = user ? `${user.first_name || ''} ${user.last_name || ''}` : '-';
        const standing = user ? user.academic_standing || '-' : '-';
        const score = result.average_score || 0;
        const level = getLevelText(score);
        const status = result.status === 'finalized'
            ? '<span class="status-badge done">✅ สรุปแล้ว</span>'
            : '<span class="status-badge pending">⏳ รอสรุป</span>';

        html += `
            <tr>
                <td class="font-medium">${name}</td>
                <td>${standing}</td>
                <td class="text-center font-bold text-blue-600">${score.toFixed(2)}</td>
                <td class="text-center">${result.evaluator_count || 0}</td>
                <td class="text-center">${result.committee_group_count || 0}</td>
                <td class="text-center">
                    <span class="px-3 py-1 rounded-full text-xs font-bold ${level.color}">
                        ${level.text}
                    </span>
                </td>
                <td class="text-center">${status}</td>
                <td class="text-center">
                    <button onclick="viewResultDetail('${result.evaluatee_id}', '${result.eval_round_id}')" 
                            class="bg-purple-500 hover:bg-purple-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                        <i class="fa-solid fa-eye mr-1"></i>ดูรายละเอียด
                    </button>
                    <button onclick="recalculateResult('${result.evaluatee_id}', '${result.eval_round_id}')" 
                            class="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ml-1">
                        <i class="fa-solid fa-rotate mr-1"></i>คำนวณใหม่
                    </button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}


// ==========================================
// ฟังก์ชันแสดงระดับคุณภาพ (เดิม)
// ==========================================
function getLevelText(score) {
    if (score >= 80) return { text: 'ดีมาก', color: 'bg-emerald-100 text-emerald-700' };
    if (score >= 70) return { text: 'ดี', color: 'bg-blue-100 text-blue-700' };
    if (score >= 60) return { text: 'พอใช้', color: 'bg-yellow-100 text-yellow-700' };
    return { text: 'ควรปรับปรุง', color: 'bg-red-100 text-red-700' };
}

// ==========================================
// ดูรายละเอียดผลการประเมิน (เดิม)
// ==========================================
async function viewResultDetail(evaluateeId, evalRoundId) {
    window.open(`evaluation.html?view=${evaluateeId}&round=${evalRoundId}`, '_blank');
}

// ==========================================
// คำนวณผลใหม่ (เดิม)
// ==========================================
async function recalculateResult(evaluateeId, evalRoundId) {
    const result = await Swal.fire({
        icon: 'question',
        title: 'ยืนยันการคำนวณใหม่',
        text: 'คุณต้องการคำนวณผลการประเมินใหม่ใช่หรือไม่?',
        showCancelButton: true,
        confirmButtonText: 'ใช่, คำนวณใหม่',
        cancelButtonText: 'ยกเลิก'
    });

    if (!result.isConfirmed) return;

    // เรียกใช้ฟังก์ชันจาก evaluation.js
    if (typeof saveFinalScore === 'function') {
        await saveFinalScore(evaluateeId, evalRoundId);
        await loadResultsTable();
    } else {
        Swal.fire('ผิดพลาด', 'ไม่พบฟังก์ชันคำนวณผล กรุณาตรวจสอบการโหลดไฟล์', 'error');
    }
}

// ==========================================
// ฟังก์ชันคำนวณ Mode (ค่าที่ซ้ำมากที่สุด)
// ==========================================
function calculateMode(arr) {
    if (!arr || arr.length === 0) return '-';

    const frequency = {};
    let maxFreq = 0;
    let mode = arr[0];

    arr.forEach(num => {
        const key = String(num);
        frequency[key] = (frequency[key] || 0) + 1;
        if (frequency[key] > maxFreq) {
            maxFreq = frequency[key];
            mode = num;
        }
    });

    return mode;
}

// ==========================================
// สรุปผลทั้งหมด (Wrapper) - เรียกใช้ฟังก์ชันจาก evaluation_logic.js
// ==========================================
async function triggerGenerateAllFinalScores() {
    const roundId = document.getElementById('filter_round_for_results').value;
    if (!roundId) {
        return Swal.fire('แจ้งเตือน', 'กรุณาเลือกรอบการประเมินก่อนสรุปผล', 'warning');
    }
    // เรียกฟังก์ชันที่อยู่ใน evaluation_logic.js
    if (typeof window.generateAllFinalScores === 'function') {
        await window.generateAllFinalScores(roundId);
        await loadResultsTable();
    } else {
        Swal.fire('ผิดพลาด', 'ไม่พบฟังก์ชันสรุปผล กรุณาตรวจสอบการโหลดไฟล์', 'error');
    }
}

// ==========================================
// ✅ ตรวจสอบการให้คะแนนรายบุคคลของกรรมการ (ปรับปรุง)
// ==========================================
async function checkEvaluatorAssignments() {
    // ใช้ currentEvalRound จาก core เป็นหลัก
    const roundId = currentEvalRound?.id || document.getElementById('filter_round_for_results').value;
    if (!roundId) {
        return Swal.fire('แจ้งเตือน', 'ไม่พบรอบการประเมินที่เปิดใช้งาน หรือกรุณาเลือกรอบใน dropdown', 'warning');
    }

    Swal.fire({
        title: 'กำลังตรวจสอบการให้คะแนน...',
        html: 'กำลังโหลดข้อมูลชุดคณะกรรมการ...',
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => { Swal.showLoading(); }
    });

    try {
        // ดึงข้อมูลชุดคณะกรรมการและสมาชิก (กรองตามรอบ)
        const { data: groups, error: gErr } = await db
            .from('eval_committee_groups')
            .select('*, eval_committee_members(user_id, role, core_personnel(first_name, last_name))')
            .eq('eval_round_id', roundId)
            .eq('is_active', true);

        if (gErr) throw gErr;

        if (!groups || groups.length === 0) {
            Swal.close();
            return Swal.fire('แจ้งเตือน', 'ไม่พบชุดคณะกรรมการในรอบนี้', 'info');
        }

        // เก็บ HTML ทั้งหมด
        let html = '';
        let totalEvaluated = 0;
        let totalPending = 0;

        // วนลูปแต่ละชุด (ใช้ for...of เพื่อรอ await)
        for (let i = 0; i < groups.length; i++) {
            const group = groups[i];
            const members = group.eval_committee_members || [];
            if (members.length === 0) continue;

            // อัปเดตสถานะ
            Swal.update({
                html: `กำลังตรวจสอบชุด: <b>${group.group_name}</b> (กรรมการ ${members.length} คน)<br><small>ชุดที่ ${i + 1} จาก ${groups.length}</small>`
            });

            // ดึงกลุ่มเป้าหมาย (department)
            const { data: targets, error: tErr } = await db
                .from('eval_committee_targets')
                .select('target_value')
                .eq('committee_group_id', group.id)
                .eq('target_type', 'department')
                .eq('is_active', true);

            if (tErr) throw tErr;

            const departments = (targets || []).map(t => t.target_value);
            if (departments.length === 0) continue;

            // ดึงครูจากทุก department แบบขนาน
            const validStandings = ['ครูผู้ช่วย', 'ครู', 'ครูชำนาญการ', 'ครูชำนาญการพิเศษ', 'ไม่มีวิทยฐานะ'];
            const teacherPromises = departments.map(dept =>
                db.from('core_personnel')
                    .select('id, prefix, first_name, last_name, academic_standing')
                    .eq('department', dept)
                    .in('position', ['ครู', 'ครูผู้ช่วย'])
                    .in('academic_standing', ['ครูผู้ช่วย', 'ไม่มีวิทยฐานะ', 'ครูชำนาญการ', 'ครูชำนาญการพิเศษ'])
            );
            const teacherResults = await Promise.all(teacherPromises);
            let allTeachers = [];
            teacherResults.forEach(res => {
                if (!res.error && res.data) allTeachers = allTeachers.concat(res.data);
            });

            if (allTeachers.length === 0) continue;

            // ดึงผลการประเมินของครูทั้งหมดในชุดนี้
            const teacherIds = allTeachers.map(t => t.id);
            const { data: allEvals, error: eErr } = await db
                .from('eval_results')
                .select('evaluatee_id, evaluator_id')
                .in('evaluatee_id', teacherIds)
                .eq('eval_round_id', roundId)
                .eq('eval_type', 'committee')
                .eq('status', 'submitted');

            if (eErr) throw eErr;

            // สร้าง Map: evaluator_id -> Set(evaluatee_id)
            const evaluatorMap = {};
            (allEvals || []).forEach(ev => {
                if (!evaluatorMap[ev.evaluator_id]) evaluatorMap[ev.evaluator_id] = new Set();
                evaluatorMap[ev.evaluator_id].add(ev.evaluatee_id);
            });

            // สร้างแถวตารางสำหรับชุดนี้
            let tableRows = '';
            for (const member of members) {
                const evaluatorId = member.user_id;
                const evaluatorName = member.core_personnel
                    ? `${member.core_personnel.first_name} ${member.core_personnel.last_name}`
                    : '-';

                const evaluatedIds = evaluatorMap[evaluatorId] || new Set();
                const notEvaluatedTeachers = allTeachers.filter(t => !evaluatedIds.has(t.id));
                const notEvaluatedNames = notEvaluatedTeachers.map(t =>
                    `${t.prefix || ''}${t.first_name} ${t.last_name}`
                ).join(', ');

                totalEvaluated += evaluatedIds.size;
                totalPending += notEvaluatedTeachers.length;

                tableRows += `
                    <tr class="border-b border-gray-100 hover:bg-gray-50">
                        <td class="p-2 font-medium">${evaluatorName}</td>
                        <td class="p-2 text-center font-bold text-green-600">${evaluatedIds.size}</td>
                        <td class="p-2 text-center font-bold text-red-500">${notEvaluatedTeachers.length}</td>
                        <td class="p-2 text-xs text-gray-600 max-w-[300px] truncate" title="${notEvaluatedNames}">
                            ${notEvaluatedTeachers.length > 0 ? notEvaluatedNames : '<span class="text-green-500">✅ ประเมินครบแล้ว</span>'}
                        </td>
                    </tr>
                `;
            }

            html += `
                <div class="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                    <div class="flex justify-between items-center mb-2">
                        <h4 class="font-bold text-blue-800">${group.group_name || 'ไม่ระบุชื่อชุด'} (${members.length} คน)</h4>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm bg-white rounded-lg overflow-hidden shadow-sm">
                            <thead class="bg-blue-100 text-blue-700">
                                <tr>
                                    <th class="p-2 text-left">กรรมการ</th>
                                    <th class="p-2 text-center">ประเมินแล้ว (คน)</th>
                                    <th class="p-2 text-center">ยังไม่ประเมิน (คน)</th>
                                    <th class="p-2 text-left">ครูที่ยังไม่ถูกประเมินจากท่านนี้</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${tableRows}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;

            // ให้ UI refresh เล็กน้อย
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        // สรุปภาพรวม
        const summaryHtml = `
            <div class="mb-4 grid grid-cols-3 gap-3">
                <div class="bg-green-50 p-3 rounded-lg text-center border border-green-200">
                    <p class="text-xs text-gray-500">จำนวนครั้งที่ประเมินแล้ว</p>
                    <p class="text-2xl font-bold text-green-600">${totalEvaluated}</p>
                </div>
                <div class="bg-red-50 p-3 rounded-lg text-center border border-red-200">
                    <p class="text-xs text-gray-500">จำนวนครั้งที่ยังไม่ประเมิน</p>
                    <p class="text-2xl font-bold text-red-600">${totalPending}</p>
                </div>
                <div class="bg-gray-50 p-3 rounded-lg text-center border border-gray-200">
                    <p class="text-xs text-gray-500">ชุดคณะกรรมการ</p>
                    <p class="text-2xl font-bold text-gray-700">${groups.length}</p>
                </div>
            </div>
        `;

        // ปิด SweetAlert ก่อนแสดง Modal
        Swal.close();

        // สร้าง Modal (ถ้ามีอยู่แล้วให้ลบเก่า)
        let modal = document.getElementById('evaluatorAssignmentModal');
        if (modal) modal.remove();

        modal = document.createElement('div');
        modal.id = 'evaluatorAssignmentModal';
        modal.className = 'fixed inset-0 z-50 hidden';
        modal.innerHTML = `
            <div class="flex items-center justify-center min-h-screen p-4">
                <div class="bg-white rounded-2xl max-w-7xl w-full max-h-[90vh] shadow-2xl modal-content">
                    <div class="flex justify-between items-center p-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl z-10">
                        <h3 class="text-xl font-bold text-gray-800">
                            <i class="fa-solid fa-user-check text-blue-500 mr-2"></i>
                            ตรวจสอบการให้คะแนนของคณะกรรมการ (ใครประเมินใคร)
                        </h3>
                        <button onclick="closeEvaluatorAssignmentModal()" 
                                class="text-gray-400 hover:text-gray-600 transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100">
                            <i class="fa-solid fa-xmark text-2xl"></i>
                        </button>
                    </div>
                    <div class="p-6 overflow-y-auto" style="max-height: calc(90vh - 80px);">
                        <div id="evaluatorAssignmentBody">
                            ${summaryHtml}
                            ${html || '<div class="text-center py-8 text-gray-400">ไม่พบข้อมูลการให้คะแนน</div>'}
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.classList.remove('hidden');

    } catch (err) {
        console.error('Error checking evaluator assignments:', err);
        Swal.close();
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// ปิด Modal ตรวจสอบการให้คะแนนของกรรมการ
// ==========================================
function closeEvaluatorAssignmentModal() {
    const modal = document.getElementById('evaluatorAssignmentModal');
    if (modal) {
        modal.classList.add('hidden');
        setTimeout(() => {
            if (modal.parentNode) modal.parentNode.removeChild(modal);
        }, 100);
    }
}

// ==========================================
// ✅ showExportModal (แก้ไข: ใช้รายการกลุ่มสาระคงที่)
// ==========================================
async function showExportModal() {
    const roundId = document.getElementById('filter_round_for_results')?.value;
    if (!roundId) {
        return Swal.fire('แจ้งเตือน', 'กรุณาเลือกรอบการประเมินก่อนส่งออก', 'warning');
    }

    // ✅ รายการกลุ่มสาระที่อนุญาตให้ประเมิน (ตามที่กำหนด)
    const departments = [
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

    // สร้าง HTML สำหรับ checkbox กลุ่มสาระ
    let deptCheckboxes = departments.map(dept => `
        <label class="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-2 py-1 rounded">
            <input type="checkbox" class="dept-checkbox" value="${dept}">
            <span>${dept}</span>
        </label>
    `).join('');

    const { value: result } = await Swal.fire({
        title: '📤 ส่งออก Excel',
        html: `
            <div class="text-left space-y-4">
                <div>
                    <label class="block font-bold text-gray-700 mb-2">เลือกประเภทการส่งออก</label>
                    <div class="flex flex-col gap-2">
                        <label class="flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-blue-50 transition">
                            <input type="radio" name="export_type" value="self" checked>
                            <span class="font-medium">📋 สรุปการประเมินตนเอง</span>
                        </label>
                        <label class="flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-blue-50 transition">
                            <input type="radio" name="export_type" value="committee">
                            <span class="font-medium">👥 สรุปการประเมินจากกรรมการ</span>
                        </label>
                    </div>
                </div>

                <div id="deptSelection" class="border-t pt-4">
                    <div class="flex items-center justify-between mb-2">
                        <span class="font-bold text-gray-700">เลือกกลุ่มสาระ</span>
                        <label class="flex items-center gap-2 text-sm cursor-pointer">
                            <input type="checkbox" id="selectAllDepts" checked>
                            <span>เลือกทั้งหมด</span>
                        </label>
                    </div>
                    <div class="grid grid-cols-2 md:grid-cols-3 gap-1 max-h-52 overflow-y-auto p-2 bg-gray-50 rounded-lg border">
                        ${deptCheckboxes}
                    </div>
                    <p class="text-xs text-gray-400 mt-2">เฉพาะการส่งออกประเมินตนเองเท่านั้นที่กรองตามกลุ่มสาระ</p>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: '✅ ส่งออก',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#10b981',
        preConfirm: () => {
            const exportType = document.querySelector('input[name="export_type"]:checked')?.value || 'self';
            const selectedDepts = [];
            document.querySelectorAll('.dept-checkbox:checked').forEach(cb => {
                selectedDepts.push(cb.value);
            });
            const selectAll = document.getElementById('selectAllDepts')?.checked || false;
            return { exportType, selectedDepts, selectAll };
        },
        didOpen: () => {
            // จัดการ checkbox "เลือกทั้งหมด"
            const selectAll = document.getElementById('selectAllDepts');
            const checkboxes = document.querySelectorAll('.dept-checkbox');
            if (selectAll) {
                selectAll.addEventListener('change', function () {
                    checkboxes.forEach(cb => cb.checked = this.checked);
                });
                checkboxes.forEach(cb => {
                    cb.addEventListener('change', function () {
                        const allChecked = Array.from(checkboxes).every(c => c.checked);
                        selectAll.checked = allChecked;
                    });
                });
            }

            // เมื่อเปลี่ยนประเภทการส่งออก ให้แสดง/ซ่อนตัวเลือกกลุ่มสาระ
            document.querySelectorAll('input[name="export_type"]').forEach(radio => {
                radio.addEventListener('change', function () {
                    const deptDiv = document.getElementById('deptSelection');
                    if (this.value === 'self') {
                        deptDiv.style.display = 'block';
                    } else {
                        deptDiv.style.display = 'none';
                    }
                });
            });
            // เริ่มต้น: ถ้าเลือก self ให้แสดง
            const initial = document.querySelector('input[name="export_type"]:checked')?.value;
            if (initial === 'committee') {
                document.getElementById('deptSelection').style.display = 'none';
            }
        }
    });

    if (!result) return;

    const { exportType, selectedDepts, selectAll } = result;

    if (exportType === 'self') {
        const depts = selectAll ? [] : selectedDepts; // [] หมายถึงทั้งหมด
        await exportSelfEvaluation(roundId, depts);
    } else {
        await exportCommitteeEvaluation(roundId);
    }
}

// ==========================================
// ✅ 1. ส่งออกการประเมินตนเอง (ปรับชื่อไฟล์)
// ==========================================
async function exportSelfEvaluation(roundId, selectedDepts = []) {
    Swal.fire({
        title: 'กำลังสร้างไฟล์ Excel...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        // ดึงข้อมูลครูทั้งหมด (เฉพาะที่มีสิทธิ์ประเมินตนเอง)
        let query = db.from('core_personnel')
            .select('id, prefix, first_name, last_name, academic_standing, department')
            .in('position', ['ครู', 'ครูผู้ช่วย'])
            .in('academic_standing', ['ครูผู้ช่วย', 'ไม่มีวิทยฐานะ', 'ครู', 'ครูชำนาญการ', 'ครูชำนาญการพิเศษ']);

        if (selectedDepts.length > 0) {
            query = query.in('department', selectedDepts);
        }

        const { data: teachers, error: tErr } = await query.order('department').order('first_name');
        if (tErr) throw tErr;

        if (!teachers || teachers.length === 0) {
            Swal.close();
            return Swal.fire('แจ้งเตือน', 'ไม่พบข้อมูลบุคลากร', 'warning');
        }

        // ดึงผลการประเมินตนเองของครูเหล่านี้
        const teacherIds = teachers.map(t => t.id);
        const { data: selfResults, error: sErr } = await db
            .from('eval_results')
            .select('*')
            .in('evaluatee_id', teacherIds)
            .eq('eval_round_id', roundId)
            .eq('eval_type', 'self')
            .eq('status', 'submitted');

        if (sErr) throw sErr;

        const resultMap = {};
        (selfResults || []).forEach(r => {
            resultMap[r.evaluatee_id] = r;
        });

        // ใช้ STANDARD_FULL_ITEMS เป็นคอลัมน์
        const headers = ['กลุ่มสาระ', 'ชื่อ-สกุล', 'วิทยฐานะ'];
        const itemHeaders = STANDARD_FULL_ITEMS.map(item => {
            // สร้างชื่อคอลัมน์ เช่น "1.1", "2.1", "3.1"
            return `${item.element}.${item.value}`;
        });
        headers.push(...itemHeaders);
        headers.push('คะแนนรวม');

        const rows = [];

        for (const teacher of teachers) {
            const row = [
                teacher.department || '-',
                `${teacher.prefix || ''}${teacher.first_name} ${teacher.last_name}`,
                teacher.academic_standing || '-'
            ];

            const evalData = resultMap[teacher.id];
            if (evalData) {
                // แมปคะแนน
                const scoreMap = mapSelfScoresToStandards(evalData.detailed_scores || {}, teacher.academic_standing);
                // เพิ่มคะแนนตามลำดับ STANDARD_FULL_ITEMS
                for (const item of STANDARD_FULL_ITEMS) {
                    const key = `${item.element}_${item.value}_${item.part || ''}`;
                    row.push(scoreMap[key] ?? '');
                }
                row.push(evalData.total_score?.toFixed(2) || '');
            } else {
                // ไม่มีผลประเมิน ให้เว้นว่าง
                for (let i = 0; i < STANDARD_FULL_ITEMS.length; i++) {
                    row.push('');
                }
                row.push('');
            }
            rows.push(row);
        }

        // สร้าง Excel
        const wb = XLSX.utils.book_new();
        const wsData = [headers, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws['!cols'] = [
            { wch: 25 }, // กลุ่มสาระ
            { wch: 35 }, // ชื่อ-สกุล
            { wch: 20 }, // วิทยฐานะ
            ...itemHeaders.map(() => ({ wch: 12 }))
        ];
        XLSX.utils.book_append_sheet(wb, ws, 'ประเมินตนเอง');

        // ✅ ตั้งชื่อไฟล์ตามกลุ่มสาระที่เลือก
        let fileName = `ประเมินตนเอง_${new Date().toLocaleDateString('th-TH')}`;
        if (selectedDepts.length > 0 && selectedDepts.length < 11) {
            // ถ้าเลือกบางกลุ่ม (ไม่ใช่ทั้งหมด) ให้ต่อท้ายชื่อกลุ่ม
            const deptSuffix = selectedDepts.join('_');
            fileName += `_${deptSuffix}`;
        }
        fileName += '.xlsx';

        XLSX.writeFile(wb, fileName);

        Swal.close();
        Swal.fire({
            icon: 'success',
            title: 'ส่งออกสำเร็จ!',
            text: `ไฟล์ "${fileName}"`,
            timer: 2000,
            showConfirmButton: false
        });

    } catch (err) {
        console.error('Error exporting self evaluation:', err);
        Swal.close();
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

/**
 * แมปคะแนนจากการประเมินตนเองไปยัง STANDARD_FULL_ITEMS
 */
function mapSelfScoresToStandards(detailedScores, academicStanding) {
    const map = {};
    const criteria = getCriteriaByAcademic(academicStanding);

    // p1_s1
    const p1s1 = detailedScores.p1_s1 || [];
    const allItems = [];
    (criteria.part1_sec1 || []).forEach(group => {
        group.items.forEach(item => {
            allItems.push(item);
        });
    });
    allItems.forEach((item, idx) => {
        const key = `1_${item.id}_1`; // element=1, part=1
        if (idx < p1s1.length) {
            map[key] = p1s1[idx];
        }
    });

    // p1_s2
    const p1s2 = detailedScores.p1_s2 || [];
    const p1s2Ids = ['1', '2.1', '2.2'];
    p1s2Ids.forEach((id, idx) => {
        const key = `1_${id}_2`;
        if (idx < p1s2.length) {
            map[key] = p1s2[idx];
        }
    });

    // p2
    if (detailedScores.p2 !== undefined && detailedScores.p2 !== null) {
        map['2_1_'] = detailedScores.p2;
    }

    // p3
    const p3 = detailedScores.p3 || [];
    for (let i = 0; i < 10; i++) {
        const key = `3_${i+1}_`;
        if (i < p3.length) {
            map[key] = p3[i];
        }
    }

    return map;
}

// ==========================================
// ✅ 2. ส่งออกการประเมินจากกรรมการ (เฉพาะชีตสรุปรวมทุกชุด)
// ==========================================
async function exportCommitteeEvaluation(roundId) {
    Swal.fire({
        title: 'กำลังสร้างไฟล์ Excel...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        // ดึงข้อมูลสรุปรวมทุกชุด (mainGroupId = null)
        const allData = await generateCommitteeSheetData(roundId, null);
        if (!allData) {
            Swal.close();
            return Swal.fire('แจ้งเตือน', 'ไม่พบข้อมูลการประเมินจากกรรมการ', 'warning');
        }

        // สร้าง workbook และเพิ่มชีตเดียว
        const wb = XLSX.utils.book_new();
        const ws = createWorksheetFromData(allData);
        XLSX.utils.book_append_sheet(wb, ws, 'สรุปรวมทุกชุด');

        const fileName = `ประเมินจากกรรมการ_${new Date().toLocaleDateString('th-TH')}.xlsx`;
        XLSX.writeFile(wb, fileName);

        Swal.close();
        Swal.fire({
            icon: 'success',
            title: 'ส่งออกสำเร็จ!',
            text: `ไฟล์ "${fileName}"`,
            timer: 2000,
            showConfirmButton: false
        });

    } catch (err) {
        console.error('Error exporting committee evaluation:', err);
        Swal.close();
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

/**
 * สร้างข้อมูลสำหรับชีตการประเมินจากกรรมการ (Mode)
 * @param {string} roundId
 * @param {string|null} mainGroupId - ถ้า null ให้ใช้ทุก main group
 * @returns {Object|null} { headers, rows }
 */
async function generateCommitteeSheetData(roundId, mainGroupId) {
    // 1. ดึง sub groups ที่เกี่ยวข้อง
    let subQuery = db.from('eval_committee_groups')
        .select('*, eval_committee_targets(*), eval_committee_members(user_id, core_personnel(first_name, last_name))')
        .eq('eval_round_id', roundId)
        .eq('group_type', 'sub')
        .eq('is_active', true);

    if (mainGroupId) {
        subQuery = subQuery.eq('parent_group_id', mainGroupId);
    }
    const { data: subGroups, error: sgErr } = await subQuery;
    if (sgErr) throw sgErr;

    if (!subGroups || subGroups.length === 0) return null;

    // 2. รวบรวม department targets จากทุก sub group
    const deptSet = new Set();
    subGroups.forEach(sub => {
        (sub.eval_committee_targets || []).forEach(t => {
            if (t.target_type === 'department') deptSet.add(t.target_value);
        });
    });
    const departments = Array.from(deptSet);
    if (departments.length === 0) return null;

    // 3. ดึงครูใน department เหล่านั้น
    const { data: teachers, error: tErr } = await db
        .from('core_personnel')
        .select('id, prefix, first_name, last_name, academic_standing, department')
        .in('department', departments)
        .in('position', ['ครู', 'ครูผู้ช่วย'])
        .in('academic_standing', ['ครูผู้ช่วย', 'ไม่มีวิทยฐานะ', 'ครู', 'ครูชำนาญการ', 'ครูชำนาญการพิเศษ'])
        .order('department').order('first_name');

    if (tErr) throw tErr;
    if (!teachers || teachers.length === 0) return null;

    const teacherIds = teachers.map(t => t.id);

    // 4. ดึง eval_results ของครูทั้งหมดในรอบนี้ (committee)
    const { data: evalResults, error: eErr } = await db
        .from('eval_results')
        .select('*')
        .in('evaluatee_id', teacherIds)
        .eq('eval_round_id', roundId)
        .eq('eval_type', 'committee')
        .eq('status', 'submitted');

    if (eErr) throw eErr;

    // จัดกลุ่ม eval ตาม evaluatee_id
    const evalMap = {};
    (evalResults || []).forEach(ev => {
        if (!evalMap[ev.evaluatee_id]) evalMap[ev.evaluatee_id] = [];
        evalMap[ev.evaluatee_id].push(ev);
    });

    // 5. สร้าง headers (ใช้ STANDARD_FULL_ITEMS)
    const headers = ['กลุ่มสาระ', 'ชื่อ-สกุล', 'วิทยฐานะ'];
    const itemHeaders = STANDARD_FULL_ITEMS.map(item => `${item.element}.${item.value}`);
    headers.push(...itemHeaders);
    headers.push('คะแนนรวม');

    const rows = [];

    // 6. สำหรับครูแต่ละคน
    for (const teacher of teachers) {
        // หา sub groups ที่เกี่ยวข้องกับครูนี้ (department ตรง)
        const relevantSubGroups = subGroups.filter(sub => {
            const targets = sub.eval_committee_targets || [];
            return targets.some(t => t.target_type === 'department' && t.target_value === teacher.department);
        });

        if (relevantSubGroups.length === 0) {
            // ครูคนนี้ไม่อยู่ในกลุ่มเป้าหมายของ sub group ใด -> ข้าม
            continue;
        }

        // รวบรวมกรรมการที่เกี่ยวข้อง (unique user_id)
        const memberSet = new Set();
        relevantSubGroups.forEach(sub => {
            (sub.eval_committee_members || []).forEach(m => {
                if (m.user_id) memberSet.add(m.user_id);
            });
        });
        const memberIds = Array.from(memberSet);
        if (memberIds.length === 0) continue;

        // ดึง eval ของครูคนนี้
        const evals = evalMap[teacher.id] || [];
        // กรองเฉพาะ eval ที่ evaluator อยู่ใน memberIds
        const relevantEvals = evals.filter(ev => memberIds.includes(ev.evaluator_id));

        // สร้าง row เริ่มต้น
        const row = [
            teacher.department || '-',
            `${teacher.prefix || ''}${teacher.first_name} ${teacher.last_name}`,
            teacher.academic_standing || '-'
        ];

        let allScoresComplete = true;
        const scoreValues = [];

        // สำหรับแต่ละหัวข้อใน STANDARD_FULL_ITEMS
        for (const item of STANDARD_FULL_ITEMS) {
            // รวบรวมคะแนนจากกรรมการทุกคนที่มีคะแนนในหัวข้อนี้
            const scores = [];
            for (const ev of relevantEvals) {
                const score = extractScoreFromDetails(ev.detailed_scores || {}, item, teacher.academic_standing);
                if (score !== null && score !== undefined && score !== '') {
                    scores.push(score);
                }
            }

            // ตรวจสอบว่ามีคะแนนครบตามจำนวนกรรมการหรือไม่
            const isComplete = scores.length === memberIds.length;
            let modeValue = '-';
            if (isComplete && scores.length > 0) {
                const mode = calculateMode(scores);
                modeValue = mode !== null ? mode : '-';
            } else {
                allScoresComplete = false;
            }
            row.push(modeValue);
            scoreValues.push(modeValue);
        }

        // คำนวณคะแนนรวม (ถ้าครบทุกหัวข้อ)
        let totalScore = '-';
        if (allScoresComplete) {
            // รวมคะแนนจาก mode ทั้งหมด (เฉพาะที่เป็นตัวเลข)
            const numericScores = scoreValues.filter(v => typeof v === 'number' && !isNaN(v));
            if (numericScores.length === scoreValues.length) {
                totalScore = numericScores.reduce((a, b) => a + b, 0).toFixed(2);
            }
        }
        row.push(totalScore);

        rows.push(row);
    }

    return { headers, rows };
}

/**
 * ดึงคะแนนจาก detailed_scores ตาม item ใน STANDARD_FULL_ITEMS
 */
function extractScoreFromDetails(details, item, academicStanding) {
    const criteria = getCriteriaByAcademic(academicStanding);
    const element = item.element;
    const part = item.part || '';
    const value = item.value;

    if (element === '1') {
        if (part === '1') {
            // p1_s1
            const p1s1 = details.p1_s1 || [];
            const allItems = [];
            (criteria.part1_sec1 || []).forEach(group => {
                group.items.forEach(it => allItems.push(it));
            });
            const idx = allItems.findIndex(it => it.id === value || it.id === value.replace('.', '_'));
            if (idx !== -1 && idx < p1s1.length) {
                return p1s1[idx];
            }
        } else if (part === '2') {
            // p1_s2
            const p1s2 = details.p1_s2 || [];
            const idMap = { '1': 0, '2.1': 1, '2.2': 2 };
            const idx = idMap[value];
            if (idx !== undefined && idx < p1s2.length) {
                return p1s2[idx];
            }
        }
    } else if (element === '2') {
        // p2
        if (details.p2 !== undefined && details.p2 !== null) {
            return details.p2;
        }
    } else if (element === '3') {
        // p3
        const p3 = details.p3 || [];
        const idx = parseInt(value) - 1;
        if (idx >= 0 && idx < p3.length) {
            return p3[idx];
        }
    }
    return null;
}

/**
 * สร้าง worksheet จากข้อมูล { headers, rows }
 */
function createWorksheetFromData({ headers, rows }) {
    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [
        { wch: 25 }, // กลุ่มสาระ
        { wch: 35 }, // ชื่อ-สกุล
        { wch: 20 }, // วิทยฐานะ
        ...STANDARD_FULL_ITEMS.map(() => ({ wch: 12 }))
    ];
    return ws;
}

// ==========================================
// EXPOSE GLOBAL FUNCTIONS
// ==========================================

// ------------------------------------------
// ฟังก์ชันส่งออก Excel (ใหม่)
// ------------------------------------------
window.showExportModal = showExportModal;
window.exportAllResults = showExportModal;          // ตัวเดิมถูกแทนที่ด้วย showExportModal
window.exportSelfEvaluation = exportSelfEvaluation;
window.exportCommitteeEvaluation = exportCommitteeEvaluation;

// ------------------------------------------
// ฟังก์ชันอื่น ๆ (ที่มีอยู่แล้ว)
// ------------------------------------------
window.checkEvaluatorAssignments = checkEvaluatorAssignments;
window.closeEvaluatorAssignmentModal = closeEvaluatorAssignmentModal;
window.loadResultsTable = loadResultsTable;
window.getLevelText = getLevelText;
window.viewResultDetail = viewResultDetail;
window.recalculateResult = recalculateResult;
window.triggerGenerateAllFinalScores = triggerGenerateAllFinalScores;

console.log('✅ evaluation_admin_results.js loaded successfully');