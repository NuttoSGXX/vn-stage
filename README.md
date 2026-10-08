# Grim VN Stage

รูปตัวละครสไตล์ visual novel ลอยบนจอ (ไม่ผูกกับ scene) ควบคุมจากแผงลอยของ GM สไตล์ดาร์กแฟนตาซีเดียวกับ Grim Almanac สำหรับ Foundry VTT V14

## ติดตั้ง

Install Module → วาง Manifest URL

```
https://github.com/NuttoSGXX/vn-stage/releases/latest/download/module.json
```

## ใช้งาน

- **Scene**: 10 ช่องเรียงแถวเดียว เลือกตัวละครจาก dropdown, ◀ ▶ ย้ายช่อง (ดันเพื่อนบ้าน), วงกลม = เปิด/ปิด (ปิดแล้วมืด 50%), สั่น, วิ่งออกจอ (ช่องจะว่าง), กลับด้านรูป, **Hide all** ซ่อนทุกตัวชั่วคราว
- **Characters**: + เพิ่มรูปและตั้งชื่อ
- **Detail**: Size / Y offset / X offset พิมพ์ตัวเลขได้ ปุ่ม Reset คืนค่าเริ่มต้น (พรีวิวเป็นครึ่งบนของรูปเพื่อประหยัดพื้นที่)
- **Setting**: ขนาดแผง ความสูงภาพ ระยะจากขอบล่าง ความเร็ว ความมืดของตัวที่ปิด จุด marker
- แผงควบคุมเห็นเฉพาะ GM ส่วนรูปบนจอทุกคนเห็น

## Changelog

**0.2.0** — เปลี่ยนชื่อเป็น Grim VN Stage, UI ตามธีม Grim Almanac, แผงเล็กลง (ปรับได้ที่ Setting → Panel size), ปุ่ม สั่น / วิ่งออกจอ / กลับด้าน, พรีวิวครึ่งบน, แก้ Detail เลื่อนกลับต้นเมื่อแก้ค่า

**0.1.2** — Scene แถวเดียว, วงกลมเปิด/ปิด, Hide all, ช่องพิมพ์ตัวเลข, ปุ่ม Reset

**0.1.0** — เวอร์ชันแรก

## License

โค้ด: MIT ฟอนต์ Grenze และ Cinzel: SIL Open Font License 1.1 (ดู `fonts/FONTS.txt`)
