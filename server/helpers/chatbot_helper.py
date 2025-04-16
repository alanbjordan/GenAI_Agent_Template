# helpers/chatbot_helper.py

import os
import json
import requests
import concurrent.futures
import time
import traceback  # For printing errors
from flask import g
from openai import OpenAI
from pinecone import Pinecone
import decimal
from helpers.llm_wrappers import call_openai_chat_create, call_openai_embeddings

# Import both Conditions and ConditionEmbedding so we can do the basic list + semantic search
from models.legacy_sql_models import Conditions, ConditionEmbedding, NexusTags, Tag

###############################################################################
# 1. ENV & GLOBAL SETUP
###############################################################################

PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
PINECONE_ENV = "us-east-1"  # or whichever region you use

INDEX_NAME_CFR = "38-cfr-index"
INDEX_NAME_M21 = "m21-index"

# Two different embedding models:
# - The "small" one for Pinecone (1536 dims)
# - The "large" one for Postgres pgvector (3072 dims)
EMBEDDING_MODEL_SMALL = "text-embedding-3-small"
EMBEDDING_MODEL_LARGE = "text-embedding-3-large"

# Initialize the OpenAI client
client = OpenAI()

# Initialize Pinecone
pc = Pinecone(api_key=PINECONE_API_KEY)
index_cfr = pc.Index(INDEX_NAME_CFR)
index_m21 = pc.Index(INDEX_NAME_M21)

PART_3_URL = "/home/jsnow/ML-project/Agent_testing/Veteran_Claims_Agent/server/json/part_3_flattened.json"
PART_4_URL = "/home/jsnow/ML-project/Agent_testing/Veteran_Claims_Agent/server/json/part_4_flattened.json"
M21_1_URL = "/home/jsnow/ML-project/Agent_testing/Veteran_Claims_Agent/server/json/m21_1_chunked3k.json"
M21_5_URL = "/home/jsnow/ML-project/Agent_testing/Veteran_Claims_Agent/server/json/m21_5_chunked3k.json"

###############################################################################
# 2. QUERY CLEANUP
###############################################################################
def clean_up_query_with_llm(user_id: int, user_query: str) -> str:
    """
    Uses an OpenAI LLM to rewrite the user query in a more standardized,
    formal, or clarified way—removing slang, expanding contractions, etc.
    Now uses call_openai_chat_create to log usage automatically.
    """
    system_message = (
        "You are a helpful assistant that rewrites user queries for better text embeddings. "
        "Expand or remove contractions, fix grammatical errors, and keep the original meaning. "
        "Be concise and ensure the question is still natural and complete. You will rewrite it "
        "professionally as if talking directly to a VA rater who could answer the question. "
        "Remove sentences not relevant to the question."
    )

    messages = [
        {"role": "system", "content": system_message},
        {"role": "user", "content": user_query},
    ]

    # --- Use wrapper ---
    response = call_openai_chat_create(
        user_id=user_id,
        model="gpt-4o",
        messages=messages,
        temperature=0
    )

    cleaned_query = response.choices[0].message.content
    return cleaned_query.strip()



###############################################################################
# 3. EMBEDDING FUNCTIONS
###############################################################################
def get_embedding_small(user_id: int, text: str) -> list:
    # $0.020 per 1M => 0.00000002 per token
    cost_rate = decimal.Decimal("0.00000002")
    response = call_openai_embeddings(
        user_id=user_id,
        input_text=text,
        model="text-embedding-3-small",
        cost_per_token=cost_rate
    )
    return response.data[0].embedding

def get_embedding_large(user_id: int, text: str) -> list:
    # $0.130 per 1M => 0.00000013 per token
    cost_rate = decimal.Decimal("0.00000013")
    response = call_openai_embeddings(
        user_id=user_id,
        input_text=text,
        model="text-embedding-3-large",
        cost_per_token=cost_rate
    )
    return response.data[0].embedding

