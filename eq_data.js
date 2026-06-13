/**
 * eq_data.js — ข้อมูลแบบประเมิน EQ กรมสุขภาพจิต (อายุ 12–17 ปี)
 * 52 ข้อ, 4 ตัวเลือก, 9 ด้านย่อย
 */

const EQ_DELAY_DEFAULT = 10; // วินาที (override ได้จาก DB)

// ── 9 ด้านย่อย ──────────────────────────────────────────────
const EQ_DIMENSIONS_V2 = [
    { key: 'self_control',      label: '1.1 ควบคุมตนเอง',         maxScore: 24, group: 'good' },
    { key: 'empathy',           label: '1.2 เห็นใจผู้อื่น',         maxScore: 24, group: 'good' },
    { key: 'responsibility',    label: '1.3 รับผิดชอบ',            maxScore: 24, group: 'good' },
    { key: 'motivation',        label: '2.1 มีแรงจูงใจ',           maxScore: 24, group: 'skill' },
    { key: 'problem_solving',   label: '2.2 ตัดสินใจและแก้ปัญหา',   maxScore: 24, group: 'skill' },
    { key: 'relationship',      label: '2.3 สัมพันธภาพ',           maxScore: 24, group: 'skill' },
    { key: 'self_esteem',       label: '3.1 ภูมิใจตนเอง',          maxScore: 16, group: 'happy' },
    { key: 'life_satisfaction', label: '3.2 พอใจชีวิต',            maxScore: 24, group: 'happy' },
    { key: 'peace_of_mind',     label: '3.3 สุขสงบทางใจ',         maxScore: 24, group: 'happy' }
];

// ── คำตอบ 4 ตัวเลือก ─────────────────────────────────────────
const EQ_CHOICES = [
    { value: 1, label: 'ไม่จริง',         short: 'ไม่จริง',     color: '#ef4444' },
    { value: 2, label: 'จริงบางครั้ง',    short: 'บางครั้ง',    color: '#f59e0b' },
    { value: 3, label: 'ค่อนข้างจริง',    short: 'ค่อนข้างจริง', color: '#3b82f6' },
    { value: 4, label: 'จริงมาก',         short: 'จริงมาก',    color: '#22c55e' }
];

