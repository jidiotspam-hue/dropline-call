import { categoryKeys, detectTriggerCategories } from "./profanity.js";

const $ = (selector) => document.querySelector(selector);

const homeView = $("#homeView");
const waitingView = $("#waitingView");
const callView = $("#callView");
const displayName = $("#displayName");
const primaryAction = $("#primaryAction");
const primaryLabel = $("#primaryLabel");
const cardTitle = $("#cardTitle");
const roomForm = $("#roomForm");
const roomInput = $("#roomInput");
const remoteAudio = $("#remoteAudio");
const networkDot = $("#networkDot");
const networkLabel = $("#networkLabel");
const toastElement = $("#toast");

const params = new URLSearchParams(location.search);
const invitedRoom = cleanRoomId(params.get("call") || "");
const isInvite = Boolean(invitedRoom);
const LINE_DELAY = 3.25;
const RECOGNITION_LATENCY_ALLOWANCE = 1.6;
const VOICE_CUT_SECONDS = 2.05;
const MAX_SOUND_SECONDS = 4.0;
const VOSK_MODEL_URL = "https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz";

const soundFiles = [
  "anime-girl-voice.mp3",
  "price-is-right-losing-horn.mp3",
  "lebron.mp3",
  "bad-to-the-bone.mp3",
  "im-gonna-come.mp3",
  "american-anthem.mp3",
  "stay-in-character.mp3",
  "l-theme.mp3",
  "fake-news.mp3",
  "wrong.mp3",
  "china.mp3",
  "they-indicted-me.mp3"
];

let peer;
let peerReady = false;
let mediaCall = null;
let dataConnection = null;
let rawStream = null;
let rawSourceNode = null;
let outgoingStream = null;
let audioContext = null;
let micGain = null;
let lineGain = null;
let analysisNode = null;
let remoteAnalysisNode = null;
let mediaDestination = null;
let soundBuffers = [];
let soundBag = [];
let lineOpenAt = 0;
let recognition = null;
let recognitionWanted = false;
let recognitionRestartTimer = null;
let handledRecognitionResults = new Map();
let voskModel = null;
let voskRecognizer = null;
let voskProcessor = null;
let voskSilentGain = null;
let voskLoading = null;
let voskUtteranceIndex = 0;
let inviteUrl = "";
let roomHostId = "";
let callStartedAt = 0;
let timerHandle = null;
let meterFrame = null;
let muted = false;
let toastTimer = null;
let acceptIncoming = false;
let localSwearStats = emptySwearStats();
let remoteSwearStats = emptySwearStats();

function emptySwearStats() {
  return { total: 0, categories: Object.fromEntries(categoryKeys.map((key) => [key, 0])) };
}

function safeSwearStats(value) {
  const stats = emptySwearStats();
  for (const key of categoryKeys) {
    stats.categories[key] = Math.floor(Math.max(0, Math.min(9999, Number(value?.categories?.[key]) || 0)));
  }
  stats.total = categoryKeys.reduce((sum, key) => sum + stats.categories[key], 0);
  return stats;
}

function resetLeaderboard() {
  localSwearStats = emptySwearStats();
  remoteSwearStats = emptySwearStats();
  renderLeaderboard();
}

function recordLocalSwear(category) {
  if (!categoryKeys.includes(category)) return;
  localSwearStats.categories[category] += 1;
  localSwearStats.total += 1;
  renderLeaderboard();
  sendLocalStats();
}

function processDetectedCategories(categories, resultKey) {
  if (!mediaCall) return;
  const previous = handledRecognitionResults.get(resultKey) || emptySwearStats().categories;
  const current = Object.fromEntries(categoryKeys.map((key) => [
    key,
    categories.filter((category) => category === key).length
  ]));
  for (const key of categoryKeys) {
    const added = Math.max(0, current[key] - (previous[key] || 0));
    for (let count = 0; count < added; count += 1) {
      recordLocalSwear(key);
      rollAudio();
    }
  }
  handledRecognitionResults.set(resultKey, Object.fromEntries(categoryKeys.map((key) => [
    key,
    Math.max(previous[key] || 0, current[key])
  ])));
}