###############################################################################
# 4. MULTITHREADED SECTION RETRIEVAL FOR CFR / M21
###############################################################################
def fetch_matches_content(search_results, max_workers=3) -> list:
    """
    Fetch section text for all Pinecone matches (38 CFR) from remote JSON files on Azure Blob Storage.
    Returns a list of dicts with 'section_number' and 'matching_text'.
    """
    matches = search_results.get("matches", [])

    def get_section_text(section_number: str, part_number: str) -> str:
        # 1) Decide which URL to request
        if part_number == "3":
            url = PART_3_URL
        elif part_number == "4":
            url = PART_4_URL
        else:
            return None

        # 2) Fetch and parse the JSON data from Azure
        try:
            resp = requests.get(url)
            resp.raise_for_status()  # will raise an exception if 4xx/5xx
            data = resp.json()
        except Exception as e:
            print(f"[ERROR] Unable to fetch or parse JSON from {url}: {e}")
            return None

        # 3) Search for the matching section_number
        for item in data:
            meta = item.get("metadata", {})
            if meta.get("section_number") == section_number:
                return item.get("text")
        return None

    matching_texts = []
    for match in matches:
        metadata = match.get("metadata", {})
        section_num = metadata.get("section_number")
        part_number = metadata.get("part_number")
        if not section_num or not part_number:
            continue

        # fetch the matching text from Azure
        section_text = get_section_text(section_num, part_number)
        matching_texts.append({
            "section_number": section_num,
            "matching_text": section_text
        })

    return matching_texts


def fetch_matches_content_m21(search_results, max_workers=3) -> list:
    """
    Fetch article text for all Pinecone matches (M21) from remote JSON files in Azure Blob Storage.
    Returns a list of dicts with 'article_number' and 'matching_text'.
    """
    matches = search_results.get("matches", [])

    def get_article_text(article_number: str, manual: str) -> str:
        # Determine which URL to download based on manual
        if manual == "M21-1":
            url = M21_1_URL
        elif manual == "M21-5":
            url = M21_5_URL
        else:
            return None

        # Fetch and parse the JSON data from Azure
        try:
            resp = requests.get(url)
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            print(f"[ERROR] Unable to fetch or parse JSON from {url}: {e}")
            return None

        # Search for the matching article_number
        for item in data:
            meta = item.get("metadata", {})
            if meta.get("article_number") == article_number:
                return item.get("text")
        return None

    matching_texts = []
    for match in matches:
        metadata = match.get("metadata", {})
        article_num = metadata.get("article_number")
        manual_val = metadata.get("manual")
        if not article_num or not manual_val:
            continue

        article_text = get_article_text(article_num, manual_val)
        matching_texts.append({
            "article_number": article_num,
            "matching_text": article_text
        })

    return matching_texts


###############################################################################
# 5. PINECONE SEARCH FUNCTIONS (CFR and M21) - using the SMALL model
###############################################################################
def search_cfr_documents(user_id, query: str, top_k: int = 3) -> str:
    cleaned_query = clean_up_query_with_llm(user_id, query)
    query_emb = get_embedding_small(user_id, cleaned_query)

    results = index_cfr.query(
        vector=query_emb,
        top_k=top_k,
        include_metadata=True
    )

    matching_sections = fetch_matches_content(results, max_workers=3)
    if not matching_sections:
        return "No sections found (CFR)."

    references_str = ""
    for item in matching_sections:
        sec_num = item["section_number"]
        text_snippet = item["matching_text"] or "N/A"
        references_str += f"\n---\nSection {sec_num}:\n{text_snippet}\n"
    print(references_str)

    return references_str.strip()


def search_m21_documents(user_id, query: str, top_k: int = 3) -> str:
    cleaned_query = clean_up_query_with_llm(user_id, query)
    query_emb = get_embedding_small(user_id, cleaned_query)

    results = index_m21.query(
        vector=query_emb,
        top_k=top_k,
        include_metadata=True
    )
    matching_articles = fetch_matches_content_m21(results, max_workers=3)
    if not matching_articles:
        return "No articles found (M21)."

    references_str = ""
    for item in matching_articles:
        article_num = item["article_number"]
        text_snippet = item["matching_text"] or "N/A"
        references_str += f"\n---\nArticle {article_num}:\n{text_snippet}\n"
    print(references_str)
    return references_str.strip()