// ── 52 ข้อคำถาม (group: 1 = ตรง, 2 = กลับ) ───────────────────
const EQ_QUESTIONS_V2 = [
    // 1.1 ควบคุมตนเอง (ข้อ 1-6)
    { q:1,  dim:'self_control',      group:1, text:'เวลาโกรธไม่สบายใจ ฉันไม่รู้ว่าเกิดอะไรขึ้น' },
    { q:2,  dim:'self_control',      group:1, text:'ฉันบอกไม่ได้ว่าอะไรทำให้โกรธ' },
    { q:3,  dim:'self_control',      group:1, text:'เมื่อถูกขัดใจ ฉันมักรู้หงุดหงิดจนควบคุมอารมณ์ไม่ได้' },
    { q:4,  dim:'self_control',      group:2, text:'ฉันสามารถคอยเพื่อให้บรรลุเป้าหมายเล็กน้อย' },
    { q:5,  dim:'self_control',      group:1, text:'ฉันมักมีปฏิกิริยาโต้ตอบรุนแรงต่อปัญหาเล็กน้อย' },
    { q:6,  dim:'self_control',      group:2, text:'เมื่อถูกบังคับให้ทำในสิ่งที่ไม่ชอบ ฉันจะอธิบายเหตุผลจนผู้อื่นยอมรับได้' },
    // 1.2 เห็นใจผู้อื่น (ข้อ 7-12)
    { q:7,  dim:'empathy',           group:2, text:'ฉันสังเกตได้เมื่อคนใกล้ชิดมีอารมณ์เปลี่ยนแปลง' },
    { q:8,  dim:'empathy',           group:1, text:'ฉันไม่สนใจกับความทุกข์ของผู้อื่นที่ไม่รู้จัก' },
    { q:9,  dim:'empathy',           group:1, text:'ฉันไม่ยอมรับในสิ่งที่ผู้อื่นทำต่างจากที่ฉันคิด' },
    { q:10, dim:'empathy',           group:2, text:'ฉันยอมรับได้ว่าผู้อื่นก็อาจมีเหตุผลที่จะไม่พอใจการกระทำของฉัน' },
    { q:11, dim:'empathy',           group:1, text:'ฉันรู้สึกว่าผู้อื่นชอบเรียกร้องความสนใจมากเกินไป' },
    { q:12, dim:'empathy',           group:2, text:'แม้จะมีภาระที่ต้องทำ ฉันก็ยินดีรับฟังทุกข์ของผู้อื่นที่ต้องการความช่วยเหลือ' },
    // 1.3 รับผิดชอบ (ข้อ 13-18)
    { q:13, dim:'responsibility',    group:1, text:'เป็นเรื่องธรรมดาที่จะเอาเปรียบผู้อื่นเมื่อมีโอกาส' },
    { q:14, dim:'responsibility',    group:2, text:'ฉันเห็นคุณค่าในน้ำใจที่ผู้อื่นมีต่อฉัน' },
    { q:15, dim:'responsibility',    group:2, text:'เมื่อทำผิด ฉันสามารถกล่าวคำขอโทษผู้อื่นได้' },
    { q:16, dim:'responsibility',    group:1, text:'ฉันยอมรับข้อผิดพลาดของผู้อื่นได้ยาก' },
    { q:17, dim:'responsibility',    group:2, text:'ถึงแม้จะต้องเสียประโยชน์ส่วนตัวไปบ้าง ฉันก็จะยินดีทำเพื่อส่วนรวม' },
    { q:18, dim:'responsibility',    group:1, text:'ฉันรู้สึกลำบากใจในการทำสิ่งใดสิ่งหนึ่งเพื่อผู้อื่น' },
    // 2.1 มีแรงจูงใจ (ข้อ 19-24)
    { q:19, dim:'motivation',        group:1, text:'ฉันไม่รู้ว่าฉันเก่งเรื่องอะไร' },
    { q:20, dim:'motivation',        group:2, text:'แม้จะเป็นงานยาก ฉันก็มั่นใจว่าสามารถทำได้' },
    { q:21, dim:'motivation',        group:1, text:'เมื่อทำสิ่งใดไม่สำเร็จ ฉันรู้สึกหมดกำลังใจ' },
    { q:22, dim:'motivation',        group:2, text:'ฉันรู้สึกมีคุณค่าเมื่อได้ทำสิ่งต่าง ๆ อย่างเต็มความสามารถ' },
    { q:23, dim:'motivation',        group:2, text:'เมื่อต้องเผชิญกับอุปสรรคและความผิดหวัง ฉันก็จะไม่ยอมแพ้' },
    { q:24, dim:'motivation',        group:1, text:'เมื่อเริ่มทำสิ่งใดสิ่งหนึ่ง ฉันมักทำต่อไปไม่สำเร็จ' },
    // 2.2 ตัดสินใจและแก้ปัญหา (ข้อ 25-30)
    { q:25, dim:'problem_solving',   group:2, text:'ฉันพยายามหาสาเหตุที่แท้จริงของปัญหาโดยไม่คิดเอาเองตามใจชอบ' },
    { q:26, dim:'problem_solving',   group:1, text:'บ่อยครั้งที่ฉันไม่รู้สึกว่าอะไรทำให้ฉันไม่มีความสุข' },
    { q:27, dim:'problem_solving',   group:1, text:'ฉันรู้สึกว่าการตัดสินใจแก้ปัญหาเป็นเรื่องยากสำหรับฉัน' },
    { q:28, dim:'problem_solving',   group:2, text:'เมื่อต้องทำอะไรหลายอย่างในเวลาเดียวกัน ฉันตัดสินใจได้ว่าจะทำอะไรก่อนหลัง' },
    { q:29, dim:'problem_solving',   group:1, text:'ฉันลำบากใจเมื่อต้องอยู่กับคนแปลกหน้าหรือคนที่ไม่คุ้นเคย' },
    { q:30, dim:'problem_solving',   group:1, text:'ฉันทนไม่ได้เมื่อต้องอยู่ในสังคมที่กฎระเบียบขัดกับความเคยชินของฉัน' },
    // 2.3 สัมพันธภาพ (ข้อ 31-36)
    { q:31, dim:'relationship',      group:2, text:'ฉันทำความรู้จักคนอื่นได้ง่าย' },
    { q:32, dim:'relationship',      group:2, text:'ฉันมีเพื่อนสนิทหลายคนที่คบกันมานาน' },
    { q:33, dim:'relationship',      group:1, text:'ฉันไม่กล้าบอกความต้องการของฉันให้ผู้อื่นรู้' },
    { q:34, dim:'relationship',      group:2, text:'ฉันทำในสิ่งที่ต้องการโดยไม่ทำให้ผู้อื่นเดือดร้อน' },
    { q:35, dim:'relationship',      group:1, text:'เป็นเรื่องยากสำหรับฉันที่จะโต้แย้งกับผู้อื่น แม้จะมีเหตุผลเพียงพอ' },
    { q:36, dim:'relationship',      group:2, text:'เมื่อไม่เห็นด้วยกับผู้อื่น ฉันสามารถอธิบายเหตุผลที่เขายอมรับได้' },
    // 3.1 ภูมิใจตนเอง (ข้อ 37-40)
    { q:37, dim:'self_esteem',       group:1, text:'ฉันรู้สึกว่าด้อยกว่าผู้อื่น' },
    { q:38, dim:'self_esteem',       group:2, text:'ฉันทำหน้าที่ได้ดี ไม่ว่าจะอยู่ในบทบาทใด' },
    { q:39, dim:'self_esteem',       group:2, text:'ฉันสามารถทำงานที่ได้รับมอบหมายได้ดีที่สุด' },
    { q:40, dim:'self_esteem',       group:1, text:'ฉันไม่มั่นใจในการทำงานที่ยากลำบาก' },
    // 3.2 พอใจชีวิต (ข้อ 41-46)
    { q:41, dim:'life_satisfaction', group:2, text:'แม้สถานการณ์จะเลวร้าย ฉันก็มีความหวังว่าจะดีขึ้น' },
    { q:42, dim:'life_satisfaction', group:2, text:'ทุกปัญหามักมีทางออกเสมอ' },
    { q:43, dim:'life_satisfaction', group:2, text:'เมื่อมีเรื่องที่ทำให้เครียด ฉันมักปรับเปลี่ยนให้เป็นเรื่องผ่อนคลายหรือสนุกสนาน' },
    { q:44, dim:'life_satisfaction', group:2, text:'ฉันสนุกสนานทุกครั้งกับกิจกรรมในวันสุดสัปดาห์และวันหยุดพักผ่อน' },
    { q:45, dim:'life_satisfaction', group:1, text:'ฉันรู้สึกไม่พอใจที่ผู้อื่นได้รับสิ่งดี ๆ มากกว่าฉัน' },
    { q:46, dim:'life_satisfaction', group:2, text:'ฉันพอใจกับสิ่งที่ฉันเป็นอยู่' },
    // 3.3 สุขสงบทางใจ (ข้อ 47-52)
    { q:47, dim:'peace_of_mind',     group:1, text:'ฉันไม่รู้ว่าจะหาอะไรทำ เมื่อรู้สึกเบื่อ' },
    { q:48, dim:'peace_of_mind',     group:2, text:'เมื่อว่างเว้นจากภาระหน้าที่ ฉันจะทำในสิ่งที่ฉันชอบ' },
    { q:49, dim:'peace_of_mind',     group:2, text:'เมื่อรู้สึกไม่สบายใจ ฉันมีวิธีผ่อนคลายอารมณ์ได้' },
    { q:50, dim:'peace_of_mind',     group:2, text:'ฉันสามารถผ่อนคลายตนเองได้ แม้เหน็ดเหนื่อยจากภาระหน้าที่' },
    { q:51, dim:'peace_of_mind',     group:1, text:'ฉันไม่สามารถทำใจให้เป็นสุขได้จนกว่าจะได้ทุกสิ่งที่ต้องการ' },
    { q:52, dim:'peace_of_mind',     group:1, text:'ฉันมักทุกข์ร้อนเรื่องเล็ก ๆ น้อย ๆ ที่เกิดขึ้นเสมอ' }
];