function sendLocalStats() {
  if (dataConnection?.open) {
    dataConnection.send({ type: "swear-stats", stats: localSwearStats });
  }
}

function renderLeaderboard() {
  const localCard = $("#leaderLocal");
  const remoteCard = $("#leaderRemote");
  if (!localCard || !remoteCard) return;

  $("#leaderLocalName").textContent = currentName();
  $("#leaderRemoteName").textContent = $("#remoteName")?.textContent || "Friend";
  $("#leaderLocalTotal").textContent = localSwearStats.total;
  $("#leaderRemoteTotal").textContent = remoteSwearStats.total;
  for (const key of categoryKeys) {
    $(`#leaderLocal-${key}`).textContent = localSwearStats.categories[key];
    $(`#leaderRemote-${key}`).textContent = remoteSwearStats.categories[key];
  }

  const localWins = localSwearStats.total >= remoteSwearStats.total;
  localCard.style.order = localWins ? 0 : 1;
  remoteCard.style.order = localWins ? 1 : 0;
  $("#leaderLocalRank").textContent = localSwearStats.total === remoteSwearStats.total ? "T" : localWins ? "1" : "2";
  $("#leaderRemoteRank").textContent = localSwearStats.total === remoteSwearStats.total ? "T" : localWins ? "2" : "1";
  localCard.classList.toggle("leader", localSwearStats.total > remoteSwearStats.total);
  remoteCard.classList.toggle("leader", remoteSwearStats.total > localSwearStats.total);
}

function cleanRoomId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return (url.searchParams.get("call") || "").replace(/[^a-zA-Z0-9_-]/g, "");
  } catch {
    return raw.replace(/[^a-zA-Z0-9_-]/g, "");
  }
}

function currentName() {
  return displayName.value.trim().slice(0, 28) || "Guest";
}

function initials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts.at(-1)[0] : (parts[0] || "G").slice(0, 2)).toUpperCase();
}

function setView(view) {
  [homeView, waitingView, callView].forEach((item) => item.classList.toggle("active", item === view));
}

function toast(message, error = false) {
  clearTimeout(toastTimer);
  toastElement.textContent = message;
  toastElement.className = `toast show${error ? " error" : ""}`;
  toastTimer = setTimeout(() => { toastElement.className = "toast"; }, 2800);
}

function setNetwork(label, mode = "online") {
  networkLabel.textContent = label;
  networkDot.className = `status-dot ${mode}`;
}

function initializePeer() {
  if (!window.Peer) {
    setNetwork("Could not reach calling service", "offline");
    primaryAction.disabled = true;
    toast("The calling service did not load. Check your connection.", true);
    return;
  }
  peer = new Peer(undefined, { debug: 1 });
  peer.on("open", () => {
    peerReady = true;
    primaryAction.disabled = false;
    setNetwork("Ready for a private call");
  });
  peer.on("call", handleIncomingCall);
  peer.on("connection", handleDataConnection);
  peer.on("disconnected", () => {
    setNetwork("Reconnecting…", "offline");
    if (!peer.destroyed) peer.reconnect();
  });
  peer.on("error", (error) => {
    console.error(error);
    const friendly = error.type === "peer-unavailable"
      ? "That room is no longer available. Ask your friend for a fresh link."
      : "The call service hit a connection problem. Try again.";
    if (error.type === "peer-unavailable" && (mediaCall || callView.classList.contains("active"))) {
      finishCall(friendly);
      return;
    }
    toast(friendly, true);
    setNetwork("Connection issue", "offline");
  });
}

