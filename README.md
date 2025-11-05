🚀 Complete Railway Deployment Instructions
Prerequisites

Railway account (sign up at railway.app)
GitHub repository with your code
Supabase project with your database


Step 1: Prepare Your Local Repository
1.1 Update All Required Files
Make sure these files are in your project root:
requirements.txt:
txtflask==2.3.3
flask-socketio==5.3.6
python-socketio==5.9.0
gevent==23.9.1
gevent-websocket==0.10.1
werkzeug==2.3.7
opencv-python-headless==4.8.1.78
mediapipe==0.10.7
numpy==1.24.3
pillow==10.0.1
scikit-learn==1.5.2
supabase==2.16.0
httpx==0.27.0
python-dotenv==1.0.0
gunicorn==21.2.0
dnspython==2.6.1
python-dateutil==2.8.2
Procfile:
bashweb: gunicorn --worker-class gevent -w 1 --timeout 120 --bind 0.0.0.0:$PORT app:app
1.2 Update Your Code Files
Update these files with the fixed versions:

✅ app.py - Use gevent async mode
✅ user_profile.py - Keep created_at_raw for timeline sorting
✅ static/js/profile.js - Sort by created_at_raw

1.3 Commit and Push to GitHub
bashgit add .
git commit -m "Fix: Switch to gevent and fix timeline sorting"
git push origin main
```

---

## Step 2: Create Railway Project

1. Go to https://railway.app
2. Click **"Start a New Project"**
3. Select **"Deploy from GitHub repo"**
4. Authorize Railway to access your GitHub
5. Select your repository from the list
6. Railway will automatically detect it's a Python app

---

## Step 3: Configure Environment Variables

1. In your Railway project, click on your service
2. Go to **"Variables"** tab
3. Click **"+ New Variable"** and add these:

| Variable Name | Value | Where to Get It |
|--------------|-------|-----------------|
| `SUPABASE_URL` | `https://xxx.supabase.co` | Supabase Dashboard → Settings → API → Project URL |
| `SUPABASE_KEY` | `eyJxxx...` | Supabase Dashboard → Settings → API → anon/public key |
| `SECRET_KEY` | (your secret key) | Keep your existing one or generate new: `python -c "import secrets; print(secrets.token_hex(32))"` |
| `PORT` | `5000` | Usually auto-set by Railway |

4. Click **"Add"** for each variable

---

## Step 4: Deploy

### Railway will automatically:
1. ✅ Detect Python app
2. ✅ Install dependencies from `requirements.txt`
3. ✅ Run the `Procfile` command
4. ✅ Assign a public URL

### Monitor Deployment:

1. Go to **"Deployments"** tab
2. Click on the latest deployment
3. Click **"View Logs"**

### Expected Success Logs:
```
[INFO] Starting gunicorn 21.2.0
[INFO] Using worker: gevent
📦 Creating Supabase client...
✅ Supabase client created successfully
🧪 Testing Supabase connection...
✅ Supabase connection test PASSED!
✅ FSL predictor attached successfully
✅ App ready to accept connections

Step 5: Get Your Public URL

In Railway dashboard, go to "Settings" tab
Scroll to "Networking"
Click "Generate Domain"
Your app will be available at: https://your-app-name.up.railway.app


Step 6: Test Your Deployment
6.1 Test Health Endpoint
Visit: https://your-app-name.up.railway.app/health
Expected response:
json{
  "status": "healthy",
  "supabase": "connected",
  "query_time_ms": 150.23
}
6.2 Test Login

Go to: https://your-app-name.up.railway.app/login
Try logging in with a test account
Check if it redirects to home page successfully

6.3 Test Profile Timeline

Log in and go to your profile
Click "View Score Overtime"
Verify the chart shows games in chronological order (oldest → newest)


Step 7: Update Frontend URLs (If Needed)
In your JavaScript files, make sure fetch URLs use relative paths:
javascript// ✅ CORRECT - Works in both dev and production
fetch('/login', { ... })
fetch('/register', { ... })
fetch(`/profile/${username}`)

// ❌ WRONG - Hardcoded domain
fetch('http://localhost:5000/login', { ... })

Step 8: Enable Automatic Deployments

In Railway project → "Settings"
Under "Source", ensure "Auto Deploy" is enabled
Now every git push will automatically redeploy


Troubleshooting
If deployment fails:
Check Logs:

Railway Dashboard → Deployments → Latest → View Logs

Common Issues:
ErrorSolutionWorker timeoutAlready fixed with --timeout 120 in ProcfileLookup timed outAlready fixed by switching to geventModule not foundCheck requirements.txt has all dependenciesPort already in useRailway handles this automatically
If Supabase won't connect:

Verify environment variables are set correctly
Check Supabase project is active (not paused)
Confirm using anon/public key, not service_role key
Test health endpoint: /health

If timeline is still wrong:

Check user_profile.py includes created_at_raw
Verify profile.js sorts by created_at_raw
Check browser console for JavaScript errors


Step 9: Custom Domain (Optional)

Buy a domain (e.g., from Namecheap, Google Domains)
In Railway → Settings → Networking → Custom Domain
Add your domain
Update your domain's DNS records as instructed by Railway


Quick Command Reference
bash# Local testing
pip install -r requirements.txt
python app.py

# Deploy to Railway (automatic on push)
git add .
git commit -m "Your message"
git push origin main

# View Railway logs (in dashboard or CLI)
railway logs

# Check Python version
python --version  # Railway uses Python 3.10+

Success Checklist

 requirements.txt has gevent==23.9.1
 Procfile uses --worker-class gevent
 app.py uses async_mode='gevent'
 Environment variables set in Railway
 Code pushed to GitHub
 Railway deployment successful (green checkmark)
 /health endpoint returns "healthy"
 Login works
 Profile timeline shows correct order
 All game features work (rooms, detection, etc.)


Your Deployed URLs

Main App: https://your-app-name.up.railway.app
Health Check: https://your-app-name.up.railway.app/health
Login: https://your-app-name.up.railway.app/login

🎉 Deployment Complete! Your sign language app is now live on Railway with:

✅ Gevent for reliable connections
✅ Supabase integration working
✅ Proper timeline sorting
✅ All features functional
RetryClaude does not have the ability to run the code it generates yet.