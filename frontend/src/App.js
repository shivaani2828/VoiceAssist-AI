import { useState, useRef, useEffect } from "react";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:8000";

const QUERY_ICONS = {
  balance:"💰", loan:"🏦", complaint:"⚠️", account:"👤",
  fd:"📈", upi:"📱", fraud:"🚨", kyc:"🪪", other:"❓"
};
const SENTIMENT_COLOR = { neutral:"#4A90E2", frustrated:"#F5A623", urgent:"#C8102E" };
const LANG_SCRIPT = {
  Hindi:"Devanagari • हिन्दी", Marathi:"Devanagari • मराठी",
  Tamil:"Tamil • தமிழ்", Telugu:"Telugu • తెలుగు",
  Bengali:"Bengali • বাংলা", English:"Latin • English",
};
const PROCESS_GUIDE = {
  loan:      { title:"🏦 Loan Process",      steps:["Ask for income proof (salary slip/ITR)","Verify Aadhaar + PAN card","Check CIBIL score (min 650)","Collect property/asset documents","Fill loan application form","Explain interest rates & EMI"] },
  account:   { title:"👤 Account Opening",   steps:["Collect Aadhaar (original + copy)","Collect PAN card","Take 2 passport size photos","Fill KYC form","Minimum deposit Rs 500","Issue passbook & debit card"] },
  kyc:       { title:"🪪 KYC Update",        steps:["Verify existing account details","Collect updated Aadhaar/Passport","Fill KYC update form","Biometric verification if required","Update mobile number","Confirm in 2 working days"] },
  fraud:     { title:"🚨 Fraud Protocol",    steps:["BLOCK card NOW: 1800-22-2244","Do NOT share OTP or PIN","Note unauthorized transaction details","File at branch + cybercrime.gov.in","Initiate chargeback","Refund after 7-10 day investigation"] },
  fd:        { title:"📈 FD Opening",        steps:["Verify account & mobile","Confirm amount (min Rs 1000)","Select tenure (7d–10yr)","Rates: 6.0–7.0% | Senior: +0.50%","Issue FD receipt/certificate"] },
  upi:       { title:"📱 UPI Setup",         steps:["Verify registered mobile","Download Union Bank app","Set UPI PIN (4 or 6 digit)","UPI ID: mobile@unionbank","Daily limit: Rs 1 lakh"] },
  balance:   { title:"💰 Balance Channels",  steps:["SMS BAL to 09223008586","Missed call: 09223008586","Net banking: unionbankofindia.co.in","Union Bank mobile app","ATM (free)","Passbook at branch"] },
  complaint: { title:"⚠️ Complaint Filing", steps:["Record complaint reference","Call 1800-22-2244 (24x7)","Email: cmscell@unionbankofindia.co.in","Submit at branch register","Escalate to RBI Ombudsman if needed","Resolution: 7-10 working days"] },
  other:     { title:"❓ General",           steps:["Greet in customer language","Identify requirement","Check account if needed","Provide information","Offer additional help","Log interaction"] }
};
const PAGES = ["Dashboard","Analytics","History","About"];
const fmt = s => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

const S = {
  bg:"#080C14", panel:"#0D1220", card:"#111827", border:"#1C2236", border2:"#2A3456",
  red:"#C8102E", redLight:"#ff6b7a", redBg:"rgba(200,16,46,0.15)", redBorder:"rgba(200,16,46,0.3)",
  orange:"#F5A623", orangeBg:"rgba(245,166,35,0.12)", orangeBorder:"rgba(245,166,35,0.35)",
  blue:"#4A90E2", green:"#27AE60", text:"#E8EAF0", muted:"#8A9BC0", dim:"#556080",
  font:"'Noto Sans',sans-serif", fontHead:"'Rajdhani',sans-serif",
};