async function prepareAudio() {
  if (outgoingStream) return outgoingStream;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error("This browser is missing live voice support. Open the link in Chrome or Edge.");
  }

  rawStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1
    },
    video: false
  });

  audioContext = new AudioContextClass({ latencyHint: "interactive" });
  await audioContext.resume();
  const source = audioContext.createMediaStreamSource(rawStream);
  rawSourceNode = source;
  micGain = audioContext.createGain();
  const delay = audioContext.createDelay(4);
  lineGain = audioContext.createGain();
  analysisNode = audioContext.createAnalyser();
  mediaDestination = audioContext.createMediaStreamDestination();
  delay.delayTime.value = LINE_DELAY;
  micGain.gain.value = 1;
  lineGain.gain.value = 1;
  analysisNode.fftSize = 256;
  analysisNode.smoothingTimeConstant = 0.76;
  source.connect(micGain).connect(delay).connect(lineGain).connect(mediaDestination);
  source.connect(analysisNode);
  outgoingStream = mediaDestination.stream;

  soundBuffers = (await Promise.all(soundFiles.map(async (filename) => {
    try {
      const response = await fetch(`assets/${filename}`);
      if (!response.ok) throw new Error(`${response.status}`);
      return await audioContext.decodeAudioData(await response.arrayBuffer());
    } catch (error) {
      console.warn(`Could not load ${filename}`, error);
      return null;
    }
  }))).filter(Boolean);

  if (window.SpeechRecognition || window.webkitSpeechRecognition) {
    startRecognition();
  } else {
    startVoskRecognition();
  }
  return outgoingStream;
}

function startRecognition() {
  const RecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognitionWanted = true;
  handledRecognitionResults.clear();
  recognition = new RecognitionClass();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  recognition.maxAlternatives = 5;

  recognition.onresult = (event) => {
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      if (!mediaCall) continue;
      const result = event.results[index];
      let categories = [];
      for (let alternative = 0; alternative < result.length; alternative += 1) {
        const candidate = detectTriggerCategories(result[alternative]?.transcript);
        if (candidate.length > categories.length) categories = candidate;
      }
      processDetectedCategories(categories, `web-${index}`);
    }
  };
  recognition.onerror = (event) => {
    if (["not-allowed", "service-not-allowed"].includes(event.error)) recognitionWanted = false;
    if (event.error === "network") {
      recognitionWanted = false;
      try { recognition.abort(); } catch { /* already stopped */ }
      startVoskRecognition();
    }
    if (!["aborted", "no-speech"].includes(event.error)) console.warn("Voice recognition:", event.error);
  };
  recognition.onend = () => {
    if (recognitionWanted && outgoingStream) {
      clearTimeout(recognitionRestartTimer);
      recognitionRestartTimer = setTimeout(() => {
        handledRecognitionResults.clear();
        try { recognition.start(); } catch { /* already restarting */ }
      }, 350);
    }
  };
  try { recognition.start(); } catch { /* browser can briefly report already started */ }
}

function startVoskRecognition() {
  if (voskLoading || voskRecognizer || !rawSourceNode || !audioContext) return voskLoading;
  if (!window.Vosk) {
    console.warn("Local voice engine did not load.");
    return null;
  }

  setNetwork("Finishing voice setup…");
  voskLoading = (async () => {
    try {
      const model = await window.Vosk.createModel(VOSK_MODEL_URL, -1);
      if (!outgoingStream || !audioContext || !rawSourceNode) {
        model.terminate();
        return;
      }
      voskModel = model;
      voskRecognizer = new model.KaldiRecognizer(audioContext.sampleRate);
      voskUtteranceIndex = 0;

      voskRecognizer.on("partialresult", (message) => {
        const text = message?.result?.partial || "";
        processDetectedCategories(detectTriggerCategories(text), `vosk-${voskUtteranceIndex}`);
      });
      voskRecognizer.on("result", (message) => {
        const text = message?.result?.text || "";
        processDetectedCategories(detectTriggerCategories(text), `vosk-${voskUtteranceIndex}`);
        handledRecognitionResults.delete(`vosk-${voskUtteranceIndex}`);
        voskUtteranceIndex += 1;
      });

      voskProcessor = audioContext.createScriptProcessor(4096, 1, 1);
      voskSilentGain = audioContext.createGain();
      voskSilentGain.gain.value = 0;
      voskProcessor.onaudioprocess = (event) => {
        try { voskRecognizer?.acceptWaveform(event.inputBuffer); } catch (error) { console.debug(error); }
      };
      rawSourceNode.connect(voskProcessor);
      voskProcessor.connect(voskSilentGain).connect(audioContext.destination);
      setNetwork(callView.classList.contains("active") ? "Call connected" : "Room open");
    } catch (error) {
      console.error("Local voice setup failed", error);
      setNetwork("Open in Chrome or Edge", "offline");
      toast("This browser could not finish voice setup. Open the link in Chrome or Edge.", true);
    } finally {
      voskLoading = null;
    }
  })();
  return voskLoading;
}