###############################################################################
# 6. NEW CONDITION-SEARCH TOOLS
###############################################################################
def list_user_conditions(user_id: int) -> str:
    session = g.session

    user_conditions = (
        session.query(Conditions)
        .filter(Conditions.user_id == user_id)
        .all()
    )

    if not user_conditions:
        return f"No conditions found for user_id={user_id}."

    results_list = []
    for cond in user_conditions:
        data = {
            "condition_id": cond.condition_id,
            "service_connected": cond.service_connected,
            "user_id": cond.user_id,
            "file_id": cond.file_id,
            "page_number": cond.page_number,
            "condition_name": cond.condition_name,
            "date_of_visit": cond.date_of_visit.isoformat() if cond.date_of_visit else None,
            "medical_professionals": cond.medical_professionals,
            "medications_list": cond.medications_list,
            "treatments": cond.treatments,
            "findings": cond.findings,
            "comments": cond.comments,
            "is_ratable": cond.is_ratable,
            "in_service": cond.in_service,
        }
        results_list.append(data)

    return json.dumps(results_list, indent=2, default=str)


def semantic_search_user_conditions(user_id: int, query_text: str, limit: int = 10) -> str:
    session = g.session

    query_vec = get_embedding_large(user_id, query_text)

    results = (
        session.query(Conditions)
        .join(ConditionEmbedding, Conditions.condition_id == ConditionEmbedding.condition_id)
        .filter(Conditions.user_id == user_id)
        .order_by(ConditionEmbedding.embedding.op("<->")(query_vec))
        .limit(limit)
        .all()
    )

    if not results:
        return f"No semantically similar conditions found for user_id={user_id}."

    results_list = []
    for cond in results:
        data = {
            "condition_id": cond.condition_id,
            "condition_name": cond.condition_name,
            "service_connected": cond.service_connected,
            "in_service": cond.in_service,
            "date_of_visit": cond.date_of_visit.isoformat() if cond.date_of_visit else None,
            "medications_list": cond.medications_list,
            "treatments": cond.treatments,
            "findings": cond.findings,
            "comments": cond.comments,
        }
        results_list.append(data)

    return json.dumps(results_list, indent=2, default=str)


