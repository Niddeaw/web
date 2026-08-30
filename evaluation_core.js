// ==========================================
// evaluation_core.js - ตัวแปรหลัก, Auth, โหลดข้อมูลพื้นฐาน
// (แก้ไข: เพิ่มการแปลง targets สำหรับ super_admin/director/admin)
// ==========================================

// ==========================================
// ตัวแปรระบบ (Global Variables)
// ==========================================
let currentUser = null;
let currentTermData = null;
let currentEvalRound = null;
let systemConfigs = null;

// ✅ ตัวแปรสำหรับ Impersonation
let _impersonationMode = false;
let _impersonatedEvaluatorId = null;
let _impersonatedEvaluatorName = null;

// ✅ ตัวแปรควบคุมการโหลดครู
let _isLoadingTeachers = false;

// ✅ ตัวแปรสำหรับ ViewOnly และ SuperAdmin
let _viewOnly = false;
let _isSuperAdmin = false;
let _selectedSubGroupId = null;
let _selectedSubGroupTargets = [];
let _selectedSubGroupItems = [];

// ==========================================
// ✅ Helper Functions สำหรับวิทยฐานะ (เพิ่มตรงนี้)
// ==========================================

/**
 * ฟังก์ชันช่วยแปลงวิทยฐานะเป็นเกณฑ์ที่ถูกต้อง
 * - 'ไม่มีวิทยฐานะ' → ใช้เกณฑ์ของ 'ครู'
 * - ค่าอื่นๆ → ใช้ตามเดิม
 */
function getCriteriaByAcademic(academic) {
    const mappedAcademic = (academic === 'ไม่มีวิทยฐานะ') ? 'ครู' : academic;
    return evalCriteriaDB[mappedAcademic] || evalCriteriaDB['ครูชำนาญการพิเศษ'];
}

/**
 * ตรวจสอบว่าเป็นครูผู้ช่วยหรือไม่ (ใช้กับสูตรคำนวณ)
 */
function isAssistantTeacher(academic) {
    return academic === 'ครูผู้ช่วย';
}