function shuffledIndexes(length) {
  const indexes = Array.from({ length }, (_, index) => index);
  for (let i = indexes.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [indexes[i], indexes[j]] = [indexes[j], indexes[i]];
  }
  return indexes;
}

function nextSoundBuffer() {
  if (!soundBuffers.length) return null;
  if (!soundBag.length) soundBag = shuffledIndexes(soundBuffers.length);
  return soundBuffers[soundBag.pop()];
}

function rollAudio() {
  if (!audioContext || !lineGain || !outgoingStream) return;
  const buffer = nextSoundBuffer();
  if (!buffer) return;
  const now = audioContext.currentTime;
  const clipSeconds = Math.min(MAX_SOUND_SECONDS, buffer.duration);
  const startAt = Math.max(now + 0.06, now + LINE_DELAY - RECOGNITION_LATENCY_ALLOWANCE);
  const endAt = Math.max(startAt + Math.max(VOICE_CUT_SECONDS, clipSeconds), lineOpenAt);
  const gain = lineGain.gain;
  const alreadyCut = lineOpenAt > startAt;
  gain.cancelScheduledValues(Math.max(now, startAt - 0.02));
  if (!alreadyCut) {
    gain.setValueAtTime(gain.value, Math.max(now, startAt - 0.018));
    gain.linearRampToValueAtTime(0, startAt);
  } else {
    gain.setValueAtTime(0, Math.max(now, startAt - 0.018));
  }
  gain.setValueAtTime(0, endAt - 0.018);
  gain.linearRampToValueAtTime(1, endAt);
  lineOpenAt = endAt;

  const clip = audioContext.createBufferSource();
  const clipGain = audioContext.createGain();
  clip.buffer = buffer;
  clipGain.gain.value = 0.92;
  clip.connect(clipGain).connect(outgoingStreamDestination());
  clipGain.connect(audioContext.destination);
  clip.start(startAt);
  clip.stop(startAt + clipSeconds);
}

function outgoingStreamDestination() {
  return mediaDestination;
}

async function startRoom() {
  if (!peerReady) return;
  try {
    localStorage.setItem("dropline-name", currentName());
    setNetwork("Opening your room…");
    await prepareAudio();
    roomHostId = peer.id;
    acceptIncoming = true;
    inviteUrl = `${location.origin}${location.pathname}?call=${encodeURIComponent(peer.id)}`;
    $("#waitingAvatar").textContent = initials(currentName());
    $("#invitePreview").textContent = inviteUrl;
    setView(waitingView);
    setNetwork("Room open");
  } catch (error) {
    console.error(error);
    toast(error.message || "Microphone access is needed to start the room.", true);
    setNetwork("Ready for a private call");
  }
}

async function joinRoom(roomId) {
  roomId = cleanRoomId(roomId);
  if (!roomId) return toast("Paste a valid room link or code.", true);
  if (!peerReady) return toast("The calling service is still starting.", true);
  if (roomId === peer.id) return toast("Open that link on your friend's device.", true);
  try {
    localStorage.setItem("dropline-name", currentName());
    setNetwork("Joining room…");
    const stream = await prepareAudio();
    roomHostId = roomId;
    acceptIncoming = false;
    inviteUrl = `${location.origin}${location.pathname}?call=${encodeURIComponent(roomId)}`;
    dataConnection = peer.connect(roomId, { reliable: true, metadata: { name: currentName() } });
    wireDataConnection(dataConnection);
    mediaCall = peer.call(roomId, stream, { metadata: { name: currentName() } });
    wireMediaCall(mediaCall, "Friend");
    setCallView("Friend");
  } catch (error) {
    console.error(error);
    toast(error.message || "Could not join that room.", true);
    setNetwork("Ready for a private call");
  }
}