export default function App() {
  const [recording,        setRecording]        = useState(false);
  const [agentRecording,   setAgentRecording]   = useState(false);
  const [loading,          setLoading]          = useState(false);
  const [agentLoading,     setAgentLoading]     = useState(false);
  const [sessions,         setSessions]         = useState([]);
  const [currentSession,   setCurrentSession]   = useState(null);
  const [chatHistory,      setChatHistory]      = useState([]);
  const [textInput,        setTextInput]        = useState("");
  const [waveform,         setWaveform]         = useState(Array(32).fill(4));
  const [agentWaveform,    setAgentWaveform]    = useState(Array(20).fill(4));
  const [activePage,       setActivePage]       = useState("Dashboard");
  const [notif,            setNotif]            = useState(null);
  const [agentResult,      setAgentResult]      = useState(null);
  const [agentMode,        setAgentMode]        = useState(false);
  const [callTimer,        setCallTimer]        = useState(0);
  const [timerActive,      setTimerActive]      = useState(false);
  const [sessionLang,      setSessionLang]      = useState("");
  const [aiTyping,         setAiTyping]         = useState(false);
  const [verifiedOnce,     setVerifiedOnce]     = useState(false);

  const mediaRef      = useRef(null);
  const agentMediaRef = useRef(null);
  const chunks        = useRef([]);
  const agentChunks   = useRef([]);
  const waveRef       = useRef(null);
  const agentWaveRef  = useRef(null);
  const chatEnd       = useRef(null);
  const abortRef      = useRef(null);
  const audioRef      = useRef(null);
  const timerRef      = useRef(null);

  // Customer waveform animation
  useEffect(() => {
    if (recording) {
      waveRef.current = setInterval(() =>
        setWaveform(Array(32).fill(0).map(() => Math.floor(Math.random()*44)+6)), 80);
    } else {
      clearInterval(waveRef.current);
      setWaveform(Array(32).fill(4));
    }
    return () => clearInterval(waveRef.current);
  }, [recording]);

  // Agent waveform animation
  useEffect(() => {
    if (agentRecording) {
      agentWaveRef.current = setInterval(() =>
        setAgentWaveform(Array(20).fill(0).map(() => Math.floor(Math.random()*30)+6)), 80);
    } else {
      clearInterval(agentWaveRef.current);
      setAgentWaveform(Array(20).fill(4));
    }
    return () => clearInterval(agentWaveRef.current);
  }, [agentRecording]);

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior:"smooth" }); }, [chatHistory, aiTyping]);

  useEffect(() => {
    if (timerActive) timerRef.current = setInterval(() => setCallTimer(t=>t+1), 1000);
    else clearInterval(timerRef.current);
    return () => clearInterval(timerRef.current);
  }, [timerActive]);

  const showNotif = (msg, type="success") => {
    setNotif({ msg, type });
    setTimeout(() => setNotif(null), 3500);
  };

  const stopAudio = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src=""; audioRef.current=null; }
  };
  const playAudio = url => {
    stopAudio();
    audioRef.current = new Audio(url);
    audioRef.current.play().catch(()=>{});
  };

  const resetSession = () => {
    stopAudio();
    setChatHistory([]); setCurrentSession(null); setAgentResult(null);
    setAgentMode(false); setSessionLang(""); setCallTimer(0); setTimerActive(false); setVerifiedOnce(false);
  };

  // ── Customer mic ──────────────────────────────────
  const startRecording = async () => {
    try {
      stopAudio();
      abortRef.current?.abort();
      const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
      mediaRef.current = new MediaRecorder(stream);
      chunks.current = [];
      mediaRef.current.ondataavailable = e => chunks.current.push(e.data);
      mediaRef.current.onstop = async () => {
        const blob = new Blob(chunks.current, { type:"audio/webm" });
        await sendVoice(blob);
      };
      mediaRef.current.start();
      setRecording(true);
      if (!timerActive) { setCallTimer(0); setTimerActive(true); }
    } catch { showNotif("Microphone permission denied!", "error"); }
  };

  const stopRecording = () => {
    mediaRef.current?.stop();
    mediaRef.current?.stream?.getTracks().forEach(t=>t.stop());
    setRecording(false); setLoading(true);
  };

  const sendVoice = async blob => {
    abortRef.current = new AbortController();
    const fd = new FormData();
    fd.append("file", blob, "audio.webm");
    fd.append("history", JSON.stringify(chatHistory));
    fd.append("language", sessionLang);
    try {
      const res  = await fetch(`${API_BASE}/voice-chat`, { method:"POST", body:fd, signal:abortRef.current.signal });
      const data = await res.json();
      if (data.error) { showNotif(data.error, "error"); setLoading(false); return; }
      processResponse(data.transcription||"", data);
    } catch(err) {
      if (err.name==="AbortError") { setLoading(false); return; }
      showNotif("Backend connection failed!", "error"); setLoading(false);
    }
  };

  // ── Customer text ─────────────────────────────────
  const sendText = async () => {
    if (!textInput.trim()) return;
    const userText = textInput.trim();
    setTextInput("");
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    stopAudio();
    const custMsg = { role:"customer", text:userText, timestamp:new Date().toLocaleTimeString() };
    const newHist = [...chatHistory, custMsg];
    setChatHistory(newHist);
    setLoading(true); setAiTyping(true);
    if (!timerActive) { setCallTimer(0); setTimerActive(true); }
    try {
      const res  = await fetch(`${API_BASE}/chat`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ message:userText, history:chatHistory, language:sessionLang }),
        signal:abortRef.current.signal
      });
      const data = await res.json();
      processResponse(userText, data, newHist);
    } catch(err) {
      if (err.name==="AbortError") { setLoading(false); setAiTyping(false); return; }
      showNotif("Backend error!", "error"); setLoading(false); setAiTyping(false);
    }
  };

  const processResponse = (custText, data, existingHist) => {
    setAiTyping(false);
    const audioUrl = data.audio_url ? API_BASE+data.audio_url : null;
    const custMsg = {
      role:"customer", text:custText,
      english_translation:data.english_translation,
      timestamp:new Date().toLocaleTimeString()
    };
    const aiMsg = {
      role:"ai", text:data.ai_reply||"",
      ai_reply_english:data.ai_reply_english||data.ai_reply||"",
      audio_url:audioUrl,
      timestamp:new Date().toLocaleTimeString()
    };
    const prev = existingHist || chatHistory;
    const last = prev[prev.length-1];
    let updated;
    if (last && last.role==="customer" && last.text===custText) {
      updated = [...prev, aiMsg];
    } else {
      updated = [...prev, custMsg, aiMsg];
    }
    setChatHistory(updated);
    if (!sessionLang && data.language) setSessionLang(data.language);
    if (audioUrl) playAudio(audioUrl);

    const dbgState = data.debug_state;
    if (["post_verified","verified","mother_asked"].includes(dbgState) ||
        (dbgState==="greeted" && updated.some(m=>m.role==="ai" && m.text?.includes("45,230")))) {
      setVerifiedOnce(true);
    }

    const shouldTakeOver = data.agent_takeover === true;
    const sess = {
      id:          currentSession?.id || Date.now(),
      startTime:   currentSession?.startTime || new Date().toLocaleTimeString(),
      date:        new Date().toLocaleDateString(),
      complexity:  data.complexity,
      query_type:  data.query_type,
      language:    data.language || sessionLang,
      sentiment:   data.sentiment,
      agent_suggestion: data.agent_suggestion || currentSession?.agent_suggestion,
      lang_confidence:  data.lang_confidence,
      tts_engine:  data.tts_engine,
      duration:    callTimer,
      history:     updated,
      reason:      data.reason,
      debug_state: dbgState,
    };
    setCurrentSession(sess);

    if (shouldTakeOver) {
      setAgentMode(true);
      setAgentResult(null);
      showNotif("🚨 Complex query — Agent takeover!", "error");
    } else {
      if (agentMode && data.complexity!=="complex") setAgentMode(false);
      showNotif("✅ AI handling conversation");
    }
    setLoading(false);
  };

  const endSession = () => {
    if (!currentSession || chatHistory.length===0) return;
    setTimerActive(false);
    setSessions(prev => [{ ...currentSession, duration:callTimer, history:chatHistory }, ...prev]);
    showNotif("Session saved!");
    resetSession();
  };

  // ── Agent VOICE reply ─────────────────────────────
  const startAgentRecording = async () => {
    try {
      stopAudio();
      const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
      agentMediaRef.current = new MediaRecorder(stream);
      agentChunks.current = [];
      agentMediaRef.current.ondataavailable = e => agentChunks.current.push(e.data);
      agentMediaRef.current.onstop = async () => {
        const blob = new Blob(agentChunks.current, { type:"audio/webm" });
        await sendAgentVoice(blob);
      };
      agentMediaRef.current.start();
      setAgentRecording(true);
    } catch { showNotif("Microphone permission denied!", "error"); }
  };

  const stopAgentRecording = () => {
    agentMediaRef.current?.stop();
    agentMediaRef.current?.stream?.getTracks().forEach(t=>t.stop());
    setAgentRecording(false);
    setAgentLoading(true);
  };

  const sendAgentVoice = async blob => {
    if (!currentSession) { setAgentLoading(false); return; }
    const lang = currentSession.language || sessionLang;
    const fd = new FormData();
    fd.append("file", blob, "agent_audio.webm");
    fd.append("language", lang);
    try {
      const res  = await fetch(`${API_BASE}/staff-voice-reply`, { method:"POST", body:fd });
      const data = await res.json();
      if (data.error) { showNotif(data.error, "error"); setAgentLoading(false); return; }

      setAgentResult(data);
      const agentMsg = {
        role:"agent",
        text:data.translated || data.english_text,
        english_text:data.english_text,
        audio_url:data.audio_url ? API_BASE+data.audio_url : null,
        timestamp:new Date().toLocaleTimeString()
      };
      const updated = [...chatHistory, agentMsg];
      setChatHistory(updated);
      setCurrentSession(prev=>({...prev, history:updated}));
      if (data.audio_url) playAudio(API_BASE+data.audio_url);
      showNotif(`✅ Agent reply spoken in ${lang}`);
    } catch {
      showNotif("Agent voice reply failed!", "error");
    }
    setAgentLoading(false);
  };

  const exportSession = sess => {
    const hist = sess.history||[];
    const convo = hist.map(m => {
      if (m.role==="customer") {
        const eng = m.english_translation && m.english_translation!==m.text
          ? `\n  [English: ${m.english_translation}]` : "";
        return `CUSTOMER (${sess.language}):\n  ${m.text}${eng}`;
      }
      if (m.role==="agent")
        return `AGENT (English→${sess.language}):\n  [English] ${m.english_text}\n  [${sess.language}] ${m.text}`;
      const eng = m.ai_reply_english && m.ai_reply_english!==m.text
        ? `\n  [English: ${m.ai_reply_english}]` : "";
      return `AI ASSISTANT (${sess.language}):\n  ${m.text}${eng}`;
    }).join("\n\n");

    const content = `VoiceAssist AI — Branch Interaction Record\n${"=".repeat(55)}\nDate: ${sess.date} | Start: ${sess.startTime} | Duration: ${fmt(sess.duration||0)}\nLanguage: ${sess.language}\nQuery: ${sess.query_type} | Complexity: ${sess.complexity} | Sentiment: ${sess.sentiment}\n\n${"─".repeat(55)}\nTRANSCRIPT\n${"─".repeat(55)}\n${convo}\n\n${"─".repeat(55)}\nSTAFF NOTES\n${"─".repeat(55)}\n${sess.agent_suggestion||"N/A"}\n\n${"=".repeat(55)}\nGenerated by VoiceAssist AI v2.5 | Union Bank | FinovateX`;
    const blob = new Blob([content],{type:"text/plain"});
    const a = document.createElement("a");
    a.href=URL.createObjectURL(blob); a.download=`session_${sess.id?.toString().slice(-6)}.txt`; a.click();
    showNotif("Exported!");
  };

  // analytics
  const resRate   = sessions.length>0 ? Math.round(sessions.filter(s=>s.complexity==="simple").length/sessions.length*100) : 0;
  const avgDur    = sessions.length>0 ? Math.round(sessions.reduce((a,s)=>a+(s.duration||0),0)/sessions.length) : 0;
  const qtCounts  = sessions.reduce((a,s)=>({...a,[s.query_type]:(a[s.query_type]||0)+1}),{});
  const lgCounts  = sessions.reduce((a,s)=>({...a,[s.language]:(a[s.language]||0)+1}),{});
  const guide     = currentSession ? PROCESS_GUIDE[currentSession.query_type]||PROCESS_GUIDE.other : null;
  const lastCust  = [...chatHistory].reverse().find(m=>m.role==="customer");
  const lastAI    = [...chatHistory].reverse().find(m=>m.role==="ai");

  const aiTexts   = chatHistory.filter(m=>m.role==="ai").map(m=>m.text.toLowerCase());
  const flow = {
    greeted:     chatHistory.some(m=>m.role==="ai"),
    nameAsked:   aiTexts.some(t=>["नाव काय","नाम क्या","your name","full name"].some(k=>t.includes(k))),
    motherAsked: aiTexts.some(t=>["आईचे","माँ का","mother"].some(k=>t.includes(k))),
    balGiven:    aiTexts.some(t=>t.includes("45,230")),
  };

  return (
    <div style={{display:"flex",minHeight:"100vh",background:S.bg,color:S.text,fontFamily:S.font}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Noto+Sans:wght@300;400;500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#080C14}::-webkit-scrollbar-thumb{background:#C8102E;border-radius:2px}
        @keyframes pulse-ring{0%{transform:scale(.95);box-shadow:0 0 0 0 rgba(200,16,46,.7)}70%{transform:scale(1);box-shadow:0 0 0 16px rgba(200,16,46,0)}100%{transform:scale(.95);box-shadow:0 0 0 0 rgba(200,16,46,0)}}
        @keyframes agent-pulse-ring{0%{transform:scale(.95);box-shadow:0 0 0 0 rgba(245,166,35,.7)}70%{transform:scale(1);box-shadow:0 0 0 12px rgba(245,166,35,0)}100%{transform:scale(.95);box-shadow:0 0 0 0 rgba(245,166,35,0)}}
        @keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes bubbleIn{from{opacity:0;transform:scale(.95) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}
        @keyframes typing{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}
        @keyframes agentPulse{0%,100%{box-shadow:0 0 0 0 rgba(245,166,35,.5)}50%{box-shadow:0 0 12px 4px rgba(245,166,35,.3)}}
        @keyframes stepIn{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}
        @keyframes mic-glow{0%,100%{box-shadow:0 0 8px rgba(245,166,35,.4)}50%{box-shadow:0 0 22px rgba(245,166,35,.8)}}
        .fade-in{animation:fadeIn .3s ease forwards}
        .mic-active{animation:pulse-ring 1.5s ease infinite}
        .agent-mic-active{animation:agent-pulse-ring 1.5s ease infinite}
        .bubble{animation:bubbleIn .25s ease forwards}
        .step-item{animation:stepIn .3s ease forwards;opacity:0}
        .agent-panel{animation:agentPulse 2s ease infinite}
        .loading-bar{width:180px;height:3px;background:#1C2236;border-radius:2px;overflow:hidden}
        .loading-fill{height:100%;background:linear-gradient(90deg,#C8102E,#FF4D6D,#C8102E);background-size:200% auto;border-radius:2px;animation:shimmer 1.2s linear infinite}
        .dot-typing span{display:inline-block;width:5px;height:5px;border-radius:50%;background:#C8102E;animation:typing 1.2s ease infinite;margin:0 2px}
        .dot-typing span:nth-child(2){animation-delay:.2s}.dot-typing span:nth-child(3){animation-delay:.4s}
        input::placeholder,textarea::placeholder{color:#3A4460}
        textarea{resize:none}
      `}</style>

      {/* NOTIFICATION */}
      {notif && (
        <div className="fade-in" style={{position:"fixed",top:16,right:16,zIndex:9999,
          background:notif.type==="error"?"#C8102E":S.panel,
          border:`1px solid ${notif.type==="error"?"#ff4d6d":S.red}`,
          padding:"10px 18px",borderRadius:10,fontSize:12,fontWeight:600,color:"#fff",
          boxShadow:"0 8px 32px rgba(0,0,0,.5)"}}>
          {notif.msg}
        </div>
      )}

      {/* SIDEBAR */}
      <div style={{width:210,minHeight:"100vh",position:"fixed",left:0,top:0,zIndex:100,
        background:`linear-gradient(180deg,${S.panel},${S.bg})`,borderRight:`1px solid ${S.border}`,
        display:"flex",flexDirection:"column"}}>
        <div style={{padding:"16px 12px",borderBottom:`1px solid ${S.border}`}}>
          <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:8}}>
            <div style={{width:34,height:34,borderRadius:8,background:"linear-gradient(135deg,#C8102E,#8B0000)",
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,
              boxShadow:"0 4px 12px rgba(200,16,46,.4)"}}>🏦</div>
            <div>
              <div style={{fontSize:12,fontWeight:700,color:"#fff",fontFamily:S.fontHead}}>VoiceAssist AI</div>
              <div style={{fontSize:8,color:S.dim,letterSpacing:1,textTransform:"uppercase"}}>Union Bank of India</div>
            </div>
          </div>
          <div style={{background:S.redBg,border:`1px solid ${S.redBorder}`,padding:"2px 8px",
            borderRadius:20,fontSize:8,color:S.redLight,fontWeight:700,letterSpacing:1,width:"fit-content"}}>
            PS6 | iDEA 2.0 | FinovateX
          </div>
        </div>

        <div style={{padding:"8px 6px"}}>
          {PAGES.map(p=>(
            <button key={p} onClick={()=>setActivePage(p)} style={{width:"100%",padding:"8px 11px",
              borderRadius:8,border:"none",cursor:"pointer",marginBottom:2,
              background:activePage===p?"linear-gradient(135deg,rgba(200,16,46,.2),rgba(200,16,46,.05))":"transparent",
              borderLeft:`3px solid ${activePage===p?S.red:"transparent"}`,
              color:activePage===p?"#fff":S.dim,fontSize:12,
              fontWeight:activePage===p?600:400,textAlign:"left",
              display:"flex",alignItems:"center",gap:9,transition:"all .2s"}}>
              <span>{p==="Dashboard"?"📊":p==="Analytics"?"📈":p==="History"?"🕒":"ℹ️"}</span>{p}
            </button>
          ))}
        </div>

        <div style={{padding:"0 9px",marginTop:4}}>
          <div style={{background:"#0D1627",borderRadius:10,padding:11,border:`1px solid ${S.border}`}}>
            <div style={{fontSize:8,color:S.dim,letterSpacing:1,marginBottom:8}}>LIVE SESSION</div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <span style={{fontSize:8,color:S.dim}}>Timer</span>
              <span style={{fontSize:18,fontWeight:700,color:timerActive?S.red:S.blue,fontFamily:S.fontHead}}>{fmt(callTimer)}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
              {[{l:"Total",v:sessions.length,c:S.blue},{l:"AI",v:sessions.filter(s=>s.complexity==="simple").length,c:S.green},{l:"Agent",v:sessions.filter(s=>s.complexity==="complex").length,c:S.red}].map(st=>(
                <div key={st.l} style={{textAlign:"center"}}>
                  <div style={{fontSize:18,fontWeight:700,color:st.c,fontFamily:S.fontHead}}>{st.v}</div>
                  <div style={{fontSize:8,color:S.dim}}>{st.l}</div>
                </div>
              ))}
            </div>
            <div style={{fontSize:8,color:S.dim,marginBottom:3}}>AI Resolution Rate</div>
            <div style={{height:4,background:S.border,borderRadius:3,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${resRate}%`,background:"linear-gradient(90deg,#27AE60,#2ECC71)",transition:"width .5s"}} />
            </div>
            <div style={{fontSize:10,color:S.green,textAlign:"right",marginTop:3,fontWeight:700}}>{resRate}%</div>
          </div>
        </div>

        <div style={{padding:9,marginTop:"auto",borderTop:`1px solid ${S.border}`}}>
          <div style={{fontSize:8,color:S.dim,letterSpacing:1,marginBottom:5}}>LANGUAGES</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
            {["Hindi","Marathi","Tamil","Telugu","English","Bengali"].map(l=>(
              <span key={l} style={{background:currentSession?.language===l?S.redBg:S.border,
                border:`1px solid ${currentSession?.language===l?S.red:S.border2}`,
                padding:"2px 6px",borderRadius:20,fontSize:8,
                color:currentSession?.language===l?S.redLight:S.muted,transition:"all .3s"}}>{l}</span>
            ))}
          </div>
          {verifiedOnce && (
            <div style={{marginTop:8,background:"rgba(39,174,96,.1)",border:"1px solid #27AE6044",
              borderRadius:6,padding:"3px 8px",fontSize:9,color:S.green,textAlign:"center"}}>
              ✓ Customer verified
            </div>
          )}
        </div>
      </div>

      {/* MAIN */}
      <div style={{marginLeft:210,flex:1,padding:16,minHeight:"100vh"}}>

        {/* TOP BAR */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
          background:agentMode?S.orangeBg:S.panel,borderRadius:12,padding:"11px 16px",
          border:`1px solid ${agentMode?S.orangeBorder:S.border}`,marginBottom:14,transition:"all .4s"}}>
          <div style={{display:"flex",alignItems:"center",gap:9}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:agentMode?S.orange:S.green,
              boxShadow:`0 0 7px ${agentMode?S.orange:S.green}`}}/>
            <span style={{fontSize:11,color:agentMode?S.orange:S.muted,fontFamily:S.fontHead,fontWeight:agentMode?700:400}}>
              {agentMode?"🚨 AGENT MODE — Speak to customer via mic":"Whisper STT • LLaMA 3.3 70B • Sarvam TTS • RAG Active"}
            </span>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {currentSession?.debug_state && (
              <div style={{background:"rgba(74,144,226,.08)",border:"1px solid rgba(74,144,226,.2)",
                padding:"2px 8px",borderRadius:20,fontSize:8,color:S.blue,fontFamily:S.fontHead}}>
                {currentSession.debug_state}
              </div>
            )}
            {currentSession?.tts_engine && (
              <div style={{background:currentSession.tts_engine==="gtts"?"rgba(245,166,35,.15)":"rgba(39,174,96,.1)",
                border:`1px solid ${currentSession.tts_engine==="gtts"?"#F5A62344":"#27AE6044"}`,
                padding:"2px 8px",borderRadius:20,fontSize:8,
                color:currentSession.tts_engine==="gtts"?S.orange:S.green,fontFamily:S.fontHead,fontWeight:700}}>
                🔊 {currentSession.tts_engine==="gtts"?"gTTS (fallback)":"Sarvam AI"}
              </div>
            )}
            {currentSession && (
              <div style={{background:agentMode?S.orangeBg:S.redBg,
                border:`1px solid ${agentMode?S.orangeBorder:S.redBorder}`,
                padding:"3px 10px",borderRadius:20,fontSize:10,
                color:agentMode?S.orange:S.redLight,fontFamily:S.fontHead,fontWeight:700}}>
                {currentSession.language} • {currentSession.query_type}
              </div>
            )}
            <div style={{fontSize:11,color:S.dim}}>{new Date().toLocaleDateString("en-IN",{weekday:"short",month:"short",day:"numeric"})}</div>
          </div>
        </div>

        {/* DASHBOARD */}
        {activePage==="Dashboard" && (
          <div className="fade-in" style={{display:"flex",gap:14}}>

            {/* LEFT */}
            <div style={{flex:1,minWidth:340,display:"flex",flexDirection:"column",gap:12}}>

              {/* Customer Input Panel */}
              <div style={{background:`linear-gradient(135deg,${S.panel},${S.card})`,borderRadius:16,
                padding:20,border:`1px solid ${S.border}`,display:"flex",flexDirection:"column",
                alignItems:"center",gap:12,position:"relative",overflow:"hidden"}}>
                <div style={{position:"absolute",top:-30,right:-30,width:120,height:120,borderRadius:"50%",
                  background:"radial-gradient(circle,rgba(200,16,46,.08),transparent 70%)",pointerEvents:"none"}}/>
                <div style={{fontSize:9,color:S.dim,letterSpacing:2,fontFamily:S.fontHead,alignSelf:"flex-start"}}>
                  CUSTOMER VOICE / TEXT INPUT
                </div>

                {chatHistory.length===0 && (
                  <div style={{width:"100%",background:"rgba(39,174,96,.08)",border:"1px solid rgba(39,174,96,.25)",
                    borderRadius:10,padding:"9px 12px"}}>
                    <div style={{fontSize:8,color:S.green,letterSpacing:1,marginBottom:3,fontFamily:S.fontHead}}>FLOW</div>
                    <div style={{fontSize:10,color:S.muted,lineHeight:1.8}}>
                      1️⃣ Customer speaks → <strong style={{color:"#fff"}}>AI greets in their language</strong><br/>
                      2️⃣ Balance request → AI asks <strong style={{color:"#fff"}}>name → mother's name → gives balance</strong><br/>
                      3️⃣ Complex query → <strong style={{color:S.orange}}>Agent Takeover</strong> — agent speaks in English, customer hears native voice<br/>
                      4️⃣ After verification → all follow-ups handled, <strong style={{color:"#fff"}}>no re-verification</strong>
                    </div>
                  </div>
                )}

                {/* Waveform */}
                <div style={{display:"flex",alignItems:"center",gap:2,height:44}}>
                  {waveform.map((h,i)=>(
                    <div key={i} style={{width:4,borderRadius:3,height:h,
                      background:recording?`hsl(${348+(i%3)*8},80%,${50+(i%5)*5}%)`:S.border,
                      transition:recording?"height .08s":"height .5s"}}/>
                  ))}
                </div>

                <button className={recording?"mic-active":""} onClick={recording?stopRecording:startRecording}
                  style={{width:76,height:76,borderRadius:"50%",border:"none",fontSize:28,cursor:"pointer",
                    background:recording?"linear-gradient(135deg,#C8102E,#8B0000)":"linear-gradient(135deg,#1A2744,#0D1627)",
                    boxShadow:recording?"0 0 24px rgba(200,16,46,.6)":`0 0 0 2px ${S.red},0 6px 18px rgba(0,0,0,.4)`,
                    transition:"all .3s"}}>
                  {recording?"⏹":"🎙️"}
                </button>

                <div style={{fontSize:11,color:S.muted}}>
                  {recording?`🔴 Recording — ${fmt(callTimer)}`:loading?"⏳ Processing...":"Tap mic to speak • press again to stop"}
                </div>
                {loading && <div><div className="loading-bar"><div className="loading-fill"/></div></div>}

                <div style={{display:"flex",gap:6,width:"100%"}}>
                  <input style={{flex:1,background:"#0D1627",border:`1px solid ${S.border}`,borderRadius:8,
                    color:S.text,padding:"8px 12px",fontSize:12,outline:"none"}}
                    placeholder="Type in any language (मराठी / हिंदी / English / தமிழ்)..."
                    value={textInput} onChange={e=>setTextInput(e.target.value)}
                    onKeyDown={e=>e.key==="Enter"&&sendText()}
                    onFocus={e=>e.target.style.borderColor=S.red}
                    onBlur={e=>e.target.style.borderColor=S.border}/>
                  <button onClick={sendText} style={{background:"linear-gradient(135deg,#C8102E,#8B0000)",border:"none",
                    color:"#fff",padding:"8px 14px",borderRadius:8,cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:S.fontHead}}>
                    SEND
                  </button>
                </div>

                <div style={{display:"flex",gap:7,width:"100%"}}>
                  <button onClick={resetSession} style={{flex:1,background:S.border,border:`1px solid ${S.border2}`,
                    color:S.muted,padding:6,borderRadius:7,cursor:"pointer",fontSize:10,fontFamily:S.fontHead}}>
                    New Session
                  </button>
                  {chatHistory.length>0 && (
                    <button onClick={endSession} style={{flex:1,background:"rgba(39,174,96,.15)",
                      border:"1px solid #27AE6044",color:S.green,padding:6,borderRadius:7,
                      cursor:"pointer",fontSize:10,fontFamily:S.fontHead,fontWeight:700}}>
                      End & Save
                    </button>
                  )}
                </div>
              </div>

              {/* Flow tracker */}
              {chatHistory.length>0 && (
                <div style={{background:"#0A1220",borderRadius:10,padding:"10px 14px",
                  border:`1px solid ${S.border}`,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                  {[
                    {n:1,l:"Greeted",done:flow.greeted,c:S.green},
                    {n:2,l:"Name Asked",done:flow.nameAsked,c:S.blue},
                    {n:3,l:"Mother's Name",done:flow.motherAsked,c:"#9B59B6"},
                    {n:4,l:"Balance Given",done:flow.balGiven,c:S.orange},
                  ].map((s,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:5}}>
                      <div style={{width:18,height:18,borderRadius:"50%",
                        background:s.done?s.c:`${s.c}22`,border:`1px solid ${s.c}`,
                        display:"flex",alignItems:"center",justifyContent:"center",
                        fontSize:8,color:s.done?"#fff":s.c,fontWeight:700}}>
                        {s.done?"✓":s.n}
                      </div>
                      <span style={{fontSize:9,color:s.done?s.c:S.dim}}>{s.l}</span>
                      {i<3 && <span style={{color:S.border2,fontSize:10}}>→</span>}
                    </div>
                  ))}
                  {verifiedOnce && (
                    <span style={{marginLeft:"auto",fontSize:9,color:S.green,
                      background:"rgba(39,174,96,.1)",border:"1px solid #27AE6044",
                      padding:"2px 8px",borderRadius:20}}>
                      ✓ One-time verification done
                    </span>
                  )}
                </div>
              )}

              {/* Chat thread */}
              {chatHistory.length>0 && (
                <div style={{background:S.panel,borderRadius:14,border:`1px solid ${S.border}`,overflow:"hidden"}}>
                  <div style={{padding:"10px 14px",borderBottom:`1px solid ${S.border}`,
                    display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{fontSize:9,color:S.blue,letterSpacing:2,fontFamily:S.fontHead}}>LIVE TRANSCRIPT</div>
                    {currentSession && (
                      <button onClick={()=>exportSession({...currentSession,history:chatHistory})}
                        style={{background:"none",border:"none",color:S.dim,cursor:"pointer",fontSize:10}}>Export</button>
                    )}
                  </div>
                  <div style={{maxHeight:420,overflowY:"auto",padding:12}}>
                    {chatHistory.map((msg,i)=>(
                      <div key={i} className="bubble" style={{display:"flex",flexDirection:"column",
                        alignItems:msg.role==="customer"?"flex-start":"flex-end",
                        marginBottom:10,animationDelay:`${i*.04}s`}}>

                        <div style={{fontSize:8,color:S.dim,marginBottom:3,display:"flex",gap:6,alignItems:"center"}}>
                          {msg.role==="customer" && <><span style={{color:S.blue}}>Customer</span><span>{currentSession?.language}</span><span>{msg.timestamp}</span></>}
                          {msg.role==="ai"       && <><span>{msg.timestamp}</span><span style={{color:S.green}}>🤖 AI</span></>}
                          {msg.role==="agent"    && <><span>{msg.timestamp}</span><span style={{color:S.orange,fontWeight:700}}>🎤 Agent</span></>}
                        </div>

                        {msg.role==="customer" && (
                          <div style={{maxWidth:"85%",background:"linear-gradient(135deg,#1A2744,#1C2A4A)",
                            border:"1px solid #2A3A5A",borderRadius:"14px 14px 14px 4px",padding:"10px 13px"}}>
                            <div style={{fontSize:14,color:"#D0D8F0",lineHeight:1.6}}>{msg.text}</div>
                            {msg.english_translation && msg.english_translation!==msg.text && (
                              <div style={{marginTop:6,background:"rgba(74,144,226,.06)",borderRadius:6,
                                padding:"5px 8px",borderTop:"1px solid #2A3A5A"}}>
                                <div style={{fontSize:8,color:"#4A90E2",letterSpacing:1,marginBottom:2}}>STAFF READS (English)</div>
                                <div style={{fontSize:11,color:"#9AB8D0",fontStyle:"italic"}}>{msg.english_translation}</div>
                              </div>
                            )}
                          </div>
                        )}

                        {msg.role==="ai" && (
                          <div style={{maxWidth:"85%",background:"linear-gradient(135deg,#0A1F10,#0D1A12)",
                            border:"1px solid #1E4D2A",borderRadius:"14px 14px 4px 14px",padding:"10px 13px"}}>
                            <div style={{fontSize:13,color:"#D0D8F0",lineHeight:1.6}}>{msg.text}</div>
                            {msg.ai_reply_english && msg.ai_reply_english!==msg.text && (
                              <div style={{marginTop:6,background:"rgba(39,174,96,.06)",borderRadius:6,
                                padding:"5px 8px",borderTop:"1px solid #1E4D2A"}}>
                                <div style={{fontSize:8,color:S.green,letterSpacing:1,marginBottom:2}}>AI SAID (English)</div>
                                <div style={{fontSize:11,color:"#9AB8D0",fontStyle:"italic"}}>{msg.ai_reply_english}</div>
                              </div>
                            )}
                            {msg.audio_url && (
                              <button onClick={()=>playAudio(msg.audio_url)}
                                style={{marginTop:6,background:"rgba(39,174,96,.15)",border:"1px solid #27AE6044",
                                  color:S.green,padding:"3px 10px",borderRadius:6,cursor:"pointer",fontSize:9,fontFamily:S.fontHead}}>
                                🔊 Replay
                              </button>
                            )}
                          </div>
                        )}

                        {msg.role==="agent" && (
                          <div style={{maxWidth:"85%",background:"linear-gradient(135deg,#1F1A08,#251E0A)",
                            border:`1px solid ${S.orangeBorder}`,borderRadius:"14px 14px 4px 14px",padding:"10px 13px"}}>
                            <div style={{fontSize:8,color:S.orange,letterSpacing:1,marginBottom:3}}>AGENT SAID (English)</div>
                            <div style={{fontSize:11,color:"#D4B87A",marginBottom:8,fontStyle:"italic"}}>{msg.english_text}</div>
                            <div style={{fontSize:8,color:S.green,letterSpacing:1,marginBottom:3}}>CUSTOMER HEARD ({currentSession?.language})</div>
                            <div style={{fontSize:14,color:"#C8E6C9",lineHeight:1.6}}>{msg.text}</div>
                            {msg.audio_url && (
                              <button onClick={()=>playAudio(msg.audio_url)}
                                style={{marginTop:6,background:S.orangeBg,border:`1px solid ${S.orangeBorder}`,
                                  color:S.orange,padding:"3px 10px",borderRadius:6,cursor:"pointer",fontSize:9,fontFamily:S.fontHead}}>
                                🔊 Replay
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                    {aiTyping && (
                      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
                        <div style={{background:"linear-gradient(135deg,#0A1F10,#0D1A12)",
                          border:"1px solid #1E4D2A",borderRadius:"14px 14px 4px 14px",padding:"10px 14px"}}>
                          <div className="dot-typing"><span/><span/><span/></div>
                        </div>
                      </div>
                    )}
                    <div ref={chatEnd}/>
                  </div>
                </div>
              )}

              {/* Session analysis */}
              {currentSession && (
                <div style={{background:S.panel,borderRadius:12,padding:12,border:`1px solid ${S.border}`}}>
                  <div style={{fontSize:9,color:S.blue,letterSpacing:1.5,marginBottom:8,fontFamily:S.fontHead}}>SESSION ANALYSIS</div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                    <div>
                      <div style={{fontSize:13,color:"#fff",fontWeight:700}}>{currentSession.language}</div>
                      <div style={{fontSize:9,color:S.dim}}>{LANG_SCRIPT[currentSession.language]}</div>
                    </div>
                    <div style={{display:"flex",gap:5,flexWrap:"wrap",justifyContent:"flex-end"}}>
                      {[
                        {l:`${QUERY_ICONS[currentSession.query_type]} ${currentSession.query_type?.toUpperCase()}`,c:S.blue},
                        {l:currentSession.sentiment,c:SENTIMENT_COLOR[currentSession.sentiment]||S.blue},
                        {l:currentSession.complexity==="complex"?"AGENT":"AI OK",c:currentSession.complexity==="complex"?S.red:S.green}
                      ].map((t,i)=>(
                        <span key={i} style={{background:`${t.c}22`,border:`1px solid ${t.c}44`,
                          color:t.c,padding:"2px 8px",borderRadius:20,fontSize:8,fontWeight:700,fontFamily:S.fontHead}}>{t.l}</span>
                      ))}
                    </div>
                  </div>
                  {currentSession.agent_suggestion && (
                    <div style={{background:"#0D1627",borderRadius:8,padding:"8px 10px",fontSize:10,color:S.muted,lineHeight:1.5}}>
                      <span style={{color:S.dim,fontSize:8,display:"block",marginBottom:3}}>STAFF GUIDANCE</span>
                      {currentSession.agent_suggestion}
                    </div>
                  )}
                  <div style={{marginTop:8}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                      <span style={{fontSize:9,color:S.dim}}>Lang Confidence</span>
                      <span style={{fontSize:9,color:S.blue,fontWeight:700}}>{Math.round((currentSession.lang_confidence||.9)*100)}%</span>
                    </div>
                    <div style={{height:3,background:S.border,borderRadius:2,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${(currentSession.lang_confidence||.9)*100}%`,background:S.blue,transition:"width .8s"}}/>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT PANEL */}
            <div style={{width:310,display:"flex",flexDirection:"column",gap:12}}>

              {/* ═══ AGENT TAKEOVER PANEL — VOICE ONLY ═══ */}
              {agentMode && currentSession && (
                <div className="agent-panel fade-in" style={{background:S.orangeBg,
                  border:`2px solid ${S.orangeBorder}`,borderRadius:16,padding:16}}>

                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:S.orange,boxShadow:`0 0 8px ${S.orange}`}}/>
                    <div style={{fontSize:12,fontWeight:700,color:S.orange,fontFamily:S.fontHead,letterSpacing:1}}>
                      AGENT MODE — {currentSession.query_type?.toUpperCase()}
                    </div>
                  </div>

                  {verifiedOnce && (
                    <div style={{marginBottom:10,background:"rgba(39,174,96,.08)",border:"1px solid #27AE6044",
                      borderRadius:8,padding:"7px 10px",fontSize:10,color:S.green}}>
                      ✓ Customer already verified this session
                    </div>
                  )}

                  {/* What AI told customer */}
                  {lastAI && (
                    <div style={{marginBottom:10}}>
                      <div style={{fontSize:8,color:S.green,letterSpacing:1,marginBottom:4}}>
                        AI TOLD CUSTOMER ({currentSession.language})
                      </div>
                      <div style={{background:"rgba(39,174,96,.06)",border:"1px solid #1E4D2A",
                        borderRadius:10,padding:"9px 12px",fontSize:13,color:"#C8E6C9",lineHeight:1.6}}>
                        {lastAI.text}
                      </div>
                      {lastAI.ai_reply_english && lastAI.ai_reply_english!==lastAI.text && (
                        <div style={{background:"rgba(39,174,96,.04)",border:"1px solid #1E4D2A",
                          borderRadius:8,padding:"7px 12px",marginTop:4,
                          fontSize:11,color:"#9AB8D0",fontStyle:"italic"}}>
                          {lastAI.ai_reply_english}
                        </div>
                      )}
                    </div>
                  )}

                  {/* What customer said */}
                  {lastCust && (
                    <div style={{marginBottom:14}}>
                      <div style={{fontSize:8,color:S.dim,letterSpacing:1,marginBottom:4}}>
                        CUSTOMER SAID ({currentSession.language})
                      </div>
                      <div style={{background:"rgba(0,0,0,.3)",border:`1px solid ${S.border2}`,
                        borderRadius:10,padding:"10px 12px",fontSize:15,color:"#E8EAF0",lineHeight:1.7}}>
                        {lastCust.text}
                      </div>
                      <div style={{fontSize:8,color:S.blue,letterSpacing:1,marginTop:8,marginBottom:4}}>
                        MEANING IN ENGLISH
                      </div>
                      <div style={{background:"rgba(74,144,226,.08)",border:"1px solid rgba(74,144,226,.25)",
                        borderRadius:10,padding:"10px 12px",fontSize:13,color:"#9AB8D0",lineHeight:1.6,fontStyle:"italic"}}>
                        {lastCust.english_translation||"(translation loading...)"}
                      </div>
                    </div>
                  )}

                  <div style={{height:1,background:S.orangeBorder,margin:"4px 0 14px"}}/>

                  {/* ── VOICE-ONLY REPLY ── */}
                  <div style={{fontSize:9,color:S.orange,letterSpacing:1,marginBottom:10,fontFamily:S.fontHead,textAlign:"center"}}>
                    SPEAK IN ENGLISH — CUSTOMER HEARS {(currentSession.language||"NATIVE").toUpperCase()}
                  </div>

                  {/* Agent waveform */}
                  {agentRecording && (
                    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:2,height:36,marginBottom:10}}>
                      {agentWaveform.map((h,i)=>(
                        <div key={i} style={{width:4,borderRadius:3,height:h,
                          background:`hsl(${38+(i%4)*5},90%,${55+(i%3)*8}%)`,
                          transition:"height .08s"}}/>
                      ))}
                    </div>
                  )}

                  <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
                    <button
                      className={agentRecording?"agent-mic-active":""}
                      onClick={agentRecording?stopAgentRecording:startAgentRecording}
                      disabled={agentLoading}
                      style={{
                        width:84,height:84,borderRadius:"50%",border:"none",fontSize:32,cursor:agentLoading?"not-allowed":"pointer",
                        background:agentRecording
                          ?"linear-gradient(135deg,#D4860A,#8B5A00)"
                          :agentLoading
                          ?"#1A1A1A"
                          :"linear-gradient(135deg,#2A1F08,#1A1300)",
                        boxShadow:agentRecording
                          ?"0 0 24px rgba(245,166,35,.7)"
                          :agentLoading
                          ?"none"
                          :`0 0 0 2px ${S.orange},0 6px 18px rgba(0,0,0,.5)`,
                        transition:"all .3s",
                        opacity:agentLoading?0.5:1,
                      }}>
                      {agentLoading ? "⏳" : agentRecording ? "⏹" : "🎤"}
                    </button>

                    <div style={{fontSize:11,color:agentRecording?S.orange:S.muted,fontWeight:agentRecording?700:400,textAlign:"center"}}>
                      {agentLoading
                        ? "⏳ Transcribing & translating..."
                        : agentRecording
                        ? `🔴 Recording agent voice...`
                        : "Tap mic → speak English → customer hears native voice"}
                    </div>
                  </div>

                  {/* Last agent reply result */}
                  {agentResult && (
                    <div className="fade-in" style={{marginTop:14,background:"rgba(39,174,96,.1)",
                      border:"1px solid #27AE6044",borderRadius:10,padding:"10px 12px"}}>
                      <div style={{fontSize:8,color:S.dim,letterSpacing:1,marginBottom:3}}>YOU SAID (English)</div>
                      <div style={{fontSize:11,color:"#D4B87A",fontStyle:"italic",marginBottom:8}}>{agentResult.english_text}</div>
                      <div style={{fontSize:8,color:S.green,letterSpacing:1,marginBottom:4}}>
                        CUSTOMER HEARD ({currentSession.language})
                      </div>
                      <div style={{fontSize:13,color:"#C8E6C9",lineHeight:1.6}}>{agentResult.translated}</div>
                      {agentResult.audio_url && (
                        <button onClick={()=>playAudio(API_BASE+agentResult.audio_url)}
                          style={{marginTop:8,background:"rgba(39,174,96,.15)",border:"1px solid #27AE6044",
                            color:S.green,padding:"3px 10px",borderRadius:6,cursor:"pointer",fontSize:9,fontFamily:S.fontHead}}>
                          🔊 Replay
                        </button>
                      )}
                    </div>
                  )}

                  <div style={{marginTop:12,fontSize:9,color:S.dim,textAlign:"center",lineHeight:1.7,
                    background:"rgba(0,0,0,.2)",borderRadius:8,padding:"8px 10px"}}>
                    💡 Tap mic → speak in English<br/>
                    Backend: Whisper → Translate → TTS<br/>
                    Customer hears <strong style={{color:S.orange}}>{currentSession.language}</strong> voice automatically
                  </div>
                </div>
              )}

              {/* ═══ NON-AGENT MODE: Simple staff quick speak ═══ */}
              {!agentMode && (
                <div style={{background:S.panel,borderRadius:14,padding:14,border:`1px solid ${S.border}`}}>
                  <div style={{fontSize:9,color:S.dim,letterSpacing:1.5,marginBottom:10,fontFamily:S.fontHead}}>STAFF VOICE REPLY</div>
                  <div style={{fontSize:10,color:S.muted,marginBottom:12,lineHeight:1.6}}>
                    Speak in English to customer. Auto-translated to {sessionLang||"customer's language"} via TTS.
                  </div>

                  {/* Simple mode agent waveform */}
                  {agentRecording && (
                    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:2,height:28,marginBottom:10}}>
                      {agentWaveform.map((h,i)=>(
                        <div key={i} style={{width:3,borderRadius:2,height:h,
                          background:`hsl(${38+(i%4)*5},80%,${55+(i%3)*8}%)`,
                          transition:"height .08s"}}/>
                      ))}
                    </div>
                  )}

                  <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
                    <button
                      className={agentRecording?"agent-mic-active":""}
                      onClick={agentRecording?stopAgentRecording:startAgentRecording}
                      disabled={agentLoading||!currentSession}
                      style={{
                        width:60,height:60,borderRadius:"50%",border:"none",fontSize:22,
                        cursor:(agentLoading||!currentSession)?"not-allowed":"pointer",
                        background:agentRecording
                          ?"linear-gradient(135deg,#D4860A,#8B5A00)"
                          :"linear-gradient(135deg,#1A1300,#2A1F08)",
                        boxShadow:agentRecording
                          ?"0 0 18px rgba(245,166,35,.6)"
                          :`0 0 0 2px ${S.orange}`,
                        opacity:(agentLoading||!currentSession)?0.4:1,
                        transition:"all .3s"
                      }}>
                      {agentLoading?"⏳":agentRecording?"⏹":"🎤"}
                    </button>
                    <div style={{fontSize:10,color:agentRecording?S.orange:S.dim,textAlign:"center"}}>
                      {agentLoading?"Translating...":agentRecording?"Recording...":"Tap to speak"}
                    </div>
                  </div>

                  {agentResult && (
                    <div style={{marginTop:10,background:"rgba(39,174,96,.1)",border:"1px solid #27AE6044",
                      borderRadius:8,padding:"8px 10px",fontSize:10,color:S.green}}>
                      <div style={{fontSize:8,color:S.dim,marginBottom:3}}>YOU SAID: <span style={{color:"#D4B87A",fontStyle:"italic"}}>{agentResult.english_text}</span></div>
                      Spoken in {currentSession?.language}: "{agentResult.translated}"
                    </div>
                  )}
                </div>
              )}

              {/* Process guide */}
              {guide && (
                <div style={{background:S.panel,borderRadius:14,padding:14,border:`1px solid ${S.border}`}}>
                  <div style={{fontSize:11,color:"#fff",fontWeight:700,marginBottom:10,fontFamily:S.fontHead}}>{guide.title}</div>
                  {guide.steps.map((step,i)=>(
                    <div key={i} className="step-item" style={{display:"flex",gap:8,marginBottom:7,animationDelay:`${i*.1}s`}}>
                      <div style={{width:18,height:18,borderRadius:"50%",
                        background:`linear-gradient(135deg,${S.red},#8B0000)`,
                        display:"flex",alignItems:"center",justifyContent:"center",
                        fontSize:8,color:"#fff",fontWeight:700,flexShrink:0}}>{i+1}</div>
                      <div style={{fontSize:10,color:S.muted,lineHeight:1.6}}>{step}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Recent sessions */}
              <div style={{background:S.panel,borderRadius:14,padding:14,border:`1px solid ${S.border}`}}>
                <div style={{fontSize:9,color:S.dim,letterSpacing:1.5,marginBottom:10,fontFamily:S.fontHead}}>
                  RECENT SESSIONS ({sessions.length})
                </div>
                {sessions.length===0 && <div style={{fontSize:11,color:S.dim,textAlign:"center",padding:"20px 0"}}>No sessions yet</div>}
                {sessions.slice(0,4).map((sess,i)=>(
                  <div key={i} style={{background:S.card,borderRadius:8,padding:9,border:`1px solid ${S.border}`,marginBottom:6}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{fontSize:10,fontWeight:600,color:S.text}}>{sess.language} • {sess.query_type}</span>
                      <span style={{fontSize:8,color:sess.complexity==="simple"?S.green:S.red}}>
                        {sess.complexity==="simple"?"AI":"AGENT"}
                      </span>
                    </div>
                    <div style={{fontSize:9,color:S.dim}}>{sess.date} {sess.startTime} • {fmt(sess.duration||0)}</div>
                    <button onClick={()=>exportSession(sess)}
                      style={{marginTop:5,background:"none",border:`1px solid ${S.border}`,
                        color:S.dim,padding:"2px 8px",borderRadius:5,cursor:"pointer",fontSize:9}}>Export</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ANALYTICS */}
        {activePage==="Analytics" && (
          <div className="fade-in" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:14}}>
            {[
              {title:"Total Sessions",value:sessions.length,color:S.blue,sub:"All interactions"},
              {title:"AI Resolved",value:sessions.filter(s=>s.complexity==="simple").length,color:S.green,sub:`${resRate}% resolution rate`},
              {title:"Agent Escalated",value:sessions.filter(s=>s.complexity==="complex").length,color:S.red,sub:"Complex queries"},
              {title:"Avg Duration",value:fmt(avgDur),color:S.orange,sub:"Per session"},
            ].map((st,i)=>(
              <div key={i} style={{background:S.panel,borderRadius:14,padding:20,border:`1px solid ${S.border}`}}>
                <div style={{fontSize:9,color:S.dim,letterSpacing:1,marginBottom:8,fontFamily:S.fontHead}}>{st.title.toUpperCase()}</div>
                <div style={{fontSize:36,fontWeight:700,color:st.color,fontFamily:S.fontHead}}>{st.value}</div>
                <div style={{fontSize:10,color:S.dim,marginTop:4}}>{st.sub}</div>
              </div>
            ))}
            <div style={{background:S.panel,borderRadius:14,padding:20,border:`1px solid ${S.border}`,gridColumn:"span 2"}}>
              <div style={{fontSize:9,color:S.dim,letterSpacing:1,marginBottom:12,fontFamily:S.fontHead}}>QUERY TYPE BREAKDOWN</div>
              {Object.entries(qtCounts).length===0 && <div style={{color:S.dim,fontSize:12}}>No data yet</div>}
              {Object.entries(qtCounts).map(([type,count])=>(
                <div key={type} style={{marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                    <span style={{fontSize:11,color:S.text}}>{QUERY_ICONS[type]} {type}</span>
                    <span style={{fontSize:11,color:S.blue,fontWeight:700}}>{count}</span>
                  </div>
                  <div style={{height:4,background:S.border,borderRadius:2}}>
                    <div style={{height:"100%",width:`${sessions.length>0?(count/sessions.length)*100:0}%`,background:S.red,borderRadius:2}}/>
                  </div>
                </div>
              ))}
            </div>
            <div style={{background:S.panel,borderRadius:14,padding:20,border:`1px solid ${S.border}`}}>
              <div style={{fontSize:9,color:S.dim,letterSpacing:1,marginBottom:12,fontFamily:S.fontHead}}>LANGUAGE DISTRIBUTION</div>
              {Object.entries(lgCounts).length===0 && <div style={{color:S.dim,fontSize:12}}>No data yet</div>}
              {Object.entries(lgCounts).map(([lang,count])=>(
                <div key={lang} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <span style={{fontSize:11,color:S.text}}>{lang}</span>
                  <span style={{background:S.redBg,border:`1px solid ${S.redBorder}`,
                    color:S.redLight,padding:"2px 8px",borderRadius:20,fontSize:9,fontWeight:700}}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* HISTORY */}
        {activePage==="History" && (
          <div className="fade-in">
            <div style={{fontSize:9,color:S.dim,letterSpacing:1.5,marginBottom:14,fontFamily:S.fontHead}}>ALL SESSIONS ({sessions.length})</div>
            {sessions.length===0 && (
              <div style={{background:S.panel,borderRadius:14,padding:40,textAlign:"center",border:`1px solid ${S.border}`,color:S.dim}}>
                No sessions yet.
              </div>
            )}
            {sessions.map((sess,i)=>(
              <div key={i} style={{background:S.panel,borderRadius:14,padding:16,border:`1px solid ${S.border}`,marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:700,color:S.text,marginBottom:2}}>
                      {QUERY_ICONS[sess.query_type]} {sess.language} — {sess.query_type}
                    </div>
                    <div style={{fontSize:9,color:S.dim}}>{sess.date} • {sess.startTime} • {fmt(sess.duration||0)}</div>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <span style={{background:sess.complexity==="simple"?"rgba(39,174,96,.15)":S.redBg,
                      border:`1px solid ${sess.complexity==="simple"?"#27AE6044":S.redBorder}`,
                      color:sess.complexity==="simple"?S.green:S.redLight,
                      padding:"3px 10px",borderRadius:20,fontSize:9,fontWeight:700}}>
                      {sess.complexity==="simple"?"AI Resolved":"Agent Handled"}
                    </span>
                    <button onClick={()=>exportSession(sess)}
                      style={{background:S.border,border:`1px solid ${S.border2}`,color:S.muted,
                        padding:"3px 10px",borderRadius:6,cursor:"pointer",fontSize:9}}>Export</button>
                  </div>
                </div>
                {sess.history?.slice(0,2).map((msg,j)=>(
                  <div key={j} style={{fontSize:11,color:S.dim,marginBottom:4,paddingLeft:8,
                    borderLeft:`2px solid ${msg.role==="customer"?S.blue:msg.role==="agent"?S.orange:S.green}`}}>
                    <span style={{color:msg.role==="customer"?S.blue:msg.role==="agent"?S.orange:S.green}}>
                      {msg.role==="customer"?"Customer":msg.role==="agent"?"Agent":"AI"}:{" "}
                    </span>
                    {(msg.english_text||msg.english_translation||msg.text||"").slice(0,80)}...
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* ABOUT */}
        {activePage==="About" && (
          <div className="fade-in" style={{maxWidth:640}}>
            <div style={{background:S.panel,borderRadius:16,padding:24,border:`1px solid ${S.border}`,marginBottom:14}}>
              <div style={{fontSize:22,fontWeight:700,color:S.text,fontFamily:S.fontHead,marginBottom:8}}>VoiceAssist AI v2.5</div>
              <div style={{display:"grid",gap:8}}>
                {[
                  {l:"AI Model",v:"LLaMA 3.3 70B (Groq)"},
                  {l:"Speech-to-Text",v:"Whisper Large V3 (Groq) — customer & agent"},
                  {l:"Text-to-Speech",v:"Sarvam AI bulbul:v2 + gTTS fallback"},
                  {l:"Languages",v:"Hindi, Marathi, Tamil, Telugu, Bengali, English"},
                  {l:"Backend",v:"Python FastAPI (port 8000)"},
                  {l:"Agent Reply",v:"Voice only — speaks English, customer hears native"},
                  {l:"Team",v:"FinovateX | iDEA 2.0 | PS6"},
                ].map(({l,v})=>(
                  <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${S.border}`}}>
                    <span style={{fontSize:11,color:S.dim}}>{l}</span>
                    <span style={{fontSize:11,color:S.text,fontWeight:600}}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{background:"rgba(39,174,96,.08)",border:"1px solid rgba(39,174,96,.25)",borderRadius:12,padding:16,marginBottom:12}}>
              <div style={{fontSize:11,color:S.green,fontWeight:700,marginBottom:8}}>✅ Full Conversation Flow (v2.5)</div>
              <div style={{fontSize:10,color:S.muted,lineHeight:2}}>
                1. Customer speaks → <strong style={{color:"#fff"}}>AI greets in their language</strong><br/>
                2. Balance → name → mother's name → balance given → "anything else?"<br/>
                3. Simple follow-up → <strong style={{color:"#fff"}}>AI answers directly, no re-verification</strong><br/>
                4. Complex (loan/fraud) → <strong style={{color:S.orange}}>Agent Takeover</strong>:<br/>
                &nbsp;&nbsp;&nbsp;• Agent sees customer message (native + English)<br/>
                &nbsp;&nbsp;&nbsp;• Agent sees what AI told customer<br/>
                &nbsp;&nbsp;&nbsp;• Agent taps mic → speaks English → Whisper → Translate → TTS<br/>
                &nbsp;&nbsp;&nbsp;• Customer hears native language voice automatically
              </div>
            </div>
            <div style={{background:S.redBg,border:`1px solid ${S.redBorder}`,borderRadius:12,padding:16}}>
              <div style={{fontSize:11,color:S.redLight,fontWeight:700,marginBottom:6}}>Setup</div>
              <div style={{fontSize:10,color:S.muted,lineHeight:1.8}}>
                <code style={{background:"#0D1627",padding:"2px 6px",borderRadius:4,color:S.text}}>uvicorn main:app --reload --port 8000</code><br/><br/>
                New endpoint: <code style={{background:"#0D1627",padding:"2px 6px",borderRadius:4,color:S.text}}>POST /staff-voice-reply</code><br/>
                Accepts: <code style={{background:"#0D1627",padding:"2px 6px",borderRadius:4,color:S.text}}>file (webm) + language (str)</code>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}