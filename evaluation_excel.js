// ==========================================
// evaluation_excel.js - ฟังก์ชัน Import/Export Excel
// ฉบับสมบูรณ์ v5 (Optimized Import - เร็วสุด)
// ==========================================

// ==========================================
// ✅ ฟังก์ชันแปลงค่าคะแนนอย่างปลอดภัย
// ==========================================
function parseScoreValue(value) {
    if (value === undefined || value === null || value === '') return null;

    let str = String(value).trim();

    if (str.includes(',')) {
        const parts = str.split(',').map(s => parseFloat(s.trim()));
        const validParts = parts.filter(n => !isNaN(n) && n >= 1 && n <= 5);
        if (validParts.length === 0) return null;
        return validParts[0];
    }

    const num = parseFloat(str);
    if (isNaN(num)) return null;

    if (num >= 1 && num <= 5) return num;
    return null;
}

// ==========================================
// ✅ ส่งออก Excel สำหรับกรรมการ (Export) - v3
// ==========================================
async function exportCommitteeExcel() {
    try {
        if (!currentEvalRound) {
            return Swal.fire('แจ้งเตือน', 'ไม่พบรอบการประเมิน', 'warning');
        }

        const evaluatorId = _impersonationMode ? _impersonatedEvaluatorId : currentUser.id;
        const evaluatorName = _impersonationMode ? _impersonatedEvaluatorName : `${currentUser.first_name} ${currentUser.last_name}`;

        if (currentUser.role === 'super_admin' && !_impersonationMode) {
            const confirm = await Swal.fire({
                icon: 'info',
                title: 'เลือกกรรมการที่ต้องการ',
                text: 'คุณอยู่ในโหมด Super Admin กรุณาเลือกกรรมการที่ต้องการส่งออก Excel ก่อน',
                showCancelButton: true,
                confirmButtonText: 'เลือกกรรมการ',
                cancelButtonText: 'ยกเลิก'
            });
            if (confirm.isConfirmed) {
                const memSelect = document.getElementById('sel_committee_member');
                if (memSelect) {
                    memSelect.focus();
                    memSelect.click();
                }
            }
            return;
        }

        const subGroupIdToUse = _selectedSubGroupId || window._currentSubGroupId;
        if (!subGroupIdToUse) {
            return Swal.fire({
                icon: 'warning',
                title: 'กรุณาเลือกชุดคณะกรรมการ',
                text: 'กรุณาเลือกชุดคณะกรรมการในหน้าหลักก่อนส่งออก Excel',
                confirmButtonText: 'ตกลง'
            });
        }
        console.log('✅ Export Excel ใน sub_group:', subGroupIdToUse);

        Swal.fire({
            title: 'กำลังสร้างไฟล์ Excel...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        const { data: subGroup, error: subError } = await db
            .from('eval_committee_groups')
            .select('*, eval_committee_targets(*)')
            .eq('id', subGroupIdToUse)
            .eq('is_active', true)
            .maybeSingle();

        if (subError) throw subError;

        if (!subGroup) {
            Swal.close();
            return Swal.fire('แจ้งเตือน', 'ไม่พบข้อมูลชุดคณะกรรมการที่เลือก', 'warning');
        }

        const subGroupName = subGroup.group_name || 'ไม่ทราบชื่อชุด';
        const targets = subGroup.eval_committee_targets || [];

        const allDepartments = new Set();
        const allowedDepts = [
            'ภาษาไทย', 'คณิตศาสตร์',
            'วิทยาศาสตร์และเทคโนโลยี (วิทยาศาสตร์)',
            'วิทยาศาสตร์และเทคโนโลยี (เทคโนโลยี)',
            'สังคมศึกษา ศาสนาและวัฒนธรรม',
            'สุขศึกษาและพลศึกษา', 'ศิลปะ', 'การงานอาชีพ',
            'ภาษาต่างประเทศ (ภาษาอังกฤษ)', 'ภาษาต่างประเทศ (ภาษาจีน)',
            'แนะแนว'
        ];

        targets
            .filter(t => t.target_type === 'department')
            .map(t => t.target_value)
            .filter(d => allowedDepts.includes(d))
            .forEach(d => allDepartments.add(d));

        if (allDepartments.size === 0) {
            Swal.close();
            return Swal.fire('แจ้งเตือน', 'ไม่พบกลุ่มเป้าหมาย (department targets) ในชุดที่เลือก', 'warning');
        }

        const deptArray = Array.from(allDepartments);

        const queryPromises = deptArray.map(dept =>
            db.from('core_personnel')
                .select('id, prefix, first_name, last_name, academic_standing, department')
                .eq('department', dept)
                .in('position', ['ครู', 'ครูผู้ช่วย'])
                .in('academic_standing', ['ครูผู้ช่วย', 'ไม่มีวิทยฐานะ', 'ครูชำนาญการ', 'ครูชำนาญการพิเศษ'])
                .order('first_name', { ascending: true })
        );

        const results = await Promise.all(queryPromises);
        let allTeachers = [];
        results.forEach(({ data, error }) => {
            if (!error && data) {
                allTeachers = allTeachers.concat(data);
            }
        });

        if (allTeachers.length === 0) {
            Swal.close();
            return Swal.fire({
                icon: 'warning',
                title: 'ไม่พบครูที่ต้องประเมิน',
                html: `
                    <div class="text-left">
                        <p><b>ชุด:</b> ${subGroupName}</p>
                        <p class="mt-2"><b>กลุ่มสาระที่ตั้งค่าไว้:</b></p>
                        <ul class="list-disc pl-5 text-sm">
                            ${deptArray.map(d => `<li>${d}</li>`).join('')}
                        </ul>
                    </div>
                `,
                confirmButtonText: 'ตกลง'
            });
        }

        const teacherIds = allTeachers.map(t => t.id);
        const { data: evalResults } = await db
            .from('eval_results')
            .select('evaluatee_id, sub_group_id, detailed_scores, total_score, status')
            .in('evaluatee_id', teacherIds)
            .eq('eval_round_id', currentEvalRound.id)
            .eq('evaluator_id', evaluatorId)
            .eq('eval_type', 'committee')
            .eq('sub_group_id', subGroupIdToUse);

        const evalMap = {};
        (evalResults || []).forEach(r => { evalMap[r.evaluatee_id] = r; });

        const items = subGroup.selected_sub_items || [];
        const formattedItems = items.map(item => {
            let label = '';

            if (item.element === '1') {
                if (item.part === '1') {
                    const tempCriteria = evalCriteriaDB[currentUser.academic_standing]
                        || evalCriteriaDB['ครูชำนาญการพิเศษ'];
                    for (const group of tempCriteria.part1_sec1 || []) {
                        const found = group.items.find(i =>
                            i.id === item.value || i.id === item.value.replace('.', '_')
                        );
                        if (found) { label = found.label; break; }
                    }
                } else if (item.part === '2') {
                    const tempCriteria = evalCriteriaDB[currentUser.academic_standing]
                        || evalCriteriaDB['ครูชำนาญการพิเศษ'];
                    const found = tempCriteria.part1_sec2?.find(i => {
                        const id = i.id === 's2_1' ? '1'
                            : i.id === 's2_2_1' ? '2.1'
                                : i.id === 's2_2_2' ? '2.2'
                                    : i.id;
                        return id === item.value || id === item.value.replace('.', '_');
                    });
                    if (found) label = found.label;
                }
            } else if (item.element === '2') {
                label = 'ความสำเร็จของงานที่ได้รับมอบหมาย (ระดับ 1-5)';
            } else if (item.element === '3') {
                const idx = parseInt(item.value) - 1;
                if (idx >= 0 && idx < PART3_ITEMS.length) {
                    label = PART3_ITEMS[idx].substring(0, 50) + '...';
                }
            }

            return { ...item, label: label || `${item.element}:${item.value}` };
        });

        const uniqueItems = formattedItems.slice().sort((a, b) => {
            if (a.element !== b.element) return a.element.localeCompare(b.element);
            if ((a.part || '') !== (b.part || '')) return (a.part || '').localeCompare(b.part || '');
            return parseFloat(a.value) - parseFloat(b.value);
        });

        const headers = ['กลุ่มสาระ', 'คำนำหน้าชื่อ-สกุล', 'วิทยฐานะ'];
        uniqueItems.forEach(item => {
            headers.push(item.label || `ข้อ ${item.value}`);
        });
        headers.push('สถานะ');
        headers.push('คะแนนรวม');

        const rows = [];
        for (const teacher of allTeachers) {
            const row = [
                teacher.department || '-',
                `${teacher.prefix || ''}${teacher.first_name} ${teacher.last_name}`,
                teacher.academic_standing || '-'
            ];

            const evalData = evalMap[teacher.id];
            const detailedScores = evalData?.detailed_scores || {};

            const p1S1Scores = detailedScores.p1_s1 || [];
            const p1S1Keys = detailedScores.p1_s1_keys || null;
            const p1S1Map = {};

            if (p1S1Keys && p1S1Keys.length === p1S1Scores.length) {
                p1S1Keys.forEach((key, idx) => {
                    p1S1Map[key] = p1S1Scores[idx];
                });
            } else {
                const p1S1UniqueItems = uniqueItems.filter(
                    item => item.element === '1' && item.part === '1'
                );
                const allP1Ids = p1S1UniqueItems.map(item => item.value.replace('.', '_'));

                let scoreIdx = 0;
                for (const id of allP1Ids) {
                    if (scoreIdx < p1S1Scores.length) {
                        p1S1Map[id] = p1S1Scores[scoreIdx];
                        scoreIdx++;
                    } else {
                        break;
                    }
                }
            }

            for (const item of uniqueItems) {
                let key = '';
                if (item.element === '1') {
                    key = item.part === '1' ? 'p1_s1' : 'p1_s2';
                } else if (item.element === '2') {
                    key = 'p2';
                } else if (item.element === '3') {
                    key = 'p3';
                }

                const scores = detailedScores[key];
                let value = '';

                if (scores !== undefined && scores !== null) {
                    if (Array.isArray(scores)) {
                        let scoreAtIndex = null;

                        if (key === 'p1_s1') {
                            const targetId = item.value.replace('.', '_');
                            scoreAtIndex = p1S1Map[targetId] !== undefined ? p1S1Map[targetId] : null;
                        } else if (key === 'p3') {
                            const idx = parseInt(item.value) - 1;
                            if (idx >= 0 && idx < scores.length) {
                                scoreAtIndex = scores[idx];
                            }
                        } else if (key === 'p1_s2') {
                            const map = { '1': 0, '2.1': 1, '2.2': 2 };
                            const idx = map[item.value];
                            if (idx !== undefined && idx < scores.length) {
                                scoreAtIndex = scores[idx];
                            }
                        }

                        if (scoreAtIndex !== null && scoreAtIndex !== undefined && scoreAtIndex !== 0) {
                            value = scoreAtIndex;
                        }
                    } else {
                        if (scores !== null && scores !== undefined && scores !== 0) {
                            value = scores;
                        }
                    }
                }

                row.push(value !== '' ? value : '');
            }

            if (evalData) {
                row.push(evalData.status === 'submitted' ? 'ส่งแล้ว' : 'ร่าง');
                row.push(evalData.total_score?.toFixed(2) || '');
            } else {
                row.push('ยังไม่ประเมิน');
                row.push('');
            }

            rows.push(row);
        }

        const wb = XLSX.utils.book_new();
        const wsData = [headers, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(wsData);

        ws['!cols'] = headers.map((h, i) => {
            if (i === 0) return { wch: 25 };
            if (i === 1) return { wch: 35 };
            if (i === 2) return { wch: 20 };
            if (i === headers.length - 2) return { wch: 12 };
            if (i === headers.length - 1) return { wch: 12 };
            return { wch: 30 };
        });

        const infoData = [
            ['ข้อมูลการส่งออก'],
            ['รอบการประเมิน', currentEvalRound.round_name || ''],
            ['ผู้ประเมิน', evaluatorName],
            ['ชุดคณะกรรมการ', subGroupName],
            ['จำนวนครูที่ต้องประเมิน', allTeachers.length],
            ['จำนวนหัวข้อ', uniqueItems.length],
            ['กลุ่มสาระเป้าหมาย', deptArray.join(', ')],
            ['วันที่ส่งออก', new Date().toLocaleString('th-TH')]
        ];

        const wsInfo = XLSX.utils.aoa_to_sheet(infoData);
        wsInfo['!cols'] = [{ wch: 25 }, { wch: 40 }];

        XLSX.utils.book_append_sheet(wb, wsInfo, 'ข้อมูล');
        XLSX.utils.book_append_sheet(wb, ws, 'คะแนนประเมิน');

        Swal.close();

        const safeName = (str) => (str || '').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_');
        const fileName = `คะแนนประเมิน_${safeName(evaluatorName)}_${safeName(subGroupName)}_${new Date().toISOString().slice(0, 10)}.xlsx`;

        XLSX.writeFile(wb, fileName);

        Swal.fire({
            icon: 'success',
            title: 'ส่งออก Excel สำเร็จ!',
            html: `
                <div class="text-left">
                    <p><b>ชุด:</b> ${subGroupName}</p>
                    <p class="text-sm text-gray-500 mt-1">ไฟล์: <code class="text-xs bg-gray-100 px-1 py-0.5 rounded">${fileName}</code></p>
                    <p class="text-xs text-gray-400 mt-3">
                        💡 หากต้องการส่งออกชุดอื่น<br>
                        กรุณากลับไปเลือกชุดอื่นก่อน export
                    </p>
                </div>
            `,
            timer: 4000,
            showConfirmButton: true,
            confirmButtonText: 'ตกลง'
        });

    } catch (err) {
        console.error('Error exporting committee Excel:', err);
        Swal.close();
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// ✅ ส่งออก Excel คะแนนกรรมการทุกคนในชุด
// วัตถุประสงค์: ให้คณะกรรมการทุกคนในชุดช่วยกันตรวจสอบ
// 
// โครงสร้างไฟล์:
// - Sheet 1: สรุป Mode (Mode ของทุกกรรมการ)
// - Sheet 2+: คะแนนของกรรมการแต่ละคน
// 
// หัวคอลัมน์ทุกชีต:
// A: กลุ่มสาระฯ | B: ชื่อ-สกุลผู้รับการประเมิน | C: วิทยฐานะ | D+: หัวข้อที่ประเมิน | สุดท้าย: คะแนนรวม
// ==========================================
async function exportAllCommitteeScoresExcel(subGroupIdParam = null) {
    try {
        if (!currentEvalRound) {
            return Swal.fire('แจ้งเตือน', 'ไม่พบรอบการประเมิน', 'warning');
        }

        const subGroupIdToUse = subGroupIdParam || _selectedSubGroupId || window._currentSubGroupId;
        if (!subGroupIdToUse) {
            return Swal.fire({
                icon: 'warning',
                title: 'กรุณาเลือกชุดคณะกรรมการ',
                text: 'กรุณาเลือกชุดคณะกรรมการในหน้าหลักก่อนส่งออก Excel',
                confirmButtonText: 'ตกลง'
            });
        }
        console.log('✅ Export All Scores - sub_group:', subGroupIdToUse);

        Swal.fire({
            title: 'กำลังสร้างไฟล์ Excel...',
            html: 'กำลังโหลดข้อมูล...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        // ==========================================
        // 1. ดึงข้อมูลชุดคณะกรรมการ
        // ==========================================
        const { data: subGroup, error: subErr } = await db
            .from('eval_committee_groups')
            .select('*, eval_committee_targets(*)')
            .eq('id', subGroupIdToUse)
            .eq('is_active', true)
            .maybeSingle();

        if (subErr) throw subErr;
        if (!subGroup) {
            Swal.close();
            return Swal.fire('แจ้งเตือน', 'ไม่พบข้อมูลชุดคณะกรรมการ', 'warning');
        }

        const subGroupName = subGroup.group_name || 'ไม่ทราบชื่อชุด';
        const selectedSubItems = subGroup.selected_sub_items || [];

        if (selectedSubItems.length === 0) {
            Swal.close();
            return Swal.fire('แจ้งเตือน', 'ไม่พบหัวข้อที่ต้องประเมินในชุดนี้', 'warning');
        }

        // ==========================================
        // 2. รายชื่อกลุ่มสาระเป้าหมาย
        // ==========================================
        const allowedDepts = [
            'ภาษาไทย', 'คณิตศาสตร์',
            'วิทยาศาสตร์และเทคโนโลยี (วิทยาศาสตร์)',
            'วิทยาศาสตร์และเทคโนโลยี (เทคโนโลยี)',
            'สังคมศึกษา ศาสนาและวัฒนธรรม',
            'สุขศึกษาและพลศึกษา', 'ศิลปะ', 'การงานอาชีพ',
            'ภาษาต่างประเทศ (ภาษาอังกฤษ)', 'ภาษาต่างประเทศ (ภาษาจีน)',
            'แนะแนว'
        ];

        const deptArray = (subGroup.eval_committee_targets || [])
            .filter(t => t.target_type === 'department')
            .map(t => t.target_value)
            .filter(d => allowedDepts.includes(d));

        if (deptArray.length === 0) {
            Swal.close();
            return Swal.fire('แจ้งเตือน', 'ไม่พบกลุ่มเป้าหมาย (department) ในชุดที่เลือก', 'warning');
        }

        // ==========================================
        // 3. ดึงรายชื่อครูในกลุ่มเป้าหมาย
        // ==========================================
        const { data: teachers } = await db
            .from('core_personnel')
            .select('id, prefix, first_name, last_name, academic_standing, department')
            .in('department', deptArray)
            .in('position', ['ครู', 'ครูผู้ช่วย'])
            .in('academic_standing', ['ครูผู้ช่วย', 'ไม่มีวิทยฐานะ', 'ครูชำนาญการ', 'ครูชำนาญการพิเศษ'])
            .order('department', { ascending: true })
            .order('first_name', { ascending: true });

        if (!teachers || teachers.length === 0) {
            Swal.close();
            return Swal.fire('แจ้งเตือน', 'ไม่พบครูในกลุ่มเป้าหมาย', 'warning');
        }

        // ==========================================
        // 4. ดึงรายชื่อกรรมการในชุด
        // ==========================================
        const { data: members } = await db
            .from('eval_committee_members')
            .select('user_id, core_personnel(id, prefix, first_name, last_name)')
            .eq('committee_group_id', subGroupIdToUse)
            .eq('is_active', true);

        if (!members || members.length === 0) {
            Swal.close();
            return Swal.fire('แจ้งเตือน', 'ไม่พบกรรมการในชุดนี้', 'warning');
        }

        // ==========================================
        // 5. ดึงผลการประเมินทั้งหมด
        // ==========================================
        const teacherIds = teachers.map(t => t.id);
        const evaluatorIds = members.map(m => m.user_id);

        const { data: allResults } = await db
            .from('eval_results')
            .select('evaluatee_id, evaluator_id, detailed_scores, total_score, status')
            .in('evaluatee_id', teacherIds)
            .in('evaluator_id', evaluatorIds)
            .eq('eval_round_id', currentEvalRound.id)
            .eq('eval_type', 'committee')
            .eq('sub_group_id', subGroupIdToUse)
            .eq('status', 'submitted');

        const resultMap = {};
        (allResults || []).forEach(r => {
            if (!resultMap[r.evaluator_id]) resultMap[r.evaluator_id] = {};
            resultMap[r.evaluator_id][r.evaluatee_id] = r;
        });

        // ==========================================
        // 6. สร้าง Headers
        // ==========================================
        const referenceStanding = teachers[0]?.academic_standing || 'ครู';

        const itemLabels = selectedSubItems.map(item => ({
            ...item,
            label: getItemLabel(item, referenceStanding)
        })).sort((a, b) => {
            if (a.element !== b.element) return a.element.localeCompare(b.element);
            if ((a.part || '') !== (b.part || '')) return (a.part || '').localeCompare(b.part || '');
            return parseFloat(a.value) - parseFloat(b.value);
        });

        const headers = ['กลุ่มสาระฯ', 'ชื่อ-สกุลผู้รับการประเมิน', 'วิทยฐานะ'];
        itemLabels.forEach(item => headers.push(item.label));
        headers.push('คะแนนรวม');

        // ==========================================
        // 7. ฟังก์ชันช่วย: extractItemValue
        // ==========================================
        function extractItemValue(detailed, item) {
            if (!detailed) return '';

            // p1_s1
            if (item.element === '1' && item.part === '1') {
                const key = item.value.replace('.', '_');
                const scores = detailed.p1_s1 || [];
                const keys = detailed.p1_s1_keys || [];
                const idx = keys.indexOf(key);
                if (idx >= 0 && scores[idx] !== undefined) return scores[idx];

                const p1s1Items = itemLabels.filter(i => i.element === '1' && i.part === '1');
                const fallbackIdx = p1s1Items.findIndex(i => i.value === item.value);
                if (fallbackIdx >= 0 && scores[fallbackIdx] !== undefined) return scores[fallbackIdx];
                return '';
            }

            // p1_s2
            if (item.element === '1' && item.part === '2') {
                const scores = detailed.p1_s2 || [];
                const keys = detailed.p1_s2_keys || [];
                const idx = keys.indexOf(item.value);
                if (idx >= 0 && scores[idx] !== undefined) return scores[idx];

                const p1s2Items = itemLabels.filter(i => i.element === '1' && i.part === '2');
                const fallbackIdx = p1s2Items.findIndex(i => i.value === item.value);
                if (fallbackIdx >= 0 && scores[fallbackIdx] !== undefined) return scores[fallbackIdx];
                return '';
            }

            // p2
            if (item.element === '2') {
                return (detailed.p2 !== null && detailed.p2 !== undefined) ? detailed.p2 : '';
            }

            // p3
            if (item.element === '3') {
                const scores = detailed.p3 || [];
                const keys = detailed.p3_keys || [];
                const idx = keys.indexOf(item.value);
                if (idx >= 0 && scores[idx] !== undefined) return scores[idx];

                const p3Items = itemLabels.filter(i => i.element === '3');
                const fallbackIdx = p3Items.findIndex(i => i.value === item.value);
                if (fallbackIdx >= 0 && scores[fallbackIdx] !== undefined) return scores[fallbackIdx];
                return '';
            }

            return '';
        }

        // ==========================================
        // 8. ฟังก์ชันช่วย: buildRows
        // ==========================================
        function buildRows(resultsForEvaluator) {
            return teachers.map(teacher => {
                const row = [
                    teacher.department || '-',
                    `${teacher.prefix || ''}${teacher.first_name} ${teacher.last_name}`,
                    teacher.academic_standing || '-'
                ];

                const result = resultsForEvaluator[teacher.id];
                const detailed = result?.detailed_scores || {};

                itemLabels.forEach(item => {
                    row.push(extractItemValue(detailed, item));
                });

                row.push(result?.total_score?.toFixed(2) || '');
                return row;
            });
        }

        // ==========================================
        // 9. คำนวณ Mode Summary
        // ==========================================
        const modeResults = {};

        teachers.forEach(teacher => {
            const itemValues = {};

            members.forEach(m => {
                const r = resultMap[m.user_id]?.[teacher.id];
                if (!r?.detailed_scores) return;

                itemLabels.forEach(item => {
                    const v = extractItemValue(r.detailed_scores, item);
                    if (v === '' || v === null || v === undefined) return;

                    const key = `${item.element}_${item.part || ''}_${item.value}`;
                    if (!itemValues[key]) itemValues[key] = [];
                    itemValues[key].push(v);
                });
            });

            const modeDetailed = {
                p1_s1: [], p1_s1_keys: [],
                p1_s2: [], p1_s2_keys: [],
                p2: null,
                p3: [], p3_keys: []
            };

            itemLabels.forEach(item => {
                const key = `${item.element}_${item.part || ''}_${item.value}`;
                const vals = itemValues[key] || [];
                if (vals.length === 0) return;

                const mode = findMode(vals);
                if (mode === null) return;

                if (item.element === '1' && item.part === '1') {
                    modeDetailed.p1_s1.push(mode);
                    modeDetailed.p1_s1_keys.push(item.value.replace('.', '_'));
                } else if (item.element === '1' && item.part === '2') {
                    modeDetailed.p1_s2.push(mode);
                    modeDetailed.p1_s2_keys.push(item.value);
                } else if (item.element === '2') {
                    modeDetailed.p2 = mode;
                } else if (item.element === '3') {
                    modeDetailed.p3.push(mode);
                    modeDetailed.p3_keys.push(item.value);
                }
            });

            const academic = teacher.academic_standing || 'ครู';
            const isAssistant = academic === 'ครูผู้ช่วย';

            let total = 0;

            const p1s1Mode = findMode(modeDetailed.p1_s1);
            if (p1s1Mode !== null) {
                total += isAssistant ? (p1s1Mode * 80) / 56 : p1s1Mode;
            }

            if (modeDetailed.p1_s2.length === 3) {
                const [m1, m2, m3] = modeDetailed.p1_s2;
                const raw = (m1 / 4 * 20) + (m2 / 4 * 10) + (m3 / 4 * 10);
                total += raw / 2;
            }

            if (modeDetailed.p2 !== null) {
                total += modeDetailed.p2 * 2;
            }

            const p3Mode = findMode(modeDetailed.p3);
            if (p3Mode !== null) {
                total += p3Mode / 4;
            }

            modeResults[teacher.id] = {
                detailed_scores: modeDetailed,
                total_score: Math.min(Math.max(total, 0), 100)
            };
        });

        // ==========================================
        // 10. สร้าง Workbook
        // ==========================================
        const wb = XLSX.utils.book_new();

        const setCols = (hdrs) => hdrs.map((h, i) => {
            if (i === 0) return { wch: 25 };
            if (i === 1) return { wch: 30 };
            if (i === 2) return { wch: 20 };
            if (i === hdrs.length - 1) return { wch: 12 };
            return { wch: 15 };
        });

        // Sheet 1: สรุป Mode
        const modeRows = buildRows(modeResults);
        const wsMode = XLSX.utils.aoa_to_sheet([headers, ...modeRows]);
        wsMode['!cols'] = setCols(headers);
        XLSX.utils.book_append_sheet(wb, wsMode, 'สรุป Mode');

        // Sheet 2+: กรรมการแต่ละคน
        const usedSheetNames = new Set(['สรุป Mode']);

        members.forEach((m, idx) => {
            const memberName = m.core_personnel
                ? `${m.core_personnel.prefix || ''}${m.core_personnel.first_name} ${m.core_personnel.last_name}`.trim()
                : `กรรมการ ${idx + 1}`;

            const memberResults = resultMap[m.user_id] || {};
            const memberRows = buildRows(memberResults);

            const wsMember = XLSX.utils.aoa_to_sheet([headers, ...memberRows]);
            wsMember['!cols'] = setCols(headers);

            let baseName = memberName.replace(/[\\/:*?\[\]]/g, '_').substring(0, 31);
            let sheetName = baseName;
            let suffix = 1;
            while (usedSheetNames.has(sheetName)) {
                const suffixStr = `_${suffix}`;
                sheetName = baseName.substring(0, 31 - suffixStr.length) + suffixStr;
                suffix++;
            }
            usedSheetNames.add(sheetName);

            XLSX.utils.book_append_sheet(wb, wsMember, sheetName);
        });

        Swal.close();

        // ==========================================
        // 11. บันทึกไฟล์
        // ==========================================
        const safeName = (str) => (str || '').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_');
        const fileName = `คะแนนกรรมการทุกคน_${safeName(subGroupName)}_${new Date().toISOString().slice(0, 10)}.xlsx`;

        XLSX.writeFile(wb, fileName);

        const memberNames = members.map(m =>
            m.core_personnel
                ? `${m.core_personnel.prefix || ''}${m.core_personnel.first_name} ${m.core_personnel.last_name}`.trim()
                : 'ไม่ทราบชื่อ'
        );

        Swal.fire({
            icon: 'success',
            title: 'ส่งออกสำเร็จ!',
            html: `
                <div class="text-left">
                    <p><b>ชุด:</b> ${subGroupName}</p>
                    <p class="text-sm mt-2">📊 <b>${1 + members.length}</b> ชีต:</p>
                    <ul class="text-xs list-disc pl-5 mt-1 max-h-40 overflow-y-auto">
                        <li>📈 สรุป Mode</li>
                        ${memberNames.map(n => `<li>👤 ${n}</li>`).join('')}
                    </ul>
                    <p class="text-xs text-gray-500 mt-3">📁 ${fileName}</p>
                    <p class="text-xs text-blue-500 mt-2">
                        💡 หากต้องการแก้ไขคะแนน<br>
                        ให้แก้ในไฟล์ Excel แล้วนำเข้ากลับ (สำหรับกรรมการท่านนั้น)
                    </p>
                </div>
            `,
            width: '500px',
            confirmButtonText: 'ตกลง'
        });

    } catch (err) {
        console.error('Error exporting all committee scores:', err);
        Swal.close();
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// ✅ นำเข้า Excel สำหรับกรรมการ (ฉบับสมบูรณ์ v5 - OPTIMIZED)
// 
// เทคนิคที่ใช้เพื่อความเร็ว:
// 1) Pre-fetch: targets + ครูทั้งหมดในกลุ่มเป้าหมาย (2 queries)
// 2) Local index: match ชื่อครูในหน่วยความจำ (0 queries)
// 3) Batch upsert: บันทึกทั้งหมดในครั้งเดียว (1-3 queries)
// 
// ผลลัพธ์: ~3-5 queries สำหรับ 100 แถว (จากเดิม ~500 queries)
// ==========================================
async function importCommitteeExcel(event) {
    const file = event.target.files[0];
    if (!file) return;

    const validTypes = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls)$/)) {
        Swal.fire('แจ้งเตือน', 'กรุณาเลือกไฟล์ Excel (.xlsx หรือ .xls)', 'warning');
        event.target.value = '';
        return;
    }

    const tStart = performance.now();

    // ==========================================
    // ✅ ตรวจสอบ subGroupIdToUse
    // ==========================================
    const subGroupIdToUse = _selectedSubGroupId || window._currentSubGroupId;
    if (!subGroupIdToUse) {
        Swal.fire({
            icon: 'warning',
            title: 'กรุณาเลือกชุดคณะกรรมการ',
            text: 'กรุณาเลือกชุดคณะกรรมการในหน้าหลักก่อนนำเข้า Excel',
            confirmButtonText: 'ตกลง'
        });
        event.target.value = '';
        return;
    }
    console.log('⚡ Import v5 - sub_group:', subGroupIdToUse);

    // ดึงรอบการประเมิน
    let evalRound = currentEvalRound;
    if (!evalRound) {
        const { data: activeRound, error: roundErr } = await db
            .from('eval_rounds').select('*').eq('is_active', true)
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (roundErr || !activeRound) {
            Swal.fire('แจ้งเตือน', 'ไม่พบรอบการประเมินที่เปิดใช้งาน', 'warning');
            event.target.value = '';
            return;
        }
        evalRound = activeRound;
    }

    const evaluatorId = _impersonationMode ? _impersonatedEvaluatorId : currentUser.id;
    if (!evaluatorId) {
        Swal.fire('แจ้งเตือน', 'ไม่พบผู้ประเมิน กรุณาเลือกกรรมการก่อน', 'warning');
        event.target.value = '';
        return;
    }

    // อ่านไฟล์ Excel
    let workbook;
    try {
        const data = await file.arrayBuffer();
        workbook = XLSX.read(data, { type: 'array' });
    } catch (err) {
        Swal.fire('ผิดพลาด', 'ไม่สามารถอ่านไฟล์ได้: ' + err.message, 'error');
        event.target.value = '';
        return;
    }

    // ==========================================
    // ฟังก์ชันช่วย
    // ==========================================
    function stripThaiTitle(name) {
        const titles = ['นางสาว', 'นาง', 'นาย', 'ดร.', 'ดร', 'ว่าที่', 'พัน', 'ร้อย', 'สิบ', 'จ่า'];
        let cleaned = String(name || '').trim();
        for (const title of titles) {
            if (cleaned.startsWith(title)) { cleaned = cleaned.substring(title.length).trim(); break; }
        }
        return cleaned;
    }

    function compareNames(name1, name2) {
        if (!name1 || !name2) return false;
        const clean1 = stripThaiTitle(name1);
        const clean2 = stripThaiTitle(name2);
        if (clean1 === clean2) return true;
        const parts1 = clean1.split(/\s+/);
        const parts2 = clean2.split(/\s+/);
        if (parts1.length >= 2 && parts2.length >= 2) {
            if (parts1[0] === parts2[0] && parts1.slice(1).join(' ') === parts2.slice(1).join(' ')) return true;
        }
        return false;
    }

    const isP1S2Header = (h) => h.includes('วิธีการดำเนินการ') || h.includes('ผลลัพธ์การเรียนรู้');
    const isP2Header = (h) => h.includes('ความสำเร็จของงานที่ได้รับมอบหมาย') || h.includes('ระดับ 1-5');
    const isP3Header = (h) => typeof PART3_ITEMS !== 'undefined' && PART3_ITEMS.some(item => h.startsWith(item.substring(0, 10)));
    const isP1S1Header = (h) => !isP1S2Header(h) && !isP2Header(h) && !isP3Header(h) && /^\d+\.\d+/.test(h);
    const getP1S2Max = (h) => h.includes('วิธีการดำเนินการ') ? 20 : 10;

    // ==========================================
    // ตรวจสอบผู้ประเมินในไฟล์
    // ==========================================
    const currentEvaluatorName = _impersonationMode
        ? _impersonatedEvaluatorName
        : `${currentUser.prefix || ''}${currentUser.first_name} ${currentUser.last_name}`.trim();

    let evaluatorNameInFile = null;
    let roundNameInFile = null;

    if (workbook.SheetNames.includes('ข้อมูล')) {
        const infoData = XLSX.utils.sheet_to_json(workbook.Sheets['ข้อมูล'], { header: 1 });
        for (const row of infoData) {
            if (row[0] === 'ผู้ประเมิน') evaluatorNameInFile = row[1]?.trim();
            if (row[0] === 'รอบการประเมิน') roundNameInFile = row[1]?.trim();
        }
    }

    if (evaluatorNameInFile) {
        if (!compareNames(evaluatorNameInFile, currentEvaluatorName)) {
            await Swal.fire({
                icon: 'error', title: '❌ ไฟล์ไม่ตรงกับกรรมการที่เลือก',
                html: `<p>ไฟล์นี้เป็นของ: <b>${evaluatorNameInFile}</b></p><p>แต่คุณกำลังนำเข้าในนาม: <b>${currentEvaluatorName}</b></p>`,
                confirmButtonText: 'ตกลง'
            });
            event.target.value = '';
            return;
        }
    } else {
        const r = await Swal.fire({
            icon: 'warning', title: '⚠️ ไม่พบข้อมูลผู้ประเมินในไฟล์',
            html: '<p>ต้องการนำเข้าต่อหรือไม่?</p>',
            showCancelButton: true, confirmButtonText: '✅ นำเข้าต่อ', cancelButtonText: 'ยกเลิก'
        });
        if (!r.isConfirmed) { event.target.value = ''; return; }
    }

    if (roundNameInFile && evalRound.round_name && roundNameInFile !== evalRound.round_name) {
        const r = await Swal.fire({
            icon: 'warning', title: '⚠️ รอบการประเมินไม่ตรงกัน',
            html: `<p>ไฟล์: <b>${roundNameInFile}</b></p><p>ปัจจุบัน: <b>${evalRound.round_name}</b></p>`,
            showCancelButton: true, confirmButtonText: '✅ นำเข้าต่อ', cancelButtonText: 'ยกเลิก'
        });
        if (!r.isConfirmed) { event.target.value = ''; return; }
    }

    const confirmResult = await Swal.fire({
        icon: 'warning', title: 'ยืนยันการนำเข้า',
        html: `<p>นำเข้าข้อมูลจาก <b>${file.name}</b></p><p class="text-sm text-gray-500 mt-2">⚠️ ข้อมูลเดิมในชุดที่เลือกจะถูกแทนที่</p>`,
        showCancelButton: true, confirmButtonText: '✅ ยืนยันนำเข้า', cancelButtonText: 'ยกเลิก'
    });
    if (!confirmResult.isConfirmed) { event.target.value = ''; return; }

    Swal.fire({ title: 'กำลังนำเข้าข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        // ==========================================
        // ⚡ PHASE 1: Pre-fetch ข้อมูลทั้งหมด (3 queries พร้อมกัน)
        // ==========================================
        const t1 = performance.now();

        const [subGroupRes, targetsRes] = await Promise.all([
            db.from('eval_committee_groups')
                .select('id, selected_sub_items')
                .eq('id', subGroupIdToUse)
                .eq('eval_round_id', evalRound.id)
                .eq('is_active', true)
                .maybeSingle(),
            db.from('eval_committee_targets')
                .select('target_value')
                .eq('target_type', 'department')
                .eq('is_active', true)
                .in('committee_group_id', [subGroupIdToUse])
        ]);

        if (subGroupRes.error) throw subGroupRes.error;

        const requiredItems = subGroupRes.data?.selected_sub_items || [];
        if (!requiredItems || requiredItems.length === 0) {
            Swal.close();
            Swal.fire('ผิดพลาด', 'ไม่พบข้อมูลหัวข้อที่ต้องประเมินในชุดที่เลือก', 'error');
            event.target.value = '';
            return;
        }

        const allowedDepts = [
            'ภาษาไทย', 'คณิตศาสตร์',
            'วิทยาศาสตร์และเทคโนโลยี (วิทยาศาสตร์)',
            'วิทยาศาสตร์และเทคโนโลยี (เทคโนโลยี)',
            'สังคมศึกษา ศาสนาและวัฒนธรรม',
            'สุขศึกษาและพลศึกษา', 'ศิลปะ', 'การงานอาชีพ',
            'ภาษาต่างประเทศ (ภาษาอังกฤษ)', 'ภาษาต่างประเทศ (ภาษาจีน)',
            'แนะแนว'
        ];

        const targetDepts = (targetsRes.data || [])
            .map(t => t.target_value)
            .filter(d => allowedDepts.includes(d));

        if (targetDepts.length === 0) {
            Swal.close();
            Swal.fire('ผิดพลาด', 'ไม่พบกลุ่มเป้าหมาย (department) ในชุดที่เลือก', 'error');
            event.target.value = '';
            return;
        }

        // ⚡ ดึงครูทั้งหมดในกลุ่มเป้าหมาย (1 query)
        const { data: teachersInDepts } = await db
            .from('core_personnel')
            .select('id, prefix, first_name, last_name, academic_standing, department, position')
            .in('department', targetDepts)
            .in('position', ['ครู', 'ครูผู้ช่วย'])
            .in('academic_standing', ['ครูผู้ช่วย', 'ไม่มีวิทยฐานะ', 'ครูชำนาญการ', 'ครูชำนาญการพิเศษ'])
            .limit(2000);

        console.log(`⚡ Phase 1: ${(performance.now() - t1).toFixed(0)}ms | teachers: ${teachersInDepts?.length || 0}`);

        // ==========================================
        // ⚡ PHASE 2: สร้าง Local Index (0 queries)
        // ==========================================
        const t2 = performance.now();

        const teacherIndex = {
            byFullName: new Map(),      // "firstName|lastName|dept" → teacher
            byFirstName: new Map(),     // "firstName|dept" → [teachers]
            byLastName: new Map(),      // "lastName|dept" → [teachers]
            byFirstNameNoDept: new Map() // "firstName" → [teachers]
        };

        (teachersInDepts || []).forEach(t => {
            const fn = (t.first_name || '').trim();
            const ln = (t.last_name || '').trim();
            const dept = t.department || '';

            // byFullName
            const fullKey = `${fn}|${ln}|${dept}`;
            teacherIndex.byFullName.set(fullKey, t);

            // byFirstName + dept
            const fnKey = `${fn}|${dept}`;
            if (!teacherIndex.byFirstName.has(fnKey)) teacherIndex.byFirstName.set(fnKey, []);
            teacherIndex.byFirstName.get(fnKey).push(t);

            // byLastName + dept
            const lnKey = `${ln}|${dept}`;
            if (!teacherIndex.byLastName.has(lnKey)) teacherIndex.byLastName.set(lnKey, []);
            teacherIndex.byLastName.get(lnKey).push(t);

            // byFirstName (no dept)
            if (!teacherIndex.byFirstNameNoDept.has(fn)) teacherIndex.byFirstNameNoDept.set(fn, []);
            teacherIndex.byFirstNameNoDept.get(fn).push(t);
        });

        console.log(`⚡ Phase 2: ${(performance.now() - t2).toFixed(0)}ms | indexed`);

        // ==========================================
        // ⚡ Local findTeacher (0 queries)
        // ==========================================
        function findTeacherLocal(teacherName, deptName) {
            const cleanName = stripThaiTitle(teacherName);
            const parts = cleanName.split(/\s+/).filter(Boolean);
            if (parts.length === 0) return null;

            const firstName = parts[0];
            const lastName = parts.slice(1).join(' ');
            const dept = deptName || '';

            // วิธีที่ 1: exact full name + dept
            if (firstName && lastName && dept) {
                const t = teacherIndex.byFullName.get(`${firstName}|${lastName}|${dept}`);
                if (t) return t;
            }

            // วิธีที่ 2: exact full name (ไม่มี dept → หาในทุก dept)
            if (firstName && lastName) {
                const candidates = teacherIndex.byFirstNameNoDept.get(firstName) || [];
                const matches = candidates.filter(t => (t.last_name || '').trim() === lastName);
                if (matches.length === 1) return matches[0];
                if (matches.length > 1 && dept) {
                    const filtered = matches.filter(t => t.department === dept);
                    if (filtered.length === 1) return filtered[0];
                }
            }

            // วิธีที่ 3: exact first name + dept (ถ้ามี 1 คน)
            if (firstName && dept) {
                const matches = teacherIndex.byFirstName.get(`${firstName}|${dept}`) || [];
                if (matches.length === 1) return matches[0];

                // ถ้ามีหลายคน → กรองด้วย last name (contains)
                if (matches.length > 1 && lastName) {
                    const filtered = matches.filter(t =>
                        (t.last_name || '').includes(lastName) || lastName.includes(t.last_name || '')
                    );
                    if (filtered.length === 1) return filtered[0];
                }
            }

            // วิธีที่ 4: first name only (ถ้ามี 1 คนทั่วทั้งชุด)
            if (firstName) {
                const matches = teacherIndex.byFirstNameNoDept.get(firstName) || [];
                if (matches.length === 1) return matches[0];

                // กรองด้วย last name
                if (matches.length > 1 && lastName) {
                    const filtered = matches.filter(t =>
                        (t.last_name || '').includes(lastName) || lastName.includes(t.last_name || '')
                    );
                    if (filtered.length === 1) return filtered[0];
                }
            }

            // วิธีที่ 5: last name + dept (ถ้ามี 1 คน)
            if (lastName && dept) {
                const matches = teacherIndex.byLastName.get(`${lastName}|${dept}`) || [];
                if (matches.length === 1) return matches[0];
            }

            return null;
        }

        // ==========================================
        // ⚡ PHASE 3: อ่าน Excel + ประมวลผล (0 queries)
        // ==========================================
        const t3 = performance.now();

        const sheetName = workbook.SheetNames.find(n => n === 'คะแนนประเมิน') || workbook.SheetNames[0];
        const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

        if (!jsonData || jsonData.length === 0) {
            Swal.close();
            Swal.fire('แจ้งเตือน', 'ไม่พบข้อมูลในชีท "คะแนนประเมิน"', 'warning');
            event.target.value = '';
            return;
        }

        const allKeySet = new Set();
        jsonData.forEach(row => Object.keys(row).forEach(k => allKeySet.add(k)));
        const headers = Array.from(allKeySet);

        const nameCol = headers.find(h => h.includes('ชื่อ') || h.includes('สกุล'));
        const deptCol = headers.find(h => h.includes('กลุ่มสาระ') || h.includes('สาระ'));

        if (!nameCol) {
            Swal.close();
            Swal.fire('แจ้งเตือน', 'ไม่พบคอลัมน์ชื่อ-สกุลในไฟล์ Excel', 'warning');
            event.target.value = '';
            return;
        }

        const metaCols = new Set([nameCol, deptCol, 'สถานะ', 'คะแนนรวม', 'วิทยฐานะ', 'ตำแหน่ง', 'คำนำหน้า', 'ชื่อ-สกุล'].filter(Boolean));
        const evalItemHeaders = headers.filter(h => {
            if (metaCols.has(h)) return false;
            return isP1S1Header(h) || isP1S2Header(h) || isP2Header(h) || isP3Header(h);
        });

        // สร้าง requiredHeaders
        const requiredHeaderSet = new Set();

        const requiredP1S1Keys = new Set(
            requiredItems
                .filter(item => item.element === '1' && item.part === '1')
                .map(item => item.value.replace('.', '_'))
        );
        evalItemHeaders.forEach(h => {
            if (!isP1S1Header(h)) return;
            const m = h.match(/^(\d+)\.(\d+)/);
            if (!m) return;
            const key = `${m[1]}_${m[2]}`;
            if (requiredP1S1Keys.has(key)) requiredHeaderSet.add(h);
        });

        if (requiredItems.some(item => item.element === '1' && item.part === '2')) {
            evalItemHeaders.filter(isP1S2Header).forEach(h => requiredHeaderSet.add(h));
        }

        if (requiredItems.some(item => item.element === '2')) {
            const found = evalItemHeaders.find(isP2Header);
            if (found) requiredHeaderSet.add(found);
        }

        requiredItems.filter(item => item.element === '3').forEach(item => {
            const idx = parseInt(item.value) - 1;
            if (idx >= 0 && idx < PART3_ITEMS.length) {
                const base = PART3_ITEMS[idx].substring(0, 10);
                const found = evalItemHeaders.find(h => h.startsWith(base));
                if (found) requiredHeaderSet.add(found);
            }
        });

        const requiredHeaders = Array.from(requiredHeaderSet);

        if (requiredHeaders.length === 0) {
            Swal.close();
            Swal.fire('ผิดพลาด', 'ไม่พบหัวข้อคะแนนในไฟล์ Excel ที่ตรงกับชุดที่เลือก', 'error');
            event.target.value = '';
            return;
        }

        // ==========================================
        // ประมวลผลแต่ละแถว → สร้าง payloads (0 queries)
        // ==========================================
        let successCount = 0, failCount = 0, skippedCount = 0;
        let errors = [];
        const missingScoreErrors = [];
        const payloads = [];   // ← เก็บ payload ทั้งหมดสำหรับ batch upsert

        for (const row of jsonData) {
            const teacherName = String(row[nameCol] || '').trim();
            if (!teacherName) continue;

            const rowDept = deptCol ? String(row[deptCol] || '').trim() : '';
            const teacher = findTeacherLocal(teacherName, rowDept);

            if (!teacher) {
                errors.push(`ไม่พบครู: ${teacherName}`);
                failCount++;
                continue;
            }

            // ตรวจสอบว่าอยู่ในกลุ่มเป้าหมาย
            if (!targetDepts.includes(teacher.department)) {
                skippedCount++;
                continue;
            }

            // ตรวจสอบคะแนนครบถ้วน
            const missingHeaders = [];
            const invalidScores = [];

            for (const header of requiredHeaders) {
                const value = row[header];
                const numValue = parseScoreValue(value);

                if (numValue === null) {
                    missingHeaders.push(header);
                } else {
                    const isP2Col = isP2Header(header);
                    const maxVal = isP2Col ? 5 : 4;
                    if (numValue < 1 || numValue > maxVal) {
                        invalidScores.push(`${header} = ${numValue} (ต้อง 1-${maxVal})`);
                    }
                }
            }

            if (missingHeaders.length > 0 || invalidScores.length > 0) {
                let msg = `ครู: ${teacherName}`;
                if (missingHeaders.length > 0) msg += `<br>❌ ขาดคะแนนหัวข้อ: ${missingHeaders.join(', ')}`;
                if (invalidScores.length > 0) msg += `<br>⚠️ คะแนนผิดช่วง: ${invalidScores.join(', ')}`;
                missingScoreErrors.push(msg);
                failCount++;
                continue;
            }

            // คำนวณคะแนน
            const detailedScores = { p1_s1: [], p1_s1_keys: [], p1_s2: [], p1_s2_keys: [], p2: null, p3: [], p3_keys: [] };
            let hasScore = false;
            let p1s2Raw = 0;

            for (const header of evalItemHeaders) {
                const numValue = parseScoreValue(row[header]);
                if (numValue === null) continue;
                hasScore = true;

                if (isP2Header(header)) {
                    detailedScores.p2 = numValue;
                }
                else if (isP1S2Header(header)) {
                    detailedScores.p1_s2.push(numValue);
                    p1s2Raw += (numValue * 0.25) * getP1S2Max(header);
                    if (header.includes('วิธีการดำเนินการ')) detailedScores.p1_s2_keys.push('1');
                    else if (header.includes('เชิงปริมาณ')) detailedScores.p1_s2_keys.push('2.1');
                    else if (header.includes('เชิงคุณภาพ')) detailedScores.p1_s2_keys.push('2.2');
                }
                else if (isP3Header(header)) {
                    detailedScores.p3.push(numValue);
                    const idx = PART3_ITEMS.findIndex(item => header.startsWith(item.substring(0, 10)));
                    detailedScores.p3_keys.push(String(idx + 1));
                }
                else if (isP1S1Header(header)) {
                    detailedScores.p1_s1.push(numValue);
                    const match = header.match(/^\d+\.\d+/);
                    if (match) detailedScores.p1_s1_keys.push(match[0].replace('.', '_'));
                }
            }

            const isAssistant = teacher.academic_standing === 'ครูผู้ช่วย';
            let totalScore = 0;

            if (detailedScores.p1_s1.length > 0) {
                const sum = detailedScores.p1_s1.reduce((a, b) => a + b, 0);
                totalScore += isAssistant ? (sum * 80) / 56 : sum;
            }
            if (detailedScores.p1_s2.length > 0) totalScore += (p1s2Raw * 20) / 40;
            if (detailedScores.p2 !== null) totalScore += detailedScores.p2 * 2;
            if (detailedScores.p3.length > 0) totalScore += detailedScores.p3.reduce((a, b) => a + b, 0) / 4;
            totalScore = Math.min(Math.max(totalScore, 0), 100);

            payloads.push({
                eval_round_id: evalRound.id,
                sub_group_id: subGroupIdToUse,
                academic_year: currentTermData.current_academic_year,
                semester: currentTermData.current_semester,
                evaluatee_id: teacher.id,
                evaluator_id: evaluatorId,
                eval_type: 'committee',
                total_score: totalScore,
                detailed_scores: detailedScores,
                status: hasScore ? 'submitted' : 'draft',
                updated_at: new Date().toISOString()
            });
        }

        console.log(`⚡ Phase 3: ${(performance.now() - t3).toFixed(0)}ms | ${payloads.length} payloads`);

        // ==========================================
        // ⚡ PHASE 4: Batch Upsert (1-3 queries)
        // ==========================================
        const t4 = performance.now();

        if (payloads.length > 0) {
            // Supabase upsert (onConflict match unique constraint)
            const CHUNK_SIZE = 100;

            for (let i = 0; i < payloads.length; i += CHUNK_SIZE) {
                const chunk = payloads.slice(i, i + CHUNK_SIZE);

                const { error: upsertError } = await db
                    .from('eval_results')
                    .upsert(chunk, {
                        onConflict: 'evaluatee_id,evaluator_id,eval_round_id,sub_group_id,eval_type',
                        ignoreDuplicates: false
                    });

                if (upsertError) {
                    console.error('Upsert error:', upsertError);
                    // Fallback: ลองทีละคน
                    for (const p of chunk) {
                        const { error: singleErr } = await db
                            .from('eval_results')
                            .upsert([p], {
                                onConflict: 'evaluatee_id,evaluator_id,eval_round_id,sub_group_id,eval_type',
                                ignoreDuplicates: false
                            });
                        if (singleErr) {
                            failCount++;
                            errors.push(`อัปเดต ${p.evaluatee_id} ล้มเหลว: ${singleErr.message}`);
                        } else {
                            successCount++;
                        }
                    }
                } else {
                    successCount += chunk.length;
                }
            }
        }

        console.log(`⚡ Phase 4: ${(performance.now() - t4).toFixed(0)}ms | total: ${(performance.now() - tStart).toFixed(0)}ms`);

        Swal.close();

        // ==========================================
        // แสดงผลลัพธ์
        // ==========================================
        let message = `<div class="text-left space-y-2">
            <p>✅ นำเข้าสำเร็จ: <b>${successCount}</b> รายการ</p>
            <p>⏭️ ข้าม (ไม่ใช่กลุ่มเป้าหมาย): <b>${skippedCount}</b> รายการ</p>
            <p>❌ ล้มเหลว: <b>${failCount}</b> รายการ</p>
            <p class="text-xs text-gray-400 mt-2">⏱️ ใช้เวลา: ${(performance.now() - tStart).toFixed(0)} มิลลิวินาที</p>`;

        if (missingScoreErrors.length > 0) {
            const listHtml = missingScoreErrors.map((e, i) =>
                `<div class="border-b border-red-100 py-2 text-xs"><span class="font-bold text-red-700">${i + 1}. ${e}</span></div>`
            ).join('');
            message += `<div class="mt-3 p-3 bg-red-50 rounded-lg border border-red-200">
                <p class="text-sm font-bold text-red-700">⚠️ คะแนนไม่สมบูรณ์ (${missingScoreErrors.length} รายการ):</p>
                <div class="text-xs text-red-600 max-h-60 overflow-y-auto mt-1">${listHtml}</div>
                <p class="text-xs text-gray-400 mt-2">💡 กรุณากรอกคะแนนให้ครบแล้วนำเข้าใหม่</p>
            </div>`;
        }
        if (errors.length > 0) {
            message += `<div class="mt-3 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                <p class="text-sm font-bold text-yellow-700">⚠️ ข้อผิดพลาดอื่นๆ:</p>
                <div class="text-xs text-yellow-600 max-h-40 overflow-y-auto mt-1">${errors.slice(0, 10).join('<br>')}</div>
            </div>`;
        }
        message += '</div>';

        await Swal.fire({
            icon: successCount > 0 ? 'success' : 'error',
            title: successCount > 0 ? '✅ นำเข้าข้อมูลสำเร็จ' : '❌ นำเข้าข้อมูลล้มเหลว',
            html: message, confirmButtonText: 'ตกลง', width: '700px'
        });

        // ==========================================
        // ✅ รีเฟรชตาราง (ใช้ loadTeachersForSubGroup โดยตรง)
        // ==========================================
        if (successCount > 0) {
            try {
                // ✅ Sync _selectedSubGroupId ให้ตรงกับชุดที่ import
                _selectedSubGroupId = subGroupIdToUse;

                // ✅ โหลด _selectedSubGroupTargets ถ้ายังไม่มี
                if (!_selectedSubGroupTargets || _selectedSubGroupTargets.length === 0) {
                    const { data: freshTargets } = await db
                        .from('eval_committee_targets')
                        .select('*')
                        .eq('committee_group_id', subGroupIdToUse)
                        .eq('is_active', true);
                    _selectedSubGroupTargets = freshTargets || [];
                }

                // ✅ โหลด _selectedSubGroupItems ถ้ายังไม่มี
                if (!_selectedSubGroupItems || _selectedSubGroupItems.length === 0) {
                    const { data: freshSubGroup } = await db
                        .from('eval_committee_groups')
                        .select('selected_sub_items')
                        .eq('id', subGroupIdToUse)
                        .maybeSingle();
                    _selectedSubGroupItems = freshSubGroup?.selected_sub_items || [];
                }

                // ✅ Reset loading flag (ป้องกันกรณี flag ค้าง)
                _isLoadingTeachers = false;

                // ✅ โหลดตารางใหม่
                console.log('🔄 กำลังรีเฟรชตารางหลัง import...');
                await loadTeachersForSubGroup();
                console.log('✅ รีเฟรชตารางเสร็จ');
            } catch (refreshErr) {
                console.error('⚠️ รีเฟรชตารางล้มเหลว (ไม่กระทบการ import):', refreshErr);
            }
        }

    } catch (err) {
        console.error('Error importing Excel:', err);
        Swal.close();
        Swal.fire('ผิดพลาด', err.message, 'error');
    } finally {
        event.target.value = '';
    }
}

// ==========================================
// Export ฟังก์ชันให้ global
// ==========================================
window.exportCommitteeExcel = exportCommitteeExcel;
window.importCommitteeExcel = importCommitteeExcel;
window.parseScoreValue = parseScoreValue;
window.exportAllCommitteeScoresExcel = exportAllCommitteeScoresExcel;

console.log('✅ evaluation_excel.js (v5 Optimized) loaded successfully');
console.log('✅ evaluation_excel.js loaded successfully');

