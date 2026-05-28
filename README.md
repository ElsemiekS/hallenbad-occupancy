# Hallenbad City — Occupancy Tracker

Live dashboard for visitor counts at Hallenbad City, Zürich.  
Data is scraped every 5 minutes and stored in Supabase.

```
GitHub Actions (cron) → Supabase (PostgreSQL) ← React frontend → Vercel
```

---

## Free deployment stack

| Layer    | Service              | Free tier                        |
|----------|----------------------|----------------------------------|
| Database | Supabase             | 500 MB, unlimited API calls      |
| Scraper  | GitHub Actions cron  | Unlimited on public repos        |
| Frontend | Vercel               | Unlimited for personal projects  |

---

## Setup (one-time)

### 1 · Database — Supabase

1. Create a free account at [supabase.com](https://supabase.com)
2. Create a new project
3. Open the **SQL Editor** and run `supabase/schema.sql`
4. Note down from **Project Settings → API**:
   - `Project URL` → `SUPABASE_URL`
   - `anon public` key → `VITE_SUPABASE_ANON_KEY` (for the frontend)
   - `service_role` key → `SUPABASE_SERVICE_KEY` (for the scraper — keep secret)

### 2 · Import existing data

```bash
pip install supabase
SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_SERVICE_KEY=eyJ... \
python scripts/import_csv.py
```

### 3 · Scraper — GitHub Actions

1. Push this repo to GitHub (make it **public** for unlimited free minutes)
2. Go to **Settings → Secrets and variables → Actions** and add:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
3. The workflow (`.github/workflows/scrape.yml`) runs automatically every 5 minutes

> **Private repo?** GitHub's free plan gives 2000 min/month; at ~30 s/run × 288 runs/day  
> that's ~4320 min/month — over the limit. Use a public repo, or switch to  
> [Railway](https://railway.app) ($5 free credit/month) for a persistent process.

### 4 · Frontend — Vercel

1. Go to [vercel.com](https://vercel.com), import your GitHub repo
2. Set the **Root Directory** to `frontend`
3. Add environment variables:
   - `VITE_SUPABASE_URL` = your Supabase URL
   - `VITE_SUPABASE_ANON_KEY` = your anon key
4. Deploy — Vercel rebuilds automatically on every push

---

## Local development

```bash
cd frontend
npm install
# Create frontend/.env.local with:
# VITE_SUPABASE_URL=https://xxx.supabase.co
# VITE_SUPABASE_ANON_KEY=eyJ...
npm run dev
```

---

## Project layout

```
.github/workflows/scrape.yml   GitHub Actions cron job
scraper/
  scraper.py                   Selenium scraper (class-based)
  requirements.txt
frontend/
  src/
    App.jsx                    Main dashboard
    components/
      OccupancyChart.jsx       Time-series line chart
      HourlyAverages.jsx       Average by hour-of-day bar chart
supabase/
  schema.sql                   Table + RLS setup
scripts/
  import_csv.py                One-time CSV → Supabase migration
```
