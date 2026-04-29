/**
 * eq_data.js — ข้อมูลแบบประเมิน EQ กรมสุขภาพจิต (อายุ 12–17 ปี)
 * 52 ข้อ, 5 ด้าน, 3 ตัวเลือก (ไม่จริง=1 / จริงบางครั้ง=2 / จริงเสมอ=3)
 */

const EQ_DELAY_DEFAULT = 10; // วินาที (override ได้จาก DB)

// ── 5 ด้านหลัก ──────────────────────────────────────────────
const EQ_DIMENSIONS = [
    { key: 'self_aware',   label: 'ตระหนักรู้ตนเอง',    color: '#6366f1', icon: 'fa-eye',           maxScore: 33 },
    { key: 'self_control', label: 'ควบคุมตนเอง',        color: '#f59e0b', icon: 'fa-hand-fist',      maxScore: 30 },
    { key: 'motivation',   label: 'สร้างแรงจูงใจ',      color: '#10b981', icon: 'fa-bolt',           maxScore: 27 },
    { key: 'empathy',      label: 'เห็นใจผู้อื่น',      color: '#ec4899', icon: 'fa-heart',          maxScore: 30 },
    { key: 'social',       label: 'ทักษะสัมพันธภาพ',    color: '#3b82f6', icon: 'fa-users',          maxScore: 36 },
];
const EQ_TOTAL_MAX = 156;