// ==========================================
// ฐานข้อมูลข้อคำถาม (ครบทุกวิทยฐานะ)
// ==========================================
const evalCriteriaDB = {
    'ครูผู้ช่วย': {
        part1_sec1: [
            {
                group: '1. ด้านการจัดการเรียนรู้',
                items: [
                    { id: '1_1', label: '1.1 นำผลการวิเคราะห์หลักสูตร มาจัดทำรายวิชาและหน่วยการเรียนรู้', desc: 'นำผลการวิเคราะห์หลักสูตร มาจัดทำรายวิชาและหน่วยการเรียนรู้ให้สอดคล้องกับมาตรฐานการเรียนรู้ และตัวชี้วัดหรือผลการเรียนรู้ตามหลักสูตร ให้ผู้เรียนได้พัฒนาสมรรถนะและการเรียนรู้เต็มตามศักยภาพ' },
                    { id: '1_2', label: '1.2 ปฏิบัติการสอน โดยออกแบบการจัดการเรียนรู้', desc: 'ปฏิบัติการสอนโดยออกแบบการจัดการเรียนรู้โดยเน้นผู้เรียนเป็นสำคัญ ให้ผู้เรียนมีความรู้ ทักษะ คุณลักษณะประจำวิชา คุณลักษณะอันพึงประสงค์ และสมรรถนะที่สำคัญ ตามหลักสูตร' },
                    { id: '1_3', label: '1.3 จัดกิจกรรมการเรียนรู้', desc: 'จัดกิจกรรมการเรียนรู้ อำนวยความสะดวกในการเรียนรู้ และส่งเสริมผู้เรียนได้พัฒนาเต็มตามศักยภาพ เรียนรู้และทำงานร่วมกัน' },
                    { id: '1_4', label: '1.4 เลือกและใช้สื่อ เทคโนโลยี และแหล่งเรียนรู้', desc: 'เลือกและใช้สื่อ เทคโนโลยี และแหล่งเรียนรู้ ที่สอดคล้องกับกิจกรรมการเรียนรู้ให้ผู้เรียนมีทักษะการคิด' },
                    { id: '1_5', label: '1.5 วัดและประเมินผลการเรียนรู้', desc: 'วัดและประเมินผลการเรียนรู้ด้วยวิธีการที่หลากหลาย เหมาะสม และสอดคล้องกับมาตรฐานการเรียนรู้ ให้ผู้เรียนพัฒนาการเรียนรู้อย่างต่อเนื่อง' },
                    { id: '1_6', label: '1.6 จัดบรรยากาศที่ส่งเสริมและพัฒนาผู้เรียน', desc: 'จัดบรรยากาศที่ส่งเสริมและพัฒนาผู้เรียน ให้เกิดกระบวนการคิด ทักษะชีวิต ทักษะการทำงาน ทักษะการเรียนรู้และนวัตกรรม ทักษะด้านสารสนเทศ สื่อ และเทคโนโลยี' },
                    { id: '1_7', label: '1.7 อบรมบ่มนิสัยให้ผู้เรียนมีคุณธรรม จริยธรรม', desc: 'อบรมบ่มนิสัยให้ผู้เรียนมีคุณธรรม จริยธรรม คุณลักษณะอันพึงประสงค์ และค่านิยมความเป็นไทยที่ดีงาม' }
                ]
            },
            {
                group: '2. ด้านการส่งเสริมและสนับสนุนการจัดการเรียนรู้',
                items: [
                    { id: '2_1', label: '2.1 จัดทำข้อมูลสารสนเทศ', desc: 'จัดทำข้อมูลสารสนเทศของผู้เรียนและรายวิชา เพื่อใช้ในการส่งเสริมสนับสนุนการเรียนรู้และพัฒนาคุณภาพผู้เรียน' },
                    { id: '2_2', label: '2.2 ดำเนินการตามระบบดูแลช่วยเหลือผู้เรียน', desc: 'ดำเนินการตามระบบดูแลช่วยเหลือผู้เรียน โดยใช้ข้อมูลสารสนเทศเกี่ยวกับผู้เรียนรายบุคคล และประสานความร่วมมือกับผู้มีส่วนเกี่ยวข้อง เพื่อพัฒนาและแก้ปัญหาผู้เรียน' },
                    { id: '2_3', label: '2.3 ร่วมปฏิบัติงานทางวิชาการและงานอื่น ๆ ของสถานศึกษา', desc: 'ร่วมปฏิบัติงานทางวิชาการและงานอื่น ๆ ของสถานศึกษา เพื่อยกระดับคุณภาพการจัดการศึกษาของสถานศึกษา' },
                    { id: '2_4', label: '2.4 ประสานความร่วมมือกับผู้ปกครอง หรือผู้เกี่ยวข้อง', desc: 'ประสานความร่วมมือกับผู้ปกครอง หรือผู้เกี่ยวข้อง เพื่อร่วมกันพัฒนาผู้เรียน' }
                ]
            },
            {
                group: '3. ด้านการพัฒนาตนเอง และวิชาชีพ',
                items: [
                    { id: '3_1', label: '3.1 พัฒนาตนเองอย่างเป็นระบบและต่อเนื่อง', desc: 'พัฒนาตนเองอย่างเป็นระบบและต่อเนื่อง เพื่อให้มีความรู้ ความสามารถ ทักษะ โดยเฉพาะอย่างยิ่ง การใช้ภาษาไทยและภาษาอังกฤษเพื่อการสื่อสาร และการใช้เทคโนโลยีดิจิทัลเพื่อการศึกษา สมรรถนะทางวิชาชีพครู ความรอบรู้ในเนื้อหาวิชาและวิธีการสอน' },
                    { id: '3_2', label: '3.2 มีส่วนร่วมในการแลกเปลี่ยนเรียนรู้ทางวิชาชีพ', desc: 'มีส่วนร่วมในการแลกเปลี่ยนเรียนรู้ทางวิชาชีพ เพื่อพัฒนาการจัดการเรียนรู้' },
                    { id: '3_3', label: '3.3 นำความรู้ ความสามารถ ทักษะ ที่ได้จากการพัฒนาตนเองและวิชาชีพมาใช้', desc: 'นำความรู้ ความสามารถ ทักษะ ที่ได้จากการพัฒนาตนเองและวิชาชีพมาใช้ในการพัฒนาการจัดการเรียนรู้ และการพัฒนาคุณภาพผู้เรียน' }
                ]
            }
        ],
        part1_sec2: [
            { id: 's2_1', label: '1. วิธีการดำเนินการ', desc: 'พิจารณาจากการดำเนินการที่ถูกต้อง ครบถ้วน เป็นไปตามระยะเวลาที่กำหนด ในข้อตกลง PA', max_raw: 20 },
            { id: 's2_2_1', label: '2.1 ผลลัพธ์การเรียนรู้เชิงปริมาณ', desc: 'พิจารณาจากการบรรลุเป้าหมายเชิงปริมาณได้ครบถ้วน ตามข้อตกลง PA', max_raw: 10 },
            { id: 's2_2_2', label: '2.2 ผลลัพธ์การเรียนรู้เชิงคุณภาพ', desc: 'พิจารณาจากการบรรลุเป้าหมายเชิงคุณภาพได้ครบถ้วน ถูกต้อง เชื่อถือได้', max_raw: 10 }
        ],
        part1_sec1_base: 80,
        part1_sec1_max: 56
    },
    'ครู': {
        part1_sec1: [
            {
                group: '1. ด้านการจัดการเรียนรู้',
                items: [
                    { id: '1_1', label: '1.1 สร้างและหรือพัฒนาหลักสูตร', desc: 'มีการจัดทำรายวิชาและหน่วยการเรียนรู้ให้สอดคล้องกับมาตรฐานการเรียนรู้ และตัวชี้วัดหรือผลการเรียนรู้ ตามหลักสูตร เพื่อให้ผู้เรียนได้พัฒนาสมรรถนะและการเรียนรู้เต็มตามศักยภาพ โดยมีการปรับประยุกต์ให้สอดคล้องกับบริบทของสถานศึกษา ผู้เรียน และท้องถิ่น' },
                    { id: '1_2', label: '1.2 ออกแบบการจัดการเรียนรู้', desc: 'ออกแบบการจัดการเรียนรู้ เน้นผู้เรียนเป็นสำคัญ เพื่อให้ผู้เรียนมีความรู้ ทักษะ คุณลักษณะประจำวิชา คุณลักษณะอันพึงประสงค์ และสมรรถนะที่สำคัญ ตามหลักสูตร โดยมีการปรับประยุกต์ให้สอดคล้องกับบริบทของสถานศึกษา ผู้เรียน และท้องถิ่น' },
                    { id: '1_3', label: '1.3 จัดกิจกรรมการเรียนรู้', desc: 'จัดกิจกรรมการเรียนรู้ มีการอำนวยความสะดวกในการเรียนรู้ และส่งเสริมผู้เรียนได้พัฒนาเต็มตามศักยภาพ เรียนรู้และทำงานร่วมกัน โดยมีการปรับประยุกต์ให้สอดคล้องกับความแตกต่างของผู้เรียน' },
                    { id: '1_4', label: '1.4 สร้างและหรือพัฒนาสื่อ นวัตกรรม เทคโนโลยี และแหล่งเรียนรู้', desc: 'มีการสร้างและหรือพัฒนาสื่อ นวัตกรรม เทคโนโลยี และแหล่งเรียนรู้สอดคล้องกับกิจกรรมการเรียนรู้ โดยมีการปรับประยุกต์ให้สอดคล้องกับความแตกต่างของผู้เรียน และทำให้ผู้เรียนมีทักษะการคิดและสามารถสร้างนวัตกรรมได้' },
                    { id: '1_5', label: '1.5 วัดและประเมินผลการเรียนรู้', desc: 'มีการวัดและประเมินผลการเรียนรู้ด้วยวิธีการที่หลากหลาย เหมาะสม และสอดคล้องกับมาตรฐานการเรียนรู้ ให้ผู้เรียนพัฒนาการเรียนรู้อย่างต่อเนื่อง' },
                    { id: '1_6', label: '1.6 ศึกษา วิเคราะห์ สังเคราะห์ เพื่อแก้ปัญหาหรือพัฒนาการเรียนรู้', desc: 'มีการศึกษา วิเคราะห์ และสังเคราะห์ เพื่อแก้ปัญหาหรือพัฒนาการเรียนรู้ที่ส่งผลต่อคุณภาพผู้เรียน' },
                    { id: '1_7', label: '1.7 จัดบรรยากาศที่ส่งเสริมและพัฒนาผู้เรียน', desc: 'มีการจัดบรรยากาศที่ส่งเสริมและพัฒนาผู้เรียน ให้เกิดกระบวนการคิด ทักษะชีวิต ทักษะการทำงาน ทักษะการเรียนรู้และนวัตกรรม ทักษะด้านสารสนเทศ สื่อ และเทคโนโลยี' },
                    { id: '1_8', label: '1.8 อบรมและพัฒนาคุณลักษณะที่ดีของผู้เรียน', desc: 'มีการอบรมบ่มนิสัยให้ผู้เรียนมีคุณธรรม จริยธรรม คุณลักษณะอันพึงประสงค์ และค่านิยมความเป็นไทยที่ดีงาม' }
                ]
            },
            {
                group: '2. ด้านการส่งเสริมและสนับสนุนการจัดการเรียนรู้',
                items: [
                    { id: '2_1', label: '2.1 จัดทำข้อมูลสารสนเทศของผู้เรียนและรายวิชา', desc: 'มีการจัดทำข้อมูลสารสนเทศของผู้เรียนและรายวิชา เพื่อใช้ในการส่งเสริมสนับสนุนการเรียนรู้และพัฒนาคุณภาพผู้เรียน' },
                    { id: '2_2', label: '2.2 ดำเนินการตามระบบดูแลช่วยเหลือผู้เรียน', desc: 'มีการใช้ข้อมูลสารสนเทศเกี่ยวกับผู้เรียนรายบุคคล และประสานความร่วมมือกับผู้มีส่วนเกี่ยวข้อง เพื่อพัฒนาและแก้ปัญหาผู้เรียน' },
                    { id: '2_3', label: '2.3 ปฏิบัติงาน วิชาการและงานอื่น ๆ ของสถานศึกษา', desc: 'ร่วมปฏิบัติงานทางวิชาการและงานอื่น ๆ ของสถานศึกษา เพื่อยกระดับคุณภาพการจัดการศึกษาของสถานศึกษา' },
                    { id: '2_4', label: '2.4 ประสานความร่วมมือกับผู้ปกครอง ภาคีเครือข่าย และหรือสถานประกอบการ', desc: 'ประสานความร่วมมือกับผู้ปกครอง ภาคีเครือข่าย และหรือสถานประกอบการเพื่อร่วมกันพัฒนาผู้เรียน' }
                ]
            },
            {
                group: '3. ด้านการพัฒนาตนเอง และวิชาชีพ',
                items: [
                    { id: '3_1', label: '3.1 พัฒนาตนเอง อย่างเป็นระบบและต่อเนื่อง', desc: 'พัฒนาตนเองอย่างเป็นระบบและต่อเนื่อง เพื่อให้มีความรู้ ความสามารถ ทักษะ โดยเฉพาะอย่างยิ่ง การใช้ภาษาไทยและภาษาอังกฤษเพื่อการสื่อสาร และการใช้เทคโนโลยีดิจิทัลเพื่อการศึกษา สมรรถนะทางวิชาชีพครู ความรอบรู้ในเนื้อหาวิชาและวิธีการสอน' },
                    { id: '3_2', label: '3.2 มีส่วนร่วมในการแลกเปลี่ยนเรียนรู้ทางวิชาชีพ', desc: 'มีส่วนร่วมในการแลกเปลี่ยนเรียนรู้ทางวิชาชีพ เพื่อพัฒนาการจัดการเรียนรู้' },
                    { id: '3_3', label: '3.3 นำความรู้ ความสามารถ ทักษะ ที่ได้จากการพัฒนาตนเองและวิชาชีพมาใช้', desc: 'นำความรู้ ความสามารถ ทักษะ ที่ได้จากการพัฒนาตนเองและวิชาชีพมาใช้ในการพัฒนาการจัดการเรียนรู้ การพัฒนาคุณภาพผู้เรียน และการพัฒนานวัตกรรมการจัดการเรียนรู้' }
                ]
            }
        ],
        part1_sec2: [
            { id: 's2_1', label: '1. วิธีการดำเนินการ', desc: 'พิจารณาจากการดำเนินการที่ถูกต้อง ครบถ้วน เป็นไปตามระยะเวลาที่กำหนด ในข้อตกลง PA', max_raw: 20 },
            { id: 's2_2_1', label: '2.1 ผลลัพธ์การเรียนรู้เชิงปริมาณ', desc: 'พิจารณาจากการบรรลุเป้าหมายเชิงปริมาณได้ครบถ้วน ตามข้อตกลง PA', max_raw: 10 },
            { id: 's2_2_2', label: '2.2 ผลลัพธ์การเรียนรู้เชิงคุณภาพ', desc: 'พิจารณาจากการบรรลุเป้าหมายเชิงคุณภาพได้ครบถ้วน ถูกต้อง เชื่อถือได้', max_raw: 10 }
        ],
        part1_sec1_base: 60,
        part1_sec1_max: 60
    },
    'ครูชำนาญการ': {
        part1_sec1: [
            {
                group: '1. ด้านการจัดการเรียนรู้',
                items: [
                    { id: '1_1', label: '1.1 สร้างและหรือพัฒนาหลักสูตร', desc: 'มีการจัดทำรายวิชาและหน่วยการเรียนรู้ให้สอดคล้องกับมาตรฐานการเรียนรู้ และตัวชี้วัดหรือผลการเรียนรู้ ตามหลักสูตร เพื่อให้ผู้เรียนได้พัฒนาสมรรถนะและการเรียนรู้เต็มตามศักยภาพ โดยมีการพัฒนารายวิชาและหน่วยการเรียนรู้ ให้สอดคล้องกับบริบทของสถานศึกษา ผู้เรียน และท้องถิ่น และสามารถแก้ไขปัญหาในการจัดการเรียนรู้' },
                    { id: '1_2', label: '1.2 ออกแบบการจัดการเรียนรู้', desc: 'ออกแบบการจัดการเรียนรู้ เน้นผู้เรียนเป็นสำคัญ เพื่อให้ผู้เรียนมีความรู้ ทักษะ คุณลักษณะประจำวิชา คุณลักษณะอันพึงประสงค์ และสมรรถนะที่สำคัญ ตามหลักสูตร โดยมีการออกแบบการจัดการเรียนรู้ที่สามารถแก้ไขปัญหาในการจัดการเรียนรู้ ทำให้ผู้เรียนมีกระบวนการคิด และค้นพบองค์ความรู้ด้วยตนเอง และสร้างแรงบันดาลใจ' },
                    { id: '1_3', label: '1.3 จัดกิจกรรมการเรียนรู้', desc: 'จัดกิจกรรมการเรียนรู้ มีการอำนวยความสะดวกในการเรียนรู้ และส่งเสริมผู้เรียนได้พัฒนาเต็มตามศักยภาพ เรียนรู้และทำงานร่วมกัน โดยมีการจัดกิจกรรมการเรียนรู้ที่สามารถแก้ไขปัญหาในการจัดการเรียนรู้ ทำให้ผู้เรียนมีกระบวนการคิดและค้นพบองค์ความรู้ด้วยตนเองและสร้างแรงบันดาลใจ' },
                    { id: '1_4', label: '1.4 สร้างและหรือพัฒนาสื่อ นวัตกรรม เทคโนโลยี และแหล่งเรียนรู้', desc: 'มีการสร้างและหรือพัฒนาสื่อ นวัตกรรม เทคโนโลยี และแหล่งเรียนรู้สอดคล้องกับกิจกรรมการเรียนรู้ สามารถแก้ไขปัญหาในการเรียนรู้ของผู้เรียน และทำให้ผู้เรียนมีทักษะการคิดและสามารถสร้างนวัตกรรมได้' },
                    { id: '1_5', label: '1.5 วัดและประเมินผลการเรียนรู้', desc: 'มีการวัดและประเมินผลการเรียนรู้ด้วยวิธีการที่หลากหลาย เหมาะสม และสอดคล้องกับมาตรฐานการเรียนรู้ ให้ผู้เรียนพัฒนาการเรียนรู้อย่างต่อเนื่อง ประเมินผลการเรียนรู้ตามสภาพจริง และนำผลการวัดและประเมินผลการเรียนรู้ มาใช้แก้ไขปัญหาการจัดการเรียนรู้' },
                    { id: '1_6', label: '1.6 ศึกษา วิเคราะห์ และสังเคราะห์ เพื่อแก้ไขปัญหาหรือพัฒนาการเรียนรู้', desc: 'มีการศึกษา วิเคราะห์ และสังเคราะห์ เพื่อแก้ไขปัญหาหรือพัฒนาการเรียนรู้ที่ส่งผลต่อคุณภาพผู้เรียน และนำผลการศึกษา วิเคราะห์ และสังเคราะห์ มาใช้แก้ไขปัญหาหรือพัฒนาการจัดการเรียนรู้' },
                    { id: '1_7', label: '1.7 จัดบรรยากาศที่ส่งเสริมและพัฒนาผู้เรียน', desc: 'มีการจัดบรรยากาศที่เหมาะสม สอดคล้องกับความแตกต่างผู้เรียนเป็นรายบุคคล สามารถแก้ไขปัญหาการเรียนรู้ สร้างแรงบันดาลใจ ส่งเสริมและพัฒนาผู้เรียน ให้เกิดกระบวนการคิด ทักษะชีวิต ทักษะการทำงาน ทักษะการเรียนรู้และนวัตกรรม ทักษะด้านสารสนเทศ สื่อ และเทคโนโลยี' },
                    { id: '1_8', label: '1.8 อบรมและพัฒนาคุณลักษณะที่ดีของผู้เรียน', desc: 'มีการอบรมบ่มนิสัยให้ผู้เรียนมีคุณธรรม จริยธรรม คุณลักษณะอันพึงประสงค์ และค่านิยมความเป็นไทยที่ดีงาม โดยคำนึงถึงความแตกต่างของผู้เรียนเป็นรายบุคคล และสามารถแก้ไขปัญหาผู้เรียน' }
                ]
            },
            {
                group: '2. ด้านการส่งเสริมและสนับสนุนการจัดการเรียนรู้',
                items: [
                    { id: '2_1', label: '2.1 จัดทำข้อมูลสารสนเทศของผู้เรียนและรายวิชา', desc: 'มีการจัดทำข้อมูลสารสนเทศของผู้เรียนและรายวิชา โดยมีข้อมูลเป็นปัจจุบัน เพื่อใช้ในการส่งเสริมสนับสนุนการเรียนรู้ แก้ไขปัญหาและพัฒนาคุณภาพผู้เรียน' },
                    { id: '2_2', label: '2.2 ดำเนินการตามระบบดูแลช่วยเหลือผู้เรียน', desc: 'มีการใช้ข้อมูลสารสนเทศเกี่ยวกับผู้เรียนรายบุคคล และประสานความร่วมมือกับผู้มีส่วนเกี่ยวข้อง เพื่อพัฒนาและแก้ไขปัญหาผู้เรียน' },
                    { id: '2_3', label: '2.3 ปฏิบัติงาน วิชาการและงานอื่น ๆ ของสถานศึกษา', desc: 'ร่วมปฏิบัติงานทางวิชาการและงานอื่น ๆ ของสถานศึกษา เพื่อยกระดับคุณภาพการจัดการศึกษาของสถานศึกษา' },
                    { id: '2_4', label: '2.4 ประสานความร่วมมือกับผู้ปกครอง ภาคีเครือข่าย และหรือสถานประกอบการ', desc: 'ประสานความร่วมมือกับผู้ปกครอง ภาคีเครือข่าย และหรือสถานประกอบการ เพื่อร่วมกันแก้ไขปัญหาและพัฒนาผู้เรียน' }
                ]
            },
            {
                group: '3. ด้านการพัฒนาตนเอง และวิชาชีพ',
                items: [
                    { id: '3_1', label: '3.1 พัฒนาตนเอง อย่างเป็นระบบและต่อเนื่อง', desc: 'มีการพัฒนาตนเองอย่างเป็นระบบและต่อเนื่อง เพื่อให้มีความรู้ ความสามารถ ทักษะ โดยเฉพาะอย่างยิ่ง การใช้ภาษาไทยและภาษาอังกฤษเพื่อการสื่อสาร และการใช้เทคโนโลยีดิจิทัล เพื่อการศึกษา สมรรถนะทางวิชาชีพครูและความรอบรู้ในเนื้อหาวิชาและวิธีการสอน และนำผลการพัฒนาตนเองและพัฒนาวิชาชีพมาใช้ในการจัดการเรียนรู้ที่มีผลต่อคุณภาพผู้เรียน' },
                    { id: '3_2', label: '3.2 มีส่วนร่วมในการแลกเปลี่ยนเรียนรู้ทางวิชาชีพ', desc: 'มีส่วนร่วมในการแลกเปลี่ยนเรียนรู้ทางวิชาชีพ เพื่อแก้ไขปัญหาและพัฒนาการจัดการเรียนรู้' },
                    { id: '3_3', label: '3.3 นำความรู้ ความสามารถ ทักษะ ที่ได้จากการพัฒนาตนเองและวิชาชีพมาใช้', desc: 'นำความรู้ ความสามารถ ทักษะ ที่ได้จากการพัฒนาตนเองและวิชาชีพมาใช้ในการพัฒนาการจัดการเรียนรู้ การพัฒนาคุณภาพผู้เรียน และการพัฒนานวัตกรรมการจัดการเรียนรู้ที่มีผลต่อคุณภาพผู้เรียน' }
                ]
            }
        ],
        part1_sec2: [
            { id: 's2_1', label: '1. วิธีการดำเนินการ', desc: 'พิจารณาจากการดำเนินการที่ถูกต้อง ครบถ้วน เป็นไปตามระยะเวลาที่กำหนด ในข้อตกลง PA', max_raw: 20 },
            { id: 's2_2_1', label: '2.1 ผลลัพธ์การเรียนรู้เชิงปริมาณ', desc: 'พิจารณาจากการบรรลุเป้าหมายเชิงปริมาณได้ครบถ้วน ตามข้อตกลง PA', max_raw: 10 },
            { id: 's2_2_2', label: '2.2 ผลลัพธ์การเรียนรู้เชิงคุณภาพ', desc: 'พิจารณาจากการบรรลุเป้าหมายเชิงคุณภาพได้ครบถ้วน ถูกต้อง เชื่อถือได้', max_raw: 10 }
        ],
        part1_sec1_base: 60,
        part1_sec1_max: 60
    },
    'ครูชำนาญการพิเศษ': {
        part1_sec1: [
            {
                group: '1. ด้านการจัดการเรียนรู้',
                items: [
                    { id: '1_1', label: '1.1 สร้างและหรือพัฒนาหลักสูตร', desc: 'ริเริ่ม พัฒนารายวิชาและหน่วยการเรียนรู้ ให้สอดคล้องกับมาตรฐานการเรียนรู้ และตัวชี้วัด หรือผลการเรียนรู้ ตามหลักสูตร บริบทของสถานศึกษา ผู้เรียน และท้องถิ่น สามารถแก้ไขปัญหาในการจัดการเรียนรู้ เพื่อให้ผู้เรียนได้พัฒนาสมรรถนะ และการเรียนรู้เต็มตามศักยภาพ ส่งผลให้คุณภาพการจัดการเรียนรู้สูงขึ้น และเป็นแบบอย่างที่ดีในการสร้างและหรือพัฒนาหลักสูตร' },
                    { id: '1_2', label: '1.2 ออกแบบการจัดการเรียนรู้', desc: 'ริเริ่ม คิดค้น การออกแบบการจัดการเรียนรู้ โดยเน้นผู้เรียนเป็นสำคัญ สามารถแก้ไขปัญหาและพัฒนาคุณภาพการจัดการเรียนรู้ให้สูงขึ้น เพื่อให้ผู้เรียนมีความรู้ ทักษะ คุณลักษณะประจำวิชา คุณลักษณะอันพึงประสงค์ และสมรรถนะที่สำคัญ ตามหลักสูตร มีกระบวนการคิดและค้นพบองค์ความรู้ด้วยตนเอง และสร้างแรงบันดาลใจ และเป็นแบบอย่างที่ดีในการออกแบบการจัดการเรียนรู้' },
                    { id: '1_3', label: '1.3 จัดกิจกรรมการเรียนรู้', desc: 'มีการริเริ่ม คิดค้น และพัฒนานวัตกรรม การจัดกิจกรรมการเรียนรู้ ที่สามารถแก้ไขปัญหาในการจัดการเรียนรู้ ทำให้ผู้เรียนได้พัฒนาเต็มตามศักยภาพ เรียนรู้และทำงาน ร่วมกัน มีกระบวนการคิดและค้นพบองค์ความรู้ด้วยตนเองและสร้างแรงบันดาลใจ และเป็นแบบอย่างที่ดีในการจัดกิจกรรมการเรียนรู้' },
                    { id: '1_4', label: '1.4 สร้างและหรือพัฒนาสื่อ นวัตกรรม เทคโนโลยี และแหล่งเรียนรู้', desc: 'มีการริเริ่ม คิดค้น และพัฒนาสื่อ นวัตกรรม เทคโนโลยี และแหล่งเรียนรู้สอดคล้องกับกิจกรรมการเรียนรู้ สามารถแก้ไขปัญหาในการเรียนรู้ของผู้เรียน และทำให้ผู้เรียนมีทักษะการคิดและสามารถสร้างนวัตกรรมได้ และเป็นแบบอย่างที่ดีในการสร้างและหรือพัฒนาสื่อ นวัตกรรม เทคโนโลยี และแหล่งเรียนรู้' },
                    { id: '1_5', label: '1.5 วัดและประเมินผลการเรียนรู้', desc: 'มีการริเริ่ม คิดค้น และพัฒนารูปแบบการวัดและประเมินผลการเรียนรู้ตามสภาพจริง ด้วยวิธีการที่หลากหลายเหมาะสม และสอดคล้องกับมาตรฐานการเรียนรู้ และนำผลการวัดและประเมินผลการเรียนรู้ เพื่อให้ผู้เรียนพัฒนาการเรียนรู้อย่างต่อเนื่อง และเป็นแบบอย่างที่ดีในการศึกษา วิเคราะห์ และสังเคราะห์ เพื่อแก้ไขปัญหาหรือพัฒนาการเรียนรู้' },
                    { id: '1_6', label: '1.6 ศึกษา วิเคราะห์ และสังเคราะห์ เพื่อแก้ไขปัญหาหรือพัฒนาการเรียนรู้', desc: 'มีการริเริ่ม คิดค้น วิเคราะห์ และสังเคราะห์ เพื่อแก้ไขปัญหาหรือพัฒนาการเรียนรู้ที่ส่งผลต่อคุณภาพผู้เรียน และนำผลการศึกษา วิเคราะห์ และสังเคราะห์ มาใช้แก้ไขปัญหาหรือพัฒนาการจัดการเรียนรู้ให้สูงขึ้น และเป็นแบบอย่างที่ดี ในการศึกษา วิเคราะห์ และสังเคราะห์ เพื่อแก้ไขปัญหาหรือพัฒนาการเรียนรู้' },
                    { id: '1_7', label: '1.7 จัดบรรยากาศที่ส่งเสริมและพัฒนาผู้เรียน', desc: 'มีการริเริ่ม คิดค้น และพัฒนาการจัดบรรยากาศที่เหมาะสม สอดคล้องกับความแตกต่างผู้เรียนเป็นรายบุคคล สามารถแก้ไขปัญหาการเรียนรู้ และสร้างแรงบันดาลใจ ส่งเสริมและพัฒนาผู้เรียน ให้เกิดกระบวนการคิด ทักษะชีวิต ทักษะการทำงาน ทักษะการเรียนรู้และนวัตกรรม ทักษะด้านสารสนเทศ สื่อ และเทคโนโลยี และเป็นแบบอย่างที่ดีในการอบรมและพัฒนาคุณลักษณะที่ดีของผู้เรียน' },
                    { id: '1_8', label: '1.8 อบรมและพัฒนาคุณลักษณะที่ดีของผู้เรียน', desc: 'มีการอบรมบ่มนิสัยให้ผู้เรียนมีคุณธรรม จริยธรรม คุณลักษณะอันพึงประสงค์ และค่านิยมความเป็นไทยที่ดีงาม โดยคำนึงถึงความแตกต่างของผู้เรียนเป็นรายบุคคล และสามารถแก้ไขปัญหาและพัฒนาผู้เรียนได้ และเป็นแบบอย่างที่ดีในการอบรมและพัฒนาคุณลักษณะที่ดีของผู้เรียน' }
                ]
            },
            {
                group: '2. ด้านการส่งเสริมและสนับสนุนการจัดการเรียนรู้',
                items: [
                    { id: '2_1', label: '2.1 จัดทำข้อมูลสารสนเทศของผู้เรียนและรายวิชา', desc: 'มีการริเริ่ม คิดค้น และพัฒนารูปแบบการจัดทำข้อมูลสารสนเทศของผู้เรียนและรายวิชา โดยมีข้อมูลเป็นปัจจุบัน เพื่อใช้ในการส่งเสริมสนับสนุนการเรียนรู้ แก้ไขปัญหาและพัฒนาคุณภาพผู้เรียน และเป็นแบบอย่างที่ดี' },
                    { id: '2_2', label: '2.2 ดำเนินการตามระบบดูแลช่วยเหลือผู้เรียน', desc: 'มีการใช้ข้อมูลสารสนเทศเกี่ยวกับผู้เรียนรายบุคคล และประสานความร่วมมือกับผู้มีส่วนเกี่ยวข้อง เพื่อพัฒนาและแก้ไขปัญหาผู้เรียน และริเริ่มโครงการหรือจัดกิจกรรมเชิงสร้างสรรค์ด้วยวิธีการที่หลากหลายในการดูแลช่วยเหลือผู้เรียน และเป็นแบบอย่างที่ดี' },
                    { id: '2_3', label: '2.3 ปฏิบัติงาน วิชาการและงานอื่น ๆ ของสถานศึกษา', desc: 'ร่วมปฏิบัติงานทางวิชาการ และงานอื่น ๆ ของสถานศึกษา เพื่อยกระดับคุณภาพการจัดการศึกษาของสถานศึกษา โดยมีการพัฒนารูปแบบหรือแนวทางการดำเนินงานให้มีประสิทธิภาพสูงขึ้น และเป็นแบบอย่างที่ดี' },
                    { id: '2_4', label: '2.4 ประสานความร่วมมือกับผู้ปกครอง ภาคีเครือข่าย และหรือสถานประกอบการ', desc: 'ประสานความร่วมมือกับผู้ปกครอง ภาคีเครือข่าย และหรือสถานประกอบการ เพื่อร่วมกันแก้ไขปัญหาและพัฒนาผู้เรียน เป็นแบบอย่างที่ดี' }
                ]
            },
            {
                group: '3. ด้านการพัฒนาตนเอง และวิชาชีพ',
                items: [
                    { id: '3_1', label: '3.1 พัฒนาตนเอง อย่างเป็นระบบและต่อเนื่อง', desc: 'มีการพัฒนาตนเองอย่างเป็นระบบและต่อเนื่อง เพื่อให้มีความรู้ ความสามารถ ทักษะ โดยเฉพาะอย่างยิ่ง การใช้ภาษาไทยและภาษาอังกฤษเพื่อการสื่อสาร และการใช้เทคโนโลยีดิจิทัล เพื่อการศึกษา สมรรถนะทางวิชาชีพครูและความรอบรู้ในเนื้อหาวิชา และวิธีการสอน และเป็นแบบอย่างที่ดี' },
                    { id: '3_2', label: '3.2 มีส่วนร่วมในการแลกเปลี่ยนเรียนรู้ทางวิชาชีพ', desc: 'มีส่วนร่วมและเป็นผู้นำในการแลกเปลี่ยนเรียนรู้ทางวิชาชีพ เพื่อแก้ไขปัญหาและสร้างนวัตกรรม เพื่อพัฒนาการจัดการเรียนรู้ และเป็นแบบอย่างที่ดี' },
                    { id: '3_3', label: '3.3 นำความรู้ ความสามารถ ทักษะ ที่ได้จากการพัฒนา ตนเองและวิชาชีพมาใช้', desc: 'นำความรู้ ความสามารถ ทักษะ ที่ได้จากการพัฒนาตนเองและวิชาชีพมาใช้ในการพัฒนาการจัดการเรียนรู้ การพัฒนาคุณภาพผู้เรียน รวมถึงการพัฒนานวัตกรรมการจัดการเรียนรู้ที่มีผลต่อคุณภาพผู้เรียน และเป็นแบบอย่างที่ดี' }
                ]
            }
        ],
        part1_sec2: [
            { id: 's2_1', label: '1. วิธีการดำเนินการ', desc: 'พิจารณาจากการดำเนินการที่ถูกต้อง ครบถ้วน เป็นไปตามระยะเวลาที่กำหนด ในข้อตกลง PA', max_raw: 20 },
            { id: 's2_2_1', label: '2.1 ผลลัพธ์การเรียนรู้เชิงปริมาณ', desc: 'พิจารณาจากการบรรลุเป้าหมายเชิงปริมาณได้ครบถ้วน ตามข้อตกลง PA', max_raw: 10 },
            { id: 's2_2_2', label: '2.2 ผลลัพธ์การเรียนรู้เชิงคุณภาพ', desc: 'พิจารณาจากการบรรลุเป้าหมายเชิงคุณภาพได้ครบถ้วน ถูกต้อง เชื่อถือได้', max_raw: 10 }
        ],
        part1_sec1_base: 60,
        part1_sec1_max: 60
    }
};

