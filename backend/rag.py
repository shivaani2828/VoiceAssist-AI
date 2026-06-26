from langchain_community.document_loaders import TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter   # ✅ FIXED — not langchain.text_splitter
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import SentenceTransformerEmbeddings
import os

# Global vector store
vectorstore = None

def init_rag():
    global vectorstore
    print("🔄 Loading RAG knowledge base...")

    loader = TextLoader("banking_faq.txt", encoding="utf-8")
    documents = loader.load()

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=50
    )
    chunks = splitter.split_documents(documents)

    embeddings = SentenceTransformerEmbeddings(model_name="all-MiniLM-L6-v2")
    vectorstore = Chroma.from_documents(
        chunks,
        embeddings,
        persist_directory="./chroma_db"
    )
    print(f"✅ RAG ready! {len(chunks)} chunks loaded")

def get_rag_context(query: str) -> str:
    global vectorstore
    if vectorstore is None:
        return ""
    results = vectorstore.similarity_search(query, k=3)
    context = "\n".join([r.page_content for r in results])
    return context