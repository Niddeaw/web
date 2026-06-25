/**
 * mit_data.js — ข้อมูลแบบประเมินพหุปัญญา 8 ด้าน (40 ข้อ)
 * อ้างอิงทฤษฎีของ Howard Gardner
 */
const MI_DELAY_DEFAULT = 10;

// 8 ด้าน
const MI_DIMENSIONS = [
    { key: 'linguistic', label: 'ภาษาและการสื่อสาร', maxScore: 25 },
    { key: 'logical_mathematical', label: 'ตรรกศาสตร์และคณิตศาสตร์', maxScore: 25 },
    { key: 'visual_spatial', label: 'มิติสัมพันธ์และจินตนาการ', maxScore: 25 },
    { key: 'bodily_kinesthetic', label: 'ร่างกายและการเคลื่อนไหว', maxScore: 25 },
    { key: 'musical', label: 'ดนตรีและจังหวะ', maxScore: 25 },
    { key: 'interpersonal', label: 'มนุษยสัมพันธ์และการเข้าสังคม', maxScore: 25 },
    { key: 'intrapersonal', label: 'การเข้าใจตนเอง', maxScore: 25 },
    { key: 'naturalist', label: 'ธรรมชาติวิทยา', maxScore: 25 }
];

// ตัวเลือก 1-5
const MI_CHOICES = [
    { value: 1, label: 'ไม่ใช่เลย', short: 'ไม่ใช่เลย', color: '#ef4444' },
    { value: 2, label: 'น้อย', short: 'น้อย', color: '#f59e0b' },
    { value: 3, label: 'ปานกลาง', short: 'ปานกลาง', color: '#3b82f6' },
    { value: 4, label: 'มาก', short: 'มาก', color: '#8b5cf6' },
    { value: 5, label: 'ใช่ที่สุด', short: 'ใช่ที่สุด', color: '#22c55e' }
];