// ==========================================
// ส่วนกลาง: องค์ประกอบที่ 2 และ 3
// ==========================================
const PART2_ITEMS = [
    { id: 'p2_1', label: 'ความสำเร็จของงานที่ได้รับมอบหมายจากผู้บังคับบัญชา', desc: 'ประเมินจากผลสำเร็จของงานที่ได้รับมอบหมายจากผู้บังคับบัญชา' }
];

const PART3_ITEMS = [
    "ยึดมั่นในสถาบันหลักของประเทศ อันได้แก่ ชาติ ศาสนา พระมหากษัตริย์ และการปกครอง ระบอบประชาธิปไตยอันมีพระมหากษัตริย์ทรงเป็นประมุข",
    "มีความซื่อสัตย์ สุจริต มีจิตสำนึกที่ดี มีความรับผิดชอบต่อหน้าที่และต่อผู้เกี่ยวข้อง ในฐานะข้าราชการครูและบุคลากรทางการศึกษา",
    "มีความกล้าคิด กล้าตัดสินใจ กล้าแสดงออก และกระทำในสิ่งที่ถูกต้อง ชอบธรรม",
    "มีจิตอาสา จิตสาธารณะ มุ่งประโยชน์ส่วนรวม โดยไม่คำนึงถึงประโยชน์ส่วนตน หรือพวกพ้อง",
    "มุ่งผลสัมฤทธิ์ของงาน มุ่งมั่นในการปฏิบัติงานอย่างเต็มกำลังความสามารถ โดยคำนึงถึงคุณภาพการศึกษาเป็นสำคัญ",
    "ปฏิบัติหน้าที่อย่างเป็นธรรมและไม่เลือกปฏิบัติ",
    "ดำรงตนเป็นแบบอย่างที่ดีและรักษาภาพลักษณ์ของข้าราชการครูและบุคลากรทางการศึกษา",
    "เคารพศักดิ์ศรีความเป็นมนุษย์ คำนึงถึงสิทธิเด็ก และยอมรับความแตกต่างของบุคคล",
    "ยึดถือและปฏิบัติตามจรรยาบรรณของวิชาชีพ",
    "มีวินัยและการรักษาวินัย"
];


