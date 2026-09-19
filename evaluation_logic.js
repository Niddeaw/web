// ==========================================
// evaluation_logic.js - คำนวณคะแนน, สรุปผล, Export, PDF, Review
// ==========================================
// ==========================================
// ✅ Helper: สร้าง Tom Select สำหรับ dropdown ครู
// ==========================================
let _evScoreEvaluateeTomSelect = null;
let _evScoreSubGroupTomSelect = null;

function initEvaluatorScoresTomSelects() {
    // ✅ ครู: ค้นหาได้ + จัดกลุ่มตามกลุ่มสาระ
    const evalSelect = document.getElementById('ev_score_evaluatee');
    if (evalSelect && !_evScoreEvaluateeTomSelect) {
        _evScoreEvaluateeTomSelect = new TomSelect(evalSelect, {
            placeholder: '-- พิมพ์เพื่อค้นหาชื่อครู หรือเลือกกลุ่มสาระ --',
            allowEmptyOption: true,
            maxOptions: null,                    // แสดงทุก option (จะกรองด้วย search)
            searchField: ['text', 'value'],       // ค้นหาจาก label
            sortField: [
                { field: 'department', direction: 'asc' },
                { field: 'name', direction: 'asc' }
            ],
            render: {
                option: function (data, escape) {
                    return `<div class="py-1">
                        <div class="font-medium text-gray-800">${escape(data.text)}</div>
                        ${data.department ? `<div class="text-xs text-gray-500">${escape(data.department)}</div>` : ''}
                    </div>`;
                },
                item: function (data, escape) {
                    return `<div class="text-sm">${escape(data.text)}</div>`;
                }
            },
            onChange: function (value) {
                // เมื่อเปลี่ยนครู → ไม่ต้องทำอะไร
                console.log('เลือกครู:', value);
            }
        });
    }

    // ✅ ชุดคณะกรรมการ: ค้นหาได้ + จัดกลุ่มด้วย optgroup
    const subGroupSelect = document.getElementById('ev_score_subgroup');
    if (subGroupSelect && !_evScoreSubGroupTomSelect) {
        _evScoreSubGroupTomSelect = new TomSelect(subGroupSelect, {
            placeholder: '-- พิมพ์เพื่อค้นหาชุดคณะกรรมการ --',
            allowEmptyOption: true,
            maxOptions: null,
            searchField: ['text'],
            render: {
                option: function (data, escape) {
                    return `<div class="py-1 text-sm">${escape(data.text)}</div>`;
                }
            },
            onChange: function (value) {
                // ✅ trigger การโหลดครูตามชุดย่อย
                if (typeof onEvaluatorScoresSubGroupChange === 'function') {
                    onEvaluatorScoresSubGroupChange(value);
                }
            }
        });
    }
}

// ==========================================
// ฟังก์ชันหา Mode
// ==========================================
function findMode(arr) {
    if (!arr || arr.length === 0) return null;
    const frequency = {};
    let maxFreq = 0;
    let mode = arr[0];
    for (const value of arr) {
        if (typeof value !== 'number' || isNaN(value)) continue;
        frequency[value] = (frequency[value] || 0) + 1;
        if (frequency[value] > maxFreq) {
            maxFreq = frequency[value];
            mode = value;
        }
    }
    return mode;
}

// ==========================================
// ✅ [OPTIMIZED v2] buildEvaluationContext
// แก้ไข: รองรับ main group ที่ถูกใช้เป็น sub_group_id
// ==========================================
async function buildEvaluationContext(evalRoundId) {
    const tStart = performance.now();

    // ---- Query 1: ดึง sub_group_ids ที่ถูกใช้จริงใน eval_results ----
    // ✅ [FIX] ดึง "ทุก committee_group ที่ถูกใช้" ไม่ว่าจะเป็น main หรือ sub
    const { data: usedSubGroupIds, error: usedErr } = await db
        .from('eval_results')
        .select('sub_group_id')
        .eq('eval_round_id', evalRoundId)
        .eq('eval_type', 'committee')
        .eq('status', 'submitted')
        .not('sub_group_id', 'is', null);

    if (usedErr) throw usedErr;

    const usedIds = [...new Set((usedSubGroupIds || []).map(e => e.sub_group_id))];

    if (usedIds.length === 0) {
        console.warn('⚠️ buildEvaluationContext: ไม่พบ sub_group_id ที่ถูกใช้ใน eval_results');
        return {
            subGroups: [],
            subGroupIds: [],
            teachers: [],
            teachersByDept: new Map(),
            evalsByKey: new Map(),
            personnelById: new Map(),
            allEvals: [],
            allDepartments: []
        };
    }

    console.log(`📌 buildEvaluationContext: พบ ${usedIds.length} committee groups ที่ถูกใช้จริง`);

    // ---- Query 2: โหลด committee_groups ตาม id (ทั้ง main + sub) ----
    // ✅ [FIX] ใช้ .in('id', usedIds) แทน .eq('group_type', 'sub')
    const { data: subGroupsRaw, error: sgErr } = await db
        .from('eval_committee_groups')
        .select(`
            id, group_name, group_type, selected_sub_items,
            eval_committee_targets(target_type, target_value, is_active),
            eval_committee_members(user_id, is_active, core_personnel(id, first_name, last_name))
        `)
        .in('id', usedIds)
        .eq('is_active', true);

    if (sgErr) throw sgErr;

    // กรอง is_active ใน memory
    const subGroups = (subGroupsRaw || []).map(sg => ({
        ...sg,
        eval_committee_targets: (sg.eval_committee_targets || []).filter(t => t.is_active !== false),
        eval_committee_members: (sg.eval_committee_members || []).filter(m => m.is_active !== false)
    }));

    const subGroupIds = subGroups.map(sg => sg.id);

    // ---- รวบรวม departments ที่ต้องใช้ ----
    const deptSet = new Set();
    subGroups.forEach(sg => {
        (sg.eval_committee_targets || [])
            .filter(t => t.target_type === 'department')
            .forEach(t => deptSet.add(t.target_value));
    });
    const deptArray = Array.from(deptSet);

    // ---- Query 3-5: teachers + eval_results + personnel พร้อมกัน ----
    const [teachersRes, evalsRes, personnelRes] = await Promise.all([
        deptArray.length > 0
            ? db.from('core_personnel')
                .select('id, prefix, first_name, last_name, academic_standing, department, position')
                .in('department', deptArray)
                .in('position', ['ครู', 'ครูผู้ช่วย'])
                .in('academic_standing', ['ครูผู้ช่วย', 'ไม่มีวิทยฐานะ', 'ครูชำนาญการ', 'ครูชำนาญการพิเศษ'])
            : Promise.resolve({ data: [], error: null }),

        subGroupIds.length > 0
            ? db.from('eval_results')
                .select('evaluatee_id, evaluator_id, sub_group_id, detailed_scores, total_score, status')
                .in('sub_group_id', subGroupIds)
                .eq('eval_round_id', evalRoundId)
                .eq('eval_type', 'committee')
                .eq('status', 'submitted')
            : Promise.resolve({ data: [], error: null }),

        // personnel ทั้งหมด (lookup evaluatee)
        db.from('core_personnel')
            .select('id, prefix, first_name, last_name, academic_standing, department')
            .limit(3000)
    ]);

    if (teachersRes.error) throw teachersRes.error;
    if (evalsRes.error) throw evalsRes.error;

    const teachers = teachersRes.data || [];
    const allEvals = evalsRes.data || [];

    // ---- สร้าง Index Maps ----
    const teachersByDept = new Map();
    teachers.forEach(t => {
        if (!teachersByDept.has(t.department)) teachersByDept.set(t.department, []);
        teachersByDept.get(t.department).push(t);
    });

    const evalsByKey = new Map();
    allEvals.forEach(e => {
        const key = `${e.evaluatee_id}::${e.sub_group_id}`;
        if (!evalsByKey.has(key)) evalsByKey.set(key, []);
        evalsByKey.get(key).push(e);
    });

    const personnelById = new Map();
    (personnelRes.data || []).forEach(p => personnelById.set(p.id, p));
    teachers.forEach(t => personnelById.set(t.id, t));

    const elapsed = (performance.now() - tStart).toFixed(0);
    const mainCount = subGroups.filter(sg => sg.group_type === 'main').length;
    const subCount = subGroups.filter(sg => sg.group_type === 'sub').length;

    console.log(`⚡ buildEvaluationContext: ${elapsed}ms | main=${mainCount}, sub=${subCount}, teachers=${teachers.length}, evals=${allEvals.length}`);

    return {
        subGroups,
        subGroupIds,
        teachers,
        teachersByDept,
        evalsByKey,
        personnelById,
        allEvals,
        allDepartments: deptArray
    };
}

// ==========================================
// คำนวณคะแนนเฉลี่ยของแต่ละชุดย่อย
// ==========================================
async function calculateCommitteeGroupAverage(evaluateeId, evalRoundId, subGroupId) {
    try {
        const { data: evalResults, error } = await db
            .from('eval_results')
            .select('*')
            .eq('evaluatee_id', evaluateeId)
            .eq('eval_round_id', evalRoundId)
            .eq('eval_type', 'committee')
            .eq('status', 'submitted');

        if (error) throw error;
        if (!evalResults || evalResults.length === 0) return null;

        const { data: evaluateePersonnel } = await db
            .from('core_personnel')
            .select('academic_standing')
            .eq('id', evaluateeId)
            .maybeSingle();
        const academicStanding = evaluateePersonnel?.academic_standing || 'ครู';

        const { data: members, error: memError } = await db
            .from('eval_committee_members')
            .select('user_id')
            .eq('committee_group_id', subGroupId)
            .eq('is_active', true);

        if (memError) throw memError;

        const evaluatorIds = members.map(m => m.user_id);
        // ✅ [แก้] filter ทั้ง evaluator_id และ sub_group_id
        const groupResults = evalResults.filter(r =>
            evaluatorIds.includes(r.evaluator_id) &&
            r.sub_group_id === subGroupId
        );

        if (groupResults.length === 0) return null;

        // ----- คำนวณ Mode แยกตามองค์ประกอบ -----
        const modeDetails = {};

        // ✅ [FIX] p1_s1: หา Mode ของ "ผลรวมต่อกรรมการ" (ไม่ใช่ Mode ของค่าดิบ)
        const p1s1SumPerEvaluator = [];
        groupResults.forEach(result => {
            const arr = result.detailed_scores?.p1_s1;
            if (Array.isArray(arr) && arr.length > 0) {
                const sum = arr.reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
                p1s1SumPerEvaluator.push(sum);
            }
        });
        if (p1s1SumPerEvaluator.length > 0) {
            const mode = findMode(p1s1SumPerEvaluator);
            if (mode !== null) modeDetails.p1_s1 = mode;
        }

        // p1_s2: แยกตามข้อ (3 ข้อ) หา mode แต่ละข้อ
        const p1s2Modes = [];
        for (let i = 0; i < 3; i++) {
            const scores = [];
            groupResults.forEach(result => {
                if (result.detailed_scores?.p1_s2 && Array.isArray(result.detailed_scores.p1_s2) && result.detailed_scores.p1_s2.length > i) {
                    const val = result.detailed_scores.p1_s2[i];
                    if (typeof val === 'number' && !isNaN(val)) scores.push(val);
                }
            });
            if (scores.length > 0) {
                const mode = findMode(scores);
                if (mode !== null) p1s2Modes.push(mode);
            } else {
                p1s2Modes.push(null);
            }
        }
        if (p1s2Modes.some(m => m !== null)) {
            modeDetails.p1_s2 = p1s2Modes; // อาร์เรย์ [mode1, mode2, mode3]
        }

        // p2: ระดับเดียว
        const allP2 = [];
        groupResults.forEach(result => {
            if (result.detailed_scores?.p2 !== undefined && result.detailed_scores.p2 !== null) {
                const val = result.detailed_scores.p2;
                if (typeof val === 'number' && !isNaN(val)) allP2.push(val);
            }
        });
        if (allP2.length > 0) {
            const mode = findMode(allP2);
            if (mode !== null) modeDetails.p2 = mode;
        }

        // ✅ [FIX] p3: หา Mode ของ "ผลรวมต่อกรรมการ" (ไม่ใช่ Mode ของค่าดิบ)
        const p3SumPerEvaluator = [];
        groupResults.forEach(result => {
            const arr = result.detailed_scores?.p3;
            if (Array.isArray(arr) && arr.length > 0) {
                const sum = arr.reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
                p3SumPerEvaluator.push(sum);
            }
        });
        if (p3SumPerEvaluator.length > 0) {
            const mode = findMode(p3SumPerEvaluator);
            if (mode !== null) modeDetails.p3 = mode;
        }

        // คำนวณคะแนนรวมจาก Mode Details
        const totalScore = calculateTotalScoreFromModeDetails(modeDetails, academicStanding);

        return {
            sub_group_id: subGroupId,
            evaluator_count: groupResults.length,
            mode_score: totalScore,
            detailed_scores: modeDetails,
            all_scores: groupResults.map(r => r.total_score),
            evaluators: groupResults.map(r => r.evaluator_id)
        };

    } catch (err) {
        console.error('Error calculating committee group average (Mode):', err);
        return null;
    }
}

// ==========================================
// คำนวณคะแนนรวมจาก Mode Details (รองรับ p1_s2 แบบอาร์เรย์)
// ==========================================
function calculateTotalScoreFromModeDetails(modeDetails, academicStanding = null) {
    const academic = academicStanding || 'ครู';
    const isAssistant = academic === 'ครูผู้ช่วย';

    let part1Total = 0;
    let part2Total = 0;
    let part3Total = 0;

    // ----- องค์ประกอบที่ 1: p1_s1 -----
    if (modeDetails.p1_s1 !== undefined) {
        const p1s1Mode = modeDetails.p1_s1;
        if (isAssistant) {
            // ครูผู้ช่วย: 14 ข้อ × 4 = 56 → 80 คะแนน
            part1Total += (p1s1Mode * 80) / 56;
        } else {
            // ครู/ชำนาญการ/ชำนาญการพิเศษ: 15 ข้อ × 4 = 60 → 60 คะแนน
            part1Total += p1s1Mode;
        }
    }

    // ----- องค์ประกอบที่ 1: p1_s2 (อาร์เรย์ของ mode แต่ละข้อ) -----
    if (modeDetails.p1_s2 && Array.isArray(modeDetails.p1_s2) && modeDetails.p1_s2.length === 3) {
        const [m1, m2, m3] = modeDetails.p1_s2.map(v => (v !== null && !isNaN(v)) ? v : 0);
        // ข้อ 1: 20 คะแนน, ข้อ 2: 10 คะแนน, ข้อ 3: 10 คะแนน
        const raw = (m1 / 4) * 20 + (m2 / 4) * 10 + (m3 / 4) * 10;
        // หาร 2 เพื่อปรับจาก 40 เป็น 20 คะแนน
        part1Total += raw / 2;
    }

    // ----- องค์ประกอบที่ 2: p2 (ระดับ 1-5 → คะแนน = ระดับ × 2) -----
    if (modeDetails.p2 !== undefined) {
        const p2Mode = modeDetails.p2;
        if (typeof p2Mode === 'number' && !isNaN(p2Mode)) {
            part2Total = p2Mode * 2;
        }
    }

    // ----- องค์ประกอบที่ 3: p3 (รวม 10 ข้อ → หาร 4) -----
    if (modeDetails.p3 !== undefined) {
        const p3Mode = modeDetails.p3;
        if (typeof p3Mode === 'number' && !isNaN(p3Mode)) {
            part3Total = p3Mode / 4;
        } else if (Array.isArray(p3Mode)) {
            // เผื่อกรณีเก็บเป็นอาร์เรย์ (แต่โดยปกติเก็บเป็นตัวเลข)
            const sum = p3Mode.reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
            part3Total = sum / 4;
        }
    }

    // คะแนนรวมทั้งหมด (จำกัดไม่เกิน 100)
    const total = part1Total + part2Total + part3Total;
    return Math.min(Math.max(total, 0), 100);
}

// ==========================================
// ✅ [OPTIMIZED] คำนวณคะแนนสรุปจากทุกชุดย่อย (ใช้ Mode)
// @param {object|null} context - ผลจาก buildEvaluationContext (ถ้ามี)
// ==========================================
async function calculateFinalAverageScore(evaluateeId, evalRoundId, context = null) {
    try {
        const ctx = context || await buildEvaluationContext(evalRoundId);
        const { subGroups, evalsByKey, personnelById } = ctx;

        const teacher = personnelById.get(evaluateeId);
        const academicStanding = teacher?.academic_standing || 'ครู';

        if (!subGroups || subGroups.length === 0) return null;

        // รวม eval ทั้งหมดของครูคนนี้
        let allEvalsCount = 0;
        subGroups.forEach(sg => {
            const evs = evalsByKey.get(`${evaluateeId}::${sg.id}`);
            if (evs) allEvalsCount += evs.length;
        });

        if (allEvalsCount === 0) return null;

        const groupResults = [];

        for (const subGroup of subGroups) {
            const members = subGroup.eval_committee_members || [];
            if (members.length === 0) continue;

            const evaluatorIds = new Set(members.map(m => m.user_id));
            const groupEvals = (evalsByKey.get(`${evaluateeId}::${subGroup.id}`) || [])
                .filter(e => evaluatorIds.has(e.evaluator_id));

            if (groupEvals.length === 0) continue;

            // ----- คำนวณ Mode Details (logic เดิม) -----
            const modeDetails = {};

            // ✅ [FIX] Mode ของ "ผลรวมต่อกรรมการ"
            const p1s1SumPerEvaluator = [];
            groupEvals.forEach(r => {
                const arr = r.detailed_scores?.p1_s1;
                if (Array.isArray(arr) && arr.length > 0) {
                    const sum = arr.reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
                    p1s1SumPerEvaluator.push(sum);
                }
            });
            if (p1s1SumPerEvaluator.length > 0) {
                const mode = findMode(p1s1SumPerEvaluator);
                if (mode !== null) modeDetails.p1_s1 = mode;
            }

            const p1s2Modes = [];
            for (let i = 0; i < 3; i++) {
                const scores = [];
                groupEvals.forEach(r => {
                    const arr = r.detailed_scores?.p1_s2;
                    if (Array.isArray(arr) && arr.length > i) {
                        const val = arr[i];
                        if (typeof val === 'number' && !isNaN(val)) scores.push(val);
                    }
                });
                if (scores.length > 0) {
                    const mode = findMode(scores);
                    p1s2Modes.push(mode !== null ? mode : null);
                } else {
                    p1s2Modes.push(null);
                }
            }
            if (p1s2Modes.some(m => m !== null)) modeDetails.p1_s2 = p1s2Modes;

            const allP2 = [];
            groupEvals.forEach(r => {
                const val = r.detailed_scores?.p2;
                if (typeof val === 'number' && !isNaN(val)) allP2.push(val);
            });
            if (allP2.length > 0) {
                const mode = findMode(allP2);
                if (mode !== null) modeDetails.p2 = mode;
            }

            // ✅ [FIX] Mode ของ "ผลรวมต่อกรรมการ"
            const p3SumPerEvaluator = [];
            groupEvals.forEach(r => {
                const arr = r.detailed_scores?.p3;
                if (Array.isArray(arr) && arr.length > 0) {
                    const sum = arr.reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
                    p3SumPerEvaluator.push(sum);
                }
            });
            if (p3SumPerEvaluator.length > 0) {
                const mode = findMode(p3SumPerEvaluator);
                if (mode !== null) modeDetails.p3 = mode;
            }

            const totalScore = calculateTotalScoreFromModeDetails(modeDetails, academicStanding);

            groupResults.push({
                sub_group_id: subGroup.id,
                group_name: subGroup.group_name,
                evaluator_count: groupEvals.length,
                mode_score: totalScore,
                detailed_scores: modeDetails,
                all_scores: groupEvals.map(r => r.total_score),
                evaluators: groupEvals.map(r => r.evaluator_id)
            });
        }

        if (groupResults.length === 0) return null;

        // ----- รวม Mode ข้ามชุด -----
        const finalModeDetails = {};

        const allModesP1S1 = groupResults
            .map(g => g.detailed_scores?.p1_s1)
            .filter(v => v !== undefined && v !== null);
        if (allModesP1S1.length > 0) {
            const mode = findMode(allModesP1S1);
            if (mode !== null) finalModeDetails.p1_s1 = mode;
        }

        const p1s2ModesByItem = [[], [], []];
        groupResults.forEach(g => {
            const arr = g.detailed_scores?.p1_s2;
            if (Array.isArray(arr) && arr.length === 3) {
                arr.forEach((val, idx) => {
                    if (typeof val === 'number' && !isNaN(val)) p1s2ModesByItem[idx].push(val);
                });
            }
        });
        const finalP1S2Modes = p1s2ModesByItem.map(scores =>
            scores.length === 0 ? null : findMode(scores)
        );
        if (finalP1S2Modes.some(m => m !== null)) finalModeDetails.p1_s2 = finalP1S2Modes;

        const allModesP2 = groupResults
            .map(g => g.detailed_scores?.p2)
            .filter(v => v !== undefined && v !== null);
        if (allModesP2.length > 0) {
            const mode = findMode(allModesP2);
            if (mode !== null) finalModeDetails.p2 = mode;
        }

        const allModesP3 = groupResults
            .map(g => g.detailed_scores?.p3)
            .filter(v => v !== undefined && v !== null);
        if (allModesP3.length > 0) {
            const mode = findMode(allModesP3);
            if (mode !== null) finalModeDetails.p3 = mode;
        }

        const finalTotal = calculateTotalScoreFromModeDetails(finalModeDetails, academicStanding);

        return {
            total_evaluators: allEvalsCount,
            committee_groups: groupResults.length,
            final_score: finalTotal,
            group_averages: groupResults.map(g => ({
                group_name: g.group_name,
                mode_score: g.mode_score,
                evaluator_count: g.evaluator_count,
                detailed_scores: g.detailed_scores
            })),
            detailed_scores: finalModeDetails,
            status: 'finalized'
        };

    } catch (err) {
        console.error('Error calculating final average (Mode):', err);
        return null;
    }
}

