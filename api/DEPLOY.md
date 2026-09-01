# วิธี Deploy ขึ้น Vercel (รันเอง)

ฐานข้อมูล Neon สร้างและตั้งตารางเรียบร้อยแล้ว ไฟล์ `.env.local` ในโฟลเดอร์นี้มี `DATABASE_URL` พร้อมใช้งาน (สำหรับรันทดสอบในเครื่อง — Vercel จะไม่อ่านไฟล์นี้ตอน deploy จริง ต้องตั้งเป็น Environment Variable บน Vercel เองตามขั้นตอนด้านล่าง)

## 1. ติดตั้ง Vercel CLI (ถ้ายังไม่มี)
```bash
npm install -g vercel
```

## 2. ล็อกอิน
```bash
vercel login
```

## 3. ติดตั้ง dependencies
```bash
npm install
```

## 4. ตั้งค่า Environment Variable บน Vercel
```bash
vercel env add DATABASE_URL production
```
เมื่อถามค่า ให้วาง connection string นี้:
```
postgresql://neondb_owner:npg_UgtvuABszm75@ep-plain-recipe-a6c4uw3h-pooler.us-west-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require
```
(ถ้าจะทดสอบบน preview/development ด้วย ให้รันคำสั่งซ้ำโดยเปลี่ยน `production` เป็น `preview` หรือ `development`)

## 5. Deploy
```bash
vercel --prod
```

CLI จะถามตั้งค่าโปรเจกต์ครั้งแรก (link/สร้างโปรเจกต์ใหม่) — ตอบตามค่า default ได้เลย จากนั้นจะได้ลิงก์ URL ของแอปที่ deploy เสร็จ

## หมายเหตุ
- ไฟล์ `vercel.json` ตั้งค่า cron job ไว้แล้ว (`/api/send-reminders` รันทุกวันตี 1) — ใช้งานได้บน Vercel แผน Pro ขึ้นไปเท่านั้น ถ้าใช้แผน Hobby cron จะไม่ทำงานอัตโนมัติ
- อย่า commit ไฟล์ `.env.local` ขึ้น git repository สาธารณะ เพราะมีรหัสผ่านฐานข้อมูลอยู่ในนั้น
