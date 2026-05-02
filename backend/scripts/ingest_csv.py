#!/usr/bin/env python3
"""
CSV to Vector Database Ingestion Script

This script reads the knowledge_base.csv file and ingests it into the
Supabase vector database for RAG (Retrieval-Augmented Generation).

Usage:
    python ingest_csv.py [--csv path/to/file.csv]

Environment Variables Required:
    SUPABASE_URL
    SUPABASE_SERVICE_KEY
    OPENAI_API_KEY
"""

import os
import sys
import argparse
import asyncio
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add project root to path to import from src
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from src.rag.service import RAGService
from src.db.supabase import SupabaseService


def validate_environment():
    """Check required environment variables."""
    required = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "OPENAI_API_KEY"]
    missing = [var for var in required if not os.getenv(var)]
    
    if missing:
        print(f"❌ Missing environment variables: {', '.join(missing)}")
        print("Please set them in your .env file or export them.")
        sys.exit(1)


def read_csv_file(csv_path: str) -> pd.DataFrame:
    """Read and validate CSV file."""
    path = Path(csv_path)
    
    if not path.exists():
        print(f"❌ CSV file not found: {csv_path}")
        sys.exit(1)
    
    try:
        df = pd.read_csv(csv_path)
        print(f"✅ Successfully read CSV with {len(df)} rows and {len(df.columns)} columns")
        print(f"   Columns: {', '.join(df.columns)}")
        return df
    except Exception as e:
        print(f"❌ Error reading CSV: {e}")
        sys.exit(1)


async def clear_existing_vectors(supabase: SupabaseService):
    """Clear existing knowledge vectors (optional)."""
    print("\n🗑️  Clearing existing knowledge vectors...")
    try:
        from supabase import create_client
        client = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_KEY"))
        result = client.table("knowledge_vectors").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
        print(f"   Cleared existing vectors")
    except Exception as e:
        print(f"   ⚠️  Could not clear vectors: {e}")


async def ingest_csv_to_vectors(csv_path: str, clear_existing: bool = False):
    """Main ingestion function."""
    print("=" * 60)
    print("📚 Knowledge Base CSV to Vector Database Ingestion")
    print("=" * 60)
    
    # Validate environment
    validate_environment()
    
    # Read CSV
    df = read_csv_file(csv_path)
    
    # Initialize services
    rag_service = RAGService()
    supabase = SupabaseService()
    
    # Clear existing if requested
    if clear_existing:
        await clear_existing_vectors(supabase)
    
    # Ingest data
    print(f"\n🚀 Starting ingestion of {len(df)} records...")
    print("-" * 60)
    
    success_count = 0
    error_count = 0
    
    for idx, row in df.iterrows():
        try:
            # Convert row to text representation
            content_parts = []
            metadata = {}
            
            for col in df.columns:
                val = row[col]
                if pd.notna(val):
                    content_parts.append(f"{col}: {val}")
                    metadata[col] = str(val)
            
            content = "\n".join(content_parts)
            
            # Generate embedding
            print(f"   [{idx + 1}/{len(df)}] Generating embedding for: {row.iloc[0][:50]}...", end=" ")
            embedding = await rag_service.generate_embedding(content)
            
            # Store in Supabase
            await supabase.store_vector(content, metadata, embedding)
            success_count += 1
            print("✓")
            
        except Exception as e:
            error_count += 1
            print(f"✗ Error: {e}")
    
    print("-" * 60)
    print(f"\n✅ Ingestion complete!")
    print(f"   Successfully ingested: {success_count} documents")
    if error_count > 0:
        print(f"   Errors: {error_count}")
    print("=" * 60)


def main():
    parser = argparse.ArgumentParser(
        description="Ingest CSV knowledge base into Supabase vector database"
    )
    parser.add_argument(
        "--csv",
        default="../../data/vizaura_courses_dataset.csv",
        help="Path to CSV file (default: ../../data/vizaura_courses_dataset.csv)"
    )
    parser.add_argument(
        "--clear",
        action="store_true",
        help="Clear existing vectors before ingesting"
    )
    
    args = parser.parse_args()
    
    # Resolve path relative to script location
    script_dir = Path(__file__).parent
    csv_path = script_dir / args.csv
    
    # Run async function
    asyncio.run(ingest_csv_to_vectors(str(csv_path), args.clear))


if __name__ == "__main__":
    main()
