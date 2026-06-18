/* One-off seed: convert the six hardcoded "Giải thưởng" entries from about.html
 * into published blog posts in the "awards" category (plus their article content).
 *
 * Idempotent: re-running updates the same rows (INSERT ... ON DUPLICATE KEY UPDATE).
 * Run with:  node db/seedAwards.js
 *
 * Field mapping:
 *   author     → the awarding body (shown as the badge on About + byline on the article)
 *   post_date  → Jan 1 of the award year (the year is displayed)
 *   excerpt    → the Vietnamese summary shown on About + blog cards
 *   content    → architects & location preserved in the full article body
 */
require('dotenv').config();
const pool = require('./connection');

const AWARDS = [
    {
        id: 'award-pavilion-top-10-amp-2024',
        title: 'Pavilion Top 10 Awards',
        org: 'Architecture Masterprize (AMP)',
        year: 2024,
        cover: 'https://sunjinvietnam.vn/wp-content/uploads/2024/10/pavilion_amp-scaled.jpg',
        excerpt: 'Công trình được xây dựng làm tác phẩm trưng bày cho giải thưởng Top 10 Awards 2023. Thiết kế bám sát thông điệp "Chạm đến cuộc sống, Kiến trúc là thiên nhiên," với vị trí xây dựng tại Vườn hoa Diên Hồng, gần khu vực văn hóa và lịch sử của thành phố.',
        architects: 'Arch. Nguyen Anh Duong · Tran Nguyen Quang · Dang Trung Hieu · Nguyen Tien Sy · Nguyen Xuan Hieu · Nguyen Duc Nam · Nguyen Viet Luan',
        location: 'Dien Hong Flower Garden, Hoan Kiem District, Hanoi',
    },
    {
        id: 'award-dich-vong-hau-kindergarten-aplus-2024',
        title: 'Dich Vong Hau Kindergarten',
        org: 'A+ Awards for Architects',
        year: 2024,
        cover: 'https://sunjinvietnam.vn/wp-content/uploads/2024/06/z5523924862513_982735619bbef78e550b752285151da5.jpg',
        excerpt: 'Vượt qua hàng trăm dự án từ 80 quốc gia trên thế giới, dự án cải tạo Trường Mầm non Dịch Vọng Hậu (Quận Cầu Giấy, Hà Nội) đã vinh dự nhận giải, là công trình được bình chọn nhiều nhất toàn cầu ở hạng mục Trường Mầm non.',
        architects: 'Arch. Tran Nguyen Quang · Dinh Van Thanh · Nguyen Quang Hai · Dinh Van Truong',
        location: 'Dich Vong, Cau Giay District, Hanoi',
    },
    {
        id: 'award-university-of-commerce-green-good-design-2024',
        title: 'University of Commerce',
        org: 'Green Good Design Award',
        year: 2024,
        cover: 'https://sunjinvietnam.vn/wp-content/uploads/2024/08/dhtm5.jpg',
        excerpt: 'Thiết kế tòa giảng đường trung tâm của Trường Đại học Thương mại vinh dự nằm trong số các công trình đoạt giải ở hạng mục Kiến trúc Xanh của giải thưởng Green GOOD DESIGN Sustainability Awards 2024.',
        architects: 'Arch. Tran Nguyen Quang · Dinh Van Thanh · Trinh Tuan Dung · Nguyen Tien Sy · Nguyen Xuan Hieu · Nguyen Thach Thao',
        location: '79 Ho Tung Mau St., Mai Dich Ward, Cau Giay District, Hanoi',
    },
    {
        id: 'award-grand-tourane-nha-trang-asia-2023',
        title: 'GrandTourane Nha Trang',
        org: 'Asia Architecture Award',
        year: 2023,
        cover: 'https://sunjinvietnam.vn/wp-content/uploads/2024/01/Asian-7-up.jpg',
        excerpt: 'Dự án khách sạn Grand Tourane Nha Trang đã giành giải Kiến trúc Khách sạn Xuất sắc nhất 2023 – Asia Design Awards.',
        architects: 'Arch. Tran Nguyen Quang · Luong Van Thanh · Trinh Trung Hieu · Dinh Van Thanh',
        location: 'Loc Tho Ward, Nha Trang City',
    },
    {
        id: 'award-cau-giay-secondary-school-silver-2021',
        title: 'Cau Giay Secondary School',
        org: 'National Architecture Silver Award',
        year: 2021,
        cover: 'https://sunjinvietnam.vn/wp-content/uploads/2024/01/Giai-Bac-KT-Quoc-Gia.jpg',
        excerpt: 'Dự án Trường THCS Cầu Giấy đã giành Giải Bạc tại Giải thưởng Kiến trúc Quốc gia 2021.',
        architects: 'Arch. Tran Nguyen Quang · Luong Van Thanh · Trinh Trung Hieu',
        location: 'Quan Hoa Ward, Cau Giay District, Hanoi',
    },
    {
        id: 'award-house-ct11-12-13-bronze-2023',
        title: 'House CT11–12–13',
        org: 'National Architecture Bronze Award',
        year: 2023,
        cover: 'https://sunjinvietnam.vn/wp-content/uploads/2023/12/Giai-dong-KT-Quoc-Gia-Ct11-12-13.jpg',
        excerpt: 'Dự án tổ hợp chung cư cao tầng CT11–12–13 đã giành Giải Đồng tại Giải thưởng Kiến trúc Quốc gia 2022–2023.',
        architects: 'Arch. Le Van Hao · Pham Thanh Hung · Nguyen Quang Hai · Dinh Van Thanh',
        location: 'Tu Hiep, Thanh Tri, Hanoi',
    },
];

async function run() {
    for (const a of AWARDS) {
        await pool.query(
            `INSERT INTO blog_posts (id, title, category, author, post_date, read_time, excerpt, cover_image, status, cols)
             VALUES (?,?,?,?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE
               title=VALUES(title), category=VALUES(category), author=VALUES(author),
               post_date=VALUES(post_date), read_time=VALUES(read_time), excerpt=VALUES(excerpt),
               cover_image=VALUES(cover_image), status=VALUES(status)`,
            [a.id, a.title, 'awards', a.org, `${a.year}-01-01`, 3, a.excerpt, a.cover, 'published', 4]
        );

        const body = JSON.stringify([
            a.excerpt,
            `### Kiến trúc sư`,
            a.architects,
            `### Địa điểm`,
            a.location,
        ]);
        await pool.query(
            `INSERT INTO blog_content
               (post_id, \`lead\`, body, pull_quote, pull_quote_cite, figure_image,
                figure_caption, body_after_figure, tags, related_posts)
             VALUES (?,?,?,?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE
               \`lead\`=VALUES(\`lead\`), body=VALUES(body), tags=VALUES(tags)`,
            [a.id, a.excerpt, body, null, null, a.cover, a.title, '[]',
             `Giải thưởng, ${a.org}, ${a.year}`, '[]']
        );
        console.log(`seeded: ${a.id}`);
    }
    await pool.end();
    console.log(`\n✅ Done — ${AWARDS.length} award articles seeded into the "awards" category.`);
}

run().catch(e => { console.error('Seed failed:', e); process.exit(1); });