// 40 ข้อ (ทุกข้อเป็นข้อตรง group=2)
const MI_QUESTIONS = [
    // ภาษา
    { q: 1, dim: 'linguistic', group: 2, text: 'ฉันชอบอ่านหนังสือหรือบทความต่างๆ มาก' },
    { q: 2, dim: 'linguistic', group: 2, text: 'ฉันสามารถเขียนเรื่องราว แต่งกลอน หรือเล่าเรื่องได้อย่างสนุกสนาน' },
    { q: 3, dim: 'linguistic', group: 2, text: 'ฉันจำคำศัพท์ สำนวน หรือเรื่องตลกได้เก่ง' },
    { q: 4, dim: 'linguistic', group: 2, text: 'ฉันชอบการอภิปราย โต้เถียง หรือพูดคุยแลกเปลี่ยนความคิดเห็น' },
    { q: 5, dim: 'linguistic', group: 2, text: 'ฉันชอบฟังเรื่องราวหรือวิทยุมากกว่าดูภาพเพียงอย่างเดียว' },
    // ตรรกศาสตร์
    { q: 6, dim: 'logical_mathematical', group: 2, text: 'ฉันชอบคิดคำนวณตัวเลขในใจ' },
    { q: 7, dim: 'logical_mathematical', group: 2, text: 'ฉันชอบเล่นเกมปริศนา เกมกระดาน หรือเกมที่ต้องใช้การวางแผน' },
    { q: 8, dim: 'logical_mathematical', group: 2, text: 'ฉันมักจะตั้งคำถามว่า "สิ่งนี้ทำงานอย่างไร" หรือ "ทำไมถึงเป็นเช่นนั้น"' },
    { q: 9, dim: 'logical_mathematical', group: 2, text: 'ฉันชอบการทดลองทางวิทยาศาสตร์หรือการจัดหมวดหมู่สิ่งของ' },
    { q: 10, dim: 'logical_mathematical', group: 2, text: 'ฉันเข้าใจเหตุผลและลำดับขั้นตอนเชิงตรรกะได้ดี' },
    // มิติสัมพันธ์
    { q: 11, dim: 'visual_spatial', group: 2, text: 'เวลาหลับตา ฉันสามารถนึกภาพสิ่งต่างๆ ออกมาได้อย่างชัดเจน' },
    { q: 12, dim: 'visual_spatial', group: 2, text: 'ฉันชอบงานศิลปะ วาดรูป ระบายสี หรือปั้น' },
    { q: 13, dim: 'visual_spatial', group: 2, text: 'ฉันดูแผนที่ อ่านกราฟ หรือประกอบของเล่นตามคู่มือได้ง่าย' },
    { q: 14, dim: 'visual_spatial', group: 2, text: 'ฉันชอบดูภาพยนตร์ที่มีมุมกล้องสวยงามหรือภาพกราฟิกแปลกตา' },
    { q: 15, dim: 'visual_spatial', group: 2, text: 'ฉันชอบถ่ายภาพหรือออกแบบสิ่งต่างๆ ด้วยคอมพิวเตอร์' },
    // ร่างกาย
    { q: 16, dim: 'bodily_kinesthetic', group: 2, text: 'ฉันชอบออกกำลังกาย เล่นกีฬา หรือทำกิจกรรมที่ได้ขยับร่างกาย' },
    { q: 17, dim: 'bodily_kinesthetic', group: 2, text: 'ฉันรู้สึกอึดอัดหากต้องนั่งนิ่งๆ เป็นเวลานาน' },
    { q: 18, dim: 'bodily_kinesthetic', group: 2, text: 'ฉันชอบงานฝีมือ ซ่อมแซมสิ่งของ หรือทำงานช่างด้วยมือตัวเอง' },
    { q: 19, dim: 'bodily_kinesthetic', group: 2, text: 'ฉันเรียนรู้ทักษะใหม่ๆ ได้ดีขึ้นจากการได้ลงมือปฏิบัติจริง' },
    { q: 20, dim: 'bodily_kinesthetic', group: 2, text: 'ฉันมักแสดงออกทางอารมณ์และความรู้สึกผ่านท่าทาง' },
    // ดนตรี
    { q: 21, dim: 'musical', group: 2, text: 'ฉันฮัมเพลง เคาะจังหวะ หรือผิวปากอยู่เสมอ' },
    { q: 22, dim: 'musical', group: 2, text: 'ฉันจำเนื้อเพลงหรือทำนองเพลงได้อย่างแม่นยำ' },
    { q: 23, dim: 'musical', group: 2, text: 'ฉันสามารถแยกแยะได้ว่าเครื่องดนตรีชิ้นใดกำลังเล่นอยู่' },
    { q: 24, dim: 'musical', group: 2, text: 'ฉันรู้สึกอารมณ์ดีหรือมีสมาธิมากขึ้นเมื่อได้ฟังเพลง' },
    { q: 25, dim: 'musical', group: 2, text: 'ฉันเล่นดนตรี ร้องเพลง หรือมีความสนใจในการแต่งเพลง' },
    // มนุษยสัมพันธ์
    { q: 26, dim: 'interpersonal', group: 2, text: 'ฉันเป็นคนที่ชอบทำงานกลุ่มและเข้ากับผู้อื่นได้ง่าย' },
    { q: 27, dim: 'interpersonal', group: 2, text: 'เพื่อนๆ มักจะมาปรึกษาปัญหาและขอคำแนะนำจากฉันเสมอ' },
    { q: 28, dim: 'interpersonal', group: 2, text: 'ฉันสามารถรับรู้ความรู้สึกหรืออารมณ์ของคนรอบข้างได้อย่างรวดเร็ว' },
    { q: 29, dim: 'interpersonal', group: 2, text: 'ฉันเป็นผู้ฟังที่ดีและชอบช่วยแก้ปัญหาให้ผู้อื่น' },
    { q: 30, dim: 'interpersonal', group: 2, text: 'ฉันชอบการทำกิจกรรมอาสาสมัครหรือช่วยเหลือสังคม' },
    // เข้าใจตนเอง
    { q: 31, dim: 'intrapersonal', group: 2, text: 'ฉันใช้เวลาทบทวนข้อดีและข้อเสียของตัวเองอยู่เสมอ' },
    { q: 32, dim: 'intrapersonal', group: 2, text: 'ฉันเข้าใจความรู้สึกและความต้องการของตนเองอย่างชัดเจน' },
    { q: 33, dim: 'intrapersonal', group: 2, text: 'ฉันสามารถควบคุมอารมณ์และรับมือกับความเครียดได้ดี' },
    { q: 34, dim: 'intrapersonal', group: 2, text: 'ฉันมีความเป็นตัวของตัวเองสูง ชอบวางแผนอนาคต' },
    { q: 35, dim: 'intrapersonal', group: 2, text: 'ฉันสามารถทำงานคนเดียวได้อย่างมีประสิทธิภาพ' },
    // ธรรมชาติ
    { q: 36, dim: 'naturalist', group: 2, text: 'ฉันชอบเลี้ยงสัตว์ ปลูกต้นไม้ หรือเดินป่าศึกษาธรรมชาติ' },
    { q: 37, dim: 'naturalist', group: 2, text: 'ฉันแยกแยะสายพันธุ์ต้นไม้ นก หรือแมลงต่างๆ ได้เก่ง' },
    { q: 38, dim: 'naturalist', group: 2, text: 'ฉันสนใจปรากฏการณ์ธรรมชาติ เช่น การเปลี่ยนแปลงของสภาพอากาศ' },
    { q: 39, dim: 'naturalist', group: 2, text: 'ฉันมักจะสังเกตเห็นความเปลี่ยนแปลงเล็กๆ น้อยๆ ในสิ่งแวดล้อมรอบตัว' },
    { q: 40, dim: 'naturalist', group: 2, text: 'ฉันชอบสะสมหิน เปลือกหอย ใบไม้ หรือวัตถุจากธรรมชาติ' }
];