// ── เกณฑ์การแปลผลตามเอกสาร ────────────────────────────────
const EQ_NORM = {
    good:      { min:48, max:58, totalMax:72 },
    skill:     { min:45, max:57, totalMax:72 },
    happy:     { min:40, max:55, totalMax:64 },
    total:     { min:140, max:170, totalMax:208 },
    self_control:      { min:13, max:17, totalMax:24 },
    empathy:           { min:16, max:20, totalMax:24 },
    responsibility:    { min:16, max:22, totalMax:24 },
    motivation:        { min:14, max:20, totalMax:24 },
    problem_solving:   { min:13, max:19, totalMax:24 },
    relationship:      { min:14, max:20, totalMax:24 },
    self_esteem:       { min:9,  max:13, totalMax:16 },
    life_satisfaction: { min:16, max:22, totalMax:24 },
    peace_of_mind:     { min:15, max:21, totalMax:24 }
};

function interpretScore(score, dimKey) {
    const norm = EQ_NORM[dimKey];
    if (!norm) return 'เกณฑ์ปกติ';
    if (score < norm.min) return 'ต่ำกว่าเกณฑ์';
    if (score <= norm.max) return 'เกณฑ์ปกติ';
    return 'สูงกว่าเกณฑ์';
}

// ── คำนวณคะแนนจาก answers (value 1-4) ─────────────────────
function calcScoreV2(answers) {
    let scores = {
        self_control: 0, empathy: 0, responsibility: 0,
        motivation: 0, problem_solving: 0, relationship: 0,
        self_esteem: 0, life_satisfaction: 0, peace_of_mind: 0
    };
    
    for (const q of EQ_QUESTIONS_V2) {
        const raw = answers[`q${q.q}`];
        if (raw === undefined || raw === null) continue;
        let scored;
        if (q.group === 1) {
            scored = raw;           // 1->1, 2->2, 3->3, 4->4
        } else {
            scored = 5 - raw;       // 1->4, 2->3, 3->2, 4->1
        }
        scores[q.dim] += scored;
    }
    
    const goodScore = scores.self_control + scores.empathy + scores.responsibility;
    const skillScore = scores.motivation + scores.problem_solving + scores.relationship;
    const happyScore = scores.self_esteem + scores.life_satisfaction + scores.peace_of_mind;
    const totalScore = goodScore + skillScore + happyScore;
    
    return {
        ...scores,
        good: goodScore,
        skill: skillScore,
        happy: happyScore,
        total: totalScore,
        level_good: interpretScore(goodScore, 'good'),
        level_skill: interpretScore(skillScore, 'skill'),
        level_happy: interpretScore(happyScore, 'happy'),
        level_total: interpretScore(totalScore, 'total'),
        level_self_control: interpretScore(scores.self_control, 'self_control'),
        level_empathy: interpretScore(scores.empathy, 'empathy'),
        level_responsibility: interpretScore(scores.responsibility, 'responsibility'),
        level_motivation: interpretScore(scores.motivation, 'motivation'),
        level_problem_solving: interpretScore(scores.problem_solving, 'problem_solving'),
        level_relationship: interpretScore(scores.relationship, 'relationship'),
        level_self_esteem: interpretScore(scores.self_esteem, 'self_esteem'),
        level_life_satisfaction: interpretScore(scores.life_satisfaction, 'life_satisfaction'),
        level_peace_of_mind: interpretScore(scores.peace_of_mind, 'peace_of_mind')
    };
}