// ==========================================
// ฟังก์ชันเริ่มต้น
// ==========================================
window.onload = async () => {
    await checkAuth();
};

// ==========================================
// ✅ ฟังก์ชัน Format Date
// ==========================================
function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ==========================================
// ✅ โหลดสถานะการประเมินของฉัน
// ==========================================
async function loadMyEvaluationStatus() {
    try {
        const { data, error } = await db
            .from('eval_results')
            .select('*')
            .eq('evaluatee_id', currentUser.id)
            .eq('eval_type', 'self')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) throw error;

        const container = document.getElementById('myEvalStatus');
        const btnView = document.getElementById('btnViewSelfEval');
        const btnPDF = document.getElementById('btnViewPDF');

        if (!container) return;

        if (data) {
            const isSubmitted = data.status === 'submitted';
            container.innerHTML = `
                <div class="flex flex-wrap items-center gap-3">
                    <span class="px-3 py-1 ${data.status === 'submitted' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'} rounded-full text-sm font-bold">
                        ${data.status === 'submitted' ? '✅ ส่งแล้ว' : '📝 ร่าง'}
                    </span>
                    <span class="text-sm">คะแนน: <b>${data.total_score.toFixed(2)}</b> / 100</span>
                    <span class="text-xs text-gray-400">${new Date(data.updated_at).toLocaleDateString('th-TH')}</span>
                </div>
            `;

            // ในฟังก์ชัน loadMyEvaluationStatus (ส่วนที่แสดงปุ่ม "ดูผล")
            if (btnView) {
                if (isSubmitted) {
                    btnView.classList.remove('hidden');
                    // ✅ เปลี่ยนเป็นเรียก openSelfEvalDetailModal
                    btnView.onclick = function () {
                        openSelfEvalDetailModal();
                    };
                } else {
                    btnView.classList.add('hidden');
                }
            }

            // ✅ ตรวจสอบว่า localStorage มี URL PDF หรือไม่
            if (btnPDF && currentUser) {
                const pdfUrl = localStorage.getItem('pdf_url_' + currentUser.id);
                if (pdfUrl) {
                    btnPDF.classList.remove('hidden');
                    btnPDF.onclick = function () {
                        window.open(pdfUrl, '_blank');
                    };
                } else {
                    btnPDF.classList.add('hidden');
                }
            }

        } else {
            container.innerHTML = `
                <div class="flex items-center gap-3">
                    <span class="status-badge empty">⏳ ยังไม่ประเมิน</span>
                    <span class="text-sm text-gray-400">กรุณาทำการประเมินตนเอง</span>
                </div>
            `;
            // ซ่อนปุ่มดูผลและไฟล์ PDF
            if (btnView) btnView.classList.add('hidden');
            if (btnPDF) btnPDF.classList.add('hidden');
        }
    } catch (err) {
        console.error('Error loading eval status:', err);
        const container = document.getElementById('myEvalStatus');
        if (container) {
            container.innerHTML = `<span class="status-badge empty">⏳ ไม่สามารถโหลดสถานะได้</span>`;
        }
    }
}

