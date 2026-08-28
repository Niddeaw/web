// ==========================================
// evaluation_logic.js - คำนวณคะแนน, สรุปผล, Export, PDF, Review
// ==========================================

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

        const { data: members, error: memError } = await db
            .from('eval_committee_members')
            .select('user_id')
            .eq('committee_group_id', subGroupId)
            .eq('is_active', true);

        if (memError) throw memError;

        const evaluatorIds = members.map(m => m.user_id);
        const groupResults = evalResults.filter(r => evaluatorIds.includes(r.evaluator_id));

        if (groupResults.length === 0) return null;

        // ✅ ใช้ MODE แทนค่าเฉลี่ย
        const detailedKeys = ['p1_s1', 'p1_s2', 'p2', 'p3'];
        const modeDetails = {};

        detailedKeys.forEach(key => {
            const allScores = [];
            groupResults.forEach(result => {
                if (result.detailed_scores && result.detailed_scores[key]) {
                    const scores = result.detailed_scores[key];
                    if (Array.isArray(scores)) {
                        scores.forEach(score => {
                            if (typeof score === 'number' && !isNaN(score)) {
                                allScores.push(score);
                            }
                        });
                    } else if (typeof scores === 'number' && !isNaN(scores)) {
                        allScores.push(scores);
                    }
                }
            });
            if (allScores.length > 0) {
                const modeScore = findMode(allScores);
                if (modeScore !== null) {
                    modeDetails[key] = modeScore;
                }
            }
        });

        // คำนวณคะแนนรวมจาก Mode
        const totalScore = calculateTotalScoreFromModeDetails(modeDetails);

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
// คำนวณคะแนนรวมจาก Mode Details
// ==========================================
function calculateTotalScoreFromModeDetails(modeDetails) {
    const academic = evaluateeData?.academic_standing || 'ครู';
    const isAssistant = academic === 'ครูผู้ช่วย';

    let part1Total = 0;
    let part2Total = 0;
    let part3Total = 0;

    // ==========================================
    // องค์ประกอบที่ 1: ประสิทธิภาพและประสิทธิผล (80 คะแนน)
    // ==========================================

    // ตอนที่ 1: ระดับความสำเร็จตามมาตรฐานตำแหน่ง (60 คะแนน)
    if (modeDetails.p1_s1 !== undefined) {
        const p1s1Mode = modeDetails.p1_s1;
        if (isAssistant) {
            // ✅ ครูผู้ช่วย: 14 ข้อ × 4 = 56 คะแนนเต็ม → แปลงเป็น 60 คะแนน
            part1Total += (p1s1Mode * 60) / 56;
        } else {
            // ✅ ครู/ชำนาญการ/ชำนาญการพิเศษ: 15 ข้อ × 4 = 60 คะแนนเต็ม → 60 คะแนน
            part1Total += p1s1Mode;
        }
    }

    // ตอนที่ 2: ระดับความสำเร็จในการพัฒนางานที่เสนอเป็นประเด็นท้าทาย (20 คะแนน)
    if (modeDetails.p1_s2 !== undefined) {
        const p1s2Mode = modeDetails.p1_s2;
        // p1_s2 มี 3 ข้อ (วิธีดำเนินการ 20, เชิงปริมาณ 10, เชิงคุณภาพ 10)
        // คะแนนเต็ม 3x4 = 12 ระดับ → คิดเป็น 20 คะแนน
        part1Total += (p1s2Mode * 20) / 12;
    }

    // ==========================================
    // องค์ประกอบที่ 2: การมีส่วนร่วมในการพัฒนาการศึกษา (10 คะแนน)
    // ==========================================
    if (modeDetails.p2 !== undefined) {
        const p2Mode = modeDetails.p2;
        // ระดับ 1-5 → คะแนน = ระดับ × 2
        part2Total = p2Mode * 2;
    }

    // ==========================================
    // องค์ประกอบที่ 3: วินัย คุณธรรม จริยธรรม (10 คะแนน)
    // ==========================================
    if (modeDetails.p3 !== undefined) {
        if (Array.isArray(modeDetails.p3)) {
            // ถ้าเป็น array (10 ข้อ) ให้รวมแล้วหาร 4
            const sumP3 = modeDetails.p3.reduce((a, b) => a + b, 0);
            part3Total = sumP3 / 4;
        } else {
            // ถ้าเป็นตัวเลขเดียว
            part3Total = modeDetails.p3 / 4;
        }
    }

    // คะแนนรวมทั้งหมด (จำกัดไม่เกิน 100)
    const total = part1Total + part2Total + part3Total;
    return Math.min(Math.max(total, 0), 100);
}

