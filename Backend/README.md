Backend setup — MongoDB connection

1. Copy `.env.example` to `.env` in the `Backend` folder and set `MONGO_URI`.

- For a local MongoDB server (default):
  MONGO_URI=mongodb://127.0.0.1:27017/hqs_db

- For MongoDB Atlas (replace placeholders):
  MONGO_URI="mongodb+srv://<user>:<password>@cluster0.mongodb.net/hqs_db?retryWrites=true&w=majority"

2. Install dependencies and start the server:

```powershell
cd Backend
npm install
npm run dev
```

3. The server reads `MONGO_URI` from environment. If not set it falls back to the local URI shown above.

If you want, I can create a local sample `.env` (not committed) or run `npm install` now.

Redis (optional)

If you don't want Redis, leave `REDIS_URL` unset — the server will use MongoDB counters instead.

To run a local Redis quickly:

Docker (recommended if available):

```powershell
docker run --name hqs-redis -p 6379:6379 -d redis:7
```

WSL / Linux:

```bash
sudo apt update
sudo apt install redis-server
sudo service redis-server start
```

Windows (no Docker): consider using Memurai or Redis via WSL.