// ==========================================
// โหลดการตั้งค่าระบบ
// ==========================================
async function loadSystemConfigs() {
    try {
        const { data, error } = await db
            .from('system_configs')
            .select('config')
            .eq('category', 'evaluation')
            .maybeSingle();

        if (error) {
            console.warn('Error loading system configs:', error);
            return;
        }

        if (data) {
            systemConfigs = data.config || {};
            console.log('✅ โหลดการตั้งค่าระบบ:', systemConfigs);
        } else {
            systemConfigs = {
                allow_self_edit: true,
                allow_committee_edit: true,
                edit_mode: 'all'
            };
        }
    } catch (err) {
        console.error('Error in loadSystemConfigs:', err);
        systemConfigs = {
            allow_self_edit: true,
            allow_committee_edit: true,
            edit_mode: 'all'
        };
    }
}

// ==========================================
// ตรวจสอบว่าสามารถประเมินได้หรือไม่
// ==========================================
function canEvaluate(type) {
    if (!systemConfigs) return { allowed: true, message: '' };
    const editMode = systemConfigs.edit_mode || 'all';
    const allowSelf = systemConfigs.allow_self_edit !== false;
    const allowCommittee = systemConfigs.allow_committee_edit !== false;

    if (editMode === 'none') return { allowed: false, message: '🔒 ระบบปิดการแก้ไขการประเมินทั้งหมด' };
    if (type === 'self') {
        if (editMode === 'committee_only') return { allowed: false, message: '🔒 ปิดการประเมินตนเอง' };
        if (!allowSelf) return { allowed: false, message: '🔒 ปิดการแก้ไขการประเมินตนเอง' };
    }
    if (type === 'committee') {
        if (editMode === 'self_only') return { allowed: false, message: '🔒 ปิดการประเมินของกรรมการ' };
        if (!allowCommittee) return { allowed: false, message: '🔒 ปิดการแก้ไขการประเมินของกรรมการ' };
    }
    return { allowed: true, message: '' };
}

