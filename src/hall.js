// The Hall of Echoes: records kept in this browser only (exported with the save code).
//   - best wave cleared in the Echo Ring for each class and subclass (normal runs)
//   - this browser's best Weekly Echo run per week and subclass, with the run itself,
//     so it can be sent again if the boards were unreachable when it finished.

const HALL_KEY = 'stunned-hall-v1';
const TRIAL_KEY = 'stunned-trial-v1';

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch (err) {
    return null;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    return false;
  }
}

/** { 'mage': {wave, at, rift}, 'mage/pyromancer': {wave, at, rift: {tier, secs}}, ... } */
export function loadHall() {
  return read(HALL_KEY) || {};
}

/** Note a cleared wave. Returns true when it beats the record for that class or subclass. */
export function recordWave(cls, spec, wave) {
  const hall = loadHall();
  const key = spec ? `${cls}/${spec}` : cls;
  const old = hall[key];
  if (old && old.wave >= wave) return false;
  hall[key] = { wave, at: new Date().toISOString().slice(0, 10) };
  write(HALL_KEY, hall);
  return true;
}

/** This browser's Weekly Echo runs: { [week]: { [spec]: { floor, clearTick, sent, payload } } } */
export function loadTrialRuns() {
  return read(TRIAL_KEY) || {};
}

/** Keep a finished run if it is this browser's best for its week and subclass. Returns true if it is. */
export function keepTrialRun(week, spec, score, payload) {
  const all = loadTrialRuns();
  // Only the current and previous week are worth keeping.
  for (const k of Object.keys(all)) if (Number(k) < week - 1) delete all[k];
  const wk = (all[week] = all[week] || {});
  const old = wk[spec];
  const better = !old || score.floor > old.floor || (score.floor === old.floor && score.clearTick < old.clearTick);
  if (!better) return false;
  wk[spec] = { floor: score.floor, clearTick: score.clearTick, sent: false, payload };
  if (!write(TRIAL_KEY, all)) {
    // Storage full: keep the score, drop the recording.
    wk[spec].payload = null;
    write(TRIAL_KEY, all);
  }
  return true;
}

export function markTrialSent(week, spec) {
  const all = loadTrialRuns();
  if (all[week] && all[week][spec]) {
    all[week][spec].sent = true;
    all[week][spec].payload = null; // the server has it now
    write(TRIAL_KEY, all);
  }
}

/** Note an Echo Rift cleared in time (0.26). Returns true when it is a new best for that class or subclass. */
export function recordRift(cls, spec, tier, secs) {
  const hall = loadHall();
  const key = spec ? `${cls}/${spec}` : cls;
  const old = (hall[key] && hall[key].rift) || null;
  if (old && (old.tier > tier || (old.tier === tier && old.secs <= secs))) return false;
  hall[key] = Object.assign({}, hall[key], { rift: { tier, secs, at: new Date().toISOString().slice(0, 10) } });
  write(HALL_KEY, hall);
  return true;
}
