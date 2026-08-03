/**
 * riasec_data.js — ข้อมูลแบบประเมินบุคลิกภาพ RIASEC 6 ด้าน (60 ข้อ)
 * อ้างอิงทฤษฎีของ John Holland
 */
const RIASEC_DELAY_DEFAULT = 10;

// 6 ด้าน (คะแนนเต็มด้านละ 50 = 10 ข้อ x 5 คะแนน)
const RIASEC_DIMENSIONS = [
    { key: 'realistic', label: 'Realistic (ปฏิบัติจริง)', maxScore: 50, icon: 'fa-hard-hat', color: '#ef4444' },
    { key: 'investigative', label: 'Investigative (นักคิดวิเคราะห์)', maxScore: 50, icon: 'fa-flask', color: '#3b82f6' },
    { key: 'artistic', label: 'Artistic (ศิลปิน)', maxScore: 50, icon: 'fa-palette', color: '#8b5cf6' },
    { key: 'social', label: 'Social (สังคมสงเคราะห์)', maxScore: 50, icon: 'fa-hand-holding-heart', color: '#22c55e' },
    { key: 'enterprising', label: 'Enterprising (กล้าได้กล้าเสีย)', maxScore: 50, icon: 'fa-handshake', color: '#f59e0b' },
    { key: 'conventional', label: 'Conventional (แบบแผน)', maxScore: 50, icon: 'fa-clipboard-list', color: '#14b8a6' }
];

// ตัวเลือก 1-5 (เหมือนเดิม)
const RIASEC_CHOICES = [
    { value: 1, label: 'ไม่ใช่เลย', short: 'ไม่ใช่เลย', color: '#ef4444' },
    { value: 2, label: 'น้อย', short: 'น้อย', color: '#f59e0b' },
    { value: 3, label: 'ปานกลาง', short: 'ปานกลาง', color: '#3b82f6' },
    { value: 4, label: 'มาก', short: 'มาก', color: '#8b5cf6' },
    { value: 5, label: 'ใช่ที่สุด', short: 'ใช่ที่สุด', color: '#22c55e' }
];