// ==========================================
// คำนวณคะแนนสรุปจากทุกชุดย่อย (ใช้ Mode) - แก้ไขแล้ว
// ==========================================
async function calculateFinalAverageScore(evaluateeId, evalRoundId) {
    try {
        // 1. ดึงผลการประเมินทั้งหมดของผู้ถูกประเมินในรอบนี้
        const { data: evalResults, error } = await db
            .from('eval_results')
            .select('*')
            .eq('evaluatee_id', evaluateeId)
            .eq('eval_round_id', evalRoundId)
            .eq('eval_type', 'committee')
            .eq('status', 'submitted');

        if (error) throw error;

        if (!evalResults || evalResults.length === 0) {
            return null;
        }

        // 2. ดึงชุดย่อยทั้งหมดในรอบนี้
        const { data: subGroups, error: sgError } = await db
            .from('eval_committee_groups')
            .select('id, group_name, selected_sub_items')
            .eq('eval_round_id', evalRoundId)
            .eq('group_type', 'sub')
            .eq('is_active', true);

        if (sgError) throw sgError;

        if (!subGroups || subGroups.length === 0) {
            return null;
        }

        // 3. คำนวณคะแนน Mode ของแต่ละชุดย่อย
        const groupResults = [];

        for (const subGroup of subGroups) {
            // หาสมาชิกในชุดย่อยนี้
            const { data: members, error: memError } = await db
                .from('eval_committee_members')
                .select('user_id')
                .eq('committee_group_id', subGroup.id)
                .eq('is_active', true);

            if (memError) throw memError;

            const evaluatorIds = members.map(m => m.user_id);

            // กรองผลการประเมินของกรรมการในชุดนี้
            const groupEvals = evalResults.filter(r => evaluatorIds.includes(r.evaluator_id));

            if (groupEvals.length === 0) {
                continue;
            }

            // ----- คำนวณ Mode ของแต่ละข้อในชุดนี้ -----
            const detailedKeys = ['p1_s1', 'p1_s2', 'p2', 'p3'];
            const modeDetails = {};

            detailedKeys.forEach(key => {
                const allScores = [];

                groupEvals.forEach(result => {
                    if (result.detailed_scores && result.detailed_scores[key] !== undefined) {
                        const scores = result.detailed_scores[key];
                        if (Array.isArray(scores)) {
                            scores.forEach(score => {
                                if (typeof score === 'number' && !isNaN(score)) {
                                    allScores.push(score);
                                }
                            });
                        } else if (typeof scores === 'number' && !isNaN(scores)) {
                            allScores.push(scores);
                        }
                    }
                });

                if (allScores.length > 0) {
                    const modeScore = findMode(allScores);
                    if (modeScore !== null) {
                        modeDetails[key] = modeScore;
                    }
                }
            });

            // คำนวณคะแนนรวมของชุดนี้จาก Mode Details
            const totalScore = calculateTotalScoreFromModeDetails(modeDetails);

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

        if (groupResults.length === 0) {
            return null;
        }

        // 4. รวมคะแนน Mode จากทุกชุดย่อย เพื่อหาคะแนนสรุป final
        const finalModeDetails = {};
        const detailedKeys = ['p1_s1', 'p1_s2', 'p2', 'p3'];

        detailedKeys.forEach(key => {
            const allModes = [];

            groupResults.forEach(g => {
                if (g.detailed_scores && g.detailed_scores[key] !== undefined) {
                    allModes.push(g.detailed_scores[key]);
                }
            });

            if (allModes.length > 0) {
                const finalMode = findMode(allModes);
                if (finalMode !== null) {
                    finalModeDetails[key] = finalMode;
                }
            }
        });

        // คำนวณคะแนนรวมสุดท้ายจาก finalModeDetails
        const finalTotal = calculateTotalScoreFromModeDetails(finalModeDetails);

        // 5. สรุปผลลัพธ์ (ลบ all_evaluator_scores ออก)
        return {
            total_evaluators: evalResults.length,
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
// บันทึกคะแนนสรุป final (ใช้ Mode) - แก้ไขแล้ว
// ==========================================
async function saveFinalScore(evaluateeId, evalRoundId) {
    Swal.fire({
        title: 'กำลังคำนวณคะแนนสรุป (โหมดคะแนน)...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        const finalResult = await calculateFinalAverageScore(evaluateeId, evalRoundId);

        if (!finalResult) {
            Swal.close();
            return Swal.fire('แจ้งเตือน', 'ยังไม่มีข้อมูลการประเมินจากกรรมการ', 'warning');
        }

        if (finalResult.committee_groups === 0) {
            Swal.close();
            return Swal.fire('แจ้งเตือน', 'ไม่พบข้อมูลการประเมินจากกรรมการในชุดใดเลย', 'warning');
        }

        // ✅ เตรียมข้อมูลสำหรับบันทึก (ลบ all_evaluator_scores ออก)
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

        // ตรวจสอบว่ามีข้อมูลเดิมหรือไม่
        const { data: existing, error: checkError } = await db
            .from('eval_final_results')
            .select('id')
            .eq('evaluatee_id', evaluateeId)
            .eq('eval_round_id', evalRoundId)
            .maybeSingle();

        if (checkError) throw checkError;

        let result;
        if (existing) {
            const { data, error: updateError } = await db
                .from('eval_final_results')
                .update(payload)
                .eq('id', existing.id)
                .select();

            if (updateError) throw updateError;
            result = data;
        } else {
            const { data, error: insertError } = await db
                .from('eval_final_results')
                .insert([payload])
                .select();

            if (insertError) throw insertError;
            result = data;
        }

        Swal.close();

        // แสดงผลลัพธ์
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
            const details = finalResult.detailed_scores;
            if (details.p1_s1 !== undefined) {
                detailScoresHtml += `<div class="flex justify-between text-sm"><span>องค์ประกอบที่ 1 (ตอนที่ 1):</span><span class="font-bold">${details.p1_s1}</span></div>`;
            }
            if (details.p1_s2 !== undefined) {
                detailScoresHtml += `<div class="flex justify-between text-sm"><span>องค์ประกอบที่ 1 (ตอนที่ 2):</span><span class="font-bold">${details.p1_s2}</span></div>`;
            }
            if (details.p2 !== undefined) {
                detailScoresHtml += `<div class="flex justify-between text-sm"><span>องค์ประกอบที่ 2:</span><span class="font-bold">${details.p2}</span></div>`;
            }
            if (details.p3 !== undefined) {
                const p3Display = Array.isArray(details.p3) ? details.p3.join(', ') : details.p3;
                detailScoresHtml += `<div class="flex justify-between text-sm"><span>องค์ประกอบที่ 3:</span><span class="font-bold">${p3Display}</span></div>`;
            }
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

        return result;

    } catch (err) {
        console.error('Error saving final score:', err);
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

        return null;
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
            if (score >= 80) return { text: 'ดีมาก', color: 'emerald' };
            if (score >= 70) return { text: 'ดี', color: 'blue' };
            if (score >= 60) return { text: 'พอใช้', color: 'yellow' };
            return { text: 'ควรปรับปรุง', color: 'red' };
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
// สรุปผลคะแนนทั้งหมดสำหรับ Admin
// ==========================================
async function generateAllFinalScores(evalRoundId) {
    if (!evalRoundId) {
        return Swal.fire('แจ้งเตือน', 'ไม่พบรอบการประเมิน', 'warning');
    }

    Swal.fire({
        title: 'กำลังสรุปผลคะแนนทั้งหมด...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        const { data: evalResults, error } = await db
            .from('eval_results')
            .select('evaluatee_id')
            .eq('eval_round_id', evalRoundId)
            .eq('eval_type', 'committee')
            .eq('status', 'submitted');

        if (error) throw error;

        if (!evalResults || evalResults.length === 0) {
            Swal.close();
            return Swal.fire('แจ้งเตือน', 'ไม่มีข้อมูลการประเมินในรอบนี้', 'warning');
        }

        const uniqueEvaluatees = [...new Set(evalResults.map(r => r.evaluatee_id))];
        let successCount = 0;
        let failCount = 0;
        let failedList = [];

        for (const evaluateeId of uniqueEvaluatees) {
            try {
                const result = await saveFinalScore(evaluateeId, evalRoundId);
                if (result) {
                    successCount++;
                } else {
                    failCount++;
                    const { data: user } = await db
                        .from('core_personnel')
                        .select('first_name, last_name')
                        .eq('id', evaluateeId)
                        .single();
                    failedList.push(user ? `${user.first_name} ${user.last_name}` : evaluateeId);
                }
            } catch (err) {
                console.error(`Error saving for ${evaluateeId}:`, err);
                failCount++;
                const { data: user } = await db
                    .from('core_personnel')
                    .select('first_name, last_name')
                    .eq('id', evaluateeId)
                    .single();
                failedList.push(user ? `${user.first_name} ${user.last_name}` : evaluateeId);
            }
        }

        Swal.close();

        let message = `
            <div class="text-left space-y-2">
                <p>ผู้ถูกประเมินทั้งหมด: <b>${uniqueEvaluatees.length}</b> คน</p>
                <p>✅ สำเร็จ: <span class="text-green-600">${successCount}</span> คน</p>
                <p>❌ ล้มเหลว: <span class="text-red-600">${failCount}</span> คน</p>
        `;

        if (failedList.length > 0) {
            message += `<div class="mt-3 text-sm text-red-500">รายชื่อที่ล้มเหลว:<br>${failedList.join('<br>')}</div>`;
        }

        message += `</div>`;

        await Swal.fire({
            icon: successCount === uniqueEvaluatees.length ? 'success' : 'warning',
            title: successCount === uniqueEvaluatees.length ? '✅ สรุปผลเรียบร้อย!' : '⚠️ สรุปผลบางส่วน',
            html: message,
            confirmButtonText: 'ตกลง'
        });

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
        await saveFinalScore(evaluateeId, evalRoundId);
        await openEvalDetailModal(evaluateeId, evalRoundId);
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
            'ระดับคุณภาพ': getLevelText(r.average_score),
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
// ✅ [ฟังก์ชันใหม่] สร้างไฟล์ PDF จากเทมเพลต (ประเมินตนเอง)
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

    // 3. เลือก Slide Template ID ตามวิทยฐานะ
    const academic = currentUser.academic_standing || 'ครู';
    let templateId = '';
    if (academic === 'ครูผู้ช่วย') templateId = config.slide_template_1;
    else if (academic === 'ครู') templateId = config.slide_template_2;
    else if (academic === 'ครูชำนาญการ') templateId = config.slide_template_3;
    else if (academic === 'ครูชำนาญการพิเศษ') templateId = config.slide_template_4;

    if (!templateId) {
        return Swal.fire('ผิดพลาด', `ยังไม่ได้ตั้งค่า Slide Template สำหรับวิทยฐานะ "${academic}"`, 'error');
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

    // 5. ดึงข้อมูลโรงเรียน (สำหรับชื่อผู้อำนวยการ ฯลฯ)
    const { data: school } = await db.from('core_school_info').select('*').single();

    // 6. เตรียมข้อมูลแทนที่ (Placeholders)
    const details = evalResult.detailed_scores || {};

    // คำนวณคะแนนองค์ประกอบที่ 1 (คำนวณตามสูตรเดียวกับฟอร์ม)
    const isAssistant = academic === 'ครูผู้ช่วย';
    let part1Sec1 = 0, part1Sec2 = 0, part1Total = 0;
    if (Array.isArray(details.p1_s1)) {
        const rawSum = details.p1_s1.reduce((a, b) => a + b, 0);
        part1Sec1 = isAssistant ? (rawSum * 80) / 56 : (rawSum / 60) * 60;
    }
    if (Array.isArray(details.p1_s2)) {
        const rawSum = details.p1_s2.reduce((a, b) => a + b, 0);
        part1Sec2 = (rawSum * 20) / 40;
    }
    part1Total = part1Sec1 + part1Sec2;

    // คำนวณองค์ประกอบที่ 2
    let part2Score = 0;
    if (details.p2) part2Score = parseInt(details.p2) * 2;

    // คำนวณองค์ประกอบที่ 3
    let part3Score = 0, p3Raw = 0;
    if (Array.isArray(details.p3)) {
        p3Raw = details.p3.reduce((a, b) => a + b, 0);
        part3Score = p3Raw / 4;
    }

    const totalScore = evalResult.total_score || (part1Total + part2Score + part3Score);
    const level = getLevelText(totalScore);

    // 7. สร้าง replacements object
    const thMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    const currentDate = new Date();
    const dateStr = `วันที่ ${currentDate.getDate()} เดือน ${thMonths[currentDate.getMonth()]} พ.ศ. ${currentDate.getFullYear() + 543}`;

    const replacements = {
        // ข้อมูลผู้ถูกประเมิน
        "{{FULL_NAME}}": `${currentUser.prefix || ''}${currentUser.first_name} ${currentUser.last_name}`,
        "{{ACADEMIC_STANDING}}": academic,
        "{{POSITION}}": currentUser.position || 'ครู',
        "{{DEPARTMENT}}": currentUser.department || '-',
        "{{TERM}}": `ภาคเรียนที่ ${currentTermData.current_semester} / ${currentTermData.current_academic_year}`,
        "{{DATE}}": dateStr,

        // คะแนนองค์ประกอบที่ 1
        "{{P1_S1_SCORE}}": part1Sec1.toFixed(2),
        "{{P1_S2_SCORE}}": part1Sec2.toFixed(2),
        "{{P1_TOTAL}}": part1Total.toFixed(2),
        "{{P1_S1_RAW}}": Array.isArray(details.p1_s1) ? details.p1_s1.join(', ') : '-',
        "{{P1_S2_RAW}}": Array.isArray(details.p1_s2) ? details.p1_s2.join(', ') : '-',

        // คะแนนองค์ประกอบที่ 2
        "{{P2_LEVEL}}": details.p2 ? `ระดับ ${details.p2}` : '-',
        "{{P2_SCORE}}": part2Score.toFixed(2),

        // คะแนนองค์ประกอบที่ 3
        "{{P3_RAW}}": Array.isArray(details.p3) ? details.p3.join(', ') : '-',
        "{{P3_SCORE}}": part3Score.toFixed(2),

        // คะแนนรวมและระดับ
        "{{TOTAL_SCORE}}": totalScore.toFixed(2),
        "{{LEVEL}}": level.text,

        // ลายเซ็น (ถ้ามี)
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
// ฟังก์ชันแสดงระดับคุณภาพ
// ==========================================
function getLevelText(score) {
    if (score >= 80) {
        return {
            text: 'ดีมาก',
            color: 'bg-emerald-100 text-emerald-700 border-emerald-200'
        };
    }
    if (score >= 70) {
        return {
            text: 'ดี',
            color: 'bg-blue-100 text-blue-700 border-blue-200'
        };
    }
    if (score >= 60) {
        return {
            text: 'พอใช้',
            color: 'bg-yellow-100 text-yellow-700 border-yellow-200'
        };
    }
    return {
        text: 'ควรปรับปรุง',
        color: 'bg-red-100 text-red-700 border-red-200'
    };
}

// ==========================================
// ตรวจสอบการประเมินของคณะกรรมการ
// ==========================================

// ตัวแปรเก็บข้อมูล
let reviewDataTable = null;
let reviewTeachers = [];

// ==========================================
// เปิด Modal ตรวจสอบการประเมิน
// ==========================================
async function openCommitteeReviewModal() {
    const modal = document.getElementById('committeeReviewModal');
    modal.classList.remove('hidden');

    await loadReviewCommitteeGroups();
}

// ==========================================
// ปิด Modal ตรวจสอบการประเมิน
// ==========================================
function closeCommitteeReviewModal() {
    const modal = document.getElementById('committeeReviewModal');
    modal.classList.add('hidden');

    // ทำลาย DataTable
    if (reviewDataTable) {
        reviewDataTable.destroy();
        reviewDataTable = null;
    }
}

// ==========================================
// โหลดชุดคณะกรรมการสำหรับ Modal ตรวจสอบ
// ==========================================
// ใน evaluation_logic.js
async function loadReviewCommitteeGroups() {
    try {
        if (!currentEvalRound) {
            return Swal.fire('แจ้งเตือน', 'ไม่พบรอบการประเมิน', 'warning');
        }

        const select = document.getElementById('review_committee_group');
        const deptSelect = document.getElementById('review_department');

        select.innerHTML = '<option value="">-- เลือกชุด --</option>';
        deptSelect.innerHTML = '<option value="">-- เลือกกลุ่มสาระ --</option>';

        let mySubGroups;
        // ✅ ผอ. และ Admin เห็นทุกชุด
        if (['super_admin', 'admin', 'director'].includes(currentUser.role)) {
            const { data: allSubs } = await db
                .from('eval_committee_groups')
                .select('*, eval_committee_targets(*)')
                .eq('eval_round_id', currentEvalRound.id)
                .eq('group_type', 'sub')
                .eq('is_active', true);
            mySubGroups = allSubs || [];
        } else {
            mySubGroups = await getUserCommitteeSubGroups(currentUser.id, currentEvalRound.id);
        }

        if (!mySubGroups || mySubGroups.length === 0) {
            select.innerHTML = '<option value="">ไม่มีชุดคณะกรรมการ</option>';
            return;
        }

        const structure = await loadCommitteeStructure(currentEvalRound.id);
        const mainGroups = structure.filter(g => g.group_type === 'main');

        for (const mainGroup of mainGroups) {
            const subGroups = mySubGroups.filter(sg => sg.parent_group_id === mainGroup.id);
            if (subGroups.length === 0) continue;

            const optgroup = document.createElement('optgroup');
            optgroup.label = mainGroup.group_name;

            subGroups.forEach(sub => {
                const option = document.createElement('option');
                option.value = sub.id;
                option.textContent = `${sub.group_name} (${sub.members?.length || 0} คน)`;
                option.dataset.targets = JSON.stringify(sub.targets || []);
                option.dataset.selectedSubItems = JSON.stringify(sub.selected_sub_items || []);
                optgroup.appendChild(option);
            });

            select.appendChild(optgroup);
        }

        // event listener เดิม
        select.addEventListener('change', function () {
            const selectedOption = this.options[this.selectedIndex];
            if (selectedOption && selectedOption.dataset) {
                const targets = JSON.parse(selectedOption.dataset.targets || '[]');
                const deptSelect = document.getElementById('review_department');
                deptSelect.innerHTML = '<option value="">-- เลือกกลุ่มสาระ --</option>';
                const departmentTargets = targets.filter(t => t.target_type === 'department');
                departmentTargets.forEach(t => {
                    deptSelect.innerHTML += `<option value="${t.target_value}">${t.target_value}</option>`;
                });
                if (departmentTargets.length === 1) {
                    deptSelect.value = departmentTargets[0].target_value;
                }
            }
        });

    } catch (err) {
        console.error('Error loading review committee groups:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// โหลดข้อมูลสำหรับตรวจสอบ
// ==========================================
async function loadReviewData() {
    const subGroupId = document.getElementById('review_committee_group').value;
    const department = document.getElementById('review_department').value;

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
        const validStandings = ['ครูผู้ช่วย', 'ครู', 'ครูชำนาญการ', 'ครูชำนาญการพิเศษ'];
        const { data: teachers, error: tErr } = await db
            .from('core_personnel')
            .select('id, prefix, first_name, last_name, academic_standing, department')
            .eq('department', department)
            .in('academic_standing', validStandings)
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
                    <td class="p-2 border">${r.evaluator_id?.substring(0, 8) || '-'}</td>
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

console.log('✅ evaluation_logic.js loaded successfully');