###############################################################################
# 7. MULTI-TURN HELPER WITH TOOL HANDLING
###############################################################################
def continue_conversation(
    user_id: int,
    user_input: str,
    thread_id: str = None,
    system_msg: str = None
) -> dict:
    """
    Continues or starts a new conversation (thread) with the user.
    :param user_id: The integer user_id from your 'Users' table.
    :param user_input: The user's message (string).
    :param thread_id: Optional existing thread_id for multi-turn continuity.
    :param system_msg: Optional message inserted as a system message if creating a new thread.
    :return: Dict containing "assistant_message" and "thread_id".
    """
    try:
        # 1) Create or reuse the conversation thread
        if not thread_id:
            thread = client.beta.threads.create()
            thread_id = thread.id
            print(f"[LOG] Created NEW thread: {thread_id}")
            
            # If a system message is provided, add it first
            if system_msg:
                client.beta.threads.messages.create(
                    thread_id=thread.id,
                    role="user",
                    content=system_msg
                )
        else:
            print(f"[LOG] Reusing EXISTING thread: {thread_id}")
            # Create a stub so the code can attach messages to an existing thread
            thread_stub = type("ThreadStub", (), {})()
            thread_stub.id = thread_id
            thread = thread_stub

        # 2) Add the user's message
        user_message = client.beta.threads.messages.create(
            thread_id=thread.id,
            role="user",
            content=user_input
        )
        print(f"[LOG] Added user message. ID: {user_message.id}")

        # 3) Create a new run
        run = client.beta.threads.runs.create(
            thread_id=thread.id,
            assistant_id=assistant_id
        )
        print(f"[LOG] Created run. ID: {run.id}, status={run.status}")

        # 4) Poll until run completes or needs action
        while True:
            updated_run = client.beta.threads.runs.retrieve(
                thread_id=thread.id,
                run_id=run.id
            )
            if updated_run.status in ["completed", "requires_action", "failed", "incomplete"]:
                break
            time.sleep(1)

        print(f"[LOG] Polled run => status: {updated_run.status}")

        # 5) Handle tool calls if run requires action
        while updated_run.status == "requires_action":
            action_data = updated_run.required_action
            if action_data and action_data.submit_tool_outputs:
                tool_calls = action_data.submit_tool_outputs.tool_calls
                tool_outputs = []

                for call in tool_calls:
                    function_name = call.function.name
                    function_args = call.function.arguments
                    print(f"[LOG] Tool call requested: {function_name} with args={function_args}")

                    if function_name == "search_cfr_documents":
                        from .chatbot_helper import search_cfr_documents
                        args = json.loads(function_args)
                        query_text = args["query"]
                        top_k_arg = args.get("top_k", 3)
                        result_str = search_cfr_documents(user_id, query_text, top_k=top_k_arg)
                        tool_outputs.append({
                            "tool_call_id": call.id,
                            "output": result_str
                        })

                    elif function_name == "search_m21_documents":
                        from .chatbot_helper import search_m21_documents
                        args = json.loads(function_args)
                        query_text = args["query"]
                        top_k_arg = args.get("top_k", 3)
                        result_str = search_m21_documents(user_id, query_text, top_k=top_k_arg)
                        tool_outputs.append({
                            "tool_call_id": call.id,
                            "output": result_str
                        })

                    elif function_name == "list_user_conditions":
                        from .chatbot_helper import list_user_conditions
                        #args = json.loads(function_args)
                        #user_id_arg = args["user_id"]
                        result_str = list_user_conditions(user_id)
                        tool_outputs.append({
                            "tool_call_id": call.id,
                            "output": result_str
                        })

                    elif function_name == "semantic_search_user_conditions":
                        from .chatbot_helper import semantic_search_user_conditions
                        args = json.loads(function_args)
                        #user_id_arg = args["user_id"]
                        query_txt = args["query_text"]
                        limit_arg = args.get("limit", 10)
                        result_str = semantic_search_user_conditions(
                            user_id,
                            query_txt,
                            limit_arg
                        )
                        tool_outputs.append({
                            "tool_call_id": call.id,
                            "output": result_str
                        })

                    else:
                        # Unrecognized or unimplemented tool
                        tool_outputs.append({
                            "tool_call_id": call.id,
                            "output": f"No implementation for tool '{function_name}'."
                        })

                # Submit the tool outputs
                client.beta.threads.runs.submit_tool_outputs(
                    thread_id=thread.id,
                    run_id=updated_run.id,
                    tool_outputs=tool_outputs
                )
                print("[LOG] Submitted tool outputs. Polling again...")

                # Poll again
                while True:
                    updated_run = client.beta.threads.runs.retrieve(
                        thread_id=thread.id,
                        run_id=run.id
                    )
                    if updated_run.status in ["completed", "failed", "incomplete", "requires_action"]:
                        break
                    time.sleep(1)

            print(f"[LOG] After tool submission => run status: {updated_run.status}")

        # 6) Evaluate final status
        if updated_run.status == "completed":
                        # *** NEW: Beta Threads usage logging ***
            # We'll do it here, before returning the final message.

            # 6a) Retrieve the usage from updated_run
            usage_obj = getattr(updated_run, "usage", None)
            if usage_obj:
                # We have usage: prompt_tokens, completion_tokens, total_tokens
                prompt_tokens = usage_obj.prompt_tokens
                completion_tokens = usage_obj.completion_tokens
                total_tokens = usage_obj.total_tokens

                # Now, let's log it in openai_usage_logs
                from models.sql_models import Users, OpenAIUsageLog
                from datetime import datetime
                import decimal

                db_session = g.session
                user = db_session.query(Users).filter_by(user_id=user_id).first()
                if user:
                    # Suppose we do a cost-based approach for "gpt-4o"
                    # e.g. $0.06 per 1k input => 0.00006 per token, etc.
                    # Adjust the numbers as needed
                    cost_per_prompt_token = decimal.Decimal("0.0000025")  # $2.50 per 1M
                    cost_per_completion_token = decimal.Decimal("0.00001")# $10 per 1M

                    # Calculate cost
                    prompt_cost = prompt_tokens * cost_per_prompt_token
                    completion_cost = completion_tokens * cost_per_completion_token
                    total_cost = prompt_cost + completion_cost

                    # Insert a usage log row
                    usage_log = OpenAIUsageLog(
                        user_id=user_id,
                        model=updated_run.model or "gpt-4o",  # e.g. "gpt-4o"
                        prompt_tokens=prompt_tokens,
                        completion_tokens=completion_tokens,
                        total_tokens=total_tokens,
                        cost=total_cost,
                        created_at=datetime.utcnow()
                    )
                    db_session.add(usage_log)

                    # Update user’s credits or balance
                    # If you do token-based:
                    # user.credits_remaining -= total_tokens
                    user.credits_remaining -= total_tokens

                    db_session.commit()

            msgs = client.beta.threads.messages.list(thread_id=thread.id)
            assistant_msgs = [m for m in msgs.data if m.role == "assistant"]
            if assistant_msgs:
                final_text = assistant_msgs[0].content[0].text.value
                final_text = str(final_text)
                print("[LOG] Final assistant message found.")
                return {
                    "assistant_message": final_text,
                    "thread_id": thread_id
                }
            else:
                return {
                    "assistant_message": "No final assistant message found.",
                    "thread_id": thread_id
                }

        elif updated_run.status == "failed":
            print("[LOG] Run ended with status=failed. Full updated_run:")
            print(updated_run)
            error_detail = getattr(updated_run, "error", None)
            if error_detail:
                print("[LOG] Detailed error info from run.error:", error_detail)
            return {
                "assistant_message": "Run ended with status: failed. The model encountered an error.",
                "thread_id": thread_id
            }

        elif updated_run.status == "incomplete":
            return {
                "assistant_message": "Run ended with status: incomplete. Possibly waiting for more info.",
                "thread_id": thread_id
            }
        else:
            return {
                "assistant_message": f"Run ended with status: {updated_run.status}, no final message produced.",
                "thread_id": thread_id
            }

    except Exception as e:
        print("[ERROR] Exception in continue_conversation():")
        traceback.print_exc()
        return {
            "assistant_message": f"An error occurred: {str(e)}",
            "thread_id": thread_id
        }


def list_nexus_conditions(user_id: int) -> str:
    """
    Returns all nexus tags for a given user (that haven't been revoked).
    Each record includes the nexus_tags_id, tag info, discovered_at, etc.
    """
    session = g.session

    nexus_list = (
        session.query(NexusTags)
        .join(Tag, NexusTags.tag_id == Tag.tag_id)  # So we can also get disability_name, etc.
        .filter(NexusTags.user_id == user_id)
        .filter(NexusTags.revoked_at.is_(None))     # Only those not revoked
        .all()
    )

    if not nexus_list:
        return f"No nexus tags found for user_id={user_id}."

    results_list = []
    for nx in nexus_list:
        data = {
            "nexus_tags_id": nx.nexus_tags_id,
            "discovered_at": nx.discovered_at.isoformat() if nx.discovered_at else None,
            "revoked_at": nx.revoked_at.isoformat() if nx.revoked_at else None,
            "tag_id": nx.tag_id,
            "disability_name": nx.tag.disability_name,  # from Tag
            "description": nx.tag.description,
        }
        results_list.append(data)

    return json.dumps(results_list, indent=2, default=str)