// 60 ข้อ (ด้านละ 10)
const RIASEC_QUESTIONS = [
    // === Realistic (ปฏิบัติจริง) ===
    { q: 1, dim: 'realistic', group: 2, text: 'ฉันชอบทำงานที่ต้องใช้แรงหรือลงมือทำจริง' },
    { q: 2, dim: 'realistic', group: 2, text: 'ฉันชอบทำงานกลางแจ้งมากกว่าอยู่ในออฟฟิศ' },
    { q: 3, dim: 'realistic', group: 2, text: 'ฉันชอบซ่อมแซมเครื่องมือหรือสิ่งของด้วยตัวเอง' },
    { q: 4, dim: 'realistic', group: 2, text: 'ฉันชอบกิจกรรมที่ต้องใช้ร่างกาย เช่น กีฬา หรือ งานเกษตร' },
    { q: 5, dim: 'realistic', group: 2, text: 'ฉันเรียนรู้งานได้ดีจากการลงมือปฏิบัติมากกว่าการอ่านตำรา' },
    { q: 6, dim: 'realistic', group: 2, text: 'ฉันชอบทำงานที่ต้องใช้เครื่องมือหรืออุปกรณ์' },
    { q: 7, dim: 'realistic', group: 2, text: 'ฉันชอบขับรถหรือควบคุมเครื่องจักร' },
    { q: 8, dim: 'realistic', group: 2, text: 'ฉันชอบปีนเขา เดินป่า หรือสำรวจธรรมชาติ' },
    { q: 9, dim: 'realistic', group: 2, text: 'ฉันชอบปลูกต้นไม้หรือทำงานสวน' },
    { q: 10, dim: 'realistic', group: 2, text: 'ฉันชอบทำอาหารหรือทำงานช่าง' },

    // === Investigative (นักคิดวิเคราะห์) ===
    { q: 11, dim: 'investigative', group: 2, text: 'ฉันชอบตั้งคำถามและค้นหาคำตอบด้วยตนเอง' },
    { q: 12, dim: 'investigative', group: 2, text: 'ฉันชอบวิเคราะห์ข้อมูลและมองหาความสัมพันธ์ของสิ่งต่างๆ' },
    { q: 13, dim: 'investigative', group: 2, text: 'ฉันสนใจการทดลองทางวิทยาศาสตร์หรือการค้นคว้าวิจัย' },
    { q: 14, dim: 'investigative', group: 2, text: 'ฉันชอบแก้ปัญหาเชิงตรรกะหรือเกมที่ท้าทายสมอง' },
    { q: 15, dim: 'investigative', group: 2, text: 'ฉันใช้เวลากับการอ่านหนังสือหรือบทความที่ให้ความรู้ใหม่ๆ' },
    { q: 16, dim: 'investigative', group: 2, text: 'ฉันชอบศึกษาทฤษฎีและแนวคิดใหม่ๆ' },
    { q: 17, dim: 'investigative', group: 2, text: 'ฉันชอบค้นคว้าหาข้อมูลจากอินเทอร์เน็ตหรือห้องสมุด' },
    { q: 18, dim: 'investigative', group: 2, text: 'ฉันชอบสังเกตและบันทึกปรากฏการณ์ต่างๆ' },
    { q: 19, dim: 'investigative', group: 2, text: 'ฉันชอบคิดค้นหรือประดิษฐ์สิ่งใหม่ๆ' },
    { q: 20, dim: 'investigative', group: 2, text: 'ฉันชอบอภิปรายเรื่องที่ต้องใช้เหตุผล' },

    // === Artistic (ศิลปิน) ===
    { q: 21, dim: 'artistic', group: 2, text: 'ฉันชอบวาดรูป ระบายสี ปั้น หรือออกแบบสิ่งต่างๆ' },
    { q: 22, dim: 'artistic', group: 2, text: 'ฉันชอบแต่งเพลง ร้องเพลง หรือเล่นดนตรี' },
    { q: 23, dim: 'artistic', group: 2, text: 'ฉันชอบเขียนเรื่องราว กลอน หรือบทละคร' },
    { q: 24, dim: 'artistic', group: 2, text: 'ฉันชอบชมงานศิลปะ ภาพยนตร์ หรือการแสดงที่มีจินตนาการ' },
    { q: 25, dim: 'artistic', group: 2, text: 'ฉันมีความคิดสร้างสรรค์และชอบคิดนอกกรอบ' },
    { q: 26, dim: 'artistic', group: 2, text: 'ฉันชอบตกแต่งบ้านหรือสถานที่ให้สวยงาม' },
    { q: 27, dim: 'artistic', group: 2, text: 'ฉันชอบถ่ายภาพหรือทำคลิปวิดีโอ' },
    { q: 28, dim: 'artistic', group: 2, text: 'ฉันชอบการแสดงหรือละครเวที' },
    { q: 29, dim: 'artistic', group: 2, text: 'ฉันชอบออกแบบแฟชั่นหรือแต่งตัวตามสไตล์ของตัวเอง' },
    { q: 30, dim: 'artistic', group: 2, text: 'ฉันชอบไปพิพิธภัณฑ์หรือนิทรรศการศิลปะ' },

    // === Social (สังคมสงเคราะห์) ===
    { q: 31, dim: 'social', group: 2, text: 'ฉันชอบช่วยเหลือผู้อื่นและเห็นอกเห็นใจคนรอบข้าง' },
    { q: 32, dim: 'social', group: 2, text: 'ฉันชอบทำงานอาสาสมัครหรืองานสังคมสงเคราะห์' },
    { q: 33, dim: 'social', group: 2, text: 'ฉันเป็นคนใจดี รับฟัง และเข้าใจความรู้สึกของคนอื่น' },
    { q: 34, dim: 'social', group: 2, text: 'ฉันชอบสอน แนะนำ หรือให้คำปรึกษาแก่ผู้อื่น' },
    { q: 35, dim: 'social', group: 2, text: 'ฉันมีความสุขเมื่อได้อยู่ร่วมกับผู้อื่นและทำงานเป็นทีม' },
    { q: 36, dim: 'social', group: 2, text: 'ฉันชอบจัดกิจกรรมเพื่อสังคม' },
    { q: 37, dim: 'social', group: 2, text: 'ฉันชอบดูแลผู้สูงอายุหรือเด็กเล็ก' },
    { q: 38, dim: 'social', group: 2, text: 'ฉันชอบให้กำลังใจและสนับสนุนเพื่อน' },
    { q: 39, dim: 'social', group: 2, text: 'ฉันชอบเป็นอาสาสมัครในชุมชน' },
    { q: 40, dim: 'social', group: 2, text: 'ฉันชอบทำงานที่เกี่ยวข้องกับการบริการ' },

    // === Enterprising (กล้าได้กล้าเสีย) ===
    { q: 41, dim: 'enterprising', group: 2, text: 'ฉันชอบเป็นผู้นำและกล้าตัดสินใจในสถานการณ์ต่างๆ' },
    { q: 42, dim: 'enterprising', group: 2, text: 'ฉันชอบโน้มน้าวหรือชักชวนผู้อื่นให้เห็นด้วยกับความคิดของฉัน' },
    { q: 43, dim: 'enterprising', group: 2, text: 'ฉันชอบแข่งขันและตั้งเป้าหมายที่ท้าทาย' },
    { q: 44, dim: 'enterprising', group: 2, text: 'ฉันชอบจัดกิจกรรมหรือบริหารจัดการโครงการต่างๆ' },
    { q: 45, dim: 'enterprising', group: 2, text: 'ฉันมีความมั่นใจและกล้าเสี่ยงในการตัดสินใจทางธุรกิจ' },
    { q: 46, dim: 'enterprising', group: 2, text: 'ฉันชอบขายของหรือเจรจาต่อรอง' },
    { q: 47, dim: 'enterprising', group: 2, text: 'ฉันชอบเป็นตัวแทนหรือพูดแทนกลุ่ม' },
    { q: 48, dim: 'enterprising', group: 2, text: 'ฉันชอบวางแผนกลยุทธ์เพื่อความสำเร็จ' },
    { q: 49, dim: 'enterprising', group: 2, text: 'ฉันชอบบริหารจัดการเวลาและทรัพยากร' },
    { q: 50, dim: 'enterprising', group: 2, text: 'ฉันชอบเริ่มต้นทำธุรกิจหรือกิจการใหม่ๆ' },

    // === Conventional (แบบแผน) ===
    { q: 51, dim: 'conventional', group: 2, text: 'ฉันชอบความเรียบร้อย เป็นระเบียบ และปฏิบัติตามกฎอย่างเคร่งครัด' },
    { q: 52, dim: 'conventional', group: 2, text: 'ฉันชอบจัดระบบข้อมูล ทำตาราง หรือเก็บบันทึกอย่างละเอียด' },
    { q: 53, dim: 'conventional', group: 2, text: 'ฉันชอบทำงานที่ชัดเจน มีขั้นตอน และคาดการณ์ได้' },
    { q: 54, dim: 'conventional', group: 2, text: 'ฉันใส่ใจในรายละเอียดและตรวจสอบความถูกต้องของงานเสมอ' },
    { q: 55, dim: 'conventional', group: 2, text: 'ฉันชอบทำงานด้านการเงิน บัญชี หรืองานธุรการ' },
    { q: 56, dim: 'conventional', group: 2, text: 'ฉันชอบปฏิบัติตามคำสั่งและกติกาอย่างเคร่งครัด' },
    { q: 57, dim: 'conventional', group: 2, text: 'ฉันชอบจัดระเบียบไฟล์เอกสารและข้อมูลให้เป็นหมวดหมู่' },
    { q: 58, dim: 'conventional', group: 2, text: 'ฉันชอบทำงานที่ต้องใช้ความแม่นยำ' },
    { q: 59, dim: 'conventional', group: 2, text: 'ฉันชอบวางแผนการทำงานล่วงหน้า' },
    { q: 60, dim: 'conventional', group: 2, text: 'ฉันชอบใช้โปรแกรมคอมพิวเตอร์เพื่อจัดเก็บข้อมูล' }
];