// ── 52 ข้อคำถาม ───────────────────────────────────────────────
// reverse: true = ข้อกลับคะแนน (ไม่จริง=3, จริงบางครั้ง=2, จริงเสมอ=1)
const EQ_QUESTIONS = [
    // ด้านที่ 1: ตระหนักรู้ตนเอง (11 ข้อ: 1-11)
    { q:1,  dim:'self_aware',   reverse:false, text:'ฉันรู้ว่าตัวเองกำลังรู้สึกอะไรอยู่' },
    { q:2,  dim:'self_aware',   reverse:false, text:'เมื่อโกรธหรือเสียใจ ฉันรู้ว่าทำไมถึงรู้สึกอย่างนั้น' },
    { q:3,  dim:'self_aware',   reverse:false, text:'ฉันรู้จุดเด่นและจุดด้อยของตัวเอง' },
    { q:4,  dim:'self_aware',   reverse:false, text:'เมื่อทำผิดพลาด ฉันยอมรับได้โดยไม่รู้สึกแย่มากนัก' },
    { q:5,  dim:'self_aware',   reverse:true,  text:'ฉันมักไม่รู้ว่าตัวเองกำลังรู้สึกอะไร' },
    { q:6,  dim:'self_aware',   reverse:false, text:'ฉันรู้ว่าสิ่งใดทำให้ฉันรู้สึกดีหรือรู้สึกแย่' },
    { q:7,  dim:'self_aware',   reverse:true,  text:'ฉันมักสับสนกับความรู้สึกของตัวเอง' },
    { q:8,  dim:'self_aware',   reverse:false, text:'ฉันสามารถบอกได้ว่าร่างกายของฉันรู้สึกอย่างไรเมื่อมีอารมณ์ต่างๆ' },
    { q:9,  dim:'self_aware',   reverse:false, text:'ฉันเข้าใจความรู้สึกของตัวเองได้ดี' },
    { q:10, dim:'self_aware',   reverse:false, text:'ฉันสามารถแยกแยะได้ว่าอารมณ์ที่รู้สึกอยู่คืออะไร' },
    { q:11, dim:'self_aware',   reverse:true,  text:'ฉันมักไม่เข้าใจว่าทำไมตัวเองถึงทำสิ่งต่างๆ' },

    // ด้านที่ 2: ควบคุมตนเอง (10 ข้อ: 12-21)
    { q:12, dim:'self_control', reverse:false, text:'เมื่อโกรธมากๆ ฉันสามารถสงบสติอารมณ์ได้' },
    { q:13, dim:'self_control', reverse:true,  text:'เมื่อรู้สึกผิดหวัง ฉันมักระบายอารมณ์ใส่คนรอบข้าง' },
    { q:14, dim:'self_control', reverse:false, text:'ฉันสามารถรอคอยได้โดยไม่รู้สึกหงุดหงิดมากนัก' },
    { q:15, dim:'self_control', reverse:false, text:'เมื่อมีปัญหา ฉันสามารถคิดหาทางออกได้อย่างใจเย็น' },
    { q:16, dim:'self_control', reverse:true,  text:'ฉันมักตัดสินใจโดยใช้อารมณ์มากกว่าเหตุผล' },
    { q:17, dim:'self_control', reverse:false, text:'ฉันสามารถหยุดตัวเองได้เมื่อกำลังจะทำสิ่งที่ไม่ถูกต้อง' },
    { q:18, dim:'self_control', reverse:false, text:'เมื่อเครียด ฉันสามารถผ่อนคลายตัวเองได้' },
    { q:19, dim:'self_control', reverse:true,  text:'ฉันมักทำสิ่งต่างๆ โดยไม่คิดถึงผลที่จะตามมา' },
    { q:20, dim:'self_control', reverse:false, text:'ฉันสามารถควบคุมความอยากในสิ่งที่รู้ว่าไม่ดีสำหรับตัวเองได้' },
    { q:21, dim:'self_control', reverse:false, text:'เมื่อมีเรื่องทำให้ไม่สบายใจ ฉันสามารถปลอบใจตัวเองได้' },

    // ด้านที่ 3: สร้างแรงจูงใจ (9 ข้อ: 22-30)
    { q:22, dim:'motivation',   reverse:false, text:'ฉันตั้งเป้าหมายให้กับตัวเองและพยายามทำให้สำเร็จ' },
    { q:23, dim:'motivation',   reverse:false, text:'เมื่อทำงานหรือเรียนไม่สำเร็จ ฉันยังคงพยายามต่อไป' },
    { q:24, dim:'motivation',   reverse:true,  text:'ฉันมักท้อแท้ง่ายเมื่อเจอปัญหาหรืออุปสรรค' },
    { q:25, dim:'motivation',   reverse:false, text:'ฉันสามารถผลักดันตัวเองให้ทำสิ่งที่ตั้งใจไว้ได้' },
    { q:26, dim:'motivation',   reverse:false, text:'แม้จะเหนื่อย ฉันก็ยังทำสิ่งที่รับผิดชอบให้เสร็จ' },
    { q:27, dim:'motivation',   reverse:false, text:'ฉันมีความมุ่งมั่นในการทำงานหรือเรียนหนังสือ' },
    { q:28, dim:'motivation',   reverse:true,  text:'ฉันมักหยุดทำสิ่งต่างๆ กลางคันเมื่อรู้สึกว่ายาก' },
    { q:29, dim:'motivation',   reverse:false, text:'ฉันสามารถสนใจในสิ่งที่ทำได้แม้จะไม่สนุกนัก' },
    { q:30, dim:'motivation',   reverse:false, text:'ฉันมองว่าความล้มเหลวเป็นโอกาสในการเรียนรู้' },

    // ด้านที่ 4: เห็นใจผู้อื่น (10 ข้อ: 31-40)
    { q:31, dim:'empathy',      reverse:false, text:'ฉันสามารถรับรู้ความรู้สึกของผู้อื่นได้' },
    { q:32, dim:'empathy',      reverse:false, text:'เมื่อเพื่อนเสียใจ ฉันรู้สึกอยากช่วยเหลือ' },
    { q:33, dim:'empathy',      reverse:true,  text:'ฉันไม่ค่อยสนใจว่าคนอื่นรู้สึกอย่างไร' },
    { q:34, dim:'empathy',      reverse:false, text:'ฉันพยายามเข้าใจมุมมองของผู้อื่นก่อนตัดสิน' },
    { q:35, dim:'empathy',      reverse:false, text:'ฉันสังเกตได้เมื่อคนใกล้ชิดรู้สึกไม่สบายใจ' },
    { q:36, dim:'empathy',      reverse:true,  text:'ฉันมักไม่รู้ว่าควรทำอย่างไรเมื่อคนอื่นร้องไห้' },
    { q:37, dim:'empathy',      reverse:false, text:'ฉันสามารถรับรู้อารมณ์ของผู้อื่นจากสีหน้าและท่าทาง' },
    { q:38, dim:'empathy',      reverse:false, text:'ฉันรู้สึกเศร้าเมื่อเห็นผู้อื่นได้รับความเดือดร้อน' },
    { q:39, dim:'empathy',      reverse:true,  text:'ฉันมักนึกถึงความต้องการของตัวเองมากกว่าผู้อื่น' },
    { q:40, dim:'empathy',      reverse:false, text:'ฉันสามารถเข้าใจว่าทำไมคนอื่นถึงรู้สึกแบบนั้น' },

    // ด้านที่ 5: ทักษะสัมพันธภาพ (12 ข้อ: 41-52)
    { q:41, dim:'social',       reverse:false, text:'ฉันสามารถพูดคุยกับคนที่ไม่รู้จักได้อย่างเป็นธรรมชาติ' },
    { q:42, dim:'social',       reverse:false, text:'เพื่อนๆ มักมาปรึกษาฉันเมื่อมีปัญหา' },
    { q:43, dim:'social',       reverse:true,  text:'ฉันมักขัดแย้งกับผู้อื่นบ่อยๆ' },
    { q:44, dim:'social',       reverse:false, text:'ฉันสามารถทำงานร่วมกับผู้อื่นได้ดี' },
    { q:45, dim:'social',       reverse:false, text:'ฉันสามารถแสดงความคิดเห็นต่อผู้อื่นได้อย่างสุภาพ' },
    { q:46, dim:'social',       reverse:true,  text:'ฉันมักมีปัญหาในการสร้างความสัมพันธ์กับผู้อื่น' },
    { q:47, dim:'social',       reverse:false, text:'ฉันสามารถแก้ไขความขัดแย้งกับผู้อื่นได้' },
    { q:48, dim:'social',       reverse:false, text:'ฉันสามารถเป็นผู้นำกลุ่มได้เมื่อจำเป็น' },
    { q:49, dim:'social',       reverse:false, text:'ฉันรู้สึกสบายใจเมื่ออยู่กับกลุ่มเพื่อน' },
    { q:50, dim:'social',       reverse:true,  text:'ฉันมักไม่รู้ว่าจะพูดอะไรในสถานการณ์ทางสังคม' },
    { q:51, dim:'social',       reverse:false, text:'ฉันสามารถให้กำลังใจและช่วยเหลือผู้อื่นได้' },
    { q:52, dim:'social',       reverse:false, text:'ฉันสามารถรักษาความสัมพันธ์กับเพื่อนได้ในระยะยาว' },
];