// เกณฑ์การแปลผล (คะแนนเต็มแต่ละด้าน 25, รวม 200)
// ── เกณฑ์การแปลผล (ปรับให้เหมาะสมกับ MI) ────────────────
// เปลี่ยนจาก "ต่ำกว่าเกณฑ์ / เกณฑ์ปกติ / สูงกว่าเกณฑ์"
// เป็น "ควรพัฒนา / ปานกลาง / โดดเด่น" หรือ "ต่ำ / ปานกลาง / สูง"
const MI_NORM = {
    linguistic: { min: 10, max: 18, totalMax: 25 },
    logical_mathematical: { min: 10, max: 18, totalMax: 25 },
    visual_spatial: { min: 10, max: 18, totalMax: 25 },
    bodily_kinesthetic: { min: 10, max: 18, totalMax: 25 },
    musical: { min: 10, max: 18, totalMax: 25 },
    interpersonal: { min: 10, max: 18, totalMax: 25 },
    intrapersonal: { min: 10, max: 18, totalMax: 25 },
    naturalist: { min: 10, max: 18, totalMax: 25 },
    total: { min: 80, max: 144, totalMax: 200 }
};

function interpretScore(score, dimKey) {
    const norm = MI_NORM[dimKey];
    if (!norm) return 'ปานกลาง';
    if (score < norm.min) return 'ควรพัฒนา';
    if (score <= norm.max) return 'ปานกลาง';
    return 'โดดเด่น';
}

function calcScoreMI(answers) {
    let scores = {
        linguistic: 0,
        logical_mathematical: 0,
        visual_spatial: 0,
        bodily_kinesthetic: 0,
        musical: 0,
        interpersonal: 0,
        intrapersonal: 0,
        naturalist: 0
    };

    for (const q of MI_QUESTIONS) {
        const raw = answers[`q${q.q}`];
        if (raw === undefined || raw === null) continue;
        // ทุกข้อเป็นข้อตรง
        scores[q.dim] += raw;
    }

    const totalScore = Object.values(scores).reduce((a,b) => a + b, 0);
    const result = { ...scores, total: totalScore };
    for (const dim of MI_DIMENSIONS) {
        result[`level_${dim.key}`] = interpretScore(scores[dim.key], dim.key);
    }
    result.level_total = interpretScore(totalScore, 'total');
    // หาด้านที่โดดเด่น (คะแนนสูงสุด)
    const maxScore = Math.max(...Object.values(scores));
    const topDims = Object.keys(scores).filter(k => scores[k] === maxScore);
    result.top_dimensions = topDims;
    return result;
}

function buildAssessmentPayloadMI(studentId, classroomId, academicYear, semester, answers, recorderId = null) {
    const result = calcScoreMI(answers);
    return {
        student_id: studentId,
        classroom_id: classroomId,
        academic_year: academicYear,
        semester: semester,
        answers: answers,
        score_linguistic: result.linguistic,
        score_logical_mathematical: result.logical_mathematical,
        score_visual_spatial: result.visual_spatial,
        score_bodily_kinesthetic: result.bodily_kinesthetic,
        score_musical: result.musical,
        score_interpersonal: result.interpersonal,
        score_intrapersonal: result.intrapersonal,
        score_naturalist: result.naturalist,
        score_total: result.total,
        level_linguistic: result.level_linguistic,
        level_logical_mathematical: result.level_logical_mathematical,
        level_visual_spatial: result.level_visual_spatial,
        level_bodily_kinesthetic: result.level_bodily_kinesthetic,
        level_musical: result.level_musical,
        level_interpersonal: result.level_interpersonal,
        level_intrapersonal: result.level_intrapersonal,
        level_naturalist: result.level_naturalist,
        level_total: result.level_total,
        completed_at: new Date().toISOString(),
        recorder_id: recorderId
    };
}