// ==========================================
// ตัวแปรระบบ (Global Variables)
// ==========================================
let currentUser = null;
let currentTermData = null;
let currentEvalRound = null;
let wizardCurrentStep = 1;
let evaluationMode = 'self';
let evaluateeData = null;
let isEditingMode = false;
let loadTeachersTimeout = null;
let isLoadTeachersRunning = false;
let _dataTableInstance = null;
let _isDestroying = false;
let finalScoresCache = {};
let systemConfigs = null;

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
            // ใช้ค่า default
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
    if (!systemConfigs) {
        // ถ้ายังไม่ได้โหลด ให้ถือว่าประเมินได้
        return { allowed: true, message: '' };
    }

    const editMode = systemConfigs.edit_mode || 'all';
    const allowSelf = systemConfigs.allow_self_edit !== false;
    const allowCommittee = systemConfigs.allow_committee_edit !== false;

    // ตรวจสอบตามโหมด
    if (editMode === 'none') {
        return { allowed: false, message: '🔒 ระบบปิดการแก้ไขการประเมินทั้งหมด กรุณาติดต่อผู้ดูแลระบบ' };
    }

    if (type === 'self') {
        if (editMode === 'committee_only') {
            return { allowed: false, message: '🔒 ปิดการประเมินตนเอง เปิดเฉพาะการประเมินของกรรมการ' };
        }
        if (!allowSelf) {
            return { allowed: false, message: '🔒 ปิดการแก้ไขการประเมินตนเอง' };
        }
    }

    if (type === 'committee') {
        if (editMode === 'self_only') {
            return { allowed: false, message: '🔒 ปิดการประเมินของกรรมการ เปิดเฉพาะการประเมินตนเอง' };
        }
        if (!allowCommittee) {
            return { allowed: false, message: '🔒 ปิดการแก้ไขการประเมินของกรรมการ' };
        }
    }

    return { allowed: true, message: '' };
}

// ==========================================
// 1. ตรวจสอบสิทธิ์และการโหลดข้อมูลเริ่มต้น
// ==========================================
async function checkAuth() {
    Swal.fire({ title: 'กำลังโหลดระบบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const { data: { session } } = await db.auth.getSession();
    if (!session) return window.location.replace('index.html');

    const { data: profile } = await db.from('core_personnel').select('*').eq('id', session.user.id).single();
    currentUser = profile;

    const teacherRoles = ['teacher', 'admin', 'super_admin', 'deputy', 'director'];
    const allowedAcademicStanding = ['ครูผู้ช่วย', 'ครู', 'ครูชำนาญการ', 'ครูชำนาญการพิเศษ'];

    const isTeacher = teacherRoles.includes(currentUser.role);
    const isAllowedAcademic = allowedAcademicStanding.includes(currentUser.academic_standing);
    const isAdmin = ['director', 'deputy', 'admin', 'super_admin'].includes(currentUser.role);

    if (!isTeacher && !isAdmin) {
        await Swal.fire({
            icon: 'error',
            title: 'ไม่มีสิทธิ์เข้าใช้งาน',
            text: 'ระบบนี้สำหรับข้าราชการครูและบุคลากรทางการศึกษาเท่านั้น',
            confirmButtonText: 'ตกลง'
        });
        window.location.replace('index.html');
        return;
    }

    const selfEvalCard = document.getElementById('selfEvalCard');
    if ((isTeacher && isAllowedAcademic) || currentUser.role === 'super_admin') {
        selfEvalCard.classList.remove('hidden');
    } else {
        selfEvalCard.classList.add('hidden');
    }

    await loadEvaluationRound();

    // ✅ โหลดการตั้งค่าระบบ
    await loadSystemConfigs();

    const btnGoToAdmin = document.getElementById('btnGoToAdmin');
    if (['admin', 'super_admin'].includes(currentUser.role)) {
        btnGoToAdmin.classList.remove('hidden');
    }

    const { data: schoolInfo } = await db.from('core_school_info').select('*').single();
    currentTermData = schoolInfo;
    document.getElementById('header_school_term').innerText = `ภาคเรียนที่ ${schoolInfo.current_semester} / ${schoolInfo.current_academic_year}`;
    document.getElementById('header_user_name').innerText = `${currentUser.first_name} ${currentUser.last_name}`;
    document.getElementById('header_user_role').innerText = currentUser.role || '';

    await loadCommitteeEvaluationTasks();
    await loadMyEvaluationStatus();

    if (currentEvalRound) {
        document.getElementById('eval_round_display_big').innerText = currentEvalRound.round_name || '-';
        document.getElementById('eval_period_display').innerText =
            `${formatDate(currentEvalRound.start_date)} - ${formatDate(currentEvalRound.end_date)}`;
    }

    document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');
    Swal.close();
}

// ==========================================
// โหลดรอบการประเมินที่ Active
// ==========================================
async function loadEvaluationRound() {
    try {
        const { data, error } = await db
            .from('eval_rounds')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error) throw error;

        currentEvalRound = data;

        document.getElementById('eval_round_display').innerText =
            `${data.round_name} (ครั้งที่ ${data.round_number})`;
        document.getElementById('eval_round_display_big').innerText = data.round_name || '-';
        document.getElementById('eval_period_display').innerText =
            `${formatDate(data.start_date)} - ${formatDate(data.end_date)}`;

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
// โหลดโครงสร้างคณะกรรมการแบบหลายชุดย่อย
// ==========================================
async function loadCommitteeStructure(evalRoundId) {
    try {
        const { data: mainGroups, error: mainError } = await db
            .from('eval_committee_groups')
            .select('*')
            .eq('eval_round_id', evalRoundId)
            .eq('group_type', 'main')
            .eq('is_active', true);

        if (mainError) throw mainError;

        const result = [];

        for (const mainGroup of mainGroups || []) {
            const { data: subGroups, error: subError } = await db
                .from('eval_committee_groups')
                .select('*')
                .eq('parent_group_id', mainGroup.id)
                .eq('is_active', true);

            if (subError) throw subError;

            const subGroupData = [];

            for (const subGroup of subGroups || []) {
                const { data: members, error: memError } = await db
                    .from('eval_committee_members')
                    .select('*, core_personnel(id, prefix, first_name, last_name, academic_standing)')
                    .eq('committee_group_id', subGroup.id)
                    .eq('is_active', true);

                if (memError) throw memError;

                const { data: targets, error: tarError } = await db
                    .from('eval_committee_targets')
                    .select('*')
                    .eq('committee_group_id', subGroup.id)
                    .eq('is_active', true);

                if (tarError) throw tarError;

                subGroupData.push({
                    ...subGroup,
                    members: members || [],
                    targets: targets || [],
                    selected_sub_items: subGroup.selected_sub_items || []
                });
            }

            result.push({
                ...mainGroup,
                sub_groups: subGroupData,
                selected_sub_items: mainGroup.selected_sub_items || []
            });
        }

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

        const { data: subGroups, error: subError } = await db
            .from('eval_committee_groups')
            .select('*, eval_committee_targets(*)')
            .in('id', subGroupIds)
            .eq('is_active', true);

        if (subError) throw subError;

        return subGroups || [];

    } catch (err) {
        console.error('Error getting user committee sub groups:', err);
        return [];
    }
}

// ==========================================
// โหลดงานที่ต้องประเมินของกรรมการ (แบบหลายชุดย่อย)
// ==========================================
async function loadCommitteeEvaluationTasks() {
    try {
        if (!currentEvalRound) {
            console.log('⚠️ ไม่มีรอบการประเมิน active');
            return;
        }

        const structure = await loadCommitteeStructure(currentEvalRound.id);
        window._committeeStructure = structure;

        const mySubGroups = await getUserCommitteeSubGroups(currentUser.id, currentEvalRound.id);

        if (!mySubGroups || mySubGroups.length === 0) {
            console.log('ℹ️ ไม่มีงานประเมินสำหรับผู้ใช้นี้');
            document.getElementById('committeeCard').classList.add('hidden');
            return;
        }

        document.getElementById('committeeCard').classList.remove('hidden');

        const groupSelect = document.getElementById('sel_committee_group');
        groupSelect.innerHTML = '<option value="">-- เลือกชุดคณะกรรมการ --</option>';

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
                option.dataset.mainGroupId = mainGroup.id;
                option.dataset.targets = JSON.stringify(sub.targets || []);
                option.dataset.selectedSubItems = JSON.stringify(sub.selected_sub_items || []);
                optgroup.appendChild(option);
            });

            groupSelect.appendChild(optgroup);
        }

        groupSelect.addEventListener('change', function() {
            const selectedOption = this.options[this.selectedIndex];
            if (selectedOption && selectedOption.dataset) {
                window._selectedSubGroupId = this.value;
                window._selectedSubGroupTargets = JSON.parse(selectedOption.dataset.targets || '[]');
                window._selectedSubGroupItems = JSON.parse(selectedOption.dataset.selectedSubItems || '[]');
                onSubCommitteeGroupChange();
            }
        });

        if (mySubGroups.length === 1) {
            const firstSub = mySubGroups[0];
            groupSelect.value = firstSub.id;
            window._selectedSubGroupId = firstSub.id;
            window._selectedSubGroupTargets = firstSub.targets || [];
            window._selectedSubGroupItems = firstSub.selected_sub_items || [];
            await onSubCommitteeGroupChange();
        }

        console.log('✅ โหลดงานประเมินกรรมการสำเร็จ:', mySubGroups.length, 'ชุดย่อย');

    } catch (err) {
        console.error('Error loading committee evaluation tasks:', err);
    }
}

// ==========================================
// เมื่อเปลี่ยนชุดย่อยคณะกรรมการ
// ==========================================
async function onSubCommitteeGroupChange() {
    const subGroupId = window._selectedSubGroupId;
    const targets = window._selectedSubGroupTargets || [];
    const selectedItems = window._selectedSubGroupItems || [];

    await destroyDataTableSafely();

    if (!subGroupId) {
        document.getElementById('selectedGroupInfo').classList.add('hidden');
        document.getElementById('sel_department').innerHTML = '<option value="">-- เลือกกลุ่มสาระ --</option>';
        const tbody = document.getElementById('tb-teacher-eval');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-400">กรุณาเลือกชุดคณะกรรมการ</td></tr>';
        }
        return;
    }

    document.getElementById('selectedGroupInfo').classList.remove('hidden');
    document.getElementById('selectedGroupName').innerText =
        document.getElementById('sel_committee_group').selectedOptions[0]?.text || '-';
    document.getElementById('selectedGroupMemberCount').innerText =
        document.getElementById('sel_committee_group').selectedOptions[0]?.text.match(/\((\d+)/)?.[1] || '0';

    const subItemsText = selectedItems.map(item =>
        `องค์ประกอบที่ ${item.element}: ${item.value}`
    ).join(' | ') || 'ไม่มีหัวข้อย่อย';
    document.getElementById('selectedGroupSubItems').innerText = subItemsText;

    const selDept = document.getElementById('sel_department');
    selDept.innerHTML = '<option value="">-- เลือกกลุ่มสาระ --</option>';

    const departmentTargets = targets.filter(t => t.target_type === 'department');

    if (departmentTargets.length > 1) {
        departmentTargets.forEach(t => {
            selDept.innerHTML += `<option value="${t.target_value}">${t.target_value}</option>`;
        });
    } else if (departmentTargets.length === 1) {
        const singleDept = departmentTargets[0].target_value;
        window._suppressDeptChange = true;
        selDept.value = singleDept;
        window._suppressDeptChange = false;
        await loadTeachersForEvalBySubGroup(subGroupId, singleDept, selectedItems);
    }

    window._currentSubGroupId = subGroupId;
    window._currentSelectedItems = selectedItems;
}