// ── คำตอบ 3 ตัวเลือก ─────────────────────────────────────────
const EQ_CHOICES = [
    { value: 1, label: 'ไม่จริง',         short: 'ไม่จริง',      color: '#ef4444' },
    { value: 2, label: 'จริงบางครั้ง',   short: 'บางครั้ง',    color: '#f59e0b' },
    { value: 3, label: 'จริงเสมอ',       short: 'จริงเสมอ',   color: '#22c55e' },
];

// ── คำนวณคะแนน ───────────────────────────────────────────────
function calcScore(answers) {
    const dimScores = { self_aware: 0, self_control: 0, motivation: 0, empathy: 0, social: 0 };
    EQ_QUESTIONS.forEach(q => {
        const raw = answers[`q${q.q}`];
        if (raw === undefined || raw === null) return;
        const scored = q.reverse ? (4 - raw) : raw;
        dimScores[q.dim] += scored;
    });

    const total = Object.values(dimScores).reduce((a, b) => a + b, 0);

    const getLevel = (score, maxScore) => {
        const pct = score / maxScore * 100;
        if (pct >= 80) return { level: 'สูงกว่าเกณฑ์', color: '#22c55e', badge: 'bg-green-100 text-green-700' };
        if (pct >= 60) return { level: 'ตามเกณฑ์',     color: '#3b82f6', badge: 'bg-blue-100 text-blue-700' };
        return             { level: 'ต่ำกว่าเกณฑ์',    color: '#ef4444', badge: 'bg-red-100 text-red-700' };
    };

    return {
        self_aware:   { score: dimScores.self_aware,   ...getLevel(dimScores.self_aware,   33) },
        self_control: { score: dimScores.self_control, ...getLevel(dimScores.self_control, 30) },
        motivation:   { score: dimScores.motivation,   ...getLevel(dimScores.motivation,   27) },
        empathy:      { score: dimScores.empathy,      ...getLevel(dimScores.empathy,      30) },
        social:       { score: dimScores.social,       ...getLevel(dimScores.social,       36) },
        total:        { score: total,                  ...getLevel(total, EQ_TOTAL_MAX) },
    };
}

// ── สร้าง payload สำหรับ upsert ──────────────────────────────
function buildAssessmentPayload(studentId, classroomId, academicYear, semester, answers, recorderId=null) {
    const result = calcScore(answers);
    return {
        student_id: studentId, classroom_id: classroomId,
        academic_year: academicYear, semester: semester,
        answers: answers,
        score_self_aware:   result.self_aware.score,
        score_self_control: result.self_control.score,
        score_motivation:   result.motivation.score,
        score_empathy:      result.empathy.score,
        score_social:       result.social.score,
        score_total:        result.total.score,
        level_self_aware:   result.self_aware.level,
        level_self_control: result.self_control.level,
        level_motivation:   result.motivation.level,
        level_empathy:      result.empathy.level,
        level_social:       result.social.level,
        level_total:        result.total.level,
        completed_at:       new Date().toISOString(),
        recorder_id:        recorderId,
    };
}
