from llama_index.core import Settings
try:
    # Try the new import path
    from llama_index.retrievers.bm25 import BM25Retriever
    print("Successfully imported BM25Retriever from new path")
except ImportError:
    try:
        # Try the old import path
        from llama_index.core.retrievers.bm25 import BM25Retriever
        print("Successfully imported BM25Retriever from old path")
    except ImportError:
        print("Failed to import BM25Retriever")

print("llama-index import test complete")