// เกณฑ์การแปลผล (คะแนนเต็มแต่ละด้าน 50, รวม 300)
const RIASEC_NORM = {
    realistic: { min: 20, max: 36, totalMax: 50 },
    investigative: { min: 20, max: 36, totalMax: 50 },
    artistic: { min: 20, max: 36, totalMax: 50 },
    social: { min: 20, max: 36, totalMax: 50 },
    enterprising: { min: 20, max: 36, totalMax: 50 },
    conventional: { min: 20, max: 36, totalMax: 50 },
    total: { min: 120, max: 216, totalMax: 300 }
};

function interpretScoreRIASEC(score, dimKey) {
    const norm = RIASEC_NORM[dimKey];
    if (!norm) return 'ปานกลาง';
    if (score < norm.min) return 'ต่ำ';
    if (score <= norm.max) return 'ปานกลาง';
    return 'สูง';
}

function calcScoreRIASEC(answers) {
    let scores = {
        realistic: 0,
        investigative: 0,
        artistic: 0,
        social: 0,
        enterprising: 0,
        conventional: 0
    };

    for (const q of RIASEC_QUESTIONS) {
        const raw = answers[`q${q.q}`];
        if (raw === undefined || raw === null) continue;
        scores[q.dim] += raw;
    }

    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
    const result = { ...scores, total: totalScore };
    for (const dim of RIASEC_DIMENSIONS) {
        result[`level_${dim.key}`] = interpretScoreRIASEC(scores[dim.key], dim.key);
    }
    result.level_total = interpretScoreRIASEC(totalScore, 'total');
    // หาด้านที่โดดเด่น (คะแนนสูงสุด)
    const maxScore = Math.max(...Object.values(scores));
    const topDims = Object.keys(scores).filter(k => scores[k] === maxScore);
    result.top_dimensions = topDims;
    return result;
}

function buildAssessmentPayloadRIASEC(studentId, classroomId, academicYear, semester, answers, recorderId = null) {
    const result = calcScoreRIASEC(answers);
    return {
        student_id: studentId,
        classroom_id: classroomId,
        academic_year: academicYear,
        semester: semester,
        answers: answers,
        score_realistic: result.realistic,
        score_investigative: result.investigative,
        score_artistic: result.artistic,
        score_social: result.social,
        score_enterprising: result.enterprising,
        score_conventional: result.conventional,
        score_total: result.total,
        level_realistic: result.level_realistic,
        level_investigative: result.level_investigative,
        level_artistic: result.level_artistic,
        level_social: result.level_social,
        level_enterprising: result.level_enterprising,
        level_conventional: result.level_conventional,
        level_total: result.level_total,
        completed_at: new Date().toISOString(),
        recorder_id: recorderId
    };
}