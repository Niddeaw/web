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
// ส่งออก Excel ทั้งหมด (แยกชีทตามคณะกรรมการ)
// ==========================================
async function exportAllResults() {
    const roundId = document.getElementById('filter_round_for_results').value;

    if (!roundId) {
        return Swal.fire('แจ้งเตือน', 'กรุณาเลือกรอบการประเมินก่อนส่งออก', 'warning');
    }

    // ✅ แสดงสถานะการทำงาน
    Swal.fire({
        title: 'กำลังส่งออกข้อมูล...',
        html: 'กำลังโหลดข้อมูลรอบการประเมิน...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        // 1. ดึงข้อมูลรอบ
        const roundName = allRounds.find(r => r.id === roundId)?.round_name || 'รอบประเมิน';

        // 2. ดึงข้อมูลชุดคณะกรรมการทั้งหมดในรอบ
        const { data: groups, error: gErr } = await db
            .from('eval_committee_groups')
            .select('*, eval_committee_members(user_id, role, core_personnel(first_name, last_name, academic_standing))')
            .eq('eval_round_id', roundId)
            .eq('is_active', true);

        if (gErr) throw gErr;

        if (!groups || groups.length === 0) {
            Swal.close();
            return Swal.fire('แจ้งเตือน', 'ไม่พบชุดคณะกรรมการในรอบนี้', 'warning');
        }

        // ✅ สร้าง Workbook
        const wb = XLSX.utils.book_new();

        // 3. สร้างชีทสรุปภาพรวม (สรุปคะแนนรวม)
        const { data: finalResults, error: fErr } = await db
            .from('eval_final_results')
            .select('*, core_personnel(first_name, last_name, academic_standing, department)')
            .eq('eval_round_id', roundId)
            .eq('status', 'finalized');

        if (!fErr && finalResults && finalResults.length > 0) {
            const summaryData = finalResults.map(r => ({
                'ชื่อ-สกุล': `${r.core_personnel?.first_name || ''} ${r.core_personnel?.last_name || ''}`,
                'กลุ่มสาระ': r.core_personnel?.department || '-',
                'วิทยฐานะ': r.core_personnel?.academic_standing || '-',
                'คะแนนเฉลี่ย': r.average_score?.toFixed(2) || '0.00',
                'จำนวนกรรมการ': r.evaluator_count || 0,
                'จำนวนชุด': r.committee_group_count || 0,
                'ระดับคุณภาพ': getLevelText(r.average_score).text
            }));

            const wsSummary = XLSX.utils.json_to_sheet(summaryData);
            XLSX.utils.book_append_sheet(wb, wsSummary, 'สรุปทั้งหมด');
        }

        // 4. วนลูปสร้างชีทตามชุดคณะกรรมการ
        for (const group of groups) {
            const groupName = group.group_name || 'ไม่ระบุชื่อชุด';
            
            // ✅ ดึงกลุ่มเป้าหมาย (Department)
            const { data: targets } = await db
                .from('eval_committee_targets')
                .select('target_value')
                .eq('committee_group_id', group.id)
                .eq('target_type', 'department')
                .eq('is_active', true);

            const departments = (targets || []).map(t => t.target_value);

            // ✅ ดึงหัวข้อที่ต้องประเมิน (selected_sub_items)
            const subItems = group.selected_sub_items || [];
            const subItemLabels = subItems.map(item => {
                const standard = STANDARD_FULL_ITEMS.find(s => s.element === item.element && s.value === item.value && s.part === (item.part || ''));
                return standard ? standard.label : `${item.element}:${item.value}`;
            });

            // ✅ ดึงครูในกลุ่มเป้าหมาย
            let allTeachers = [];
            for (const dept of departments) {
                const { data: teachers, error: tErr } = await db
                    .from('core_personnel')
                    .select('id, prefix, first_name, last_name, academic_standing')
                    .eq('department', dept)
                    .in('academic_standing', ['ครูผู้ช่วย', 'ครู', 'ครูชำนาญการ', 'ครูชำนาญการพิเศษ']);

                if (!tErr && teachers) allTeachers = [...allTeachers, ...teachers];
            }

            if (allTeachers.length === 0) continue;

            // ✅ สร้าง Header ของตาราง
            const headerRow = ['กลุ่มสาระฯ', 'รายชื่อ', 'ตำแหน่ง', 'วิทยฐานะ', ...subItemLabels];

            // ✅ สร้างข้อมูลแถวครูแต่ละคน
            const rows = [];
            const teacherIds = allTeachers.map(t => t.id);

            // ดึงคะแนนทั้งหมดของครูในชุดนี้
            const { data: allEvals, error: eErr } = await db
                .from('eval_results')
                .select('evaluatee_id, detailed_scores, total_score')
                .in('evaluatee_id', teacherIds)
                .eq('eval_round_id', roundId)
                .eq('eval_type', 'committee')
                .eq('status', 'submitted');

            if (eErr) throw eErr;

            // ✅ คำนวณ Mode ของแต่ละหัวข้อ
            for (const teacher of allTeachers) {
                const row = [
                    departments.join(', '), // กลุ่มสาระฯ
                    `${teacher.prefix || ''}${teacher.first_name} ${teacher.last_name}`, // รายชื่อ
                    'ครู', // ตำแหน่ง
                    teacher.academic_standing || '-' // วิทยฐานะ
                ];

                // ✅ สำหรับแต่ละหัวข้อ ให้คำนวณ Mode จากคะแนนของกรรมการทุกคน
                for (const item of subItems) {
                    const key = item.element === '1' ? (item.part === '1' ? 'p1_s1' : 'p1_s2') : (item.element === '2' ? 'p2' : 'p3');
                    
                    // ดึงคะแนนของครูคนนี้จากทุกคน
                    const scores = [];
                    (allEvals || []).filter(ev => ev.evaluatee_id === teacher.id).forEach(ev => {
                        if (ev.detailed_scores && ev.detailed_scores[key]) {
                            if (Array.isArray(ev.detailed_scores[key])) {
                                scores.push(...ev.detailed_scores[key]);
                            } else {
                                scores.push(ev.detailed_scores[key]);
                            }
                        }
                    });

                    // ✅ คำนวณ Mode (ค่าที่ซ้ำมากที่สุด)
                    const mode = calculateMode(scores);
                    row.push(mode);
                }

                rows.push(row);
            }

            // ✅ สร้างแถวรายชื่อกรรมการสำหรับลงนาม
            const members = group.eval_committee_members || [];
            const memberNames = members.map(m => 
                m.core_personnel ? `${m.core_personnel.prefix || ''}${m.core_personnel.first_name} ${m.core_personnel.last_name}` : '-'
            );

            // เพิ่มแถวว่าง 1 แถว
            rows.push([]);
            rows.push(['รายชื่อคณะกรรมการสำหรับลงนาม']);

            // เพิ่มรายชื่อกรรมการทีละคน (ในคอลัมภ์ B)
            memberNames.forEach((name, idx) => {
                const signRow = ['', `${idx + 1}. ${name}`, '', ''];
                rows.push(signRow);
            });

            // ✅ สร้าง Sheet
            const ws = XLSX.utils.aoa_to_sheet([headerRow, ...rows]);

            // ✅ กำหนดความกว้างคอลัมภ์
            ws['!cols'] = [
                { wch: 25 }, // A: กลุ่มสาระ
                { wch: 30 }, // B: รายชื่อ
                { wch: 15 }, // C: ตำแหน่ง
                { wch: 20 }, // D: วิทยฐานะ
                ...subItemLabels.map(() => ({ wch: 18 })) // E ขึ้นไป: หัวข้อ
            ];

            // ✅ ตั้งชื่อชีท (จำกัดความยาวไม่เกิน 31 ตัวอักษร)
            const safeSheetName = groupName.substring(0, 31);
            XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
        }

        // ✅ ปิด SweetAlert และบันทึกไฟล์
        Swal.close();

        XLSX.writeFile(wb, `ผลประเมิน_${roundName}_${new Date().toLocaleDateString('th-TH')}.xlsx`);

        Swal.fire({
            icon: 'success',
            title: 'ส่งออกสำเร็จ!',
            text: 'ไฟล์ Excel ถูกบันทึกเรียบร้อยแล้ว',
            timer: 2000,
            showConfirmButton: false
        });

    } catch (err) {
        console.error('Error exporting:', err);
        Swal.close();
        Swal.fire('ผิดพลาด', err.message, 'error');
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
// สรุปผลทั้งหมด (เดิม)
// ==========================================
async function generateAllFinalScores() {
    const roundId = document.getElementById('filter_round_for_results').value;

    if (!roundId) {
        return Swal.fire('แจ้งเตือน', 'กรุณาเลือกรอบการประเมินก่อนสรุปผล', 'warning');
    }

    if (typeof window.generateAllFinalScores === 'function') {
        await window.generateAllFinalScores(roundId);
        await loadResultsTable();
    } else {
        Swal.fire('ผิดพลาด', 'ไม่พบฟังก์ชันสรุปผล กรุณาตรวจสอบการโหลดไฟล์', 'error');
    }
}

// ==========================================
// ✅ [ฟังก์ชันใหม่] ตรวจสอบการให้คะแนนรายบุคคลของกรรมการ
// (เวอร์ชันแสดง Progress ผ่าน SweetAlert)
// ==========================================
async function checkEvaluatorAssignments() {
    const roundId = document.getElementById('filter_round_for_results').value;

    if (!roundId) {
        return Swal.fire('แจ้งเตือน', 'กรุณาเลือกรอบการประเมินก่อนตรวจสอบ', 'warning');
    }

    // ✅ แสดง SweetAlert เริ่มต้น
    Swal.fire({
        title: 'กำลังตรวจสอบการให้คะแนน...',
        html: 'กำลังโหลดข้อมูลชุดคณะกรรมการ...',
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    // ดึงข้อมูลชุดคณะกรรมการและสมาชิก (กรองตามรอบทันที!)
    const { data: groups, error: gErr } = await db
        .from('eval_committee_groups')
        .select('*, eval_committee_members(user_id, role, core_personnel(first_name, last_name))')
        .eq('eval_round_id', roundId)
        .eq('is_active', true);

    if (gErr) throw gErr;

    // ✅ อัปเดต SweetAlert: ดึงข้อมูลสำเร็จ
    Swal.update({
        html: `✅ ดึงข้อมูลชุดคณะกรรมการสำเร็จ: <b>${groups.length}</b> ชุด<br>กำลังโหลดรายละเอียดกรรมการ...`
    });

    // สร้าง Modal
    const modal = document.createElement('div');
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
                        <div class="text-center py-8">
                            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
                            <p class="mt-4 text-gray-500">กำลังโหลดข้อมูล...</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.classList.remove('hidden');

    try {
        let html = '';
        let totalEvaluated = 0;
        let totalPending = 0;

        // ✅ วนลูปดูแต่ละชุดคณะกรรมการ
        for (let i = 0; i < groups.length; i++) {
            const group = groups[i];
            const members = group.eval_committee_members || [];
            if (members.length === 0) continue;

            // ✅ อัปเดต SweetAlert: กำลังตรวจสอบชุดที่ i+1
            Swal.update({
                html: `กำลังตรวจสอบชุด: <b>${group.group_name}</b> (กรรมการ ${members.length} คน)<br><small>ชุดที่ ${i + 1} จาก ${groups.length}</small>`
            });

            // ✅ ดึงกลุ่มเป้าหมาย
            const { data: targets } = await db
                .from('eval_committee_targets')
                .select('target_value')
                .eq('committee_group_id', group.id)
                .eq('target_type', 'department')
                .eq('is_active', true);

            const departments = (targets || []).map(t => t.target_value);

            // ✅ ดึงครูในกลุ่มเป้าหมาย
            let allTeachers = [];
            for (const dept of departments) {
                const { data: teachers, error: tErr } = await db
                    .from('core_personnel')
                    .select('id, prefix, first_name, last_name, academic_standing')
                    .eq('department', dept)
                    .in('academic_standing', ['ครูผู้ช่วย', 'ครู', 'ครูชำนาญการ', 'ครูชำนาญการพิเศษ']);

                if (!tErr && teachers) allTeachers = [...allTeachers, ...teachers];
            }

            if (allTeachers.length === 0) continue;

            // ✅ ดึงข้อมูลการประเมินทั้งหมดของชุดนี้ในคราวเดียว (ลดการ Query ซ้ำซ้อน)
            const teacherIds = allTeachers.map(t => t.id);
            const { data: allEvals, error: eErr } = await db
                .from('eval_results')
                .select('evaluatee_id, evaluator_id')
                .in('evaluatee_id', teacherIds)
                .eq('eval_round_id', roundId)
                .eq('eval_type', 'committee')
                .eq('status', 'submitted');

            if (eErr) throw eErr;

            // ✅ สร้าง Map ข้อมูล: evaluator_id -> Set(evaluatee_id) (ประเมินแล้ว)
            const evaluatorMap = {}; 
            (allEvals || []).forEach(ev => {
                if (!evaluatorMap[ev.evaluator_id]) {
                    evaluatorMap[ev.evaluator_id] = new Set();
                }
                evaluatorMap[ev.evaluator_id].add(ev.evaluatee_id);
            });

            // แสดง Header ของชุด
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
            `;

            // ✅ วนลูปดูกรรมการแต่ละคน (ใช้ข้อมูลจาก evaluatorMap ที่โหลดมาแล้ว)
            for (const member of members) {
                const evaluatorId = member.user_id;
                const evaluatorName = member.core_personnel ? `${member.core_personnel.first_name} ${member.core_personnel.last_name}` : '-';

                const evaluatedIds = evaluatorMap[evaluatorId] || new Set();
                const notEvaluatedTeachers = allTeachers.filter(t => !evaluatedIds.has(t.id));
                const notEvaluatedNames = notEvaluatedTeachers.map(t => `${t.prefix || ''}${t.first_name} ${t.last_name}`).join(', ');

                totalEvaluated += evaluatedIds.size;
                totalPending += notEvaluatedTeachers.length;

                html += `
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
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        // ✅ สรุปภาพรวม
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

        // ✅ ปิด SweetAlert ก่อนแสดง Modal
        Swal.close();

        // ✅ แสดงผล ถ้าไม่มีข้อมูลเลย
        if (!html) {
            document.getElementById('evaluatorAssignmentBody').innerHTML = `
                <div class="text-center py-8 text-gray-400">
                    <i class="fa-solid fa-info-circle text-2xl mb-2"></i>
                    <p>ยังไม่มีข้อมูลการให้คะแนนในรอบนี้ หรือยังไม่มีการแต่งตั้งกรรมการ</p>
                </div>
            `;
        } else {
            document.getElementById('evaluatorAssignmentBody').innerHTML = summaryHtml + html;
        }

    } catch (err) {
        console.error('Error checking evaluator assignments:', err);

        // ✅ แสดง Error ผ่าน SweetAlert
        Swal.fire({
            icon: 'error',
            title: 'เกิดข้อผิดพลาด',
            text: err.message
        });
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

// ✅ Export ฟังก์ชัน
window.checkEvaluatorAssignments = checkEvaluatorAssignments;
window.closeEvaluatorAssignmentModal = closeEvaluatorAssignmentModal;
window.loadResultsTable = loadResultsTable;
window.getLevelText = getLevelText;
window.viewResultDetail = viewResultDetail;
window.recalculateResult = recalculateResult;
window.exportAllResults = exportAllResults;
window.generateAllFinalScores = generateAllFinalScores;

console.log('✅ evaluation_admin_results.js loaded successfully');