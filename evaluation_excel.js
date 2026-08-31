// ==========================================
// evaluation_excel.js - ฟังก์ชัน Import/Export Excel
// แยกออกจาก evaluation_ui.js เพื่อความชัดเจน
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
// ✅ ส่งออก Excel สำหรับกรรมการ (Export) - ฉบับแก้ไขสมบูรณ์ v2
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

        Swal.fire({
            title: 'กำลังสร้างไฟล์ Excel...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        // ✅ 1. Query ชุดย่อยที่กรรมการคนนี้สังกัด
        let subGroups = [];
        const { data: memberships, error: memError } = await db
            .from('eval_committee_members')
            .select('committee_group_id')
            .eq('user_id', evaluatorId)
            .eq('is_active', true);

        if (memError) throw memError;

        const subGroupIds = memberships.map(m => m.committee_group_id);
        if (subGroupIds.length === 0) {
            Swal.close();
            return Swal.fire('แจ้งเตือน', 'คุณไม่ได้เป็นกรรมการในชุดใดเลย', 'warning');
        }

        const { data: subs, error: subError } = await db
            .from('eval_committee_groups')
            .select('*, eval_committee_targets(*)')
            .in('id', subGroupIds)
            .eq('is_active', true);

        if (subError) throw subError;
        subGroups = subs || [];

        if (subGroups.length === 0) {
            Swal.close();
            return Swal.fire('แจ้งเตือน', 'ไม่พบข้อมูลชุดย่อยที่ใช้งานอยู่', 'warning');
        }

        const allDepartments = new Set();
        for (const sub of subGroups) {
            const targets = sub.eval_committee_targets || [];
            const depts = targets
                .filter(t => t.target_type === 'department')
                .map(t => t.target_value);
            const allowed = ['ภาษาไทย', 'คณิตศาสตร์', 'วิทยาศาสตร์และเทคโนโลยี (วิทยาศาสตร์)',
                'วิทยาศาสตร์และเทคโนโลยี (เทคโนโลยี)', 'สังคมศึกษา ศาสนาและวัฒนธรรม',
                'สุขศึกษาและพลศึกษา', 'ศิลปะ', 'การงานอาชีพ',
                'ภาษาต่างประเทศ (ภาษาอังกฤษ)', 'ภาษาต่างประเทศ (ภาษาจีน)', 'แนะแนว'];
            const filteredDepts = depts.filter(d => allowed.includes(d));
            filteredDepts.forEach(d => allDepartments.add(d));
        }

        if (allDepartments.size === 0) {
            Swal.close();
            return Swal.fire('แจ้งเตือน', 'ไม่พบกลุ่มเป้าหมาย (department targets) ในชุดย่อยที่สังกัด', 'warning');
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
                        <p><b>กลุ่มสาระที่ตั้งค่าไว้:</b></p>
                        <ul class="list-disc pl-5 text-sm">
                            ${deptArray.map(d => `<li>${d}</li>`).join('')}
                        </ul>
                        <p class="text-sm text-gray-500 mt-3">💡 ตรวจสอบว่ามีครูในกลุ่มสาระเหล่านี้ หรือตั้งค่า targets ถูกต้อง</p>
                    </div>
                `,
                confirmButtonText: 'ตกลง'
            });
        }

        const teacherIds = allTeachers.map(t => t.id);
        const { data: evalResults } = await db
            .from('eval_results')
            .select('evaluatee_id, detailed_scores, total_score, status')
            .in('evaluatee_id', teacherIds)
            .eq('eval_round_id', currentEvalRound.id)
            .eq('evaluator_id', evaluatorId)
            .eq('eval_type', 'committee');

        const evalMap = {};
        (evalResults || []).forEach(r => { evalMap[r.evaluatee_id] = r; });

        // ✅ 2. สร้าง uniqueItems จากทุกชุดย่อย (เรียงตาม element, part, value)
        const allSubItems = [];

        for (const sub of subGroups) {
            const items = sub.selected_sub_items || [];
            const formattedItems = items.map(item => {
                let label = '';
                if (item.element === '1') {
                    if (item.part === '1') {
                        // ใช้ criteria ของกรรมการชั่วคราวเพื่อหา label (อาจไม่ตรง แต่ไม่เป็นไร)
                        const tempCriteria = evalCriteriaDB[currentUser.academic_standing] || evalCriteriaDB['ครูชำนาญการพิเศษ'];
                        for (const group of tempCriteria.part1_sec1 || []) {
                            const found = group.items.find(i => i.id === item.value || i.id === item.value.replace('.', '_'));
                            if (found) { label = found.label; break; }
                        }
                    } else if (item.part === '2') {
                        const tempCriteria = evalCriteriaDB[currentUser.academic_standing] || evalCriteriaDB['ครูชำนาญการพิเศษ'];
                        const found = tempCriteria.part1_sec2?.find(i => {
                            const id = i.id === 's2_1' ? '1' : i.id === 's2_2_1' ? '2.1' : i.id === 's2_2_2' ? '2.2' : i.id;
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
            allSubItems.push(...formattedItems);
        }

        // Deduplicate และเรียงลำดับตาม element, part, value
        const uniqueMap = new Map();
        allSubItems.forEach(item => {
            const key = `${item.element}-${item.value}-${item.part || ''}`;
            if (!uniqueMap.has(key)) {
                uniqueMap.set(key, item);
            }
        });
        const uniqueItems = Array.from(uniqueMap.values()).sort((a, b) => {
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

            // ✅ ใช้ criteria ของครูคนนี้ (สำคัญ!)
            const teacherCriteria = evalCriteriaDB[teacher.academic_standing] || evalCriteriaDB['ครูชำนาญการพิเศษ'];

            // ✅ สร้าง mapping จาก p1_s1_keys (ถ้ามี)
            const p1S1Scores = detailedScores.p1_s1 || [];
            const p1S1Keys = detailedScores.p1_s1_keys || null;
            const p1S1Map = {};

            if (p1S1Keys && p1S1Keys.length === p1S1Scores.length) {
                // ใช้ keys ที่บันทึกไว้ (แม่นยำที่สุด)
                p1S1Keys.forEach((key, idx) => {
                    p1S1Map[key] = p1S1Scores[idx];
                });
            } else {
                // ✅ Fallback ใหม่: ใช้ uniqueItems ที่กรรมการเลือก (ตรงกับคอลัมน์ใน Excel)
                // วิธีนี้จะแมปคะแนนตามลำดับของคอลัมน์ที่ export จริง แทน criteria ทั้งหมด
                const p1S1UniqueItems = uniqueItems.filter(item => item.element === '1' && item.part === '1');
                const allP1Ids = p1S1UniqueItems.map(item => item.value.replace('.', '_'));

                if (p1S1Scores.length !== p1S1UniqueItems.length) {
                    console.warn(`⚠️ จำนวนคะแนน p1_s1 (${p1S1Scores.length}) ไม่เท่ากับจำนวนหัวข้อที่ export (${p1S1UniqueItems.length}) สำหรับครู ${teacher.first_name} ${teacher.last_name}`);
                }

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
                            // ใช้ p1S1Map
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
            ['จำนวนครูที่ต้องประเมิน', allTeachers.length],
            ['จำนวนหัวข้อ', uniqueItems.length],
            ['กลุ่มสาระเป้าหมาย', deptArray.join(', ')],
            ['วันที่ส่งออก', new Date().toLocaleString('th-TH')],
            [''],
            ['รายละเอียดชุดย่อยที่สังกัด'],
            ['ชุดย่อย', 'จำนวนหัวข้อ', 'กลุ่มสาระเป้าหมาย']
        ];
        for (const sub of subGroups) {
            const targets = sub.eval_committee_targets || [];
            const depts = targets.filter(t => t.target_type === 'department').map(t => t.target_value).join(', ');
            infoData.push([sub.group_name, (sub.selected_sub_items || []).length, depts || '-']);
        }
        const wsInfo = XLSX.utils.aoa_to_sheet(infoData);
        wsInfo['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 40 }];

        XLSX.utils.book_append_sheet(wb, wsInfo, 'ข้อมูล');
        XLSX.utils.book_append_sheet(wb, ws, 'คะแนนประเมิน');

        Swal.close();

        const fileName = `คะแนนประเมิน_${evaluatorName.replace(/\s/g, '_')}_${currentEvalRound.round_name?.replace(/\s/g, '_') || 'round'}.xlsx`;
        XLSX.writeFile(wb, fileName);

        Swal.fire({
            icon: 'success',
            title: 'ส่งออก Excel สำเร็จ!',
            text: `ไฟล์ "${fileName}" ถูกบันทึกเรียบร้อย`,
            timer: 2000,
            showConfirmButton: false
        });

    } catch (err) {
        console.error('Error exporting committee Excel:', err);
        Swal.close();
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// ✅ นำเข้า Excel สำหรับกรรมการ (ฉบับแก้ไขสมบูรณ์ v3)
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

    // ดึงรอบการประเมิน (ป้องกัน currentEvalRound เป็น null)
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
        let cleaned = name.trim();
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

    // ฟังก์ชันค้นหาครู (3 ระดับ)
    async function findTeacher(teacherName, deptName) {
        const cleanName = stripThaiTitle(teacherName);
        const nameParts = cleanName.split(/\s+/);
        const firstName = nameParts[0] || '';
        const lastName = nameParts.length >= 2 ? nameParts.slice(1).join(' ') : '';
        if (!firstName) return null;

        const baseQuery = () => db.from('core_personnel')
            .select('id, prefix, first_name, last_name, academic_standing, department, position')
            .in('position', ['ครู', 'ครูผู้ช่วย'])
            .in('academic_standing', ['ครูผู้ช่วย', 'ไม่มีวิทยฐานะ', 'ครูชำนาญการ', 'ครูชำนาญการพิเศษ']);

        const filterByDept = (arr) => deptName ? arr.filter(p => p.department === deptName) : arr;
        const pickOne = (arr) => {
            if (arr.length === 1) return arr[0];
            const filtered = filterByDept(arr);
            return filtered.length === 1 ? filtered[0] : null;
        };

        // วิธีที่ 1: exact
        let q = baseQuery();
        q = lastName ? q.eq('first_name', firstName).eq('last_name', lastName)
            : q.ilike('first_name', `%${firstName}%`);
        const { data: exact = [] } = await q;
        const r1 = pickOne(exact);
        if (r1) return r1;

        // วิธีที่ 2: ilike
        if (exact.length !== 1) {
            let iq = baseQuery();
            iq = lastName ? iq.ilike('first_name', `%${firstName}%`).ilike('last_name', `%${lastName}%`)
                : iq.ilike('first_name', `%${firstName}%`);
            const { data: ilike = [] } = await iq.limit(10);
            const r2 = pickOne(ilike);
            if (r2) return r2;

            // วิธีที่ 3: full-scan เฉพาะเมื่อ exact+ilike ไม่พบเลย
            if (exact.length === 0 && ilike.length === 0) {
                const words = cleanName.split(/\s+/);
                const { data: all = [] } = await baseQuery().limit(200);
                const matched = all.filter(p =>
                    words.every(w => `${p.prefix || ''}${p.first_name} ${p.last_name}`.includes(w))
                );
                return pickOne(matched);
            }
        }
        return null;
    }

    // ==========================================
    // ฟังก์ชันจำแนกประเภทหัวคอลัมน์
    // ==========================================
    const isP1S2Header = (h) => h.includes('วิธีการดำเนินการ') || h.includes('ผลลัพธ์การเรียนรู้');
    const isP2Header = (h) => h.includes('ความสำเร็จของงานที่ได้รับมอบหมาย') || h.includes('ระดับ 1-5');
    const isP3Header = (h) => typeof PART3_ITEMS !== 'undefined' && PART3_ITEMS.some(item => h.startsWith(item.substring(0, 10)));
    const isP1S1Header = (h) => !isP1S2Header(h) && !isP2Header(h) && !isP3Header(h) && /^\d+\.\d+/.test(h);
    const getP1S2Max = (h) => h.includes('วิธีการดำเนินการ') ? 20 : 10;

    // ==========================================
    // ตรวจสอบผู้ประเมินและรอบ
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
        html: `<p>นำเข้าข้อมูลจาก <b>${file.name}</b></p><p class="text-sm text-gray-500 mt-2">⚠️ ข้อมูลเดิมจะถูกแทนที่</p>`,
        showCancelButton: true, confirmButtonText: '✅ ยืนยันนำเข้า', cancelButtonText: 'ยกเลิก'
    });
    if (!confirmResult.isConfirmed) { event.target.value = ''; return; }

    Swal.fire({ title: 'กำลังนำเข้าข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const sheetName = workbook.SheetNames.find(n => n === 'คะแนนประเมิน') || workbook.SheetNames[0];

        // ★★★ FIX ROOT CAUSE: ใช้ {defval: ''} เพื่อให้ทุก row มีทุก key
        const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

        if (!jsonData || jsonData.length === 0) {
            Swal.close();
            Swal.fire('แจ้งเตือน', 'ไม่พบข้อมูลในชีท "คะแนนประเมิน"', 'warning');
            event.target.value = '';
            return;
        }

        // ★★★ ใช้ union ของ keys จากทุก row เพื่อป้องกันการขาด column
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

        // กรอง column meta ออก
        const metaCols = new Set([nameCol, deptCol, 'สถานะ', 'คะแนนรวม', 'วิทยฐานะ', 'ตำแหน่ง', 'คำนำหน้า', 'ชื่อ-สกุล'].filter(Boolean));
        const evalItemHeaders = headers.filter(h => {
            if (metaCols.has(h)) return false;
            return isP1S1Header(h) || isP1S2Header(h) || isP2Header(h) || isP3Header(h);
        });

        // ==========================================
        // ดึง selected_sub_items จากทุกชุดย่อยที่กรรมการสังกัด
        // ==========================================
        let requiredItems = [];
        let subGroupIds = [];

        const { data: myMemberships, error: memErr } = await db
            .from('eval_committee_members').select('committee_group_id')
            .eq('user_id', evaluatorId).eq('is_active', true);

        if (!memErr && myMemberships && myMemberships.length > 0) {
            subGroupIds = myMemberships.map(m => m.committee_group_id);
            const { data: subGroupsData } = await db
                .from('eval_committee_groups')
                .select('id, selected_sub_items')
                .in('id', subGroupIds)
                .eq('eval_round_id', evalRound.id)
                .eq('group_type', 'sub')
                .eq('is_active', true);

            if (subGroupsData) {
                for (const sub of subGroupsData) {
                    requiredItems.push(...(sub.selected_sub_items || []));
                }
            }
        }

        if (!requiredItems || requiredItems.length === 0) {
            Swal.close();
            Swal.fire('ผิดพลาด', 'ไม่พบข้อมูลหัวข้อที่ต้องประเมิน กรุณาตรวจสอบการตั้งค่าชุดคณะกรรมการ', 'error');
            event.target.value = '';
            return;
        }

        // ==========================================
        // สร้าง requiredHeaders จากทุกองค์ประกอบ
        // ==========================================
        const requiredHeaderSet = new Set();

        // p1_s1: จับคู่ด้วยเลขนำหน้า N.M
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

        // p1_s2: keyword คงที่ทุกวิทยฐานะ
        if (requiredItems.some(item => item.element === '1' && item.part === '2')) {
            evalItemHeaders.filter(isP1S2Header).forEach(h => requiredHeaderSet.add(h));
        }

        // p2: ข้อเดียว
        if (requiredItems.some(item => item.element === '2')) {
            const found = evalItemHeaders.find(isP2Header);
            if (found) requiredHeaderSet.add(found);
        }

        // p3: เทียบกับ PART3_ITEMS
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
            Swal.fire('ผิดพลาด', 'ไม่พบหัวข้อคะแนนในไฟล์ Excel ที่ตรงกับชุดย่อยที่กรรมการสังกัด', 'error');
            event.target.value = '';
            return;
        }

        let successCount = 0, failCount = 0, skippedCount = 0;
        let errors = [];
        const missingScoreErrors = [];

        for (const row of jsonData) {
            const teacherName = String(row[nameCol] || '').trim();
            if (!teacherName) continue;

            const rowDept = deptCol ? String(row[deptCol] || '').trim() : '';
            const teacher = await findTeacher(teacherName, rowDept);

            if (!teacher) {
                errors.push(`ไม่พบครู: ${teacherName}`);
                failCount++;
                continue;
            }

            // ตรวจกลุ่มเป้าหมายของกรรมการคนนี้เท่านั้น
            const { data: targets, error: targetError } = await db
                .from('eval_committee_targets')
                .select('committee_group_id')
                .eq('target_type', 'department')
                .eq('target_value', teacher.department)
                .eq('is_active', true)
                .in('committee_group_id', subGroupIds);

            if (targetError) {
                errors.push(`ตรวจสอบกลุ่มเป้าหมายของ ${teacherName} ล้มเหลว: ${targetError.message}`);
                failCount++;
                continue;
            }

            if (!targets || targets.length === 0) { skippedCount++; continue; }

            // ==========================================
            // ★★★ ตรวจสอบคะแนนครบถ้วน
            // ==========================================
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

            // ==========================================
            // คำนวณคะแนนและแยกองค์ประกอบ
            // ==========================================
            const detailedScores = { p1_s1: [], p1_s2: [], p2: null, p3: [] };
            let hasScore = false;
            let p1s2Raw = 0;

            for (const header of evalItemHeaders) {
                const numValue = parseScoreValue(row[header]);
                if (numValue === null) continue;
                hasScore = true;

                if (isP2Header(header)) { detailedScores.p2 = numValue; }
                else if (isP1S2Header(header)) {
                    detailedScores.p1_s2.push(numValue);
                    p1s2Raw += (numValue * 0.25) * getP1S2Max(header);
                }
                else if (isP3Header(header)) { detailedScores.p3.push(numValue); }
                else if (isP1S1Header(header)) {
                    detailedScores.p1_s1.push(numValue);
                    // ✅ เพิ่ม keys เพื่อระบุว่าคะแนนนี้คือข้อใด
                    if (!detailedScores.p1_s1_keys) detailedScores.p1_s1_keys = [];
                    const match = header.match(/^\d+\.\d+/);
                    if (match) {
                        detailedScores.p1_s1_keys.push(match[0].replace('.', '_'));
                    }
                }
            }

            const isAssistant = teacher.academic_standing === 'ครูผู้ช่วย';
            let totalScore = 0;

            if (detailedScores.p1_s1.length > 0) {
                const sum = detailedScores.p1_s1.reduce((a, b) => a + b, 0);
                totalScore += isAssistant ? (sum * 80) / 56 : sum;
            }
            if (detailedScores.p1_s2.length > 0) {
                totalScore += (p1s2Raw * 20) / 40;
            }
            if (detailedScores.p2 !== null) {
                totalScore += detailedScores.p2 * 2;
            }
            if (detailedScores.p3.length > 0) {
                totalScore += detailedScores.p3.reduce((a, b) => a + b, 0) / 4;
            }
            totalScore = Math.min(Math.max(totalScore, 0), 100);

            // บันทึกลง DB
            const payload = {
                eval_round_id: evalRound.id,
                academic_year: currentTermData.current_academic_year,
                semester: currentTermData.current_semester,
                evaluatee_id: teacher.id,
                evaluator_id: evaluatorId,
                eval_type: 'committee',
                total_score: totalScore,
                detailed_scores: detailedScores,
                status: hasScore ? 'submitted' : 'draft',
                updated_at: new Date().toISOString()
            };

            try {
                const { data: existing } = await db.from('eval_results').select('id')
                    .eq('evaluatee_id', teacher.id).eq('eval_round_id', evalRound.id)
                    .eq('evaluator_id', evaluatorId).eq('eval_type', 'committee').maybeSingle();

                if (existing) {
                    await db.from('eval_results').update(payload).eq('id', existing.id);
                } else {
                    await db.from('eval_results').insert([payload]);
                }
                successCount++;
            } catch (err) {
                errors.push(`อัปเดต ${teacherName} ล้มเหลว: ${err.message}`);
                failCount++;
            }
        }

        Swal.close();

        // แสดงผลลัพธ์
        let message = `<div class="text-left space-y-2">
            <p>✅ นำเข้าสำเร็จ: <b>${successCount}</b> รายการ</p>
            <p>⏭️ ข้าม (ไม่ใช่กลุ่มเป้าหมาย): <b>${skippedCount}</b> รายการ</p>
            <p>❌ ล้มเหลว: <b>${failCount}</b> รายการ</p>`;

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

        if (successCount > 0) {
            const deptTargets = window._selectedSubGroupTargets?.filter(t => t.target_type === 'department') || [];
            for (const t of deptTargets) {
                await loadTeachersForEvalBySubGroup(window._currentSubGroupId, t.target_value, window._currentSelectedItems, false);
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
// Export ฟังก์ชันให้ global (สำหรับเรียกใช้จาก HTML / อื่น ๆ)
// ==========================================
window.exportCommitteeExcel = exportCommitteeExcel;
window.importCommitteeExcel = importCommitteeExcel;
window.parseScoreValue = parseScoreValue;

console.log('✅ evaluation_excel.js loaded successfully');