async function handleIncomingCall(call) {
  if (!acceptIncoming || mediaCall) {
    call.close();
    return;
  }
  try {
    const stream = await prepareAudio();
    mediaCall = call;
    const friendName = call.metadata?.name || "Friend";
    call.answer(stream);
    wireMediaCall(call, friendName);
    setCallView(friendName);
  } catch (error) {
    console.error(error);
    call.close();
    toast("Could not open the microphone for this call.", true);
  }
}

function handleDataConnection(connection) {
  if (dataConnection && dataConnection.open) {
    connection.close();
    return;
  }
  dataConnection = connection;
  wireDataConnection(connection);
}

function wireDataConnection(connection) {
  connection.on("open", () => {
    connection.send({ type: "profile", name: currentName() });
    sendLocalStats();
    if (connection.metadata?.name) setRemoteName(connection.metadata.name);
  });
  connection.on("data", (message) => {
    if (message?.type === "profile" && message.name) setRemoteName(message.name);
    if (message?.type === "swear-stats") {
      remoteSwearStats = safeSwearStats(message.stats);
      renderLeaderboard();
    }
  });
}

function wireMediaCall(call, fallbackName) {
  call.on("stream", (stream) => {
    remoteAudio.srcObject = stream;
    remoteAudio.play().catch(() => toast("Tap anywhere once to hear the call.", true));
    connectRemoteMeter(stream);
    $("#remoteState").textContent = "Connected";
    setNetwork("Call connected");
    if (!callStartedAt) beginTimer();
  });
  call.on("close", () => finishCall("Your friend left the call."));
  call.on("error", () => finishCall("The call connection ended."));
  setRemoteName(call.metadata?.name || fallbackName);
}

function setCallView(friendName) {
  resetLeaderboard();
  $("#localName").textContent = currentName();
  $("#localAvatar").textContent = initials(currentName());
  setRemoteName(friendName);
  setView(callView);
  setNetwork("Connecting audio…");
  startMeters();
}

function setRemoteName(name) {
  const safeName = String(name || "Friend").slice(0, 28);
  $("#remoteName").textContent = safeName;
  $("#remoteAvatar").textContent = initials(safeName);
  renderLeaderboard();
}

function connectRemoteMeter(stream) {
  if (!audioContext) return;
  const source = audioContext.createMediaStreamSource(stream);
  remoteAnalysisNode = audioContext.createAnalyser();
  remoteAnalysisNode.fftSize = 256;
  remoteAnalysisNode.smoothingTimeConstant = 0.78;
  source.connect(remoteAnalysisNode);
}

function buildWaveform(element) {
  if (element.childElementCount) return;
  for (let index = 0; index < 18; index += 1) element.append(document.createElement("i"));
}

function meterLevel(analyser) {
  if (!analyser) return 0;
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  return data.reduce((sum, value) => sum + value, 0) / data.length / 255;
}

function paintWave(element, level, offset = 0) {
  [...element.children].forEach((bar, index) => {
    const shaped = Math.max(.12, Math.sin((index + offset) * .9) * .22 + level * (0.7 + Math.random() * 1.4));
    bar.style.height = `${Math.min(20, 3 + shaped * 18)}px`;
  });
}

function startMeters() {
  const localWave = $("#localWave");
  const remoteWave = $("#remoteWave");
  buildWaveform(localWave);
  buildWaveform(remoteWave);
  cancelAnimationFrame(meterFrame);
  const loop = () => {
    const localLevel = muted ? 0 : meterLevel(analysisNode);
    const remoteLevel = meterLevel(remoteAnalysisNode);
    paintWave(localWave, localLevel, 0);
    paintWave(remoteWave, remoteLevel, 4);
    $("#localSpeaking").classList.toggle("active", localLevel > .08);
    $("#remoteSpeaking").classList.toggle("active", remoteLevel > .08);
    meterFrame = requestAnimationFrame(loop);
  };
  loop();
}