// ==========================================
// ✅ ฟังก์ชัน checkAuth (แก้ไข)
// ==========================================
async function checkAuth() {
    Swal.fire({ title: 'กำลังโหลดระบบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const { data: { session } } = await db.auth.getSession();
    if (!session) return window.location.replace('index.html');

    const [
        { data: profile },
        { data: schoolInfo },
    ] = await Promise.all([
        db.from('core_personnel').select('*').eq('id', session.user.id).single(),
        db.from('core_school_info').select('*').single(),
    ]);

    currentUser = profile;
    currentTermData = schoolInfo;

    // ✅ จำกัดสิทธิ์เข้าระบบประเมินนี้
    const allowedRoles = ['teacher', 'deputy', 'director', 'admin', 'super_admin'];
    // ✅ แก้ไข: เพิ่ม 'ไม่มีวิทยฐานะ' เข้าไปในรายการที่อนุญาต
    const allowedAcademicStanding = ['ครูผู้ช่วย', 'ไม่มีวิทยฐานะ', 'ครูชำนาญการ', 'ครูชำนาญการพิเศษ'];
    const blockedAcademicStanding = ['ครูอัตราจ้าง', 'ครูพี่เลี้ยง', 'พนักงานราชการ'];

    if (!allowedRoles.includes(currentUser.role)) {
        await Swal.fire({ icon: 'error', title: 'ไม่มีสิทธิ์เข้าใช้งาน', text: 'ระบบนี้สำหรับผู้บริหารและข้าราชการครูเท่านั้น (ไม่รวมเจ้าหน้าที่สำนักงาน)', confirmButtonText: 'ตกลง' });
        window.location.replace('index.html');
        return;
    }

    if (blockedAcademicStanding.includes(currentUser.academic_standing)) {
        await Swal.fire({ icon: 'error', title: 'ไม่มีสิทธิ์เข้าใช้งาน', text: `ระบบนี้ไม่รวมถึง ${currentUser.academic_standing} กรุณาติดต่อผู้ดูแลระบบหากมีข้อสงสัย`, confirmButtonText: 'ตกลง' });
        window.location.replace('index.html');
        return;
    }

    document.getElementById('header_school_term').innerText = `ภาคเรียนที่ ${schoolInfo.current_semester} / ${schoolInfo.current_academic_year}`;
    document.getElementById('header_user_name').innerText = `${currentUser.first_name} ${currentUser.last_name}`;
    document.getElementById('header_user_role').innerText = currentUser.role || '';

    const selfEvalRoles = ['teacher', 'super_admin'];
    const isAllowedAcademic = allowedAcademicStanding.includes(currentUser.academic_standing);
    const showSelfEval = selfEvalRoles.includes(currentUser.role) && isAllowedAcademic;

    const selfEvalCard = document.getElementById('selfEvalCard');
    if (showSelfEval) {
        selfEvalCard.classList.remove('hidden');
    } else {
        selfEvalCard.classList.add('hidden');
    }

    const btnGoToAdmin = document.getElementById('btnGoToAdmin');
    if (btnGoToAdmin && ['admin', 'super_admin'].includes(currentUser.role)) {
        btnGoToAdmin.classList.remove('hidden');
    }

    await Promise.all([
        loadEvaluationRound(),
        loadSystemConfigs(),
    ]);

    await checkAndPickupImpersonation();

    await Promise.all([
        loadCommitteeEvaluationTasks(),
        loadMyEvaluationStatus(),
    ]);

    if (currentEvalRound) {
        document.getElementById('eval_round_display_big').innerText = currentEvalRound.round_name || '-';
        document.getElementById('eval_period_display').innerText = `${formatDate(currentEvalRound.start_date)} - ${formatDate(currentEvalRound.end_date)}`;
    }

    document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');
    Swal.close();
}

// ==========================================
// โหลดรอบการประเมินที่ Active
// ==========================================
async function loadEvaluationRound() {
    try {
        const { data, error } = await db.from('eval_rounds').select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(1).single();
        if (error) throw error;
        currentEvalRound = data;
        document.getElementById('eval_round_display').innerText = `${data.round_name} (ครั้งที่ ${data.round_number})`;
        document.getElementById('eval_round_display_big').innerText = data.round_name || '-';
        document.getElementById('eval_period_display').innerText = `${formatDate(data.start_date)} - ${formatDate(data.end_date)}`;
        document.getElementById('eval_round_badge').classList.remove('hidden');
    } catch (err) {
        console.error('Error loading eval round:', err);
        document.getElementById('eval_round_display').innerText = 'ไม่พบรอบการประเมินที่ active';
        document.getElementById('eval_round_display_big').innerText = '❌ ไม่พบรอบการประเมิน';
        document.getElementById('eval_period_display').innerText = 'กรุณาติดต่อผู้ดูแลระบบ';
        document.getElementById('eval_round_badge').classList.add('hidden');
    }
}

// ==========================================
// โหลดโครงสร้างคณะกรรมการ (รวม targets แล้ว) — batch query ลด roundtrip
// ==========================================
async function loadCommitteeStructure(evalRoundId) {
    try {
        // ✅ ดึง main + sub groups พร้อมกันในคำสั่งเดียว
        const { data: allGroups, error: groupError } = await db
            .from('eval_committee_groups')
            .select('*')
            .eq('eval_round_id', evalRoundId)
            .eq('is_active', true)
            .order('group_name', { ascending: true });
        if (groupError) throw groupError;

        const mainGroups = (allGroups || []).filter(g => g.group_type === 'main');
        const subGroupsAll = (allGroups || []).filter(g => g.group_type === 'sub');
        const allGroupIds = (allGroups || []).map(g => g.id);

        if (allGroupIds.length === 0) return [];

        // ✅ ดึง members + targets พร้อมกัน 2 query เท่านั้น (แทน N*4 queries)
        const [membersRes, targetsRes] = await Promise.all([
            db.from('eval_committee_members')
                .select('*, core_personnel(id, prefix, first_name, last_name, academic_standing)')
                .in('committee_group_id', allGroupIds)
                .eq('is_active', true),
            db.from('eval_committee_targets')
                .select('*')
                .in('committee_group_id', allGroupIds)
                .eq('is_active', true),
        ]);

        // จัดกลุ่มตาม committee_group_id
        const membersMap = {};
        const targetsMap = {};
        (membersRes.data || []).forEach(m => {
            if (!membersMap[m.committee_group_id]) membersMap[m.committee_group_id] = [];
            membersMap[m.committee_group_id].push(m);
        });
        (targetsRes.data || []).forEach(t => {
            if (!targetsMap[t.committee_group_id]) targetsMap[t.committee_group_id] = [];
            targetsMap[t.committee_group_id].push(t);
        });

        // สร้าง subGroupsAll enriched
        const subGroupsEnriched = subGroupsAll.map(sub => ({
            ...sub,
            members: membersMap[sub.id] || [],
            targets: targetsMap[sub.id] || [],
            selected_sub_items: sub.selected_sub_items || [],
        }));

        // Map parent_group_id → sub[]
        const subByParent = {};
        subGroupsEnriched.forEach(sub => {
            if (!subByParent[sub.parent_group_id]) subByParent[sub.parent_group_id] = [];
            subByParent[sub.parent_group_id].push(sub);
        });

        // Build result
        const result = mainGroups.map(main => ({
            ...main,
            members: membersMap[main.id] || [],
            targets: targetsMap[main.id] || [],
            selected_sub_items: main.selected_sub_items || [],
            sub_groups: subByParent[main.id] || [],
        }));

        return result;
    } catch (err) {
        console.error('Error loading committee structure:', err);
        return [];
    }
}

// ==========================================
// ตรวจสอบว่าผู้ใช้เป็นกรรมการในชุดย่อยใดบ้าง
// ==========================================
async function getUserCommitteeSubGroups(userId, evalRoundId) {
    try {
        const { data: memberships, error } = await db
            .from('eval_committee_members')
            .select('committee_group_id')
            .eq('user_id', userId)
            .eq('is_active', true);
        if (error) throw error;
        const subGroupIds = memberships.map(m => m.committee_group_id);
        if (subGroupIds.length === 0) return [];

        // ✅ ดึง subGroups + members + targets แบบขนาน
        const [subGroupsRes, membersRes, targetsRes] = await Promise.all([
            db.from('eval_committee_groups').select('*').in('id', subGroupIds).eq('is_active', true),
            db.from('eval_committee_members')
                .select('*, core_personnel(id, prefix, first_name, last_name, academic_standing)')
                .in('committee_group_id', subGroupIds)
                .eq('is_active', true),
            db.from('eval_committee_targets').select('*').in('committee_group_id', subGroupIds).eq('is_active', true),
        ]);

        if (subGroupsRes.error) throw subGroupsRes.error;

        const membersMap = {};
        const targetsMap = {};
        (membersRes.data || []).forEach(m => {
            if (!membersMap[m.committee_group_id]) membersMap[m.committee_group_id] = [];
            membersMap[m.committee_group_id].push(m);
        });
        (targetsRes.data || []).forEach(t => {
            if (!targetsMap[t.committee_group_id]) targetsMap[t.committee_group_id] = [];
            targetsMap[t.committee_group_id].push(t);
        });

        const subGroups = (subGroupsRes.data || []).map(sub => ({
            ...sub,
            targets: targetsMap[sub.id] || [],
            members: membersMap[sub.id] || [],
            selected_sub_items: sub.selected_sub_items || [],
        }));

        return subGroups;
    } catch (err) {
        console.error('Error getting user committee sub groups:', err);
        return [];
    }
}

// ==========================================
// ✅ ฟังก์ชัน loadCommitteeEvaluationTasks (ฉบับสมบูรณ์)
// ==========================================
async function loadCommitteeEvaluationTasks() {
    try {
        if (!currentEvalRound) return;

        const structure = await loadCommitteeStructure(currentEvalRound.id);
        window._committeeStructure = structure;

        const mainGroups = structure.filter(g => g.group_type === 'main');

        let allSubGroups = [];
        let viewOnly = false;
        let isSuperAdmin = false;

        // ✅ ใช้ sub_groups ที่แนบมากับ structure โดยตรง (มี members + targets ครบแล้ว
        //    จาก loadCommitteeStructure) แทนการ query ซ้ำแบบเดิมซึ่งไม่ได้ join
        //    eval_committee_members ทำให้ sub.members เป็น undefined เสมอ
        const structureSubGroups = mainGroups.flatMap(m => m.sub_groups || []);

        if (currentUser.role === 'super_admin') {
            isSuperAdmin = true;
            allSubGroups = structureSubGroups;
        } else if (['director', 'admin'].includes(currentUser.role)) {
            viewOnly = true;
            allSubGroups = structureSubGroups;
        } else if (['teacher', 'deputy'].includes(currentUser.role)) {
            allSubGroups = await getUserCommitteeSubGroups(currentUser.id, currentEvalRound.id);
            const subGroupParentIds = new Set(allSubGroups.map(sg => sg.parent_group_id));
            // ✅ main.members มาจาก structure อยู่แล้ว (query เดียวกันเป๊ะกับที่เคย query ซ้ำตรงนี้)
            //    ไม่ต้อง query DB ใหม่ — แค่ซ่อนรายชื่อกรรมการของชุดหลักที่ผู้ใช้ไม่มีส่วนเกี่ยวข้อง (privacy)
            for (const main of mainGroups) {
                if (!subGroupParentIds.has(main.id)) {
                    main.members = [];
                }
            }
        }

        const committeeCard = document.getElementById('committeeCard');
        const noPermissionCard = document.getElementById('noPermissionCard');
        const finalSummaryActions = document.getElementById('finalSummaryActions');

        const alwaysShowCommittee = ['director', 'admin', 'super_admin'].includes(currentUser.role);

        if (!alwaysShowCommittee && (!allSubGroups || allSubGroups.length === 0)) {
            if (committeeCard) committeeCard.classList.add('hidden');
            if (noPermissionCard) noPermissionCard.classList.remove('hidden');
            return;
        }

        if (committeeCard) committeeCard.classList.remove('hidden');
        if (noPermissionCard) noPermissionCard.classList.add('hidden');

        if (finalSummaryActions) {
            if (['admin', 'super_admin'].includes(currentUser.role)) {
                finalSummaryActions.classList.remove('hidden');
            } else {
                finalSummaryActions.classList.add('hidden');
            }
        }

        window._viewOnly = viewOnly;
        window._isSuperAdmin = isSuperAdmin;

        const adminBadge = document.getElementById('adminImpersonationBadge');
        if (adminBadge) {
            if (isSuperAdmin) {
                adminBadge.classList.remove('hidden');
                adminBadge.innerHTML = '👑 Super Admin โหมดสวมรอย (เลือกแท็บชุดหลัก เพื่อเลือกกรรมการสวมรอย)';
            } else {
                adminBadge.classList.add('hidden');
            }
        }

        const mainTabsContainer = document.getElementById('main_group_tabs');
        if (mainTabsContainer) {
            mainTabsContainer.innerHTML = '';
            let displayedMainGroups = mainGroups;
            if (!isSuperAdmin && !viewOnly) {
                const subGroupParentIds = new Set(allSubGroups.map(sg => sg.parent_group_id));
                displayedMainGroups = mainGroups.filter(m => subGroupParentIds.has(m.id));
            }
            if (displayedMainGroups.length === 0) {
                if (alwaysShowCommittee) {
                    mainTabsContainer.innerHTML = '<p class="text-sm text-gray-400"><i class="fa-solid fa-info-circle mr-1"></i>ยังไม่มีคณะกรรมการในรอบนี้</p>';
                } else {
                    if (committeeCard) committeeCard.classList.add('hidden');
                    if (noPermissionCard) noPermissionCard.classList.remove('hidden');
                }
                return;
            }

            displayedMainGroups.forEach((main, index) => {
                const tabBtn = document.createElement('button');
                tabBtn.className = `px-4 py-2 rounded-lg font-bold transition-colors ${index === 0 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`;
                tabBtn.setAttribute('data-main-group-id', main.id);
                tabBtn.setAttribute('data-index', index);
                tabBtn.textContent = main.group_name;

                tabBtn.addEventListener('click', async function () {
                    document.querySelectorAll('#main_group_tabs button').forEach(btn => {
                        btn.className = 'px-4 py-2 rounded-lg font-bold transition-colors bg-gray-100 text-gray-600 hover:bg-gray-200';
                    });
                    this.className = 'px-4 py-2 rounded-lg font-bold transition-colors bg-blue-600 text-white';

                    const mainId = this.getAttribute('data-main-group-id');
                    const subGroupsForMain = allSubGroups.filter(sg => sg.parent_group_id === mainId);
                    const mainGroup = mainGroups.find(m => m.id === mainId);

                    await renderCommitteeSelection(mainGroup, subGroupsForMain, viewOnly, isSuperAdmin);
                });
                mainTabsContainer.appendChild(tabBtn);
            });

            if (displayedMainGroups.length > 0) {
                const firstMain = displayedMainGroups[0];
                const firstSubs = allSubGroups.filter(sg => sg.parent_group_id === firstMain.id);
                await renderCommitteeSelection(firstMain, firstSubs, viewOnly, isSuperAdmin);
            }
        }

    } catch (err) {
        console.error('Error loading committee evaluation tasks:', err);
    }
}

// ==========================================
// ✅ แสดงผล "เลือกกรรมการ" (ใช้ตาราง HTML)
// ==========================================
async function renderCommitteeSelection(mainGroup, subGroups, viewOnly = false, isSuperAdmin = false) {
    const container = document.getElementById('sub_group_selection');
    if (!container) return;

    if (!mainGroup) return;

    let html = `<div class="mb-4">`;

    const noSubGroups = subGroups.length === 0;

    if (noSubGroups) {
        html += `<input type="hidden" id="sel_sub_group" value="${mainGroup.id}" 
                        data-group-name="${mainGroup.group_name}"
                        data-targets='${JSON.stringify(mainGroup.targets || [])}'
                        data-items='${JSON.stringify(mainGroup.selected_sub_items || [])}'>`;
        html += `<p class="text-sm text-gray-600 mb-2">
                    <i class="fa-solid fa-users text-blue-500 mr-1"></i>
                    ชุดหลัก: <b>${mainGroup.group_name}</b> 
                    (กรรมการ ${mainGroup.members?.length || 0} คน)
                 </p>`;
    } else if (subGroups.length > 1) {
        html += `<label class="block text-sm font-bold text-gray-700 mb-1">เลือกชุดย่อย</label>
                 <select id="sel_sub_group" class="w-full border border-gray-300 rounded-lg px-4 py-2.5 outline-none focus:border-blue-500">`;
        subGroups.forEach(sub => {
            html += `<option value="${sub.id}" 
                            data-targets='${JSON.stringify(sub.targets || [])}'
                            data-items='${JSON.stringify(sub.selected_sub_items || [])}'>
                        ${sub.group_name} (${sub.members?.length || 0} คน)
                     </option>`;
        });
        html += `</select>`;
    } else {
        const sub = subGroups[0];
        html += `<input type="hidden" id="sel_sub_group" value="${sub.id}" 
                        data-targets='${JSON.stringify(sub.targets || [])}'
                        data-items='${JSON.stringify(sub.selected_sub_items || [])}'>`;
        html += `<p class="text-sm text-gray-600">ชุดย่อย: <b>${sub.group_name}</b> (${sub.members?.length || 0} คน)</p>`;
    }

    if (isSuperAdmin && !viewOnly) {
        const allMembers = [];
        (mainGroup.members || []).forEach(m => {
            const name = m.core_personnel ? `${m.core_personnel.prefix || ''}${m.core_personnel.first_name} ${m.core_personnel.last_name}` : 'ไม่พบชื่อ';
            allMembers.push({ user_id: m.user_id, name, source: noSubGroups ? mainGroup.group_name : 'ชุดหลัก' });
        });
        subGroups.forEach(sub => {
            (sub.members || []).forEach(m => {
                const name = m.core_personnel ? `${m.core_personnel.prefix || ''}${m.core_personnel.first_name} ${m.core_personnel.last_name}` : 'ไม่พบชื่อ';
                allMembers.push({ user_id: m.user_id, name, source: sub.group_name });
            });
        });

        const unique = {};
        allMembers.forEach(m => { unique[m.user_id] = m; });
        const uniqueMembers = Object.values(unique);

        if (uniqueMembers.length > 0) {
            html += `<label class="block text-sm font-bold text-gray-700 mt-3 mb-1">
                         <i class="fa-solid fa-user-secret text-orange-500 mr-1"></i>
                         เลือกกรรมการ (สวมรอย)
                     </label>
                     <select id="sel_committee_member" class="w-full border border-gray-300 rounded-lg px-4 py-2.5 outline-none focus:border-orange-500">
                         <option value="">-- ยังไม่เลือก (ดูอย่างเดียว) --</option>`;
            uniqueMembers.forEach(m => {
                html += `<option value="${m.user_id}" data-name="${m.name}">${m.name} (${m.source})</option>`;
            });
            html += `</select>`;
            html += `<p class="text-xs text-orange-500 mt-1">⚠️ เลือกกรรมการเพื่อสวมรอยประเมิน หรือปล่อยว่างเพื่อดูอย่างเดียว</p>`;
        } else {
            html += `<p class="text-xs text-gray-400 mt-2"><i class="fa-solid fa-info-circle mr-1"></i>ยังไม่มีกรรมการในชุดนี้</p>`;
        }
    }

    html += `</div>`;
    container.innerHTML = html;

    function _readSubGroupDataset(el) {
        if (!el) return null;
        if (el.tagName === 'SELECT') {
            const opt = el.options[el.selectedIndex];
            if (!opt) return null;
            return {
                id: opt.value,
                targets: JSON.parse(opt.dataset.targets || '[]'),
                items: JSON.parse(opt.dataset.items || '[]')
            };
        }
        return {
            id: el.value,
            targets: JSON.parse(el.dataset.targets || '[]'),
            items: JSON.parse(el.dataset.items || '[]')
        };
    }

    const subSelect = document.getElementById('sel_sub_group');
    if (subSelect) {
        subSelect.addEventListener('change', function () {
            const parsed = _readSubGroupDataset(this);
            if (!parsed || !parsed.id) return;

            _selectedSubGroupId = parsed.id;
            _selectedSubGroupTargets = parsed.targets;
            _selectedSubGroupItems = parsed.items;
            _viewOnly = viewOnly;
            _isSuperAdmin = isSuperAdmin;

            console.log('🔍 เปลี่ยนชุดย่อย -> targets:', _selectedSubGroupTargets);

            if (isSuperAdmin && !viewOnly) {
                const memSelect = document.getElementById('sel_committee_member');
                if (memSelect && memSelect.value) {
                    const memOpt = memSelect.options[memSelect.selectedIndex];
                    _impersonatedEvaluatorId = memSelect.value;
                    _impersonatedEvaluatorName = memOpt?.dataset.name || '';
                    _impersonationMode = true;
                } else {
                    _impersonationMode = false;
                    _impersonatedEvaluatorId = null;
                    _impersonatedEvaluatorName = null;
                }
            } else {
                _impersonationMode = false;
                _impersonatedEvaluatorId = null;
                _impersonatedEvaluatorName = null;
            }
            // เรียกโหลดครูตาม targets ที่ตั้งไว้
            loadTeachersForSubGroup();
        });
    }

    const memSelect = document.getElementById('sel_committee_member');
    if (memSelect) {
        memSelect.addEventListener('change', function () {
            const opt = this.options[this.selectedIndex];
            if (opt && opt.value) {
                _impersonatedEvaluatorId = opt.value;
                _impersonatedEvaluatorName = opt.dataset.name || '';
                _impersonationMode = true;
            } else {
                _impersonatedEvaluatorId = null;
                _impersonatedEvaluatorName = null;
                _impersonationMode = false;
                const banner = document.getElementById('impersonation-banner');
                if (banner) banner.style.display = 'none';
            }
            if (subSelect) subSelect.dispatchEvent(new Event('change'));
        });
    }

    // ✅ Auto-trigger ครั้งแรก (ใช้ 0ms แทน 300ms)
    setTimeout(() => {
        if (subSelect) subSelect.dispatchEvent(new Event('change'));
    }, 0);
}

// ==========================================
// ✅ ฟังก์ชัน loadTeachersForSubGroup (ฉบับสมบูรณ์)
// ==========================================
async function loadTeachersForSubGroup() {
    if (_isLoadingTeachers) {
        console.log('⏳ กำลังโหลดอยู่ ข้ามการเรียกซ้ำ');
        return;
    }
    _isLoadingTeachers = true;

    const subGroupId = _selectedSubGroupId;
    const targets = _selectedSubGroupTargets || [];
    const viewOnly = _viewOnly || false;

    const tbody = document.getElementById('tb-teacher-eval');
    if (!tbody) {
        _isLoadingTeachers = false;
        return;
    }

    // ดึงเฉพาะ department targets
    let departments = targets
        .filter(t => t.target_type === 'department')
        .map(t => t.target_value);

    console.log('🔍 departments ที่ต้องโหลด:', departments);

    if (departments.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-8 text-amber-500">
                    <i class="fa-solid fa-triangle-exclamation mr-2"></i>
                    ยังไม่ได้ตั้งค่ากลุ่มเป้าหมายสำหรับชุดนี้ (ไม่มี department targets)
                </td>
            </tr>`;
        _isLoadingTeachers = false;
        return;
    }

    // แสดงข้อความโหลด
    tbody.innerHTML = `
        <tr>
            <td colspan="5" class="text-center py-8">
                <div class="flex items-center justify-center gap-3">
                    <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                    <span class="text-gray-500">กำลังโหลดข้อมูลจาก ${departments.length} กลุ่มสาระ...</span>
                </div>
            </td>
        </tr>`;

    console.time('⏱️ โหลดครูทั้งหมด');

    try {
        const validStandings = ['ครูผู้ช่วย', 'ครู', 'ครูชำนาญการ', 'ครูชำนาญการพิเศษ'];
        const allowedDepartments = ['ภาษาไทย', 'คณิตศาสตร์', 'วิทยาศาสตร์และเทคโนโลยี (วิทยาศาสตร์)',
            'วิทยาศาสตร์และเทคโนโลยี (เทคโนโลยี)', 'สังคมศึกษา ศาสนาและวัฒนธรรม',
            'สุขศึกษาและพลศึกษา', 'ศิลปะ', 'การงานอาชีพ',
            'ภาษาต่างประเทศ (ภาษาอังกฤษ)', 'ภาษาต่างประเทศ (ภาษาจีน)', 'แนะแนว'];

        departments = departments.filter(d => allowedDepartments.includes(d));

        if (departments.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center py-8 text-amber-500">
                        <i class="fa-solid fa-triangle-exclamation mr-2"></i>
                        กลุ่มสาระที่ตั้งค่าไม่ถูกต้อง (ไม่อยู่ในรายการที่รองรับ)
                    </td>
                </tr>`;
            _isLoadingTeachers = false;
            return;
        }

        // Query ครูจากทุก department แบบขนาน
        const queryPromises = departments.map(dept =>
            db.from('core_personnel')
                .select('id, prefix, first_name, last_name, academic_standing, department')
                .eq('department', dept)
                .in('academic_standing', validStandings)
                .order('first_name', { ascending: true })
        );

        console.time('⏱️ Query ครู');
        const results = await Promise.all(queryPromises);
        console.timeEnd('⏱️ Query ครู');

        let allTeachers = [];
        results.forEach(({ data, error }) => {
            if (!error && data) {
                allTeachers = allTeachers.concat(data);
            }
        });

        if (allTeachers.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center py-8 text-gray-400">
                        <i class="fa-solid fa-user-slash mr-2"></i>
                        ไม่พบบุคลากรในกลุ่มสาระที่กำหนด (${departments.join(', ')})
                    </td>
                </tr>`;
            _isLoadingTeachers = false;
            console.timeEnd('⏱️ โหลดครูทั้งหมด');
            return;
        }

        const teacherIds = allTeachers.map(t => t.id);
        const evaluatorId = _impersonationMode ? _impersonatedEvaluatorId : currentUser.id;

        console.time('⏱️ Query ผลการประเมิน');
        const { data: evalResults, error: eErr } = await db
            .from('eval_results')
            .select('evaluatee_id, total_score, status, updated_at')
            .in('evaluatee_id', teacherIds)
            .eq('eval_round_id', currentEvalRound.id)
            .eq('evaluator_id', evaluatorId)
            .eq('eval_type', 'committee');
        console.timeEnd('⏱️ Query ผลการประเมิน');

        const evalMap = {};
        if (!eErr && evalResults) {
            evalResults.forEach(r => { evalMap[r.evaluatee_id] = r; });
        }

        console.time('⏱️ Render ตาราง');
        renderTeacherTable(allTeachers, evalMap, viewOnly);
        console.timeEnd('⏱️ Render ตาราง');

        console.timeEnd('⏱️ โหลดครูทั้งหมด');

    } catch (err) {
        console.error('Error loading teachers:', err);
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-8 text-red-400">
                    <i class="fa-solid fa-circle-exclamation mr-2"></i>
                    โหลดข้อมูลล้มเหลว: ${err.message}
                </td>
            </tr>`;
        Swal.fire('ผิดพลาด', err.message, 'error');
    } finally {
        _isLoadingTeachers = false;
    }
}

// ==========================================
// ✅ ฟังก์ชัน render ตารางด้วย HTML ธรรมดา
// ==========================================

// ✅ แก้ไข XSS/บั๊ก: เดิมฝัง JSON.stringify(teacher) ทั้งก้อนลงใน onclick attribute
//    ถ้าชื่อมีอักขระพิเศษ (เช่น single quote) จะทำให้ onclick พัง หรือเสี่ยงต่อการฉีดสคริปต์
//    แก้โดยเก็บ object ของครูไว้ใน cache แล้วส่งแค่ id ผ่าน onclick แทน
const _teacherRowCache = {};

function startEvaluationFromCache(type, teacherId) {
    const teacherData = _teacherRowCache[teacherId];
    if (!teacherData) {
        return Swal.fire('ผิดพลาด', 'ไม่พบข้อมูลบุคลากร กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง', 'error');
    }
    return startEvaluation(type, teacherData);
}
window.startEvaluationFromCache = startEvaluationFromCache;

function renderTeacherTable(teachers, evalMap, viewOnly) {
    const tbody = document.getElementById('tb-teacher-eval');
    if (!tbody) return;

    if (!teachers || teachers.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-8 text-gray-400">
                    <i class="fa-solid fa-user-slash mr-2"></i>
                    ไม่พบบุคลากร
                </td>
            </tr>`;
        return;
    }

    let html = '';
    teachers.forEach(teacher => {
        // ✅ เก็บ object ของครูไว้ใน cache เพื่อใช้แทนการฝัง JSON ลงใน onclick
        _teacherRowCache[teacher.id] = teacher;

        const fullName = teacher.prefix
            ? `${teacher.prefix}${teacher.first_name} ${teacher.last_name}`
            : `${teacher.first_name} ${teacher.last_name}`;
        const standing = teacher.academic_standing || '-';
        const evalResult = evalMap[teacher.id];

        let statusBadge, actionBtn;

        if (evalResult) {
            const score = evalResult.total_score?.toFixed(2) || '0.00';
            const dateStr = evalResult.updated_at
                ? new Date(evalResult.updated_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
                : '';
            if (evalResult.status === 'submitted') {
                statusBadge = `
                    <span class="status-badge done">✅ ประเมินแล้ว</span>
                    <div class="text-xs text-gray-400 mt-1">${score} คะแนน · ${dateStr}</div>`;
                if (!viewOnly) {
                    actionBtn = `
                        <button onclick="startEvaluationFromCache('committee', '${teacher.id}')"
                                class="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                            <i class="fa-solid fa-pen-to-square mr-1"></i>แก้ไข
                        </button>`;
                } else {
                    actionBtn = `<span class="text-xs text-gray-400">ดูเท่านั้น</span>`;
                }
            } else {
                statusBadge = `<span class="status-badge draft">📝 ร่าง</span>`;
                if (!viewOnly) {
                    actionBtn = `
                        <button onclick="startEvaluationFromCache('committee', '${teacher.id}')"
                                class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                            <i class="fa-solid fa-play mr-1"></i>ประเมินต่อ
                        </button>`;
                } else {
                    actionBtn = `<span class="text-xs text-gray-400">ดูเท่านั้น</span>`;
                }
            }
        } else {
            statusBadge = `<span class="status-badge pending">⏳ ยังไม่ประเมิน</span>`;
            if (!viewOnly) {
                actionBtn = `
                    <button onclick="startEvaluationFromCache('committee', '${teacher.id}')"
                            class="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm">
                        <i class="fa-solid fa-clipboard-check mr-1"></i>ประเมิน
                    </button>`;
            } else {
                actionBtn = `<span class="text-xs text-gray-400">ดูเท่านั้น</span>`;
            }
        }

        const impersonationBadge = _impersonationMode
            ? `<span class="ml-1 px-2 py-0.5 bg-yellow-100 text-yellow-700 text-[10px] font-bold rounded-full">👑 สวมรอย</span>`
            : '';

        html += `
            <tr>
                <td class="font-medium">${fullName}</td>
                <td>${standing}</td>
                <td class="text-center">${statusBadge}${impersonationBadge}</td>
                <td class="text-center">
                    <button onclick="window.openEvalDetailModal('${teacher.id}', '${currentEvalRound.id}')"
                            class="bg-purple-500 hover:bg-purple-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                        <i class="fa-solid fa-eye mr-1"></i>ดูสรุป
                    </button>
                </td>
                <td class="text-center">${actionBtn}</td>
            </tr>`;
    });

    tbody.innerHTML = html;
}

// ==========================================
// ฟังก์ชันโหลดครูแบบเดิม (เรียกใช้จากที่อื่นได้)
// ==========================================
async function loadTeachersForEvalBySubGroup(subGroupId, department, selectedItems, viewOnly = false) {
    if (subGroupId) {
        _selectedSubGroupId = subGroupId;
        if (!_selectedSubGroupTargets || _selectedSubGroupTargets.length === 0) {
            const { data: targets } = await db
                .from('eval_committee_targets')
                .select('*')
                .eq('committee_group_id', subGroupId)
                .eq('is_active', true);
            _selectedSubGroupTargets = targets || [];
        }
        if (selectedItems) _selectedSubGroupItems = selectedItems;
        _viewOnly = viewOnly;
        await loadTeachersForSubGroup();
    }
}

// ==========================================
// เมื่อเปลี่ยนชุดย่อย (Super Admin)
// ==========================================
async function onSuperAdminSubGroupChange() {
    await loadTeachersForSubGroup();
}

// ==========================================
// เมื่อเปลี่ยนชุดย่อย (ผู้ใช้ทั่วไป)
// ==========================================
async function onSubCommitteeGroupChange() {
    await loadTeachersForSubGroup();
}

// ==========================================
// ✅ [SUPER ADMIN] ระบบสวมรอยประเมินแทนกรรมการ
// ==========================================
async function impersonateAndEvaluate(subGroupId, evaluatorId, evaluatorName, teacherData) {
    if (!currentUser || currentUser.role !== 'super_admin') {
        return Swal.fire({ icon: 'error', title: 'ไม่มีสิทธิ์', text: 'เฉพาะ Super Admin เท่านั้น', confirmButtonText: 'ตกลง' });
    }
    const confirm = await Swal.fire({
        icon: 'warning',
        title: '⚠️ ยืนยันการสวมรอยประเมิน',
        html: `<div class="text-left space-y-2 text-sm"><p>คุณกำลังจะประเมิน <b>${teacherData.prefix || ''}${teacherData.first_name} ${teacherData.last_name}</b></p><p><b>ในนามของ:</b> <span class="text-orange-600 font-bold">${evaluatorName}</span></p><p class="text-gray-500 text-xs mt-2">⚠️ คะแนนที่บันทึกจะถูกบันทึกเป็น evaluator_id ของกรรมการท่านนั้น</p></div>`,
        showCancelButton: true,
        confirmButtonText: '✅ ยืนยัน สวมรอยประเมิน',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#f59e0b'
    });
    if (!confirm.isConfirmed) return;
    _impersonationMode = true;
    _impersonatedEvaluatorId = evaluatorId;
    _impersonatedEvaluatorName = evaluatorName;
    window._currentSubGroupId = subGroupId;
    try {
        const { data: subGroup, error } = await db.from('eval_committee_groups').select('selected_sub_items').eq('id', subGroupId).single();
        if (error) throw error;
        window._currentSelectedItems = subGroup.selected_sub_items || [];
    } catch (err) {
        _impersonationMode = false;
        return Swal.fire('ผิดพลาด', 'โหลดหัวข้อไม่สำเร็จ', 'error');
    }
    await logUserAction(`impersonate_evaluate: super_admin สวมรอย ${evaluatorName} (${evaluatorId}) ประเมิน ${teacherData.first_name} ${teacherData.last_name}`, 'evaluation');
    _showImpersonationBanner(evaluatorName);
    await startEvaluation('committee', teacherData);
}

function _showImpersonationBanner(evaluatorName) {
    let banner = document.getElementById('impersonation-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'impersonation-banner';
        banner.className = 'fixed top-0 left-0 w-full z-[9999] bg-orange-500 text-white text-center py-2 text-sm font-bold shadow-lg';
        document.body.appendChild(banner);
    }
    banner.innerHTML = `<i class="fa-solid fa-user-secret mr-2"></i>โหมดสวมรอยประเมิน — ประเมินในนาม: <span class="underline">${evaluatorName}</span><button onclick="cancelImpersonation()" class="ml-4 bg-white/20 hover:bg-white/30 text-white text-xs px-3 py-1 rounded-full transition-colors"><i class="fa-solid fa-xmark mr-1"></i>ยกเลิก</button>`;
    banner.style.display = 'block';
}

function cancelImpersonation() {
    _impersonationMode = false;
    _impersonatedEvaluatorId = null;
    _impersonatedEvaluatorName = null;
    const banner = document.getElementById('impersonation-banner');
    if (banner) banner.style.display = 'none';
    const memSelect = document.getElementById('sel_committee_member');
    if (memSelect) memSelect.value = '';
    document.getElementById('dashboardView')?.classList.remove('hidden');
    document.getElementById('wizardView')?.classList.add('hidden');
    Swal.fire({ icon: 'info', title: 'ยกเลิกการสวมรอย', text: 'กลับสู่โหมดปกติแล้ว', timer: 1500, showConfirmButton: false });
}

async function checkAndPickupImpersonation() {
    const urlParams = new URLSearchParams(window.location.search);
    if (!urlParams.has('impersonate')) return;
    const raw = sessionStorage.getItem('wrk_impersonation');
    if (!raw) return;
    try {
        const payload = JSON.parse(raw);
        sessionStorage.removeItem('wrk_impersonation');
        if (payload.mode !== 'impersonate') return;
        let retries = 0;
        while (!currentUser && retries < 20) {
            await new Promise(r => setTimeout(r, 300));
            retries++;
        }
        if (!currentUser || currentUser.role !== 'super_admin') {
            return Swal.fire('ไม่มีสิทธิ์', 'เฉพาะ Super Admin เท่านั้น', 'error');
        }
        await impersonateAndEvaluate(payload.subGroupId, payload.evaluatorId, payload.evaluatorName, payload.teacherData);
    } catch (err) {
        console.error('Error picking up impersonation:', err);
    }
}

// ==========================================
// LOGOUT
// ==========================================
async function logout() {
    const { isConfirmed } = await Swal.fire({
        title: 'ออกจากระบบ?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'ใช่, ออกจากระบบ',
        cancelButtonText: 'ยกเลิก'
    });
    if (isConfirmed) {
        await db.auth.signOut();
        window.location.replace('login.html');
    }
}

// ==========================================
// ฟังก์ชัน Getter สำหรับให้ UI เรียกใช้
// ==========================================
function getSelectedSubGroupId() {
    return _selectedSubGroupId;
}

function getSelectedSubGroupItems() {
    return _selectedSubGroupItems;
}

// ==========================================
// ✅ Export ฟังก์ชันที่จำเป็นทั้งหมด
// ==========================================
window.checkAuth = checkAuth;
window.formatDate = formatDate;
window.loadMyEvaluationStatus = loadMyEvaluationStatus;
window.loadSystemConfigs = loadSystemConfigs;
window.loadEvaluationRound = loadEvaluationRound;
window.loadCommitteeStructure = loadCommitteeStructure;
window.getUserCommitteeSubGroups = getUserCommitteeSubGroups;
window.loadCommitteeEvaluationTasks = loadCommitteeEvaluationTasks;
window.onSuperAdminSubGroupChange = onSuperAdminSubGroupChange;
window.onSubCommitteeGroupChange = onSubCommitteeGroupChange;
window.loadTeachersForEvalBySubGroup = loadTeachersForEvalBySubGroup;
window.loadTeachersForSubGroup = loadTeachersForSubGroup;
window.impersonateAndEvaluate = impersonateAndEvaluate;
window.cancelImpersonation = cancelImpersonation;
window.checkAndPickupImpersonation = checkAndPickupImpersonation;
window.canEvaluate = canEvaluate;
window.logout = logout;
window.renderCommitteeSelection = renderCommitteeSelection;
window.getSelectedSubGroupId = getSelectedSubGroupId;
window.getSelectedSubGroupItems = getSelectedSubGroupItems;

// ✅ Export Helper Functions
window.getCriteriaByAcademic = getCriteriaByAcademic;
window.isAssistantTeacher = isAssistantTeacher;

console.log('✅ evaluation_core.js loaded successfully');