// ==========================================
// โหลดครูสำหรับประเมินตามชุดย่อย
// ==========================================
async function loadTeachersForEvalBySubGroup(subGroupId, department, selectedItems) {
    if (!department) {
        return Swal.fire('แจ้งเตือน', 'กรุณาเลือกกลุ่มสาระ', 'warning');
    }

    if (!currentEvalRound) {
        return Swal.fire('แจ้งเตือน', 'ไม่พบรอบการประเมิน', 'warning');
    }

    // ✅ ป้องกันการเรียกซ้ำ
    if (isLoadTeachersRunning) {
        console.log('⏳ Already running, waiting...');
        await new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                if (!isLoadTeachersRunning) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 200);
        });
    }

    isLoadTeachersRunning = true;

    try {
        await destroyDataTableSafely();

        const tbody = document.getElementById('tb-teacher-eval');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-8">
                    <div class="flex items-center justify-center gap-3">
                        <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                        <span class="text-gray-500">กำลังโหลดรายชื่อ...</span>
                    </div>
                </td>
            </tr>`;

        await new Promise(r => setTimeout(r, 300));

        const validStandings = ['ครูผู้ช่วย', 'ครู', 'ครูชำนาญการ', 'ครูชำนาญการพิเศษ'];
        const { data: teachers, error: tErr } = await db
            .from('core_personnel')
            .select('id, prefix, first_name, last_name, academic_standing, department')
            .eq('department', department)
            .in('academic_standing', validStandings)
            .order('first_name', { ascending: true });

        if (tErr) throw tErr;

        if (!teachers || teachers.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center py-8 text-gray-400">
                        <i class="fa-solid fa-user-slash mr-2"></i>
                        ไม่พบบุคลากรในกลุ่มสาระ "${department}"
                    </td>
                </tr>`;
            return;
        }

        const teacherIds = teachers.map(t => t.id);
        const { data: evalResults, error: eErr } = await db
            .from('eval_results')
            .select('evaluatee_id, total_score, status, updated_at')
            .in('evaluatee_id', teacherIds)
            .eq('eval_round_id', currentEvalRound.id)
            .eq('evaluator_id', currentUser.id)
            .eq('eval_type', 'committee');

        if (eErr) throw eErr;

        const evalMap = {};
        (evalResults || []).forEach(r => { evalMap[r.evaluatee_id] = r; });

        let html = '';
        teachers.forEach(teacher => {
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
                    actionBtn = `
                        <button onclick='startEvaluation("committee", ${JSON.stringify(teacher).replace(/"/g, '&quot;')})'
                                class="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                            <i class="fa-solid fa-pen-to-square mr-1"></i>แก้ไข
                        </button>`;
                } else {
                    statusBadge = `<span class="status-badge draft">📝 ร่าง</span>`;
                    actionBtn = `
                        <button onclick='startEvaluation("committee", ${JSON.stringify(teacher).replace(/"/g, '&quot;')})'
                                class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                            <i class="fa-solid fa-play mr-1"></i>ประเมินต่อ
                        </button>`;
                }
            } else {
                statusBadge = `<span class="status-badge pending">⏳ ยังไม่ประเมิน</span>`;
                actionBtn = `
                    <button onclick='startEvaluation("committee", ${JSON.stringify(teacher).replace(/"/g, '&quot;')})'
                            class="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm">
                        <i class="fa-solid fa-clipboard-check mr-1"></i>ประเมิน
                    </button>`;
            }

            html += `
                <tr>
                    <td class="font-medium">${fullName}</td>
                    <td>${standing}</td>
                    <td class="text-center">${statusBadge}</td>
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

        await new Promise(r => setTimeout(r, 300));
        await initializeDataTableSafely();

    } catch (err) {
        console.error('Error loading teachers:', err);
        const tbody = document.getElementById('tb-teacher-eval');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center py-8 text-red-400">
                        <i class="fa-solid fa-circle-exclamation mr-2"></i>โหลดข้อมูลล้มเหลว: ${err.message}
                    </td>
                </tr>`;
        }
        Swal.fire('ผิดพลาด', err.message, 'error');
    } finally {
        isLoadTeachersRunning = false;
    }
}

// ==========================================
// ฟังก์ชันทำลาย DataTable อย่างปลอดภัย
// ==========================================
function destroyDataTableSafely() {
    return new Promise((resolve) => {
        if (_isDestroying) {
            console.log('⏳ Destroy already in progress, skipping...');
            resolve();
            return;
        }

        _isDestroying = true;

        try {
            const tableId = '#teacherEvalTable';
            const tableEl = document.getElementById('teacherEvalTable');

            if (!tableEl) {
                console.log('ℹ️ Table element not found, skip destroy');
                _isDestroying = false;
                resolve();
                return;
            }

            if (_dataTableInstance) {
                try {
                    _dataTableInstance.destroy(true);
                    _dataTableInstance = null;
                    console.log('✅ DataTable destroyed via instance');
                } catch (e) {
                    console.warn('Destroy via instance error:', e.message);
                }
            }

            try {
                if ($.fn.DataTable.isDataTable(tableId)) {
                    try {
                        $(tableId).DataTable().destroy(true);
                        console.log('✅ DataTable destroyed via jQuery');
                    } catch (e) {
                        console.warn('Destroy via jQuery error:', e.message);
                    }
                }
            } catch (e) {
                console.warn('isDataTable check error:', e.message);
            }

            try {
                $(tableId).find('thead, tfoot').empty();
            } catch (e) {
                console.warn('Empty thead/tfoot error:', e.message);
            }

            setTimeout(() => {
                _isDestroying = false;
                resolve();
            }, 150);

        } catch (e) {
            console.error('destroyDataTableSafely error:', e);
            _isDestroying = false;
            resolve();
        }
    });
}

// ==========================================
// ฟังก์ชันสร้าง DataTable
// ==========================================
function initializeDataTableSafely() {
    return new Promise((resolve) => {
        if (_isDestroying) {
            setTimeout(() => {
                initializeDataTableSafely().then(resolve);
            }, 300);
            return;
        }

        setTimeout(() => {
            try {
                const tableId = '#teacherEvalTable';
                const tableEl = document.getElementById('teacherEvalTable');

                if (!tableEl) {
                    console.warn('❌ Table element not found');
                    resolve();
                    return;
                }

                const tbody = tableEl.querySelector('tbody');
                if (!tbody) {
                    console.log('ℹ️ No tbody found');
                    resolve();
                    return;
                }

                const rows = tbody.querySelectorAll('tr');
                let hasRealData = false;

                for (let row of rows) {
                    const cells = row.querySelectorAll('td');
                    if (cells.length > 1) {
                        const text = row.textContent.trim();
                        if (!text.includes('ไม่พบบุคลากร') &&
                            !text.includes('โหลดข้อมูลล้มเหลว') &&
                            !text.includes('กรุณาเลือก')) {
                            hasRealData = true;
                            break;
                        }
                    }
                }

                if (!hasRealData || rows.length === 0 || rows[0].cells.length === 0) {
                    console.log('ℹ️ No data rows, skipping DataTable init');
                    resolve();
                    return;
                }

                if (_dataTableInstance) {
                    try {
                        _dataTableInstance.destroy(true);
                        _dataTableInstance = null;
                    } catch (e) { }
                }

                try {
                    if ($.fn.DataTable.isDataTable(tableId)) {
                        $(tableId).DataTable().destroy(true);
                    }
                } catch (e) { }

                if (tbody.children.length === 0) {
                    resolve();
                    return;
                }

                _dataTableInstance = $(tableId).DataTable({
                    scrollX: true,
                    language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
                    pageLength: 10,
                    lengthMenu: [[5, 10, 25, -1], [5, 10, 25, 'ทั้งหมด']],
                    columnDefs: [
                        { targets: [0], width: '30%' },
                        { targets: [1], width: '15%' },
                        { targets: [2], width: '20%', orderable: false },
                        { targets: [3], width: '15%', orderable: false },
                        { targets: [4], width: '20%', orderable: false }
                    ],
                    dom: '<"flex flex-wrap justify-between items-center gap-2 mb-3"lf>rt<"flex flex-wrap justify-between items-center gap-2 mt-3"ip>',
                    initComplete: function() {
                        console.log('✅ DataTable initialized');
                    }
                });

                resolve();
            } catch (err) {
                console.error('Error initializing DataTable:', err);
                resolve();
            }
        }, 300);
    });
}