function beginTimer() {
  callStartedAt = Date.now();
  clearInterval(timerHandle);
  const update = () => {
    const seconds = Math.floor((Date.now() - callStartedAt) / 1000);
    const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
    $("#callTimer").textContent = `${minutes}:${(seconds % 60).toString().padStart(2, "0")}`;
  };
  update();
  timerHandle = setInterval(update, 1000);
}

function toggleMute() {
  if (!micGain || !audioContext) return;
  muted = !muted;
  micGain.gain.setTargetAtTime(muted ? 0 : 1, audioContext.currentTime, .015);
  $("#muteButton").classList.toggle("muted", muted);
  $("#localState").textContent = muted ? "Muted" : "Connected";
  toast(muted ? "Microphone muted" : "Microphone on");
}

function stopAudio() {
  recognitionWanted = false;
  clearTimeout(recognitionRestartTimer);
  if (recognition) {
    try { recognition.abort(); } catch { /* already stopped */ }
  }
  recognition = null;
  if (voskProcessor) {
    try { rawSourceNode?.disconnect(voskProcessor); } catch { /* already disconnected */ }
    try { voskProcessor.disconnect(); } catch { /* already disconnected */ }
  }
  try { voskSilentGain?.disconnect(); } catch { /* already disconnected */ }
  try { voskModel?.terminate(); } catch { /* already stopped */ }
  voskProcessor = null;
  voskSilentGain = null;
  voskRecognizer = null;
  voskModel = null;
  voskLoading = null;
  rawSourceNode = null;
  rawStream?.getTracks().forEach((track) => track.stop());
  outgoingStream?.getTracks().forEach((track) => track.stop());
  if (audioContext && audioContext.state !== "closed") audioContext.close();
  rawStream = null;
  outgoingStream = null;
  audioContext = null;
  micGain = null;
  lineGain = null;
  mediaDestination = null;
  analysisNode = null;
  remoteAnalysisNode = null;
  soundBuffers = [];
  soundBag = [];
  lineOpenAt = 0;
  handledRecognitionResults.clear();
}

function finishCall(message = "Call ended.") {
  acceptIncoming = false;
  const call = mediaCall;
  mediaCall = null;
  try { call?.close(); } catch { /* already closed */ }
  try { dataConnection?.close(); } catch { /* already closed */ }
  dataConnection = null;
  stopAudio();
  remoteAudio.srcObject = null;
  clearInterval(timerHandle);
  cancelAnimationFrame(meterFrame);
  callStartedAt = 0;
  muted = false;
  resetLeaderboard();
  setView(homeView);
  setNetwork("Ready for a private call");
  history.replaceState({}, "", location.pathname);
  toast(message);
}

async function copyInvite() {
  if (!inviteUrl) return;
  try {
    await navigator.clipboard.writeText(inviteUrl);
    toast("Invite link copied");
  } catch {
    toast("Could not copy automatically. Select the link instead.", true);
  }
}

displayName.value = localStorage.getItem("dropline-name") || "";
displayName.addEventListener("input", () => {
  primaryAction.disabled = !peerReady || !displayName.value.trim();
});

if (isInvite) {
  cardTitle.textContent = "Join your friend's room";
  primaryLabel.textContent = "Join voice room";
  roomInput.value = invitedRoom;
} else {
  cardTitle.textContent = "Start a voice room";
  primaryLabel.textContent = "Start a room";
}

primaryAction.addEventListener("click", () => isInvite ? joinRoom(invitedRoom) : startRoom());
roomForm.addEventListener("submit", (event) => {
  event.preventDefault();
  joinRoom(roomInput.value);
});
$("#copyInvite").addEventListener("click", copyInvite);
$("#callInviteButton").addEventListener("click", copyInvite);
$("#cancelWaiting").addEventListener("click", () => finishCall("Room closed."));
$("#endCallButton").addEventListener("click", () => finishCall("Call ended."));
$("#muteButton").addEventListener("click", toggleMute);
window.addEventListener("beforeunload", () => {
  try { mediaCall?.close(); } catch { /* page is closing */ }
  rawStream?.getTracks().forEach((track) => track.stop());
});

initializePeer();
