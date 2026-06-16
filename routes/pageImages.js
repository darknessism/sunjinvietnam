const express     = require('express');
const multer      = require('multer');
const pool        = require('../db/connection');
const requireAuth = require('../middleware/auth');
const router      = express.Router();

// ──────────────────────────────────────────────────────────────────────────
// Manageable photo "slots" on the public pages. Each slot maps to one <img>
// on the page (tagged with data-img-slot="<slot>"). The `default` is the
// hardcoded image shipped in the HTML; admins can override it with an upload
// that is stored in MySQL (Railway's filesystem is ephemeral, so disk is not
// durable). The page loads the default, then swaps in any override.
// ──────────────────────────────────────────────────────────────────────────
const SLOTS = [
    { slot: 'careers-hero',        page: 'careers', label: 'Hero — ảnh nền đầu trang',           default: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=2000&q=80' },
    { slot: 'careers-banner',      page: 'careers', label: 'Banner đội ngũ (giữa trang)',        default: 'images/teamwork.jpg' },
    { slot: 'careers-a1',          page: 'careers', label: 'Vì sao chọn · Dự án giàu ảnh hưởng',     default: '/images/sipaphin.jpg' },
    { slot: 'careers-a3',          page: 'careers', label: 'Vì sao chọn · Lộ trình thăng tiến rõ ràng', default: 'https://images.pexels.com/photos/380768/pexels-photo-380768.jpeg?auto=compress&cs=tinysrgb&w=900' },
    { slot: 'careers-a4',          page: 'careers', label: 'Vì sao chọn · Học hỏi không ngừng',     default: 'https://images.pexels.com/photos/3184292/pexels-photo-3184292.jpeg?auto=compress&cs=tinysrgb&w=900' },
    { slot: 'careers-a5',          page: 'careers', label: 'Vì sao chọn · Phúc lợi minh bạch',      default: 'https://images.pexels.com/photos/1216589/pexels-photo-1216589.jpeg?auto=compress&cs=tinysrgb&w=900' },
    { slot: 'careers-a6',          page: 'careers', label: 'Vì sao chọn · Bản sắc Việt Nam',        default: '/images/sanbayphanthiet.jpg' },
    { slot: 'careers-pf-planning', page: 'careers', label: 'Danh mục 01 · Quy hoạch',            default: '/images/quyhoach.jpg' },
    { slot: 'careers-pf-resi',     page: 'careers', label: 'Danh mục 02 · Khu dân cư / Nhà ở',   default: '/images/nhao.jpg' },
    { slot: 'careers-pf-school',   page: 'careers', label: 'Danh mục 03 · Trường học',           default: '/images/truonghoc.jpg' },
    { slot: 'careers-pf-hotel',    page: 'careers', label: 'Danh mục 04 · Khách sạn',            default: '/images/khachsan.jpg' },
    { slot: 'careers-pf-hq',       page: 'careers', label: 'Danh mục 05 · Trụ sở',              default: '/images/truso.jpg' },
    { slot: 'careers-culture-1',   page: 'careers', label: 'Dải văn hóa · Trái (Văn hóa studio)', default: 'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=900&q=80' },
    { slot: 'careers-culture-2',   page: 'careers', label: 'Dải văn hóa · Giữa (Hợp tác)',        default: 'https://images.unsplash.com/photo-1560179707-f14e90ef3623?auto=format&fit=crop&w=900&q=80' },
    { slot: 'careers-culture-3',   page: 'careers', label: 'Dải văn hóa · Phải (Công việc)',      default: 'https://images.unsplash.com/photo-1486325212027-8081e485255e?auto=format&fit=crop&w=900&q=80' },

    // ── HOME (index.html) ──────────────────────────────────────────────────
    { slot: 'home-method-1',  page: 'home', label: 'Phương pháp 01 · Truyền thống', default: 'https://images.unsplash.com/photo-1615406020658-6c4b805f1f30?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80' },
    { slot: 'home-method-2',  page: 'home', label: 'Phương pháp 02 · Đương đại',    default: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80' },
    { slot: 'home-method-3',  page: 'home', label: 'Phương pháp 03 · Sáng tạo',     default: 'https://plus.unsplash.com/premium_photo-1661883964999-c1bcb57a7357?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80' },
    { slot: 'home-proj-1',    page: 'home', label: 'Trình chiếu dự án · Ảnh 1',     default: 'https://sunjin-vietnam.vercel.app/images/sipaphin.jpg?ixlib=rb-4.0.3&auto=format&fit=crop&w=2000&q=80' },
    { slot: 'home-proj-2',    page: 'home', label: 'Trình chiếu dự án · Ảnh 2',     default: 'https://plus.unsplash.com/premium_photo-1697730007755-86770b6cd276?ixlib=rb-4.0.3&auto=format&fit=crop&w=2000&q=80' },
    { slot: 'home-proj-3',    page: 'home', label: 'Trình chiếu dự án · Ảnh 3',     default: 'https://images.unsplash.com/photo-1481026469463-66327c86e544?ixlib=rb-4.0.3&auto=format&fit=crop&w=2000&q=80' },
    { slot: 'home-proj-4',    page: 'home', label: 'Trình chiếu dự án · Ảnh 4',     default: 'https://images.unsplash.com/photo-1554793000-245d3a3c2a51?ixlib=rb-4.0.3&auto=format&fit=crop&w=2000&q=80' },
    { slot: 'home-proj-5',    page: 'home', label: 'Trình chiếu dự án · Ảnh 5',     default: 'https://images.unsplash.com/photo-1506146332389-18140dc7b2fb?ixlib=rb-4.0.3&auto=format&fit=crop&w=2000&q=80' },
    { slot: 'home-work-1',    page: 'home', label: 'Công trình tiêu biểu · Ảnh 1',  default: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?ixlib=rb-4.0.3&auto=format&fit=crop&w=2000&q=80' },
    { slot: 'home-work-2',    page: 'home', label: 'Công trình tiêu biểu · Ảnh 2',  default: 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?ixlib=rb-4.0.3&auto=format&fit=crop&w=2000&q=80' },
    { slot: 'home-work-3',    page: 'home', label: 'Công trình tiêu biểu · Ảnh 3',  default: 'https://images.unsplash.com/photo-1481026469463-66327c86e544?ixlib=rb-4.0.3&auto=format&fit=crop&w=2000&q=80' },
    { slot: 'home-work-4',    page: 'home', label: 'Công trình tiêu biểu · Ảnh 4',  default: 'https://images.unsplash.com/photo-1487958449943-2429e8be8625?ixlib=rb-4.0.3&auto=format&fit=crop&w=2000&q=80' },
    { slot: 'home-work-5',    page: 'home', label: 'Công trình tiêu biểu · Ảnh 5',  default: 'https://images.unsplash.com/photo-1506146332389-18140dc7b2fb?ixlib=rb-4.0.3&auto=format&fit=crop&w=2000&q=80' },
    { slot: 'home-feature-1', page: 'home', label: 'Điểm nhấn · Tropical Climate',  default: 'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?auto=format&fit=crop&w=1600&q=80' },
    { slot: 'home-feature-2', page: 'home', label: 'Điểm nhấn · Design Lab',        default: 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1000&q=80' },
    { slot: 'home-feature-3', page: 'home', label: 'Điểm nhấn · Dezeen Spotlight',  default: 'https://images.unsplash.com/photo-1486325212027-8081e485255e?auto=format&fit=crop&w=800&q=80' },
    { slot: 'home-feature-4', page: 'home', label: 'Điểm nhấn · SUNJIN Academy',    default: 'https://images.unsplash.com/photo-1529400971008-f566de0e6dfc?auto=format&fit=crop&w=800&q=80' },
    { slot: 'home-feature-5', page: 'home', label: 'Điểm nhấn · National Award',    default: 'https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=800&q=80' },
    { slot: 'home-feature-6', page: 'home', label: 'Điểm nhấn · Public Space',      default: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=2400&q=80' },

    // ── ABOUT (about.html) ─────────────────────────────────────────────────
    { slot: 'about-hero',       page: 'about', label: 'Hero — ảnh nền đầu trang',          default: 'https://images.unsplash.com/photo-1487958449943-2429e8be8625?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80' },
    { slot: 'about-collage-1',  page: 'about', label: 'Ảnh ghép giới thiệu · 1',            default: 'https://images.unsplash.com/photo-1558449070-b4ddd1f29f6f?auto=format&fit=crop&w=1400&q=80' },
    { slot: 'about-collage-2',  page: 'about', label: 'Ảnh ghép giới thiệu · 2',            default: 'https://images.unsplash.com/photo-1748050869375-a38a7bd50735?auto=format&fit=crop&w=800&q=80' },
    { slot: 'about-collage-3',  page: 'about', label: 'Ảnh ghép giới thiệu · 3',            default: 'https://images.unsplash.com/photo-1686100511314-7d4a52987f2f?auto=format&fit=crop&w=800&q=80' },
    { slot: 'about-collage-4',  page: 'about', label: 'Ảnh ghép giới thiệu · 4',            default: 'https://images.unsplash.com/photo-1616587656879-8a8a7cce9d6c?auto=format&fit=crop&w=600&q=80' },
    { slot: 'about-collage-5',  page: 'about', label: 'Ảnh ghép giới thiệu · 5',            default: 'https://plus.unsplash.com/premium_photo-1681823251498-d79148213f39?auto=format&fit=crop&w=1400&q=80' },
    { slot: 'about-collage-6',  page: 'about', label: 'Ảnh ghép giới thiệu · 6',            default: 'https://images.unsplash.com/photo-1602008355435-2f4d349ed0cb?auto=format&fit=crop&w=600&q=80' },
    { slot: 'about-collage-7',  page: 'about', label: 'Ảnh ghép giới thiệu · 7',            default: 'https://plus.unsplash.com/premium_photo-1682089188159-a61a71d32fce?auto=format&fit=crop&w=600&q=80' },
    { slot: 'about-collage-8',  page: 'about', label: 'Ảnh ghép giới thiệu · 8',            default: 'https://plus.unsplash.com/premium_photo-1726704143288-b7d3d2a2bc43?auto=format&fit=crop&w=600&q=80' },
    { slot: 'about-collage-9',  page: 'about', label: 'Ảnh ghép giới thiệu · 9',            default: 'https://plus.unsplash.com/premium_photo-1681823237713-ce2b13124240?auto=format&fit=crop&w=1400&q=80' },
    { slot: 'about-cv-1',       page: 'about', label: 'Giá trị (crossfade) · Trải nghiệm',  default: 'https://images.unsplash.com/photo-1545128485-c400e7702796?auto=format&fit=crop&w=1400&q=80' },
    { slot: 'about-cv-2',       page: 'about', label: 'Giá trị (crossfade) · Di sản',       default: 'https://images.unsplash.com/photo-1488972685288-c3fd157d7c7a?auto=format&fit=crop&w=1400&q=80' },
    { slot: 'about-cv-3',       page: 'about', label: 'Giá trị (crossfade) · Kết nối',      default: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1400&q=80' },
    { slot: 'about-cv-4',       page: 'about', label: 'Giá trị (crossfade) · Văn hóa',      default: 'https://images.unsplash.com/photo-1581774859631-87bc25f077f8?auto=format&fit=crop&w=1400&q=80' },
    { slot: 'about-team-1',     page: 'about', label: 'Ban lãnh đạo · Mr. Giang',           default: 'https://sunjinvietnam.vn/wp-content/uploads/2024/01/Mr-Giang-new.jpg?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
    { slot: 'about-team-2',     page: 'about', label: 'Ban lãnh đạo · Mrs. Ngọc',           default: 'https://sunjinvietnam.vn/wp-content/uploads/2024/01/Mrs-Ngoc-up.jpg?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
    { slot: 'about-team-3',     page: 'about', label: 'Ban lãnh đạo · Mr. Quang',           default: 'https://sunjinvietnam.vn/wp-content/uploads/2024/01/Mr-Quang-UP-NEW.jpg?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
    { slot: 'about-team-4',     page: 'about', label: 'Ban lãnh đạo · Mr. Công',            default: 'https://sunjinvietnam.vn/wp-content/uploads/2024/01/Mr-Cong-325x401-up.jpg?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
    { slot: 'about-team-5',     page: 'about', label: 'Ban lãnh đạo · Mr. Sỹ',              default: 'https://sunjinvietnam.vn/wp-content/uploads/2024/02/E-Sy-KT2-up.jpg?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
    { slot: 'about-team-6',     page: 'about', label: 'Ban lãnh đạo · Mr. Hùng',            default: 'https://sunjinvietnam.vn/wp-content/uploads/2024/01/Mr-Hung-UP.jpg?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80' },
    { slot: 'about-fp-1',       page: 'about', label: 'Nguyên tắc nền tảng · Ảnh nền 1',    default: 'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=2000&q=80' },
    { slot: 'about-fp-2',       page: 'about', label: 'Nguyên tắc nền tảng · Ảnh nền 2',    default: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=2000&q=80' },
    { slot: 'about-fp-3',       page: 'about', label: 'Nguyên tắc nền tảng · Ảnh nền 3',    default: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=2000&q=80' },
    { slot: 'about-award-1',    page: 'about', label: 'Thành tựu / Giải thưởng · Ảnh 1',    default: 'https://sunjinvietnam.vn/wp-content/uploads/2024/10/pavilion_amp-scaled.jpg' },
    { slot: 'about-award-2',    page: 'about', label: 'Thành tựu / Giải thưởng · Ảnh 2',    default: 'https://sunjinvietnam.vn/wp-content/uploads/2024/06/z5523924862513_982735619bbef78e550b752285151da5.jpg' },
    { slot: 'about-award-3',    page: 'about', label: 'Thành tựu / Giải thưởng · Ảnh 3',    default: 'https://sunjinvietnam.vn/wp-content/uploads/2024/08/dhtm5.jpg' },
    { slot: 'about-award-4',    page: 'about', label: 'Thành tựu / Giải thưởng · Ảnh 4',    default: 'https://sunjinvietnam.vn/wp-content/uploads/2024/01/Asian-7-up.jpg' },
    { slot: 'about-award-5',    page: 'about', label: 'Thành tựu / Giải thưởng · Ảnh 5',    default: 'https://sunjinvietnam.vn/wp-content/uploads/2024/01/Giai-Bac-KT-Quoc-Gia.jpg' },
    { slot: 'about-award-6',    page: 'about', label: 'Thành tựu / Giải thưởng · Ảnh 6',    default: 'https://sunjinvietnam.vn/wp-content/uploads/2023/12/Giai-dong-KT-Quoc-Gia-Ct11-12-13.jpg' },
    { slot: 'about-grid-1',     page: 'about', label: 'Lưới hình ảnh · Ảnh 1',              default: 'https://images.pexels.com/photos/256490/pexels-photo-256490.jpeg?auto=compress&cs=tinysrgb&w=1400' },
    { slot: 'about-grid-2',     page: 'about', label: 'Lưới hình ảnh · Ảnh 2',              default: 'https://images.pexels.com/photos/323780/pexels-photo-323780.jpeg?auto=compress&cs=tinysrgb&w=1400' },
    { slot: 'about-grid-3',     page: 'about', label: 'Lưới hình ảnh · Ảnh 3',              default: 'https://images.pexels.com/photos/2190283/pexels-photo-2190283.jpeg?auto=compress&cs=tinysrgb&w=1400' },
    { slot: 'about-grid-4',     page: 'about', label: 'Lưới hình ảnh · Ảnh 4',              default: 'https://images.pexels.com/photos/1216589/pexels-photo-1216589.jpeg?auto=compress&cs=tinysrgb&w=1400' },
    { slot: 'about-cta',        page: 'about', label: 'Kêu gọi cuối trang — ảnh nền',       default: 'https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80' },
];
const SLOT_MAP = new Map(SLOTS.map(s => [s.slot, s]));

// Ensure the storage table exists (runs once at startup).
async function initPageImages() {
    await pool.query(`CREATE TABLE IF NOT EXISTS page_images (
        slot       VARCHAR(64)  NOT NULL PRIMARY KEY,
        page       VARCHAR(32)  NOT NULL,
        mime       VARCHAR(80)  NOT NULL,
        data       LONGBLOB     NOT NULL,
        updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);
}

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const upload = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: 8 * 1024 * 1024 }, // 8 MB
    fileFilter: (req, file, cb) => {
        if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
        cb(new Error('Unsupported file type. Use JPG, PNG, WEBP, GIF or AVIF.'));
    },
});

const ver = d => (d ? new Date(d).getTime() : 0);

// ── Public: version map of overridden slots, so the page knows what to swap ──
// e.g. { "careers-hero": 1718500000000, ... }
router.get('/overrides', async (req, res, next) => {
    try {
        const page = req.query.page;
        const [rows] = page
            ? await pool.query('SELECT slot, updated_at FROM page_images WHERE page = ?', [page])
            : await pool.query('SELECT slot, updated_at FROM page_images');
        const out = {};
        for (const r of rows) if (SLOT_MAP.has(r.slot)) out[r.slot] = ver(r.updated_at);
        res.set('Cache-Control', 'no-cache');
        res.json(out);
    } catch (e) { next(e); }
});

// ── Public: serve the overriding image binary for a slot ─────────────────────
router.get('/raw/:slot', async (req, res, next) => {
    try {
        if (!SLOT_MAP.has(req.params.slot)) return res.status(404).end();
        const [[row]] = await pool.query('SELECT mime, data FROM page_images WHERE slot = ?', [req.params.slot]);
        if (!row) return res.status(404).end();
        res.set('Content-Type', row.mime);
        // Safe to cache hard: the page requests this URL with a ?v=<updated_at>
        // cache-buster, so a new upload yields a new URL.
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
        res.send(row.data);
    } catch (e) { next(e); }
});

// ── Admin: full list with current state for the management UI ────────────────
router.get('/admin/list', requireAuth, async (req, res, next) => {
    try {
        const [rows] = await pool.query('SELECT slot, mime, updated_at FROM page_images');
        const overrides = new Map(rows.map(r => [r.slot, r]));
        const page = req.query.page;
        const list = SLOTS
            .filter(s => !page || s.page === page)
            .map(s => {
                const o = overrides.get(s.slot);
                return {
                    slot:        s.slot,
                    page:        s.page,
                    label:       s.label,
                    default:     s.default,
                    hasOverride: !!o,
                    version:     o ? ver(o.updated_at) : 0,
                };
            });
        res.json(list);
    } catch (e) { next(e); }
});

// ── Admin: upload / replace the image for a slot ─────────────────────────────
router.post('/admin/:slot', requireAuth, upload.single('image'), async (req, res, next) => {
    try {
        const slot = SLOT_MAP.get(req.params.slot);
        if (!slot) return res.status(404).json({ error: 'Unknown image slot.' });
        if (!req.file) return res.status(400).json({ error: 'No image file received.' });
        await pool.query(
            `INSERT INTO page_images (slot, page, mime, data) VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE mime = VALUES(mime), data = VALUES(data)`,
            [slot.slot, slot.page, req.file.mimetype, req.file.buffer]
        );
        const [[row]] = await pool.query('SELECT updated_at FROM page_images WHERE slot = ?', [slot.slot]);
        res.json({ ok: true, slot: slot.slot, version: ver(row.updated_at) });
    } catch (e) { next(e); }
});

// ── Admin: remove the override, reverting to the default image ───────────────
router.delete('/admin/:slot', requireAuth, async (req, res, next) => {
    try {
        if (!SLOT_MAP.has(req.params.slot)) return res.status(404).json({ error: 'Unknown image slot.' });
        await pool.query('DELETE FROM page_images WHERE slot = ?', [req.params.slot]);
        res.json({ ok: true });
    } catch (e) { next(e); }
});

module.exports = router;
module.exports.initPageImages = initPageImages;
module.exports.SLOTS = SLOTS;
