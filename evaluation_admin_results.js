// ==========================================
// evaluation_admin_results.js - จัดการผลการประเมินและการให้คะแนน
// ==========================================

// ==========================================
// ✅ [IMPROVED] ผลการประเมิน — แสดงครูทั้งหมด
// รวม + เพิ่มคอลัมน์ "ความสมบูรณ์"
// ==========================================
async function loadResultsTable() {
    const tbody = document.getElementById('tb-results');
    if (!tbody) return;

    if (resultsDataTable) {
        resultsDataTable.destroy();
        resultsDataTable = null;
    }

    const roundId = document.getElementById('filter_round_for_results').value;
    if (!roundId) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center py-8 text-gray-400">
                    <i class="fa-solid fa-info-circle mr-2"></i>กรุณาเลือกรอบการประเมิน
                </td>
            </tr>
        `;
        return;
    }

    try {
        // ---- Query 1: ครูทั้งหมดที่ต้องประเมินในรอบนี้ ----
        const { data: targets, error: tErr } = await db
            .from('eval_committee_targets')
            .select('target_value, committee_group_id, eval_committee_groups!inner(eval_round_id, is_active)')
            .eq('target_type', 'department')
            .eq('is_active', true)
            .eq('eval_committee_groups.eval_round_id', roundId)
            .eq('eval_committee_groups.is_active', true);

        if (tErr) throw tErr;

        const deptSet = new Set((targets || []).map(t => t.target_value));
        const deptArray = Array.from(deptSet);

        if (deptArray.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center py-8 text-gray-400">
                        <i class="fa-solid fa-info-circle mr-2"></i>ไม่พบกลุ่มเป้าหมายในรอบนี้
                    </td>
                </tr>
            `;
            return;
        }

        // ---- Query 2: ครูในกลุ่มเป้าหมายทั้งหมด ----
        const { data: teachers, error: tcErr } = await db
            .from('core_personnel')
            .select('id, prefix, first_name, last_name, academic_standing, department')
            .in('department', deptArray)
            .in('position', ['ครู', 'ครูผู้ช่วย'])
            .in('academic_standing', ['ครูผู้ช่วย', 'ไม่มีวิทยฐานะ', 'ครูชำนาญการ', 'ครูชำนาญการพิเศษ'])
            .order('department')
            .order('first_name');

        if (tcErr) throw tcErr;

        // ---- Query 3: ผลสรุปที่มีอยู่ ----
        const { data: finalResults } = await db
            .from('eval_final_results')
            .select('*')
            .eq('eval_round_id', roundId);

        const finalMap = new Map();
        (finalResults || []).forEach(r => finalMap.set(r.evaluatee_id, r));

        // ---- Query 4: สรุปความสมบูรณ์ (นับ eval submissions) ----
        const { data: allEvals } = await db
            .from('eval_results')
            .select('evaluatee_id, sub_group_id')
            .eq('eval_round_id', roundId)
            .eq('eval_type', 'committee')
            .eq('status', 'submitted');

        // Map: evaluatee_id → Set<sub_group_id>
        const evalByTeacher = new Map();
        (allEvals || []).forEach(e => {
            if (!evalByTeacher.has(e.evaluatee_id)) evalByTeacher.set(e.evaluatee_id, new Set());
            evalByTeacher.get(e.evaluatee_id).add(e.sub_group_id);
        });

        // ---- รวมข้อมูล: ครูทุกคน + ผลสรุป (ถ้ามี) ----
        const combinedData = (teachers || []).map(t => ({
            teacher: t,
            final: finalMap.get(t.id) || null,
            groupsEvaluated: evalByTeacher.get(t.id) || new Set()
        }));

        // ---- Render ----
        if (combinedData.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center py-8 text-gray-400">
                        <i class="fa-solid fa-user-slash mr-2"></i>ไม่พบครูในกลุ่มเป้าหมาย
                    </td>
                </tr>
            `;
            return;
        }

        let html = '';
        let stats = { total: 0, finalized: 0, pending: 0, noData: 0 };
        // ✅ [SECURITY] ตรวจสอบสิทธิ์สำหรับการจัดการคะแนน
        const canManageScores = currentUser && ['admin', 'super_admin'].includes(currentUser.role);
        combinedData.forEach(({ teacher, final, groupsEvaluated }) => {
            stats.total++;

            const name = `${teacher.prefix || ''}${teacher.first_name} ${teacher.last_name}`;
            const standing = teacher.academic_standing || '-';

            let score = 0;
            let level = { text: '-', color: 'bg-gray-100 text-gray-500' };
            let statusBadge = '';
            let completeness = '';

            if (final) {
                // มีผลสรุปแล้ว
                score = final.average_score || 0;
                level = getLevelText(score);
                statusBadge = '<span class="status-badge done">✅ สรุปแล้ว</span>';
                stats.finalized++;

                // ความสมบูรณ์
                const groupCount = final.committee_group_count || 0;
                if (groupCount >= 5) {
                    completeness = `<span class="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">ครบ ${groupCount} ชุด</span>`;
                } else {
                    completeness = `<span class="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">ไม่ครบ (${groupCount} ชุด)</span>`;
                }
            } else {
                // ยังไม่มีผลสรุป
                score = 0;
                level = { text: 'รอสรุป', color: 'bg-gray-100 text-gray-500' };
                statusBadge = '<span class="status-badge pending">⏳ รอสรุป</span>';
                stats.pending++;

                const evaluatedCount = groupsEvaluated.size;
                if (evaluatedCount === 0) {
                    completeness = '<span class="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">ยังไม่ถูกประเมิน</span>';
                    stats.noData++;
                } else {
                    completeness = `<span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">ประเมินแล้ว ${evaluatedCount} ชุด</span>`;
                }
            }

            html += `
                <tr>
                    <td class="font-medium">${name}</td>
                    <td class="text-xs">${standing}</td>
                    <td class="text-center font-bold ${score > 0 ? 'text-blue-600' : 'text-gray-400'}">${score > 0 ? score.toFixed(2) : '-'}</td>
                    <td class="text-center">${final?.evaluator_count || 0}</td>
                    <td class="text-center">${final?.committee_group_count || 0}</td>
                    <td class="text-center">
                        <span class="px-3 py-1 rounded-full text-xs font-bold ${level.color}">
                            ${level.text}
                        </span>
                    </td>
                    <td class="text-center">${completeness}</td>
                    <td class="text-center">${statusBadge}</td>
                                        <td class="text-center whitespace-nowrap">
                        ${final ? `
                            <button onclick="openEvalDetailModal('${teacher.id}', '${roundId}')" 
                                    class="bg-purple-500 hover:bg-purple-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                                <i class="fa-solid fa-eye mr-1"></i>ดูรายละเอียด
                            </button>
                            ${canManageScores ? `
                                <button onclick="recalculateResult('${teacher.id}', '${roundId}')" 
                                        class="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ml-1">
                                    <i class="fa-solid fa-rotate mr-1"></i>คำนวณใหม่
                                </button>
                            ` : ''}
                        ` : `
                            ${canManageScores ? `
                                <button onclick="recalculateResult('${teacher.id}', '${roundId}')" 
                                        class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                                    <i class="fa-solid fa-calculator mr-1"></i>สรุปผล
                                </button>
                            ` : `
                                <span class="text-xs text-gray-400">⏳ รอสรุปผล</span>
                            `}
                        `}
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;

        // ---- แสดง Summary ด้านบนตาราง ----
        const summary = document.getElementById('resultsSummary');
        if (summary) {
            summary.innerHTML = `
                <div class="grid grid-cols-4 gap-3 mb-4">
                    <div class="bg-blue-50 p-3 rounded-lg text-center border border-blue-200">
                        <p class="text-xs text-gray-500">ครูทั้งหมด</p>
                        <p class="text-2xl font-bold text-blue-600">${stats.total}</p>
                    </div>
                    <div class="bg-emerald-50 p-3 rounded-lg text-center border border-emerald-200">
                        <p class="text-xs text-gray-500">สรุปแล้ว</p>
                        <p class="text-2xl font-bold text-emerald-600">${stats.finalized}</p>
                    </div>
                    <div class="bg-yellow-50 p-3 rounded-lg text-center border border-yellow-200">
                        <p class="text-xs text-gray-500">รอสรุป</p>
                        <p class="text-2xl font-bold text-yellow-600">${stats.pending}</p>
                    </div>
                    <div class="bg-red-50 p-3 rounded-lg text-center border border-red-200">
                        <p class="text-xs text-gray-500">ยังไม่ถูกประเมิน</p>
                        <p class="text-2xl font-bold text-red-600">${stats.noData}</p>
                    </div>
                </div>
            `;
            summary.classList.remove('hidden');
        }

        console.log(`✅ โหลด ${stats.total} คน | สรุปแล้ว ${stats.finalized} | รอสรุป ${stats.pending}`);

    } catch (err) {
        console.error('Error loading results:', err);
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center py-8 text-red-400">
                    <i class="fa-solid fa-circle-exclamation mr-2"></i>โหลดข้อมูลล้มเหลว: ${err.message}
                </td>
            </tr>
        `;
    }
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
    // ✅ เปลี่ยนเป็นเปิด modal แทนการ redirect
    return openEvalDetailModal(evaluateeId, evalRoundId);
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

    if (typeof saveFinalScore === 'function') {
        const saveResult = await saveFinalScore(evaluateeId, evalRoundId);
        // ✅ อัปเดต: โหลดตารางเฉพาะเมื่อสำเร็จ
        if (saveResult?.success) {
            await loadResultsTable();
        }
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
    // ✅ [SECURITY FIX] ตรวจสอบสิทธิ์
    if (!currentUser || !['admin', 'super_admin'].includes(currentUser.role)) {
        return Swal.fire({
            icon: 'error',
            title: '🔒 ไม่มีสิทธิ์',
            text: 'เฉพาะ Admin หรือ Super Admin เท่านั้นที่สามารถสรุปผลคะแนนทั้งหมดได้',
            confirmButtonText: 'ตกลง'
        });
    }

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
// ✅ [OPTIMIZED v3] ตรวจสอบการให้คะแนนรายบุคคลของกรรมการ
// Features:
//   1. เรียงชุดตามตัวเลข (1, 2, 3, ..., 10, 11)
//   2. กรอง eval_results ตาม sub_group_id → ตัวเลขตรงกัน
//   3. ✅ เพิ่มคอลัมน์ "ครูทั้งหมด" → เห็นผลรวมชัดเจน
//   4. ✅ Badge "ชุดหลัก" / "ชุดย่อย"
//   5. ✅ แยก Section Main Group / Sub Group
// ==========================================
async function checkEvaluatorAssignments() {
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
        // ---- QUERY 1: groups + members ----
        const { data: groups, error: gErr } = await db
            .from('eval_committee_groups')
            .select('id, group_name, group_type, eval_committee_members(user_id, role, core_personnel(first_name, last_name))')
            .eq('eval_round_id', roundId)
            .eq('is_active', true);

        if (gErr) throw gErr;

        if (!groups || groups.length === 0) {
            Swal.close();
            return Swal.fire('แจ้งเตือน', 'ไม่พบชุดคณะกรรมการในรอบนี้', 'info');
        }

        const groupIds = groups.map(g => g.id);

        // ---- QUERY 2-4: targets + evals + teachers พร้อมกัน ----
        const [targetsRes, evalsRes, teachersRes] = await Promise.all([
            db.from('eval_committee_targets')
                .select('committee_group_id, target_value')
                .in('committee_group_id', groupIds)
                .eq('target_type', 'department')
                .eq('is_active', true),

            db.from('eval_results')
                .select('evaluator_id, evaluatee_id, sub_group_id')
                .eq('eval_round_id', roundId)
                .eq('eval_type', 'committee')
                .eq('status', 'submitted'),

            db.from('core_personnel')
                .select('id, prefix, first_name, last_name, academic_standing, department')
                .in('position', ['ครู', 'ครูผู้ช่วย'])
                .in('academic_standing', ['ครูผู้ช่วย', 'ไม่มีวิทยฐานะ', 'ครูชำนาญการ', 'ครูชำนาญการพิเศษ'])
        ]);

        if (targetsRes.error) throw targetsRes.error;
        if (evalsRes.error) throw evalsRes.error;
        if (teachersRes.error) throw teachersRes.error;

        // ---- สร้าง Index Maps ----
        const targetsByGroup = new Map();
        (targetsRes.data || []).forEach(t => {
            if (!targetsByGroup.has(t.committee_group_id)) targetsByGroup.set(t.committee_group_id, []);
            targetsByGroup.get(t.committee_group_id).push(t.target_value);
        });

        const teachersByDept = new Map();
        (teachersRes.data || []).forEach(t => {
            if (!teachersByDept.has(t.department)) teachersByDept.set(t.department, []);
            teachersByDept.get(t.department).push(t);
        });

        const evaluatorMap = new Map();
        (evalsRes.data || []).forEach(e => {
            const key = `${e.evaluator_id}::${e.sub_group_id}`;
            if (!evaluatorMap.has(key)) evaluatorMap.set(key, new Set());
            evaluatorMap.get(key).add(e.evaluatee_id);
        });

        // ==========================================
        // ✅ [FEATURE 5] แยก Main / Sub Group
        // ==========================================
        const mainGroups = groups.filter(g => g.group_type === 'main');
        const subGroups = groups.filter(g => g.group_type === 'sub');

        // เรียงตามตัวเลข
        mainGroups.sort(compareGroupNameNatural);
        subGroups.sort(compareGroupNameNatural);

        // ==========================================
        // ตัวแปรสำหรับสะสมค่าสรุป
        // ==========================================
        let totalEvaluated = 0;
        let totalPending = 0;

        // ==========================================
        // ✅ [HELPER] สร้าง HTML ของแต่ละ section
        // ==========================================
        function buildGroupSection(groupList, sectionTitle, sectionIcon, sectionColor, sectionBg) {
            if (groupList.length === 0) return '';

            let sectionHtml = `
                <div class="mb-6 p-4 ${sectionBg} border ${sectionColor} rounded-xl">
                    <div class="flex items-center justify-between mb-3">
                        <h3 class="font-bold text-lg ${sectionColor.replace('border-', 'text-').replace('-200', '-800')}">
                            <i class="fa-solid ${sectionIcon} mr-2"></i>
                            ${sectionTitle}
                        </h3>
                        <span class="text-xs px-3 py-1 ${sectionBg} border ${sectionColor} rounded-full font-bold">
                            ${groupList.length} ชุด
                        </span>
                    </div>
                    <div class="space-y-4">
            `;

            for (const group of groupList) {
                const members = group.eval_committee_members || [];
                if (members.length === 0) continue;

                const departments = targetsByGroup.get(group.id) || [];
                if (departments.length === 0) continue;

                // รวมครูในทุก dept ของกลุ่มนี้ (unique by id)
                const teacherSet = new Map();
                for (const dept of departments) {
                    (teachersByDept.get(dept) || []).forEach(t => teacherSet.set(t.id, t));
                }
                const allTeachers = Array.from(teacherSet.values());
                const totalTeachersInGroup = allTeachers.length;

                if (allTeachers.length === 0) continue;

                // สร้างแถวตาราง
                let tableRows = '';
                for (const member of members) {
                    const evaluatorId = member.user_id;
                    const evaluatorName = member.core_personnel
                        ? `${member.core_personnel.first_name} ${member.core_personnel.last_name}`
                        : '-';

                    const evaluatedIds = evaluatorMap.get(`${evaluatorId}::${group.id}`) || new Set();
                    const notEvaluatedTeachers = allTeachers.filter(t => !evaluatedIds.has(t.id));
                    const notEvaluatedNames = notEvaluatedTeachers.map(t =>
                        `${t.prefix || ''}${t.first_name} ${t.last_name}`
                    ).join(', ');

                    totalEvaluated += evaluatedIds.size;
                    totalPending += notEvaluatedTeachers.length;

                    // แสดงสีตามสถานะ
                    const evaluatedColor = evaluatedIds.size === totalTeachersInGroup
                        ? 'text-emerald-600 font-bold'
                        : 'text-blue-600 font-bold';
                    const pendingColor = notEvaluatedTeachers.length === 0
                        ? 'text-emerald-600'
                        : 'text-red-500 font-bold';

                    tableRows += `
                        <tr class="border-b border-gray-100 hover:bg-gray-50">
                            <td class="p-2 font-medium">${evaluatorName}</td>
                            <td class="p-2 text-center font-bold text-gray-700">${totalTeachersInGroup}</td>
                            <td class="p-2 text-center ${evaluatedColor}">${evaluatedIds.size}</td>
                            <td class="p-2 text-center ${pendingColor}">${notEvaluatedTeachers.length}</td>
                            <td class="p-2 text-xs text-gray-600 max-w-[300px] truncate" title="${notEvaluatedNames}">
                                ${notEvaluatedTeachers.length > 0
                            ? notEvaluatedNames
                            : '<span class="text-emerald-500">✅ ประเมินครบแล้ว</span>'}
                            </td>
                        </tr>
                    `;
                }

                // ✅ [FEATURE 2] Badge ชุดหลัก/ชุดย่อย
                const isMain = group.group_type === 'main';
                const badgeHtml = isMain
                    ? '<span class="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200">📋 ชุดหลัก</span>'
                    : '<span class="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200">📌 ชุดย่อย</span>';

                sectionHtml += `
                    <div class="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                        <div class="p-3 bg-gray-50 border-b border-gray-200">
                            <div class="flex items-center flex-wrap gap-2">
                                <h4 class="font-bold text-gray-800">${group.group_name || 'ไม่ระบุชื่อชุด'}</h4>
                                ${badgeHtml}
                                <span class="text-xs text-gray-500 ml-auto">
                                    <i class="fa-solid fa-users mr-1"></i>กรรมการ ${members.length} คน
                                </span>
                            </div>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="w-full text-sm">
                                <thead class="bg-gray-50 text-gray-600">
                                    <tr>
                                        <th class="p-2 text-left">กรรมการ</th>
                                        <th class="p-2 text-center w-24">ครูทั้งหมด</th>
                                        <th class="p-2 text-center w-24">ประเมินแล้ว</th>
                                        <th class="p-2 text-center w-24">ยังไม่ประเมิน</th>
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
            }

            sectionHtml += `
                    </div>
                </div>
            `;
            return sectionHtml;
        }

        // ==========================================
        // สร้าง HTML ทั้งหมด
        // ==========================================
        let html = '';

        // ✅ Section 1: Main Groups
        html += buildGroupSection(
            mainGroups,
            'ชุดหลัก (Main Groups)',
            'fa-users-rectangle',
            'border-indigo-200',
            'bg-indigo-50'
        );

        // ✅ Section 2: Sub Groups
        html += buildGroupSection(
            subGroups,
            'ชุดย่อย (Sub Groups)',
            'fa-clipboard-check',
            'border-blue-200',
            'bg-blue-50'
        );

        // ---- Summary ----
        const summaryHtml = `
            <div class="mb-4 grid grid-cols-4 gap-3">
                <div class="bg-indigo-50 p-3 rounded-lg text-center border border-indigo-200">
                    <p class="text-xs text-gray-500">ชุดหลัก</p>
                    <p class="text-2xl font-bold text-indigo-600">${mainGroups.length}</p>
                </div>
                <div class="bg-blue-50 p-3 rounded-lg text-center border border-blue-200">
                    <p class="text-xs text-gray-500">ชุดย่อย</p>
                    <p class="text-2xl font-bold text-blue-600">${subGroups.length}</p>
                </div>
                <div class="bg-emerald-50 p-3 rounded-lg text-center border border-emerald-200">
                    <p class="text-xs text-gray-500">ประเมินแล้ว</p>
                    <p class="text-2xl font-bold text-emerald-600">${totalEvaluated}</p>
                </div>
                <div class="bg-red-50 p-3 rounded-lg text-center border border-red-200">
                    <p class="text-xs text-gray-500">ยังไม่ประเมิน</p>
                    <p class="text-2xl font-bold text-red-600">${totalPending}</p>
                </div>
            </div>
        `;

        Swal.close();

        // ---- สร้าง Modal ----
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
        const key = `3_${i + 1}_`;
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