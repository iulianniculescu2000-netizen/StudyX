// Date de test realiste pentru scripts/shoot-ui.mjs și scripts/perf-measure.mjs, injectate prin store-urile reale ale aplicației.
// Rulează în pagină (page.evaluate). Nu atinge niciun fișier și niciun profil real.
async () => {
  const { useQuizStore } = await import('/src/store/quizStore.ts');
  const { useFolderStore } = await import('/src/store/folderStore.ts');
  const { useStatsStore } = await import('/src/store/statsStore.ts');

  const day = 86400000;
  const now = Date.now();
  const L = ['A', 'B', 'C', 'D', 'E'];
  const mk = (qid, text, opts, correct, explanation, multi = false) => ({
    id: qid, text, multipleCorrect: multi, explanation,
    options: opts.map((t, k) => ({ id: `${qid}-${L[k]}`, text: t, isCorrect: correct.includes(k) })),
  });

  const cardio = [
    mk('c1', 'Care dintre următoarele sunt criterii majore Duke pentru endocardita infecțioasă?', ['Hemoculturi pozitive cu microorganisme tipice', 'Febră peste 38°C', 'Vegetație evidențiată ecocardiografic', 'Fenomen Janeway', 'Glomerulonefrită'], [0, 2], 'Criteriile majore: hemoculturi pozitive și dovada implicării endocardice (ecografie). Febra și fenomenele vasculare sunt criterii minore.', true),
    mk('c2', 'Tratamentul de primă intenție în fibrilația atrială cu instabilitate hemodinamică este:', ['Amiodaronă i.v.', 'Cardioversie electrică sincronă', 'Digoxin', 'Beta-blocant oral', 'Anticoagulare și observație'], [1], 'Instabilitatea hemodinamică impune cardioversie electrică sincronă imediată.'),
    mk('c3', 'Semnul electrocardiografic cel mai specific pentru pericardita acută este:', ['Supradenivelare ST concavă difuză', 'Subdenivelare PR', 'Unda Q patologică', 'Bloc de ramură stângă', 'Unda T ascuțită'], [0, 1], 'Supradenivelarea ST concavă difuză cu subdenivelare PR este tipică.', true),
    mk('c4', 'În insuficiența cardiacă cu fracție de ejecție redusă, reduc mortalitatea:', ['IECA / ARNI', 'Beta-blocantele', 'Antagoniștii de mineralocorticoizi', 'Diureticele de ansă', 'Inhibitorii SGLT2'], [0, 1, 2, 4], 'Diureticele de ansă ameliorează simptomele, dar nu reduc mortalitatea.', true),
    mk('c5', 'Suflul din stenoza aortică:', ['Este mezosistolic, ejecțional', 'Iradiază în carotide', 'Este diastolic, aspirativ', 'Se accentuează la manevra Valsalva', 'Este holosistolic în apex'], [0, 1], 'Suflul ejecțional mezosistolic iradiază în carotide.', true),
    mk('c6', 'Valoarea-țintă a LDL-colesterolului la pacientul cu risc cardiovascular foarte înalt este:', ['< 55 mg/dL', '< 70 mg/dL', '< 100 mg/dL', '< 116 mg/dL', '< 130 mg/dL'], [0], 'Ghidurile ESC recomandă LDL < 55 mg/dL și reducere ≥ 50%.'),
  ];
  const pneumo = [
    mk('p1', 'Care sunt indicațiile pentru oxigenoterapia de lungă durată în BPOC?', ['PaO2 ≤ 55 mmHg în repaus', 'SaO2 ≤ 88%', 'PaO2 56–59 mmHg cu cord pulmonar', 'Dispnee de efort izolată', 'Tuse cronică productivă'], [0, 1, 2], 'Oxigenoterapia crește supraviețuirea la pacienții cu hipoxemie severă.', true),
    mk('p2', 'Agentul etiologic cel mai frecvent al pneumoniei comunitare este:', ['Streptococcus pneumoniae', 'Haemophilus influenzae', 'Mycoplasma pneumoniae', 'Legionella pneumophila', 'Staphylococcus aureus'], [0], 'Pneumococul rămâne cea mai frecventă cauză.'),
    mk('p3', 'Scorul CURB-65 include:', ['Confuzia', 'Ureea > 7 mmol/L', 'Frecvența respiratorie ≥ 30/min', 'Leucocitoza', 'Vârsta ≥ 65 de ani'], [0, 1, 2, 4], 'Confuzie, Uree, frecvență Respiratorie, tensiune (Blood pressure), vârsta 65.', true),
    mk('p4', 'Embolia pulmonară masivă se tratează de elecție cu:', ['Tromboliză sistemică', 'Heparină cu greutate moleculară mică', 'Aspirină', 'Filtru de venă cavă', 'Anticoagulant oral direct'], [0], 'Instabilitatea hemodinamică indică tromboliza.'),
  ];
  const gastro = [
    mk('g1', 'Cauza cea mai frecventă a hemoragiei digestive superioare este:', ['Ulcerul peptic', 'Varicele esofagiene', 'Sindromul Mallory-Weiss', 'Cancerul gastric', 'Esofagita'], [0], 'Ulcerul peptic este responsabil de aproximativ jumătate din cazuri.'),
    mk('g2', 'Criteriile Ranson la internare includ:', ['Vârsta > 55 ani', 'Leucocite > 16.000/mm³', 'Glicemie > 200 mg/dL', 'Amilaza serică', 'LDH > 350 UI/L'], [0, 1, 2, 4], 'Amilaza nu face parte din criteriile Ranson.', true),
    mk('g3', 'Markerul serologic al infecției acute cu virus hepatitic B este:', ['AgHBs', 'Anti-HBc IgM', 'Anti-HBs', 'AgHBe', 'Anti-HBc IgG'], [0, 1], 'AgHBs și anti-HBc IgM indică infecția acută.', true),
  ];
  const nefro = [
    mk('n1', 'Sindromul nefrotic se definește prin:', ['Proteinurie > 3,5 g/24h', 'Hipoalbuminemie', 'Edeme', 'Hematurie macroscopică', 'Hipertensiune obligatorie'], [0, 1, 2], 'Hematuria și HTA sunt caracteristice sindromului nefritic.', true),
    mk('n2', 'Hiperpotasemia severă cu modificări ECG se tratează inițial cu:', ['Gluconat de calciu i.v.', 'Furosemid', 'Bicarbonat oral', 'Rășini schimbătoare de ioni', 'Restricție de potasiu'], [0], 'Calciul stabilizează membrana miocardică în câteva minute.'),
  ];

  const card = (qid, front, back) => ({ id: qid, text: front, options: [{ id: `${qid}-A`, text: back, isCorrect: true }] });
  const deck1 = [
    card('f1', 'Triada Beck', 'Hipotensiune, turgescență jugulară, zgomote cardiace asurzite (tamponadă cardiacă)'),
    card('f2', 'Semnul Kussmaul', 'Creșterea presiunii venoase jugulare în inspir (pericardită constrictivă)'),
    card('f3', 'Pulsul paradoxal', 'Scăderea TA sistolice cu > 10 mmHg în inspir'),
    card('f4', 'Triada Virchow', 'Stază venoasă, leziune endotelială, hipercoagulabilitate'),
    card('f5', 'Criteriile Light', 'Exsudat: proteine pleurale/serice > 0,5; LDH pleural/seric > 0,6; LDH pleural > 2/3 din limita superioară'),
  ];
  const deck2 = [
    card('m1', 'Antidot paracetamol', 'N-acetilcisteină'),
    card('m2', 'Antidot heparină', 'Sulfat de protamină'),
    card('m3', 'Antidot benzodiazepine', 'Flumazenil'),
    card('m4', 'Antidot opioide', 'Naloxonă'),
  ];

  const fs = useFolderStore.getState();
  const fCardio = fs.addFolder('Medicină internă', '🩺', 'blue');
  const fPneumo = fs.addFolder('Chirurgie', '🔪', 'green');

  const quizzes = [
    { id: 'seed-cardio', title: 'Cardiologie – insuficiență cardiacă și valvulopatii', category: 'Cardiologie', emoji: '❤️', color: 'red', folderId: fCardio, questions: cardio, tags: ['cardiologie'] },
    { id: 'seed-pneumo', title: 'Pneumologie – BPOC și pneumonii', category: 'Pneumologie', emoji: '🫁', color: 'blue', folderId: fCardio, questions: pneumo, tags: ['pneumologie'] },
    { id: 'seed-gastro', title: 'Gastroenterologie – hemoragii și pancreatită', category: 'Gastroenterologie', emoji: '🩻', color: 'orange', folderId: fPneumo, questions: gastro, tags: ['gastro'] },
    { id: 'seed-nefro', title: 'Nefrologie – sindroame glomerulare', category: 'Nefrologie', emoji: '💧', color: 'purple', folderId: null, questions: nefro, tags: ['nefrologie'] },
  ].map((q, i) => ({ ...q, kind: 'quiz', description: 'Grile tip Rezidențiat, cu explicații', createdAt: now - (10 - i) * day, penaltyMode: i === 0 }));
  const decks = [
    { id: 'seed-deck-semne', title: 'Semne și triade clinice', category: 'Semiologie', emoji: '🧠', color: 'teal', questions: deck1 },
    { id: 'seed-deck-antidot', title: 'Antidoturi', category: 'Farmacologie', emoji: '💊', color: 'green', questions: deck2 },
  ].map((d, i) => ({ ...d, kind: 'flashcard', tags: ['flashcard'], description: 'Pachet de flashcarduri', folderId: null, createdAt: now - (6 - i) * day }));

  const qs = useQuizStore.getState();
  if (qs.addQuizzes) qs.addQuizzes([...quizzes, ...decks]); else [...quizzes, ...decks].forEach((q) => qs.addQuiz(q));

  // Sesiuni trecute (Panou, Statistici, Caiet de erori).
  const sessions = [];
  quizzes.forEach((q, qi) => {
    for (let k = 0; k < 3; k += 1) {
      const startedAt = now - (qi * 3 + k * 4 + 1) * day - 3600000;
      const answers = {};
      let score = 0;
      q.questions.forEach((qq, j) => {
        const right = qq.options.filter((o) => o.isCorrect).map((o) => o.id);
        const ok = (j + k + qi) % 3 !== 0;
        answers[qq.id] = ok ? right : [qq.options.find((o) => !o.isCorrect).id];
        if (ok) score += 1;
      });
      sessions.push({ id: `seed-s-${q.id}-${k}`, quizId: q.id, answers, startedAt, finishedAt: startedAt + 9 * 60000, score, total: q.questions.length, mode: 'study' });
    }
  });
  sessions.forEach((s) => useQuizStore.getState().addSession(s));

  // Statistici pe întrebări + serie de zile (heatmap).
  const questionStats = {};
  [...quizzes, ...decks].forEach((q, qi) => q.questions.forEach((qq, j) => {
    const wrong = (j + qi) % 3 === 0;
    questionStats[`${q.id}:${qq.id}`] = {
      questionId: qq.id, quizId: q.id,
      timesCorrect: wrong ? 1 : 3, timesWrong: wrong ? 2 : 0,
      lastSeen: now - (j + 1) * day, nextReview: wrong ? now - 3600000 : now + (j + 2) * day,
      interval: wrong ? 1 : 6, eFactor: wrong ? 1.7 : 2.6, consecutiveCorrect: wrong ? 0 : 3,
      lastConfidence: wrong ? 'guess' : 'confident',
      ...(wrong && j % 2 === 0 ? { errorType: 'mecanism', errorTypeAt: now - day } : {}),
    };
  }));
  const ds = (d) => { const x = new Date(now - d * day); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  const studyDates = [];
  for (let d = 70; d >= 1; d -= 1) if (d < 9 || (d * 7) % 5 < 3) studyDates.push(ds(d));
  const st = useStatsStore.getState();
  st._hydrate({
    questionStats,
    streak: { currentStreak: 8, longestStreak: 14, lastStudyDate: ds(1), studyDates },
    totalStudyTime: 38 * 3600,
    achievements: st._snapshot().achievements,
  });
  return { quizzes: useQuizStore.getState().quizzes.length, folders: fCardio && fPneumo };
}