// ==========================================
// โหลดสถานะการประเมินของฉัน
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
                    ${isSubmitted ? `
                        <button onclick="startEditEvaluation('${data.id}')" 
                                class="bg-amber-500 hover:bg-amber-600 text-white px-4 py-1.5 rounded-lg text-sm font-bold transition-colors shadow-sm flex items-center gap-1">
                            <i class="fa-solid fa-pen-to-square"></i> แก้ไข
                        </button>
                    ` : ''}
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="flex items-center gap-3">
                    <span class="status-badge empty">⏳ ยังไม่ประเมิน</span>
                    <span class="text-sm text-gray-400">กรุณาทำการประเมินตนเอง</span>
                </div>
            `;
        }
    } catch (err) {
        console.error('Error loading eval status:', err);
        const container = document.getElementById('myEvalStatus');
        if (container) {
            container.innerHTML = `
                <span class="status-badge empty">⏳ ไม่สามารถโหลดสถานะได้</span>
            `;
        }
    }
}

// ==========================================
// ฟังก์ชันเริ่มการประเมิน (แก้ไข)
// ==========================================
async function startEvaluation(type, teacherData = null) {
    try {
        // 1. ตรวจสอบรอบการประเมิน
        if (!currentEvalRound) {
            return Swal.fire('แจ้งเตือน', 'ไม่พบรอบการประเมินที่เปิดใช้งาน', 'warning');
        }

        // ✅ 2. ตรวจสอบการตั้งค่าระบบ
        if (!systemConfigs) {
            await loadSystemConfigs();
        }

        const evalCheck = canEvaluate(type);
        if (!evalCheck.allowed) {
            return Swal.fire({
                icon: 'warning',
                title: '⚠️ ไม่สามารถประเมินได้',
                text: evalCheck.message,
                confirmButtonText: 'ตกลง'
            });
        }

        // 3. กำหนดโหมดและผู้ถูกประเมิน
        evaluationMode = type;
        
        if (type === 'self') {
            // โหมดประเมินตนเอง
            evaluateeData = currentUser;
            document.getElementById('wizardTargetName').innerText = 
                `ผู้รับการประเมิน: ${currentUser.first_name} ${currentUser.last_name}`;
        } else if (type === 'committee' && teacherData) {
            // โหมดประเมินคณะกรรมการ
            evaluateeData = teacherData;
            document.getElementById('wizardTargetName').innerText = 
                `ผู้รับการประเมิน: ${teacherData.prefix || ''}${teacherData.first_name} ${teacherData.last_name}`;
        } else {
            return Swal.fire('แจ้งเตือน', 'ข้อมูลไม่ถูกต้อง กรุณาลองใหม่', 'warning');
        }

        // 4. ตรวจสอบว่ามีการประเมินเดิมหรือไม่ (เฉพาะกรณีไม่ใช่โหมดแก้ไข)
        if (!window._existingEvalId && !isEditingMode) {
            await loadExistingEvaluation();
        }

        // 5. สร้างฟอร์มตามวิทยฐานะ
        const academic = evaluateeData.academic_standing || 'ครู';
        
        // ตรวจสอบหัวข้อย่อยที่ต้องประเมิน (เฉพาะกรณี committee)
        let allowedSubItems = null;
        if (type === 'committee') {
            // ใช้หัวข้อย่อยที่เลือกไว้จากชุดคณะกรรมการ
            allowedSubItems = window._currentSelectedItems || [];
        }

        generateDynamicForm(academic, allowedSubItems);

        // 6. เปลี่ยนหน้าจอ
        document.getElementById('dashboardView').classList.add('hidden');
        document.getElementById('wizardView').classList.remove('hidden');

        // 7. ตั้งค่าเริ่มต้น
        wizardCurrentStep = 1;
        updateWizardUI();

        // 8. โหลดคะแนนเดิม (ถ้ามี)
        if (window._existingEvalId) {
            // ถ้ามีการแก้ไข จะโหลดจาก startEditEvaluation แล้ว
        } else {
            // ตรวจสอบว่ามีการประเมินที่ส่งแล้วหรือไม่
            const { data: existingSubmitted, error } = await db
                .from('eval_results')
                .select('id, total_score, detailed_scores, status')
                .eq('evaluatee_id', evaluateeData.id)
                .eq('eval_round_id', currentEvalRound.id)
                .eq('evaluator_id', currentUser.id)
                .eq('eval_type', type)
                .eq('status', 'submitted')
                .maybeSingle();

            if (existingSubmitted && !window._existingEvalId) {
                // พบการประเมินที่ส่งแล้ว ให้ถามผู้ใช้ว่าจะแก้ไขหรือเริ่มใหม่
                const result = await Swal.fire({
                    icon: 'info',
                    title: 'พบการประเมินที่ส่งแล้ว',
                    html: `
                        <p>คุณได้ส่งการประเมินนี้แล้ว</p>
                        <p class="text-sm text-gray-500">คะแนน: <b>${existingSubmitted.total_score.toFixed(2)}</b> / 100</p>
                        <p class="text-sm text-gray-500 mt-2">ต้องการดำเนินการอย่างไร?</p>
                    `,
                    showDenyButton: true,
                    confirmButtonText: '📝 แก้ไข',
                    denyButtonText: '🗑️ เริ่มใหม่',
                    cancelButtonText: '❌ ยกเลิก'
                });

                if (result.isConfirmed) {
                    // แก้ไข - โหลดข้อมูลเดิม
                    window._existingEvalId = existingSubmitted.id;
                    loadScoresToForm(existingSubmitted);
                    Swal.fire('โหลดข้อมูลสำเร็จ', 'คุณสามารถแก้ไขคะแนนได้', 'success');
                } else if (result.isDenied) {
                    // เริ่มใหม่ - ลบข้อมูลเดิม
                    await db.from('eval_results').delete().eq('id', existingSubmitted.id);
                    window._existingEvalId = null;
                    resetForm();
                    Swal.fire('เริ่มใหม่', 'ลบข้อมูลเดิมเรียบร้อย', 'success');
                } else {
                    // ยกเลิก - กลับหน้า dashboard
                    document.getElementById('dashboardView').classList.remove('hidden');
                    document.getElementById('wizardView').classList.add('hidden');
                    return;
                }
            }
        }

        console.log('✅ เริ่มการประเมิน:', type, evaluateeData.id);

    } catch (err) {
        console.error('Error starting evaluation:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// ฟังก์ชันเริ่มแก้ไขการประเมิน
// ==========================================
async function startEditEvaluation(evalId) {
    try {
        const { data: existingEval, error } = await db
            .from('eval_results')
            .select('*')
            .eq('id', evalId)
            .single();

        if (error) throw error;

        isEditingMode = true;
        window._existingEvalId = evalId;

        const { data: evaluatee } = await db
            .from('core_personnel')
            .select('*')
            .eq('id', existingEval.evaluatee_id)
            .single();

        evaluateeData = evaluatee;
        evaluationMode = existingEval.eval_type;

        document.getElementById('dashboardView').classList.add('hidden');
        document.getElementById('wizardView').classList.remove('hidden');
        document.getElementById('wizardTargetName').innerText = `ผู้รับการประเมิน: ${evaluatee.first_name} ${evaluatee.last_name}`;

        const academic = evaluatee.academic_standing || 'ไม่มีวิทยฐานะ';

        generateDynamicForm(academic);
        loadScoresToForm(existingEval);

        wizardCurrentStep = 1;
        updateWizardUI();

        Swal.fire({
            icon: 'info',
            title: 'โหมดแก้ไข',
            text: 'คุณกำลังแก้ไขการประเมินที่ส่งแล้ว กรุณาตรวจสอบข้อมูลและบันทึกใหม่',
            timer: 3000,
            showConfirmButton: true
        });

    } catch (err) {
        console.error('Error starting edit:', err);
        Swal.fire('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลสำหรับแก้ไขได้', 'error');
    }
}

// ==========================================
// ฟังก์ชันโหลดข้อมูลการประเมินเดิม
// ==========================================
async function loadExistingEvaluation() {
    try {
        const { data: existingEval, error } = await db
            .from('eval_results')
            .select('*')
            .eq('academic_year', currentTermData.current_academic_year)
            .eq('semester', currentTermData.current_semester)
            .eq('evaluatee_id', evaluateeData.id)
            .eq('evaluator_id', currentUser.id)
            .eq('eval_type', evaluationMode)
            .maybeSingle();

        if (error) {
            console.error('Error loading existing evaluation:', error);
            return;
        }

        if (existingEval) {
            const p1s1Values = existingEval.detailed_scores?.p1_s1 || [];
            const p1s2Values = existingEval.detailed_scores?.p1_s2 || [];
            const p2Value = existingEval.detailed_scores?.p2 || 0;
            const p3Values = existingEval.detailed_scores?.p3 || [];

            let detailHtml = `
                <div class="text-left text-sm mt-2">
                    <p class="font-bold text-blue-600">คะแนนเดิม:</p>
                    <p class="text-gray-600">องค์ประกอบที่ 1: <b>${existingEval.total_score.toFixed(2)}</b> / 100</p>
                    <p class="text-gray-500 text-xs mt-1">ตอนที่ 1: ${p1s1Values.join(', ') || 'ยังไม่ประเมิน'}</p>
                    <p class="text-gray-500 text-xs">ตอนที่ 2: ${p1s2Values.join(', ') || 'ยังไม่ประเมิน'}</p>
                    <p class="text-gray-500 text-xs">องค์ประกอบที่ 2: ระดับ ${p2Value || 'ยังไม่ประเมิน'}</p>
                    <p class="text-gray-500 text-xs">องค์ประกอบที่ 3: ${p3Values.join(', ') || 'ยังไม่ประเมิน'}</p>
                    <p class="text-gray-500 text-xs mt-1">สถานะ: <b>${existingEval.status === 'draft' ? 'ร่าง' : 'ส่งแล้ว'}</b></p>
                </div>
            `;

            const result = await Swal.fire({
                icon: 'info',
                title: 'พบการประเมินเดิม',
                html: `
                    <p>คุณเคยประเมินบุคลากรนี้แล้วในภาคเรียนนี้</p>
                    ${detailHtml}
                    <p class="mt-3">ต้องการดำเนินการอย่างไร?</p>
                `,
                showDenyButton: true,
                showCancelButton: true,
                confirmButtonText: '✅ แก้ไขต่อ (โหลดข้อมูลเดิม)',
                denyButtonText: '🗑️ เริ่มใหม่ (ลบข้อมูลเดิม)',
                cancelButtonText: '❌ ยกเลิก',
                confirmButtonColor: '#3085d6',
                denyButtonColor: '#d33',
                cancelButtonColor: '#6c757d'
            });

            if (result.isConfirmed) {
                loadScoresToForm(existingEval);
                Swal.fire({
                    icon: 'success',
                    title: 'โหลดข้อมูลสำเร็จ',
                    html: 'กรุณาตรวจสอบและแก้ไขคะแนนตามต้องการ<br><span class="text-sm text-gray-500">(ข้อมูลเดิมถูกโหลดมาให้แล้ว)</span>',
                    timer: 2000,
                    showConfirmButton: true
                });
            } else if (result.isDenied) {
                const { error: deleteError } = await db
                    .from('eval_results')
                    .delete()
                    .eq('id', existingEval.id);

                if (deleteError) {
                    console.error('Error deleting existing evaluation:', deleteError);
                    Swal.fire('ผิดพลาด', 'ไม่สามารถลบข้อมูลเดิมได้', 'error');
                } else {
                    window._existingEvalId = null;
                    resetForm();
                    Swal.fire({
                        icon: 'success',
                        title: 'เริ่มใหม่',
                        html: 'ลบข้อมูลเดิมเรียบร้อย<br><span class="text-sm text-gray-500">กรุณากรอกข้อมูลใหม่ทั้งหมด</span>',
                        timer: 2000,
                        showConfirmButton: true
                    });
                }
            } else {
                document.getElementById('dashboardView').classList.remove('hidden');
                document.getElementById('wizardView').classList.add('hidden');
                Swal.fire('ยกเลิก', 'ไม่ได้ทำการเปลี่ยนแปลง', 'info');
            }
        }
    } catch (err) {
        console.error('Error in loadExistingEvaluation:', err);
    }
}

// ==========================================
// ฟังก์ชันโหลดคะแนนเดิมใส่ฟอร์ม
// ==========================================
function loadScoresToForm(existingEval) {
    const detailedScores = existingEval.detailed_scores || {};

    console.log('📥 โหลดข้อมูลเดิม:', detailedScores);

    if (detailedScores.p1_s1 && Array.isArray(detailedScores.p1_s1)) {
        const p1s1Inputs = document.querySelectorAll('input[name^="p1s1_"]');

        const groups = {};
        p1s1Inputs.forEach(input => {
            if (!groups[input.name]) {
                groups[input.name] = [];
            }
            groups[input.name].push(input);
        });

        const sortedNames = Object.keys(groups).sort();

        sortedNames.forEach((name, index) => {
            if (index < detailedScores.p1_s1.length) {
                const value = detailedScores.p1_s1[index];
                if (value && value >= 1 && value <= 4) {
                    const radioToCheck = document.querySelector(`input[name="${name}"][value="${value}"]`);
                    if (radioToCheck) {
                        radioToCheck.checked = true;
                        console.log(`✅ p1s1: ${name} = ${value}`);
                    }
                }
            }
        });
    }

    if (detailedScores.p1_s2 && Array.isArray(detailedScores.p1_s2)) {
        const p1s2Inputs = document.querySelectorAll('input[name^="p1s2_"]');

        const groups = {};
        p1s2Inputs.forEach(input => {
            if (!groups[input.name]) {
                groups[input.name] = [];
            }
            groups[input.name].push(input);
        });

        const sortedNames = Object.keys(groups).sort();

        sortedNames.forEach((name, index) => {
            if (index < detailedScores.p1_s2.length) {
                const value = detailedScores.p1_s2[index];
                if (value && value >= 1 && value <= 4) {
                    const radioToCheck = document.querySelector(`input[name="${name}"][value="${value}"]`);
                    if (radioToCheck) {
                        radioToCheck.checked = true;
                        console.log(`✅ p1s2: ${name} = ${value}`);
                    }
                }
            }
        });
    }

    if (detailedScores.p2) {
        const p2Value = detailedScores.p2;
        const p2Input = document.querySelector(`input[name="sc_part2"][value="${p2Value}"]`);
        if (p2Input) {
            p2Input.checked = true;
            console.log(`✅ p2: ระดับ ${p2Value}`);
        }
    }

    if (detailedScores.p3 && Array.isArray(detailedScores.p3)) {
        const p3Inputs = document.querySelectorAll('input[name^="p3_"]');

        const groups = {};
        p3Inputs.forEach(input => {
            if (!groups[input.name]) {
                groups[input.name] = [];
            }
            groups[input.name].push(input);
        });

        const sortedNames = Object.keys(groups).sort();

        sortedNames.forEach((name, index) => {
            if (index < detailedScores.p3.length) {
                const value = detailedScores.p3[index];
                if (value && value >= 1 && value <= 4) {
                    const radioToCheck = document.querySelector(`input[name="${name}"][value="${value}"]`);
                    if (radioToCheck) {
                        radioToCheck.checked = true;
                        console.log(`✅ p3: ${name} = ${value}`);
                    }
                }
            }
        });
    }

    setTimeout(() => {
        calculateLiveTotal();
        console.log('📊 อัปเดตคะแนนเรียบร้อย');
    }, 100);

    window._existingEvalId = existingEval.id;
}

// ==========================================
// ฟังก์ชันรีเซ็ตฟอร์ม
// ==========================================
function resetForm() {
    document.querySelectorAll('input[type="radio"]').forEach(el => {
        el.checked = false;
    });

    const display = document.getElementById('liveTotalScoreDisplay');
    if (display) {
        display.innerHTML = `0.00 <span class="text-xs font-normal text-gray-500 ml-1">/ 100</span>`;
    }

    window._existingEvalId = null;
}

// ==========================================
// ฟังก์ชันสร้าง UI แบบ Dynamic
// ==========================================
function generateDynamicForm(academicLevel, allowedSubItems = null) {
    console.log('📋 generateDynamicForm - academicLevel:', academicLevel);
    console.log('📋 generateDynamicForm - allowedSubItems:', allowedSubItems);

    const criteriaSet = evalCriteriaDB[academicLevel] || evalCriteriaDB['ครูชำนาญการพิเศษ'];
    const isAssistant = academicLevel === 'ครูผู้ช่วย';

    const allowedSet = new Set();
    const allowedPart2Set = new Set();
    const allowedPart3Set = new Set();
    let hasAnyElement1 = false;
    let hasAnyElement2 = false;
    let hasAnyElement3 = false;

    // ✅ ตรวจสอบว่าเป็นโหมดประเมินตนเองหรือไม่
    const isSelfMode = allowedSubItems === null;

    if (isSelfMode) {
        // ✅ โหมดประเมินตนเอง: แสดงทุกองค์ประกอบ
        hasAnyElement1 = true;
        hasAnyElement2 = true;
        hasAnyElement3 = true;
        console.log('📋 โหมดประเมินตนเอง: แสดงทุกองค์ประกอบ');
    } else if (allowedSubItems && Array.isArray(allowedSubItems)) {
        allowedSubItems.forEach(item => {
            if (item.element === '1') {
                hasAnyElement1 = true;
                let convertedValue = item.value;
                if (convertedValue.includes('.')) {
                    convertedValue = convertedValue.replace('.', '_');
                }
                if (item.part === '1') {
                    allowedSet.add(convertedValue);
                    allowedSet.add(item.value);
                } else if (item.part === '2') {
                    allowedPart2Set.add(item.value);
                    if (item.value.includes('.')) {
                        allowedPart2Set.add(item.value.replace('.', '_'));
                    }
                }
            } else if (item.element === '2') {
                hasAnyElement2 = true;
            } else if (item.element === '3') {
                hasAnyElement3 = true;
                const idx = parseInt(item.value) - 1;
                if (!isNaN(idx) && idx >= 0 && idx < PART3_ITEMS.length) {
                    allowedPart3Set.add(idx);
                }
            }
        });
    }

    const isRestricted = allowedSubItems !== null && allowedSubItems.length > 0;

    window._hasElement1 = hasAnyElement1;
    window._hasElement2 = hasAnyElement2;
    window._hasElement3 = hasAnyElement3;

    // ==========================================
    // STEP 1: องค์ประกอบที่ 1
    // ==========================================
    let step1HTML = `
        <h3 class="text-lg font-bold text-blue-800 mb-4 border-b pb-2">ส่วนที่ 1: การประเมินประสิทธิภาพและประสิทธิผล (80 คะแนน)</h3>
        <p class="text-sm text-blue-600 mb-4">* ระบบตรวจพบวิทยฐานะ: <span class="font-bold">${academicLevel}</span></p>
    `;

    if (!hasAnyElement1 && !isSelfMode) {
        step1HTML += `
            <div class="bg-blue-50 p-6 rounded-xl text-center border border-blue-200">
                <div class="flex items-center justify-center gap-3 mb-2">
                    <i class="fa-solid fa-check-circle text-2xl text-blue-400"></i>
                    <span class="text-lg font-bold text-blue-600">✅ ไม่มีการประเมินองค์ประกอบที่ 1</span>
                </div>
                <p class="text-sm text-blue-500">ชุดคณะกรรมการนี้ไม่ได้รับมอบหมายให้ประเมินองค์ประกอบที่ 1</p>
                <p class="text-xs text-blue-400 mt-1">กรุณากดปุ่ม <span class="font-bold">"ถัดไป"</span> เพื่อข้ามขั้นตอนนี้</p>
            </div>
        `;
    } else if (hasAnyElement1) {
        step1HTML += `
            <div class="mb-4 bg-amber-50 p-3 rounded-xl border border-amber-200">
                <div class="flex items-center gap-2">
                    <i class="fa-solid fa-info-circle text-amber-500"></i>
                    <span class="text-sm text-amber-700 font-medium">กรุณาประเมินตามหัวข้อย่อยที่ได้รับมอบหมาย</span>
                </div>
                ${!isSelfMode ? `<p class="text-xs text-amber-500 mt-1 ml-6">หัวข้อย่อยที่ต้องประเมิน: ${allowedSubItems.filter(s => s.element === '1').map(s => s.value).join(', ')}</p>` : ''}
            </div>
            <div class="mb-4 bg-blue-100 p-3 rounded-xl border border-blue-200">
                <h4 class="font-bold text-blue-800"><i class="fa-solid fa-book-open text-blue-600 mr-2"></i>ตอนที่ 1 : ระดับความสำเร็จในการพัฒนางานตามมาตรฐานตำแหน่ง (${criteriaSet.part1_sec1_base} คะแนน)</h4>
                ${isAssistant ? `<p class="text-sm text-blue-600 mt-1">* ครูผู้ช่วย ใช้ฐานคะแนน 80 คะแนน (14 ข้อ)</p>` : `<p class="text-sm text-blue-600 mt-1">* ใช้ฐานคะแนน 60 คะแนน (15 ข้อ)</p>`}
            </div>
        `;

        let hasAnyItem = false;
        let totalItems = 0;

        criteriaSet.part1_sec1.forEach((group) => {
            let filteredItems = group.items;
            if (isRestricted) {
                filteredItems = group.items.filter(item => {
                    const dotVersion = item.id.replace('_', '.');
                    return allowedSet.has(item.id) || allowedSet.has(dotVersion);
                });
            }

            if (filteredItems.length === 0) return;
            hasAnyItem = true;
            totalItems += filteredItems.length;

            step1HTML += `<div class="bg-blue-50/50 border border-blue-100 rounded-xl p-5 mb-6">`;
            step1HTML += `<h4 class="font-bold text-blue-800 mb-4 border-b border-blue-200 pb-2">${group.group}</h4>`;

            filteredItems.forEach((item) => {
                step1HTML += `
                <div class="mb-5 bg-white p-4 rounded-lg shadow-sm border border-gray-100 transition-all hover:shadow-md">
                    <label class="block text-sm font-bold text-gray-800 mb-1">${item.label}</label>
                    <p class="text-xs text-gray-500 mb-3 leading-relaxed">${item.desc}</p>
                    <div class="flex items-center gap-4 flex-wrap">
                        <span class="text-xs font-bold text-gray-400">ให้คะแนน:</span>
                        <div class="flex gap-2">
                            <label class="flex items-center gap-1.5 cursor-pointer hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-blue-200">
                                <input type="radio" name="p1s1_${item.id}" value="1" class="live-calc p1s1-input w-4 h-4 text-blue-600 focus:ring-blue-500">
                                <span class="text-sm font-medium text-gray-700">1</span>
                            </label>
                            <label class="flex items-center gap-1.5 cursor-pointer hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-blue-200">
                                <input type="radio" name="p1s1_${item.id}" value="2" class="live-calc p1s1-input w-4 h-4 text-blue-600 focus:ring-blue-500">
                                <span class="text-sm font-medium text-gray-700">2</span>
                            </label>
                            <label class="flex items-center gap-1.5 cursor-pointer hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-blue-200">
                                <input type="radio" name="p1s1_${item.id}" value="3" class="live-calc p1s1-input w-4 h-4 text-blue-600 focus:ring-blue-500">
                                <span class="text-sm font-medium text-gray-700">3</span>
                            </label>
                            <label class="flex items-center gap-1.5 cursor-pointer hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-blue-200">
                                <input type="radio" name="p1s1_${item.id}" value="4" class="live-calc p1s1-input w-4 h-4 text-blue-600 focus:ring-blue-500">
                                <span class="text-sm font-medium text-gray-700">4</span>
                            </label>
                        </div>
                    </div>
                </div>`;
            });
            step1HTML += `</div>`;
        });

        if (!hasAnyItem) {
            step1HTML += `
                <div class="bg-yellow-50 p-6 rounded-xl text-center border border-yellow-200">
                    <i class="fa-solid fa-triangle-exclamation text-2xl text-yellow-400 mb-2"></i>
                    <p class="text-yellow-700 font-medium">ไม่พบหัวข้อย่อยที่ตรงกับวิทยฐานะ ${academicLevel}</p>
                    <p class="text-xs text-yellow-500 mt-1">หัวข้อย่อยที่ได้รับมอบหมาย: ${allowedSubItems ? allowedSubItems.filter(s => s.element === '1' && s.part === '1').map(s => s.value).join(', ') : 'ไม่มี'}</p>
                    <p class="text-xs text-yellow-400 mt-2">กรุณาติดต่อผู้ดูแลระบบเพื่อตรวจสอบการตั้งค่า</p>
                </div>
            `;
        } else {
            step1HTML += `
                <div class="text-sm text-gray-400 text-center mt-2">
                    <i class="fa-solid fa-list-check mr-1"></i> จำนวนข้อที่ต้องประเมิน: <span class="font-bold text-blue-600">${totalItems}</span> ข้อ
                </div>
            `;
        }

        let hasPart2Items = false;
        let part2Items = [];
        if (isRestricted) {
            const part2Allowed = allowedSubItems.filter(s => s.element === '1' && s.part === '2');
            hasPart2Items = part2Allowed.length > 0;
            if (hasPart2Items) {
                const allowedIds = new Set();
                part2Allowed.forEach(s => {
                    allowedIds.add(s.value);
                    if (s.value.includes('.')) {
                        allowedIds.add(s.value.replace('.', '_'));
                    }
                });
                part2Items = criteriaSet.part1_sec2.filter(item => {
                    const mappedId = item.id === 's2_1' ? '1' :
                        item.id === 's2_2_1' ? '2.1' :
                            item.id === 's2_2_2' ? '2.2' : item.id;
                    const mappedIdUnderscore = mappedId.replace('.', '_');
                    return allowedIds.has(mappedId) || allowedIds.has(mappedIdUnderscore);
                });
                hasPart2Items = part2Items.length > 0;
            }
        } else if (!isRestricted) {
            hasPart2Items = criteriaSet.part1_sec2.length > 0;
            part2Items = criteriaSet.part1_sec2;
        }

        if (hasPart2Items && part2Items.length > 0) {
            step1HTML += `
                <div class="mt-8 mb-4 bg-indigo-100 p-3 rounded-xl border border-indigo-200">
                    <h4 class="font-bold text-indigo-800"><i class="fa-solid fa-bullseye text-indigo-600 mr-2"></i>ตอนที่ 2 : ระดับความสำเร็จในการพัฒนางานที่เสนอเป็นประเด็นท้าทาย (20 คะแนน)</h4>
                    <p class="text-xs text-indigo-500 mt-1">จำนวนข้อที่ต้องประเมิน: <span class="font-bold">${part2Items.length}</span> ข้อ</p>
                </div>
                <div class="bg-indigo-50 border border-indigo-100 rounded-xl p-5 mb-6">
            `;

            part2Items.forEach((item) => {
                step1HTML += `
                <div class="mb-5 bg-white p-4 rounded-lg shadow-sm border border-gray-100 transition-all hover:shadow-md">
                    <label class="block text-sm font-bold text-gray-800 mb-1">${item.label} (เต็ม ${item.max_raw} คะแนน)</label>
                    <p class="text-xs text-gray-500 mb-3 leading-relaxed">${item.desc}</p>
                    <div class="flex items-center gap-4 flex-wrap">
                        <span class="text-xs font-bold text-gray-400">ระดับคุณภาพ:</span>
                        <div class="flex gap-2">
                            <label class="flex items-center gap-1.5 cursor-pointer hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-indigo-200">
                                <input type="radio" name="p1s2_${item.id}" value="1" data-max="${item.max_raw}" class="live-calc p1s2-input w-4 h-4 text-indigo-600 focus:ring-indigo-500">
                                <span class="text-sm font-medium text-gray-700">ระดับ 1</span>
                            </label>
                            <label class="flex items-center gap-1.5 cursor-pointer hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-indigo-200">
                                <input type="radio" name="p1s2_${item.id}" value="2" data-max="${item.max_raw}" class="live-calc p1s2-input w-4 h-4 text-indigo-600 focus:ring-indigo-500">
                                <span class="text-sm font-medium text-gray-700">ระดับ 2</span>
                            </label>
                            <label class="flex items-center gap-1.5 cursor-pointer hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-indigo-200">
                                <input type="radio" name="p1s2_${item.id}" value="3" data-max="${item.max_raw}" class="live-calc p1s2-input w-4 h-4 text-indigo-600 focus:ring-indigo-500">
                                <span class="text-sm font-medium text-gray-700">ระดับ 3</span>
                            </label>
                            <label class="flex items-center gap-1.5 cursor-pointer hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-indigo-200">
                                <input type="radio" name="p1s2_${item.id}" value="4" data-max="${item.max_raw}" class="live-calc p1s2-input w-4 h-4 text-indigo-600 focus:ring-indigo-500">
                                <span class="text-sm font-medium text-gray-700">ระดับ 4</span>
                            </label>
                        </div>
                    </div>
                </div>`;
            });
            step1HTML += `</div>`;
        } else if (isRestricted) {
            step1HTML += `
                <div class="mt-4 bg-gray-50 p-4 rounded-xl border border-gray-200 text-center">
                    <i class="fa-solid fa-check-circle text-green-400 mr-2"></i>
                    <span class="text-sm text-gray-500">ไม่มีการประเมินตอนที่ 2 ในชุดคณะกรรมการนี้</span>
                    <span class="text-xs text-gray-400 block mt-1">✔ ข้ามขั้นตอนนี้ได้</span>
                </div>
            `;
        }
    } else {
        step1HTML += `
            <div class="bg-yellow-50 p-6 rounded-xl text-center border border-yellow-200">
                <i class="fa-solid fa-triangle-exclamation text-2xl text-yellow-400 mb-2"></i>
                <p class="text-yellow-700 font-medium">ไม่พบข้อมูลการประเมิน</p>
                <p class="text-xs text-yellow-500 mt-1">กรุณาติดต่อผู้ดูแลระบบ</p>
            </div>
        `;
    }

    document.getElementById('step1').innerHTML = step1HTML;

    // ==========================================
    // STEP 2: องค์ประกอบที่ 2
    // ==========================================
    if (hasAnyElement2) {
        let step2HTML = `
            <h3 class="text-lg font-bold text-emerald-800 mb-4 border-b pb-2">ส่วนที่ 2: การประเมินการมีส่วนร่วมในการพัฒนาการศึกษา (10 คะแนน)</h3>
            <div class="bg-emerald-50 border border-emerald-100 rounded-xl p-5">
                ${!isSelfMode ? `
                <div class="mb-3 bg-emerald-100 p-2 rounded-lg">
                    <p class="text-sm text-emerald-700 font-medium"><i class="fa-solid fa-info-circle mr-2"></i>ท่านได้รับมอบหมายให้ประเมินองค์ประกอบที่ 2</p>
                </div>
                ` : `
                <div class="mb-3 bg-emerald-100 p-2 rounded-lg">
                    <p class="text-sm text-emerald-700 font-medium"><i class="fa-solid fa-info-circle mr-2"></i>ประเมินตนเอง องค์ประกอบที่ 2</p>
                </div>
                `}
                <label class="block text-sm font-bold text-gray-800 mb-3">ความสำเร็จของงานที่ได้รับมอบหมายจากผู้บังคับบัญชา</label>
                <div class="flex flex-wrap items-center gap-3">
                    <span class="text-xs font-bold text-gray-400">ระดับความสำเร็จ:</span>
                    <div class="flex flex-wrap gap-2">
                        <label class="flex items-center gap-1.5 cursor-pointer hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-emerald-200">
                            <input type="radio" name="sc_part2" value="1" class="live-calc p2-input w-4 h-4 text-emerald-600 focus:ring-emerald-500">
                            <span class="text-sm font-medium text-gray-700">ระดับ 1</span>
                        </label>
                        <label class="flex items-center gap-1.5 cursor-pointer hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-emerald-200">
                            <input type="radio" name="sc_part2" value="2" class="live-calc p2-input w-4 h-4 text-emerald-600 focus:ring-emerald-500">
                            <span class="text-sm font-medium text-gray-700">ระดับ 2</span>
                        </label>
                        <label class="flex items-center gap-1.5 cursor-pointer hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-emerald-200">
                            <input type="radio" name="sc_part2" value="3" class="live-calc p2-input w-4 h-4 text-emerald-600 focus:ring-emerald-500">
                            <span class="text-sm font-medium text-gray-700">ระดับ 3</span>
                        </label>
                        <label class="flex items-center gap-1.5 cursor-pointer hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-emerald-200">
                            <input type="radio" name="sc_part2" value="4" class="live-calc p2-input w-4 h-4 text-emerald-600 focus:ring-emerald-500">
                            <span class="text-sm font-medium text-gray-700">ระดับ 4</span>
                        </label>
                        <label class="flex items-center gap-1.5 cursor-pointer hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-emerald-200">
                            <input type="radio" name="sc_part2" value="5" class="live-calc p2-input w-4 h-4 text-emerald-600 focus:ring-emerald-500">
                            <span class="text-sm font-medium text-gray-700">ระดับ 5</span>
                        </label>
                    </div>
                </div>
                <div class="mt-3 text-xs text-gray-400 grid grid-cols-2 md:grid-cols-5 gap-1">
                    <span>ระดับ 1: ต่ำกว่าร้อยละ 19.99</span>
                    <span>ระดับ 2: ร้อยละ 20.00 - 39.99</span>
                    <span>ระดับ 3: ร้อยละ 40.00 - 59.99</span>
                    <span>ระดับ 4: ร้อยละ 60.00 - 79.99</span>
                    <span>ระดับ 5: ร้อยละ 80.00 ขึ้นไป</span>
                </div>
            </div>
        `;
        document.getElementById('step2').innerHTML = step2HTML;
    } else {
        document.getElementById('step2').innerHTML = `
            <div class="bg-gray-50 p-8 rounded-xl text-center border border-gray-200">
                <div class="flex items-center justify-center gap-3 mb-2">
                    <i class="fa-solid fa-check-circle text-2xl text-gray-400"></i>
                    <span class="text-lg font-bold text-gray-500">✅ ไม่มีการประเมินองค์ประกอบที่ 2</span>
                </div>
                <p class="text-sm text-gray-400">ชุดคณะกรรมการนี้ไม่ได้รับมอบหมายให้ประเมินองค์ประกอบที่ 2</p>
                <div class="mt-3 inline-block bg-blue-50 px-4 py-2 rounded-lg">
                    <span class="text-sm text-blue-500">👉 กดปุ่ม <span class="font-bold">"ถัดไป"</span> เพื่อข้ามขั้นตอนนี้</span>
                </div>
            </div>
        `;
    }

    // ==========================================
    // STEP 3: องค์ประกอบที่ 3
    // ==========================================
    if (hasAnyElement3) {
        let part3Items = PART3_ITEMS;
        if (isRestricted && allowedPart3Set.size > 0) {
            part3Items = PART3_ITEMS.filter((_, index) => allowedPart3Set.has(index));
        }

        let step3HTML = `
            <h3 class="text-lg font-bold text-purple-800 mb-4 border-b pb-2">ส่วนที่ 3: การประเมินการปฏิบัติตนในการรักษาวินัย คุณธรรม จริยธรรม (10 คะแนน)</h3>
            <div class="bg-purple-50 border border-purple-100 rounded-xl p-5">
                <div class="mb-3 bg-purple-100 p-2 rounded-lg">
                    <p class="text-sm text-purple-700 font-medium"><i class="fa-solid fa-info-circle mr-2"></i>ท่านได้รับมอบหมายให้ประเมินองค์ประกอบที่ 3 จำนวน ${part3Items.length} ข้อ</p>
                </div>
        `;

        if (part3Items.length === 0) {
            step3HTML += `
                <div class="text-center text-gray-400 py-4">
                    <i class="fa-solid fa-info-circle mr-2"></i>ไม่มีการประเมินองค์ประกอบที่ 3 ในชุดคณะกรรมการนี้
                </div>
            `;
        } else {
            part3Items.forEach((text, index) => {
                const realIndex = PART3_ITEMS.indexOf(text);
                step3HTML += `
                <div class="mb-4 bg-white p-3 rounded-lg shadow-sm border border-gray-100">
                    <label class="text-sm font-bold text-gray-800 flex-1 leading-relaxed block mb-2"><span class="text-purple-600 mr-1">${realIndex + 1}.</span> ${text}</label>
                    <div class="flex items-center gap-4 flex-wrap">
                        <span class="text-xs font-bold text-gray-400">คะแนน:</span>
                        <div class="flex gap-2">
                            <label class="flex items-center gap-1 cursor-pointer hover:bg-purple-50 px-2.5 py-1 rounded-lg transition-colors border border-transparent hover:border-purple-200">
                                <input type="radio" name="p3_${realIndex}" value="1" class="live-calc p3-input w-4 h-4 text-purple-600 focus:ring-purple-500">
                                <span class="text-sm font-medium text-gray-700">1</span>
                            </label>
                            <label class="flex items-center gap-1 cursor-pointer hover:bg-purple-50 px-2.5 py-1 rounded-lg transition-colors border border-transparent hover:border-purple-200">
                                <input type="radio" name="p3_${realIndex}" value="2" class="live-calc p3-input w-4 h-4 text-purple-600 focus:ring-purple-500">
                                <span class="text-sm font-medium text-gray-700">2</span>
                            </label>
                            <label class="flex items-center gap-1 cursor-pointer hover:bg-purple-50 px-2.5 py-1 rounded-lg transition-colors border border-transparent hover:border-purple-200">
                                <input type="radio" name="p3_${realIndex}" value="3" class="live-calc p3-input w-4 h-4 text-purple-600 focus:ring-purple-500">
                                <span class="text-sm font-medium text-gray-700">3</span>
                            </label>
                            <label class="flex items-center gap-1 cursor-pointer hover:bg-purple-50 px-2.5 py-1 rounded-lg transition-colors border border-transparent hover:border-purple-200">
                                <input type="radio" name="p3_${realIndex}" value="4" class="live-calc p3-input w-4 h-4 text-purple-600 focus:ring-purple-500">
                                <span class="text-sm font-medium text-gray-700">4</span>
                            </label>
                        </div>
                    </div>
                </div>`;
            });
        }
        step3HTML += `</div>`;
        document.getElementById('step3').innerHTML = step3HTML;
    } else {
        document.getElementById('step3').innerHTML = `
            <div class="bg-gray-50 p-8 rounded-xl text-center border border-gray-200">
                <div class="flex items-center justify-center gap-3 mb-2">
                    <i class="fa-solid fa-check-circle text-2xl text-gray-400"></i>
                    <span class="text-lg font-bold text-gray-500">✅ ไม่มีการประเมินองค์ประกอบที่ 3</span>
                </div>
                <p class="text-sm text-gray-400">ชุดคณะกรรมการนี้ไม่ได้รับมอบหมายให้ประเมินองค์ประกอบที่ 3</p>
                <div class="mt-3 inline-block bg-blue-50 px-4 py-2 rounded-lg">
                    <span class="text-sm text-blue-500">👉 กดปุ่ม <span class="font-bold">"ถัดไป"</span> เพื่อข้ามขั้นตอนนี้</span>
                </div>
            </div>
        `;
    }

    document.querySelectorAll('.live-calc').forEach(el => {
        el.addEventListener('change', calculateLiveTotal);
    });

    updateWizardUI();
}

// ==========================================
// ฟังก์ชันเปลี่ยนขั้นตอน
// ==========================================
function changeStep(direction) {
    if (direction === 1) {
        if (wizardCurrentStep === 1) {
            const p1s1Groups = document.querySelectorAll('[name^="p1s1_"]');
            const p1s2Groups = document.querySelectorAll('[name^="p1s2_"]');
            const hasElement1 = p1s1Groups.length > 0 || p1s2Groups.length > 0;

            if (hasElement1) {
                let missing = false;
                const groupNames = new Set();
                p1s1Groups.forEach(el => groupNames.add(el.name));
                p1s2Groups.forEach(el => groupNames.add(el.name));

                groupNames.forEach(name => {
                    const checked = document.querySelector(`input[name="${name}"]:checked`);
                    if (!checked) missing = true;
                });

                if (missing) {
                    return Swal.fire('แจ้งเตือน', 'กรุณาให้คะแนนองค์ประกอบที่ 1 ให้ครบทุกข้อ', 'warning');
                }
            }
        }

        if (wizardCurrentStep === 2) {
            const p2Inputs = document.querySelectorAll('input[name="sc_part2"]');
            if (p2Inputs.length > 0) {
                const p2Checked = document.querySelector('input[name="sc_part2"]:checked');
                if (!p2Checked) {
                    return Swal.fire('แจ้งเตือน', 'กรุณาเลือกระดับความสำเร็จองค์ประกอบที่ 2', 'warning');
                }
            }
        }

        if (wizardCurrentStep === 3) {
            const p3Groups = document.querySelectorAll('[name^="p3_"]');
            if (p3Groups.length > 0) {
                const groupNames3 = new Set();
                p3Groups.forEach(el => groupNames3.add(el.name));

                let missingP3 = false;
                groupNames3.forEach(name => {
                    const checked = document.querySelector(`input[name="${name}"]:checked`);
                    if (!checked) missingP3 = true;
                });

                if (missingP3) {
                    return Swal.fire('แจ้งเตือน', 'กรุณาให้คะแนนส่วนที่ 3 ให้ครบทุกข้อ', 'warning');
                }
            }
        }
    }

    document.getElementById(`step${wizardCurrentStep}`).classList.add('hidden');
    wizardCurrentStep += direction;
    document.getElementById(`step${wizardCurrentStep}`).classList.remove('hidden');

    if (wizardCurrentStep === 4) {
        updateSummary();
    }

    updateWizardUI();
}

// ==========================================
// อัปเดต UI Wizard
// ==========================================
function updateWizardUI() {
    const totalSteps = 4;
    document.getElementById('currentStepText').innerText = wizardCurrentStep;
    document.getElementById('progressBar').style.width = `${(wizardCurrentStep / totalSteps) * 100}%`;

    document.getElementById('btnPrev').classList.toggle('hidden', wizardCurrentStep === 1);
    document.getElementById('btnNext').classList.toggle('hidden', wizardCurrentStep === totalSteps);

    const nextBtn = document.getElementById('btnNext');
    if (nextBtn && wizardCurrentStep < totalSteps) {
        let hasItems = false;
        if (wizardCurrentStep === 1) {
            const p1s1Inputs = document.querySelectorAll('input[name^="p1s1_"]');
            const p1s2Inputs = document.querySelectorAll('input[name^="p1s2_"]');
            hasItems = p1s1Inputs.length > 0 || p1s2Inputs.length > 0;
        } else if (wizardCurrentStep === 2) {
            const p2Inputs = document.querySelectorAll('input[name="sc_part2"]');
            hasItems = p2Inputs.length > 0;
        } else if (wizardCurrentStep === 3) {
            const p3Inputs = document.querySelectorAll('input[name^="p3_"]');
            hasItems = p3Inputs.length > 0;
        }

        if (!hasItems) {
            nextBtn.innerHTML = 'ข้าม <i class="fa-solid fa-forward-step ml-1"></i>';
            nextBtn.className = 'bg-gray-400 hover:bg-gray-500 text-white px-6 py-2.5 rounded-xl font-bold shadow-md transition-colors ml-auto';
        } else {
            nextBtn.innerHTML = 'ถัดไป <i class="fa-solid fa-chevron-right ml-1"></i>';
            nextBtn.className = 'bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-bold shadow-md transition-colors ml-auto';
        }
    }

    const submitBtn = document.getElementById('btnSubmit');
    if (isEditingMode && submitBtn) {
        submitBtn.innerHTML = '<i class="fa-solid fa-pen-to-square mr-1"></i> บันทึกการแก้ไข';
        submitBtn.classList.remove('bg-emerald-600', 'hover:bg-emerald-700');
        submitBtn.classList.add('bg-amber-600', 'hover:bg-amber-700');
        submitBtn.classList.remove('hidden');
    } else if (submitBtn) {
        submitBtn.innerHTML = '<i class="fa-solid fa-floppy-disk mr-1"></i> บันทึกผลการประเมิน';
        submitBtn.classList.remove('bg-amber-600', 'hover:bg-amber-700');
        submitBtn.classList.add('bg-emerald-600', 'hover:bg-emerald-700');
        submitBtn.classList.toggle('hidden', wizardCurrentStep !== totalSteps);
    }
}

// ==========================================
// ฟังก์ชันคำนวณคะแนนรวม (Real-time)
// ==========================================
function calculateLiveTotal() {
    if (!evaluateeData) return 0;

    const academic = evaluateeData.academic_standing || 'ไม่มีวิทยฐานะ';
    const isAssistant = academic === 'ครูผู้ช่วย';

    let part1Total = 0;
    let part2Total = 0;
    let part3Total = 0;

    let p1s1Raw = 0;
    const p1s1Inputs = document.querySelectorAll('input[name^="p1s1_"]:checked');
    if (p1s1Inputs.length > 0) {
        p1s1Inputs.forEach(el => {
            p1s1Raw += parseInt(el.value) || 0;
        });
        if (isAssistant) {
            part1Total += (p1s1Raw * 80) / 56;
        } else {
            part1Total += (p1s1Raw / 60) * 60;
        }
    }

    let p1s2Raw = 0;
    const p1s2Inputs = document.querySelectorAll('input[name^="p1s2_"]:checked');
    if (p1s2Inputs.length > 0) {
        p1s2Inputs.forEach(el => {
            let val = parseInt(el.value) || 0;
            let max = parseInt(el.getAttribute('data-max')) || 0;
            p1s2Raw += (val * 0.25) * max;
        });
        part1Total += (p1s2Raw * 20) / 40;
    }

    const p2Inputs = document.querySelectorAll('input[name="sc_part2"]');
    if (p2Inputs.length > 0) {
        const p2Checked = document.querySelector('input[name="sc_part2"]:checked');
        if (p2Checked) {
            const p2Val = parseFloat(p2Checked.value) || 0;
            part2Total = p2Val * 2;
        }
    }

    let p3Raw = 0;
    const p3Inputs = document.querySelectorAll('input[name^="p3_"]:checked');
    if (p3Inputs.length > 0) {
        p3Inputs.forEach(el => {
            p3Raw += parseInt(el.value) || 0;
        });
        part3Total = p3Raw / 4;
    }

    const grandTotal = part1Total + part2Total + part3Total;

    const display = document.getElementById('liveTotalScoreDisplay');
    if (display) {
        display.innerHTML = `${grandTotal.toFixed(2)} <span class="text-xs font-normal text-gray-500 ml-1">/ 100</span>`;
        display.classList.add('scale-110', 'text-emerald-500');
        setTimeout(() => { display.classList.remove('scale-110', 'text-emerald-500'); }, 200);
    }

    return grandTotal;
}

// ==========================================
// ฟังก์ชันอัปเดตสรุปคะแนน (Step 4)
// ==========================================
function updateSummary() {
    if (!evaluateeData) return;

    const academic = evaluateeData.academic_standing || 'ไม่มีวิทยฐานะ';
    const isAssistant = academic === 'ครูผู้ช่วย';

    let p1s1Raw = 0;
    document.querySelectorAll('input[name^="p1s1_"]:checked').forEach(el => {
        p1s1Raw += parseInt(el.value) || 0;
    });

    let p1s1Final = 0;
    if (isAssistant) {
        p1s1Final = (p1s1Raw * 80) / 56;
    } else {
        p1s1Final = (p1s1Raw / 60) * 60;
    }

    let p1s2Raw = 0;
    document.querySelectorAll('input[name^="p1s2_"]:checked').forEach(el => {
        let val = parseInt(el.value) || 0;
        let max = parseInt(el.getAttribute('data-max')) || 0;
        p1s2Raw += (val * 0.25) * max;
    });
    let p1s2Final = (p1s2Raw * 20) / 40;

    let part1Total = p1s1Final + p1s2Final;

    const p2Checked = document.querySelector('input[name="sc_part2"]:checked');
    const p2Val = p2Checked ? parseFloat(p2Checked.value) : 0;
    const hasPart2 = document.querySelectorAll('input[name="sc_part2"]').length > 0;
    const part2Total = hasPart2 ? p2Val * 2 : 0;

    let p3Raw = 0;
    document.querySelectorAll('input[name^="p3_"]:checked').forEach(el => {
        p3Raw += parseInt(el.value) || 0;
    });
    const hasPart3 = document.querySelectorAll('input[name^="p3_"]').length > 0;
    const part3Total = hasPart3 ? p3Raw / 4 : 0;

    let grandTotal = part1Total;
    if (hasPart2) grandTotal += part2Total;
    if (hasPart3) grandTotal += part3Total;

    document.getElementById('summary_evaluatee_name').innerText =
        `${evaluateeData.first_name} ${evaluateeData.last_name}`;
    document.getElementById('summary_academic_standing').innerText = academic;
    document.getElementById('summary_term').innerText =
        `ภาคเรียนที่ ${currentTermData.current_semester} / ${currentTermData.current_academic_year}`;

    document.getElementById('summary_part1_score').innerText = part1Total.toFixed(2);
    document.getElementById('summary_part1_sec1').innerText = p1s1Final.toFixed(2);
    document.getElementById('summary_part1_sec2').innerText = p1s2Final.toFixed(2);

    const part2Section = document.getElementById('summary_part2_score')?.parentElement?.parentElement;
    if (part2Section) {
        if (hasPart2) {
            part2Section.style.display = 'block';
            document.getElementById('summary_part2_score').innerText = part2Total.toFixed(2);
            const levelText = {
                0: 'ยังไม่ประเมิน',
                1: 'ระดับ 1 (ต่ำกว่าร้อยละ 19.99)',
                2: 'ระดับ 2 (ร้อยละ 20.00 - 39.99)',
                3: 'ระดับ 3 (ร้อยละ 40.00 - 59.99)',
                4: 'ระดับ 4 (ร้อยละ 60.00 - 79.99)',
                5: 'ระดับ 5 (ร้อยละ 80.00 ขึ้นไป)'
            };
            document.getElementById('summary_part2_level').innerText = levelText[p2Val] || '-';
        } else {
            part2Section.style.display = 'none';
        }
    }

    const part3Section = document.getElementById('summary_part3_score')?.parentElement?.parentElement;
    if (part3Section) {
        if (hasPart3) {
            part3Section.style.display = 'block';
            document.getElementById('summary_part3_score').innerText = part3Total.toFixed(2);
            document.getElementById('summary_part3_raw').innerText = p3Raw;
        } else {
            part3Section.style.display = 'none';
        }
    }

    document.getElementById('summary_total_score').innerText = grandTotal.toFixed(2);

    let grade = '';
    let statusIcon = '';
    if (grandTotal >= 80) {
        grade = 'ดีมาก';
        statusIcon = '<i class="fa-solid fa-circle-check text-emerald-300"></i>';
    } else if (grandTotal >= 70) {
        grade = 'ดี';
        statusIcon = '<i class="fa-solid fa-circle-check text-blue-300"></i>';
    } else if (grandTotal >= 60) {
        grade = 'พอใช้';
        statusIcon = '<i class="fa-solid fa-circle-exclamation text-yellow-300"></i>';
    } else if (grandTotal > 0) {
        grade = 'ควรปรับปรุง';
        statusIcon = '<i class="fa-solid fa-circle-xmark text-red-300"></i>';
    } else {
        grade = 'ยังไม่ประเมิน';
        statusIcon = '<i class="fa-solid fa-clock text-gray-300"></i>';
    }
    document.getElementById('summary_grade').innerText = grade;
    document.getElementById('summary_status_icon').innerHTML = statusIcon;
}

// ==========================================
// ฟังก์ชันบันทึกผลการประเมิน
// ==========================================
async function submitEvaluation() {
    let missingP1 = false;
    const p1s1Groups = document.querySelectorAll('[name^="p1s1_"]');
    const p1s2Groups = document.querySelectorAll('[name^="p1s2_"]');

    const hasElement1 = p1s1Groups.length > 0 || p1s2Groups.length > 0;

    if (hasElement1) {
        const groupNames = new Set();
        p1s1Groups.forEach(el => groupNames.add(el.name));
        p1s2Groups.forEach(el => groupNames.add(el.name));

        groupNames.forEach(name => {
            const checked = document.querySelector(`input[name="${name}"]:checked`);
            if (!checked) missingP1 = true;
        });

        if (missingP1) {
            return Swal.fire('แจ้งเตือน', 'กรุณาให้คะแนนองค์ประกอบที่ 1 ให้ครบทุกข้อ', 'warning');
        }
    } else {
        console.log('ℹ️ ไม่มีองค์ประกอบที่ 1 ในฟอร์ม ข้ามการตรวจสอบ');
    }

    const p2Inputs = document.querySelectorAll('input[name="sc_part2"]');
    if (p2Inputs.length > 0) {
        const p2Checked = document.querySelector('input[name="sc_part2"]:checked');
        if (!p2Checked) {
            return Swal.fire('แจ้งเตือน', 'กรุณาเลือกระดับความสำเร็จองค์ประกอบที่ 2', 'warning');
        }
    } else {
        console.log('ℹ️ ไม่มีองค์ประกอบที่ 2 ในฟอร์ม ข้ามการตรวจสอบ');
    }

    const p3Groups = document.querySelectorAll('[name^="p3_"]');
    if (p3Groups.length > 0) {
        const groupNames3 = new Set();
        p3Groups.forEach(el => groupNames3.add(el.name));

        let missingP3 = false;
        groupNames3.forEach(name => {
            const checked = document.querySelector(`input[name="${name}"]:checked`);
            if (!checked) missingP3 = true;
        });

        if (missingP3) {
            return Swal.fire('แจ้งเตือน', 'กรุณาให้คะแนนส่วนที่ 3 ให้ครบทุกข้อ', 'warning');
        }
    } else {
        console.log('ℹ️ ไม่มีองค์ประกอบที่ 3 ในฟอร์ม ข้ามการตรวจสอบ');
    }

    const hasAnyScore = p1s1Groups.length > 0 || p1s2Groups.length > 0 ||
        p2Inputs.length > 0 || p3Groups.length > 0;

    if (!hasAnyScore) {
        return Swal.fire('แจ้งเตือน', 'กรุณาให้คะแนนอย่างน้อย 1 องค์ประกอบ', 'warning');
    }

    updateSummary();
    const total = calculateLiveTotal();

    const rawScores = {
        p1_s1: Array.from(document.querySelectorAll('input[name^="p1s1_"]:checked')).map(el => parseInt(el.value) || 0),
        p1_s2: Array.from(document.querySelectorAll('input[name^="p1s2_"]:checked')).map(el => parseInt(el.value) || 0),
    };

    const p2Checked = document.querySelector('input[name="sc_part2"]:checked');
    if (p2Checked) {
        rawScores.p2 = parseInt(p2Checked.value) || 0;
    }

    const p3Checked = document.querySelectorAll('input[name^="p3_"]:checked');
    if (p3Checked.length > 0) {
        rawScores.p3 = Array.from(p3Checked).map(el => parseInt(el.value) || 0);
    }

    const hasScores = rawScores.p1_s1.length > 0 || rawScores.p1_s2.length > 0 ||
        rawScores.p2 !== undefined || (rawScores.p3 && rawScores.p3.length > 0);

    if (!hasScores) {
        return Swal.fire('แจ้งเตือน', 'กรุณาให้คะแนนอย่างน้อย 1 องค์ประกอบ', 'warning');
    }

    Swal.fire({ title: 'กำลังบันทึกคะแนน...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        if (window._existingEvalId) {
            const { data: currentEval } = await db
                .from('eval_results')
                .select('status')
                .eq('id', window._existingEvalId)
                .single();

            if (currentEval?.status === 'submitted' && !isEditingMode) {
                Swal.close();
                const confirm = await Swal.fire({
                    icon: 'warning',
                    title: 'ยืนยันการแก้ไข',
                    text: 'คุณกำลังแก้ไขการประเมินที่ส่งแล้ว ต้องการดำเนินการต่อหรือไม่?',
                    showCancelButton: true,
                    confirmButtonText: 'แก้ไข',
                    cancelButtonText: 'ยกเลิก'
                });
                if (!confirm.isConfirmed) return;
                Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
            }

            const { error: updateError } = await db
                .from('eval_results')
                .update({
                    total_score: total,
                    detailed_scores: rawScores,
                    status: 'submitted',
                    updated_at: new Date().toISOString()
                })
                .eq('id', window._existingEvalId);

            if (updateError) throw updateError;

            Swal.close();
            Swal.fire({
                icon: 'success',
                title: '✅ แก้ไขผลสำเร็จ!',
                html: `
                    <div class="text-left space-y-2">
                        <p><b>องค์ประกอบที่ 1:</b> ${document.getElementById('summary_part1_score').innerText || '0'} / ${document.querySelector('#summary_part1_score') ? '80' : '0'}</p>
                        ${document.querySelector('#summary_part2_score') ? `<p><b>องค์ประกอบที่ 2:</b> ${document.getElementById('summary_part2_score').innerText} / 10</p>` : ''}
                        ${document.querySelector('#summary_part3_score') ? `<p><b>องค์ประกอบที่ 3:</b> ${document.getElementById('summary_part3_score').innerText} / 10</p>` : ''}
                        <hr class="my-2">
                        <p class="text-lg font-bold text-blue-600">รวม: ${total.toFixed(2)} / 100</p>
                        <p class="text-sm text-gray-500">ระดับ: ${document.getElementById('summary_grade').innerText}</p>
                        <p class="text-xs text-amber-500 mt-2">⚠️ การแก้ไขจะบันทึกทับข้อมูลเดิม</p>
                    </div>
                `,
                confirmButtonText: 'กลับหน้าหลัก'
            }).then(() => {
                window._existingEvalId = null;
                isEditingMode = false;
                window.location.reload();
            });
            return;
        }

        const { data: existingEval, error: checkError } = await db
            .from('eval_results')
            .select('id')
            .eq('academic_year', currentTermData.current_academic_year)
            .eq('semester', currentTermData.current_semester)
            .eq('evaluatee_id', evaluateeData.id)
            .eq('evaluator_id', currentUser.id)
            .eq('eval_type', evaluationMode)
            .maybeSingle();

        if (checkError) throw checkError;

        if (existingEval) {
            Swal.close();
            const result = await Swal.fire({
                icon: 'warning',
                title: 'พบการประเมินเดิม',
                html: `
                    <p>คุณได้ทำการประเมินบุคลากรนี้แล้วในภาคเรียนนี้</p>
                    <p class="text-sm text-gray-500 mt-2">ต้องการอัปเดตข้อมูลหรือไม่?</p>
                `,
                showCancelButton: true,
                confirmButtonText: 'อัปเดต',
                cancelButtonText: 'ยกเลิก'
            });

            if (result.isConfirmed) {
                Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                const { error: updateError } = await db
                    .from('eval_results')
                    .update({
                        total_score: total,
                        detailed_scores: rawScores,
                        status: 'submitted',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', existingEval.id);

                if (updateError) throw updateError;

                Swal.close();
                Swal.fire({
                    icon: 'success',
                    title: 'อัปเดตผลสำเร็จ!',
                    html: `คะแนนรวม: <b>${total.toFixed(2)}</b> / 100`,
                    confirmButtonText: 'กลับหน้าหลัก'
                }).then(() => {
                    window.location.reload();
                });
            }
            return;
        }

        const payload = {
            eval_round_id: currentEvalRound?.id || null,
            academic_year: currentTermData.current_academic_year,
            semester: currentTermData.current_semester,
            evaluatee_id: evaluateeData.id,
            evaluator_id: currentUser.id,
            eval_type: evaluationMode,
            total_score: total,
            detailed_scores: rawScores,
            status: 'submitted'
        };

        const { error: insertError } = await db.from('eval_results').insert([payload]);
        if (insertError) throw insertError;

        Swal.close();
        Swal.fire({
            icon: 'success',
            title: 'บันทึกผลสำเร็จ!',
            html: `
                <div class="text-left space-y-2">
                    <p><b>องค์ประกอบที่ 1:</b> ${document.getElementById('summary_part1_score')?.innerText || '0'} / 80</p>
                    ${document.querySelector('#summary_part2_score') ? `<p><b>องค์ประกอบที่ 2:</b> ${document.getElementById('summary_part2_score').innerText} / 10</p>` : ''}
                    ${document.querySelector('#summary_part3_score') ? `<p><b>องค์ประกอบที่ 3:</b> ${document.getElementById('summary_part3_score').innerText} / 10</p>` : ''}
                    <hr class="my-2">
                    <p class="text-lg font-bold text-blue-600">รวม: ${total.toFixed(2)} / 100</p>
                    <p class="text-sm text-gray-500">ระดับ: ${document.getElementById('summary_grade').innerText}</p>
                </div>
            `,
            confirmButtonText: 'กลับหน้าหลัก'
        }).then(() => {
            if (evaluationMode === 'committee') {
                document.getElementById('dashboardView').classList.remove('hidden');
                document.getElementById('wizardView').classList.add('hidden');
                setTimeout(() => {
                    loadTeachersForEvalBySubGroup(window._currentSubGroupId,
                        document.getElementById('sel_department').value,
                        window._currentSelectedItems);
                }, 500);
            } else {
                window.location.reload();
            }
        });
    } catch (err) {
        console.error('Error:', err);
        Swal.close();
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// ฟังก์ชันช่วยเหลือ
// ==========================================
function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ✅ เพิ่มฟังก์ชันนี้ต่อจาก formatDate
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
            // ครูผู้ช่วย: 14 ข้อ (1.1-1.7 + 2.1-2.4 + 3.1-3.3) 
            // คะแนนเต็ม 14x4 = 56
            part1Total += (p1s1Mode * 60) / 56;
        } else {
            // ครู, ชำนาญการ, ชำนาญการพิเศษ: 15 ข้อ (1.1-1.8 + 2.1-2.4 + 3.1-3.3)
            // คะแนนเต็ม 15x4 = 60
            part1Total += (p1s1Mode / 60) * 60;
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
// คำนวณคะแนนสรุปจากทุกชุดย่อย (ใช้ Mode)
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
                // ถ้าไม่มีกรรมการในชุดนี้ประเมิน ให้ข้ามไป
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
                            // แต่ละคนอาจมีหลายข้อ (เช่น p1_s1 มี 8 ข้อ)
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
                // หา Mode ของ Mode ที่ได้จากทุกชุด
                const finalMode = findMode(allModes);
                if (finalMode !== null) {
                    finalModeDetails[key] = finalMode;
                }
            }
        });

        // คำนวณคะแนนรวมสุดท้ายจาก finalModeDetails
        const finalTotal = calculateTotalScoreFromModeDetails(finalModeDetails);

        // 5. สรุปผลลัพธ์
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
            all_evaluator_scores: evalResults.map(r => ({
                evaluator_id: r.evaluator_id,
                total_score: r.total_score,
                detailed_scores: r.detailed_scores
            })),
            status: 'finalized'
        };

    } catch (err) {
        console.error('Error calculating final average (Mode):', err);
        return null;
    }
}

// ==========================================
// บันทึกคะแนนสรุป final (ใช้ Mode)
// ==========================================
async function saveFinalScore(evaluateeId, evalRoundId) {
    Swal.fire({
        title: 'กำลังคำนวณคะแนนสรุป (โหมดคะแนน)...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        // 1. คำนวณคะแนนแบบ Mode
        const finalResult = await calculateFinalAverageScore(evaluateeId, evalRoundId);

        if (!finalResult) {
            Swal.close();
            return Swal.fire('แจ้งเตือน', 'ยังไม่มีข้อมูลการประเมินจากกรรมการ', 'warning');
        }

        // 2. ตรวจสอบว่ามีคะแนนอย่างน้อย 1 ชุด
        if (finalResult.committee_groups === 0) {
            Swal.close();
            return Swal.fire('แจ้งเตือน', 'ไม่พบข้อมูลการประเมินจากกรรมการในชุดใดเลย', 'warning');
        }

        // 3. เตรียมข้อมูลสำหรับบันทึก
        const payload = {
            evaluatee_id: evaluateeId,
            eval_round_id: evalRoundId,
            evaluator_count: finalResult.total_evaluators,
            committee_group_count: finalResult.committee_groups,
            average_score: finalResult.final_score,  // คะแนนสรุปแบบ Mode
            detailed_scores: finalResult.detailed_scores,
            all_committee_scores: finalResult.group_averages.map(g => ({
                group_name: g.group_name,
                mode_score: g.mode_score,
                evaluator_count: g.evaluator_count,
                detailed_scores: g.detailed_scores
            })),
            all_evaluator_scores: finalResult.all_evaluator_scores || [],
            status: 'finalized',
            updated_at: new Date().toISOString()
        };

        // 4. ตรวจสอบว่ามีข้อมูลเดิมหรือไม่
        const { data: existing, error: checkError } = await db
            .from('eval_final_results')
            .select('id')
            .eq('evaluatee_id', evaluateeId)
            .eq('eval_round_id', evalRoundId)
            .maybeSingle();

        if (checkError) throw checkError;

        // 5. บันทึกหรืออัปเดตข้อมูล
        let result;
        if (existing) {
            // อัปเดตข้อมูลเดิม
            const { data, error: updateError } = await db
                .from('eval_final_results')
                .update(payload)
                .eq('id', existing.id)
                .select();

            if (updateError) throw updateError;
            result = data;
        } else {
            // สร้างข้อมูลใหม่
            const { data, error: insertError } = await db
                .from('eval_final_results')
                .insert([payload])
                .select();

            if (insertError) throw insertError;
            result = data;
        }

        Swal.close();

        // 6. แสดงผลลัพธ์ให้ผู้ใช้เห็น
        const levelText = getLevelText(finalResult.final_score);
        
        // สร้างรายละเอียดแต่ละชุด
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

        // แสดงรายละเอียดแต่ละองค์ประกอบ
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
                        <span class="font-bold">${g.average.toFixed(2)}</span>
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

    // โหลดข้อมูลชุดคณะกรรมการ
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
async function loadReviewCommitteeGroups() {
    try {
        if (!currentEvalRound) {
            return Swal.fire('แจ้งเตือน', 'ไม่พบรอบการประเมิน', 'warning');
        }

        const select = document.getElementById('review_committee_group');
        const deptSelect = document.getElementById('review_department');
        
        // รีเซ็ต dropdown
        select.innerHTML = '<option value="">-- เลือกชุด --</option>';
        deptSelect.innerHTML = '<option value="">-- เลือกกลุ่มสาระ --</option>';

        // โหลดชุดคณะกรรมการที่ผู้ใช้เป็นสมาชิก
        const mySubGroups = await getUserCommitteeSubGroups(currentUser.id, currentEvalRound.id);

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

        // เมื่อเลือกชุดคณะกรรมการ
        select.addEventListener('change', function() {
            const selectedOption = this.options[this.selectedIndex];
            if (selectedOption && selectedOption.dataset) {
                const targets = JSON.parse(selectedOption.dataset.targets || '[]');
                const deptSelect = document.getElementById('review_department');
                deptSelect.innerHTML = '<option value="">-- เลือกกลุ่มสาระ --</option>';
                
                const departmentTargets = targets.filter(t => t.target_type === 'department');
                departmentTargets.forEach(t => {
                    deptSelect.innerHTML += `<option value="${t.target_value}">${t.target_value}</option>`;
                });

                // ถ้ามีกลุ่มสาระเดียว ให้เลือกอัตโนมัติ
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
// EXPOSE GLOBAL FUNCTIONS
// ==========================================

window.loadTeachersForEvalBySubGroup = loadTeachersForEvalBySubGroup;
window.startEvaluation = startEvaluation;
window.changeStep = changeStep;
window.submitEvaluation = submitEvaluation;
window.startEditEvaluation = startEditEvaluation;
window.logout = logout;
window.destroyDataTableSafely = destroyDataTableSafely;
window.initializeDataTableSafely = initializeDataTableSafely;
window.calculateLiveTotal = calculateLiveTotal;
window.updateSummary = updateSummary;

window.calculateCommitteeGroupAverage = calculateCommitteeGroupAverage;
window.calculateFinalAverageScore = calculateFinalAverageScore;
window.saveFinalScore = saveFinalScore;
window.displayFinalScoreSummary = displayFinalScoreSummary;
window.generateAllFinalScores = generateAllFinalScores;

window.openEvalDetailModal = openEvalDetailModal;
window.closeEvalDetailModal = closeEvalDetailModal;
window.saveFinalScoreFromModal = saveFinalScoreFromModal;
window.printFinalScore = printFinalScore;
window.exportFinalScores = exportFinalScores;
window.getLevelText = getLevelText;

window.openCommitteeReviewModal = openCommitteeReviewModal;
window.closeCommitteeReviewModal = closeCommitteeReviewModal;
window.loadReviewData = loadReviewData;
window.viewTeacherEvalDetail = viewTeacherEvalDetail;

console.log('✅ All evaluation functions exposed to window');