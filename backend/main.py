from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from groq import Groq
from sarvamai import SarvamAI
from pydantic import BaseModel
from langchain_community.document_loaders import TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import SentenceTransformerEmbeddings
from gtts import gTTS
import os, tempfile, json
from typing import List, Optional

load_dotenv()
app = FastAPI()

groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
sarvam_client = SarvamAI(api_subscription_key=os.getenv("SARVAM_API_KEY"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── RAG ──────────────────────────────────────────────
vectorstore = None

def init_rag():
    global vectorstore
    try:
        print("Loading RAG knowledge base...")
        faq_path = os.path.join(os.path.dirname(__file__), "banking_faq.txt")
        loader = TextLoader(faq_path, encoding="utf-8")
        docs = loader.load()
        splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
        chunks = splitter.split_documents(docs)
        embeddings = SentenceTransformerEmbeddings(model_name="all-MiniLM-L6-v2")
        chroma_dir = os.path.join(os.path.dirname(__file__), "chroma_db")
        vectorstore = Chroma.from_documents(chunks, embeddings, persist_directory=chroma_dir)
        print(f"RAG ready — {len(chunks)} chunks loaded")
    except Exception as e:
        print(f"RAG init failed (continuing without it): {e}")

def get_rag_context(query: str) -> str:
    global vectorstore
    if not vectorstore:
        return ""
    try:
        results = vectorstore.similarity_search(query, k=3)
        return "\n".join([r.page_content for r in results])
    except Exception:
        return ""

init_rag()

# ── Classifier ────────────────────────────────────────
CLASSIFIER_PROMPT = """
You are a banking query classifier for Union Bank of India.
Return ONLY valid JSON — no extra text, no markdown, no explanation.

{
  "complexity": "simple" or "complex",
  "query_type": "balance" or "loan" or "complaint" or "account" or "fd" or "upi" or "fraud" or "kyc" or "other",
  "language": "Hindi" or "Marathi" or "English" or "Tamil" or "Telugu" or "Bengali",
  "sentiment": "neutral" or "frustrated" or "urgent",
  "reason": "one line why",
  "confidence": 0.0 to 1.0,
  "requires_verification": true or false
}

=== LANGUAGE DETECTION ===
MARATHI: आहे, नाही, माझे, शिल्लक, बँक, खाते, सांगा, मला → "Marathi"
HINDI: है, हैं, मेरा, बैंक, बैलेंस, खाता → "Hindi" (only if no Marathi signals)
Tamil script → "Tamil", Telugu script → "Telugu", Bengali script → "Bengali", Latin → "English"
Urdu script or mixed → treat as "Hindi"

Simple: balance, FD rates, branch timing, UPI info, account info, general questions
Complex: loan APPLICATION, fraud report, blocked account, KYC update, credit card application, complaints

requires_verification: true only for balance or specific account data queries
"""

# ── System prompt ─────────────────────────────────────
CHAT_SYSTEM_PROMPT = """
You are VoiceAssist AI — a helpful voice assistant for Union Bank of India branch counter.

=== ABSOLUTE RULES ===
1. Reply ONLY in the customer's language: {LANGUAGE}. Never switch. Never mix languages.
2. Keep replies SHORT — 1 to 2 sentences for voice.
3. Do EXACTLY what the STATE BLOCK says — nothing more, nothing less.

{STATE_BLOCK}

{RAG_CONTEXT}
"""

# ── State helpers ─────────────────────────────────────
NAME_KEYWORDS   = ["नाव काय", "नाम क्या", "your name", "full name", "naam kya",
                   "नाव सांगा", "नाम बताइए", "பெயர்", "మీ పేరు"]
MOTHER_KEYWORDS = ["आईचे नाव", "माँ का नाम", "mother's name", "mother name",
                   "माता का नाम", "தாயின் பெயர்", "తల్లి పేరు"]
BALANCE_SIGNALS = ["45,230", "शिल्लक", "बैलेंस है", "balance is", "खाते में ₹", "आपले खाते"]

def _role(m): return m.role if hasattr(m, "role") else m.get("role", "")
def _text(m): return m.text if hasattr(m, "text") else m.get("text", "")

def get_state(history: list) -> dict:
    has_greeted     = any(_role(m) == "ai" for m in history)
    name_ask_idx    = None
    mother_ask_idx  = None
    balance_given   = False
    captured_name   = ""
    captured_mother = ""

    for i, msg in enumerate(history):
        role = _role(msg)
        text = _text(msg)
        if role == "ai":
            tl = text.lower()
            if any(k.lower() in tl for k in NAME_KEYWORDS):
                name_ask_idx = i
            if any(k.lower() in tl for k in MOTHER_KEYWORDS):
                mother_ask_idx = i
            if any(s in text for s in BALANCE_SIGNALS):
                balance_given = True
        elif role == "customer":
            if (name_ask_idx is not None and captured_name == ""
                    and i > name_ask_idx
                    and (mother_ask_idx is None or i <= mother_ask_idx)):
                captured_name = text
            if (mother_ask_idx is not None and captured_mother == ""
                    and i > mother_ask_idx):
                captured_mother = text

    if balance_given and captured_name and captured_mother:
        bal_idx = max(i for i, m in enumerate(history)
                      if _role(m) == "ai" and any(s in _text(m) for s in BALANCE_SIGNALS))
        newer_cust = [m for i, m in enumerate(history) if i > bal_idx and _role(m) == "customer"]
        if newer_cust:
            return {"stage": "post_verified", "name": captured_name, "mothers_name": captured_mother}
        return {"stage": "verified", "name": captured_name, "mothers_name": captured_mother}

    if captured_name and captured_mother:
        return {"stage": "verified", "name": captured_name, "mothers_name": captured_mother}
    if mother_ask_idx is not None and not captured_mother:
        return {"stage": "mother_asked", "name": captured_name, "mothers_name": ""}
    if name_ask_idx is not None and not captured_name:
        return {"stage": "name_asked", "name": "", "mothers_name": ""}
    if has_greeted:
        return {"stage": "greeted", "name": "", "mothers_name": ""}
    return {"stage": "start", "name": "", "mothers_name": ""}


def build_state_block(state: dict, language: str, query_type: str, complexity: str) -> str:
    stage = state["stage"]
    name  = state["name"]

    if stage == "start":
        return f"""
STATE: FIRST MESSAGE — GREET ONLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Greet warmly in {language} and ask how you can help. One sentence greeting + one offer to help.
Hindi example:   नमस्ते! यूनियन बैंक में आपका स्वागत है, मैं आपकी कैसे मदद कर सकता हूँ?
Marathi example: नमस्कार! युनियन बँकेत आपले स्वागत आहे, मी आपली कशी मदत करू शकतो?
English example: Good morning! Welcome to Union Bank, how may I help you today?
DO NOT ask for name. DO NOT ask for anything else.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

    if stage == "greeted":
        if complexity == "complex":
            return f"""
STATE: COMPLEX QUERY — TELL CUSTOMER YOU ARE CONNECTING THEM TO AN AGENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
In {language}, tell the customer:
- Thank you for reaching out
- You are connecting them to a specialist who will help shortly
- Ask them to please wait
Example Hindi:   आपकी बात समझ आई, मैं आपको हमारे विशेषज्ञ से जोड़ रहा हूँ। कृपया एक क्षण प्रतीक्षा करें।
Example Marathi: आपली समस्या समजली, मी आपल्याला आमच्या तज्ञांशी जोडत आहे। कृपया थोडा वेळ थांबा।
DO NOT ask for name. DO NOT ask for verification. Just reassure and say agent is coming.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""
        if query_type == "balance":
            return f"""
STATE: BALANCE REQUESTED — ASK FOR NAME (VERIFICATION STEP 1)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ask for the customer's full name in {language}. One sentence only.
Hindi:   आपका पूरा नाम क्या है?
Marathi: आपले पूर्ण नाव काय आहे?
English: Could you please tell me your full name?
DO NOT greet again. DO NOT ask for mother's name yet.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""
        return f"""
STATE: SIMPLE QUERY — ANSWER DIRECTLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Answer the question in {language} using your knowledge and RAG context below.
Keep to 1-3 sentences. DO NOT re-greet. DO NOT ask for name.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

    if stage == "name_asked":
        return f"""
STATE: CUSTOMER JUST GAVE THEIR NAME — ASK FOR MOTHER'S NAME (VERIFICATION STEP 2)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The current message IS the customer's name. Accept it and ask only for mother's name.
Hindi:   आपकी माँ का नाम क्या है?
Marathi: आपल्या आईचे नाव काय आहे?
English: Could you please tell me your mother's name?
DO NOT ask for name again. DO NOT give balance yet.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

    if stage == "mother_asked":
        return f"""
STATE: CUSTOMER JUST GAVE MOTHER'S NAME — GIVE BALANCE + ASK IF ANYTHING ELSE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Customer name: {name}
The current message IS the mother's name. Accept it.
Say thank you, give the balance, then ask if there is anything else.
Mock balance: ₹45,230.50 (say "as per our records")
Hindi:   धन्यवाद {name} जी! हमारे रिकॉर्ड के अनुसार आपके खाते में ₹45,230.50 है। क्या और कोई मदद चाहिए?
Marathi: धन्यवाद {name}! आमच्या नोंदीनुसार आपले खाते शिल्लक ₹45,230.50 आहे। आणखी काही मदत हवी आहे का?
English: Thank you {name}! As per our records your balance is ₹45,230.50. Is there anything else I can help you with?
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

    if stage == "verified":
        return f"""
STATE: VERIFIED — GIVE BALANCE DIRECTLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Customer: {name}. Verification complete. Give balance directly in {language}.
Mock balance: ₹45,230.50. DO NOT re-verify. DO NOT ask for name again.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

    if stage == "post_verified":
        if complexity == "complex":
            return f"""
STATE: POST-VERIFICATION COMPLEX QUERY — CONNECT TO AGENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Customer {name} is already verified. DO NOT ask for name or mother's name again.
In {language}, tell {name} you are connecting them to a specialist for this request. Ask them to wait.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""
        return f"""
STATE: POST-VERIFICATION SIMPLE QUERY — ANSWER DIRECTLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Customer {name} is already verified. DO NOT ask for name or mother's name again.
Answer their question directly in {language}. Use RAG context if available. 1-3 sentences.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""
    return ""


# ── STT ──────────────────────────────────────────────
async def transcribe_audio(file_path: str) -> str:
    try:
        with open(file_path, "rb") as f:
            t = groq_client.audio.transcriptions.create(
                model="whisper-large-v3",
                file=f,
                response_format="text"
            )
        text = t if isinstance(t, str) else t.text
        print(f"Whisper: {text}")
        return text
    except Exception as e:
        print(f"Whisper error: {e}")
        return ""


# ── TTS ───────────────────────────────────────────────
SARVAM_LANG_MAP = {
    "hi": "hi-IN", "mr": "mr-IN", "ta": "ta-IN",
    "te": "te-IN", "gu": "gu-IN", "bn": "bn-IN", "en": "en-IN"
}
SARVAM_SUPPORTED = {"hi", "mr", "ta", "te", "gu", "bn", "en"}
last_tts_engine = {"engine": "sarvam"}

def speak_text(text: str, lang: str) -> str:
    tts_path = tempfile.mktemp(suffix=".mp3")
    if lang in SARVAM_SUPPORTED:
        try:
            sarvam_lang = SARVAM_LANG_MAP.get(lang, "hi-IN")
            response = sarvam_client.text_to_speech.convert(
                model="bulbul:v2",
                text=text[:500],
                target_language_code=sarvam_lang,
                speaker="anushka"
            )
            with open(tts_path, "wb") as f:
                f.write(response.audios[0])
            last_tts_engine["engine"] = "sarvam"
            return tts_path
        except Exception as e:
            print(f"Sarvam TTS failed: {e}")
    try:
        gtts_lang = lang if lang in ["hi", "mr", "en", "ta", "te", "bn", "gu"] else "hi"
        gTTS(text=text, lang=gtts_lang, slow=False).save(tts_path)
        last_tts_engine["engine"] = "gtts"
    except Exception as e:
        print(f"gTTS failed: {e}")
        with open(tts_path, "wb") as f:
            f.write(b"")
    return tts_path


# ── Language detection ────────────────────────────────
def detect_lang(text: str, classified_lang: str = "") -> str:
    lang_map = {
        "Hindi": "hi", "Marathi": "mr", "Tamil": "ta",
        "Telugu": "te", "Gujarati": "gu", "English": "en", "Bengali": "bn",
    }
    if classified_lang and classified_lang in lang_map:
        return lang_map[classified_lang]
    if text:
        for char in text:
            if '\u0B80' <= char <= '\u0BFF': return "ta"
            if '\u0C00' <= char <= '\u0C7F': return "te"
            if '\u0A80' <= char <= '\u0AFF': return "gu"
            if '\u0980' <= char <= '\u09FF': return "bn"
        if any('\u0900' <= c <= '\u097F' for c in text):
            marathi_signals = ["आहे", "माझे", "माझा", "माझी", "आपले", "आपला",
                               "सांगा", "खाते", "शिल्लक", "बँक", "नाही", "मला"]
            if any(kw in text for kw in marathi_signals):
                return "mr"
            return "hi"
    return "en"


# ── Models ────────────────────────────────────────────
class ChatMessage(BaseModel):
    role: str
    text: str
    audio_url: Optional[str] = None
    english_translation: Optional[str] = None

class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []
    language: str = ""
    session_id: str = ""


# ── /chat ─────────────────────────────────────────────
@app.post("/chat")
async def chat(req: ChatRequest):
    text    = req.message
    history = req.history

    # 1. Classify
    classification = {
        "complexity": "simple", "query_type": "other",
        "language": req.language or "Hindi", "sentiment": "neutral",
        "reason": "", "confidence": 0.9, "requires_verification": False,
    }
    try:
        clf = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": CLASSIFIER_PROMPT},
                {"role": "user",   "content": text}
            ],
            temperature=0.1,
        )
        raw = clf.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        classification = json.loads(raw)
    except Exception as e:
        print(f"Classifier error: {e}")

    if req.language and req.language not in ("", "unknown"):
        classification["language"] = req.language

    detected_language = classification.get("language", "Hindi")
    query_type        = classification.get("query_type", "other")
    complexity        = classification.get("complexity", "simple")

    # 2. State
    state = get_state(history)
    state_block = build_state_block(state, detected_language, query_type, complexity)

    # 3. RAG
    rag_context = get_rag_context(text)
    rag_block   = f"BANK KNOWLEDGE:\n{rag_context}" if rag_context else ""

    system_prompt = (CHAT_SYSTEM_PROMPT
                     .replace("{LANGUAGE}", detected_language)
                     .replace("{STATE_BLOCK}", state_block)
                     .replace("{RAG_CONTEXT}", rag_block))

    # 4. Build messages
    messages = [{"role": "system", "content": system_prompt}]
    for msg in history:
        if _role(msg) == "customer":
            messages.append({"role": "user",      "content": _text(msg)})
        elif _role(msg) == "ai":
            messages.append({"role": "assistant", "content": _text(msg)})
    messages.append({"role": "user", "content": text})

    # 5. LLM
    response = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=messages,
        temperature=0.3,
    )
    ai_reply = response.choices[0].message.content.strip()

    # 6. TTS
    lang     = detect_lang(text, detected_language)
    tts_path = speak_text(ai_reply, lang)

    # 7. English translation of customer message
    english_translation = text
    if detected_language not in ("English", ""):
        try:
            tr = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content":
                    f"Translate this to English. Return ONLY the translation, nothing else: '{text}'"}],
                temperature=0.1,
            )
            english_translation = tr.choices[0].message.content.strip()
        except Exception:
            pass

    # 8. English translation of AI reply
    ai_reply_english = ai_reply
    if detected_language not in ("English", ""):
        try:
            tr2 = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content":
                    f"Translate this to English. Return ONLY the translation, nothing else: '{ai_reply}'"}],
                temperature=0.1,
            )
            ai_reply_english = tr2.choices[0].message.content.strip()
        except Exception:
            pass

    # 9. Agent suggestion — only on first message or complex
    agent_suggestion = ""
    is_complex_or_first = (len(history) == 0 or complexity == "complex")
    if is_complex_or_first:
        try:
            ar = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content":
                    f'Customer said: "{english_translation}". AI replied: "{ai_reply_english}". '
                    f'Give 1 concise English instruction for bank staff (max 15 words).'}],
                temperature=0.2,
            )
            agent_suggestion = ar.choices[0].message.content.strip()
        except Exception:
            agent_suggestion = "Monitor conversation and assist if needed."

    # 10. Agent takeover flag
    verification_in_progress = state["stage"] in ("name_asked", "mother_asked")
    agent_takeover = (complexity == "complex") and not verification_in_progress

    return {
        "ai_reply":              ai_reply,
        "ai_reply_english":      ai_reply_english,
        "audio_url":             f"/audio/{os.path.basename(tts_path)}",
        "english_translation":   english_translation,
        "complexity":            complexity,
        "query_type":            query_type,
        "language":              detected_language,
        "sentiment":             classification.get("sentiment", "neutral"),
        "reason":                classification.get("reason", ""),
        "lang_confidence":       classification.get("confidence", 0.9),
        "requires_verification": classification.get("requires_verification", False),
        "agent_suggestion":      agent_suggestion,
        "tts_engine":            last_tts_engine["engine"],
        "debug_state":           state["stage"],
        "agent_takeover":        agent_takeover,
    }


# ── /voice-chat ───────────────────────────────────────
@app.post("/voice-chat")
async def voice_chat(
    file: UploadFile = File(...),
    history: str = "[]",
    language: str = "",
    session_id: str = ""
):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    text = await transcribe_audio(tmp_path)
    os.unlink(tmp_path)

    if not text.strip():
        return {"error": "Could not transcribe audio", "transcription": ""}

    history_parsed = []
    try:
        history_parsed = [ChatMessage(**m) for m in json.loads(history)]
    except Exception:
        pass

    req    = ChatRequest(message=text, history=history_parsed, language=language, session_id=session_id)
    result = await chat(req)
    result["transcription"] = text
    return result


# ── /staff-reply (text → translate → TTS) ────────────
class StaffReply(BaseModel):
    text: str
    language: str

@app.post("/staff-reply")
async def staff_reply(body: StaffReply):
    lang = detect_lang("", body.language)
    translated = body.text
    try:
        tr = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content":
                f"Translate naturally to {body.language}. Return ONLY the translation, nothing else: '{body.text}'"}],
            temperature=0.1,
        )
        translated = tr.choices[0].message.content.strip()
    except Exception as e:
        print(f"Translation error: {e}")

    tts_path = speak_text(translated, lang)
    return {
        "translated": translated,
        "audio_url":  f"/audio/{os.path.basename(tts_path)}",
        "tts_engine": last_tts_engine["engine"],
    }


# ── /staff-voice-reply (agent voice → Whisper STT → translate → TTS) ────
@app.post("/staff-voice-reply")
async def staff_voice_reply(
    file: UploadFile = File(...),
    language: str = "Hindi"
):
    """
    Agent speaks English into mic.
    Whisper transcribes → English text.
    Translate English → customer language.
    Generate TTS in customer language.
    Return english_text + translated + audio_url.
    """
    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    english_text = await transcribe_audio(tmp_path)
    os.unlink(tmp_path)

    if not english_text.strip():
        return {"error": "Could not transcribe agent audio", "english_text": ""}

    lang = detect_lang("", language)
    translated = english_text

    # Only translate if not English
    if language not in ("English", "en", ""):
        try:
            tr = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content":
                    f"Translate naturally to {language}. Return ONLY the translation, nothing else: '{english_text}'"}],
                temperature=0.1,
            )
            translated = tr.choices[0].message.content.strip()
        except Exception as e:
            print(f"Translation error: {e}")

    tts_path = speak_text(translated, lang)

    return {
        "english_text": english_text,
        "translated":   translated,
        "audio_url":    f"/audio/{os.path.basename(tts_path)}",
        "tts_engine":   last_tts_engine["engine"],
    }


# ── Legacy / util endpoints ───────────────────────────
@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    text = await transcribe_audio(tmp_path)
    os.unlink(tmp_path)
    return await chat(ChatRequest(message=text))

class TextQuery(BaseModel):
    text: str

@app.post("/text-query")
async def text_query(body: TextQuery):
    result = await chat(ChatRequest(message=body.text))
    result["transcription"] = body.text
    result["answer"] = result.get("ai_reply", "")
    return result

@app.get("/audio/{filename}")
def get_audio(filename: str):
    path = os.path.join(tempfile.gettempdir(), filename)
    if not os.path.exists(path):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Audio not found")
    return FileResponse(path, media_type="audio/mpeg")

@app.get("/")
def root():
    return {"status": "VoiceAssist AI running", "version": "2.5", "rag": vectorstore is not None}

@app.get("/health")
def health():
    return {"status": "ok", "rag_loaded": vectorstore is not None}