// ==========================================
// ✅ [OPTIMIZED] บันทึกคะแนนสรุป final (พร้อม options)
// @param {object} options
//   - context        : preloaded data จาก buildEvaluationContext
//   - skipValidation : ข้ามการ validate (กรณี validate แล้วจากภายนอก)
//   - silent         : ไม่แสดง Swal loading/success (ใช้ใน bulk)
//   - precomputedResult : ผลจาก calculateFinalAverageScore ที่คำนวณไว้แล้ว
// ==========================================
async function saveFinalScore(evaluateeId, evalRoundId, options = {}) {
    const {
        context = null,
        skipValidation = false,
        silent = false,
        precomputedResult = null
    } = options;

    // ---- 1. ตรวจสอบความสมบูรณ์ ----
    if (!skipValidation) {
        const validation = await validateEvaluationCompleteness(evalRoundId, evaluateeId, context);
        if (!validation.valid) {
            if (!silent) {
                const errorHtml = validation.errors.map(e => `• ${e}`).join('<br>');
                await Swal.fire({
                    icon: 'error',
                    title: '❌ ไม่สามารถสรุปผลได้',
                    html: `
                        <div class="text-left">
                            <p class="font-bold text-red-600">พบปัญหาความไม่สมบูรณ์:</p>
                            <div class="text-sm text-red-500 mt-2 max-h-60 overflow-y-auto">${errorHtml}</div>
                            <p class="text-sm text-gray-500 mt-3">⚠️ กรุณาให้กรรมการประเมินให้ครบถ้วนก่อนสรุปผล</p>
                        </div>
                    `,
                    confirmButtonText: 'ตกลง',
                    width: '650px'
                });
            }
            return { success: false, reason: 'validation_failed', errors: validation.errors };
        }
    }

    if (!silent) {
        Swal.fire({
            title: 'กำลังคำนวณคะแนนสรุป (โหมดคะแนน)...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });
    }

    try {
        // ---- 2. คำนวณคะแนน (ถ้าไม่มี precomputed) ----
        const finalResult = precomputedResult
            || await calculateFinalAverageScore(evaluateeId, evalRoundId, context);

        if (!finalResult) {
            if (!silent) {
                Swal.close();
                return Swal.fire('แจ้งเตือน', 'ยังไม่มีข้อมูลการประเมินจากกรรมการ', 'warning');
            }
            return { success: false, reason: 'no_data' };
        }

        if (finalResult.committee_groups === 0) {
            if (!silent) {
                Swal.close();
                return Swal.fire('แจ้งเตือน', 'ไม่พบข้อมูลการประเมินจากกรรมการในชุดใดเลย', 'warning');
            }
            return { success: false, reason: 'no_groups' };
        }

        // ---- 3. บันทึก ----
        const payload = {
            evaluatee_id: evaluateeId,
            eval_round_id: evalRoundId,
            evaluator_count: finalResult.total_evaluators,
            committee_group_count: finalResult.committee_groups,
            average_score: finalResult.final_score,
            detailed_scores: finalResult.detailed_scores,
            all_committee_scores: finalResult.group_averages.map(g => ({
                group_name: g.group_name,
                mode_score: g.mode_score,
                evaluator_count: g.evaluator_count,
                detailed_scores: g.detailed_scores
            })),
            status: 'finalized',
            updated_at: new Date().toISOString()
        };

        const { data: existing, error: checkError } = await db
            .from('eval_final_results')
            .select('id')
            .eq('evaluatee_id', evaluateeId)
            .eq('eval_round_id', evalRoundId)
            .maybeSingle();

        if (checkError) throw checkError;

        let result;
        if (existing) {
            const { data, error } = await db
                .from('eval_final_results')
                .update(payload)
                .eq('id', existing.id)
                .select();
            if (error) throw error;
            result = data;
        } else {
            const { data, error } = await db
                .from('eval_final_results')
                .insert([payload])
                .select();
            if (error) throw error;
            result = data;
        }

        // ---- 4. แสดงผลสำเร็จ (ถ้าไม่ silent) ----
        if (!silent) {
            Swal.close();

            const levelText = getLevelText(finalResult.final_score);
            let groupDetailsHtml = '';
            finalResult.group_averages.forEach(g => {
                groupDetailsHtml += `
                    <div class="flex justify-between items-center text-sm border-b border-gray-100 py-2">
                        <span class="text-gray-600">${g.group_name}</span>
                        <span class="font-bold text-blue-600">${g.mode_score.toFixed(2)}</span>
                        <span class="text-xs text-gray-400">(${g.evaluator_count} ท่าน)</span>
                    </div>
                `;
            });

            let detailScoresHtml = '';
            if (finalResult.detailed_scores) {
                const d = finalResult.detailed_scores;
                if (d.p1_s1 !== undefined)
                    detailScoresHtml += `<div class="flex justify-between text-sm"><span>องค์ประกอบที่ 1 (ตอนที่ 1):</span><span class="font-bold">${d.p1_s1}</span></div>`;
                if (d.p1_s2 && Array.isArray(d.p1_s2))
                    detailScoresHtml += `<div class="flex justify-between text-sm"><span>องค์ประกอบที่ 1 (ตอนที่ 2):</span><span class="font-bold">[${d.p1_s2.map(v => v ?? '-').join(', ')}]</span></div>`;
                if (d.p2 !== undefined)
                    detailScoresHtml += `<div class="flex justify-between text-sm"><span>องค์ประกอบที่ 2:</span><span class="font-bold">${d.p2}</span></div>`;
                if (d.p3 !== undefined)
                    detailScoresHtml += `<div class="flex justify-between text-sm"><span>องค์ประกอบที่ 3:</span><span class="font-bold">${d.p3}</span></div>`;
            }

            await Swal.fire({
                icon: 'success',
                title: '✅ บันทึกผลสรุปสำเร็จ!',
                html: `
                    <div class="text-left space-y-3">
                        <div class="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-200">
                            <p class="text-sm text-gray-500">คะแนนสรุป (โหมดคะแนน)</p>
                            <p class="text-3xl font-bold text-blue-600">${finalResult.final_score.toFixed(2)}</p>
                            <p class="text-sm mt-1">
                                <span class="px-2 py-1 rounded-full text-xs font-bold ${levelText.color}">
                                    ${levelText.text}
                                </span>
                            </p>
                        </div>
                        <div class="bg-gray-50 p-4 rounded-xl border border-gray-200">
                            <p class="text-sm font-medium text-gray-600 mb-2">📊 รายละเอียดแต่ละชุด:</p>
                            ${groupDetailsHtml}
                        </div>
                        <div class="bg-gray-50 p-4 rounded-xl border border-gray-200">
                            <p class="text-sm font-medium text-gray-600 mb-2">📋 คะแนน Mode แต่ละองค์ประกอบ:</p>
                            ${detailScoresHtml || '<p class="text-xs text-gray-400">ไม่มีข้อมูล</p>'}
                        </div>
                        <div class="flex justify-between text-xs text-gray-400 border-t border-gray-100 pt-2">
                            <span>👥 กรรมการทั้งหมด: ${finalResult.total_evaluators} ท่าน</span>
                            <span>📦 จำนวนชุด: ${finalResult.committee_groups} ชุด</span>
                        </div>
                    </div>
                `,
                confirmButtonText: '✅ ตกลง',
                confirmButtonColor: '#3b82f6',
                width: '600px'
            });
        }

        return { success: true, result, finalResult };

    } catch (err) {
        console.error('Error saving final score:', err);
        if (!silent) {
            Swal.close();
            let errorMessage = err.message || 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';
            if (errorMessage.includes('duplicate key')) {
                errorMessage = 'พบข้อมูลซ้ำ กรุณาลองใหม่อีกครั้ง';
            }
            await Swal.fire({
                icon: 'error',
                title: '❌ ผิดพลาด',
                text: errorMessage,
                confirmButtonText: 'ตกลง'
            });
        }
        return { success: false, reason: 'error', error: err };
    }
}

// ==========================================
// แสดงผลสรุปคะแนนของผู้ถูกประเมิน
// ==========================================
async function displayFinalScoreSummary(evaluateeId, evalRoundId) {
    try {
        const { data: finalResult, error } = await db
            .from('eval_final_results')
            .select('*')
            .eq('evaluatee_id', evaluateeId)
            .eq('eval_round_id', evalRoundId)
            .maybeSingle();

        if (error) throw error;

        if (!finalResult) {
            return {
                html: `
                    <div class="text-center py-4 text-gray-400">
                        <i class="fa-solid fa-clock text-2xl mb-2"></i>
                        <p>ยังไม่มีการสรุปผล</p>
                        <button onclick="saveFinalScore('${evaluateeId}', '${evalRoundId}')"
                                class="mt-3 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors">
                            <i class="fa-solid fa-calculator mr-1"></i> สรุปผล
                        </button>
                    </div>
                `,
                data: null
            };
        }

        const levelText = (score) => {
            if (score >= 90) return { text: 'ดีเด่น', color: 'emerald' };
            if (score >= 80) return { text: 'ดีมาก', color: 'green' };
            if (score >= 70) return { text: 'ดี', color: 'blue' };
            if (score >= 60) return { text: 'พอใช้', color: 'yellow' };
            return { text: 'ปรับปรุง', color: 'red' };
        };

        const level = levelText(finalResult.average_score);

        let groupDetailsHtml = '';
        if (finalResult.all_committee_scores) {
            finalResult.all_committee_scores.forEach(g => {
                groupDetailsHtml += `
                    <div class="flex justify-between items-center text-sm border-b border-gray-100 py-2">
                        <span class="text-gray-600">${g.group_name}</span>
                        <span class="font-bold">${g.mode_score.toFixed(2)}</span>
                    </div>
                `;
            });
        }

        return {
            html: `
                <div class="bg-white rounded-xl border border-gray-200 p-4">
                    <div class="flex justify-between items-center mb-3">
                        <h4 class="font-bold text-gray-700">📊 ผลสรุปการประเมิน</h4>
                        <span class="text-xs text-gray-400">${finalResult.committee_group_count} ชุด · ${finalResult.evaluator_count} ท่าน</span>
                    </div>

                    <div class="grid grid-cols-3 gap-3 mb-4">
                        <div class="bg-${level.color}-50 p-3 rounded-lg text-center">
                            <p class="text-xs text-gray-500">คะแนนเฉลี่ย</p>
                            <p class="text-2xl font-bold text-${level.color}-600">${finalResult.average_score.toFixed(2)}</p>
                        </div>
                        <div class="bg-${level.color}-50 p-3 rounded-lg text-center">
                            <p class="text-xs text-gray-500">ระดับคุณภาพ</p>
                            <p class="text-xl font-bold text-${level.color}-600">${level.text}</p>
                        </div>
                        <div class="bg-${level.color}-50 p-3 rounded-lg text-center">
                            <p class="text-xs text-gray-500">จำนวนชุด</p>
                            <p class="text-2xl font-bold text-${level.color}-600">${finalResult.committee_group_count}</p>
                        </div>
                    </div>

                    <div class="bg-gray-50 rounded-lg p-3">
                        <p class="text-sm font-medium text-gray-600 mb-2">คะแนนแยกตามชุด:</p>
                        ${groupDetailsHtml}
                    </div>

                    <button onclick="saveFinalScore('${evaluateeId}', '${evalRoundId}')"
                            class="mt-4 w-full bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors">
                        <i class="fa-solid fa-rotate mr-1"></i> คำนวณใหม่
                    </button>
                </div>
            `,
            data: finalResult
        };

    } catch (err) {
        console.error('Error displaying final summary:', err);
        return {
            html: `<p class="text-red-400">ไม่สามารถโหลดข้อมูลสรุปได้</p>`,
            data: null
        };
    }
}

// ==========================================
// ✅ [OPTIMIZED] สรุปผลคะแนนทั้งหมด
// ใช้ buildEvaluationContext โหลดครั้งเดียว + คำนวณใน memory
// ==========================================
async function generateAllFinalScores(evalRoundId) {
    if (!evalRoundId) {
        return Swal.fire('แจ้งเตือน', 'ไม่พบรอบการประเมิน', 'warning');
    }

    const tStart = performance.now();

    Swal.fire({
        title: 'กำลังเตรียมข้อมูล...',
        html: 'กำลังโหลดข้อมูลการประเมินทั้งหมด',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        // ==========================================
        // ✅ STEP 1: โหลดข้อมูลทั้งหมดครั้งเดียว
        // ==========================================
        const context = await buildEvaluationContext(evalRoundId);

        const uniqueEvaluatees = [...new Set(context.allEvals.map(e => e.evaluatee_id))];

        if (uniqueEvaluatees.length === 0) {
            Swal.close();
            return Swal.fire('แจ้งเตือน', 'ไม่มีข้อมูลการประเมินในรอบนี้', 'warning');
        }

        // ==========================================
        // ✅ STEP 2: ประมวลผลใน memory (ไม่มี query ในลูป!)
        // ==========================================
        let successCount = 0;
        let failCount = 0;
        let skippedCount = 0;
        const successList = [];
        const failedList = [];
        const skippedList = [];

        for (let i = 0; i < uniqueEvaluatees.length; i++) {
            const evaluateeId = uniqueEvaluatees[i];

            // อัปเดต progress ทุก 5 คน + yield ให้ browser render
            if (i % 5 === 0) {
                Swal.update({
                    title: 'กำลังสรุปผล...',
                    html: `ประมวลผล <b>${i + 1}/${uniqueEvaluatees.length}</b>`
                });
                await new Promise(r => setTimeout(r, 0));
            }

            const teacher = context.personnelById.get(evaluateeId);
            const name = teacher
                ? `${teacher.first_name} ${teacher.last_name}`
                : evaluateeId;

            // ---- Validate (ใช้ context, ไม่ query) ----
            const validation = await validateEvaluationCompleteness(evalRoundId, evaluateeId, context);

            if (!validation.valid) {
                const errorSummary = validation.errors.slice(0, 3).join('; ');
                const more = validation.errors.length > 3
                    ? ` และอีก ${validation.errors.length - 3} รายการ`
                    : '';
                skippedList.push(`${name} (${errorSummary}${more})`);
                skippedCount++;
                continue;
            }

            // ---- Save (ใช้ context, ไม่ query) ----
            const saveResult = await saveFinalScore(evaluateeId, evalRoundId, {
                context,
                skipValidation: true,   // validate ไปแล้ว
                silent: true            // ไม่ต้องเด้ง Swal
            });

            if (saveResult.success) {
                successCount++;
                successList.push(name);
            } else {
                failCount++;
                failedList.push(`${name} (${saveResult.reason || 'unknown'})`);
            }
        }

        const elapsed = (performance.now() - tStart).toFixed(0);
        console.log(`⚡ generateAllFinalScores: ${elapsed}ms | success=${successCount}, skipped=${skippedCount}, fail=${failCount}`);

        Swal.close();

        // ==========================================
        // ✅ STEP 3: แสดงผลลัพธ์
        // ==========================================
        let message = `
            <div class="text-left space-y-3">
                <div class="grid grid-cols-3 gap-3">
                    <div class="bg-green-50 p-3 rounded-lg text-center border border-green-200">
                        <p class="text-xs text-gray-500">✅ สำเร็จ</p>
                        <p class="text-2xl font-bold text-green-600">${successCount}</p>
                    </div>
                    <div class="bg-red-50 p-3 rounded-lg text-center border border-red-200">
                        <p class="text-xs text-gray-500">❌ ล้มเหลว</p>
                        <p class="text-2xl font-bold text-red-600">${failCount}</p>
                    </div>
                    <div class="bg-yellow-50 p-3 rounded-lg text-center border border-yellow-200">
                        <p class="text-xs text-gray-500">⏭️ ข้าม (ไม่สมบูรณ์)</p>
                        <p class="text-2xl font-bold text-yellow-600">${skippedCount}</p>
                    </div>
                </div>
                <p class="text-xs text-gray-400 text-center">⏱️ ใช้เวลา ${elapsed} มิลลิวินาที</p>
        `;

        if (skippedList.length > 0) {
            message += `
                <div class="mt-3 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                    <p class="text-sm font-bold text-yellow-700">⏭️ รายชื่อที่ถูกข้าม (ไม่สมบูรณ์):</p>
                    <div class="text-xs text-yellow-600 max-h-40 overflow-y-auto mt-1">${skippedList.join('<br>')}</div>
                    <p class="text-xs text-gray-400 mt-1">💡 กรุณาให้กรรมการประเมินให้ครบถ้วนแล้วลองใหม่</p>
                </div>
            `;
        }

        if (failedList.length > 0) {
            message += `
                <div class="mt-3 p-3 bg-red-50 rounded-lg border border-red-200">
                    <p class="text-sm font-bold text-red-700">❌ รายชื่อที่ล้มเหลว:</p>
                    <div class="text-xs text-red-600 max-h-40 overflow-y-auto mt-1">${failedList.join('<br>')}</div>
                </div>
            `;
        }

        if (successList.length > 0) {
            message += `
                <div class="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
                    <p class="text-sm font-bold text-green-700">✅ รายชื่อที่สรุปสำเร็จ:</p>
                    <div class="text-xs text-green-600 max-h-40 overflow-y-auto mt-1">${successList.join(', ')}</div>
                </div>
            `;
        }

        message += `</div>`;

        await Swal.fire({
            icon: successCount > 0 ? 'success' : (skippedCount > 0 ? 'warning' : 'error'),
            title: successCount > 0 ? '✅ สรุปผลเสร็จสิ้น' : '⚠️ สรุปผลบางส่วน',
            html: message,
            confirmButtonText: 'ตกลง',
            width: '700px'
        });

        await loadResultsTable();

    } catch (err) {
        console.error('Error generating all final scores:', err);
        Swal.close();
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// เปิด Modal แสดงรายละเอียด
// ==========================================
async function openEvalDetailModal(evaluateeId, evalRoundId) {
    try {
        const modal = document.getElementById('evalDetailModal');
        modal.classList.remove('hidden');

        const { data: user } = await db
            .from('core_personnel')
            .select('*')
            .eq('id', evaluateeId)
            .single();

        if (user) {
            document.getElementById('evalDetailUserInitial').innerText = user.first_name?.charAt(0) || '-';
            document.getElementById('evalDetailUserName').innerText = `${user.first_name} ${user.last_name}`;
            document.getElementById('evalDetailUserStanding').innerText = user.academic_standing || 'ไม่มีวิทยฐานะ';
        }

        const result = await displayFinalScoreSummary(evaluateeId, evalRoundId);
        document.getElementById('evalDetailFinalScore').innerHTML = result.html;

        window._modalEvaluateeId = evaluateeId;
        window._modalEvalRoundId = evalRoundId;

    } catch (err) {
        console.error('Error opening modal:', err);
        document.getElementById('evalDetailFinalScore').innerHTML =
            '<p class="text-red-400">เกิดข้อผิดพลาดในการโหลดข้อมูล</p>';
    }
}

// ==========================================
// 🔍 เปิด Modal แสดงรายละเอียดการประเมินตนเอง (แก้ไขแล้ว)
// ==========================================
// ==========================================
// 🔍 เปิด Modal แสดงรายละเอียดการประเมินตนเอง (แก้ไขแล้ว)
// ==========================================
async function openSelfEvalDetailModal() {
    try {
        if (!currentUser) {
            return Swal.fire('แจ้งเตือน', 'ไม่พบข้อมูลผู้ใช้', 'warning');
        }
        if (!currentEvalRound?.id) {
            return Swal.fire('แจ้งเตือน', 'ไม่พบรอบการประเมิน', 'warning');
        }

        const { data: evalResult, error } = await db
            .from('eval_results')
            .select('*')
            .eq('evaluatee_id', currentUser.id)
            .eq('eval_round_id', currentEvalRound.id)
            .eq('eval_type', 'self')
            .eq('status', 'submitted')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) throw error;
        if (!evalResult) {
            return Swal.fire('แจ้งเตือน', 'ยังไม่มีการประเมินตนเอง', 'warning');
        }

        const modal = document.getElementById('evalDetailModal');
        modal.classList.remove('hidden');

        document.getElementById('evalDetailUserInitial').innerText = currentUser.first_name?.charAt(0) || '-';
        document.getElementById('evalDetailUserName').innerText = `${currentUser.first_name} ${currentUser.last_name}`;
        document.getElementById('evalDetailUserStanding').innerText = currentUser.academic_standing || 'ไม่มีวิทยฐานะ';

        const details = evalResult.detailed_scores || {};
        const academicLevel = currentUser.academic_standing || 'ครู';

        // ✅ ใช้ Helper Functions
        const criteria = getCriteriaByAcademic(academicLevel);
        const isAssistant = isAssistantTeacher(academicLevel);

        // ==========================================
        // ✅ ฟังก์ชันช่วยแปลงระดับเป็นคะแนน (ตอนที่ 2)
        // ==========================================
        function getP1S2Score(level, maxScore) {
            if (!level || level === '') return 0;
            const lv = parseFloat(level);
            if (isNaN(lv) || lv < 1 || lv > 4) return 0;
            return (lv / 4) * maxScore;
        }

        // ==========================================
        // ✅ คำนวณองค์ประกอบที่ 1 ตอนที่ 1
        // ==========================================
        const p1s1 = details.p1_s1 || [];
        const p1s1RawSum = p1s1.reduce((a, b) => a + b, 0);
        let p1s1Total = 0;
        if (isAssistant) {
            p1s1Total = (p1s1RawSum * 80) / 56;
        } else {
            p1s1Total = (p1s1RawSum / 60) * 60;
        }

        // ==========================================
        // ✅ คำนวณองค์ประกอบที่ 1 ตอนที่ 2 (แก้ไขแล้ว)
        // ==========================================
        const p1s2 = details.p1_s2 || [];

        // ข้อ 1: วิธีดำเนินการ (เต็ม 20)
        const p1s2_1_level = (p1s2.length > 0) ? p1s2[0] : 0;
        const p1s2_1_score = getP1S2Score(p1s2_1_level, 20);

        // ข้อ 2.1: เชิงปริมาณ (เต็ม 10)
        const p1s2_2_1_level = (p1s2.length > 1) ? p1s2[1] : 0;
        const p1s2_2_1_score = getP1S2Score(p1s2_2_1_level, 10);

        // ข้อ 2.2: เชิงคุณภาพ (เต็ม 10)
        const p1s2_2_2_level = (p1s2.length > 2) ? p1s2[2] : 0;
        const p1s2_2_2_score = getP1S2Score(p1s2_2_2_level, 10);

        // ✅ คะแนนรวมตอนที่ 2 (เต็ม 20) - ต้องหาร 2 !!!
        const p1s2Total = (p1s2_1_score + p1s2_2_1_score + p1s2_2_2_score) / 2;

        // ==========================================
        // ✅ คำนวณองค์ประกอบที่ 1 รวม (80 คะแนน)
        // ==========================================
        const p1Total = p1s1Total + p1s2Total;

        // ==========================================
        // ✅ คำนวณองค์ประกอบที่ 2 (10 คะแนน)
        // ==========================================
        const p2Level = details.p2 || 0;
        const p2Score = p2Level * 2;

        // ==========================================
        // ✅ คำนวณองค์ประกอบที่ 3 (10 คะแนน)
        // ==========================================
        const p3 = details.p3 || [];
        const p3RawSum = p3.reduce((a, b) => a + b, 0);
        const p3Total = p3RawSum / 4;

        // ==========================================
        // ✅ คะแนนรวมทั้งหมด (100 คะแนน)
        // ==========================================
        const totalScore = p1Total + p2Score + p3Total;
        const level = getLevelText(totalScore);

        // ==========================================
        // ✅ สร้าง HTML สำหรับ Modal
        // ==========================================
        let detailHtml = `
            <div class="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-200 mb-4">
                <div class="flex justify-between items-center">
                    <div>
                        <p class="text-sm text-gray-500">คะแนนรวม</p>
                        <p class="text-3xl font-bold text-blue-600">${totalScore.toFixed(2)}</p>
                        <p class="text-sm text-gray-500">/ 100</p>
                    </div>
                    <div class="text-right">
                        <p class="text-sm text-gray-500">สถานะ</p>
                        <span class="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-bold">✅ ส่งแล้ว</span>
                        <p class="text-xs text-gray-400 mt-1">${new Date(evalResult.updated_at).toLocaleString('th-TH')}</p>
                    </div>
                </div>
            </div>

            <!-- 📊 สรุปคะแนนแยกองค์ประกอบ -->
            <div class="grid grid-cols-3 gap-3 mb-4">
                <div class="bg-blue-50 p-3 rounded-xl text-center border border-blue-200">
                    <p class="text-xs text-gray-500">องค์ประกอบที่ 1</p>
                    <p class="text-xl font-bold text-blue-600">${p1Total.toFixed(2)}</p>
                    <p class="text-[10px] text-gray-400">/ 80</p>
                </div>
                <div class="bg-emerald-50 p-3 rounded-xl text-center border border-emerald-200">
                    <p class="text-xs text-gray-500">องค์ประกอบที่ 2</p>
                    <p class="text-xl font-bold text-emerald-600">${p2Score.toFixed(2)}</p>
                    <p class="text-[10px] text-gray-400">/ 10</p>
                </div>
                <div class="bg-purple-50 p-3 rounded-xl text-center border border-purple-200">
                    <p class="text-xs text-gray-500">องค์ประกอบที่ 3</p>
                    <p class="text-xl font-bold text-purple-600">${p3Total.toFixed(2)}</p>
                    <p class="text-[10px] text-gray-400">/ 10</p>
                </div>
            </div>

            <!-- 📋 องค์ประกอบที่ 1 ตอนที่ 1 -->
            <div class="mb-4 bg-blue-50/50 border border-blue-100 rounded-xl p-4">
                <div class="flex justify-between items-center mb-2">
                    <h4 class="font-bold text-blue-800">🎯 องค์ประกอบที่ 1 ตอนที่ 1</h4>
                    <span class="text-sm font-bold text-blue-600">${p1s1Total.toFixed(2)} / ${isAssistant ? '80' : '60'}</span>
                </div>
        `;

        const p1s1Groups = criteria.part1_sec1 || [];
        let p1s1Index = 0;
        p1s1Groups.forEach((group) => {
            detailHtml += `
                <div class="mb-2">
                    <p class="text-xs font-semibold text-gray-600 mb-1">${group.group}</p>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-1">
            `;
            group.items.forEach((item) => {
                const score = (p1s1Index < p1s1.length) ? p1s1[p1s1Index] : '-';
                detailHtml += `
                    <div class="flex justify-between items-center bg-white p-1.5 px-3 rounded-lg border border-gray-100 text-sm">
                        <span class="text-gray-600 text-xs">${item.label}</span>
                        <span class="font-bold ${score !== '-' && score >= 3 ? 'text-emerald-600' : score !== '-' && score >= 2 ? 'text-amber-600' : 'text-gray-400'}">
                            ${score !== '-' ? score : '-'}
                        </span>
                    </div>
                `;
                p1s1Index++;
            });
            detailHtml += `</div></div>`;
        });

        // 📋 องค์ประกอบที่ 1 ตอนที่ 2
        detailHtml += `
                <div class="mt-3 bg-indigo-50/50 border border-indigo-100 rounded-xl p-4">
                    <div class="flex justify-between items-center mb-2">
                        <h4 class="font-bold text-indigo-800">🎯 องค์ประกอบที่ 1 ตอนที่ 2</h4>
                        <span class="text-sm font-bold text-indigo-600">${p1s2Total.toFixed(2)} / 20</span>
                    </div>
                    <div class="grid grid-cols-1 gap-1">
        `;

        const p1s2Labels = [
            { label: '1. วิธีการดำเนินการ', level: p1s2_1_level, score: p1s2_1_score, max: 20 },
            { label: '2.1 ผลลัพธ์เชิงปริมาณ', level: p1s2_2_1_level, score: p1s2_2_1_score, max: 10 },
            { label: '2.2 ผลลัพธ์เชิงคุณภาพ', level: p1s2_2_2_level, score: p1s2_2_2_score, max: 10 }
        ];

        p1s2Labels.forEach((item) => {
            detailHtml += `
                <div class="flex justify-between items-center bg-white p-2 rounded-lg border border-gray-100 text-sm">
                    <span class="text-gray-600">${item.label}</span>
                    <span>
                        <span class="font-bold ${item.level >= 3 ? 'text-emerald-600' : item.level >= 2 ? 'text-amber-600' : 'text-gray-400'}">
                            ${item.level > 0 ? `ระดับ ${item.level}` : '-'}
                        </span>
                        <span class="text-xs text-gray-400 ml-2">(${item.score.toFixed(1)}/${item.max})</span>
                    </span>
                </div>
            `;
        });

        detailHtml += `</div></div></div>`;

        // 📋 องค์ประกอบที่ 2
        detailHtml += `
            <div class="mb-4 bg-emerald-50/50 border border-emerald-100 rounded-xl p-4">
                <div class="flex justify-between items-center mb-2">
                    <h4 class="font-bold text-emerald-800">🤝 องค์ประกอบที่ 2</h4>
                    <span class="text-sm font-bold text-emerald-600">${p2Score.toFixed(2)} / 10</span>
                </div>
                <div class="flex justify-between items-center bg-white p-2 rounded-lg border border-gray-100 text-sm">
                    <span class="text-gray-600">ความสำเร็จของงานที่ได้รับมอบหมายจากผู้บังคับบัญชา</span>
                    <span>
                        <span class="font-bold ${p2Level >= 4 ? 'text-emerald-600' : p2Level >= 3 ? 'text-amber-600' : 'text-gray-400'}">
                            ${p2Level > 0 ? `ระดับ ${p2Level}` : '-'}
                        </span>
                        <span class="text-xs text-gray-400 ml-2">(${p2Score.toFixed(2)} คะแนน)</span>
                    </span>
                </div>
            </div>
        `;

        // 📋 องค์ประกอบที่ 3
        detailHtml += `
            <div class="mb-4 bg-purple-50/50 border border-purple-100 rounded-xl p-4">
                <div class="flex justify-between items-center mb-2">
                    <h4 class="font-bold text-purple-800">⚖️ องค์ประกอบที่ 3</h4>
                    <span class="text-sm font-bold text-purple-600">${p3Total.toFixed(2)} / 10</span>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-1">
        `;
        PART3_ITEMS.forEach((text, idx) => {
            const score = (idx < p3.length) ? p3[idx] : '-';
            detailHtml += `
                <div class="flex justify-between items-center bg-white p-1.5 px-3 rounded-lg border border-gray-100 text-sm">
                    <span class="text-gray-600 text-xs">${idx + 1}. ${text.substring(0, 35)}${text.length > 35 ? '...' : ''}</span>
                    <span class="font-bold ${score !== '-' && score >= 3 ? 'text-emerald-600' : score !== '-' && score >= 2 ? 'text-amber-600' : 'text-gray-400'}">
                        ${score !== '-' ? score : '-'}
                    </span>
                </div>
            `;
        });
        detailHtml += `</div></div>`;

        // 📊 สรุปผลรวม
        detailHtml += `
            <div class="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 rounded-xl text-white mt-2">
                <div class="flex justify-between items-center">
                    <div>
                        <p class="text-sm opacity-80">คะแนนรวมทั้งหมด</p>
                        <p class="text-3xl font-bold">${totalScore.toFixed(2)}</p>
                        <p class="text-sm opacity-80">/ 100</p>
                    </div>
                    <div class="text-right">
                        <p class="text-sm opacity-80">ระดับคุณภาพ</p>
                        <p class="text-2xl font-bold">${level.text}</p>
                    </div>
                    <div class="text-5xl opacity-50">${level.text === 'ดีเด่น' ? '🏆' : level.text === 'ดีมาก' ? '🌟' : level.text === 'ดี' ? '⭐' : level.text === 'พอใช้' ? '📊' : '📈'}</div>
                </div>
            </div>
        `;

        document.getElementById('evalDetailFinalScore').innerHTML = detailHtml;

        // ✅ เก็บค่าไว้ใช้ในปุ่มคำนวณใหม่
        window._modalEvaluateeId = currentUser.id;
        window._modalEvalRoundId = currentEvalRound.id;

    } catch (err) {
        console.error('Error opening self eval detail:', err);
        document.getElementById('evalDetailFinalScore').innerHTML =
            '<p class="text-red-400">เกิดข้อผิดพลาดในการโหลดข้อมูล</p>';
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}


// ==========================================
// ปิด Modal
// ==========================================
function closeEvalDetailModal() {
    document.getElementById('evalDetailModal').classList.add('hidden');
}

// ==========================================
// บันทึกคะแนนจาก Modal
// ==========================================
async function saveFinalScoreFromModal() {
    const evaluateeId = window._modalEvaluateeId;
    const evalRoundId = window._modalEvalRoundId;
    if (evaluateeId && evalRoundId) {
        const result = await saveFinalScore(evaluateeId, evalRoundId);
        // ✅ อัปเดต: เช็ค .success ก่อนเปิด modal ใหม่
        if (result?.success) {
            await openEvalDetailModal(evaluateeId, evalRoundId);
        }
    }
}

// ==========================================
// พิมพ์ผลสรุป
// ==========================================
function printFinalScore() {
    window.print();
}

// ==========================================
// ส่งออก Excel
// ==========================================
async function exportFinalScores() {
    try {
        const { data: results, error } = await db
            .from('eval_final_results')
            .select('*, core_personnel(first_name, last_name, academic_standing)')
            .eq('eval_round_id', currentEvalRound?.id)
            .eq('status', 'finalized');

        if (error) throw error;

        if (!results || results.length === 0) {
            return Swal.fire('แจ้งเตือน', 'ไม่พบข้อมูลที่สรุปผลแล้ว', 'warning');
        }

        const excelData = results.map(r => ({
            'ชื่อ-สกุล': `${r.core_personnel?.first_name || ''} ${r.core_personnel?.last_name || ''}`,
            'วิทยฐานะ': r.core_personnel?.academic_standing || '-',
            'คะแนนเฉลี่ย': r.average_score?.toFixed(2) || '0.00',
            'จำนวนกรรมการ': r.evaluator_count || 0,
            'จำนวนชุด': r.committee_group_count || 0,
            'ระดับคุณภาพ': getLevelText(r.average_score).text, // ✅ แก้ไข: เดิมไม่ได้เรียก .text ทำให้ Excel แสดง [object Object]
            'สถานะ': r.status === 'finalized' ? '✅ สรุปแล้ว' : '⏳ รอสรุป'
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(excelData);
        XLSX.utils.book_append_sheet(wb, ws, 'ผลสรุปการประเมิน');
        XLSX.writeFile(wb, `ผลสรุปการประเมิน_${new Date().toLocaleDateString('th-TH')}.xlsx`);

    } catch (err) {
        console.error('Error exporting:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// ✅ สร้างไฟล์ PDF จากเทมเพลต (ประเมินตนเอง) - แก้ไขการคำนวณตอนที่ 2 และแก้ไขตัวแปรซ้ำ
// ==========================================
// ==========================================
// ✅ สร้างไฟล์ PDF จากเทมเพลต (ประเมินตนเอง) - แก้ไขแล้ว
// ==========================================
async function generateEvaluationPDF() {
    // 1. ตรวจสอบว่าผู้ใช้มีสิทธิ์ (ต้องเป็นครูที่ประเมินตนเองแล้ว)
    if (!currentUser) return Swal.fire('แจ้งเตือน', 'ไม่พบข้อมูลผู้ใช้', 'warning');

    // 2. ตรวจสอบ GAS Config (ดึงจาก system_configs)
    const { data: configData } = await db
        .from('system_configs')
        .select('config')
        .eq('category', 'evaluation')
        .maybeSingle();

    const config = configData?.config || {};
    const gasUrl = config.gas_api_url;
    const pdfFolderId = config.drive_folder_id;

    if (!gasUrl || !pdfFolderId) {
        return Swal.fire('ตั้งค่าไม่สมบูรณ์', 'กรุณาตั้งค่า GAS URL และ PDF Folder ID ในเมนู "ตั้งค่าระบบ" ก่อนพิมพ์ PDF', 'warning');
    }

    // 3. เลือก Slide Template ID ตามวิทยฐานะ (รองรับ 'ไม่มีวิทยฐานะ')
    const academicLevel = currentUser.academic_standing || 'ครู';
    let templateId = '';
    if (academicLevel === 'ครูผู้ช่วย') {
        templateId = config.slide_template_1;
    } else if (academicLevel === 'ครู' || academicLevel === 'ไม่มีวิทยฐานะ') {
        templateId = config.slide_template_2;  // ใช้ template ของครู
    } else if (academicLevel === 'ครูชำนาญการ') {
        templateId = config.slide_template_3;
    } else if (academicLevel === 'ครูชำนาญการพิเศษ') {
        templateId = config.slide_template_4;
    } else {
        templateId = config.slide_template_2; // fallback
    }

    if (!templateId) {
        return Swal.fire('ผิดพลาด', `ยังไม่ได้ตั้งค่า Slide Template สำหรับวิทยฐานะ "${academicLevel}"`, 'error');
    }

    // 4. ดึงข้อมูลการประเมินตนเองล่าสุดที่ส่งแล้ว
    const { data: evalResult, error: eErr } = await db
        .from('eval_results')
        .select('*')
        .eq('evaluatee_id', currentUser.id)
        .eq('eval_type', 'self')
        .eq('status', 'submitted')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (eErr) throw eErr;
    if (!evalResult) {
        return Swal.fire('แจ้งเตือน', 'ยังไม่มีผลการประเมินตนเอง กรุณาประเมินก่อน', 'warning');
    }

    // 5. ดึงข้อมูลโรงเรียน
    const { data: school } = await db.from('core_school_info').select('*').single();

    // 6. เตรียมข้อมูลแทนที่ (Placeholders)
    const details = evalResult.detailed_scores || {};
    // academicLevel ใช้ตัวแปรเดิม (ไม่ต้องประกาศซ้ำ)

    // ✅ ใช้ Helper Functions
    const criteria = getCriteriaByAcademic(academicLevel);
    const isAssistant = isAssistantTeacher(academicLevel);

    // ----- ฟังก์ชันช่วยแปลง array เป็น object ตาม index -----
    function getScoreByIndex(arr, index, defaultValue = '') {
        if (Array.isArray(arr) && arr.length > index) {
            const val = arr[index];
            return (val !== undefined && val !== null && val !== 0) ? val : '';
        }
        return '';
    }

    // ----- องค์ประกอบที่ 1 ตอนที่ 1 (60 คะแนน) -----
    const p1s1 = details.p1_s1 || [];
    const p1s1Scores = {
        '1_1': getScoreByIndex(p1s1, 0),
        '1_2': getScoreByIndex(p1s1, 1),
        '1_3': getScoreByIndex(p1s1, 2),
        '1_4': getScoreByIndex(p1s1, 3),
        '1_5': getScoreByIndex(p1s1, 4),
        '1_6': getScoreByIndex(p1s1, 5),
        '1_7': getScoreByIndex(p1s1, 6),
        '1_8': isAssistant ? '' : getScoreByIndex(p1s1, 7),
        '2_1': getScoreByIndex(p1s1, isAssistant ? 7 : 8),
        '2_2': getScoreByIndex(p1s1, isAssistant ? 8 : 9),
        '2_3': getScoreByIndex(p1s1, isAssistant ? 9 : 10),
        '2_4': getScoreByIndex(p1s1, isAssistant ? 10 : 11),
        '3_1': getScoreByIndex(p1s1, isAssistant ? 11 : 12),
        '3_2': getScoreByIndex(p1s1, isAssistant ? 12 : 13),
        '3_3': getScoreByIndex(p1s1, isAssistant ? 13 : 14),
    };

    const p1s1RawSum = Object.values(p1s1Scores)
        .filter(v => v !== '')
        .reduce((a, b) => a + parseFloat(b || 0), 0);

    let p1s1Total = 0;
    if (isAssistant) {
        p1s1Total = (p1s1RawSum * 60) / 56;
    } else {
        p1s1Total = p1s1RawSum;
    }

    // ==========================================
    // ✅ องค์ประกอบที่ 1 ตอนที่ 2 (20 คะแนน) - แก้ไขแล้ว
    // ==========================================
    const p1s2 = details.p1_s2 || [];
    const p1s2Scores = {
        '1': getScoreByIndex(p1s2, 0),      // วิธีดำเนินการ
        '2_1': getScoreByIndex(p1s2, 1),    // เชิงปริมาณ
        '2_2': getScoreByIndex(p1s2, 2),    // เชิงคุณภาพ
    };

    // ✅ แผนที่แปลงระดับ (1-4) เป็นคะแนนตามเกณฑ์ที่กำหนด
    const p1s2ScoreMap = {
        '1': { '1': 5, '2': 10, '3': 15, '4': 20 },    // วิธีดำเนินการ
        '2_1': { '1': 2.5, '2': 5, '3': 7.5, '4': 10 },  // เชิงปริมาณ
        '2_2': { '1': 2.5, '2': 5, '3': 7.5, '4': 10 }   // เชิงคุณภาพ
    };

    // คำนวณคะแนนดิบรวม (สูงสุด 40)
    let p1s2RawTotal = 0;
    for (const [key, level] of Object.entries(p1s2Scores)) {
        const levelNum = parseInt(level) || 0;
        const score = p1s2ScoreMap[key]?.[levelNum] || 0;
        p1s2RawTotal += score;
    }

    // ✅ แปลงจาก 40 เป็น 20 คะแนน
    const p1s2Total = p1s2RawTotal / 2;

    // ----- รวมองค์ประกอบที่ 1 (80 คะแนน) -----
    const p1Total = p1s1Total + p1s2Total;

    // ----- องค์ประกอบที่ 2 (10 คะแนน) -----
    const p2Level = details.p2 || 0;
    const p2Score = p2Level * 2;

    // ----- องค์ประกอบที่ 3 (10 คะแนน) -----
    const p3 = details.p3 || [];
    const p3Scores = {};
    for (let i = 1; i <= 10; i++) {
        p3Scores[`${i}`] = getScoreByIndex(p3, i - 1);
    }
    const p3RawSum = Object.values(p3Scores)
        .filter(v => v !== '')
        .reduce((a, b) => a + parseFloat(b || 0), 0);
    const p3Total = p3RawSum / 4;

    // ----- คะแนนรวมทั้งหมด -----
    const totalScore = p1Total + p2Score + p3Total;
    const level = getLevelText(totalScore);

    // ----- วันที่ -----
    const thMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    const currentDate = new Date();
    const dateStr = `วันที่ ${currentDate.getDate()} เดือน ${thMonths[currentDate.getMonth()]} พ.ศ. ${currentDate.getFullYear() + 543}`;

    // 7. สร้าง replacements object
    const replacements = {
        // ข้อมูลทั่วไป
        "{{FULL_NAME}}": `${currentUser.prefix || ''}${currentUser.first_name} ${currentUser.last_name}`,
        "{{ACADEMIC_STANDING}}": academicLevel,
        "{{POSITION}}": currentUser.position || 'ครู',
        "{{DEPARTMENT}}": currentUser.department || '-',
        "{{TERM}}": `ภาคเรียนที่ ${currentTermData.current_semester} / ${currentTermData.current_academic_year}`,
        "{{DATE}}": dateStr,

        // องค์ประกอบที่ 1 ตอนที่ 1 (ข้อ 1.1-1.8)
        "{{P1S1_1_1}}": p1s1Scores['1_1'],
        "{{P1S1_1_2}}": p1s1Scores['1_2'],
        "{{P1S1_1_3}}": p1s1Scores['1_3'],
        "{{P1S1_1_4}}": p1s1Scores['1_4'],
        "{{P1S1_1_5}}": p1s1Scores['1_5'],
        "{{P1S1_1_6}}": p1s1Scores['1_6'],
        "{{P1S1_1_7}}": p1s1Scores['1_7'],
        "{{P1S1_1_8}}": p1s1Scores['1_8'],

        // องค์ประกอบที่ 1 ตอนที่ 1 (ข้อ 2.1-2.4)
        "{{P1S1_2_1}}": p1s1Scores['2_1'],
        "{{P1S1_2_2}}": p1s1Scores['2_2'],
        "{{P1S1_2_3}}": p1s1Scores['2_3'],
        "{{P1S1_2_4}}": p1s1Scores['2_4'],

        // องค์ประกอบที่ 1 ตอนที่ 1 (ข้อ 3.1-3.3)
        "{{P1S1_3_1}}": p1s1Scores['3_1'],
        "{{P1S1_3_2}}": p1s1Scores['3_2'],
        "{{P1S1_3_3}}": p1s1Scores['3_3'],

        // คะแนนรวมตอนที่ 1 (เต็ม 60)
        "{{P1S1_TOTAL}}": p1s1Total.toFixed(2),

        // ✅ องค์ประกอบที่ 1 ตอนที่ 2 (ส่งทั้งระดับและคะแนนจริง)
        "{{P1S2_1}}": p1s2Scores['1'],
        "{{P1S2_1_SCORE}}": p1s2ScoreMap['1']?.[parseInt(p1s2Scores['1']) || 0] || 0,
        "{{P1S2_2_1}}": p1s2Scores['2_1'],
        "{{P1S2_2_1_SCORE}}": p1s2ScoreMap['2_1']?.[parseInt(p1s2Scores['2_1']) || 0] || 0,
        "{{P1S2_2_2}}": p1s2Scores['2_2'],
        "{{P1S2_2_2_SCORE}}": p1s2ScoreMap['2_2']?.[parseInt(p1s2Scores['2_2']) || 0] || 0,

        // คะแนนรวมตอนที่ 2 (เต็ม 20)
        "{{P1S2_TOTAL}}": p1s2Total.toFixed(2),

        // คะแนนรวมองค์ประกอบที่ 1 (เต็ม 80)
        "{{P1_TOTAL}}": p1Total.toFixed(2),

        // องค์ประกอบที่ 2
        "{{P2_LEVEL}}": p2Level > 0 ? `ระดับ ${p2Level}` : '-',
        "{{P2_SCORE}}": p2Score.toFixed(2),

        // องค์ประกอบที่ 3 (ข้อ 1-10)
        "{{P3_1}}": p3Scores['1'],
        "{{P3_2}}": p3Scores['2'],
        "{{P3_3}}": p3Scores['3'],
        "{{P3_4}}": p3Scores['4'],
        "{{P3_5}}": p3Scores['5'],
        "{{P3_6}}": p3Scores['6'],
        "{{P3_7}}": p3Scores['7'],
        "{{P3_8}}": p3Scores['8'],
        "{{P3_9}}": p3Scores['9'],
        "{{P3_10}}": p3Scores['10'],
        "{{P3_TOTAL}}": p3Total.toFixed(2),

        // คะแนนรวมและระดับ
        "{{TOTAL_SCORE}}": totalScore.toFixed(2),
        "{{LEVEL}}": level.text,

        // ลายเซ็น
        "{{PERSONNEL_SIGNATURE_IMAGE}}": currentUser.signature_file_id ? `https://drive.google.com/uc?id=${currentUser.signature_file_id}` : ''
    };

    // 8. สร้าง Payload
    const payload = {
        action: 'generate_pdf',
        templateId: templateId,
        pdfFolderId: pdfFolderId,
        fileName: `รายงานผลการประเมิน_${currentUser.first_name}_${currentTermData.current_semester}_${currentTermData.current_academic_year}`,
        replacements
    };

    // 9. แสดง Loading
    Swal.fire({
        title: 'กำลังสร้างไฟล์ PDF...',
        html: 'ระบบกำลังดึงข้อมูลและประมวลผลผ่านระบบส่วนกลาง<br><span class="text-xs text-slate-400">อาจใช้เวลา 5-10 วินาที</span>',
        didOpen: () => Swal.showLoading(),
        allowOutsideClick: false,
        showConfirmButton: false
    });

    // 10. ส่งไปยัง GAS
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        const response = await fetch(gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const rawText = await response.text();
        let result;
        try {
            result = JSON.parse(rawText);
        } catch (e) {
            throw new Error('GAS ตอบกลับไม่ใช่ JSON: ' + rawText.substring(0, 200));
        }

        if (result && result.status === 'success' && result.url) {
            if (currentUser && currentUser.id) {
                localStorage.setItem('pdf_url_' + currentUser.id, result.url);
                const btnPDF = document.getElementById('btnViewPDF');
                if (btnPDF) {
                    btnPDF.classList.remove('hidden');
                    btnPDF.onclick = function () {
                        window.open(result.url, '_blank');
                    };
                }
            }
            Swal.close();
            window.open(result.url, '_blank');
            return true;
        } else {
            throw new Error(result.message || 'ประมวลผล PDF ไม่สำเร็จ');
        }

    } catch (err) {
        console.error('generateEvaluationPDF Error:', err);
        let errorMsg = err.message;
        if (err.name === 'AbortError') errorMsg = 'การเชื่อมต่อหมดเวลา (30 วินาที) กรุณาลองใหม่อีกครั้ง';
        Swal.fire('ผิดพลาด', errorMsg, 'error');
        return false;
    }
}

// ==========================================
// ฟังก์ชันช่วยคำนวณคะแนนองค์ประกอบที่ 1 จากรายละเอียด
// ==========================================
function calculatePart1FromDetails(details) {
    let p1s1 = 0;
    let p1s2 = 0;

    if (Array.isArray(details.p1_s1)) {
        p1s1 = details.p1_s1.reduce((a, b) => a + b, 0);
    }

    if (Array.isArray(details.p1_s2)) {
        p1s2 = details.p1_s2.reduce((a, b) => a + b, 0);
    }

    // คำนวณตามสูตร (ครูผู้ช่วยใช้ฐาน 80, ครูทั่วไปใช้ฐาน 60)
    const isAssistant = currentUser.academic_standing === 'ครูผู้ช่วย';
    if (isAssistant) {
        return ((p1s1 * 80) / 56) + ((p1s2 * 20) / 40);
    } else {
        return (p1s1) + ((p1s2 * 20) / 40);
    }
}

// ==========================================
// ฟังก์ชันแสดงระดับคุณภาพ (5 ระดับ ตามเกณฑ์ใหม่)
// ==========================================
function getLevelText(score) {
    if (score >= 90) {
        return {
            text: 'ดีเด่น',
            color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
            icon: '🌟'
        };
    }
    if (score >= 80) {
        return {
            text: 'ดีมาก',
            color: 'bg-green-100 text-green-700 border-green-200',
            icon: '⭐'
        };
    }
    if (score >= 70) {
        return {
            text: 'ดี',
            color: 'bg-blue-100 text-blue-700 border-blue-200',
            icon: '🔵'
        };
    }
    if (score >= 60) {
        return {
            text: 'พอใช้',
            color: 'bg-yellow-100 text-yellow-700 border-yellow-200',
            icon: '🟡'
        };
    }
    return {
        text: 'ปรับปรุง',
        color: 'bg-red-100 text-red-700 border-red-200',
        icon: '🔴'
    };
}

// ==========================================
// ตรวจสอบการประเมินของคณะกรรมการ
// ==========================================

// ตัวแปรเก็บข้อมูล
let reviewDataTable = null;
let reviewTeachers = [];

// ==========================================
// เปิด Modal ตรวจสอบการประเมิน (ใช้ Tom Select)
// ==========================================
async function openCommitteeReviewModal() {
    const modal = document.getElementById('committeeReviewModal');
    modal.classList.remove('hidden');

    // ✅ Init Tom Select สำหรับชุดคณะกรรมการ
    window._reviewGroupTomSelect = createTomSelect('review_committee_group', {
        placeholder: '-- พิมพ์เพื่อค้นหาชุดคณะกรรมการ --',
        sortField: [{ field: 'text', direction: 'asc' }],
        render: {
            option: function (data, escape) {
                return `<div class="py-1 text-sm">${escape(data.text)}</div>`;
            },
            item: function (data, escape) {
                return `<div class="text-sm">${escape(data.text)}</div>`;
            }
        },
        onChange: function (value) {
            if (typeof onReviewGroupChange === 'function') {
                onReviewGroupChange(value);
            }
        }
    });

    // ✅ Init Tom Select สำหรับกลุ่มสาระ
    window._reviewDeptTomSelect = createTomSelect('review_department', {
        placeholder: '-- พิมพ์หรือเลือกกลุ่มสาระ --'
    });

    await loadReviewCommitteeGroups();
}

// ==========================================
// ปิด Modal ตรวจสอบการประเมิน
// ==========================================
function closeCommitteeReviewModal() {
    const modal = document.getElementById('committeeReviewModal');
    modal.classList.add('hidden');

    // ✅ Destroy Tom Select
    if (window._reviewGroupTomSelect) {
        window._reviewGroupTomSelect.destroy();
        window._reviewGroupTomSelect = null;
    }
    if (window._reviewDeptTomSelect) {
        window._reviewDeptTomSelect.destroy();
        window._reviewDeptTomSelect = null;
    }

    if (reviewDataTable) {
        reviewDataTable.destroy();
        reviewDataTable = null;
    }
}

// ==========================================
// โหลดชุดคณะกรรมการเข้าสู่ Tom Select
// ==========================================
async function loadReviewCommitteeGroups() {
    try {
        if (!currentEvalRound) {
            return Swal.fire('แจ้งเตือน', 'ไม่พบรอบการประเมิน', 'warning');
        }

        if (!window._reviewGroupTomSelect) return;

        // ✅ เคลียร์ options เก่า
        window._reviewGroupTomSelect.clear();
        window._reviewGroupTomSelect.clearOptions();

        // ✅ เคลียร์กลุ่มสาระ
        if (window._reviewDeptTomSelect) {
            window._reviewDeptTomSelect.clear();
            window._reviewDeptTomSelect.clearOptions();
        }

        // ✅ โหลด structure
        const structure = await loadCommitteeStructure(currentEvalRound.id);
        const mainGroups = structure.filter(g => g.group_type === 'main');

        if (!mainGroups || mainGroups.length === 0) {
            return;
        }

        // ✅ กรองสิทธิ์
        let allowedGroupIds = null;
        const isPrivileged = ['super_admin', 'admin', 'director'].includes(currentUser.role);
        if (!isPrivileged) {
            const myMemberships = await getUserCommitteeSubGroups(currentUser.id, currentEvalRound.id);
            allowedGroupIds = new Set(myMemberships.map(sg => sg.id));
        }

        // ✅ เพิ่ม options เข้า Tom Select
        mainGroups.forEach(mainGroup => {
            const subGroups = mainGroup.sub_groups || [];
            const hasSubGroups = subGroups.length > 0;

            const canSeeMain = !allowedGroupIds || allowedGroupIds.has(mainGroup.id);
            const visibleSubGroups = allowedGroupIds
                ? subGroups.filter(sub => allowedGroupIds.has(sub.id))
                : subGroups;

            if (!canSeeMain && visibleSubGroups.length === 0) return;
            if (hasSubGroups && visibleSubGroups.length === 0 && !canSeeMain) return;

            if (!hasSubGroups) {
                // ✅ Main Group ไม่มี Sub → เพิ่ม Main Group
                if (canSeeMain) {
                    window._reviewGroupTomSelect.addOption({
                        value: mainGroup.id,
                        text: `${mainGroup.group_name} (${mainGroup.members?.length || 0} คน)`,
                        optgroup: mainGroup.group_name,
                        targets: mainGroup.targets || [],
                        selectedSubItems: mainGroup.selected_sub_items || []
                    });
                }
            } else {
                // ✅ มี Sub → เพิ่มแต่ละ Sub
                visibleSubGroups.forEach(sub => {
                    window._reviewGroupTomSelect.addOption({
                        value: sub.id,
                        text: `${sub.group_name} (${sub.members?.length || 0} คน)`,
                        optgroup: mainGroup.group_name,
                        targets: sub.targets || [],
                        selectedSubItems: sub.selected_sub_items || []
                    });
                });
            }
        });

        window._reviewGroupTomSelect.refreshOptions(false);

    } catch (err) {
        console.error('Error loading review committee groups:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// เมื่อเปลี่ยนชุดคณะกรรมการ → โหลดกลุ่มสาระ
// ==========================================
async function onReviewGroupChange(subGroupId) {
    if (!window._reviewDeptTomSelect) return;

    // ✅ เคลียร์กลุ่มสาระเก่า
    window._reviewDeptTomSelect.clear();
    window._reviewDeptTomSelect.clearOptions();

    if (!subGroupId) return;

    // ✅ อ่าน targets จาก option ที่เลือก
    let targets = [];
    if (window._reviewGroupTomSelect) {
        const opt = window._reviewGroupTomSelect.options[subGroupId];
        if (opt && opt.targets) {
            targets = opt.targets;
        }
    }

    // Fallback: query DB ถ้าไม่มี targets ใน option
    if (targets.length === 0) {
        const { data: sub } = await db
            .from('eval_committee_groups')
            .select('eval_committee_targets(target_type, target_value)')
            .eq('id', subGroupId)
            .single();
        targets = sub?.eval_committee_targets || [];
    }

    const departmentTargets = targets.filter(t => t.target_type === 'department');

    // ✅ เพิ่มกลุ่มสาระเข้า Tom Select
    departmentTargets.forEach(t => {
        window._reviewDeptTomSelect.addOption({
            value: t.target_value,
            text: t.target_value
        });
    });
    window._reviewDeptTomSelect.refreshOptions(false);

    // ✅ Auto-select ถ้ามีกลุ่มสาระเดียว
    if (departmentTargets.length === 1) {
        window._reviewDeptTomSelect.setValue(departmentTargets[0].target_value);
    }
}

// ==========================================
// โหลดข้อมูลสำหรับตรวจสอบ
// ==========================================
async function loadReviewData() {
    // ✅ อ่านค่าจาก Tom Select
    const subGroupId = window._reviewGroupTomSelect
        ? window._reviewGroupTomSelect.getValue()
        : document.getElementById('review_committee_group').value;
    const department = window._reviewDeptTomSelect
        ? window._reviewDeptTomSelect.getValue()
        : document.getElementById('review_department').value;

    if (!subGroupId) {
        return Swal.fire('แจ้งเตือน', 'กรุณาเลือกชุดคณะกรรมการ', 'warning');
    }
    if (!department) {
        return Swal.fire('แจ้งเตือน', 'กรุณาเลือกกลุ่มสาระ', 'warning');
    }

    Swal.fire({
        title: 'กำลังโหลดข้อมูล...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        // ทำลาย DataTable เก่า
        if (reviewDataTable) {
            reviewDataTable.destroy();
            reviewDataTable = null;
        }

        // โหลดรายชื่อครูในกลุ่มสาระ
        const validStandings = ['ครูผู้ช่วย', 'ครู', 'ครูชำนาญการ', 'ครูชำนาญการพิเศษ', 'ไม่มีวิทยฐานะ'];
        const { data: teachers, error: tErr } = await db
            .from('core_personnel')
            .select('id, prefix, first_name, last_name, academic_standing, department')
            .eq('department', department)
            .in('position', ['ครู', 'ครูผู้ช่วย'])
            .in('academic_standing', ['ครูผู้ช่วย', 'ไม่มีวิทยฐานะ', 'ครูชำนาญการ', 'ครูชำนาญการพิเศษ'])
            .order('first_name', { ascending: true });

        if (tErr) throw tErr;

        if (!teachers || teachers.length === 0) {
            Swal.close();
            document.getElementById('tb-review').innerHTML = `
                <tr>
                    <td colspan="9" class="text-center py-8 text-gray-400">
                        <i class="fa-solid fa-user-slash mr-2"></i>
                        ไม่พบบุคลากรในกลุ่มสาระ "${department}"
                    </td>
                </tr>
            `;
            document.getElementById('reviewSummary').classList.add('hidden');
            return;
        }

        // ดึงข้อมูลการประเมินของครูแต่ละคน
        const teacherIds = teachers.map(t => t.id);
        const { data: evalResults, error: eErr } = await db
            .from('eval_results')
            .select('*')
            .in('evaluatee_id', teacherIds)
            .eq('eval_round_id', currentEvalRound.id)
            .eq('eval_type', 'committee')
            .eq('status', 'submitted');

        if (eErr) throw eErr;

        // สร้าง Map สำหรับผลการประเมิน
        const evalMap = {};
        (evalResults || []).forEach(r => {
            if (!evalMap[r.evaluatee_id]) {
                evalMap[r.evaluatee_id] = [];
            }
            evalMap[r.evaluatee_id].push(r);
        });

        // สร้างข้อมูลสำหรับแสดง
        let html = '';
        let totalEvaluated = 0;
        let totalScore = 0;

        teachers.forEach((teacher, index) => {
            const fullName = teacher.prefix
                ? `${teacher.prefix}${teacher.first_name} ${teacher.last_name}`
                : `${teacher.first_name} ${teacher.last_name}`;
            const standing = teacher.academic_standing || '-';

            const evals = evalMap[teacher.id] || [];
            const isEvaluated = evals.length > 0;

            // คำนวณคะแนนเฉลี่ยของแต่ละองค์ประกอบ
            let p1Scores = [];
            let p2Scores = [];
            let p3Scores = [];
            let totalScores = [];

            evals.forEach(e => {
                if (e.detailed_scores) {
                    // องค์ประกอบที่ 1 (p1_s1 + p1_s2)
                    const p1s1 = e.detailed_scores.p1_s1 || [];
                    const p1s2 = e.detailed_scores.p1_s2 || [];
                    const p1Total = [...p1s1, ...p1s2].filter(s => typeof s === 'number' && !isNaN(s));
                    if (p1Total.length > 0) {
                        p1Scores.push(p1Total.reduce((a, b) => a + b, 0));
                    }

                    // องค์ประกอบที่ 2
                    if (e.detailed_scores.p2 !== undefined && e.detailed_scores.p2 !== null) {
                        p2Scores.push(e.detailed_scores.p2);
                    }

                    // องค์ประกอบที่ 3
                    const p3 = e.detailed_scores.p3 || [];
                    const p3Total = p3.filter(s => typeof s === 'number' && !isNaN(s));
                    if (p3Total.length > 0) {
                        p3Scores.push(p3Total.reduce((a, b) => a + b, 0));
                    }

                    totalScores.push(e.total_score);
                }
            });

            // หา Mode ของคะแนนแต่ละองค์ประกอบ
            const modeP1 = p1Scores.length > 0 ? findMode(p1Scores) : null;
            const modeP2 = p2Scores.length > 0 ? findMode(p2Scores) : null;
            const modeP3 = p3Scores.length > 0 ? findMode(p3Scores) : null;
            const modeTotal = totalScores.length > 0 ? findMode(totalScores) : null;

            // สถานะ
            let statusBadge = isEvaluated
                ? '<span class="status-badge done">✅ ประเมินแล้ว</span>'
                : '<span class="status-badge pending">⏳ ยังไม่ประเมิน</span>';

            // ปุ่มดูรายละเอียด
            let detailBtn = isEvaluated
                ? `<button onclick="viewTeacherEvalDetail('${teacher.id}')" 
                         class="bg-purple-500 hover:bg-purple-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                     <i class="fa-solid fa-eye mr-1"></i>ดูรายละเอียด
                   </button>`
                : '<span class="text-gray-400 text-xs">-</span>';

            // แสดงคะแนน
            const displayP1 = modeP1 !== null ? modeP1.toFixed(2) : '-';
            const displayP2 = modeP2 !== null ? modeP2.toFixed(2) : '-';
            const displayP3 = modeP3 !== null ? modeP3.toFixed(2) : '-';
            const displayTotal = modeTotal !== null ? modeTotal.toFixed(2) : '-';

            if (isEvaluated) {
                totalEvaluated++;
                totalScore += modeTotal || 0;
            }

            html += `
                <tr>
                    <td class="text-center">${index + 1}</td>
                    <td class="font-medium">${fullName}</td>
                    <td>${standing}</td>
                    <td class="text-center">${statusBadge}</td>
                    <td class="text-center font-medium ${modeP1 !== null ? 'text-blue-600' : 'text-gray-400'}">${displayP1}</td>
                    <td class="text-center font-medium ${modeP2 !== null ? 'text-emerald-600' : 'text-gray-400'}">${displayP2}</td>
                    <td class="text-center font-medium ${modeP3 !== null ? 'text-purple-600' : 'text-gray-400'}">${displayP3}</td>
                    <td class="text-center font-bold ${modeTotal !== null ? 'text-indigo-700' : 'text-gray-400'}">${displayTotal}</td>
                    <td class="text-center">${detailBtn}</td>
                </tr>
            `;
        });

        document.getElementById('tb-review').innerHTML = html;

        // อัปเดตสรุป
        document.getElementById('reviewTotalTeachers').innerText = teachers.length;
        document.getElementById('reviewEvaluated').innerText = totalEvaluated;
        document.getElementById('reviewNotEvaluated').innerText = teachers.length - totalEvaluated;
        document.getElementById('reviewAvgScore').innerText = totalEvaluated > 0
            ? (totalScore / totalEvaluated).toFixed(2)
            : '0.00';
        document.getElementById('reviewSummary').classList.remove('hidden');

        // สร้าง DataTable
        setTimeout(() => {
            try {
                if ($.fn.DataTable.isDataTable('#reviewTable')) {
                    $('#reviewTable').DataTable().destroy();
                }
                reviewDataTable = $('#reviewTable').DataTable({
                    scrollX: true,
                    language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
                    pageLength: 10,
                    lengthMenu: [[5, 10, 25, -1], [5, 10, 25, 'ทั้งหมด']],
                    columnDefs: [
                        { targets: [0], width: '5%', orderable: true },
                        { targets: [1], width: '15%' },
                        { targets: [2], width: '10%' },
                        { targets: [3], width: '10%', orderable: false },
                        { targets: [4], width: '10%' },
                        { targets: [5], width: '10%' },
                        { targets: [6], width: '10%' },
                        { targets: [7], width: '10%' },
                        { targets: [8], width: '10%', orderable: false }
                    ],
                    dom: '<"flex flex-wrap justify-between items-center gap-2 mb-3"lf>rt<"flex flex-wrap justify-between items-center gap-2 mt-3"ip>',
                    order: [[0, 'asc']]
                });
            } catch (e) {
                console.warn('DataTable init error:', e);
            }
        }, 300);

        Swal.close();

    } catch (err) {
        console.error('Error loading review data:', err);
        Swal.close();
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// ดูรายละเอียดการประเมินของครูแต่ละคน
// ==========================================
async function viewTeacherEvalDetail(evaluateeId) {
    try {
        const { data: results, error } = await db
            .from('eval_results')
            .select('*')
            .eq('evaluatee_id', evaluateeId)
            .eq('eval_round_id', currentEvalRound.id)
            .eq('eval_type', 'committee')
            .eq('status', 'submitted');

        if (error) throw error;

        if (!results || results.length === 0) {
            return Swal.fire('แจ้งเตือน', 'ไม่พบข้อมูลการประเมิน', 'info');
        }

        const { data: teacher } = await db
            .from('core_personnel')
            .select('prefix, first_name, last_name, academic_standing')
            .eq('id', evaluateeId)
            .single();

        const name = teacher ? `${teacher.prefix || ''}${teacher.first_name} ${teacher.last_name}` : 'ไม่พบข้อมูล';
        const standing = teacher?.academic_standing || '-';

        // ✅ แก้ไข: ดึงชื่อกรรมการผู้ประเมินแทนการแสดง UUID ย่อ
        const evaluatorIds = [...new Set(results.map(r => r.evaluator_id).filter(Boolean))];
        const evaluatorNameMap = {};
        if (evaluatorIds.length > 0) {
            const { data: evaluators } = await db
                .from('core_personnel')
                .select('id, prefix, first_name, last_name')
                .in('id', evaluatorIds);
            (evaluators || []).forEach(e => {
                evaluatorNameMap[e.id] = `${e.prefix || ''}${e.first_name} ${e.last_name}`;
            });
        }

        // สร้างตารางแสดงรายละเอียด
        let detailHtml = `
            <div class="mb-4">
                <p class="font-bold text-gray-800">${name}</p>
                <p class="text-sm text-gray-500">วิทยฐานะ: ${standing}</p>
                <p class="text-sm text-gray-500">จำนวนกรรมการที่ประเมิน: ${results.length} ท่าน</p>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm border-collapse">
                    <thead>
                        <tr class="bg-gray-100">
                            <th class="p-2 text-left border">กรรมการ</th>
                            <th class="p-2 text-center border">องค์ประกอบที่ 1</th>
                            <th class="p-2 text-center border">องค์ประกอบที่ 2</th>
                            <th class="p-2 text-center border">องค์ประกอบที่ 3</th>
                            <th class="p-2 text-center border">คะแนนรวม</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        let allScores = [];
        results.forEach(r => {
            const p1s1 = r.detailed_scores?.p1_s1 || [];
            const p1s2 = r.detailed_scores?.p1_s2 || [];
            const p1Total = [...p1s1, ...p1s2].filter(s => typeof s === 'number' && !isNaN(s));
            const p1Sum = p1Total.length > 0 ? p1Total.reduce((a, b) => a + b, 0) : '-';

            const p2 = r.detailed_scores?.p2 !== undefined ? r.detailed_scores.p2 : '-';

            const p3 = r.detailed_scores?.p3 || [];
            const p3Total = p3.filter(s => typeof s === 'number' && !isNaN(s));
            const p3Sum = p3Total.length > 0 ? p3Total.reduce((a, b) => a + b, 0) : '-';

            const displayP1 = typeof p1Sum === 'number' ? p1Sum.toFixed(2) : '-';
            const displayP2 = typeof p2 === 'number' ? p2.toFixed(2) : '-';
            const displayP3 = typeof p3Sum === 'number' ? p3Sum.toFixed(2) : '-';
            const displayTotal = typeof r.total_score === 'number' ? r.total_score.toFixed(2) : '-';

            if (typeof r.total_score === 'number') {
                allScores.push(r.total_score);
            }

            detailHtml += `
                <tr class="border-b hover:bg-gray-50">
                    <td class="p-2 border">${evaluatorNameMap[r.evaluator_id] || r.evaluator_id?.substring(0, 8) || '-'}</td>
                    <td class="p-2 text-center border">${displayP1}</td>
                    <td class="p-2 text-center border">${displayP2}</td>
                    <td class="p-2 text-center border">${displayP3}</td>
                    <td class="p-2 text-center border font-bold">${displayTotal}</td>
                </tr>
            `;
        });

        // หา Mode ของคะแนนรวม
        const modeTotal = allScores.length > 0 ? findMode(allScores) : null;

        detailHtml += `
                    </tbody>
                    <tfoot>
                        <tr class="bg-indigo-50 font-bold">
                            <td class="p-2 border">โหมดคะแนน (Mode)</td>
                            <td class="p-2 text-center border">-</td>
                            <td class="p-2 text-center border">-</td>
                            <td class="p-2 text-center border">-</td>
                            <td class="p-2 text-center border text-indigo-600">${modeTotal !== null ? modeTotal.toFixed(2) : '-'}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;

        await Swal.fire({
            title: '📊 รายละเอียดการประเมิน',
            html: detailHtml,
            width: '800px',
            confirmButtonText: 'ปิด',
            confirmButtonColor: '#6366f1'
        });

    } catch (err) {
        console.error('Error viewing teacher detail:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// ✅ ตรวจสอบการประเมินตนเอง (สำหรับ Admin/ผอ.)
// ==========================================
let selfReviewDataTable = null;

// ==========================================
// เปิด Modal ตรวจสอบการประเมินตนเอง (ใช้ Tom Select)
// ==========================================
async function openSelfReviewModal() {
    const modal = document.getElementById('selfReviewModal');
    modal.classList.remove('hidden');

    // ✅ Init Tom Select สำหรับกลุ่มสาระ
    window._selfReviewDeptTomSelect = createTomSelect('self_review_department', {
        placeholder: '-- พิมพ์หรือเลือกกลุ่มสาระ --',
        onChange: function (value) {
            if (value && typeof loadSelfReviewData === 'function') {
                loadSelfReviewData();
            }
        }
    });

    await loadSelfReviewDepartments();

    // Reset state
    document.getElementById('tb-self-review').innerHTML = `
        <tr>
            <td colspan="8" class="text-center py-8 text-gray-400">
                <i class="fa-solid fa-info-circle mr-2"></i>
                กรุณาเลือกกลุ่มสาระเพื่อแสดงข้อมูล
            </td>
        </tr>`;
    document.getElementById('selfReviewSummary').classList.add('hidden');
}

function closeSelfReviewModal() {
    const modal = document.getElementById('selfReviewModal');
    modal.classList.add('hidden');

    // ✅ Destroy Tom Select
    if (window._selfReviewDeptTomSelect) {
        window._selfReviewDeptTomSelect.destroy();
        window._selfReviewDeptTomSelect = null;
    }

    if (selfReviewDataTable) {
        try { selfReviewDataTable.destroy(); } catch (e) { }
        selfReviewDataTable = null;
    }
}

async function loadSelfReviewDepartments() {
    try {
        if (!window._selfReviewDeptTomSelect) return;

        window._selfReviewDeptTomSelect.clear();
        window._selfReviewDeptTomSelect.clearOptions();

        const allowedDepartments = [
            'ภาษาไทย', 'คณิตศาสตร์',
            'วิทยาศาสตร์และเทคโนโลยี (วิทยาศาสตร์)',
            'วิทยาศาสตร์และเทคโนโลยี (เทคโนโลยี)',
            'สังคมศึกษา ศาสนาและวัฒนธรรม',
            'สุขศึกษาและพลศึกษา', 'ศิลปะ', 'การงานอาชีพ',
            'ภาษาต่างประเทศ (ภาษาอังกฤษ)', 'ภาษาต่างประเทศ (ภาษาจีน)',
            'แนะแนว'
        ];

        allowedDepartments.forEach(d => {
            window._selfReviewDeptTomSelect.addOption({ value: d, text: d });
        });
        window._selfReviewDeptTomSelect.refreshOptions(false);

    } catch (err) {
        console.error('Error loading departments:', err);
    }
}

async function loadSelfReviewData(showAll = false) {
    const department = window._selfReviewDeptTomSelect
        ? window._selfReviewDeptTomSelect.getValue()
        : document.getElementById('self_review_department').value;

    if (!showAll && !department) {
        return Swal.fire('แจ้งเตือน', 'กรุณาเลือกกลุ่มสาระ', 'warning');
    }

    Swal.fire({
        title: 'กำลังโหลดข้อมูล...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        // ทำลาย DataTable เก่า
        if (selfReviewDataTable) {
            try { selfReviewDataTable.destroy(); } catch (e) { }
            selfReviewDataTable = null;
        }

        // ดึงรายชื่อครู
        let query = db
            .from('core_personnel')
            .select('id, prefix, first_name, last_name, academic_standing, department')
            .in('position', ['ครู', 'ครูผู้ช่วย'])
            .in('academic_standing', ['ครูผู้ช่วย', 'ไม่มีวิทยฐานะ', 'ครูชำนาญการ', 'ครูชำนาญการพิเศษ'])
            .order('first_name', { ascending: true });

        if (!showAll && department) {
            query = query.eq('department', department);
        }

        const { data: teachers, error: tErr } = await query;
        if (tErr) throw tErr;

        if (!teachers || teachers.length === 0) {
            Swal.close();
            document.getElementById('tb-self-review').innerHTML = `
                <tr>
                    <td colspan="8" class="text-center py-8 text-gray-400">
                        <i class="fa-solid fa-user-slash mr-2"></i>
                        ไม่พบบุคลากรในกลุ่มสาระ "${department || 'ทั้งหมด'}"
                    </td>
                </tr>`;
            document.getElementById('selfReviewSummary').classList.add('hidden');
            return;
        }

        // ดึงข้อมูลการประเมินตนเอง
        const teacherIds = teachers.map(t => t.id);
        const { data: evalResults, error: eErr } = await db
            .from('eval_results')
            .select('evaluatee_id, total_score, status, updated_at, detailed_scores')
            .in('evaluatee_id', teacherIds)
            .eq('eval_round_id', currentEvalRound.id)
            .eq('eval_type', 'self');

        if (eErr) throw eErr;

        // Map ผลการประเมิน
        const evalMap = {};
        (evalResults || []).forEach(r => {
            evalMap[r.evaluatee_id] = r;
        });

        // สร้างตาราง
        let html = '';
        let doneCount = 0;
        let totalScore = 0;

        teachers.forEach((teacher, index) => {
            const fullName = teacher.prefix
                ? `${teacher.prefix}${teacher.first_name} ${teacher.last_name}`
                : `${teacher.first_name} ${teacher.last_name}`;
            const standing = teacher.academic_standing || '-';
            const dept = teacher.department || '-';
            const evalResult = evalMap[teacher.id];

            let statusBadge = '';
            let scoreText = '-';
            let dateText = '-';
            let detailBtn = '-';

            if (evalResult) {
                const isSubmitted = evalResult.status === 'submitted';
                statusBadge = isSubmitted
                    ? '<span class="status-badge done">✅ ส่งแล้ว</span>'
                    : '<span class="status-badge draft">📝 ร่าง</span>';

                if (isSubmitted) {
                    doneCount++;
                    totalScore += evalResult.total_score || 0;
                    const level = getLevelText(evalResult.total_score);
                    scoreText = `<span class="font-bold text-indigo-700">${evalResult.total_score.toFixed(2)}</span>
                                <span class="text-xs text-gray-400 block">${level.text}</span>`;
                    dateText = evalResult.updated_at
                        ? new Date(evalResult.updated_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '-';
                    detailBtn = `<button onclick="viewSelfEvalDetail('${teacher.id}')"
                                    class="bg-purple-500 hover:bg-purple-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                                    <i class="fa-solid fa-eye mr-1"></i>ดูรายละเอียด
                                 </button>`;
                } else {
                    scoreText = '<span class="text-gray-400">-</span>';
                    dateText = '-';
                    detailBtn = '<span class="text-gray-400 text-xs">-</span>';
                }
            } else {
                statusBadge = '<span class="status-badge pending">⏳ ยังไม่ประเมิน</span>';
            }

            html += `
                <tr>
                    <td class="text-center">${index + 1}</td>
                    <td class="font-medium">${fullName}</td>
                    <td class="text-xs">${dept}</td>
                    <td>${standing}</td>
                    <td class="text-center">${statusBadge}</td>
                    <td class="text-center">${scoreText}</td>
                    <td class="text-center text-xs">${dateText}</td>
                    <td class="text-center">${detailBtn}</td>
                </tr>
            `;
        });

        document.getElementById('tb-self-review').innerHTML = html;

        // อัปเดตสรุป
        document.getElementById('selfReviewTotal').innerText = teachers.length;
        document.getElementById('selfReviewDone').innerText = doneCount;
        document.getElementById('selfReviewPending').innerText = teachers.length - doneCount;
        document.getElementById('selfReviewAvg').innerText = doneCount > 0
            ? (totalScore / doneCount).toFixed(2)
            : '0.00';
        document.getElementById('selfReviewSummary').classList.remove('hidden');

        // สร้าง DataTable
        setTimeout(() => {
            try {
                if ($.fn.DataTable.isDataTable('#selfReviewTable')) {
                    $('#selfReviewTable').DataTable().destroy();
                }
                selfReviewDataTable = $('#selfReviewTable').DataTable({
                    scrollX: true,
                    language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
                    pageLength: 15,
                    lengthMenu: [[10, 15, 25, -1], [10, 15, 25, 'ทั้งหมด']],
                    columnDefs: [
                        { targets: [0], width: '5%' },
                        { targets: [1], width: '20%' },
                        { targets: [2], width: '20%' },
                        { targets: [3], width: '12%' },
                        { targets: [4], width: '10%', orderable: false },
                        { targets: [5], width: '12%' },
                        { targets: [6], width: '11%' },
                        { targets: [7], width: '10%', orderable: false }
                    ],
                    dom: '<"flex flex-wrap justify-between items-center gap-2 mb-3"lf>rt<"flex flex-wrap justify-between items-center gap-2 mt-3"ip>',
                    order: [[0, 'asc']]
                });
            } catch (e) {
                console.warn('DataTable init error:', e);
            }
        }, 300);

        Swal.close();

    } catch (err) {
        console.error('Error loading self review data:', err);
        Swal.close();
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// ดูรายละเอียดการประเมินตนเองของครูแต่ละคน (สำหรับ Admin)
// ==========================================
async function viewSelfEvalDetail(evaluateeId) {
    try {
        const { data: evalResult, error } = await db
            .from('eval_results')
            .select('*')
            .eq('evaluatee_id', evaluateeId)
            .eq('eval_round_id', currentEvalRound.id)
            .eq('eval_type', 'self')
            .eq('status', 'submitted')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) throw error;
        if (!evalResult) {
            return Swal.fire('แจ้งเตือน', 'ไม่พบข้อมูลการประเมินตนเอง', 'info');
        }

        const { data: teacher } = await db
            .from('core_personnel')
            .select('prefix, first_name, last_name, academic_standing, department')
            .eq('id', evaluateeId)
            .single();

        const name = teacher ? `${teacher.prefix || ''}${teacher.first_name} ${teacher.last_name}` : '-';
        const standing = teacher?.academic_standing || 'ไม่มีวิทยฐานะ';
        const details = evalResult.detailed_scores || {};
        const academicLevel = standing;

        // ✅ ใช้ Helper Functions
        const criteria = getCriteriaByAcademic(academicLevel);
        const isAssistant = isAssistantTeacher(academicLevel);

        // คำนวณคะแนน
        const p1s1 = details.p1_s1 || [];
        const p1s2 = details.p1_s2 || [];
        const p2 = details.p2 || 0;
        const p3 = details.p3 || [];

        const p1s1Raw = p1s1.reduce((a, b) => a + b, 0);
        let p1s1Total = isAssistant ? (p1s1Raw * 80) / 56 : p1s1Raw;

        // p1_s2 (ระดับ 1-4 → คะแนนจริง)
        function getP1S2Score(level, maxScore) {
            if (!level || level < 1 || level > 4) return 0;
            return (level / 4) * maxScore;
        }
        const p1s2Total = (
            getP1S2Score(p1s2[0], 20) +
            getP1S2Score(p1s2[1], 10) +
            getP1S2Score(p1s2[2], 10)
        ) / 2;

        const p1Total = p1s1Total + p1s2Total;
        const p2Score = p2 * 2;
        const p3Total = p3.reduce((a, b) => a + b, 0) / 4;
        const total = evalResult.total_score || (p1Total + p2Score + p3Total);
        const level = getLevelText(total);

        const detailHtml = `
            <div class="text-left space-y-3">
                <div class="bg-gray-50 p-4 rounded-xl">
                    <p class="font-bold text-gray-800 text-lg">${name}</p>
                    <p class="text-sm text-gray-500">วิทยฐานะ: ${standing} | กลุ่มสาระ: ${teacher?.department || '-'}</p>
                    <p class="text-sm text-gray-500">วันที่ส่ง: ${new Date(evalResult.updated_at).toLocaleString('th-TH')}</p>
                </div>

                <div class="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-200">
                    <div class="flex justify-between items-center">
                        <div>
                            <p class="text-sm text-gray-500">คะแนนรวม</p>
                            <p class="text-3xl font-bold text-blue-600">${total.toFixed(2)}</p>
                            <p class="text-xs text-gray-500">/ 100</p>
                        </div>
                        <div class="text-right">
                            <span class="px-3 py-1.5 rounded-full text-sm font-bold ${level.color}">
                                ${level.text}
                            </span>
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-3 gap-3">
                    <div class="bg-blue-50 p-3 rounded-xl text-center border border-blue-200">
                        <p class="text-xs text-gray-500">องค์ประกอบ 1</p>
                        <p class="text-xl font-bold text-blue-600">${p1Total.toFixed(2)}</p>
                        <p class="text-[10px] text-gray-400">/ 80</p>
                    </div>
                    <div class="bg-emerald-50 p-3 rounded-xl text-center border border-emerald-200">
                        <p class="text-xs text-gray-500">องค์ประกอบ 2</p>
                        <p class="text-xl font-bold text-emerald-600">${p2Score.toFixed(2)}</p>
                        <p class="text-[10px] text-gray-400">/ 10</p>
                    </div>
                    <div class="bg-purple-50 p-3 rounded-xl text-center border border-purple-200">
                        <p class="text-xs text-gray-500">องค์ประกอบ 3</p>
                        <p class="text-xl font-bold text-purple-600">${p3Total.toFixed(2)}</p>
                        <p class="text-[10px] text-gray-400">/ 10</p>
                    </div>
                </div>
            </div>
        `;

        await Swal.fire({
            title: '📊 รายละเอียดการประเมินตนเอง',
            html: detailHtml,
            width: '700px',
            confirmButtonText: 'ปิด',
            confirmButtonColor: '#14b8a6'
        });

    } catch (err) {
        console.error('Error viewing self eval detail:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// ✅ [OPTIMIZED] ตรวจสอบความสมบูรณ์ก่อนสรุปผล
// @param {string} evalRoundId
// @param {string} evaluateeId
// @param {object|null} context - ผลจาก buildEvaluationContext (ถ้ามี)
// ==========================================
async function validateEvaluationCompleteness(evalRoundId, evaluateeId, context = null) {
    const errors = [];

    // ถ้าไม่มี context → โหลดเอง (backward compatible)
    const ctx = context || await buildEvaluationContext(evalRoundId);
    const { subGroups, teachersByDept, evalsByKey, personnelById } = ctx;

    if (!subGroups || subGroups.length === 0) {
        errors.push('ไม่พบชุดย่อยคณะกรรมการในรอบนี้');
        return { valid: false, errors };
    }

    const teacher = personnelById.get(evaluateeId);
    if (!teacher) {
        errors.push('ไม่พบข้อมูลครูที่ต้องการประเมิน');
        return { valid: false, errors };
    }

    const teacherName = `${teacher.first_name} ${teacher.last_name}`;
    const teacherDept = teacher.department;

    // หา sub groups ที่ครูคนนี้อยู่ในกลุ่มเป้าหมาย
    const relevantSubGroups = subGroups.filter(sub => {
        const departments = (sub.eval_committee_targets || [])
            .filter(t => t.target_type === 'department')
            .map(t => t.target_value);
        return departments.includes(teacherDept);
    });

    if (relevantSubGroups.length === 0) {
        errors.push(`ครู ${teacherName} (${teacherDept}) ไม่ถูกระบุในกลุ่มเป้าหมายของชุดย่อยใด`);
        return { valid: false, errors };
    }

    // ตรวจสอบแต่ละ sub group
    for (const sub of relevantSubGroups) {
        const members = sub.eval_committee_members || [];
        if (members.length === 0) {
            errors.push(`ชุด "${sub.group_name}" ไม่มีกรรมการ กรุณาแต่งตั้งกรรมการ`);
            continue;
        }

        const departments = (sub.eval_committee_targets || [])
            .filter(t => t.target_type === 'department')
            .map(t => t.target_value);

        // ดึงครูในแผนกเป้าหมายจาก memory
        let allTeachersInGroup = [];
        for (const dept of departments) {
            allTeachersInGroup = allTeachersInGroup.concat(teachersByDept.get(dept) || []);
        }

        if (allTeachersInGroup.length === 0) {
            errors.push(`ชุด "${sub.group_name}" ไม่พบครูในกลุ่มเป้าหมาย (${departments.join(', ')})`);
            continue;
        }

        const teacherIdSet = new Set(allTeachersInGroup.map(t => t.id));

        // required keys ของชุดนี้
        const requiredItems = sub.selected_sub_items || [];
        const requiredKeys = requiredItems.map(item => {
            if (item.element === '1') return item.part === '1' ? 'p1_s1' : 'p1_s2';
            if (item.element === '2') return 'p2';
            if (item.element === '3') return 'p3';
            return null;
        }).filter(k => k !== null);

        // ✅ รวบรวม eval ของ sub นี้ครั้งเดียว แล้ว group by evaluator
        const subEvals = [];
        teacherIdSet.forEach(tid => {
            const key = `${tid}::${sub.id}`;
            const evs = evalsByKey.get(key);
            if (evs) subEvals.push(...evs);
        });

        const evalsByEvaluator = new Map();
        subEvals.forEach(e => {
            if (!evalsByEvaluator.has(e.evaluator_id)) evalsByEvaluator.set(e.evaluator_id, []);
            evalsByEvaluator.get(e.evaluator_id).push(e);
        });

        // ตรวจสอบกรรมการแต่ละคน
        for (const member of members) {
            const evaluatorId = member.user_id;
            const evaluatorName = member.core_personnel
                ? `${member.core_personnel.first_name} ${member.core_personnel.last_name}`
                : 'ไม่ทราบชื่อ';

            const evaluatorEvals = evalsByEvaluator.get(evaluatorId) || [];
            const evaluatedIds = new Set(evaluatorEvals.map(r => r.evaluatee_id));
            const missingTeachers = [...teacherIdSet].filter(id => !evaluatedIds.has(id));

            if (missingTeachers.length > 0) {
                const missingNames = missingTeachers.map(id => {
                    const t = personnelById.get(id);
                    return t ? `${t.first_name} ${t.last_name}` : id;
                });
                errors.push(`กรรมการ ${evaluatorName} ยังไม่ได้ประเมินครู: ${missingNames.join(', ')}`);
            }

            // ตรวจหัวข้อที่ขาด
            for (const ev of evaluatorEvals) {
                const scores = ev.detailed_scores || {};
                const missingKeys = requiredKeys.filter(key => {
                    if (!scores[key]) return true;
                    if (Array.isArray(scores[key]) && scores[key].length === 0) return true;
                    if (Array.isArray(scores[key]) && scores[key].some(v => v === null || v === undefined)) return true;
                    return false;
                });

                if (missingKeys.length > 0) {
                    const t = personnelById.get(ev.evaluatee_id);
                    const name = t ? `${t.first_name} ${t.last_name}` : ev.evaluatee_id;
                    errors.push(`กรรมการ ${evaluatorName} ประเมิน ${name} แต่ขาดหัวข้อ: ${missingKeys.join(', ')}`);
                }
            }
        }
    }

    return { valid: errors.length === 0, errors, teacherName, teacherDept };
}

// ==========================================
// ✅ ตรวจสอบคะแนนรายกรรมการ - State
// ==========================================
let _evScoreState = {
    evaluateeId: null,
    subGroupId: null,
    subGroupName: '',
    evaluateeName: '',
    academicStanding: '',
    evaluators: [],       // [{ evaluator_id, name, detailed_scores, total_score, status }]
    modeScores: {},       // { p1_s1: [...], p1_s2: [...], p2, p3: [...] }
    requiredItems: [],    // selected_sub_items
    activeTab: 'mode'     // 'mode' | 'evaluators' | 'items'
};

// ==========================================
// เปิด Modal
// ==========================================
async function openEvaluatorScoresModal(evaluateeId = null, subGroupId = null) {
    const modal = document.getElementById('evaluatorScoresModal');
    modal.classList.remove('hidden');

    await populateEvaluatorScoresFilters();

    // ✅ [FIX] ตั้งค่า subGroupId ก่อน (จะ trigger การโหลดครู)
    if (subGroupId && _evScoreSubGroupTomSelect) {
        _evScoreSubGroupTomSelect.setValue(subGroupId);
        await onEvaluatorScoresSubGroupChange(subGroupId);
    }

    // ✅ [FIX] แล้วค่อยตั้งค่า evaluateeId (หลังครูถูกโหลดเข้า options แล้ว)
    if (evaluateeId && _evScoreEvaluateeTomSelect) {
        // ตรวจสอบว่า option นี้มีอยู่จริงใน Tom Select
        const hasOption = !!_evScoreEvaluateeTomSelect.options[evaluateeId];
        if (hasOption) {
            _evScoreEvaluateeTomSelect.setValue(evaluateeId);
        } else {
            console.warn('⚠️ ไม่พบ evaluatee option ใน Tom Select:', evaluateeId);
        }
    }

    // ✅ โหลดข้อมูลเมื่อตั้งค่าครบทั้ง 2
    if (evaluateeId && subGroupId) {
        // รอให้ Tom Select render เสร็จก่อนโหลด
        await new Promise(r => setTimeout(r, 100));
        await loadEvaluatorScores();
    }
}

function closeEvaluatorScoresModal() {
    document.getElementById('evaluatorScoresModal').classList.add('hidden');

    // ✅ Destroy Tom Select เมื่อปิด
    if (_evScoreEvaluateeTomSelect) {
        _evScoreEvaluateeTomSelect.destroy();
        _evScoreEvaluateeTomSelect = null;
    }
    if (_evScoreSubGroupTomSelect) {
        _evScoreSubGroupTomSelect.destroy();
        _evScoreSubGroupTomSelect = null;
    }

    _evScoreState = { /* reset */ };
}

// ==========================================
// โหลด dropdown filters (ฉบับแก้ไข v2)
// - ใช้ loadCommitteeStructure เพื่อดึง main + sub + members + targets ครบ
// - รองรับทั้ง main group ที่มี sub group และไม่มี sub group
// - ใช้ Tom Select
// ==========================================
async function populateEvaluatorScoresFilters() {
    try {
        // ✅ เริ่มต้น Tom Select (ถ้ายังไม่มี)
        initEvaluatorScoresTomSelects();

        const structure = await loadCommitteeStructure(currentEvalRound.id);
        const mainGroups = structure.filter(g => g.group_type === 'main');

        // ==========================================
        // ✅ เพิ่มชุดคณะกรรมการใน Tom Select
        // ==========================================
        if (_evScoreSubGroupTomSelect) {
            _evScoreSubGroupTomSelect.clear();
            _evScoreSubGroupTomSelect.clearOptions();

            // เพิ่ม optgroup แรก
            mainGroups.forEach((main, mainIdx) => {
                const subGroups = main.sub_groups || [];

                if (subGroups.length === 0) {
                    // ✅ Main Group ไม่มี Sub → เพิ่ม Main Group
                    _evScoreSubGroupTomSelect.addOption({
                        value: main.id,
                        text: `${main.group_name} (${main.members?.length || 0} คน)`,
                        optgroup: main.group_name,
                        targets: main.targets || [],
                        selectedSubItems: main.selected_sub_items || []
                    });
                } else {
                    // ✅ มี Sub Groups → เพิ่มแต่ละ Sub
                    subGroups.forEach(sub => {
                        _evScoreSubGroupTomSelect.addOption({
                            value: sub.id,
                            text: `${sub.group_name} (${sub.members?.length || 0} คน)`,
                            optgroup: main.group_name,
                            targets: sub.targets || [],
                            selectedSubItems: sub.selected_sub_items || []
                        });
                    });
                }
            });

            _evScoreSubGroupTomSelect.refreshOptions(false);
        }

        // ==========================================
        // ✅ เพิ่มครูทั้งหมด (ทุกกลุ่มสาระใน targets)
        // ==========================================
        const allDepartments = new Set();
        mainGroups.forEach(main => {
            (main.targets || [])
                .filter(t => t.target_type === 'department')
                .forEach(t => allDepartments.add(t.target_value));
            (main.sub_groups || []).forEach(sub => {
                (sub.targets || [])
                    .filter(t => t.target_type === 'department')
                    .forEach(t => allDepartments.add(t.target_value));
            });
        });

        if (allDepartments.size === 0) return;

        const { data: teachers } = await db
            .from('core_personnel')
            .select('id, prefix, first_name, last_name, academic_standing, department')
            .in('department', Array.from(allDepartments))
            .in('position', ['ครู', 'ครูผู้ช่วย'])
            .in('academic_standing', ['ครูผู้ช่วย', 'ไม่มีวิทยฐานะ', 'ครูชำนาญการ', 'ครูชำนาญการพิเศษ'])
            .order('department', { ascending: true })
            .order('first_name', { ascending: true });

        if (_evScoreEvaluateeTomSelect) {
            _evScoreEvaluateeTomSelect.clear();
            _evScoreEvaluateeTomSelect.clearOptions();

            (teachers || []).forEach(t => {
                const name = `${t.prefix || ''}${t.first_name} ${t.last_name}`;
                _evScoreEvaluateeTomSelect.addOption({
                    value: t.id,
                    text: `${name} (${t.department || '-'})`,
                    department: t.department,
                    name: name,
                    optgroup: t.department || 'ไม่ระบุ'
                });
            });

            _evScoreEvaluateeTomSelect.refreshOptions(false);
        }

        console.log(`✅ โหลด ${(teachers || []).length} คน | ${mainGroups.length} ชุดหลัก`);

    } catch (err) {
        console.error('Error populating filters:', err);
    }
}

// ==========================================
// ✅ เมื่อเปลี่ยนชุดย่อย → กรองครูในกลุ่มเป้าหมาย
// ==========================================
async function onEvaluatorScoresSubGroupChange(subGroupId) {
    if (!subGroupId) return;

    // ✅ เคลียร์ครู
    if (_evScoreEvaluateeTomSelect) {
        _evScoreEvaluateeTomSelect.clear();
        _evScoreEvaluateeTomSelect.clearOptions();
    }

    // ✅ หา option ที่เลือก เพื่ออ่าน targets
    let targets = [];
    if (_evScoreSubGroupTomSelect) {
        const opt = _evScoreSubGroupTomSelect.options[subGroupId];
        if (opt && opt.targets) {
            targets = opt.targets;
        }
    }

    // Fallback: ถ้า Tom Select ไม่มี targets → query DB
    if (targets.length === 0) {
        const { data: sub } = await db
            .from('eval_committee_groups')
            .select('eval_committee_targets(target_type, target_value)')
            .eq('id', subGroupId)
            .single();
        targets = sub?.eval_committee_targets || [];
    }

    const departments = targets
        .filter(t => t.target_type === 'department')
        .map(t => t.target_value);

    if (departments.length === 0) return;

    // ✅ โหลดครูในกลุ่มเป้าหมาย
    const { data: teachers } = await db
        .from('core_personnel')
        .select('id, prefix, first_name, last_name, academic_standing, department')
        .in('department', departments)
        .in('position', ['ครู', 'ครูผู้ช่วย'])
        .in('academic_standing', ['ครูผู้ช่วย', 'ไม่มีวิทยฐานะ', 'ครูชำนาญการ', 'ครูชำนาญการพิเศษ'])
        .order('first_name', { ascending: true });

    if (_evScoreEvaluateeTomSelect) {
        (teachers || []).forEach(t => {
            const name = `${t.prefix || ''}${t.first_name} ${t.last_name}`;
            _evScoreEvaluateeTomSelect.addOption({
                value: t.id,
                text: `${name} (${t.department || '-'})`,
                department: t.department,
                name: name
            });
        });
        _evScoreEvaluateeTomSelect.refreshOptions(false);
    }

    console.log(`✅ โหลด ${(teachers || []).length} คน สำหรับชุด ${subGroupId}`);
}

// ==========================================
// โหลดคะแนนรายกรรมการ
// ==========================================
async function loadEvaluatorScores() {
    const evaluateeId = document.getElementById('ev_score_evaluatee').value;
    const subGroupId = document.getElementById('ev_score_subgroup').value;

    if (!evaluateeId || !subGroupId) {
        return Swal.fire('แจ้งเตือน', 'กรุณาเลือกครูและชุดคณะกรรมการ', 'warning');
    }

    Swal.fire({
        title: 'กำลังโหลด...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        const content = document.getElementById('ev_score_content');
        content.innerHTML = `
            <div class="text-center py-12">
                <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto"></div>
                <p class="text-gray-400 mt-3">กำลังโหลดข้อมูล...</p>
            </div>`;

        // 1. ข้อมูลครู
        const { data: teacher } = await db
            .from('core_personnel')
            .select('id, prefix, first_name, last_name, academic_standing, department')
            .eq('id', evaluateeId)
            .single();

        // 2. ข้อมูลชุดย่อย + members
        const { data: subGroup } = await db
            .from('eval_committee_groups')
            .select('id, group_name, selected_sub_items, parent_group_id')
            .eq('id', subGroupId)
            .single();

        const { data: members } = await db
            .from('eval_committee_members')
            .select('user_id, core_personnel(id, prefix, first_name, last_name)')
            .eq('committee_group_id', subGroupId)
            .eq('is_active', true);

        const evaluatorIds = (members || []).map(m => m.user_id);

        // 3. ดึงผลการประเมินของกรรมการทุกคนในชุดนี้ (เฉพาะชุดที่เลือก)
        const { data: results } = await db
            .from('eval_results')
            .select('*')
            .eq('evaluatee_id', evaluateeId)
            .eq('eval_round_id', currentEvalRound.id)
            .eq('eval_type', 'committee')
            .eq('sub_group_id', subGroupId)   // ✅ [ใหม่]
            .in('evaluator_id', evaluatorIds)
            .eq('status', 'submitted');

        // 4. Map ข้อมูล
        const evaluatorNameMap = {};
        (members || []).forEach(m => {
            if (m.core_personnel) {
                evaluatorNameMap[m.user_id] = `${m.core_personnel.prefix || ''}${m.core_personnel.first_name} ${m.core_personnel.last_name}`;
            } else {
                evaluatorNameMap[m.user_id] = `ID: ${m.user_id.substring(0, 8)}`;
            }
        });

        const evaluators = (results || []).map(r => ({
            evaluator_id: r.evaluator_id,
            name: evaluatorNameMap[r.evaluator_id] || 'ไม่ทราบชื่อ',
            detailed_scores: r.detailed_scores || {},
            total_score: r.total_score,
            status: r.status,
            eval_id: r.id
        }));

        // 5. คำนวณ Mode
        const modeScores = _evScoreState.modeScores = calculateModeFromEvaluators(evaluators);

        // 6. เก็บ state
        _evScoreState.evaluateeId = evaluateeId;
        _evScoreState.subGroupId = subGroupId;
        _evScoreState.subGroupName = subGroup?.group_name || '';
        _evScoreState.evaluateeName = teacher ? `${teacher.prefix || ''}${teacher.first_name} ${teacher.last_name}` : '';
        _evScoreState.academicStanding = teacher?.academic_standing || 'ครู';
        _evScoreState.evaluators = evaluators;
        _evScoreState.requiredItems = subGroup?.selected_sub_items || [];

        // 7. Render
        renderEvaluatorScoresModal();
        Swal.close();

    } catch (err) {
        console.error('Error loading evaluator scores:', err);
        Swal.close();
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// คำนวณ Mode จากกรรมการทุกคน
// ==========================================
function calculateModeFromEvaluators(evaluators) {
    if (!evaluators || evaluators.length === 0) return {};

    const mode = {
        p1_s1: [],          // Mode ต่อข้อ (สำหรับ UI ตารางไขว้)
        p1_s1_keys: [],
        p1_s1_sum: null,    // ✅ [FIX] Mode ของผลรวม (สำหรับคำนวณคะแนน)
        p1_s2: [],
        p2: null,
        p3: [],             // Mode ต่อข้อ (สำหรับ UI)
        p3_sum: null        // ✅ [FIX] Mode ของผลรวม
    };

    // --- p1_s1: Mode ต่อข้อ (สำหรับ UI) ---
    const p1s1Arrays = evaluators.map(e => e.detailed_scores.p1_s1 || []);
    const p1s1Keys = evaluators[0]?.detailed_scores.p1_s1_keys || [];
    const maxP1s1Len = Math.max(...p1s1Arrays.map(a => a.length), 0);
    for (let i = 0; i < maxP1s1Len; i++) {
        const vals = p1s1Arrays.map(a => a[i]).filter(v => typeof v === 'number');
        if (vals.length > 0) {
            mode.p1_s1.push(findMode(vals));
            if (p1s1Keys[i]) mode.p1_s1_keys.push(p1s1Keys[i]);
        }
    }
    // ✅ คำนวณ Mode ของ "ผลรวมต่อกรรมการ" สำหรับใช้จริง
    const p1s1Sums = p1s1Arrays
        .filter(a => a.length > 0)
        .map(a => a.reduce((x, y) => x + (typeof y === 'number' ? y : 0), 0));
    if (p1s1Sums.length > 0) {
        mode.p1_s1_sum = findMode(p1s1Sums);
    }

    // --- p1_s2 (เหมือนเดิม) ---
    const p1s2Arrays = evaluators.map(e => e.detailed_scores.p1_s2 || []);
    const maxP1s2Len = Math.max(...p1s2Arrays.map(a => a.length), 0);
    for (let i = 0; i < maxP1s2Len; i++) {
        const vals = p1s2Arrays.map(a => a[i]).filter(v => typeof v === 'number');
        mode.p1_s2.push(vals.length > 0 ? findMode(vals) : null);
    }

    // --- p2 (เหมือนเดิม) ---
    const p2Vals = evaluators.map(e => e.detailed_scores.p2).filter(v => typeof v === 'number');
    if (p2Vals.length > 0) mode.p2 = findMode(p2Vals);

    // --- p3: Mode ต่อข้อ (สำหรับ UI) ---
    const p3Arrays = evaluators.map(e => e.detailed_scores.p3 || []);
    const maxP3Len = Math.max(...p3Arrays.map(a => a.length), 0);
    for (let i = 0; i < maxP3Len; i++) {
        const vals = p3Arrays.map(a => a[i]).filter(v => typeof v === 'number');
        mode.p3.push(vals.length > 0 ? findMode(vals) : null);
    }
    // ✅ คำนวณ Mode ของ "ผลรวมต่อกรรมการ"
    const p3Sums = p3Arrays
        .filter(a => a.length > 0)
        .map(a => a.reduce((x, y) => x + (typeof y === 'number' ? y : 0), 0));
    if (p3Sums.length > 0) {
        mode.p3_sum = findMode(p3Sums);
    }

    return mode;
}

// ==========================================
// ✅ Helper: คำนวณความต่างจาก Mode
// ==========================================
function getScoreDiffColor(score, modeScore) {
    if (score === null || score === undefined || modeScore === null || modeScore === undefined) {
        return { color: 'gray', class: 'text-gray-400', bg: 'bg-gray-100', level: 'none' };
    }

    const diff = Math.abs(score - modeScore);

    if (diff === 0) {
        return {
            color: 'green',
            class: 'text-emerald-700',
            bg: 'bg-emerald-50',
            border: 'border-emerald-200',
            level: 'match',
            label: 'ตรงกับ Mode'
        };
    }
    if (diff === 1) {
        return {
            color: 'yellow',
            class: 'text-amber-700',
            bg: 'bg-amber-50',
            border: 'border-amber-200',
            level: 'minor',
            label: 'ต่าง ±1'
        };
    }
    return {
        color: 'red',
        class: 'text-red-700',
        bg: 'bg-red-50',
        border: 'border-red-200',
        level: 'major',
        label: 'ต่าง ±2 ขึ้นไป'
    };
}

// ==========================================
// ✅ Helper: หา Label ของหัวข้อ (อ่านง่าย)
// ==========================================
function getItemLabel(item, academicStanding) {
    const criteria = getCriteriaByAcademic(academicStanding);

    // p1_s1
    if (item.element === '1' && item.part === '1') {
        const targetId = item.value.replace('.', '_');
        for (const group of criteria.part1_sec1 || []) {
            const found = group.items.find(i =>
                i.id === item.value || i.id === targetId
            );
            if (found) return found.label;
        }
    }

    // p1_s2
    if (item.element === '1' && item.part === '2') {
        const found = criteria.part1_sec2?.find(i => {
            const id = i.id === 's2_1' ? '1'
                : i.id === 's2_2_1' ? '2.1'
                    : i.id === 's2_2_2' ? '2.2'
                        : i.id;
            return id === item.value || id === item.value.replace('.', '_');
        });
        if (found) return found.label;
    }

    // p2
    if (item.element === '2') {
        return 'ความสำเร็จของงานที่ได้รับมอบหมาย';
    }

    // p3
    if (item.element === '3') {
        const idx = parseInt(item.value) - 1;
        if (idx >= 0 && idx < PART3_ITEMS.length) {
            const text = PART3_ITEMS[idx];
            return `${idx + 1}. ${text.substring(0, 60)}${text.length > 60 ? '...' : ''}`;
        }
    }

    return item.value;
}

// ==========================================
// ✅ Helper: คำนวณสถิติความต่างของกรรมการแต่ละคน
// ==========================================
function calculateEvaluatorDivergence(evaluator, modeScores, requiredItems) {
    let total = 0;
    let matches = 0;
    let minorDiffs = 0;   // ±1
    let majorDiffs = 0;   // ±2 ขึ้นไป
    const divergentItems = []; // เก็บรายการที่ต่างมาก เพื่อแสดงใน tooltip

    const details = evaluator.detailed_scores || {};

    // --- p1_s1 ---
    (requiredItems || [])
        .filter(i => i.element === '1' && i.part === '1')
        .forEach(item => {
            const key = item.value.replace('.', '_');
            const keys = details.p1_s1_keys || [];
            const arr = details.p1_s1 || [];
            const idx = keys.indexOf(key);
            const score = idx >= 0 ? arr[idx] : null;

            const modeIdx = (modeScores.p1_s1_keys || []).indexOf(key);
            const modeVal = modeIdx >= 0 ? modeScores.p1_s1[modeIdx] : null;

            if (score === null || modeVal === null) return;
            total++;
            const diff = Math.abs(score - modeVal);
            if (diff === 0) matches++;
            else if (diff === 1) minorDiffs++;
            else {
                majorDiffs++;
                divergentItems.push(`${item.value} (กรรมการ: ${score} / Mode: ${modeVal})`);
            }
        });

    // --- p1_s2 ---
    (requiredItems || [])
        .filter(i => i.element === '1' && i.part === '2')
        .forEach((item, i) => {
            const score = (details.p1_s2 || [])[i];
            const modeVal = (modeScores.p1_s2 || [])[i];
            if (score === null || score === undefined || modeVal === null || modeVal === undefined) return;
            total++;
            const diff = Math.abs(score - modeVal);
            if (diff === 0) matches++;
            else if (diff === 1) minorDiffs++;
            else {
                majorDiffs++;
                divergentItems.push(`ตอน 2 ข้อ ${item.value} (กรรมการ: ${score} / Mode: ${modeVal})`);
            }
        });

    // --- p2 ---
    if ((requiredItems || []).some(i => i.element === '2')) {
        const score = details.p2;
        const modeVal = modeScores.p2;
        if (score !== null && score !== undefined && modeVal !== null && modeVal !== undefined) {
            total++;
            const diff = Math.abs(score - modeVal);
            if (diff === 0) matches++;
            else if (diff === 1) minorDiffs++;
            else {
                majorDiffs++;
                divergentItems.push(`ป2 (กรรมการ: ${score} / Mode: ${modeVal})`);
            }
        }
    }

    // --- p3 ---
    (requiredItems || [])
        .filter(i => i.element === '3')
        .forEach((item, i) => {
            const score = (details.p3 || [])[i];
            const modeVal = (modeScores.p3 || [])[i];
            if (score === null || score === undefined || modeVal === null || modeVal === undefined) return;
            total++;
            const diff = Math.abs(score - modeVal);
            if (diff === 0) matches++;
            else if (diff === 1) minorDiffs++;
            else {
                majorDiffs++;
                divergentItems.push(`ป3 ข้อ ${item.value} (กรรมการ: ${score} / Mode: ${modeVal})`);
            }
        });

    const matchPercent = total > 0 ? (matches / total) * 100 : 0;

    return {
        total,
        matches,
        minorDiffs,
        majorDiffs,
        matchPercent,
        divergentItems
    };
}

// ==========================================
// Render Modal
// ==========================================
function renderEvaluatorScoresModal() {
    const s = _evScoreState;
    const content = document.getElementById('ev_score_content');
    const summary = document.getElementById('ev_score_summary');

    // ✅ [FIX] ใช้ Mode ของ "ผลรวมต่อกรรมการ" สำหรับคำนวณ (ไม่ใช่ Mode ของ Mode ต่อข้อ)
    const modeTotal = calculateTotalScoreFromModeDetails(
        {
            p1_s1: s.modeScores.p1_s1_sum,
            p1_s2: s.modeScores.p1_s2,
            p2: s.modeScores.p2,
            p3: s.modeScores.p3_sum
        },
        s.academicStanding
    );
    const level = getLevelText(modeTotal);

    // Header
    let html = `
        <div class="mb-4 p-4 bg-gradient-to-r from-indigo-50 to-blue-50 rounded-xl border border-indigo-200">
            <div class="flex flex-wrap justify-between items-center gap-3">
                <div>
                    <p class="text-xs text-gray-500 font-bold">ครูที่ถูกประเมิน</p>
                    <p class="font-bold text-gray-800 text-lg">${s.evaluateeName}</p>
                    <p class="text-xs text-gray-500">
                        <i class="fa-solid fa-building mr-1"></i> ${s.academicStanding} |
                        <i class="fa-solid fa-users ml-2 mr-1"></i> ชุด: ${s.subGroupName} |
                        <i class="fa-solid fa-user-check ml-2 mr-1"></i> กรรมการ ${s.evaluators.length} ท่าน
                    </p>
                </div>
                <div class="text-right">
                    <p class="text-xs text-gray-500">คะแนน Mode</p>
                    <p class="text-3xl font-bold text-indigo-600">${modeTotal.toFixed(2)}</p>
                    <span class="px-2 py-0.5 rounded-full text-xs font-bold ${level.color}">${level.text}</span>
                </div>
            </div>
        </div>

        <!-- Tabs -->
        <div class="flex gap-2 mb-4 border-b border-gray-200">
            <button onclick="switchEvaluatorTab('mode')"
                id="ev-tab-mode"
                class="px-4 py-2 text-sm font-bold transition-colors border-b-2 ${s.activeTab === 'mode' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}">
                <i class="fa-solid fa-chart-simple mr-1"></i> สรุป Mode
            </button>
            <button onclick="switchEvaluatorTab('evaluators')"
                id="ev-tab-evaluators"
                class="px-4 py-2 text-sm font-bold transition-colors border-b-2 ${s.activeTab === 'evaluators' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}">
                <i class="fa-solid fa-user-group mr-1"></i> รายกรรมการ
            </button>
            <button onclick="switchEvaluatorTab('items')"
                id="ev-tab-items"
                class="px-4 py-2 text-sm font-bold transition-colors border-b-2 ${s.activeTab === 'items' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}">
                <i class="fa-solid fa-table-list mr-1"></i> ตารางไขว้
            </button>
        </div>

        <div id="ev-tab-content"></div>
    `;
    content.innerHTML = html;

    // Render tab content
    renderEvaluatorTabContent();

    // Summary footer
    summary.innerHTML = `
        <span class="text-gray-500">
            <i class="fa-solid fa-users mr-1"></i> ${s.evaluators.length} กรรมการ |
            <i class="fa-solid fa-chart-line ml-2 mr-1"></i> Mode: <b class="text-indigo-600">${modeTotal.toFixed(2)}</b>
        </span>
    `;
}

// ==========================================
// สลับ Tab
// ==========================================
function switchEvaluatorTab(tab) {
    _evScoreState.activeTab = tab;

    ['mode', 'evaluators', 'items'].forEach(t => {
        const btn = document.getElementById(`ev-tab-${t}`);
        if (btn) {
            if (t === tab) {
                btn.className = 'px-4 py-2 text-sm font-bold transition-colors border-b-2 border-indigo-600 text-indigo-600';
            } else {
                btn.className = 'px-4 py-2 text-sm font-bold transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-700';
            }
        }
    });

    renderEvaluatorTabContent();
}

// ==========================================
// Render เนื้อหา Tab
// ==========================================
function renderEvaluatorTabContent() {
    const container = document.getElementById('ev-tab-content');
    if (!container) return;

    const s = _evScoreState;

    if (s.activeTab === 'mode') {
        container.innerHTML = renderModeTab();
    } else if (s.activeTab === 'evaluators') {
        container.innerHTML = renderEvaluatorsTab();
    } else if (s.activeTab === 'items') {
        container.innerHTML = renderItemsTab();
    }
}

// ==========================================
// TAB 1: สรุป Mode
// ✅ v2: ใช้ getItemLabel() แทน item.value/ternary → แสดง label อ่านง่าย
// ==========================================
function renderModeTab() {
    const s = _evScoreState;

    if (s.evaluators.length === 0) {
        return '<div class="text-center py-8 text-gray-400">ยังไม่มีการประเมินจากกรรมการ</div>';
    }

    // จัดกลุ่มข้อ
    const p1s1Items = s.requiredItems.filter(i => i.element === '1' && i.part === '1');
    const p1s2Items = s.requiredItems.filter(i => i.element === '1' && i.part === '2');
    const p2Items = s.requiredItems.filter(i => i.element === '2');
    const p3Items = s.requiredItems.filter(i => i.element === '3');

    let html = '<div class="overflow-x-auto rounded-xl border border-gray-200">';
    html += '<table class="w-full text-sm">';
    html += `
        <thead class="bg-indigo-50">
            <tr>
                <th class="p-2 text-left">หัวข้อ</th>
                <th class="p-2 text-center w-32">Mode</th>
            </tr>
        </thead>
        <tbody>`;

    // ==========================================
    // p1_s1
    // ==========================================
    if (p1s1Items.length > 0) {
        html += `<tr class="bg-blue-50/50"><td colspan="2" class="p-2 font-bold text-blue-700 text-xs">📚 องค์ประกอบ 1 ตอนที่ 1</td></tr>`;
        p1s1Items.forEach(item => {
            const key = item.value.replace('.', '_');
            const idx = (s.modeScores.p1_s1_keys || []).indexOf(key);
            const val = idx >= 0 ? s.modeScores.p1_s1[idx] : '-';
            const label = getItemLabel(item, s.academicStanding);   // ✅ ใช้ helper
            html += `
                <tr class="border-t border-gray-100 hover:bg-gray-50">
                    <td class="p-2 text-gray-700">${label}</td>
                    <td class="p-2 text-center font-bold text-indigo-600">${val || '-'}</td>
                </tr>`;
        });
    }

    // ==========================================
    // p1_s2
    // ==========================================
    if (p1s2Items.length > 0) {
        html += `<tr class="bg-indigo-50/50"><td colspan="2" class="p-2 font-bold text-indigo-700 text-xs">🎯 องค์ประกอบ 1 ตอนที่ 2</td></tr>`;
        p1s2Items.forEach((item, i) => {
            const val = s.modeScores.p1_s2[i] || '-';
            const label = getItemLabel(item, s.academicStanding);   // ✅ ใช้ helper
            html += `
                <tr class="border-t border-gray-100 hover:bg-gray-50">
                    <td class="p-2 text-gray-700">${label}</td>
                    <td class="p-2 text-center font-bold text-indigo-600">${val}</td>
                </tr>`;
        });
    }

    // ==========================================
    // p2
    // ==========================================
    if (p2Items.length > 0) {
        html += `<tr class="bg-emerald-50/50"><td colspan="2" class="p-2 font-bold text-emerald-700 text-xs">🤝 องค์ประกอบ 2</td></tr>`;
        p2Items.forEach(item => {
            const val = s.modeScores.p2 || '-';
            const label = getItemLabel(item, s.academicStanding);   // ✅ ใช้ helper
            html += `
                <tr class="border-t border-gray-100 hover:bg-gray-50">
                    <td class="p-2 text-gray-700">${label}</td>
                    <td class="p-2 text-center font-bold text-emerald-600">${val}</td>
                </tr>`;
        });
    }

    // ==========================================
    // p3
    // ==========================================
    if (p3Items.length > 0) {
        html += `<tr class="bg-purple-50/50"><td colspan="2" class="p-2 font-bold text-purple-700 text-xs">⚖️ องค์ประกอบ 3</td></tr>`;
        p3Items.forEach((item, i) => {
            const val = s.modeScores.p3[i] || '-';
            const label = getItemLabel(item, s.academicStanding);   // ✅ ใช้ helper
            html += `
                <tr class="border-t border-gray-100 hover:bg-gray-50">
                    <td class="p-2 text-gray-700">${label}</td>
                    <td class="p-2 text-center font-bold text-purple-600">${val}</td>
                </tr>`;
        });
    }

    html += '</tbody></table></div>';
    return html;
}

// ==========================================
// TAB 2: รายกรรมการ (แก้ไขได้) - พร้อมไฮไลต์ความต่าง
// ==========================================
function renderEvaluatorsTab() {
    const s = _evScoreState;

    if (s.evaluators.length === 0) {
        return '<div class="text-center py-8 text-gray-400">ยังไม่มีการประเมินจากกรรมการ</div>';
    }

    // ✅ คำนวณสถิติความต่างของกรรมการแต่ละคน
    const divergenceStats = s.evaluators.map(e =>
        calculateEvaluatorDivergence(e, s.modeScores, s.requiredItems)
    );

    // ✅ คำนวณค่าเฉลี่ย % ตรง Mode ของทั้งชุด
    const avgMatchPercent = divergenceStats.reduce((a, b) => a + b.matchPercent, 0) / divergenceStats.length;

    let html = `
        <!-- Legend -->
        <div class="flex flex-wrap items-center gap-3 mb-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
            <span class="text-xs font-bold text-gray-600">
                <i class="fa-solid fa-info-circle mr-1"></i> คำอธิบาย:
            </span>
            <span class="text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                🟢 ตรงกับ Mode
            </span>
            <span class="text-xs px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                🟡 ต่าง ±1
            </span>
            <span class="text-xs px-2 py-1 rounded-full bg-red-50 text-red-700 border border-red-200">
                🔴 ต่าง ±2 ขึ้นไป (ควรตรวจสอบ)
            </span>
        </div>

        <div class="overflow-x-auto rounded-xl border border-gray-200">
            <table class="w-full text-sm">
                <thead class="bg-indigo-50">
                    <tr>
                        <th class="p-2 text-center w-12">#</th>
                        <th class="p-2 text-left">กรรมการ</th>
                        <th class="p-2 text-center w-24">คะแนนรวม</th>
                        <th class="p-2 text-center w-20">ระดับ</th>
                        <th class="p-2 text-center w-20">ตรง Mode</th>
                        <th class="p-2 text-center w-20">ต่าง ±1</th>
                        <th class="p-2 text-center w-20">ต่างมาก</th>
                        <th class="p-2 text-center w-32">ดำเนินการ</th>
                    </tr>
                </thead>
                <tbody>`;

    s.evaluators.forEach((e, idx) => {
        const level = getLevelText(e.total_score);
        const stats = divergenceStats[idx];

        // ✅ สีพื้นแถวตามระดับความเห็นต่าง
        let rowBg = '';
        let rowIcon = '';
        if (stats.majorDiffs >= 3) {
            rowBg = 'bg-red-50/50';
            rowIcon = '<i class="fa-solid fa-triangle-exclamation text-red-500 ml-1" title="มีคะแนนต่างจาก Mode มาก"></i>';
        } else if (stats.majorDiffs >= 1) {
            rowBg = 'bg-amber-50/30';
            rowIcon = '<i class="fa-solid fa-circle-exclamation text-amber-500 ml-1" title="มีคะแนนต่างจาก Mode"></i>';
        }

        // ✅ ปุ่มดู divergent items (ถ้ามี)
        const viewDivergentBtn = stats.majorDiffs > 0
            ? `<button onclick="viewDivergentItems('${e.evaluator_id}')"
                    class="text-xs bg-red-500 hover:bg-red-600 text-white px-2 py-0.5 rounded ml-1"
                    title="ดูรายการที่ต่าง">
                    <i class="fa-solid fa-list"></i>
               </button>`
            : '';

        html += `
            <tr class="border-t border-gray-100 hover:bg-gray-50 ${rowBg}">
                <td class="p-2 text-center text-gray-400">${idx + 1}</td>
                <td class="p-2 font-medium text-gray-700">${e.name}${rowIcon}</td>
                <td class="p-2 text-center font-bold text-indigo-600">${e.total_score?.toFixed(2) || '-'}</td>
                <td class="p-2 text-center">
                    <span class="px-2 py-0.5 rounded-full text-xs font-bold ${level.color}">${level.text}</span>
                </td>
                <td class="p-2 text-center">
                    <span class="text-emerald-600 font-bold">${stats.matches}</span>
                </td>
                <td class="p-2 text-center">
                    <span class="text-amber-600 font-bold">${stats.minorDiffs}</span>
                </td>
                <td class="p-2 text-center">
                    <span class="${stats.majorDiffs > 0 ? 'text-red-600 font-bold' : 'text-gray-400'}">${stats.majorDiffs}</span>
                    ${viewDivergentBtn}
                </td>
                <td class="p-2 text-center whitespace-nowrap">
                    <button onclick="viewEvaluatorDetail('${e.evaluator_id}')"
                        class="bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded text-xs font-bold mr-1">
                        <i class="fa-solid fa-eye"></i> ดู
                    </button>
                    <button onclick="editEvaluatorScore('${e.evaluator_id}')"
                        class="bg-amber-500 hover:bg-amber-600 text-white px-2 py-1 rounded text-xs font-bold">
                        <i class="fa-solid fa-pen"></i> แก้ไข
                    </button>
                </td>
            </tr>`;
    });

    html += `
                </tbody>
                <tfoot class="bg-indigo-50/50 font-bold">
                    <tr>
                        <td colspan="4" class="p-2 text-right text-xs text-gray-600">
                            ค่าเฉลี่ยความตรงกับ Mode:
                        </td>
                        <td colspan="4" class="p-2 text-center">
                            <span class="text-lg text-indigo-600">${avgMatchPercent.toFixed(1)}%</span>
                        </td>
                    </tr>
                </tfoot>
            </table>
        </div>`;

    return html;
}

// ==========================================
// TAB 3: ตารางไขว้ (กรรมการ x ข้อ) - ไฮไลต์ความต่าง
// ✅ v2: ใช้ getItemLabel() แทน item.value ตรงๆ → แสดง label อ่านง่าย
// ==========================================
function renderItemsTab() {
    const s = _evScoreState;

    if (s.evaluators.length === 0) {
        return '<div class="text-center py-8 text-gray-400">ยังไม่มีการประเมินจากกรรมการ</div>';
    }

    let html = `
        <!-- Legend -->
        <div class="flex flex-wrap items-center gap-3 mb-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
            <span class="text-xs font-bold text-gray-600">🎨 สีของคะแนน:</span>
            <span class="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">🟢 ตรงกับ Mode</span>
            <span class="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700">🟡 ต่าง ±1</span>
            <span class="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700">🔴 ต่าง ±2 ขึ้นไป</span>
        </div>

        <div class="overflow-x-auto rounded-xl border border-gray-200">
            <table class="w-full text-sm">
                <thead class="bg-indigo-50">
                    <tr>
                        <th class="p-2 text-left sticky left-0 bg-indigo-50 z-10 min-w-[250px]">หัวข้อ</th>`;

    // คอลัมน์กรรมการแต่ละคน
    s.evaluators.forEach((e, i) => {
        html += `<th class="p-2 text-center w-20 text-xs" title="${e.name}">ก.${i + 1}</th>`;
    });

    // คอลัมน์ Mode
    html += `<th class="p-2 text-center w-20 bg-yellow-100 text-yellow-800 font-bold">Mode</th>`;
    html += `</tr></thead><tbody>`;

    // Legend ของกรรมการ (ชื่อย่อ)
    html += '<tr class="bg-gray-50 text-xs"><td class="p-1 sticky left-0 bg-gray-50"></td>';
    s.evaluators.forEach((e) => {
        html += `<td class="p-1 text-center text-gray-500 font-medium" title="${e.name}">${e.name.split(' ')[0]}</td>`;
    });
    html += '<td></td></tr>';

    // ==========================================
    // ✅ Helper: สร้างเซลล์ที่มีสี
    // ==========================================
    const renderScoreCell = (score, modeVal) => {
        if (score === null || score === undefined || score === '') {
            return `<td class="p-2 text-center text-gray-300">-</td>`;
        }
        const diff = getScoreDiffColor(score, modeVal);
        return `<td class="p-2 text-center font-bold ${diff.bg} ${diff.class} border ${diff.border}">${score}</td>`;
    };

    // ==========================================
    // p1_s1 (องค์ประกอบ 1 ตอนที่ 1)
    // ==========================================
    const p1s1Items = s.requiredItems.filter(i => i.element === '1' && i.part === '1');
    if (p1s1Items.length > 0) {
        html += `<tr class="bg-blue-50">
            <td colspan="${s.evaluators.length + 2}" class="p-2 font-bold text-blue-700 text-xs sticky left-0 bg-blue-50">
                📚 องค์ประกอบ 1 ตอนที่ 1
            </td>
        </tr>`;

        p1s1Items.forEach(item => {
            const key = item.value.replace('.', '_');
            const label = getItemLabel(item, s.academicStanding);   // ✅ ใช้ helper

            html += `<tr class="border-t border-gray-100 hover:bg-gray-50">`;
            html += `<td class="p-2 text-gray-700 sticky left-0 bg-white z-10 text-xs">${label}</td>`;

            // Mode value
            const modeIdx = (s.modeScores.p1_s1_keys || []).indexOf(key);
            const modeVal = modeIdx >= 0 ? s.modeScores.p1_s1[modeIdx] : null;

            s.evaluators.forEach(e => {
                const keys = e.detailed_scores.p1_s1_keys || [];
                const arr = e.detailed_scores.p1_s1 || [];
                const idx = keys.indexOf(key);
                const val = idx >= 0 ? arr[idx] : null;
                html += renderScoreCell(val, modeVal);
            });

            html += `<td class="p-2 text-center font-bold bg-yellow-50 text-yellow-800 border border-yellow-200">${modeVal !== null ? modeVal : '-'}</td>`;
            html += `</tr>`;
        });
    }

    // ==========================================
    // p1_s2 (องค์ประกอบ 1 ตอนที่ 2)
    // ==========================================
    const p1s2Items = s.requiredItems.filter(i => i.element === '1' && i.part === '2');
    if (p1s2Items.length > 0) {
        html += `<tr class="bg-indigo-50">
            <td colspan="${s.evaluators.length + 2}" class="p-2 font-bold text-indigo-700 text-xs sticky left-0 bg-indigo-50">
                🎯 องค์ประกอบ 1 ตอนที่ 2
            </td>
        </tr>`;

        p1s2Items.forEach((item, i) => {
            const label = getItemLabel(item, s.academicStanding);   // ✅ ใช้ helper
            const modeVal = (s.modeScores.p1_s2 || [])[i] || null;

            html += `<tr class="border-t border-gray-100 hover:bg-gray-50">`;
            html += `<td class="p-2 text-gray-700 sticky left-0 bg-white z-10 text-xs">${label}</td>`;

            s.evaluators.forEach(e => {
                const val = (e.detailed_scores.p1_s2 || [])[i];
                html += renderScoreCell(val, modeVal);
            });

            html += `<td class="p-2 text-center font-bold bg-yellow-50 text-yellow-800 border border-yellow-200">${modeVal !== null ? modeVal : '-'}</td>`;
            html += `</tr>`;
        });
    }

    // ==========================================
    // p2 (องค์ประกอบ 2)
    // ==========================================
    if (s.requiredItems.some(i => i.element === '2')) {
        const modeVal = s.modeScores.p2 || null;
        const p2Items = s.requiredItems.filter(i => i.element === '2');

        html += `<tr class="bg-emerald-50">
            <td colspan="${s.evaluators.length + 2}" class="p-2 font-bold text-emerald-700 text-xs sticky left-0 bg-emerald-50">
                🤝 องค์ประกอบ 2
            </td>
        </tr>`;

        p2Items.forEach(item => {
            const label = getItemLabel(item, s.academicStanding);   // ✅ ใช้ helper

            html += `<tr class="border-t border-gray-100 hover:bg-gray-50">`;
            html += `<td class="p-2 text-gray-700 sticky left-0 bg-white z-10 text-xs">${label}</td>`;

            s.evaluators.forEach(e => {
                const val = e.detailed_scores.p2;
                html += renderScoreCell(val, modeVal);
            });

            html += `<td class="p-2 text-center font-bold bg-yellow-50 text-yellow-800 border border-yellow-200">${modeVal !== null ? modeVal : '-'}</td>`;
            html += `</tr>`;
        });
    }

    // ==========================================
    // p3 (องค์ประกอบ 3)
    // ==========================================
    const p3Items = s.requiredItems.filter(i => i.element === '3');
    if (p3Items.length > 0) {
        html += `<tr class="bg-purple-50">
            <td colspan="${s.evaluators.length + 2}" class="p-2 font-bold text-purple-700 text-xs sticky left-0 bg-purple-50">
                ⚖️ องค์ประกอบ 3
            </td>
        </tr>`;

        p3Items.forEach((item, i) => {
            const label = getItemLabel(item, s.academicStanding);   // ✅ ใช้ helper
            const modeVal = (s.modeScores.p3 || [])[i] || null;

            html += `<tr class="border-t border-gray-100 hover:bg-gray-50">`;
            html += `<td class="p-2 text-gray-700 sticky left-0 bg-white z-10 text-xs">${label}</td>`;

            s.evaluators.forEach(e => {
                const val = (e.detailed_scores.p3 || [])[i];
                html += renderScoreCell(val, modeVal);
            });

            html += `<td class="p-2 text-center font-bold bg-yellow-50 text-yellow-800 border border-yellow-200">${modeVal !== null ? modeVal : '-'}</td>`;
            html += `</tr>`;
        });
    }

    html += `</tbody></table></div>`;
    return html;
}

// ==========================================
// ดูรายการที่กรรมการให้คะแนนต่างจาก Mode
// ==========================================
async function viewDivergentItems(evaluatorId) {
    const evaluator = _evScoreState.evaluators.find(e => e.evaluator_id === evaluatorId);
    if (!evaluator) return;

    const stats = calculateEvaluatorDivergence(evaluator, _evScoreState.modeScores, _evScoreState.requiredItems);

    if (stats.divergentItems.length === 0) {
        return Swal.fire({
            icon: 'info',
            title: 'ไม่พบความต่าง',
            text: 'คะแนนของกรรมการท่านนี้สอดคล้องกับ Mode',
            confirmButtonText: 'ปิด'
        });
    }

    // ✅ แสดงรายการที่ต่าง พร้อมปุ่มไปแก้ไข
    const itemsHtml = stats.divergentItems.map((item, i) =>
        `<div class="flex justify-between items-center border-b border-red-100 py-2 text-sm">
            <span class="text-gray-700">${i + 1}. ${item}</span>
        </div>`
    ).join('');

    await Swal.fire({
        icon: 'warning',
        title: '⚠️ รายการที่ต่างจาก Mode',
        html: `
            <div class="text-left">
                <div class="bg-yellow-50 p-3 rounded-lg mb-3">
                    <p class="text-sm">
                        <b>กรรมการ:</b> ${evaluator.name}<br>
                        <b>คะแนนรวม:</b> ${evaluator.total_score?.toFixed(2)}
                    </p>
                    <div class="flex gap-3 mt-2 text-xs">
                        <span class="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">
                            🟢 ตรง: ${stats.matches}
                        </span>
                        <span class="px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                            🟡 ต่าง ±1: ${stats.minorDiffs}
                        </span>
                        <span class="px-2 py-1 rounded-full bg-red-100 text-red-700">
                            🔴 ต่างมาก: ${stats.majorDiffs}
                        </span>
                    </div>
                </div>

                <p class="text-xs font-bold text-red-700 mb-1">
                    รายการที่ต่างจาก Mode ตั้งแต่ ±2 ขึ้นไป:
                </p>
                <div class="max-h-72 overflow-y-auto bg-red-50/50 rounded-lg p-2">
                    ${itemsHtml}
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: '<i class="fa-solid fa-pen"></i> ไปแก้ไขคะแนน',
        cancelButtonText: 'ปิด',
        confirmButtonColor: '#f59e0b'
    }).then((result) => {
        if (result.isConfirmed) {
            editEvaluatorScore(evaluatorId);
        }
    });
}

// ==========================================
// ดูรายละเอียดกรรมการแต่ละคน
// ==========================================
async function viewEvaluatorDetail(evaluatorId) {
    const evaluator = _evScoreState.evaluators.find(e => e.evaluator_id === evaluatorId);
    if (!evaluator) return;

    const details = evaluator.detailed_scores;
    const p1s1 = details.p1_s1 || [];
    const p1s2 = details.p1_s2 || [];
    const p2 = details.p2;
    const p3 = details.p3 || [];

    let html = `
        <div class="text-left">
            <p class="font-bold text-lg">${evaluator.name}</p>
            <p class="text-sm text-gray-500">คะแนนรวม: <b class="text-indigo-600">${evaluator.total_score?.toFixed(2)}</b> / 100</p>
            <hr class="my-3">
            <p class="text-xs font-bold text-blue-700">📚 องค์ประกอบ 1 ตอนที่ 1: [${p1s1.join(', ')}]</p>
            <p class="text-xs font-bold text-indigo-700 mt-1">🎯 องค์ประกอบ 1 ตอนที่ 2: [${p1s2.join(', ')}]</p>
            <p class="text-xs font-bold text-emerald-700 mt-1">🤝 องค์ประกอบ 2: ระดับ ${p2 || '-'}</p>
            <p class="text-xs font-bold text-purple-700 mt-1">⚖️ องค์ประกอบ 3: [${p3.join(', ')}]</p>
        </div>
    `;

    await Swal.fire({
        title: 'รายละเอียดการประเมิน',
        html: html,
        confirmButtonText: 'ปิด',
        width: '600px'
    });
}

// ==========================================
// แก้ไขคะแนนกรรมการ
// ==========================================
async function editEvaluatorScore(evaluatorId) {
    const evaluator = _evScoreState.evaluators.find(e => e.evaluator_id === evaluatorId);
    if (!evaluator) return;

    const confirm = await Swal.fire({
        icon: 'warning',
        title: 'ยืนยันการแก้ไข',
        html: `
            <p>คุณต้องการแก้ไขคะแนนของ <b>${evaluator.name}</b></p>
            <p class="text-xs text-gray-500 mt-2">
                ⚠️ การแก้ไขจะกระทบต่อคะแนน Mode และผลสรุป<br>
                ระบบจะเปิดหน้าแก้ไขในนามของกรรมการท่านนี้
            </p>
        `,
        showCancelButton: true,
        confirmButtonText: '✅ ยืนยัน',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#f59e0b'
    });

    if (!confirm.isConfirmed) return;

    // ✅ ถ้าเป็น Super Admin → สวมรอยเปิด wizard แก้ไข
    if (currentUser.role === 'super_admin') {
        _impersonationMode = true;
        _impersonatedEvaluatorId = evaluatorId;
        _impersonatedEvaluatorName = evaluator.name;
        window._currentSubGroupId = _evScoreState.subGroupId;

        // โหลด selected_sub_items
        const { data: sg } = await db
            .from('eval_committee_groups')
            .select('selected_sub_items')
            .eq('id', _evScoreState.subGroupId)
            .single();
        window._currentSelectedItems = sg?.selected_sub_items || [];

        // หา teacher data
        const { data: teacher } = await db
            .from('core_personnel')
            .select('*')
            .eq('id', _evScoreState.evaluateeId)
            .single();

        closeEvaluatorScoresModal();
        _showImpersonationBanner(evaluator.name);
        await startEvaluation('committee', teacher);
    } else {
        // ถ้าเป็น Admin ทั่วไป ต้องแก้ไขผ่าน DB โดยตรง
        Swal.fire({
            icon: 'info',
            title: 'ไม่สามารถแก้ไขได้',
            text: 'เฉพาะ Super Admin เท่านั้นที่สามารถแก้ไขคะแนนของกรรมการท่านอื่นได้',
            confirmButtonText: 'ตกลง'
        });
    }
}

// ==========================================
// Export Excel คะแนนรายกรรมการ
// ==========================================
async function exportEvaluatorScoresExcel() {
    const s = _evScoreState;

    if (!s.evaluateeId || s.evaluators.length === 0) {
        return Swal.fire('แจ้งเตือน', 'กรุณาโหลดข้อมูลก่อน export', 'warning');
    }

    try {
        const wb = XLSX.utils.book_new();

        // ==========================================
        // Sheet 1: สรุป Mode
        // ==========================================
        const modeData = [
            ['คะแนน Mode - ' + s.evaluateeName],
            ['ชุดคณะกรรมการ', s.subGroupName],
            ['วิทยฐานะ', s.academicStanding],
            ['จำนวนกรรมการ', s.evaluators.length],
            ['วันที่ export', new Date().toLocaleString('th-TH')],
            [],
            ['หัวข้อ', 'Mode', 'คะแนนเต็ม']
        ];

        const p1s1Items = s.requiredItems.filter(i => i.element === '1' && i.part === '1');
        const p1s2Items = s.requiredItems.filter(i => i.element === '1' && i.part === '2');
        const p3Items = s.requiredItems.filter(i => i.element === '3');

        if (p1s1Items.length > 0) {
            modeData.push(['📚 องค์ประกอบ 1 ตอนที่ 1', '', '']);
            p1s1Items.forEach(item => {
                const key = item.value.replace('.', '_');
                const idx = (s.modeScores.p1_s1_keys || []).indexOf(key);
                const val = idx >= 0 ? s.modeScores.p1_s1[idx] : '';
                modeData.push([item.value, val, 4]);
            });
        }

        if (p1s2Items.length > 0) {
            modeData.push(['🎯 องค์ประกอบ 1 ตอนที่ 2', '', '']);
            p1s2Items.forEach((item, i) => {
                modeData.push([item.value, s.modeScores.p1_s2[i] || '', 4]);
            });
        }

        if (s.requiredItems.some(i => i.element === '2')) {
            modeData.push(['🤝 องค์ประกอบ 2', s.modeScores.p2 || '', 5]);
        }

        if (p3Items.length > 0) {
            modeData.push(['⚖️ องค์ประกอบ 3', '', '']);
            p3Items.forEach((item, i) => {
                modeData.push([item.value, s.modeScores.p3[i] || '', 4]);
            });
        }

        const wsMode = XLSX.utils.aoa_to_sheet(modeData);
        wsMode['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, wsMode, 'สรุป Mode');

        // ==========================================
        // Sheet 2: คะแนนรายกรรมการ
        // ==========================================
        const evalHeaders = ['ลำดับ', 'กรรมการ', 'คะแนนรวม', 'ระดับ'];
        // เพิ่มคอลัมน์หัวข้อ
        const allItemLabels = [];
        if (p1s1Items.length > 0) {
            p1s1Items.forEach(i => allItemLabels.push(`1.1-${i.value}`));
        }
        if (p1s2Items.length > 0) {
            p1s2Items.forEach(i => allItemLabels.push(`1.2-${i.value}`));
        }
        if (s.requiredItems.some(i => i.element === '2')) {
            allItemLabels.push('ป2');
        }
        if (p3Items.length > 0) {
            p3Items.forEach(i => allItemLabels.push(`ป3-${i.value}`));
        }

        const evalData = [[...evalHeaders, ...allItemLabels]];

        s.evaluators.forEach((e, idx) => {
            const row = [idx + 1, e.name, e.total_score?.toFixed(2), getLevelText(e.total_score).text];

            // เพิ่มคะแนนรายข้อ
            if (p1s1Items.length > 0) {
                p1s1Items.forEach(item => {
                    const key = item.value.replace('.', '_');
                    const keys = e.detailed_scores.p1_s1_keys || [];
                    const arr = e.detailed_scores.p1_s1 || [];
                    const i = keys.indexOf(key);
                    row.push(i >= 0 ? arr[i] : '');
                });
            }
            if (p1s2Items.length > 0) {
                p1s2Items.forEach((item, i) => {
                    row.push((e.detailed_scores.p1_s2 || [])[i] || '');
                });
            }
            if (s.requiredItems.some(i => i.element === '2')) {
                row.push(e.detailed_scores.p2 || '');
            }
            if (p3Items.length > 0) {
                p3Items.forEach((item, i) => {
                    row.push((e.detailed_scores.p3 || [])[i] || '');
                });
            }

            evalData.push(row);
        });

        const wsEval = XLSX.utils.aoa_to_sheet(evalData);
        wsEval['!cols'] = evalData[0].map((_, i) => ({ wch: i < 4 ? 15 : 10 }));
        XLSX.utils.book_append_sheet(wb, wsEval, 'คะแนนรายกรรมการ');

        // ==========================================
        // Sheet 3: ตารางไขว้ (กรรมการ x ข้อ)
        // ==========================================
        const crossHeaders = ['หัวข้อ'];
        s.evaluators.forEach((e, i) => crossHeaders.push(`ก.${i + 1}`));
        crossHeaders.push('Mode');
        const crossData = [crossHeaders];

        // Legend
        const legendRow = ['ชื่อกรรมการ:'];
        s.evaluators.forEach((e, i) => legendRow.push(e.name.split(' ')[0]));
        legendRow.push('');
        crossData.push(legendRow);

        // p1_s1
        if (p1s1Items.length > 0) {
            crossData.push(['📚 องค์ประกอบ 1 ตอนที่ 1']);
            p1s1Items.forEach(item => {
                const row = [item.value];
                const key = item.value.replace('.', '_');
                s.evaluators.forEach(e => {
                    const keys = e.detailed_scores.p1_s1_keys || [];
                    const arr = e.detailed_scores.p1_s1 || [];
                    const i = keys.indexOf(key);
                    row.push(i >= 0 ? arr[i] : '');
                });
                const idx = (s.modeScores.p1_s1_keys || []).indexOf(key);
                row.push(idx >= 0 ? s.modeScores.p1_s1[idx] : '');
                crossData.push(row);
            });
        }

        // p1_s2
        if (p1s2Items.length > 0) {
            crossData.push(['🎯 องค์ประกอบ 1 ตอนที่ 2']);
            p1s2Items.forEach((item, i) => {
                const row = [item.value];
                s.evaluators.forEach(e => {
                    row.push((e.detailed_scores.p1_s2 || [])[i] || '');
                });
                row.push(s.modeScores.p1_s2[i] || '');
                crossData.push(row);
            });
        }

        // p2
        if (s.requiredItems.some(i => i.element === '2')) {
            crossData.push(['🤝 องค์ประกอบ 2']);
            const row = ['ระดับ'];
            s.evaluators.forEach(e => row.push(e.detailed_scores.p2 || ''));
            row.push(s.modeScores.p2 || '');
            crossData.push(row);
        }

        // p3
        if (p3Items.length > 0) {
            crossData.push(['⚖️ องค์ประกอบ 3']);
            p3Items.forEach((item, i) => {
                const row = [`ข้อ ${item.value}`];
                s.evaluators.forEach(e => {
                    row.push((e.detailed_scores.p3 || [])[i] || '');
                });
                row.push(s.modeScores.p3[i] || '');
                crossData.push(row);
            });
        }

        const wsCross = XLSX.utils.aoa_to_sheet(crossData);
        wsCross['!cols'] = crossData[0].map((_, i) => ({ wch: i === 0 ? 20 : 12 }));
        XLSX.utils.book_append_sheet(wb, wsCross, 'ตารางไขว้');

        // ==========================================
        // บันทึกไฟล์
        // ==========================================
        const fileName = `คะแนนรายกรรมการ_${s.evaluateeName.replace(/\s/g, '_')}_${s.subGroupName.replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, fileName);

        Swal.fire({
            icon: 'success',
            title: 'ส่งออก Excel สำเร็จ',
            text: fileName,
            timer: 2000,
            showConfirmButton: false
        });

    } catch (err) {
        console.error('Export error:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// Export Logic Functions
// ==========================================
window.findMode = findMode;
window.calculateCommitteeGroupAverage = calculateCommitteeGroupAverage;
window.calculateTotalScoreFromModeDetails = calculateTotalScoreFromModeDetails;
window.calculateFinalAverageScore = calculateFinalAverageScore;
window.saveFinalScore = saveFinalScore;
window.displayFinalScoreSummary = displayFinalScoreSummary;
window.generateAllFinalScores = generateAllFinalScores;
window.openEvalDetailModal = openEvalDetailModal;
window.closeEvalDetailModal = closeEvalDetailModal;
window.saveFinalScoreFromModal = saveFinalScoreFromModal;
window.printFinalScore = printFinalScore;
window.exportFinalScores = exportFinalScores;
window.generateEvaluationPDF = generateEvaluationPDF;
window.getLevelText = getLevelText;
window.openCommitteeReviewModal = openCommitteeReviewModal;
window.closeCommitteeReviewModal = closeCommitteeReviewModal;
window.loadReviewData = loadReviewData;
window.viewTeacherEvalDetail = viewTeacherEvalDetail;
window.openSelfEvalDetailModal = openSelfEvalDetailModal;
window.validateEvaluationCompleteness = validateEvaluationCompleteness;
window.openSelfReviewModal = openSelfReviewModal;
window.closeSelfReviewModal = closeSelfReviewModal;
window.loadSelfReviewData = loadSelfReviewData;
window.viewSelfEvalDetail = viewSelfEvalDetail;
window.openEvaluatorScoresModal = openEvaluatorScoresModal;
window.closeEvaluatorScoresModal = closeEvaluatorScoresModal;
window.loadEvaluatorScores = loadEvaluatorScores;
window.switchEvaluatorTab = switchEvaluatorTab;
window.viewEvaluatorDetail = viewEvaluatorDetail;
window.editEvaluatorScore = editEvaluatorScore;
window.exportEvaluatorScoresExcel = exportEvaluatorScoresExcel;
window.onReviewGroupChange = onReviewGroupChange;
window.viewDivergentItems = viewDivergentItems;
window.calculateEvaluatorDivergence = calculateEvaluatorDivergence;
window.getScoreDiffColor = getScoreDiffColor;
window.getItemLabel = getItemLabel;

console.log('✅ evaluation_logic.js loaded successfully');