const fs = require('fs');

let code = fs.readFileSync('src/components/UpdateModal.tsx', 'utf8');

const startMarker = '{/* ── SECTION 1: System update ── */}';
const endMarker = '{/* ── SECTION 2: Content packs ── */}';

const startIndex = code.indexOf(startMarker);
const endIndex = code.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
  console.error('Markers not found', startIndex, endIndex);
  process.exit(1);
}

const newSection = `
{/* ── SECTION 1: System update ── */}
                <div style={{ marginBottom: hasContent ? 28 : 0 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: theme.text3,
                    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 20,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <Package2 size={12} />
                    Actualizare Sistem
                  </div>

                  <AnimatePresence mode="wait">
                    {/* Error State */}
                    {status === 'error' && error && (
                      <motion.div key="error"
                        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                        style={{
                          background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)',
                          borderRadius: 14, padding: '18px 20px',
                        }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                          <AlertCircle size={16} color="#ef4444" />
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#ef4444' }}>
                            Eroare actualizare
                          </span>
                        </div>
                        <p style={{ margin: '0 0 14px', fontSize: 13, color: theme.text2 }}>{error}</p>
                        <button
                          onClick={() => { dismiss(); checkForUpdate(); }}
                          style={{
                            padding: '8px 16px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)',
                            background: 'rgba(239,68,68,0.08)', color: '#ef4444',
                            cursor: 'pointer', fontSize: 13, fontWeight: 600,
                          }}
                        >
                          Încearcă din nou
                        </button>
                      </motion.div>
                    )}

                    {/* Up to date State */}
                    {(status === 'up-to-date' || (status === 'idle' && !hasSystemUpdate)) && (
                      <motion.div key="up-to-date"
                        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                        style={{
                          background: \`\${theme.success}0D\`, border: \`1px solid \${theme.success}25\`,
                          borderRadius: 14, padding: '18px 20px',
                          display: 'flex', alignItems: 'center', gap: 12,
                        }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                          background: \`\${theme.success}20\`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Check size={18} color={theme.success} />
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>
                            Aplicația este la zi
                          </div>
                          <div style={{ fontSize: 12, color: theme.text3, marginTop: 2 }}>
                            Versiunea {localVersion} este cea mai recentă.
                          </div>
                        </div>
                      </motion.div>
                    )}

                    {/* Wizard State */}
                    {(status === 'checking' || status === 'available' || status === 'downloading' || status === 'ready') && (
                      <motion.div key="wizard"
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                        style={{
                           background: theme.surface2,
                           borderRadius: 16,
                           padding: '24px',
                           border: \`1px solid \${theme.border}\`,
                        }}
                      >
                        {[
                          { id: 'checking', label: 'Verificare', icon: RefreshCw },
                          { id: 'available', label: 'Noutăți versiune', icon: Sparkles },
                          { id: 'downloading', label: 'Descărcare', icon: Download },
                          { id: 'ready', label: 'Finalizare', icon: RotateCcw }
                        ].map((step, idx, arr) => {
                          const currentIdx = status === 'checking' ? 0 : status === 'available' ? 1 : status === 'downloading' ? 2 : status === 'ready' ? 3 : 0;
                          const isActive = idx === currentIdx;
                          const isDone = idx < currentIdx;
                          const isFuture = idx > currentIdx;

                          return (
                            <div key={step.id} style={{ display: 'flex', gap: 16, position: 'relative' }}>
                              {/* Connector line */}
                              {idx < arr.length - 1 && (
                                <div style={{
                                  position: 'absolute', left: 19, top: 40, bottom: -8, width: 2,
                                  background: theme.border, borderRadius: 2, zIndex: 0
                                }}>
                                  <motion.div
                                    initial={{ height: 0 }}
                                    animate={{ height: isDone ? '100%' : '0%' }}
                                    transition={{ duration: 0.4 }}
                                    style={{ width: '100%', background: theme.accent, borderRadius: 2 }}
                                  />
                                </div>
                              )}

                              {/* Step Node */}
                              <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <div style={{
                                  width: 40, height: 40, borderRadius: '50%',
                                  background: isActive ? theme.accent : isDone ? theme.success : theme.surface,
                                  color: isActive || isDone ? '#fff' : theme.text3,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  boxShadow: isActive ? \`0 0 0 4px \${theme.accent}33, 0 4px 12px \${theme.accent}66\` : \`0 2px 8px rgba(0,0,0,0.1)\`,
                                  border: isFuture ? \`1px solid \${theme.border}\` : 'none',
                                  transition: 'all 0.3s ease'
                                }}>
                                  {/* Pulse effect */}
                                  {isActive && (
                                    <motion.div
                                      animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }}
                                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                                      style={{ position: 'absolute', inset: -2, borderRadius: '50%', border: \`2px solid \${theme.accent}\` }}
                                    />
                                  )}
                                  {isDone ? <Check size={20} /> : <step.icon size={18} />}
                                </div>
                              </div>

                              {/* Content */}
                              <div style={{ flex: 1, paddingBottom: idx === arr.length - 1 ? 0 : 28, paddingTop: 8, opacity: isFuture ? 0.5 : 1 }}>
                                <div style={{ fontSize: 15, fontWeight: isActive ? 800 : 600, color: isActive ? theme.accent : theme.text, display: 'flex', alignItems: 'center', gap: 8 }}>
                                   {step.label}
                                   {isActive && status === 'checking' && (
                                      <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                                         <RefreshCw size={12} color={theme.accent} />
                                      </motion.span>
                                   )}
                                </div>

                                <AnimatePresence mode="sync">
                                  {isActive && (
                                    <motion.div
                                      initial={{ opacity: 0, height: 0, marginTop: 0 }}
                                      animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
                                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                                      style={{ overflow: 'hidden' }}
                                    >
                                      {/* --- Checking --- */}
                                      {status === 'checking' && (
                                        <div style={{ fontSize: 13, color: theme.text2 }}>
                                          Ne conectăm la server pentru a căuta cea mai nouă versiune...
                                        </div>
                                      )}

                                      {/* --- Available --- */}
                                      {status === 'available' && manifest && (
                                        <div style={{
                                           background: theme.surface, borderRadius: 12, padding: 16,
                                           border: \`1px solid \${theme.border}\`
                                        }}>
                                           <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                              <PulseDot color={theme.accent} />
                                              <span style={{ fontSize: 16, fontWeight: 800, color: theme.text }}>v{manifest.version}</span>
                                              <span style={{ fontSize: 12, color: theme.text3 }}>{manifest.releaseDate}</span>
                                           </div>

                                           {manifest.changes?.length > 0 && (
                                             <ul style={{ margin: '0 0 16px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                               {manifest.changes.map((c, i) => (
                                                 <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: theme.text2, lineHeight: 1.5 }}>
                                                   <ChevronRight size={14} color={theme.accent} style={{ flexShrink: 0, marginTop: 2 }} />
                                                   {c}
                                                 </li>
                                               ))}
                                             </ul>
                                           )}

                                           {manifest.isSequential && (manifest.stepsRemaining ?? 0) > 1 && (
                                             <div style={{
                                               fontSize: 12, color: theme.warning, background: \`\${theme.warning}12\`,
                                               border: \`1px solid \${theme.warning}30\`, borderRadius: 8, padding: '8px 10px', marginBottom: 16
                                             }}>
                                               Upgrade secvențial ({manifest.stepsRemaining} pași rămași până la ultima versiune).
                                             </div>
                                           )}

                                           <motion.button
                                             onClick={downloadUpdate}
                                             whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                                             style={{
                                               width: '100%', padding: '10px 16px', borderRadius: 10, border: 'none',
                                               cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#fff',
                                               background: \`linear-gradient(135deg, \${theme.accent}, \${theme.accent2})\`,
                                               display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                               boxShadow: \`0 4px 12px \${theme.accent}40\`,
                                             }}
                                           >
                                             <Download size={15} /> Începe descărcarea
                                           </motion.button>
                                        </div>
                                      )}

                                      {/* --- Downloading --- */}
                                      {status === 'downloading' && (
                                        <div style={{
                                           background: theme.surface, borderRadius: 12, padding: 16,
                                           border: \`1px solid \${theme.border}\`
                                        }}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, alignItems: 'center' }}>
                                            <span style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>Se descarcă pachetul...</span>
                                            <span style={{ fontSize: 13, fontWeight: 800, color: theme.accent, fontFamily: 'monospace' }}>{downloadPercent}%</span>
                                          </div>
                                          <div style={{ height: 6, borderRadius: 3, background: theme.surface2, overflow: 'hidden' }}>
                                            <motion.div
                                              style={{ height: '100%', borderRadius: 3, background: \`linear-gradient(90deg, \${theme.accent}, \${theme.accent2})\` }}
                                              animate={{ width: \`\${downloadPercent}%\` }}
                                              transition={{ duration: 0.2 }}
                                            />
                                          </div>
                                        </div>
                                      )}

                                      {/* --- Ready --- */}
                                      {status === 'ready' && (
                                        <div style={{
                                           background: \`\${theme.success}10\`, borderRadius: 12, padding: 16,
                                           border: \`1px solid \${theme.success}30\`
                                        }}>
                                          <p style={{ margin: '0 0 16px', fontSize: 13, color: theme.text2 }}>
                                            Pachetul a fost descărcat cu succes. Repornește aplicația pentru a aplica modificările.
                                          </p>
                                          <motion.button
                                            onClick={applyUpdate}
                                            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                                            style={{
                                              width: '100%', padding: '10px 16px', borderRadius: 10, border: 'none',
                                              cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#fff',
                                              background: \`linear-gradient(135deg, \${theme.success}, \${theme.accent})\`,
                                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                              boxShadow: \`0 4px 12px \${theme.success}40\`,
                                            }}
                                          >
                                            <RotateCcw size={15} /> Repornește StudyX
                                          </motion.button>
                                        </div>
                                      )}
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            </div>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                `;

const newCode = code.substring(0, startIndex) + newSection + code.substring(endIndex);
fs.writeFileSync('src/components/UpdateModal.tsx', newCode);
console.log('UpdateModal updated successfully');
