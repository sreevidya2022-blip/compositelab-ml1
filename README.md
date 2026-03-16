# CompositeLab — ML Property Predictor

Predicts mechanical properties of CF/BN/Al₂O₃ composite materials using GPR and GBM models, with Groq-powered AI chat.

## Stack
- **Backend**: Flask + scikit-learn + Groq API
- **Frontend**: Vanilla JS + Chart.js
- **Deploy**: Railway

## Local Setup

```bash
# 1. Clone and install
git clone <your-repo>
cd composite-webapp
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt

# 2. Set environment variables
cp .env.example .env
# Edit .env and add your GROQ_API_KEY

# 3. Run
python app.py
# Open http://localhost:5000
```

## Deploy to Railway

```bash
# 1. Push to GitHub
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/composite-webapp.git
git push -u origin main

# 2. Railway
# - Go to railway.app → New Project → Deploy from GitHub repo
# - Select your repo
# - Add environment variable: GROQ_API_KEY = your_key
# - Railway auto-detects Procfile and deploys
```

## Get Groq API Key
1. Go to console.groq.com
2. Sign up (free)
3. Create API key
4. Add to Railway environment variables as GROQ_API_KEY

## Usage
1. Open the app
2. Upload the 3 Excel files (Theory, FEA, Experimental datasets)
3. Click "Train Models" (~20 seconds)
4. Use the sliders to set BN% and AO%
5. Click "Predict Properties"
6. Ask the AI assistant questions about the results

## Model Details
- **GPR**: Trained on 9 experimental points, gives real uncertainty estimates
- **GBM**: Trained on 1000+ points with 90% experimental weighting
- Auto-selects the better model per property based on R²
- Valid input range: BN and AO both between 2.5% and 7.5%