// ── สร้าง payload สำหรับ upsert เข้า eq_assessments ─────────
function buildAssessmentPayloadV2(studentId, classroomId, academicYear, semester, answers, recorderId = null) {
    const result = calcScoreV2(answers);
    return {
        student_id: studentId,
        classroom_id: classroomId,
        academic_year: academicYear,
        semester: semester,
        answers: answers,
        score_self_control: result.self_control,
        score_empathy: result.empathy,
        score_responsibility: result.responsibility,
        score_motivation: result.motivation,
        score_problem_solving: result.problem_solving,
        score_relationship: result.relationship,
        score_self_esteem: result.self_esteem,
        score_life_satisfaction: result.life_satisfaction,
        score_peace_of_mind: result.peace_of_mind,
        score_good: result.good,
        score_skill: result.skill,
        score_happy: result.happy,
        score_total: result.total,
        level_good: result.level_good,
        level_skill: result.level_skill,
        level_happy: result.level_happy,
        level_total: result.level_total,
        level_self_control: result.level_self_control,
        level_empathy: result.level_empathy,
        level_responsibility: result.level_responsibility,
        level_motivation: result.level_motivation,
        level_problem_solving: result.level_problem_solving,
        level_relationship: result.level_relationship,
        level_self_esteem: result.level_self_esteem,
        level_life_satisfaction: result.level_life_satisfaction,
        level_peace_of_mind: result.level_peace_of_mind,
        completed_at: new Date().toISOString(),
        recorder_id: recorderId
    };
}