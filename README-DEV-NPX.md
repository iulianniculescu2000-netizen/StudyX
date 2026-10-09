# 🚀 StudyX Development cu NPX

## 📋 Setup Rapid

```bash
# Instalează dependențe (o singură dată)
node scripts/dev-commands.js install-deps

# Sau clasic
npm install
```

## 🎯 Comenzi Principale (cu NPX)

### 🔥 Development
```bash
# Start development server
node scripts/dev-commands.js dev

# Build pentru producție
node scripts/dev-commands.js build

# Preview build
node scripts/dev-commands.js preview
```

### 🧪 Testing
```bash
# Run tests cu UI
node scripts/dev-commands.js test:ui

# Run tests o singură dată
node scripts/dev-commands.js test:run

# Smoke tests
node scripts/dev-commands.js test:smoke

# E2E tests
node scripts/dev-commands.js test:e2e
```

### 📊 Analiză & Optimizare
```bash
# Analiză bundle
node scripts/dev-commands.js analyze

# Build + analiză
node scripts/dev-commands.js analyze:build

# Report bundle
node scripts/dev-commands.js bundle-report

# Optimizare imagini
node scripts/dev-commands.js optimize-images
```

### 🤖 AI Features
```bash
# Test AI integrations
node scripts/dev-commands.js ai:test

# Analiză usage AI
node scripts/dev-commands.js ai:analyze
```

### ⚡ Performance
```bash
# Lighthouse audit
node scripts/dev-commands.js lighthouse

# Performance tests
node scripts/dev-commands.js performance:test
```

## 🎨 Comenzi Rapide (package.json)

```bash
# Development cu NPX
npm run dev:npx

# Build cu NPX
npm run build:npx

# Test cu NPX
npm run test:npx

# Analiză cu NPX
npm run analyze:npx

# Electron cu NPX
npm run electron:dev:npx
```

## 🛠️ Utilities

```bash
# Curățăre build artifacts
node scripts/dev-commands.js clean

# Curățăre completă
node scripts/dev-commands.js clean:all

# Verifică dependențe
node scripts/dev-commands.js deps:check

# Update dependențe
node scripts/dev-commands.js deps:update
```

## 🔒 Security

```bash
# Audit security
node scripts/dev-commands.js security:audit

# Fix issues
node scripts/dev-commands.js security:fix

# Check vulnerabilități
node scripts/dev-commands.js security:check
```

## 📚 Help

```bash
# Arată toate comenzile
node scripts/dev-commands.js help

# Help scurt
node scripts/dev-commands.js --help

# Exemplu comandă
node scripts/dev-commands.js dev
```

## 🎯 Workflow Recomandat

1. **Setup Inițial**
   ```bash
   node scripts/dev-commands.js install-deps
   ```

2. **Development**
   ```bash
   node scripts/dev-commands.js dev
   ```

3. **Testing**
   ```bash
   node scripts/dev-commands.js test:ui
   ```

4. **Build & Analiză**
   ```bash
   node scripts/dev-commands.js analyze:build
   ```

5. **Performance Check**
   ```bash
   node scripts/dev-commands.js lighthouse
   ```

## 💡 Avantaje NPX vs NPM

### ✅ NPX Benefits
- **Fără dependențe globale** - Rulează direct din node_modules
- **Versionare consistentă** - Folosește versiunea din project
- **Cache inteligent** - NPX optimizează execuția
- **Cross-platform** - Funcționează identic pe Windows/Mac/Linux
- **Mai rapid** - Execuție directă fără overhead npm

### 🔄 NPX vs NPM
```bash
# NPM (vechi)
npm run dev
npm run build
npm run test

# NPX (nou)
node scripts/dev-commands.js dev
node scripts/dev-commands.js build
node scripts/dev-commands.js test
```

## 🚀 Quick Start

```bash
# Clone și setup
git clone <repo>
cd StudyX
node scripts/dev-commands.js install-deps

# Start development
node scripts/dev-commands.js dev

# Open browser
# http://localhost:5173
```

## 🔧 Configurare NPX

Toate comenzile NPX sunt configurate în `scripts/dev-commands.js`:
- **Comenzi standardizate** - Consistent syntax
- **Error handling** - Mesaje clare de eroare
- **Cross-platform** - Funcționează peste tot
- **Logging îmbunătățit** - Output clar și colorat
- **Help integrat** - Documentație inclusă

## 📝 Notițe

- NPX folosește `npx` intern pentru toate comenzile
- Comenzile sunt echivalente cu cele din `package.json`
- Poți folosi în continuare `npm run` dacă preferi
- NPX este recomandat pentru development modern

---

**🎯 StudyX Development - Powered by NPX pentru performanță maximă!**
