const { chromium } = require('c:/Users/Iulia/Desktop/TOT/StudyX/node_modules/playwright');
const path = require('path');
const fs = require('fs');

async function recordShowcaseVideo() {
  const outputDir = path.resolve('c:/Users/Iulia/Desktop/TOT/StudyX/dev-artifacts/showcase-videos');
  const artifactDir = path.resolve('C:/Users/Iulia/.gemini/antigravity/brain/84d84bb5-2807-4603-9519-8dec3754e752');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    headless: true
  });

  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 }
  });

  const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; background: #090d16; overflow: hidden; }
    canvas { display: block; width: 1280px; height: 720px; }
  </style>
</head>
<body>
  <canvas id="c" width="1280" height="720"></canvas>
  <script>
    const canvas = document.getElementById('c');
    const ctx = canvas.getContext('2d');

    // Trail particles
    const particles = [];

    // Animation state
    let frame = 0;
    const totalFrames = 60 * 12; // 12 seconds at 60fps

    // Cursor simulated path
    let curX = 640, curY = 360;
    let ringX = curX, ringY = curY;
    let curState = 'default'; // 'default', 'hover', 'text', 'click', 'loading', 'thinking'
    let clickRipple = 0;

    function getCursorTarget(t) {
      // 0 - 3s: Explore Cursor Section
      if (t < 3) {
        const p = t / 3;
        if (p < 0.3) {
          // Move towards magnetic button
          return { x: 260 + p * 200, y: 220 + Math.sin(p * 10) * 30, state: 'default' };
        } else if (p < 0.6) {
          // Hover over button
          return { x: 340, y: 240, state: 'hover' };
        } else if (p < 0.8) {
          // Click button
          return { x: 340, y: 240, state: 'click' };
        } else {
          // Move to text zone
          return { x: 480, y: 240, state: 'text' };
        }
      }
      // 3 - 7s: Explore Loading Process Section
      else if (t < 7) {
        const p = (t - 3) / 4;
        return {
          x: 280 + Math.sin(p * Math.PI * 2) * 80,
          y: 500 + Math.cos(p * Math.PI * 2) * 30,
          state: 'loading'
        };
      }
      // 7 - 11s: Explore AI Thinking Section
      else if (t < 11) {
        const p = (t - 7) / 4;
        return {
          x: 950 + Math.sin(p * Math.PI * 2) * 60,
          y: 450 + Math.cos(p * Math.PI * 2) * 40,
          state: 'thinking'
        };
      }
      // 11 - 12s: Return to Center
      else {
        return { x: 640, y: 360, state: 'hover' };
      }
    }

    function drawScene(timeSec) {
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, 1280, 720);

      // Ambient background gradients
      const bgGrad1 = ctx.createRadialGradient(200, 100, 10, 200, 100, 400);
      bgGrad1.addColorStop(0, 'rgba(99, 102, 241, 0.15)');
      bgGrad1.addColorStop(1, 'rgba(99, 102, 241, 0)');
      ctx.fillStyle = bgGrad1;
      ctx.fillRect(0, 0, 1280, 720);

      const bgGrad2 = ctx.createRadialGradient(1000, 500, 10, 1000, 500, 450);
      bgGrad2.addColorStop(0, 'rgba(236, 72, 153, 0.12)');
      bgGrad2.addColorStop(1, 'rgba(236, 72, 153, 0)');
      ctx.fillStyle = bgGrad2;
      ctx.fillRect(0, 0, 1280, 720);

      // Top Header
      ctx.save();
      // Badge
      ctx.fillStyle = 'rgba(99, 102, 241, 0.15)';
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(50, 35, 230, 26, 13);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#818cf8';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('STUDYX NEXT-GEN UI PREVIEW', 68, 52);

      // Title
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText('Sistem Vizual Interactiv: Cursor, Încărcare & Gândire AI', 50, 92);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '13px sans-serif';
      ctx.fillText('Demonstrație fluiditate 60 FPS • Identitate vizuală dedicată StudyX', 50, 114);
      ctx.restore();

      // Divider line
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(50, 135);
      ctx.lineTo(1230, 135);
      ctx.stroke();

      // SECTION 1 CARD: CURSOR IDENTITY
      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
      ctx.strokeStyle = (curState === 'hover' || curState === 'click' || curState === 'text') ? 'rgba(99, 102, 241, 0.5)' : 'rgba(30, 41, 59, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(50, 155, 560, 180, 16);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#6366f1';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('01. CURSOR CU IDENTITATE PROPRIE', 75, 185);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText('Fluid Spring Engine & Morphing Contextual', 75, 208);

      // Simulated button in card
      const btnHovered = (curState === 'hover' || curState === 'click');
      ctx.fillStyle = btnHovered ? '#4f46e5' : '#312e81';
      ctx.strokeStyle = btnHovered ? '#818cf8' : '#4338ca';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(75, 225, 170, 42, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(curState === 'click' ? '✓ Click Înregistrat' : 'Magnetic Target', 105, 251);

      // Simulated text scanner area
      const textHovered = (curState === 'text');
      ctx.fillStyle = textHovered ? 'rgba(168, 85, 247, 0.15)' : 'rgba(15, 23, 42, 0.9)';
      ctx.strokeStyle = textHovered ? '#c084fc' : '#334155';
      ctx.beginPath();
      ctx.roundRect(265, 225, 320, 42, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = textHovered ? '#e9d5ff' : '#94a3b8';
      ctx.font = '12px sans-serif';
      ctx.fillText('Text Medical: Diagnostic & Grile Rezidențiat...', 280, 251);
      ctx.restore();

      // SECTION 2 CARD: PROCESS LOADING ANIMATION
      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
      ctx.strokeStyle = (curState === 'loading') ? 'rgba(6, 182, 212, 0.6)' : 'rgba(30, 41, 59, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(50, 355, 560, 330, 16);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#06b6d4';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('02. ANIMAȚIE DE ÎNCĂRCARE PROCES (LOADING)', 75, 385);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText('Concept: Bio-Orbit Dual & Cardiogram Pulse', 75, 408);

      // Loading Box
      const loadCenter = { x: 330, y: 510 };
      // Ambient glow
      const loadGlow = ctx.createRadialGradient(loadCenter.x, loadCenter.y, 5, loadCenter.x, loadCenter.y, 80);
      loadGlow.addColorStop(0, 'rgba(6, 182, 212, 0.25)');
      loadGlow.addColorStop(1, 'rgba(6, 182, 212, 0)');
      ctx.fillStyle = loadGlow;
      ctx.beginPath();
      ctx.arc(loadCenter.x, loadCenter.y, 80, 0, Math.PI * 2);
      ctx.fill();

      // Outer Ring
      ctx.save();
      ctx.translate(loadCenter.x, loadCenter.y);
      ctx.rotate(timeSec * 2.5);
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 44, 0, Math.PI * 1.3);
      ctx.stroke();
      ctx.restore();

      // Counter Inner Ring
      ctx.save();
      ctx.translate(loadCenter.x, loadCenter.y);
      ctx.rotate(-timeSec * 3.2);
      ctx.strokeStyle = '#818cf8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 32, 0, Math.PI * 1.1);
      ctx.stroke();
      ctx.restore();

      // Pulsing Core
      const corePulse = 12 + Math.sin(timeSec * 6) * 3;
      ctx.fillStyle = '#38bdf8';
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(loadCenter.x, loadCenter.y, corePulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // ECG Scan line at bottom of card
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.6)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(100, 610);
      ctx.lineTo(560, 610);
      ctx.stroke();

      const ecgProgress = ((timeSec * 180) % 460);
      const ecgGrad = ctx.createLinearGradient(100 + ecgProgress - 60, 610, 100 + ecgProgress + 60, 610);
      ecgGrad.addColorStop(0, 'rgba(6, 182, 212, 0)');
      ecgGrad.addColorStop(0.5, '#22d3ee');
      ecgGrad.addColorStop(1, 'rgba(6, 182, 212, 0)');
      ctx.strokeStyle = ecgGrad;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(100 + ecgProgress - 60, 610);
      // Small heartbeat spike
      ctx.lineTo(100 + ecgProgress - 15, 610);
      ctx.lineTo(100 + ecgProgress - 5, 595);
      ctx.lineTo(100 + ecgProgress + 5, 625);
      ctx.lineTo(100 + ecgProgress + 15, 610);
      ctx.lineTo(100 + ecgProgress + 60, 610);
      ctx.stroke();

      // Loading percentage
      const loadPct = Math.min(100, Math.floor((timeSec * 15) % 100));
      ctx.fillStyle = '#67e8f9';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText('Încărcare proces: ' + loadPct + '% • Parsare bază de date grile...', 100, 645);
      ctx.restore();

      // SECTION 3 CARD: AI THINKING ANIMATION
      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
      ctx.strokeStyle = (curState === 'thinking') ? 'rgba(236, 72, 153, 0.6)' : 'rgba(30, 41, 59, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(640, 155, 590, 530, 16);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ec4899';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('03. ANIMAȚIE DE GÂNDIRE (AI THINKING & REASONING)', 670, 185);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText('Concept: Synaptic Neural Core & Thought Streamer', 670, 208);

      // Thinking Orb Core
      const thinkCenter = { x: 935, y: 350 };
      
      // Expanding breathing ripples
      const r1 = 60 + Math.sin(timeSec * 3) * 12;
      const r2 = 90 + Math.sin(timeSec * 3 + 1) * 16;
      ctx.strokeStyle = 'rgba(236, 72, 153, 0.2)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(thinkCenter.x, thinkCenter.y, r2, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(168, 85, 247, 0.35)';
      ctx.beginPath();
      ctx.arc(thinkCenter.x, thinkCenter.y, r1, 0, Math.PI * 2);
      ctx.stroke();

      // Synapse sparks orbiting
      for (let i = 0; i < 5; i++) {
        const ang = timeSec * 1.8 + (i * Math.PI * 2 / 5);
        const sparkDist = 65 + Math.sin(timeSec * 4 + i) * 10;
        const sx = thinkCenter.x + Math.cos(ang) * sparkDist;
        const sy = thinkCenter.y + Math.sin(ang) * sparkDist;
        
        ctx.fillStyle = (i % 2 === 0) ? '#f472b6' : '#c084fc';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(sx, sy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Faint connecting line to center
        ctx.strokeStyle = 'rgba(236, 72, 153, 0.2)';
        ctx.beginPath();
        ctx.moveTo(thinkCenter.x, thinkCenter.y);
        ctx.lineTo(sx, sy);
        ctx.stroke();
      }

      // Glowing Center Orb
      const orbScale = 36 + Math.sin(timeSec * 4) * 4;
      const orbGrad = ctx.createRadialGradient(thinkCenter.x, thinkCenter.y, 4, thinkCenter.x, thinkCenter.y, orbScale);
      orbGrad.addColorStop(0, '#ffffff');
      orbGrad.addColorStop(0.3, '#f472b6');
      orbGrad.addColorStop(0.7, '#c084fc');
      orbGrad.addColorStop(1, '#6366f1');
      ctx.fillStyle = orbGrad;
      ctx.shadowColor = '#ec4899';
      ctx.shadowBlur = 30;
      ctx.beginPath();
      ctx.arc(thinkCenter.x, thinkCenter.y, orbScale, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Live Thought Streamer Box
      ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
      ctx.strokeStyle = 'rgba(236, 72, 153, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(700, 480, 470, 75, 12);
      ctx.fill();
      ctx.stroke();

      // Thought steps text
      const thoughts = [
        "Analizez datele clinice ale pacientului...",
        "Corelez ghidurile medicale recente...",
        "Sintetizez diagnosticul diferențial...",
        "Formulez explicația detaliată a grilei..."
      ];
      const thoughtIdx = Math.floor((timeSec * 0.8) % thoughts.length);
      
      // Ping dot
      ctx.fillStyle = '#ec4899';
      ctx.beginPath();
      ctx.arc(730, 517, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f472b6';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(thoughts[thoughtIdx], 745, 521);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px sans-serif';
      ctx.fillText('Raționament profund în desfășurare • Model Medical StudyX', 745, 540);

      // Thinking Synapse Matrix mini preview
      ctx.fillStyle = '#a855f7';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('Puncte de sinapsă active: 1,420 conexiuni', 700, 595);
      
      // Progress indicators
      for (let b = 0; b < 4; b++) {
        const barActive = (b <= thoughtIdx);
        ctx.fillStyle = barActive ? '#ec4899' : '#334155';
        ctx.beginPath();
        ctx.roundRect(700 + b * 118, 615, 110, 6, 3);
        ctx.fill();
      }
      ctx.restore();

      // ── RENDER CUSTOM CURSOR PHYSICS & TRAIL ──
      // Update target
      const target = getCursorTarget(timeSec);
      curX = target.x;
      curY = target.y;
      curState = target.state;

      // Spring lag on outer ring
      ringX += (curX - ringX) * 0.22;
      ringY += (curY - ringY) * 0.22;

      // Trail particles
      if (frame % 2 === 0) {
        particles.push({
          x: curX,
          y: curY,
          size: Math.random() * 3 + 1.5,
          alpha: 0.8,
          vx: (Math.random() - 0.5) * 1.5,
          vy: (Math.random() - 0.5) * 1.5,
          color: (curState === 'thinking') ? '236, 72, 153' : (curState === 'loading' ? '6, 182, 212' : '99, 102, 241')
        });
      }

      // Draw & update particles
      for (let p = particles.length - 1; p >= 0; p--) {
        const pt = particles[p];
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.alpha -= 0.03;
        if (pt.alpha <= 0) {
          particles.splice(p, 1);
        } else {
          ctx.fillStyle = 'rgba(' + pt.color + ',' + pt.alpha + ')';
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Aura
      const curAura = ctx.createRadialGradient(curX, curY, 2, curX, curY, 45);
      const auraColor = (curState === 'thinking') ? '236, 72, 153' : (curState === 'loading' ? '6, 182, 212' : '99, 102, 241');
      curAura.addColorStop(0, 'rgba(' + auraColor + ', 0.25)');
      curAura.addColorStop(1, 'rgba(' + auraColor + ', 0)');
      ctx.fillStyle = curAura;
      ctx.beginPath();
      ctx.arc(curX, curY, 45, 0, Math.PI * 2);
      ctx.fill();

      // Outer Ring
      ctx.save();
      if (curState === 'hover') {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.fillStyle = 'rgba(56, 189, 248, 0.1)';
        ctx.beginPath();
        ctx.arc(ringX, ringY, 26, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (curState === 'text') {
        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = 1.5;
        ctx.fillStyle = 'rgba(168, 85, 247, 0.1)';
        ctx.beginPath();
        ctx.roundRect(ringX - 10, ringY - 16, 20, 32, 6);
        ctx.fill();
        ctx.stroke();
      } else if (curState === 'loading') {
        ctx.save();
        ctx.translate(ringX, ringY);
        ctx.rotate(timeSec * 4);
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.arc(0, 0, 24, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else if (curState === 'thinking') {
        const pulse = 22 + Math.sin(timeSec * 8) * 6;
        ctx.strokeStyle = '#ec4899';
        ctx.lineWidth = 2;
        ctx.fillStyle = 'rgba(236, 72, 153, 0.15)';
        ctx.beginPath();
        ctx.arc(ringX, ringY, pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (curState === 'click') {
        ctx.strokeStyle = '#ec4899';
        ctx.lineWidth = 2;
        clickRipple += 1.5;
        ctx.beginPath();
        ctx.arc(ringX, ringY, 18 + clickRipple, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(ringX, ringY, 18, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      // Precision Dot
      ctx.save();
      if (curState === 'text') {
        ctx.fillStyle = '#c084fc';
        ctx.fillRect(curX - 1.5, curY - 12, 3, 24);
      } else {
        const dotColor = (curState === 'thinking') ? '#ec4899' : (curState === 'loading' ? '#38bdf8' : (curState === 'hover' ? '#38bdf8' : '#818cf8'));
        ctx.fillStyle = dotColor;
        ctx.shadowColor = dotColor;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(curX, curY, (curState === 'click') ? 3 : 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.restore();

      frame++;
    }

    // MediaRecorder logic
    window.startRecording = function() {
      return new Promise((resolve) => {
        const stream = canvas.captureStream(60);
        const recorder = new MediaRecorder(stream, {
          mimeType: 'video/webm;codecs=vp9',
          videoBitsPerSecond: 6000000 // 6 Mbps high quality
        });

        const chunks = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = async () => {
          const blob = new Blob(chunks, { type: 'video/webm' });
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve(reader.result.split(',')[1]); // return base64
          };
          reader.readAsDataURL(blob);
        };

        recorder.start();

        const startTime = performance.now();
        function loop() {
          const elapsed = (performance.now() - startTime) / 1000;
          drawScene(elapsed);
          if (elapsed < 12) {
            requestAnimationFrame(loop);
          } else {
            recorder.stop();
          }
        }
        loop();
      });
    };
  </script>
</body>
</html>`;

  await page.setContent(htmlContent);
  console.log('Starting automated video render and recording...');

  const base64Data = await page.evaluate(async () => {
    return await window.startRecording();
  });

  const buffer = Buffer.from(base64Data, 'base64');
  const targetVideo1 = path.join(outputDir, 'studyx_animations_showcase.webm');
  const targetVideo2 = path.join(artifactDir, 'studyx_animations_showcase.webm');

  fs.writeFileSync(targetVideo1, buffer);
  fs.writeFileSync(targetVideo2, buffer);

  console.log('Video saved successfully!');
  console.log('Path 1:', targetVideo1, '(' + (buffer.length / 1024 / 1024).toFixed(2) + ' MB)');
  console.log('Path 2:', targetVideo2);

  await browser.close();
}

recordShowcaseVideo().catch(console.error);
