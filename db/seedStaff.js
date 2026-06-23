// One-time seed: load the current About-page leadership into the Staff module so
// the page renders from the DB and the content is editable in the admin. Safe to
// re-run — it only inserts the board group if it's empty.
require('dotenv').config();
require('dns').setDefaultResultOrder('ipv4first');
const crypto = require('crypto');
const pool   = require('./connection');

const IMG = 'https://sunjinvietnam.vn/wp-content/uploads/';
const BOARD = [
    { name: 'MR. TRINH THANH GIAN',  nameEn: 'MR. TRINH THANH GIAN',
      position: 'Chủ tịch\nHội đồng Thành viên',
      positionEn: 'Chairman\nof the Board of Members',
      photo: IMG + '2024/01/Mr-Giang-new.jpg?auto=format&fit=crop&w=800&q=80' },
    { name: 'MS. SU BUI BAO NGOC',   nameEn: 'MS. SU BUI BAO NGOC',
      position: 'Phó Chủ tịch\nHội đồng Thành viên',
      positionEn: 'Vice Chairwoman\nof the Board of Members',
      photo: IMG + '2024/01/Mrs-Ngoc-up.jpg?auto=format&fit=crop&w=800&q=80' },
    { name: 'MR. TRAN NGUYEN QUANG', nameEn: 'MR. TRAN NGUYEN QUANG',
      position: 'Tổng Giám đốc\nKiến trúc sư, Chủ trì Thiết kế hạng cao nhất',
      positionEn: 'General Director\nArchitect, Top-tier Lead Designer',
      photo: IMG + '2024/01/Mr-Quang-UP-NEW.jpg?auto=format&fit=crop&w=800&q=80' },
    { name: 'MR. NGUYEN QUOC CONG',  nameEn: 'MR. NGUYEN QUOC CONG',
      position: 'Phó Tổng Giám đốc\nKỹ sư, Chủ trì Thiết kế hạng 1',
      positionEn: 'Deputy General Director\nEngineer, Grade 1 Lead Designer',
      photo: IMG + '2024/01/Mr-Cong-325x401-up.jpg?auto=format&fit=crop&w=800&q=80' },
    { name: 'MR. NGUYEN TIEN SY',    nameEn: 'MR. NGUYEN TIEN SY',
      position: 'Phó Tổng Giám đốc\nKiến trúc sư, Chủ trì Thiết kế hạng cao nhất',
      positionEn: 'Deputy General Director\nArchitect, Top-tier Lead Designer',
      photo: IMG + '2024/02/E-Sy-KT2-up.jpg?auto=format&fit=crop&w=800&q=80' },
    { name: 'MR. PHAM THANH HUNG',   nameEn: 'MR. PHAM THANH HUNG',
      position: 'Phó Tổng Giám đốc\nKiến trúc sư, Chủ trì Thiết kế hạng cao nhất',
      positionEn: 'Deputy General Director\nArchitect, Top-tier Lead Designer',
      photo: IMG + '2024/01/Mr-Hung-UP.jpg?auto=format&fit=crop&w=800&q=80' },
    { name: 'MR. NEW MEMBER',        nameEn: 'New Member',
      position: 'Chức danh\nPhòng ban',
      positionEn: 'Position\nDepartment',
      photo: '' },
];

(async () => {
    try {
        const [[{ c }]] = await pool.query("SELECT COUNT(*) AS c FROM staff WHERE grp = 'board'");
        if (c > 0) { console.log(`Board already has ${c} people — skipping seed.`); process.exit(0); }
        let i = 0;
        for (const p of BOARD) {
            await pool.query(
                `INSERT INTO staff (id, grp, name, name_en, position, position_en, photo, sort_order, status)
                 VALUES (?, 'board', ?, ?, ?, ?, ?, ?, 'published')`,
                ['staff-' + crypto.randomBytes(8).toString('hex'), p.name, p.nameEn, p.position, p.positionEn, p.photo, i++]
            );
        }
        console.log(`✅ Seeded ${BOARD.length} leadership people into the Staff module.`);
        process.exit(0);
    } catch (e) {
        console.error('Seed failed:', e.message);
        process.exit(1);
    }
})();
