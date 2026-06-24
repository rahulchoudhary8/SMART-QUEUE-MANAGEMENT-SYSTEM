# SMART QUEUE MANAGEMENT SYSTEM

A full-stack hospital queue management solution with patient token generation, staff workflows, admin controls, and a real-time display board.

## Project structure

- Backend: Express + MongoDB + Socket.IO + JWT auth
- Frontend: React + Vite + Tailwind CSS

## Quick start

### Backend

```bash
cd Backend
npm install
npm run seed
npm start
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Demo credentials

- Admin: admin / admin123
- Reception: reception1 / password123
- Doctor: doctor1 / doctor123

## Notes

- The backend uses MongoDB. Make sure MongoDB is running locally or provide a MongoDB URI in the environment.
- Twilio SMS notifications are optional and only activate when the relevant environment variables are configured.
